-- =============================================================================
-- Migration: 20260812_002_p4_utility_sub_meters
-- Description: P4 — Utility Sub-Meters (lifecycle schema)
-- Scope: 4 tables + atomic RPC + 4 read RPCs
-- Constitutional: P-ARCH-1 (NULL = Unknown), P-ARCH-4 (no delete),
--                 P-ARCH-5 (lifecycle isolation), P0 Architecture (LOCKED)
-- =============================================================================
-- IDEMPOTENCY:
-- CREATE TABLE uses IF NOT EXISTS. GRANTs are idempotent by PostgreSQL spec.
-- CREATE OR REPLACE for functions. Re-running is safe.
-- =============================================================================
-- SAFETY:
-- No DROP, DELETE, TRUNCATE, or UPDATE on any existing data.
-- No modification of existing tables, columns, constraints, or indexes.
-- public.transactions is not touched.
-- =============================================================================
-- BUSINESS MODEL (Three-Event Separation):
-- Provider Expense    = Provider → JJ/Owner     (public.transactions)
-- Tenant Utility Charge = JJ → Tenant           (lifecycle.tenant_utility_obligations — THIS MIGRATION)
-- Tenant Payment      = Tenant → JJ             (public.transactions)
-- These are THREE SEPARATE authorities. Never collapsed into one record.
-- =============================================================================
-- ROLLBACK:
-- DROP FUNCTION IF EXISTS lifecycle.record_meter_reading(UUID,DATE,NUMERIC,TEXT,TEXT);
-- DROP FUNCTION IF EXISTS lifecycle.get_property_utility_meters(UUID);
-- DROP FUNCTION IF EXISTS lifecycle.get_meter_readings(UUID,INTEGER);
-- DROP FUNCTION IF EXISTS lifecycle.get_tenant_utility_obligations(UUID);
-- DROP FUNCTION IF EXISTS lifecycle.get_applicable_utility_rates(TEXT,UUID,DATE);
-- DROP TABLE IF EXISTS lifecycle.tenant_utility_obligations;
-- DROP TABLE IF EXISTS lifecycle.meter_readings;
-- DROP TABLE IF EXISTS lifecycle.utility_rates;
-- DROP TABLE IF EXISTS lifecycle.utility_meters;
-- =============================================================================


-- ═══════════════════════════════════════════════════════════════════════════════
-- TABLE 1: lifecycle.utility_meters
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS lifecycle.utility_meters (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id              UUID NOT NULL
                             REFERENCES public.property_definitions(property_id),
  utility_type             TEXT NOT NULL
                             CHECK (utility_type IN (
                               'electricity', 'water', 'gas', 'internet', 'other'
                             )),
  meter_identifier         TEXT,                    -- NULL = unknown (P-ARCH-1)
  unit_of_measure          TEXT NOT NULL DEFAULT 'kWh',
  status                   TEXT NOT NULL DEFAULT 'active'
                             CHECK (status IN ('active', 'inactive')),
  -- V1.2 Correction 7: configurable reading schedule (not hardcoded 30 days)
  reading_interval_months  INTEGER NOT NULL DEFAULT 1
                             CHECK (reading_interval_months BETWEEN 1 AND 12),
  last_reading_date        DATE,                    -- NULL = no reading taken yet (P-ARCH-1)
  next_reading_due         DATE,                    -- computed: last_reading_date + interval; NULL when last is NULL
  notes                    TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_utility_meters_property
  ON lifecycle.utility_meters (property_id);
CREATE INDEX IF NOT EXISTS idx_utility_meters_status
  ON lifecycle.utility_meters (status);

-- RLS deny-all
ALTER TABLE lifecycle.utility_meters ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'lifecycle'
      AND tablename = 'utility_meters'
      AND policyname = 'deny_all_utility_meters'
  ) THEN
    CREATE POLICY deny_all_utility_meters
      ON lifecycle.utility_meters
      AS RESTRICTIVE
      FOR ALL
      TO public
      USING (false);
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE ON TABLE lifecycle.utility_meters TO service_role;


