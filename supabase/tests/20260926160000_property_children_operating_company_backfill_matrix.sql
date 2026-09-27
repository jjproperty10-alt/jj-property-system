-- Transaction probes for the Slice 3.1 child backfill.
-- The temporary migration-history row exists only so the rollback can require
-- 20260926160000 to be recorded once. The runner removes it before the result
-- and the outer transaction rolls back.

CREATE TEMP TABLE phase31_matrix (
  step text PRIMARY KEY,
  ok boolean NOT NULL,
  detail text NOT NULL
) ON COMMIT DROP;

GRANT ALL ON TABLE phase31_matrix TO anon, authenticated, service_role;

DO $verify$
DECLARE
  jj_company uuid := '10f6e9b3-c5b9-4d95-a318-48f20f89477f';
  children_fp text;
BEGIN
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

  INSERT INTO phase31_matrix VALUES (
    'assigned_counts',
    (SELECT count(*) FROM public.property_owners WHERE operating_company_id = jj_company) = 92
      AND (SELECT count(*) FROM public.property_ownership WHERE operating_company_id = jj_company) = 73
      AND (SELECT count(*) FROM public.ownership WHERE operating_company_id = jj_company) = 0
      AND (SELECT count(*) FROM public.property_name_aliases WHERE operating_company_id = jj_company) = 54
      AND (SELECT count(*) FROM public.property_reporting_map WHERE operating_company_id = jj_company) = 9
      AND (SELECT count(*) FROM lifecycle.property_acquisition WHERE operating_company_id = jj_company) = 2
      AND (SELECT count(*) FROM lifecycle.service_engagements WHERE operating_company_id = jj_company) = 24
      AND (SELECT count(*) FROM lifecycle.management_fee_configs WHERE operating_company_id = jj_company) = 0
      AND (SELECT count(*) FROM pms.property_mappings WHERE operating_company_id = jj_company) = 8
      AND (
        (SELECT count(*) FROM public.property_owners WHERE operating_company_id = jj_company)
        + (SELECT count(*) FROM public.property_ownership WHERE operating_company_id = jj_company)
        + (SELECT count(*) FROM public.ownership WHERE operating_company_id = jj_company)
        + (SELECT count(*) FROM public.property_name_aliases WHERE operating_company_id = jj_company)
        + (SELECT count(*) FROM public.property_reporting_map WHERE operating_company_id = jj_company)
        + (SELECT count(*) FROM lifecycle.property_acquisition WHERE operating_company_id = jj_company)
        + (SELECT count(*) FROM lifecycle.service_engagements WHERE operating_company_id = jj_company)
        + (SELECT count(*) FROM lifecycle.management_fee_configs WHERE operating_company_id = jj_company)
        + (SELECT count(*) FROM pms.property_mappings WHERE operating_company_id = jj_company)
      ) = 262
      AND (SELECT count(*) FROM public.property_owners WHERE operating_company_id IS NULL) = 0
      AND (SELECT count(*) FROM public.property_ownership WHERE operating_company_id IS NULL) = 0
      AND (SELECT count(*) FROM public.ownership WHERE operating_company_id IS NULL) = 0
      AND (SELECT count(*) FROM public.property_name_aliases WHERE operating_company_id IS NULL) = 0
      AND (SELECT count(*) FROM public.property_reporting_map WHERE operating_company_id IS NULL) = 0
      AND (SELECT count(*) FROM lifecycle.property_acquisition WHERE operating_company_id IS NULL) = 0
      AND (SELECT count(*) FROM lifecycle.service_engagements WHERE operating_company_id IS NULL) = 0
      AND (SELECT count(*) FROM lifecycle.management_fee_configs WHERE operating_company_id IS NULL) = 0
      AND (SELECT count(*) FROM pms.property_mappings WHERE operating_company_id IS NULL) = 0,
    '92/73/0/54/9/2/24/0/8'
  );
  INSERT INTO phase31_matrix VALUES (
    'other_columns_unchanged',
    children_fp = (SELECT phase31_fp.children_fp FROM phase31_fp)
      AND (SELECT md5(string_agg(external_id, ',' ORDER BY id)) FROM pms.property_mappings)
          IS NOT DISTINCT FROM (SELECT phase31_fp.external_fp FROM phase31_fp)
      AND (SELECT count(*) FROM pms.property_mappings) = 8
      AND (SELECT count(*) FROM pms.connections) = 1,
    'fingerprint'
  );
END
$verify$;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20260926160000', 'property_children_operating_company_jj_backfill');

DO $null_state$
DECLARE
  jj_company uuid := '10f6e9b3-c5b9-4d95-a318-48f20f89477f';
  probe_id uuid;
