-- DRAFT. Do not apply, merge, or deploy until this file is approved on its own.
-- Timestamp 20261003150100 does not collide with any migration already in supabase/migrations.
--
-- Live catalog (03.10.2026):
--   public.contacts policy auth_all_contacts: PERMISSIVE, TO public, FOR ALL,
--     USING (auth.role() = 'authenticated'). No WITH CHECK.
--   public.contact_properties policy auth_all_contact_properties: same shape.
--   NEITHER TABLE HAS A COMPANY COLUMN. This draft does not add one and does not
--   backfill any row. A data change is not approved.
--
-- Company isolation still needs two later, separately approved steps:
--   1. a real company column (company_id / operating_company_id) on each table
--   2. an evidence-based backfill of that column
-- The company-isolation rule is: never assign a company from a name. A contact
-- name, a property_name string, or a join through property_name_aliases is not
-- evidence that the row belongs to a company.
--
-- Default installed below: staff-only policies. finance.is_active_jj_staff() is
-- the repo helper (SECURITY DEFINER, active jj_staff_config row). service_role
-- keeps its grants and bypasses RLS, so server reads and writes are unchanged.
--
-- OPTION, NOT INSTALLED. A property-name join is not a clean company restriction.
-- contact_properties.property_name and contacts.property_name are names. Matching
-- them to property_name_aliases.operating_company_id still assigns a company from
-- a name, and a contact linked to two properties can see two companies. A contact
-- with no property link cannot be scoped at all. Do not enable the policy below
-- without a company column and an approved backfill.
--
-- -- CREATE POLICY contact_properties_company_member
-- --   ON public.contact_properties
-- --   AS RESTRICTIVE
-- --   FOR SELECT
-- --   TO authenticated
-- --   USING (
-- --     EXISTS (
-- --       SELECT 1
-- --       FROM public.property_name_aliases AS alias
-- --       WHERE alias.operating_company_id IS NOT NULL
-- --         AND access.is_company_member(alias.operating_company_id)
-- --         AND (
-- --           alias.canonical_name = contact_properties.property_name
-- --           OR alias.raw_name = contact_properties.property_name
-- --         )
-- --     )
-- --   );

BEGIN;

DO $guard$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('contacts', 'contact_properties')
      AND column_name IN ('company', 'company_id', 'operating_company_id')
  ) THEN
    RAISE EXCEPTION 'BLOCKED_BY_SCHEMA_DRIFT: a company column exists; this draft must not retarget or backfill it';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        (tablename = 'contacts' AND policyname = 'auth_all_contacts')
        OR (tablename = 'contact_properties' AND policyname = 'auth_all_contact_properties')
      )
  ) <> 2 THEN
    RAISE EXCEPTION 'BLOCKED_BY_POLICY_DRIFT: auth_all_contacts / auth_all_contact_properties missing';
  END IF;
END
$guard$;

DROP POLICY auth_all_contacts ON public.contacts;
DROP POLICY auth_all_contact_properties ON public.contact_properties;

CREATE POLICY staff_all_contacts
  ON public.contacts
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (finance.is_active_jj_staff())
  WITH CHECK (finance.is_active_jj_staff());

CREATE POLICY staff_all_contact_properties
  ON public.contact_properties
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (finance.is_active_jj_staff())
  WITH CHECK (finance.is_active_jj_staff());

COMMIT;

-- ROLLBACK-BEGIN
-- BEGIN;
-- DROP POLICY IF EXISTS staff_all_contacts ON public.contacts;
-- DROP POLICY IF EXISTS staff_all_contact_properties ON public.contact_properties;
-- CREATE POLICY auth_all_contacts
--   ON public.contacts
--   AS PERMISSIVE
--   FOR ALL
--   TO public
--   USING (auth.role() = 'authenticated');
-- CREATE POLICY auth_all_contact_properties
--   ON public.contact_properties
--   AS PERMISSIVE
--   FOR ALL
--   TO public
--   USING (auth.role() = 'authenticated');
-- COMMIT;
-- ROLLBACK-END
