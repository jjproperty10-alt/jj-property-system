-- Rollback for 20260925120000_properties_operating_company_id.
-- Drops only the reviewed column, constraints, and indexes.
-- Aborts when another object depends on the new column.
-- Does not delete a company, a property, or an auth user.

BEGIN;

DO $rollback$
DECLARE
  dependency_count integer;
BEGIN
  IF to_regclass('public.properties') IS NULL
     OR to_regclass('public.property_definitions') IS NULL THEN
    RAISE EXCEPTION 'BLOCKED_BY_ROLLBACK: target table is missing';
  END IF;

  SELECT count(*) INTO dependency_count
  FROM pg_depend AS dependency
  JOIN pg_attribute AS attribute
    ON attribute.attrelid = dependency.refobjid
   AND attribute.attnum = dependency.refobjsubid
  JOIN pg_class AS relation ON relation.oid = attribute.attrelid
  JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND relation.relname IN ('properties', 'property_definitions')
    AND attribute.attname = 'operating_company_id'
    AND dependency.deptype = 'n'
    AND dependency.classid <> 'pg_constraint'::regclass
    AND dependency.classid <> 'pg_attrdef'::regclass;

  IF dependency_count <> 0 THEN
    RAISE EXCEPTION 'BLOCKED_BY_ROLLBACK: unexpected dependency on operating_company_id';
  END IF;
END
$rollback$;

ALTER TABLE public.properties
  DROP CONSTRAINT properties_operating_company_fk;
ALTER TABLE public.property_definitions
  DROP CONSTRAINT property_definitions_operating_company_fk;
DROP INDEX public.properties_operating_company_id_idx;
DROP INDEX public.property_definitions_operating_company_id_idx;
ALTER TABLE public.properties
  DROP COLUMN operating_company_id;
ALTER TABLE public.property_definitions
  DROP COLUMN operating_company_id;

COMMIT;
