-- Make registry.forbid_uuid_change read only columns that exist on the invoking table.
-- companies and parties share one trigger function. A combined boolean reads NEW.party_id
-- even when the companies trigger fired, which raises record "new" has no field "party_id".
-- This replaces that function body only. Triggers, grants, RLS, and rows stay as they are.

BEGIN;

DO $guard$
DECLARE
  pinned_company uuid := '10f6e9b3-c5b9-4d95-a318-48f20f89477f';
  guard_proc oid;
BEGIN
  LOCK TABLE registry.companies IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE registry.parties IN SHARE ROW EXCLUSIVE MODE;

  IF (SELECT count(*) FROM supabase_migrations.schema_migrations) <> 187
     OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260925120000') <> 1
     OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260925140000') <> 1
     OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260926120000') <> 1
     OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260926140000') <> 1
     OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260926160000') <> 1
     OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260926180000') <> 1
     OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260926200000') <> 1
     OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260927120000') <> 1
     OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260927140000') <> 1
     OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260927160000') <> 1
     OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260927220000') <> 1
     OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260927240000') <> 1
     OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260927260000') <> 0
     OR (
       SELECT count(*) FROM (
         SELECT version FROM supabase_migrations.schema_migrations GROUP BY version HAVING count(*) > 1
       ) AS duplicated
     ) <> 0 THEN
    RAISE EXCEPTION 'BLOCKED_BY_HISTORY';
  END IF;

  SELECT proc.oid INTO guard_proc
  FROM pg_proc AS proc
  JOIN pg_namespace AS namespace ON namespace.oid = proc.pronamespace
  WHERE namespace.nspname = 'registry' AND proc.proname = 'forbid_uuid_change';

  IF (
       SELECT count(*)
       FROM pg_proc AS proc
       JOIN pg_namespace AS namespace ON namespace.oid = proc.pronamespace
       JOIN pg_roles AS owner_role ON owner_role.oid = proc.proowner
       JOIN pg_language AS lang ON lang.oid = proc.prolang
       WHERE proc.oid = guard_proc
         AND owner_role.rolname = 'postgres'
         AND proc.prosecdef = false
         AND proc.provolatile = 'v'
         AND lang.lanname = 'plpgsql'
         AND proc.proconfig IS NULL
         AND proc.proacl::text = '{postgres=X/postgres}'
         AND pg_get_function_identity_arguments(proc.oid) = ''
     ) <> 1
     OR (SELECT count(*) FROM pg_proc WHERE proname = 'forbid_uuid_change') <> 1 THEN
    RAISE EXCEPTION 'BLOCKED_BY_SECURITY';
  END IF;

  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = guard_proc) = 'fe964c798154886e8dacc8edebef908a' THEN
    RAISE EXCEPTION 'BLOCKED_BY_REAPPLY';
  END IF;

  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = guard_proc) IS DISTINCT FROM '1a56112bb0b16e14ea9407cef27bd7b5'
     OR (SELECT md5(pg_get_functiondef(oid)) FROM pg_proc WHERE oid = guard_proc) IS DISTINCT FROM '5181844513754066b432e1a529ad84e3'
     OR (
       SELECT count(*)
       FROM pg_attribute AS attribute
       JOIN pg_class AS relation ON relation.oid = attribute.attrelid
       JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
       WHERE namespace.nspname = 'registry'
         AND relation.relname = 'companies'
         AND attribute.attnum > 0
         AND NOT attribute.attisdropped
         AND attribute.attname IN ('company_id', 'canonical_name', 'status', 'created_at', 'updated_at')
     ) <> 5
     OR EXISTS (
       SELECT 1
       FROM pg_attribute AS attribute
       JOIN pg_class AS relation ON relation.oid = attribute.attrelid
       JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
       WHERE namespace.nspname = 'registry'
         AND relation.relname = 'companies'
         AND attribute.attname = 'party_id'
         AND NOT attribute.attisdropped
     )
     OR (
       SELECT count(*)
       FROM pg_attribute AS attribute
       JOIN pg_class AS relation ON relation.oid = attribute.attrelid
       JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
       WHERE namespace.nspname = 'finance'
         AND relation.relname = 'agent_transaction_drafts'
         AND attribute.attname = 'operating_company_id'
         AND attribute.atttypid = 'uuid'::regtype
         AND attribute.attnotnull
         AND attribute.atthasdef = false
         AND attribute.attgenerated = ''
         AND NOT attribute.attisdropped
     ) <> 1 THEN
    RAISE EXCEPTION 'BLOCKED_BY_SCHEMA_DRIFT';
  END IF;

  IF (
       SELECT count(*)
       FROM pg_trigger AS trigger_row
       JOIN pg_class AS relation ON relation.oid = trigger_row.tgrelid
       JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
       WHERE NOT trigger_row.tgisinternal
         AND trigger_row.tgfoid = guard_proc
         AND (
           (namespace.nspname = 'registry' AND relation.relname = 'companies' AND trigger_row.tgname = 'companies_uuid_guard'
             AND trigger_row.tgenabled = 'O' AND trigger_row.tgtype = 19
             AND md5(pg_get_triggerdef(trigger_row.oid)) = '1e4cd7f35cfd5df00a734d7b7b9d020c')
           OR
           (namespace.nspname = 'registry' AND relation.relname = 'parties' AND trigger_row.tgname = 'parties_uuid_guard'
             AND trigger_row.tgenabled = 'O' AND trigger_row.tgtype = 19
             AND md5(pg_get_triggerdef(trigger_row.oid)) = '495f8ad6dcc449e20c4ded2e8aaab021')
         )
     ) <> 2 THEN
    RAISE EXCEPTION 'BLOCKED_BY_TRIGGER';
  END IF;

  IF (
       SELECT count(*)
       FROM pg_depend AS depend
       WHERE depend.objid = guard_proc
         AND depend.deptype = 'n'
         AND depend.classid = 'pg_proc'::regclass
         AND depend.refclassid IN ('pg_language'::regclass, 'pg_namespace'::regclass)
     ) <> 2
     OR (
       SELECT count(*)
       FROM pg_depend AS depend
       WHERE depend.refobjid = guard_proc
         AND depend.classid = 'pg_trigger'::regclass
         AND depend.deptype = 'n'
     ) <> 2 THEN
    RAISE EXCEPTION 'BLOCKED_BY_DEPENDENCY';
  END IF;

  IF (SELECT count(*) FROM registry.companies) <> 1
     OR (SELECT count(*) FROM registry.companies WHERE status = 'active') <> 1
     OR (SELECT count(*) FROM registry.companies WHERE company_id = pinned_company AND status = 'active') <> 1
     OR (SELECT count(*) FROM access.company_memberships) <> 1
     OR (
       SELECT count(*) FROM access.company_memberships
       WHERE company_id = pinned_company AND membership_role = 'company_admin' AND is_active
     ) <> 1
     OR (SELECT count(*) FROM registry.parties) <> 24
     OR (SELECT md5(string_agg(to_jsonb(row_alias)::text, ',' ORDER BY row_alias.company_id)) FROM registry.companies AS row_alias) IS DISTINCT FROM '69abde521c603f79ad8514cfb08a1658'
     OR (SELECT md5(coalesce(string_agg(to_jsonb(row_alias)::text, ',' ORDER BY row_alias.party_id), '')) FROM registry.parties AS row_alias) IS DISTINCT FROM 'a37321b5dd81cdfb674386c97c82101c'
     OR (SELECT count(*) FROM finance.agent_transaction_drafts) <> 2
     OR (SELECT count(*) FROM finance.agent_transaction_drafts WHERE operating_company_id = pinned_company) <> 2
     OR (SELECT count(*) FROM finance.agent_transaction_drafts WHERE operating_company_id IS NULL) <> 0
     OR (SELECT count(*) FROM finance.agent_transaction_drafts WHERE operating_company_id IS DISTINCT FROM pinned_company) <> 0
     OR coalesce((
       SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.id))
       FROM finance.agent_transaction_drafts AS row_alias
     ), 'empty') IS DISTINCT FROM 'd7d613bf138b734626f9a82df3ac7075'
     OR coalesce((
       SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id' - 'updated_at')::text, ',' ORDER BY row_alias.id))
       FROM finance.agent_transaction_drafts AS row_alias
     ), 'empty') IS DISTINCT FROM '6c97411f192611b3070d9df7369435d8'
     OR (
       SELECT count(*)
       FROM pg_attribute AS attribute
       JOIN pg_class AS relation ON relation.oid = attribute.attrelid
       JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
       WHERE attribute.attname = 'operating_company_id'
         AND attribute.atttypid = 'uuid'::regtype
         AND attribute.attnotnull
         AND NOT attribute.atthasdef
         AND attribute.attgenerated = ''
         AND NOT attribute.attisdropped
         AND (namespace.nspname, relation.relname) IN (
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
     ) <> 9
     OR (
       (SELECT count(*) FROM public.property_owners WHERE operating_company_id = pinned_company)
       + (SELECT count(*) FROM public.property_ownership WHERE operating_company_id = pinned_company)
       + (SELECT count(*) FROM public.ownership WHERE operating_company_id = pinned_company)
       + (SELECT count(*) FROM public.property_name_aliases WHERE operating_company_id = pinned_company)
       + (SELECT count(*) FROM public.property_reporting_map WHERE operating_company_id = pinned_company)
       + (SELECT count(*) FROM lifecycle.property_acquisition WHERE operating_company_id = pinned_company)
       + (SELECT count(*) FROM lifecycle.service_engagements WHERE operating_company_id = pinned_company)
       + (SELECT count(*) FROM lifecycle.management_fee_configs WHERE operating_company_id = pinned_company)
       + (SELECT count(*) FROM pms.property_mappings WHERE operating_company_id = pinned_company)
     ) <> 262
     OR (SELECT count(*) FROM public.property_owners WHERE operating_company_id IS NULL) <> 0
     OR (SELECT count(*) FROM public.property_ownership WHERE operating_company_id IS NULL) <> 0
     OR (SELECT count(*) FROM public.ownership WHERE operating_company_id IS NULL) <> 0
     OR (SELECT count(*) FROM public.property_name_aliases WHERE operating_company_id IS NULL) <> 0
     OR (SELECT count(*) FROM public.property_reporting_map WHERE operating_company_id IS NULL) <> 0
     OR (SELECT count(*) FROM lifecycle.property_acquisition WHERE operating_company_id IS NULL) <> 0
     OR (SELECT count(*) FROM lifecycle.service_engagements WHERE operating_company_id IS NULL) <> 0
     OR (SELECT count(*) FROM lifecycle.management_fee_configs WHERE operating_company_id IS NULL) <> 0
     OR (SELECT count(*) FROM pms.property_mappings WHERE operating_company_id IS NULL) <> 0
     OR (
       SELECT count(*)
       FROM pg_proc AS proc
       JOIN pg_namespace AS namespace ON namespace.oid = proc.pronamespace
       WHERE namespace.nspname = 'registry'
         AND (
           (proc.proname = 'enforce_child_operating_company' AND md5(proc.prosrc) = '4a2829f87bad19d9eac70716cb37688e' AND md5(pg_get_functiondef(proc.oid)) = 'bac27dded575f18f72857b5b517a54a2')
           OR (proc.proname = 'resolve_child_operating_company' AND md5(proc.prosrc) = 'eacbfd7957ced1264a3b9c3339c37b01' AND md5(pg_get_functiondef(proc.oid)) = '236f0756e7d1041f6e8bd54b525ec38b')
         )
     ) <> 2
     OR (
       SELECT md5(string_agg(trigger_row.tgname || ':' || md5(pg_get_triggerdef(trigger_row.oid)), ',' ORDER BY trigger_row.tgname))
       FROM pg_trigger AS trigger_row
       WHERE NOT trigger_row.tgisinternal
         AND trigger_row.tgname IN (
           'trg_management_fee_configs_operating_company',
           'trg_ownership_operating_company',
           'trg_property_acquisition_operating_company',
           'trg_property_mappings_operating_company',
           'trg_property_name_aliases_operating_company',
           'trg_property_owners_operating_company',
           'trg_property_ownership_operating_company',
           'trg_property_reporting_map_operating_company',
           'trg_service_engagements_operating_company'
         )
     ) IS DISTINCT FROM '326b8731ce64b5b90890426c8b935b2e'
     OR (SELECT count(*) FROM public.v_certified_ledger_transactions) <> 2254
     OR (SELECT sum(amount_eur) FROM public.v_certified_ledger_transactions) <> 12549078.54
     OR (
       SELECT count(*)
       FROM pg_class AS view_relation
       JOIN pg_namespace AS view_namespace ON view_namespace.oid = view_relation.relnamespace
       WHERE view_namespace.nspname = 'public'
         AND (
           (view_relation.relname = 'v_certified_ledger_transactions' AND md5(pg_get_viewdef(view_relation.oid)) = 'ca7ceb8841f66d974dc72b972be902c3')
           OR (view_relation.relname = 'v_rc3_classified' AND md5(pg_get_viewdef(view_relation.oid)) = '1b014d4d7f0fa074f6ad3f50a7181e34')
           OR (view_relation.relname = 'v_cashbox_audit' AND md5(pg_get_viewdef(view_relation.oid)) = 'fbf261e717ed8a67f26e9ae35e344c54')
           OR (view_relation.relname = 'v_jj_company_pl' AND md5(pg_get_viewdef(view_relation.oid)) = '39c35feee3d904605b3606f32e1d3f45')
         )
     ) <> 4
     OR NOT EXISTS (
       SELECT 1 FROM pg_trigger AS trigger_row
       JOIN pg_class AS relation ON relation.oid = trigger_row.tgrelid
       JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
       WHERE namespace.nspname = 'public' AND relation.relname = 'transactions'
         AND trigger_row.tgname = 'trg_transactions_append_only' AND trigger_row.tgenabled = 'O'
     )
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
     ) IS DISTINCT FROM '10311e91f916ade2a6a2b8c8748ff1c7'
     OR (SELECT count(*) FROM pms.connections) <> 1
     OR (SELECT count(*) FROM pms.property_mappings) <> 8
     OR (
       SELECT count(*)
       FROM pg_proc AS proc
       JOIN pg_namespace AS namespace ON namespace.oid = proc.pronamespace
       WHERE namespace.nspname = 'finance'
         AND proc.proname = 'enforce_agent_transaction_draft_company'
         AND md5(proc.prosrc) = 'dfcbb8a5bf1cd56e62b2cb9870870eb5'
         AND md5(pg_get_functiondef(proc.oid)) = '73fd015810eeb121646bdfecf4fef0f8'
     ) <> 1
     OR (
       SELECT count(*)
       FROM pg_proc AS proc
       JOIN pg_namespace AS namespace ON namespace.oid = proc.pronamespace
       WHERE namespace.nspname = 'public'
         AND proc.proacl::text = '{postgres=X/postgres,authenticated=X/postgres}'
         AND (
           (proc.proname = 'create_agent_transaction_draft' AND md5(proc.prosrc) = 'b21dc8fe041869cd7f790aca90e9372a' AND md5(pg_get_functiondef(proc.oid)) = 'a1ac6fe08d58ea0ee6865c77a628fa51')
           OR (proc.proname = 'list_agent_transaction_drafts' AND md5(proc.prosrc) = '7b18675c896d811d4795dd1f8ab2707b' AND md5(pg_get_functiondef(proc.oid)) = 'b519afd0a0b39d57c28d9ffa8a35ebfa')
           OR (proc.proname = 'update_agent_transaction_draft' AND md5(proc.prosrc) = '390f4287bd66149f797378c58ad096ba' AND md5(pg_get_functiondef(proc.oid)) = '79e6aff8fe6b4853e61b14ce2ce0f231')
           OR (proc.proname = 'reject_agent_transaction_draft' AND md5(proc.prosrc) = '9a95398529549ae39ce4e0cee8508ab2' AND md5(pg_get_functiondef(proc.oid)) = '78e64558d7cb2f59b0ebb48d7cb3871b')
           OR (proc.proname = 'approve_and_post_agent_transaction_draft' AND md5(proc.prosrc) = 'f052fe6e972dddec79635c39d8840fcb' AND md5(pg_get_functiondef(proc.oid)) = '6f8f19f38aa938373871e4575d82fbcb')
         )
     ) <> 5 THEN
    RAISE EXCEPTION 'BLOCKED_BY_GLOBAL_PIN';
  END IF;
