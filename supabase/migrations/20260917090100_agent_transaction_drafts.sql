-- ============================================================
-- Phase 0D — finance.agent_transaction_drafts (Draft-only capture)
-- LOCAL IMPLEMENTATION ONLY. Do not Apply to Production from this branch
-- without a separate Yossi authorization.
--
-- Phase 0D statuses: draft | needs_review | ready_for_approval | rejected
-- No posted status. No trigger/function that writes public.transactions.
-- Exact Yossi/Anastasia UUID mapping is NOT seeded (BLOCKED — do not guess).
-- Authorization: active jj_staff_config via finance.is_active_jj_staff().
-- ============================================================

BEGIN;

CREATE SCHEMA IF NOT EXISTS finance;

-- Boolean RLS helper. Live staff authority is public.require_jj_staff
-- (Phase 0C g2_functions: SECURITY DEFINER, jj_staff_config.user_id = auth.uid(),
-- is_active). require_jj_staff RAISES rather than returning false, so it is not
-- usable in RLS USING/WITH CHECK. This function is the same lookup as a boolean,
-- does not read finance.agent_transaction_drafts (no RLS recursion), and does
-- not replace or alter public.require_jj_staff.
CREATE OR REPLACE FUNCTION finance.is_active_jj_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.jj_staff_config s
    WHERE s.user_id = auth.uid()
      AND s.is_active = true
  );
$$;

REVOKE ALL ON FUNCTION finance.is_active_jj_staff() FROM PUBLIC;
REVOKE ALL ON FUNCTION finance.is_active_jj_staff() FROM anon;
GRANT EXECUTE ON FUNCTION finance.is_active_jj_staff() TO authenticated;

CREATE TABLE IF NOT EXISTS finance.agent_transaction_drafts (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by              UUID NOT NULL,
  status                  TEXT NOT NULL
                          CHECK (status IN ('draft', 'needs_review', 'ready_for_approval', 'rejected')),
  date                    DATE NOT NULL,
  property_id             UUID NULL,
  property_name_input     TEXT NOT NULL DEFAULT '',
  category                TEXT NOT NULL,
  subcategory             TEXT NOT NULL,
  payer_input             TEXT NULL,
  payee_input             TEXT NULL,
  amount_eur              NUMERIC(12,2) NULL,
  client_charge           NUMERIC(12,2) NULL,
  description             TEXT NULL,
  notes                   TEXT NULL,
  source_type             TEXT NOT NULL DEFAULT 'manual_form',
  confidence              TEXT NULL,
  input_locale            TEXT NULL,
  schema_version          INTEGER NOT NULL DEFAULT 1,
  idempotency_key         TEXT NOT NULL UNIQUE,
  approved_by             UUID NULL,
  approved_at             TIMESTAMPTZ NULL,
  posted_transaction_id   UUID NULL,
  CONSTRAINT agent_drafts_posted_forbidden CHECK (posted_transaction_id IS NULL),
  CONSTRAINT agent_drafts_property_null_needs_review CHECK (
    property_id IS NOT NULL OR status = 'needs_review'
  )
);

COMMENT ON TABLE finance.agent_transaction_drafts IS
  'Phase 0D draft-only capture. Never posts to public.transactions. Unknown amounts stay NULL.';

CREATE INDEX IF NOT EXISTS idx_agent_tx_drafts_created_by
  ON finance.agent_transaction_drafts (created_by, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_tx_drafts_status
  ON finance.agent_transaction_drafts (status);

CREATE OR REPLACE FUNCTION finance.trg_agent_tx_drafts_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'agent_transaction_drafts forbids physical DELETE'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.created_by IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'agent_transaction_drafts.created_by must equal auth.uid()'
        USING ERRCODE = 'restrict_violation';
    END IF;
    NEW.posted_transaction_id := NULL;
    NEW.approved_by := NULL;
    NEW.approved_at := NULL;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
    THEN
      RAISE EXCEPTION 'agent_transaction_drafts identity columns are immutable'
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW.posted_transaction_id IS NOT NULL THEN
      RAISE EXCEPTION 'Phase 0D forbids posting drafts to public.transactions'
        USING ERRCODE = 'restrict_violation';
    END IF;
    NEW.updated_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agent_tx_drafts_guard ON finance.agent_transaction_drafts;
CREATE TRIGGER trg_agent_tx_drafts_guard
  BEFORE INSERT OR UPDATE OR DELETE ON finance.agent_transaction_drafts
  FOR EACH ROW EXECUTE FUNCTION finance.trg_agent_tx_drafts_guard();

ALTER TABLE finance.agent_transaction_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.agent_transaction_drafts FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_tx_drafts_staff_select ON finance.agent_transaction_drafts;
CREATE POLICY agent_tx_drafts_staff_select
  ON finance.agent_transaction_drafts
  FOR SELECT
  TO authenticated
  USING (finance.is_active_jj_staff());

DROP POLICY IF EXISTS agent_tx_drafts_staff_insert ON finance.agent_transaction_drafts;
CREATE POLICY agent_tx_drafts_staff_insert
  ON finance.agent_transaction_drafts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    finance.is_active_jj_staff()
    AND created_by = auth.uid()
    AND posted_transaction_id IS NULL
  );

DROP POLICY IF EXISTS agent_tx_drafts_staff_update ON finance.agent_transaction_drafts;
CREATE POLICY agent_tx_drafts_staff_update
  ON finance.agent_transaction_drafts
  FOR UPDATE
  TO authenticated
  USING (finance.is_active_jj_staff())
  WITH CHECK (
    finance.is_active_jj_staff()
    AND posted_transaction_id IS NULL
  );

REVOKE ALL ON TABLE finance.agent_transaction_drafts FROM PUBLIC;
REVOKE ALL ON TABLE finance.agent_transaction_drafts FROM anon;
GRANT USAGE ON SCHEMA finance TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE finance.agent_transaction_drafts TO authenticated;
-- service_role bypasses RLS; do not use it to insert drafts from the app write path.

COMMIT;
