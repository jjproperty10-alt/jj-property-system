-- Role matrix for Operations Core. Fail closed: any FAIL raises.

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

CREATE OR REPLACE FUNCTION pg_temp.record(p_name text, p_ok boolean, p_detail text)
RETURNS void
LANGUAGE sql
SET search_path = ''
AS $$
  INSERT INTO matrix_result VALUES (p_name, p_ok, COALESCE(p_detail, ''))
  ON CONFLICT (test_name) DO UPDATE SET passed = EXCLUDED.passed, detail = EXCLUDED.detail;
$$;

DO $$
DECLARE
  v_before text;
  v_after text;
  v_id uuid;
  v_status text;
  v_reused boolean;
  v_msg uuid;
  v_count integer;
  v_created_by uuid;
  v_err text;
  v_ok boolean;
  v_other uuid;
  v_task uuid;
  v_art uuid;
  v_appr uuid;
  v_hash text := repeat('ab', 32);
  v_snapshot text := repeat('ef', 32);
  v_wrong text := repeat('00', 32);
  v_hash2 text := repeat('cd', 32);
  v_long text;
BEGIN
  v_before := pg_temp.tx_fingerprint();

  -- 1. anon cannot execute
  PERFORM pg_temp.set_jwt(NULL, 'anon');
  BEGIN
    EXECUTE 'SET ROLE anon';
    v_ok := false;
    BEGIN
      PERFORM * FROM public.create_ops_conversation('web', 'k-anon', NULL);
    EXCEPTION WHEN insufficient_privilege THEN
      v_ok := true;
      v_err := SQLERRM;
    WHEN OTHERS THEN
      v_ok := false;
      v_err := SQLERRM;
    END;
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('anon_blocked_create', v_ok, COALESCE(v_err, 'no error'));
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('anon_blocked_create', false, SQLERRM);
  END;

  -- 2. authenticated non-staff cannot execute
  PERFORM pg_temp.set_jwt('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid, 'authenticated');
  BEGIN
    EXECUTE 'SET ROLE authenticated';
    v_ok := false;
    BEGIN
      PERFORM * FROM public.create_ops_conversation('web', 'k-partner', NULL);
    EXCEPTION WHEN insufficient_privilege THEN
      v_ok := true;
      v_err := SQLERRM;
    WHEN OTHERS THEN
      v_ok := SQLERRM ILIKE '%not authorized%' OR SQLERRM ILIKE '%42501%';
      v_err := SQLERRM;
    END;
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('non_staff_blocked_create', v_ok, COALESCE(v_err, 'no error'));
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('non_staff_blocked_create', false, SQLERRM);
  END;

  -- 2b. service_role cannot execute user RPCs
  PERFORM pg_temp.set_jwt('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'service_role');
  BEGIN
    EXECUTE 'SET ROLE service_role';
    v_ok := false;
    BEGIN
      PERFORM * FROM public.create_ops_conversation('web', 'k-service', NULL);
    EXCEPTION WHEN insufficient_privilege THEN
      v_ok := true;
      v_err := SQLERRM;
    WHEN OTHERS THEN
      v_ok := false;
      v_err := SQLERRM;
    END;
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('service_role_blocked_create', v_ok, COALESCE(v_err, 'no error'));
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('service_role_blocked_create', false, SQLERRM);
  END;

  -- 3. inactive staff cannot execute
  PERFORM pg_temp.set_jwt('cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid, 'authenticated');
  BEGIN
    EXECUTE 'SET ROLE authenticated';
    v_ok := false;
    BEGIN
      PERFORM * FROM public.create_ops_conversation('web', 'k-inactive', NULL);
    EXCEPTION WHEN OTHERS THEN
      v_ok := SQLERRM ILIKE '%not authorized%' OR SQLERRM ILIKE '%42501%';
      v_err := SQLERRM;
    END;
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('inactive_staff_blocked_create', v_ok, COALESCE(v_err, 'no error'));
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('inactive_staff_blocked_create', false, SQLERRM);
  END;

  -- 4. active staff can create a web conversation; created_by = auth.uid()
  PERFORM pg_temp.set_jwt('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'authenticated');
  BEGIN
    EXECUTE 'SET ROLE authenticated';
    SELECT c.id, c.status, c.reused_existing
      INTO v_id, v_status, v_reused
      FROM public.create_ops_conversation('web', 'k-staff-web', NULL) c;
    EXECUTE 'RESET ROLE';
    SELECT conv.created_by INTO v_created_by
      FROM finance.ops_conversations conv
     WHERE conv.id = v_id;
    PERFORM pg_temp.record(
      'staff_can_create_conversation',
      v_id IS NOT NULL AND v_status = 'open' AND v_reused = false
        AND v_created_by = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
      format('id=%s status=%s reused=%s created_by=%s', v_id, v_status, v_reused, v_created_by)
    );
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('staff_can_create_conversation', false, SQLERRM);
  END;

  -- 5. same idempotency key reuses one conversation
  PERFORM pg_temp.set_jwt('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'authenticated');
  BEGIN
    EXECUTE 'SET ROLE authenticated';
    SELECT c.id, c.reused_existing
      INTO v_other, v_reused
      FROM public.create_ops_conversation('web', 'k-staff-web', NULL) c;
    EXECUTE 'RESET ROLE';
    SELECT count(*) INTO v_count FROM finance.ops_conversations;
    PERFORM pg_temp.record(
      'idempotent_conversation_reuse',
      v_other = v_id AND v_reused = true AND v_count = 1,
      format('id=%s reused=%s count=%s', v_other, v_reused, v_count)
    );
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('idempotent_conversation_reuse', false, SQLERRM);
  END;

  -- 6. append inbound message
  PERFORM pg_temp.set_jwt('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'authenticated');
  BEGIN
    EXECUTE 'SET ROLE authenticated';
    SELECT m.id, m.reused_existing
      INTO v_msg, v_reused
      FROM public.append_ops_inbound_message(v_id, 'שילמתי 550 ללירון', 'k-msg-1', NULL) m;
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record(
      'staff_can_append_inbound',
      v_msg IS NOT NULL AND v_reused = false,
      format('id=%s reused=%s', v_msg, v_reused)
    );
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('staff_can_append_inbound', false, SQLERRM);
  END;

  -- 7. duplicate message idempotency
  PERFORM pg_temp.set_jwt('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'authenticated');
  BEGIN
    EXECUTE 'SET ROLE authenticated';
    SELECT m.id, m.reused_existing
      INTO v_other, v_reused
      FROM public.append_ops_inbound_message(v_id, 'שילמתי 550 ללירון', 'k-msg-1', NULL) m;
    EXECUTE 'RESET ROLE';
    SELECT count(*) INTO v_count FROM finance.ops_messages;
    PERFORM pg_temp.record(
      'idempotent_message_reuse',
      v_other = v_msg AND v_reused = true AND v_count = 1,
      format('id=%s reused=%s count=%s', v_other, v_reused, v_count)
    );
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('idempotent_message_reuse', false, SQLERRM);
  END;

  -- 8. body over 2000 rejected
  v_long := repeat('x', 2001);
  PERFORM pg_temp.set_jwt('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'authenticated');
  BEGIN
    EXECUTE 'SET ROLE authenticated';
    v_ok := false;
    BEGIN
      PERFORM * FROM public.append_ops_inbound_message(v_id, v_long, 'k-msg-long', NULL);
    EXCEPTION WHEN OTHERS THEN
      v_ok := SQLERRM ILIKE '%2000%' OR SQLERRM ILIKE '%check_violation%';
      v_err := SQLERRM;
    END;
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('body_over_2000_rejected', v_ok, COALESCE(v_err, 'no error'));
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('body_over_2000_rejected', false, SQLERRM);
  END;

  -- 9. other staff cannot list or append
  PERFORM pg_temp.set_jwt('dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid, 'authenticated');
  BEGIN
    EXECUTE 'SET ROLE authenticated';
    v_ok := false;
    BEGIN
      PERFORM * FROM public.list_ops_conversation(v_id);
    EXCEPTION WHEN OTHERS THEN
      v_ok := SQLERRM ILIKE '%not authorized%' OR SQLERRM ILIKE '%42501%';
      v_err := SQLERRM;
    END;
    BEGIN
      PERFORM * FROM public.append_ops_inbound_message(v_id, 'hijack', 'k-msg-hijack', NULL);
    EXCEPTION WHEN OTHERS THEN
      v_ok := v_ok AND (SQLERRM ILIKE '%not authorized%' OR SQLERRM ILIKE '%42501%');
      v_err := v_err || ' | ' || SQLERRM;
    END;
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('cross_staff_conversation_blocked', v_ok, COALESCE(v_err, 'no error'));
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('cross_staff_conversation_blocked', false, SQLERRM);
  END;

  -- 10. owner can list
  PERFORM pg_temp.set_jwt('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'authenticated');
  BEGIN
    EXECUTE 'SET ROLE authenticated';
    SELECT l.conversation_id, l.status INTO v_other, v_status
      FROM public.list_ops_conversation(v_id) l;
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record(
      'owner_can_list_conversation',
      v_other = v_id AND v_status = 'open',
      format('id=%s status=%s', v_other, v_status)
    );
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('owner_can_list_conversation', false, SQLERRM);
  END;

  -- 11. audit UPDATE blocked
  BEGIN
    v_ok := false;
    UPDATE finance.ops_audit_events SET event_type = 'tamper' WHERE conversation_id = v_id;
    v_err := 'update succeeded';
  EXCEPTION WHEN OTHERS THEN
    v_ok := SQLERRM ILIKE '%forbids UPDATE%' OR SQLERRM ILIKE '%restrict_violation%';
    v_err := SQLERRM;
  END;
  PERFORM pg_temp.record('audit_update_blocked', v_ok, COALESCE(v_err, 'no error'));

  -- 12. audit DELETE blocked
  BEGIN
    v_ok := false;
    DELETE FROM finance.ops_audit_events WHERE conversation_id = v_id;
    v_err := 'delete succeeded';
  EXCEPTION WHEN OTHERS THEN
    v_ok := SQLERRM ILIKE '%forbids physical DELETE%' OR SQLERRM ILIKE '%restrict_violation%';
    v_err := SQLERRM;
  END;
  PERFORM pg_temp.record('audit_delete_blocked', v_ok, COALESCE(v_err, 'no error'));

  -- 13. task/artifact/approval: distinct hashes, consume, replay, wrong hash
  PERFORM pg_temp.set_jwt('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'authenticated');
  BEGIN
    INSERT INTO finance.ops_tasks (
      conversation_id, capability_type, status, input_payload, idempotency_key, created_by
    ) VALUES (
      v_id, 'transaction_draft', 'received', '{}'::jsonb, 'k-task-1',
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid
    ) RETURNING id INTO v_task;

    INSERT INTO finance.ops_artifacts (
      task_id, artifact_type, status, payload, content_hash, version, sensitivity, created_by
    ) VALUES (
      v_task, 'transaction_draft_preview', 'prepared', '{}'::jsonb, v_hash, 1, 'internal',
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid
    ) RETURNING id INTO v_art;

    INSERT INTO finance.ops_approvals (
      task_id, artifact_id, action_type, status, snapshot_hash,
      bound_artifact_version, bound_content_hash, policy_version,
      nonce, idempotency_key, expires_at
    ) VALUES (
      v_task, v_art, 'create_transaction_draft', 'pending', v_snapshot,
      1, v_hash, 'ops-approval-v1',
      gen_random_uuid(), 'k-appr-1', now() + interval '1 hour'
    ) RETURNING id INTO v_appr;

    PERFORM pg_temp.record(
      'artifact_and_snapshot_hashes_differ',
      v_snapshot IS DISTINCT FROM v_hash AND length(v_snapshot) = 64 AND length(v_hash) = 64,
      format('snapshot=%s content=%s', left(v_snapshot, 8), left(v_hash, 8))
    );

    SELECT c.status, c.reused_existing INTO v_status, v_reused
      FROM finance.consume_ops_approval(v_appr, v_snapshot) c;
    PERFORM pg_temp.record(
      'consume_with_expected_snapshot_hash',
      v_status = 'consumed' AND v_reused = false,
      format('status=%s reused=%s', v_status, v_reused)
    );

    SELECT c.status, c.reused_existing INTO v_status, v_reused
      FROM finance.consume_ops_approval(v_appr, v_snapshot) c;
    PERFORM pg_temp.record(
      'approval_replay_idempotent',
      v_status = 'consumed' AND v_reused = true,
      format('status=%s reused=%s', v_status, v_reused)
    );
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.record('artifact_and_snapshot_hashes_differ', false, SQLERRM);
    PERFORM pg_temp.record('consume_with_expected_snapshot_hash', false, SQLERRM);
    PERFORM pg_temp.record('approval_replay_idempotent', false, SQLERRM);
  END;

  BEGIN
    v_ok := false;
    BEGIN
      PERFORM * FROM finance.consume_ops_approval(v_appr, v_wrong);
    EXCEPTION WHEN OTHERS THEN
      v_ok := SQLERRM ILIKE '%snapshot hash mismatch%' OR SQLERRM ILIKE '%restrict_violation%';
      v_err := SQLERRM;
    END;
    PERFORM pg_temp.record('wrong_snapshot_hash_rejected', v_ok, COALESCE(v_err, 'no error'));
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.record('wrong_snapshot_hash_rejected', false, SQLERRM);
  END;

  -- 14. authenticated cannot execute private consume
  PERFORM pg_temp.set_jwt('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'authenticated');
  BEGIN
    EXECUTE 'SET ROLE authenticated';
    v_ok := false;
    BEGIN
      PERFORM * FROM finance.consume_ops_approval(v_appr, v_snapshot);
    EXCEPTION WHEN insufficient_privilege THEN
      v_ok := true;
      v_err := SQLERRM;
    WHEN OTHERS THEN
      v_ok := SQLERRM ILIKE '%permission denied%';
      v_err := SQLERRM;
    END;
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('authenticated_blocked_consume', v_ok, COALESCE(v_err, 'no error'));
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('authenticated_blocked_consume', false, SQLERRM);
  END;

  -- 15. immutable approved artifact snapshot
  BEGIN
    UPDATE finance.ops_artifacts SET status = 'approved' WHERE id = v_art;
    v_ok := false;
    BEGIN
      UPDATE finance.ops_artifacts
         SET payload = '{"x":1}'::jsonb, content_hash = v_hash2
       WHERE id = v_art;
      v_err := 'artifact update succeeded';
    EXCEPTION WHEN OTHERS THEN
      v_ok := SQLERRM ILIKE '%immutable%' OR SQLERRM ILIKE '%restrict_violation%';
      v_err := SQLERRM;
    END;
    PERFORM pg_temp.record('approved_artifact_immutable', v_ok, COALESCE(v_err, 'no error'));
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.record('approved_artifact_immutable', false, SQLERRM);
  END;

  -- 16. invalid task transition rejected
  BEGIN
    v_ok := false;
    UPDATE finance.ops_tasks SET status = 'completed' WHERE id = v_task;
    v_err := 'invalid transition succeeded';
  EXCEPTION WHEN OTHERS THEN
    v_ok := SQLERRM ILIKE '%invalid status transition%' OR SQLERRM ILIKE '%check_violation%';
    v_err := SQLERRM;
  END;
  PERFORM pg_temp.record('invalid_task_transition_rejected', v_ok, COALESCE(v_err, 'no error'));

  -- 17. non-web channel rejected on public RPC
  PERFORM pg_temp.set_jwt('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'authenticated');
  BEGIN
    EXECUTE 'SET ROLE authenticated';
    v_ok := false;
    BEGIN
      PERFORM * FROM public.create_ops_conversation('whatsapp', 'k-wa', NULL);
    EXCEPTION WHEN OTHERS THEN
      v_ok := SQLERRM ILIKE '%web channel%' OR SQLERRM ILIKE '%check_violation%';
      v_err := SQLERRM;
    END;
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('non_web_channel_rejected', v_ok, COALESCE(v_err, 'no error'));
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('non_web_channel_rejected', false, SQLERRM);
  END;

  -- 18. public.transactions unchanged
  v_after := pg_temp.tx_fingerprint();
  SELECT count(*) INTO v_count FROM public.transactions;
  PERFORM pg_temp.record(
    'transactions_unchanged',
    v_after = v_before AND v_count = 1,
    format('before=%s after=%s count=%s', v_before, v_after, v_count)
  );
END;
$$;

SELECT test_name, passed, detail
  FROM matrix_result
 ORDER BY test_name;

DO $$
DECLARE
  v_failed integer;
BEGIN
  SELECT count(*) INTO v_failed FROM matrix_result WHERE passed IS NOT TRUE;
  IF v_failed > 0 THEN
    RAISE EXCEPTION 'ROLE_MATRIX_FAIL count=%', v_failed;
  END IF;
END;
$$;
