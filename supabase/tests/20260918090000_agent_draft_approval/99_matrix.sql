-- Role matrix for draft approval RPCs. Fail closed: any FAIL raises.

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
        t.id::text || '|' || t.date::text || '|' || COALESCE(t.property_id::text, '') || '|'
          || COALESCE(t.amount_eur::text, '') || '|' || COALESCE(t.description, ''),
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
  v_seed_fp text;
  v_after text;
  v_id uuid;
  v_missing uuid;
  v_rejected uuid;
  v_status text;
  v_posted uuid;
  v_posted2 uuid;
  v_reused boolean;
  v_count integer;
  v_err text;
  v_ok boolean;
  v_created_by uuid;
BEGIN
  v_before := pg_temp.tx_fingerprint();
  SELECT md5(t.id::text || '|' || t.description)
    INTO v_seed_fp
    FROM public.transactions t
   WHERE t.id = '11111111-1111-1111-1111-111111111111';

  -- 1. anon cannot execute approve
  PERFORM pg_temp.set_jwt(NULL, 'anon');
  BEGIN
    EXECUTE 'SET ROLE anon';
    v_ok := false;
    BEGIN
      PERFORM * FROM public.approve_and_post_agent_transaction_draft('00000000-0000-0000-0000-000000000001');
    EXCEPTION WHEN insufficient_privilege THEN
      v_ok := true;
      v_err := SQLERRM;
    WHEN OTHERS THEN
      v_ok := false;
      v_err := SQLERRM;
    END;
    EXECUTE 'RESET ROLE';
    INSERT INTO matrix_result VALUES ('anon_blocked_approve', v_ok, COALESCE(v_err, 'no error'));
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    INSERT INTO matrix_result VALUES ('anon_blocked_approve', false, SQLERRM);
  END;

  -- 2. authenticated non-staff blocked
  PERFORM pg_temp.set_jwt('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid, 'authenticated');
  BEGIN
    EXECUTE 'SET ROLE authenticated';
    v_ok := false;
    BEGIN
      PERFORM * FROM public.approve_and_post_agent_transaction_draft('00000000-0000-0000-0000-000000000001');
    EXCEPTION WHEN insufficient_privilege THEN
      v_ok := true;
      v_err := SQLERRM;
    WHEN OTHERS THEN
      v_ok := SQLERRM ILIKE '%not authorized%' OR SQLERRM ILIKE '%42501%';
      v_err := SQLERRM;
    END;
    EXECUTE 'RESET ROLE';
    INSERT INTO matrix_result VALUES ('non_staff_blocked_approve', v_ok, COALESCE(v_err, 'no error'));
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    INSERT INTO matrix_result VALUES ('non_staff_blocked_approve', false, SQLERRM);
  END;

  -- 3. staff creates a complete Liron-shaped draft
  PERFORM pg_temp.set_jwt('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'authenticated');
  BEGIN
    EXECUTE 'SET ROLE authenticated';
    SELECT c.id, c.status
      INTO v_id, v_status
      FROM public.create_agent_transaction_draft(
        '2026-08-31',
        '6917f121-36fa-45c6-820d-38e0349c4ed0',
        'Liron and Alon',
        'Management',
        'Tenant Payment',
        'Tenant',
        'Yossi',
        550.00,
        NULL,
        'תשלום לחודש אוגוסט השלמה',
        NULL,
        'draft',
        'k-liron-550',
        'manual_form',
        1
      ) c;
    EXECUTE 'RESET ROLE';
    INSERT INTO matrix_result VALUES (
      'staff_can_create_complete_draft',
      v_id IS NOT NULL AND v_status = 'draft',
      format('id=%s status=%s', v_id, v_status)
    );
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    INSERT INTO matrix_result VALUES ('staff_can_create_complete_draft', false, SQLERRM);
  END;

  -- 4. staff can edit draft-only
  PERFORM pg_temp.set_jwt('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'authenticated');
  BEGIN
    EXECUTE 'SET ROLE authenticated';
    SELECT u.id, u.status
      INTO v_id, v_status
      FROM public.update_agent_transaction_draft(
        v_id,
        '2026-08-31',
        '6917f121-36fa-45c6-820d-38e0349c4ed0',
        'Liron and Alon',
        'Management',
        'Tenant Payment',
        'Tenant',
        'Yossi',
        550.00,
        NULL,
        'תשלום לחודש אוגוסט השלמה',
        'staff note',
        'draft'
      ) u;
    EXECUTE 'RESET ROLE';
    INSERT INTO matrix_result VALUES (
      'staff_can_edit_draft',
      v_id IS NOT NULL AND v_status = 'draft',
      format('id=%s status=%s', v_id, v_status)
    );
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    INSERT INTO matrix_result VALUES ('staff_can_edit_draft', false, SQLERRM);
  END;

  -- 5. missing required data blocked
  PERFORM pg_temp.set_jwt('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'authenticated');
  BEGIN
    EXECUTE 'SET ROLE authenticated';
    SELECT c.id INTO v_missing
      FROM public.create_agent_transaction_draft(
        '2026-08-31',
        '6917f121-36fa-45c6-820d-38e0349c4ed0',
        'Liron and Alon',
        'Management',
        'Tenant Payment',
        'Tenant',
        'Yossi',
        NULL,
        NULL,
        'missing amount',
        NULL,
        'draft',
        'k-missing-amount',
        'manual_form',
        1
      ) c;
    v_ok := false;
    BEGIN
      PERFORM * FROM public.approve_and_post_agent_transaction_draft(v_missing);
    EXCEPTION WHEN OTHERS THEN
      v_ok := SQLERRM ILIKE '%missing required posting fields%';
      v_err := SQLERRM;
    END;
    EXECUTE 'RESET ROLE';
    INSERT INTO matrix_result VALUES ('missing_required_blocked', v_ok, COALESCE(v_err, 'posted unexpectedly'));
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    INSERT INTO matrix_result VALUES ('missing_required_blocked', false, SQLERRM);
  END;

  -- 6. rejected draft cannot post
  PERFORM pg_temp.set_jwt('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'authenticated');
  BEGIN
    EXECUTE 'SET ROLE authenticated';
    SELECT c.id INTO v_rejected
      FROM public.create_agent_transaction_draft(
        '2026-08-31',
        '6917f121-36fa-45c6-820d-38e0349c4ed0',
        'Liron and Alon',
        'Management',
        'Tenant Payment',
        'Tenant',
        'Yossi',
        10.00,
        NULL,
        'to reject',
        NULL,
        'draft',
        'k-reject',
        'manual_form',
        1
      ) c;
    PERFORM * FROM public.reject_agent_transaction_draft(v_rejected);
    v_ok := false;
    BEGIN
      PERFORM * FROM public.approve_and_post_agent_transaction_draft(v_rejected);
    EXCEPTION WHEN OTHERS THEN
      v_ok := SQLERRM ILIKE '%rejected drafts cannot be posted%';
      v_err := SQLERRM;
    END;
    SELECT count(*) INTO v_count FROM finance.agent_transaction_drafts d WHERE d.id = v_rejected AND d.status = 'rejected';
    EXECUTE 'RESET ROLE';
    INSERT INTO matrix_result VALUES (
      'rejected_cannot_post',
      v_ok AND v_count = 1,
      COALESCE(v_err, format('rejected_rows=%s', v_count))
    );
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    INSERT INTO matrix_result VALUES ('rejected_cannot_post', false, SQLERRM);
  END;

  -- 7. staff can approve and post exactly once
  PERFORM pg_temp.set_jwt('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'authenticated');
  BEGIN
    EXECUTE 'SET ROLE authenticated';
    SELECT a.id, a.status, a.posted_transaction_id, a.reused_existing
      INTO v_id, v_status, v_posted, v_reused
      FROM public.approve_and_post_agent_transaction_draft(v_id) a;
    EXECUTE 'RESET ROLE';
    INSERT INTO matrix_result VALUES (
      'staff_can_post',
      v_status = 'posted' AND v_posted IS NOT NULL AND v_reused = false,
      format('status=%s tx=%s reused=%s', v_status, v_posted, v_reused)
    );
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    INSERT INTO matrix_result VALUES ('staff_can_post', false, SQLERRM);
  END;

  SELECT count(*) INTO v_count FROM public.transactions;
  INSERT INTO matrix_result VALUES (
    'exactly_one_new_transaction',
    v_count = 2,
    format('count=%s', v_count)
  );

  INSERT INTO matrix_result VALUES (
    'posted_transaction_id_matches',
    EXISTS (
      SELECT 1
      FROM public.transactions t
      WHERE t.id = v_posted
        AND t.date = DATE '2026-08-31'
        AND t.property_id = '6917f121-36fa-45c6-820d-38e0349c4ed0'
        AND t.property_name = 'Liron and Alon'
        AND t.category = 'Management'
        AND t.subcategory = 'Tenant Payment'
        AND t.payer = 'Tenant'
        AND t.payee = 'Yossi'
        AND t.amount_eur = 550.00
        AND t.client_charge IS NULL
    ),
    COALESCE(v_posted::text, 'null')
  );

  -- 8. replay returns the same transaction without a second insert
  PERFORM pg_temp.set_jwt('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'authenticated');
  BEGIN
    EXECUTE 'SET ROLE authenticated';
    SELECT a.posted_transaction_id, a.reused_existing
      INTO v_posted2, v_reused
      FROM public.approve_and_post_agent_transaction_draft(v_id) a;
    EXECUTE 'RESET ROLE';
    SELECT count(*) INTO v_count FROM public.transactions;
    INSERT INTO matrix_result VALUES (
      'replay_same_transaction',
      v_reused = true AND v_posted2 = v_posted AND v_count = 2,
      format('tx=%s reused=%s count=%s', v_posted2, v_reused, v_count)
    );
    INSERT INTO matrix_result VALUES (
      'posted_cannot_post_again',
      v_reused = true AND v_posted2 = v_posted AND v_count = 2,
      format('tx=%s reused=%s count=%s', v_posted2, v_reused, v_count)
    );
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    INSERT INTO matrix_result VALUES ('replay_same_transaction', false, SQLERRM);
    INSERT INTO matrix_result VALUES ('posted_cannot_post_again', false, SQLERRM);
  END;

  -- authenticated cannot insert into public.transactions directly
  PERFORM pg_temp.set_jwt('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'authenticated');
  BEGIN
    EXECUTE 'SET ROLE authenticated';
    v_ok := false;
    BEGIN
      INSERT INTO public.transactions (date, amount_eur, description)
      VALUES ('2026-08-31', 1, 'direct-insert-should-fail');
    EXCEPTION WHEN insufficient_privilege THEN
      v_ok := true;
      v_err := SQLERRM;
    WHEN OTHERS THEN
      v_ok := false;
      v_err := SQLERRM;
    END;
    EXECUTE 'RESET ROLE';
    INSERT INTO matrix_result VALUES ('authenticated_cannot_insert_transactions', v_ok, COALESCE(v_err, 'insert succeeded'));
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    INSERT INTO matrix_result VALUES ('authenticated_cannot_insert_transactions', false, SQLERRM);
  END;

  -- 9. posted draft cannot be edited
  PERFORM pg_temp.set_jwt('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'authenticated');
  BEGIN
    EXECUTE 'SET ROLE authenticated';
    v_ok := false;
    BEGIN
      PERFORM * FROM public.update_agent_transaction_draft(
        v_id, '2026-08-31', '6917f121-36fa-45c6-820d-38e0349c4ed0', 'Liron and Alon',
        'Management', 'Tenant Payment', 'Tenant', 'Yossi', 999, NULL, 'nope', NULL, 'draft'
      );
    EXCEPTION WHEN OTHERS THEN
      v_ok := SQLERRM ILIKE '%not editable%' OR SQLERRM ILIKE '%immutable%';
      v_err := SQLERRM;
    END;
    EXECUTE 'RESET ROLE';
    INSERT INTO matrix_result VALUES ('posted_cannot_edit', v_ok, COALESCE(v_err, 'edited unexpectedly'));
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    INSERT INTO matrix_result VALUES ('posted_cannot_edit', false, SQLERRM);
  END;

  SELECT d.created_by INTO v_created_by FROM finance.agent_transaction_drafts d WHERE d.id = v_id;
  INSERT INTO matrix_result VALUES (
    'created_by_preserved',
    v_created_by = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
    COALESCE(v_created_by::text, 'null')
  );

  SELECT md5(t.id::text || '|' || t.description)
    INTO v_err
    FROM public.transactions t
   WHERE t.id = '11111111-1111-1111-1111-111111111111';
  INSERT INTO matrix_result VALUES (
    'unrelated_fingerprint_unchanged',
    v_err = v_seed_fp,
    format('before=%s after=%s', v_seed_fp, v_err)
  );
END;
$$;

SELECT test_name, passed, detail
FROM matrix_result
ORDER BY test_name;
