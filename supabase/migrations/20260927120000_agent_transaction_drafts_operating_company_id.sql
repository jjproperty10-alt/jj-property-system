-- Nullable operating_company_id on finance.agent_transaction_drafts.
-- Adds the column, one foreign key, and one index. Does not fill existing rows.
-- Does not change draft RPCs, row-level security, grants, or the ledger.

BEGIN;

DO $require$
DECLARE
  jj_company uuid := '10f6e9b3-c5b9-4d95-a318-48f20f89477f';
  security_before text;
  trigger_pin text;
BEGIN
  LOCK TABLE finance.agent_transaction_drafts IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE registry.companies IN SHARE ROW EXCLUSIVE MODE;

  IF to_regclass('finance.agent_transaction_drafts') IS NULL
     OR EXISTS (
       SELECT 1
       FROM pg_attribute AS attribute
       JOIN pg_class AS relation ON relation.oid = attribute.attrelid
       JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
       WHERE namespace.nspname = 'finance'
         AND relation.relname = 'agent_transaction_drafts'
         AND attribute.attname = 'operating_company_id'
         AND attribute.attnum > 0
         AND NOT attribute.attisdropped
     )
     OR EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname = 'agent_transaction_drafts_operating_company_fk'
     )
     OR EXISTS (
       SELECT 1
       FROM pg_class AS index_relation
       JOIN pg_namespace AS index_namespace ON index_namespace.oid = index_relation.relnamespace
       WHERE index_namespace.nspname = 'finance'
         AND index_relation.relname = 'agent_transaction_drafts_operating_company_id_idx'
     ) THEN
    RAISE EXCEPTION 'BLOCKED_BY_SCHEMA_DRIFT';
  END IF;

  IF (SELECT count(*) FROM finance.agent_transaction_drafts) <> 2
     OR coalesce((
       SELECT md5(string_agg(to_jsonb(row_alias)::text, ',' ORDER BY row_alias.id))
       FROM finance.agent_transaction_drafts AS row_alias
     ), 'empty') IS DISTINCT FROM 'ca713ec102eb2bda0bdfe72fe53a4847'
     OR coalesce((
       SELECT md5(string_agg(
         attribute.attnum::text || ':' || attribute.attname || ':' || attribute.atttypid::text || ':' ||
         attribute.attnotnull::text || ':' || attribute.atthasdef::text || ':' || attribute.attgenerated::text,
         ',' ORDER BY attribute.attnum
       ))
       FROM pg_attribute AS attribute
       JOIN pg_class AS relation ON relation.oid = attribute.attrelid
       JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
       WHERE namespace.nspname = 'finance'
         AND relation.relname = 'agent_transaction_drafts'
         AND attribute.attnum > 0
         AND NOT attribute.attisdropped
     ), 'empty') IS DISTINCT FROM '1a2ef18cfd242bbcfa68df96e051ad20' THEN
    RAISE EXCEPTION 'BLOCKED_BY_ASSIGNMENT';
  END IF;

  IF (SELECT count(*) FROM supabase_migrations.schema_migrations) <> 182
     OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260925120000') <> 1
     OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260925140000') <> 1
     OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260926120000') <> 1
     OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260926140000') <> 1
     OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260926160000') <> 1
     OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260926180000') <> 1
     OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260926200000') <> 1
     OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260927120000') <> 0 THEN
    RAISE EXCEPTION 'BLOCKED_BY_HISTORY';
  END IF;

  IF (SELECT count(*) FROM registry.companies) <> 1
     OR (SELECT count(*) FROM registry.companies WHERE company_id = jj_company AND status = 'active') <> 1
     OR (SELECT count(*) FROM access.company_memberships) <> 1
     OR (
       SELECT count(*) FROM access.company_memberships
       WHERE company_id = jj_company AND membership_role = 'company_admin' AND is_active
     ) <> 1 THEN
    RAISE EXCEPTION 'BLOCKED_BY_GLOBAL_PIN: company registry';
  END IF;

  IF (
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
       SELECT count(*)
       FROM pg_proc AS proc
       JOIN pg_namespace AS namespace ON namespace.oid = proc.pronamespace
       WHERE namespace.nspname = 'registry'
         AND (
           (proc.proname = 'enforce_child_operating_company' AND md5(proc.prosrc) = '4a2829f87bad19d9eac70716cb37688e' AND md5(pg_get_functiondef(proc.oid)) = 'bac27dded575f18f72857b5b517a54a2')
           OR (proc.proname = 'resolve_child_operating_company' AND md5(proc.prosrc) = 'eacbfd7957ced1264a3b9c3339c37b01' AND md5(pg_get_functiondef(proc.oid)) = '236f0756e7d1041f6e8bd54b525ec38b')
         )
     ) <> 2 THEN
    RAISE EXCEPTION 'BLOCKED_BY_ENFORCEMENT';
  END IF;

  SELECT md5(string_agg(trigger_row.tgname || ':' || md5(pg_get_triggerdef(trigger_row.oid)), ',' ORDER BY trigger_row.tgname))
    INTO trigger_pin
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
    );
  IF trigger_pin IS DISTINCT FROM '326b8731ce64b5b90890426c8b935b2e' THEN
    RAISE EXCEPTION 'BLOCKED_BY_ENFORCEMENT';
  END IF;

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
    INTO security_before
  FROM pg_class AS relation
  JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'finance'
    AND relation.relname = 'agent_transaction_drafts';

  IF security_before IS DISTINCT FROM '68b7d11d856c6c9065984bdbeb85daad'
     OR (
       SELECT count(*)
       FROM pg_proc AS proc
       JOIN pg_namespace AS namespace ON namespace.oid = proc.pronamespace
       WHERE namespace.nspname = 'public'
         AND (
           (proc.proname = 'create_agent_transaction_draft'
             AND md5(proc.prosrc) = 'b21dc8fe041869cd7f790aca90e9372a'
             AND md5(pg_get_functiondef(proc.oid)) = 'a1ac6fe08d58ea0ee6865c77a628fa51'
             AND md5(pg_get_function_result(proc.oid)) = '79e5b914ba6ac4010adcafc63648c4e9')
           OR (proc.proname = 'list_agent_transaction_drafts'
             AND md5(proc.prosrc) = '7b18675c896d811d4795dd1f8ab2707b'
             AND md5(pg_get_functiondef(proc.oid)) = 'b519afd0a0b39d57c28d9ffa8a35ebfa'
             AND md5(pg_get_function_result(proc.oid)) = '61fdf727bfee7ed885e9e9502ca12ad0')
         )
     ) <> 2 THEN
    RAISE EXCEPTION 'BLOCKED_BY_SCHEMA_DRIFT: draft contract';
  END IF;

  IF (SELECT count(*) FROM public.v_certified_ledger_transactions) <> 2254
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
       SELECT 1
       FROM pg_trigger AS trigger_row
       JOIN pg_class AS relation ON relation.oid = trigger_row.tgrelid
       JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
       WHERE namespace.nspname = 'registry'
         AND relation.relname = 'companies'
         AND trigger_row.tgname = 'companies_uuid_guard'
         AND trigger_row.tgenabled = 'O'
         AND md5(pg_get_triggerdef(trigger_row.oid)) = '1e4cd7f35cfd5df00a734d7b7b9d020c'
     )
     OR NOT EXISTS (
       SELECT 1
       FROM pg_trigger AS trigger_row
       JOIN pg_class AS relation ON relation.oid = trigger_row.tgrelid
       JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
       WHERE namespace.nspname = 'public'
         AND relation.relname = 'transactions'
         AND trigger_row.tgname = 'trg_transactions_append_only'
         AND trigger_row.tgenabled = 'O'
     )
     OR (
       SELECT md5(string_agg(
         namespace.nspname || '.' || relation.relname || '|' ||
         relation.relrowsecurity::text || '|' ||
         relation.relforcerowsecurity::text || '|' ||
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
    RAISE EXCEPTION 'BLOCKED_BY_GLOBAL_PIN';
  END IF;
END
$require$;

ALTER TABLE finance.agent_transaction_drafts
  ADD COLUMN operating_company_id uuid;

ALTER TABLE finance.agent_transaction_drafts
  ADD CONSTRAINT agent_transaction_drafts_operating_company_fk
  FOREIGN KEY (operating_company_id)
  REFERENCES registry.companies (company_id)
  ON DELETE RESTRICT;

CREATE INDEX agent_transaction_drafts_operating_company_id_idx
  ON finance.agent_transaction_drafts (operating_company_id);

DO $after$
DECLARE
  security_after text;
BEGIN
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
         AND attribute.attnotnull = false
         AND attribute.atthasdef = false
         AND attribute.attgenerated = ''
     ) <> 1
     OR (
       SELECT count(*)
       FROM pg_constraint AS company_fk
       JOIN pg_class AS owning ON owning.oid = company_fk.conrelid
       JOIN pg_namespace AS owning_namespace ON owning_namespace.oid = owning.relnamespace
       JOIN pg_attribute AS local_column
         ON local_column.attrelid = owning.oid
        AND local_column.attnum = company_fk.conkey[1]
       JOIN pg_class AS referenced ON referenced.oid = company_fk.confrelid
       JOIN pg_namespace AS referenced_namespace ON referenced_namespace.oid = referenced.relnamespace
       JOIN pg_attribute AS referenced_column
         ON referenced_column.attrelid = referenced.oid
        AND referenced_column.attnum = company_fk.confkey[1]
       WHERE owning_namespace.nspname = 'finance'
         AND owning.relname = 'agent_transaction_drafts'
         AND company_fk.conname = 'agent_transaction_drafts_operating_company_fk'
         AND company_fk.contype = 'f'
         AND company_fk.convalidated = true
         AND company_fk.confdeltype = 'r'
         AND company_fk.condeferrable = false
         AND company_fk.condeferred = false
         AND cardinality(company_fk.conkey) = 1
         AND cardinality(company_fk.confkey) = 1
         AND local_column.attname = 'operating_company_id'
         AND referenced_namespace.nspname = 'registry'
         AND referenced.relname = 'companies'
         AND referenced_column.attname = 'company_id'
     ) <> 1
     OR (
       SELECT count(*)
       FROM pg_index AS index_row
       JOIN pg_class AS index_relation ON index_relation.oid = index_row.indexrelid
       JOIN pg_namespace AS index_namespace ON index_namespace.oid = index_relation.relnamespace
       JOIN pg_class AS table_relation ON table_relation.oid = index_row.indrelid
       JOIN pg_namespace AS table_namespace ON table_namespace.oid = table_relation.relnamespace
       JOIN pg_attribute AS indexed_column
         ON indexed_column.attrelid = table_relation.oid
        AND indexed_column.attnum = index_row.indkey[0]
       WHERE index_namespace.nspname = 'finance'
         AND table_namespace.nspname = 'finance'
         AND table_relation.relname = 'agent_transaction_drafts'
         AND index_relation.relname = 'agent_transaction_drafts_operating_company_id_idx'
         AND indexed_column.attname = 'operating_company_id'
         AND index_row.indisvalid = true
         AND index_row.indisready = true
         AND index_row.indisunique = false
         AND index_row.indexprs IS NULL
         AND index_row.indpred IS NULL
         AND index_row.indnkeyatts = 1
         AND index_row.indnatts = 1
     ) <> 1
     OR (SELECT count(*) FROM finance.agent_transaction_drafts) <> 2
     OR (SELECT count(*) FROM finance.agent_transaction_drafts WHERE operating_company_id IS NULL) <> 2
     OR coalesce((
       SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.id))
       FROM finance.agent_transaction_drafts AS row_alias
     ), 'empty') IS DISTINCT FROM 'ca713ec102eb2bda0bdfe72fe53a4847'
     OR coalesce((
       SELECT md5(string_agg(
         attribute.attnum::text || ':' || attribute.attname || ':' || attribute.atttypid::text || ':' ||
         attribute.attnotnull::text || ':' || attribute.atthasdef::text || ':' || attribute.attgenerated::text,
         ',' ORDER BY attribute.attnum
       ))
       FROM pg_attribute AS attribute
       JOIN pg_class AS relation ON relation.oid = attribute.attrelid
       JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
       WHERE namespace.nspname = 'finance'
         AND relation.relname = 'agent_transaction_drafts'
         AND attribute.attname <> 'operating_company_id'
         AND attribute.attnum > 0
         AND NOT attribute.attisdropped
     ), 'empty') IS DISTINCT FROM '1a2ef18cfd242bbcfa68df96e051ad20' THEN
    RAISE EXCEPTION 'BLOCKED_BY_SCHEMA_DRIFT: requirement missing';
  END IF;

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
    INTO security_after
  FROM pg_class AS relation
  JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'finance'
    AND relation.relname = 'agent_transaction_drafts';

  IF security_after IS DISTINCT FROM '68b7d11d856c6c9065984bdbeb85daad'
     OR (
       SELECT count(*)
       FROM pg_proc AS proc
       JOIN pg_namespace AS namespace ON namespace.oid = proc.pronamespace
       WHERE namespace.nspname = 'public'
         AND (
           (proc.proname = 'create_agent_transaction_draft'
             AND md5(proc.prosrc) = 'b21dc8fe041869cd7f790aca90e9372a'
             AND md5(pg_get_functiondef(proc.oid)) = 'a1ac6fe08d58ea0ee6865c77a628fa51'
             AND md5(pg_get_function_result(proc.oid)) = '79e5b914ba6ac4010adcafc63648c4e9')
           OR (proc.proname = 'list_agent_transaction_drafts'
             AND md5(proc.prosrc) = '7b18675c896d811d4795dd1f8ab2707b'
             AND md5(pg_get_functiondef(proc.oid)) = 'b519afd0a0b39d57c28d9ffa8a35ebfa'
             AND md5(pg_get_function_result(proc.oid)) = '61fdf727bfee7ed885e9e9502ca12ad0')
         )
     ) <> 2
     OR (SELECT count(*) FROM public.v_certified_ledger_transactions) <> 2254
     OR (SELECT sum(amount_eur) FROM public.v_certified_ledger_transactions) <> 12549078.54 THEN
    RAISE EXCEPTION 'BLOCKED_BY_GLOBAL_PIN';
  END IF;
END
$after$;

COMMIT;
