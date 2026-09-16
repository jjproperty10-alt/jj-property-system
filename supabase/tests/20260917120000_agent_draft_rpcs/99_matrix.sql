-- Role matrix for public draft RPCs. Fail closed: any FAIL raises.

CREATE TEMP TABLE matrix_result (
  test_name text PRIMARY KEY,
  passed boolean NOT NULL,
  detail text NOT NULL
);

CREATE OR REPLACE FUNCTION pg_temp.tx_fingerprint()
RETURNS text
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT count(*)::text || ':' || md5(
    COALESCE(
      string_agg(
        t.id::text || '|' || t.date::text || '|' || COALESCE(t.amount_eur::text, '') || '|' || COALESCE(t.description, ''),
        E'\n' ORDER BY t.id
      ),
      ''
    )
  )
  FROM public.transactions t;
$$;

CREATE OR REPLACE FUNCTION pg_temp.set_jwt(p_uid uuid, p_role text)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', COALESCE(p_uid::text, ''), false);
  PERFORM set_config('request.jwt.claim.role', COALESCE(p_role, ''), false);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', COALESCE(p_uid::text, ''), 'role', COALESCE(p_role, ''))::text,
    false
  );
END;
$$;

DO $$
DECLARE
  v_before text;
  v_after text;
  v_id uuid;
  v_status text;
  v_reused boolean;
  v_id2 uuid;
  v_list_count integer;
  v_created_by uuid;
  v_posted uuid;
  v_err text;
  v_ok boolean;
