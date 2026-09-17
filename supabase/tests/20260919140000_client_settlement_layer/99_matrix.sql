-- Isolated role/security/FIFO matrix. Fail closed: any FAIL raises.

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

CREATE OR REPLACE FUNCTION pg_temp.tx_fingerprint()
RETURNS text
LANGUAGE sql
STABLE
SET search_path TO ''
AS $$
  SELECT count(*)::text || ':' || md5(
    COALESCE(string_agg(
      t.id::text || '|' || t.review_status || '|' || t.amount_eur::text || '|' || t.payer || '|' || t.payee,
      E'\n' ORDER BY t.id
    ), '')
  )
  FROM public.transactions t;
$$;

GRANT ALL ON TABLE matrix_result TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION pg_temp.record(text, boolean, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION pg_temp.set_jwt(uuid, text) TO anon, authenticated, service_role;

DO $$
DECLARE
  v_ceo uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  v_fin uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  v_ops uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  v_str uuid := 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  v_ent_a uuid := '11111111-1111-4111-8111-111111111111';
  v_ent_b uuid := '22222222-2222-4222-8222-222222222222';
  v_tx1 uuid := '33333333-3333-4333-8333-333333333333';
  v_tx2 uuid := '44444444-4444-4444-8444-444444444444';
  v_before_fp text;
  v_after_fp text;
  v_jacob_before numeric;
  v_jacob_after numeric;
  v_pnl_before numeric;
  v_pnl_after numeric;
  v_id uuid;
  v_id2 uuid;
  v_j jsonb;
  v_err text;
  v_count integer;
  v_status text;
  v_review text;
  v_fifo_n integer;
  v_fifo_amt numeric;
  v_dates text;
  v_ok boolean;
BEGIN
  v_before_fp := pg_temp.tx_fingerprint();
  SELECT total_received INTO v_jacob_before FROM public.v_cashbox_audit WHERE cash_box_name = 'Jacob';
  SELECT net INTO v_pnl_before FROM public.v_jj_pnl_fixture;

  -- Catalog
  PERFORM pg_temp.record(
    'catalog_tables',
    EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='finance' AND c.relname='client_settlement_events')
    AND EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='finance' AND c.relname='client_settlement_event_log'),
    'events+log'
  );

  -- Grants
  PERFORM pg_temp.record(
    'rpc_authenticated_execute',
    has_function_privilege('authenticated', 'public.open_client_settlement_event(uuid,uuid,date,text,numeric,uuid,text,text,text)', 'EXECUTE')
    AND has_function_privilege('authenticated', 'public.apply_client_settlement_event(uuid)', 'EXECUTE'),
    'authenticated EXECUTE'
  );
  PERFORM pg_temp.record(
    'rpc_anon_no_execute',
    NOT has_function_privilege('anon', 'public.open_client_settlement_event(uuid,uuid,date,text,numeric,uuid,text,text,text)', 'EXECUTE'),
    'anon denied'
  );
  PERFORM pg_temp.record(
    'rpc_service_role_no_execute',
    NOT has_function_privilege('service_role', 'public.open_client_settlement_event(uuid,uuid,date,text,numeric,uuid,text,text,text)', 'EXECUTE'),
    'service_role denied'
  );
  PERFORM pg_temp.record(
    'helper_no_client_execute',
    NOT has_function_privilege('authenticated', 'finance.assert_client_settlement_authorized()', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'finance.assert_client_settlement_authorized()', 'EXECUTE')
    AND NOT has_function_privilege('service_role', 'finance.assert_client_settlement_authorized()', 'EXECUTE'),
    'helper locked'
  );

  -- anon cannot execute
  PERFORM pg_temp.set_jwt(NULL, 'anon');
  BEGIN
    EXECUTE 'SET ROLE anon';
    v_ok := false;
    v_err := 'NO ERROR';
    BEGIN
      PERFORM public.open_client_settlement_event(
        v_ent_a, NULL, '2026-08-05', 'include_transaction_in_settlement',
        100, v_tx1, 'x', 'ev', 'k-anon'
      );
    EXCEPTION WHEN OTHERS THEN
      v_err := SQLERRM;
      v_ok := v_err ILIKE '%permission denied%' OR v_err ILIKE '%must be owner%';
    END;
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('anon_open_denied', v_ok, v_err);
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('anon_open_denied', false, SQLERRM);
  END;

  -- operations staff denied
  PERFORM pg_temp.set_jwt(v_ops, 'authenticated');
  BEGIN
    EXECUTE 'SET ROLE authenticated';
    v_ok := false;
    v_err := 'NO ERROR';
    BEGIN
      PERFORM public.open_client_settlement_event(
        v_ent_a, NULL, '2026-08-05', 'include_transaction_in_settlement',
        100, v_tx1, 'x', 'ev', 'k-ops'
      );
    EXCEPTION WHEN OTHERS THEN
      v_err := SQLERRM;
      v_ok := v_err ILIKE '%jj_auth%' OR v_err ILIKE '%not permitted%';
    END;
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('operations_denied', v_ok, v_err);
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('operations_denied', false, SQLERRM);
  END;

  -- statement_operator denied
  PERFORM pg_temp.set_jwt(v_str, 'authenticated');
  BEGIN
    EXECUTE 'SET ROLE authenticated';
    v_ok := false;
    v_err := 'NO ERROR';
    BEGIN
      PERFORM public.open_client_settlement_event(
        v_ent_a, NULL, '2026-08-05', 'include_transaction_in_settlement',
        100, v_tx1, 'x', 'ev', 'k-str'
      );
    EXCEPTION WHEN OTHERS THEN
      v_err := SQLERRM;
      v_ok := v_err ILIKE '%jj_auth%' OR v_err ILIKE '%not permitted%';
    END;
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('statement_operator_denied', v_ok, v_err);
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('statement_operator_denied', false, SQLERRM);
  END;

  -- CEO happy path: include TX1
  PERFORM pg_temp.set_jwt(v_ceo, 'authenticated');
  EXECUTE 'SET ROLE authenticated';
  v_j := public.open_client_settlement_event(
    v_ent_a, NULL, '2026-08-05', 'include_transaction_in_settlement',
    100, v_tx1, 'include cash one', 'evidence-1', 'k-include-tx1'
  );
  v_id := (v_j->>'id')::uuid;
  PERFORM pg_temp.record('ceo_open_include', (v_j->>'status') = 'open' AND (v_j->>'inserted')::boolean = true, v_j::text);
  v_j := public.approve_client_settlement_event(v_id, 'approve include');
  PERFORM pg_temp.record('ceo_approve_include', (v_j->>'status') = 'approved', v_j::text);
  v_j := public.apply_client_settlement_event(v_id);
  PERFORM pg_temp.record('ceo_apply_include', (v_j->>'status') = 'applied' AND (v_j->>'replay')::boolean = false AND (v_j->>'inserted_count')::int = 0, v_j::text);
  v_j := public.apply_client_settlement_event(v_id);
  PERFORM pg_temp.record(
    'apply_replay_zero_rows',
    (v_j->>'replay')::boolean = true AND (v_j->>'inserted_count')::int = 0 AND (v_j->>'id') = v_id::text,
    v_j::text
  );
  EXECUTE 'RESET ROLE';

  -- finance_admin: noncash credit
  PERFORM pg_temp.set_jwt(v_fin, 'authenticated');
  EXECUTE 'SET ROLE authenticated';
  v_j := public.open_client_settlement_event(
    v_ent_a, v_ent_b, '2026-05-01', 'noncash_settlement_credit',
    75, NULL, 'assignment credit', 'evidence-nc', 'k-noncash-75'
  );
  v_id2 := (v_j->>'id')::uuid;
  PERFORM pg_temp.record('finance_admin_open_noncash', (v_j->>'status') = 'open', v_j::text);
  PERFORM public.approve_client_settlement_event(v_id2, 'approve noncash');
  v_j := public.apply_client_settlement_event(v_id2);
  PERFORM pg_temp.record('finance_admin_apply_noncash', (v_j->>'status') = 'applied', v_j::text);
  EXECUTE 'RESET ROLE';

  -- open idempotent replay
  PERFORM pg_temp.set_jwt(v_ceo, 'authenticated');
  EXECUTE 'SET ROLE authenticated';
  v_j := public.open_client_settlement_event(
    v_ent_a, NULL, '2026-08-05', 'include_transaction_in_settlement',
    100, v_tx1, 'include cash one', 'evidence-1', 'k-include-tx1'
  );
  PERFORM pg_temp.record(
    'open_idempotent_replay',
    (v_j->>'replay')::boolean = true AND (v_j->>'inserted_count')::int = 0 AND (v_j->>'id') = v_id::text,
    v_j::text
  );

  -- duplicate noncash same natural identity
  v_ok := false;
  v_err := 'NO ERROR';
  BEGIN
    PERFORM public.open_client_settlement_event(
      v_ent_a, v_ent_b, '2026-05-01', 'noncash_settlement_credit',
      75, NULL, 'dup', 'ev', 'k-noncash-dup'
    );
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    v_ok := true;
  END;
  PERFORM pg_temp.record('duplicate_noncash_blocked', v_ok, v_err);

  -- amount mismatch
  v_j := public.open_client_settlement_event(
    v_ent_a, NULL, '2026-08-12', 'exclude_transaction_from_settlement',
    999, v_tx2, 'bad amount', 'ev', 'k-ex-bad-amt'
  );
  PERFORM public.approve_client_settlement_event((v_j->>'id')::uuid, 'approve bad');
  v_ok := false;
  v_err := 'NO ERROR';
  BEGIN
    PERFORM public.apply_client_settlement_event((v_j->>'id')::uuid);
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    v_ok := v_err ILIKE '%settlement_amount%';
  END;
  PERFORM pg_temp.record('apply_amount_mismatch', v_ok, v_err);
  PERFORM public.void_client_settlement_event((v_j->>'id')::uuid, 'void bad amount');

  -- exclude TX2 (200)
  v_j := public.open_client_settlement_event(
    v_ent_a, NULL, '2026-08-12', 'exclude_transaction_from_settlement',
    200, v_tx2, 'exclude cash two', 'ev', 'k-ex-tx2'
  );
  PERFORM public.approve_client_settlement_event((v_j->>'id')::uuid, 'approve exclude');
  v_j := public.apply_client_settlement_event((v_j->>'id')::uuid);
  PERFORM pg_temp.record('apply_exclude', (v_j->>'status') = 'applied', v_j::text);

  -- include of same source after exclude blocked
  v_j := public.open_client_settlement_event(
    v_ent_a, NULL, '2026-08-12', 'include_transaction_in_settlement',
    200, v_tx2, 'include after exclude', 'ev', 'k-inc-tx2'
  );
  PERFORM public.approve_client_settlement_event((v_j->>'id')::uuid, 'approve conflict');
  v_ok := false;
  v_err := 'NO ERROR';
  BEGIN
    PERFORM public.apply_client_settlement_event((v_j->>'id')::uuid);
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    v_ok := v_err ILIKE '%include and exclude%' OR v_err ILIKE '%unique%' OR v_err ILIKE '%duplicate%';
  END;
  PERFORM pg_temp.record('include_exclude_conflict', v_ok, v_err);
  PERFORM public.void_client_settlement_event((v_j->>'id')::uuid, 'void conflict include');

  -- cross-client: entity B include of TX1 already applied to A
  v_j := public.open_client_settlement_event(
    v_ent_b, NULL, '2026-08-05', 'include_transaction_in_settlement',
    100, v_tx1, 'other entity', 'ev', 'k-cross'
  );
  PERFORM public.approve_client_settlement_event((v_j->>'id')::uuid, 'approve cross');
  v_ok := false;
  v_err := 'NO ERROR';
  BEGIN
    PERFORM public.apply_client_settlement_event((v_j->>'id')::uuid);
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    v_ok := v_err ILIKE '%another entity%' OR v_err ILIKE '%unique%' OR v_err ILIKE '%duplicate%';
  END;
  PERFORM pg_temp.record('cross_client_blocked', v_ok, v_err);
  PERFORM public.void_client_settlement_event((v_j->>'id')::uuid, 'void cross');

  -- noncash cannot use source
  v_ok := false;
  v_err := 'NO ERROR';
  BEGIN
    PERFORM public.open_client_settlement_event(
      v_ent_a, v_ent_b, '2026-06-01', 'noncash_settlement_credit',
      10, v_tx1, 'illegal source', 'ev', 'k-nc-src'
    );
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    v_ok := v_err ILIKE '%source transaction%';
  END;
  PERFORM pg_temp.record('noncash_rejects_source', v_ok, v_err);
  EXECUTE 'RESET ROLE';

  -- FIFO as table owner (authenticated has no EXECUTE on fifo)
  SELECT count(*)::int, coalesce(sum(settlement_amount),0)
    INTO v_fifo_n, v_fifo_amt
  FROM finance.client_fifo_credits(v_ent_a, '2026-12-31');
  PERFORM pg_temp.record(
    'fifo_credits_two',
    v_fifo_n = 2 AND v_fifo_amt = 175,
    v_fifo_n::text || ' ' || v_fifo_amt::text
  );

  SELECT string_agg(effective_date::text || ':' || settlement_amount::text, ',' ORDER BY effective_date, created_at, event_id)
    INTO v_dates
  FROM finance.client_fifo_credits(v_ent_a, '2026-12-31');
  PERFORM pg_temp.record('fifo_order', v_dates = '2026-05-01:75.00,2026-08-05:100.00', coalesce(v_dates,'null'));

  SELECT count(*)::int INTO v_fifo_n FROM finance.client_fifo_credits(v_ent_a, '2026-04-30');
  PERFORM pg_temp.record('fifo_as_of_cutoff', v_fifo_n = 0, v_fifo_n::text);

  SELECT count(*)::int INTO v_fifo_n FROM finance.client_fifo_credits(v_ent_a, '2026-05-01');
  PERFORM pg_temp.record('fifo_as_of_noncash_only', v_fifo_n = 1, v_fifo_n::text);

  -- void preserves row + log
  PERFORM pg_temp.set_jwt(v_ceo, 'authenticated');
  EXECUTE 'SET ROLE authenticated';
  v_j := public.open_client_settlement_event(
    v_ent_b, v_ent_a, '2026-06-01', 'noncash_settlement_credit',
    15, NULL, 'to void', 'ev', 'k-void-me'
  );
  v_id2 := (v_j->>'id')::uuid;
  PERFORM public.approve_client_settlement_event(v_id2, 'approve void target');
  PERFORM public.apply_client_settlement_event(v_id2);
  v_j := public.void_client_settlement_event(v_id2, 'void after apply');
  EXECUTE 'RESET ROLE';
  SELECT status INTO v_status FROM finance.client_settlement_events WHERE id = v_id2;
  SELECT count(*)::int INTO v_count FROM finance.client_settlement_event_log WHERE event_id = v_id2;
  PERFORM pg_temp.record('void_preserves_row', v_status = 'void' AND v_count >= 2, v_status || ' logs=' || v_count::text);

  v_ok := false;
  v_err := 'NO ERROR';
  BEGIN
    DELETE FROM finance.client_settlement_events WHERE id = v_id2;
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    v_ok := v_err ILIKE '%forbids physical DELETE%';
  END;
  PERFORM pg_temp.record('delete_forbidden', v_ok AND EXISTS (SELECT 1 FROM finance.client_settlement_events WHERE id = v_id2), v_err);

  v_ok := false;
  v_err := 'NO ERROR';
  BEGIN
    UPDATE finance.client_settlement_events SET settlement_amount = 1 WHERE id = v_id2;
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    v_ok := v_err ILIKE '%immutable%';
  END;
  PERFORM pg_temp.record('payload_immutable', v_ok, v_err);

  -- cashbox / pnl / tx fingerprint unchanged
  v_after_fp := pg_temp.tx_fingerprint();
  SELECT total_received INTO v_jacob_after FROM public.v_cashbox_audit WHERE cash_box_name = 'Jacob';
  SELECT net INTO v_pnl_after FROM public.v_jj_pnl_fixture;
  SELECT review_status INTO v_review FROM public.transactions WHERE id = v_tx1;
  PERFORM pg_temp.record('transactions_untouched', v_before_fp = v_after_fp, v_before_fp || ' vs ' || v_after_fp);
  PERFORM pg_temp.record('cashbox_unchanged', v_jacob_before = v_jacob_after AND v_jacob_before = 300, v_jacob_before::text || ' -> ' || v_jacob_after::text);
  PERFORM pg_temp.record('jj_pnl_unchanged', v_pnl_before = v_pnl_after AND v_pnl_before = -50, v_pnl_before::text || ' -> ' || v_pnl_after::text);
  PERFORM pg_temp.record('source_still_active', v_review = 'active', coalesce(v_review,'null'));
END;
$$;

SELECT test_name, passed, detail FROM matrix_result ORDER BY test_name;
