-- Assertions after 20261002150000 replaces the finance reader.
-- Fail closed: any failed row is reported by the runner.

CREATE TEMP TABLE matrix_result (
  test_name text PRIMARY KEY,
  passed boolean NOT NULL,
  detail text NOT NULL
);

CREATE OR REPLACE FUNCTION pg_temp.record(p_name text, p_ok boolean, p_detail text)
RETURNS void
LANGUAGE sql
AS $$
  INSERT INTO pg_temp.matrix_result VALUES (p_name, p_ok, COALESCE(p_detail, ''))
  ON CONFLICT (test_name) DO UPDATE SET passed = EXCLUDED.passed, detail = EXCLUDED.detail;
$$;

DO $m$
DECLARE
  v_seq jsonb;
  v_before jsonb;
  v_single jsonb;
  v_chain jsonb;
  v_cash jsonb;
  v_guard jsonb;
  v_wrap jsonb;
  v_staff jsonb;
  v_err text;
  v_ok boolean;
  v_old jsonb;
BEGIN
  SELECT payload INTO v_old FROM public.test_oracle WHERE label = 'sequence_after_cash';
  PERFORM pg_temp.record(
    'previous_reader_saw_latest_cert_only',
    (v_old->>'certified_opening_due_to_jj')::numeric = -720
      AND (v_old->>'certified_remaining_due_to_jj')::numeric = -720
      AND (v_old->>'cash_allocation_signed_total')::numeric = 0
      AND jsonb_array_length(v_old->'cash_executions') = 0
      AND (v_old->'certification'->>'id') = 'c1000000-0000-4000-8000-0000000000b1',
    v_old->>'certified_remaining_due_to_jj'
  );

  v_seq := finance.read_certified_client_settlement(
    '11111111-1111-4111-8111-111111111111', '2026-10-02'
  );
  v_wrap := public.read_certified_client_settlement(
    '11111111-1111-4111-8111-111111111111', '2026-10-02'
  );

  PERFORM pg_temp.record(
    'sequence_after_cash_is_518_75_in_client_favour',
    (v_seq->>'unavailable') = 'false'
      AND (v_seq->>'certified_opening_due_to_jj')::numeric = -3968.75
      AND (v_seq->>'fifo_credits_total')::numeric = 0
      AND (v_seq->>'certified_closing_due_to_jj')::numeric = -3968.75
      AND (v_seq->>'cash_allocation_signed_total')::numeric = -3450
      AND (v_seq->>'certified_remaining_due_to_jj')::numeric = -518.75
      AND (v_seq->>'remaining_r')::numeric = 518.75
      AND (v_seq->>'remaining_s')::numeric = -518.75
      AND (v_seq->'certification'->>'id') = 'c1000000-0000-4000-8000-0000000000b1'
      AND (v_seq->>'certification_as_of') = '2026-09-17'
      AND jsonb_array_length(v_seq->'lines') = 4
      AND jsonb_array_length(v_seq->'cash_executions') = 1
      AND (v_seq->'lines'->0->>'line_order')::int = 1
      AND (v_seq->'lines'->1->>'line_order')::int = 2
      AND (v_seq->'lines'->2->>'line_order')::int = 3
      AND (v_seq->'lines'->3->>'line_order')::int = 4
      AND (v_seq->'lines'->0->>'certification_id') = 'c1000000-0000-4000-8000-0000000000a1'
      AND (v_seq->'lines'->2->>'certification_id') = 'c1000000-0000-4000-8000-0000000000b1'
      AND jsonb_array_length(v_seq->'owner_level_obligations') = 1
      AND (v_seq->'owner_level_obligations'->0->>'amount_due_to_jj')::numeric = 10000
      AND (v_seq->'owner_level_obligations'->0->>'id') = '01000000-0000-4000-8000-000000000001',
    v_seq->>'certified_remaining_due_to_jj'
  );

  PERFORM pg_temp.record(
    'public_wrapper_matches_finance_reader',
    v_wrap = v_seq,
    'wrapper'
  );

  PERFORM pg_temp.record(
    'partner_funding_event_not_added_twice',
    (SELECT count(*) FROM finance.partner_funding_events) = 1
      AND (SELECT client_cash_execution_id IS NULL FROM finance.partner_funding_events) = true
      AND (v_seq->>'cash_allocation_signed_total')::numeric = -3450
      AND position('partner_funding_events' in pg_get_functiondef(
        'finance.read_certified_client_settlement(uuid,date)'::regprocedure
      )) = 0,
    'once'
  );

  v_before := finance.read_certified_client_settlement(
    '11111111-1111-4111-8111-111111111111', '2026-09-24'
  );
  PERFORM pg_temp.record(
    'before_cash_date_is_3968_75_in_client_favour',
    (v_before->>'certified_opening_due_to_jj')::numeric = -3968.75
      AND (v_before->>'cash_allocation_signed_total')::numeric = 0
      AND (v_before->>'certified_remaining_due_to_jj')::numeric = -3968.75
      AND (v_before->>'remaining_r')::numeric = 3968.75
      AND jsonb_array_length(v_before->'cash_executions') = 0,
    v_before->>'certified_remaining_due_to_jj'
  );

  PERFORM pg_temp.record(
    'as_of_after_owner_level_before_second_cert',
    (
      finance.read_certified_client_settlement(
        '11111111-1111-4111-8111-111111111111', '2026-09-16'
      )->>'certified_remaining_due_to_jj'
    )::numeric = -3248.75,
    'running -3248.75'
  );

  PERFORM pg_temp.record(
    'second_cert_included_on_its_as_of',
    (
      finance.read_certified_client_settlement(
        '11111111-1111-4111-8111-111111111111', '2026-09-17'
      )->>'certified_remaining_due_to_jj'
    )::numeric = -3968.75,
    'running -3968.75'
  );

  PERFORM pg_temp.record(
    'void_and_future_owner_level_excluded',
    (v_seq->>'certified_opening_due_to_jj')::numeric = -3968.75,
    'no +999 void, no +50 future, no -111 void cert'
  );

  -- Reversal of the 3450 execution. Offset allocation, same effective date.
  INSERT INTO finance.client_cash_settlement_executions (
    id, entity_id, direction, amount, effective_date, transaction_id, owner_link_id,
    preview_hash, canonical_snapshot, idempotency_key, reversal_of, actor, created_at
  ) VALUES (
    'e1000000-0000-4000-8000-000000000002',
    '11111111-1111-4111-8111-111111111111',
    'JJ_TO_CLIENT', 3450.00, '2026-09-25',
    '71000000-0000-4000-8000-000000000011',
    '81000000-0000-4000-8000-000000000011',
    'hash-rev', '{}'::jsonb, 'k-exec-rev',
    'e1000000-0000-4000-8000-000000000001',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '2026-09-25 13:00:00+00'
  );
  INSERT INTO finance.client_obligation_fifo_allocations (
    id, execution_id, certification_line_id, property_id, sequence_no, signed_amount, allocated_amount
  ) VALUES (
    'f1000000-0000-4000-8000-000000000002',
    'e1000000-0000-4000-8000-000000000002',
    'c2000000-0000-4000-8000-0000000000a1',
    '55555555-5555-4555-8555-555555555551',
    1, 3450.00, 3450.00
  );

  v_seq := finance.read_certified_client_settlement(
    '11111111-1111-4111-8111-111111111111', '2026-10-02'
  );
  PERFORM pg_temp.record(
    'reversal_restores_pre_execution_amount',
    (v_seq->>'certified_remaining_due_to_jj')::numeric = -3968.75
      AND (v_seq->>'remaining_r')::numeric = 3968.75
      AND (v_seq->>'cash_allocation_signed_total')::numeric = 0
      AND (v_seq->>'certified_opening_due_to_jj')::numeric = -3968.75
      AND jsonb_array_length(v_seq->'cash_executions') = 2,
    v_seq->>'certified_remaining_due_to_jj'
  );

  v_before := finance.read_certified_client_settlement(
    '11111111-1111-4111-8111-111111111111', '2026-09-24'
  );
  PERFORM pg_temp.record(
    'reversal_does_not_apply_before_its_date',
    (v_before->>'certified_remaining_due_to_jj')::numeric = -3968.75
      AND (v_before->>'cash_allocation_signed_total')::numeric = 0
      AND jsonb_array_length(v_before->'cash_executions') = 0,
    v_before->>'cash_allocation_signed_total'
  );

  SELECT payload INTO v_old FROM public.test_oracle WHERE label = 'single_cert';
  v_single := finance.read_certified_client_settlement(
    '22222222-2222-4222-8222-222222222222', '2026-10-02'
  );
  PERFORM pg_temp.record(
    'single_cert_payload_unchanged',
    v_single = v_old
      AND (v_single->>'certified_opening_due_to_jj')::numeric = 1234.56
      AND (v_single->>'fifo_credits_total')::numeric = 10
      AND (v_single->>'certified_closing_due_to_jj')::numeric = 1224.56
      AND (v_single->>'certified_remaining_due_to_jj')::numeric = 1224.56
      AND jsonb_array_length(v_single->'lines') = 1
      AND jsonb_array_length(v_single->'exclusions') = 1
      AND jsonb_array_length(v_single->'cash_executions') = 0,
    'single'
  );

  SELECT payload INTO v_old FROM public.test_oracle WHERE label = 'version_chain';
  v_chain := finance.read_certified_client_settlement(
    '33333333-3333-4333-8333-333333333333', '2026-10-02'
  );
  PERFORM pg_temp.record(
    'version_chain_payload_unchanged',
    v_chain = v_old
      AND (v_chain->>'certified_opening_due_to_jj')::numeric = 880.40
      AND (v_chain->>'certified_remaining_due_to_jj')::numeric = 880.40
      AND (v_chain->'certification'->>'id') = 'c1000000-0000-4000-8000-0000000000d3'
      AND (v_chain->'certification'->>'version')::int = 3
      AND jsonb_array_length(v_chain->'lines') = 1,
    v_chain->>'certified_opening_due_to_jj'
  );

  SELECT payload INTO v_old FROM public.test_oracle WHERE label = 'single_cash';
  v_cash := finance.read_certified_client_settlement(
    '44444444-4444-4444-8444-444444444444', '2026-10-02'
  );
  PERFORM pg_temp.record(
    'single_cash_payload_unchanged',
    v_cash = v_old
      AND (v_cash->>'certified_opening_due_to_jj')::numeric = -2000
      AND (v_cash->>'cash_allocation_signed_total')::numeric = -400
      AND (v_cash->>'certified_remaining_due_to_jj')::numeric = -1600
      AND (v_cash->>'remaining_r')::numeric = 1600,
    v_cash->>'certified_remaining_due_to_jj'
  );

  SELECT payload INTO v_old FROM public.test_oracle WHERE label = 'supersede_guard';
  v_guard := finance.read_certified_client_settlement(
    '66666666-6666-4666-8666-666666666666', '2026-10-02'
  );
  PERFORM pg_temp.record(
    'applied_successor_excludes_predecessor',
    v_guard = v_old
      AND (v_guard->>'certified_opening_due_to_jj')::numeric = 40
      AND (v_guard->'certification'->>'id') = 'c1000000-0000-4000-8000-0000000000f2'
      AND jsonb_array_length(v_guard->'lines') = 1
      AND (v_guard->'lines'->0->>'amount_due_to_jj')::numeric = 40,
    v_guard->>'certified_opening_due_to_jj'
  );

  PERFORM pg_temp.record(
    'company_a_payload_has_no_company_b_certification',
    position('c1000000-0000-4000-8000-0000000000c1' in v_seq::text) = 0
      AND position('22222222-2222-4222-8222-222222222222' in v_seq::text) = 0
      AND (
        SELECT company_id FROM public.test_entity_company
        WHERE entity_id = '22222222-2222-4222-8222-222222222222'
      ) = 'b0000000-0000-4000-8000-00000000000b',
    'entity scope'
  );

  PERFORM pg_temp.record(
    'signature_security_and_grants_unchanged',
    has_function_privilege('service_role', 'finance.read_certified_client_settlement(uuid,date)', 'EXECUTE')
      AND NOT has_function_privilege('anon', 'finance.read_certified_client_settlement(uuid,date)', 'EXECUTE')
      AND NOT has_function_privilege('authenticated', 'finance.read_certified_client_settlement(uuid,date)', 'EXECUTE')
      AND NOT has_function_privilege('company_b_reader', 'finance.read_certified_client_settlement(uuid,date)', 'EXECUTE')
      AND has_function_privilege('service_role', 'public.read_certified_client_settlement(uuid,date)', 'EXECUTE')
      AND NOT has_function_privilege('anon', 'public.read_certified_client_settlement(uuid,date)', 'EXECUTE')
      AND NOT has_function_privilege('authenticated', 'public.read_certified_client_settlement(uuid,date)', 'EXECUTE')
      AND has_function_privilege('authenticated', 'public.read_client_settlement_balance(uuid,date)', 'EXECUTE')
      AND NOT has_function_privilege('anon', 'public.read_client_settlement_balance(uuid,date)', 'EXECUTE')
      AND NOT has_function_privilege('service_role', 'public.read_client_settlement_balance(uuid,date)', 'EXECUTE')
      AND pg_get_functiondef('public.read_certified_client_settlement(uuid,date)'::regprocedure)
            = (SELECT value FROM public.test_meta WHERE key = 'wrapper_def')
      AND pg_get_functiondef('public.read_client_settlement_balance(uuid,date)'::regprocedure)
            = (SELECT value FROM public.test_meta WHERE key = 'balance_def')
      AND (
        SELECT r.rolname
        FROM pg_proc p
        JOIN pg_roles r ON r.oid = p.proowner
        WHERE p.oid = 'finance.read_certified_client_settlement(uuid,date)'::regprocedure
      ) = (SELECT value FROM public.test_meta WHERE key = 'finance_owner')
      AND (
        SELECT p.prosecdef::text || '|' || p.provolatile::text || '|' || COALESCE(p.proconfig::text, '')
        FROM pg_proc p
        WHERE p.oid = 'finance.read_certified_client_settlement(uuid,date)'::regprocedure
      ) = (SELECT value FROM public.test_meta WHERE key = 'finance_flags')
      AND (
        SELECT p.prosecdef AND p.provolatile = 's' AND p.proconfig::text LIKE '%search_path=%'
        FROM pg_proc p
        WHERE p.oid = 'finance.read_certified_client_settlement(uuid,date)'::regprocedure
      ),
    (SELECT value FROM public.test_meta WHERE key = 'finance_flags')
  );
