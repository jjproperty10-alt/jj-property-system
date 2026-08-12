-- =============================================================================
-- Migration: 20260812_003_p5_tenant_charges
-- Description: P5 — Tenant Charges + Billing Presentation Metadata
-- Scope: 2 tables + 6 SECURITY DEFINER RPCs
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
-- public.transactions is NOT touched.
-- P1/P2/P3/P4 tables are NOT touched.
-- =============================================================================
-- BUSINESS MODEL (Three-Event Separation — Tenant Charges):
-- Owner Repair/Expense = JJ/Owner bears cost   (public.transactions — existing authority)
-- Tenant Charge        = obligation TO tenant   (lifecycle.tenant_charge_obligations — THIS MIGRATION)
-- Tenant Payment       = Tenant pays JJ         (public.transactions — existing authority)
-- These are SEPARATE authorities. A tenant charge is NOT an owner expense.
-- =============================================================================
-- PRESENTATION INVARIANT:
-- lifecycle.statement_presentation_overrides controls WHEN a charge appears on
-- a statement. It NEVER changes: financial balances, original economic dates,
-- transaction amounts, payer/payee, or category/subcategory.
-- =============================================================================
-- ROLLBACK:
-- DROP FUNCTION IF EXISTS lifecycle.resolve_statement_presentation(UUID,UUID,DATE);
-- DROP FUNCTION IF EXISTS lifecycle.set_statement_presentation_override(UUID,UUID,TEXT,DATE,DATE,TEXT,UUID);
-- DROP FUNCTION IF EXISTS lifecycle.get_outstanding_tenant_charges(UUID);
-- DROP FUNCTION IF EXISTS lifecycle.get_property_tenant_charges(UUID);
-- DROP FUNCTION IF EXISTS lifecycle.get_contract_tenant_charges(UUID);
-- DROP FUNCTION IF EXISTS lifecycle.update_tenant_charge_status(UUID,TEXT,NUMERIC,JSONB);
-- DROP FUNCTION IF EXISTS lifecycle.create_tenant_charge_obligation(UUID,UUID,TEXT,TEXT,TEXT,NUMERIC,NUMERIC,TEXT,DATE,BOOLEAN,TEXT,TEXT);
-- DROP TABLE IF EXISTS lifecycle.statement_presentation_overrides;
-- DROP TABLE IF EXISTS lifecycle.tenant_charge_obligations;
-- =============================================================================


