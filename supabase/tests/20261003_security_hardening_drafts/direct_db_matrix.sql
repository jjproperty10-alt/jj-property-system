-- PostgREST-shaped proof. SET ROLE plus request.jwt.claims, which is what
-- auth.uid() and auth.role() read in this fixture. Not a connection to Supabase.
-- Each probe runs as anon or authenticated and then restores the seeded rows.

CREATE TABLE IF NOT EXISTS test.direct_db_matrix (
  phase text NOT NULL,
  role_label text NOT NULL,
  object_name text NOT NULL,
  operation text NOT NULL,
  expected text NOT NULL,
  actual text NOT NULL,
  detail text,
  PRIMARY KEY (phase, role_label, object_name, operation)
);

DELETE FROM test.direct_db_matrix WHERE phase = :'phase';

SELECT set_config('jj.matrix_phase', :'phase', false);

CREATE TEMP TABLE matrix_roles (
  ord int PRIMARY KEY,
  label text NOT NULL,
  db_role text NOT NULL,
  user_id uuid
);
INSERT INTO matrix_roles (ord, label, db_role, user_id) VALUES
  (1, 'anon', 'anon', NULL),
  (2, 'nonstaff', 'authenticated', '33333333-3333-4333-8333-333333333333'),
  (3, 'staff', 'authenticated', '22222222-2222-4222-8222-222222222222'),
  (4, 'admin', 'authenticated', '11111111-1111-4111-8111-111111111111'),
  (5, 'staff_nonmember', 'authenticated', '66666666-6666-4666-8666-666666666666');

CREATE OR REPLACE FUNCTION test.matrix_expected(
  p_phase text,
  p_role text,
  p_class text,
  p_op text
)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_after boolean := p_phase = 'after';
  v_auth boolean := p_role <> 'anon';
  v_staff boolean := p_role IN ('staff', 'admin', 'staff_nonmember');
  v_member boolean := p_role IN ('nonstaff', 'staff', 'admin');
  v_admin boolean := p_role = 'admin';
