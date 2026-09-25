-- Slice 2.1: nullable operating_company_id on the two property roots.
-- registry.companies primary key is company_id (companies_pkey).
-- public.properties primary key is id. public.property_definitions primary key is property_name.
-- There is no foreign key between those two tables. This migration does not add one.
-- Column stays nullable. No backfill. No row-level security change. No ledger or PMS changes.
-- A non-null value must reference registry.companies(company_id).
-- ON DELETE RESTRICT. Existing rows stay NULL.

BEGIN;

DO $drift$
BEGIN
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
  ) OR EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname IN (
      'properties_operating_company_fk',
      'property_definitions_operating_company_fk'
    )
  ) OR EXISTS (
    SELECT 1
    FROM pg_class
    WHERE relname IN (
      'properties_operating_company_id_idx',
      'property_definitions_operating_company_id_idx'
    )
  ) OR NOT EXISTS (
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
END
$drift$;

ALTER TABLE public.properties
  ADD COLUMN operating_company_id uuid;

ALTER TABLE public.property_definitions
  ADD COLUMN operating_company_id uuid;

ALTER TABLE public.properties
  ADD CONSTRAINT properties_operating_company_fk
  FOREIGN KEY (operating_company_id)
  REFERENCES registry.companies (company_id)
  ON DELETE RESTRICT;

ALTER TABLE public.property_definitions
  ADD CONSTRAINT property_definitions_operating_company_fk
  FOREIGN KEY (operating_company_id)
  REFERENCES registry.companies (company_id)
  ON DELETE RESTRICT;

CREATE INDEX properties_operating_company_id_idx
  ON public.properties (operating_company_id);

CREATE INDEX property_definitions_operating_company_id_idx
  ON public.property_definitions (operating_company_id);

COMMIT;
