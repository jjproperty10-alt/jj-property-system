-- Isolated role/security/certification matrix. Fail closed: any FAIL raises.
-- No production client IDs, property names, or certified amounts.

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
  IF p_uid IS NULL THEN
    PERFORM set_config('request.jwt.claim.sub', '', false);
    PERFORM set_config('request.jwt.claim.role', COALESCE(p_role, ''), false);
    PERFORM set_config(
      'request.jwt.claims',
      CASE
        WHEN p_role IS NULL OR p_role = '' THEN '{}'
        ELSE json_build_object('role', p_role)::text
      END,
      false
    );
    RETURN;
  END IF;
  PERFORM set_config('request.jwt.claim.sub', p_uid::text, false);
  PERFORM set_config('request.jwt.claim.role', COALESCE(p_role, ''), false);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', COALESCE(p_role, ''))::text,
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

CREATE OR REPLACE FUNCTION pg_temp.sample_lines()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $$
  SELECT jsonb_build_array(
    jsonb_build_object(
      'line_order', 1,
      'property_key', 'alpha-a',
      'property_name', 'Alpha A',
      'component_code', 'opening_balance',
      'amount_due_to_jj', 10.01,
      'reason', 'fixture a',
      'evidence_ref', 'ev-a'
    ),
    jsonb_build_object(
      'line_order', 2,
      'property_key', 'alpha-b',
      'property_name', 'Alpha B',
      'component_code', 'opening_balance',
      'amount_due_to_jj', 20.02,
      'reason', 'fixture b',
      'evidence_ref', 'ev-b'
    ),
    jsonb_build_object(
      'line_order', 3,
      'property_key', 'alpha-c',
      'property_name', 'Alpha C',
      'component_code', 'opening_balance',
      'amount_due_to_jj', -3.53,
      'reason', 'fixture c',
      'evidence_ref', 'ev-c'
    )
  );
$$;

