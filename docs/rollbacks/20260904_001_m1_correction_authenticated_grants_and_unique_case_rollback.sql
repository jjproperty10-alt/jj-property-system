-- =====================================================================
-- ROLLBACK: 20260904_001_m1_correction_authenticated_grants_and_unique_case
-- Location: docs/rollbacks/ (NOT under supabase/migrations/)
--
-- Manual / intentional only. Supabase must never auto-apply this file.
-- Forward migration:
--   supabase/migrations/20260904_001_m1_correction_authenticated_grants_and_unique_case.sql
--
-- Removes ONLY:
--   - authenticated EXECUTE on the three correction mutation RPCs
--   - the unique partial index statements.uq_correction_cases_one_nonterminal_per_tx
--
-- Does NOT:
--   - delete correction_cases / correction_events / applied lineage rows
--   - revoke service_role EXECUTE (re-affirmed below)
--   - alter public.transactions privileges
--   - drop or replace RPC function bodies
--   - REVOKE USAGE ON SCHEMA statements FROM authenticated
--     (USAGE may pre-exist outside this package; cannot prove exclusive
--      introduction in a live environment — leave USAGE intact)
--
-- WARNING: After rollback, session-authenticated M1 Apply will fail closed
-- again until EXECUTE is re-granted. service_role callers remain able to
-- EXECUTE if their grant is intact.
-- =====================================================================

DROP INDEX IF EXISTS statements.uq_correction_cases_one_nonterminal_per_tx;

REVOKE EXECUTE ON FUNCTION statements.open_correction_case(uuid, uuid, text, text, numeric, numeric, text, jsonb, jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION statements.transition_correction_case(uuid, text, text, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION statements.apply_correction_case(uuid, jsonb) FROM authenticated;

-- Keep service_role grants (re-affirm)
GRANT EXECUTE ON FUNCTION statements.open_correction_case(uuid, uuid, text, text, numeric, numeric, text, jsonb, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION statements.transition_correction_case(uuid, text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION statements.apply_correction_case(uuid, jsonb) TO service_role;

-- Verify (manual):
-- SELECT has_function_privilege('authenticated',
--   'statements.apply_correction_case(uuid,jsonb)', 'EXECUTE');  -- expect false
-- SELECT has_function_privilege('service_role',
--   'statements.apply_correction_case(uuid,jsonb)', 'EXECUTE');  -- expect true
-- SELECT indexname FROM pg_indexes
--  WHERE schemaname='statements' AND indexname='uq_correction_cases_one_nonterminal_per_tx';
--   -- expect 0 rows
-- SELECT count(*) FROM statements.correction_cases;  -- data preserved
