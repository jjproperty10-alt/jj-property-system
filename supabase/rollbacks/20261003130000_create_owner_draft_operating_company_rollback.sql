-- Restores lifecycle.create_owner_draft exactly as it is live on Production
-- before 20261003130000 (read-only capture 2026-10-03:
-- md5(prosrc) 6539a074de7e8bf4c85045c6f115f575,
-- md5(pg_get_functiondef) c59126c54658c9330b051d33997da8ab,
-- proacl {postgres=X/postgres,service_role=X/postgres}).
-- Only the function is replaced. No row, company, membership, permit,
-- trigger or column is changed. With Slice A applied, the restored function
-- again relies on Slice A's entity_identity company trigger.

BEGIN;

DO $guard$
BEGIN
  IF (
       SELECT count(*)
       FROM pg_proc AS proc
       JOIN pg_namespace AS namespace ON namespace.oid = proc.pronamespace
       WHERE namespace.nspname = 'lifecycle'
         AND proc.proname = 'create_owner_draft'
         AND proc.oid = 'lifecycle.create_owner_draft(text,text,text,text,text,text,text,text,text,date,text,uuid[],text)'::regprocedure
         AND md5(proc.prosrc) = '071f0d8f3b7cab2cba1fbaa7d398232d'
     ) <> 1
     OR (SELECT count(*) FROM registry.companies WHERE canonical_name = 'Yossi Properties') <> 0 THEN
    RAISE EXCEPTION 'BLOCKED_BY_ROLLBACK';
  END IF;
END
$guard$;

CREATE OR REPLACE FUNCTION lifecycle.create_owner_draft(p_canonical_name text, p_entity_type text DEFAULT 'external'::text, p_contact_email text DEFAULT NULL::text, p_contact_phone text DEFAULT NULL::text, p_preferred_language text DEFAULT NULL::text, p_country text DEFAULT NULL::text, p_entity_legal_name text DEFAULT NULL::text, p_internal_notes text DEFAULT NULL::text, p_relationship_type text DEFAULT 'managed_client'::text, p_effective_from date DEFAULT NULL::date, p_relationship_notes text DEFAULT NULL::text, p_property_ids uuid[] DEFAULT '{}'::uuid[], p_created_by text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'lifecycle', 'public'
AS $function$
DECLARE
  v_entity_id UUID;
  v_prop_id   UUID;
BEGIN
  INSERT INTO lifecycle.entity_identity (
    canonical_name, entity_type, aliases, status,
    contact_email, contact_phone, preferred_language,
    country, entity_legal_name, internal_notes
  ) VALUES (
    p_canonical_name, p_entity_type, '{}', 'active',
    p_contact_email, p_contact_phone, p_preferred_language,
    p_country, p_entity_legal_name, p_internal_notes
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

  RETURN v_entity_id;
END;
$function$;

REVOKE ALL ON FUNCTION lifecycle.create_owner_draft(text, text, text, text, text, text, text, text, text, date, text, uuid[], text) FROM PUBLIC;
REVOKE ALL ON FUNCTION lifecycle.create_owner_draft(text, text, text, text, text, text, text, text, text, date, text, uuid[], text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION lifecycle.create_owner_draft(text, text, text, text, text, text, text, text, text, date, text, uuid[], text) TO service_role;

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
         AND md5(proc.prosrc) = '6539a074de7e8bf4c85045c6f115f575'
         AND md5(pg_get_functiondef(proc.oid)) = 'c59126c54658c9330b051d33997da8ab'
         AND proc.proacl::text = '{postgres=X/postgres,service_role=X/postgres}'
     ) <> 1 THEN
    RAISE EXCEPTION 'BLOCKED_BY_SCHEMA_DRIFT';
  END IF;
END
$post$;

COMMIT;
