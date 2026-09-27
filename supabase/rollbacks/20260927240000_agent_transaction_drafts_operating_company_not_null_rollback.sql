-- Restore nullability of finance.agent_transaction_drafts.operating_company_id.
-- Does not remove the column, foreign key, index, assignments, function, or triggers.

BEGIN;

DO $rollback$
DECLARE
  pinned_company uuid := '10f6e9b3-c5b9-4d95-a318-48f20f89477f';
  fn_oid oid;
BEGIN
  LOCK TABLE finance.agent_transaction_drafts IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE registry.companies IN SHARE ROW EXCLUSIVE MODE;

  IF (SELECT count(*) FROM supabase_migrations.schema_migrations) <> 187
     OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260927240000') <> 1
     OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260927220000') <> 1
     OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260927160000') <> 1
     OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260927140000') <> 1
     OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260927120000') <> 1
     OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260926200000') <> 1
     OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260926180000') <> 1
     OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260926160000') <> 1
     OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260926140000') <> 1
     OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260926120000') <> 1
     OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260925140000') <> 1
     OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260925120000') <> 1 THEN
    RAISE EXCEPTION 'BLOCKED_BY_ROLLBACK';
  END IF;

  IF (
       SELECT count(*)
       FROM pg_attribute AS attribute
       JOIN pg_class AS relation ON relation.oid = attribute.attrelid
       JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
       WHERE namespace.nspname = 'finance'
         AND relation.relname = 'agent_transaction_drafts'
         AND attribute.attname = 'operating_company_id'
         AND attribute.attnum > 0
         AND NOT attribute.attisdropped
         AND attribute.atttypid = 'uuid'::regtype
         AND attribute.attnotnull = true
         AND attribute.atthasdef = false
         AND attribute.attgenerated = ''
     ) <> 1 THEN
    RAISE EXCEPTION 'BLOCKED_BY_ROLLBACK';
  END IF;

  SELECT proc.oid
    INTO fn_oid
  FROM pg_proc AS proc
  JOIN pg_namespace AS namespace ON namespace.oid = proc.pronamespace
  JOIN pg_roles AS owner_role ON owner_role.oid = proc.proowner
  WHERE namespace.nspname = 'finance'
    AND proc.proname = 'enforce_agent_transaction_draft_company'
    AND owner_role.rolname = 'postgres'
    AND proc.prosecdef
    AND proc.proconfig @> ARRAY['search_path=pg_catalog']
    AND proc.proacl::text = '{postgres=X/postgres}'
    AND md5(proc.prosrc) = 'dfcbb8a5bf1cd56e62b2cb9870870eb5'
    AND md5(pg_get_functiondef(proc.oid)) = '73fd015810eeb121646bdfecf4fef0f8';

  IF fn_oid IS NULL THEN
    RAISE EXCEPTION 'BLOCKED_BY_ROLLBACK';
  END IF;

  IF (
       SELECT count(*)
       FROM pg_trigger AS trigger_row
       JOIN pg_class AS relation ON relation.oid = trigger_row.tgrelid
       JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
       WHERE NOT trigger_row.tgisinternal
         AND namespace.nspname = 'finance'
         AND relation.relname = 'agent_transaction_drafts'
         AND trigger_row.tgname = 'trg_agent_tx_drafts_company'
         AND trigger_row.tgenabled = 'O'
         AND trigger_row.tgtype = 23
         AND trigger_row.tgfoid = fn_oid
         AND md5(pg_get_triggerdef(trigger_row.oid)) = '7dcd0c77d19854e707bbaa59bbf752cd'
     ) <> 1
     OR (
       SELECT count(*)
       FROM pg_depend AS depend
       WHERE depend.refobjid = fn_oid
         AND depend.classid = 'pg_trigger'::regclass
         AND depend.deptype = 'n'
     ) <> 1
     OR EXISTS (
       SELECT 1
       FROM pg_depend AS depend
       WHERE depend.refobjid = fn_oid
         AND depend.classid <> 'pg_trigger'::regclass
     ) THEN
    RAISE EXCEPTION 'BLOCKED_BY_ROLLBACK';
  END IF;

  IF (
       SELECT count(*)
       FROM pg_trigger AS trigger_row
       JOIN pg_proc AS proc ON proc.oid = trigger_row.tgfoid
       WHERE NOT trigger_row.tgisinternal
         AND trigger_row.tgname = 'trg_agent_tx_drafts_guard'
         AND trigger_row.tgenabled = 'O'
         AND trigger_row.tgtype = 31
         AND md5(pg_get_triggerdef(trigger_row.oid)) = '58e808d265aa0589a021c7dd15bdfcf6'
         AND md5(proc.prosrc) = 'e85ac033cf3a30443ecbbe777e1c81ff'
         AND md5(pg_get_functiondef(proc.oid)) = 'cdd89382a64e4236e2a3a855f6161c89'
     ) <> 1
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
       FROM pg_constraint AS company_fk
       JOIN pg_class AS owning ON owning.oid = company_fk.conrelid
       JOIN pg_namespace AS owning_namespace ON owning_namespace.oid = owning.relnamespace
       WHERE owning_namespace.nspname = 'finance'
         AND owning.relname = 'agent_transaction_drafts'
         AND company_fk.conname = 'agent_transaction_drafts_operating_company_fk'
         AND company_fk.contype = 'f'
         AND company_fk.convalidated = true
         AND company_fk.confdeltype = 'r'
     ) <> 1
     OR (
       SELECT count(*)
       FROM pg_class AS index_relation
       JOIN pg_namespace AS index_namespace ON index_namespace.oid = index_relation.relnamespace
       JOIN pg_index AS index_row ON index_row.indexrelid = index_relation.oid
       WHERE index_namespace.nspname = 'finance'
         AND index_relation.relname = 'agent_transaction_drafts_operating_company_id_idx'
         AND index_row.indisvalid
         AND index_row.indisready
         AND NOT index_row.indisunique
         AND index_row.indnkeyatts = 1
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
       WHERE namespace.nspname = 'finance'
         AND relation.relname = 'agent_transaction_drafts'
     ) IS DISTINCT FROM '68b7d11d856c6c9065984bdbeb85daad'
     OR (
       SELECT count(*)
       FROM pg_proc AS proc
       JOIN pg_namespace AS namespace ON namespace.oid = proc.pronamespace
       WHERE namespace.nspname = 'public'
         AND proc.proacl::text = '{postgres=X/postgres,authenticated=X/postgres}'
         AND proc.proconfig @> ARRAY['search_path=""']
         AND (
           (proc.proname = 'create_agent_transaction_draft' AND md5(proc.prosrc) = 'b21dc8fe041869cd7f790aca90e9372a' AND md5(pg_get_functiondef(proc.oid)) = 'a1ac6fe08d58ea0ee6865c77a628fa51')
           OR (proc.proname = 'list_agent_transaction_drafts' AND md5(proc.prosrc) = '7b18675c896d811d4795dd1f8ab2707b' AND md5(pg_get_functiondef(proc.oid)) = 'b519afd0a0b39d57c28d9ffa8a35ebfa')
           OR (proc.proname = 'update_agent_transaction_draft' AND md5(proc.prosrc) = '390f4287bd66149f797378c58ad096ba' AND md5(pg_get_functiondef(proc.oid)) = '79e6aff8fe6b4853e61b14ce2ce0f231')
           OR (proc.proname = 'reject_agent_transaction_draft' AND md5(proc.prosrc) = '9a95398529549ae39ce4e0cee8508ab2' AND md5(pg_get_functiondef(proc.oid)) = '78e64558d7cb2f59b0ebb48d7cb3871b')
           OR (proc.proname = 'approve_and_post_agent_transaction_draft' AND md5(proc.prosrc) = 'f052fe6e972dddec79635c39d8840fcb' AND md5(pg_get_functiondef(proc.oid)) = '6f8f19f38aa938373871e4575d82fbcb')
         )
     ) <> 5
     OR (SELECT count(*) FROM public.v_certified_ledger_transactions) <> 2254
     OR (SELECT sum(amount_eur) FROM public.v_certified_ledger_transactions) <> 12549078.54
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
     OR NOT EXISTS (
       SELECT 1
       FROM pg_trigger AS trigger_row
       WHERE NOT trigger_row.tgisinternal
         AND trigger_row.tgname = 'companies_uuid_guard'
         AND trigger_row.tgenabled = 'O'
         AND md5(pg_get_triggerdef(trigger_row.oid)) = '1e4cd7f35cfd5df00a734d7b7b9d020c'
     )
     OR NOT EXISTS (
       SELECT 1
       FROM pg_trigger AS trigger_row
       WHERE NOT trigger_row.tgisinternal
         AND trigger_row.tgname = 'trg_transactions_append_only'
         AND trigger_row.tgenabled = 'O'
     )
     OR (SELECT count(*) FROM pms.connections) <> 1
     OR (SELECT count(*) FROM pms.property_mappings) <> 8 THEN
    RAISE EXCEPTION 'BLOCKED_BY_ROLLBACK';
  END IF;
