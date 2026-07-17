-- =============================================================================
-- m9_d_verification_tasks
-- Created: 2026-07-13
-- Author: M9-D Architecture Review (Yossi + Claude)
--
-- Purpose: Verification task queue for M9-D Source Date Verification workflow.
--   Turns "missing data" into a managed work queue with priorities and search guidance.
--
-- Architecture decisions (Yossi, 13 July 2026):
--   1. lifecycle.verification_tasks — not a separate schema.
--      Tasks are born from lifecycle facts; they don't exist independently.
--   2. No trigger — generate_verification_tasks() is called on demand.
--      Triggers deferred to M10 once the model is stable.
--   3. reason — WHY the task exists (missing_date ≠ conflicting_sources).
--      Two tasks with identical missing_field may require completely different resolution paths.
--   4. proposed_value_json JSONB — flexible payload.
--      Today: {"date":"2023-08-15"}. Tomorrow: {"amount":50000,"currency":"EUR"}.
--      Next year: {"date":"...","confidence":"estimated"}. TEXT would break all three.
--   5. search_strategy JSONB — not just WHERE to look, but HOW to look.
--      Array of {order, source, match} gives JHKA a complete search plan, not just a source list.
--
-- Key architectural separation:
--   pending_verification  = DATA STATE  (field on ownership_period / capital_event)
--   verification_task     = WORK STATE  (row in this table)
--   These are two separate layers. One NULL can generate one task. They evolve independently.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS lifecycle.generate_verification_tasks();
--   DROP TABLE IF EXISTS lifecycle.verification_tasks;
-- =============================================================================


-- =============================================================================
-- TABLE: lifecycle.verification_tasks
-- =============================================================================

CREATE TABLE lifecycle.verification_tasks (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- ── What is missing ─────────────────────────────────────────────────────────
  source_table          TEXT        NOT NULL
                        CHECK (source_table IN (
                          'ownership_period',
                          'capital_event',
                          'partner_entry',
                          'property_acquisition'
                        )),
  source_id             UUID        NOT NULL,
  -- Soft reference only. No FK — P-ARCH-5: lifecycle schema has zero FK to any table.
  -- If the source row is voided, the task remains as historical record.

  missing_field         TEXT        NOT NULL,
  -- Examples: 'effective_from', 'effective_date', 'capital_payment', 'document_reference'

  -- ── Why this task exists ─────────────────────────────────────────────────────
  reason                TEXT        NOT NULL
                        CHECK (reason IN (
                          'missing_date',             -- date field is NULL, no source document
                          'missing_amount',            -- amount is NULL or unverified
                          'conflicting_sources',       -- two source docs give different values
                          'legacy_correction',         -- historical record may be wrong per new evidence
                          'manual_review',             -- flagged; no automated resolution possible
                          'unknown_partner_payment'    -- partner entry exists but zero capital events
                        )),

  -- ── How to resolve it ───────────────────────────────────────────────────────
  expected_source_type  TEXT        NOT NULL,
  -- Examples: 'partnership_agreement' | 'bank_transfer' | 'notary_deed' | 'wire_confirmation'

  search_strategy       JSONB,
  -- JHKA search plan: not just WHERE, but HOW to look at each source.
  -- Schema: [{order: int, source: text, match: text | null}]
  -- order:  search priority (1 = first)
  -- source: financial_documents | email | whatsapp | google_drive | manual_upload
  -- match:  search terms for this specific case (null = browse entire source)
  --
  -- Example for Avi's entry date:
  -- [
  --   {"order":1, "source":"financial_documents", "match":"partnership agreement Villa Mazotos"},
  --   {"order":2, "source":"email",               "match":"Avi Villa Mazotos"},
  --   {"order":3, "source":"whatsapp",            "match":"Avi partnership"},
  --   {"order":4, "source":"google_drive",        "match":"Villa Mazotos agreement"},
  --   {"order":5, "source":"manual_upload",       "match":null}
  -- ]

  -- ── Work management ──────────────────────────────────────────────────────────
  priority              TEXT        NOT NULL DEFAULT 'medium'
                        CHECK (priority IN ('high', 'medium', 'low')),
  -- high:   blocks Timeline or capital balance calculation (entry dates, capital unknowns)
  -- medium: date of specific payment — Timeline partially works without it
  -- low:    ancillary fields — document ref, notary number, does not block any calculation

  status                TEXT        NOT NULL DEFAULT 'pending'
                        CHECK (status IN (
                          'pending',              -- task open, no evidence yet
                          'evidence_found',       -- JHKA found a candidate; awaiting Yossi confirmation
                          'confirmed',            -- Yossi confirmed; source record updated
                          'no_source_available'   -- verified: no source document exists
                        )),

  -- ── Evidence found (status = 'evidence_found') ──────────────────────────────
  evidence_source       TEXT,
  -- Where the evidence was found (e.g. 'financial_documents', 'email', 'whatsapp')

  evidence_description  TEXT,
  -- Human-readable description of what was found
  -- Example: "Partnership agreement signed 2023-08-15, found in Financial Documents Center"

  proposed_value_json   JSONB,
  -- Flexible payload. NEVER applied to source table until confirmed_by is set.
  -- Examples:
  --   {"date": "2023-08-15"}
  --   {"amount": 50000, "currency": "EUR"}
  --   {"date": "2023-08-15", "confidence": "estimated"}
  --   {"partner": "Avi", "amount": 50000, "currency": "EUR", "payee": "Yossi"}

  -- ── Approval (status = 'confirmed') ─────────────────────────────────────────
  confirmed_by          TEXT,
  confirmed_at          TIMESTAMPTZ,
  notes                 TEXT,

  -- ── Timestamps ──────────────────────────────────────────────────────────────
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Prevent duplicate tasks for the same source record + field + reason
  UNIQUE (source_id, missing_field, reason)
);


