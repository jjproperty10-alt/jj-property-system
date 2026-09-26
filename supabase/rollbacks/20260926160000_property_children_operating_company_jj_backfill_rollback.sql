-- Rollback for 20260926160000_property_children_operating_company_jj_backfill.
-- Restores operating_company_id to null only while every reviewed row is the canonical JJ company.
-- Aborts before any update when the schema, counts, assignment, or history differ.
-- Does not remove a row or a Slice 3 schema object.

BEGIN;

DO $rollback$
DECLARE
  jj_company uuid := '10f6e9b3-c5b9-4d95-a318-48f20f89477f';
  cleared_property_owners integer;
  cleared_property_ownership integer;
  cleared_ownership integer;
  cleared_property_name_aliases integer;
  cleared_property_reporting_map integer;
  cleared_property_acquisition integer;
  cleared_service_engagements integer;
  cleared_management_fee_configs integer;
  cleared_property_mappings integer;
  column_count integer;
  foreign_key_count integer;
  index_count integer;
  unexpected_dependency_count integer;
  reviewed_dependency_count integer;
  publication_count integer;
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
    RAISE EXCEPTION 'BLOCKED_BY_ROLLBACK';
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

  SELECT count(*) INTO column_count
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
    );

  SELECT count(*) INTO foreign_key_count
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
    );

  SELECT count(*) INTO index_count
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
    );

  IF column_count <> 9 OR foreign_key_count <> 9 OR index_count <> 9 THEN
    RAISE EXCEPTION 'BLOCKED_BY_ROLLBACK';
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
    RAISE EXCEPTION 'BLOCKED_BY_ROLLBACK: row count';
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
     OR (SELECT count(*) FROM pms.property_mappings WHERE operating_company_id IS DISTINCT FROM jj_company) <> 0 THEN
    RAISE EXCEPTION 'BLOCKED_BY_ROLLBACK: assignment';
  END IF;

  IF (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260926160000') <> 1 THEN
    RAISE EXCEPTION 'BLOCKED_BY_ROLLBACK: history';
  END IF;

  SELECT count(*) INTO publication_count
  FROM pg_attribute AS attribute
  JOIN pg_class AS relation ON relation.oid = attribute.attrelid
  JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  JOIN pg_publication_rel AS publication_rel ON publication_rel.prrelid = relation.oid
  WHERE attribute.attname = 'operating_company_id'
    AND attribute.attnum > 0
    AND NOT attribute.attisdropped
    AND publication_rel.prattrs IS NOT NULL
    AND attribute.attnum = ANY (publication_rel.prattrs::smallint[])
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
    );

  SELECT count(*) INTO unexpected_dependency_count
  FROM pg_depend AS dependency
  JOIN pg_attribute AS attribute
    ON attribute.attrelid = dependency.refobjid
   AND attribute.attnum = dependency.refobjsubid
  JOIN pg_class AS relation ON relation.oid = attribute.attrelid
  JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  WHERE dependency.refclassid = 'pg_class'::regclass
    AND attribute.attname = 'operating_company_id'
    AND attribute.attnum > 0
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
    AND (
      dependency.classid IN (
        'pg_policy'::regclass,
        'pg_rewrite'::regclass,
        'pg_trigger'::regclass,
        'pg_proc'::regclass,
        'pg_attrdef'::regclass
      )
      OR NOT (
        (
          dependency.classid = 'pg_constraint'::regclass
          AND EXISTS (
            SELECT 1
            FROM pg_constraint AS company_fk
            WHERE company_fk.oid = dependency.objid
              AND company_fk.conrelid = attribute.attrelid
              AND (namespace.nspname, relation.relname, company_fk.conname) IN (
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
          )
        )
        OR (
          dependency.classid = 'pg_class'::regclass
          AND EXISTS (
            SELECT 1
            FROM pg_class AS index_relation
            JOIN pg_index AS index_row ON index_row.indexrelid = index_relation.oid
            JOIN pg_namespace AS index_namespace ON index_namespace.oid = index_relation.relnamespace
            WHERE index_relation.oid = dependency.objid
              AND index_row.indrelid = attribute.attrelid
              AND (index_namespace.nspname, namespace.nspname, relation.relname, index_relation.relname) IN (
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
          )
        )
      )
    );

  SELECT count(*) INTO reviewed_dependency_count
  FROM pg_depend AS dependency
  JOIN pg_attribute AS attribute
    ON attribute.attrelid = dependency.refobjid
   AND attribute.attnum = dependency.refobjsubid
  JOIN pg_class AS relation ON relation.oid = attribute.attrelid
  JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  WHERE dependency.refclassid = 'pg_class'::regclass
    AND attribute.attname = 'operating_company_id'
    AND attribute.attnum > 0
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
    AND (
      (
        dependency.classid = 'pg_constraint'::regclass
        AND EXISTS (
          SELECT 1
          FROM pg_constraint AS company_fk
          WHERE company_fk.oid = dependency.objid
            AND company_fk.conrelid = attribute.attrelid
            AND (namespace.nspname, relation.relname, company_fk.conname) IN (
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
        )
      )
      OR (
        dependency.classid = 'pg_class'::regclass
        AND EXISTS (
          SELECT 1
          FROM pg_class AS index_relation
          JOIN pg_index AS index_row ON index_row.indexrelid = index_relation.oid
          JOIN pg_namespace AS index_namespace ON index_namespace.oid = index_relation.relnamespace
          WHERE index_relation.oid = dependency.objid
            AND index_row.indrelid = attribute.attrelid
            AND (index_namespace.nspname, namespace.nspname, relation.relname, index_relation.relname) IN (
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
        )
      )
    );

  IF publication_count <> 0
     OR unexpected_dependency_count <> 0
     OR reviewed_dependency_count <> 18 THEN
    RAISE EXCEPTION 'BLOCKED_BY_ROLLBACK';
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
  SET operating_company_id = NULL
  WHERE operating_company_id = jj_company;
  GET DIAGNOSTICS cleared_property_owners = ROW_COUNT;

  UPDATE public.property_ownership
  SET operating_company_id = NULL
  WHERE operating_company_id = jj_company;
  GET DIAGNOSTICS cleared_property_ownership = ROW_COUNT;

  UPDATE public.ownership
  SET operating_company_id = NULL
  WHERE operating_company_id = jj_company;
  GET DIAGNOSTICS cleared_ownership = ROW_COUNT;

  UPDATE public.property_name_aliases
  SET operating_company_id = NULL
  WHERE operating_company_id = jj_company;
  GET DIAGNOSTICS cleared_property_name_aliases = ROW_COUNT;

  UPDATE public.property_reporting_map
  SET operating_company_id = NULL
  WHERE operating_company_id = jj_company;
  GET DIAGNOSTICS cleared_property_reporting_map = ROW_COUNT;

  UPDATE lifecycle.property_acquisition
  SET operating_company_id = NULL
  WHERE operating_company_id = jj_company;
  GET DIAGNOSTICS cleared_property_acquisition = ROW_COUNT;

  UPDATE lifecycle.service_engagements
  SET operating_company_id = NULL
  WHERE operating_company_id = jj_company;
  GET DIAGNOSTICS cleared_service_engagements = ROW_COUNT;

  UPDATE lifecycle.management_fee_configs
  SET operating_company_id = NULL
  WHERE operating_company_id = jj_company;
  GET DIAGNOSTICS cleared_management_fee_configs = ROW_COUNT;

  UPDATE pms.property_mappings
  SET operating_company_id = NULL
  WHERE operating_company_id = jj_company;
  GET DIAGNOSTICS cleared_property_mappings = ROW_COUNT;

  IF cleared_property_owners <> 92
     OR cleared_property_ownership <> 73
     OR cleared_ownership <> 0
     OR cleared_property_name_aliases <> 54
     OR cleared_property_reporting_map <> 9
     OR cleared_property_acquisition <> 2
     OR cleared_service_engagements <> 24
     OR cleared_management_fee_configs <> 0
     OR cleared_property_mappings <> 8
     OR cleared_property_owners
        + cleared_property_ownership
        + cleared_ownership
        + cleared_property_name_aliases
        + cleared_property_reporting_map
        + cleared_property_acquisition
        + cleared_service_engagements
        + cleared_management_fee_configs
        + cleared_property_mappings <> 262 THEN
    RAISE EXCEPTION 'BLOCKED_BY_ROLLBACK: clear count';
  END IF;

  IF (SELECT count(*) FROM public.property_owners WHERE operating_company_id IS NOT NULL) <> 0
     OR (SELECT count(*) FROM public.property_ownership WHERE operating_company_id IS NOT NULL) <> 0
     OR (SELECT count(*) FROM public.ownership WHERE operating_company_id IS NOT NULL) <> 0
     OR (SELECT count(*) FROM public.property_name_aliases WHERE operating_company_id IS NOT NULL) <> 0
     OR (SELECT count(*) FROM public.property_reporting_map WHERE operating_company_id IS NOT NULL) <> 0
     OR (SELECT count(*) FROM lifecycle.property_acquisition WHERE operating_company_id IS NOT NULL) <> 0
     OR (SELECT count(*) FROM lifecycle.service_engagements WHERE operating_company_id IS NOT NULL) <> 0
     OR (SELECT count(*) FROM lifecycle.management_fee_configs WHERE operating_company_id IS NOT NULL) <> 0
     OR (SELECT count(*) FROM pms.property_mappings WHERE operating_company_id IS NOT NULL) <> 0 THEN
    RAISE EXCEPTION 'BLOCKED_BY_ROLLBACK: null missing';
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
    RAISE EXCEPTION 'BLOCKED_BY_ROLLBACK: fingerprint';
  END IF;
END
$rollback$;

COMMIT;
