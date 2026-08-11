-- =============================================================================
-- Migration: 20260811_003_p2_rental_contracts
-- Description: P2 — Rental Contract Foundation (lifecycle schema)
-- Scope: lifecycle.rental_contracts table + 4 SECURITY DEFINER RPCs
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
-- Legacy public.rental_contracts is NOT modified.
-- =============================================================================
-- ROLLBACK:
-- DROP FUNCTION IF EXISTS lifecycle.create_rental_contract(UUID,UUID,TEXT,UUID,DATE,DATE,NUMERIC,NUMERIC,INTEGER,TEXT,TEXT,TEXT,UUID);
-- DROP FUNCTION IF EXISTS lifecycle.update_rental_contract(UUID,TEXT,DATE,DATE,NUMERIC,NUMERIC,INTEGER,TEXT,TEXT,UUID);
-- DROP FUNCTION IF EXISTS lifecycle.get_engagement_rental_contracts(UUID);
-- DROP FUNCTION IF EXISTS lifecycle.get_property_rental_contracts(UUID);
-- DROP TABLE IF EXISTS lifecycle.rental_contracts;
-- =============================================================================
-- BUSINESS MODEL:
-- Service Engagement ≠ Rental Contract ≠ Tenant Payment
-- These are THREE SEPARATE authorities:
--   1. Service Engagement = what service JJ provides (management_ltr)
--   2. Rental Contract = who is renting, terms, period (THIS TABLE)
--   3. Tenant Payment = actual rent money received (public.transactions)
--
-- This table establishes CONTRACT/EXPECTED-PAYMENT operational truth only.
-- Existing Tenant Payment transactions remain the financial evidence authority.
-- Do NOT store payment truth in the lease record.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- TABLE: lifecycle.rental_contracts
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS lifecycle.rental_contracts (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Property link (UUID-based, per P1 standard)
  property_id             UUID NOT NULL
                            REFERENCES public.property_definitions(property_id),

  -- Optional parent service engagement (management_ltr)
  -- NULL = contract exists independently (historical or unlinked)
  service_engagement_id   UUID
                            REFERENCES lifecycle.service_engagements(id),

  -- Tenant identity: entity_id when tenant is in entity_identity, name always
  tenant_name             TEXT NOT NULL,
  tenant_entity_id        UUID
                            REFERENCES lifecycle.entity_identity(id),

  -- Contract terms
  start_date              DATE NOT NULL,
  end_date                DATE,                        -- NULL = open-ended
  monthly_rent_eur        NUMERIC NOT NULL,
  deposit_eur             NUMERIC,                     -- NULL = unknown (P-ARCH-1)
  payment_day             INTEGER NOT NULL DEFAULT 1,
  currency                TEXT NOT NULL DEFAULT 'EUR',

  -- Status lifecycle (no delete — P-ARCH-4)
  status                  TEXT NOT NULL DEFAULT 'draft'
                            CHECK (status IN (
                              'draft',
                              'active',
                              'expired',
                              'terminated'
                            )),

  notes                   TEXT,

  -- Audit
  created_by              UUID,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- payment_day must be 1–28 (avoids month-length edge cases)
  CONSTRAINT rental_contracts_payment_day_check
    CHECK (payment_day >= 1 AND payment_day <= 28),

  -- monthly_rent_eur must be non-negative
  CONSTRAINT rental_contracts_rent_check
    CHECK (monthly_rent_eur >= 0),

  -- deposit must be non-negative when present
  CONSTRAINT rental_contracts_deposit_check
    CHECK (deposit_eur IS NULL OR deposit_eur >= 0),

  -- end_date must be on or after start_date when present
  CONSTRAINT rental_contracts_date_range_check
    CHECK (end_date IS NULL OR end_date >= start_date)
);


-- Indexes
CREATE INDEX IF NOT EXISTS idx_rental_contracts_property
  ON lifecycle.rental_contracts (property_id);
CREATE INDEX IF NOT EXISTS idx_rental_contracts_engagement
  ON lifecycle.rental_contracts (service_engagement_id)
  WHERE service_engagement_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rental_contracts_tenant_entity
  ON lifecycle.rental_contracts (tenant_entity_id)
  WHERE tenant_entity_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rental_contracts_status
  ON lifecycle.rental_contracts (status);


-- RLS: deny-all (consistent with lifecycle schema pattern)
ALTER TABLE lifecycle.rental_contracts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'lifecycle'
      AND tablename = 'rental_contracts'
      AND policyname = 'deny_all_rental_contracts'
  ) THEN
    CREATE POLICY deny_all_rental_contracts
      ON lifecycle.rental_contracts
      AS RESTRICTIVE
      FOR ALL
      TO public
      USING (false);
  END IF;
