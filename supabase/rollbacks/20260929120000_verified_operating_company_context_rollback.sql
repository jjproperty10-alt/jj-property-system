-- Restores the sole-company resolvers from 20260926180000 and 20260927160000.
-- Does not change rows and does not restore the UUID guard from 20260927260000.

BEGIN;

DO $guard$
BEGIN
  IF (SELECT count(*) FROM supabase_migrations.schema_migrations) <> 190
     OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260929120000') <> 1
     OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260928190000') <> 1
     OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260927260000') <> 1
     OR (SELECT count(*) FROM registry.companies) <> 1
     OR (SELECT count(*) FROM access.company_memberships) <> 1
     OR (SELECT count(*) FROM registry.parties) <> 24
     OR (SELECT count(*) FROM finance.agent_transaction_drafts) <> 2
     OR (SELECT count(*) FROM public.v_certified_ledger_transactions) <> 2254
     OR (SELECT count(*) FROM pms.property_mappings) <> 8
     OR (
       SELECT count(*)
       FROM pg_proc AS proc
       JOIN pg_namespace AS namespace ON namespace.oid = proc.pronamespace
       WHERE namespace.nspname = 'access'
         AND proc.proname = 'resolve_verified_operating_company'
         AND proc.proacl::text = '{postgres=X/postgres}'
         AND position('access.is_company_member' in proc.prosrc) > 0
         AND position('set_config' in proc.prosrc) = 0
     ) <> 1
     OR (
       SELECT count(*)
       FROM pg_proc AS proc
       JOIN pg_namespace AS namespace ON namespace.oid = proc.pronamespace
       WHERE namespace.nspname = 'registry'
         AND proc.proname = 'resolve_child_operating_company'
         AND position('access.resolve_verified_operating_company' in proc.prosrc) > 0
         AND proc.proacl::text = '{postgres=X/postgres}'
     ) <> 1
     OR (
       SELECT count(*)
       FROM pg_proc AS proc
       JOIN pg_namespace AS namespace ON namespace.oid = proc.pronamespace
       WHERE namespace.nspname = 'finance'
         AND proc.proname = 'enforce_agent_transaction_draft_company'
         AND position('access.resolve_verified_operating_company' in proc.prosrc) > 0
         AND position('BLOCKED_BY_COMPANY_REASSIGNMENT' in proc.prosrc) > 0
         AND proc.proacl::text = '{postgres=X/postgres}'
     ) <> 1
     OR (
       SELECT md5(proc.prosrc)
       FROM pg_proc AS proc
       JOIN pg_namespace AS namespace ON namespace.oid = proc.pronamespace
       WHERE namespace.nspname = 'registry'
         AND proc.proname = 'enforce_child_operating_company'
     ) IS DISTINCT FROM '4a2829f87bad19d9eac70716cb37688e'
     OR (
       SELECT md5(proc.prosrc)
       FROM pg_proc AS proc
       JOIN pg_namespace AS namespace ON namespace.oid = proc.pronamespace
       WHERE namespace.nspname = 'registry'
         AND proc.proname = 'forbid_uuid_change'
     ) IS DISTINCT FROM 'fe964c798154886e8dacc8edebef908a'
     OR (
       SELECT count(*)
       FROM pg_trigger AS trigger_row
       JOIN pg_proc AS proc ON proc.oid = trigger_row.tgfoid
       JOIN pg_namespace AS namespace ON namespace.oid = proc.pronamespace
       WHERE NOT trigger_row.tgisinternal
         AND namespace.nspname = 'registry'
         AND proc.proname = 'enforce_child_operating_company'
         AND trigger_row.tgenabled = 'O'
     ) <> 9
     OR (
       SELECT count(*)
       FROM pg_trigger AS trigger_row
       JOIN pg_proc AS proc ON proc.oid = trigger_row.tgfoid
       WHERE NOT trigger_row.tgisinternal
         AND proc.proname = 'enforce_agent_transaction_draft_company'
         AND trigger_row.tgenabled = 'O'
     ) <> 1
     OR (
       SELECT md5(
         relation.relrowsecurity::text || '|' || relation.relforcerowsecurity::text || '|' ||
         coalesce(relation.relacl::text, '') || '|' ||
         coalesce((
           SELECT string_agg(
             policy.polname || ':' || policy.polcmd::text || ':' ||
             coalesce(pg_get_expr(policy.polqual, policy.polrelid), '') || ':' ||
             coalesce(pg_get_expr(policy.polwithcheck, policy.polrelid), '') || ':' ||
             coalesce(policy.polroles::text, ''),
             ',' ORDER BY policy.polname
           ) FROM pg_policy AS policy WHERE policy.polrelid = relation.oid
         ), '')
       )
       FROM pg_class AS relation
       JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
       WHERE namespace.nspname = 'finance' AND relation.relname = 'agent_transaction_drafts'
     ) IS DISTINCT FROM '68b7d11d856c6c9065984bdbeb85daad'
     OR (
       SELECT md5(string_agg(
         namespace.nspname || '.' || relation.relname || '|' ||
         relation.relrowsecurity::text || '|' || relation.relforcerowsecurity::text || '|' ||
         coalesce(relation.relacl::text, '') || '|' ||
         coalesce((
           SELECT string_agg(
             policy.polname || ':' || policy.polcmd::text || ':' ||
             coalesce(pg_get_expr(policy.polqual, policy.polrelid), '') || ':' ||
             coalesce(pg_get_expr(policy.polwithcheck, policy.polrelid), '') || ':' ||
             coalesce(policy.polroles::text, ''),
             ',' ORDER BY policy.polname
           ) FROM pg_policy AS policy WHERE policy.polrelid = relation.oid
         ), ''),
         E'\n' ORDER BY namespace.nspname, relation.relname
       ))
       FROM pg_class AS relation
       JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
       WHERE (namespace.nspname, relation.relname) IN (
         ('public', 'property_owners'),
         ('public', 'property_ownership'),
         ('public', 'ownership'),
         ('public', 'property_name_aliases'),
         ('public', 'property_reporting_map'),
         ('lifecycle', 'property_acquisition'),
         ('lifecycle', 'service_engagements'),
         ('lifecycle', 'management_fee_configs'),
         ('pms', 'property_mappings')
       )
     ) IS DISTINCT FROM '10311e91f916ade2a6a2b8c8748ff1c7' THEN
    RAISE EXCEPTION 'BLOCKED_BY_ROLLBACK';
  END IF;