-- ═══════════════════════════════════════════════════════════════════════════════
-- TABLE 2: lifecycle.utility_rates
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS lifecycle.utility_rates (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  utility_type      TEXT NOT NULL
                      CHECK (utility_type IN (
                        'electricity', 'water', 'gas', 'internet', 'other'
                      )),
  rate_per_unit_eur NUMERIC NOT NULL
                      CHECK (rate_per_unit_eur > 0),
  effective_from    DATE NOT NULL,
  effective_to      DATE,                    -- NULL = current rate
  source            TEXT,                    -- 'provider_tariff', 'manual_entry', 'contract'
  scope             TEXT NOT NULL DEFAULT 'central'
                      CHECK (scope IN ('central', 'property_specific')),
  property_id       UUID,                    -- NULL for central rates
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Central rates must have NULL property_id; property_specific must have non-NULL
  CONSTRAINT utility_rates_scope_property_check
    CHECK (
      (scope = 'central' AND property_id IS NULL)
      OR (scope = 'property_specific' AND property_id IS NOT NULL)
    )
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_utility_rates_type_scope
  ON lifecycle.utility_rates (utility_type, scope, effective_from);
CREATE INDEX IF NOT EXISTS idx_utility_rates_property
  ON lifecycle.utility_rates (property_id)
  WHERE property_id IS NOT NULL;

-- RLS deny-all
ALTER TABLE lifecycle.utility_rates ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'lifecycle'
      AND tablename = 'utility_rates'
      AND policyname = 'deny_all_utility_rates'
  ) THEN
    CREATE POLICY deny_all_utility_rates
      ON lifecycle.utility_rates
      AS RESTRICTIVE
      FOR ALL
      TO public
      USING (false);
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE ON TABLE lifecycle.utility_rates TO service_role;


-- ═══════════════════════════════════════════════════════════════════════════════
-- TABLE 3: lifecycle.meter_readings
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS lifecycle.meter_readings (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meter_id          UUID NOT NULL
                      REFERENCES lifecycle.utility_meters(id),
  reading_date      DATE NOT NULL,
  reading_value     NUMERIC NOT NULL,
  previous_value    NUMERIC,                 -- NULL on first reading (P-ARCH-1)
  consumption       NUMERIC,                 -- computed on insert; NULL when previous_value is NULL
  photo_evidence    TEXT,
  recorded_by       TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_meter_readings_meter
  ON lifecycle.meter_readings (meter_id, reading_date DESC);

-- RLS deny-all
ALTER TABLE lifecycle.meter_readings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'lifecycle'
      AND tablename = 'meter_readings'
      AND policyname = 'deny_all_meter_readings'
  ) THEN
    CREATE POLICY deny_all_meter_readings
      ON lifecycle.meter_readings
      AS RESTRICTIVE
      FOR ALL
      TO public
      USING (false);
  END IF;
END $$;

GRANT SELECT, INSERT ON TABLE lifecycle.meter_readings TO service_role;


