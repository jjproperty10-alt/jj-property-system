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
--
-- Backfill evidence is docs/planning/canonical_name_company_evidence_2026-10-03.md.
-- Before any UPDATE, a row with no qualifying link raises BLOCKED_BY_EVIDENCE.
-- The exception is an explicit list this migration does not create or fill:
-- access.canonical_name_backfill_approved_ids (source_table text, row_id uuid).
-- source_table is entity_registry or entities, with no schema prefix.

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
  evidence_source text;
  evidence_key text;
  lock_target record;
  fk_link record;
  bridge_ready boolean;
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
  --
  -- The UPDATE below does not run while any existing row is in the
  -- no-evidence class. Evidence rules match
  -- docs/planning/canonical_name_company_evidence_2026-10-03.md.
  -- A qualifying link is a single-column foreign key to or from
  -- public.property_definitions, public.contacts, or a lifecycle table that
  -- has operating_company_id uuid, where that linked row's
  -- operating_company_id is the sole active company. For entity_registry
  -- only, an approved registry.property_external_identities row with
  -- source_system app.entity_registry pointing at such a property_definitions
  -- row is also a link. Name equality is not a link.
  -- access.canonical_name_backfill_approved_ids may list the rows that have
  -- no link. This migration does not create or fill that list. A missing
  -- list approves nothing. A list with any other column types raises
  -- BLOCKED_BY_EVIDENCE.
  -- ===========================================================================
  SELECT count(*) INTO registry_count FROM public.entity_registry;
  SELECT count(*) INTO entities_count FROM public.entities;

  sole_company := access.resolve_verified_operating_company(NULL, false);
  IF sole_company IS NULL
     OR (SELECT count(*) FROM registry.companies WHERE status = 'active') <> 1 THEN
    RAISE EXCEPTION 'BLOCKED_BY_COMPANY_CONTEXT';
  END IF;

  IF to_regclass('access.canonical_name_backfill_approved_ids') IS NOT NULL
     AND (
       SELECT count(*)
       FROM pg_attribute AS attribute
       JOIN pg_class AS relation ON relation.oid = attribute.attrelid
       JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
       WHERE namespace.nspname = 'access'
         AND relation.relname = 'canonical_name_backfill_approved_ids'
         AND attribute.attnum > 0
         AND NOT attribute.attisdropped
         AND (
           (attribute.attname = 'source_table' AND attribute.atttypid = 'text'::regtype)
           OR (attribute.attname = 'row_id' AND attribute.atttypid = 'uuid'::regtype)
         )
     ) <> 2 THEN
    RAISE EXCEPTION 'BLOCKED_BY_EVIDENCE';
  END IF;

  FOR lock_target IN
    SELECT namespace.nspname AS schema_name, relation.relname AS table_name
    FROM pg_class AS relation
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE relation.relkind IN ('r', 'p')
      AND (
        (namespace.nspname = 'public' AND relation.relname IN ('property_definitions', 'contacts'))
        OR namespace.nspname = 'lifecycle'
        OR (namespace.nspname, relation.relname) IN (
          ('registry', 'property_external_identities'),
          ('access', 'canonical_name_backfill_approved_ids')
        )
      )
    ORDER BY namespace.nspname, relation.relname
  LOOP
    EXECUTE format(
      'LOCK TABLE %I.%I IN SHARE ROW EXCLUSIVE MODE',
      lock_target.schema_name,
      lock_target.table_name
    );
  END LOOP;

  CREATE TEMP TABLE canon_row_evidence (
    source_table text NOT NULL,
    row_id uuid NOT NULL,
    linked boolean NOT NULL DEFAULT false,
    PRIMARY KEY (source_table, row_id)
  ) ON COMMIT DROP;

  FOR evidence_source IN
    SELECT source_name
    FROM (VALUES ('entity_registry'), ('entities')) AS source_names(source_name)
  LOOP
    evidence_key := NULL;
    SELECT column_attr.attname
      INTO evidence_key
    FROM pg_constraint AS primary_key
    JOIN pg_class AS relation ON relation.oid = primary_key.conrelid
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    JOIN pg_attribute AS column_attr
      ON column_attr.attrelid = relation.oid
     AND column_attr.attnum = primary_key.conkey[1]
     AND NOT column_attr.attisdropped
    WHERE namespace.nspname = 'public'
      AND relation.relname = evidence_source
      AND primary_key.contype = 'p'
      AND cardinality(primary_key.conkey) = 1
      AND column_attr.atttypid = 'uuid'::regtype;

    IF evidence_key IS NULL THEN
      RAISE EXCEPTION 'BLOCKED_BY_EVIDENCE';
    END IF;

    EXECUTE format(
      'INSERT INTO pg_temp.canon_row_evidence (source_table, row_id) SELECT %L, entity_row.%I FROM public.%I AS entity_row',
      evidence_source,
      evidence_key,
      evidence_source
    );
  END LOOP;

  FOR fk_link IN
    SELECT
      CASE
        WHEN src_namespace.nspname = 'public' AND src_relation.relname IN ('entity_registry', 'entities')
          THEN src_relation.relname
        ELSE dst_relation.relname
      END AS source_table,
      CASE
        WHEN src_namespace.nspname = 'public' AND src_relation.relname IN ('entity_registry', 'entities')
          THEN src_column.attname
        ELSE dst_column.attname
      END AS entity_column,
      CASE
        WHEN src_namespace.nspname = 'public' AND src_relation.relname IN ('entity_registry', 'entities')
          THEN dst_namespace.nspname
        ELSE src_namespace.nspname
      END AS carrier_schema,
      CASE
        WHEN src_namespace.nspname = 'public' AND src_relation.relname IN ('entity_registry', 'entities')
          THEN dst_relation.relname
        ELSE src_relation.relname
      END AS carrier_table,
      CASE
        WHEN src_namespace.nspname = 'public' AND src_relation.relname IN ('entity_registry', 'entities')
          THEN dst_column.attname
        ELSE src_column.attname
      END AS carrier_column
    FROM pg_constraint AS fk
    JOIN pg_class AS src_relation ON src_relation.oid = fk.conrelid
    JOIN pg_namespace AS src_namespace ON src_namespace.oid = src_relation.relnamespace
    JOIN pg_class AS dst_relation ON dst_relation.oid = fk.confrelid
    JOIN pg_namespace AS dst_namespace ON dst_namespace.oid = dst_relation.relnamespace
    JOIN pg_attribute AS src_column
      ON src_column.attrelid = src_relation.oid
     AND src_column.attnum = fk.conkey[1]
     AND NOT src_column.attisdropped
    JOIN pg_attribute AS dst_column
      ON dst_column.attrelid = dst_relation.oid
     AND dst_column.attnum = fk.confkey[1]
     AND NOT dst_column.attisdropped
    WHERE fk.contype = 'f'
      AND cardinality(fk.conkey) = 1
      AND cardinality(fk.confkey) = 1
      AND src_relation.relkind IN ('r', 'p')
      AND dst_relation.relkind IN ('r', 'p')
      AND (
        (
          src_namespace.nspname = 'public'
          AND src_relation.relname IN ('entity_registry', 'entities')
          AND (
            (dst_namespace.nspname = 'public' AND dst_relation.relname IN ('property_definitions', 'contacts'))
            OR dst_namespace.nspname = 'lifecycle'
          )
          AND EXISTS (
            SELECT 1
            FROM pg_attribute AS company_column
            WHERE company_column.attrelid = dst_relation.oid
              AND company_column.attname = 'operating_company_id'
              AND company_column.attnum > 0
              AND NOT company_column.attisdropped
              AND company_column.atttypid = 'uuid'::regtype
          )
        )
        OR (
          dst_namespace.nspname = 'public'
          AND dst_relation.relname IN ('entity_registry', 'entities')
          AND (
            (src_namespace.nspname = 'public' AND src_relation.relname IN ('property_definitions', 'contacts'))
            OR src_namespace.nspname = 'lifecycle'
          )
          AND EXISTS (
            SELECT 1
            FROM pg_attribute AS company_column
            WHERE company_column.attrelid = src_relation.oid
              AND company_column.attname = 'operating_company_id'
              AND company_column.attnum > 0
              AND NOT company_column.attisdropped
              AND company_column.atttypid = 'uuid'::regtype
          )
        )
      )
  LOOP
    evidence_key := NULL;
    SELECT column_attr.attname
      INTO evidence_key
    FROM pg_constraint AS primary_key
    JOIN pg_class AS relation ON relation.oid = primary_key.conrelid
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    JOIN pg_attribute AS column_attr
      ON column_attr.attrelid = relation.oid
     AND column_attr.attnum = primary_key.conkey[1]
     AND NOT column_attr.attisdropped
    WHERE namespace.nspname = 'public'
      AND relation.relname = fk_link.source_table
      AND primary_key.contype = 'p'
      AND cardinality(primary_key.conkey) = 1
      AND column_attr.atttypid = 'uuid'::regtype;

    IF evidence_key IS NULL THEN
      RAISE EXCEPTION 'BLOCKED_BY_EVIDENCE';
    END IF;

    EXECUTE format(
      'UPDATE pg_temp.canon_row_evidence AS evidence
       SET linked = true
       FROM public.%I AS entity_row
       JOIN %I.%I AS carrier_row
         ON carrier_row.%I IS NOT DISTINCT FROM entity_row.%I
       WHERE evidence.source_table = %L
         AND evidence.row_id IS NOT DISTINCT FROM entity_row.%I
         AND carrier_row.operating_company_id = $1',
      fk_link.source_table,
      fk_link.carrier_schema,
      fk_link.carrier_table,
      fk_link.carrier_column,
      fk_link.entity_column,
      fk_link.source_table,
      evidence_key
    ) USING sole_company;
  END LOOP;

  SELECT
    to_regclass('registry.property_external_identities') IS NOT NULL
    AND to_regclass('public.property_definitions') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM pg_attribute AS attribute
      JOIN pg_class AS relation ON relation.oid = attribute.attrelid
      JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'registry'
        AND relation.relname = 'property_external_identities'
        AND attribute.attnum > 0
        AND NOT attribute.attisdropped
        AND (
          (attribute.attname = 'source_system' AND attribute.atttypid = 'text'::regtype)
          OR (attribute.attname = 'external_id' AND attribute.atttypid = 'text'::regtype)
          OR (attribute.attname = 'mapping_status' AND attribute.atttypid = 'text'::regtype)
          OR (attribute.attname = 'canonical_property_id' AND attribute.atttypid = 'uuid'::regtype)
        )
    )
    AND (
      SELECT count(*)
      FROM pg_attribute AS attribute
      JOIN pg_class AS relation ON relation.oid = attribute.attrelid
      JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'registry'
        AND relation.relname = 'property_external_identities'
        AND attribute.attnum > 0
        AND NOT attribute.attisdropped
        AND (
          (attribute.attname = 'source_system' AND attribute.atttypid = 'text'::regtype)
          OR (attribute.attname = 'external_id' AND attribute.atttypid = 'text'::regtype)
          OR (attribute.attname = 'mapping_status' AND attribute.atttypid = 'text'::regtype)
          OR (attribute.attname = 'canonical_property_id' AND attribute.atttypid = 'uuid'::regtype)
        )
    ) = 4
    AND EXISTS (
      SELECT 1
      FROM pg_attribute AS attribute
      JOIN pg_class AS relation ON relation.oid = attribute.attrelid
      JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
        AND relation.relname = 'property_definitions'
        AND attribute.attnum > 0
        AND NOT attribute.attisdropped
        AND (
          (attribute.attname = 'property_id' AND attribute.atttypid = 'uuid'::regtype)
          OR (attribute.attname = 'operating_company_id' AND attribute.atttypid = 'uuid'::regtype)
        )
    )
    AND (
      SELECT count(*)
      FROM pg_attribute AS attribute
      JOIN pg_class AS relation ON relation.oid = attribute.attrelid
      JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
        AND relation.relname = 'property_definitions'
        AND attribute.attnum > 0
        AND NOT attribute.attisdropped
        AND (
          (attribute.attname = 'property_id' AND attribute.atttypid = 'uuid'::regtype)
          OR (attribute.attname = 'operating_company_id' AND attribute.atttypid = 'uuid'::regtype)
        )
    ) = 2
    INTO bridge_ready;

  IF bridge_ready THEN
    evidence_key := NULL;
    SELECT column_attr.attname
      INTO evidence_key
    FROM pg_constraint AS primary_key
    JOIN pg_class AS relation ON relation.oid = primary_key.conrelid
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    JOIN pg_attribute AS column_attr
      ON column_attr.attrelid = relation.oid
     AND column_attr.attnum = primary_key.conkey[1]
     AND NOT column_attr.attisdropped
    WHERE namespace.nspname = 'public'
      AND relation.relname = 'entity_registry'
      AND primary_key.contype = 'p'
      AND cardinality(primary_key.conkey) = 1
      AND column_attr.atttypid = 'uuid'::regtype;

    IF evidence_key IS NULL THEN
      RAISE EXCEPTION 'BLOCKED_BY_EVIDENCE';
    END IF;

    EXECUTE format(
      $bridge_update$
      UPDATE pg_temp.canon_row_evidence AS evidence
      SET linked = true
      FROM public.entity_registry AS entity_row
      JOIN registry.property_external_identities AS bridge
        ON bridge.source_system = 'app.entity_registry'
       AND bridge.mapping_status = 'approved'
       AND bridge.canonical_property_id IS NOT NULL
       AND lower(bridge.external_id) = lower(entity_row.%I::text)
      JOIN public.property_definitions AS definition
        ON definition.property_id = bridge.canonical_property_id
      WHERE evidence.source_table = 'entity_registry'
        AND evidence.row_id IS NOT DISTINCT FROM entity_row.%I
        AND definition.operating_company_id = $1
      $bridge_update$,
      evidence_key,
      evidence_key
    ) USING sole_company;
  END IF;

  IF to_regclass('access.canonical_name_backfill_approved_ids') IS NULL THEN
    IF EXISTS (SELECT 1 FROM pg_temp.canon_row_evidence WHERE NOT linked) THEN
      RAISE EXCEPTION 'BLOCKED_BY_EVIDENCE';
    END IF;
  ELSIF EXISTS (
    SELECT 1
    FROM pg_temp.canon_row_evidence AS evidence
    WHERE NOT evidence.linked
      AND NOT EXISTS (
        SELECT 1
        FROM access.canonical_name_backfill_approved_ids AS approved
        WHERE approved.source_table = evidence.source_table
          AND approved.row_id = evidence.row_id
      )
  ) THEN
    RAISE EXCEPTION 'BLOCKED_BY_EVIDENCE';
  END IF;

  DROP TABLE pg_temp.canon_row_evidence;

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
