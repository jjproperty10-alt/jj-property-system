-- create_owner_draft writes a verified operating_company_id.
--
-- Today (live md5(prosrc) 6539a074de7e8bf4c85045c6f115f575) the RPC inserts
-- lifecycle.entity_identity without operating_company_id and would rely on a
-- trigger to inherit one. This version decides the company inside the RPC:
--   * With property ids: the company of every referenced
--     public.property_definitions row (matched by property_id UUID, never by
--     property_name). All must exist, share one company, and that company
--     must be active; otherwise BLOCKED_BY_PARENT_COMPANY.
--   * Without property ids: access.resolve_verified_operating_company(NULL,
--     false), i.e. the sole active company; fails closed with
--     BLOCKED_BY_COMPANY_CONTEXT when that is ambiguous.
-- The company is armed with access.arm_internal_operating_company for this
-- transaction only (same path as lifecycle.create_service_engagement), written
-- explicitly, and disarmed before returning.
--
-- APPLY GATE: this draft cannot be applied before the real Slice A migration
-- 20260930220000_client_entity_company_isolation. That migration is not in
-- this repository (it exists only on Yossi's laptop) and it is not live.
-- The throwaway matrix loads a labelled local Slice A STAND-IN fixture
-- (supabase/tests/fixtures/20261003130000_create_owner_draft_fixture.sql).
-- That stand-in is not Slice A and must not be applied anywhere else.
-- Signature, owner, SECURITY DEFINER and grants are unchanged.
-- This migration does not insert or update a company, membership or business row.

BEGIN;

DO $guard$
BEGIN
  LOCK TABLE registry.companies IN SHARE ROW EXCLUSIVE MODE;

  IF (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260930200000') <> 1
     OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260930220000') <> 1
     OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20261003130000') <> 0
     OR (
       SELECT count(*) FROM (
         SELECT version FROM supabase_migrations.schema_migrations GROUP BY version HAVING count(*) > 1
       ) AS duplicated
     ) <> 0 THEN
    RAISE EXCEPTION 'BLOCKED_BY_HISTORY';
  END IF;

  IF NOT EXISTS (
       SELECT 1
       FROM pg_attribute AS attribute
       WHERE attribute.attrelid = 'lifecycle.entity_identity'::regclass
         AND attribute.attname = 'operating_company_id'
         AND attribute.atttypid = 'uuid'::regtype
         AND attribute.attnotnull
         AND NOT attribute.attisdropped
     )
     OR NOT EXISTS (
       SELECT 1
       FROM pg_constraint AS constraint_row
       JOIN pg_attribute AS attribute
         ON attribute.attrelid = constraint_row.conrelid
        AND attribute.attnum = ANY (constraint_row.conkey)
       WHERE constraint_row.contype = 'f'
         AND constraint_row.conrelid = 'lifecycle.entity_identity'::regclass
         AND constraint_row.confrelid = 'registry.companies'::regclass
         AND attribute.attname = 'operating_company_id'
     )
     OR NOT EXISTS (
       SELECT 1
       FROM pg_attribute AS attribute
       WHERE attribute.attrelid = 'public.property_definitions'::regclass
         AND attribute.attname = 'operating_company_id'
         AND attribute.attnotnull
         AND NOT attribute.attisdropped
     )
     OR NOT EXISTS (
       SELECT 1
       FROM pg_index AS index_row
       JOIN pg_attribute AS attribute
         ON attribute.attrelid = index_row.indrelid
        AND attribute.attnum = index_row.indkey[0]
       WHERE index_row.indrelid = 'public.property_definitions'::regclass
         AND index_row.indisunique
         AND index_row.indnatts = 1
         AND index_row.indpred IS NULL
         AND attribute.attname = 'property_id'
     ) THEN
    RAISE EXCEPTION 'BLOCKED_BY_SCHEMA_DRIFT';
  END IF;

  IF (
       SELECT count(*)
       FROM pg_proc AS proc
       JOIN pg_namespace AS namespace ON namespace.oid = proc.pronamespace
       JOIN pg_roles AS owner_role ON owner_role.oid = proc.proowner
       WHERE namespace.nspname = 'lifecycle'
         AND proc.proname = 'create_owner_draft'
         AND proc.oid = 'lifecycle.create_owner_draft(text,text,text,text,text,text,text,text,text,date,text,uuid[],text)'::regprocedure
         AND owner_role.rolname = 'postgres'
         AND proc.prosecdef
         AND md5(proc.prosrc) = '6539a074de7e8bf4c85045c6f115f575'
         AND proc.proacl::text = '{postgres=X/postgres,service_role=X/postgres}'
     ) <> 1
     OR (
       SELECT count(*)
       FROM pg_proc AS proc
       JOIN pg_namespace AS namespace ON namespace.oid = proc.pronamespace
       WHERE namespace.nspname = 'lifecycle'
         AND proc.proname = 'create_owner_draft'
     ) <> 1 THEN
    RAISE EXCEPTION 'BLOCKED_BY_FUNCTION_DRIFT';
  END IF;

  IF (
       SELECT md5(proc.prosrc)
       FROM pg_proc AS proc
       JOIN pg_namespace AS namespace ON namespace.oid = proc.pronamespace
       WHERE namespace.nspname = 'access'
         AND proc.proname = 'arm_internal_operating_company'
     ) IS DISTINCT FROM 'bd21183a6d8bf547e7e095a14b06d20a'
     OR (
       SELECT md5(proc.prosrc)
       FROM pg_proc AS proc
       JOIN pg_namespace AS namespace ON namespace.oid = proc.pronamespace
       WHERE namespace.nspname = 'access'
         AND proc.proname = 'disarm_internal_operating_company'
     ) IS DISTINCT FROM 'e958f586c73c10d3f7f0d566335266c4'
     OR (
       SELECT md5(proc.prosrc)
       FROM pg_proc AS proc
       JOIN pg_namespace AS namespace ON namespace.oid = proc.pronamespace
       WHERE namespace.nspname = 'access'
         AND proc.proname = 'resolve_verified_operating_company'
     ) IS DISTINCT FROM 'eaab58847d03a4ae93e69b0a17d2a8cf'
     OR (SELECT count(*) FROM registry.companies WHERE canonical_name = 'Yossi Properties') <> 0 THEN
    RAISE EXCEPTION 'BLOCKED_BY_SECURITY';
  END IF;
END
$guard$;

CREATE OR REPLACE FUNCTION lifecycle.create_owner_draft(
  p_canonical_name       TEXT,
  p_entity_type          TEXT DEFAULT 'external',
  p_contact_email        TEXT DEFAULT NULL,
  p_contact_phone        TEXT DEFAULT NULL,
  p_preferred_language   TEXT DEFAULT NULL,
  p_country              TEXT DEFAULT NULL,
  p_entity_legal_name    TEXT DEFAULT NULL,
  p_internal_notes       TEXT DEFAULT NULL,
  p_relationship_type    TEXT DEFAULT 'managed_client',
  p_effective_from       DATE DEFAULT NULL,
  p_relationship_notes   TEXT DEFAULT NULL,
  p_property_ids         UUID[] DEFAULT '{}'::UUID[],
  p_created_by           TEXT DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $owner_draft$
DECLARE
  v_entity_id uuid;
  v_prop_id uuid;
  v_parent uuid;
  v_company uuid;
BEGIN
  IF array_length(p_property_ids, 1) IS NOT NULL THEN
    FOREACH v_prop_id IN ARRAY p_property_ids
    LOOP
      v_parent := NULL;
      IF v_prop_id IS NOT NULL THEN
        SELECT definition.operating_company_id
          INTO v_parent
        FROM public.property_definitions AS definition
        WHERE definition.property_id = v_prop_id;
      END IF;
      IF v_parent IS NULL THEN
        RAISE EXCEPTION 'BLOCKED_BY_PARENT_COMPANY';
      END IF;
      IF v_company IS NULL THEN
        v_company := v_parent;
      ELSIF v_company IS DISTINCT FROM v_parent THEN
        RAISE EXCEPTION 'BLOCKED_BY_PARENT_COMPANY';
      END IF;
    END LOOP;

    IF NOT EXISTS (
      SELECT 1
      FROM registry.companies AS company
      WHERE company.company_id = v_company
        AND company.status = 'active'
    ) THEN
      RAISE EXCEPTION 'BLOCKED_BY_PARENT_COMPANY';
    END IF;
  ELSE
    v_company := access.resolve_verified_operating_company(NULL, false);
  END IF;

  PERFORM access.arm_internal_operating_company(v_company);

  INSERT INTO lifecycle.entity_identity (
    canonical_name, entity_type, aliases, status,
    contact_email, contact_phone, preferred_language,
    country, entity_legal_name, internal_notes,
    operating_company_id
  ) VALUES (
    p_canonical_name, p_entity_type, '{}', 'active',
    p_contact_email, p_contact_phone, p_preferred_language,
    p_country, p_entity_legal_name, p_internal_notes,
    v_company
  )
  RETURNING id INTO v_entity_id;

  INSERT INTO lifecycle.jj_relationships (
    entity_id, relationship_type, status, effective_from,
    verification_status, notes, created_by
  ) VALUES (
    v_entity_id, p_relationship_type, 'draft', p_effective_from,
    'unknown', p_relationship_notes, p_created_by
  );

  IF array_length(p_property_ids, 1) IS NOT NULL THEN
    FOREACH v_prop_id IN ARRAY p_property_ids
    LOOP
      INSERT INTO lifecycle.entity_property_associations (
        entity_id, property_id, association_source,
        status, effective_from, notes
      ) VALUES (
        v_entity_id, v_prop_id, 'wizard',
        'draft', p_effective_from, NULL
      );
    END LOOP;
  END IF;

  PERFORM access.disarm_internal_operating_company();

  RETURN v_entity_id;
END
$owner_draft$;

REVOKE ALL ON FUNCTION lifecycle.create_owner_draft(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, UUID[], TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION lifecycle.create_owner_draft(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, UUID[], TEXT
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION lifecycle.create_owner_draft(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, UUID[], TEXT
) TO service_role;

DO $post$
BEGIN
  IF (
       SELECT count(*)
       FROM pg_proc AS proc
       JOIN pg_namespace AS namespace ON namespace.oid = proc.pronamespace
       JOIN pg_roles AS owner_role ON owner_role.oid = proc.proowner
       WHERE namespace.nspname = 'lifecycle'
         AND proc.proname = 'create_owner_draft'
         AND owner_role.rolname = 'postgres'
         AND proc.prosecdef
         AND proc.proconfig @> ARRAY['search_path=pg_catalog']
         AND proc.proacl::text = '{postgres=X/postgres,service_role=X/postgres}'
         AND position('operating_company_id' in proc.prosrc) > 0
         AND position('public.property_definitions' in proc.prosrc) > 0
         AND position('access.arm_internal_operating_company' in proc.prosrc) > 0
         AND position('access.disarm_internal_operating_company' in proc.prosrc) > 0
         AND position('access.resolve_verified_operating_company(NULL, false)' in proc.prosrc) > 0
         AND position('property_name' in proc.prosrc) = 0
         AND position('set_config' in proc.prosrc) = 0
         AND has_function_privilege('service_role', proc.oid, 'EXECUTE')
         AND NOT has_function_privilege('anon', proc.oid, 'EXECUTE')
         AND NOT has_function_privilege('authenticated', proc.oid, 'EXECUTE')
     ) <> 1
     OR (SELECT count(*) FROM registry.companies WHERE canonical_name = 'Yossi Properties') <> 0 THEN
    RAISE EXCEPTION 'BLOCKED_BY_SCHEMA_DRIFT';
  END IF;
END
$post$;

COMMIT;
