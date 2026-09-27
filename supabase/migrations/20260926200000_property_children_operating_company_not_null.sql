-- Slice 3.3: require operating_company_id on the nine property-child tables.
-- Aborts before SET NOT NULL when a precondition fails.
-- Does not add a column default, replace a function or trigger, or change row data.

BEGIN;

DO $require$
DECLARE
  jj_company uuid := '10f6e9b3-c5b9-4d95-a318-48f20f89477f';
  fp_before text;
  security_before text;
BEGIN
  IF to_regclass('public.property_owners') IS NULL
     OR to_regclass('public.property_ownership') IS NULL
     OR to_regclass('public.ownership') IS NULL
     OR to_regclass('public.property_name_aliases') IS NULL
     OR to_regclass('public.property_reporting_map') IS NULL
     OR to_regclass('lifecycle.property_acquisition') IS NULL
     OR to_regclass('lifecycle.service_engagements') IS NULL
     OR to_regclass('lifecycle.management_fee_configs') IS NULL
     OR to_regclass('pms.property_mappings') IS NULL
     OR to_regclass('registry.companies') IS NULL THEN
    RAISE EXCEPTION 'BLOCKED_BY_SCHEMA_DRIFT: child schema';
  END IF;

  LOCK TABLE lifecycle.management_fee_configs IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE lifecycle.property_acquisition IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE lifecycle.service_engagements IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE pms.property_mappings IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.ownership IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.property_name_aliases IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.property_owners IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.property_ownership IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.property_reporting_map IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE registry.companies IN SHARE ROW EXCLUSIVE MODE;

  IF (SELECT count(*) FROM supabase_migrations.schema_migrations) <> 181
     OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260925120000') <> 1
     OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260925140000') <> 1
     OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260926120000') <> 1
     OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260926140000') <> 1
     OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260926160000') <> 1
     OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260926180000') <> 1
     OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260926200000') <> 0 THEN
    RAISE EXCEPTION 'BLOCKED_BY_HISTORY';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_attribute AS attribute
    JOIN pg_class AS relation ON relation.oid = attribute.attrelid
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE attribute.attname = 'operating_company_id'
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped
      AND attribute.atttypid = 'uuid'::regtype
      AND NOT attribute.attnotnull
      AND NOT attribute.atthasdef
      AND attribute.attgenerated = ''
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
    WHERE company_fk.contype = 'f'
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
      AND (owning_namespace.nspname, owning.relname, company_fk.conname) IN (
        ('public', 'property_owners', 'property_owners_operating_company_fk'),
        ('public', 'property_ownership', 'property_ownership_operating_company_fk'),
        ('public', 'ownership', 'ownership_operating_company_fk'),
        ('public', 'property_name_aliases', 'property_name_aliases_operating_company_fk'),
        ('public', 'property_reporting_map', 'property_reporting_map_operating_company_fk'),
        ('lifecycle', 'property_acquisition', 'property_acquisition_operating_company_fk'),
        ('lifecycle', 'service_engagements', 'service_engagements_operating_company_fk'),
        ('lifecycle', 'management_fee_configs', 'management_fee_configs_operating_company_fk'),
        ('pms', 'property_mappings', 'property_mappings_operating_company_fk')
      )
  ) <> 9
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
    WHERE indexed_column.attname = 'operating_company_id'
      AND index_row.indisvalid = true
      AND index_row.indisready = true
      AND index_row.indisunique = false
      AND index_row.indexprs IS NULL
      AND index_row.indpred IS NULL
      AND index_row.indnkeyatts = 1
      AND index_row.indnatts = 1
      AND (index_namespace.nspname, table_namespace.nspname, table_relation.relname, index_relation.relname) IN (
        ('public', 'public', 'property_owners', 'property_owners_operating_company_id_idx'),
        ('public', 'public', 'property_ownership', 'property_ownership_operating_company_id_idx'),
        ('public', 'public', 'ownership', 'ownership_operating_company_id_idx'),
        ('public', 'public', 'property_name_aliases', 'property_name_aliases_operating_company_id_idx'),
        ('public', 'public', 'property_reporting_map', 'property_reporting_map_operating_company_id_idx'),
        ('lifecycle', 'lifecycle', 'property_acquisition', 'property_acquisition_operating_company_id_idx'),
        ('lifecycle', 'lifecycle', 'service_engagements', 'service_engagements_operating_company_id_idx'),
        ('lifecycle', 'lifecycle', 'management_fee_configs', 'management_fee_configs_operating_company_id_idx'),
        ('pms', 'pms', 'property_mappings', 'property_mappings_operating_company_id_idx')
      )
  ) <> 9 THEN
    RAISE EXCEPTION 'BLOCKED_BY_SCHEMA_DRIFT: child schema';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_proc AS fn
    JOIN pg_namespace AS namespace ON namespace.oid = fn.pronamespace
    JOIN pg_roles AS owner_role ON owner_role.oid = fn.proowner
    WHERE namespace.nspname = 'registry'
      AND owner_role.rolname = 'postgres'
      AND fn.prosecdef
      AND fn.proconfig = ARRAY['search_path=pg_catalog']
      AND fn.proacl::text = '{postgres=X/postgres}'
      AND fn.prosrc NOT LIKE '%EXECUTE%'
      AND fn.prosrc NOT LIKE '%format(%'
      AND fn.prosrc NOT LIKE '%10f6e9b3-c5b9-4d95-a318-48f20f89477f%'
      AND (
        (fn.proname = 'resolve_child_operating_company' AND md5(fn.prosrc) = 'eacbfd7957ced1264a3b9c3339c37b01' AND md5(pg_get_functiondef(fn.oid)) = '236f0756e7d1041f6e8bd54b525ec38b')
        OR (fn.proname = 'enforce_child_operating_company' AND md5(fn.prosrc) = '4a2829f87bad19d9eac70716cb37688e' AND md5(pg_get_functiondef(fn.oid)) = 'bac27dded575f18f72857b5b517a54a2')
      )
  ) <> 2
  OR (SELECT count(*) FROM pg_proc WHERE proname LIKE '%operating_company%') <> 2
  OR EXISTS (
    SELECT 1
    FROM pg_proc AS fn
    JOIN pg_namespace AS namespace ON namespace.oid = fn.pronamespace
    CROSS JOIN LATERAL aclexplode(coalesce(fn.proacl, acldefault('f', fn.proowner))) AS acl
    WHERE namespace.nspname = 'registry'
      AND fn.proname IN ('resolve_child_operating_company', 'enforce_child_operating_company')
      AND acl.privilege_type = 'EXECUTE'
      AND (
        acl.grantee = 0
        OR acl.grantee IN (
          SELECT role_row.oid FROM pg_roles AS role_row
          WHERE role_row.rolname IN ('anon', 'authenticated', 'service_role')
        )
      )
  )
  OR (
    SELECT count(*)
    FROM pg_trigger AS trigger_row
    JOIN pg_class AS relation ON relation.oid = trigger_row.tgrelid
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    JOIN pg_proc AS fn ON fn.oid = trigger_row.tgfoid
    JOIN pg_namespace AS fn_namespace ON fn_namespace.oid = fn.pronamespace
    WHERE NOT trigger_row.tgisinternal
      AND trigger_row.tgenabled = 'O'
      AND (trigger_row.tgtype & 2) = 2
      AND fn_namespace.nspname = 'registry'
      AND fn.proname = 'enforce_child_operating_company'
      AND pg_get_triggerdef(trigger_row.oid) LIKE '%BEFORE INSERT OR UPDATE%'
      AND pg_get_triggerdef(trigger_row.oid) LIKE '%EXECUTE FUNCTION registry.enforce_child_operating_company()%'
      AND (namespace.nspname, relation.relname, trigger_row.tgname) IN (
        ('public', 'property_owners', 'trg_property_owners_operating_company'),
        ('public', 'property_ownership', 'trg_property_ownership_operating_company'),
        ('public', 'ownership', 'trg_ownership_operating_company'),
        ('public', 'property_name_aliases', 'trg_property_name_aliases_operating_company'),
        ('public', 'property_reporting_map', 'trg_property_reporting_map_operating_company'),
        ('lifecycle', 'property_acquisition', 'trg_property_acquisition_operating_company'),
        ('lifecycle', 'service_engagements', 'trg_service_engagements_operating_company'),
        ('lifecycle', 'management_fee_configs', 'trg_management_fee_configs_operating_company'),
        ('pms', 'property_mappings', 'trg_property_mappings_operating_company')
      )
  ) <> 9
  OR (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgname LIKE '%operating_company%') <> 9
  OR NOT EXISTS (
    SELECT 1
    FROM pg_trigger AS trigger_row
    JOIN pg_class AS relation ON relation.oid = trigger_row.tgrelid
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'lifecycle'
      AND relation.relname = 'service_engagements'
      AND trigger_row.tgname = 'trg_ira_audit_se'
      AND trigger_row.tgenabled = 'O'
      AND (trigger_row.tgtype & 2) = 0
  ) THEN
    RAISE EXCEPTION 'BLOCKED_BY_ENFORCEMENT';
  END IF;

  IF (SELECT count(*) FROM public.property_owners) <> 92
     OR (SELECT count(*) FROM public.property_ownership) <> 73
     OR (SELECT count(*) FROM public.ownership) <> 0
     OR (SELECT count(*) FROM public.property_name_aliases) <> 54
     OR (SELECT count(*) FROM public.property_reporting_map) <> 9
     OR (SELECT count(*) FROM lifecycle.property_acquisition) <> 2
     OR (SELECT count(*) FROM lifecycle.service_engagements) <> 24
     OR (SELECT count(*) FROM lifecycle.management_fee_configs) <> 0
     OR (SELECT count(*) FROM pms.property_mappings) <> 8
     OR (SELECT count(*) FROM public.property_owners WHERE operating_company_id = jj_company) <> 92
     OR (SELECT count(*) FROM public.property_ownership WHERE operating_company_id = jj_company) <> 73
     OR (SELECT count(*) FROM public.ownership WHERE operating_company_id = jj_company) <> 0
     OR (SELECT count(*) FROM public.property_name_aliases WHERE operating_company_id = jj_company) <> 54
     OR (SELECT count(*) FROM public.property_reporting_map WHERE operating_company_id = jj_company) <> 9
     OR (SELECT count(*) FROM lifecycle.property_acquisition WHERE operating_company_id = jj_company) <> 2
     OR (SELECT count(*) FROM lifecycle.service_engagements WHERE operating_company_id = jj_company) <> 24
     OR (SELECT count(*) FROM lifecycle.management_fee_configs WHERE operating_company_id = jj_company) <> 0
     OR (SELECT count(*) FROM pms.property_mappings WHERE operating_company_id = jj_company) <> 8
     OR (SELECT count(*) FROM public.property_owners WHERE operating_company_id IS NULL) <> 0
     OR (SELECT count(*) FROM public.property_ownership WHERE operating_company_id IS NULL) <> 0
     OR (SELECT count(*) FROM public.ownership WHERE operating_company_id IS NULL) <> 0
     OR (SELECT count(*) FROM public.property_name_aliases WHERE operating_company_id IS NULL) <> 0
     OR (SELECT count(*) FROM public.property_reporting_map WHERE operating_company_id IS NULL) <> 0
     OR (SELECT count(*) FROM lifecycle.property_acquisition WHERE operating_company_id IS NULL) <> 0
     OR (SELECT count(*) FROM lifecycle.service_engagements WHERE operating_company_id IS NULL) <> 0
     OR (SELECT count(*) FROM lifecycle.management_fee_configs WHERE operating_company_id IS NULL) <> 0
     OR (SELECT count(*) FROM pms.property_mappings WHERE operating_company_id IS NULL) <> 0
     OR (SELECT count(*) FROM public.property_owners WHERE operating_company_id IS DISTINCT FROM jj_company) <> 0
     OR (SELECT count(*) FROM public.property_ownership WHERE operating_company_id IS DISTINCT FROM jj_company) <> 0
     OR (SELECT count(*) FROM public.ownership WHERE operating_company_id IS DISTINCT FROM jj_company) <> 0
     OR (SELECT count(*) FROM public.property_name_aliases WHERE operating_company_id IS DISTINCT FROM jj_company) <> 0
     OR (SELECT count(*) FROM public.property_reporting_map WHERE operating_company_id IS DISTINCT FROM jj_company) <> 0
     OR (SELECT count(*) FROM lifecycle.property_acquisition WHERE operating_company_id IS DISTINCT FROM jj_company) <> 0
     OR (SELECT count(*) FROM lifecycle.service_engagements WHERE operating_company_id IS DISTINCT FROM jj_company) <> 0
     OR (SELECT count(*) FROM lifecycle.management_fee_configs WHERE operating_company_id IS DISTINCT FROM jj_company) <> 0
     OR (SELECT count(*) FROM pms.property_mappings WHERE operating_company_id IS DISTINCT FROM jj_company) <> 0
     OR coalesce((SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.id)) FROM public.property_owners AS row_alias), 'empty') IS DISTINCT FROM '31b8827fa973e121a86ba69c4deed614'
     OR coalesce((SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.id)) FROM public.property_ownership AS row_alias), 'empty') IS DISTINCT FROM '63b32d57a79d9d97a24abb3ccfe64068'
     OR coalesce((SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.id)) FROM public.ownership AS row_alias), 'empty') IS DISTINCT FROM 'empty'
     OR coalesce((SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.raw_name)) FROM public.property_name_aliases AS row_alias), 'empty') IS DISTINCT FROM 'f568854433780817e672be299f58f6e6'
     OR coalesce((SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.raw_name)) FROM public.property_reporting_map AS row_alias), 'empty') IS DISTINCT FROM '39c5feab941b420b39dc4c22c2cee4b6'
     OR coalesce((SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.id)) FROM lifecycle.property_acquisition AS row_alias), 'empty') IS DISTINCT FROM '941ae95b7bd482adc8b8073a05f42b25'
     OR coalesce((SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.id)) FROM lifecycle.service_engagements AS row_alias), 'empty') IS DISTINCT FROM '717ec3abea569ffe3a67234e7c4f668b'
     OR coalesce((SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.id)) FROM lifecycle.management_fee_configs AS row_alias), 'empty') IS DISTINCT FROM 'empty'
     OR coalesce((SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.id)) FROM pms.property_mappings AS row_alias), 'empty') IS DISTINCT FROM 'fd13bed849f9c53dbfaa91722703d9f0' THEN
    RAISE EXCEPTION 'BLOCKED_BY_ASSIGNMENT';
  END IF;

  IF (SELECT count(*) FROM public.properties) <> 40
     OR (SELECT count(*) FROM public.properties WHERE operating_company_id = jj_company) <> 40
     OR (SELECT count(*) FROM public.property_definitions) <> 45
     OR (SELECT count(*) FROM public.property_definitions WHERE operating_company_id = jj_company) <> 45
     OR (
       SELECT count(*)
       FROM pg_attribute AS attribute
       JOIN pg_class AS relation ON relation.oid = attribute.attrelid
       JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
       WHERE namespace.nspname = 'public'
         AND relation.relname IN ('properties', 'property_definitions')
         AND attribute.attname = 'operating_company_id'
         AND attribute.atttypid = 'uuid'::regtype
         AND attribute.attnotnull
         AND NOT attribute.atthasdef
         AND attribute.attgenerated = ''
     ) <> 2 THEN
    RAISE EXCEPTION 'BLOCKED_BY_SCHEMA_DRIFT: roots';
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
    INTO security_before
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
  );

  IF security_before IS DISTINCT FROM '10311e91f916ade2a6a2b8c8748ff1c7'
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
     OR (SELECT count(*) FROM pms.connections) <> 1
     OR (SELECT count(*) FROM pms.property_mappings) <> 8 THEN
    RAISE EXCEPTION 'BLOCKED_BY_GLOBAL_PIN';
  END IF;

  SELECT md5(concat_ws('|',
    coalesce((SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.id)) FROM public.property_owners AS row_alias), 'empty'),
    coalesce((SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.id)) FROM public.property_ownership AS row_alias), 'empty'),
    coalesce((SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.id)) FROM public.ownership AS row_alias), 'empty'),
    coalesce((SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.raw_name)) FROM public.property_name_aliases AS row_alias), 'empty'),
    coalesce((SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.raw_name)) FROM public.property_reporting_map AS row_alias), 'empty'),
    coalesce((SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.id)) FROM lifecycle.property_acquisition AS row_alias), 'empty'),
    coalesce((SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.id)) FROM lifecycle.service_engagements AS row_alias), 'empty'),
    coalesce((SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.id)) FROM lifecycle.management_fee_configs AS row_alias), 'empty'),
    coalesce((SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.id)) FROM pms.property_mappings AS row_alias), 'empty')
  )) INTO fp_before;
  PERFORM set_config('jj.p33_fp', fp_before, true);
  PERFORM set_config('jj.p33_security', security_before, true);

  ALTER TABLE public.property_owners
    ALTER COLUMN operating_company_id SET NOT NULL;
  ALTER TABLE public.property_ownership
    ALTER COLUMN operating_company_id SET NOT NULL;
  ALTER TABLE public.ownership
    ALTER COLUMN operating_company_id SET NOT NULL;
  ALTER TABLE public.property_name_aliases
    ALTER COLUMN operating_company_id SET NOT NULL;
  ALTER TABLE public.property_reporting_map
    ALTER COLUMN operating_company_id SET NOT NULL;
  ALTER TABLE lifecycle.property_acquisition
    ALTER COLUMN operating_company_id SET NOT NULL;
  ALTER TABLE lifecycle.service_engagements
    ALTER COLUMN operating_company_id SET NOT NULL;
  ALTER TABLE lifecycle.management_fee_configs
    ALTER COLUMN operating_company_id SET NOT NULL;
  ALTER TABLE pms.property_mappings
    ALTER COLUMN operating_company_id SET NOT NULL;

  IF (
    SELECT count(*)
    FROM pg_attribute AS attribute
    JOIN pg_class AS relation ON relation.oid = attribute.attrelid
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE attribute.attname = 'operating_company_id'
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped
      AND attribute.atttypid = 'uuid'::regtype
      AND attribute.attnotnull
      AND NOT attribute.atthasdef
      AND attribute.attgenerated = ''
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
  OR (SELECT count(*) FROM public.property_owners WHERE operating_company_id = jj_company) <> 92
  OR (SELECT count(*) FROM public.property_ownership WHERE operating_company_id = jj_company) <> 73
  OR (SELECT count(*) FROM public.ownership WHERE operating_company_id = jj_company) <> 0
  OR (SELECT count(*) FROM public.property_name_aliases WHERE operating_company_id = jj_company) <> 54
  OR (SELECT count(*) FROM public.property_reporting_map WHERE operating_company_id = jj_company) <> 9
  OR (SELECT count(*) FROM lifecycle.property_acquisition WHERE operating_company_id = jj_company) <> 2
  OR (SELECT count(*) FROM lifecycle.service_engagements WHERE operating_company_id = jj_company) <> 24
  OR (SELECT count(*) FROM lifecycle.management_fee_configs WHERE operating_company_id = jj_company) <> 0
  OR (SELECT count(*) FROM pms.property_mappings WHERE operating_company_id = jj_company) <> 8
  OR (SELECT count(*) FROM public.property_owners WHERE operating_company_id IS NULL) <> 0
  OR (SELECT count(*) FROM public.property_ownership WHERE operating_company_id IS NULL) <> 0
  OR (SELECT count(*) FROM public.ownership WHERE operating_company_id IS NULL) <> 0
  OR (SELECT count(*) FROM public.property_name_aliases WHERE operating_company_id IS NULL) <> 0
  OR (SELECT count(*) FROM public.property_reporting_map WHERE operating_company_id IS NULL) <> 0
  OR (SELECT count(*) FROM lifecycle.property_acquisition WHERE operating_company_id IS NULL) <> 0
  OR (SELECT count(*) FROM lifecycle.service_engagements WHERE operating_company_id IS NULL) <> 0
  OR (SELECT count(*) FROM lifecycle.management_fee_configs WHERE operating_company_id IS NULL) <> 0
  OR (SELECT count(*) FROM pms.property_mappings WHERE operating_company_id IS NULL) <> 0
  OR current_setting('jj.p33_fp') IS DISTINCT FROM md5(concat_ws('|',
    coalesce((SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.id)) FROM public.property_owners AS row_alias), 'empty'),
    coalesce((SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.id)) FROM public.property_ownership AS row_alias), 'empty'),
    coalesce((SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.id)) FROM public.ownership AS row_alias), 'empty'),
    coalesce((SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.raw_name)) FROM public.property_name_aliases AS row_alias), 'empty'),
    coalesce((SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.raw_name)) FROM public.property_reporting_map AS row_alias), 'empty'),
    coalesce((SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.id)) FROM lifecycle.property_acquisition AS row_alias), 'empty'),
    coalesce((SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.id)) FROM lifecycle.service_engagements AS row_alias), 'empty'),
    coalesce((SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.id)) FROM lifecycle.management_fee_configs AS row_alias), 'empty'),
    coalesce((SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.id)) FROM pms.property_mappings AS row_alias), 'empty')
  ))
  OR current_setting('jj.p33_security') IS DISTINCT FROM '10311e91f916ade2a6a2b8c8748ff1c7'
  OR to_regprocedure('registry.enforce_child_operating_company()') IS NULL
  OR (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgname LIKE '%operating_company%') <> 9 THEN
    RAISE EXCEPTION 'BLOCKED_BY_SCHEMA_DRIFT: requirement missing';
  END IF;
END
$require$;

COMMIT;
