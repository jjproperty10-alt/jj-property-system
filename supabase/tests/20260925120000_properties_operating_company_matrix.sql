CREATE TEMP TABLE phase2_matrix (
  step text PRIMARY KEY,
  ok boolean NOT NULL,
  detail text NOT NULL
) ON COMMIT DROP;

GRANT ALL ON TABLE phase2_matrix TO anon, authenticated, service_role;

DO $matrix$
DECLARE
  jj_company uuid := '10f6e9b3-c5b9-4d95-a318-48f20f89477f';
  foreign_company uuid := gen_random_uuid();
  missing_company uuid := gen_random_uuid();
  probe_id uuid;
  properties_before integer;
  definitions_before integer;
  delete_code "char";
BEGIN
  SELECT count(*) INTO properties_before FROM public.properties;
  SELECT count(*) INTO definitions_before FROM public.property_definitions;

  INSERT INTO phase2_matrix
  SELECT 'properties_nullable', NOT attribute.attnotnull AND attribute.atthasdef = false, 'nullable'
  FROM pg_attribute AS attribute
  JOIN pg_class AS relation ON relation.oid = attribute.attrelid
  JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND relation.relname = 'properties'
    AND attribute.attname = 'operating_company_id';

  INSERT INTO phase2_matrix
  SELECT 'definitions_nullable', NOT attribute.attnotnull AND attribute.atthasdef = false, 'nullable'
  FROM pg_attribute AS attribute
  JOIN pg_class AS relation ON relation.oid = attribute.attrelid
  JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND relation.relname = 'property_definitions'
    AND attribute.attname = 'operating_company_id';

  SELECT company_fk.confdeltype INTO delete_code
  FROM pg_constraint AS company_fk
  WHERE company_fk.conname = 'properties_operating_company_fk';
  INSERT INTO phase2_matrix VALUES (
    'properties_fk_restrict',
    delete_code = 'r',
    coalesce(delete_code::text, 'missing')
  );

  SELECT company_fk.confdeltype INTO delete_code
  FROM pg_constraint AS company_fk
  WHERE company_fk.conname = 'property_definitions_operating_company_fk';
  INSERT INTO phase2_matrix VALUES (
    'definitions_fk_restrict',
    delete_code = 'r',
    coalesce(delete_code::text, 'missing')
  );

  INSERT INTO phase2_matrix VALUES (
    'indexes_present',
    to_regclass('public.properties_operating_company_id_idx') IS NOT NULL
      AND to_regclass('public.property_definitions_operating_company_id_idx') IS NOT NULL,
    'indexes'
  );

  INSERT INTO phase2_matrix VALUES (
    'existing_rows_unchanged',
    properties_before = (SELECT count(*) FROM public.properties)
      AND definitions_before = (SELECT count(*) FROM public.property_definitions)
      AND NOT EXISTS (SELECT 1 FROM public.properties WHERE operating_company_id IS NOT NULL)
      AND NOT EXISTS (SELECT 1 FROM public.property_definitions WHERE operating_company_id IS NOT NULL),
    properties_before::text || '/' || definitions_before::text
  );

  INSERT INTO public.properties (name, operating_company_id)
  VALUES ('phase2-slice21-probe', NULL)
  RETURNING id INTO probe_id;
  INSERT INTO phase2_matrix VALUES ('null_insert_allowed', probe_id IS NOT NULL, 'null');
  DELETE FROM public.properties WHERE id = probe_id;

  BEGIN
    INSERT INTO public.properties (name, operating_company_id)
    VALUES ('phase2-slice21-missing', missing_company);
    INSERT INTO phase2_matrix VALUES ('missing_company_rejected', false, 'inserted');
  EXCEPTION WHEN foreign_key_violation THEN
    INSERT INTO phase2_matrix VALUES ('missing_company_rejected', SQLSTATE = '23503', SQLSTATE);
  END;

  INSERT INTO registry.companies (company_id, canonical_name, status)
  VALUES (foreign_company, 'phase2-slice21-foreign', 'active');

  INSERT INTO public.properties (name, operating_company_id)
  VALUES ('phase2-slice21-foreign', foreign_company)
  RETURNING id INTO probe_id;

  INSERT INTO public.property_definitions (property_name, relationship_type, canonical_name, operating_company_id)
  SELECT 'phase2-slice21-foreign-def', source.relationship_type, 'phase2-slice21-foreign-def', foreign_company
  FROM public.property_definitions AS source
  LIMIT 1;

  INSERT INTO phase2_matrix VALUES (
    'second_company_accepted',
    EXISTS (
      SELECT 1 FROM public.properties
      WHERE id = probe_id AND operating_company_id = foreign_company
    )
    AND EXISTS (
      SELECT 1 FROM public.property_definitions
      WHERE property_name = 'phase2-slice21-foreign-def'
        AND operating_company_id = foreign_company
    ),
    'both'
  );

  DELETE FROM public.properties WHERE id = probe_id;
  DELETE FROM public.property_definitions WHERE property_name = 'phase2-slice21-foreign-def';
  DELETE FROM registry.companies WHERE company_id = foreign_company;

  INSERT INTO phase2_matrix VALUES (
    'probe_company_removed',
    NOT EXISTS (SELECT 1 FROM registry.companies WHERE company_id = foreign_company)
      AND (SELECT count(*) FROM registry.companies) = 1,
    'one'
  );

  BEGIN
    INSERT INTO public.properties (name, operating_company_id)
    VALUES ('phase2-slice21-jj', jj_company);
    INSERT INTO phase2_matrix VALUES ('jj_company_allowed', true, 'fk');
    DELETE FROM public.properties WHERE name = 'phase2-slice21-jj';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase2_matrix VALUES ('jj_company_allowed', false, SQLSTATE);
  END;

  BEGIN
    PERFORM 1
    FROM pg_attribute AS attribute
    JOIN pg_class AS relation ON relation.oid = attribute.attrelid
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname = 'properties'
      AND attribute.attname = 'operating_company_id'
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped;
    IF FOUND THEN
      RAISE EXCEPTION 'BLOCKED_BY_SCHEMA_DRIFT';
    END IF;
    INSERT INTO phase2_matrix VALUES ('drift_guard_aborts', false, 'no exception');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase2_matrix VALUES (
      'drift_guard_aborts',
      SQLERRM = 'BLOCKED_BY_SCHEMA_DRIFT',
      SQLERRM
    );
  END;

  INSERT INTO phase2_matrix VALUES (
    'ledger_untouched',
    to_regclass('public.transactions') IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM pg_attribute AS attribute
        JOIN pg_class AS relation ON relation.oid = attribute.attrelid
        JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = 'public'
          AND relation.relname = 'transactions'
          AND attribute.attname = 'operating_company_id'
          AND NOT attribute.attisdropped
      ),
    'transactions'
  );
END
$matrix$;
