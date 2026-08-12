-- =============================================================================
-- Migration: 20260813_010_ltr_tenant_settlement
-- Description: P7 — Tenant Final Settlement + Tenant Closing Statement
-- Scope: 2 tables + 1 view + 4 SECURITY DEFINER RPCs
-- Constitutional: P-ARCH-1 (NULL = Unknown), P-ARCH-4 (no delete),
--                 P-ARCH-5 (lifecycle isolation), P0 Architecture (LOCKED)
-- =============================================================================
-- IDEMPOTENCY:
-- CREATE TABLE uses IF NOT EXISTS. GRANTs are idempotent by PostgreSQL spec.
-- CREATE OR REPLACE for functions/views. Re-running is safe.
-- =============================================================================
-- SAFETY:
-- No DROP, DELETE, TRUNCATE, or UPDATE on any existing data.
-- No modification of existing tables, columns, constraints, or indexes.
-- public.transactions is NOT touched.
-- P1/P2/P3/P4/P5/P6 tables are NOT touched.
-- =============================================================================
-- BUSINESS MODEL (Tenant Final Settlement):
-- When a tenant leaves, compute the final balance from all authorities:
--   P1 rent_obligations (outstanding rent)
--   P4 tenant_utility_obligations (outstanding utilities)
--   P5 tenant_charge_obligations (damages, penalties, credits)
--   P3 v_deposit_current_state (deposit held)
-- Deposit is APPLIED to total obligations (LEAST model per V1.2 Correction 3).
-- Settlement direction: tenant_owes_jj | jj_owes_tenant | balanced.
-- Closing statement = tenant-facing snapshot (never shows JJ internals).
-- =============================================================================
-- ROLLBACK:
-- DROP VIEW IF EXISTS lifecycle.v_tenant_closing_position;
-- DROP FUNCTION IF EXISTS lifecycle.get_closing_statement(UUID);
-- DROP FUNCTION IF EXISTS lifecycle.create_closing_statement(UUID);
-- DROP FUNCTION IF EXISTS lifecycle.update_settlement_status(UUID,TEXT,UUID);
-- DROP FUNCTION IF EXISTS lifecycle.compute_tenant_settlement(UUID,DATE,TEXT);
-- DROP TABLE IF EXISTS lifecycle.tenant_closing_statements;
-- DROP TABLE IF EXISTS lifecycle.tenant_settlement_runs;
-- =============================================================================


