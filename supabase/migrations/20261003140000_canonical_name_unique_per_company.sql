-- Canonical name is unique per operating company on public.entity_registry
-- and public.entities.
--
-- DRAFT. Do not apply without Yossi's explicit approval.
-- The backfill section below is a DATA write on live tables.
--
-- Index definitions were not found in supabase/migrations.
-- Searched for CREATE UNIQUE INDEX / UNIQUE (canonical_name) on
-- public.entity_registry and public.entities: no match.
-- The only canonical_name unique index in this repo is
-- lifecycle.entity_identity_canonical_name_uq, created in
-- supabase/migrations/20260713122206_m8_lifecycle_001_schema.sql as
--   CREATE UNIQUE INDEX entity_identity_canonical_name_uq
--     ON lifecycle.entity_identity (lower(canonical_name));
-- and dropped in supabase/migrations/20260810_001_pr4_wizard_foundation.sql.
-- That lifecycle index is not recreated here and is not dropped here.
--
-- Because the live text is not in the repo, apply fail-closes unless
-- pg_get_indexdef equals the expected standalone btree text below.
-- Expected form (PostgreSQL 17, no expression, no collation clause, no
-- partial predicate), verified by creating that statement on Postgres 17.11:
--   CREATE UNIQUE INDEX entity_registry_canonical_name_key
--     ON public.entity_registry USING btree (canonical_name)
--   CREATE UNIQUE INDEX entities_canonical_name_key
--     ON public.entities USING btree (canonical_name)
-- A different name, lower(), a collation, a WHERE clause, or a
-- constraint-backed index raises BLOCKED_BY_INDEXDEF and writes nothing.
-- The replacement index keeps that same bare canonical_name expression,
-- the same default collation, and the same empty predicate, and adds
-- operating_company_id as the leading key.
--
-- History: version 20261003140000 must be absent, and versions must be unique.
-- 20260930220000 (Slice A) is not in the repo or live and is not required.
-- Company id is never hard-coded and is never chosen by canonical_name.
-- New inserts take access.resolve_verified_operating_company.

BEGIN;

DO $migration$
DECLARE
  sole_company uuid;
  registry_count bigint;
  entities_count bigint;
  registry_updated bigint;
  entities_updated bigint;
  registry_indexdef text;
  entities_indexdef text;
  expected_registry_indexdef constant text := 'CREATE UNIQUE INDEX entity_registry_canonical_name_key ON public.entity_registry USING btree (canonical_name)';
  expected_entities_indexdef constant text := 'CREATE UNIQUE INDEX entities_canonical_name_key ON public.entities USING btree (canonical_name)';
  expected_registry_new_indexdef constant text := 'CREATE UNIQUE INDEX entity_registry_operating_company_id_canonical_name_key ON public.entity_registry USING btree (operating_company_id, canonical_name)';
  expected_entities_new_indexdef constant text := 'CREATE UNIQUE INDEX entities_operating_company_id_canonical_name_key ON public.entities USING btree (operating_company_id, canonical_name)';
