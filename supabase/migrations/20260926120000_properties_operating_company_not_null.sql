-- Slice 2.3: require operating_company_id on the two property roots.
-- Aborts before SET NOT NULL when a precondition fails.
-- Does not add a column default. Does not change row-level security.

BEGIN;

DO $require$
DECLARE
  jj_company uuid := '10f6e9b3-c5b9-4d95-a318-48f20f89477f';
BEGIN
  IF (SELECT count(*) FROM registry.companies) <> 1
     OR NOT EXISTS (
       SELECT 1
       FROM registry.companies
       WHERE company_id = jj_company
         AND status = 'active'
     ) THEN
    RAISE EXCEPTION 'BLOCKED_BY_NOT_NULL: company registry';
  END IF;

  IF (SELECT count(*) FROM public.properties) <> 40
     OR (SELECT count(*) FROM public.property_definitions) <> 45 THEN
    RAISE EXCEPTION 'BLOCKED_BY_NOT_NULL: row count';
  END IF;

  IF (SELECT count(*) FROM public.properties WHERE operating_company_id = jj_company) <> 40
     OR (SELECT count(*) FROM public.property_definitions WHERE operating_company_id = jj_company) <> 45
     OR EXISTS (
       SELECT 1 FROM public.properties
       WHERE operating_company_id IS DISTINCT FROM jj_company
     )
     OR EXISTS (
       SELECT 1 FROM public.property_definitions
       WHERE operating_company_id IS DISTINCT FROM jj_company
     ) THEN
    RAISE EXCEPTION 'BLOCKED_BY_NOT_NULL: assignment';
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
    RAISE EXCEPTION 'BLOCKED_BY_NOT_NULL: column shape';
  END IF;

  IF (
    SELECT count(*)
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
      AND company_fk.convalidated
      AND company_fk.confdeltype = 'r'
      AND cardinality(company_fk.conkey) = 1
      AND cardinality(company_fk.confkey) = 1
      AND owning_namespace.nspname = 'public'
      AND local_column.attname = 'operating_company_id'
      AND referenced_namespace.nspname = 'registry'
      AND referenced.relname = 'companies'
      AND referenced_column.attname = 'company_id'
      AND (
        (
          owning.relname = 'properties'
          AND company_fk.conname = 'properties_operating_company_fk'
        )
        OR (
          owning.relname = 'property_definitions'
          AND company_fk.conname = 'property_definitions_operating_company_fk'
        )
      )
  ) <> 2
  OR (
    SELECT count(*)
    FROM pg_index AS index_row
    JOIN pg_class AS index_relation ON index_relation.oid = index_row.indexrelid
    JOIN pg_namespace AS index_namespace ON index_namespace.oid = index_relation.relnamespace
    JOIN pg_class AS table_relation ON table_relation.oid = index_row.indrelid
    JOIN pg_namespace AS table_namespace ON table_namespace.oid = table_relation.relnamespace
    JOIN pg_attribute AS indexed_column
      ON indexed_column.attrelid = table_relation.oid
     AND indexed_column.attnum = index_row.indkey[0]
    WHERE index_namespace.nspname = 'public'
      AND table_namespace.nspname = 'public'
      AND indexed_column.attname = 'operating_company_id'
      AND index_row.indisvalid
      AND index_row.indisready
      AND NOT index_row.indisunique
      AND index_row.indexprs IS NULL
      AND index_row.indpred IS NULL
      AND index_row.indnkeyatts = 1
      AND (
        (
          table_relation.relname = 'properties'
          AND index_relation.relname = 'properties_operating_company_id_idx'
        )
        OR (
          table_relation.relname = 'property_definitions'
          AND index_relation.relname = 'property_definitions_operating_company_id_idx'
        )
      )
  ) <> 2 THEN
    RAISE EXCEPTION 'BLOCKED_BY_NOT_NULL: key or index';
  END IF;

  IF (
    SELECT count(*)
    FROM access.company_memberships
    WHERE company_id = jj_company
      AND membership_role = 'company_admin'
      AND is_active
  ) <> 1
  OR (SELECT count(*) FROM access.company_memberships) <> 1 THEN
    RAISE EXCEPTION 'BLOCKED_BY_NOT_NULL: membership';
  END IF;

  IF (
    SELECT count(*)
    FROM supabase_migrations.schema_migrations
    WHERE version = '20260925140000'
  ) <> 1
  OR (
    SELECT count(*)
    FROM supabase_migrations.schema_migrations
    WHERE version = '20260925120000'
  ) <> 1 THEN
    RAISE EXCEPTION 'BLOCKED_BY_NOT_NULL: slice history';
  END IF;

  ALTER TABLE public.properties
    ALTER COLUMN operating_company_id SET NOT NULL;
  ALTER TABLE public.property_definitions
    ALTER COLUMN operating_company_id SET NOT NULL;

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
        NOT attribute.attnotnull
        OR attribute.atthasdef
        OR attribute.atttypid <> 'uuid'::regtype
      )
  ) THEN
    RAISE EXCEPTION 'BLOCKED_BY_NOT_NULL: requirement missing';
  END IF;
END
$require$;

COMMIT;
