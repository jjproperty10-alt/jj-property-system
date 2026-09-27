-- Slice 3.3 rollback: restore nullable operating_company_id on the nine child tables.
-- Aborts before DROP NOT NULL when a precondition fails.
-- Does not drop the column, its assignment, foreign key, index, trigger, or function.

BEGIN;

DO $rollback$
DECLARE
  jj_company uuid := '10f6e9b3-c5b9-4d95-a318-48f20f89477f';
  fp_before text;
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
    RAISE EXCEPTION 'BLOCKED_BY_ROLLBACK: child schema';
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

  IF (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260926200000') <> 1
     OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260926180000') <> 1 THEN
    RAISE EXCEPTION 'BLOCKED_BY_ROLLBACK: history';
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
  ) <> 9 THEN
    RAISE EXCEPTION 'BLOCKED_BY_ROLLBACK: column state';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_constraint AS company_fk
    JOIN pg_class AS owning ON owning.oid = company_fk.conrelid
    JOIN pg_namespace AS owning_namespace ON owning_namespace.oid = owning.relnamespace
    WHERE company_fk.contype = 'f'
      AND company_fk.convalidated
      AND company_fk.confdeltype = 'r'
      AND NOT company_fk.condeferrable
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
    JOIN pg_class AS table_relation ON table_relation.oid = index_row.indrelid
    JOIN pg_namespace AS table_namespace ON table_namespace.oid = table_relation.relnamespace
    WHERE index_row.indisvalid
      AND index_row.indisready
      AND NOT index_row.indisunique
      AND index_row.indnkeyatts = 1
      AND (table_namespace.nspname, table_relation.relname, index_relation.relname) IN (
        ('public', 'property_owners', 'property_owners_operating_company_id_idx'),
        ('public', 'property_ownership', 'property_ownership_operating_company_id_idx'),
        ('public', 'ownership', 'ownership_operating_company_id_idx'),
        ('public', 'property_name_aliases', 'property_name_aliases_operating_company_id_idx'),
        ('public', 'property_reporting_map', 'property_reporting_map_operating_company_id_idx'),
        ('lifecycle', 'property_acquisition', 'property_acquisition_operating_company_id_idx'),
        ('lifecycle', 'service_engagements', 'service_engagements_operating_company_id_idx'),
        ('lifecycle', 'management_fee_configs', 'management_fee_configs_operating_company_id_idx'),
        ('pms', 'property_mappings', 'property_mappings_operating_company_id_idx')
      )
  ) <> 9 THEN
    RAISE EXCEPTION 'BLOCKED_BY_ROLLBACK: child schema';
  END IF;

  IF to_regprocedure('registry.enforce_child_operating_company()') IS NULL
     OR to_regprocedure('registry.resolve_child_operating_company(uuid,uuid,boolean)') IS NULL
     OR (
       SELECT count(*)
       FROM pg_proc AS fn
       JOIN pg_namespace AS namespace ON namespace.oid = fn.pronamespace
       WHERE namespace.nspname = 'registry'
         AND fn.proname IN ('resolve_child_operating_company', 'enforce_child_operating_company')
         AND fn.prosecdef
         AND fn.proconfig = ARRAY['search_path=pg_catalog']
         AND fn.proacl::text = '{postgres=X/postgres}'
     ) <> 2
     OR (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgname LIKE '%operating_company%' AND tgenabled = 'O') <> 9 THEN
    RAISE EXCEPTION 'BLOCKED_BY_ROLLBACK: enforcement';
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
     OR coalesce((SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.id)) FROM public.property_owners AS row_alias), 'empty') IS DISTINCT FROM '31b8827fa973e121a86ba69c4deed614'
     OR coalesce((SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.id)) FROM pms.property_mappings AS row_alias), 'empty') IS DISTINCT FROM 'fd13bed849f9c53dbfaa91722703d9f0' THEN
    RAISE EXCEPTION 'BLOCKED_BY_ROLLBACK: assignment';
  END IF;

  IF (SELECT count(*) FROM public.v_certified_ledger_transactions) <> 2254
     OR (SELECT sum(amount_eur) FROM public.v_certified_ledger_transactions) <> 12549078.54
     OR (SELECT count(*) FROM pms.connections) <> 1
     OR (SELECT count(*) FROM registry.companies WHERE company_id = jj_company AND status = 'active') <> 1 THEN
    RAISE EXCEPTION 'BLOCKED_BY_ROLLBACK: global pin';
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

  ALTER TABLE public.property_owners
    ALTER COLUMN operating_company_id DROP NOT NULL;
  ALTER TABLE public.property_ownership
    ALTER COLUMN operating_company_id DROP NOT NULL;
  ALTER TABLE public.ownership
    ALTER COLUMN operating_company_id DROP NOT NULL;
  ALTER TABLE public.property_name_aliases
    ALTER COLUMN operating_company_id DROP NOT NULL;
  ALTER TABLE public.property_reporting_map
    ALTER COLUMN operating_company_id DROP NOT NULL;
  ALTER TABLE lifecycle.property_acquisition
    ALTER COLUMN operating_company_id DROP NOT NULL;
  ALTER TABLE lifecycle.service_engagements
    ALTER COLUMN operating_company_id DROP NOT NULL;
  ALTER TABLE lifecycle.management_fee_configs
    ALTER COLUMN operating_company_id DROP NOT NULL;
  ALTER TABLE pms.property_mappings
    ALTER COLUMN operating_company_id DROP NOT NULL;

  IF (
    SELECT count(*)
    FROM pg_attribute AS attribute
    JOIN pg_class AS relation ON relation.oid = attribute.attrelid
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE attribute.attname = 'operating_company_id'
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
  OR fp_before IS DISTINCT FROM md5(concat_ws('|',
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
  OR (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgname LIKE '%operating_company%') <> 9
  OR to_regprocedure('registry.enforce_child_operating_company()') IS NULL THEN
    RAISE EXCEPTION 'BLOCKED_BY_ROLLBACK: requirement remains';
  END IF;
END
$rollback$;

COMMIT;
