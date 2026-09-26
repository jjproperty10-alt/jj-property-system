-- Slice 3.1: assign the existing property-child rows to the single active JJ company.
-- One-time legacy estate assignment. It does not infer a company from a property name.
-- Aborts before any update when a precondition fails.
-- Does not prescribe an omitted column value, change nullability, or change row-level security.

BEGIN;

DO $backfill$
DECLARE
  jj_company uuid := '10f6e9b3-c5b9-4d95-a318-48f20f89477f';
  updated_property_owners integer;
  updated_property_ownership integer;
  updated_ownership integer;
  updated_property_name_aliases integer;
  updated_property_reporting_map integer;
  updated_property_acquisition integer;
  updated_service_engagements integer;
  updated_management_fee_configs integer;
  updated_property_mappings integer;
  fp_property_owners text;
  fp_property_ownership text;
  fp_ownership text;
  fp_property_name_aliases text;
  fp_property_reporting_map text;
  fp_property_acquisition text;
  fp_service_engagements text;
  fp_management_fee_configs text;
  fp_property_mappings text;
BEGIN
  IF to_regclass('public.property_owners') IS NULL
     OR to_regclass('public.property_ownership') IS NULL
     OR to_regclass('public.ownership') IS NULL
     OR to_regclass('public.property_name_aliases') IS NULL
     OR to_regclass('public.property_reporting_map') IS NULL
     OR to_regclass('lifecycle.property_acquisition') IS NULL
     OR to_regclass('lifecycle.service_engagements') IS NULL
     OR to_regclass('lifecycle.management_fee_configs') IS NULL
     OR to_regclass('pms.property_mappings') IS NULL THEN
    RAISE EXCEPTION 'BLOCKED_BY_BACKFILL: child schema';
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

  IF (
    SELECT count(*)
    FROM pg_attribute AS attribute
    JOIN pg_class AS relation ON relation.oid = attribute.attrelid
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE attribute.attname = 'operating_company_id'
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped
      AND attribute.atttypid = 'uuid'::regtype
      AND attribute.attnotnull = false
      AND attribute.atthasdef = false
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
    RAISE EXCEPTION 'BLOCKED_BY_BACKFILL: child schema';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_attribute AS attribute
    JOIN pg_class AS relation ON relation.oid = attribute.attrelid
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname IN ('properties', 'property_definitions')
      AND attribute.attname = 'operating_company_id'
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped
      AND attribute.atttypid = 'uuid'::regtype
      AND attribute.attnotnull
      AND NOT attribute.atthasdef
      AND attribute.attgenerated = ''
  ) <> 2 THEN
    RAISE EXCEPTION 'BLOCKED_BY_BACKFILL: root column';
  END IF;

  IF (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260925120000') <> 1
     OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260925140000') <> 1
     OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260926120000') <> 1
     OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260926140000') <> 1
     OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260926160000') <> 0 THEN
    RAISE EXCEPTION 'BLOCKED_BY_BACKFILL: history';
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
     OR (SELECT count(*) FROM pms.connections) <> 1
     OR (SELECT count(*) FROM pms.property_mappings) <> 8 THEN
    RAISE EXCEPTION 'BLOCKED_BY_BACKFILL: global pin';
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
     OR (
       (SELECT count(*) FROM public.property_owners)
       + (SELECT count(*) FROM public.property_ownership)
       + (SELECT count(*) FROM public.ownership)
       + (SELECT count(*) FROM public.property_name_aliases)
       + (SELECT count(*) FROM public.property_reporting_map)
       + (SELECT count(*) FROM lifecycle.property_acquisition)
       + (SELECT count(*) FROM lifecycle.service_engagements)
       + (SELECT count(*) FROM lifecycle.management_fee_configs)
       + (SELECT count(*) FROM pms.property_mappings)
     ) <> 262 THEN
    RAISE EXCEPTION 'BLOCKED_BY_BACKFILL: row count';
  END IF;

  IF (SELECT count(*) FROM public.property_owners WHERE operating_company_id IS NOT NULL) <> 0
     OR (SELECT count(*) FROM public.property_ownership WHERE operating_company_id IS NOT NULL) <> 0
     OR (SELECT count(*) FROM public.ownership WHERE operating_company_id IS NOT NULL) <> 0
     OR (SELECT count(*) FROM public.property_name_aliases WHERE operating_company_id IS NOT NULL) <> 0
     OR (SELECT count(*) FROM public.property_reporting_map WHERE operating_company_id IS NOT NULL) <> 0
     OR (SELECT count(*) FROM lifecycle.property_acquisition WHERE operating_company_id IS NOT NULL) <> 0
     OR (SELECT count(*) FROM lifecycle.service_engagements WHERE operating_company_id IS NOT NULL) <> 0
     OR (SELECT count(*) FROM lifecycle.management_fee_configs WHERE operating_company_id IS NOT NULL) <> 0
     OR (SELECT count(*) FROM pms.property_mappings WHERE operating_company_id IS NOT NULL) <> 0
     OR (SELECT count(*) FROM public.property_owners WHERE operating_company_id = jj_company) <> 0
     OR (SELECT count(*) FROM public.property_ownership WHERE operating_company_id = jj_company) <> 0
     OR (SELECT count(*) FROM public.ownership WHERE operating_company_id = jj_company) <> 0
     OR (SELECT count(*) FROM public.property_name_aliases WHERE operating_company_id = jj_company) <> 0
     OR (SELECT count(*) FROM public.property_reporting_map WHERE operating_company_id = jj_company) <> 0
     OR (SELECT count(*) FROM lifecycle.property_acquisition WHERE operating_company_id = jj_company) <> 0
     OR (SELECT count(*) FROM lifecycle.service_engagements WHERE operating_company_id = jj_company) <> 0
     OR (SELECT count(*) FROM lifecycle.management_fee_configs WHERE operating_company_id = jj_company) <> 0
     OR (SELECT count(*) FROM pms.property_mappings WHERE operating_company_id = jj_company) <> 0
     OR (SELECT count(*) FROM public.property_owners WHERE operating_company_id IS NOT NULL AND operating_company_id <> jj_company) <> 0
     OR (SELECT count(*) FROM public.property_ownership WHERE operating_company_id IS NOT NULL AND operating_company_id <> jj_company) <> 0
     OR (SELECT count(*) FROM public.ownership WHERE operating_company_id IS NOT NULL AND operating_company_id <> jj_company) <> 0
     OR (SELECT count(*) FROM public.property_name_aliases WHERE operating_company_id IS NOT NULL AND operating_company_id <> jj_company) <> 0
     OR (SELECT count(*) FROM public.property_reporting_map WHERE operating_company_id IS NOT NULL AND operating_company_id <> jj_company) <> 0
     OR (SELECT count(*) FROM lifecycle.property_acquisition WHERE operating_company_id IS NOT NULL AND operating_company_id <> jj_company) <> 0
     OR (SELECT count(*) FROM lifecycle.service_engagements WHERE operating_company_id IS NOT NULL AND operating_company_id <> jj_company) <> 0
     OR (SELECT count(*) FROM lifecycle.management_fee_configs WHERE operating_company_id IS NOT NULL AND operating_company_id <> jj_company) <> 0
     OR (SELECT count(*) FROM pms.property_mappings WHERE operating_company_id IS NOT NULL AND operating_company_id <> jj_company) <> 0 THEN
    RAISE EXCEPTION 'BLOCKED_BY_BACKFILL: preexisting assignment';
  END IF;

  IF (SELECT count(*) FROM registry.companies) <> 1
     OR (
       SELECT count(*)
       FROM registry.companies
       WHERE company_id = jj_company
         AND status = 'active'
     ) <> 1 THEN
    RAISE EXCEPTION 'BLOCKED_BY_BACKFILL: company registry';
  END IF;

  IF (SELECT count(*) FROM access.company_memberships) <> 1
     OR (
       SELECT count(*)
       FROM access.company_memberships
       WHERE company_id = jj_company
         AND membership_role = 'company_admin'
         AND is_active
     ) <> 1 THEN
    RAISE EXCEPTION 'BLOCKED_BY_BACKFILL: membership';
  END IF;

  IF (SELECT count(*) FROM public.properties) <> 40
     OR (SELECT count(*) FROM public.properties WHERE operating_company_id = jj_company) <> 40
     OR (SELECT count(*) FROM public.property_definitions) <> 45
     OR (SELECT count(*) FROM public.property_definitions WHERE operating_company_id = jj_company) <> 45 THEN
    RAISE EXCEPTION 'BLOCKED_BY_BACKFILL: root registry';
  END IF;

  SELECT coalesce(md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.id)), 'empty')
    INTO fp_property_owners
  FROM public.property_owners AS row_alias;
  SELECT coalesce(md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.id)), 'empty')
    INTO fp_property_ownership
  FROM public.property_ownership AS row_alias;
  SELECT coalesce(md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.id)), 'empty')
    INTO fp_ownership
  FROM public.ownership AS row_alias;
  SELECT coalesce(md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.raw_name)), 'empty')
    INTO fp_property_name_aliases
  FROM public.property_name_aliases AS row_alias;
  SELECT coalesce(md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.raw_name)), 'empty')
    INTO fp_property_reporting_map
  FROM public.property_reporting_map AS row_alias;
  SELECT coalesce(md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.id)), 'empty')
    INTO fp_property_acquisition
  FROM lifecycle.property_acquisition AS row_alias;
  SELECT coalesce(md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.id)), 'empty')
    INTO fp_service_engagements
  FROM lifecycle.service_engagements AS row_alias;
  SELECT coalesce(md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.id)), 'empty')
    INTO fp_management_fee_configs
  FROM lifecycle.management_fee_configs AS row_alias;
  SELECT coalesce(md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.id)), 'empty')
    INTO fp_property_mappings
  FROM pms.property_mappings AS row_alias;

  UPDATE public.property_owners
  SET operating_company_id = jj_company
  WHERE operating_company_id IS NULL;
  GET DIAGNOSTICS updated_property_owners = ROW_COUNT;

  UPDATE public.property_ownership
  SET operating_company_id = jj_company
  WHERE operating_company_id IS NULL;
  GET DIAGNOSTICS updated_property_ownership = ROW_COUNT;

  UPDATE public.ownership
  SET operating_company_id = jj_company
  WHERE operating_company_id IS NULL;
  GET DIAGNOSTICS updated_ownership = ROW_COUNT;

  UPDATE public.property_name_aliases
  SET operating_company_id = jj_company
  WHERE operating_company_id IS NULL;
  GET DIAGNOSTICS updated_property_name_aliases = ROW_COUNT;

  UPDATE public.property_reporting_map
  SET operating_company_id = jj_company
  WHERE operating_company_id IS NULL;
  GET DIAGNOSTICS updated_property_reporting_map = ROW_COUNT;

  UPDATE lifecycle.property_acquisition
  SET operating_company_id = jj_company
  WHERE operating_company_id IS NULL;
  GET DIAGNOSTICS updated_property_acquisition = ROW_COUNT;

  UPDATE lifecycle.service_engagements
  SET operating_company_id = jj_company
  WHERE operating_company_id IS NULL;
  GET DIAGNOSTICS updated_service_engagements = ROW_COUNT;

  UPDATE lifecycle.management_fee_configs
  SET operating_company_id = jj_company
  WHERE operating_company_id IS NULL;
  GET DIAGNOSTICS updated_management_fee_configs = ROW_COUNT;

  UPDATE pms.property_mappings
  SET operating_company_id = jj_company
  WHERE operating_company_id IS NULL;
  GET DIAGNOSTICS updated_property_mappings = ROW_COUNT;

  IF updated_property_owners <> 92
     OR updated_property_ownership <> 73
     OR updated_ownership <> 0
     OR updated_property_name_aliases <> 54
     OR updated_property_reporting_map <> 9
     OR updated_property_acquisition <> 2
     OR updated_service_engagements <> 24
     OR updated_management_fee_configs <> 0
     OR updated_property_mappings <> 8
     OR updated_property_owners
        + updated_property_ownership
        + updated_ownership
        + updated_property_name_aliases
        + updated_property_reporting_map
        + updated_property_acquisition
        + updated_service_engagements
        + updated_management_fee_configs
        + updated_property_mappings <> 262 THEN
    RAISE EXCEPTION 'BLOCKED_BY_BACKFILL: update count';
  END IF;

  IF (SELECT count(*) FROM public.property_owners WHERE operating_company_id = jj_company) <> 92
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
     OR (SELECT count(*) FROM public.property_owners) <> 92
     OR (SELECT count(*) FROM public.property_ownership) <> 73
     OR (SELECT count(*) FROM public.ownership) <> 0
     OR (SELECT count(*) FROM public.property_name_aliases) <> 54
     OR (SELECT count(*) FROM public.property_reporting_map) <> 9
     OR (SELECT count(*) FROM lifecycle.property_acquisition) <> 2
     OR (SELECT count(*) FROM lifecycle.service_engagements) <> 24
     OR (SELECT count(*) FROM lifecycle.management_fee_configs) <> 0
     OR (SELECT count(*) FROM pms.property_mappings) <> 8 THEN
    RAISE EXCEPTION 'BLOCKED_BY_BACKFILL: assignment result';
  END IF;

  IF fp_property_owners IS DISTINCT FROM (
       SELECT coalesce(md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.id)), 'empty')
       FROM public.property_owners AS row_alias
     )
     OR fp_property_ownership IS DISTINCT FROM (
       SELECT coalesce(md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.id)), 'empty')
       FROM public.property_ownership AS row_alias
     )
     OR fp_ownership IS DISTINCT FROM (
       SELECT coalesce(md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.id)), 'empty')
       FROM public.ownership AS row_alias
     )
     OR fp_property_name_aliases IS DISTINCT FROM (
       SELECT coalesce(md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.raw_name)), 'empty')
       FROM public.property_name_aliases AS row_alias
     )
     OR fp_property_reporting_map IS DISTINCT FROM (
       SELECT coalesce(md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.raw_name)), 'empty')
       FROM public.property_reporting_map AS row_alias
     )
     OR fp_property_acquisition IS DISTINCT FROM (
       SELECT coalesce(md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.id)), 'empty')
       FROM lifecycle.property_acquisition AS row_alias
     )
     OR fp_service_engagements IS DISTINCT FROM (
       SELECT coalesce(md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.id)), 'empty')
       FROM lifecycle.service_engagements AS row_alias
     )
     OR fp_management_fee_configs IS DISTINCT FROM (
       SELECT coalesce(md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.id)), 'empty')
       FROM lifecycle.management_fee_configs AS row_alias
     )
     OR fp_property_mappings IS DISTINCT FROM (
       SELECT coalesce(md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.id)), 'empty')
       FROM pms.property_mappings AS row_alias
     ) THEN
    RAISE EXCEPTION 'BLOCKED_BY_BACKFILL: fingerprint';
  END IF;
END
$backfill$;

COMMIT;
