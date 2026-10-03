-- Throwaway-Postgres matrix for 20261003130000 (create_owner_draft company).
-- Runner: scripts/run-throwaway-pg-matrix.cjs (refuses Supabase / non-local hosts).
-- Fixtures: throwaway_company_base.sql + 20261003130000_create_owner_draft_fixture.sql.
-- Everything runs inside one transaction that ends in ROLLBACK.

CREATE TEMP TABLE ownerdraft_matrix (
  step text PRIMARY KEY,
  ok boolean NOT NULL,
  detail text
);
GRANT ALL ON TABLE ownerdraft_matrix TO anon, authenticated, service_role;

CREATE PROCEDURE pg_temp.ownerdraft_actor(p_role text, p_user uuid)
LANGUAGE plpgsql
AS $actor$
BEGIN
  PERFORM set_config('request.jwt.claim.role', coalesce(p_role, ''), true);
  PERFORM set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), true);
  PERFORM set_config('request.jwt.claims', '', true);
END
$actor$;

-- 1. Live function + Slice A stand-in: today's RPC only gets a company through the trigger.
DO $pre$
DECLARE
  v_entity uuid;
  v_company uuid;
BEGIN
  CALL pg_temp.ownerdraft_actor('service_role', NULL);
  SET LOCAL ROLE service_role;
  SELECT lifecycle.create_owner_draft('Pre Live Owner') INTO v_entity;
  RESET ROLE;
  SELECT operating_company_id INTO v_company FROM lifecycle.entity_identity WHERE id = v_entity;
  INSERT INTO ownerdraft_matrix VALUES (
    '01_pre_live_relies_on_slice_a_trigger',
    v_company = '00000000-0000-4000-8000-00000000000a'
      AND position('operating_company_id' in (SELECT prosrc FROM pg_proc WHERE proname = 'create_owner_draft')) = 0,
    'live RPC omits the column; stand-in trigger filled ' || coalesce(v_company::text, 'NULL'));
END
$pre$;

-- 2. Guard: refuses to run without Slice A in history.
DO $no_slice_a$
BEGIN
  BEGIN
    DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260930220000';
    EXECUTE $ownerdraft_run$
@@MIGRATION@@
$ownerdraft_run$;
    RAISE EXCEPTION 'ownerdraft_probe_accepted';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO ownerdraft_matrix VALUES ('02_guard_requires_slice_a_history', SQLERRM = 'BLOCKED_BY_HISTORY', SQLERRM);
  END;
END
$no_slice_a$;

-- 3. Guard: refuses to run when the live function drifted.
DO $drift$
BEGIN
  BEGIN
    EXECUTE $redefine$
      CREATE OR REPLACE FUNCTION lifecycle.create_owner_draft(p_canonical_name text, p_entity_type text DEFAULT 'external'::text, p_contact_email text DEFAULT NULL::text, p_contact_phone text DEFAULT NULL::text, p_preferred_language text DEFAULT NULL::text, p_country text DEFAULT NULL::text, p_entity_legal_name text DEFAULT NULL::text, p_internal_notes text DEFAULT NULL::text, p_relationship_type text DEFAULT 'managed_client'::text, p_effective_from date DEFAULT NULL::date, p_relationship_notes text DEFAULT NULL::text, p_property_ids uuid[] DEFAULT '{}'::uuid[], p_created_by text DEFAULT NULL::text)
       RETURNS uuid LANGUAGE sql SECURITY DEFINER AS 'SELECT NULL::uuid'
    $redefine$;
    EXECUTE $ownerdraft_run$
@@MIGRATION@@
$ownerdraft_run$;
    RAISE EXCEPTION 'ownerdraft_probe_accepted';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO ownerdraft_matrix VALUES ('03_guard_blocks_function_drift', SQLERRM = 'BLOCKED_BY_FUNCTION_DRIFT', SQLERRM);
  END;
END
$drift$;

