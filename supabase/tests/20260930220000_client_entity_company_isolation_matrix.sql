-- Transaction matrix for 20260930220000. The runner supplies the migration and rollback.

CREATE TEMP TABLE clientent_matrix (
  step text PRIMARY KEY,
  ok boolean NOT NULL,
  detail text
);
GRANT ALL ON TABLE clientent_matrix TO anon, authenticated, service_role;

CREATE PROCEDURE pg_temp.clientent_actor(p_role text, p_user uuid)
LANGUAGE plpgsql
AS $actor$
BEGIN
  PERFORM set_config('request.jwt.claim.role', coalesce(p_role, ''), true);
  PERFORM set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), true);
  PERFORM set_config('request.jwt.claims', '', true);
END
$actor$;

DO $drift$
BEGIN
  BEGIN
    INSERT INTO supabase_migrations.schema_migrations (version, name)
    VALUES ('20260930220000', 'client_entity_company_isolation');
    EXECUTE $clientent_run$
@@MIGRATION@@
$clientent_run$;
    RAISE EXCEPTION 'clientent_probe_accepted';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO clientent_matrix VALUES ('history_drift', SQLERRM = 'BLOCKED_BY_HISTORY', SQLERRM);
    DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260930220000';
  END;
END
$drift$;

@@MIGRATION@@

DO $behavior$
DECLARE
  sole uuid;
  company_b uuid := gen_random_uuid();
  assigned uuid;
  seen integer;
  probe_id uuid;
BEGIN
  SELECT company_id INTO sole FROM registry.companies WHERE status = 'active';

  INSERT INTO lifecycle.entity_identity (canonical_name, entity_type)
  VALUES ('clientent-probe-entity', 'external')
  RETURNING id, operating_company_id INTO probe_id, assigned;
  INSERT INTO clientent_matrix VALUES ('null_insert_inherits_sole', assigned = sole, 'sole');

  UPDATE lifecycle.entity_identity
  SET canonical_name = 'clientent-probe-entity-renamed'
  WHERE id = probe_id
  RETURNING operating_company_id INTO assigned;
  INSERT INTO clientent_matrix VALUES ('same_company_field_update', assigned = sole, 'sole');

  CALL pg_temp.clientent_actor('service_role', NULL);
  BEGIN
    SET LOCAL ROLE service_role;
    SELECT count(*) INTO seen
    FROM lifecycle.entity_identity
    WHERE id = probe_id;
    RESET ROLE;
    INSERT INTO clientent_matrix VALUES ('service_role_select_bypasses_rls', seen = 1, seen::text);
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    INSERT INTO clientent_matrix VALUES ('service_role_select_bypasses_rls', false, SQLSTATE);
  END;
  RESET ROLE;

  CALL pg_temp.clientent_actor('authenticated', NULL);
  BEGIN
    SET LOCAL ROLE authenticated;
    SELECT count(*) INTO seen
    FROM lifecycle.entity_identity
    WHERE id = probe_id;
    RESET ROLE;
    INSERT INTO clientent_matrix VALUES ('authenticated_select_closed', seen = 0, seen::text);
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    INSERT INTO clientent_matrix VALUES ('authenticated_select_closed', SQLSTATE = '42501', SQLSTATE);
  END;
  RESET ROLE;

  CALL pg_temp.clientent_actor('service_role', NULL);
  BEGIN
    SET LOCAL ROLE service_role;
    INSERT INTO lifecycle.entity_identity (canonical_name, entity_type)
    VALUES ('clientent-probe-service-insert', 'external');
    RESET ROLE;
    INSERT INTO clientent_matrix VALUES ('service_role_insert_denied', false, 'inserted');
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    INSERT INTO clientent_matrix VALUES ('service_role_insert_denied', SQLSTATE = '42501', SQLSTATE);
  END;
  RESET ROLE;

  BEGIN
    UPDATE lifecycle.entity_identity
    SET operating_company_id = gen_random_uuid()
    WHERE id = probe_id;
    INSERT INTO clientent_matrix VALUES ('company_reassignment_blocked', false, 'updated');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO clientent_matrix VALUES (
      'company_reassignment_blocked',
      SQLERRM = 'BLOCKED_BY_COMPANY_CONTEXT',
      SQLERRM
    );
  END;

  BEGIN
    UPDATE lifecycle.management_relationship
    SET operating_company_id = gen_random_uuid()
    WHERE id = (SELECT id FROM lifecycle.management_relationship ORDER BY id LIMIT 1);
    INSERT INTO clientent_matrix VALUES ('relationship_reassignment_blocked', false, 'updated');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO clientent_matrix VALUES (
      'relationship_reassignment_blocked',
      SQLERRM = 'BLOCKED_BY_COMPANY_CONTEXT',
      SQLERRM
    );
  END;

  BEGIN
    UPDATE registry.parties
    SET company_id = gen_random_uuid()
    WHERE party_id = (SELECT party_id FROM registry.parties ORDER BY party_id LIMIT 1);
    INSERT INTO clientent_matrix VALUES ('party_reassignment_blocked', false, 'updated');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO clientent_matrix VALUES (
      'party_reassignment_blocked',
      SQLERRM = 'BLOCKED_BY_COMPANY_CONTEXT',
      SQLERRM
    );
  END;

  BEGIN
    INSERT INTO lifecycle.entity_identity (canonical_name, entity_type, operating_company_id)
    VALUES ('clientent-probe-other', 'external', gen_random_uuid());
    INSERT INTO clientent_matrix VALUES ('explicit_other_company_blocked', false, 'inserted');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO clientent_matrix VALUES (
      'explicit_other_company_blocked',
      SQLERRM = 'BLOCKED_BY_COMPANY_CONTEXT',
      SQLERRM
    );
  END;

  DELETE FROM lifecycle.entity_identity WHERE id = probe_id;

  INSERT INTO registry.companies (company_id, canonical_name, status)
  VALUES (company_b, 'clientent-probe-company', 'active');
  BEGIN
    INSERT INTO lifecycle.entity_identity (canonical_name, entity_type)
    VALUES ('clientent-probe-two', 'external');
    INSERT INTO clientent_matrix VALUES ('two_company_insert_blocked', false, 'inserted');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO clientent_matrix VALUES (
      'two_company_insert_blocked',
      SQLERRM = 'BLOCKED_BY_COMPANY_CONTEXT',
      SQLERRM
    );
  END;
  DELETE FROM lifecycle.entity_identity
  WHERE canonical_name IN (
    'clientent-probe-two',
    'clientent-probe-other',
    'clientent-probe-service-insert',
    'clientent-probe-entity',
    'clientent-probe-entity-renamed'
  );
  DELETE FROM registry.companies WHERE company_id = company_b;

  INSERT INTO clientent_matrix VALUES (
    'fixture_cleaned',
    (SELECT count(*) FROM lifecycle.entity_identity) = 27
      AND (SELECT count(*) FROM lifecycle.management_relationship) = 33
      AND (SELECT count(*) FROM registry.parties) = 24
      AND (SELECT count(*) FROM registry.companies) = 1
      AND (SELECT count(*) FROM registry.companies WHERE canonical_name = 'Yossi Properties') = 0
      AND (SELECT count(*) FROM access.company_memberships) = 1
      AND (SELECT count(*) FROM lifecycle.entity_identity WHERE canonical_name ILIKE 'clientent-probe%') = 0,
    'cleaned'
  );