END;
$m$;

DO $roles$
DECLARE
  v_err text;
  v_ok boolean;
  v_staff jsonb;
BEGIN
  v_ok := false;
  v_err := 'NO ERROR';
  BEGIN
    EXECUTE 'SET ROLE anon';
    PERFORM public.read_certified_client_settlement(
      '11111111-1111-4111-8111-111111111111', '2026-10-02'
    );
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    v_ok := v_err ILIKE '%permission denied%';
  END;
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.record('anon_public_read_denied', v_ok, v_err);

  v_ok := false;
  v_err := 'NO ERROR';
  BEGIN
    EXECUTE 'SET ROLE anon';
    PERFORM finance.read_certified_client_settlement(
      '11111111-1111-4111-8111-111111111111', '2026-10-02'
    );
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    v_ok := v_err ILIKE '%permission denied%';
  END;
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.record('anon_finance_read_denied', v_ok, v_err);

  v_ok := false;
  v_err := 'NO ERROR';
  BEGIN
    EXECUTE 'SET ROLE anon';
    PERFORM count(*) FROM finance.client_settlement_certifications;
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    v_ok := v_err ILIKE '%permission denied%';
  END;
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.record('anon_table_select_denied', v_ok, v_err);

  v_ok := false;
  v_err := 'NO ERROR';
  BEGIN
    EXECUTE 'SET ROLE company_b_reader';
    PERFORM public.read_certified_client_settlement(
      '11111111-1111-4111-8111-111111111111', '2026-10-02'
    );
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    v_ok := v_err ILIKE '%permission denied%';
  END;
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.record('other_company_role_cannot_execute', v_ok, v_err);

  v_ok := false;
  v_err := 'NO ERROR';
  BEGIN
    EXECUTE 'SET ROLE company_b_reader';
    PERFORM count(*) FROM finance.client_owner_level_obligations;
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    v_ok := v_err ILIKE '%permission denied%';
  END;
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.record('other_company_role_cannot_select_obligations', v_ok, v_err);

  v_ok := false;
  v_err := 'NO ERROR';
  BEGIN
    EXECUTE 'SET ROLE authenticated';
    PERFORM finance.read_certified_client_settlement(
      '11111111-1111-4111-8111-111111111111', '2026-10-02'
    );
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    v_ok := v_err ILIKE '%permission denied%';
  END;
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.record('authenticated_finance_read_denied', v_ok, v_err);

  PERFORM set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', false);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', false);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'role', 'authenticated')::text,
    false
  );
  v_ok := false;
  v_err := 'NO ERROR';
  BEGIN
    EXECUTE 'SET ROLE authenticated';
    PERFORM public.read_client_settlement_balance(
      '11111111-1111-4111-8111-111111111111', '2026-10-02'
    );
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    v_ok := v_err ILIKE '%jj_auth%' OR v_err ILIKE '%not permitted%';
  END;
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.record('balance_still_rejects_disallowed_staff_role', v_ok, v_err);

  PERFORM set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', false);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'role', 'authenticated')::text,
    false
  );
  BEGIN
    EXECUTE 'SET ROLE authenticated';
    v_staff := public.read_client_settlement_balance(
      '11111111-1111-4111-8111-111111111111', '2026-10-02'
    );
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record(
      'staff_balance_returns_fixed_value',
      (v_staff->>'certified_remaining_due_to_jj')::numeric = -3968.75
        AND (v_staff->>'remaining_r')::numeric = 3968.75
        AND v_staff = finance.read_certified_client_settlement(
          '11111111-1111-4111-8111-111111111111', '2026-10-02'
        ),
      v_staff->>'certified_remaining_due_to_jj'
    );
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('staff_balance_returns_fixed_value', false, SQLERRM);
  END;

  BEGIN
    EXECUTE 'SET ROLE service_role';
    v_staff := public.read_certified_client_settlement(
      '22222222-2222-4222-8222-222222222222', '2026-10-02'
    );
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record(
      'service_role_reads_other_company_entity_only',
      (v_staff->>'certified_opening_due_to_jj')::numeric = 1234.56
        AND (v_staff->'certification'->>'entity_id') = '22222222-2222-4222-8222-222222222222'
        AND position('11111111-1111-4111-8111-111111111111' in v_staff::text) = 0,
      v_staff->>'certified_opening_due_to_jj'
    );
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('service_role_reads_other_company_entity_only', false, SQLERRM);
  END;

  v_ok := false;
  v_err := 'NO ERROR';
  BEGIN
    PERFORM finance.read_certified_client_settlement(NULL::uuid, '2026-10-02');
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    v_ok := v_err ILIKE '%entity_id must be a UUID%';
  END;
  PERFORM pg_temp.record('null_entity_still_rejected', v_ok, v_err);

  v_ok := false;
  v_err := 'NO ERROR';
  BEGIN
    PERFORM finance.read_certified_client_settlement(
      '11111111-1111-4111-8111-111111111111', NULL::date
    );
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    v_ok := v_err ILIKE '%as_of must be a date%';
  END;
  PERFORM pg_temp.record('null_as_of_still_rejected', v_ok, v_err);
END;
$roles$;

SELECT test_name, passed, detail FROM pg_temp.matrix_result ORDER BY test_name;