BEGIN
  IF p_op = 'TRUNCATE' THEN
    IF v_after THEN
      RETURN 'privilege';
    END IF;
    RETURN 'ok';
  END IF;

  IF p_op = 'MAINTAIN' THEN
    IF p_class = 'attest44' AND NOT v_after THEN
      RETURN 'yes';
    END IF;
    RETURN 'no';
  END IF;

  IF p_class = 'deny' THEN
    IF p_op = 'SELECT' THEN
      RETURN 'rows:0';
    ELSIF p_op = 'INSERT' THEN
      IF v_after AND NOT v_auth THEN
        RETURN 'privilege';
      END IF;
      RETURN 'rls';
    ELSIF v_after AND NOT v_auth THEN
      RETURN 'privilege';
    ELSE
      RETURN 'rows:0';
    END IF;
  ELSIF p_class = 'user_roles' THEN
    IF NOT v_after THEN
      IF NOT v_auth AND p_op = 'SELECT' THEN
        RETURN 'rows:0';
      ELSIF NOT v_auth AND p_op = 'INSERT' THEN
        RETURN 'rls';
      ELSIF NOT v_auth THEN
        RETURN 'rows:0';
      ELSIF p_op = 'SELECT' THEN
        RETURN 'rows:4';
      ELSE
        RETURN 'rows:1';
      END IF;
    END IF;
    IF p_op = 'SELECT' THEN
      IF v_auth THEN
        RETURN 'rows:1';
      END IF;
      RETURN 'rows:0';
    END IF;
    RETURN 'privilege';
  ELSIF p_class = 'staff_all' THEN
    IF NOT v_after THEN
      IF NOT v_auth AND p_op = 'SELECT' THEN
        RETURN 'rows:0';
      ELSIF NOT v_auth AND p_op = 'INSERT' THEN
        RETURN 'rls';
      ELSIF NOT v_auth THEN
        RETURN 'rows:0';
      ELSE
        RETURN 'rows:1';
      END IF;
    END IF;
    IF NOT v_auth THEN
      IF p_op = 'SELECT' THEN
        RETURN 'rows:0';
      END IF;
      RETURN 'privilege';
    END IF;
    IF NOT v_staff THEN
      IF p_op = 'SELECT' THEN
        RETURN 'rows:0';
      ELSIF p_op = 'INSERT' THEN
        RETURN 'rls';
      ELSE
        RETURN 'rows:0';
      END IF;
    END IF;
    RETURN 'rows:1';
  ELSIF p_class = 'admin_write' THEN
    IF NOT v_after THEN
      IF NOT v_auth AND p_op = 'SELECT' THEN
        RETURN 'rows:0';
      ELSIF NOT v_auth AND p_op = 'INSERT' THEN
        RETURN 'rls';
      ELSIF NOT v_auth THEN
        RETURN 'rows:0';
      ELSE
        RETURN 'rows:1';
      END IF;
    END IF;
    IF NOT v_auth THEN
      IF p_op = 'SELECT' THEN
        RETURN 'rows:0';
      END IF;
      RETURN 'privilege';
    END IF;
    IF v_admin THEN
      RETURN 'rows:1';
    END IF;
    IF p_op = 'SELECT' AND v_staff THEN
      RETURN 'rows:1';
    ELSIF p_op = 'INSERT' THEN
      RETURN 'rls';
    ELSE
      RETURN 'rows:0';
    END IF;
  ELSIF p_class = 'audit' THEN
    IF NOT v_after THEN
      IF NOT v_auth AND p_op = 'SELECT' THEN
        RETURN 'rows:0';
      ELSIF NOT v_auth AND p_op = 'INSERT' THEN
        RETURN 'rls';
      ELSIF NOT v_auth THEN
        RETURN 'rows:0';
      ELSIF p_op IN ('SELECT', 'INSERT') THEN
        RETURN 'rows:1';
      ELSE
        RETURN 'rows:0';
      END IF;
    END IF;
    IF NOT v_auth THEN
      IF p_op = 'SELECT' THEN
        RETURN 'rows:0';
      END IF;
      RETURN 'privilege';
    END IF;
    IF NOT v_staff THEN
      IF p_op = 'SELECT' THEN
        RETURN 'rows:0';
      ELSIF p_op = 'INSERT' THEN
        RETURN 'rls';
      ELSE
        RETURN 'rows:0';
      END IF;
    END IF;
    IF p_op IN ('SELECT', 'INSERT') THEN
      RETURN 'rows:1';
    END IF;
    RETURN 'rows:0';
  ELSIF p_class = 'alias' THEN
    IF NOT v_after THEN
      IF v_member AND p_op IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE') THEN
        RETURN 'rows:1';
      ELSIF p_op = 'SELECT' THEN
        RETURN 'rows:0';
      ELSIF p_op = 'INSERT' THEN
        RETURN 'rls';
      ELSE
        RETURN 'rows:0';
      END IF;
    END IF;
    IF NOT v_auth THEN
      IF p_op = 'SELECT' THEN
        RETURN 'rows:0';
      END IF;
      RETURN 'privilege';
    END IF;
    IF p_role IN ('staff', 'admin') THEN
      RETURN 'rows:1';
    END IF;
    IF p_op = 'SELECT' THEN
      RETURN 'rows:0';
    ELSIF p_op = 'INSERT' THEN
      RETURN 'rls';
    ELSE
      RETURN 'rows:0';
    END IF;
  ELSIF p_class = 'rpc_staff_bool' THEN
    IF NOT v_auth THEN
      RETURN 'privilege';
    ELSIF v_staff THEN
      RETURN 'rpc:true';
    ELSE
      RETURN 'rpc:false';
    END IF;
  ELSIF p_class = 'rpc_admin_bool' THEN
    IF NOT v_auth THEN
      RETURN 'privilege';
    ELSIF v_admin THEN
      RETURN 'rpc:true';
    ELSE
      RETURN 'rpc:false';
    END IF;
  ELSIF p_class = 'rpc_pms' THEN
    IF v_after OR NOT v_auth THEN
      RETURN 'privilege';
    END IF;
    RETURN 'rpc:rows:1';
  ELSIF p_class = 'rpc_admin_manage' THEN
    IF NOT v_after THEN
      RETURN 'missing';
    ELSIF NOT v_auth THEN
      RETURN 'privilege';
    ELSIF v_admin THEN
      RETURN 'rpc:rows:1';
    ELSE
      RETURN 'raise:BLOCKED_BY_AUTHORIZATION';
    END IF;
  ELSIF p_class = 'rpc_require' THEN
    IF NOT v_after THEN
      RETURN 'missing';
    ELSIF NOT v_auth THEN
      RETURN 'privilege';
    ELSIF p_role = 'nonstaff' THEN
      RETURN 'raise:not_in_config';
    ELSIF p_role = 'staff' THEN
      RETURN 'rpc:22222222-2222-4222-8222-222222222222';
    ELSIF p_role = 'admin' THEN
      RETURN 'rpc:11111111-1111-4111-8111-111111111111';
    ELSE
      RETURN 'rpc:66666666-6666-4666-8666-666666666666';
    END IF;
  ELSIF p_class = 'rpc_require_ceo' THEN
    IF NOT v_after THEN
      RETURN 'missing';
    ELSIF NOT v_auth THEN
      RETURN 'privilege';
    ELSIF p_role = 'nonstaff' THEN
      RETURN 'raise:not_in_config';
    ELSIF v_admin THEN
      RETURN 'rpc:11111111-1111-4111-8111-111111111111';
    ELSE
      RETURN 'raise:not_permitted';
    END IF;
  END IF;

  RAISE EXCEPTION 'no expected outcome for % % % %', p_phase, p_role, p_class, p_op;