-- Comments
COMMENT ON TABLE lifecycle.verification_tasks IS
  'Work queue for missing or uncertain lifecycle facts. '
  'Each row = one business fact that needs verification from a source document. '
  'Architecture: pending_verification = data state; verification_task = work state. '
  'Generated by generate_verification_tasks() on demand, not by triggers (M9 phase). '
  'Triggers deferred to M10 when model is stable.';

COMMENT ON COLUMN lifecycle.verification_tasks.reason IS
  'WHY this task exists — not just what is missing. '
  'missing_date: date field is NULL, no source document available yet. '
  'missing_amount: capital payment amount unknown. '
  'conflicting_sources: two documents give different values for the same field. '
  'legacy_correction: historical record may be incorrect per newer evidence. '
  'manual_review: flagged for human review; no automated resolution path. '
  'unknown_partner_payment: partner entry exists but zero capital_event rows recorded.';

COMMENT ON COLUMN lifecycle.verification_tasks.search_strategy IS
  'JHKA search plan. Array of {order, source, match}. '
  'order: priority (1 = search first). '
  'source: financial_documents | email | whatsapp | google_drive | manual_upload. '
  'match: search terms for this specific case (null = browse entire source). '
  'JHKA uses this to know HOW to search, not just where — making it an active search agent, '
  'not just a routing table.';

COMMENT ON COLUMN lifecycle.verification_tasks.proposed_value_json IS
  'Flexible JSONB payload for the candidate resolved value surfaced by JHKA. '
  'NOT written to the source table until confirmed_by is populated. '
  'Schema varies by task type: '
  '  date task:   {"date": "YYYY-MM-DD"} '
  '  amount task: {"amount": N, "currency": "EUR"} '
  '  complex:     {"date": "...", "confidence": "estimated"} '
  'Using JSONB (not TEXT) allows structured proposals without schema changes.';