BEGIN
  SELECT id INTO probe_id FROM public.property_owners ORDER BY id LIMIT 1;
  UPDATE public.property_owners
  SET operating_company_id = NULL
  WHERE id = probe_id;
  BEGIN
    EXECUTE $phase31_run$
@@ROLLBACK@@
$phase31_run$;
    INSERT INTO phase31_matrix VALUES ('rollback_refuses_null', false, 'cleared');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase31_matrix VALUES (
      'rollback_refuses_null',
      SQLERRM = 'BLOCKED_BY_ROLLBACK: assignment',
      SQLERRM
    );
  END;
  INSERT INTO phase31_matrix VALUES (
    'null_state_unchanged',
    (SELECT operating_company_id IS NULL FROM public.property_owners WHERE id = probe_id)
      AND (SELECT count(*) FROM public.property_owners WHERE operating_company_id = jj_company) = 91,
    'held'
  );
  UPDATE public.property_owners
  SET operating_company_id = jj_company
  WHERE id = probe_id;
END
$null_state$;

DO $mixed$
DECLARE
  jj_company uuid := '10f6e9b3-c5b9-4d95-a318-48f20f89477f';
  foreign_company uuid := gen_random_uuid();
  probe_id uuid;
BEGIN
  INSERT INTO registry.companies (company_id, canonical_name, status)
  VALUES (foreign_company, 'phase31-foreign', 'active');
  SELECT id INTO probe_id FROM public.property_owners ORDER BY id LIMIT 1;
  UPDATE public.property_owners
  SET operating_company_id = foreign_company
  WHERE id = probe_id;
  BEGIN
    EXECUTE $phase31_run$
@@ROLLBACK@@
$phase31_run$;
    INSERT INTO phase31_matrix VALUES ('rollback_refuses_mixed', false, 'cleared');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase31_matrix VALUES (
      'rollback_refuses_mixed',
      SQLERRM = 'BLOCKED_BY_ROLLBACK: assignment',
      SQLERRM
    );
  END;
  INSERT INTO phase31_matrix VALUES (
    'mixed_state_unchanged',
    (SELECT operating_company_id = foreign_company FROM public.property_owners WHERE id = probe_id)
      AND (SELECT count(*) FROM public.property_owners WHERE operating_company_id = jj_company) = 91,
    'held'
  );
  UPDATE public.property_owners
  SET operating_company_id = jj_company
  WHERE id = probe_id;
  DELETE FROM registry.companies WHERE company_id = foreign_company;
END
$mixed$;

DO $clean$
DECLARE
  children_fp text;
BEGIN
  EXECUTE $phase31_run$
@@ROLLBACK@@
$phase31_run$;
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
  INSERT INTO phase31_matrix VALUES (
    'rollback_restored_null',
    (SELECT count(*) FROM public.property_owners WHERE operating_company_id IS NULL) = 92
      AND (SELECT count(*) FROM public.property_ownership WHERE operating_company_id IS NULL) = 73
      AND (SELECT count(*) FROM public.ownership WHERE operating_company_id IS NULL) = 0
      AND (SELECT count(*) FROM public.property_name_aliases WHERE operating_company_id IS NULL) = 54
      AND (SELECT count(*) FROM public.property_reporting_map WHERE operating_company_id IS NULL) = 9
      AND (SELECT count(*) FROM lifecycle.property_acquisition WHERE operating_company_id IS NULL) = 2
      AND (SELECT count(*) FROM lifecycle.service_engagements WHERE operating_company_id IS NULL) = 24
      AND (SELECT count(*) FROM lifecycle.management_fee_configs WHERE operating_company_id IS NULL) = 0
      AND (SELECT count(*) FROM pms.property_mappings WHERE operating_company_id IS NULL) = 8
      AND (
        (SELECT count(*) FROM public.property_owners WHERE operating_company_id IS NULL)
        + (SELECT count(*) FROM public.property_ownership WHERE operating_company_id IS NULL)
        + (SELECT count(*) FROM public.ownership WHERE operating_company_id IS NULL)
        + (SELECT count(*) FROM public.property_name_aliases WHERE operating_company_id IS NULL)
        + (SELECT count(*) FROM public.property_reporting_map WHERE operating_company_id IS NULL)
        + (SELECT count(*) FROM lifecycle.property_acquisition WHERE operating_company_id IS NULL)
        + (SELECT count(*) FROM lifecycle.service_engagements WHERE operating_company_id IS NULL)
        + (SELECT count(*) FROM lifecycle.management_fee_configs WHERE operating_company_id IS NULL)
        + (SELECT count(*) FROM pms.property_mappings WHERE operating_company_id IS NULL)
      ) = 262,
    '262'
  );
  INSERT INTO phase31_matrix VALUES (
    'fingerprints_after_rollback',
    children_fp = (SELECT phase31_fp.children_fp FROM phase31_fp),
    'fingerprint'
  );
