TEST_CONTENT_INJECTION-- ============================================================================
-- P3 — Deposit Lifecycle (Event-Sourced)
-- LTR V1.3 Implementation Spec — Phase 3
--
-- Constitutional:
--   P-ARCH-4: Append-only (no UPDATE/DELETE on deposit_events)
--   P-ARCH-1: NULL = Unknown
--   P-ARCH-2: Yossi ≠ Jacob ≠ JJ (custodian identity preserved)
--   P-ARCH-5: lifecycle schema isolation
--   P-LEDGER-1: Cash Reality ≠ Economic Allocation ≠ Settlement Counterparty
--
-- Deposit is NEVER income. Never enters P&L. Custodial/settlement only.
--
-- Idempotent: IF NOT EXISTS / DO $$ guards throughout.
-- Rollback: DROP TABLE lifecycle.deposit_events CASCADE;
-- ============================================================================

-- ── Table: deposit_events (event-sourced, append-only) ──────────────────────

CREATE TABLE IF NOT EXISTS lifecycle.deposit_events (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rental_contract_id      UUID NOT NULL
                            REFERENCES lifecycle.rental_contracts(id),
  property_id             UUID NOT NULL
                            REFERENCES public.property_definitions(property_id),

  event_type              TEXT NOT NULL
                            CHECK (event_type IN (
                              'received',
                              'refunded',
                              'partially_withheld',
                              'forfeited_to_owner',
                              'transferred_custody',
                              'adjustment'
                            )),

  amount_eur              NUMERIC NOT NULL,
  withheld_amount_eur     NUMERIC,
  withheld_reason         TEXT,

  custodian               TEXT NOT NULL
                            CHECK (custodian IN (
                              'Owner', 'JJ', 'Yossi', 'Jacob', 'Anastasia', 'Tenant'
                            )),
  previous_custodian      TEXT,

  tenant_name             TEXT NOT NULL,
  effective_date          DATE NOT NULL,
  governing_evidence      TEXT,
  notes                   TEXT,
  created_by              UUID,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_deposit_events_contract
  ON lifecycle.deposit_events (rental_contract_id);
CREATE INDEX IF NOT EXISTS idx_deposit_events_property
  ON lifecycle.deposit_events (property_id);
CREATE INDEX IF NOT EXISTS idx_deposit_events_effective_date
  ON lifecycle.deposit_events (effective_date);

-- RLS: deny-all
ALTER TABLE lifecycle.deposit_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'lifecycle'
      AND tablename = 'deposit_events'
      AND policyname = 'deposit_events_deny_all'
  ) THEN
    CREATE POLICY deposit_events_deny_all
      ON lifecycle.deposit_events
      AS RESTRICTIVE
      FOR ALL
      TO PUBLIC
      USING (false)
      WITH CHECK (false);
  END IF;
END $$;

-- GRANT: service_role only (SELECT + INSERT — no UPDATE/DELETE per P-ARCH-4)
GRANT SELECT, INSERT ON lifecycle.deposit_events TO service_role;

-- ── Append-only trigger (P-ARCH-4) ──────────────────────────────────────────
-- Prevents UPDATE and DELETE on deposit_events

CREATE OR REPLACE FUNCTION lifecycle.trg_deposit_events_immutable()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'deposit_events is append-only (P-ARCH-4). UPDATE and DELETE are prohibited.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_deposit_events_no_update ON lifecycle.deposit_events;
CREATE TRIGGER trg_deposit_events_no_update
  BEFORE UPDATE OR DELETE ON lifecycle.deposit_events
  FOR EACH ROW
  EXECUTE FUNCTION lifecycle.trg_deposit_events_immutable();

-- ── View: v_deposit_current_state ───────────────────────────────────────────
-- Derives current deposit state from latest event per contract.
-- Deposit is NEVER income — this view reports custody/status only.

