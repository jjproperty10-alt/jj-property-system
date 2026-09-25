-- Slice 2.2: assign the existing property registries to the single active JJ company.
-- Aborts before any UPDATE when a precondition fails.
-- Does not add a column default, a nullability change, or a row-level security change.

BEGIN;

DO $backfill$
DECLARE
  jj_company uuid := '10f6e9b3-c5b9-4d95-a318-48f20f89477f';
  updated_properties integer;
  updated_definitions integer;
BEGIN
  IF (SELECT count(*) FROM registry.companies) <> 1
     OR NOT EXISTS (
       SELECT 1
       FROM registry.companies
       WHERE company_id = jj_company
         AND status = 'active'
     ) THEN
    RAISE EXCEPTION 'BLOCKED_BY_BACKFILL: company registry';
  END IF;

  IF (SELECT count(*) FROM public.properties) <> 40
     OR (SELECT count(*) FROM public.property_definitions) <> 45 THEN
    RAISE EXCEPTION 'BLOCKED_BY_BACKFILL: row count';
  END IF;

  IF EXISTS (
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
  ) OR (
    SELECT count(*)
    FROM pg_attribute AS attribute
    JOIN pg_class AS relation ON relation.oid = attribute.attrelid
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname IN ('properties', 'property_definitions')
      AND attribute.attname = 'operating_company_id'
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped
  ) <> 2 THEN
    RAISE EXCEPTION 'BLOCKED_BY_BACKFILL: column shape';
  END IF;

  IF (
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
  OR to_regclass('public.properties_operating_company_id_idx') IS NULL
  OR to_regclass('public.property_definitions_operating_company_id_idx') IS NULL THEN
    RAISE EXCEPTION 'BLOCKED_BY_BACKFILL: key or index';
  END IF;

  IF EXISTS (SELECT 1 FROM public.properties WHERE operating_company_id IS NOT NULL)
     OR EXISTS (SELECT 1 FROM public.property_definitions WHERE operating_company_id IS NOT NULL) THEN
    RAISE EXCEPTION 'BLOCKED_BY_BACKFILL: preexisting assignment';
  END IF;

  IF (
    SELECT count(*)
    FROM access.company_memberships
    WHERE company_id = jj_company
      AND membership_role = 'company_admin'
      AND is_active
  ) <> 1
  OR (SELECT count(*) FROM access.company_memberships) <> 1 THEN
    RAISE EXCEPTION 'BLOCKED_BY_BACKFILL: membership';
  END IF;

  IF (
    SELECT count(*)
    FROM supabase_migrations.schema_migrations
    WHERE version = '20260925120000'
  ) <> 1 THEN
    RAISE EXCEPTION 'BLOCKED_BY_BACKFILL: slice 2.1 history';
  END IF;

  UPDATE public.properties
  SET operating_company_id = jj_company
  WHERE operating_company_id IS NULL;
  GET DIAGNOSTICS updated_properties = ROW_COUNT;

  UPDATE public.property_definitions
  SET operating_company_id = jj_company
  WHERE operating_company_id IS NULL;
  GET DIAGNOSTICS updated_definitions = ROW_COUNT;

  IF updated_properties <> 40 OR updated_definitions <> 45 THEN
    RAISE EXCEPTION 'BLOCKED_BY_BACKFILL: update count';
  END IF;

  IF EXISTS (SELECT 1 FROM public.properties WHERE operating_company_id IS DISTINCT FROM jj_company)
     OR EXISTS (
       SELECT 1 FROM public.property_definitions
       WHERE operating_company_id IS DISTINCT FROM jj_company
     ) THEN
    RAISE EXCEPTION 'BLOCKED_BY_BACKFILL: null remains';
  END IF;
END
$backfill$;

COMMIT;