END $$;


-- GRANT SELECT to service_role (required for SECURITY DEFINER RPCs)
GRANT SELECT, INSERT, UPDATE ON TABLE lifecycle.rental_contracts TO service_role;


-- ---------------------------------------------------------------------------
-- RPC 1: lifecycle.create_rental_contract
-- ---------------------------------------------------------------------------
-- Creates a new rental contract. Service-role only via SECURITY DEFINER.
-- Returns the full created row as JSON.

CREATE OR REPLACE FUNCTION lifecycle.create_rental_contract(
  p_property_id             UUID,
  p_service_engagement_id   UUID DEFAULT NULL,
  p_tenant_name             TEXT DEFAULT NULL,
  p_tenant_entity_id        UUID DEFAULT NULL,
  p_start_date              DATE DEFAULT NULL,
  p_end_date                DATE DEFAULT NULL,
  p_monthly_rent_eur        NUMERIC DEFAULT NULL,
  p_deposit_eur             NUMERIC DEFAULT NULL,
  p_payment_day             INTEGER DEFAULT 1,
  p_currency                TEXT DEFAULT 'EUR',
  p_status                  TEXT DEFAULT 'draft',
  p_notes                   TEXT DEFAULT NULL,
  p_created_by              UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'lifecycle', 'public'
AS $$
DECLARE
  v_result lifecycle.rental_contracts;
BEGIN
  -- Validate required fields
  IF p_property_id IS NULL THEN
    RAISE EXCEPTION 'property_id is required';
  END IF;
  IF p_tenant_name IS NULL OR trim(p_tenant_name) = '' THEN
    RAISE EXCEPTION 'tenant_name is required';
  END IF;
  IF p_start_date IS NULL THEN
    RAISE EXCEPTION 'start_date is required';
  END IF;
  IF p_monthly_rent_eur IS NULL THEN
    RAISE EXCEPTION 'monthly_rent_eur is required';
  END IF;

  -- Validate status
  IF p_status NOT IN ('draft', 'active', 'expired', 'terminated') THEN
    RAISE EXCEPTION 'Invalid status: %', p_status;
  END IF;

  -- If service_engagement_id provided, verify it exists and is management_ltr
  IF p_service_engagement_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM lifecycle.service_engagements
      WHERE id = p_service_engagement_id
        AND service_type = 'management_ltr'
    ) THEN
      RAISE EXCEPTION 'service_engagement_id must reference a management_ltr engagement';
    END IF;
  END IF;

  INSERT INTO lifecycle.rental_contracts (
    property_id,
    service_engagement_id,
    tenant_name,
    tenant_entity_id,
    start_date,
    end_date,
    monthly_rent_eur,
    deposit_eur,
    payment_day,
    currency,
    status,
    notes,
    created_by
  ) VALUES (
    p_property_id,
    p_service_engagement_id,
    trim(p_tenant_name),
    p_tenant_entity_id,
    p_start_date,
    p_end_date,
    p_monthly_rent_eur,
    p_deposit_eur,
    p_payment_day,
    p_currency,
    p_status,
    p_notes,
    p_created_by
  )
  RETURNING * INTO v_result;

  RETURN to_jsonb(v_result);
END;
$$;

-- Only service_role can execute
REVOKE ALL ON FUNCTION lifecycle.create_rental_contract(UUID,UUID,TEXT,UUID,DATE,DATE,NUMERIC,NUMERIC,INTEGER,TEXT,TEXT,TEXT,UUID)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION lifecycle.create_rental_contract(UUID,UUID,TEXT,UUID,DATE,DATE,NUMERIC,NUMERIC,INTEGER,TEXT,TEXT,TEXT,UUID)
  TO service_role;


-- ---------------------------------------------------------------------------
-- RPC 2: lifecycle.update_rental_contract
-- ---------------------------------------------------------------------------
-- Updates an existing rental contract. Immutable fields: property_id,
-- service_engagement_id, created_by, created_at (P-ARCH-4 spirit).
-- Returns the updated row as JSON.