-- ═══════════════════════════════════════════════════════════════════════════════
-- TABLE 4: lifecycle.tenant_utility_obligations
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS lifecycle.tenant_utility_obligations (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rental_contract_id      UUID NOT NULL
                            REFERENCES lifecycle.rental_contracts(id),
  property_id             UUID NOT NULL
                            REFERENCES public.property_definitions(property_id),
  meter_id                UUID NOT NULL
                            REFERENCES lifecycle.utility_meters(id),
  reading_id              UUID NOT NULL
                            REFERENCES lifecycle.meter_readings(id),
  rate_id                 UUID NOT NULL
                            REFERENCES lifecycle.utility_rates(id),

  utility_type            TEXT NOT NULL,
  period_start            DATE NOT NULL,
  period_end              DATE NOT NULL,
  consumption             NUMERIC NOT NULL,
  rate_per_unit_eur       NUMERIC NOT NULL,
  obligation_amount_eur   NUMERIC NOT NULL,         -- consumption × rate
  tenant_name             TEXT NOT NULL,

  settled_amount_eur      NUMERIC NOT NULL DEFAULT 0,
  status                  TEXT NOT NULL DEFAULT 'pending'
                            CHECK (status IN (
                              'pending', 'billed', 'partial',
                              'settled', 'disputed', 'reversed'
                            )),
  settlement_evidence     JSONB,
  idempotency_key         TEXT NOT NULL UNIQUE,      -- meter_id || ':' || reading_date
  notes                   TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tenant_utility_obligations_contract
  ON lifecycle.tenant_utility_obligations (rental_contract_id);
CREATE INDEX IF NOT EXISTS idx_tenant_utility_obligations_property
  ON lifecycle.tenant_utility_obligations (property_id);
CREATE INDEX IF NOT EXISTS idx_tenant_utility_obligations_meter
  ON lifecycle.tenant_utility_obligations (meter_id);
CREATE INDEX IF NOT EXISTS idx_tenant_utility_obligations_status
  ON lifecycle.tenant_utility_obligations (status);

-- RLS deny-all
ALTER TABLE lifecycle.tenant_utility_obligations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'lifecycle'
      AND tablename = 'tenant_utility_obligations'
      AND policyname = 'deny_all_tenant_utility_obligations'
  ) THEN
    CREATE POLICY deny_all_tenant_utility_obligations
      ON lifecycle.tenant_utility_obligations
      AS RESTRICTIVE
      FOR ALL
      TO public
      USING (false);
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE ON TABLE lifecycle.tenant_utility_obligations TO service_role;


-- ═══════════════════════════════════════════════════════════════════════════════
-- RPC 1: lifecycle.record_meter_reading (ATOMIC — V1.3)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Single-transaction flow:
-- 1. Lock meter → 2. Get previous reading → 3. Compute consumption
-- 4. Insert reading → 5. Resolve rate → 6. Resolve tenant → 7. Create obligation (if applicable)
-- 8. Update schedule → 9. Return structured result
--
-- Key behaviors:
-- - Rate missing: reading recorded, schedule advances, no obligation. needs_review=true, reason='rate_missing'
-- - First reading: previous=NULL, consumption=NULL, no obligation. needs_review=true, reason='first_reading_no_consumption'
-- - Schedule ALWAYS advances (steps 4+8 run regardless of rate/consumption)
-- - Decreasing reading: REJECTED (meter value cannot go down)
-- - Idempotency: idempotency_key = meter_id || ':' || reading_date (UNIQUE on obligations)
-- - Rollback: any failure → entire transaction rolls back (reading + obligation + schedule)