-- Indexes
CREATE INDEX idx_vtasks_status    ON lifecycle.verification_tasks (status);
CREATE INDEX idx_vtasks_priority  ON lifecycle.verification_tasks (priority);
CREATE INDEX idx_vtasks_source    ON lifecycle.verification_tasks (source_table, source_id);


-- RLS: deny-all (consistent with all lifecycle tables)
ALTER TABLE lifecycle.verification_tasks ENABLE ROW LEVEL SECURITY;
-- Zero policies = service_role only. anon/authenticated denied by default.


-- =============================================================================
-- FUNCTION: lifecycle.generate_verification_tasks()
--
-- On-demand scanner: reads all lifecycle tables, creates verification_tasks
-- for every missing or uncertain business fact.
--
-- Idempotent — safe to run after any import, correction, or data entry session.
-- ON CONFLICT (source_id, missing_field, reason) DO NOTHING ensures no duplicates.
--
-- Covers three patterns:
--   1. ownership_period.effective_from = NULL + pending_verification
--   2. capital_event.effective_date = NULL + pending_verification
--   3. partner_entry with zero capital_event rows (Oren pattern)
--
-- Usage:
--   SELECT * FROM lifecycle.generate_verification_tasks();
--
-- Returns:
--   tasks_created INT  — new tasks inserted
--   tasks_skipped INT  — tasks already existed (idempotency)
--   detail        TEXT — human-readable summary
-- =============================================================================

