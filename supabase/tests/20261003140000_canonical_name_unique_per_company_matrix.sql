-- Throwaway matrix for 20261003140000. The runner supplies migration and rollback.
-- One local transaction. Nothing here is applied to a Supabase project.

CREATE TEMP TABLE canon_matrix (
  step text PRIMARY KEY,
  ok boolean NOT NULL,
  detail text NOT NULL
);

CREATE TEMP TABLE canon_ids (
  label text PRIMARY KEY,
  id uuid NOT NULL
);

UPDATE registry.companies
SET canonical_name = 'JJ Property 10'
WHERE status = 'active';

INSERT INTO canon_ids (label, id)
SELECT 'sole', company_id
FROM registry.companies
WHERE status = 'active';

DO $history$
BEGIN
  BEGIN
    INSERT INTO supabase_migrations.schema_migrations (version, name)
    VALUES ('20261003140000', 'canonical_name_unique_per_company');
    EXECUTE $canon_run$
@@MIGRATION@@
$canon_run$;
    INSERT INTO canon_matrix VALUES ('history_present', false, 'applied');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO canon_matrix VALUES ('history_present', SQLERRM = 'BLOCKED_BY_HISTORY', SQLERRM);
  END;

  BEGIN
    INSERT INTO supabase_migrations.schema_migrations (version, name)
    VALUES ('20260930200000', 'duplicate-for-matrix');
    EXECUTE $canon_run$
@@MIGRATION@@
$canon_run$;
    INSERT INTO canon_matrix VALUES ('duplicate_version', false, 'applied');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO canon_matrix VALUES ('duplicate_version', SQLERRM = 'BLOCKED_BY_HISTORY', SQLERRM);
  END;
END
$history$;

DO $companies$
BEGIN
  BEGIN
    UPDATE registry.companies SET status = 'inactive' WHERE status = 'active';
    EXECUTE $canon_run$
@@MIGRATION@@
$canon_run$;
    INSERT INTO canon_matrix VALUES ('zero_active_refuses', false, 'applied');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO canon_matrix VALUES ('zero_active_refuses', SQLERRM = 'BLOCKED_BY_COMPANY_CONTEXT', SQLERRM);
  END;

  BEGIN
    INSERT INTO registry.companies (canonical_name, status)
    VALUES ('Second Company', 'active');
    EXECUTE $canon_run$
@@MIGRATION@@
$canon_run$;
    INSERT INTO canon_matrix VALUES ('two_active_refuses', false, 'applied');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO canon_matrix VALUES ('two_active_refuses', SQLERRM = 'BLOCKED_BY_COMPANY_CONTEXT', SQLERRM);
  END;

  INSERT INTO canon_matrix VALUES (
    'refusal_wrote_nothing',
    to_regclass('public.entity_registry_operating_company_id_canonical_name_key') IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM pg_attribute AS attribute
        JOIN pg_class AS relation ON relation.oid = attribute.attrelid
        JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = 'public'
          AND relation.relname IN ('entity_registry', 'entities')
          AND attribute.attname = 'operating_company_id'
          AND attribute.attnum > 0
          AND NOT attribute.attisdropped
      )
      AND (SELECT count(*) FROM registry.companies WHERE status = 'active') = 1,
    'clean'
  );
END
$companies$;

DO $indexdef$
BEGIN
  BEGIN
    DROP INDEX public.entity_registry_canonical_name_key;
    CREATE UNIQUE INDEX entity_registry_canonical_name_key
      ON public.entity_registry USING btree (lower(canonical_name));
    EXECUTE $canon_run$
@@MIGRATION@@
$canon_run$;
    INSERT INTO canon_matrix VALUES ('indexdef_drift_refuses', false, 'applied');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO canon_matrix VALUES ('indexdef_drift_refuses', SQLERRM = 'BLOCKED_BY_INDEXDEF', SQLERRM);
  END;

  BEGIN
    DROP INDEX public.entities_canonical_name_key;
    ALTER TABLE public.entities
      ADD CONSTRAINT entities_canonical_name_key UNIQUE (canonical_name);
    EXECUTE $canon_run$
@@MIGRATION@@
$canon_run$;
    INSERT INTO canon_matrix VALUES ('constraint_backed_refuses', false, 'applied');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO canon_matrix VALUES ('constraint_backed_refuses', SQLERRM = 'BLOCKED_BY_INDEXDEF', SQLERRM);
  END;
END
$indexdef$;

