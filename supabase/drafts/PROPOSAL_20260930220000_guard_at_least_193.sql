-- PROPOSAL ONLY. Do not apply. Do not replace
-- supabase/migrations/20260930220000_client_entity_company_isolation.sql.
-- That file stays byte-identical. This is a separate draft copy whose only
-- intended difference is the history guard: at least 193 rows and
-- 20260930200000 present, and none of the Slice A objects yet, instead of
-- count(*) exactly 193.
-- Decided against. docs/planning/migration_order_slice_a_2026-10-03.md
-- keeps Slice A's exact-193 check. This copy stays unapplied.

-- Associates existing clients and management relationships with the sole active company.
-- registry.parties.company_id already exists and is checked, not rewritten.
-- This migration does not insert a company, user, membership, or business row.
-- Hard blocker before a second company: entity_identity_canonical_name_uq remains global on lower(canonical_name).

BEGIN;

DO $clientent$
DECLARE
  sole_company uuid;
BEGIN
  LOCK TABLE registry.companies IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE registry.parties IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE lifecycle.entity_identity IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE lifecycle.management_relationship IN SHARE ROW EXCLUSIVE MODE;

  -- PROPOSAL GUARD (not the live Slice A guard): at least 193 history rows,
  -- 20260930200000 present, this version not yet recorded, and none of the
  -- Slice A objects already installed. The exact-count seal is what this
  -- draft would give up. See docs/planning/migration_order_slice_a_2026-10-03.md.
  IF (SELECT count(*) FROM supabase_migrations.schema_migrations) < 193
     OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260930200000') <> 1
     OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260930220000') <> 0
     OR to_regprocedure('lifecycle.enforce_client_entity_company()') IS NOT NULL
     OR EXISTS (
       SELECT 1 FROM pg_trigger
       WHERE tgname IN (
         'trg_entity_identity_company',
         'trg_management_relationship_company',
         'trg_parties_company'
       )
         AND NOT tgisinternal
     )
     OR (
       SELECT count(*) FROM (
         SELECT version FROM supabase_migrations.schema_migrations GROUP BY version HAVING count(*) > 1
       ) AS duplicated
     ) <> 0
     OR (SELECT count(*) FROM registry.companies) <> 1
     OR (SELECT count(*) FROM registry.companies WHERE status = 'active') <> 1
     OR (SELECT count(*) FROM registry.companies WHERE canonical_name = 'Yossi Properties') <> 0
     OR (SELECT count(*) FROM access.company_memberships) <> 1 THEN
    RAISE EXCEPTION 'BLOCKED_BY_HISTORY';
  END IF;

  IF EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'lifecycle'
         AND table_name = 'entity_identity'
         AND column_name = 'operating_company_id'
     )
     OR EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'lifecycle'
         AND table_name = 'management_relationship'
         AND column_name = 'operating_company_id'
     ) THEN
    RAISE EXCEPTION 'BLOCKED_BY_REAPPLY';
  END IF;

  SELECT company_id INTO sole_company
  FROM registry.companies
  WHERE status = 'active';

  IF (SELECT count(*) FROM lifecycle.entity_identity) <> 27
     OR (SELECT count(*) FROM lifecycle.management_relationship) <> 33
     OR (SELECT count(*) FROM registry.parties) <> 24
     OR (SELECT count(*) FROM registry.parties WHERE company_id = sole_company) <> 24 THEN
    RAISE EXCEPTION 'BLOCKED_BY_COMPANY_CONTEXT';
  END IF;
END
$clientent$;

ALTER TABLE lifecycle.entity_identity
  ADD COLUMN operating_company_id uuid;

ALTER TABLE lifecycle.management_relationship
  ADD COLUMN operating_company_id uuid;

ALTER TABLE lifecycle.entity_identity
  ADD CONSTRAINT entity_identity_operating_company_fk
  FOREIGN KEY (operating_company_id) REFERENCES registry.companies (company_id);

ALTER TABLE lifecycle.management_relationship
  ADD CONSTRAINT management_relationship_operating_company_fk
  FOREIGN KEY (operating_company_id) REFERENCES registry.companies (company_id);

CREATE INDEX entity_identity_operating_company_id_idx
  ON lifecycle.entity_identity (operating_company_id);

CREATE INDEX management_relationship_operating_company_id_idx
  ON lifecycle.management_relationship (operating_company_id);

UPDATE lifecycle.entity_identity
SET operating_company_id = (
  SELECT company_id FROM registry.companies WHERE status = 'active'
)
WHERE operating_company_id IS NULL;

UPDATE lifecycle.management_relationship
SET operating_company_id = (
  SELECT company_id FROM registry.companies WHERE status = 'active'
)
WHERE operating_company_id IS NULL;

DO $clientent_fill$
DECLARE
  sole_company uuid;
BEGIN
  SELECT company_id INTO sole_company
  FROM registry.companies
  WHERE status = 'active';

  IF (SELECT count(*) FROM registry.companies) <> 1
     OR (SELECT count(*) FROM registry.companies WHERE canonical_name = 'Yossi Properties') <> 0
     OR (SELECT count(*) FROM lifecycle.entity_identity WHERE operating_company_id = sole_company) <> 27
     OR (SELECT count(*) FROM lifecycle.management_relationship WHERE operating_company_id = sole_company) <> 33
     OR (SELECT count(*) FROM lifecycle.entity_identity WHERE operating_company_id IS NULL) <> 0
     OR (SELECT count(*) FROM lifecycle.management_relationship WHERE operating_company_id IS NULL) <> 0 THEN
    RAISE EXCEPTION 'BLOCKED_BY_COMPANY_CONTEXT';
  END IF;