END
$guard$;

CREATE OR REPLACE FUNCTION registry.forbid_uuid_change()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_TABLE_SCHEMA = 'registry' AND TG_TABLE_NAME = 'companies' THEN
    IF NEW.company_id <> OLD.company_id THEN
      RAISE EXCEPTION 'UUIDs are immutable (companies)';
    END IF;
    NEW.updated_at = now();
  ELSIF TG_TABLE_SCHEMA = 'registry' AND TG_TABLE_NAME = 'parties' THEN
    IF NEW.party_id <> OLD.party_id THEN
      RAISE EXCEPTION 'UUIDs are immutable (parties)';
    END IF;
    NEW.updated_at = now();
  ELSE
    RAISE EXCEPTION 'BLOCKED_BY_UUID_GUARD_TABLE';
  END IF;
  RETURN NEW;
END
$function$;

DO $post$
DECLARE
  pinned_company uuid := '10f6e9b3-c5b9-4d95-a318-48f20f89477f';
  guard_proc oid;
BEGIN
  SELECT proc.oid INTO guard_proc
  FROM pg_proc AS proc
  JOIN pg_namespace AS namespace ON namespace.oid = proc.pronamespace
  WHERE namespace.nspname = 'registry' AND proc.proname = 'forbid_uuid_change';

  IF (SELECT count(*) FROM pg_proc WHERE proname = 'forbid_uuid_change') <> 1
     OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = guard_proc) IS DISTINCT FROM 'fe964c798154886e8dacc8edebef908a'
     OR (SELECT md5(pg_get_functiondef(oid)) FROM pg_proc WHERE oid = guard_proc) IS DISTINCT FROM 'f9bbc41924fe3b312eab24540090df3a'
     OR (
       SELECT count(*)
       FROM pg_proc AS proc
       JOIN pg_roles AS owner_role ON owner_role.oid = proc.proowner
       JOIN pg_language AS lang ON lang.oid = proc.prolang
       WHERE proc.oid = guard_proc
         AND owner_role.rolname = 'postgres'
         AND proc.prosecdef = false
         AND proc.provolatile = 'v'
         AND lang.lanname = 'plpgsql'
         AND proc.proconfig IS NULL
         AND proc.proacl::text = '{postgres=X/postgres}'
     ) <> 1
     OR (
       SELECT count(*)
       FROM pg_trigger AS trigger_row
       WHERE NOT trigger_row.tgisinternal AND trigger_row.tgfoid = guard_proc
         AND (
           (trigger_row.tgname = 'companies_uuid_guard' AND trigger_row.tgenabled = 'O' AND trigger_row.tgtype = 19
             AND md5(pg_get_triggerdef(trigger_row.oid)) = '1e4cd7f35cfd5df00a734d7b7b9d020c')
           OR (trigger_row.tgname = 'parties_uuid_guard' AND trigger_row.tgenabled = 'O' AND trigger_row.tgtype = 19
             AND md5(pg_get_triggerdef(trigger_row.oid)) = '495f8ad6dcc449e20c4ded2e8aaab021')
         )
     ) <> 2
     OR (
       SELECT count(*) FROM pg_depend AS depend
       WHERE depend.refobjid = guard_proc AND depend.classid = 'pg_trigger'::regclass AND depend.deptype = 'n'
     ) <> 2
     OR (SELECT count(*) FROM registry.companies WHERE company_id = pinned_company AND status = 'active') <> 1
     OR (SELECT md5(string_agg(to_jsonb(row_alias)::text, ',' ORDER BY row_alias.company_id)) FROM registry.companies AS row_alias) IS DISTINCT FROM '69abde521c603f79ad8514cfb08a1658'
     OR (SELECT count(*) FROM public.v_certified_ledger_transactions) <> 2254 THEN
    RAISE EXCEPTION 'BLOCKED_BY_SCHEMA_DRIFT';
  END IF;
END
$post$;

COMMIT;