CREATE OR REPLACE FUNCTION lifecycle.generate_verification_tasks()
RETURNS TABLE (
  tasks_created  INT,
  tasks_skipped  INT,
  detail         TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_created INT := 0;
  v_skipped INT := 0;
  r RECORD;
BEGIN

  -- ── 1. ownership_period: effective_from = NULL ──────────────────────────────
  -- Priority: HIGH — Investment Timeline cannot place the ownership start event.

  FOR r IN
    SELECT
      op.id          AS op_id,
      op.property_name,
      ei.canonical_name AS partner_name
    FROM lifecycle.ownership_period op
    JOIN lifecycle.partner_entry pe
      ON pe.property_name = op.property_name
     AND pe.entity_id     = op.entity_id
    JOIN lifecycle.entity_identity ei ON ei.id = pe.entity_id
    WHERE op.effective_from IS NULL
      AND op.effective_from_confidence = 'pending_verification'
      AND op.status != 'void'
  LOOP
    INSERT INTO lifecycle.verification_tasks (
      source_table, source_id, missing_field, reason,
      expected_source_type, search_strategy, priority
    ) VALUES (
      'ownership_period',
      r.op_id,
      'effective_from',
      'missing_date',
      'partnership_agreement',
      jsonb_build_array(
        jsonb_build_object('order', 1, 'source', 'financial_documents',
          'match', 'partnership agreement ' || r.property_name),
        jsonb_build_object('order', 2, 'source', 'email',
          'match', r.partner_name || ' ' || r.property_name),
        jsonb_build_object('order', 3, 'source', 'whatsapp',
          'match', r.partner_name || ' partnership'),
        jsonb_build_object('order', 4, 'source', 'google_drive',
          'match', r.property_name || ' agreement'),
        jsonb_build_object('order', 5, 'source', 'manual_upload', 'match', NULL)
      ),
      'high'
    )
    ON CONFLICT (source_id, missing_field, reason) DO NOTHING;

    IF FOUND THEN v_created := v_created + 1;
    ELSE          v_skipped := v_skipped + 1;
    END IF;
  END LOOP;


  -- ── 2. capital_event: effective_date = NULL ─────────────────────────────────
  -- Priority: MEDIUM — Timeline partially works; capital balance still computable.

  FOR r IN
    SELECT
      ce.id          AS ce_id,
      ce.property_name,
      ce.amount_eur,
      ce.event_subtype,
      ei.canonical_name AS payer_name
    FROM lifecycle.capital_event ce
    JOIN lifecycle.entity_identity ei ON ei.id = ce.entity_id
    WHERE ce.effective_date IS NULL
      AND ce.effective_date_confidence = 'pending_verification'
      AND ce.status != 'void'
  LOOP
    INSERT INTO lifecycle.verification_tasks (
      source_table, source_id, missing_field, reason,
      expected_source_type, search_strategy, priority
    ) VALUES (
      'capital_event',
      r.ce_id,
      'effective_date',
      'missing_date',
      'bank_transfer',
      jsonb_build_array(
        jsonb_build_object('order', 1, 'source', 'financial_documents',
          'match', 'bank transfer ' || r.payer_name || ' ' || r.property_name),
        jsonb_build_object('order', 2, 'source', 'email',
          'match', r.payer_name || ' transfer ' || r.amount_eur::TEXT),
        jsonb_build_object('order', 3, 'source', 'whatsapp',
          'match', r.payer_name || ' ' || r.amount_eur::TEXT),
        jsonb_build_object('order', 4, 'source', 'manual_upload', 'match', NULL)
      ),
      'medium'
    )
    ON CONFLICT (source_id, missing_field, reason) DO NOTHING;

    IF FOUND THEN v_created := v_created + 1;
    ELSE          v_skipped := v_skipped + 1;
    END IF;
  END LOOP;


  -- ── 3. partner_entry with ZERO capital events (Oren pattern) ───────────────
  -- Priority: HIGH — capital_paid = NULL, capital_remaining = NULL in partner view.

  FOR r IN
    SELECT
      pe.id          AS pe_id,
      pe.property_name,
      ei.canonical_name AS partner_name
    FROM lifecycle.partner_entry pe
    JOIN lifecycle.entity_identity ei ON ei.id = pe.entity_id
    WHERE pe.status != 'void'
      AND NOT EXISTS (
        SELECT 1
        FROM lifecycle.capital_event ce
        WHERE ce.entity_id    = pe.entity_id
          AND ce.property_name = pe.property_name
          AND ce.event_subtype = 'partner_entry_payment'
          AND ce.status       != 'void'
      )
  LOOP
    INSERT INTO lifecycle.verification_tasks (
      source_table, source_id, missing_field, reason,
      expected_source_type, search_strategy, priority
    ) VALUES (
      'partner_entry',
      r.pe_id,
      'capital_payment',
      'unknown_partner_payment',
      'bank_transfer',
      jsonb_build_array(
        jsonb_build_object('order', 1, 'source', 'financial_documents',
          'match', 'bank transfer ' || r.partner_name || ' ' || r.property_name),
        jsonb_build_object('order', 2, 'source', 'email',
          'match', r.partner_name || ' payment ' || r.property_name),
        jsonb_build_object('order', 3, 'source', 'whatsapp',
          'match', r.partner_name || ' paid'),
        jsonb_build_object('order', 4, 'source', 'manual_upload', 'match', NULL)
      ),
      'high'
    )
    ON CONFLICT (source_id, missing_field, reason) DO NOTHING;

    IF FOUND THEN v_created := v_created + 1;
    ELSE          v_skipped := v_skipped + 1;
    END IF;
  END LOOP;


  -- Return summary
  RETURN QUERY SELECT
    v_created,
    v_skipped,
    'Scan complete. Tasks created: ' || v_created
      || '. Tasks already existed (skipped): ' || v_skipped || '.' AS detail;

END;
$$;

COMMENT ON FUNCTION lifecycle.generate_verification_tasks() IS
  'On-demand scanner: creates verification_tasks for all pending lifecycle facts. '
  'Idempotent — safe to run after any import, correction, or data entry session. '
  'Covers: (1) ownership_period.effective_from = NULL, '
  '(2) capital_event.effective_date = NULL, '
  '(3) partner_entry with no capital_event rows (Oren pattern). '
  'Trigger deferred to M10 when model is stable. '
  'Usage: SELECT * FROM lifecycle.generate_verification_tasks();';
