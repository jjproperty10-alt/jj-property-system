-- Rollback for 20260925140000_properties_operating_company_jj_backfill.
-- Restores operating_company_id to NULL only in the reviewed clean state.
-- Aborts without changing data when the state differs.

BEGIN;

DO $rollback$
DECLARE
  jj_company uuid := '10f6e9b3-c5b9-4d95-a318-48f20f89477f';
  cleared_properties integer;
  cleared_definitions integer;
BEGIN
  IF (SELECT count(*) FROM public.properties) <> 40
     OR (SELECT count(*) FROM public.property_definitions) <> 45 THEN
    RAISE EXCEPTION 'BLOCKED_BY_ROLLBACK: row count';
  END IF;

  IF EXISTS (
       SELECT 1 FROM public.properties
       WHERE operating_company_id IS DISTINCT FROM jj_company
     )
     OR EXISTS (
       SELECT 1 FROM public.property_definitions
       WHERE operating_company_id IS DISTINCT FROM jj_company
     )
     OR EXISTS (
       SELECT 1 FROM public.properties
       WHERE operating_company_id <> jj_company
     )
     OR EXISTS (
       SELECT 1 FROM public.property_definitions
       WHERE operating_company_id <> jj_company
     ) THEN
    RAISE EXCEPTION 'BLOCKED_BY_ROLLBACK: mixed company';
  END IF;

  IF to_regclass('public.properties_operating_company_id_idx') IS NULL
     OR to_regclass('public.property_definitions_operating_company_id_idx') IS NULL
     OR (
       SELECT count(*)
       FROM pg_constraint AS company_fk
       JOIN pg_class AS referenced ON referenced.oid = company_fk.confrelid
       JOIN pg_namespace AS referenced_namespace ON referenced_namespace.oid = referenced.relnamespace
       JOIN pg_attribute AS referenced_column
         ON referenced_column.attrelid = referenced.oid
        AND referenced_column.attnum = company_fk.confkey[1]
       WHERE company_fk.conname IN (
           'properties_operating_company_fk',
           'property_definitions_operating_company_fk'
         )
         AND company_fk.confdeltype = 'r'
         AND referenced_namespace.nspname = 'registry'
         AND referenced.relname = 'companies'
         AND referenced_column.attname = 'company_id'
     ) <> 2
     OR EXISTS (
       SELECT 1
       FROM pg_attribute AS attribute
       JOIN pg_class AS relation ON relation.oid = attribute.attrelid
       JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
       WHERE namespace.nspname = 'public'
         AND relation.relname IN ('properties', 'property_definitions')
         AND attribute.attname = 'operating_company_id'
         AND attribute.attnum > 0
         AND NOT attribute.attisdropped
         AND (
           attribute.atttypid <> 'uuid'::regtype
           OR attribute.attnotnull
           OR attribute.atthasdef
         )
     )
     OR EXISTS (
       SELECT 1
       FROM pg_trigger AS trigger
       JOIN pg_class AS relation ON relation.oid = trigger.tgrelid
       JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
       WHERE namespace.nspname = 'public'
         AND relation.relname IN ('properties', 'property_definitions')
         AND NOT trigger.tgisinternal
     ) THEN
    RAISE EXCEPTION 'BLOCKED_BY_ROLLBACK: schema drift';
  END IF;

  UPDATE public.properties
  SET operating_company_id = NULL
  WHERE operating_company_id = jj_company;
  GET DIAGNOSTICS cleared_properties = ROW_COUNT;

  UPDATE public.property_definitions
  SET operating_company_id = NULL
  WHERE operating_company_id = jj_company;
  GET DIAGNOSTICS cleared_definitions = ROW_COUNT;

  IF cleared_properties <> 40 OR cleared_definitions <> 45 THEN
    RAISE EXCEPTION 'BLOCKED_BY_ROLLBACK: clear count';
  END IF;

  IF EXISTS (SELECT 1 FROM public.properties WHERE operating_company_id IS NOT NULL)
     OR EXISTS (SELECT 1 FROM public.property_definitions WHERE operating_company_id IS NOT NULL) THEN
    RAISE EXCEPTION 'BLOCKED_BY_ROLLBACK: null missing';
  END IF;
END
$rollback$;

COMMIT;
