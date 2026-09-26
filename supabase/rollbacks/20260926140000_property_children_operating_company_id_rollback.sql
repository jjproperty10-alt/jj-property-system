-- Rollback for 20260926140000_property_children_operating_company_id.
-- Validates all nine columns, foreign keys, and indexes before the first drop.
-- Drops those objects only while every value is still null.
-- Does not delete a company, a property, a mapping, or an auth user.

BEGIN;

DO $rollback$
DECLARE
  column_count integer;
  foreign_key_count integer;
  index_count integer;
  unexpected_dependency_count integer;
  reviewed_dependency_count integer;
  publication_count integer;
BEGIN
  IF to_regclass('public.property_owners') IS NULL
     OR to_regclass('public.property_ownership') IS NULL
     OR to_regclass('public.ownership') IS NULL
     OR to_regclass('public.property_name_aliases') IS NULL
     OR to_regclass('public.property_reporting_map') IS NULL
     OR to_regclass('lifecycle.property_acquisition') IS NULL
     OR to_regclass('lifecycle.service_engagements') IS NULL
     OR to_regclass('lifecycle.management_fee_configs') IS NULL
     OR to_regclass('pms.property_mappings') IS NULL THEN
    RAISE EXCEPTION 'BLOCKED_BY_ROLLBACK';
  END IF;

  SELECT count(*) INTO column_count
  FROM pg_attribute AS attribute
  JOIN pg_class AS relation ON relation.oid = attribute.attrelid
  JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  WHERE attribute.attname = 'operating_company_id'
    AND attribute.attnum > 0
    AND NOT attribute.attisdropped
    AND attribute.atttypid = 'uuid'::regtype
    AND attribute.attnotnull = false
    AND attribute.atthasdef = false
    AND attribute.attgenerated = ''
    AND (namespace.nspname, relation.relname) IN (
      ('public', 'property_owners'),
      ('public', 'property_ownership'),
      ('public', 'ownership'),
      ('public', 'property_name_aliases'),
      ('public', 'property_reporting_map'),
      ('lifecycle', 'property_acquisition'),
      ('lifecycle', 'service_engagements'),
      ('lifecycle', 'management_fee_configs'),
      ('pms', 'property_mappings')
    );

  SELECT count(*) INTO foreign_key_count
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
    AND company_fk.convalidated = true
    AND company_fk.confdeltype = 'r'
    AND company_fk.condeferrable = false
    AND company_fk.condeferred = false
    AND cardinality(company_fk.conkey) = 1
    AND cardinality(company_fk.confkey) = 1
    AND local_column.attname = 'operating_company_id'
    AND referenced_namespace.nspname = 'registry'
    AND referenced.relname = 'companies'
    AND referenced_column.attname = 'company_id'
    AND (owning_namespace.nspname, owning.relname, company_fk.conname) IN (
      ('public', 'property_owners', 'property_owners_operating_company_fk'),
      ('public', 'property_ownership', 'property_ownership_operating_company_fk'),
      ('public', 'ownership', 'ownership_operating_company_fk'),
      ('public', 'property_name_aliases', 'property_name_aliases_operating_company_fk'),
      ('public', 'property_reporting_map', 'property_reporting_map_operating_company_fk'),
      ('lifecycle', 'property_acquisition', 'property_acquisition_operating_company_fk'),
      ('lifecycle', 'service_engagements', 'service_engagements_operating_company_fk'),
      ('lifecycle', 'management_fee_configs', 'management_fee_configs_operating_company_fk'),
      ('pms', 'property_mappings', 'property_mappings_operating_company_fk')
    );

  SELECT count(*) INTO index_count
  FROM pg_index AS index_row
  JOIN pg_class AS index_relation ON index_relation.oid = index_row.indexrelid
  JOIN pg_namespace AS index_namespace ON index_namespace.oid = index_relation.relnamespace
  JOIN pg_class AS table_relation ON table_relation.oid = index_row.indrelid
  JOIN pg_namespace AS table_namespace ON table_namespace.oid = table_relation.relnamespace
  JOIN pg_attribute AS indexed_column
    ON indexed_column.attrelid = table_relation.oid
   AND indexed_column.attnum = index_row.indkey[0]
  WHERE indexed_column.attname = 'operating_company_id'
    AND index_row.indisvalid = true
    AND index_row.indisready = true
    AND index_row.indisunique = false
    AND index_row.indexprs IS NULL
    AND index_row.indpred IS NULL
    AND index_row.indnkeyatts = 1
    AND index_row.indnatts = 1
    AND (index_namespace.nspname, table_namespace.nspname, table_relation.relname, index_relation.relname) IN (
      ('public', 'public', 'property_owners', 'property_owners_operating_company_id_idx'),
      ('public', 'public', 'property_ownership', 'property_ownership_operating_company_id_idx'),
      ('public', 'public', 'ownership', 'ownership_operating_company_id_idx'),
      ('public', 'public', 'property_name_aliases', 'property_name_aliases_operating_company_id_idx'),
      ('public', 'public', 'property_reporting_map', 'property_reporting_map_operating_company_id_idx'),
      ('lifecycle', 'lifecycle', 'property_acquisition', 'property_acquisition_operating_company_id_idx'),
      ('lifecycle', 'lifecycle', 'service_engagements', 'service_engagements_operating_company_id_idx'),
      ('lifecycle', 'lifecycle', 'management_fee_configs', 'management_fee_configs_operating_company_id_idx'),
      ('pms', 'pms', 'property_mappings', 'property_mappings_operating_company_id_idx')
    );

  IF column_count <> 9 OR foreign_key_count <> 9 OR index_count <> 9 THEN
    RAISE EXCEPTION 'BLOCKED_BY_ROLLBACK';
  END IF;

  IF EXISTS (SELECT 1 FROM public.property_owners WHERE operating_company_id IS NOT NULL)
     OR EXISTS (SELECT 1 FROM public.property_ownership WHERE operating_company_id IS NOT NULL)
     OR EXISTS (SELECT 1 FROM public.ownership WHERE operating_company_id IS NOT NULL)
     OR EXISTS (SELECT 1 FROM public.property_name_aliases WHERE operating_company_id IS NOT NULL)
     OR EXISTS (SELECT 1 FROM public.property_reporting_map WHERE operating_company_id IS NOT NULL)
     OR EXISTS (SELECT 1 FROM lifecycle.property_acquisition WHERE operating_company_id IS NOT NULL)
     OR EXISTS (SELECT 1 FROM lifecycle.service_engagements WHERE operating_company_id IS NOT NULL)
     OR EXISTS (SELECT 1 FROM lifecycle.management_fee_configs WHERE operating_company_id IS NOT NULL)
     OR EXISTS (SELECT 1 FROM pms.property_mappings WHERE operating_company_id IS NOT NULL) THEN
    RAISE EXCEPTION 'BLOCKED_BY_ROLLBACK: assigned value';
  END IF;

  SELECT count(*) INTO publication_count
  FROM pg_attribute AS attribute
  JOIN pg_class AS relation ON relation.oid = attribute.attrelid
  JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  JOIN pg_publication_rel AS publication_rel ON publication_rel.prrelid = relation.oid
  WHERE attribute.attname = 'operating_company_id'
    AND attribute.attnum > 0
    AND NOT attribute.attisdropped
    AND publication_rel.prattrs IS NOT NULL
    AND attribute.attnum = ANY (publication_rel.prattrs::smallint[])
    AND (namespace.nspname, relation.relname) IN (
      ('public', 'property_owners'),
      ('public', 'property_ownership'),
      ('public', 'ownership'),
      ('public', 'property_name_aliases'),
      ('public', 'property_reporting_map'),
      ('lifecycle', 'property_acquisition'),
      ('lifecycle', 'service_engagements'),
      ('lifecycle', 'management_fee_configs'),
      ('pms', 'property_mappings')
    );

  SELECT count(*) INTO unexpected_dependency_count
  FROM pg_depend AS dependency
  JOIN pg_attribute AS attribute
    ON attribute.attrelid = dependency.refobjid
   AND attribute.attnum = dependency.refobjsubid
  JOIN pg_class AS relation ON relation.oid = attribute.attrelid
  JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  WHERE dependency.refclassid = 'pg_class'::regclass
    AND attribute.attname = 'operating_company_id'
    AND attribute.attnum > 0
    AND NOT attribute.attisdropped
    AND (namespace.nspname, relation.relname) IN (
      ('public', 'property_owners'),
      ('public', 'property_ownership'),
      ('public', 'ownership'),
      ('public', 'property_name_aliases'),
      ('public', 'property_reporting_map'),
      ('lifecycle', 'property_acquisition'),
      ('lifecycle', 'service_engagements'),
      ('lifecycle', 'management_fee_configs'),
      ('pms', 'property_mappings')
    )
    AND (
      dependency.classid IN (
        'pg_policy'::regclass,
        'pg_rewrite'::regclass,
        'pg_trigger'::regclass,
        'pg_proc'::regclass,
        'pg_attrdef'::regclass
      )
      OR NOT (
        (
          dependency.classid = 'pg_constraint'::regclass
          AND EXISTS (
            SELECT 1
            FROM pg_constraint AS company_fk
            WHERE company_fk.oid = dependency.objid
              AND company_fk.conrelid = attribute.attrelid
              AND (namespace.nspname, relation.relname, company_fk.conname) IN (
                ('public', 'property_owners', 'property_owners_operating_company_fk'),
                ('public', 'property_ownership', 'property_ownership_operating_company_fk'),
                ('public', 'ownership', 'ownership_operating_company_fk'),
                ('public', 'property_name_aliases', 'property_name_aliases_operating_company_fk'),
                ('public', 'property_reporting_map', 'property_reporting_map_operating_company_fk'),
                ('lifecycle', 'property_acquisition', 'property_acquisition_operating_company_fk'),
                ('lifecycle', 'service_engagements', 'service_engagements_operating_company_fk'),
                ('lifecycle', 'management_fee_configs', 'management_fee_configs_operating_company_fk'),
                ('pms', 'property_mappings', 'property_mappings_operating_company_fk')
              )
          )
        )
        OR (
          dependency.classid = 'pg_class'::regclass
          AND EXISTS (
            SELECT 1
            FROM pg_class AS index_relation
            JOIN pg_index AS index_row ON index_row.indexrelid = index_relation.oid
            JOIN pg_namespace AS index_namespace ON index_namespace.oid = index_relation.relnamespace
            WHERE index_relation.oid = dependency.objid
              AND index_row.indrelid = attribute.attrelid
              AND (index_namespace.nspname, namespace.nspname, relation.relname, index_relation.relname) IN (
                ('public', 'public', 'property_owners', 'property_owners_operating_company_id_idx'),
                ('public', 'public', 'property_ownership', 'property_ownership_operating_company_id_idx'),
                ('public', 'public', 'ownership', 'ownership_operating_company_id_idx'),
                ('public', 'public', 'property_name_aliases', 'property_name_aliases_operating_company_id_idx'),
                ('public', 'public', 'property_reporting_map', 'property_reporting_map_operating_company_id_idx'),
                ('lifecycle', 'lifecycle', 'property_acquisition', 'property_acquisition_operating_company_id_idx'),
                ('lifecycle', 'lifecycle', 'service_engagements', 'service_engagements_operating_company_id_idx'),
                ('lifecycle', 'lifecycle', 'management_fee_configs', 'management_fee_configs_operating_company_id_idx'),
                ('pms', 'pms', 'property_mappings', 'property_mappings_operating_company_id_idx')
              )
          )
        )
      )
    );

  SELECT count(*) INTO reviewed_dependency_count
  FROM pg_depend AS dependency
  JOIN pg_attribute AS attribute
    ON attribute.attrelid = dependency.refobjid
   AND attribute.attnum = dependency.refobjsubid
  JOIN pg_class AS relation ON relation.oid = attribute.attrelid
  JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  WHERE dependency.refclassid = 'pg_class'::regclass
    AND attribute.attname = 'operating_company_id'
    AND attribute.attnum > 0
    AND NOT attribute.attisdropped
    AND (namespace.nspname, relation.relname) IN (
      ('public', 'property_owners'),
      ('public', 'property_ownership'),
      ('public', 'ownership'),
      ('public', 'property_name_aliases'),
      ('public', 'property_reporting_map'),
      ('lifecycle', 'property_acquisition'),
      ('lifecycle', 'service_engagements'),
      ('lifecycle', 'management_fee_configs'),
      ('pms', 'property_mappings')
    )
    AND (
      (
        dependency.classid = 'pg_constraint'::regclass
        AND EXISTS (
          SELECT 1
          FROM pg_constraint AS company_fk
          WHERE company_fk.oid = dependency.objid
            AND company_fk.conrelid = attribute.attrelid
            AND (namespace.nspname, relation.relname, company_fk.conname) IN (
              ('public', 'property_owners', 'property_owners_operating_company_fk'),
              ('public', 'property_ownership', 'property_ownership_operating_company_fk'),
              ('public', 'ownership', 'ownership_operating_company_fk'),
              ('public', 'property_name_aliases', 'property_name_aliases_operating_company_fk'),
              ('public', 'property_reporting_map', 'property_reporting_map_operating_company_fk'),
              ('lifecycle', 'property_acquisition', 'property_acquisition_operating_company_fk'),
              ('lifecycle', 'service_engagements', 'service_engagements_operating_company_fk'),
              ('lifecycle', 'management_fee_configs', 'management_fee_configs_operating_company_fk'),
              ('pms', 'property_mappings', 'property_mappings_operating_company_fk')
            )
        )
      )
      OR (
        dependency.classid = 'pg_class'::regclass
        AND EXISTS (
          SELECT 1
          FROM pg_class AS index_relation
          JOIN pg_index AS index_row ON index_row.indexrelid = index_relation.oid
          JOIN pg_namespace AS index_namespace ON index_namespace.oid = index_relation.relnamespace
          WHERE index_relation.oid = dependency.objid
            AND index_row.indrelid = attribute.attrelid
            AND (index_namespace.nspname, namespace.nspname, relation.relname, index_relation.relname) IN (
              ('public', 'public', 'property_owners', 'property_owners_operating_company_id_idx'),
              ('public', 'public', 'property_ownership', 'property_ownership_operating_company_id_idx'),
              ('public', 'public', 'ownership', 'ownership_operating_company_id_idx'),
              ('public', 'public', 'property_name_aliases', 'property_name_aliases_operating_company_id_idx'),
              ('public', 'public', 'property_reporting_map', 'property_reporting_map_operating_company_id_idx'),
              ('lifecycle', 'lifecycle', 'property_acquisition', 'property_acquisition_operating_company_id_idx'),
              ('lifecycle', 'lifecycle', 'service_engagements', 'service_engagements_operating_company_id_idx'),
              ('lifecycle', 'lifecycle', 'management_fee_configs', 'management_fee_configs_operating_company_id_idx'),
              ('pms', 'pms', 'property_mappings', 'property_mappings_operating_company_id_idx')
            )
        )
      )
    );

  IF publication_count <> 0
     OR unexpected_dependency_count <> 0
     OR reviewed_dependency_count <> 18 THEN
    RAISE EXCEPTION 'BLOCKED_BY_ROLLBACK';
  END IF;