-- ═══════════════════════════════════════════════════════════════════════════════
-- TABLE: lifecycle.tenant_settlement_runs
-- Final settlement computation when a tenant leaves.
-- Reads from P1 rent, P3 deposit, P4 utility, P5 charges — computes net.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS lifecycle.tenant_settlement_runs (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rental_contract_id      UUID NOT NULL
                            REFERENCES lifecycle.rental_contracts(id),
  property_id             UUID NOT NULL
                            REFERENCES public.property_definitions(property_id),
  tenant_name             TEXT NOT NULL,
  settlement_date         DATE NOT NULL,

  -- Components (all computed from authoritative sources)
  rent_outstanding_eur    NUMERIC NOT NULL DEFAULT 0,
  utility_outstanding_eur NUMERIC NOT NULL DEFAULT 0,
  tenant_charges_eur      NUMERIC NOT NULL DEFAULT 0,   -- damages, penalties etc.
  credits_eur             NUMERIC NOT NULL DEFAULT 0,    -- overpayments, goodwill
  deposit_held_eur        NUMERIC NOT NULL DEFAULT 0,

  -- V1.2 Correction 3: Deposit is APPLIED to total obligations, not deducted separately.
  -- total_obligations = rent + utilities + charges − credits
  -- deposit_applied_to_obligations = LEAST(deposit_held, total_obligations)
  -- deposit_refund = deposit_held − deposit_applied_to_obligations
  -- net = total_obligations − deposit_applied_to_obligations
  total_obligations_eur           NUMERIC NOT NULL DEFAULT 0,
  deposit_applied_to_obligations  NUMERIC NOT NULL DEFAULT 0,
  deposit_refund_eur              NUMERIC NOT NULL DEFAULT 0,

  net_settlement_eur      NUMERIC NOT NULL,
  settlement_direction    TEXT NOT NULL
                            CHECK (settlement_direction IN (
                              'tenant_owes_jj', 'jj_owes_tenant', 'balanced'
                            )),

  status                  TEXT NOT NULL DEFAULT 'draft'
                            CHECK (status IN (
                              'draft', 'approved', 'communicated', 'settled', 'disputed'
                            )),
  component_details       JSONB NOT NULL,
  approved_by             UUID,
  approved_at             TIMESTAMPTZ,
  notes                   TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fast lookups
CREATE INDEX IF NOT EXISTS idx_settlement_runs_contract
  ON lifecycle.tenant_settlement_runs(rental_contract_id);

CREATE INDEX IF NOT EXISTS idx_settlement_runs_property
  ON lifecycle.tenant_settlement_runs(property_id);

CREATE INDEX IF NOT EXISTS idx_settlement_runs_status
  ON lifecycle.tenant_settlement_runs(status);


-- ═══════════════════════════════════════════════════════════════════════════════
-- TABLE: lifecycle.tenant_closing_statements
-- Tenant-facing snapshot of settlement computation.
-- Immutable after status = 'sent' (P-ARCH-4). Corrections create new version.
-- Tenant NEVER sees: JJ margin, internal payer/payee, partner settlement.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS lifecycle.tenant_closing_statements (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_run_id       UUID NOT NULL
                            REFERENCES lifecycle.tenant_settlement_runs(id),
  rental_contract_id      UUID NOT NULL
                            REFERENCES lifecycle.rental_contracts(id),

  -- Snapshot (immutable after sent)
  statement_version       INTEGER NOT NULL DEFAULT 1,
  statement_date          DATE NOT NULL,
  tenant_name             TEXT NOT NULL,
  property_address        TEXT,

  -- Tenant-visible breakdown
  deposit_amount_eur      NUMERIC NOT NULL,
  rent_balance_eur        NUMERIC NOT NULL,      -- positive = tenant owes
  utility_balance_eur     NUMERIC NOT NULL,
  damage_charges_eur      NUMERIC NOT NULL,
  credits_eur             NUMERIC NOT NULL,
  -- V1.2 Correction 3: mirrors settlement model
  total_obligations_eur           NUMERIC NOT NULL,
  deposit_applied_to_obligations  NUMERIC NOT NULL,
  deposit_refund_eur              NUMERIC NOT NULL,
  final_balance_eur       NUMERIC NOT NULL,       -- positive = tenant owes, 0 or neg = JJ refunds

  -- Status
  status                  TEXT NOT NULL DEFAULT 'draft'
                            CHECK (status IN ('draft', 'approved', 'sent', 'acknowledged')),
  sent_at                 TIMESTAMPTZ,
  sent_via                TEXT,                   -- 'email', 'postal', 'hand_delivered'

  -- Document reference
  document_reference      TEXT,
  template_version        TEXT,

  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fast lookups
CREATE INDEX IF NOT EXISTS idx_closing_statements_run
  ON lifecycle.tenant_closing_statements(settlement_run_id);

CREATE INDEX IF NOT EXISTS idx_closing_statements_contract
  ON lifecycle.tenant_closing_statements(rental_contract_id);


-- ═══════════════════════════════════════════════════════════════════════════════
-- RLS: deny-all on both tables
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE lifecycle.tenant_settlement_runs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'tenant_settlement_runs'
      AND schemaname = 'lifecycle'
      AND policyname = 'tsr_deny_all'
  ) THEN
    CREATE POLICY tsr_deny_all ON lifecycle.tenant_settlement_runs
      AS RESTRICTIVE FOR ALL TO public USING (false);
  END IF;
END $$;

ALTER TABLE lifecycle.tenant_closing_statements ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'tenant_closing_statements'
      AND schemaname = 'lifecycle'
      AND policyname = 'tcs_deny_all'
  ) THEN
    CREATE POLICY tcs_deny_all ON lifecycle.tenant_closing_statements
      AS RESTRICTIVE FOR ALL TO public USING (false);
  END IF;
END $$;


-- ═══════════════════════════════════════════════════════════════════════════════
-- GRANTS / REVOKES
-- ═══════════════════════════════════════════════════════════════════════════════

REVOKE ALL ON lifecycle.tenant_settlement_runs FROM anon, authenticated, public;
GRANT ALL ON lifecycle.tenant_settlement_runs TO service_role;

REVOKE ALL ON lifecycle.tenant_closing_statements FROM anon, authenticated, public;
GRANT ALL ON lifecycle.tenant_closing_statements TO service_role;