BEGIN
  IF to_regclass('public.entity_registry') IS NULL
     OR to_regclass('public.entities') IS NULL
     OR to_regclass('registry.companies') IS NULL
     OR to_regclass('supabase_migrations.schema_migrations') IS NULL
     OR to_regprocedure('access.resolve_verified_operating_company(uuid,boolean)') IS NULL THEN
    RAISE EXCEPTION 'BLOCKED_BY_SCHEMA_DRIFT';
  END IF;

  LOCK TABLE public.entity_registry IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.entities IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE registry.companies IN SHARE ROW EXCLUSIVE MODE;

  IF (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20261003140000') <> 0
     OR (
       SELECT count(*) FROM (
         SELECT version
         FROM supabase_migrations.schema_migrations
         GROUP BY version
         HAVING count(*) > 1
       ) AS duplicated
     ) <> 0 THEN
    RAISE EXCEPTION 'BLOCKED_BY_HISTORY';
  END IF;

  IF EXISTS (
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
     OR to_regprocedure('access.enforce_entity_canonical_company()') IS NOT NULL
     OR EXISTS (
       SELECT 1
       FROM pg_trigger AS trigger_row
       WHERE NOT trigger_row.tgisinternal
         AND trigger_row.tgname IN (
           'trg_entity_registry_operating_company',
           'trg_entities_operating_company'
         )
     )
     OR to_regclass('public.entity_registry_operating_company_id_canonical_name_key') IS NOT NULL
     OR to_regclass('public.entities_operating_company_id_canonical_name_key') IS NOT NULL
     OR EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname IN (
         'entity_registry_operating_company_fk',
         'entities_operating_company_fk'
       )
     ) THEN
    RAISE EXCEPTION 'BLOCKED_BY_SCHEMA_DRIFT';
  END IF;

  SELECT pg_get_indexdef(index_row.indexrelid)
    INTO registry_indexdef
  FROM pg_index AS index_row
  JOIN pg_class AS table_relation ON table_relation.oid = index_row.indrelid
  JOIN pg_namespace AS table_namespace ON table_namespace.oid = table_relation.relnamespace
  WHERE table_namespace.nspname = 'public'
    AND table_relation.relname = 'entity_registry'
    AND index_row.indisunique
    AND index_row.indisvalid
    AND index_row.indisready
    AND NOT index_row.indisprimary
    AND index_row.indexprs IS NULL
    AND index_row.indpred IS NULL
    AND pg_get_indexdef(index_row.indexrelid) = expected_registry_indexdef
    AND NOT EXISTS (
      SELECT 1
      FROM pg_constraint AS owning_constraint
      WHERE owning_constraint.conindid = index_row.indexrelid
    );

  SELECT pg_get_indexdef(index_row.indexrelid)
    INTO entities_indexdef
  FROM pg_index AS index_row
  JOIN pg_class AS table_relation ON table_relation.oid = index_row.indrelid
  JOIN pg_namespace AS table_namespace ON table_namespace.oid = table_relation.relnamespace
  WHERE table_namespace.nspname = 'public'
    AND table_relation.relname = 'entities'
    AND index_row.indisunique
    AND index_row.indisvalid
    AND index_row.indisready
    AND NOT index_row.indisprimary
    AND index_row.indexprs IS NULL
    AND index_row.indpred IS NULL
    AND pg_get_indexdef(index_row.indexrelid) = expected_entities_indexdef
    AND NOT EXISTS (
      SELECT 1
      FROM pg_constraint AS owning_constraint
      WHERE owning_constraint.conindid = index_row.indexrelid
    );

  IF registry_indexdef IS DISTINCT FROM expected_registry_indexdef
     OR entities_indexdef IS DISTINCT FROM expected_entities_indexdef
     OR (
       SELECT count(*)
       FROM pg_index AS index_row
       JOIN pg_class AS table_relation ON table_relation.oid = index_row.indrelid
       JOIN pg_namespace AS table_namespace ON table_namespace.oid = table_relation.relnamespace
       WHERE table_namespace.nspname = 'public'
         AND table_relation.relname IN ('entity_registry', 'entities')
         AND index_row.indisunique
         AND NOT index_row.indisprimary
         AND position('canonical_name' in pg_get_indexdef(index_row.indexrelid)) > 0
         AND position('operating_company_id' in pg_get_indexdef(index_row.indexrelid)) = 0
     ) <> 2 THEN
    RAISE EXCEPTION 'BLOCKED_BY_INDEXDEF';
  END IF;

  sole_company := access.resolve_verified_operating_company(NULL, false);
  IF sole_company IS NULL
     OR (SELECT count(*) FROM registry.companies WHERE status = 'active') <> 1
     OR (SELECT count(*) FROM registry.companies WHERE registry.companies.company_id = sole_company AND status = 'active') <> 1 THEN
    RAISE EXCEPTION 'BLOCKED_BY_COMPANY_CONTEXT';
  END IF;

  ALTER TABLE public.entity_registry
    ADD COLUMN operating_company_id uuid;

  ALTER TABLE public.entities
    ADD COLUMN operating_company_id uuid;

  ALTER TABLE public.entity_registry
    ADD CONSTRAINT entity_registry_operating_company_fk
    FOREIGN KEY (operating_company_id)
    REFERENCES registry.companies (company_id)
    ON DELETE RESTRICT;

  ALTER TABLE public.entities
    ADD CONSTRAINT entities_operating_company_fk
    FOREIGN KEY (operating_company_id)
    REFERENCES registry.companies (company_id)
    ON DELETE RESTRICT;

  -- ===========================================================================
  -- DATA WRITE / BACKFILL
  -- This UPDATEs every existing row of public.entity_registry and
  -- public.entities. operating_company_id is set to the sole active company
  -- returned by access.resolve_verified_operating_company(NULL, false).
  -- The UUID is not hard-coded. The row name is not read.
  -- APPLYING THIS BLOCK REQUIRES YOSSI'S EXPLICIT APPROVAL FOR THE BACKFILL.
  -- ===========================================================================
  SELECT count(*) INTO registry_count FROM public.entity_registry;
  SELECT count(*) INTO entities_count FROM public.entities;

  sole_company := access.resolve_verified_operating_company(NULL, false);
  IF sole_company IS NULL
     OR (SELECT count(*) FROM registry.companies WHERE status = 'active') <> 1 THEN
    RAISE EXCEPTION 'BLOCKED_BY_COMPANY_CONTEXT';
  END IF;

  UPDATE public.entity_registry
  SET operating_company_id = sole_company
  WHERE operating_company_id IS NULL;
  GET DIAGNOSTICS registry_updated = ROW_COUNT;

  UPDATE public.entities
  SET operating_company_id = sole_company
  WHERE operating_company_id IS NULL;
  GET DIAGNOSTICS entities_updated = ROW_COUNT;

  IF registry_updated <> registry_count
     OR entities_updated <> entities_count
     OR EXISTS (
       SELECT 1 FROM public.entity_registry
       WHERE operating_company_id IS DISTINCT FROM sole_company
     )
     OR EXISTS (
       SELECT 1 FROM public.entities
       WHERE operating_company_id IS DISTINCT FROM sole_company
     ) THEN
    RAISE EXCEPTION 'BLOCKED_BY_BACKFILL';
  END IF;

  ALTER TABLE public.entity_registry
    ALTER COLUMN operating_company_id SET NOT NULL;

  ALTER TABLE public.entities
    ALTER COLUMN operating_company_id SET NOT NULL;

  DROP INDEX public.entity_registry_canonical_name_key;
  DROP INDEX public.entities_canonical_name_key;

  CREATE UNIQUE INDEX entity_registry_operating_company_id_canonical_name_key
    ON public.entity_registry USING btree (operating_company_id, canonical_name);

  CREATE UNIQUE INDEX entities_operating_company_id_canonical_name_key
    ON public.entities USING btree (operating_company_id, canonical_name);

  CREATE FUNCTION access.enforce_entity_canonical_company()
  RETURNS trigger
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path = pg_catalog
  AS $enforce$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.operating_company_id IS NULL THEN
      RAISE EXCEPTION 'BLOCKED_BY_COMPANY_CONTEXT';
    END IF;
    IF NEW.operating_company_id IS DISTINCT FROM OLD.operating_company_id THEN
      RAISE EXCEPTION 'BLOCKED_BY_COMPANY_REASSIGNMENT';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'BLOCKED_BY_SCHEMA_DRIFT';
  END IF;

  NEW.operating_company_id := access.resolve_verified_operating_company(NEW.operating_company_id, false);
  RETURN NEW;
END
$enforce$;

  REVOKE ALL ON FUNCTION access.enforce_entity_canonical_company() FROM PUBLIC;
  REVOKE ALL ON FUNCTION access.enforce_entity_canonical_company() FROM anon, authenticated, service_role;

  CREATE TRIGGER trg_entity_registry_operating_company
    BEFORE INSERT OR UPDATE ON public.entity_registry
    FOR EACH ROW
    EXECUTE FUNCTION access.enforce_entity_canonical_company();

  CREATE TRIGGER trg_entities_operating_company
    BEFORE INSERT OR UPDATE ON public.entities
    FOR EACH ROW
    EXECUTE FUNCTION access.enforce_entity_canonical_company();

  IF (
       SELECT count(*)
       FROM pg_attribute AS attribute
       JOIN pg_class AS relation ON relation.oid = attribute.attrelid
       JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
       WHERE namespace.nspname = 'public'
         AND relation.relname IN ('entity_registry', 'entities')
         AND attribute.attname = 'operating_company_id'
         AND attribute.attnum > 0
         AND NOT attribute.attisdropped
         AND attribute.atttypid = 'uuid'::regtype
         AND attribute.attnotnull
         AND NOT attribute.atthasdef
         AND attribute.attgenerated = ''
     ) <> 2
     OR pg_get_indexdef('public.entity_registry_operating_company_id_canonical_name_key'::regclass) IS DISTINCT FROM expected_registry_new_indexdef
     OR pg_get_indexdef('public.entities_operating_company_id_canonical_name_key'::regclass) IS DISTINCT FROM expected_entities_new_indexdef
     OR to_regclass('public.entity_registry_canonical_name_key') IS NOT NULL
     OR to_regclass('public.entities_canonical_name_key') IS NOT NULL
     OR EXISTS (
       SELECT 1 FROM public.entity_registry WHERE operating_company_id IS NULL
     )
     OR EXISTS (
       SELECT 1 FROM public.entities WHERE operating_company_id IS NULL
     )
     OR EXISTS (
       SELECT 1 FROM public.entity_registry WHERE operating_company_id IS DISTINCT FROM sole_company
     )
     OR EXISTS (
       SELECT 1 FROM public.entities WHERE operating_company_id IS DISTINCT FROM sole_company
     )
     OR (
       SELECT count(*)
       FROM pg_trigger AS trigger_row
       JOIN pg_proc AS proc ON proc.oid = trigger_row.tgfoid
       JOIN pg_namespace AS namespace ON namespace.oid = proc.pronamespace
       WHERE NOT trigger_row.tgisinternal
         AND trigger_row.tgenabled = 'O'
         AND namespace.nspname = 'access'
         AND proc.proname = 'enforce_entity_canonical_company'
         AND trigger_row.tgname IN (
           'trg_entity_registry_operating_company',
           'trg_entities_operating_company'
         )
     ) <> 2
     OR (
       SELECT count(*)
       FROM pg_proc AS proc
       JOIN pg_namespace AS namespace ON namespace.oid = proc.pronamespace
       WHERE namespace.nspname = 'access'
         AND proc.proname = 'enforce_entity_canonical_company'
         AND proc.prosecdef
         AND proc.provolatile = 'v'
         AND proc.proconfig @> ARRAY['search_path=pg_catalog']
         AND position('access.resolve_verified_operating_company' in proc.prosrc) > 0
         AND position('canonical_name' in proc.prosrc) = 0
     ) <> 1
     OR has_function_privilege('anon', 'access.enforce_entity_canonical_company()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'access.enforce_entity_canonical_company()', 'EXECUTE')
     OR has_function_privilege('service_role', 'access.enforce_entity_canonical_company()', 'EXECUTE')
     OR (
       SELECT count(*)
       FROM pg_constraint AS company_fk
       JOIN pg_class AS owning ON owning.oid = company_fk.conrelid
       JOIN pg_namespace AS owning_namespace ON owning_namespace.oid = owning.relnamespace
       JOIN pg_class AS referenced ON referenced.oid = company_fk.confrelid
       JOIN pg_namespace AS referenced_namespace ON referenced_namespace.oid = referenced.relnamespace
       JOIN pg_attribute AS referenced_column
         ON referenced_column.attrelid = referenced.oid
        AND referenced_column.attnum = company_fk.confkey[1]
       WHERE company_fk.contype = 'f'
         AND company_fk.convalidated
         AND company_fk.confdeltype = 'r'
         AND referenced_namespace.nspname = 'registry'
         AND referenced.relname = 'companies'
         AND referenced_column.attname = 'company_id'
         AND owning_namespace.nspname = 'public'
         AND (owning.relname, company_fk.conname) IN (
           ('entity_registry', 'entity_registry_operating_company_fk'),
           ('entities', 'entities_operating_company_fk')
         )
     ) <> 2 THEN
    RAISE EXCEPTION 'BLOCKED_BY_SCHEMA_DRIFT';
  END IF;
END
$migration$;

COMMIT;
