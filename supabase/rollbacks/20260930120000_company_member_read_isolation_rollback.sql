-- Drops only the seven company-member read policies.
-- Does not drop a company, membership, or the company column.

BEGIN;

DO $guard$
BEGIN
  IF (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260929200000') <> 1
     OR (SELECT count(*) FROM registry.companies) <> 1
     OR (SELECT count(*) FROM registry.companies WHERE canonical_name = 'Yossi Properties') <> 0
     OR (SELECT count(*) FROM access.company_memberships) <> 1 THEN
    RAISE EXCEPTION 'BLOCKED_BY_ROLLBACK';
  END IF;
END
$guard$;

DROP POLICY company_member_read ON public.properties;
DROP POLICY company_member_read ON public.property_definitions;
DROP POLICY company_member_read ON public.property_name_aliases;
DROP POLICY company_member_read ON public.property_owners;
DROP POLICY company_member_read ON public.property_ownership;
DROP POLICY company_member_read ON public.property_reporting_map;
DROP POLICY company_member_read ON finance.agent_transaction_drafts;

DO $post$
BEGIN
  IF EXISTS (
       SELECT 1
       FROM pg_policy AS policy
       WHERE policy.polname = 'company_member_read'
     )
     OR (SELECT count(*) FROM registry.companies WHERE canonical_name = 'Yossi Properties') <> 0 THEN
    RAISE EXCEPTION 'BLOCKED_BY_SCHEMA_DRIFT';
  END IF;
END
$post$;

COMMIT;
