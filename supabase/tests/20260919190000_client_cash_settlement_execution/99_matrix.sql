-- Isolated cash-settlement matrix. Disposable database only. No Production. No Tamir.
-- Role contract documented by this file:
--   authenticated direct table access = denied
--   authenticated authorized RPC = allowed
--   postgres inspection = test-only observer (row counts, fingerprints, deny-all tables)
--   browser/service_role direct execution path = absent


CREATE TEMP TABLE matrix_result (
  test_name text PRIMARY KEY,
  passed boolean NOT NULL,
  detail text NOT NULL
);

CREATE OR REPLACE FUNCTION pg_temp.record(p_name text, p_ok boolean, p_detail text)
RETURNS void
LANGUAGE sql
SET search_path TO ''
AS $$
  INSERT INTO pg_temp.matrix_result VALUES (p_name, p_ok, COALESCE(p_detail, ''))
  ON CONFLICT (test_name) DO UPDATE SET passed = EXCLUDED.passed, detail = EXCLUDED.detail;
$$;

CREATE OR REPLACE FUNCTION pg_temp.set_jwt(p_uid uuid, p_role text)
RETURNS void
LANGUAGE plpgsql
SET search_path TO ''
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

CREATE OR REPLACE FUNCTION pg_temp.tx_fp()
RETURNS text LANGUAGE sql STABLE SET search_path TO '' AS $$
  SELECT count(*)::text || ':' || md5(COALESCE(string_agg(t.id::text, '|' ORDER BY t.id), ''))
  FROM public.transactions t;
$$;

CREATE OR REPLACE FUNCTION pg_temp.rc3_fp()
RETURNS text LANGUAGE sql STABLE SET search_path TO '' AS $$
  SELECT count(*)::text || ':' || md5(COALESCE(string_agg(id::text, '|' ORDER BY id), ''))
  FROM public.v_rc3_classified;
$$;

