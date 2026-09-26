CREATE TEMP TABLE phase3_matrix (
  step text PRIMARY KEY,
  ok boolean NOT NULL,
  detail text NOT NULL
) ON COMMIT DROP;

GRANT ALL ON TABLE phase3_matrix TO anon, authenticated, service_role;

DO $verify$
DECLARE
  column_count integer;
  null_count integer;
  fk_count integer;
  index_count integer;
  children_fp text;
  external_fp text;
BEGIN
  SELECT count(*) INTO column_count
  FROM pg_attribute AS attribute
  JOIN pg_class AS relation ON relation.oid = attribute.attrelid
  JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  WHERE attribute.attname = 'operating_company_id'
    AND attribute.attnum > 0
    AND NOT attribute.attisdropped
    AND attribute.atttypid = 'uuid'::regtype
    AND NOT attribute.attnotnull
    AND NOT attribute.atthasdef
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

  SELECT count(*) INTO null_count
  FROM (
    SELECT operating_company_id FROM public.property_owners
    UNION ALL SELECT operating_company_id FROM public.property_ownership
    UNION ALL SELECT operating_company_id FROM public.ownership
    UNION ALL SELECT operating_company_id FROM public.property_name_aliases
    UNION ALL SELECT operating_company_id FROM public.property_reporting_map
    UNION ALL SELECT operating_company_id FROM lifecycle.property_acquisition
    UNION ALL SELECT operating_company_id FROM lifecycle.service_engagements
    UNION ALL SELECT operating_company_id FROM lifecycle.management_fee_configs
    UNION ALL SELECT operating_company_id FROM pms.property_mappings
  ) AS child_values
  WHERE operating_company_id IS NOT NULL;

  SELECT count(*) INTO fk_count
  FROM pg_constraint AS company_fk
  JOIN pg_class AS owning ON owning.oid = company_fk.conrelid
  JOIN pg_namespace AS owning_namespace ON owning_namespace.oid = owning.relnamespace
  JOIN pg_attribute AS local_column
    ON local_column.attrelid = owning.oid AND local_column.attnum = company_fk.conkey[1]
  JOIN pg_class AS referenced ON referenced.oid = company_fk.confrelid
  JOIN pg_namespace AS referenced_namespace ON referenced_namespace.oid = referenced.relnamespace
  JOIN pg_attribute AS referenced_column
    ON referenced_column.attrelid = referenced.oid AND referenced_column.attnum = company_fk.confkey[1]
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
    ON indexed_column.attrelid = table_relation.oid AND indexed_column.attnum = index_row.indkey[0]
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

  SELECT md5(concat(
    coalesce((SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.id)) FROM public.property_owners AS row_alias), 'empty'),
    '|',
    coalesce((SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.id)) FROM public.property_ownership AS row_alias), 'empty'),
    '|',
    coalesce((SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.id)) FROM public.ownership AS row_alias), 'empty'),
    '|',
    coalesce((SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.raw_name)) FROM public.property_name_aliases AS row_alias), 'empty'),
    '|',
    coalesce((SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.raw_name)) FROM public.property_reporting_map AS row_alias), 'empty'),
    '|',
    coalesce((SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.id)) FROM lifecycle.property_acquisition AS row_alias), 'empty'),
    '|',
    coalesce((SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.id)) FROM lifecycle.service_engagements AS row_alias), 'empty'),
    '|',
    coalesce((SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.id)) FROM lifecycle.management_fee_configs AS row_alias), 'empty'),
    '|',
    coalesce((SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.id)) FROM pms.property_mappings AS row_alias), 'empty')
  )) INTO children_fp;
  SELECT md5(string_agg(external_id, ',' ORDER BY id)) INTO external_fp FROM pms.property_mappings;

  INSERT INTO phase3_matrix VALUES ('columns_added', column_count = 9, column_count::text);
  INSERT INTO phase3_matrix VALUES ('values_remain_null', null_count = 0, null_count::text);
  INSERT INTO phase3_matrix VALUES ('foreign_keys', fk_count = 9, fk_count::text);
  INSERT INTO phase3_matrix VALUES ('indexes', index_count = 9, index_count::text);
  INSERT INTO phase3_matrix VALUES (
    'objects_created',
    column_count = 9 AND fk_count = 9 AND index_count = 9,
    (column_count + fk_count + index_count)::text
  );
  INSERT INTO phase3_matrix VALUES (
    'other_columns_unchanged',
    children_fp = (SELECT phase3_fp.children_fp FROM phase3_fp)
      AND external_fp IS NOT DISTINCT FROM (SELECT phase3_fp.external_fp FROM phase3_fp),
    'fingerprint'
  );
  INSERT INTO phase3_matrix VALUES (
    'mappings_unchanged',
    (SELECT count(*) FROM pms.property_mappings) = (SELECT phase3_fp.mappings_n FROM phase3_fp)
      AND (SELECT count(*) FROM pms.connections) = (SELECT phase3_fp.connections_n FROM phase3_fp)
      AND (SELECT count(*) FROM pms.property_mappings) = 8
      AND (SELECT count(*) FROM pms.connections) = 1,
    '8/1'
  );