-- ═══════════════════════════════════════════════════════════════════════════════
-- RPC 1: lifecycle.compute_tenant_settlement
-- Reads from P1-P5 authorities. Computes final settlement. Inserts as 'draft'.
-- Does NOT execute payment. Does NOT modify source tables.
-- SECURITY DEFINER — service_role only via require_jj_staff().
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION lifecycle.compute_tenant_settlement(
  p_rental_contract_id  UUID,
  p_settlement_date     DATE,
  p_notes               TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = lifecycle, public
AS $$
DECLARE
  v_contract        RECORD;
  v_rent_outstanding NUMERIC := 0;
  v_utility_outstanding NUMERIC := 0;
  v_charges         NUMERIC := 0;
  v_credits         NUMERIC := 0;
  v_deposit_held    NUMERIC := 0;
  v_total_obligations NUMERIC;
  v_deposit_applied NUMERIC;
  v_deposit_refund  NUMERIC;
  v_net             NUMERIC;
  v_direction       TEXT;
  v_details         JSONB;
  v_result_id       UUID;
BEGIN
  -- Auth gate
  PERFORM require_jj_staff();

  -- Validate rental contract exists
  SELECT rc.id, rc.property_id, rc.tenant_name
    INTO v_contract
    FROM lifecycle.rental_contracts rc
    WHERE rc.id = p_rental_contract_id;

  IF v_contract.id IS NULL THEN
    RAISE EXCEPTION 'Rental contract not found: %', p_rental_contract_id;
  END IF;

  -- 1. Rent outstanding (P1): sum of unpaid rent obligations
  SELECT COALESCE(SUM(expected_amount_eur - received_amount_eur), 0)
    INTO v_rent_outstanding
    FROM lifecycle.rent_obligations
    WHERE rental_contract_id = p_rental_contract_id
      AND status NOT IN ('paid', 'reversed', 'void');

  -- 2. Utility outstanding (P4): sum of unsettled utility obligations
  SELECT COALESCE(SUM(obligation_amount_eur - settled_amount_eur), 0)
    INTO v_utility_outstanding
    FROM lifecycle.tenant_utility_obligations
    WHERE rental_contract_id = p_rental_contract_id
      AND status NOT IN ('settled', 'reversed', 'void');

  -- 3. Tenant charges (P5): damages, penalties — outstanding only
  SELECT
    COALESCE(SUM(CASE WHEN charge_type != 'credit' THEN charge_amount_eur - settled_amount_eur ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN charge_type = 'credit' THEN charge_amount_eur - settled_amount_eur ELSE 0 END), 0)
    INTO v_charges, v_credits
    FROM lifecycle.tenant_charge_obligations
    WHERE rental_contract_id = p_rental_contract_id
      AND status NOT IN ('settled', 'reversed', 'void');

  -- 4. Deposit held (P3): current deposit via view
  SELECT COALESCE(current_held_eur, 0)
    INTO v_deposit_held
    FROM lifecycle.v_deposit_current_state
    WHERE rental_contract_id = p_rental_contract_id;

  -- If no deposit record, default to 0
  v_deposit_held := COALESCE(v_deposit_held, 0);

  -- 5. Compute settlement (V1.2 Correction 3: LEAST model)
  v_total_obligations := v_rent_outstanding + v_utility_outstanding + v_charges - v_credits;
  -- Cannot go negative — credits cannot exceed total obligations in this model
  IF v_total_obligations < 0 THEN
    v_total_obligations := 0;
  END IF;

  v_deposit_applied := LEAST(v_deposit_held, v_total_obligations);
  v_deposit_refund := v_deposit_held - v_deposit_applied;
  v_net := v_total_obligations - v_deposit_applied;

  -- 6. Determine direction
  IF v_net > 0 THEN
    v_direction := 'tenant_owes_jj';
  ELSIF v_deposit_refund > 0 AND v_net = 0 THEN
    v_direction := 'jj_owes_tenant';
  ELSE
    v_direction := 'balanced';
  END IF;

  -- 7. Build component details
  v_details := jsonb_build_object(
    'rent', jsonb_build_object('outstanding_eur', v_rent_outstanding),
    'utilities', jsonb_build_object('outstanding_eur', v_utility_outstanding),
    'charges', jsonb_build_object('total_eur', v_charges),
    'credits', jsonb_build_object('total_eur', v_credits),
    'deposit', jsonb_build_object(
      'held_eur', v_deposit_held,
      'applied_eur', v_deposit_applied,
      'refund_eur', v_deposit_refund
    ),
    'computed_at', now()::TEXT
  );

  -- 8. Insert settlement run as draft
  INSERT INTO lifecycle.tenant_settlement_runs (
    rental_contract_id, property_id, tenant_name, settlement_date,
    rent_outstanding_eur, utility_outstanding_eur, tenant_charges_eur, credits_eur,
    deposit_held_eur, total_obligations_eur,
    deposit_applied_to_obligations, deposit_refund_eur,
    net_settlement_eur, settlement_direction,
    status, component_details, notes
  ) VALUES (
    p_rental_contract_id, v_contract.property_id, v_contract.tenant_name,
    p_settlement_date,
    v_rent_outstanding, v_utility_outstanding, v_charges, v_credits,
    v_deposit_held, v_total_obligations,
    v_deposit_applied, v_deposit_refund,
    v_net, v_direction,
    'draft', v_details, p_notes
  )
  RETURNING id INTO v_result_id;

  RETURN jsonb_build_object(
    'id', v_result_id,
    'status', 'draft',
    'net_settlement_eur', v_net,
    'settlement_direction', v_direction,
    'deposit_refund_eur', v_deposit_refund
  );
END;
$$;

REVOKE ALL ON FUNCTION lifecycle.compute_tenant_settlement(UUID,DATE,TEXT) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION lifecycle.compute_tenant_settlement(UUID,DATE,TEXT) TO service_role;


-- ═══════════════════════════════════════════════════════════════════════════════
-- RPC 2: lifecycle.update_settlement_status
-- Controlled status transition. P-ARCH-4: no DELETE — status changes only.
-- SECURITY DEFINER — service_role only via require_jj_staff().
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION lifecycle.update_settlement_status(
  p_settlement_id   UUID,
  p_new_status      TEXT,
  p_approved_by     UUID DEFAULT NULL
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

  -- Validate status
  IF p_new_status NOT IN ('draft', 'approved', 'communicated', 'settled', 'disputed') THEN
    RAISE EXCEPTION 'Invalid settlement status: %', p_new_status;
  END IF;

  -- Get current state
  SELECT status INTO v_current_status
    FROM lifecycle.tenant_settlement_runs
    WHERE id = p_settlement_id;

  IF v_current_status IS NULL THEN
    RAISE EXCEPTION 'Settlement run not found: %', p_settlement_id;
  END IF;

  -- Update
  UPDATE lifecycle.tenant_settlement_runs
  SET
    status = p_new_status,
    approved_by = CASE WHEN p_new_status = 'approved' THEN COALESCE(p_approved_by, approved_by) ELSE approved_by END,
    approved_at = CASE WHEN p_new_status = 'approved' THEN now() ELSE approved_at END,
    updated_at = now()
  WHERE id = p_settlement_id;

  RETURN jsonb_build_object(
    'id', p_settlement_id,
    'previous_status', v_current_status,
    'new_status', p_new_status
  );
END;
$$;

REVOKE ALL ON FUNCTION lifecycle.update_settlement_status(UUID,TEXT,UUID) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION lifecycle.update_settlement_status(UUID,TEXT,UUID) TO service_role;


-- ═══════════════════════════════════════════════════════════════════════════════
-- RPC 3: lifecycle.create_closing_statement
-- Creates a tenant-facing closing statement from a settlement run.
-- Tenant NEVER sees JJ internals. Snapshot immutable after 'sent'.
-- SECURITY DEFINER — service_role only via require_jj_staff().
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION lifecycle.create_closing_statement(
  p_settlement_run_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = lifecycle, public
AS $$
DECLARE
  v_run            RECORD;
  v_next_version   INTEGER;
  v_result_id      UUID;
BEGIN
  -- Auth gate
  PERFORM require_jj_staff();

  -- Load settlement run
  SELECT * INTO v_run
    FROM lifecycle.tenant_settlement_runs
    WHERE id = p_settlement_run_id;

  IF v_run.id IS NULL THEN
    RAISE EXCEPTION 'Settlement run not found: %', p_settlement_run_id;
  END IF;

  -- Determine next version number
  SELECT COALESCE(MAX(statement_version), 0) + 1
    INTO v_next_version
    FROM lifecycle.tenant_closing_statements
    WHERE settlement_run_id = p_settlement_run_id;

  -- Insert closing statement
  INSERT INTO lifecycle.tenant_closing_statements (
    settlement_run_id, rental_contract_id,
    statement_version, statement_date, tenant_name,
    deposit_amount_eur, rent_balance_eur, utility_balance_eur,
    damage_charges_eur, credits_eur,
    total_obligations_eur, deposit_applied_to_obligations,
    deposit_refund_eur, final_balance_eur,
    status
  ) VALUES (
    p_settlement_run_id, v_run.rental_contract_id,
    v_next_version, v_run.settlement_date, v_run.tenant_name,
    v_run.deposit_held_eur, v_run.rent_outstanding_eur, v_run.utility_outstanding_eur,
    v_run.tenant_charges_eur, v_run.credits_eur,
    v_run.total_obligations_eur, v_run.deposit_applied_to_obligations,
    v_run.deposit_refund_eur, v_run.net_settlement_eur,
    'draft'
  )
  RETURNING id INTO v_result_id;

  RETURN jsonb_build_object(
    'id', v_result_id,
    'settlement_run_id', p_settlement_run_id,
    'statement_version', v_next_version,
    'status', 'draft'
  );
END;
$$;

REVOKE ALL ON FUNCTION lifecycle.create_closing_statement(UUID) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION lifecycle.create_closing_statement(UUID) TO service_role;


-- ═══════════════════════════════════════════════════════════════════════════════
-- RPC 4: lifecycle.get_closing_statement
-- Read closing statement(s) for a settlement run. SECURITY DEFINER.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION lifecycle.get_closing_statement(
  p_settlement_run_id UUID
)
RETURNS SETOF lifecycle.tenant_closing_statements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = lifecycle, public
AS $$
BEGIN
  PERFORM require_jj_staff();

  RETURN QUERY
    SELECT *
      FROM lifecycle.tenant_closing_statements
      WHERE settlement_run_id = p_settlement_run_id
      ORDER BY statement_version DESC;
END;
$$;

REVOKE ALL ON FUNCTION lifecycle.get_closing_statement(UUID) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION lifecycle.get_closing_statement(UUID) TO service_role;


-- ═══════════════════════════════════════════════════════════════════════════════
-- VIEW: lifecycle.v_tenant_closing_position
-- Summary of tenant settlement state per rental contract.
-- Composition view — queries settlement_runs and closing_statements.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW lifecycle.v_tenant_closing_position AS
SELECT
  sr.rental_contract_id,
  sr.property_id,
  sr.tenant_name,
  sr.settlement_date,
  sr.rent_outstanding_eur,
  sr.utility_outstanding_eur,
  sr.tenant_charges_eur,
  sr.credits_eur,
  sr.deposit_held_eur,
  sr.total_obligations_eur,
  sr.deposit_applied_to_obligations,
  sr.deposit_refund_eur,
  sr.net_settlement_eur,
  sr.settlement_direction,
  sr.status AS settlement_status,
  cs.id AS latest_statement_id,
  cs.statement_version AS latest_statement_version,
  cs.status AS latest_statement_status,
  cs.sent_at AS statement_sent_at
FROM lifecycle.tenant_settlement_runs sr
LEFT JOIN LATERAL (
  SELECT tcs.id, tcs.statement_version, tcs.status, tcs.sent_at
  FROM lifecycle.tenant_closing_statements tcs
  WHERE tcs.settlement_run_id = sr.id
  ORDER BY tcs.statement_version DESC
  LIMIT 1
) cs ON true
WHERE sr.status != 'disputed'
ORDER BY sr.settlement_date DESC;


-- ═══════════════════════════════════════════════════════════════════════════════
-- RPC 5: lifecycle.get_contract_settlement_runs
-- Read all settlement runs for a rental contract.
-- SECURITY DEFINER — service_role only via require_jj_staff().
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION lifecycle.get_contract_settlement_runs(
  p_rental_contract_id UUID
)
RETURNS SETOF lifecycle.tenant_settlement_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = lifecycle, public
AS $$
BEGIN
  PERFORM require_jj_staff();

  RETURN QUERY
    SELECT *
      FROM lifecycle.tenant_settlement_runs
      WHERE rental_contract_id = p_rental_contract_id
      ORDER BY settlement_date DESC, created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION lifecycle.get_contract_settlement_runs(UUID) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION lifecycle.get_contract_settlement_runs(UUID) TO service_role;


-- ═══════════════════════════════════════════════════════════════════════════════
-- RPC 6: lifecycle.get_contract_closing_position
-- Read closing position (settlement + latest statement) for a rental contract.
-- Uses v_tenant_closing_position composition view.
-- SECURITY DEFINER — service_role only via require_jj_staff().
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION lifecycle.get_contract_closing_position(
  p_rental_contract_id UUID
)
RETURNS SETOF lifecycle.v_tenant_closing_position
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = lifecycle, public
AS $$
BEGIN
  PERFORM require_jj_staff();

  RETURN QUERY
    SELECT *
      FROM lifecycle.v_tenant_closing_position
      WHERE rental_contract_id = p_rental_contract_id
      ORDER BY settlement_date DESC;
END;
$$;

REVOKE ALL ON FUNCTION lifecycle.get_contract_closing_position(UUID) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION lifecycle.get_contract_closing_position(UUID) TO service_role;