@@MIGRATION@@

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261003130000', 'create_owner_draft_operating_company');

DO $one_company$
DECLARE
  company_a uuid := '00000000-0000-4000-8000-00000000000a';
  v_entity uuid;
  v_company uuid;
  v_assoc integer;
  v_permits integer;
  v_before integer;
BEGIN
  CALL pg_temp.ownerdraft_actor('service_role', NULL);

  BEGIN
    SET LOCAL ROLE service_role;
    SELECT lifecycle.create_owner_draft('One Company No Property') INTO v_entity;
    RESET ROLE;
    SELECT operating_company_id INTO v_company FROM lifecycle.entity_identity WHERE id = v_entity;
    SELECT count(*) INTO v_permits FROM access.internal_company_write_permit;
    INSERT INTO ownerdraft_matrix VALUES ('04_one_company_no_property_gets_sole_company', v_company = company_a, coalesce(v_company::text, 'NULL'));
    INSERT INTO ownerdraft_matrix VALUES ('05_permit_disarmed_after_call', v_permits = 0, v_permits::text);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO ownerdraft_matrix VALUES ('04_one_company_no_property_gets_sole_company', false, SQLERRM);
  END;
  RESET ROLE;

  BEGIN
    SET LOCAL ROLE service_role;
    SELECT lifecycle.create_owner_draft('One Company With Property', p_property_ids => ARRAY['00000000-0000-4000-8000-0000000000f1'::uuid, '00000000-0000-4000-8000-0000000000f2'::uuid]) INTO v_entity;
    RESET ROLE;
    SELECT operating_company_id INTO v_company FROM lifecycle.entity_identity WHERE id = v_entity;
    SELECT count(*) INTO v_assoc FROM lifecycle.entity_property_associations WHERE entity_id = v_entity;
    INSERT INTO ownerdraft_matrix VALUES ('06_one_company_property_company_from_definition', v_company = company_a AND v_assoc = 2, v_company::text || ' assoc=' || v_assoc);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO ownerdraft_matrix VALUES ('06_one_company_property_company_from_definition', false, SQLERRM);
  END;
  RESET ROLE;

  SELECT count(*) INTO v_before FROM lifecycle.entity_identity;
  BEGIN
    SET LOCAL ROLE service_role;
    PERFORM lifecycle.create_owner_draft('Unknown Property', p_property_ids => ARRAY['00000000-0000-4000-8000-0000000000ff'::uuid]);
    INSERT INTO ownerdraft_matrix VALUES ('07_unknown_property_blocked', false, 'returned');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO ownerdraft_matrix VALUES ('07_unknown_property_blocked',
      SQLERRM = 'BLOCKED_BY_PARENT_COMPANY' AND (SELECT count(*) FROM lifecycle.entity_identity) = v_before, SQLERRM);
  END;
  RESET ROLE;

  BEGIN
    SET LOCAL ROLE service_role;
    PERFORM lifecycle.create_owner_draft('Null Property', p_property_ids => ARRAY[NULL::uuid]);
    INSERT INTO ownerdraft_matrix VALUES ('08_null_property_id_blocked', false, 'returned');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO ownerdraft_matrix VALUES ('08_null_property_id_blocked', SQLERRM = 'BLOCKED_BY_PARENT_COMPANY', SQLERRM);
  END;
  RESET ROLE;
END
$one_company$;

-- Two companies (synthetic B, harness only, rolled back at the end).
INSERT INTO registry.companies (company_id, canonical_name, status)
VALUES ('00000000-0000-4000-8000-00000000000b', 'Throwaway Company B', 'active');
INSERT INTO public.property_definitions (property_name, property_id, operating_company_id)
VALUES ('Throwaway B1', '00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-00000000000b');

DO $two_companies$
DECLARE
  company_b uuid := '00000000-0000-4000-8000-00000000000b';
  v_entity uuid;
  v_company uuid;
  v_before integer;
