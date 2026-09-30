-- Transaction matrix for 20260930200000. The runner supplies the migration and rollback.

CREATE TEMP TABLE svcread_matrix (
  step text PRIMARY KEY,
  ok boolean NOT NULL,
  detail text
);
GRANT ALL ON TABLE svcread_matrix TO anon, authenticated, service_role;

CREATE PROCEDURE pg_temp.svcread_actor(p_role text, p_user uuid)
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
    VALUES ('20260930200000', 'service_role_read_company');
    EXECUTE $svcread_run$
@@MIGRATION@@
$svcread_run$;
    RAISE EXCEPTION 'svcread_probe_accepted';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO svcread_matrix VALUES ('history_drift', SQLERRM = 'BLOCKED_BY_HISTORY', SQLERRM);
    DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260930200000';
  END;
END
$drift$;

@@MIGRATION@@

DO $behavior$
DECLARE
  sole uuid;
  company_b uuid;
  resolved uuid;
  outsider uuid := gen_random_uuid();
BEGIN
  SELECT company_id INTO sole FROM registry.companies WHERE status = 'active';

  CALL pg_temp.svcread_actor('service_role', NULL);
  BEGIN
    SET LOCAL ROLE service_role;
    SELECT public.resolve_service_read_company(NULL) INTO resolved;
    INSERT INTO svcread_matrix VALUES ('one_null_returns_sole', resolved = sole, 'sole');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO svcread_matrix VALUES ('one_null_returns_sole', false, SQLERRM);
  END;
  RESET ROLE;

  BEGIN
    SET LOCAL ROLE service_role;
    SELECT public.resolve_service_read_company(sole) INTO resolved;
    INSERT INTO svcread_matrix VALUES ('one_matching_uuid_returns_sole', resolved = sole, 'sole');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO svcread_matrix VALUES ('one_matching_uuid_returns_sole', false, SQLERRM);
  END;
  RESET ROLE;

  BEGIN
    SET LOCAL ROLE service_role;
    PERFORM public.resolve_service_read_company(outsider);
    INSERT INTO svcread_matrix VALUES ('one_other_uuid_blocked', false, 'returned');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO svcread_matrix VALUES ('one_other_uuid_blocked', SQLERRM = 'BLOCKED_BY_COMPANY_CONTEXT', SQLERRM);
  END;
  RESET ROLE;

  CALL pg_temp.svcread_actor('authenticated', sole);
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM public.resolve_service_read_company(NULL);
    INSERT INTO svcread_matrix VALUES ('authenticated_cannot_execute', false, 'returned');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO svcread_matrix VALUES (
      'authenticated_cannot_execute',
      SQLERRM LIKE '%permission denied%',
      SQLERRM
    );
  END;
  RESET ROLE;

  CALL pg_temp.svcread_actor('anon', NULL);
  BEGIN
    SET LOCAL ROLE anon;
    PERFORM public.resolve_service_read_company(NULL);
    INSERT INTO svcread_matrix VALUES ('anon_cannot_execute', false, 'returned');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO svcread_matrix VALUES ('anon_cannot_execute', SQLERRM LIKE '%permission denied%', SQLERRM);
  END;
  RESET ROLE;

  CALL pg_temp.svcread_actor('service_role', NULL);
  BEGIN
    SET LOCAL ROLE service_role;
    PERFORM access.resolve_service_read_company(NULL);
    INSERT INTO svcread_matrix VALUES ('service_role_cannot_execute_access', false, 'returned');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO svcread_matrix VALUES (
      'service_role_cannot_execute_access',
      SQLERRM LIKE '%permission denied%',
      SQLERRM
    );
  END;
  RESET ROLE;

  INSERT INTO registry.companies (canonical_name, status)
  VALUES ('svcread-probe-company', 'active')
  RETURNING company_id INTO company_b;

  CALL pg_temp.svcread_actor('service_role', NULL);
  BEGIN
    SET LOCAL ROLE service_role;
    PERFORM public.resolve_service_read_company(NULL);
    INSERT INTO svcread_matrix VALUES ('two_null_blocked', false, 'returned');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO svcread_matrix VALUES ('two_null_blocked', SQLERRM = 'BLOCKED_BY_COMPANY_CONTEXT', SQLERRM);
  END;
  RESET ROLE;

  BEGIN
    SET LOCAL ROLE service_role;
    PERFORM public.resolve_service_read_company(company_b);
    INSERT INTO svcread_matrix VALUES ('two_explicit_without_permit_blocked', false, 'returned');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO svcread_matrix VALUES (
      'two_explicit_without_permit_blocked',
      SQLERRM = 'BLOCKED_BY_COMPANY_CONTEXT',
      SQLERRM
    );
  END;
  RESET ROLE;

  PERFORM access.arm_internal_operating_company(company_b);
  CALL pg_temp.svcread_actor('service_role', NULL);
  BEGIN
    SET LOCAL ROLE service_role;
    SELECT public.resolve_service_read_company(company_b) INTO resolved;
    INSERT INTO svcread_matrix VALUES ('two_permit_allows_explicit', resolved = company_b, 'permit');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO svcread_matrix VALUES ('two_permit_allows_explicit', false, SQLERRM);
  END;
  RESET ROLE;

  BEGIN
    SET LOCAL ROLE service_role;
    PERFORM public.resolve_service_read_company(NULL);
    INSERT INTO svcread_matrix VALUES ('two_permit_does_not_authorize_omission', false, 'returned');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO svcread_matrix VALUES (
      'two_permit_does_not_authorize_omission',
      SQLERRM = 'BLOCKED_BY_COMPANY_CONTEXT',
      SQLERRM
    );
  END;
  RESET ROLE;

  PERFORM access.disarm_internal_operating_company();
  DELETE FROM registry.companies WHERE company_id = company_b;

  INSERT INTO svcread_matrix VALUES (
    'fixture_cleaned',
    (SELECT count(*) FROM registry.companies) = 1
      AND (SELECT count(*) FROM registry.companies WHERE canonical_name = 'Yossi Properties') = 0
      AND (SELECT count(*) FROM access.company_memberships) = 1
      AND (SELECT count(*) FROM access.internal_company_write_permit) = 0,
    'cleaned'
  );
END
$behavior$;

DO $reapply$
BEGIN
  BEGIN
    EXECUTE $svcread_run$
@@MIGRATION@@
$svcread_run$;
    INSERT INTO svcread_matrix VALUES ('reapply', false, 'accepted');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO svcread_matrix VALUES ('reapply', SQLERRM = 'BLOCKED_BY_REAPPLY', SQLERRM);
  END;
END
$reapply$;

@@ROLLBACK@@

DO $pins$
BEGIN
  INSERT INTO svcread_matrix VALUES (
    'production_pins',
    (SELECT count(*) FROM supabase_migrations.schema_migrations) = 192
      AND (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260930200000') = 0
      AND (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260930120000') = 1
      AND to_regprocedure('public.resolve_service_read_company(uuid)') IS NULL
      AND to_regprocedure('access.resolve_service_read_company(uuid)') IS NULL
      AND (SELECT count(*) FROM registry.companies) = 1
      AND (SELECT count(*) FROM registry.companies WHERE canonical_name = 'Yossi Properties') = 0
      AND (SELECT count(*) FROM access.company_memberships) = 1,
    'pins'
  );
END
$pins$;

SELECT jsonb_object_agg(step, ok ORDER BY step) AS matrix
FROM svcread_matrix;