CREATE OR REPLACE FUNCTION lifecycle.record_meter_reading(
  p_meter_id        UUID,
  p_reading_date    DATE,
  p_reading_value   NUMERIC,
  p_recorded_by     TEXT    DEFAULT NULL,
  p_photo_evidence  TEXT    DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'lifecycle', 'public'
AS $$
DECLARE
  v_meter              RECORD;
  v_prev_reading       RECORD;
  v_consumption        NUMERIC;
  v_reading_id         UUID;
  v_rate               RECORD;
  v_contract           RECORD;
  v_obligation_id      UUID;
  v_obligation_created BOOLEAN := FALSE;
  v_needs_review       BOOLEAN := FALSE;
  v_review_reason      TEXT;
  v_period_start       DATE;
  v_next_due           DATE;
  v_idempotency_key    TEXT;
BEGIN
  -- ── Step 1: Lock meter row ────────────────────────────────────────────────
  SELECT id, property_id, utility_type, reading_interval_months,
         last_reading_date, status
  INTO v_meter
  FROM lifecycle.utility_meters
  WHERE id = p_meter_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Meter not found: %', p_meter_id;
  END IF;

  IF v_meter.status != 'active' THEN
    RAISE EXCEPTION 'Meter is inactive: %', p_meter_id;
  END IF;

  -- ── Step 2: Get most recent previous reading ─────────────────────────────
  SELECT reading_date, reading_value
  INTO v_prev_reading
  FROM lifecycle.meter_readings
  WHERE meter_id = p_meter_id
  ORDER BY reading_date DESC, created_at DESC
  LIMIT 1;

  -- ── Step 3: Compute consumption ───────────────────────────────────────────
  IF v_prev_reading IS NOT NULL THEN
    -- Validate: reading must not decrease (no meter rollback without explicit reset)
    IF p_reading_value < v_prev_reading.reading_value THEN
      RAISE EXCEPTION 'Reading value % is less than previous value %. Meter readings cannot decrease.',
        p_reading_value, v_prev_reading.reading_value;
    END IF;

    v_consumption := p_reading_value - v_prev_reading.reading_value;
  ELSE
    -- First reading: consumption unknown (P-ARCH-1)
    v_consumption := NULL;
  END IF;

  -- ── Step 4: Insert reading ────────────────────────────────────────────────
  INSERT INTO lifecycle.meter_readings (
    meter_id, reading_date, reading_value,
    previous_value, consumption,
    photo_evidence, recorded_by
  )
  VALUES (
    p_meter_id, p_reading_date, p_reading_value,
    CASE WHEN v_prev_reading IS NOT NULL THEN v_prev_reading.reading_value ELSE NULL END,
    v_consumption,
    p_photo_evidence, p_recorded_by
  )
  RETURNING id INTO v_reading_id;

  -- ── Step 5: Resolve effective utility rate ────────────────────────────────
  -- Property-specific rate wins over central rate (ORDER BY scope DESC)
  SELECT id, rate_per_unit_eur, utility_type, scope
  INTO v_rate
  FROM lifecycle.utility_rates
  WHERE utility_type = v_meter.utility_type
    AND (
      scope = 'central'
      OR (scope = 'property_specific' AND property_id = v_meter.property_id)
    )
    AND effective_from <= p_reading_date
    AND (effective_to IS NULL OR effective_to >= p_reading_date)
  ORDER BY
    (scope = 'property_specific') DESC,
    effective_from DESC
  LIMIT 1;

  -- ── Step 6: Determine if obligation can be created ────────────────────────
  IF v_consumption IS NULL THEN
    -- First reading: no consumption to bill
    v_needs_review := TRUE;
    v_review_reason := 'first_reading_no_consumption';

  ELSIF v_rate IS NULL THEN
    -- No applicable rate found
    v_needs_review := TRUE;
    v_review_reason := 'rate_missing';

  ELSE
    -- Both consumption and rate available — resolve tenant and create obligation

    -- Resolve active rental contract for this property
    SELECT id, tenant_name
    INTO v_contract
    FROM lifecycle.rental_contracts
    WHERE property_id = v_meter.property_id
      AND status = 'active'
    ORDER BY start_date DESC
    LIMIT 1;

    IF v_contract IS NULL THEN
      -- No active rental contract — cannot determine tenant
      v_needs_review := TRUE;
      v_review_reason := 'no_active_rental_contract';
    ELSE
      -- Determine period_start
      IF v_prev_reading IS NOT NULL THEN
        v_period_start := v_prev_reading.reading_date;
      ELSE
        -- Fallback: use reading_date as both start and end (single-point reading)
        v_period_start := p_reading_date;
      END IF;

      v_idempotency_key := p_meter_id::TEXT || ':' || p_reading_date::TEXT;

      INSERT INTO lifecycle.tenant_utility_obligations (
        rental_contract_id, property_id, meter_id, reading_id, rate_id,
        utility_type, period_start, period_end, consumption,
        rate_per_unit_eur, obligation_amount_eur, tenant_name,
        idempotency_key
      )
      VALUES (
        v_contract.id, v_meter.property_id, p_meter_id, v_reading_id, v_rate.id,
        v_meter.utility_type, v_period_start, p_reading_date, v_consumption,
        v_rate.rate_per_unit_eur, v_consumption * v_rate.rate_per_unit_eur,
        v_contract.tenant_name,
        v_idempotency_key
      )
      RETURNING id INTO v_obligation_id;

      v_obligation_created := TRUE;
    END IF;
  END IF;

  -- ── Step 7: Update meter schedule (ALWAYS — even on missing rate/first reading) ─
  v_next_due := p_reading_date + (v_meter.reading_interval_months || ' months')::INTERVAL;

  UPDATE lifecycle.utility_meters
  SET last_reading_date = p_reading_date,
      next_reading_due  = v_next_due,
      updated_at        = now()
  WHERE id = p_meter_id;

  -- ── Step 8: Return result ─────────────────────────────────────────────────
  RETURN jsonb_build_object(
    'reading_id',          v_reading_id,
    'consumption',         v_consumption,
    'obligation_created',  v_obligation_created,
    'obligation_id',       v_obligation_id,
    'needs_review',        v_needs_review,
    'reason',              v_review_reason,
    'next_reading_due',    v_next_due
  );
END;
$$;

-- Only service_role can execute
REVOKE ALL ON FUNCTION lifecycle.record_meter_reading(UUID,DATE,NUMERIC,TEXT,TEXT)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION lifecycle.record_meter_reading(UUID,DATE,NUMERIC,TEXT,TEXT)
  TO service_role;


-- ═══════════════════════════════════════════════════════════════════════════════
-- RPC 2: lifecycle.get_property_utility_meters
-- ═══════════════════════════════════════════════════════════════════════════════
-- Returns all meters for a property, ordered by utility_type then status.

CREATE OR REPLACE FUNCTION lifecycle.get_property_utility_meters(
  p_property_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'lifecycle', 'public'
AS $$
DECLARE
  v_meters JSONB;
BEGIN
  IF p_property_id IS NULL THEN
    RAISE EXCEPTION 'property_id is required';
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id',                       m.id,
      'property_id',              m.property_id,
      'utility_type',             m.utility_type,
      'meter_identifier',         m.meter_identifier,
      'unit_of_measure',          m.unit_of_measure,
      'status',                   m.status,
      'reading_interval_months',  m.reading_interval_months,
      'last_reading_date',        m.last_reading_date,
      'next_reading_due',         m.next_reading_due,
      'notes',                    m.notes,
      'created_at',               m.created_at,
      'updated_at',               m.updated_at
    )
    ORDER BY m.utility_type, m.status, m.created_at
  ), '[]'::jsonb)
  INTO v_meters
  FROM lifecycle.utility_meters m
  WHERE m.property_id = p_property_id;

  RETURN v_meters;