END
$guard$;

-- Production stored this body with CR LF. The file stays LF; the restore
-- converts newlines so md5(prosrc) returns to eacbfd7957ced1264a3b9c3339c37b01.
DO $restore_resolve$
DECLARE
  src text := $resolve_lf$
DECLARE
  active_count integer;
  sole_company uuid;
BEGIN
  IF p_require_parent THEN
    IF p_parent IS NULL
       OR NOT EXISTS (
         SELECT 1
         FROM registry.companies
         WHERE company_id = p_parent
           AND status = 'active'
       ) THEN
      RAISE EXCEPTION 'BLOCKED_BY_PARENT_COMPANY';
    END IF;
    IF p_supplied IS NOT NULL AND p_supplied IS DISTINCT FROM p_parent THEN
      RAISE EXCEPTION 'BLOCKED_BY_PARENT_COMPANY';
    END IF;
    RETURN p_parent;
  END IF;

  SELECT count(*)
    INTO active_count
  FROM registry.companies
  WHERE status = 'active';
  IF active_count <> 1 THEN
    RAISE EXCEPTION 'BLOCKED_BY_COMPANY_CONTEXT';
  END IF;
  SELECT company_id
    INTO sole_company
  FROM registry.companies
  WHERE status = 'active';
  IF p_supplied IS NOT NULL AND p_supplied IS DISTINCT FROM sole_company THEN
    RAISE EXCEPTION 'BLOCKED_BY_COMPANY_CONTEXT';
  END IF;
  RETURN sole_company;
