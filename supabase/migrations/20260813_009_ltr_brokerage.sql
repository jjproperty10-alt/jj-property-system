-- =============================================================================
-- Migration: 20260813_009_ltr_brokerage
-- Description: P6 — Brokerage Obligations
-- Scope: 1 table + 4 SECURITY DEFINER RPCs
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
-- P1/P2/P3/P4/P5 tables are NOT touched.
-- =============================================================================
-- BUSINESS MODEL (Brokerage Obligations):
-- One-time fee per NEW tenant placement.
-- No recurrence on renewal. No brokerage triggered by rent change
-- (same lease = same tenant = same rental_contract_id).
-- Brokerage is a JJ management obligation — not a tenant charge.
-- =============================================================================
-- ROLLBACK:
-- DROP FUNCTION IF EXISTS lifecycle.get_contract_brokerage(UUID);
-- DROP FUNCTION IF EXISTS lifecycle.get_property_brokerages(UUID);
-- DROP FUNCTION IF EXISTS lifecycle.update_brokerage_status(UUID,TEXT,NUMERIC,JSONB);
-- DROP FUNCTION IF EXISTS lifecycle.create_brokerage_obligation(UUID,UUID,TEXT,BOOLEAN,TEXT,TEXT,NUMERIC,NUMERIC,DATE,BOOLEAN,TEXT,TEXT,TEXT,TEXT);
-- DROP TABLE IF EXISTS lifecycle.brokerage_obligations;
-- =============================================================================


-- ═══════════════════════════════════════════════════════════════════════════════
-- TABLE: lifecycle.brokerage_obligations
-- One-time brokerage fee per new tenant placement.
-- idempotency_key = '{contract_id}:brokerage' ensures one brokerage per lease.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS lifecycle.brokerage_obligations (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rental_contract_id      UUID NOT NULL
                            REFERENCES lifecycle.rental_contracts(id),
  property_id             UUID NOT NULL
                            REFERENCES public.property_definitions(property_id),
  tenant_name             TEXT NOT NULL,

  -- Brokerage applicability + broker identity
  brokerage_applicable    BOOLEAN NOT NULL DEFAULT true,
  broker_name             TEXT,            -- NULL when brokerage_applicable = false

  -- Calculation model (V1.3 locked business types)
  calculation_type        TEXT NOT NULL DEFAULT 'one_month_rent'
                            CHECK (calculation_type IN (
                              'one_month_rent',     -- brokerage = rent effective at tenancy start
                              'fixed_amount',       -- explicit configured EUR amount
                              'percentage'          -- configured % × agreed rent basis
                            )),
  percentage_rate         NUMERIC CHECK (percentage_rate > 0 AND percentage_rate <= 100),
                            -- required when calculation_type = 'percentage'; NULL otherwise

  charge_amount_eur       NUMERIC NOT NULL CHECK (charge_amount_eur >= 0),
  charge_date             DATE NOT NULL,
  is_new_tenant           BOOLEAN NOT NULL DEFAULT true,

  -- Payer/payee + evidence
  payer                   TEXT NOT NULL DEFAULT 'Owner'
                            CHECK (payer IN ('Owner', 'Tenant', 'JJ')),
  payee                   TEXT NOT NULL DEFAULT 'JJ'
                            CHECK (payee IN ('JJ', 'Broker', 'Yossi', 'Jacob')),
  governing_evidence      TEXT,

  -- Settlement tracking
  settled_amount_eur      NUMERIC NOT NULL DEFAULT 0,
  status                  TEXT NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'billed', 'settled', 'waived', 'reversed')),
  settlement_evidence     JSONB,

  -- Idempotency: one brokerage per lease
  idempotency_key         TEXT NOT NULL UNIQUE,

  notes                   TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fast lookups
CREATE INDEX IF NOT EXISTS idx_brokerage_property
  ON lifecycle.brokerage_obligations(property_id);

CREATE INDEX IF NOT EXISTS idx_brokerage_contract
  ON lifecycle.brokerage_obligations(rental_contract_id);

