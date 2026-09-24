-- Staff may read employee_config. Only an active ceo or active superadmin may update it.
-- Evidence: jj_staff_config.staff_role = ceo (1 active) and user_roles.role = superadmin
-- (1 active) are the same auth user. No personal id is stored in this migration.
-- Drops only auth_all_employees and auth_write_employee_config, and only when
-- those two are the entire policy set. Does not write business rows.

BEGIN;

CREATE OR REPLACE FUNCTION finance.is_active_jj_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.jj_staff_config AS staff_row
      WHERE staff_row.user_id = (SELECT auth.uid())
        AND staff_row.is_active
        AND staff_row.staff_role = 'ceo'
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_roles AS role_row
      WHERE role_row.user_id = (SELECT auth.uid())
        AND role_row.is_active IS TRUE
        AND role_row.role = 'superadmin'
    );
$$;

REVOKE ALL ON FUNCTION finance.is_active_jj_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION finance.is_active_jj_admin() FROM anon;
GRANT EXECUTE ON FUNCTION finance.is_active_jj_admin() TO authenticated;

DO $employee_config$
DECLARE
  policy_names name[];
BEGIN
  SELECT coalesce(array_agg(policyname ORDER BY policyname), ARRAY[]::name[])
    INTO policy_names
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'employee_config';

  IF policy_names IS DISTINCT FROM ARRAY['auth_all_employees', 'auth_write_employee_config']::name[]
     OR EXISTS (
       SELECT 1
       FROM pg_policies
       WHERE schemaname = 'public'
         AND tablename = 'employee_config'
         AND (
           cmd <> 'ALL'
           OR roles IS DISTINCT FROM ARRAY['public']::name[]
           OR permissive IS DISTINCT FROM 'PERMISSIVE'
           OR qual IS DISTINCT FROM '(auth.role() = ''authenticated''::text)'
           OR with_check IS NOT NULL
         )
     )
  THEN
    RAISE EXCEPTION 'BLOCKED_BY_POLICY_DRIFT: employee_config policy set is not the reviewed pair';
  END IF;

  EXECUTE 'REVOKE ALL ON TABLE public.employee_config FROM PUBLIC';
  EXECUTE 'REVOKE ALL ON TABLE public.employee_config FROM anon';
  EXECUTE 'REVOKE ALL ON TABLE public.employee_config FROM authenticated';
  EXECUTE 'GRANT SELECT, UPDATE ON TABLE public.employee_config TO authenticated';
  EXECUTE 'REVOKE INSERT, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.employee_config FROM PUBLIC, anon, authenticated';
  EXECUTE 'ALTER TABLE public.employee_config ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY auth_all_employees ON public.employee_config';
  EXECUTE 'DROP POLICY auth_write_employee_config ON public.employee_config';
  EXECUTE $policy$
    CREATE POLICY staff_select_employee_config
      ON public.employee_config
      FOR SELECT
      TO authenticated
      USING (finance.is_active_jj_staff() OR finance.is_active_jj_admin())
  $policy$;
  EXECUTE $policy$
    CREATE POLICY staff_update_employee_config
      ON public.employee_config
      FOR UPDATE
      TO authenticated
      USING (finance.is_active_jj_admin())
      WITH CHECK (finance.is_active_jj_admin())
  $policy$;
END
$employee_config$;

DO $search_path$
DECLARE
  target text;
  expected_md5 text;
  fn regprocedure;
  live_md5 text;
BEGIN
  FOR target, expected_md5 IN
    SELECT signature, body_md5
    FROM (VALUES
      ('ops.invoke_pms_function(text, jsonb)', 'a1fafaf84da07f26dc9d03fe9f4cde98'),
      ('ops.normalize_pms()', '76caa884ab258aa906a49e22bc2a60d0'),
      ('ops.refresh_health()', '95965998ccd72a1def58e4d86878860a'),
      ('ops.watchdog_stuck_runs()', 'be7b77fa642d0e64dfdd0714c4a51232'),
      ('public.resolve_party_id(uuid, uuid)', 'd9d7c8bf8863649520cf26951ddf2643')
    ) AS reviewed(signature, body_md5)
  LOOP
    fn := to_regprocedure(target);
    IF fn IS NULL THEN
      RAISE EXCEPTION 'BLOCKED_BY_FUNCTION_DEFINITION_DRIFT: missing %', target;
    END IF;
    SELECT md5(p.prosrc)
      INTO live_md5
    FROM pg_proc p
    WHERE p.oid = fn
      AND p.prosecdef
      AND p.proowner = 'postgres'::regrole;
    IF live_md5 IS DISTINCT FROM expected_md5 THEN
      RAISE EXCEPTION 'BLOCKED_BY_FUNCTION_DEFINITION_DRIFT: % hash or owner changed', target;
    END IF;
    EXECUTE format('ALTER FUNCTION %s SET search_path = pg_catalog', fn);
    SELECT md5(p.prosrc) INTO live_md5 FROM pg_proc p WHERE p.oid = fn;
    IF live_md5 IS DISTINCT FROM expected_md5 THEN
      RAISE EXCEPTION 'BLOCKED_BY_FUNCTION_DEFINITION_DRIFT: % body changed', target;
    END IF;
  END LOOP;
END
$search_path$;

COMMIT;