END
$clientent_fill$;

ALTER TABLE lifecycle.entity_identity
  ALTER COLUMN operating_company_id SET NOT NULL;

ALTER TABLE lifecycle.management_relationship
  ALTER COLUMN operating_company_id SET NOT NULL;

CREATE FUNCTION lifecycle.enforce_client_entity_company()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $enforce$
DECLARE
  resolved uuid;
BEGIN
  IF TG_TABLE_NAME = 'parties' THEN
    IF TG_OP = 'UPDATE' AND NEW.company_id IS NOT DISTINCT FROM OLD.company_id THEN
      RETURN NEW;
    END IF;
    resolved := access.resolve_verified_operating_company(NULL, false);
    IF NEW.company_id IS DISTINCT FROM resolved THEN
      RAISE EXCEPTION 'BLOCKED_BY_COMPANY_CONTEXT';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.operating_company_id IS NOT DISTINCT FROM OLD.operating_company_id THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'BLOCKED_BY_COMPANY_CONTEXT';
  END IF;
  IF NEW.operating_company_id IS NULL THEN
    NEW.operating_company_id := access.resolve_verified_operating_company(NULL, false);
    RETURN NEW;
  END IF;
  resolved := access.resolve_verified_operating_company(NULL, false);
  IF NEW.operating_company_id IS DISTINCT FROM resolved THEN
    RAISE EXCEPTION 'BLOCKED_BY_COMPANY_CONTEXT';
  END IF;
  RETURN NEW;
END;
$enforce$;

REVOKE ALL ON FUNCTION lifecycle.enforce_client_entity_company() FROM PUBLIC;
REVOKE ALL ON FUNCTION lifecycle.enforce_client_entity_company() FROM anon, authenticated, service_role;

CREATE TRIGGER trg_entity_identity_company
  BEFORE INSERT OR UPDATE ON lifecycle.entity_identity
  FOR EACH ROW
  EXECUTE FUNCTION lifecycle.enforce_client_entity_company();

CREATE TRIGGER trg_management_relationship_company
  BEFORE INSERT OR UPDATE ON lifecycle.management_relationship
  FOR EACH ROW
  EXECUTE FUNCTION lifecycle.enforce_client_entity_company();

CREATE TRIGGER trg_parties_company
  BEFORE INSERT OR UPDATE ON registry.parties
  FOR EACH ROW
  EXECUTE FUNCTION lifecycle.enforce_client_entity_company();

CREATE POLICY company_member_read
  ON lifecycle.entity_identity
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (access.is_company_member(operating_company_id))
  WITH CHECK (access.is_company_member(operating_company_id));

CREATE POLICY company_member_read
  ON lifecycle.management_relationship
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (access.is_company_member(operating_company_id))
  WITH CHECK (access.is_company_member(operating_company_id));

CREATE POLICY company_member_read
  ON registry.parties
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (access.is_company_member(company_id))
  WITH CHECK (access.is_company_member(company_id));

DO $clientent_post$
DECLARE
  sole_company uuid;
BEGIN
  SELECT company_id INTO sole_company
  FROM registry.companies
  WHERE status = 'active';

  IF (SELECT count(*) FROM registry.companies) <> 1
     OR (SELECT count(*) FROM registry.companies WHERE canonical_name = 'Yossi Properties') <> 0
     OR (SELECT count(*) FROM access.company_memberships) <> 1
     OR (SELECT count(*) FROM lifecycle.entity_identity) <> 27
     OR (SELECT count(*) FROM lifecycle.management_relationship) <> 33
     OR (SELECT count(*) FROM registry.parties) <> 24
     OR (SELECT count(*) FROM lifecycle.entity_identity WHERE operating_company_id IS NULL) <> 0
     OR (SELECT count(*) FROM lifecycle.management_relationship WHERE operating_company_id IS NULL) <> 0
     OR (SELECT count(*) FROM lifecycle.entity_identity WHERE operating_company_id = sole_company) <> 27
     OR (SELECT count(*) FROM lifecycle.management_relationship WHERE operating_company_id = sole_company) <> 33
     OR (SELECT count(*) FROM registry.parties WHERE company_id = sole_company) <> 24 THEN
    RAISE EXCEPTION 'BLOCKED_BY_COMPANY_CONTEXT';
  END IF;

  IF (
       SELECT count(*)
       FROM pg_proc AS proc
       JOIN pg_namespace AS namespace ON namespace.oid = proc.pronamespace
       WHERE namespace.nspname = 'lifecycle'
         AND proc.proname = 'enforce_client_entity_company'
         AND proc.prosecdef
         AND position('set_config' IN proc.prosrc) = 0
         AND proc.proacl::text = '{postgres=X/postgres}'
     ) <> 1 THEN
    RAISE EXCEPTION 'BLOCKED_BY_COMPANY_CONTEXT';
  END IF;
END
$clientent_post$;

COMMIT;