END
$verify$;

DO $rerun$
BEGIN
  BEGIN
    EXECUTE $phase3_run$
@@MIGRATION@@
$phase3_run$;
    INSERT INTO phase3_matrix VALUES ('second_apply_aborts', false, 'applied twice');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase3_matrix VALUES (
      'second_apply_aborts',
      SQLERRM = 'BLOCKED_BY_SCHEMA_DRIFT',
      SQLERRM
    );
  END;
END
$rerun$;

DO $assigned$
DECLARE
  probe_company uuid := gen_random_uuid();
  probe_mapping pms.property_mappings.id%TYPE;
BEGIN
  INSERT INTO registry.companies (company_id, canonical_name, status)
  VALUES (probe_company, 'phase3-second', 'active');
  SELECT id INTO probe_mapping FROM pms.property_mappings ORDER BY id LIMIT 1;
  UPDATE pms.property_mappings
  SET operating_company_id = probe_company
  WHERE id = probe_mapping;
  BEGIN
    EXECUTE $phase3_run$
@@ROLLBACK@@
$phase3_run$;
    INSERT INTO phase3_matrix VALUES ('assigned_rollback_aborts', false, 'dropped');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase3_matrix VALUES (
      'assigned_rollback_aborts',
      SQLERRM = 'BLOCKED_BY_ROLLBACK: assigned value',
      SQLERRM
    );
  END;
  INSERT INTO phase3_matrix VALUES (
    'assigned_value_kept',
    (SELECT operating_company_id = probe_company FROM pms.property_mappings WHERE id = probe_mapping),
    'held'
  );
  UPDATE pms.property_mappings
  SET operating_company_id = NULL
  WHERE id = probe_mapping;
  DELETE FROM registry.companies WHERE company_id = probe_company;
END
$assigned$;

DO $fk_drift$
DECLARE
  objects_before integer;
  objects_after integer;
  null_count integer;
  strong_fk integer;
  cascade_kept boolean;
