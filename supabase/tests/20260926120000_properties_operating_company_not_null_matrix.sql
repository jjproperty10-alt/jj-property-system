CREATE TEMP TABLE phase23_matrix (
  step text PRIMARY KEY,
  ok boolean NOT NULL,
  detail text NOT NULL
) ON COMMIT DROP;

GRANT ALL ON TABLE phase23_matrix TO anon, authenticated, service_role;

DO $verify$
DECLARE
  jj_company uuid := '10f6e9b3-c5b9-4d95-a318-48f20f89477f';
  properties_fp text;
  definitions_fp text;
  required_count integer;
BEGIN
  SELECT count(*) INTO required_count
  FROM pg_attribute AS attribute
  JOIN pg_class AS relation ON relation.oid = attribute.attrelid
  JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND relation.relname IN ('properties', 'property_definitions')
    AND attribute.attname = 'operating_company_id'
    AND attribute.attnotnull
    AND NOT attribute.atthasdef
    AND attribute.atttypid = 'uuid'::regtype
    AND NOT attribute.attisdropped;

  SELECT md5(string_agg((to_jsonb(properties) - 'operating_company_id')::text, ',' ORDER BY id))
    INTO properties_fp
  FROM public.properties;
  SELECT md5(string_agg((to_jsonb(property_definitions) - 'operating_company_id')::text, ',' ORDER BY property_name))
    INTO definitions_fp
  FROM public.property_definitions;

  INSERT INTO phase23_matrix VALUES (
    'requirement_applied',
    required_count = 2,
    required_count::text
  );
  INSERT INTO phase23_matrix VALUES (
    'assignment_unchanged',
    (SELECT count(*) FROM public.properties WHERE operating_company_id = jj_company) = 40
      AND (SELECT count(*) FROM public.property_definitions WHERE operating_company_id = jj_company) = 45
      AND (SELECT count(*) FROM public.properties WHERE operating_company_id IS NULL) = 0
      AND (SELECT count(*) FROM public.property_definitions WHERE operating_company_id IS NULL) = 0,
    '40/45'
  );
  INSERT INTO phase23_matrix VALUES (
    'other_columns_unchanged',
    properties_fp = (SELECT phase23_fp.properties_fp FROM phase23_fp)
      AND definitions_fp = (SELECT phase23_fp.definitions_fp FROM phase23_fp),
    'fingerprint'
  );
END
$verify$;

@@ROLLBACK@@

DO $nullable$
DECLARE
  jj_company uuid := '10f6e9b3-c5b9-4d95-a318-48f20f89477f';
  nullable_count integer;
BEGIN
  SELECT count(*) INTO nullable_count
  FROM pg_attribute AS attribute
  JOIN pg_class AS relation ON relation.oid = attribute.attrelid
  JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND relation.relname IN ('properties', 'property_definitions')
    AND attribute.attname = 'operating_company_id'
    AND NOT attribute.attnotnull
    AND NOT attribute.atthasdef;

  INSERT INTO phase23_matrix VALUES (
    'rollback_restored_nullable',
    nullable_count = 2
      AND (SELECT count(*) FROM public.properties WHERE operating_company_id = jj_company) = 40
      AND (SELECT count(*) FROM public.property_definitions WHERE operating_company_id = jj_company) = 45,
    nullable_count::text
  );
END
$nullable$;

DO $nullrow$
DECLARE
  jj_company uuid := '10f6e9b3-c5b9-4d95-a318-48f20f89477f';
  probe_id uuid;
BEGIN
  SELECT id INTO probe_id FROM public.properties ORDER BY id LIMIT 1;
  UPDATE public.properties SET operating_company_id = NULL WHERE id = probe_id;
  BEGIN
    EXECUTE $phase23_run$
@@MIGRATION@@
$phase23_run$;
    INSERT INTO phase23_matrix VALUES ('null_assignment_aborts', false, 'altered');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase23_matrix VALUES (
      'null_assignment_aborts',
      SQLERRM = 'BLOCKED_BY_NOT_NULL: assignment',
      SQLERRM
    );
  END;
  INSERT INTO phase23_matrix VALUES (
    'null_assignment_wrote_nothing',
    (
      SELECT count(*)
      FROM pg_attribute AS attribute
      JOIN pg_class AS relation ON relation.oid = attribute.attrelid
      JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
        AND relation.relname IN ('properties', 'property_definitions')
        AND attribute.attname = 'operating_company_id'
        AND attribute.attnotnull
    ) = 0
      AND (SELECT operating_company_id IS NULL FROM public.properties WHERE id = probe_id),
    'nullable'
  );
  UPDATE public.properties SET operating_company_id = jj_company WHERE id = probe_id;
END
$nullrow$;

DO $rowcount$
DECLARE
  probe_id uuid;
BEGIN
  INSERT INTO public.properties (name) VALUES ('phase23-extra-row') RETURNING id INTO probe_id;
  BEGIN
    EXECUTE $phase23_run$
@@MIGRATION@@
$phase23_run$;
    INSERT INTO phase23_matrix VALUES ('row_count_aborts', false, 'altered');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase23_matrix VALUES (
      'row_count_aborts',
      SQLERRM = 'BLOCKED_BY_NOT_NULL: row count',
      SQLERRM
    );
  END;
  DELETE FROM public.properties WHERE id = probe_id;
  INSERT INTO phase23_matrix VALUES (
    'row_count_left_nullable',
    (
      SELECT count(*)
      FROM pg_attribute AS attribute
      JOIN pg_class AS relation ON relation.oid = attribute.attrelid
      JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
        AND relation.relname IN ('properties', 'property_definitions')
        AND attribute.attname = 'operating_company_id'
        AND attribute.attnotnull
    ) = 0
      AND (SELECT count(*) FROM public.properties) = 40,
    '40'
  );
END
$rowcount$;

DO $second$
DECLARE
  foreign_company uuid := gen_random_uuid();
BEGIN
  INSERT INTO registry.companies (company_id, canonical_name, status)
  VALUES (foreign_company, 'phase23-second', 'active');
  BEGIN
    EXECUTE $phase23_run$
@@MIGRATION@@
$phase23_run$;
    INSERT INTO phase23_matrix VALUES ('second_company_aborts', false, 'altered');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase23_matrix VALUES (
      'second_company_aborts',
      SQLERRM = 'BLOCKED_BY_NOT_NULL: company registry',
      SQLERRM
    );
  END;
  DELETE FROM registry.companies WHERE company_id = foreign_company;
END
$second$;
