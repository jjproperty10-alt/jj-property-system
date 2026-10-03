-- Removes the client and entity company association added by 20260930220000.
-- Does not delete clients, relationships, parties, companies, users, or memberships.

BEGIN;

DO $clientent_rollback$
DECLARE
  sole_company uuid;
BEGIN
  IF (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260930200000') <> 1
     OR (SELECT count(*) FROM registry.companies) <> 1
     OR (SELECT count(*) FROM registry.companies WHERE status = 'active') <> 1
     OR (SELECT count(*) FROM registry.companies WHERE canonical_name = 'Yossi Properties') <> 0
     OR (SELECT count(*) FROM access.company_memberships) <> 1 THEN
    RAISE EXCEPTION 'BLOCKED_BY_HISTORY';
  END IF;

  IF NOT EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'lifecycle'
         AND table_name = 'entity_identity'
         AND column_name = 'operating_company_id'
     )
     OR NOT EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'lifecycle'
         AND table_name = 'management_relationship'
         AND column_name = 'operating_company_id'
     ) THEN
    RAISE EXCEPTION 'BLOCKED_BY_HISTORY';
  END IF;

  SELECT company_id INTO sole_company
  FROM registry.companies
  WHERE status = 'active';

  IF (SELECT count(*) FROM lifecycle.entity_identity) <> 27
     OR (SELECT count(*) FROM lifecycle.management_relationship) <> 33
     OR (SELECT count(*) FROM registry.parties) <> 24
     OR (SELECT count(*) FROM lifecycle.entity_identity WHERE operating_company_id = sole_company) <> 27
     OR (SELECT count(*) FROM lifecycle.management_relationship WHERE operating_company_id = sole_company) <> 33
     OR (SELECT count(*) FROM registry.parties WHERE company_id = sole_company) <> 24 THEN
    RAISE EXCEPTION 'BLOCKED_BY_COMPANY_CONTEXT';
  END IF;
END
$clientent_rollback$;

DROP POLICY company_member_read ON lifecycle.entity_identity;
DROP POLICY company_member_read ON lifecycle.management_relationship;
DROP POLICY company_member_read ON registry.parties;

DROP TRIGGER trg_entity_identity_company ON lifecycle.entity_identity;
DROP TRIGGER trg_management_relationship_company ON lifecycle.management_relationship;
DROP TRIGGER trg_parties_company ON registry.parties;

DROP FUNCTION lifecycle.enforce_client_entity_company();

DROP INDEX lifecycle.entity_identity_operating_company_id_idx;
DROP INDEX lifecycle.management_relationship_operating_company_id_idx;

ALTER TABLE lifecycle.entity_identity
  DROP CONSTRAINT entity_identity_operating_company_fk;

ALTER TABLE lifecycle.management_relationship
  DROP CONSTRAINT management_relationship_operating_company_fk;

ALTER TABLE lifecycle.entity_identity
  DROP COLUMN operating_company_id;

ALTER TABLE lifecycle.management_relationship
  DROP COLUMN operating_company_id;

DO $clientent_rollback_post$
BEGIN
  IF EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'lifecycle'
         AND table_name IN ('entity_identity', 'management_relationship')
         AND column_name = 'operating_company_id'
     )
     OR to_regprocedure('lifecycle.enforce_client_entity_company()') IS NOT NULL
     OR (SELECT count(*) FROM lifecycle.entity_identity) <> 27
     OR (SELECT count(*) FROM lifecycle.management_relationship) <> 33
     OR (SELECT count(*) FROM registry.parties) <> 24
     OR (SELECT count(*) FROM registry.companies) <> 1
     OR (SELECT count(*) FROM registry.companies WHERE canonical_name = 'Yossi Properties') <> 0
     OR (SELECT count(*) FROM access.company_memberships) <> 1 THEN
    RAISE EXCEPTION 'BLOCKED_BY_COMPANY_CONTEXT';
  END IF;
END
$clientent_rollback_post$;

COMMIT;