END
$rollback$;

ALTER TABLE finance.agent_transaction_drafts
  ALTER COLUMN operating_company_id DROP NOT NULL;

DO $after$
DECLARE
  pinned_company uuid := '10f6e9b3-c5b9-4d95-a318-48f20f89477f';
BEGIN
  IF (
       SELECT count(*)
       FROM pg_attribute AS attribute
       JOIN pg_class AS relation ON relation.oid = attribute.attrelid
       JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
       WHERE namespace.nspname = 'finance'
         AND relation.relname = 'agent_transaction_drafts'
         AND attribute.attname = 'operating_company_id'
         AND NOT attribute.attisdropped
         AND attribute.atttypid = 'uuid'::regtype
         AND attribute.attnotnull = false
         AND attribute.atthasdef = false
         AND attribute.attgenerated = ''
     ) <> 1
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
       FROM pg_trigger AS trigger_row
       WHERE NOT trigger_row.tgisinternal
         AND trigger_row.tgname = 'trg_agent_tx_drafts_company'
         AND trigger_row.tgenabled = 'O'
         AND trigger_row.tgtype = 23
         AND md5(pg_get_triggerdef(trigger_row.oid)) = '7dcd0c77d19854e707bbaa59bbf752cd'
     ) <> 1
     OR (
       SELECT count(*)
       FROM pg_trigger AS trigger_row
       JOIN pg_proc AS proc ON proc.oid = trigger_row.tgfoid
       WHERE NOT trigger_row.tgisinternal
         AND trigger_row.tgname = 'trg_agent_tx_drafts_guard'
         AND trigger_row.tgenabled = 'O'
         AND md5(pg_get_triggerdef(trigger_row.oid)) = '58e808d265aa0589a021c7dd15bdfcf6'
         AND md5(proc.prosrc) = 'e85ac033cf3a30443ecbbe777e1c81ff'
     ) <> 1
     OR (SELECT count(*) FROM finance.agent_transaction_drafts WHERE operating_company_id = pinned_company) <> 2
     OR (SELECT count(*) FROM finance.agent_transaction_drafts WHERE operating_company_id IS NULL) <> 0
     OR coalesce((
       SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.id))
       FROM finance.agent_transaction_drafts AS row_alias
     ), 'empty') IS DISTINCT FROM 'd7d613bf138b734626f9a82df3ac7075'
     OR (
       SELECT count(*)
       FROM pg_constraint AS company_fk
       WHERE company_fk.conname = 'agent_transaction_drafts_operating_company_fk'
         AND company_fk.convalidated
     ) <> 1
     OR (
       SELECT count(*)
       FROM pg_class AS index_relation
       JOIN pg_namespace AS index_namespace ON index_namespace.oid = index_relation.relnamespace
       WHERE index_namespace.nspname = 'finance'
         AND index_relation.relname = 'agent_transaction_drafts_operating_company_id_idx'
     ) <> 1 THEN
    RAISE EXCEPTION 'BLOCKED_BY_ROLLBACK';
  END IF;
END
$after$;

COMMIT;
