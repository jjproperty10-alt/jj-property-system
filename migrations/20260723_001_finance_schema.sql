-- ============================================================
-- Finance Schema Migration 001 — PR #1: First Decision Vertical Slice
-- ============================================================
-- Run in: Supabase SQL Editor
-- Project: vsiiprzjrstjcmjpwcrd
--
-- Creates:
--   Schema:  finance
--   Tables:  evidence_links, claim_templates, decision_log, position_score_deltas
--   Triggers: decision_log (append-only), position_score_deltas (append-only)
--   RLS:     deny-all on all tables (staff read/write via SECURITY DEFINER RPCs)
--   Seed:    ClaimTemplates for approve_withdrawal decision type
--
-- Constitutional rules enforced by this migration:
--   IL-1: decision_log append-only (trigger)
--   IL-4: position_score_deltas append-only (trigger)
--
-- Rollback: DROP SCHEMA finance CASCADE;
--
-- Safety checks:
--   - public.transactions: NOT TOUCHED (zero DDL on public schema)
--   - statements schema: NOT TOUCHED
--   - lifecycle schema: NOT TOUCHED
--   - No FK across schemas
-- ============================================================

BEGIN;

-- ── Pre-flight: capture transactions count before any DDL ────────────────────
-- Stored in a temporary table so the post-check can verify delta = 0.
-- We never hardcode a baseline — legitimate new transactions must not block migrations.
CREATE TEMP TABLE IF NOT EXISTS _finance_preflight (
  key  TEXT PRIMARY KEY,
  val  BIGINT
);

INSERT INTO _finance_preflight (key, val)
  SELECT 'tx_count_before', COUNT(*) FROM public.transactions
ON CONFLICT (key) DO UPDATE SET val = EXCLUDED.val;

RAISE NOTICE 'PRE-FLIGHT: transactions before migration = %',
  (SELECT val FROM _finance_preflight WHERE key = 'tx_count_before');

-- ── 1. Create finance schema ──────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS finance;

