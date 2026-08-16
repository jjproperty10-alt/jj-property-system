-- ============================================================================
-- Owner Financial Workspace — Billing, Payment Allocation & Correction Cases
-- PR #166 Consolidation — Full Spec Migration
--
-- Constitutional:
--   P-ARCH-1: NULL = Unknown. Never 0 or placeholder.
--   P-ARCH-4: Append-only for correction_events (no UPDATE/DELETE on closed cases).
--   P-ARCH-5: statements schema isolation — no FK to public.transactions.
--   P-LEDGER-1: Cash Reality ≠ Economic Allocation ≠ Settlement Counterparty.
--   P-LEDGER-6: Owner-facing amounts = COALESCE(client_charge, amount_eur).
--   D4: JJ is the settlement boundary — every external entity settles with JJ.
--
-- Three tables:
--   1. statements.payment_allocations — links payment rows to charge rows (FIFO/manual)
--   2. statements.correction_cases — correction/audit workflow lifecycle
--   3. statements.correction_events — append-only event log for correction lifecycle
--
-- Idempotent: IF NOT EXISTS / DO $$ guards throughout.
-- Rollback:
--   DROP TABLE IF EXISTS statements.correction_events CASCADE;
--   DROP TABLE IF EXISTS statements.correction_cases CASCADE;
--   DROP TABLE IF EXISTS statements.payment_allocations CASCADE;
-- ============================================================================

-- ── 1. Payment Allocations ─────────────────────────────────────────────────
-- Links a payment transaction to one or more charge transactions.
-- One payment can be split across charges (partial allocation).
-- One charge can receive from multiple payments.
-- allocation_method = 'fifo' (automatic) or 'manual' (user override).
--
-- Note: source_transaction_id fields are UUIDs referencing public.transactions.id
-- but without FK constraint (cross-schema isolation, P-ARCH-5 spirit).

CREATE TABLE IF NOT EXISTS statements.payment_allocations (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Scope: which statement series this allocation belongs to
  series_id               UUID NOT NULL
                            REFERENCES statements.statement_series(id),

  -- The payment row (payer=Client/Tenant, typically subcategory in
  -- ('Purchase Payment','Rent Payment','Bank Payment to Owner','Client Payment'))
  payment_transaction_id  UUID NOT NULL,

  -- The charge row being paid by this allocation
  charge_transaction_id   UUID NOT NULL,

  -- How much of the payment is allocated to this charge (partial supported)
  allocated_amount_eur    NUMERIC NOT NULL CHECK (allocated_amount_eur > 0),

  -- How this allocation was determined
  allocation_method       TEXT NOT NULL
                            CHECK (allocation_method IN ('fifo', 'manual')),

  -- Who performed or approved the allocation
  allocated_by            UUID,
  allocated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Optional notes for manual overrides
  notes                   TEXT,

  -- Audit
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Prevent double-allocation of same payment→charge pair
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_alloc_unique_pair
  ON statements.payment_allocations (payment_transaction_id, charge_transaction_id);

-- Lookup by payment or charge
CREATE INDEX IF NOT EXISTS idx_payment_alloc_payment
  ON statements.payment_allocations (payment_transaction_id);
CREATE INDEX IF NOT EXISTS idx_payment_alloc_charge
  ON statements.payment_allocations (charge_transaction_id);
CREATE INDEX IF NOT EXISTS idx_payment_alloc_series
  ON statements.payment_allocations (series_id);

-- RLS: deny-all (access via SECURITY DEFINER RPCs only)
ALTER TABLE statements.payment_allocations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'statements' AND tablename = 'payment_allocations'
      AND policyname = 'deny_all_payment_allocations'
  ) THEN
    CREATE POLICY deny_all_payment_allocations ON statements.payment_allocations
      AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);
  END IF;
END $$;


-- ── 2. Correction Cases ────────────────────────────────────────────────────
-- Tracks corrections, disputes, and audit adjustments to financial records.
-- Each case has a lifecycle: open → under_review → approved/rejected → applied/void.
-- Cases are NOT deleted — they transition to terminal states.

