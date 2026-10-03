-- Rollback for 20261003140000_canonical_name_unique_per_company.
-- Restores the standalone canonical_name unique indexes and drops
-- operating_company_id. Does not touch lifecycle.
-- Refuses when a canonical_name collision would make the old index untrue.
--
-- Restored index text, same expected pg_get_indexdef as the forward guard
-- (not found in supabase/migrations; see the forward migration comment):
--   CREATE UNIQUE INDEX entity_registry_canonical_name_key
--     ON public.entity_registry USING btree (canonical_name)
--   CREATE UNIQUE INDEX entities_canonical_name_key
--     ON public.entities USING btree (canonical_name)

BEGIN;

DO $rollback$
DECLARE
  expected_registry_indexdef constant text := 'CREATE UNIQUE INDEX entity_registry_canonical_name_key ON public.entity_registry USING btree (canonical_name)';
  expected_entities_indexdef constant text := 'CREATE UNIQUE INDEX entities_canonical_name_key ON public.entities USING btree (canonical_name)';
  expected_registry_new_indexdef constant text := 'CREATE UNIQUE INDEX entity_registry_operating_company_id_canonical_name_key ON public.entity_registry USING btree (operating_company_id, canonical_name)';
  expected_entities_new_indexdef constant text := 'CREATE UNIQUE INDEX entities_operating_company_id_canonical_name_key ON public.entities USING btree (operating_company_id, canonical_name)';
BEGIN
  IF to_regclass('public.entity_registry') IS NULL
     OR to_regclass('public.entities') IS NULL THEN
    RAISE EXCEPTION 'BLOCKED_BY_ROLLBACK';
  END IF;

  LOCK TABLE public.entity_registry IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.entities IN SHARE ROW EXCLUSIVE MODE;

  IF pg_get_indexdef('public.entity_registry_operating_company_id_canonical_name_key'::regclass) IS DISTINCT FROM expected_registry_new_indexdef
     OR pg_get_indexdef('public.entities_operating_company_id_canonical_name_key'::regclass) IS DISTINCT FROM expected_entities_new_indexdef
     OR to_regclass('public.entity_registry_canonical_name_key') IS NOT NULL
     OR to_regclass('public.entities_canonical_name_key') IS NOT NULL
     OR to_regprocedure('access.enforce_entity_canonical_company()') IS NULL THEN
    RAISE EXCEPTION 'BLOCKED_BY_ROLLBACK';
  END IF;

  IF EXISTS (
       SELECT 1
       FROM public.entity_registry
       WHERE canonical_name IS NOT NULL
       GROUP BY canonical_name
       HAVING count(*) > 1
     )
     OR EXISTS (
       SELECT 1
       FROM public.entities
       WHERE canonical_name IS NOT NULL
       GROUP BY canonical_name
       HAVING count(*) > 1
     ) THEN
    RAISE EXCEPTION 'BLOCKED_BY_ROLLBACK: canonical_name collision';
  END IF;

  DROP TRIGGER trg_entity_registry_operating_company ON public.entity_registry;
  DROP TRIGGER trg_entities_operating_company ON public.entities;
  DROP FUNCTION access.enforce_entity_canonical_company();

  DROP INDEX public.entity_registry_operating_company_id_canonical_name_key;
  DROP INDEX public.entities_operating_company_id_canonical_name_key;

  CREATE UNIQUE INDEX entity_registry_canonical_name_key
    ON public.entity_registry USING btree (canonical_name);

  CREATE UNIQUE INDEX entities_canonical_name_key
    ON public.entities USING btree (canonical_name);

  ALTER TABLE public.entity_registry
    DROP CONSTRAINT entity_registry_operating_company_fk;

  ALTER TABLE public.entities
    DROP CONSTRAINT entities_operating_company_fk;

  ALTER TABLE public.entity_registry
    DROP COLUMN operating_company_id;

  ALTER TABLE public.entities
    DROP COLUMN operating_company_id;

  IF pg_get_indexdef('public.entity_registry_canonical_name_key'::regclass) IS DISTINCT FROM expected_registry_indexdef
     OR pg_get_indexdef('public.entities_canonical_name_key'::regclass) IS DISTINCT FROM expected_entities_indexdef
     OR to_regclass('public.entity_registry_operating_company_id_canonical_name_key') IS NOT NULL
     OR to_regclass('public.entities_operating_company_id_canonical_name_key') IS NOT NULL
     OR to_regprocedure('access.enforce_entity_canonical_company()') IS NOT NULL
     OR EXISTS (
       SELECT 1
       FROM pg_attribute AS attribute
       JOIN pg_class AS relation ON relation.oid = attribute.attrelid
       JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
       WHERE namespace.nspname = 'public'
         AND relation.relname IN ('entity_registry', 'entities')
         AND attribute.attname = 'operating_company_id'
         AND attribute.attnum > 0
         AND NOT attribute.attisdropped
     ) THEN
    RAISE EXCEPTION 'BLOCKED_BY_ROLLBACK';
  END IF;
END
$rollback$;

COMMIT;