DO $apply$
BEGIN
  EXECUTE $canon_run$
@@MIGRATION@@
$canon_run$;
END
$apply$;

DO $applied$
DECLARE
  sole uuid;
BEGIN
  SELECT id INTO sole FROM canon_ids WHERE label = 'sole';
  INSERT INTO canon_matrix VALUES (
    'backfill_assigns_sole_company',
    (SELECT count(*) FROM public.entity_registry WHERE operating_company_id = sole) = 2
      AND (SELECT count(*) FROM public.entities WHERE operating_company_id = sole) = 2
      AND (SELECT count(*) FROM public.entity_registry WHERE operating_company_id IS DISTINCT FROM sole) = 0
      AND (SELECT count(*) FROM public.entities WHERE operating_company_id IS DISTINCT FROM sole) = 0
      AND (SELECT canonical_name FROM registry.companies WHERE company_id = sole) = 'JJ Property 10',
    '2/2'
  );
  INSERT INTO canon_matrix VALUES (
    'column_not_null',
    (
      SELECT count(*)
      FROM pg_attribute AS attribute
      JOIN pg_class AS relation ON relation.oid = attribute.attrelid
      JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
        AND relation.relname IN ('entity_registry', 'entities')
        AND attribute.attname = 'operating_company_id'
        AND attribute.attnotnull
        AND NOT attribute.atthasdef
    ) = 2,
    'not null'
  );
  INSERT INTO canon_matrix VALUES (
    'old_indexes_gone',
    to_regclass('public.entity_registry_canonical_name_key') IS NULL
      AND to_regclass('public.entities_canonical_name_key') IS NULL,
    'dropped'
  );
  INSERT INTO canon_matrix VALUES (
    'new_indexdef',
    pg_get_indexdef('public.entity_registry_operating_company_id_canonical_name_key'::regclass)
      = 'CREATE UNIQUE INDEX entity_registry_operating_company_id_canonical_name_key ON public.entity_registry USING btree (operating_company_id, canonical_name)'
      AND pg_get_indexdef('public.entities_operating_company_id_canonical_name_key'::regclass)
      = 'CREATE UNIQUE INDEX entities_operating_company_id_canonical_name_key ON public.entities USING btree (operating_company_id, canonical_name)',
    'company,name'
  );
END
$applied$;

DO $reapply$
BEGIN
  BEGIN
    EXECUTE $canon_run$
@@MIGRATION@@
$canon_run$;
    INSERT INTO canon_matrix VALUES ('reapply_refuses', false, 'applied');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO canon_matrix VALUES ('reapply_refuses', SQLERRM = 'BLOCKED_BY_SCHEMA_DRIFT', SQLERRM);
  END;
END
$reapply$;

DO $behavior$
DECLARE
  sole uuid;
  second_company uuid;
  assigned uuid;
BEGIN
  SELECT id INTO sole FROM canon_ids WHERE label = 'sole';
  INSERT INTO registry.companies (canonical_name, status)
  VALUES ('Second Company', 'active')
  RETURNING company_id INTO second_company;
  INSERT INTO canon_ids VALUES ('second', second_company);

  PERFORM access.arm_internal_operating_company(second_company);
  INSERT INTO public.entity_registry (canonical_name, entity_type, operating_company_id)
  VALUES ('Villa Mazotos', 'partnership_property', second_company);
  INSERT INTO public.entities (canonical_name, operating_company_id)
  VALUES ('Villa Mazotos', second_company);
  INSERT INTO canon_matrix VALUES (
    'same_name_two_companies',
    (SELECT count(*) FROM public.entity_registry WHERE canonical_name = 'Villa Mazotos') = 2
      AND (SELECT count(*) FROM public.entities WHERE canonical_name = 'Villa Mazotos') = 2
      AND (SELECT count(DISTINCT operating_company_id) FROM public.entity_registry WHERE canonical_name = 'Villa Mazotos') = 2,
    'allowed'
  );

  BEGIN
    INSERT INTO public.entity_registry (canonical_name, entity_type, operating_company_id)
    VALUES ('Villa Mazotos', 'partnership_property', second_company);
    INSERT INTO canon_matrix VALUES ('duplicate_within_company_rejected', false, 'inserted');
  EXCEPTION WHEN unique_violation THEN
    INSERT INTO canon_matrix VALUES ('duplicate_within_company_rejected', true, SQLSTATE);
  END;

  BEGIN
    UPDATE public.entity_registry
    SET operating_company_id = NULL
    WHERE canonical_name = 'JJ Office';
    INSERT INTO canon_matrix VALUES ('null_company_rejected', false, 'updated');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO canon_matrix VALUES (
      'null_company_rejected',
      SQLERRM = 'BLOCKED_BY_COMPANY_CONTEXT'
        AND (SELECT operating_company_id = sole FROM public.entity_registry WHERE canonical_name = 'JJ Office'),
      SQLERRM
    );
  END;

  BEGIN
    INSERT INTO public.entities (canonical_name) VALUES ('Oren');
    INSERT INTO canon_matrix VALUES ('null_insert_rejected_when_two_companies', false, 'inserted');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO canon_matrix VALUES (
      'null_insert_rejected_when_two_companies',
      SQLERRM = 'BLOCKED_BY_COMPANY_CONTEXT'
        AND (SELECT count(*) FROM public.entities WHERE canonical_name = 'Oren') = 0,
      SQLERRM
    );
  END;

  BEGIN
    UPDATE public.entity_registry
    SET operating_company_id = second_company
    WHERE canonical_name = 'JJ Office';
    INSERT INTO canon_matrix VALUES ('reassignment_rejected', false, 'updated');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO canon_matrix VALUES (
      'reassignment_rejected',
      SQLERRM = 'BLOCKED_BY_COMPANY_REASSIGNMENT'
        AND (SELECT operating_company_id = sole FROM public.entity_registry WHERE canonical_name = 'JJ Office'),
      SQLERRM
    );
  END;

  BEGIN
    EXECUTE $canon_run$