CREATE TABLE IF NOT EXISTS statements.correction_cases (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Scope: which statement series this correction belongs to
  series_id               UUID NOT NULL
                            REFERENCES statements.statement_series(id),

  -- The original transaction being corrected
  original_transaction_id UUID NOT NULL,

  -- What kind of correction
  correction_type         TEXT NOT NULL
                            CHECK (correction_type IN (
                              'amount_correction',     -- wrong amount recorded
                              'reclassification',      -- wrong category/subcategory
                              'duplicate_resolution',  -- confirmed duplicate handling
                              'missing_charge',        -- charge that should exist but doesn't
                              'disputed_charge',       -- owner disputes a charge
                              'description_fix',       -- wrong description/notes
                              'date_correction'        -- wrong date recorded
                            )),

  -- Current lifecycle status
  status                  TEXT NOT NULL DEFAULT 'open'
                            CHECK (status IN (
                              'open',           -- newly created, awaiting review
                              'under_review',   -- being investigated
                              'approved',       -- correction approved, pending application
                              'rejected',       -- correction rejected with reason
                              'applied',        -- correction has been applied to records
                              'void'            -- case voided (superseded or cancelled)
                            )),

  -- Description of the correction needed
  description             TEXT NOT NULL,

  -- Original and proposed values
  original_amount_eur     NUMERIC,
  corrected_amount_eur    NUMERIC,
  original_field_values   JSONB,       -- snapshot of original field values
  corrected_field_values  JSONB,       -- proposed new values

  -- Priority for review queue
  priority                TEXT NOT NULL DEFAULT 'normal'
                            CHECK (priority IN ('low', 'normal', 'high', 'urgent')),

  -- Who opened this case
  opened_by               UUID,
  opened_at               TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Resolution
  resolved_by             UUID,
  resolved_at             TIMESTAMPTZ,
  resolution_notes        TEXT,

  -- If applied, what transaction was created/modified
  applied_transaction_id  UUID,        -- new or modified transaction UUID
  applied_at              TIMESTAMPTZ,

  -- Audit
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_correction_cases_series
  ON statements.correction_cases (series_id);
CREATE INDEX IF NOT EXISTS idx_correction_cases_original_tx
  ON statements.correction_cases (original_transaction_id);
CREATE INDEX IF NOT EXISTS idx_correction_cases_status
  ON statements.correction_cases (status);
CREATE INDEX IF NOT EXISTS idx_correction_cases_priority
  ON statements.correction_cases (priority, status);

-- RLS: deny-all
ALTER TABLE statements.correction_cases ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'statements' AND tablename = 'correction_cases'
      AND policyname = 'deny_all_correction_cases'
  ) THEN
    CREATE POLICY deny_all_correction_cases ON statements.correction_cases
      AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);
  END IF;
END $$;


-- ── 3. Correction Events (append-only audit trail) ─────────────────────────
-- Every state transition on a correction case is logged immutably.
-- P-ARCH-4: no UPDATE or DELETE allowed.

CREATE TABLE IF NOT EXISTS statements.correction_events (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Which case this event belongs to
  case_id                 UUID NOT NULL
                            REFERENCES statements.correction_cases(id),

  -- What happened
  event_type              TEXT NOT NULL
                            CHECK (event_type IN (
                              'opened',
                              'assigned',
                              'under_review',
                              'evidence_added',
                              'approved',
                              'rejected',
                              'applied',
                              'voided',
                              'comment'
                            )),

  -- Who performed this action
  performed_by            UUID,

  -- Event details
  notes                   TEXT,
  metadata                JSONB,       -- flexible event-specific data

  -- Immutable timestamp
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_correction_events_case
  ON statements.correction_events (case_id, created_at);

-- Immutability trigger: prevent UPDATE and DELETE on correction_events
CREATE OR REPLACE FUNCTION statements.trg_correction_events_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'correction_events is append-only (P-ARCH-4). UPDATE and DELETE are prohibited.';
END;
$$;

DROP TRIGGER IF EXISTS trg_correction_events_no_update ON statements.correction_events;
CREATE TRIGGER trg_correction_events_no_update
  BEFORE UPDATE OR DELETE ON statements.correction_events
  FOR EACH ROW EXECUTE FUNCTION statements.trg_correction_events_immutable();

-- RLS: deny-all
ALTER TABLE statements.correction_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'statements' AND tablename = 'correction_events'
      AND policyname = 'deny_all_correction_events'
  ) THEN
    CREATE POLICY deny_all_correction_events ON statements.correction_events
      AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);
  END IF;