END;
$$;

REVOKE ALL ON FUNCTION lifecycle.get_property_utility_meters(UUID)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION lifecycle.get_property_utility_meters(UUID)
  TO service_role;


-- ═══════════════════════════════════════════════════════════════════════════════
-- RPC 3: lifecycle.get_meter_readings
-- ═══════════════════════════════════════════════════════════════════════════════
-- Returns readings for a meter, most recent first. Optional limit (default 50).

CREATE OR REPLACE FUNCTION lifecycle.get_meter_readings(
  p_meter_id  UUID,
  p_limit     INTEGER DEFAULT 50
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'lifecycle', 'public'
AS $$
DECLARE
  v_readings JSONB;
BEGIN
  IF p_meter_id IS NULL THEN
    RAISE EXCEPTION 'meter_id is required';
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id',              r.id,
      'meter_id',        r.meter_id,
      'reading_date',    r.reading_date,
      'reading_value',   r.reading_value,
      'previous_value',  r.previous_value,
      'consumption',     r.consumption,
      'photo_evidence',  r.photo_evidence,
      'recorded_by',     r.recorded_by,
      'created_at',      r.created_at
    )
    ORDER BY r.reading_date DESC, r.created_at DESC
  ), '[]'::jsonb)
  INTO v_readings
  FROM (
    SELECT *
    FROM lifecycle.meter_readings
    WHERE meter_id = p_meter_id
    ORDER BY reading_date DESC, created_at DESC
    LIMIT p_limit
  ) r;

  RETURN v_readings;