BEGIN
  v_before := pg_temp.tx_fingerprint();

  -- 1. anon cannot execute create
  PERFORM pg_temp.set_jwt(NULL, 'anon');
  BEGIN
    EXECUTE 'SET ROLE anon';
    v_ok := false;
    BEGIN
      PERFORM * FROM public.create_agent_transaction_draft(
        '2026-09-16', NULL, '', 'Management', 'Other',
        NULL, NULL, NULL, NULL, NULL, NULL, 'needs_review', 'k-anon',
        'manual_form', 1
      );
    EXCEPTION WHEN insufficient_privilege THEN
      v_ok := true;
      v_err := SQLERRM;
    WHEN OTHERS THEN
      v_ok := false;
      v_err := SQLERRM;
    END;
    EXECUTE 'RESET ROLE';
    INSERT INTO matrix_result VALUES ('anon_cannot_execute_create', v_ok, COALESCE(v_err, 'no error'));
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    INSERT INTO matrix_result VALUES ('anon_cannot_execute_create', false, SQLERRM);
  END;

  -- 2. anon cannot execute list
  PERFORM pg_temp.set_jwt(NULL, 'anon');
  BEGIN
    EXECUTE 'SET ROLE anon';
    v_ok := false;
    BEGIN
      PERFORM * FROM public.list_agent_transaction_drafts();
    EXCEPTION WHEN insufficient_privilege THEN
      v_ok := true;
      v_err := SQLERRM;
    WHEN OTHERS THEN
      v_ok := false;
      v_err := SQLERRM;
    END;
    EXECUTE 'RESET ROLE';
    INSERT INTO matrix_result VALUES ('anon_cannot_execute_list', v_ok, COALESCE(v_err, 'no error'));
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    INSERT INTO matrix_result VALUES ('anon_cannot_execute_list', false, SQLERRM);
  END;

  -- 3. service_role cannot execute create
  PERFORM pg_temp.set_jwt(NULL, 'service_role');
  BEGIN
    EXECUTE 'SET ROLE service_role';
    v_ok := false;
    BEGIN
      PERFORM * FROM public.create_agent_transaction_draft(
        '2026-09-16', NULL, '', 'Management', 'Other',
        NULL, NULL, NULL, NULL, NULL, NULL, 'needs_review', 'k-service',
        'manual_form', 1
      );
    EXCEPTION WHEN insufficient_privilege THEN
      v_ok := true;
      v_err := SQLERRM;
    WHEN OTHERS THEN
      v_ok := false;
      v_err := SQLERRM;
    END;
    EXECUTE 'RESET ROLE';
    INSERT INTO matrix_result VALUES ('service_role_cannot_execute_create', v_ok, COALESCE(v_err, 'no error'));
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    INSERT INTO matrix_result VALUES ('service_role_cannot_execute_create', false, SQLERRM);
  END;

  -- 4. authenticated non-staff blocked
  PERFORM pg_temp.set_jwt('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid, 'authenticated');
  BEGIN
    EXECUTE 'SET ROLE authenticated';
    v_ok := false;
    BEGIN
      PERFORM * FROM public.create_agent_transaction_draft(
        '2026-09-16', NULL, 'X', 'Management', 'Other',
        NULL, NULL, NULL, NULL, NULL, NULL, 'needs_review', 'k-partner',
        'manual_form', 1
      );
    EXCEPTION WHEN insufficient_privilege THEN
      v_ok := true;
      v_err := SQLERRM;
    WHEN OTHERS THEN
      v_ok := SQLERRM ILIKE '%not authorized%' OR SQLERRM ILIKE '%42501%';
      v_err := SQLERRM;
    END;
    EXECUTE 'RESET ROLE';
    INSERT INTO matrix_result VALUES ('authenticated_non_staff_blocked', v_ok, COALESCE(v_err, 'no error'));
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    INSERT INTO matrix_result VALUES ('authenticated_non_staff_blocked', false, SQLERRM);
  END;

  -- 5. active staff can create
  PERFORM pg_temp.set_jwt('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'authenticated');
  BEGIN
    EXECUTE 'SET ROLE authenticated';
    SELECT c.id, c.status, c.reused_existing
      INTO v_id, v_status, v_reused
      FROM public.create_agent_transaction_draft(
        '2026-09-16', NULL, 'Not A Real Property', 'Management', 'Other',
        NULL, NULL, NULL, NULL, 'seed draft', NULL, 'draft', 'k-staff-1',
        'manual_form', 1
      ) c;
    EXECUTE 'RESET ROLE';
    INSERT INTO matrix_result VALUES (
      'active_staff_can_create',
      v_id IS NOT NULL AND v_status = 'needs_review' AND v_reused = false,
      format('id=%s status=%s reused=%s', v_id, v_status, v_reused)
    );
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    INSERT INTO matrix_result VALUES ('active_staff_can_create', false, SQLERRM);
  END;

  -- 6. created_by = auth.uid() and posted_transaction_id stays NULL
  SELECT d.created_by, d.posted_transaction_id
    INTO v_created_by, v_posted
    FROM finance.agent_transaction_drafts d
   WHERE d.id = v_id;
  INSERT INTO matrix_result VALUES (
    'created_by_equals_auth_uid',
    v_created_by = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
    COALESCE(v_created_by::text, 'null')
  );
  INSERT INTO matrix_result VALUES (
    'posted_transaction_id_is_null',
    v_posted IS NULL,
    COALESCE(v_posted::text, 'null')
  );

  -- 7. duplicate idempotency key reuses existing
  PERFORM pg_temp.set_jwt('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'authenticated');
  BEGIN
    EXECUTE 'SET ROLE authenticated';
    SELECT c.id, c.status, c.reused_existing
      INTO v_id2, v_status, v_reused
      FROM public.create_agent_transaction_draft(
        '2026-09-16', NULL, 'Not A Real Property', 'Management', 'Other',
        NULL, NULL, NULL, NULL, 'seed draft again', NULL, 'draft', 'k-staff-1',
        'manual_form', 1
      ) c;
    EXECUTE 'RESET ROLE';
    INSERT INTO matrix_result VALUES (
      'duplicate_idempotency_reuses',
      v_reused = true AND v_id2 = v_id,
      format('id=%s reused=%s orig=%s', v_id2, v_reused, v_id)
    );
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    INSERT INTO matrix_result VALUES ('duplicate_idempotency_reuses', false, SQLERRM);
  END;

  -- 8. active staff can list
  PERFORM pg_temp.set_jwt('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'authenticated');
  BEGIN
    EXECUTE 'SET ROLE authenticated';
    SELECT count(*) INTO v_list_count FROM public.list_agent_transaction_drafts();
    EXECUTE 'RESET ROLE';
    INSERT INTO matrix_result VALUES (
      'active_staff_can_list',
      v_list_count >= 1,
      format('count=%s', v_list_count)
    );
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    INSERT INTO matrix_result VALUES ('active_staff_can_list', false, SQLERRM);
  END;

  -- 9. active staff can update
  PERFORM pg_temp.set_jwt('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'authenticated');
  BEGIN
    EXECUTE 'SET ROLE authenticated';
    SELECT u.id, u.status
      INTO v_id2, v_status
      FROM public.update_agent_transaction_draft(
        v_id,
        '2026-09-17',
        NULL,
        'Still Unknown',
        'Airbnb',
        'Cleaning',
        'Airbnb',
        NULL,
        12.50,
        NULL,
        'updated',
        'note',
        'needs_review'
      ) u;
    EXECUTE 'RESET ROLE';
    INSERT INTO matrix_result VALUES (
      'active_staff_can_update',
      v_id2 = v_id AND v_status = 'needs_review',
      format('id=%s status=%s', v_id2, v_status)
    );
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    INSERT INTO matrix_result VALUES ('active_staff_can_update', false, SQLERRM);
  END;

  -- 10. identity remains immutable after update
  SELECT d.created_by, d.idempotency_key, d.posted_transaction_id
    INTO v_created_by, v_err, v_posted
    FROM finance.agent_transaction_drafts d
   WHERE d.id = v_id;
  INSERT INTO matrix_result VALUES (
    'identity_immutable_after_update',
    v_created_by = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid
      AND v_err = 'k-staff-1'
      AND v_posted IS NULL,
    format('created_by=%s key=%s posted=%s', v_created_by, v_err, v_posted)
  );

  v_after := pg_temp.tx_fingerprint();
  INSERT INTO matrix_result VALUES (
    'public_transactions_unchanged',
    v_before = v_after,
    format('before=%s after=%s', v_before, v_after)
  );
END;
$$;

SELECT test_name, passed, detail
FROM matrix_result
ORDER BY test_name;

DO $$
DECLARE
  v_fail integer;
BEGIN
  SELECT count(*) INTO v_fail FROM matrix_result WHERE passed IS NOT TRUE;
  IF v_fail > 0 THEN
    RAISE EXCEPTION 'ROLE_MATRIX_FAIL count=%', v_fail;
  END IF;
END;
$$;