END
$rollback$;

ALTER TABLE public.property_owners
  DROP CONSTRAINT property_owners_operating_company_fk;
ALTER TABLE public.property_ownership
  DROP CONSTRAINT property_ownership_operating_company_fk;
ALTER TABLE public.ownership
  DROP CONSTRAINT ownership_operating_company_fk;
ALTER TABLE public.property_name_aliases
  DROP CONSTRAINT property_name_aliases_operating_company_fk;
ALTER TABLE public.property_reporting_map
  DROP CONSTRAINT property_reporting_map_operating_company_fk;
ALTER TABLE lifecycle.property_acquisition
  DROP CONSTRAINT property_acquisition_operating_company_fk;
ALTER TABLE lifecycle.service_engagements
  DROP CONSTRAINT service_engagements_operating_company_fk;
ALTER TABLE lifecycle.management_fee_configs
  DROP CONSTRAINT management_fee_configs_operating_company_fk;
ALTER TABLE pms.property_mappings
  DROP CONSTRAINT property_mappings_operating_company_fk;

DROP INDEX public.property_owners_operating_company_id_idx;
DROP INDEX public.property_ownership_operating_company_id_idx;
DROP INDEX public.ownership_operating_company_id_idx;
DROP INDEX public.property_name_aliases_operating_company_id_idx;
DROP INDEX public.property_reporting_map_operating_company_id_idx;
DROP INDEX lifecycle.property_acquisition_operating_company_id_idx;
DROP INDEX lifecycle.service_engagements_operating_company_id_idx;
DROP INDEX lifecycle.management_fee_configs_operating_company_id_idx;
DROP INDEX pms.property_mappings_operating_company_id_idx;

ALTER TABLE public.property_owners
  DROP COLUMN operating_company_id;
ALTER TABLE public.property_ownership
  DROP COLUMN operating_company_id;
ALTER TABLE public.ownership
  DROP COLUMN operating_company_id;
ALTER TABLE public.property_name_aliases
  DROP COLUMN operating_company_id;
ALTER TABLE public.property_reporting_map
  DROP COLUMN operating_company_id;
ALTER TABLE lifecycle.property_acquisition
  DROP COLUMN operating_company_id;
ALTER TABLE lifecycle.service_engagements
  DROP COLUMN operating_company_id;
ALTER TABLE lifecycle.management_fee_configs
  DROP COLUMN operating_company_id;
ALTER TABLE pms.property_mappings
  DROP COLUMN operating_company_id;

COMMIT;
