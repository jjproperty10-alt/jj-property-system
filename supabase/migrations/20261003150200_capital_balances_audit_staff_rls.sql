-- DRAFT. Do not apply, merge, or deploy until this file is approved on its own.
-- Timestamp 20261003150200 does not collide with any migration already in supabase/migrations.
--
-- Live catalog (03.10.2026):
--   public.contact_opening_balances
--     auth_write_opening_balances PERMISSIVE TO authenticated FOR ALL USING true WITH CHECK true
--   public.partnership_capital
--     "Authenticated read on partnership_capital" TO authenticated SELECT USING true
--     "Authenticated write on partnership_capital" TO authenticated ALL USING true CHECK true
--     "Service role full access on partnership_capital" TO service_role ALL true/true
--   public.case_audit_log
--     audit_log_insert TO authenticated INSERT CHECK true
--     audit_log_select TO authenticated SELECT USING true
--
-- App writes of partnership_capital and contact link rows go through the anon-key
-- browser client, not only service_role, so this draft does not switch writes to
-- service_role-only. Authenticated writes become admin-only
-- (finance.is_active_jj_admin()). Reads become staff or admin
-- (finance.is_active_jj_staff() OR finance.is_active_jj_admin()).
-- The service_role partnership_capital policy is left in place. service_role grants
-- are not revoked. No rows are updated.
--
-- case_audit_log INSERT requires finance.is_active_jj_staff().
-- If a uuid column named actor, actor_id, created_by, or user_id exists, WITH CHECK
-- also requires that column to equal auth.uid(). The repo has no CREATE TABLE for
-- case_audit_log, so the column is detected at apply time and is not added here.
-- audit_log_select is unchanged (still USING true for authenticated).

BEGIN;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'contact_opening_balances'
      AND policyname = 'auth_write_opening_balances'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'partnership_capital'
      AND policyname = 'Authenticated read on partnership_capital'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'partnership_capital'
      AND policyname = 'Authenticated write on partnership_capital'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'partnership_capital'
      AND policyname = 'Service role full access on partnership_capital'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'case_audit_log'
      AND policyname = 'audit_log_insert'
  ) THEN
    RAISE EXCEPTION 'BLOCKED_BY_POLICY_DRIFT: opening balance, capital, or audit policy set changed';
  END IF;
END
$guard$;

DROP POLICY auth_write_opening_balances ON public.contact_opening_balances;

CREATE POLICY staff_select_contact_opening_balances
  ON public.contact_opening_balances
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (finance.is_active_jj_staff() OR finance.is_active_jj_admin());

CREATE POLICY admin_write_contact_opening_balances
  ON public.contact_opening_balances
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (finance.is_active_jj_admin())
  WITH CHECK (finance.is_active_jj_admin());

DROP POLICY "Authenticated read on partnership_capital" ON public.partnership_capital;
DROP POLICY "Authenticated write on partnership_capital" ON public.partnership_capital;

CREATE POLICY staff_select_partnership_capital
  ON public.partnership_capital
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (finance.is_active_jj_staff() OR finance.is_active_jj_admin());

CREATE POLICY admin_write_partnership_capital
  ON public.partnership_capital
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (finance.is_active_jj_admin())
  WITH CHECK (finance.is_active_jj_admin());

DO $case_audit$
DECLARE
  actor_column text;
  check_expr text;
BEGIN
  SELECT column_name
    INTO actor_column
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'case_audit_log'
    AND udt_name = 'uuid'
    AND column_name IN ('actor', 'actor_id', 'created_by', 'user_id')
  ORDER BY CASE column_name
    WHEN 'actor' THEN 1
    WHEN 'actor_id' THEN 2
    WHEN 'created_by' THEN 3
    WHEN 'user_id' THEN 4
    ELSE 5
  END
  LIMIT 1;

  EXECUTE 'DROP POLICY audit_log_insert ON public.case_audit_log';

  IF actor_column IS NULL THEN
    RAISE NOTICE 'case_audit_log has no uuid column named actor, actor_id, created_by, or user_id; INSERT check is staff-only';
    check_expr := 'finance.is_active_jj_staff()';
  ELSE
    check_expr := format(
      'finance.is_active_jj_staff() AND (%I = (SELECT auth.uid()))',
      actor_column
    );
  END IF;

  EXECUTE format(
    'CREATE POLICY staff_insert_case_audit_log ON public.case_audit_log AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (%s)',
    check_expr
  );
END
$case_audit$;

COMMIT;

-- ROLLBACK-BEGIN
-- BEGIN;
-- DROP POLICY IF EXISTS staff_select_contact_opening_balances ON public.contact_opening_balances;
-- DROP POLICY IF EXISTS admin_write_contact_opening_balances ON public.contact_opening_balances;
-- CREATE POLICY auth_write_opening_balances
--   ON public.contact_opening_balances
--   AS PERMISSIVE
--   FOR ALL
--   TO authenticated
--   USING (true)
--   WITH CHECK (true);
-- DROP POLICY IF EXISTS staff_select_partnership_capital ON public.partnership_capital;
-- DROP POLICY IF EXISTS admin_write_partnership_capital ON public.partnership_capital;
-- CREATE POLICY "Authenticated read on partnership_capital"
--   ON public.partnership_capital
--   AS PERMISSIVE
--   FOR SELECT
--   TO authenticated
--   USING (true);
-- CREATE POLICY "Authenticated write on partnership_capital"
--   ON public.partnership_capital
--   AS PERMISSIVE
--   FOR ALL
--   TO authenticated
--   USING (true)
--   WITH CHECK (true);
-- DROP POLICY IF EXISTS staff_insert_case_audit_log ON public.case_audit_log;
-- CREATE POLICY audit_log_insert
--   ON public.case_audit_log
--   AS PERMISSIVE
--   FOR INSERT
--   TO authenticated
--   WITH CHECK (true);
-- COMMIT;
-- ROLLBACK-END