@@ROLLBACK@@
$canon_run$;
    INSERT INTO canon_matrix VALUES ('rollback_refuses_while_names_collide', false, 'rolled back');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO canon_matrix VALUES (
      'rollback_refuses_while_names_collide',
      SQLERRM = 'BLOCKED_BY_ROLLBACK: canonical_name collision',
      SQLERRM
    );
  END;

  DELETE FROM public.entity_registry WHERE operating_company_id = second_company;
  DELETE FROM public.entities WHERE operating_company_id = second_company;
  PERFORM access.disarm_internal_operating_company();
  DELETE FROM registry.companies WHERE company_id = second_company;

  INSERT INTO public.entity_registry (canonical_name, entity_type)
  VALUES ('JJ Property 10', 'jj_internal')
  RETURNING operating_company_id INTO assigned;
  INSERT INTO canon_matrix VALUES (
    'insert_omitted_company_uses_verified_company',
    assigned = sole,
    'sole'
  );
  DELETE FROM public.entity_registry WHERE canonical_name = 'JJ Property 10';
END
$behavior$;

DO $restore$
BEGIN
  EXECUTE $canon_run$
@@ROLLBACK@@
$canon_run$;
END
$restore$;

DO $restored$
BEGIN
  INSERT INTO canon_matrix VALUES (
    'rollback_restores_indexdef',
    pg_get_indexdef('public.entity_registry_canonical_name_key'::regclass)
      = 'CREATE UNIQUE INDEX entity_registry_canonical_name_key ON public.entity_registry USING btree (canonical_name)'
      AND pg_get_indexdef('public.entities_canonical_name_key'::regclass)
      = 'CREATE UNIQUE INDEX entities_canonical_name_key ON public.entities USING btree (canonical_name)',
    'original'
  );
  INSERT INTO canon_matrix VALUES (
    'column_absent_after_rollback',
    NOT EXISTS (
      SELECT 1
      FROM pg_attribute AS attribute
      JOIN pg_class AS relation ON relation.oid = attribute.attrelid
      JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
        AND relation.relname IN ('entity_registry', 'entities')
        AND attribute.attname = 'operating_company_id'
        AND attribute.attnum > 0
        AND NOT attribute.attisdropped
    )
      AND to_regprocedure('access.enforce_entity_canonical_company()') IS NULL,
    'dropped'
  );

  BEGIN
    INSERT INTO public.entity_registry (canonical_name, entity_type)
    VALUES ('Villa Mazotos', 'partnership_property');
    INSERT INTO canon_matrix VALUES ('global_unique_restored', false, 'inserted');
  EXCEPTION WHEN unique_violation THEN
    INSERT INTO canon_matrix VALUES ('global_unique_restored', true, SQLSTATE);
  END;
END
$restored$;

SELECT step, ok, detail FROM canon_matrix ORDER BY step;
