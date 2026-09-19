-- Isolated public wrapper matrix. Fail closed: any FAIL raises.
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

CREATE OR REPLACE FUNCTION pg_temp.cert_fingerprint()
RETURNS text
LANGUAGE sql
STABLE
SET search_path TO ''
AS $$
  SELECT
    (SELECT count(*)::text FROM finance.client_settlement_certifications) || ':' ||
    (SELECT count(*)::text FROM finance.client_settlement_certification_lines) || ':' ||
    (SELECT count(*)::text FROM finance.client_settlement_certification_audit) || ':' ||
    md5(COALESCE((
      SELECT string_agg(id::text || '|' || xmin::text || '|' || status || '|' || total_due_to_jj::text, E'\n' ORDER BY id)
      FROM finance.client_settlement_certifications
    ), '')) || ':' ||
    md5(COALESCE((
      SELECT string_agg(certification_id::text || '|' || xmin::text || '|' || line_order::text || '|' || amount_due_to_jj::text, E'\n' ORDER BY certification_id, line_order)
      FROM finance.client_settlement_certification_lines
    ), '')) || ':' ||
    md5(COALESCE((
      SELECT string_agg(id::text || '|' || xmin::text || '|' || event, E'\n' ORDER BY id)
      FROM finance.client_settlement_certification_audit
    ), ''));
$$;

CREATE OR REPLACE FUNCTION pg_temp.settlement_fingerprint()
RETURNS text
LANGUAGE sql
STABLE
SET search_path TO ''
AS $$
  SELECT count(*)::text || ':' || md5(
    COALESCE(string_agg(id::text || '|' || xmin::text || '|' || status || '|' || event_type, E'\n' ORDER BY id), '')
  )
  FROM finance.client_settlement_events;
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
  v_ent_a uuid := '11111111-1111-4111-8111-111111111111';
  v_ent_b uuid := '22222222-2222-4222-8222-222222222222';
  v_oid oid;
  v_def text;
  v_args text;
  v_ret text;
  v_cfg text;
  v_ok boolean;
  v_err text;
  v_j jsonb;
  v_direct jsonb;
  v_wrap jsonb;
  v_unavail_direct jsonb;
  v_unavail_wrap jsonb;
  v_tx_before text;
  v_tx_after text;
  v_cert_before text;
  v_cert_after text;
  v_cse_before text;
  v_cse_after text;
  v_jacob_before numeric;
  v_jacob_after numeric;
  v_pnl_before numeric;
  v_pnl_after numeric;
  v_i integer;