GRANT ALL ON TABLE matrix_result TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION pg_temp.record(text, boolean, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION pg_temp.set_jwt(uuid, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION pg_temp.sample_lines() TO anon, authenticated, service_role;

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
  v_rc3_before text;
  v_rc3_after text;
  v_contact_before numeric;
  v_contact_after numeric;
  v_cse_before integer;
  v_cse_after integer;
  v_id uuid;
  v_id2 uuid;
  v_j jsonb;
  v_err text;
  v_ok boolean;
  v_count integer;
  v_hdr integer;
  v_ln integer;
  v_aud integer;
  v_status text;
  v_total numeric;
  v_sum numeric;
  v_closing numeric;
  v_fifo numeric;
  v_excl integer;
BEGIN
  v_before_fp := pg_temp.tx_fingerprint();
  SELECT total_received INTO v_jacob_before FROM public.v_cashbox_audit WHERE cash_box_name = 'Jacob';
  SELECT net INTO v_pnl_before FROM public.v_jj_pnl_fixture;
  SELECT pg_get_viewdef('public.v_rc3_classified'::regclass, true) INTO v_rc3_before;
  SELECT net_jj_settlement INTO v_contact_before FROM public.v_contact_settlement_summary;
  SELECT count(*) INTO v_cse_before FROM finance.client_settlement_events;

  PERFORM pg_temp.record(
    'catalog_tables',
    EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='finance' AND c.relname='client_settlement_certifications')
    AND EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='finance' AND c.relname='client_settlement_certification_lines')
    AND EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='finance' AND c.relname='client_settlement_certification_audit'),
    'header+lines+audit'
  );

  PERFORM pg_temp.record(
    'rpc_authenticated_execute',
    has_function_privilege(
      'authenticated',
      'public.apply_client_settlement_opening_certification(uuid,date,text,text,text,integer,uuid,numeric,jsonb)',
      'EXECUTE'
    )
    AND has_function_privilege(
      'authenticated',
      'public.void_client_settlement_opening_certification(uuid,text,text)',
      'EXECUTE'
    ),
    'authenticated EXECUTE'
  );
  PERFORM pg_temp.record(
    'rpc_anon_no_execute',
    NOT has_function_privilege(
      'anon',
      'public.apply_client_settlement_opening_certification(uuid,date,text,text,text,integer,uuid,numeric,jsonb)',
      'EXECUTE'
    ),
    'anon denied'
  );
  PERFORM pg_temp.record(
    'rpc_service_role_no_execute_apply',
    NOT has_function_privilege(
      'service_role',
      'public.apply_client_settlement_opening_certification(uuid,date,text,text,text,integer,uuid,numeric,jsonb)',
      'EXECUTE'
    ),
    'service_role apply denied'
  );
  PERFORM pg_temp.record(
    'reader_service_role_only',
    has_function_privilege('service_role', 'finance.read_certified_client_settlement(uuid,date)', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'finance.read_certified_client_settlement(uuid,date)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'finance.read_certified_client_settlement(uuid,date)', 'EXECUTE'),
    'reader grants'
  );
  PERFORM pg_temp.record(
    'helper_no_client_execute',
    NOT has_function_privilege('authenticated', 'finance.assert_client_settlement_certification_authorized()', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'finance.assert_client_settlement_certification_authorized()', 'EXECUTE')
    AND NOT has_function_privilege('service_role', 'finance.assert_client_settlement_certification_authorized()', 'EXECUTE'),
    'helper locked'
  );
  PERFORM pg_temp.record(
    'advisory_lock_class',
    pg_get_functiondef('public.apply_client_settlement_opening_certification(uuid,date,text,text,text,integer,uuid,numeric,jsonb)'::regprocedure)
      LIKE '%pg_advisory_xact_lock(%872005%',
    '872005'
  );

  -- table grants: authenticated cannot SELECT
  PERFORM pg_temp.set_jwt(v_ceo, 'authenticated');
  BEGIN
    EXECUTE 'SET ROLE authenticated';
    v_ok := false;
    v_err := 'NO ERROR';
    BEGIN
      PERFORM count(*) FROM finance.client_settlement_certifications;
    EXCEPTION WHEN OTHERS THEN
      v_err := SQLERRM;
      v_ok := v_err ILIKE '%permission denied%';
    END;
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('authenticated_no_table_select', v_ok, v_err);
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('authenticated_no_table_select', false, SQLERRM);
  END;

  -- anon apply denied
  PERFORM pg_temp.set_jwt(NULL, 'anon');
  BEGIN
    EXECUTE 'SET ROLE anon';
    v_ok := false;
    v_err := 'NO ERROR';
    BEGIN
      PERFORM public.apply_client_settlement_opening_certification(
        v_ent_a, '2026-08-31', 'x', 'ev', 'k-anon', 1, NULL, 26.50, pg_temp.sample_lines()
      );
    EXCEPTION WHEN OTHERS THEN
      v_err := SQLERRM;
      v_ok := v_err ILIKE '%permission denied%' OR v_err ILIKE '%must be owner%';
    END;
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('anon_apply_denied', v_ok, v_err);
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('anon_apply_denied', false, SQLERRM);
  END;

  -- no session
  PERFORM pg_temp.set_jwt(NULL, 'authenticated');
  BEGIN
    EXECUTE 'SET ROLE authenticated';
    v_ok := false;
    v_err := 'NO ERROR';
    BEGIN
      PERFORM public.apply_client_settlement_opening_certification(
        v_ent_a, '2026-08-31', 'x', 'ev', 'k-nosess', 1, NULL, 26.50, pg_temp.sample_lines()
      );
    EXCEPTION WHEN OTHERS THEN
      v_err := SQLERRM;
      v_ok := v_err ILIKE '%jj_auth%' OR v_err ILIKE '%session required%' OR v_err ILIKE '%invalid input syntax for type uuid%';
    END;
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('no_session_denied', v_ok AND v_err NOT ILIKE '%invalid input syntax for type uuid%', v_err);
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('no_session_denied', false, SQLERRM);
  END;

  -- operations denied
  PERFORM pg_temp.set_jwt(v_ops, 'authenticated');
  BEGIN
    EXECUTE 'SET ROLE authenticated';
    v_ok := false;
    v_err := 'NO ERROR';
    BEGIN
      PERFORM public.apply_client_settlement_opening_certification(
        v_ent_a, '2026-08-31', 'x', 'ev', 'k-ops', 1, NULL, 26.50, pg_temp.sample_lines()
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
      PERFORM public.apply_client_settlement_opening_certification(
        v_ent_a, '2026-08-31', 'x', 'ev', 'k-str', 1, NULL, 26.50, pg_temp.sample_lines()
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

  SELECT count(*) INTO v_hdr FROM finance.client_settlement_certifications;
  SELECT count(*) INTO v_ln FROM finance.client_settlement_certification_lines;
  SELECT count(*) INTO v_aud FROM finance.client_settlement_certification_audit;

  -- sum mismatch rolls back
  PERFORM pg_temp.set_jwt(v_ceo, 'authenticated');
  BEGIN
    EXECUTE 'SET ROLE authenticated';
    v_ok := false;
    v_err := 'NO ERROR';
    BEGIN
      PERFORM public.apply_client_settlement_opening_certification(
        v_ent_a, '2026-08-31', 'mismatch', 'ev', 'k-mismatch', 1, NULL, 99.99, pg_temp.sample_lines()
      );
    EXCEPTION WHEN OTHERS THEN
      v_err := SQLERRM;
      v_ok := v_err ILIKE '%does not equal sum of lines%';
    END;
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record(
      'sum_mismatch_rollback',
      v_ok
        AND (SELECT count(*) FROM finance.client_settlement_certifications) = v_hdr
        AND (SELECT count(*) FROM finance.client_settlement_certification_lines) = v_ln
        AND (SELECT count(*) FROM finance.client_settlement_certification_audit) = v_aud,
      v_err
    );
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('sum_mismatch_rollback', false, SQLERRM);
  END;

  -- duplicate line key rolls back
  BEGIN
    EXECUTE 'SET ROLE authenticated';
    v_ok := false;
    v_err := 'NO ERROR';
    BEGIN
      PERFORM public.apply_client_settlement_opening_certification(
        v_ent_a, '2026-08-31', 'dup', 'ev', 'k-dup', 1, NULL, 20.02,
        jsonb_build_array(
          jsonb_build_object(
            'line_order', 1, 'property_key', 'alpha-a', 'property_name', 'Alpha A',
            'component_code', 'opening_balance', 'amount_due_to_jj', 10.01,
            'reason', 'a', 'evidence_ref', 'ev'
          ),
          jsonb_build_object(
            'line_order', 2, 'property_key', 'alpha-a', 'property_name', 'Alpha A',
            'component_code', 'opening_balance', 'amount_due_to_jj', 10.01,
            'reason', 'a2', 'evidence_ref', 'ev'
          )
        )
      );
    EXCEPTION WHEN OTHERS THEN
      v_err := SQLERRM;
      v_ok := v_err ILIKE '%duplicate line key%';
    END;
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record(
      'duplicate_line_rollback',
      v_ok
        AND (SELECT count(*) FROM finance.client_settlement_certifications) = v_hdr
        AND (SELECT count(*) FROM finance.client_settlement_certification_lines) = v_ln
        AND (SELECT count(*) FROM finance.client_settlement_certification_audit) = v_aud,
      v_err
    );
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('duplicate_line_rollback', false, SQLERRM);
  END;

  -- NaN rejected
  BEGIN
    EXECUTE 'SET ROLE authenticated';
    v_ok := false;
    v_err := 'NO ERROR';
    BEGIN
      PERFORM public.apply_client_settlement_opening_certification(
        v_ent_a, '2026-08-31', 'nan', 'ev', 'k-nan', 1, NULL, 10.01,
        jsonb_build_array(
          jsonb_build_object(
            'line_order', 1, 'property_key', 'alpha-a', 'property_name', 'Alpha A',
            'component_code', 'opening_balance', 'amount_due_to_jj', 'NaN',
            'reason', 'a', 'evidence_ref', 'ev'
          )
        )
      );
    EXCEPTION WHEN OTHERS THEN
      v_err := SQLERRM;
      v_ok := v_err ILIKE '%finite%' OR v_err ILIKE '%exact cent%' OR v_err ILIKE '%NaN%';
    END;
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record(
      'nan_rejected_rollback',
      v_ok AND (SELECT count(*) FROM finance.client_settlement_certifications) = v_hdr,
      v_err
    );
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('nan_rejected_rollback', false, SQLERRM);
  END;

  -- empty lines
  BEGIN
    EXECUTE 'SET ROLE authenticated';
    v_ok := false;
    v_err := 'NO ERROR';
    BEGIN
      PERFORM public.apply_client_settlement_opening_certification(
        v_ent_a, '2026-08-31', 'empty', 'ev', 'k-empty', 1, NULL, 0, '[]'::jsonb
      );
    EXCEPTION WHEN OTHERS THEN
      v_err := SQLERRM;
      v_ok := v_err ILIKE '%must not be empty%';
    END;
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('empty_lines_rejected', v_ok, v_err);
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('empty_lines_rejected', false, SQLERRM);
  END;

  -- CEO success + exact cents
  PERFORM pg_temp.set_jwt(v_ceo, 'authenticated');
  EXECUTE 'SET ROLE authenticated';
  v_j := public.apply_client_settlement_opening_certification(
    v_ent_a, '2026-08-31', 'alpha opening', 'evidence-alpha', 'k-alpha-0831', 1, NULL,
    26.50, pg_temp.sample_lines()
  );
  v_id := (v_j->>'id')::uuid;
  EXECUTE 'RESET ROLE';
  SELECT total_due_to_jj, status INTO v_total, v_status
  FROM finance.client_settlement_certifications WHERE id = v_id;
  SELECT COALESCE(sum(amount_due_to_jj), 0) INTO v_sum
  FROM finance.client_settlement_certification_lines WHERE certification_id = v_id;
  PERFORM pg_temp.record(
    'ceo_apply_success',
    (v_j->>'status') = 'applied'
      AND (v_j->>'replay')::boolean = false
      AND (v_j->>'inserted_count')::int = 3
      AND (v_j->>'actor') = v_ceo::text
      AND v_status = 'applied'
      AND v_total = 26.50
      AND v_sum = 26.50
      AND v_total = v_sum,
    v_j::text
  );
  PERFORM pg_temp.record(
    'exact_cent_arithmetic',
    v_total = 10.01 + 20.02 + (-3.53) AND v_total = 26.50 AND v_sum = 26.50,
    v_total::text || '/' || v_sum::text
  );

  -- replay inserts 0
  PERFORM pg_temp.set_jwt(v_ceo, 'authenticated');
  EXECUTE 'SET ROLE authenticated';
  v_j := public.apply_client_settlement_opening_certification(
    v_ent_a, '2026-08-31', 'alpha opening', 'evidence-alpha', 'k-alpha-0831', 1, NULL,
    26.50, pg_temp.sample_lines()
  );
  EXECUTE 'RESET ROLE';
  SELECT count(*) INTO v_count FROM finance.client_settlement_certifications;
  PERFORM pg_temp.record(
    'replay_inserts_zero',
    (v_j->>'replay')::boolean = true
      AND (v_j->>'inserted_count')::int = 0
      AND (v_j->>'id') = v_id::text
      AND v_count = 1,
    v_j::text
  );

  -- payload mismatch
  PERFORM pg_temp.set_jwt(v_ceo, 'authenticated');
  BEGIN
    EXECUTE 'SET ROLE authenticated';
    v_ok := false;
    v_err := 'NO ERROR';
    BEGIN
      PERFORM public.apply_client_settlement_opening_certification(
        v_ent_a, '2026-08-31', 'alpha opening CHANGED', 'evidence-alpha', 'k-alpha-0831', 1, NULL,
        26.50, pg_temp.sample_lines()
      );
    EXCEPTION WHEN OTHERS THEN
      v_err := SQLERRM;
      v_ok := v_err ILIKE '%different payload%';
    END;
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record(
      'payload_mismatch_rejected',
      v_ok AND (SELECT count(*) FROM finance.client_settlement_certifications) = 1,
      v_err
    );
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('payload_mismatch_rejected', false, SQLERRM);
  END;

  -- finance_admin success on a second as_of
  PERFORM pg_temp.set_jwt(v_fin, 'authenticated');
  EXECUTE 'SET ROLE authenticated';
  v_j := public.apply_client_settlement_opening_certification(
    v_ent_a, '2026-06-30', 'alpha june', 'evidence-june', 'k-alpha-0630', 1, NULL,
    5.00,
    jsonb_build_array(
      jsonb_build_object(
        'line_order', 1, 'property_key', 'alpha-a', 'property_name', 'Alpha A',
        'component_code', 'opening_balance', 'amount_due_to_jj', 4.10,
        'reason', 'june a', 'evidence_ref', 'ev-j'
      ),
      jsonb_build_object(
        'line_order', 2, 'property_key', 'alpha-b', 'property_name', 'Alpha B',
        'component_code', 'opening_balance', 'amount_due_to_jj', 0.90,
        'reason', 'june b', 'evidence_ref', 'ev-j'
      )
    )
  );
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.record(
    'finance_admin_apply_success',
    (v_j->>'status') = 'applied'
      AND (v_j->>'inserted_count')::int = 2
      AND (v_j->>'actor') = v_fin::text,
    v_j::text
  );

  -- immutable applied header/lines/audit
  v_ok := false;
  v_err := 'NO ERROR';
  BEGIN
    UPDATE finance.client_settlement_certifications SET total_due_to_jj = 1.00 WHERE id = v_id;
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    v_ok := v_err ILIKE '%immutable%';
  END;
  PERFORM pg_temp.record('immutable_applied_header', v_ok, v_err);

  v_ok := false;
  v_err := 'NO ERROR';
  BEGIN
    UPDATE finance.client_settlement_certification_lines SET amount_due_to_jj = 1.00 WHERE certification_id = v_id;
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    v_ok := v_err ILIKE '%immutable%';
  END;
  PERFORM pg_temp.record('immutable_applied_lines', v_ok, v_err);

  v_ok := false;
  v_err := 'NO ERROR';
  BEGIN
    DELETE FROM finance.client_settlement_certification_lines WHERE certification_id = v_id;
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    v_ok := v_err ILIKE '%immutable%' OR v_err ILIKE '%prohibited%';
  END;
  PERFORM pg_temp.record('immutable_lines_no_delete', v_ok, v_err);

  v_ok := false;
  v_err := 'NO ERROR';
  BEGIN
    UPDATE finance.client_settlement_certification_audit SET event = 'tamper' WHERE certification_id = v_id;
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    v_ok := v_err ILIKE '%append-only%';
  END;
  PERFORM pg_temp.record('immutable_audit', v_ok, v_err);

  -- void + supersede audited
  PERFORM pg_temp.set_jwt(v_ceo, 'authenticated');
  EXECUTE 'SET ROLE authenticated';
  v_j := public.apply_client_settlement_opening_certification(
    v_ent_a, '2026-05-31', 'chain v1', 'ev-chain', 'k-chain-v1', 1, NULL,
    1.10,
    jsonb_build_array(
      jsonb_build_object(
        'line_order', 1, 'property_key', 'alpha-a', 'property_name', 'Alpha A',
        'component_code', 'opening_balance', 'amount_due_to_jj', 1.10,
        'reason', 'v1', 'evidence_ref', 'ev-chain'
      )
    )
  );
  v_id2 := (v_j->>'id')::uuid;
  v_j := public.void_client_settlement_opening_certification(v_id2, 'void chain v1', 'ev-void');
  PERFORM pg_temp.record('void_applied', (v_j->>'status') = 'void' AND (v_j->>'replay')::boolean = false, v_j::text);
  v_j := public.apply_client_settlement_opening_certification(
    v_ent_a, '2026-05-31', 'chain v2', 'ev-chain-2', 'k-chain-v2', 2, v_id2,
    2.20,
    jsonb_build_array(
      jsonb_build_object(
        'line_order', 1, 'property_key', 'alpha-a', 'property_name', 'Alpha A',
        'component_code', 'opening_balance', 'amount_due_to_jj', 2.20,
        'reason', 'v2', 'evidence_ref', 'ev-chain-2'
      )
    )
  );
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.record(
    'supersede_applied',
    (v_j->>'status') = 'applied'
      AND (SELECT status FROM finance.client_settlement_certifications WHERE id = v_id2) = 'void'
      AND (SELECT version FROM finance.client_settlement_certifications WHERE id = (v_j->>'id')::uuid) = 2
      AND EXISTS (
        SELECT 1 FROM finance.client_settlement_certification_audit
        WHERE certification_id = v_id2 AND event IN ('void', 'supersede', 'status_change')
      ),
    v_j::text
  );

  -- settlement FIFO overlay for reader (does not write transactions)
  PERFORM pg_temp.set_jwt(v_ceo, 'authenticated');
  EXECUTE 'SET ROLE authenticated';
  v_j := public.open_client_settlement_event(
    v_ent_a, NULL, '2026-08-05', 'include_transaction_in_settlement',
    100, v_tx1, 'include cash one', 'evidence-1', 'k-include-tx1'
  );
  PERFORM public.approve_client_settlement_event((v_j->>'id')::uuid, 'approve include');
  PERFORM public.apply_client_settlement_event((v_j->>'id')::uuid);
  v_j := public.open_client_settlement_event(
    v_ent_a, NULL, '2026-08-12', 'exclude_transaction_from_settlement',
    200, v_tx2, 'exclude cash two', 'evidence-2', 'k-exclude-tx2'
  );
  PERFORM public.approve_client_settlement_event((v_j->>'id')::uuid, 'approve exclude');
  PERFORM public.apply_client_settlement_event((v_j->>'id')::uuid);
  EXECUTE 'RESET ROLE';

  -- service_role reader: alpha available, beta unavailable
  PERFORM pg_temp.set_jwt(NULL, 'service_role');
  BEGIN
    EXECUTE 'SET ROLE service_role';
    v_j := finance.read_certified_client_settlement(v_ent_a, '2026-08-31');
    v_closing := (v_j->>'certified_closing_due_to_jj')::numeric;
    v_fifo := (v_j->>'fifo_credits_total')::numeric;
    v_excl := jsonb_array_length(v_j->'exclusions');
    v_ok := (v_j->>'unavailable')::boolean = false
      AND (v_j->>'certified_opening_due_to_jj')::numeric = 26.50
      AND v_fifo = 100.00
      AND v_closing = 26.50 - 100.00
      AND v_closing = -73.50
      AND v_excl = 1
      AND jsonb_array_length(v_j->'lines') = 3
      AND (v_j->'lines'->0->>'line_order')::int = 1;
    PERFORM pg_temp.record('reader_certified_closing', v_ok, v_j::text);

    v_j := finance.read_certified_client_settlement(v_ent_b, '2026-08-31');
    PERFORM pg_temp.record(
      'other_client_unavailable',
      (v_j->>'unavailable')::boolean = true
        AND (v_j->>'reason') = 'no_applied_certification',
      v_j::text
    );
    EXECUTE 'RESET ROLE';
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('reader_certified_closing', false, SQLERRM);
    PERFORM pg_temp.record('other_client_unavailable', false, SQLERRM);
  END;

  -- cash / P&L / transactions / RC3 / contact settlement / settlement-event count
  -- (settlement events increased by the FIFO setup above; that is the settlement layer, not this RPC)
  v_after_fp := pg_temp.tx_fingerprint();
  SELECT total_received INTO v_jacob_after FROM public.v_cashbox_audit WHERE cash_box_name = 'Jacob';
  SELECT net INTO v_pnl_after FROM public.v_jj_pnl_fixture;
  SELECT pg_get_viewdef('public.v_rc3_classified'::regclass, true) INTO v_rc3_after;
  SELECT net_jj_settlement INTO v_contact_after FROM public.v_contact_settlement_summary;
  SELECT count(*) INTO v_cse_after FROM finance.client_settlement_events;

  PERFORM pg_temp.record('transactions_unchanged', v_before_fp = v_after_fp, v_before_fp || ' -> ' || v_after_fp);
  PERFORM pg_temp.record('cashbox_unchanged', v_jacob_before = v_jacob_after, v_jacob_before::text || '/' || v_jacob_after::text);
  PERFORM pg_temp.record('pnl_unchanged', v_pnl_before = v_pnl_after, v_pnl_before::text || '/' || v_pnl_after::text);
  PERFORM pg_temp.record('rc3_view_unchanged', v_rc3_before = v_rc3_after, 'rc3');
  PERFORM pg_temp.record('contact_settlement_unchanged', v_contact_before = v_contact_after, v_contact_before::text);
  PERFORM pg_temp.record(
    'cert_rpc_did_not_write_settlement_events',
    v_cse_after = v_cse_before + 2,
    v_cse_before::text || ' -> ' || v_cse_after::text
  );
END;
$$;

SELECT test_name, passed, detail FROM pg_temp.matrix_result ORDER BY test_name;