BEGIN
  CALL pg_temp.ownerdraft_actor('service_role', NULL);
  SELECT count(*) INTO v_before FROM lifecycle.entity_identity;

  BEGIN
    SET LOCAL ROLE service_role;
    PERFORM lifecycle.create_owner_draft('Two Companies No Property');
    INSERT INTO ownerdraft_matrix VALUES ('09_two_companies_no_property_blocked', false, 'returned');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO ownerdraft_matrix VALUES ('09_two_companies_no_property_blocked',
      SQLERRM = 'BLOCKED_BY_COMPANY_CONTEXT' AND (SELECT count(*) FROM lifecycle.entity_identity) = v_before, SQLERRM);
  END;
  RESET ROLE;

  BEGIN
    SET LOCAL ROLE service_role;
    SELECT lifecycle.create_owner_draft('Two Companies Property B', p_property_ids => ARRAY['00000000-0000-4000-8000-0000000000e1'::uuid]) INTO v_entity;
    RESET ROLE;
    SELECT operating_company_id INTO v_company FROM lifecycle.entity_identity WHERE id = v_entity;
    INSERT INTO ownerdraft_matrix VALUES ('10_two_companies_property_b_written_as_b', v_company = company_b, coalesce(v_company::text, 'NULL'));
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO ownerdraft_matrix VALUES ('10_two_companies_property_b_written_as_b', false, SQLERRM);
  END;
  RESET ROLE;

  BEGIN
    SET LOCAL ROLE service_role;
    PERFORM lifecycle.create_owner_draft('Mixed A and B', p_property_ids => ARRAY['00000000-0000-4000-8000-0000000000f1'::uuid, '00000000-0000-4000-8000-0000000000e1'::uuid]);
    INSERT INTO ownerdraft_matrix VALUES ('11_cross_company_properties_blocked', false, 'returned');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO ownerdraft_matrix VALUES ('11_cross_company_properties_blocked', SQLERRM = 'BLOCKED_BY_PARENT_COMPANY', SQLERRM);
  END;
  RESET ROLE;

  -- A direct insert claiming company B without the RPC's permit is still refused
  -- (Slice A stand-in + live resolver): only the RPC path can write B.
  BEGIN
    INSERT INTO lifecycle.entity_identity (canonical_name, entity_type, operating_company_id)
    VALUES ('Direct B', 'external', company_b);
    INSERT INTO ownerdraft_matrix VALUES ('12_direct_insert_foreign_company_blocked', false, 'inserted');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO ownerdraft_matrix VALUES ('12_direct_insert_foreign_company_blocked', SQLERRM = 'BLOCKED_BY_COMPANY_CONTEXT', SQLERRM);
  END;

  UPDATE registry.companies SET status = 'inactive' WHERE company_id = company_b;
  BEGIN
    SET LOCAL ROLE service_role;
    PERFORM lifecycle.create_owner_draft('Inactive Parent', p_property_ids => ARRAY['00000000-0000-4000-8000-0000000000e1'::uuid]);
    INSERT INTO ownerdraft_matrix VALUES ('13_inactive_parent_company_blocked', false, 'returned');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO ownerdraft_matrix VALUES ('13_inactive_parent_company_blocked', SQLERRM = 'BLOCKED_BY_PARENT_COMPANY', SQLERRM);
  END;
  RESET ROLE;
  UPDATE registry.companies SET status = 'active' WHERE company_id = company_b;
END
$two_companies$;

DO $grants$
DECLARE
  fn oid := 'lifecycle.create_owner_draft(text,text,text,text,text,text,text,text,text,date,text,uuid[],text)'::regprocedure;
