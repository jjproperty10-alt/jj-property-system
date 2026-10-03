-- DRAFT. Do not apply, merge, or deploy until this file is approved on its own.
-- Timestamp 20261003150600 does not collide with any migration already in supabase/migrations.
--
-- public.property_name_aliases is one of the 44 anon-granted tables. The attested
-- policies are auth_all_property_name_aliases (PERMISSIVE, ALL, authenticated role)
-- and company_member_read (RESTRICTIVE, ALL, access.is_company_member). A
-- signed-in user who is an active company member and is not staff passes both,
-- so that user can read and write the alias row through PostgREST.
--
-- This draft replaces only the permissive policy. company_member_read stays.
-- Afterward a row is visible only when the caller is active staff or an active
-- admin AND a member of that row's company. No company is assigned from a name.
-- No column is added. service_role grants are not changed. service_role still
-- bypasses RLS.
--
-- Rollback drops the staff policy and recreates auth_all_property_name_aliases.
-- It does not drop company_member_read.

BEGIN;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'property_name_aliases'
      AND policyname = 'auth_all_property_name_aliases'
      AND permissive = 'PERMISSIVE'
      AND cmd = 'ALL'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'property_name_aliases'
      AND policyname = 'company_member_read'
      AND permissive = 'RESTRICTIVE'
  ) THEN
    RAISE EXCEPTION 'BLOCKED_BY_POLICY_DRIFT: property_name_aliases is not the attested permissive-plus-company pair';
  END IF;
END
$guard$;

DROP POLICY auth_all_property_name_aliases ON public.property_name_aliases;

CREATE POLICY staff_all_property_name_aliases
  ON public.property_name_aliases
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (finance.is_active_jj_staff() OR finance.is_active_jj_admin())
  WITH CHECK (finance.is_active_jj_staff() OR finance.is_active_jj_admin());

COMMIT;

-- ROLLBACK-BEGIN
-- BEGIN;
-- DROP POLICY IF EXISTS staff_all_property_name_aliases ON public.property_name_aliases;
-- CREATE POLICY auth_all_property_name_aliases
--   ON public.property_name_aliases
--   AS PERMISSIVE
--   FOR ALL
--   TO public
--   USING (auth.role() = 'authenticated');
-- COMMIT;
-- ROLLBACK-END