END
$behavior$;

DO $reapply$
BEGIN
  BEGIN
    EXECUTE $clientent_run$
@@MIGRATION@@
$clientent_run$;
    INSERT INTO clientent_matrix VALUES ('reapply', false, 'accepted');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO clientent_matrix VALUES ('reapply', SQLERRM = 'BLOCKED_BY_REAPPLY', SQLERRM);
  END;
END
$reapply$;

@@ROLLBACK@@

DO $pins$
BEGIN
  INSERT INTO clientent_matrix VALUES (
    'production_pins',
    (SELECT count(*) FROM supabase_migrations.schema_migrations) = 193
      AND (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260930200000') = 1
      AND (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260930220000') = 0
      AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'lifecycle'
          AND table_name IN ('entity_identity', 'management_relationship')
          AND column_name = 'operating_company_id'
      )
      AND to_regprocedure('lifecycle.enforce_client_entity_company()') IS NULL
      AND (SELECT count(*) FROM lifecycle.entity_identity) = 27
      AND (SELECT count(*) FROM lifecycle.management_relationship) = 33
      AND (SELECT count(*) FROM registry.parties) = 24
      AND (SELECT count(*) FROM registry.companies) = 1
      AND (SELECT count(*) FROM registry.companies WHERE canonical_name = 'Yossi Properties') = 0
      AND (SELECT count(*) FROM access.company_memberships) = 1,
    'pins'
  );
END
$pins$;

SELECT jsonb_object_agg(step, ok ORDER BY step) AS matrix
FROM clientent_matrix;