BEGIN
  INSERT INTO ownerdraft_matrix VALUES ('14_only_service_role_executes',
    has_function_privilege('service_role', fn, 'EXECUTE')
      AND NOT has_function_privilege('anon', fn, 'EXECUTE')
      AND NOT has_function_privilege('authenticated', fn, 'EXECUTE'),
    (SELECT proacl::text FROM pg_proc WHERE oid = fn));
  INSERT INTO ownerdraft_matrix VALUES ('15_never_reads_property_name',
    position('property_name' in (SELECT prosrc FROM pg_proc WHERE oid = fn)) = 0, 'prosrc scan');
  INSERT INTO ownerdraft_matrix VALUES ('16_migrated_md5_pinned_in_rollback',
    md5((SELECT prosrc FROM pg_proc WHERE oid = fn)) = '071f0d8f3b7cab2cba1fbaa7d398232d',
    md5((SELECT prosrc FROM pg_proc WHERE oid = fn)));
END
$grants$;

-- Error after the permit is armed (invalid entity type fails the identity
-- insert). The caught error must leave no permit and no identity row.
DO $disarm_on_error$
DECLARE
  v_before integer;
  v_permits integer;
BEGIN
  CALL pg_temp.ownerdraft_actor('service_role', NULL);
  SELECT count(*) INTO v_before FROM lifecycle.entity_identity;
  BEGIN
    SET LOCAL ROLE service_role;
    PERFORM lifecycle.create_owner_draft(
      'Post Arm Failure',
      p_entity_type => 'not_a_type',
      p_property_ids => ARRAY['00000000-0000-4000-8000-0000000000f1'::uuid]);
    INSERT INTO ownerdraft_matrix VALUES ('20_permit_disarmed_after_error', false, 'returned');
  EXCEPTION WHEN OTHERS THEN
    SELECT count(*) INTO v_permits FROM access.internal_company_write_permit;
    INSERT INTO ownerdraft_matrix VALUES (
      '20_permit_disarmed_after_error',
      v_permits = 0
        AND (SELECT count(*) FROM lifecycle.entity_identity) = v_before
        AND SQLERRM LIKE '%entity_identity_entity_type_check%',
      SQLERRM || ' permits=' || v_permits::text);
  END;
  RESET ROLE;
END
$disarm_on_error$;

@@ROLLBACK@@

DO $after_rollback$
DECLARE
  fn oid := 'lifecycle.create_owner_draft(text,text,text,text,text,text,text,text,text,date,text,uuid[],text)'::regprocedure;
BEGIN
  INSERT INTO ownerdraft_matrix VALUES ('17_rollback_restores_live_def_exactly',
    (SELECT md5(prosrc) FROM pg_proc WHERE oid = fn) = '6539a074de7e8bf4c85045c6f115f575'
      AND md5(pg_get_functiondef(fn)) = 'c59126c54658c9330b051d33997da8ab'
      AND (SELECT proacl::text FROM pg_proc WHERE oid = fn) = '{postgres=X/postgres,service_role=X/postgres}',
    md5(pg_get_functiondef(fn)));
  INSERT INTO ownerdraft_matrix VALUES ('18_rollback_kept_rows',
    (SELECT count(*) FROM lifecycle.entity_identity) = 4, (SELECT count(*) FROM lifecycle.entity_identity)::text);
END
$after_rollback$;

DO $reapply$
BEGIN
  BEGIN
    DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261003130000';
    UPDATE registry.companies SET status = 'inactive' WHERE company_id = '00000000-0000-4000-8000-00000000000b';
    EXECUTE $ownerdraft_run$
@@MIGRATION@@
$ownerdraft_run$;
    INSERT INTO ownerdraft_matrix VALUES ('19_migration_reapplies_after_rollback',
      (SELECT md5(prosrc) FROM pg_proc WHERE proname = 'create_owner_draft') = '071f0d8f3b7cab2cba1fbaa7d398232d', 'reapplied');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO ownerdraft_matrix VALUES ('19_migration_reapplies_after_rollback', false, SQLERRM);
  END;
END
$reapply$;

SELECT step, ok, detail FROM ownerdraft_matrix ORDER BY step;