-- ═══════════════════════════════════════════════════════════════════════════════
-- TABLE 1: lifecycle.tenant_charge_obligations
-- New obligations charged TO tenants (damages, penalties, cleaning, etc.)
-- These do NOT exist in public.transactions. They are a separate authority.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS lifecycle.tenant_charge_obligations (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rental_contract_id      UUID NOT NULL
                            REFERENCES lifecycle.rental_contracts(id),
  property_id             UUID NOT NULL
                            REFERENCES public.property_definitions(property_id),
  tenant_name             TEXT NOT NULL,

  charge_type             TEXT NOT NULL
                            CHECK (charge_type IN (
                              'damage',            -- tenant-caused damage
                              'penalty',           -- late payment penalty, breach fee
                              'cleaning',          -- end-of-tenancy cleaning
                              'key_replacement',   -- lost keys
                              'utility_arrears',   -- unpaid utilities (manual arrears only)
                              'other'
                            )),
  description             TEXT NOT NULL,

  -- Cost and charge (Blocker 9: negative margin allowed)
  actual_cost_eur         NUMERIC,             -- NULL if unknown (P-ARCH-1)
  charge_amount_eur       NUMERIC NOT NULL,     -- what tenant is billed
  -- No CHECK (charge_amount_eur >= actual_cost_eur) — JJ may charge less than cost

  -- Evidence
  source_evidence         TEXT,                 -- photo, report, invoice reference
  economic_date           DATE NOT NULL,        -- when damage/event occurred

  -- Deposit linkage (P5 marks only; P3 authoritative for deposit lifecycle)
  deductible_from_deposit BOOLEAN NOT NULL DEFAULT false,

  settled_amount_eur      NUMERIC NOT NULL DEFAULT 0,
  status                  TEXT NOT NULL DEFAULT 'pending'
                            CHECK (status IN (
                              'pending', 'billed', 'partial', 'settled',
                              'disputed', 'waived', 'reversed'
                            )),
  settlement_evidence     JSONB,
  idempotency_key         TEXT NOT NULL UNIQUE,
  notes                   TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tco_rental_contract
  ON lifecycle.tenant_charge_obligations(rental_contract_id);

CREATE INDEX IF NOT EXISTS idx_tco_property
  ON lifecycle.tenant_charge_obligations(property_id);

CREATE INDEX IF NOT EXISTS idx_tco_status
  ON lifecycle.tenant_charge_obligations(status);


-- ═══════════════════════════════════════════════════════════════════════════════
-- TABLE 2: lifecycle.statement_presentation_overrides
-- Presentation-only metadata controlling WHEN an existing charge appears
-- on a statement. NEVER changes financial truth.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS lifecycle.statement_presentation_overrides (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_transaction_id   UUID NOT NULL,        -- soft reference to public.transactions.id
  property_id             UUID NOT NULL
                            REFERENCES public.property_definitions(property_id),

  presentation_status     TEXT NOT NULL DEFAULT 'include_now'
                            CHECK (presentation_status IN (
                              'include_now',       -- include in current/next statement
                              'next_statement',    -- defer to next statement cycle
                              'defer_until_date',  -- defer until specific date
                              'internal_only'      -- never show on owner statement
                            )),
  defer_until_date        DATE,                  -- required when 'defer_until_date'

  -- Original financial truth is NEVER changed
  economic_date           DATE NOT NULL,         -- the original transaction date
  override_reason         TEXT,
  created_by              UUID,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT spo_defer_date_check
    CHECK (
      presentation_status != 'defer_until_date' OR defer_until_date IS NOT NULL
    )
);

-- One override per source transaction per property (controlled update, not duplicates)
CREATE UNIQUE INDEX IF NOT EXISTS idx_spo_source_property
  ON lifecycle.statement_presentation_overrides(source_transaction_id, property_id);

CREATE INDEX IF NOT EXISTS idx_spo_property
  ON lifecycle.statement_presentation_overrides(property_id);

CREATE INDEX IF NOT EXISTS idx_spo_status
  ON lifecycle.statement_presentation_overrides(presentation_status);


-- ═══════════════════════════════════════════════════════════════════════════════
-- RLS: deny-all on both tables
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE lifecycle.tenant_charge_obligations ENABLE ROW LEVEL SECURITY;
ALTER TABLE lifecycle.statement_presentation_overrides ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'tenant_charge_obligations'
      AND schemaname = 'lifecycle'
      AND policyname = 'tco_deny_all'
  ) THEN
    CREATE POLICY tco_deny_all ON lifecycle.tenant_charge_obligations
      AS RESTRICTIVE FOR ALL TO public USING (false);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'statement_presentation_overrides'
      AND schemaname = 'lifecycle'
      AND policyname = 'spo_deny_all'
  ) THEN
    CREATE POLICY spo_deny_all ON lifecycle.statement_presentation_overrides
      AS RESTRICTIVE FOR ALL TO public USING (false);
  END IF;
END $$;


-- ═══════════════════════════════════════════════════════════════════════════════
-- GRANTS / REVOKES
-- ═══════════════════════════════════════════════════════════════════════════════

REVOKE ALL ON lifecycle.tenant_charge_obligations FROM anon, authenticated, public;
REVOKE ALL ON lifecycle.statement_presentation_overrides FROM anon, authenticated, public;
GRANT ALL ON lifecycle.tenant_charge_obligations TO service_role;
GRANT ALL ON lifecycle.statement_presentation_overrides TO service_role;