END;
$$;

REVOKE ALL ON FUNCTION lifecycle.get_meter_readings(UUID,INTEGER)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION lifecycle.get_meter_readings(UUID,INTEGER)
  TO service_role;


-- ═══════════════════════════════════════════════════════════════════════════════
-- RPC 4: lifecycle.get_tenant_utility_obligations
-- ═══════════════════════════════════════════════════════════════════════════════
-- Returns all utility obligations for a property, most recent first.

CREATE OR REPLACE FUNCTION lifecycle.get_tenant_utility_obligations(
  p_property_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'lifecycle', 'public'
AS $$
DECLARE
  v_obligations JSONB;
BEGIN
  IF p_property_id IS NULL THEN
    RAISE EXCEPTION 'property_id is required';
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id',                    o.id,
      'rental_contract_id',    o.rental_contract_id,
      'property_id',           o.property_id,
      'meter_id',              o.meter_id,
      'reading_id',            o.reading_id,
      'rate_id',               o.rate_id,
      'utility_type',          o.utility_type,
      'period_start',          o.period_start,
      'period_end',            o.period_end,
      'consumption',           o.consumption,
      'rate_per_unit_eur',     o.rate_per_unit_eur,
      'obligation_amount_eur', o.obligation_amount_eur,
      'tenant_name',           o.tenant_name,
      'settled_amount_eur',    o.settled_amount_eur,
      'status',                o.status,
      'settlement_evidence',   o.settlement_evidence,
      'idempotency_key',       o.idempotency_key,
      'notes',                 o.notes,
      'created_at',            o.created_at,
      'updated_at',            o.updated_at
    )
    ORDER BY o.period_end DESC, o.created_at DESC
  ), '[]'::jsonb)
  INTO v_obligations
  FROM lifecycle.tenant_utility_obligations o
  WHERE o.property_id = p_property_id;

  RETURN v_obligations;
END;
$$;

REVOKE ALL ON FUNCTION lifecycle.get_tenant_utility_obligations(UUID)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION lifecycle.get_tenant_utility_obligations(UUID)
  TO service_role;


-- ═══════════════════════════════════════════════════════════════════════════════
-- RPC 5: lifecycle.get_applicable_utility_rates
-- ═══════════════════════════════════════════════════════════════════════════════
-- Returns all rates for a utility type, optionally filtered by property.
-- Shows both central and property-specific rates.

CREATE OR REPLACE FUNCTION lifecycle.get_applicable_utility_rates(
  p_utility_type  TEXT,
  p_property_id   UUID    DEFAULT NULL,
  p_as_of_date    DATE    DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'lifecycle', 'public'
AS $$
DECLARE
  v_rates JSONB;
BEGIN
  IF p_utility_type IS NULL THEN
    RAISE EXCEPTION 'utility_type is required';
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id',                r.id,
      'utility_type',      r.utility_type,
      'rate_per_unit_eur', r.rate_per_unit_eur,
      'effective_from',    r.effective_from,
      'effective_to',      r.effective_to,
      'source',            r.source,
      'scope',             r.scope,
      'property_id',       r.property_id,
      'notes',             r.notes,
      'created_at',        r.created_at
    )
    ORDER BY (r.scope = 'property_specific') DESC, r.effective_from DESC
  ), '[]'::jsonb)
  INTO v_rates
  FROM lifecycle.utility_rates r
  WHERE r.utility_type = p_utility_type
    AND (
      r.scope = 'central'
      OR (r.scope = 'property_specific' AND r.property_id = p_property_id)
    )
    AND r.effective_from <= p_as_of_date
    AND (r.effective_to IS NULL OR r.effective_to >= p_as_of_date);

  RETURN v_rates;
END;
$$;

REVOKE ALL ON FUNCTION lifecycle.get_applicable_utility_rates(TEXT,UUID,DATE)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION lifecycle.get_applicable_utility_rates(TEXT,UUID,DATE)
  TO service_role;
