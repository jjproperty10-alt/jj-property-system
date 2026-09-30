-- Drops only the service-role read resolver.
-- Does not drop a company, membership, permit, or read policy.

BEGIN;

DO $guard$
BEGIN
  IF (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260930120000') <> 1
     OR (SELECT count(*) FROM registry.companies) <> 1
     OR (SELECT count(*) FROM registry.companies WHERE canonical_name = 'Yossi Properties') <> 0
     OR (SELECT count(*) FROM access.company_memberships) <> 1 THEN
    RAISE EXCEPTION 'BLOCKED_BY_ROLLBACK';
  END IF;
END
$guard$;

DROP FUNCTION public.resolve_service_read_company(uuid);
DROP FUNCTION access.resolve_service_read_company(uuid);

DO $post$
BEGIN
  IF to_regprocedure('public.resolve_service_read_company(uuid)') IS NOT NULL
     OR to_regprocedure('access.resolve_service_read_company(uuid)') IS NOT NULL
     OR (SELECT count(*) FROM registry.companies WHERE canonical_name = 'Yossi Properties') <> 0 THEN
    RAISE EXCEPTION 'BLOCKED_BY_SCHEMA_DRIFT';
  END IF;
END
$post$;

COMMIT;
