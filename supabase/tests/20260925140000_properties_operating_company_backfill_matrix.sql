CREATE TEMP TABLE phase22_matrix (
  step text PRIMARY KEY,
  ok boolean NOT NULL,
  detail text NOT NULL
) ON COMMIT DROP;

GRANT ALL ON TABLE phase22_matrix TO anon, authenticated, service_role;

DO $verify$
DECLARE
  jj_company uuid := '10f6e9b3-c5b9-4d95-a318-48f20f89477f';
  properties_fp text;
  definitions_fp text;
BEGIN
  SELECT md5(string_agg((to_jsonb(properties) - 'operating_company_id')::text, ',' ORDER BY id))
    INTO properties_fp
  FROM public.properties;
  SELECT md5(string_agg((to_jsonb(property_definitions) - 'operating_company_id')::text, ',' ORDER BY property_name))
    INTO definitions_fp
  FROM public.property_definitions;

  INSERT INTO phase22_matrix VALUES (
    'backfill_counts',
    (SELECT count(*) FROM public.properties WHERE operating_company_id = jj_company) = 40
      AND (SELECT count(*) FROM public.property_definitions WHERE operating_company_id = jj_company) = 45
      AND (SELECT count(*) FROM public.properties WHERE operating_company_id IS NULL) = 0
      AND (SELECT count(*) FROM public.property_definitions WHERE operating_company_id IS NULL) = 0,
    '40/45'
  );
  INSERT INTO phase22_matrix VALUES (
    'other_columns_unchanged',
    properties_fp = (SELECT phase22_fp.properties_fp FROM phase22_fp)
      AND definitions_fp = (SELECT phase22_fp.definitions_fp FROM phase22_fp),
    'fingerprint'
  );
END
$verify$;

DO $mixed$
DECLARE
  jj_company uuid := '10f6e9b3-c5b9-4d95-a318-48f20f89477f';
  foreign_company uuid := gen_random_uuid();
  probe_id uuid;
BEGIN
  INSERT INTO registry.companies (company_id, canonical_name, status)
  VALUES (foreign_company, 'phase22-foreign', 'active');
  SELECT id INTO probe_id FROM public.properties ORDER BY id LIMIT 1;
  UPDATE public.properties
  SET operating_company_id = foreign_company
  WHERE id = probe_id;

  BEGIN
    EXECUTE $phase22_run$
@@ROLLBACK@@
$phase22_run$;
    INSERT INTO phase22_matrix VALUES ('rollback_refuses_mixed', false, 'cleared');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase22_matrix VALUES (
      'rollback_refuses_mixed',
      SQLERRM = 'BLOCKED_BY_ROLLBACK: mixed company',
      SQLERRM
    );
  END;

  INSERT INTO phase22_matrix VALUES (
    'mixed_data_unchanged',
    (SELECT operating_company_id = foreign_company FROM public.properties WHERE id = probe_id)
      AND (SELECT count(*) FROM public.properties WHERE operating_company_id = jj_company) = 39,
    'held'
  );

  UPDATE public.properties
  SET operating_company_id = jj_company
  WHERE id = probe_id;
  DELETE FROM registry.companies WHERE company_id = foreign_company;
END
$mixed$;

@@ROLLBACK@@

DO $nulls$
BEGIN
  INSERT INTO phase22_matrix VALUES (
    'rollback_restored_null',
    (SELECT count(*) FROM public.properties WHERE operating_company_id IS NULL) = 40
      AND (SELECT count(*) FROM public.property_definitions WHERE operating_company_id IS NULL) = 45,
    '85'
  );
END
$nulls$;

DO $rowcount$
DECLARE
  probe_id uuid;
BEGIN
  INSERT INTO public.properties (name) VALUES ('phase22-extra-row') RETURNING id INTO probe_id;
  BEGIN
    EXECUTE $phase22_run$
@@MIGRATION@@
$phase22_run$;
    INSERT INTO phase22_matrix VALUES ('row_count_aborts', false, 'updated');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase22_matrix VALUES (
      'row_count_aborts',
      SQLERRM = 'BLOCKED_BY_BACKFILL: row count',
      SQLERRM
    );
  END;
  DELETE FROM public.properties WHERE id = probe_id;
  INSERT INTO phase22_matrix VALUES (
    'row_count_abort_wrote_nothing',
    (SELECT count(*) FROM public.properties WHERE operating_company_id IS NOT NULL) = 0
      AND (SELECT count(*) FROM public.property_definitions WHERE operating_company_id IS NOT NULL) = 0
      AND (SELECT count(*) FROM public.properties) = 40,
    'null'
  );
END
$rowcount$;

DO $preexisting$
DECLARE
  jj_company uuid := '10f6e9b3-c5b9-4d95-a318-48f20f89477f';
  probe_id uuid;
BEGIN
  SELECT id INTO probe_id FROM public.properties ORDER BY id LIMIT 1;
  UPDATE public.properties SET operating_company_id = jj_company WHERE id = probe_id;
  BEGIN
    EXECUTE $phase22_run$
@@MIGRATION@@
$phase22_run$;
    INSERT INTO phase22_matrix VALUES ('preexisting_aborts', false, 'updated');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase22_matrix VALUES (
      'preexisting_aborts',
      SQLERRM = 'BLOCKED_BY_BACKFILL: preexisting assignment',
      SQLERRM
    );
  END;
  INSERT INTO phase22_matrix VALUES (
    'preexisting_abort_wrote_nothing',
    (SELECT count(*) FROM public.properties WHERE operating_company_id = jj_company) = 1
      AND (SELECT count(*) FROM public.property_definitions WHERE operating_company_id IS NOT NULL) = 0,
    'one'
  );
  UPDATE public.properties SET operating_company_id = NULL WHERE id = probe_id;
END
$preexisting$;

DO $second$
DECLARE
  foreign_company uuid := gen_random_uuid();
BEGIN
  INSERT INTO registry.companies (company_id, canonical_name, status)
  VALUES (foreign_company, 'phase22-second', 'active');
  BEGIN
    EXECUTE $phase22_run$
@@MIGRATION@@
$phase22_run$;
    INSERT INTO phase22_matrix VALUES ('second_company_aborts', false, 'updated');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase22_matrix VALUES (
      'second_company_aborts',
      SQLERRM = 'BLOCKED_BY_BACKFILL: company registry',
      SQLERRM
    );
  END;
  INSERT INTO phase22_matrix VALUES (
    'second_company_wrote_nothing',
    (SELECT count(*) FROM public.properties WHERE operating_company_id IS NOT NULL) = 0
      AND (SELECT count(*) FROM public.property_definitions WHERE operating_company_id IS NOT NULL) = 0,
    'null'
  );
  DELETE FROM registry.companies WHERE company_id = foreign_company;
END
$second$;

-- The inactive-company arm is not executed here.
-- companies_uuid_guard rejects a status change, so that state cannot be
-- created on Production without bypassing the existing identity invariant.
-- Static Jest asserts the migration checks status = 'active' before any UPDATE.