END $$;


-- ── 4. RPCs — SECURITY DEFINER access ──────────────────────────────────────

-- 4.1 Allocate payment to charge
CREATE OR REPLACE FUNCTION statements.allocate_payment(
  p_series_id             UUID,
  p_payment_transaction_id UUID,
  p_charge_transaction_id  UUID,
  p_amount_eur            NUMERIC,
  p_method                TEXT DEFAULT 'manual',
  p_notes                 TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id UUID;
BEGIN
  -- Staff gate
  PERFORM statements.require_jj_staff();

  -- Validate method
  IF p_method NOT IN ('fifo', 'manual') THEN
    RAISE EXCEPTION 'Invalid allocation method: %', p_method;
  END IF;

  -- Validate amount
  IF p_amount_eur <= 0 THEN
    RAISE EXCEPTION 'Allocation amount must be positive';
  END IF;

  INSERT INTO statements.payment_allocations (
    series_id, payment_transaction_id, charge_transaction_id,
    allocated_amount_eur, allocation_method, allocated_by, notes
  )
  VALUES (
    p_series_id, p_payment_transaction_id, p_charge_transaction_id,
    p_amount_eur, p_method, auth.uid(), p_notes
  )
  ON CONFLICT (payment_transaction_id, charge_transaction_id)
  DO UPDATE SET
    allocated_amount_eur = EXCLUDED.allocated_amount_eur,
    allocation_method = EXCLUDED.allocation_method,
    allocated_by = EXCLUDED.allocated_by,
    notes = EXCLUDED.notes,
    allocated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- 4.2 Open a correction case
CREATE OR REPLACE FUNCTION statements.open_correction_case(
  p_series_id             UUID,
  p_original_tx_id        UUID,
  p_correction_type       TEXT,
  p_description           TEXT,
  p_original_amount       NUMERIC DEFAULT NULL,
  p_corrected_amount      NUMERIC DEFAULT NULL,
  p_priority              TEXT DEFAULT 'normal',
  p_original_fields       JSONB DEFAULT NULL,
  p_corrected_fields      JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_case_id UUID;
BEGIN
  -- Staff gate
  PERFORM statements.require_jj_staff();

  INSERT INTO statements.correction_cases (
    series_id, original_transaction_id, correction_type,
    status, description, original_amount_eur, corrected_amount_eur,
    priority, original_field_values, corrected_field_values,
    opened_by
  )
  VALUES (
    p_series_id, p_original_tx_id, p_correction_type,
    'open', p_description, p_original_amount, p_corrected_amount,
    p_priority, p_original_fields, p_corrected_fields,
    auth.uid()
  )
  RETURNING id INTO v_case_id;

  -- Log the opening event
  INSERT INTO statements.correction_events (case_id, event_type, performed_by, notes)
  VALUES (v_case_id, 'opened', auth.uid(), p_description);

  RETURN v_case_id;
END;
$$;

-- 4.3 Transition correction case status
CREATE OR REPLACE FUNCTION statements.transition_correction_case(
  p_case_id               UUID,
  p_new_status            TEXT,
  p_notes                 TEXT DEFAULT NULL,
  p_applied_tx_id         UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_current_status TEXT;
  v_event_type TEXT;
BEGIN
  -- Staff gate
  PERFORM statements.require_jj_staff();

  -- Get current status
  SELECT status INTO v_current_status
  FROM statements.correction_cases WHERE id = p_case_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Correction case not found: %', p_case_id;
  END IF;

  -- Validate transition
  IF v_current_status IN ('applied', 'void') THEN
    RAISE EXCEPTION 'Cannot transition from terminal status: %', v_current_status;
  END IF;

  -- Map status to event type
  v_event_type := p_new_status;
  IF p_new_status = 'under_review' THEN v_event_type := 'under_review'; END IF;

  -- Update case
  UPDATE statements.correction_cases
  SET status = p_new_status,
      resolved_by = CASE WHEN p_new_status IN ('approved','rejected','applied','void')
                         THEN auth.uid() ELSE resolved_by END,
      resolved_at = CASE WHEN p_new_status IN ('approved','rejected','applied','void')
                         THEN now() ELSE resolved_at END,
      resolution_notes = COALESCE(p_notes, resolution_notes),
      applied_transaction_id = COALESCE(p_applied_tx_id, applied_transaction_id),
      applied_at = CASE WHEN p_new_status = 'applied' THEN now() ELSE applied_at END,
      updated_at = now()
  WHERE id = p_case_id;

  -- Log the event (append-only)
  INSERT INTO statements.correction_events (case_id, event_type, performed_by, notes)
  VALUES (p_case_id, v_event_type, auth.uid(), p_notes);
END;
$$;

-- 4.4 Get payment allocations for a series
CREATE OR REPLACE FUNCTION statements.get_payment_allocations(
  p_series_id UUID
)
RETURNS SETOF statements.payment_allocations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM statements.require_jj_staff();
  RETURN QUERY
    SELECT * FROM statements.payment_allocations
    WHERE series_id = p_series_id
    ORDER BY allocated_at;
END;
$$;

-- 4.5 Get correction cases for a series
CREATE OR REPLACE FUNCTION statements.get_correction_cases(
  p_series_id UUID
)
RETURNS SETOF statements.correction_cases
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM statements.require_jj_staff();
  RETURN QUERY
    SELECT * FROM statements.correction_cases
    WHERE series_id = p_series_id
    ORDER BY opened_at DESC;
END;
$$;

-- 4.6 Get correction events for a case
CREATE OR REPLACE FUNCTION statements.get_correction_events(
  p_case_id UUID
)
RETURNS SETOF statements.correction_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM statements.require_jj_staff();
  RETURN QUERY
    SELECT * FROM statements.correction_events
    WHERE case_id = p_case_id
    ORDER BY created_at;
END;
$$;


-- ── 5. Grants — service_role only ──────────────────────────────────────────

GRANT USAGE ON SCHEMA statements TO service_role;

GRANT SELECT, INSERT, UPDATE ON statements.payment_allocations TO service_role;
GRANT SELECT, INSERT ON statements.correction_cases TO service_role;
GRANT UPDATE (status, resolved_by, resolved_at, resolution_notes,
              applied_transaction_id, applied_at, updated_at)
  ON statements.correction_cases TO service_role;
GRANT SELECT, INSERT ON statements.correction_events TO service_role;

GRANT EXECUTE ON FUNCTION statements.allocate_payment TO service_role;
GRANT EXECUTE ON FUNCTION statements.open_correction_case TO service_role;
GRANT EXECUTE ON FUNCTION statements.transition_correction_case TO service_role;
GRANT EXECUTE ON FUNCTION statements.get_payment_allocations TO service_role;
GRANT EXECUTE ON FUNCTION statements.get_correction_cases TO service_role;
GRANT EXECUTE ON FUNCTION statements.get_correction_events TO service_role;


-- ── 6. Verification queries (run after migration) ──────────────────────────
-- SELECT count(*) FROM information_schema.tables WHERE table_schema = 'statements';
-- Expected: 9 (6 existing + 3 new)
--
-- SELECT tablename FROM pg_tables WHERE schemaname = 'statements' ORDER BY tablename;
-- Expected: correction_cases, correction_events, payment_allocations,
--           sent_entry_snapshots, sent_statement_snapshots, statement_draft_lines,
--           statement_drafts, statement_events, statement_series
--
-- SELECT count(*) FROM pg_policies WHERE schemaname = 'statements';
-- Expected: 9 (6 existing + 3 new)
--
-- SELECT proname FROM pg_proc WHERE pronamespace = 'statements'::regnamespace
--   AND proname LIKE '%correction%' OR proname LIKE '%payment%' ORDER BY proname;
-- Expected: allocate_payment, get_correction_cases, get_correction_events,
--           get_payment_allocations, open_correction_case, transition_correction_case,
--           trg_correction_events_immutable