-- ═══════════════════════════════════════════════════════════════════════════════
-- RPC 1: lifecycle.create_tenant_charge_obligation
-- Creates a new tenant charge. Validates contract exists, property matches,
-- charge type valid. Idempotency key prevents duplicate economic obligations.
-- SECURITY DEFINER — service_role only via require_jj_staff().
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION lifecycle.create_tenant_charge_obligation(
  p_rental_contract_id  UUID,
  p_property_id         UUID,
  p_tenant_name         TEXT,
  p_charge_type         TEXT,
  p_description         TEXT,
  p_actual_cost_eur     NUMERIC,    -- NULL allowed (P-ARCH-1)
  p_charge_amount_eur   NUMERIC,
  p_source_evidence     TEXT,
  p_economic_date       DATE,
  p_deductible          BOOLEAN,
  p_idempotency_key     TEXT,
  p_notes               TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = lifecycle, public
AS $$
DECLARE
  v_contract_property UUID;
  v_result UUID;
BEGIN
  -- Auth gate
  PERFORM require_jj_staff();

  -- Validate rental contract exists and property matches
  SELECT property_id INTO v_contract_property
    FROM lifecycle.rental_contracts
    WHERE id = p_rental_contract_id;

  IF v_contract_property IS NULL THEN
    RAISE EXCEPTION 'Rental contract not found: %', p_rental_contract_id;
  END IF;

  IF v_contract_property != p_property_id THEN
    RAISE EXCEPTION 'Property mismatch: contract property % != requested %',
      v_contract_property, p_property_id;
  END IF;

  -- Validate charge type
  IF p_charge_type NOT IN ('damage','penalty','cleaning','key_replacement','utility_arrears','other') THEN
    RAISE EXCEPTION 'Invalid charge_type: %', p_charge_type;
  END IF;

  -- Validate charge amount non-negative
  IF p_charge_amount_eur < 0 THEN
    RAISE EXCEPTION 'charge_amount_eur must be non-negative';
  END IF;

  -- Negative margin allowed: actual_cost_eur > charge_amount_eur is valid

  -- Insert (idempotency_key UNIQUE constraint prevents duplicates)
  INSERT INTO lifecycle.tenant_charge_obligations (
    rental_contract_id, property_id, tenant_name,
    charge_type, description,
    actual_cost_eur, charge_amount_eur,
    source_evidence, economic_date,
    deductible_from_deposit,
    idempotency_key, notes
  ) VALUES (
    p_rental_contract_id, p_property_id, p_tenant_name,
    p_charge_type, p_description,
    p_actual_cost_eur, p_charge_amount_eur,
    p_source_evidence, p_economic_date,
    COALESCE(p_deductible, false),
    p_idempotency_key, p_notes
  )
  RETURNING id INTO v_result;

  RETURN jsonb_build_object(
    'id', v_result,
    'status', 'created'
  );
END;
$$;

REVOKE ALL ON FUNCTION lifecycle.create_tenant_charge_obligation(UUID,UUID,TEXT,TEXT,TEXT,NUMERIC,NUMERIC,TEXT,DATE,BOOLEAN,TEXT,TEXT) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION lifecycle.create_tenant_charge_obligation(UUID,UUID,TEXT,TEXT,TEXT,NUMERIC,NUMERIC,TEXT,DATE,BOOLEAN,TEXT,TEXT) TO service_role;


-- ═══════════════════════════════════════════════════════════════════════════════
-- RPC 2: lifecycle.update_tenant_charge_status
-- Controlled status transition. P-ARCH-4: no DELETE — status changes only.
-- Updates settled_amount_eur when partial/settled.
-- SECURITY DEFINER — service_role only via require_jj_staff().
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION lifecycle.update_tenant_charge_status(
  p_charge_id           UUID,
  p_new_status          TEXT,
  p_settled_amount      NUMERIC DEFAULT NULL,
  p_settlement_evidence JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = lifecycle, public
AS $$
DECLARE
  v_current_status TEXT;
  v_charge_amount  NUMERIC;
BEGIN
  -- Auth gate
  PERFORM require_jj_staff();

  -- Validate new status
  IF p_new_status NOT IN ('pending','billed','partial','settled','disputed','waived','reversed') THEN
    RAISE EXCEPTION 'Invalid status: %', p_new_status;
  END IF;

  -- Get current state
  SELECT status, charge_amount_eur
    INTO v_current_status, v_charge_amount
    FROM lifecycle.tenant_charge_obligations
    WHERE id = p_charge_id;

  IF v_current_status IS NULL THEN
    RAISE EXCEPTION 'Tenant charge not found: %', p_charge_id;
  END IF;

  -- Update status + optional settlement fields
  UPDATE lifecycle.tenant_charge_obligations
  SET
    status = p_new_status,
    settled_amount_eur = COALESCE(p_settled_amount, settled_amount_eur),
    settlement_evidence = COALESCE(p_settlement_evidence, settlement_evidence),
    updated_at = now()
  WHERE id = p_charge_id;

  RETURN jsonb_build_object(
    'id', p_charge_id,
    'previous_status', v_current_status,
    'new_status', p_new_status
  );
END;
$$;

REVOKE ALL ON FUNCTION lifecycle.update_tenant_charge_status(UUID,TEXT,NUMERIC,JSONB) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION lifecycle.update_tenant_charge_status(UUID,TEXT,NUMERIC,JSONB) TO service_role;


-- ═══════════════════════════════════════════════════════════════════════════════
-- RPC 3: lifecycle.get_contract_tenant_charges
-- Read charges by rental contract. SECURITY DEFINER.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION lifecycle.get_contract_tenant_charges(
  p_rental_contract_id UUID
)
RETURNS SETOF lifecycle.tenant_charge_obligations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = lifecycle, public
AS $$
BEGIN
  PERFORM require_jj_staff();

  RETURN QUERY
    SELECT *
      FROM lifecycle.tenant_charge_obligations
      WHERE rental_contract_id = p_rental_contract_id
      ORDER BY economic_date DESC, created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION lifecycle.get_contract_tenant_charges(UUID) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION lifecycle.get_contract_tenant_charges(UUID) TO service_role;


-- ═══════════════════════════════════════════════════════════════════════════════
-- RPC 4: lifecycle.get_property_tenant_charges
-- Read charges by property. SECURITY DEFINER.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION lifecycle.get_property_tenant_charges(
  p_property_id UUID
)
RETURNS SETOF lifecycle.tenant_charge_obligations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = lifecycle, public
AS $$
BEGIN
  PERFORM require_jj_staff();

  RETURN QUERY
    SELECT *
      FROM lifecycle.tenant_charge_obligations
      WHERE property_id = p_property_id
      ORDER BY economic_date DESC, created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION lifecycle.get_property_tenant_charges(UUID) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION lifecycle.get_property_tenant_charges(UUID) TO service_role;


-- ═══════════════════════════════════════════════════════════════════════════════
-- RPC 5: lifecycle.get_outstanding_tenant_charges
-- Read open/outstanding charges by property (not settled/waived/reversed).
-- SECURITY DEFINER.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION lifecycle.get_outstanding_tenant_charges(
  p_property_id UUID
)
RETURNS SETOF lifecycle.tenant_charge_obligations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = lifecycle, public
AS $$
BEGIN
  PERFORM require_jj_staff();

  RETURN QUERY
    SELECT *
      FROM lifecycle.tenant_charge_obligations
      WHERE property_id = p_property_id
        AND status NOT IN ('settled', 'waived', 'reversed')
      ORDER BY economic_date ASC, created_at ASC;
END;
$$;

REVOKE ALL ON FUNCTION lifecycle.get_outstanding_tenant_charges(UUID) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION lifecycle.get_outstanding_tenant_charges(UUID) TO service_role;


-- ═══════════════════════════════════════════════════════════════════════════════
-- RPC 6: lifecycle.set_statement_presentation_override
-- Creates or updates a presentation override for a source transaction.
-- Uses UNIQUE index to prevent uncontrolled duplicates — upsert pattern.
-- Validates source_transaction_id exists in public.transactions.
-- NEVER mutates the source transaction.
-- SECURITY DEFINER — service_role only via require_jj_staff().
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION lifecycle.set_statement_presentation_override(
  p_source_transaction_id UUID,
  p_property_id           UUID,
  p_presentation_status   TEXT,
  p_defer_until_date      DATE DEFAULT NULL,
  p_economic_date         DATE DEFAULT NULL,
  p_override_reason       TEXT DEFAULT NULL,
  p_created_by            UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = lifecycle, public
AS $$
DECLARE
  v_tx_exists BOOLEAN;
  v_tx_date   DATE;
  v_result_id UUID;
  v_action    TEXT;
BEGIN
  -- Auth gate
  PERFORM require_jj_staff();

  -- Validate presentation status
  IF p_presentation_status NOT IN ('include_now','next_statement','defer_until_date','internal_only') THEN
    RAISE EXCEPTION 'Invalid presentation_status: %', p_presentation_status;
  END IF;

  -- defer_until_date required when status = 'defer_until_date'
  IF p_presentation_status = 'defer_until_date' AND p_defer_until_date IS NULL THEN
    RAISE EXCEPTION 'defer_until_date is required when presentation_status = defer_until_date';
  END IF;

  -- Validate source transaction exists in public.transactions
  SELECT true, date INTO v_tx_exists, v_tx_date
    FROM public.transactions
    WHERE id = p_source_transaction_id;

  IF v_tx_exists IS NULL THEN
    RAISE EXCEPTION 'Source transaction not found: %', p_source_transaction_id;
  END IF;

  -- Use original transaction date if economic_date not provided
  IF p_economic_date IS NULL THEN
    p_economic_date := v_tx_date;
  END IF;

  -- Upsert: one override per (source_transaction_id, property_id)
  INSERT INTO lifecycle.statement_presentation_overrides (
    source_transaction_id, property_id,
    presentation_status, defer_until_date,
    economic_date, override_reason, created_by
  ) VALUES (
    p_source_transaction_id, p_property_id,
    p_presentation_status, p_defer_until_date,
    p_economic_date, p_override_reason, p_created_by
  )
  ON CONFLICT (source_transaction_id, property_id) DO UPDATE SET
    presentation_status = EXCLUDED.presentation_status,
    defer_until_date = EXCLUDED.defer_until_date,
    override_reason = EXCLUDED.override_reason,
    updated_at = now()
  RETURNING id INTO v_result_id;

  -- Determine if insert or update
  v_action := CASE
    WHEN xmax = 0 THEN 'created'
    ELSE 'updated'
  END;

  RETURN jsonb_build_object(
    'id', v_result_id,
    'action', v_action,
    'economic_date', p_economic_date
  );
END;
$$;

REVOKE ALL ON FUNCTION lifecycle.set_statement_presentation_override(UUID,UUID,TEXT,DATE,DATE,TEXT,UUID) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION lifecycle.set_statement_presentation_override(UUID,UUID,TEXT,DATE,DATE,TEXT,UUID) TO service_role;


-- ═══════════════════════════════════════════════════════════════════════════════
-- RPC 7: lifecycle.resolve_statement_presentation
-- Pure read helper: for a given source transaction and statement date,
-- returns whether the item should be visible and what status applies.
-- Does NOT recalculate balances.
-- SECURITY DEFINER.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION lifecycle.resolve_statement_presentation(
  p_source_transaction_id UUID,
  p_property_id           UUID,
  p_statement_date        DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = lifecycle, public
AS $$
DECLARE
  v_override RECORD;
  v_visible  BOOLEAN;
BEGIN
  PERFORM require_jj_staff();

  -- Look up override
  SELECT presentation_status, defer_until_date, economic_date, override_reason
    INTO v_override
    FROM lifecycle.statement_presentation_overrides
    WHERE source_transaction_id = p_source_transaction_id
      AND property_id = p_property_id;

  -- No override = include by default
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'has_override', false,
      'presentation_status', 'include_now',
      'visible', true,
      'economic_date', NULL
    );
  END IF;

  -- Determine visibility based on status
  v_visible := CASE v_override.presentation_status
    WHEN 'include_now' THEN true
    WHEN 'next_statement' THEN false     -- excluded from current cycle
    WHEN 'defer_until_date' THEN
      p_statement_date >= v_override.defer_until_date
    WHEN 'internal_only' THEN false      -- never on owner statement
    ELSE true
  END;

  RETURN jsonb_build_object(
    'has_override', true,
    'presentation_status', v_override.presentation_status,
    'visible', v_visible,
    'defer_until_date', v_override.defer_until_date,
    'economic_date', v_override.economic_date,
    'override_reason', v_override.override_reason
  );
END;
$$;

REVOKE ALL ON FUNCTION lifecycle.resolve_statement_presentation(UUID,UUID,DATE) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION lifecycle.resolve_statement_presentation(UUID,UUID,DATE) TO service_role;