BEGIN
  ALTER TABLE public.property_owners
    DROP CONSTRAINT property_owners_operating_company_fk;
  ALTER TABLE public.property_owners
    ADD CONSTRAINT property_owners_operating_company_fk
    FOREIGN KEY (operating_company_id)
    REFERENCES registry.companies (company_id)
    ON DELETE CASCADE;

  SELECT (
    SELECT count(*)
    FROM pg_attribute AS attribute
    JOIN pg_class AS relation ON relation.oid = attribute.attrelid
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE attribute.attname = 'operating_company_id'
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
  ) + (
    SELECT count(*)
    FROM pg_constraint AS company_fk
    JOIN pg_class AS owning ON owning.oid = company_fk.conrelid
    JOIN pg_namespace AS owning_namespace ON owning_namespace.oid = owning.relnamespace
    WHERE (owning_namespace.nspname, owning.relname, company_fk.conname) IN (
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
  ) + (
    SELECT count(*)
    FROM pg_class AS index_relation
    JOIN pg_namespace AS index_namespace ON index_namespace.oid = index_relation.relnamespace
    WHERE (index_namespace.nspname, index_relation.relname) IN (
      ('public', 'property_owners_operating_company_id_idx'),
      ('public', 'property_ownership_operating_company_id_idx'),
      ('public', 'ownership_operating_company_id_idx'),
      ('public', 'property_name_aliases_operating_company_id_idx'),
      ('public', 'property_reporting_map_operating_company_id_idx'),
      ('lifecycle', 'property_acquisition_operating_company_id_idx'),
      ('lifecycle', 'service_engagements_operating_company_id_idx'),
      ('lifecycle', 'management_fee_configs_operating_company_id_idx'),
      ('pms', 'property_mappings_operating_company_id_idx')
    )
  ) INTO objects_before;

  BEGIN
    EXECUTE $phase3_run$
@@ROLLBACK@@
$phase3_run$;
    INSERT INTO phase3_matrix VALUES ('fk_drift_rollback_aborts', false, 'dropped');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase3_matrix VALUES (
      'fk_drift_rollback_aborts',
      SQLERRM = 'BLOCKED_BY_ROLLBACK',
      SQLERRM
    );
  END;

  SELECT (
    SELECT count(*)
    FROM pg_attribute AS attribute
    JOIN pg_class AS relation ON relation.oid = attribute.attrelid
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE attribute.attname = 'operating_company_id'
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
  ) + (
    SELECT count(*)
    FROM pg_constraint AS company_fk
    JOIN pg_class AS owning ON owning.oid = company_fk.conrelid
    JOIN pg_namespace AS owning_namespace ON owning_namespace.oid = owning.relnamespace
    WHERE (owning_namespace.nspname, owning.relname, company_fk.conname) IN (
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
  ) + (
    SELECT count(*)
    FROM pg_class AS index_relation
    JOIN pg_namespace AS index_namespace ON index_namespace.oid = index_relation.relnamespace
    WHERE (index_namespace.nspname, index_relation.relname) IN (
      ('public', 'property_owners_operating_company_id_idx'),
      ('public', 'property_ownership_operating_company_id_idx'),
      ('public', 'ownership_operating_company_id_idx'),
      ('public', 'property_name_aliases_operating_company_id_idx'),
      ('public', 'property_reporting_map_operating_company_id_idx'),
      ('lifecycle', 'property_acquisition_operating_company_id_idx'),
      ('lifecycle', 'service_engagements_operating_company_id_idx'),
      ('lifecycle', 'management_fee_configs_operating_company_id_idx'),
      ('pms', 'property_mappings_operating_company_id_idx')
    )
  ) INTO objects_after;

  SELECT count(*) INTO null_count
  FROM (
    SELECT operating_company_id FROM public.property_owners
    UNION ALL SELECT operating_company_id FROM public.property_ownership
    UNION ALL SELECT operating_company_id FROM public.ownership
    UNION ALL SELECT operating_company_id FROM public.property_name_aliases
    UNION ALL SELECT operating_company_id FROM public.property_reporting_map
    UNION ALL SELECT operating_company_id FROM lifecycle.property_acquisition
    UNION ALL SELECT operating_company_id FROM lifecycle.service_engagements
    UNION ALL SELECT operating_company_id FROM lifecycle.management_fee_configs
    UNION ALL SELECT operating_company_id FROM pms.property_mappings
  ) AS child_values
  WHERE operating_company_id IS NOT NULL;

  SELECT count(*) INTO strong_fk
  FROM pg_constraint AS company_fk
  JOIN pg_class AS owning ON owning.oid = company_fk.conrelid
  JOIN pg_namespace AS owning_namespace ON owning_namespace.oid = owning.relnamespace
  WHERE company_fk.contype = 'f'
    AND company_fk.confdeltype = 'r'
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

  SELECT company_fk.confdeltype = 'c' INTO cascade_kept
  FROM pg_constraint AS company_fk
  JOIN pg_class AS owning ON owning.oid = company_fk.conrelid
  JOIN pg_namespace AS owning_namespace ON owning_namespace.oid = owning.relnamespace
  WHERE owning_namespace.nspname = 'public'
    AND owning.relname = 'property_owners'
    AND company_fk.conname = 'property_owners_operating_company_fk';

  INSERT INTO phase3_matrix VALUES (
    'fk_drift_dropped_zero',
    objects_before = 27
      AND objects_after = 27
      AND null_count = 0
      AND strong_fk = 8
      AND cascade_kept,
    objects_before::text || '/' || objects_after::text
  );
END
$fk_drift$;

DO $index_drift$
DECLARE
  objects_before integer;
  objects_after integer;
  null_count integer;
  strong_index integer;
  unique_kept boolean;
BEGIN
  DROP INDEX public.property_owners_operating_company_id_idx;
  CREATE UNIQUE INDEX property_owners_operating_company_id_idx
    ON public.property_owners (operating_company_id);

  SELECT (
    SELECT count(*)
    FROM pg_attribute AS attribute
    JOIN pg_class AS relation ON relation.oid = attribute.attrelid
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE attribute.attname = 'operating_company_id'
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
  ) + (
    SELECT count(*)
    FROM pg_constraint AS company_fk
    JOIN pg_class AS owning ON owning.oid = company_fk.conrelid
    JOIN pg_namespace AS owning_namespace ON owning_namespace.oid = owning.relnamespace
    WHERE (owning_namespace.nspname, owning.relname, company_fk.conname) IN (
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
  ) + (
    SELECT count(*)
    FROM pg_class AS index_relation
    JOIN pg_namespace AS index_namespace ON index_namespace.oid = index_relation.relnamespace
    WHERE (index_namespace.nspname, index_relation.relname) IN (
      ('public', 'property_owners_operating_company_id_idx'),
      ('public', 'property_ownership_operating_company_id_idx'),
      ('public', 'ownership_operating_company_id_idx'),
      ('public', 'property_name_aliases_operating_company_id_idx'),
      ('public', 'property_reporting_map_operating_company_id_idx'),
      ('lifecycle', 'property_acquisition_operating_company_id_idx'),
      ('lifecycle', 'service_engagements_operating_company_id_idx'),
      ('lifecycle', 'management_fee_configs_operating_company_id_idx'),
      ('pms', 'property_mappings_operating_company_id_idx')
    )
  ) INTO objects_before;

  BEGIN
    EXECUTE $phase3_run$
@@ROLLBACK@@
$phase3_run$;
    INSERT INTO phase3_matrix VALUES ('index_drift_rollback_aborts', false, 'dropped');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase3_matrix VALUES (
      'index_drift_rollback_aborts',
      SQLERRM = 'BLOCKED_BY_ROLLBACK',
      SQLERRM
    );
  END;

  SELECT (
    SELECT count(*)
    FROM pg_attribute AS attribute
    JOIN pg_class AS relation ON relation.oid = attribute.attrelid
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE attribute.attname = 'operating_company_id'
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
  ) + (
    SELECT count(*)
    FROM pg_constraint AS company_fk
    JOIN pg_class AS owning ON owning.oid = company_fk.conrelid
    JOIN pg_namespace AS owning_namespace ON owning_namespace.oid = owning.relnamespace
    WHERE (owning_namespace.nspname, owning.relname, company_fk.conname) IN (
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
  ) + (
    SELECT count(*)
    FROM pg_class AS index_relation
    JOIN pg_namespace AS index_namespace ON index_namespace.oid = index_relation.relnamespace
    WHERE (index_namespace.nspname, index_relation.relname) IN (
      ('public', 'property_owners_operating_company_id_idx'),
      ('public', 'property_ownership_operating_company_id_idx'),
      ('public', 'ownership_operating_company_id_idx'),
      ('public', 'property_name_aliases_operating_company_id_idx'),
      ('public', 'property_reporting_map_operating_company_id_idx'),
      ('lifecycle', 'property_acquisition_operating_company_id_idx'),
      ('lifecycle', 'service_engagements_operating_company_id_idx'),
      ('lifecycle', 'management_fee_configs_operating_company_id_idx'),
      ('pms', 'property_mappings_operating_company_id_idx')
    )
  ) INTO objects_after;

  SELECT count(*) INTO null_count
  FROM (
    SELECT operating_company_id FROM public.property_owners
    UNION ALL SELECT operating_company_id FROM public.property_ownership
    UNION ALL SELECT operating_company_id FROM public.ownership
    UNION ALL SELECT operating_company_id FROM public.property_name_aliases
    UNION ALL SELECT operating_company_id FROM public.property_reporting_map
    UNION ALL SELECT operating_company_id FROM lifecycle.property_acquisition
    UNION ALL SELECT operating_company_id FROM lifecycle.service_engagements
    UNION ALL SELECT operating_company_id FROM lifecycle.management_fee_configs
    UNION ALL SELECT operating_company_id FROM pms.property_mappings
  ) AS child_values
  WHERE operating_company_id IS NOT NULL;

  SELECT count(*) INTO strong_index
  FROM pg_index AS index_row
  JOIN pg_class AS index_relation ON index_relation.oid = index_row.indexrelid
  JOIN pg_namespace AS index_namespace ON index_namespace.oid = index_relation.relnamespace
  WHERE index_row.indisunique = false
    AND (index_namespace.nspname, index_relation.relname) IN (
      ('public', 'property_owners_operating_company_id_idx'),
      ('public', 'property_ownership_operating_company_id_idx'),
      ('public', 'ownership_operating_company_id_idx'),
      ('public', 'property_name_aliases_operating_company_id_idx'),
      ('public', 'property_reporting_map_operating_company_id_idx'),
      ('lifecycle', 'property_acquisition_operating_company_id_idx'),
      ('lifecycle', 'service_engagements_operating_company_id_idx'),
      ('lifecycle', 'management_fee_configs_operating_company_id_idx'),
      ('pms', 'property_mappings_operating_company_id_idx')
    );

  SELECT index_row.indisunique INTO unique_kept
  FROM pg_index AS index_row
  JOIN pg_class AS index_relation ON index_relation.oid = index_row.indexrelid
  JOIN pg_namespace AS index_namespace ON index_namespace.oid = index_relation.relnamespace
  WHERE index_namespace.nspname = 'public'
    AND index_relation.relname = 'property_owners_operating_company_id_idx';

  INSERT INTO phase3_matrix VALUES (
    'index_drift_dropped_zero',
    objects_before = 27
      AND objects_after = 27
      AND null_count = 0
      AND strong_index = 8
      AND unique_kept,
    objects_before::text || '/' || objects_after::text
  );
END
$index_drift$;

DO $restore_shape$
DECLARE
  fk_count integer;
  index_count integer;
BEGIN
  ALTER TABLE public.property_owners
    DROP CONSTRAINT property_owners_operating_company_fk;
  ALTER TABLE public.property_owners
    ADD CONSTRAINT property_owners_operating_company_fk
    FOREIGN KEY (operating_company_id)
    REFERENCES registry.companies (company_id)
    ON DELETE RESTRICT;
  DROP INDEX public.property_owners_operating_company_id_idx;
  CREATE INDEX property_owners_operating_company_id_idx
    ON public.property_owners (operating_company_id);

  SELECT count(*) INTO fk_count
  FROM pg_constraint AS company_fk
  JOIN pg_class AS owning ON owning.oid = company_fk.conrelid
  JOIN pg_namespace AS owning_namespace ON owning_namespace.oid = owning.relnamespace
  JOIN pg_attribute AS local_column
    ON local_column.attrelid = owning.oid AND local_column.attnum = company_fk.conkey[1]
  JOIN pg_class AS referenced ON referenced.oid = company_fk.confrelid
  JOIN pg_namespace AS referenced_namespace ON referenced_namespace.oid = referenced.relnamespace
  JOIN pg_attribute AS referenced_column
    ON referenced_column.attrelid = referenced.oid AND referenced_column.attnum = company_fk.confkey[1]
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
    ON indexed_column.attrelid = table_relation.oid AND indexed_column.attnum = index_row.indkey[0]
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

  INSERT INTO phase3_matrix VALUES (
    'restored_reviewed_shape',
    fk_count = 9 AND index_count = 9,
    fk_count::text || '/' || index_count::text
  );
END
$restore_shape$;

@@ROLLBACK@@

DO $removed$
DECLARE
  column_count integer;
  foreign_key_count integer;
  index_count integer;
  children_fp text;
BEGIN
  SELECT count(*) INTO column_count
  FROM pg_attribute AS attribute
  JOIN pg_class AS relation ON relation.oid = attribute.attrelid
  JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  WHERE attribute.attname = 'operating_company_id'
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
    );

  SELECT count(*) INTO foreign_key_count
  FROM pg_constraint AS company_fk
  JOIN pg_class AS owning ON owning.oid = company_fk.conrelid
  JOIN pg_namespace AS owning_namespace ON owning_namespace.oid = owning.relnamespace
  WHERE (owning_namespace.nspname, owning.relname, company_fk.conname) IN (
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
  FROM pg_class AS index_relation
  JOIN pg_namespace AS index_namespace ON index_namespace.oid = index_relation.relnamespace
  WHERE (index_namespace.nspname, index_relation.relname) IN (
    ('public', 'property_owners_operating_company_id_idx'),
    ('public', 'property_ownership_operating_company_id_idx'),
    ('public', 'ownership_operating_company_id_idx'),
    ('public', 'property_name_aliases_operating_company_id_idx'),
    ('public', 'property_reporting_map_operating_company_id_idx'),
    ('lifecycle', 'property_acquisition_operating_company_id_idx'),
    ('lifecycle', 'service_engagements_operating_company_id_idx'),
    ('lifecycle', 'management_fee_configs_operating_company_id_idx'),
    ('pms', 'property_mappings_operating_company_id_idx')
  );

  SELECT md5(concat(
    coalesce((SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.id)) FROM public.property_owners AS row_alias), 'empty'),
    '|',
    coalesce((SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.id)) FROM public.property_ownership AS row_alias), 'empty'),
    '|',
    coalesce((SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.id)) FROM public.ownership AS row_alias), 'empty'),
    '|',
    coalesce((SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.raw_name)) FROM public.property_name_aliases AS row_alias), 'empty'),
    '|',
    coalesce((SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.raw_name)) FROM public.property_reporting_map AS row_alias), 'empty'),
    '|',
    coalesce((SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.id)) FROM lifecycle.property_acquisition AS row_alias), 'empty'),
    '|',
    coalesce((SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.id)) FROM lifecycle.service_engagements AS row_alias), 'empty'),
    '|',
    coalesce((SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.id)) FROM lifecycle.management_fee_configs AS row_alias), 'empty'),
    '|',
    coalesce((SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.id)) FROM pms.property_mappings AS row_alias), 'empty')
  )) INTO children_fp;

  INSERT INTO phase3_matrix VALUES (
    'rollback_removed_columns',
    column_count = 0
      AND foreign_key_count = 0
      AND index_count = 0
      AND children_fp = (SELECT phase3_fp.children_fp FROM phase3_fp),
    (column_count + foreign_key_count + index_count)::text
  );
END
$removed$;