END
$resolve_lf$;
BEGIN
  src := replace(src, E'\n', E'\r\n');
  EXECUTE
    'CREATE OR REPLACE FUNCTION registry.resolve_child_operating_company('
    || 'p_supplied uuid, p_parent uuid, p_require_parent boolean) '
    || 'RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER '
    || 'SET search_path = pg_catalog AS $resolve$'
    || src
    || '$resolve$';
END
$restore_resolve$;

REVOKE ALL ON FUNCTION registry.resolve_child_operating_company(uuid, uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION registry.resolve_child_operating_company(uuid, uuid, boolean) FROM anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION finance.enforce_agent_transaction_draft_company()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $enforce$
DECLARE
  active_count integer;
  sole_company uuid;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.operating_company_id IS DISTINCT FROM OLD.operating_company_id THEN
      RAISE EXCEPTION 'BLOCKED_BY_COMPANY_REASSIGNMENT';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'BLOCKED_BY_SCHEMA_DRIFT';
  END IF;

  SELECT count(*)
    INTO active_count
  FROM registry.companies
  WHERE status = 'active';

  IF active_count <> 1 THEN
    RAISE EXCEPTION 'BLOCKED_BY_COMPANY_CONTEXT';
  END IF;

  SELECT company_id
    INTO sole_company
  FROM registry.companies
  WHERE status = 'active';

  IF NEW.operating_company_id IS NOT NULL
     AND NEW.operating_company_id IS DISTINCT FROM sole_company THEN
    RAISE EXCEPTION 'BLOCKED_BY_COMPANY_CONTEXT';
  END IF;

  NEW.operating_company_id := sole_company;
  RETURN NEW;
END
$enforce$;

REVOKE ALL ON FUNCTION finance.enforce_agent_transaction_draft_company() FROM PUBLIC;
REVOKE ALL ON FUNCTION finance.enforce_agent_transaction_draft_company() FROM anon, authenticated, service_role;

DROP FUNCTION access.resolve_verified_operating_company(uuid, boolean);

DO $post$
BEGIN
  IF to_regprocedure('access.resolve_verified_operating_company(uuid,boolean)') IS NOT NULL
     OR (
       SELECT md5(proc.prosrc)
       FROM pg_proc AS proc
       JOIN pg_namespace AS namespace ON namespace.oid = proc.pronamespace
       WHERE namespace.nspname = 'registry'
         AND proc.proname = 'resolve_child_operating_company'
     ) IS DISTINCT FROM 'eacbfd7957ced1264a3b9c3339c37b01'
     OR (
       SELECT md5(proc.prosrc)
       FROM pg_proc AS proc
       JOIN pg_namespace AS namespace ON namespace.oid = proc.pronamespace
       WHERE namespace.nspname = 'finance'
         AND proc.proname = 'enforce_agent_transaction_draft_company'
     ) IS DISTINCT FROM 'dfcbb8a5bf1cd56e62b2cb9870870eb5'
     OR (
       SELECT md5(proc.prosrc)
       FROM pg_proc AS proc
       JOIN pg_namespace AS namespace ON namespace.oid = proc.pronamespace
       WHERE namespace.nspname = 'registry'
         AND proc.proname = 'forbid_uuid_change'
     ) IS DISTINCT FROM 'fe964c798154886e8dacc8edebef908a'
     OR (
       SELECT md5(proc.prosrc)
       FROM pg_proc AS proc
       JOIN pg_namespace AS namespace ON namespace.oid = proc.pronamespace
       WHERE namespace.nspname = 'registry'
         AND proc.proname = 'enforce_child_operating_company'
     ) IS DISTINCT FROM '4a2829f87bad19d9eac70716cb37688e'
     OR (SELECT count(*) FROM registry.companies) <> 1
     OR (SELECT count(*) FROM access.company_memberships) <> 1
     OR (SELECT count(*) FROM public.v_certified_ledger_transactions) <> 2254 THEN
    RAISE EXCEPTION 'BLOCKED_BY_SCHEMA_DRIFT';
  END IF;
END
$post$;

COMMIT;