END
$clean$;

DELETE FROM supabase_migrations.schema_migrations
WHERE version = '20260926160000';

DO $rowcount$
DECLARE
  probe_id uuid;
BEGIN
  INSERT INTO public.ownership (property_id, owner_name, percentage)
  SELECT id, 'phase31-row-count', 1
  FROM public.properties
  ORDER BY id
  LIMIT 1
  RETURNING id INTO probe_id;
  BEGIN
    EXECUTE $phase31_run$
@@MIGRATION@@
$phase31_run$;
    INSERT INTO phase31_matrix VALUES ('row_count_aborts', false, 'updated');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase31_matrix VALUES (
      'row_count_aborts',
      SQLERRM = 'BLOCKED_BY_BACKFILL: row count',
      SQLERRM
    );
  END;
  DELETE FROM public.ownership WHERE id = probe_id;
  INSERT INTO phase31_matrix VALUES (
    'row_count_wrote_nothing',
    (SELECT count(*) FROM public.ownership) = 0
      AND (SELECT count(*) FROM public.property_owners WHERE operating_company_id IS NOT NULL) = 0
      AND (SELECT count(*) FROM pms.property_mappings WHERE operating_company_id IS NOT NULL) = 0,
    'null'
  );
END
$rowcount$;

DO $preexisting_jj$
DECLARE
  jj_company uuid := '10f6e9b3-c5b9-4d95-a318-48f20f89477f';
  probe_id uuid;
BEGIN
  SELECT id INTO probe_id FROM public.property_owners ORDER BY id LIMIT 1;
  UPDATE public.property_owners
  SET operating_company_id = jj_company
  WHERE id = probe_id;
  BEGIN
    EXECUTE $phase31_run$
@@MIGRATION@@
$phase31_run$;
    INSERT INTO phase31_matrix VALUES ('preexisting_jj_aborts', false, 'updated');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase31_matrix VALUES (
      'preexisting_jj_aborts',
      SQLERRM = 'BLOCKED_BY_BACKFILL: preexisting assignment',
      SQLERRM
    );
  END;
  INSERT INTO phase31_matrix VALUES (
    'preexisting_jj_wrote_nothing',
    (SELECT count(*) FROM public.property_owners WHERE operating_company_id = jj_company) = 1
      AND (SELECT count(*) FROM public.property_ownership WHERE operating_company_id IS NOT NULL) = 0,
    'one'
  );
  UPDATE public.property_owners
  SET operating_company_id = NULL
  WHERE id = probe_id;
END
$preexisting_jj$;

DO $preexisting_other$
DECLARE
  foreign_company uuid := gen_random_uuid();
  probe_id uuid;
BEGIN
  INSERT INTO registry.companies (company_id, canonical_name, status)
  VALUES (foreign_company, 'phase31-other', 'active');
  SELECT id INTO probe_id FROM public.property_owners ORDER BY id LIMIT 1;
  UPDATE public.property_owners
  SET operating_company_id = foreign_company
  WHERE id = probe_id;
  BEGIN
    EXECUTE $phase31_run$
@@MIGRATION@@
$phase31_run$;
    INSERT INTO phase31_matrix VALUES ('preexisting_other_aborts', false, 'updated');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase31_matrix VALUES (
      'preexisting_other_aborts',
      SQLERRM = 'BLOCKED_BY_BACKFILL: preexisting assignment',
      SQLERRM
    );
  END;
  INSERT INTO phase31_matrix VALUES (
    'preexisting_other_wrote_nothing',
    (SELECT operating_company_id = foreign_company FROM public.property_owners WHERE id = probe_id)
      AND (SELECT count(*) FROM public.property_ownership WHERE operating_company_id IS NOT NULL) = 0,
    'held'
  );
  UPDATE public.property_owners
  SET operating_company_id = NULL
  WHERE id = probe_id;
  DELETE FROM registry.companies WHERE company_id = foreign_company;
END
$preexisting_other$;

DO $second$
DECLARE
  foreign_company uuid := gen_random_uuid();
BEGIN
  INSERT INTO registry.companies (company_id, canonical_name, status)
  VALUES (foreign_company, 'phase31-second', 'active');
  BEGIN
    EXECUTE $phase31_run$