CREATE OR REPLACE VIEW lifecycle.v_deposit_current_state AS
WITH latest_event AS (
  SELECT DISTINCT ON (rental_contract_id)
    id AS latest_event_id,
    rental_contract_id,
    property_id,
    event_type,
    amount_eur,
    withheld_amount_eur,
    withheld_reason,
    custodian,
    previous_custodian,
    tenant_name,
    effective_date,
    governing_evidence,
    notes,
    created_at
  FROM lifecycle.deposit_events
  ORDER BY rental_contract_id, effective_date DESC, created_at DESC
),
aggregates AS (
  SELECT
    rental_contract_id,
    -- Original deposit = sum of all 'received' events
    COALESCE(SUM(amount_eur) FILTER (WHERE event_type = 'received'), 0) AS original_amount_eur,
    -- Total refunded
    COALESCE(SUM(amount_eur) FILTER (WHERE event_type = 'refunded'), 0) AS total_refunded_eur,
    -- Total withheld (from partially_withheld + forfeited_to_owner)
    COALESCE(SUM(COALESCE(withheld_amount_eur, 0))
      FILTER (WHERE event_type IN ('partially_withheld', 'forfeited_to_owner')), 0) AS total_withheld_eur,
    COUNT(*) AS event_count
  FROM lifecycle.deposit_events
  GROUP BY rental_contract_id
)
SELECT
  le.latest_event_id,
  le.rental_contract_id,
  le.property_id,
  le.tenant_name,
  a.original_amount_eur,
  (a.original_amount_eur - a.total_refunded_eur - a.total_withheld_eur) AS current_held_eur,
  a.total_refunded_eur,
  a.total_withheld_eur,
  le.custodian AS current_custodian,
  le.event_type AS latest_event_type,
  le.effective_date AS latest_event_date,
  le.withheld_reason AS latest_withheld_reason,
  a.event_count,
  -- Lifecycle status derivation
  CASE
    WHEN a.original_amount_eur <= 0 THEN 'no_deposit'
    WHEN (a.original_amount_eur - a.total_refunded_eur - a.total_withheld_eur) <= 0 THEN 'fully_closed'
    WHEN a.total_refunded_eur > 0 OR a.total_withheld_eur > 0 THEN 'partially_settled'
    ELSE 'held'
  END AS lifecycle_status,
  -- Is fully closed?
  (a.original_amount_eur - a.total_refunded_eur - a.total_withheld_eur) <= 0 AS is_fully_closed
FROM latest_event le
JOIN aggregates a ON a.rental_contract_id = le.rental_contract_id;

-- ── RPC: record_deposit_event ───────────────────────────────────────────────
-- Validates event_type-specific requirements and inserts a deposit event.
-- SECURITY DEFINER — only callable via service_role.

