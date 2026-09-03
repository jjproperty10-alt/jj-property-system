-- =====================================================================
-- M1-DB Enablement — authenticated EXECUTE on correction RPCs
--                   + race-safe unique non-terminal case index
--
-- PURPOSE
--   Allow the existing M1 controlled-correction Apply path to call
--   statements.open/transition/apply_correction_case with a session JWT
--   (authenticated role) so public.require_jj_staff(ARRAY['ceo','finance_admin'])
--   sees auth.uid() = the signed-in mutator.
--
-- WHAT THIS MIGRATION DOES
--   1. GRANT USAGE ON SCHEMA statements TO authenticated (lookup only).
--   2. GRANT EXECUTE on the three correction mutation RPCs TO authenticated
--      using exact function signatures. service_role EXECUTE is re-affirmed.
--   3. Explicitly REVOKE EXECUTE from PUBLIC and anon on those RPCs.
--   4. Create a unique partial index so at most one non-terminal correction
--      case (open|under_review|approved) may exist per original_transaction_id.
--      Preflight fails clearly if conflicting rows already exist.
--
-- WHAT THIS MIGRATION DOES NOT DO
--   - No GRANT of INSERT/UPDATE/DELETE on public.transactions
--   - No GRANT of table mutation privileges on statements.correction_* to
--     authenticated (deny-all RLS + SECURITY DEFINER RPCs remain the path)
--   - No change to RPC bodies, SECURITY DEFINER, or require_jj_staff roles
--   - No Production apply in this workstream — prepare only
--
-- AUTHORIZATION CHAIN (unchanged; this only opens the EXECUTE door)
--   session JWT (authenticated)
--     → statements.* SECURITY DEFINER RPC
--     → public.require_jj_staff(ARRAY['ceo','finance_admin'])
--     → auth.uid() must match active jj_staff_config with allowed role
--     → fail closed when auth.uid() is NULL or role is not allowed
--
-- NOTE: statements.require_jj_staff() does NOT exist. The guard is
--       public.require_jj_staff(p_allowed_roles text[]).
--
-- ROLLBACK (manual only — NOT a deployable migration):
--   docs/rollbacks/20260904_001_m1_correction_authenticated_grants_and_unique_case_rollback.sql
--
-- IMPLEMENT-ONLY: review + Yossi approval before applying to any environment.
-- =====================================================================

-- ── 1. Schema lookup for authenticated (required to resolve statements.* RPCs)
-- Idempotent GRANT. Rollback intentionally does NOT revoke USAGE (cannot prove
-- exclusive introduction in every live environment).
GRANT USAGE ON SCHEMA statements TO authenticated;

-- ── 2. Exact-signature EXECUTE grants (minimum mutation surface)
-- open_correction_case(
--   p_series_id uuid, p_original_tx_id uuid, p_correction_type text, p_description text,
--   p_original_amount numeric, p_corrected_amount numeric, p_priority text,
--   p_original_fields jsonb, p_corrected_fields jsonb
-- ) RETURNS uuid
REVOKE EXECUTE ON FUNCTION statements.open_correction_case(uuid, uuid, text, text, numeric, numeric, text, jsonb, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION statements.open_correction_case(uuid, uuid, text, text, numeric, numeric, text, jsonb, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION statements.open_correction_case(uuid, uuid, text, text, numeric, numeric, text, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION statements.open_correction_case(uuid, uuid, text, text, numeric, numeric, text, jsonb, jsonb) TO service_role;

-- transition_correction_case(
--   p_case_id uuid, p_new_status text, p_notes text, p_applied_tx_id uuid
-- ) RETURNS void
REVOKE EXECUTE ON FUNCTION statements.transition_correction_case(uuid, text, text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION statements.transition_correction_case(uuid, text, text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION statements.transition_correction_case(uuid, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION statements.transition_correction_case(uuid, text, text, uuid) TO service_role;

-- apply_correction_case(p_case_id uuid, p_rows jsonb) RETURNS jsonb
REVOKE EXECUTE ON FUNCTION statements.apply_correction_case(uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION statements.apply_correction_case(uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION statements.apply_correction_case(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION statements.apply_correction_case(uuid, jsonb) TO service_role;

-- ── 3. Race-safe unique partial index (one non-terminal case per original tx)
-- Preflight: fail clearly if existing data would violate the index.
DO $preflight$
DECLARE
  v_conflict_count integer;
  v_sample text;
BEGIN
  SELECT count(*) INTO v_conflict_count
  FROM (
    SELECT original_transaction_id
    FROM statements.correction_cases
    WHERE status IN ('open', 'under_review', 'approved')
      AND original_transaction_id IS NOT NULL
    GROUP BY original_transaction_id
    HAVING count(*) > 1
  ) conflicts;

  IF v_conflict_count > 0 THEN
    SELECT string_agg(original_transaction_id::text, ', ')
      INTO v_sample
    FROM (
      SELECT original_transaction_id
      FROM statements.correction_cases
      WHERE status IN ('open', 'under_review', 'approved')
        AND original_transaction_id IS NOT NULL
      GROUP BY original_transaction_id
      HAVING count(*) > 1
      LIMIT 5
    ) s;

    RAISE EXCEPTION
      '[m1-db] Cannot create statements.uq_correction_cases_one_nonterminal_per_tx: '
      '% original_transaction_id value(s) already have multiple non-terminal '
      'correction cases (open|under_review|approved). Resolve duplicates before '
      'applying this migration. Sample tx ids: %',
      v_conflict_count, coalesce(v_sample, '(none)');
  END IF;
END
$preflight$;

-- Partial unique index: NULL original_transaction_id rows are excluded (safe).
-- Status values match correction_cases CHECK: open|under_review|approved|rejected|applied|void
-- Non-terminal for this constraint: open|under_review|approved only.
CREATE UNIQUE INDEX IF NOT EXISTS uq_correction_cases_one_nonterminal_per_tx
  ON statements.correction_cases (original_transaction_id)
  WHERE status IN ('open', 'under_review', 'approved')
    AND original_transaction_id IS NOT NULL;

COMMENT ON INDEX statements.uq_correction_cases_one_nonterminal_per_tx IS
  'M1-DB: at most one non-terminal correction case per original transaction. '
  'Terminal statuses applied|rejected|void do not block a later legitimate case. '
  'Rows with NULL original_transaction_id are excluded from this index.';

-- ── 4. Verification notes (manual / staging — do not run against Production here)
-- SELECT has_function_privilege('authenticated',
--   'statements.open_correction_case(uuid,uuid,text,text,numeric,numeric,text,jsonb,jsonb)', 'EXECUTE');
-- SELECT has_function_privilege('anon',
--   'statements.open_correction_case(uuid,uuid,text,text,numeric,numeric,text,jsonb,jsonb)', 'EXECUTE');
-- SELECT indexname FROM pg_indexes
--  WHERE schemaname='statements' AND indexname='uq_correction_cases_one_nonterminal_per_tx';
-- Confirm NO new grants:
-- SELECT grantee, privilege_type FROM information_schema.role_table_grants
--  WHERE table_schema='public' AND table_name='transactions'
--    AND privilege_type IN ('UPDATE','DELETE') AND grantee='authenticated';