BEGIN
  SELECT p.oid,
         pg_get_function_identity_arguments(p.oid),
         pg_get_function_result(p.oid),
         array_to_string(p.proconfig, ','),
         pg_get_functiondef(p.oid)
    INTO v_oid, v_args, v_ret, v_cfg, v_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'read_certified_client_settlement';

  PERFORM pg_temp.record(
    'function_signature_exact',
    v_oid IS NOT NULL
      AND v_args = 'p_entity_id uuid, p_as_of date'
      AND v_ret = 'jsonb'
      AND (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname = 'read_certified_client_settlement') = 1,
    coalesce(v_args, 'missing') || ' -> ' || coalesce(v_ret, 'missing')
  );

  PERFORM pg_temp.record(
    'security_definer',
    (SELECT prosecdef FROM pg_proc WHERE oid = v_oid) IS TRUE,
    'prosecdef'
  );

  PERFORM pg_temp.record(
    'search_path_empty',
    v_cfg IS NOT NULL
      AND (
        replace(v_cfg, ' ', '') = 'search_path=""'
        OR replace(v_cfg, ' ', '') = 'search_path='''''
      )
      AND v_cfg NOT LIKE '%public%'
      AND v_cfg NOT LIKE '%finance%',
    coalesce(v_cfg, 'null')
  );

  PERFORM pg_temp.record(
    'service_role_execute_true',
    has_function_privilege('service_role', v_oid, 'EXECUTE'),
    'service_role'
  );

  PERFORM pg_temp.record(
    'browser_execute_false',
    NOT has_function_privilege('anon', v_oid, 'EXECUTE')
      AND NOT has_function_privilege('authenticated', v_oid, 'EXECUTE'),
    'anon+authenticated'
  );

  PERFORM pg_temp.record(
    'delegates_only_to_finance_reader',
    v_def LIKE '%RETURN finance.read_certified_client_settlement(p_entity_id, p_as_of);%'
      AND v_def NOT ILIKE '%EXECUTE %'
      AND v_def NOT ILIKE '%format(%'
      AND v_def NOT ILIKE '%INSERT %'
      AND v_def NOT ILIKE '%UPDATE %'
      AND v_def NOT ILIKE '%DELETE %'
      AND v_def NOT ILIKE '%TRUNCATE %'
      AND v_def NOT ILIKE '%LOCK %'
      AND (length(v_def) - length(replace(v_def, 'finance.read_certified_client_settlement', '')))
            / length('finance.read_certified_client_settlement') = 1,
    left(v_def, 400)
  );

  PERFORM pg_temp.record(
    'no_finance_function_or_table_grants_to_browser_roles',
    NOT has_function_privilege('anon', 'finance.read_certified_client_settlement(uuid,date)', 'EXECUTE')
      AND NOT has_function_privilege('authenticated', 'finance.read_certified_client_settlement(uuid,date)', 'EXECUTE')
      AND NOT has_table_privilege('anon', 'finance.client_settlement_certifications', 'SELECT')
      AND NOT has_table_privilege('authenticated', 'finance.client_settlement_certifications', 'SELECT')
      AND NOT has_table_privilege('anon', 'finance.client_settlement_certification_lines', 'SELECT')
      AND NOT has_table_privilege('authenticated', 'finance.client_settlement_certification_lines', 'SELECT'),
    'browser finance locked'
  );

  -- Apply one fixture certification so pass-through can compare live JSONB.
  PERFORM pg_temp.set_jwt(v_ceo, 'authenticated');
  EXECUTE 'SET ROLE authenticated';
  v_j := public.apply_client_settlement_opening_certification(
    v_ent_a, '2026-08-31', 'alpha opening', 'evidence-alpha', 'k-alpha-wrap', 1, NULL,
    26.50, pg_temp.sample_lines()
  );
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.record('fixture_cert_applied', (v_j->>'status') = 'applied', coalesce(v_j::text, 'null'));

  v_tx_before := pg_temp.tx_fingerprint();
  v_cert_before := pg_temp.cert_fingerprint();
  v_cse_before := pg_temp.settlement_fingerprint();
  SELECT total_received INTO v_jacob_before FROM public.v_cashbox_audit WHERE cash_box_name = 'Jacob';
  SELECT net INTO v_pnl_before FROM public.v_jj_pnl_fixture;

  EXECUTE 'SET ROLE service_role';
  v_direct := finance.read_certified_client_settlement(v_ent_a, '2026-08-31');
  v_wrap := public.read_certified_client_settlement(v_ent_a, '2026-08-31');
  v_unavail_direct := finance.read_certified_client_settlement(v_ent_b, '2026-08-31');
  v_unavail_wrap := public.read_certified_client_settlement(v_ent_b, '2026-08-31');
  FOR v_i IN 1..8 LOOP
    PERFORM public.read_certified_client_settlement(v_ent_a, '2026-08-31');
  END LOOP;
  EXECUTE 'RESET ROLE';

  PERFORM pg_temp.record(
    'response_returned_unchanged',
    v_wrap = v_direct
      AND (v_wrap->>'unavailable') = 'false'
      AND (v_wrap->>'certified_opening_due_to_jj') = (v_direct->>'certified_opening_due_to_jj')
      AND (v_wrap->>'certified_closing_due_to_jj') = (v_direct->>'certified_closing_due_to_jj'),
    coalesce(v_wrap::text, 'null')
  );

  PERFORM pg_temp.record(
    'unavailable_returned_unchanged',
    v_unavail_wrap = v_unavail_direct
      AND (v_unavail_wrap->>'unavailable') = 'true'
      AND (v_unavail_wrap->>'reason') = 'no_applied_certification',
    coalesce(v_unavail_wrap::text, 'null')
  );

  v_ok := false;
  v_err := 'NO ERROR';
  BEGIN
    EXECUTE 'SET ROLE service_role';
    PERFORM public.read_certified_client_settlement(NULL::uuid, '2026-08-31'::date);
    EXECUTE 'RESET ROLE';
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    v_ok := v_err ILIKE '%entity_id must be a UUID%';
    EXECUTE 'RESET ROLE';
  END;
  PERFORM pg_temp.record('null_entity_rejected', v_ok, v_err);

  v_ok := false;
  v_err := 'NO ERROR';
  BEGIN
    EXECUTE 'SET ROLE service_role';
    PERFORM public.read_certified_client_settlement(v_ent_a, NULL::date);
    EXECUTE 'RESET ROLE';
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    v_ok := v_err ILIKE '%as_of must be a date%';
    EXECUTE 'RESET ROLE';
  END;
  PERFORM pg_temp.record('null_as_of_rejected', v_ok, v_err);

  v_ok := false;
  v_err := 'NO ERROR';
  BEGIN
    EXECUTE 'SET ROLE authenticated';
    PERFORM public.read_certified_client_settlement(v_ent_a, '2026-08-31');
    EXECUTE 'RESET ROLE';
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    v_ok := v_err ILIKE '%permission denied%';
    EXECUTE 'RESET ROLE';
  END;
  PERFORM pg_temp.record('authenticated_execute_denied', v_ok, v_err);

  v_ok := false;
  v_err := 'NO ERROR';
  BEGIN
    EXECUTE 'SET ROLE anon';
    PERFORM public.read_certified_client_settlement(v_ent_a, '2026-08-31');
    EXECUTE 'RESET ROLE';
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    v_ok := v_err ILIKE '%permission denied%';
    EXECUTE 'RESET ROLE';
  END;
  PERFORM pg_temp.record('anon_execute_denied', v_ok, v_err);

  v_tx_after := pg_temp.tx_fingerprint();
  v_cert_after := pg_temp.cert_fingerprint();
  v_cse_after := pg_temp.settlement_fingerprint();
  SELECT total_received INTO v_jacob_after FROM public.v_cashbox_audit WHERE cash_box_name = 'Jacob';
  SELECT net INTO v_pnl_after FROM public.v_jj_pnl_fixture;

  PERFORM pg_temp.record(
    'wrapper_zero_writes',
    v_tx_before = v_tx_after
      AND v_cert_before = v_cert_after
      AND v_cse_before = v_cse_after
      AND v_jacob_before = v_jacob_after
      AND v_pnl_before = v_pnl_after,
    'tx=' || v_tx_after || ' cert=' || v_cert_after
  );

  PERFORM pg_temp.record(
    'certification_header_lines_audit_unchanged',
    v_cert_before = v_cert_after,
    v_cert_after
  );

  PERFORM pg_temp.record(
    'transactions_cash_pnl_settlement_unchanged',
    v_tx_before = v_tx_after
      AND v_jacob_before = v_jacob_after
      AND v_pnl_before = v_pnl_after
      AND v_cse_before = v_cse_after,
    'tx=' || v_tx_after || ' cse=' || v_cse_after
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