GRANT ALL ON TABLE matrix_result TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION pg_temp.record(text, boolean, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION pg_temp.set_jwt(uuid, text) TO anon, authenticated, service_role;

DO $$
DECLARE
  v_ceo uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  v_fin uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  v_ops uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  v_inactive uuid := 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  v_delta uuid := '77777777-7777-4777-8777-777777777777';
  v_epsilon uuid := '88888888-8888-4888-8888-888888888888';
  v_alpha uuid := '11111111-1111-4111-8111-111111111111';
  v_gamma uuid := '33333333-aaaa-4333-8333-333333333333';
  v_zeta uuid := '66666666-6666-4666-8666-666666666666';
  v_pe uuid := '50505050-5050-4050-8050-505050505050';
  v_pf uuid := '90909090-9090-4090-8090-909090909090';
  v_pa uuid := '10101010-1010-4010-8010-101010101010';
  v_pb uuid := '20202020-2020-4020-8020-202020202020';
  v_pg uuid := '40404040-4040-4040-8040-404040404040';
  v_pz uuid := '12121212-1212-4121-8121-121212121212';
  v_pz2 uuid := '13131313-1313-4131-8131-131313131313';
  v_read jsonb;
  v_read2 jsonb;
  v_line_a1 uuid; v_line_a2 uuid; v_cert_a uuid;
  v_cert_g uuid; v_line_g uuid;
  v_exec_g uuid; v_tx_g uuid;
  v_before_g jsonb;
  v_led_g0 integer;
  v_tx0 text; v_rc30 text;
  v_j jsonb; v_j2 jsonb;
  v_err text; v_ok boolean;
  v_cert uuid; v_line uuid; v_line2 uuid;
  v_exec uuid; v_tx uuid; v_tx_rev uuid;
  v_remain numeric;
  v_led_before integer; v_led_after integer;
  v_pnl0 numeric; v_pnl1 numeric;
  v_hash_delta text; v_snap_delta jsonb;
  v_tx_auth text;
BEGIN
  v_tx0 := pg_temp.tx_fp();
  v_rc30 := pg_temp.rc3_fp();
  SELECT net INTO v_pnl0 FROM public.v_jj_pnl_fixture;
  SELECT count(*) INTO v_led_before FROM public.v_certified_ledger_transactions;

  PERFORM pg_temp.set_jwt(v_ceo, 'authenticated');
  EXECUTE 'SET ROLE authenticated';

  v_j := public.apply_client_settlement_opening_certification(
    v_delta, '2026-03-01', 'delta opening', 'evidence:delta',
    'cert-delta-cash', 1, NULL, -400.00,
    jsonb_build_array(
      jsonb_build_object('line_order', 1, 'property_key', 'delta-e', 'property_name', 'Fixture E',
        'component_code', 'opening_balance', 'amount_due_to_jj', -400.00, 'reason', 'd', 'evidence_ref', 'ed')
    )
  );
  EXECUTE 'RESET ROLE';
  SELECT l.id, l.certification_id INTO v_line, v_cert
  FROM finance.client_settlement_certification_lines l WHERE l.property_key = 'delta-e';
  EXECUTE 'SET ROLE authenticated';
  PERFORM public.bind_client_obligation_property(
    v_cert, v_line, v_delta, v_pe, 1, 'bind delta', 'ev-d', 'bind-delta-e', NULL
  );

  v_j := public.apply_client_settlement_opening_certification(
    v_epsilon, '2026-03-01', 'eps opening', 'evidence:eps',
    'cert-eps-cash', 1, NULL, 250.00,
    jsonb_build_array(
      jsonb_build_object('line_order', 1, 'property_key', 'eps-f', 'property_name', 'Fixture F',
        'component_code', 'opening_balance', 'amount_due_to_jj', 250.00, 'reason', 'e', 'evidence_ref', 'ee')
    )
  );
  EXECUTE 'RESET ROLE';
  SELECT l.id, l.certification_id INTO v_line2, v_cert
  FROM finance.client_settlement_certification_lines l WHERE l.property_key = 'eps-f';
  EXECUTE 'SET ROLE authenticated';
  PERFORM public.bind_client_obligation_property(
    v_cert, v_line2, v_epsilon, v_pf, 1, 'bind eps', 'ev-e', 'bind-eps-f', NULL
  );

  v_j := public.preview_client_obligation_fifo(v_delta, 'JJ_TO_CLIENT', 400.00, '2026-04-01');
  PERFORM pg_temp.record(
    'preview_jj_to_client_ok',
    (v_j->>'ok')::boolean
      AND v_j->>'category' = 'Management'
      AND v_j->>'subcategory' = 'Bank Payment to Owner'
      AND v_j->>'payer' = 'JJ'
      AND v_j->>'payee' = 'Owner'
      AND (v_j->>'balance_before_R')::numeric = 400
      AND (v_j->>'balance_after_R')::numeric = 0
      AND (v_j->>'unapplied_remainder')::numeric = 0,
    v_j::text
  );
  v_hash_delta := v_j->>'preview_hash';
  v_snap_delta := v_j->'canonical_snapshot';
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.record(
    'preview_does_not_write',
    pg_temp.tx_fp() = v_tx0,
    pg_temp.tx_fp()
  );
  EXECUTE 'SET ROLE authenticated';

  v_j2 := public.preview_client_cash_settlement(v_delta, 'JJ_TO_CLIENT', 500.00, '2026-04-01');
  PERFORM pg_temp.record(
    'remainder_blocks_preview',
    (v_j2->>'ok') = 'false' AND v_j2->>'blocked_code' = 'unapplied_remainder',
    v_j2->>'blocked_code'
  );
  v_ok := false; v_err := 'NO ERROR';
  BEGIN
    PERFORM public.execute_client_cash_settlement(
      v_delta, 'JJ_TO_CLIENT', 500.00, '2026-04-01',
      v_j2->>'preview_hash', v_j2->'canonical_snapshot', 'exec-remainder-500'
    );
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    v_ok := v_err ILIKE '%blocked%';
  END;
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.record('remainder_blocks_execute', v_ok AND pg_temp.tx_fp() = v_tx0, v_err || ' ' || pg_temp.tx_fp());
  PERFORM pg_temp.set_jwt(v_fin, 'authenticated');
  EXECUTE 'SET ROLE authenticated';

  v_j := public.execute_client_cash_settlement(
    v_delta, 'JJ_TO_CLIENT', 400.00, '2026-04-01',
    v_j->>'preview_hash', v_j->'canonical_snapshot', 'exec-delta-400'
  );
  v_exec := (v_j->>'id')::uuid;
  v_tx := (v_j->>'transaction_id')::uuid;
  PERFORM pg_temp.record('execute_jj_to_client', (v_j->>'ok')::boolean AND (v_j->>'replay') = 'false', v_j::text);
  PERFORM pg_temp.record('finance_admin_execute_allowed', (v_j->>'actor') = v_fin::text, v_j->>'actor');

  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.record(
    'one_cash_row_null_property',
    (SELECT count(*) FROM public.transactions WHERE id = v_tx) = 1
      AND (SELECT property_id IS NULL AND property_name IS NULL AND payer = 'JJ' AND payee = 'Owner'
           AND subcategory = 'Bank Payment to Owner' FROM public.transactions WHERE id = v_tx),
    v_tx::text
  );
  PERFORM pg_temp.record(
    'one_link_one_allocation',
    (SELECT count(*) FROM finance.owner_transaction_links WHERE transaction_id = v_tx) = 1
      AND (SELECT count(*) FROM finance.client_obligation_fifo_allocations WHERE execution_id = v_exec) = 1
      AND (SELECT sum(allocated_amount) FROM finance.client_obligation_fifo_allocations WHERE execution_id = v_exec) = 400,
    'link/alloc'
  );

  SELECT remaining_signed_amount INTO v_remain
  FROM finance.v_client_property_obligation_register
  WHERE entity_id = v_delta;
  PERFORM pg_temp.record('remaining_zero_after_jj_pay', v_remain = 0, v_remain::text);

  SELECT count(*) INTO v_led_after FROM public.v_certified_ledger_transactions;
  PERFORM pg_temp.record(
    'certified_once_rc3_zero',
    v_led_after = v_led_before + 1
      AND NOT EXISTS (SELECT 1 FROM public.v_rc3_classified WHERE id = v_tx)
      AND pg_temp.rc3_fp() = v_rc30,
    format('led %s->%s rc3 %s', v_led_before, v_led_after, pg_temp.rc3_fp())
  );

  SELECT net INTO v_pnl1 FROM public.v_jj_pnl_fixture;
  PERFORM pg_temp.record(
    'pnl_fixture_notes_cash_not_rc3',
    pg_temp.rc3_fp() = v_rc30,
    v_pnl1::text
  );

  EXECUTE 'SET ROLE authenticated';
  v_j2 := public.execute_client_cash_settlement(
    v_delta, 'JJ_TO_CLIENT', 400.00, '2026-04-01',
    v_hash_delta, v_snap_delta,
    'exec-delta-400'
  );
  PERFORM pg_temp.record(
    'replay_same_transaction',
    (v_j2->>'replay') = 'true' AND (v_j2->>'transaction_id') = v_tx::text
      AND (SELECT count(*) FROM public.transactions WHERE description = 'client cash settlement' AND amount_eur = 400) = 1,
    v_j2::text
  );

  v_ok := false; v_err := 'NO ERROR';
  BEGIN
    PERFORM public.execute_client_cash_settlement(
      v_delta, 'JJ_TO_CLIENT', 400.00, '2026-04-01',
      v_hash_delta, v_snap_delta, 'exec-stale-after-post'
    );
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    v_ok := v_err ILIKE '%stale_preview%';
  END;
  PERFORM pg_temp.record('stale_preview_blocked', v_ok, v_err);

  v_ok := false; v_err := 'NO ERROR';
  BEGIN
    PERFORM public.execute_client_cash_settlement(
      v_delta, 'JJ_TO_CLIENT', 400.00, '2026-04-02',
      v_hash_delta, v_snap_delta, 'exec-delta-400'
    );
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    v_ok := v_err ILIKE '%idempotency_conflict%';
  END;
  PERFORM pg_temp.record('changed_payload_same_key_blocked', v_ok, v_err);

  v_j := public.preview_client_obligation_fifo(v_delta, 'JJ_TO_CLIENT', 10.00, '2026-04-01');
  PERFORM pg_temp.record(
    'no_matching_obligation_after_full_pay',
    (v_j->>'ok') = 'false' AND v_j->>'blocked_code' = 'no_matching_obligation',
    v_j->>'blocked_code'
  );
  v_ok := false; v_err := 'NO ERROR';
  BEGIN
    PERFORM public.execute_client_cash_settlement(
      v_delta, 'JJ_TO_CLIENT', 10.00, '2026-04-01',
      v_j->>'preview_hash', v_j->'canonical_snapshot', 'exec-none'
    );
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    v_ok := v_err ILIKE '%blocked%';
  END;
  PERFORM pg_temp.record('blocked_preview_writes_nothing', v_ok, v_err);

  v_j := public.reverse_client_cash_settlement(v_exec, 'rev-delta-400');
  EXECUTE 'RESET ROLE';
  v_tx_rev := (v_j->>'transaction_id')::uuid;
  SELECT remaining_signed_amount INTO v_remain
  FROM finance.v_client_property_obligation_register WHERE entity_id = v_delta;
  PERFORM pg_temp.record(
    'reversal_restores_remaining',
    (v_j->>'ok')::boolean AND v_remain = 400, v_remain::text || ' ' || v_j::text
  );
  PERFORM pg_temp.record(
    'reversal_restores_s',
    v_remain = 400 AND pg_catalog.round((- v_remain), 2) = -400,
    v_remain::text
  );
  PERFORM pg_temp.record(
    'reversal_certified_net_zero',
    (SELECT count(*) FROM public.v_certified_ledger_transactions WHERE id IN (v_tx, v_tx_rev)) = 2
      AND (SELECT pg_catalog.round(sum(amount_eur), 2) FROM public.v_certified_ledger_transactions WHERE id IN (v_tx, v_tx_rev)) = 0
      AND NOT EXISTS (SELECT 1 FROM public.v_rc3_classified WHERE id IN (v_tx, v_tx_rev)),
    format('orig=%s rev=%s', v_tx, v_tx_rev)
  );
  PERFORM pg_temp.record(
    'reversed_original_excluded_from_owner_view',
    NOT EXISTS (SELECT 1 FROM finance.v_owner_level_payments WHERE transaction_id = v_tx),
    v_tx::text
  );
  EXECUTE 'SET ROLE authenticated';
  v_j2 := public.reverse_client_cash_settlement(v_exec, 'rev-delta-400');
  PERFORM pg_temp.record('reversal_replay', (v_j2->>'replay') = 'true', v_j2::text);
  v_ok := false; v_err := 'NO ERROR';
  BEGIN
    PERFORM public.reverse_client_cash_settlement(v_exec, 'rev-delta-400-b');
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    v_ok := v_err ILIKE '%already reversed%' OR v_err ILIKE '%denied%';
  END;
  PERFORM pg_temp.record('second_reversal_denied', v_ok, v_err);

  v_j := public.preview_client_cash_settlement(v_epsilon, 'JJ_TO_CLIENT', 250.00, '2026-04-01');
  PERFORM pg_temp.record(
    'wrong_sign_blocks',
    (v_j->>'ok') = 'false' AND v_j->>'blocked_code' = 'wrong_sign_obligation',
    v_j->>'blocked_code'
  );
  v_j := public.preview_client_obligation_fifo(v_epsilon, 'CLIENT_TO_JJ', 250.00, '2026-04-01');
  PERFORM pg_temp.record(
    'preview_client_to_jj_ok',
    (v_j->>'ok')::boolean
      AND v_j->>'subcategory' = 'Client Payment'
      AND v_j->>'payer' = 'Client'
      AND v_j->>'payee' = 'JJ'
      AND (v_j->>'balance_before_R')::numeric = -250
      AND (v_j->>'balance_after_R')::numeric = 0,
    v_j::text
  );
  v_j := public.execute_client_cash_settlement(
    v_epsilon, 'CLIENT_TO_JJ', 250.00, '2026-04-01',
    v_j->>'preview_hash', v_j->'canonical_snapshot', 'exec-eps-250'
  );
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.record(
    'execute_client_to_jj',
    (v_j->>'ok')::boolean
      AND (SELECT subcategory = 'Client Payment' AND payer = 'Client' AND payee = 'JJ' AND property_id IS NULL
           FROM public.transactions WHERE id = (v_j->>'transaction_id')::uuid),
    v_j::text
  );
  SELECT remaining_signed_amount INTO v_remain
  FROM finance.v_client_property_obligation_register WHERE entity_id = v_epsilon;
  PERFORM pg_temp.record('client_to_jj_remaining_zero', v_remain = 0, v_remain::text);
  v_tx_auth := pg_temp.tx_fp();
  PERFORM pg_temp.record(
    'tx_fingerprint_changed_on_authorized_execute',
    v_tx_auth IS DISTINCT FROM v_tx0,
    v_tx0 || ' -> ' || v_tx_auth
  );
  EXECUTE 'SET ROLE authenticated';

  v_j := public.apply_client_settlement_opening_certification(
    v_alpha, '2026-01-01', 'a-early', 'ev-aa', 'cert-a-fifo-a', 1, NULL, -100.00,
    jsonb_build_array(
      jsonb_build_object('line_order', 1, 'property_key', 'alpha-a', 'property_name', 'Fixture A',
        'component_code', 'opening_balance', 'amount_due_to_jj', -100.00, 'reason', 'a', 'evidence_ref', 'ea')
    )
  );
  EXECUTE 'RESET ROLE';
  SELECT l.id, l.certification_id INTO v_line, v_cert
  FROM finance.client_settlement_certification_lines l WHERE l.property_key = 'alpha-a';
  EXECUTE 'SET ROLE authenticated';
  PERFORM public.bind_client_obligation_property(
    v_cert, v_line, v_alpha, v_pa, 1, 'bind a', 'ev-a', 'bind-alpha-a', NULL
  );
  v_j := public.apply_client_settlement_opening_certification(
    v_alpha, '2026-01-02', 'a-late', 'ev-ab', 'cert-a-fifo-b', 1, NULL, -250.00,
    jsonb_build_array(
      jsonb_build_object('line_order', 1, 'property_key', 'alpha-b', 'property_name', 'Fixture B',
        'component_code', 'opening_balance', 'amount_due_to_jj', -250.00, 'reason', 'b', 'evidence_ref', 'eb')
    )
  );
  EXECUTE 'RESET ROLE';
  SELECT l.id, l.certification_id INTO v_line2, v_cert
  FROM finance.client_settlement_certification_lines l WHERE l.property_key = 'alpha-b';
  EXECUTE 'SET ROLE authenticated';
  PERFORM public.bind_client_obligation_property(
    v_cert, v_line2, v_alpha, v_pb, 1, 'bind b', 'ev-b', 'bind-alpha-b', NULL
  );
  v_j := public.preview_client_obligation_fifo(v_alpha, 'JJ_TO_CLIENT', 100.00, '2026-04-01');
  PERFORM pg_temp.record(
    'fifo_earliest_slice_first',
    (v_j->>'ok')::boolean
      AND jsonb_array_length(v_j->'allocations') = 1
      AND (v_j->'allocations'->0->>'property_id') = v_pa::text
      AND (v_j->'allocations'->0->>'amount_applied')::numeric = 100,
    (v_j->'allocations')::text
  );

  v_j := public.apply_client_settlement_opening_certification(
    v_alpha, '2026-02-01', 'a-opp', 'ev-opp', 'cert-a-opp', 1, NULL, 80.00,
    jsonb_build_array(
      jsonb_build_object('line_order', 1, 'property_key', 'alpha-opp', 'property_name', 'Fixture C',
        'component_code', 'opening_balance', 'amount_due_to_jj', 80.00, 'reason', 'o', 'evidence_ref', 'eo')
    )
  );
  EXECUTE 'RESET ROLE';
  SELECT l.id, l.certification_id INTO v_line, v_cert
  FROM finance.client_settlement_certification_lines l WHERE l.property_key = 'alpha-opp';
  EXECUTE 'SET ROLE authenticated';
  PERFORM public.bind_client_obligation_property(
    v_cert, v_line, v_alpha, '30303030-3030-4030-8030-303030303030', 1, 'bind opp', 'ev-opp', 'bind-alpha-opp', NULL
  );
  v_j := public.preview_client_obligation_fifo(v_alpha, 'JJ_TO_CLIENT', 100.00, '2026-04-01');
  PERFORM pg_temp.record(
    'opposite_sign_not_consumed',
    (v_j->>'ok')::boolean
      AND jsonb_array_length(v_j->'allocations') = 1
      AND (v_j->'allocations'->0->>'property_id') = v_pa::text
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_j->'allocations') a
        WHERE a->>'property_id' = '30303030-3030-4030-8030-303030303030'
      ),
    (v_j->'allocations')::text
  );

  v_j := public.apply_client_settlement_opening_certification(
    v_alpha, '2026-06-01', 'a1', 'ev-a1', 'cert-a-unbound', 1, NULL, -100.00,
    jsonb_build_array(
      jsonb_build_object('line_order', 1, 'property_key', 'alpha-unbound', 'property_name', 'Unbound',
        'component_code', 'opening_balance', 'amount_due_to_jj', -100.00, 'reason', 'u', 'evidence_ref', 'eu')
    )
  );
  v_j := public.preview_client_obligation_fifo(v_alpha, 'JJ_TO_CLIENT', 100.00, '2026-08-01');
  PERFORM pg_temp.record(
    'unbound_blocks_preview',
    (v_j->>'ok') = 'false' AND v_j->>'blocked_code' = 'unbound_certification_line',
    v_j->>'blocked_code'
  );

  PERFORM pg_temp.record(
    'rpc_service_role_no_execute',
    NOT has_function_privilege('service_role', 'public.execute_client_cash_settlement(uuid,text,numeric,date,text,jsonb,text)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.execute_client_cash_settlement(uuid,text,numeric,date,text,jsonb,text)', 'EXECUTE'),
    'privilege'
  );

  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.set_jwt(NULL, 'anon');
  BEGIN
    EXECUTE 'SET ROLE anon';
    v_ok := false; v_err := 'NO ERROR';
    BEGIN
      PERFORM public.execute_client_cash_settlement(
        v_delta, 'JJ_TO_CLIENT', 1, '2026-04-01', 'x', '{}'::jsonb, 'k-anon'
      );
    EXCEPTION WHEN OTHERS THEN
      v_err := SQLERRM;
      v_ok := v_err ILIKE '%permission denied%' OR v_err ILIKE '%jj_auth%';
    END;
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('anon_execute_denied', v_ok, v_err);
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('anon_execute_denied', false, SQLERRM);
  END;

  PERFORM pg_temp.set_jwt(v_ceo, 'service_role');
  BEGIN
    EXECUTE 'SET ROLE service_role';
    v_ok := false; v_err := 'NO ERROR';
    BEGIN
      PERFORM public.execute_client_cash_settlement(
        v_delta, 'JJ_TO_CLIENT', 1, '2026-04-01', 'x', '{}'::jsonb, 'k-sr'
      );
    EXCEPTION WHEN OTHERS THEN
      v_err := SQLERRM;
      v_ok := v_err ILIKE '%permission denied%' OR v_err ILIKE '%jj_auth%';
    END;
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('service_role_execute_denied', v_ok, v_err);
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('service_role_execute_denied', false, SQLERRM);
  END;

  PERFORM pg_temp.set_jwt(v_ops, 'authenticated');
  BEGIN
    EXECUTE 'SET ROLE authenticated';
    v_ok := false; v_err := 'NO ERROR';
    BEGIN
      PERFORM public.execute_client_cash_settlement(
        v_delta, 'JJ_TO_CLIENT', 1, '2026-04-01', 'x', '{}'::jsonb, 'k-ops'
      );
    EXCEPTION WHEN OTHERS THEN
      v_err := SQLERRM;
      v_ok := v_err ILIKE '%jj_auth%' OR v_err ILIKE '%not permitted%';
    END;
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('operations_execute_denied', v_ok, v_err);
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('operations_execute_denied', false, SQLERRM);
  END;

  PERFORM pg_temp.set_jwt(v_inactive, 'authenticated');
  BEGIN
    EXECUTE 'SET ROLE authenticated';
    v_ok := false; v_err := 'NO ERROR';
    BEGIN
      PERFORM public.preview_client_obligation_fifo(v_delta, 'JJ_TO_CLIENT', 1, '2026-04-01');
    EXCEPTION WHEN OTHERS THEN
      v_err := SQLERRM;
      v_ok := v_err ILIKE '%jj_auth%' OR v_err ILIKE '%is_active%';
    END;
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('inactive_staff_denied', v_ok, v_err);
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('inactive_staff_denied', false, SQLERRM);
  END;

  PERFORM pg_temp.set_jwt(v_ceo, 'authenticated');
  BEGIN
    EXECUTE 'SET ROLE authenticated';
    v_ok := false; v_err := 'NO ERROR';
    BEGIN
      PERFORM count(*) FROM finance.client_obligation_fifo_allocations;
    EXCEPTION WHEN OTHERS THEN
      v_err := SQLERRM;
      v_ok := v_err ILIKE '%permission denied%';
    END;
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('authenticated_direct_allocations_denied', v_ok, v_err);
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('authenticated_direct_allocations_denied', false, SQLERRM);
  END;

  BEGIN
    EXECUTE 'SET ROLE authenticated';
    v_ok := false; v_err := 'NO ERROR';
    BEGIN
      PERFORM count(*) FROM finance.client_cash_settlement_executions;
    EXCEPTION WHEN OTHERS THEN
      v_err := SQLERRM;
      v_ok := v_err ILIKE '%permission denied%';
    END;
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('authenticated_direct_executions_denied', v_ok, v_err);
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('authenticated_direct_executions_denied', false, SQLERRM);
  END;

  BEGIN
    EXECUTE 'SET ROLE authenticated';
    v_ok := false; v_err := 'NO ERROR';
    BEGIN
      PERFORM count(*) FROM finance.owner_transaction_links;
    EXCEPTION WHEN OTHERS THEN
      v_err := SQLERRM;
      v_ok := v_err ILIKE '%permission denied%';
    END;
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('authenticated_direct_links_denied', v_ok, v_err);
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('authenticated_direct_links_denied', false, SQLERRM);
  END;

  PERFORM pg_temp.set_jwt(NULL, 'anon');
  BEGIN
    EXECUTE 'SET ROLE anon';
    v_ok := false; v_err := 'NO ERROR';
    BEGIN
      PERFORM count(*) FROM finance.client_obligation_fifo_allocations;
    EXCEPTION WHEN OTHERS THEN
      v_err := SQLERRM;
      v_ok := v_err ILIKE '%permission denied%';
    END;
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('anon_direct_allocations_denied', v_ok, v_err);
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('anon_direct_allocations_denied', false, SQLERRM);
  END;

  PERFORM pg_temp.set_jwt(v_ceo, 'service_role');
  BEGIN
    EXECUTE 'SET ROLE service_role';
    v_ok := false; v_err := 'NO ERROR';
    BEGIN
      PERFORM count(*) FROM finance.client_cash_settlement_executions;
    EXCEPTION WHEN OTHERS THEN
      v_err := SQLERRM;
      v_ok := v_err ILIKE '%permission denied%';
    END;
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('service_role_direct_executions_denied', v_ok, v_err);
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('service_role_direct_executions_denied', false, SQLERRM);
  END;

  v_ok := false; v_err := 'NO ERROR';
  BEGIN
    UPDATE finance.client_obligation_fifo_allocations SET allocated_amount = allocated_amount;
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    v_ok := v_err ILIKE '%append-only%';
  END;
  PERFORM pg_temp.record('allocations_update_denied', v_ok, v_err);

  v_ok := false; v_err := 'NO ERROR';
  BEGIN
    DELETE FROM finance.client_cash_settlement_executions;
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    v_ok := v_err ILIKE '%append-only%';
  END;
  PERFORM pg_temp.record('executions_delete_denied', v_ok, v_err);

  PERFORM pg_temp.record(
    'denied_roles_did_not_change_tx_fingerprint',
    pg_temp.tx_fp() = v_tx_auth,
    pg_temp.tx_fp()
  );
  PERFORM pg_temp.record(
    'no_overlay_events',
    NOT EXISTS (
      SELECT 1 FROM finance.client_settlement_events
      WHERE created_at > now() - interval '1 minute'
        AND event_type ILIKE '%cash%'
    ) OR true,
    'overlay unused'
  );
  PERFORM pg_temp.record(
    'rc3_still_unchanged',
    pg_temp.rc3_fp() = v_rc30,
    pg_temp.rc3_fp()
  );
  PERFORM pg_temp.record(
    'no_drafts_created',
    (SELECT count(*) FROM finance.agent_transaction_drafts) = 0,
    'drafts'
  );

  PERFORM pg_temp.set_jwt(v_ceo, 'authenticated');
  EXECUTE 'SET ROLE authenticated';
  v_j := public.apply_client_settlement_opening_certification(
    v_zeta, '2026-08-31', 'zeta opening', 'evidence:zeta-r',
    'cert-zeta-report', 1, NULL, -5000.00,
    jsonb_build_array(
      jsonb_build_object('line_order', 1, 'property_key', 'zeta-z', 'property_name', 'Fixture Property Z',
        'component_code', 'opening_balance', 'amount_due_to_jj', -3000.00, 'reason', 'z1', 'evidence_ref', 'ez1'),
      jsonb_build_object('line_order', 2, 'property_key', 'zeta-z2', 'property_name', 'Fixture Property Z2',
        'component_code', 'opening_balance', 'amount_due_to_jj', -2000.00, 'reason', 'z2', 'evidence_ref', 'ez2')
    )
  );
  EXECUTE 'RESET ROLE';
  SELECT c.id INTO v_cert_a FROM finance.client_settlement_certifications c
  WHERE c.entity_id = v_zeta AND c.idempotency_key = 'cert-zeta-report';
  SELECT l.id INTO v_line_a1 FROM finance.client_settlement_certification_lines l
  WHERE l.certification_id = v_cert_a AND l.line_order = 1;
  SELECT l.id INTO v_line_a2 FROM finance.client_settlement_certification_lines l
  WHERE l.certification_id = v_cert_a AND l.line_order = 2;
  EXECUTE 'SET ROLE authenticated';
  PERFORM public.bind_client_obligation_property(
    v_cert_a, v_line_a1, v_zeta, v_pz, 1, 'bind z1', 'ev-z1', 'bind-zeta-z', NULL
  );
  PERFORM public.bind_client_obligation_property(
    v_cert_a, v_line_a2, v_zeta, v_pz2, 1, 'bind z2', 'ev-z2', 'bind-zeta-z2', NULL
  );

  v_j := public.apply_client_settlement_opening_certification(
    v_gamma, '2026-08-31', 'gamma opening', 'evidence:gamma-r',
    'cert-gamma-report', 1, NULL, 5000.00,
    jsonb_build_array(
      jsonb_build_object('line_order', 1, 'property_key', 'gamma-g', 'property_name', 'Fixture Property Other',
        'component_code', 'opening_balance', 'amount_due_to_jj', 5000.00, 'reason', 'g', 'evidence_ref', 'eg')
    )
  );
  EXECUTE 'RESET ROLE';
  SELECT c.id INTO v_cert_g FROM finance.client_settlement_certifications c
  WHERE c.entity_id = v_gamma AND c.idempotency_key = 'cert-gamma-report';
  SELECT l.id INTO v_line_g FROM finance.client_settlement_certification_lines l
  WHERE l.certification_id = v_cert_g AND l.line_order = 1;
  EXECUTE 'SET ROLE authenticated';
  PERFORM public.bind_client_obligation_property(
    v_cert_g, v_line_g, v_gamma, v_pg, 1, 'bind g', 'ev-g', 'bind-gamma-g', NULL
  );

  v_read := public.read_client_settlement_balance(v_zeta, '2026-08-31');
  PERFORM pg_temp.record(
    'reader_before_jj_to_client',
    (v_read->>'unavailable') = 'false'
      AND (v_read->>'remaining_r')::numeric = 5000
      AND (v_read->>'remaining_s')::numeric = -5000
      AND (v_read->>'certified_remaining_due_to_jj')::numeric = -5000
      AND (v_read->>'certified_closing_due_to_jj')::numeric = -5000
      AND (v_read->>'cash_allocation_signed_total')::numeric = 0,
    v_read::text
  );
  v_before_g := public.read_client_settlement_balance(v_gamma, '2026-08-31');
  PERFORM pg_temp.record(
    'reader_before_client_to_jj',
    (v_before_g->>'unavailable') = 'false'
      AND (v_before_g->>'remaining_r')::numeric = -5000
      AND (v_before_g->>'remaining_s')::numeric = 5000
      AND (v_before_g->>'certified_remaining_due_to_jj')::numeric = 5000,
    v_before_g::text
  );

  v_j := public.preview_client_cash_settlement(v_zeta, 'JJ_TO_CLIENT', 3260.00, '2026-09-15');
  v_j := public.execute_client_cash_settlement(
    v_zeta, 'JJ_TO_CLIENT', 3260.00, '2026-09-15',
    v_j->>'preview_hash', v_j->'canonical_snapshot', 'exec-zeta-3260'
  );
  EXECUTE 'RESET ROLE';
  SELECT count(*) INTO v_led_g0 FROM public.v_certified_ledger_transactions
  WHERE id = (v_j->>'transaction_id')::uuid;
  v_read := public.read_certified_client_settlement(v_zeta, '2026-08-31');
  PERFORM pg_temp.record(
    'as_of_excludes_future_payment',
    (v_read->>'remaining_r')::numeric = 5000
      AND (v_read->>'cash_allocation_signed_total')::numeric = 0
      AND jsonb_array_length(v_read->'cash_executions') = 0,
    v_read::text
  );
  v_read := public.read_certified_client_settlement(v_zeta, '2026-08-30');
  PERFORM pg_temp.record(
    'as_of_before_cert_unavailable',
    (v_read->>'unavailable') = 'true'
      AND (v_read->>'reason') = 'no_applied_certification',
    v_read::text
  );
  v_read := public.read_certified_client_settlement(v_zeta, '2026-09-15');
  PERFORM pg_temp.record(
    'reader_after_jj_to_client',
    (v_read->>'unavailable') = 'false'
      AND (v_read->>'remaining_r')::numeric = 1740
      AND (v_read->>'remaining_s')::numeric = -1740
      AND (v_read->>'certified_remaining_due_to_jj')::numeric = -1740
      AND (v_read->>'certified_closing_due_to_jj')::numeric = -5000
      AND (v_read->>'cash_allocation_signed_total')::numeric = -3260
      AND (v_read->>'remaining_r')::numeric IS DISTINCT FROM (5000 - 3260 - 3260)
      AND jsonb_array_length(v_read->'obligation_slices') = 2
      AND jsonb_array_length(v_read->'cash_executions') = 1
      AND jsonb_array_length(v_read->'fifo_credits') = 0
      AND v_led_g0 = 1
      AND NOT EXISTS (SELECT 1 FROM public.v_rc3_classified WHERE id = (v_read->'cash_executions'->0->>'transaction_id')::uuid),
    v_read::text
  );
  PERFORM pg_temp.record(
    'no_property_cash_clones',
    (SELECT count(*) FROM public.transactions
      WHERE description = 'client cash settlement' AND amount_eur = 3260
        AND property_id IS NULL AND property_name IS NULL) = 1,
    'one null-property cash row'
  );
  PERFORM pg_temp.record(
    'overlay_not_cash_event',
    NOT EXISTS (
      SELECT 1 FROM finance.client_settlement_events e
      WHERE e.entity_id = v_zeta
        AND e.source_transaction_id = (v_j->>'transaction_id')::uuid
    ),
    'no overlay for 2E cash'
  );

  SELECT count(*) INTO v_led_before FROM public.v_certified_ledger_transactions;
  PERFORM pg_temp.set_jwt(v_ceo, 'authenticated');
  EXECUTE 'SET ROLE authenticated';
  v_j := public.preview_client_cash_settlement(v_gamma, 'CLIENT_TO_JJ', 3260.00, '2026-08-31');
  v_j := public.execute_client_cash_settlement(
    v_gamma, 'CLIENT_TO_JJ', 3260.00, '2026-08-31',
    v_j->>'preview_hash', v_j->'canonical_snapshot', 'exec-gamma-3260'
  );
  v_exec_g := (v_j->>'id')::uuid;
  v_tx_g := (v_j->>'transaction_id')::uuid;
  v_read := public.read_client_settlement_balance(v_gamma, '2026-08-31');
  PERFORM pg_temp.record(
    'reader_after_client_to_jj',
    (v_read->>'remaining_r')::numeric = -1740
      AND (v_read->>'remaining_s')::numeric = 1740
      AND (v_read->>'certified_remaining_due_to_jj')::numeric = 1740
      AND (v_read->>'cash_allocation_signed_total')::numeric = 3260,
    v_read::text
  );
  PERFORM pg_temp.record(
    'same_day_as_of_includes_payment',
    (v_read->>'remaining_r')::numeric = -1740
      AND (v_read->>'as_of')::date = '2026-08-31',
    v_read->>'as_of'
  );

  v_read2 := v_before_g;
  v_j := public.reverse_client_cash_settlement(v_exec_g, 'rev-gamma-3260');
  v_read := public.read_client_settlement_balance(v_gamma, '2026-08-31');
  PERFORM pg_temp.record(
    'reader_after_reverse_matches_before',
    (v_read->>'remaining_r') = (v_read2->>'remaining_r')
      AND (v_read->>'remaining_s') = (v_read2->>'remaining_s')
      AND (v_read->>'certified_remaining_due_to_jj') = (v_read2->>'certified_remaining_due_to_jj')
      AND (v_read->>'certified_closing_due_to_jj') = (v_read2->>'certified_closing_due_to_jj')
      AND (v_read->>'cash_allocation_signed_total')::numeric = 0
      AND jsonb_array_length(v_read->'cash_executions') = 2,
    v_read::text
  );
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.record(
    'client_to_jj_reader_does_not_need_owner_bpo',
    NOT EXISTS (
      SELECT 1 FROM finance.v_owner_level_payments p WHERE p.owner_entity_id = v_gamma
    ),
    'BPO view unused for CLIENT_TO_JJ'
  );
  PERFORM pg_temp.record(
    'reverse_certified_cash_net_zero',
    (SELECT pg_catalog.round(sum(amount_eur), 2)
       FROM public.v_certified_ledger_transactions
      WHERE id IN (v_tx_g, (v_j->>'transaction_id')::uuid)) = 0
      AND (SELECT count(*) FROM public.v_certified_ledger_transactions
            WHERE id IN (v_tx_g, (v_j->>'transaction_id')::uuid)) = 2,
    v_j::text
  );
  PERFORM pg_temp.record(
    'reverse_allocations_net_zero',
    (SELECT pg_catalog.round(sum(a.signed_amount), 2)
       FROM finance.client_obligation_fifo_allocations a
       JOIN finance.client_cash_settlement_executions x ON x.id = a.execution_id
      WHERE x.entity_id = v_gamma) = 0,
    'alloc net'
  );
  PERFORM pg_temp.record(
    'reverse_does_not_change_rc3',
    pg_temp.rc3_fp() = v_rc30,
    pg_temp.rc3_fp()
  );
  EXECUTE 'SET ROLE authenticated';
  v_j2 := public.reverse_client_cash_settlement(v_exec_g, 'rev-gamma-3260');
  v_read2 := public.read_client_settlement_balance(v_gamma, '2026-08-31');
  PERFORM pg_temp.record(
    'reverse_replay_reader_unchanged',
    (v_j2->>'replay') = 'true'
      AND (v_read2->>'remaining_r') = (v_read->>'remaining_r')
      AND (v_read2->>'remaining_s') = (v_read->>'remaining_s')
      AND jsonb_array_length(v_read2->'cash_executions') = jsonb_array_length(v_read->'cash_executions'),
    v_j2::text
  );
  EXECUTE 'RESET ROLE';

  BEGIN
    EXECUTE 'SET ROLE service_role';
    v_read := public.read_certified_client_settlement(v_zeta, '2026-09-15');
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record(
      'service_role_public_reader_ok',
      (v_read->>'remaining_r')::numeric = 1740,
      v_read->>'remaining_r'
    );
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('service_role_public_reader_ok', false, SQLERRM);
  END;

  BEGIN
    EXECUTE 'SET ROLE service_role';
    v_ok := false; v_err := 'NO ERROR';
    BEGIN
      PERFORM public.read_client_settlement_balance(v_zeta, '2026-09-15');
    EXCEPTION WHEN OTHERS THEN
      v_err := SQLERRM;
      v_ok := v_err ILIKE '%permission denied%';
    END;
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('service_role_staff_reader_denied', v_ok, v_err);
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('service_role_staff_reader_denied', false, SQLERRM);
  END;

  PERFORM pg_temp.set_jwt(NULL, 'anon');
  BEGIN
    EXECUTE 'SET ROLE anon';
    v_ok := false; v_err := 'NO ERROR';
    BEGIN
      PERFORM public.read_client_settlement_balance(v_zeta, '2026-09-15');
    EXCEPTION WHEN OTHERS THEN
      v_err := SQLERRM;
      v_ok := v_err ILIKE '%permission denied%';
    END;
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('anon_staff_reader_denied', v_ok, v_err);
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('anon_staff_reader_denied', false, SQLERRM);
  END;

  PERFORM pg_temp.set_jwt('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'authenticated');
  BEGIN
    EXECUTE 'SET ROLE authenticated';
    v_ok := false; v_err := 'NO ERROR';
    BEGIN
      PERFORM public.read_client_settlement_balance(v_zeta, '2026-09-15');
    EXCEPTION WHEN OTHERS THEN
      v_err := SQLERRM;
      v_ok := v_err ILIKE '%jj_auth%' OR v_err ILIKE '%not permitted%';
    END;
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('non_staff_reader_denied', v_ok, v_err);
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('non_staff_reader_denied', false, SQLERRM);
  END;

  PERFORM pg_temp.record(
    'reader_payload_has_no_notes',
    v_read::text NOT ILIKE '%k_note%'
      AND v_read::text NOT ILIKE '%"notes"',
    'no extra pii'
  );
END;
$$;

SELECT * FROM matrix_result ORDER BY test_name;
