-- Read isolation for tables that already carry operating_company_id.
-- An authenticated read passes only when the caller is an active member
-- of that row's company. A caller-supplied company UUID is not accepted.
-- This migration does not create a company, user, or membership.
-- Tables without a company column, including public.transactions, stay unchanged.
-- service_role bypasses row security. This migration does not grant it a read path.

BEGIN;

DO $guard$
BEGIN
  IF (SELECT count(*) FROM supabase_migrations.schema_migrations) <> 191
     OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260929200000') <> 1
     OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260930120000') <> 0
     OR (
       SELECT count(*) FROM (
         SELECT version FROM supabase_migrations.schema_migrations GROUP BY version HAVING count(*) > 1
       ) AS duplicated
     ) <> 0
     OR (SELECT count(*) FROM registry.companies) <> 1
     OR (SELECT count(*) FROM registry.companies WHERE canonical_name = 'Yossi Properties') <> 0
     OR (SELECT count(*) FROM access.company_memberships) <> 1
     OR (SELECT count(*) FROM public.jj_staff_config WHERE is_active) <> 1 THEN
    RAISE EXCEPTION 'BLOCKED_BY_HISTORY';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policy AS policy
    JOIN pg_class AS relation ON relation.oid = policy.polrelid
    WHERE policy.polname = 'company_member_read'
  ) THEN
    RAISE EXCEPTION 'BLOCKED_BY_REAPPLY';
  END IF;
END
$guard$;

CREATE POLICY company_member_read
  ON public.properties
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (access.is_company_member(operating_company_id))
  WITH CHECK (access.is_company_member(operating_company_id));

CREATE POLICY company_member_read
  ON public.property_definitions
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (access.is_company_member(operating_company_id))
  WITH CHECK (access.is_company_member(operating_company_id));

CREATE POLICY company_member_read
  ON public.property_name_aliases
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (access.is_company_member(operating_company_id))
  WITH CHECK (access.is_company_member(operating_company_id));

CREATE POLICY company_member_read
  ON public.property_owners
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (access.is_company_member(operating_company_id))
  WITH CHECK (access.is_company_member(operating_company_id));

CREATE POLICY company_member_read
  ON public.property_ownership
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (access.is_company_member(operating_company_id))
  WITH CHECK (access.is_company_member(operating_company_id));

CREATE POLICY company_member_read
  ON public.property_reporting_map
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (access.is_company_member(operating_company_id));

CREATE POLICY company_member_read
  ON finance.agent_transaction_drafts
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (access.is_company_member(operating_company_id));

DO $post$
BEGIN
  IF (
       SELECT count(*)
       FROM pg_policy AS policy
       JOIN pg_class AS relation ON relation.oid = policy.polrelid
       JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
       WHERE policy.polname = 'company_member_read'
         AND NOT policy.polpermissive
         AND pg_get_expr(policy.polqual, policy.polrelid) = 'access.is_company_member(operating_company_id)'
         AND (namespace.nspname, relation.relname) IN (
           ('public', 'properties'),
           ('public', 'property_definitions'),
           ('public', 'property_name_aliases'),
           ('public', 'property_owners'),
           ('public', 'property_ownership'),
           ('public', 'property_reporting_map'),
           ('finance', 'agent_transaction_drafts')
         )
     ) <> 7
     OR (SELECT count(*) FROM registry.companies) <> 1
     OR (SELECT count(*) FROM registry.companies WHERE canonical_name = 'Yossi Properties') <> 0
     OR (SELECT count(*) FROM access.company_memberships) <> 1
     OR EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'transactions'
         AND column_name = 'operating_company_id'
     ) THEN
    RAISE EXCEPTION 'BLOCKED_BY_SCHEMA_DRIFT';
  END IF;
END
$post$;

COMMIT;