CREATE OR REPLACE FUNCTION lifecycle.record_deposit_event(
  p_rental_contract_id  UUID,
  p_property_id         UUID,
  p_event_type          TEXT,
  p_amount_eur          NUMERIC,
  p_custodian           TEXT,
  p_tenant_name         TEXT,
  p_effective_date      DATE,
  p_withheld_amount_eur NUMERIC DEFAULT NULL,
  p_withheld_reason     TEXT DEFAULT NULL,
  p_previous_custodian  TEXT DEFAULT NULL,
  p_governing_evidence  TEXT DEFAULT NULL,
  p_notes               TEXT DEFAULT NULL,
  p_created_by          UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_event_id UUID;
  v_contract_exists BOOLEAN;
BEGIN
  -- Staff gate
  PERFORM lifecycle.require_jj_staff();

  -- Validate rental contract exists
  SELECT EXISTS(
    SELECT 1 FROM lifecycle.rental_contracts WHERE id = p_rental_contract_id
  ) INTO v_contract_exists;

  IF NOT v_contract_exists THEN
    RAISE EXCEPTION 'Rental contract % not found', p_rental_contract_id;
  END IF;

  -- Event-type-specific validation
  IF p_event_type = 'received' THEN
    IF p_amount_eur <= 0 THEN
      RAISE EXCEPTION 'received event requires positive amount_eur';
    END IF;

  ELSIF p_event_type = 'refunded' THEN
    IF p_amount_eur <= 0 THEN
      RAISE EXCEPTION 'refunded event requires positive amount_eur';
    END IF;

  ELSIF p_event_type = 'partially_withheld' THEN
    IF p_withheld_amount_eur IS NULL OR p_withheld_amount_eur <= 0 THEN
      RAISE EXCEPTION 'partially_withheld requires positive withheld_amount_eur';
    END IF;
    IF p_withheld_reason IS NULL OR p_withheld_reason = '' THEN
      RAISE EXCEPTION 'partially_withheld requires withheld_reason';
    END IF;

  ELSIF p_event_type = 'forfeited_to_owner' THEN
    IF p_withheld_amount_eur IS NULL OR p_withheld_amount_eur <= 0 THEN
      RAISE EXCEPTION 'forfeited_to_owner requires positive withheld_amount_eur';
    END IF;

  ELSIF p_event_type = 'transferred_custody' THEN
    IF p_previous_custodian IS NULL OR p_previous_custodian = '' THEN
      RAISE EXCEPTION 'transferred_custody requires previous_custodian';
    END IF;
    IF p_previous_custodian = p_custodian THEN
      RAISE EXCEPTION 'transferred_custody: previous_custodian must differ from custodian';
    END IF;

  ELSIF p_event_type = 'adjustment' THEN
    IF p_notes IS NULL OR p_notes = '' THEN
      RAISE EXCEPTION 'adjustment event requires notes explaining the reason';
    END IF;
  END IF;

  -- Insert event
  INSERT INTO lifecycle.deposit_events (
    rental_contract_id, property_id, event_type,
    amount_eur, withheld_amount_eur, withheld_reason,
    custodian, previous_custodian,
    tenant_name, effective_date,
    governing_evidence, notes, created_by
  )
  VALUES (
    p_rental_contract_id, p_property_id, p_event_type,
    p_amount_eur, p_withheld_amount_eur, p_withheld_reason,
    p_custodian, p_previous_custodian,
    p_tenant_name, p_effective_date,
    p_governing_evidence, p_notes, p_created_by
  )
  RETURNING id INTO v_event_id;

  RETURN jsonb_build_object(
    'event_id', v_event_id,
    'event_type', p_event_type,
    'amount_eur', p_amount_eur,
    'custodian', p_custodian,
    'effective_date', p_effective_date
  );
END;
$$;

-- Permissions: revoke from public, grant to service_role
REVOKE ALL ON FUNCTION lifecycle.record_deposit_event FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lifecycle.record_deposit_event TO service_role;

-- ── RPC: get_deposit_history ────────────────────────────────────────────────
-- Returns all events for a rental contract, ordered chronologically.
-- SECURITY DEFINER — only callable via service_role.

CREATE OR REPLACE FUNCTION lifecycle.get_deposit_history(
  p_rental_contract_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_events JSONB;
  v_current_state JSONB;
BEGIN
  -- Staff gate
  PERFORM lifecycle.require_jj_staff();

  -- All events chronologically
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', de.id,
      'rental_contract_id', de.rental_contract_id,
      'property_id', de.property_id,
      'event_type', de.event_type,
      'amount_eur', de.amount_eur,
      'withheld_amount_eur', de.withheld_amount_eur,
      'withheld_reason', de.withheld_reason,
      'custodian', de.custodian,
      'previous_custodian', de.previous_custodian,
      'tenant_name', de.tenant_name,
      'effective_date', de.effective_date,
      'governing_evidence', de.governing_evidence,
      'notes', de.notes,
      'created_at', de.created_at
    ) ORDER BY de.effective_date ASC, de.created_at ASC
  ), '[]'::jsonb)
  INTO v_events
  FROM lifecycle.deposit_events de
  WHERE de.rental_contract_id = p_rental_contract_id;

  -- Current state from view
  SELECT jsonb_build_object(
    'original_amount_eur', cs.original_amount_eur,
    'current_held_eur', cs.current_held_eur,
    'total_refunded_eur', cs.total_refunded_eur,
    'total_withheld_eur', cs.total_withheld_eur,
    'current_custodian', cs.current_custodian,
    'lifecycle_status', cs.lifecycle_status,
    'is_fully_closed', cs.is_fully_closed,
    'latest_event_type', cs.latest_event_type,
    'latest_event_date', cs.latest_event_date,
    'event_count', cs.event_count
  )
  INTO v_current_state
  FROM lifecycle.v_deposit_current_state cs
  WHERE cs.rental_contract_id = p_rental_contract_id;

  RETURN jsonb_build_object(
    'events', v_events,
    'current_state', COALESCE(v_current_state, 'null'::jsonb)
  );
END;
$$;

-- Permissions
REVOKE ALL ON FUNCTION lifecycle.get_deposit_history FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lifecycle.get_deposit_history TO service_role;

-- ── require_jj_staff reference check ────────────────────────────────────────
-- Both RPCs call lifecycle.require_jj_staff() which already exists from P1-0.
-- No action needed — just documenting the dependency.

-- ============================================================================
-- End P3 — Deposit Lifecycle
-- ============================================================================
