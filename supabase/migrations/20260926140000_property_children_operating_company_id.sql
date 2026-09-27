-- Slice 3: nullable operating_company_id on property children.
-- Adds the column only. Does not copy a company from the parent.
-- Existing rows stay null. No row-level security change.
-- Does not change the Hostaway connection, reservation bodies, or mapping identifiers.
-- Only the nine named child tables are changed.

BEGIN;

DO $drift$
BEGIN
  IF to_regclass('public.property_owners') IS NULL
     OR to_regclass('public.property_ownership') IS NULL
     OR to_regclass('public.ownership') IS NULL
     OR to_regclass('public.property_name_aliases') IS NULL
     OR to_regclass('public.property_reporting_map') IS NULL
     OR to_regclass('lifecycle.property_acquisition') IS NULL
     OR to_regclass('lifecycle.service_engagements') IS NULL
     OR to_regclass('lifecycle.management_fee_configs') IS NULL
     OR to_regclass('pms.property_mappings') IS NULL
     OR EXISTS (
       SELECT 1
       FROM pg_attribute AS attribute
       JOIN pg_class AS relation ON relation.oid = attribute.attrelid
       JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
       WHERE attribute.attname = 'operating_company_id'
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
     )
     OR EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname IN (
         'property_owners_operating_company_fk',
         'property_ownership_operating_company_fk',
         'ownership_operating_company_fk',
         'property_name_aliases_operating_company_fk',
         'property_reporting_map_operating_company_fk',
         'property_acquisition_operating_company_fk',
         'service_engagements_operating_company_fk',
         'management_fee_configs_operating_company_fk',
         'property_mappings_operating_company_fk'
       )
     )
     OR EXISTS (
       SELECT 1
       FROM pg_class AS index_relation
       JOIN pg_namespace AS index_namespace ON index_namespace.oid = index_relation.relnamespace
       WHERE (index_namespace.nspname, index_relation.relname) IN (
         ('public', 'property_owners_operating_company_id_idx'),
         ('public', 'property_ownership_operating_company_id_idx'),
         ('public', 'ownership_operating_company_id_idx'),
         ('public', 'property_name_aliases_operating_company_id_idx'),
         ('public', 'property_reporting_map_operating_company_id_idx'),
         ('lifecycle', 'property_acquisition_operating_company_id_idx'),
         ('lifecycle', 'service_engagements_operating_company_id_idx'),
         ('lifecycle', 'management_fee_configs_operating_company_id_idx'),
         ('pms', 'property_mappings_operating_company_id_idx')
       )
     )
     OR NOT EXISTS (
       SELECT 1
       FROM pg_constraint AS company_key
       JOIN pg_class AS company_table ON company_table.oid = company_key.conrelid
       JOIN pg_namespace AS company_namespace ON company_namespace.oid = company_table.relnamespace
       JOIN pg_attribute AS company_column
         ON company_column.attrelid = company_table.oid
        AND company_column.attnum = company_key.conkey[1]
       WHERE company_namespace.nspname = 'registry'
         AND company_table.relname = 'companies'
         AND company_key.contype = 'p'
         AND company_column.attname = 'company_id'
     ) THEN
    RAISE EXCEPTION 'BLOCKED_BY_SCHEMA_DRIFT';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_attribute AS attribute
    JOIN pg_class AS relation ON relation.oid = attribute.attrelid
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname IN ('properties', 'property_definitions')
      AND attribute.attname = 'operating_company_id'
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped
      AND attribute.atttypid = 'uuid'::regtype
      AND attribute.attnotnull
      AND NOT attribute.atthasdef
  ) <> 2 THEN
    RAISE EXCEPTION 'BLOCKED_BY_PARENT';
  END IF;

  IF (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260925120000') <> 1
     OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260925140000') <> 1
     OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260926120000') <> 1 THEN
    RAISE EXCEPTION 'BLOCKED_BY_HISTORY';
  END IF;
END
$drift$;

ALTER TABLE public.property_owners
  ADD COLUMN operating_company_id uuid;
ALTER TABLE public.property_ownership
  ADD COLUMN operating_company_id uuid;
ALTER TABLE public.ownership
  ADD COLUMN operating_company_id uuid;
ALTER TABLE public.property_name_aliases
  ADD COLUMN operating_company_id uuid;
ALTER TABLE public.property_reporting_map
  ADD COLUMN operating_company_id uuid;
ALTER TABLE lifecycle.property_acquisition
  ADD COLUMN operating_company_id uuid;
ALTER TABLE lifecycle.service_engagements
  ADD COLUMN operating_company_id uuid;
ALTER TABLE lifecycle.management_fee_configs
  ADD COLUMN operating_company_id uuid;
ALTER TABLE pms.property_mappings
  ADD COLUMN operating_company_id uuid;

ALTER TABLE public.property_owners
  ADD CONSTRAINT property_owners_operating_company_fk
  FOREIGN KEY (operating_company_id)
  REFERENCES registry.companies (company_id)
  ON DELETE RESTRICT;
ALTER TABLE public.property_ownership
  ADD CONSTRAINT property_ownership_operating_company_fk
  FOREIGN KEY (operating_company_id)
  REFERENCES registry.companies (company_id)
  ON DELETE RESTRICT;
ALTER TABLE public.ownership
  ADD CONSTRAINT ownership_operating_company_fk
  FOREIGN KEY (operating_company_id)
  REFERENCES registry.companies (company_id)
  ON DELETE RESTRICT;
ALTER TABLE public.property_name_aliases
  ADD CONSTRAINT property_name_aliases_operating_company_fk
  FOREIGN KEY (operating_company_id)
  REFERENCES registry.companies (company_id)
  ON DELETE RESTRICT;
ALTER TABLE public.property_reporting_map
  ADD CONSTRAINT property_reporting_map_operating_company_fk
  FOREIGN KEY (operating_company_id)
  REFERENCES registry.companies (company_id)
  ON DELETE RESTRICT;
ALTER TABLE lifecycle.property_acquisition
  ADD CONSTRAINT property_acquisition_operating_company_fk
  FOREIGN KEY (operating_company_id)
  REFERENCES registry.companies (company_id)
  ON DELETE RESTRICT;
ALTER TABLE lifecycle.service_engagements
  ADD CONSTRAINT service_engagements_operating_company_fk
  FOREIGN KEY (operating_company_id)
  REFERENCES registry.companies (company_id)
  ON DELETE RESTRICT;
ALTER TABLE lifecycle.management_fee_configs
  ADD CONSTRAINT management_fee_configs_operating_company_fk
  FOREIGN KEY (operating_company_id)
  REFERENCES registry.companies (company_id)
  ON DELETE RESTRICT;
ALTER TABLE pms.property_mappings
  ADD CONSTRAINT property_mappings_operating_company_fk
  FOREIGN KEY (operating_company_id)
  REFERENCES registry.companies (company_id)
  ON DELETE RESTRICT;

CREATE INDEX property_owners_operating_company_id_idx
  ON public.property_owners (operating_company_id);
CREATE INDEX property_ownership_operating_company_id_idx
  ON public.property_ownership (operating_company_id);
CREATE INDEX ownership_operating_company_id_idx
  ON public.ownership (operating_company_id);
CREATE INDEX property_name_aliases_operating_company_id_idx
  ON public.property_name_aliases (operating_company_id);
CREATE INDEX property_reporting_map_operating_company_id_idx
  ON public.property_reporting_map (operating_company_id);
CREATE INDEX property_acquisition_operating_company_id_idx
  ON lifecycle.property_acquisition (operating_company_id);
CREATE INDEX service_engagements_operating_company_id_idx
  ON lifecycle.service_engagements (operating_company_id);
CREATE INDEX management_fee_configs_operating_company_id_idx
  ON lifecycle.management_fee_configs (operating_company_id);
CREATE INDEX property_mappings_operating_company_id_idx
  ON pms.property_mappings (operating_company_id);

COMMIT;
