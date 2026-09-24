CREATE TEMP TABLE phase1_matrix (
  step text PRIMARY KEY,
  ok boolean NOT NULL,
  detail text NOT NULL
) ON COMMIT DROP;

GRANT ALL ON TABLE phase1_matrix TO anon, authenticated, service_role;

DO $matrix$
DECLARE
  company_a uuid := '10f6e9b3-c5b9-4d95-a318-48f20f89477f';
  company_b uuid := gen_random_uuid();
  company_inactive uuid := gen_random_uuid();
  missing_company uuid := gen_random_uuid();
  bootstrap_admin uuid;
  member_a uuid := gen_random_uuid();
  member_ab uuid := gen_random_uuid();
  inactive_member uuid := gen_random_uuid();
  outsider uuid := gen_random_uuid();
  admin_b uuid := gen_random_uuid();
  admin_inactive uuid := gen_random_uuid();
  spare_admin uuid := gen_random_uuid();
  granted_member uuid := gen_random_uuid();
  granted_admin uuid := gen_random_uuid();
  missing_user uuid := gen_random_uuid();
  seen integer;
  seen_a integer;
  seen_b integer;
  acl text;
  owner_name text;
  definer boolean;
  config text[];
  body text;
BEGIN
  INSERT INTO phase1_matrix
  SELECT 'bootstrap_one_membership', count(*) = 1, count(*)::text
  FROM access.company_memberships;

  INSERT INTO phase1_matrix
  SELECT 'bootstrap_one_company', count(*) = 1, count(*)::text
  FROM registry.companies;

  SELECT user_id INTO bootstrap_admin
  FROM access.company_memberships
  WHERE company_id = company_a;

  INSERT INTO phase1_matrix VALUES (
    'bootstrap_same_user_one_row',
    bootstrap_admin IS NOT NULL
      AND (SELECT count(DISTINCT user_id) FROM access.company_memberships) = 1,
    'distinct_users=1'
  );

  INSERT INTO auth.users (id) VALUES
    (member_a), (member_ab), (inactive_member), (outsider),
    (admin_b), (admin_inactive), (spare_admin), (granted_member), (granted_admin);

  INSERT INTO registry.companies (company_id, canonical_name, status) VALUES
    (company_b, 'phase1-rollback-probe', 'active'),
    (company_inactive, 'phase1-rollback-probe-inactive', 'inactive');

  INSERT INTO access.company_memberships (company_id, user_id, membership_role, is_active) VALUES
    (company_a, member_a, 'member', true),
    (company_a, member_ab, 'member', true),
    (company_b, member_ab, 'member', true),
    (company_a, inactive_member, 'member', false),
    (company_b, admin_b, 'company_admin', true),
    (company_inactive, admin_inactive, 'company_admin', true),
    (company_a, spare_admin, 'company_admin', true);

  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '{}', true);

  BEGIN
    PERFORM set_config('request.jwt.claim.sub', outsider::text, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', outsider)::text, true);
    EXECUTE 'SET LOCAL ROLE anon';
    PERFORM 1 FROM access.company_memberships;
    INSERT INTO phase1_matrix VALUES ('anon_select', false, 'rows returned');
    RESET ROLE;
  EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO phase1_matrix VALUES ('anon_select', true, SQLSTATE);
  WHEN OTHERS THEN
    INSERT INTO phase1_matrix VALUES ('anon_select', false, SQLSTATE);
  END;

  BEGIN
    PERFORM set_config('request.jwt.claim.sub', outsider::text, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', outsider)::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    SELECT count(*) INTO seen FROM access.company_memberships;
    INSERT INTO phase1_matrix VALUES ('nonmember_select', seen = 0, seen::text);
    RESET ROLE;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase1_matrix VALUES ('nonmember_select', false, SQLSTATE);
  END;

  BEGIN
    PERFORM set_config('request.jwt.claim.sub', member_a::text, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', member_a)::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    SELECT count(*), count(*) FILTER (WHERE company_id = company_a), count(*) FILTER (WHERE company_id = company_b)
      INTO seen, seen_a, seen_b
    FROM access.company_memberships;
    INSERT INTO phase1_matrix VALUES (
      'member_a_sees_only_own_active_a',
      seen = 1 AND seen_a = 1 AND seen_b = 0,
      'seen=' || seen::text
    );
    INSERT INTO phase1_matrix VALUES (
      'member_true_only_for_own_company',
      access.is_company_member(company_a)
        AND NOT access.is_company_member(company_b)
        AND NOT access.is_company_admin(company_a),
      'member_not_admin'
    );
    RESET ROLE;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase1_matrix VALUES ('member_a_sees_only_own_active_a', false, SQLSTATE);
  END;

  BEGIN
    PERFORM set_config('request.jwt.claim.sub', inactive_member::text, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', inactive_member)::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    SELECT count(*) INTO seen FROM access.company_memberships;
    INSERT INTO phase1_matrix VALUES (
      'inactive_sees_nothing',
      seen = 0 AND NOT access.is_company_member(company_a),
      seen::text
    );
    RESET ROLE;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase1_matrix VALUES ('inactive_sees_nothing', false, SQLSTATE);
  END;

  BEGIN
    PERFORM set_config('request.jwt.claim.sub', member_ab::text, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', member_ab)::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    SELECT count(*), count(*) FILTER (WHERE company_id = company_a), count(*) FILTER (WHERE company_id = company_b)
      INTO seen, seen_a, seen_b
    FROM access.company_memberships;
    INSERT INTO phase1_matrix VALUES (
      'two_company_user_sees_only_own_active',
      seen = 2 AND seen_a = 1 AND seen_b = 1
        AND access.is_company_member(company_a)
        AND access.is_company_member(company_b)
        AND NOT access.is_company_admin(company_a)
        AND NOT access.is_company_admin(company_b),
      'seen=' || seen::text
    );
    RESET ROLE;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase1_matrix VALUES ('two_company_user_sees_only_own_active', false, SQLSTATE);
  END;

  BEGIN
    PERFORM set_config('request.jwt.claim.sub', bootstrap_admin::text, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', bootstrap_admin)::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    INSERT INTO phase1_matrix VALUES (
      'null_company_false',
      NOT access.is_company_member(NULL) AND NOT access.is_company_admin(NULL),
      'false'
    );
    INSERT INTO phase1_matrix VALUES (
      'admin_a_not_admin_of_b',
      access.is_company_admin(company_a) AND NOT access.is_company_admin(company_b),
      'scoped'
    );
    RESET ROLE;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase1_matrix VALUES ('null_company_false', false, SQLSTATE);
  END;

  BEGIN
    PERFORM set_config('request.jwt.claim.sub', outsider::text, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', outsider)::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    INSERT INTO access.company_memberships (company_id, user_id, membership_role)
    VALUES (company_a, outsider, 'company_admin');
    INSERT INTO phase1_matrix VALUES ('outsider_insert', false, 'inserted');
    RESET ROLE;
  EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO phase1_matrix VALUES ('outsider_insert', true, SQLSTATE);
  WHEN OTHERS THEN
    INSERT INTO phase1_matrix VALUES ('outsider_insert', false, SQLSTATE);
  END;

  BEGIN
    PERFORM set_config('request.jwt.claim.sub', member_a::text, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', member_a)::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    UPDATE access.company_memberships SET membership_role = 'company_admin' WHERE user_id = member_a;
    INSERT INTO phase1_matrix VALUES ('member_update', false, 'updated');
    RESET ROLE;
  EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO phase1_matrix VALUES ('member_update', true, SQLSTATE);
  WHEN OTHERS THEN
    INSERT INTO phase1_matrix VALUES ('member_update', false, SQLSTATE);
  END;

  BEGIN
    PERFORM set_config('request.jwt.claim.sub', member_a::text, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', member_a)::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    DELETE FROM access.company_memberships WHERE user_id = member_a;
    INSERT INTO phase1_matrix VALUES ('member_delete', false, 'deleted');
    RESET ROLE;
  EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO phase1_matrix VALUES ('member_delete', true, SQLSTATE);
  WHEN OTHERS THEN
    INSERT INTO phase1_matrix VALUES ('member_delete', false, SQLSTATE);
  END;

  BEGIN
    PERFORM set_config('request.jwt.claim.sub', member_a::text, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', member_a)::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM access.grant_company_membership(company_a, member_a, 'company_admin');
    INSERT INTO phase1_matrix VALUES ('member_self_promote', false, 'granted');
    RESET ROLE;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase1_matrix VALUES (
      'member_self_promote',
      SQLERRM = 'BLOCKED_BY_AUTHORIZATION',
      split_part(SQLERRM, ':', 1)
    );
  END;

  BEGIN
    PERFORM set_config('request.jwt.claim.sub', bootstrap_admin::text, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', bootstrap_admin)::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM access.grant_company_membership(company_a, bootstrap_admin, 'member');
    INSERT INTO phase1_matrix VALUES ('admin_self_grant', false, 'granted');
    RESET ROLE;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase1_matrix VALUES (
      'admin_self_grant',
      SQLERRM = 'BLOCKED_BY_SELF_GRANT',
      split_part(SQLERRM, ':', 1)
    );
  END;

  BEGIN
    PERFORM set_config('request.jwt.claim.sub', bootstrap_admin::text, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', bootstrap_admin)::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM access.grant_company_membership(company_b, granted_member, 'member');
    INSERT INTO phase1_matrix VALUES ('admin_a_grant_in_b', false, 'granted');
    RESET ROLE;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase1_matrix VALUES (
      'admin_a_grant_in_b',
      SQLERRM = 'BLOCKED_BY_AUTHORIZATION',
      split_part(SQLERRM, ':', 1)
    );
  END;

  BEGIN
    PERFORM set_config('request.jwt.claim.sub', bootstrap_admin::text, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', bootstrap_admin)::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM access.grant_company_membership(company_a, granted_member, 'member');
    PERFORM access.grant_company_membership(company_a, granted_admin, 'company_admin');
    RESET ROLE;
    PERFORM set_config('request.jwt.claim.sub', granted_member::text, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', granted_member)::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    INSERT INTO phase1_matrix VALUES (
      'admin_grants_member_in_a',
      access.is_company_member(company_a) AND NOT access.is_company_admin(company_a),
      'member'
    );
    RESET ROLE;
    PERFORM set_config('request.jwt.claim.sub', granted_admin::text, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', granted_admin)::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    INSERT INTO phase1_matrix VALUES (
      'admin_grants_admin_only_in_a',
      access.is_company_admin(company_a) AND NOT access.is_company_admin(company_b),
      'admin_a'
    );
    RESET ROLE;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase1_matrix VALUES ('admin_grants_member_in_a', false, SQLSTATE);
  END;

  BEGIN
    PERFORM set_config('request.jwt.claim.sub', bootstrap_admin::text, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', bootstrap_admin)::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM access.grant_company_membership(company_a, member_a, 'member');
    INSERT INTO phase1_matrix VALUES ('duplicate_membership', false, 'inserted');
    RESET ROLE;
  EXCEPTION WHEN unique_violation THEN
    INSERT INTO phase1_matrix VALUES ('duplicate_membership', true, SQLSTATE);
  WHEN OTHERS THEN
    INSERT INTO phase1_matrix VALUES ('duplicate_membership', false, SQLSTATE);
  END;

  BEGIN
    PERFORM set_config('request.jwt.claim.sub', bootstrap_admin::text, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', bootstrap_admin)::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM access.grant_company_membership(company_a, granted_member, 'owner');
    INSERT INTO phase1_matrix VALUES ('invalid_role', false, 'granted');
    RESET ROLE;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase1_matrix VALUES (
      'invalid_role',
      SQLERRM = 'BLOCKED_BY_ROLE',
      split_part(SQLERRM, ':', 1)
    );
  END;

  BEGIN
    PERFORM set_config('request.jwt.claim.sub', bootstrap_admin::text, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', bootstrap_admin)::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM access.grant_company_membership(missing_company, granted_member, 'member');
    INSERT INTO phase1_matrix VALUES ('missing_company', false, 'granted');
    RESET ROLE;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase1_matrix VALUES (
      'missing_company',
      SQLERRM = 'BLOCKED_BY_COMPANY_CONTEXT',
      split_part(SQLERRM, ':', 1)
    );
  END;

  BEGIN
    PERFORM set_config('request.jwt.claim.sub', admin_inactive::text, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', admin_inactive)::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM access.grant_company_membership(company_inactive, granted_member, 'member');
    INSERT INTO phase1_matrix VALUES ('inactive_company', false, 'granted');
    RESET ROLE;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase1_matrix VALUES (
      'inactive_company',
      SQLERRM = 'BLOCKED_BY_COMPANY_CONTEXT',
      split_part(SQLERRM, ':', 1)
    );
  END;

  BEGIN
    PERFORM set_config('request.jwt.claim.sub', bootstrap_admin::text, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', bootstrap_admin)::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM access.grant_company_membership(company_a, missing_user, 'member');
    INSERT INTO phase1_matrix VALUES ('missing_auth_user', false, 'granted');
    RESET ROLE;
  EXCEPTION WHEN foreign_key_violation THEN
    INSERT INTO phase1_matrix VALUES ('missing_auth_user', true, SQLSTATE);
  WHEN OTHERS THEN
    INSERT INTO phase1_matrix VALUES ('missing_auth_user', false, SQLSTATE);
  END;

  BEGIN
    UPDATE access.company_memberships SET company_id = company_b WHERE user_id = member_a;
    INSERT INTO phase1_matrix VALUES ('immutable_company', false, 'updated');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase1_matrix VALUES (
      'immutable_company',
      SQLERRM = 'BLOCKED_BY_IMMUTABLE_IDENTITY',
      split_part(SQLERRM, ':', 1)
    );
  END;

  BEGIN
    UPDATE access.company_memberships SET user_id = outsider WHERE user_id = member_a;
    INSERT INTO phase1_matrix VALUES ('immutable_user', false, 'updated');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase1_matrix VALUES (
      'immutable_user',
      SQLERRM = 'BLOCKED_BY_IMMUTABLE_IDENTITY',
      split_part(SQLERRM, ':', 1)
    );
  END;

  UPDATE access.company_memberships SET is_active = false WHERE user_id = spare_admin;
  BEGIN
    PERFORM set_config('request.jwt.claim.sub', spare_admin::text, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', spare_admin)::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM access.grant_company_membership(company_a, granted_member, 'member');
    INSERT INTO phase1_matrix VALUES ('inactive_admin_grant', false, 'granted');
    RESET ROLE;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase1_matrix VALUES (
      'inactive_admin_grant',
      SQLERRM = 'BLOCKED_BY_AUTHORIZATION',
      split_part(SQLERRM, ':', 1)
    );
  END;

  SELECT r.rolname, p.prosecdef, p.proconfig, p.proacl::text, p.prosrc
    INTO owner_name, definer, config, acl, body
  FROM pg_proc AS p
  JOIN pg_namespace AS n ON n.oid = p.pronamespace
  JOIN pg_roles AS r ON r.oid = p.proowner
  WHERE n.nspname = 'access'
    AND p.proname = 'grant_company_membership';

  INSERT INTO phase1_matrix VALUES (
    'definer_owner_search_path',
    owner_name = 'postgres' AND definer AND 'search_path=pg_catalog' = ANY (config),
    coalesce(owner_name, 'missing')
  );
  INSERT INTO phase1_matrix VALUES (
    'definer_execute_grants',
    acl LIKE '%authenticated=X/%'
      AND acl LIKE '%service_role=X/%'
      AND acl NOT LIKE '%anon=%'
      AND acl NOT LIKE '{=X/%'
      AND acl NOT LIKE '%,=X/%'
      AND has_function_privilege('authenticated', 'access.grant_company_membership(uuid,uuid,text)', 'EXECUTE')
      AND NOT has_function_privilege('anon', 'access.grant_company_membership(uuid,uuid,text)', 'EXECUTE'),
    'grants'
  );
  INSERT INTO phase1_matrix VALUES (
    'definer_body_qualified',
    body LIKE '%registry.companies%'
      AND body LIKE '%access.company_memberships%'
      AND body LIKE '%auth.uid()%'
      AND position('SECURITY DEFINER' in (
        SELECT pg_get_functiondef('access.is_company_member(uuid)'::regprocedure)
      )) = 0,
    'qualified'
  );

  INSERT INTO phase1_matrix VALUES (
    'service_role_grants',
    has_table_privilege('service_role', 'access.company_memberships', 'SELECT')
      AND has_table_privilege('service_role', 'access.company_memberships', 'INSERT')
      AND has_table_privilege('service_role', 'access.company_memberships', 'UPDATE')
      AND has_table_privilege('service_role', 'access.company_memberships', 'DELETE')
      AND NOT has_table_privilege('authenticated', 'access.company_memberships', 'INSERT')
      AND NOT has_table_privilege('anon', 'access.company_memberships', 'SELECT'),
    'documented'
  );

  BEGIN
    EXECUTE 'SET LOCAL ROLE service_role';
    SELECT count(*) INTO seen FROM access.company_memberships;
    INSERT INTO phase1_matrix VALUES ('service_role_bypass_sees_all', seen >= 8, 'seen=' || seen::text);
    RESET ROLE;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase1_matrix VALUES ('service_role_bypass_sees_all', false, SQLSTATE);
  END;

  INSERT INTO phase1_matrix
  SELECT 'caller_uid_not_embedded',
    position(bootstrap_admin::text in pg_get_functiondef('access.grant_company_membership(uuid,uuid,text)'::regprocedure)) = 0,
    'no_personal_id';
END
$matrix$;