CREATE OR REPLACE FUNCTION lifecycle.update_rental_contract(
  p_id                      UUID,
  p_tenant_name             TEXT DEFAULT NULL,
  p_tenant_entity_id        UUID DEFAULT NULL,
  p_start_date              DATE DEFAULT NULL,
  p_end_date                DATE DEFAULT NULL,
  p_monthly_rent_eur        NUMERIC DEFAULT NULL,
  p_deposit_eur             NUMERIC DEFAULT NULL,
  p_payment_day             INTEGER DEFAULT NULL,
  p_status                  TEXT DEFAULT NULL,
  p_notes                   TEXT DEFAULT NULL,
  p_clear_end_date          BOOLEAN DEFAULT FALSE,
  p_clear_deposit           BOOLEAN DEFAULT FALSE,
  p_clear_notes             BOOLEAN DEFAULT FALSE,
  p_clear_tenant_entity_id  BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'lifecycle', 'public'
AS $$
DECLARE
  v_result lifecycle.rental_contracts;
BEGIN
  IF p_id IS NULL THEN
    RAISE EXCEPTION 'id is required';
  END IF;

  -- Validate status if provided
  IF p_status IS NOT NULL AND p_status NOT IN ('draft', 'active', 'expired', 'terminated') THEN
    RAISE EXCEPTION 'Invalid status: %', p_status;
  END IF;

  UPDATE lifecycle.rental_contracts
  SET
    tenant_name       = COALESCE(p_tenant_name, tenant_name),
    tenant_entity_id  = CASE
                          WHEN p_clear_tenant_entity_id THEN NULL
                          WHEN p_tenant_entity_id IS NOT NULL THEN p_tenant_entity_id
                          ELSE tenant_entity_id
                        END,
    start_date        = COALESCE(p_start_date, start_date),
    end_date          = CASE
                          WHEN p_clear_end_date THEN NULL
                          WHEN p_end_date IS NOT NULL THEN p_end_date
                          ELSE end_date
                        END,
    monthly_rent_eur  = COALESCE(p_monthly_rent_eur, monthly_rent_eur),
    deposit_eur       = CASE
                          WHEN p_clear_deposit THEN NULL
                          WHEN p_deposit_eur IS NOT NULL THEN p_deposit_eur
                          ELSE deposit_eur
                        END,
    payment_day       = COALESCE(p_payment_day, payment_day),
    status            = COALESCE(p_status, status),
    notes             = CASE
                          WHEN p_clear_notes THEN NULL
                          WHEN p_notes IS NOT NULL THEN p_notes
                          ELSE notes
                        END,
    updated_at        = now()
  WHERE id = p_id
  RETURNING * INTO v_result;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rental contract not found: %', p_id;
  END IF;

  RETURN to_jsonb(v_result);
END;
$$;

REVOKE ALL ON FUNCTION lifecycle.update_rental_contract(UUID,TEXT,UUID,DATE,DATE,NUMERIC,NUMERIC,INTEGER,TEXT,TEXT,BOOLEAN,BOOLEAN,BOOLEAN,BOOLEAN)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION lifecycle.update_rental_contract(UUID,TEXT,UUID,DATE,DATE,NUMERIC,NUMERIC,INTEGER,TEXT,TEXT,BOOLEAN,BOOLEAN,BOOLEAN,BOOLEAN)
  TO service_role;


-- ---------------------------------------------------------------------------
-- RPC 3: lifecycle.get_engagement_rental_contracts
-- ---------------------------------------------------------------------------
-- Returns all rental contracts for a given service_engagement_id.

CREATE OR REPLACE FUNCTION lifecycle.get_engagement_rental_contracts(
  p_service_engagement_id UUID
)
RETURNS SETOF lifecycle.rental_contracts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'lifecycle', 'public'
AS $$
BEGIN
  RETURN QUERY
    SELECT *
    FROM lifecycle.rental_contracts
    WHERE service_engagement_id = p_service_engagement_id
    ORDER BY start_date DESC, created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION lifecycle.get_engagement_rental_contracts(UUID)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION lifecycle.get_engagement_rental_contracts(UUID)
  TO service_role;


-- ---------------------------------------------------------------------------
-- RPC 4: lifecycle.get_property_rental_contracts
-- ---------------------------------------------------------------------------
-- Returns all rental contracts for a given property_id.

CREATE OR REPLACE FUNCTION lifecycle.get_property_rental_contracts(
  p_property_id UUID
)
RETURNS SETOF lifecycle.rental_contracts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'lifecycle', 'public'
AS $$
BEGIN
  RETURN QUERY
    SELECT *
    FROM lifecycle.rental_contracts
    WHERE property_id = p_property_id
    ORDER BY start_date DESC, created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION lifecycle.get_property_rental_contracts(UUID)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION lifecycle.get_property_rental_contracts(UUID)
  TO service_role;