@@MIGRATION@@
$phase31_run$;
    INSERT INTO phase31_matrix VALUES ('second_company_aborts', false, 'updated');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase31_matrix VALUES (
      'second_company_aborts',
      SQLERRM = 'BLOCKED_BY_BACKFILL: company registry',
      SQLERRM
    );
  END;
  INSERT INTO phase31_matrix VALUES (
    'second_company_wrote_nothing',
    (SELECT count(*) FROM public.property_owners WHERE operating_company_id IS NOT NULL) = 0
      AND (SELECT count(*) FROM pms.property_mappings WHERE operating_company_id IS NOT NULL) = 0,
    'null'
  );
  DELETE FROM registry.companies WHERE company_id = foreign_company;
END
$second$;

DO $fk_drift$
BEGIN
  ALTER TABLE public.property_owners
    DROP CONSTRAINT property_owners_operating_company_fk;
  ALTER TABLE public.property_owners
    ADD CONSTRAINT property_owners_operating_company_fk
    FOREIGN KEY (operating_company_id)
    REFERENCES registry.companies (company_id)
    ON DELETE CASCADE;
  BEGIN
    EXECUTE $phase31_run$
@@MIGRATION@@
$phase31_run$;
    INSERT INTO phase31_matrix VALUES ('fk_drift_aborts', false, 'updated');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase31_matrix VALUES (
      'fk_drift_aborts',
      SQLERRM = 'BLOCKED_BY_BACKFILL: child schema',
      SQLERRM
    );
  END;
  ALTER TABLE public.property_owners
    DROP CONSTRAINT property_owners_operating_company_fk;
  ALTER TABLE public.property_owners
    ADD CONSTRAINT property_owners_operating_company_fk
    FOREIGN KEY (operating_company_id)
    REFERENCES registry.companies (company_id)
    ON DELETE RESTRICT;
  INSERT INTO phase31_matrix VALUES (
    'fk_drift_wrote_nothing',
    (SELECT count(*) FROM public.property_owners WHERE operating_company_id IS NOT NULL) = 0
      AND (
        SELECT company_fk.confdeltype = 'r' AND company_fk.convalidated
        FROM pg_constraint AS company_fk
        WHERE company_fk.conname = 'property_owners_operating_company_fk'
      ),
    'restrict'
  );
END
$fk_drift$;

DO $index_drift$
BEGIN
  DROP INDEX public.property_owners_operating_company_id_idx;
  CREATE UNIQUE INDEX property_owners_operating_company_id_idx
    ON public.property_owners (operating_company_id);
  BEGIN
    EXECUTE $phase31_run$
@@MIGRATION@@
$phase31_run$;
    INSERT INTO phase31_matrix VALUES ('index_drift_aborts', false, 'updated');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase31_matrix VALUES (
      'index_drift_aborts',
      SQLERRM = 'BLOCKED_BY_BACKFILL: child schema',
      SQLERRM
    );
  END;
  DROP INDEX public.property_owners_operating_company_id_idx;
  CREATE INDEX property_owners_operating_company_id_idx
    ON public.property_owners (operating_company_id);
  INSERT INTO phase31_matrix VALUES (
    'index_drift_wrote_nothing',
    (SELECT count(*) FROM public.property_owners WHERE operating_company_id IS NOT NULL) = 0
      AND (
        SELECT index_row.indisunique = false
          AND index_row.indisvalid
          AND index_row.indisready
        FROM pg_index AS index_row
        JOIN pg_class AS index_relation ON index_relation.oid = index_row.indexrelid
        WHERE index_relation.relname = 'property_owners_operating_company_id_idx'
      ),
    'nonunique'
  );
END
$index_drift$;

DO $column_drift$
BEGIN
  ALTER TABLE public.property_owners
    ALTER COLUMN operating_company_id SET DEFAULT '10f6e9b3-c5b9-4d95-a318-48f20f89477f';
  BEGIN
    EXECUTE $phase31_run$
@@MIGRATION@@
$phase31_run$;
    INSERT INTO phase31_matrix VALUES ('column_drift_aborts', false, 'updated');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase31_matrix VALUES (
      'column_drift_aborts',
      SQLERRM = 'BLOCKED_BY_BACKFILL: child schema',
      SQLERRM
    );
  END;
  ALTER TABLE public.property_owners
    ALTER COLUMN operating_company_id DROP DEFAULT;
  INSERT INTO phase31_matrix VALUES (
    'column_drift_wrote_nothing',
    (SELECT count(*) FROM public.property_owners WHERE operating_company_id IS NOT NULL) = 0
      AND (
        SELECT attribute.atthasdef = false AND attribute.attnotnull = false
        FROM pg_attribute AS attribute
        JOIN pg_class AS relation ON relation.oid = attribute.attrelid
        JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = 'public'
          AND relation.relname = 'property_owners'
          AND attribute.attname = 'operating_company_id'
      ),
    'nullable'
  );
END
$column_drift$;