CREATE INDEX IF NOT EXISTS idx_brokerage_status
  ON lifecycle.brokerage_obligations(status);


-- ═══════════════════════════════════════════════════════════════════════════════
-- RLS: deny-all
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE lifecycle.brokerage_obligations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'brokerage_obligations'
      AND schemaname = 'lifecycle'
      AND policyname = 'bo_deny_all'
  ) THEN
    CREATE POLICY bo_deny_all ON lifecycle.brokerage_obligations
      AS RESTRICTIVE FOR ALL TO public USING (false);
  END IF;
END $$;


-- ═══════════════════════════════════════════════════════════════════════════════
-- GRANTS / REVOKES
-- ═══════════════════════════════════════════════════════════════════════════════

REVOKE ALL ON lifecycle.brokerage_obligations FROM anon, authenticated, public;
GRANT ALL ON lifecycle.brokerage_obligations TO service_role;


-- ═══════════════════════════════════════════════════════════════════════════════
-- RPC 1: lifecycle.create_brokerage_obligation
-- Creates a new brokerage obligation for a new tenant placement.
-- Validates contract exists, property matches, is_new_tenant, calculation_type.
-- Idempotency key '{contract_id}:brokerage' prevents duplicate per lease.
-- SECURITY DEFINER — service_role only via require_jj_staff().
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION lifecycle.create_brokerage_obligation(
  p_rental_contract_id  UUID,
  p_property_id         UUID,
  p_tenant_name         TEXT,
  p_brokerage_applicable BOOLEAN,
  p_broker_name         TEXT,
  p_calculation_type    TEXT,
  p_percentage_rate     NUMERIC,       -- NULL unless calculation_type = 'percentage'
  p_charge_amount_eur   NUMERIC,
  p_charge_date         DATE,
  p_is_new_tenant       BOOLEAN,
  p_payer               TEXT,
  p_payee               TEXT,
  p_governing_evidence  TEXT DEFAULT NULL,
  p_notes               TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = lifecycle, public
AS $$
DECLARE
  v_contract_property UUID;
  v_idempotency_key   TEXT;
  v_result            UUID;
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

  -- Validate calculation_type
  IF p_calculation_type NOT IN ('one_month_rent', 'fixed_amount', 'percentage') THEN
    RAISE EXCEPTION 'Invalid calculation_type: %', p_calculation_type;
  END IF;

  -- Validate percentage_rate required for 'percentage' type
  IF p_calculation_type = 'percentage' AND (p_percentage_rate IS NULL OR p_percentage_rate <= 0 OR p_percentage_rate > 100) THEN
    RAISE EXCEPTION 'percentage_rate must be > 0 and <= 100 when calculation_type = percentage';
  END IF;

  -- Validate charge amount non-negative
  IF p_charge_amount_eur < 0 THEN
    RAISE EXCEPTION 'charge_amount_eur must be non-negative';
  END IF;

  -- Validate payer
  IF p_payer NOT IN ('Owner', 'Tenant', 'JJ') THEN
    RAISE EXCEPTION 'Invalid payer: %', p_payer;
  END IF;

  -- Validate payee
  IF p_payee NOT IN ('JJ', 'Broker', 'Yossi', 'Jacob') THEN
    RAISE EXCEPTION 'Invalid payee: %', p_payee;
  END IF;

  -- Build idempotency key: one brokerage per lease
  v_idempotency_key := p_rental_contract_id::TEXT || ':brokerage';

  -- Insert (UNIQUE constraint on idempotency_key prevents duplicates)
  INSERT INTO lifecycle.brokerage_obligations (
    rental_contract_id, property_id, tenant_name,
    brokerage_applicable, broker_name,
    calculation_type, percentage_rate,
    charge_amount_eur, charge_date, is_new_tenant,
    payer, payee, governing_evidence,
    idempotency_key, notes
  ) VALUES (
    p_rental_contract_id, p_property_id, p_tenant_name,
    COALESCE(p_brokerage_applicable, true), p_broker_name,
    p_calculation_type, p_percentage_rate,
    p_charge_amount_eur, p_charge_date, COALESCE(p_is_new_tenant, true),
    p_payer, p_payee, p_governing_evidence,
    v_idempotency_key, p_notes
  )
  RETURNING id INTO v_result;

  RETURN jsonb_build_object(
    'id', v_result,
    'status', 'created',
    'idempotency_key', v_idempotency_key
  );
END;
$$;

REVOKE ALL ON FUNCTION lifecycle.create_brokerage_obligation(UUID,UUID,TEXT,BOOLEAN,TEXT,TEXT,NUMERIC,NUMERIC,DATE,BOOLEAN,TEXT,TEXT,TEXT,TEXT) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION lifecycle.create_brokerage_obligation(UUID,UUID,TEXT,BOOLEAN,TEXT,TEXT,NUMERIC,NUMERIC,DATE,BOOLEAN,TEXT,TEXT,TEXT,TEXT) TO service_role;


-- ═══════════════════════════════════════════════════════════════════════════════
-- RPC 2: lifecycle.update_brokerage_status
-- Controlled status transition. P-ARCH-4: no DELETE — status changes only.
-- Updates settled_amount_eur when settled.
-- SECURITY DEFINER — service_role only via require_jj_staff().
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION lifecycle.update_brokerage_status(
  p_brokerage_id        UUID,
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
BEGIN
  -- Auth gate
  PERFORM require_jj_staff();

  -- Validate new status
  IF p_new_status NOT IN ('pending', 'billed', 'settled', 'waived', 'reversed') THEN
    RAISE EXCEPTION 'Invalid status: %', p_new_status;
  END IF;

  -- Get current state
  SELECT status INTO v_current_status
    FROM lifecycle.brokerage_obligations
    WHERE id = p_brokerage_id;

  IF v_current_status IS NULL THEN
    RAISE EXCEPTION 'Brokerage obligation not found: %', p_brokerage_id;
  END IF;

  -- Update status + optional settlement fields
  UPDATE lifecycle.brokerage_obligations
  SET
    status = p_new_status,
    settled_amount_eur = COALESCE(p_settled_amount, settled_amount_eur),
    settlement_evidence = COALESCE(p_settlement_evidence, settlement_evidence),
    updated_at = now()
  WHERE id = p_brokerage_id;

  RETURN jsonb_build_object(
    'id', p_brokerage_id,
    'previous_status', v_current_status,
    'new_status', p_new_status
  );
END;
$$;

REVOKE ALL ON FUNCTION lifecycle.update_brokerage_status(UUID,TEXT,NUMERIC,JSONB) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION lifecycle.update_brokerage_status(UUID,TEXT,NUMERIC,JSONB) TO service_role;


-- ═══════════════════════════════════════════════════════════════════════════════
-- RPC 3: lifecycle.get_property_brokerages
-- Read all brokerage obligations for a property. SECURITY DEFINER.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION lifecycle.get_property_brokerages(
  p_property_id UUID
)
RETURNS SETOF lifecycle.brokerage_obligations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = lifecycle, public
AS $$
BEGIN
  PERFORM require_jj_staff();

  RETURN QUERY
    SELECT *
      FROM lifecycle.brokerage_obligations
      WHERE property_id = p_property_id
      ORDER BY charge_date DESC, created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION lifecycle.get_property_brokerages(UUID) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION lifecycle.get_property_brokerages(UUID) TO service_role;


-- ═══════════════════════════════════════════════════════════════════════════════
-- RPC 4: lifecycle.get_contract_brokerage
-- Read brokerage for a specific rental contract. Returns 0 or 1 rows.
-- SECURITY DEFINER.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION lifecycle.get_contract_brokerage(
  p_rental_contract_id UUID
)
RETURNS SETOF lifecycle.brokerage_obligations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = lifecycle, public
AS $$
BEGIN
  PERFORM require_jj_staff();

  RETURN QUERY
    SELECT *
      FROM lifecycle.brokerage_obligations
      WHERE rental_contract_id = p_rental_contract_id
      ORDER BY created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION lifecycle.get_contract_brokerage(UUID) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION lifecycle.get_contract_brokerage(UUID) TO service_role;