-- ── 2. evidence_links ─────────────────────────────────────────────────────────
-- Ground truth. Immutable after creation.
-- KG-1: Evidence is never inferred.
-- IL-1: validity_status is the only permitted mutation (active → expired, etc.)
CREATE TABLE IF NOT EXISTS finance.evidence_links (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id         TEXT        NOT NULL,   -- e.g. 'Jacob', 'Villa Mazotos'
  entity_type       TEXT        NOT NULL,   -- 'partner', 'property', 'company'
  period_start      DATE        ,           -- NULL = evidence covers all time
  period_end        DATE        ,
  source_type       TEXT        NOT NULL    CHECK (source_type IN ('bank', 'invoice', 'contract', 'whatsapp', 'manual')),
  strength          TEXT        NOT NULL    CHECK (strength IN ('primary', 'secondary', 'supporting', 'attestation')),
  source_ref        TEXT        ,           -- e.g. file path, URL, message ID
  description       TEXT        ,
  transaction_ref   UUID        ,           -- optional link to public.transactions.id
  verified_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_until       TIMESTAMPTZ ,
  validity_status   TEXT        NOT NULL DEFAULT 'active' CHECK (validity_status IN ('active', 'needs_renewal', 'expired')),
  confidence        NUMERIC(5,2)           CHECK (confidence >= 0 AND confidence <= 100),
  created_by        UUID        ,           -- auth.users.id
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 3. claim_templates ────────────────────────────────────────────────────────
-- Policy definitions. Stored. Editable by staff.
-- Keyed by (id, decision_type).
CREATE TABLE IF NOT EXISTS finance.claim_templates (
  id              TEXT        PRIMARY KEY,   -- e.g. 'cashbox_sufficient'
  decision_type   TEXT        NOT NULL,      -- e.g. 'approve_withdrawal'
  statement       TEXT        NOT NULL,      -- human-readable assertion
  required        BOOLEAN     NOT NULL DEFAULT TRUE,
  evaluation_fn   TEXT        NOT NULL,      -- function name in EVALUATION_DISPATCH
  evidence_types  TEXT[]      NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 4. decision_log ──────────────────────────────────────────────────────────
-- Append-only. IL-1: UPDATE/DELETE blocked by trigger.
-- Each row = one Executed decision.
-- ADR-005: Only logDecision() inserts here.
CREATE TABLE IF NOT EXISTS finance.decision_log (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_type            TEXT        NOT NULL,
  entity_type              TEXT        NOT NULL,
  entity_id                TEXT        NOT NULL,
  decided_by               UUID        NOT NULL,  -- jj_staff_config.id (UUID)
  confidence_at_decision   NUMERIC(5,2),
  evidence_chain           JSONB       NOT NULL,  -- SnapshotEvidenceChain
  override                 BOOLEAN     NOT NULL DEFAULT FALSE,
  override_reason          TEXT        ,
  override_approved_by     UUID        ,
  period_start             DATE        ,
  period_end               DATE        ,
  amount_eur               NUMERIC(12,2),
  notes                    TEXT        ,
  logged_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- IL-1 trigger: decision_log is append-only
CREATE OR REPLACE FUNCTION finance.trg_decision_log_immutable()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'decision_log is append-only: UPDATE not permitted (IL-1)';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'decision_log is append-only: DELETE not permitted (IL-1)';
  END IF;
  RETURN OLD;
END $$;

CREATE TRIGGER trg_decision_log_immutable
  BEFORE UPDATE OR DELETE ON finance.decision_log
  FOR EACH ROW EXECUTE FUNCTION finance.trg_decision_log_immutable();

-- ── 5. position_score_deltas ──────────────────────────────────────────────────
-- Append-only audit log of position score changes.
-- IL-4: UPDATE/DELETE blocked by trigger.
CREATE TABLE IF NOT EXISTS finance.position_score_deltas (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type       TEXT        NOT NULL,
  entity_id         TEXT        NOT NULL,
  from_score        NUMERIC(5,2),           -- NULL for first entry
  to_score          NUMERIC(5,2) NOT NULL,
  delta_coverage    NUMERIC(5,2),
  delta_consistency NUMERIC(5,2),
  delta_evidence    NUMERIC(5,2),
  trigger_event     TEXT        NOT NULL,   -- e.g. 'decision_logged:approve_withdrawal'
  triggered_by      UUID        NOT NULL,   -- staff.id
  occurred_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- IL-4 trigger: position_score_deltas is append-only
CREATE OR REPLACE FUNCTION finance.trg_score_deltas_immutable()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'position_score_deltas is append-only: UPDATE not permitted (IL-4)';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'position_score_deltas is append-only: DELETE not permitted (IL-4)';
  END IF;
  RETURN OLD;
END $$;

CREATE TRIGGER trg_score_deltas_immutable
  BEFORE UPDATE OR DELETE ON finance.position_score_deltas
  FOR EACH ROW EXECUTE FUNCTION finance.trg_score_deltas_immutable();

-- ── 6. Indexes ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_evidence_links_entity
  ON finance.evidence_links (entity_id, entity_type, validity_status);

CREATE INDEX IF NOT EXISTS idx_evidence_links_period
  ON finance.evidence_links (period_start, period_end);

CREATE INDEX IF NOT EXISTS idx_decision_log_entity
  ON finance.decision_log (entity_id, entity_type, logged_at);

CREATE INDEX IF NOT EXISTS idx_score_deltas_entity
  ON finance.position_score_deltas (entity_id, entity_type, occurred_at);

CREATE INDEX IF NOT EXISTS idx_claim_templates_decision
  ON finance.claim_templates (decision_type);

-- ── 7. RLS — deny-all on all finance tables ──────────────────────────────────
ALTER TABLE finance.evidence_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.claim_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.decision_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.position_score_deltas ENABLE ROW LEVEL SECURITY;

-- All access goes through SECURITY DEFINER functions (require_jj_staff enforced there)
-- No direct table access for any role
CREATE POLICY "deny_all_evidence_links"
  ON finance.evidence_links AS RESTRICTIVE
  FOR ALL TO public USING (false) WITH CHECK (false);

CREATE POLICY "deny_all_claim_templates"
  ON finance.claim_templates AS RESTRICTIVE
  FOR ALL TO public USING (false) WITH CHECK (false);

CREATE POLICY "deny_all_decision_log"
  ON finance.decision_log AS RESTRICTIVE
  FOR ALL TO public USING (false) WITH CHECK (false);

CREATE POLICY "deny_all_score_deltas"
  ON finance.position_score_deltas AS RESTRICTIVE
  FOR ALL TO public USING (false) WITH CHECK (false);

-- ── 8. Seed: ClaimTemplates for approve_withdrawal ───────────────────────────
-- Three claims for PR #1 demo.
-- Jacob / July 2026 expected outcome:
--   cashbox_sufficient         → SUPPORTED (balance +€56,479)
--   no_open_corrections        → SUPPORTED (no open cases)
--   bank_reconciliation        → UNSUPPORTED (no July 2026 bank import — expected demo state)
--
-- Stop Condition — no_duplicate_candidates:
--   Removed. Evaluation requires `review_status = 'duplicate_candidate'` counts from
--   public.transactions, which violates the RC3 data boundary (Finance never reads
--   public.transactions directly). Will be re-added in RC2 once RC3 exposes
--   v_partner_quality_flags. See FINANCE_DATA_BOUNDARY_ADR.md.
INSERT INTO finance.claim_templates (id, decision_type, statement, required, evaluation_fn, evidence_types)
VALUES
  (
    'cashbox_sufficient',
    'approve_withdrawal',
    'Partner cashbox balance is positive',
    TRUE,
    'evaluateCashboxSufficiency',
    ARRAY['bank']
  ),
  (
    'no_open_corrections',
    'approve_withdrawal',
    'No open correction cases affect this partner in this period',
    TRUE,
    'evaluateNoOpenCorrections',
    ARRAY['manual']
  ),
  (
    'bank_reconciliation',
    'approve_withdrawal',
    'Bank statement attached and reconciled for this partner and period',
    TRUE,
    'evaluateBankReconciliation',
    ARRAY['bank']
  )
ON CONFLICT (id) DO NOTHING;

-- ── 9. Post-migration verification ───────────────────────────────────────────
DO $$
DECLARE
  v_tx_before    BIGINT;
  v_tx_after     BIGINT;
  v_tables       INT;
  v_triggers     INT;
  v_templates    INT;
  v_rls_tables   INT;
BEGIN
  -- transactions: verify delta = 0 (no rows added or removed by this migration)
  SELECT val INTO v_tx_before FROM _finance_preflight WHERE key = 'tx_count_before';
  SELECT COUNT(*) INTO v_tx_after FROM public.transactions;
  IF v_tx_after <> v_tx_before THEN
    RAISE EXCEPTION 'POST-CHECK FAIL: transactions changed during migration (before=%, after=%) — rollback required',
      v_tx_before, v_tx_after;
  END IF;

  -- 4 finance tables
  SELECT COUNT(*) INTO v_tables
  FROM information_schema.tables
  WHERE table_schema = 'finance'
    AND table_name IN ('evidence_links', 'claim_templates', 'decision_log', 'position_score_deltas');
  IF v_tables <> 4 THEN
    RAISE EXCEPTION 'POST-CHECK FAIL: finance tables = %, expected 4', v_tables;
  END IF;

  -- 2 immutability triggers
  SELECT COUNT(*) INTO v_triggers
  FROM pg_trigger
  WHERE tgname IN ('trg_decision_log_immutable', 'trg_score_deltas_immutable');
  IF v_triggers <> 2 THEN
    RAISE EXCEPTION 'POST-CHECK FAIL: triggers = %, expected 2', v_triggers;
  END IF;

  -- 3 claim templates seeded (no_duplicate_candidates removed — Stop Condition)
  SELECT COUNT(*) INTO v_templates FROM finance.claim_templates;
  IF v_templates <> 3 THEN
    RAISE EXCEPTION 'POST-CHECK FAIL: claim_templates = %, expected 3', v_templates;
  END IF;

  -- 4 RLS-enabled tables
  SELECT COUNT(*) INTO v_rls_tables
  FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid
  WHERE n.nspname = 'finance' AND c.relrowsecurity = TRUE;
  IF v_rls_tables <> 4 THEN
    RAISE EXCEPTION 'POST-CHECK FAIL: RLS-enabled tables = %, expected 4', v_rls_tables;
  END IF;

  RAISE NOTICE 'POST-CHECK PASS: transactions=% (delta=0), tables=%, triggers=%, templates=%, rls=%',
    v_tx_after, v_tables, v_triggers, v_templates, v_rls_tables;
END $$;

COMMIT;

-- ── Expected output ──────────────────────────────────────────────────────────
-- PRE-FLIGHT:  transactions before migration = N  (N = current count, whatever it is)
-- POST-CHECK PASS: transactions=N (delta=0), tables=4, triggers=2, templates=3, rls=4
--
-- ── Rollback (if needed) ──────────────────────────────────────────────────────
-- DROP SCHEMA finance CASCADE;
