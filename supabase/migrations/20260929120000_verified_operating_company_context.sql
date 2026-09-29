-- Verified operating-company context.
-- A requested company UUID is accepted only for the session user in auth.uid().
-- There is no trusted GUC and no client-supplied actor.
-- While exactly one company is active, an omitted company still resolves to it.
-- service_role does not make a supplied UUID trusted.
-- Parent rows still supply the company. A user write must belong to that company.
-- This migration does not insert a company, user, membership, or business row.

BEGIN;

DO $guard$
DECLARE
  helper_proc oid;
BEGIN
  LOCK TABLE registry.companies IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE access.company_memberships IN SHARE ROW EXCLUSIVE MODE;

  IF (SELECT count(*) FROM supabase_migrations.schema_migrations) <> 189
     OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260927260000') <> 1
     OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260928190000') <> 1
     OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260929120000') <> 0
     OR (
       SELECT count(*) FROM (
         SELECT version FROM supabase_migrations.schema_migrations GROUP BY version HAVING count(*) > 1
       ) AS duplicated
     ) <> 0 THEN
    RAISE EXCEPTION 'BLOCKED_BY_HISTORY';
  END IF;

  SELECT proc.oid INTO helper_proc
  FROM pg_proc AS proc
  JOIN pg_namespace AS namespace ON namespace.oid = proc.pronamespace
  WHERE namespace.nspname = 'access'
    AND proc.proname = 'resolve_verified_operating_company';
  IF helper_proc IS NOT NULL THEN
    RAISE EXCEPTION 'BLOCKED_BY_REAPPLY';
  END IF;

  IF (
       SELECT count(*)
       FROM pg_proc AS proc
       JOIN pg_namespace AS namespace ON namespace.oid = proc.pronamespace
       JOIN pg_roles AS owner_role ON owner_role.oid = proc.proowner
       WHERE namespace.nspname = 'registry'
         AND proc.proname = 'resolve_child_operating_company'
         AND owner_role.rolname = 'postgres'
         AND proc.prosecdef
         AND proc.provolatile = 'v'
         AND proc.proconfig @> ARRAY['search_path=pg_catalog']
         AND proc.proacl::text = '{postgres=X/postgres}'
         AND md5(proc.prosrc) = 'eacbfd7957ced1264a3b9c3339c37b01'
         AND md5(pg_get_functiondef(proc.oid)) = '236f0756e7d1041f6e8bd54b525ec38b'
     ) <> 1
     OR (
       SELECT count(*)
       FROM pg_proc AS proc
       JOIN pg_namespace AS namespace ON namespace.oid = proc.pronamespace
       JOIN pg_roles AS owner_role ON owner_role.oid = proc.proowner
       WHERE namespace.nspname = 'finance'
         AND proc.proname = 'enforce_agent_transaction_draft_company'
         AND owner_role.rolname = 'postgres'
         AND proc.prosecdef
         AND proc.provolatile = 'v'
         AND proc.proconfig @> ARRAY['search_path=pg_catalog']
         AND proc.proacl::text = '{postgres=X/postgres}'
         AND md5(proc.prosrc) = 'dfcbb8a5bf1cd56e62b2cb9870870eb5'
         AND md5(pg_get_functiondef(proc.oid)) = '73fd015810eeb121646bdfecf4fef0f8'
     ) <> 1
     OR (
       SELECT count(*)
       FROM pg_proc AS proc
       JOIN pg_namespace AS namespace ON namespace.oid = proc.pronamespace
       WHERE namespace.nspname = 'registry'
         AND proc.proname = 'enforce_child_operating_company'
         AND md5(proc.prosrc) = '4a2829f87bad19d9eac70716cb37688e'
         AND proc.proacl::text = '{postgres=X/postgres}'
     ) <> 1
     OR (
       SELECT count(*)
       FROM pg_proc AS proc
       JOIN pg_namespace AS namespace ON namespace.oid = proc.pronamespace
       WHERE namespace.nspname = 'access'
         AND proc.proname = 'is_company_member'
         AND proc.prosecdef = false
         AND md5(proc.prosrc) = '10ed66b8936a38e44b44234e786d47a7'
     ) <> 1
     OR (
       SELECT md5(proc.prosrc)
       FROM pg_proc AS proc
       JOIN pg_namespace AS namespace ON namespace.oid = proc.pronamespace
       WHERE namespace.nspname = 'registry'
         AND proc.proname = 'forbid_uuid_change'
     ) IS DISTINCT FROM 'fe964c798154886e8dacc8edebef908a' THEN
    RAISE EXCEPTION 'BLOCKED_BY_SECURITY';
  END IF;

  IF (
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
       JOIN pg_namespace AS namespace ON namespace.oid = proc.pronamespace
       WHERE NOT trigger_row.tgisinternal
         AND namespace.nspname = 'finance'
         AND proc.proname = 'enforce_agent_transaction_draft_company'
         AND trigger_row.tgname = 'trg_agent_tx_drafts_company'
         AND trigger_row.tgenabled = 'O'
     ) <> 1 THEN
    RAISE EXCEPTION 'BLOCKED_BY_TRIGGER';
  END IF;

  IF (SELECT count(*) FROM registry.companies) <> 1
     OR (SELECT count(*) FROM registry.companies WHERE status = 'active') <> 1
     OR (SELECT count(*) FROM access.company_memberships) <> 1
     OR (
       SELECT count(*) FROM access.company_memberships
       WHERE membership_role = 'company_admin' AND is_active
     ) <> 1
     OR (SELECT count(*) FROM registry.parties) <> 24
     OR (SELECT count(*) FROM finance.agent_transaction_drafts) <> 2
     OR (SELECT count(*) FROM finance.agent_transaction_drafts WHERE operating_company_id IS NULL) <> 0
     OR (SELECT count(*) FROM public.v_certified_ledger_transactions) <> 2254
     OR (SELECT sum(amount_eur) FROM public.v_certified_ledger_transactions) <> 12549078.54
     OR (SELECT count(*) FROM pms.connections) <> 1
     OR (SELECT count(*) FROM pms.property_mappings) <> 8
     OR (SELECT md5(string_agg(to_jsonb(row_alias)::text, ',' ORDER BY row_alias.company_id)) FROM registry.companies AS row_alias) IS DISTINCT FROM '69abde521c603f79ad8514cfb08a1658'
     OR (SELECT md5(coalesce(string_agg(to_jsonb(row_alias)::text, ',' ORDER BY row_alias.party_id), '')) FROM registry.parties AS row_alias) IS DISTINCT FROM 'a37321b5dd81cdfb674386c97c82101c'
     OR (SELECT md5(pg_get_viewdef(view_relation.oid)) FROM pg_class AS view_relation JOIN pg_namespace AS view_namespace ON view_namespace.oid = view_relation.relnamespace WHERE view_namespace.nspname = 'public' AND view_relation.relname = 'v_certified_ledger_transactions') IS DISTINCT FROM 'ca7ceb8841f66d974dc72b972be902c3'
     OR (SELECT md5(pg_get_viewdef(view_relation.oid)) FROM pg_class AS view_relation JOIN pg_namespace AS view_namespace ON view_namespace.oid = view_relation.relnamespace WHERE view_namespace.nspname = 'public' AND view_relation.relname = 'v_rc3_classified') IS DISTINCT FROM '1b014d4d7f0fa074f6ad3f50a7181e34'
     OR (SELECT md5(pg_get_viewdef(view_relation.oid)) FROM pg_class AS view_relation JOIN pg_namespace AS view_namespace ON view_namespace.oid = view_relation.relnamespace WHERE view_namespace.nspname = 'public' AND view_relation.relname = 'v_cashbox_audit') IS DISTINCT FROM 'fbf261e717ed8a67f26e9ae35e344c54'
     OR (SELECT md5(pg_get_viewdef(view_relation.oid)) FROM pg_class AS view_relation JOIN pg_namespace AS view_namespace ON view_namespace.oid = view_relation.relnamespace WHERE view_namespace.nspname = 'public' AND view_relation.relname = 'v_jj_company_pl') IS DISTINCT FROM '39c35feee3d904605b3606f32e1d3f45' THEN
    RAISE EXCEPTION 'BLOCKED_BY_GLOBAL_PIN';
  END IF;

  IF (
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
    RAISE EXCEPTION 'BLOCKED_BY_RLS';
  END IF;
END
$guard$;

CREATE FUNCTION access.resolve_verified_operating_company(
  p_requested uuid,
  p_inherited boolean
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $verified$
DECLARE
  actor uuid;
  session_role text;
  active_count integer;
  sole_company uuid;
BEGIN
  LOCK TABLE registry.companies IN SHARE ROW EXCLUSIVE MODE;

  actor := auth.uid();
  session_role := auth.role();

  IF session_role = 'anon'
     OR (session_role = 'authenticated' AND actor IS NULL) THEN
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

  IF p_inherited THEN
    IF p_requested IS NULL
       OR NOT EXISTS (
         SELECT 1
         FROM registry.companies
         WHERE company_id = p_requested
           AND status = 'active'
       ) THEN
      RAISE EXCEPTION 'BLOCKED_BY_PARENT_COMPANY';
    END IF;
    IF actor IS NULL THEN
      IF active_count IS DISTINCT FROM 1
         OR p_requested IS DISTINCT FROM sole_company THEN
        RAISE EXCEPTION 'BLOCKED_BY_COMPANY_CONTEXT';
      END IF;
      RETURN p_requested;
    END IF;
    IF NOT access.is_company_member(p_requested) THEN
      RAISE EXCEPTION 'BLOCKED_BY_COMPANY_CONTEXT';
    END IF;
    RETURN p_requested;
  END IF;

  IF p_requested IS NULL THEN
    IF active_count IS DISTINCT FROM 1 OR sole_company IS NULL THEN
      RAISE EXCEPTION 'BLOCKED_BY_COMPANY_CONTEXT';
    END IF;
    IF actor IS NOT NULL AND NOT access.is_company_member(sole_company) THEN
      RAISE EXCEPTION 'BLOCKED_BY_COMPANY_CONTEXT';
    END IF;
    RETURN sole_company;
  END IF;

  IF actor IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM registry.companies
       WHERE company_id = p_requested
         AND status = 'active'
     )
     OR NOT access.is_company_member(p_requested)
     OR (active_count = 1 AND p_requested IS DISTINCT FROM sole_company) THEN
    RAISE EXCEPTION 'BLOCKED_BY_COMPANY_CONTEXT';
  END IF;

  RETURN p_requested;
END
$verified$;

REVOKE ALL ON FUNCTION access.resolve_verified_operating_company(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION access.resolve_verified_operating_company(uuid, boolean) FROM anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION registry.resolve_child_operating_company(
  p_supplied uuid,
  p_parent uuid,
  p_require_parent boolean
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $resolve$
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
    RETURN access.resolve_verified_operating_company(p_parent, true);
  END IF;

  RETURN access.resolve_verified_operating_company(p_supplied, false);
END
$resolve$;

REVOKE ALL ON FUNCTION registry.resolve_child_operating_company(uuid, uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION registry.resolve_child_operating_company(uuid, uuid, boolean) FROM anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION finance.enforce_agent_transaction_draft_company()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $draft$
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

  NEW.operating_company_id := access.resolve_verified_operating_company(NEW.operating_company_id, false);
  RETURN NEW;
END
$draft$;

REVOKE ALL ON FUNCTION finance.enforce_agent_transaction_draft_company() FROM PUBLIC;
REVOKE ALL ON FUNCTION finance.enforce_agent_transaction_draft_company() FROM anon, authenticated, service_role;

DO $post$
BEGIN
  IF (
       SELECT count(*)
       FROM pg_proc AS proc
       JOIN pg_namespace AS namespace ON namespace.oid = proc.pronamespace
       JOIN pg_roles AS owner_role ON owner_role.oid = proc.proowner
       WHERE namespace.nspname = 'access'
         AND proc.proname = 'resolve_verified_operating_company'
         AND owner_role.rolname = 'postgres'
         AND proc.prosecdef
         AND proc.provolatile = 'v'
         AND proc.proconfig @> ARRAY['search_path=pg_catalog']
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
         AND proc.proacl::text = '{postgres=X/postgres}'
         AND position('access.resolve_verified_operating_company' in proc.prosrc) > 0
     ) <> 1
     OR (
       SELECT count(*)
       FROM pg_proc AS proc
       JOIN pg_namespace AS namespace ON namespace.oid = proc.pronamespace
       WHERE namespace.nspname = 'finance'
         AND proc.proname = 'enforce_agent_transaction_draft_company'
         AND proc.proacl::text = '{postgres=X/postgres}'
         AND position('access.resolve_verified_operating_company' in proc.prosrc) > 0
         AND position('BLOCKED_BY_COMPANY_REASSIGNMENT' in proc.prosrc) > 0
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
     OR (SELECT count(*) FROM registry.companies) <> 1
     OR (SELECT count(*) FROM access.company_memberships) <> 1
     OR (SELECT count(*) FROM registry.parties) <> 24
     OR (SELECT count(*) FROM finance.agent_transaction_drafts) <> 2
     OR (SELECT count(*) FROM public.v_certified_ledger_transactions) <> 2254
     OR (SELECT count(*) FROM pms.property_mappings) <> 8 THEN
    RAISE EXCEPTION 'BLOCKED_BY_SCHEMA_DRIFT';
  END IF;
END
$post$;

COMMIT;
