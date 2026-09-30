-- Service-role reads of company-scoped tables resolve one verified company.
-- A caller UUID is not authority. With one active company, omission returns
-- that company. With more than one, omission and an unarmed UUID fail closed.
-- A transaction permit may satisfy an explicit company. It does not satisfy omission.
-- This migration does not create a company, user, or membership.
-- It does not change transactions, reports, settlements, Hostaway, or a switcher.

BEGIN;

DO $guard$
BEGIN
  IF (SELECT count(*) FROM supabase_migrations.schema_migrations) <> 192
     OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260930120000') <> 1
     OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260930200000') <> 0
     OR (
       SELECT count(*) FROM (
         SELECT version FROM supabase_migrations.schema_migrations GROUP BY version HAVING count(*) > 1
       ) AS duplicated
     ) <> 0
     OR (SELECT count(*) FROM registry.companies) <> 1
     OR (SELECT count(*) FROM registry.companies WHERE canonical_name = 'Yossi Properties') <> 0
     OR (SELECT count(*) FROM access.company_memberships) <> 1 THEN
    RAISE EXCEPTION 'BLOCKED_BY_HISTORY';
  END IF;

  IF to_regprocedure('access.resolve_service_read_company(uuid)') IS NOT NULL
     OR to_regprocedure('public.resolve_service_read_company(uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'BLOCKED_BY_REAPPLY';
  END IF;
END
$guard$;

CREATE FUNCTION access.resolve_service_read_company(p_requested uuid)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $read$
DECLARE
  actor uuid;
  session_role text;
  active_count integer;
  sole_company uuid;
  internal_company uuid;
BEGIN
  LOCK TABLE registry.companies IN SHARE ROW EXCLUSIVE MODE;

  actor := auth.uid();
  session_role := auth.role();

  IF session_role IS DISTINCT FROM 'service_role' OR actor IS NOT NULL THEN
    RAISE EXCEPTION 'BLOCKED_BY_COMPANY_CONTEXT';
  END IF;

  SELECT count(*)
    INTO active_count
  FROM registry.companies
  WHERE status = 'active';

  IF active_count = 1 THEN
    SELECT company_id
      INTO sole_company
    FROM registry.companies
    WHERE status = 'active';
  END IF;

  SELECT permit.company_id
    INTO internal_company
  FROM access.internal_company_write_permit AS permit
  WHERE permit.txid = pg_catalog.txid_current();

  IF p_requested IS NULL THEN
    IF active_count IS DISTINCT FROM 1 OR sole_company IS NULL THEN
      RAISE EXCEPTION 'BLOCKED_BY_COMPANY_CONTEXT';
    END IF;
    RETURN sole_company;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM registry.companies
    WHERE company_id = p_requested
      AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'BLOCKED_BY_COMPANY_CONTEXT';
  END IF;

  IF internal_company IS NOT NULL
     AND p_requested IS NOT DISTINCT FROM internal_company THEN
    RETURN p_requested;
  END IF;

  IF active_count = 1 AND p_requested IS NOT DISTINCT FROM sole_company THEN
    RETURN p_requested;
  END IF;

  RAISE EXCEPTION 'BLOCKED_BY_COMPANY_CONTEXT';
END
$read$;

REVOKE ALL ON FUNCTION access.resolve_service_read_company(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION access.resolve_service_read_company(uuid) FROM anon, authenticated, service_role;

CREATE FUNCTION public.resolve_service_read_company(p_requested uuid)
RETURNS uuid
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT access.resolve_service_read_company(p_requested);
$$;

REVOKE ALL ON FUNCTION public.resolve_service_read_company(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_service_read_company(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_service_read_company(uuid) TO service_role;

DO $post$
BEGIN
  IF has_function_privilege('service_role', 'public.resolve_service_read_company(uuid)', 'EXECUTE') IS NOT TRUE
     OR has_function_privilege('authenticated', 'public.resolve_service_read_company(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.resolve_service_read_company(uuid)', 'EXECUTE')
     OR has_function_privilege('service_role', 'access.resolve_service_read_company(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'access.resolve_service_read_company(uuid)', 'EXECUTE')
     OR EXISTS (
       SELECT 1
       FROM pg_proc AS proc
       JOIN pg_namespace AS namespace ON namespace.oid = proc.pronamespace
       WHERE namespace.nspname = 'access'
         AND proc.proname = 'resolve_service_read_company'
         AND position('set_config' in proc.prosrc) > 0
     )
     OR (SELECT count(*) FROM registry.companies) <> 1
     OR (SELECT count(*) FROM registry.companies WHERE canonical_name = 'Yossi Properties') <> 0
     OR (SELECT count(*) FROM access.company_memberships) <> 1 THEN
    RAISE EXCEPTION 'BLOCKED_BY_SCHEMA_DRIFT';
  END IF;
END
$post$;

COMMIT;