END;
$$;

CREATE OR REPLACE PROCEDURE test.matrix_reseed()
LANGUAGE plpgsql
AS $$
DECLARE
  name text;
  simple text[] := ARRAY[
    'accounting_rules', 'airbnb_reservations', 'alerts', 'business_cases',
    'business_event_sources', 'business_events', 'case_completeness_gaps',
    'case_entities', 'case_relationships', 'case_workflow_state',
    'category_subcategories', 'contact_opening_balance_history', 'custody_positions',
    'data_quality_backup_20260610', 'entities', 'entity_aliases', 'entity_registry',
    'freeze_v1_ceo_kpis', 'freeze_v1_ceo_summary', 'freeze_v1_settlement', 'ownership',
    'partnership_ownership', 'payer_aliases', 'pending_queue', 'property_definitions',
    'property_owners', 'property_ownership', 'property_reporting_map',
    'renovation_projects', 'settlement_temporal_transitions',
    'tamir_redisson_backup_20260610', 'transaction_business_metadata',
    'transaction_corrections', 'transaction_exclusions', 'transactions_backup_20260609',
    'transactions_deletion_backup', 'user_profiles'
  ];
BEGIN
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '{}', true);

  INSERT INTO auth.users (id, email) VALUES
    ('22222222-2222-4222-8222-222222222222', 'staff@example.test'),
    ('33333333-3333-4333-8333-333333333333', 'outsider@example.test'),
    ('66666666-6666-4666-8666-666666666666', 'nonmember@example.test'),
    ('77777777-7777-4777-8777-777777777777', 'insert-target@example.test')
  ON CONFLICT (id) DO NOTHING;

  DELETE FROM public.user_roles;
  INSERT INTO public.user_roles (user_id, email, role, is_active) VALUES
    ('11111111-1111-4111-8111-111111111111', 'admin@example.test', 'superadmin', true),
    ('22222222-2222-4222-8222-222222222222', 'staff@example.test', 'employee', true),
    ('33333333-3333-4333-8333-333333333333', 'outsider@example.test', 'partner', true),
    ('66666666-6666-4666-8666-666666666666', 'nonmember@example.test', 'employee', true);

  DELETE FROM public.jj_staff_config;
  INSERT INTO public.jj_staff_config (user_id, staff_role, is_active) VALUES
    ('11111111-1111-4111-8111-111111111111', 'ceo', true),
    ('22222222-2222-4222-8222-222222222222', 'finance_admin', true),
    ('66666666-6666-4666-8666-666666666666', 'employee', true);

  DELETE FROM public.contacts;
  INSERT INTO public.contacts (id, name, type, email)
  VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Fixture Contact', 'owner', 'contact@example.test');

  DELETE FROM public.contact_properties;
  INSERT INTO public.contact_properties (id, property_name)
  VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Fixture Link');

  DELETE FROM public.contact_opening_balances;
  INSERT INTO public.contact_opening_balances (contact_id, property_name, balance_eur, as_of_date, is_voided)
  VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Fixture Property', 10, '2026-01-01', false);

  DELETE FROM public.partnership_capital;
  INSERT INTO public.partnership_capital (property_name, partner_name, ownership_percent, amount_paid_by_partner)
  VALUES ('Fixture Property', 'Fixture Partner', 50, 0);

  DELETE FROM public.case_audit_log;
  INSERT INTO public.case_audit_log (actor, action)
  VALUES ('11111111-1111-4111-8111-111111111111', 'fixture');

  DELETE FROM access.company_memberships;
  INSERT INTO access.company_memberships (company_id, user_id, is_active) VALUES
    ('99999999-9999-4999-8999-999999999999', '11111111-1111-4111-8111-111111111111', true),
    ('99999999-9999-4999-8999-999999999999', '22222222-2222-4222-8222-222222222222', true),
    ('99999999-9999-4999-8999-999999999999', '33333333-3333-4333-8333-333333333333', true);

  DELETE FROM public.property_name_aliases;
  INSERT INTO public.property_name_aliases (raw_name, canonical_name, operating_company_id)
  VALUES ('fixture-alias', 'Villa Mazotos', '99999999-9999-4999-8999-999999999999');

  FOREACH name IN ARRAY simple LOOP
    EXECUTE format('DELETE FROM public.%I', name);
    EXECUTE format(
      'INSERT INTO public.%I (id) VALUES (''aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'')',
      name
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE PROCEDURE test.probe_matrix(
  p_phase text,
  p_role text,
  p_db_role text,
  p_user uuid,
  p_object text,
  p_class text,
  p_op text,
  p_sql text
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_expected text;
  v_actual text;
  v_detail text;
  v_count bigint;
  v_rows bigint;
  v_text text;
  payload text;
BEGIN
  v_expected := test.matrix_expected(p_phase, p_role, p_class, p_op);
  BEGIN
    IF p_db_role = 'anon' THEN
      payload := json_build_object('role', 'anon')::text;
    ELSE
      payload := json_build_object('sub', p_user, 'role', 'authenticated')::text;
    END IF;
    PERFORM set_config('request.jwt.claims', payload, true);
    EXECUTE format('SET LOCAL ROLE %I', p_db_role);
    IF p_op = 'SELECT' THEN
      EXECUTE p_sql INTO v_count;
      v_actual := 'rows:' || v_count::text;
    ELSIF p_op = 'EXECUTE' THEN
      EXECUTE p_sql INTO v_text;
      v_actual := v_text;
    ELSE
      EXECUTE p_sql;
      GET DIAGNOSTICS v_rows = ROW_COUNT;
      IF p_op = 'TRUNCATE' THEN
        v_actual := 'ok';
      ELSE
        v_actual := 'rows:' || v_rows::text;
      END IF;
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLSTATE = '42501' AND SQLERRM ILIKE '%row-level security%' THEN
        v_actual := 'rls';
      ELSIF SQLSTATE = '42501' THEN
        v_actual := 'privilege';
      ELSIF SQLSTATE = '42883' THEN
        v_actual := 'missing';
      ELSIF SQLERRM LIKE '%BLOCKED_BY_%' THEN
        v_actual := 'raise:' || substring(SQLERRM FROM 'BLOCKED_BY_[A-Z0-9_]+');
      ELSIF SQLERRM LIKE '%not in jj_staff_config%' THEN
        v_actual := 'raise:not_in_config';
      ELSIF SQLERRM LIKE '%not permitted%' THEN
        v_actual := 'raise:not_permitted';
      ELSIF SQLERRM LIKE '%Authenticated session required%' THEN
        v_actual := 'raise:session_required';
      ELSIF SQLERRM LIKE '%is_active = false%' THEN
        v_actual := 'raise:inactive';
      ELSE
        v_actual := 'other:' || SQLSTATE;
      END IF;
      v_detail := SQLERRM;
  END;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '{}', true);
  IF p_op = 'TRUNCATE' AND v_actual = 'ok'
     OR p_op IN ('INSERT', 'DELETE') AND v_actual LIKE 'rows:%' AND v_actual <> 'rows:0'
     OR p_op = 'EXECUTE' AND v_actual LIKE 'rpc:rows:%'
  THEN
    CALL test.matrix_reseed();
  END IF;

  INSERT INTO test.direct_db_matrix (
    phase, role_label, object_name, operation, expected, actual, detail
  ) VALUES (
    p_phase, p_role, p_object, p_op, v_expected, v_actual, v_detail
  );
END;
$$;

CALL test.matrix_reseed();

DO $matrix$
DECLARE
  phase text := current_setting('jj.matrix_phase');
  tables text[] := ARRAY[
    'accounting_rules', 'airbnb_reservations', 'alerts', 'business_cases',
    'business_event_sources', 'business_events', 'case_audit_log',
    'case_completeness_gaps', 'case_entities', 'case_relationships',
    'case_workflow_state', 'category_subcategories', 'contact_opening_balance_history',
    'contact_opening_balances', 'contact_properties', 'contacts', 'custody_positions',
    'data_quality_backup_20260610', 'entities', 'entity_aliases', 'entity_registry',
    'freeze_v1_ceo_kpis', 'freeze_v1_ceo_summary', 'freeze_v1_settlement', 'ownership',
    'partnership_capital', 'partnership_ownership', 'payer_aliases', 'pending_queue',
    'property_definitions', 'property_name_aliases', 'property_owners',
    'property_ownership', 'property_reporting_map', 'renovation_projects',
    'settlement_temporal_transitions', 'tamir_redisson_backup_20260610',
    'transaction_business_metadata', 'transaction_corrections', 'transaction_exclusions',
    'transactions_backup_20260609', 'transactions_deletion_backup', 'user_profiles',
    'user_roles'
  ];
  ops text[] := ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'];
  name text;
  class text;
  role_label text;
  db_role text;
  user_id uuid;
  op text;
  stmt text;
  actor uuid;
  i int;
  rel record;
  maintain_actual text;
  maintain_expected text;
BEGIN
  IF array_length(tables, 1) <> 44 THEN
    RAISE EXCEPTION 'matrix table list drifted';
  END IF;

  FOREACH name IN ARRAY tables LOOP
    class := CASE name
      WHEN 'user_roles' THEN 'user_roles'
      WHEN 'contacts' THEN 'staff_all'
      WHEN 'contact_properties' THEN 'staff_all'
      WHEN 'contact_opening_balances' THEN 'admin_write'
      WHEN 'partnership_capital' THEN 'admin_write'
      WHEN 'case_audit_log' THEN 'audit'
      WHEN 'property_name_aliases' THEN 'alias'
      ELSE 'deny'
    END;

    FOR i IN 1..5 LOOP
      SELECT roles.label, roles.db_role, roles.user_id
        INTO role_label, db_role, user_id
      FROM matrix_roles AS roles
      WHERE roles.ord = i;
      FOREACH op IN ARRAY ops LOOP
        IF op = 'SELECT' THEN
          stmt := format('SELECT count(*) FROM public.%I', name);
        ELSIF op = 'TRUNCATE' THEN
          stmt := format('TRUNCATE TABLE public.%I', name);
        ELSIF op = 'INSERT' AND name = 'user_roles' THEN
          stmt := $s$INSERT INTO public.user_roles (user_id, role, is_active) VALUES ('77777777-7777-4777-8777-777777777777', 'viewer', true)$s$;
        ELSIF op = 'INSERT' AND name = 'contacts' THEN
          stmt := $s$INSERT INTO public.contacts (name) VALUES ('Probe')$s$;
        ELSIF op = 'INSERT' AND name = 'contact_properties' THEN
          stmt := $s$INSERT INTO public.contact_properties (property_name) VALUES ('Probe')$s$;
        ELSIF op = 'INSERT' AND name = 'contact_opening_balances' THEN
          stmt := $s$INSERT INTO public.contact_opening_balances (property_name, balance_eur) VALUES ('Probe', 1)$s$;
        ELSIF op = 'INSERT' AND name = 'partnership_capital' THEN
          stmt := $s$INSERT INTO public.partnership_capital (property_name, partner_name) VALUES ('Probe Property', 'Probe Partner')$s$;
        ELSIF op = 'INSERT' AND name = 'case_audit_log' THEN
          actor := COALESCE(user_id, '11111111-1111-4111-8111-111111111111'::uuid);
          stmt := format(
            'INSERT INTO public.case_audit_log (actor, action) VALUES (%L::uuid, %L)',
            actor, 'probe'
          );
        ELSIF op = 'INSERT' AND name = 'property_name_aliases' THEN
          stmt := $s$INSERT INTO public.property_name_aliases (raw_name, canonical_name, operating_company_id) VALUES ('probe-alias', 'Villa Mazotos', '99999999-9999-4999-8999-999999999999')$s$;
        ELSIF op = 'INSERT' THEN
          stmt := format(
            'INSERT INTO public.%I (id) VALUES (''bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'')',
            name
          );
        ELSIF op = 'UPDATE' AND name = 'user_roles' THEN
          stmt := $s$UPDATE public.user_roles SET notes = notes WHERE user_id = '22222222-2222-4222-8222-222222222222'$s$;
        ELSIF op = 'UPDATE' AND name = 'contacts' THEN
          stmt := $s$UPDATE public.contacts SET name = name WHERE name = 'Fixture Contact'$s$;
        ELSIF op = 'UPDATE' AND name = 'contact_properties' THEN
          stmt := $s$UPDATE public.contact_properties SET property_name = property_name WHERE property_name = 'Fixture Link'$s$;
        ELSIF op = 'UPDATE' AND name = 'contact_opening_balances' THEN
          stmt := $s$UPDATE public.contact_opening_balances SET balance_eur = balance_eur WHERE property_name = 'Fixture Property'$s$;
        ELSIF op = 'UPDATE' AND name = 'partnership_capital' THEN
          stmt := $s$UPDATE public.partnership_capital SET notes = notes WHERE property_name = 'Fixture Property'$s$;
        ELSIF op = 'UPDATE' AND name = 'case_audit_log' THEN
          stmt := $s$UPDATE public.case_audit_log SET action = action WHERE action = 'fixture'$s$;
        ELSIF op = 'UPDATE' AND name = 'property_name_aliases' THEN
          stmt := $s$UPDATE public.property_name_aliases SET canonical_name = canonical_name WHERE raw_name = 'fixture-alias'$s$;
        ELSIF op = 'UPDATE' THEN
          stmt := format(
            'UPDATE public.%I SET id = id WHERE id = ''aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa''',
            name
          );
        ELSIF op = 'DELETE' AND name = 'user_roles' THEN
          stmt := $s$DELETE FROM public.user_roles WHERE user_id = '33333333-3333-4333-8333-333333333333'$s$;
        ELSIF op = 'DELETE' AND name = 'contacts' THEN
          stmt := $s$DELETE FROM public.contacts WHERE name = 'Fixture Contact'$s$;
        ELSIF op = 'DELETE' AND name = 'contact_properties' THEN
          stmt := $s$DELETE FROM public.contact_properties WHERE property_name = 'Fixture Link'$s$;
        ELSIF op = 'DELETE' AND name = 'contact_opening_balances' THEN
          stmt := $s$DELETE FROM public.contact_opening_balances WHERE property_name = 'Fixture Property'$s$;
        ELSIF op = 'DELETE' AND name = 'partnership_capital' THEN
          stmt := $s$DELETE FROM public.partnership_capital WHERE property_name = 'Fixture Property'$s$;
        ELSIF op = 'DELETE' AND name = 'case_audit_log' THEN
          stmt := $s$DELETE FROM public.case_audit_log WHERE action = 'fixture'$s$;
        ELSIF op = 'DELETE' AND name = 'property_name_aliases' THEN
          stmt := $s$DELETE FROM public.property_name_aliases WHERE raw_name = 'fixture-alias'$s$;
        ELSE
          stmt := format(
            'DELETE FROM public.%I WHERE id = ''aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa''',
            name
          );
        END IF;

        CALL test.probe_matrix(
          phase, role_label, db_role, user_id,
          'public.' || name, class, op, stmt
        );
      END LOOP;
    END LOOP;
  END LOOP;

  FOR rel IN
    SELECT namespace.nspname, relation.relname
    FROM pg_class AS relation
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relkind IN ('r', 'p')
    ORDER BY relation.relname
  LOOP
    IF has_table_privilege(
      'anon',
      format('%I.%I', rel.nspname, rel.relname),
      'MAINTAIN'
    ) THEN
      maintain_actual := 'yes';
    ELSE
      maintain_actual := 'no';
    END IF;
    class := CASE
      WHEN rel.relname = ANY (tables) THEN 'attest44'
      ELSE 'other'
    END;
    maintain_expected := test.matrix_expected(phase, 'anon', class, 'MAINTAIN');
    INSERT INTO test.direct_db_matrix (
      phase, role_label, object_name, operation, expected, actual, detail
    ) VALUES (
      phase, 'anon', format('%I.%I', rel.nspname, rel.relname), 'MAINTAIN',
      maintain_expected, maintain_actual, NULL
    );
  END LOOP;

  CALL test.probe_matrix(
    phase, 'anon', 'anon', NULL,
    'finance.is_active_jj_staff()', 'rpc_staff_bool', 'EXECUTE',
    $$SELECT 'rpc:' || finance.is_active_jj_staff()::text$$
  );
  CALL test.probe_matrix(
    phase, 'nonstaff', 'authenticated', '33333333-3333-4333-8333-333333333333',
    'finance.is_active_jj_staff()', 'rpc_staff_bool', 'EXECUTE',
    $$SELECT 'rpc:' || finance.is_active_jj_staff()::text$$
  );
  CALL test.probe_matrix(
    phase, 'staff', 'authenticated', '22222222-2222-4222-8222-222222222222',
    'finance.is_active_jj_staff()', 'rpc_staff_bool', 'EXECUTE',
    $$SELECT 'rpc:' || finance.is_active_jj_staff()::text$$
  );
  CALL test.probe_matrix(
    phase, 'admin', 'authenticated', '11111111-1111-4111-8111-111111111111',
    'finance.is_active_jj_staff()', 'rpc_staff_bool', 'EXECUTE',
    $$SELECT 'rpc:' || finance.is_active_jj_staff()::text$$
  );
  CALL test.probe_matrix(
    phase, 'staff_nonmember', 'authenticated', '66666666-6666-4666-8666-666666666666',
    'finance.is_active_jj_staff()', 'rpc_staff_bool', 'EXECUTE',
    $$SELECT 'rpc:' || finance.is_active_jj_staff()::text$$
  );

  CALL test.probe_matrix(
    phase, 'anon', 'anon', NULL,
    'finance.is_active_jj_admin()', 'rpc_admin_bool', 'EXECUTE',
    $$SELECT 'rpc:' || finance.is_active_jj_admin()::text$$
  );
  CALL test.probe_matrix(
    phase, 'nonstaff', 'authenticated', '33333333-3333-4333-8333-333333333333',
    'finance.is_active_jj_admin()', 'rpc_admin_bool', 'EXECUTE',
    $$SELECT 'rpc:' || finance.is_active_jj_admin()::text$$
  );
  CALL test.probe_matrix(
    phase, 'staff', 'authenticated', '22222222-2222-4222-8222-222222222222',
    'finance.is_active_jj_admin()', 'rpc_admin_bool', 'EXECUTE',
    $$SELECT 'rpc:' || finance.is_active_jj_admin()::text$$
  );
  CALL test.probe_matrix(
    phase, 'admin', 'authenticated', '11111111-1111-4111-8111-111111111111',
    'finance.is_active_jj_admin()', 'rpc_admin_bool', 'EXECUTE',
    $$SELECT 'rpc:' || finance.is_active_jj_admin()::text$$
  );
  CALL test.probe_matrix(
    phase, 'staff_nonmember', 'authenticated', '66666666-6666-4666-8666-666666666666',
    'finance.is_active_jj_admin()', 'rpc_admin_bool', 'EXECUTE',
    $$SELECT 'rpc:' || finance.is_active_jj_admin()::text$$
  );

  CALL test.probe_matrix(
    phase, 'anon', 'anon', NULL,
    'public.pms_resolve_mapping(text)', 'rpc_pms', 'EXECUTE',
    $$SELECT 'rpc:rows:' || count(*)::text FROM public.pms_resolve_mapping('Villa Mazotos')$$
  );
  CALL test.probe_matrix(
    phase, 'nonstaff', 'authenticated', '33333333-3333-4333-8333-333333333333',
    'public.pms_resolve_mapping(text)', 'rpc_pms', 'EXECUTE',
    $$SELECT 'rpc:rows:' || count(*)::text FROM public.pms_resolve_mapping('Villa Mazotos')$$
  );
  CALL test.probe_matrix(
    phase, 'staff', 'authenticated', '22222222-2222-4222-8222-222222222222',
    'public.pms_resolve_mapping(text)', 'rpc_pms', 'EXECUTE',
    $$SELECT 'rpc:rows:' || count(*)::text FROM public.pms_resolve_mapping('Villa Mazotos')$$
  );
  CALL test.probe_matrix(
    phase, 'admin', 'authenticated', '11111111-1111-4111-8111-111111111111',
    'public.pms_resolve_mapping(text)', 'rpc_pms', 'EXECUTE',
    $$SELECT 'rpc:rows:' || count(*)::text FROM public.pms_resolve_mapping('Villa Mazotos')$$
  );
  CALL test.probe_matrix(
    phase, 'staff_nonmember', 'authenticated', '66666666-6666-4666-8666-666666666666',
    'public.pms_resolve_mapping(text)', 'rpc_pms', 'EXECUTE',
    $$SELECT 'rpc:rows:' || count(*)::text FROM public.pms_resolve_mapping('Villa Mazotos')$$
  );

  CALL test.probe_matrix(
    phase, 'anon', 'anon', NULL,
    'public.pms_reservations_for_property(text,date,date)', 'rpc_pms', 'EXECUTE',
    $$SELECT 'rpc:rows:' || count(*)::text FROM public.pms_reservations_for_property('412148', DATE '2026-10-01', DATE '2026-10-04')$$
  );
  CALL test.probe_matrix(
    phase, 'nonstaff', 'authenticated', '33333333-3333-4333-8333-333333333333',
    'public.pms_reservations_for_property(text,date,date)', 'rpc_pms', 'EXECUTE',
    $$SELECT 'rpc:rows:' || count(*)::text FROM public.pms_reservations_for_property('412148', DATE '2026-10-01', DATE '2026-10-04')$$
  );
  CALL test.probe_matrix(
    phase, 'staff', 'authenticated', '22222222-2222-4222-8222-222222222222',
    'public.pms_reservations_for_property(text,date,date)', 'rpc_pms', 'EXECUTE',
    $$SELECT 'rpc:rows:' || count(*)::text FROM public.pms_reservations_for_property('412148', DATE '2026-10-01', DATE '2026-10-04')$$
  );
  CALL test.probe_matrix(
    phase, 'admin', 'authenticated', '11111111-1111-4111-8111-111111111111',
    'public.pms_reservations_for_property(text,date,date)', 'rpc_pms', 'EXECUTE',
    $$SELECT 'rpc:rows:' || count(*)::text FROM public.pms_reservations_for_property('412148', DATE '2026-10-01', DATE '2026-10-04')$$
  );
  CALL test.probe_matrix(
    phase, 'staff_nonmember', 'authenticated', '66666666-6666-4666-8666-666666666666',
    'public.pms_reservations_for_property(text,date,date)', 'rpc_pms', 'EXECUTE',
    $$SELECT 'rpc:rows:' || count(*)::text FROM public.pms_reservations_for_property('412148', DATE '2026-10-01', DATE '2026-10-04')$$
  );

  CALL test.probe_matrix(
    phase, 'anon', 'anon', NULL,
    'public.admin_manage_user_role(uuid,text,boolean,text,text,text)', 'rpc_admin_manage', 'EXECUTE',
    $$SELECT 'rpc:rows:' || count(*)::text FROM public.admin_manage_user_role('22222222-2222-4222-8222-222222222222'::uuid, 'employee', true, NULL, NULL, NULL)$$
  );
  CALL test.probe_matrix(
    phase, 'nonstaff', 'authenticated', '33333333-3333-4333-8333-333333333333',
    'public.admin_manage_user_role(uuid,text,boolean,text,text,text)', 'rpc_admin_manage', 'EXECUTE',
    $$SELECT 'rpc:rows:' || count(*)::text FROM public.admin_manage_user_role('22222222-2222-4222-8222-222222222222'::uuid, 'employee', true, NULL, NULL, NULL)$$
  );
  CALL test.probe_matrix(
    phase, 'staff', 'authenticated', '22222222-2222-4222-8222-222222222222',
    'public.admin_manage_user_role(uuid,text,boolean,text,text,text)', 'rpc_admin_manage', 'EXECUTE',
    $$SELECT 'rpc:rows:' || count(*)::text FROM public.admin_manage_user_role('22222222-2222-4222-8222-222222222222'::uuid, 'employee', true, NULL, NULL, NULL)$$
  );
  CALL test.probe_matrix(
    phase, 'admin', 'authenticated', '11111111-1111-4111-8111-111111111111',
    'public.admin_manage_user_role(uuid,text,boolean,text,text,text)', 'rpc_admin_manage', 'EXECUTE',
    $$SELECT 'rpc:rows:' || count(*)::text FROM public.admin_manage_user_role('22222222-2222-4222-8222-222222222222'::uuid, 'employee', true, NULL, NULL, NULL)$$
  );
  CALL test.probe_matrix(
    phase, 'staff_nonmember', 'authenticated', '66666666-6666-4666-8666-666666666666',
    'public.admin_manage_user_role(uuid,text,boolean,text,text,text)', 'rpc_admin_manage', 'EXECUTE',
    $$SELECT 'rpc:rows:' || count(*)::text FROM public.admin_manage_user_role('22222222-2222-4222-8222-222222222222'::uuid, 'employee', true, NULL, NULL, NULL)$$
  );

  CALL test.probe_matrix(
    phase, 'anon', 'anon', NULL,
    'public.require_jj_staff(text[])', 'rpc_require', 'EXECUTE',
    $$SELECT 'rpc:' || public.require_jj_staff(NULL)::text$$
  );
  CALL test.probe_matrix(
    phase, 'nonstaff', 'authenticated', '33333333-3333-4333-8333-333333333333',
    'public.require_jj_staff(text[])', 'rpc_require', 'EXECUTE',
    $$SELECT 'rpc:' || public.require_jj_staff(NULL)::text$$
  );
  CALL test.probe_matrix(
    phase, 'staff', 'authenticated', '22222222-2222-4222-8222-222222222222',
    'public.require_jj_staff(text[])', 'rpc_require', 'EXECUTE',
    $$SELECT 'rpc:' || public.require_jj_staff(NULL)::text$$
  );
  CALL test.probe_matrix(
    phase, 'admin', 'authenticated', '11111111-1111-4111-8111-111111111111',
    'public.require_jj_staff(text[])', 'rpc_require', 'EXECUTE',
    $$SELECT 'rpc:' || public.require_jj_staff(NULL)::text$$
  );
  CALL test.probe_matrix(
    phase, 'staff_nonmember', 'authenticated', '66666666-6666-4666-8666-666666666666',
    'public.require_jj_staff(text[])', 'rpc_require', 'EXECUTE',
    $$SELECT 'rpc:' || public.require_jj_staff(NULL)::text$$
  );

  CALL test.probe_matrix(
    phase, 'anon', 'anon', NULL,
    'public.require_jj_staff(ARRAY[ceo])', 'rpc_require_ceo', 'EXECUTE',
    $$SELECT 'rpc:' || public.require_jj_staff(ARRAY['ceo']::text[])::text$$
  );
  CALL test.probe_matrix(
    phase, 'nonstaff', 'authenticated', '33333333-3333-4333-8333-333333333333',
    'public.require_jj_staff(ARRAY[ceo])', 'rpc_require_ceo', 'EXECUTE',
    $$SELECT 'rpc:' || public.require_jj_staff(ARRAY['ceo']::text[])::text$$
  );
  CALL test.probe_matrix(
    phase, 'staff', 'authenticated', '22222222-2222-4222-8222-222222222222',
    'public.require_jj_staff(ARRAY[ceo])', 'rpc_require_ceo', 'EXECUTE',
    $$SELECT 'rpc:' || public.require_jj_staff(ARRAY['ceo']::text[])::text$$
  );
  CALL test.probe_matrix(
    phase, 'admin', 'authenticated', '11111111-1111-4111-8111-111111111111',
    'public.require_jj_staff(ARRAY[ceo])', 'rpc_require_ceo', 'EXECUTE',
    $$SELECT 'rpc:' || public.require_jj_staff(ARRAY['ceo']::text[])::text$$
  );
  CALL test.probe_matrix(
    phase, 'staff_nonmember', 'authenticated', '66666666-6666-4666-8666-666666666666',
    'public.require_jj_staff(ARRAY[ceo])', 'rpc_require_ceo', 'EXECUTE',
    $$SELECT 'rpc:' || public.require_jj_staff(ARRAY['ceo']::text[])::text$$
  );
END
$matrix$;
