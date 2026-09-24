-- Isolated role/security/certification matrix. Fail closed: any FAIL is returned.
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
      'month_start', '2026-06-01',
      'reservation_count', 2,
      'nights', 5,
      'owner_net', 10.10,
      'source_authority', 'approved_reconstruction',
      'evidence_ref', 'ev-jun',
      'evidence_note', 'june approved net',
      'component_reconciliation_status', 'partial'
    ),
    jsonb_build_object(
      'line_order', 2,
      'month_start', '2026-07-01',
      'owner_net', 0.00,
      'source_authority', 'owner_statement',
      'evidence_ref', 'ev-jul',
      'evidence_note', 'july zero net',
      'component_reconciliation_status', 'certified_total_only'
    ),
    jsonb_build_object(
      'line_order', 3,
      'month_start', '2026-08-01',
      'reservation_count', 1,
      'nights', 3,
      'owner_net', -1.25,
      'source_authority', 'platform_statement',
      'evidence_ref', 'ev-aug',
      'evidence_note', 'august negative net',
      'component_reconciliation_status', 'partial',
      'gross_accommodation', 4.00
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
  v_prop_a uuid := '12121212-1212-4212-8212-121212121212';
  v_prop_b uuid := '13131313-1313-4313-8313-131313131313';
  v_apply text := 'public.apply_str_monthly_settlement_certification(uuid,uuid,date,date,integer,uuid,numeric,text,text,text,jsonb)';
  v_void text := 'public.void_str_monthly_settlement_certification(uuid,text,text)';
  v_fin_read text := 'finance.read_certified_str_monthly_settlement(uuid,uuid,date,date)';
  v_pub_read text := 'public.read_certified_str_monthly_settlement(uuid,uuid,date,date)';
  v_before_fp text;
  v_after_fp text;
  v_jacob_before numeric;
  v_jacob_after numeric;
  v_pnl_before numeric;
  v_pnl_after numeric;
  v_csc_before integer;
  v_csc_after integer;
  v_cse_before integer;
  v_cse_after integer;
  v_tx_before integer;
  v_tx_after integer;
  v_id uuid;
  v_id2 uuid;
  v_j jsonb;
  v_err text;
  v_ok boolean;
  v_count integer;
  v_hdr integer;
  v_ln integer;
  v_aud integer;
  v_sig text;
  v_def boolean;
  v_volatile "char";
  v_config text;
  v_sum numeric;
  v_gross numeric;
  v_platform numeric;
  v_nights integer;
  v_res integer;
  v_status text;
  v_guest integer;
BEGIN
  v_before_fp := pg_temp.tx_fingerprint();
  SELECT total_received INTO v_jacob_before FROM public.v_cashbox_audit WHERE cash_box_name = 'Jacob';
  SELECT net INTO v_pnl_before FROM public.v_jj_pnl_fixture;
  SELECT count(*) INTO v_csc_before FROM finance.client_settlement_certifications;
  SELECT count(*) INTO v_cse_before FROM finance.client_settlement_events;
  SELECT count(*) INTO v_tx_before FROM public.transactions;

  SELECT pg_get_function_identity_arguments(p.oid), p.prosecdef, p.provolatile, p.proconfig::text
    INTO v_sig, v_def, v_volatile, v_config
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'apply_str_monthly_settlement_certification';
  PERFORM pg_temp.record(
    'apply_signature_definer_search_path',
    v_sig = 'p_entity_id uuid, p_property_id uuid, p_period_from date, p_period_to date, p_version integer, p_supersedes_id uuid, p_total_owner_net numeric, p_reason text, p_evidence_ref text, p_idempotency_key text, p_lines jsonb'
      AND v_def
      AND v_volatile = 'v'
      AND v_config LIKE '%search_path=%',
    COALESCE(v_sig, 'missing') || ' def=' || COALESCE(v_def::text, '') || ' cfg=' || COALESCE(v_config, '')
  );

  SELECT pg_get_function_identity_arguments(p.oid), p.prosecdef, p.provolatile, p.proconfig::text
    INTO v_sig, v_def, v_volatile, v_config
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'read_certified_str_monthly_settlement';
  PERFORM pg_temp.record(
    'public_reader_signature_stable_definer',
    v_sig = 'p_entity_id uuid, p_property_id uuid, p_period_from date, p_period_to date'
      AND v_def
      AND v_volatile = 's'
      AND v_config LIKE '%search_path=%',
    COALESCE(v_sig, 'missing')
  );

  SELECT p.prosecdef, p.provolatile, p.proconfig::text
    INTO v_def, v_volatile, v_config
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'finance' AND p.proname = 'read_certified_str_monthly_settlement';
  PERFORM pg_temp.record(
    'finance_reader_stable_invoker',
    v_def = false AND v_volatile = 's' AND v_config LIKE '%search_path=%',
    COALESCE(v_config, '')
  );

  PERFORM pg_temp.record(
    'rpc_authenticated_execute',
    has_function_privilege('authenticated', v_apply, 'EXECUTE')
      AND has_function_privilege('authenticated', v_void, 'EXECUTE'),
    'authenticated EXECUTE'
  );
  PERFORM pg_temp.record(
    'rpc_anon_no_execute',
    NOT has_function_privilege('anon', v_apply, 'EXECUTE')
      AND NOT has_function_privilege('anon', v_void, 'EXECUTE')
      AND NOT has_function_privilege('anon', v_pub_read, 'EXECUTE'),
    'anon denied'
  );
  PERFORM pg_temp.record(
    'rpc_service_role_no_execute_apply',
    NOT has_function_privilege('service_role', v_apply, 'EXECUTE')
      AND NOT has_function_privilege('service_role', v_void, 'EXECUTE'),
    'service_role apply denied'
  );
  PERFORM pg_temp.record(
    'public_reader_service_role_only',
    has_function_privilege('service_role', v_pub_read, 'EXECUTE')
      AND NOT has_function_privilege('authenticated', v_pub_read, 'EXECUTE')
      AND NOT has_function_privilege('anon', v_pub_read, 'EXECUTE'),
    'public reader grants'
  );
  PERFORM pg_temp.record(
    'finance_reader_postgres_only',
    has_function_privilege('postgres', v_fin_read, 'EXECUTE')
      AND NOT has_function_privilege('service_role', v_fin_read, 'EXECUTE')
      AND NOT has_function_privilege('authenticated', v_fin_read, 'EXECUTE')
      AND NOT has_function_privilege('anon', v_fin_read, 'EXECUTE'),
    'finance reader locked'
  );
  PERFORM pg_temp.record(
    'force_rls_deny_all',
    (
      SELECT bool_and(c.relrowsecurity AND c.relforcerowsecurity)
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'finance'
        AND c.relname IN (
          'str_monthly_settlement_certifications',
          'str_monthly_settlement_lines',
          'str_monthly_settlement_audit'
        )
    )
    AND (
      SELECT count(*) = 3
      FROM pg_policy pol
      JOIN pg_class c ON c.oid = pol.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'finance'
        AND c.relname LIKE 'str_monthly_settlement%'
        AND pol.polcmd = '*'
        AND pg_get_expr(pol.polqual, pol.polrelid) = 'false'
        AND pg_get_expr(pol.polwithcheck, pol.polrelid) = 'false'
    ),
    'rls'
  );
  PERFORM pg_temp.record(
    'advisory_lock_class',
    pg_get_functiondef(v_apply::regprocedure) LIKE '%pg_advisory_xact_lock(%872117%',
    '872117'
  );
  PERFORM pg_temp.record(
    'no_guest_columns',
    NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'finance'
        AND table_name LIKE 'str_monthly_settlement%'
        AND column_name ~* 'guest|email|phone'
    ),
    'columns'
  );
  PERFORM pg_temp.record(
    'no_pms_schema',
    to_regnamespace('pms') IS NULL,
    'pms'
  );

  PERFORM pg_temp.set_jwt(v_ceo, 'authenticated');
  BEGIN
    EXECUTE 'SET ROLE authenticated';
    v_ok := false;
    v_err := 'NO ERROR';
    BEGIN
      PERFORM count(*) FROM finance.str_monthly_settlement_certifications;
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

  PERFORM pg_temp.set_jwt(NULL, 'anon');
  BEGIN
    EXECUTE 'SET ROLE anon';
    v_ok := false;
    v_err := 'NO ERROR';
    BEGIN
      PERFORM public.apply_str_monthly_settlement_certification(
        v_ent_a, v_prop_a, '2026-06-01', '2026-08-31', 1, NULL, 8.85, 'x', 'ev', 'k-anon', pg_temp.sample_lines()
      );
    EXCEPTION WHEN OTHERS THEN
      v_err := SQLERRM;
      v_ok := v_err ILIKE '%permission denied%';
    END;
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('anon_apply_denied', v_ok, v_err);
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('anon_apply_denied', false, SQLERRM);
  END;

  PERFORM pg_temp.set_jwt(v_ceo, 'service_role');
  BEGIN
    EXECUTE 'SET ROLE service_role';
    v_ok := false;
    v_err := 'NO ERROR';
    BEGIN
      PERFORM public.apply_str_monthly_settlement_certification(
        v_ent_a, v_prop_a, '2026-06-01', '2026-08-31', 1, NULL, 8.85, 'x', 'ev', 'k-svc', pg_temp.sample_lines()
      );
    EXCEPTION WHEN OTHERS THEN
      v_err := SQLERRM;
      v_ok := v_err ILIKE '%permission denied%';
    END;
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('service_role_apply_denied', v_ok, v_err);
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('service_role_apply_denied', false, SQLERRM);
  END;

  PERFORM pg_temp.set_jwt(NULL, 'authenticated');
  BEGIN
    EXECUTE 'SET ROLE authenticated';
    v_ok := false;
    v_err := 'NO ERROR';
    BEGIN
      PERFORM public.apply_str_monthly_settlement_certification(
        v_ent_a, v_prop_a, '2026-06-01', '2026-08-31', 1, NULL, 8.85, 'x', 'ev', 'k-null', pg_temp.sample_lines()
      );
    EXCEPTION WHEN OTHERS THEN
      v_err := SQLERRM;
      v_ok := v_err ILIKE '%Authenticated session required%';
    END;
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('null_actor_denied', v_ok, v_err);
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('null_actor_denied', false, SQLERRM);
  END;

  PERFORM pg_temp.set_jwt(v_ops, 'authenticated');
  BEGIN
    EXECUTE 'SET ROLE authenticated';
    v_ok := false;
    v_err := 'NO ERROR';
    BEGIN
      PERFORM public.apply_str_monthly_settlement_certification(
        v_ent_a, v_prop_a, '2026-06-01', '2026-08-31', 1, NULL, 8.85, 'x', 'ev', 'k-ops', pg_temp.sample_lines()
      );
    EXCEPTION WHEN OTHERS THEN
      v_err := SQLERRM;
      v_ok := v_err ILIKE '%not permitted%';
    END;
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('operations_denied', v_ok, v_err);
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('operations_denied', false, SQLERRM);
  END;

  PERFORM pg_temp.set_jwt(v_str, 'authenticated');
  BEGIN
    EXECUTE 'SET ROLE authenticated';
    v_ok := false;
    v_err := 'NO ERROR';
    BEGIN
      PERFORM public.apply_str_monthly_settlement_certification(
        v_ent_a, v_prop_a, '2026-06-01', '2026-08-31', 1, NULL, 8.85, 'x', 'ev', 'k-str', pg_temp.sample_lines()
      );
    EXCEPTION WHEN OTHERS THEN
      v_err := SQLERRM;
      v_ok := v_err ILIKE '%not permitted%';
    END;
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('statement_operator_denied', v_ok, v_err);
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('statement_operator_denied', false, SQLERRM);
  END;

  PERFORM pg_temp.set_jwt(v_ceo, 'authenticated');
  v_j := public.apply_str_monthly_settlement_certification(
    v_ent_a, v_prop_a, '2026-06-01', '2026-08-31', 1, NULL, 8.85,
    'alpha monthly', 'ev-alpha', 'k-alpha', pg_temp.sample_lines()
  );
  v_id := (v_j->>'id')::uuid;
  PERFORM pg_temp.record(
    'ceo_three_lines_atomic',
    (v_j->>'inserted_count')::int = 3
      AND (v_j->>'replay')::boolean = false
      AND v_j->>'status' = 'applied'
      AND (SELECT count(*) FROM finance.str_monthly_settlement_lines l WHERE l.certification_id = v_id) = 3
      AND (SELECT count(*) FROM finance.str_monthly_settlement_audit a WHERE a.certification_id = v_id AND a.event = 'insert') = 1
      AND (SELECT count(*) FROM finance.str_monthly_settlement_audit a WHERE a.certification_id = v_id AND a.event = 'approve') = 1
      AND (SELECT count(*) FROM finance.str_monthly_settlement_audit a WHERE a.certification_id = v_id AND a.event = 'apply') = 1
      AND (SELECT count(*) FROM finance.str_monthly_settlement_audit a WHERE a.certification_id = v_id AND a.event = 'line_insert') = 3
      AND (SELECT count(DISTINCT a.transaction_id) FROM finance.str_monthly_settlement_audit a WHERE a.certification_id = v_id) = 1,
    v_j::text
  );

  SELECT l.reservation_count, l.nights, l.gross_accommodation, l.platform_fee
    INTO v_res, v_nights, v_gross, v_platform
  FROM finance.str_monthly_settlement_lines l
  WHERE l.certification_id = v_id AND l.month_start = '2026-07-01';
  PERFORM pg_temp.record(
    'missing_counts_and_components_stay_null',
    v_res IS NULL AND v_nights IS NULL AND v_gross IS NULL AND v_platform IS NULL,
    COALESCE(v_res::text, 'null') || '/' || COALESCE(v_nights::text, 'null')
  );

  SELECT l.owner_net, l.gross_accommodation, l.platform_fee
    INTO v_sum, v_gross, v_platform
  FROM finance.str_monthly_settlement_lines l
  WHERE l.certification_id = v_id AND l.month_start = '2026-08-01';
  PERFORM pg_temp.record(
    'negative_net_and_partial_component',
    v_sum = -1.25 AND v_gross = 4.00 AND v_platform IS NULL,
    v_sum::text
  );

  SELECT l.owner_net INTO v_sum
  FROM finance.str_monthly_settlement_lines l
  WHERE l.certification_id = v_id AND l.month_start = '2026-07-01';
  PERFORM pg_temp.record('zero_owner_net_accepted', v_sum = 0.00, v_sum::text);

  SELECT COALESCE(sum(l.owner_net), 0) INTO v_sum
  FROM finance.str_monthly_settlement_lines l
  WHERE l.certification_id = v_id;
  PERFORM pg_temp.record(
    'line_sum_equals_header',
    v_sum = 8.85
      AND (SELECT c.total_owner_net FROM finance.str_monthly_settlement_certifications c WHERE c.id = v_id) = 8.85,
    v_sum::text
  );

  v_j := public.apply_str_monthly_settlement_certification(
    v_ent_a, v_prop_a, '2026-06-01', '2026-08-31', 1, NULL, 8.85,
    'alpha monthly', 'ev-alpha', 'k-alpha', pg_temp.sample_lines()
  );
  PERFORM pg_temp.record(
    'replay_zero_inserts',
    (v_j->>'id')::uuid = v_id
      AND (v_j->>'inserted_count')::int = 0
      AND (v_j->>'replay')::boolean = true
      AND (SELECT count(*) FROM finance.str_monthly_settlement_certifications c WHERE c.idempotency_key = 'k-alpha') = 1,
    v_j::text
  );

  BEGIN
    PERFORM public.apply_str_monthly_settlement_certification(
      v_ent_a, v_prop_a, '2026-06-01', '2026-08-31', 1, NULL, 8.85,
      'alpha monthly changed', 'ev-alpha', 'k-alpha', pg_temp.sample_lines()
    );
    PERFORM pg_temp.record('idempotency_mismatch_fails', false, 'no error');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.record(
      'idempotency_mismatch_fails',
      SQLERRM ILIKE '%different payload%',
      SQLERRM
    );
  END;

  BEGIN
    PERFORM public.apply_str_monthly_settlement_certification(
      v_ent_a, v_prop_a, '2026-06-01', '2026-08-31', 1, NULL, 9.00,
      'bad sum', 'ev-bad', 'k-bad-sum', pg_temp.sample_lines()
    );
    PERFORM pg_temp.record('sum_mismatch_rolls_back', false, 'no error');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.record(
      'sum_mismatch_rolls_back',
      SQLERRM ILIKE '%does not equal sum%'
        AND NOT EXISTS (SELECT 1 FROM finance.str_monthly_settlement_certifications c WHERE c.idempotency_key = 'k-bad-sum'),
      SQLERRM
    );
  END;

  BEGIN
    PERFORM public.apply_str_monthly_settlement_certification(
      v_ent_a, v_prop_a, '2026-06-01', '2026-08-31', 1, NULL, 8.85,
      'bad month', 'ev-bad', 'k-bad-month',
      jsonb_build_array(jsonb_build_object(
        'line_order', 1, 'month_start', '2026-06-15', 'owner_net', 8.85,
        'source_authority', 'owner_statement', 'evidence_ref', 'ev', 'evidence_note', 'note',
        'component_reconciliation_status', 'certified_total_only'
      ))
    );
    PERFORM pg_temp.record('invalid_month_start_rejected', false, 'no error');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.record('invalid_month_start_rejected', SQLERRM ILIKE '%first day%', SQLERRM);
  END;

  BEGIN
    PERFORM public.apply_str_monthly_settlement_certification(
      v_ent_a, v_prop_a, '2026-06-01', '2026-08-31', 1, NULL, 8.85,
      'outside', 'ev-bad', 'k-outside',
      jsonb_build_array(jsonb_build_object(
        'line_order', 1, 'month_start', '2026-09-01', 'owner_net', 8.85,
        'source_authority', 'owner_statement', 'evidence_ref', 'ev', 'evidence_note', 'note',
        'component_reconciliation_status', 'certified_total_only'
      ))
    );
    PERFORM pg_temp.record('month_outside_period_rejected', false, 'no error');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.record('month_outside_period_rejected', SQLERRM ILIKE '%outside%', SQLERRM);
  END;

  BEGIN
    PERFORM public.apply_str_monthly_settlement_certification(
      v_ent_a, v_prop_a, '2026-06-01', '2026-08-31', 1, NULL, 8.85,
      'dup month', 'ev-bad', 'k-dup-month',
      jsonb_build_array(
        jsonb_build_object(
          'line_order', 1, 'month_start', '2026-06-01', 'owner_net', 4.00,
          'source_authority', 'owner_statement', 'evidence_ref', 'ev', 'evidence_note', 'note',
          'component_reconciliation_status', 'certified_total_only'
        ),
        jsonb_build_object(
          'line_order', 2, 'month_start', '2026-06-01', 'owner_net', 4.85,
          'source_authority', 'owner_statement', 'evidence_ref', 'ev', 'evidence_note', 'note',
          'component_reconciliation_status', 'certified_total_only'
        )
      )
    );
    PERFORM pg_temp.record('duplicate_month_rejected', false, 'no error');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.record('duplicate_month_rejected', SQLERRM ILIKE '%duplicate month%', SQLERRM);
  END;

  BEGIN
    PERFORM public.apply_str_monthly_settlement_certification(
      v_ent_a, v_prop_a, '2026-06-01', '2026-08-31', 1, NULL, 8.85,
      'dup order', 'ev-bad', 'k-dup-order',
      jsonb_build_array(
        jsonb_build_object(
          'line_order', 1, 'month_start', '2026-06-01', 'owner_net', 4.00,
          'source_authority', 'owner_statement', 'evidence_ref', 'ev', 'evidence_note', 'note',
          'component_reconciliation_status', 'certified_total_only'
        ),
        jsonb_build_object(
          'line_order', 1, 'month_start', '2026-07-01', 'owner_net', 4.85,
          'source_authority', 'owner_statement', 'evidence_ref', 'ev', 'evidence_note', 'note',
          'component_reconciliation_status', 'certified_total_only'
        )
      )
    );
    PERFORM pg_temp.record('duplicate_line_order_rejected', false, 'no error');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.record('duplicate_line_order_rejected', SQLERRM ILIKE '%duplicate line_order%', SQLERRM);
  END;

  BEGIN
    PERFORM public.apply_str_monthly_settlement_certification(
      v_ent_a, v_prop_a, '2026-06-01', '2026-06-30', 1, NULL, 'NaN'::numeric,
      'nan', 'ev-bad', 'k-nan',
      jsonb_build_array(jsonb_build_object(
        'line_order', 1, 'month_start', '2026-06-01', 'owner_net', 1.00,
        'source_authority', 'owner_statement', 'evidence_ref', 'ev', 'evidence_note', 'note',
        'component_reconciliation_status', 'certified_total_only'
      ))
    );
    PERFORM pg_temp.record('nan_rejected', false, 'no error');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.record('nan_rejected', SQLERRM ILIKE '%finite exact-cent%', SQLERRM);
  END;

  BEGIN
    PERFORM public.apply_str_monthly_settlement_certification(
      v_ent_b, v_prop_b, '2026-06-01', '2026-08-31', 2, v_id, 1.00,
      'bad supersede', 'ev-bad', 'k-bad-super',
      jsonb_build_array(jsonb_build_object(
        'line_order', 1, 'month_start', '2026-06-01', 'owner_net', 1.00,
        'source_authority', 'owner_statement', 'evidence_ref', 'ev', 'evidence_note', 'note',
        'component_reconciliation_status', 'certified_total_only'
      ))
    );
    PERFORM pg_temp.record('bad_supersede_does_not_void', false, 'no error');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.record(
      'bad_supersede_does_not_void',
      SQLERRM ILIKE '%same entity/property/period%'
        AND (SELECT c.status FROM finance.str_monthly_settlement_certifications c WHERE c.id = v_id) = 'applied',
      SQLERRM
    );
  END;

  v_hdr := (SELECT count(*) FROM finance.str_monthly_settlement_certifications);
  BEGIN
    CREATE OR REPLACE FUNCTION finance.str_monthly_settlement_audit_write(
      p_certification_id UUID,
      p_line_id          UUID,
      p_event            TEXT,
      p_actor            UUID,
      p_old_row          JSONB,
      p_new_row          JSONB,
      p_reason           TEXT,
      p_evidence_ref     TEXT
    )
    RETURNS VOID
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $fail$
    BEGIN
      RAISE EXCEPTION 'forced audit failure';
    END;
    $fail$;
    PERFORM public.apply_str_monthly_settlement_certification(
      v_ent_b, v_prop_b, '2026-06-01', '2026-08-31', 1, NULL, 1.00,
      'audit fail', 'ev-fail', 'k-audit-fail',
      jsonb_build_array(jsonb_build_object(
        'line_order', 1, 'month_start', '2026-06-01', 'owner_net', 1.00,
        'source_authority', 'owner_statement', 'evidence_ref', 'ev', 'evidence_note', 'note',
        'component_reconciliation_status', 'certified_total_only'
      ))
    );
    PERFORM pg_temp.record('forced_audit_failure_rolls_back', false, 'no error');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.record(
      'forced_audit_failure_rolls_back',
      SQLERRM ILIKE '%forced audit failure%'
        AND (SELECT count(*) FROM finance.str_monthly_settlement_certifications) = v_hdr
        AND NOT EXISTS (SELECT 1 FROM finance.str_monthly_settlement_certifications c WHERE c.idempotency_key = 'k-audit-fail'),
      SQLERRM
    );
  END;

  PERFORM pg_temp.set_jwt(v_fin, 'authenticated');
  v_j := public.apply_str_monthly_settlement_certification(
    v_ent_b, v_prop_b, '2026-06-01', '2026-08-31', 1, NULL, 1.50,
    'beta monthly', 'ev-beta', 'k-beta',
    jsonb_build_array(jsonb_build_object(
      'line_order', 1, 'month_start', '2026-06-01', 'owner_net', 1.50,
      'source_authority', 'approved_reconstruction', 'evidence_ref', 'ev-beta-line',
      'evidence_note', 'beta june', 'component_reconciliation_status', 'certified_total_only'
    ))
  );
  PERFORM pg_temp.record(
    'finance_admin_success',
    (v_j->>'inserted_count')::int = 1 AND v_j->>'actor' = v_fin::text AND v_j->>'status' = 'applied',
    v_j::text
  );

  PERFORM pg_temp.set_jwt(v_ceo, 'authenticated');
  v_j := public.apply_str_monthly_settlement_certification(
    v_ent_a, v_prop_a, '2026-06-01', '2026-08-31', 2, v_id, 3.00,
    'alpha v2', 'ev-alpha-v2', 'k-alpha-v2',
    jsonb_build_array(jsonb_build_object(
      'line_order', 1, 'month_start', '2026-06-01', 'owner_net', 3.00,
      'source_authority', 'owner_statement', 'evidence_ref', 'ev-v2',
      'evidence_note', 'version two', 'component_reconciliation_status', 'certified_total_only'
    ))
  );
  v_id2 := (v_j->>'id')::uuid;
  PERFORM pg_temp.record(
    'supersession_audited_atomic',
    (v_j->>'inserted_count')::int = 1
      AND (SELECT c.status FROM finance.str_monthly_settlement_certifications c WHERE c.id = v_id) = 'void'
      AND (SELECT c.status FROM finance.str_monthly_settlement_certifications c WHERE c.id = v_id2) = 'applied'
      AND EXISTS (
        SELECT 1 FROM finance.str_monthly_settlement_audit a
        WHERE a.certification_id = v_id AND a.event = 'supersede'
      )
      AND EXISTS (
        SELECT 1 FROM finance.str_monthly_settlement_lines l WHERE l.certification_id = v_id
      ),
    v_j::text
  );

  BEGIN
    UPDATE finance.str_monthly_settlement_certifications
       SET total_owner_net = 1
     WHERE id = v_id2;
    PERFORM pg_temp.record('applied_header_immutable', false, 'update succeeded');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.record('applied_header_immutable', SQLERRM ILIKE '%immutable%', SQLERRM);
  END;

  BEGIN
    UPDATE finance.str_monthly_settlement_lines
       SET owner_net = 0
     WHERE certification_id = v_id2;
    PERFORM pg_temp.record('applied_lines_immutable', false, 'update succeeded');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.record('applied_lines_immutable', SQLERRM ILIKE '%immutable%', SQLERRM);
  END;

  BEGIN
    DELETE FROM finance.str_monthly_settlement_certifications WHERE id = v_id2;
    PERFORM pg_temp.record('header_delete_denied', false, 'delete succeeded');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.record('header_delete_denied', SQLERRM ILIKE '%DELETE%', SQLERRM);
  END;

  BEGIN
    UPDATE finance.str_monthly_settlement_audit SET reason = 'changed' WHERE certification_id = v_id2;
    PERFORM pg_temp.record('audit_update_denied', false, 'update succeeded');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.record('audit_update_denied', SQLERRM ILIKE '%append-only%', SQLERRM);
  END;

  BEGIN
    DELETE FROM finance.str_monthly_settlement_audit WHERE certification_id = v_id2;
    PERFORM pg_temp.record('audit_delete_denied', false, 'delete succeeded');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.record('audit_delete_denied', SQLERRM ILIKE '%append-only%', SQLERRM);
  END;

  v_j := public.read_certified_str_monthly_settlement(
    v_ent_a, v_prop_a, '2026-06-01', '2026-08-31'
  );
  PERFORM pg_temp.record(
    'exact_period_reader',
    (v_j->>'unavailable')::boolean = false
      AND (v_j->>'certification_id')::uuid = v_id2
      AND (v_j->'reconciliation'->>'status') = 'exact'
      AND (v_j->'reconciliation'->>'difference')::numeric = 0
      AND (v_j->'reconciliation'->>'monthly_sum')::numeric = 3.00
      AND jsonb_array_length(v_j->'months') = 1
      AND v_j::text NOT ILIKE '%guest%',
    v_j::text
  );

  v_j := public.read_certified_str_monthly_settlement(
    v_ent_a, v_prop_a, '2026-05-01', '2026-07-31'
  );
  PERFORM pg_temp.record(
    'unavailable_for_other_period',
    (v_j->>'unavailable')::boolean = true
      AND v_j->>'reason' = 'no_applied_certification'
      AND NOT (v_j ? 'total_owner_net'),
    v_j::text
  );

  v_j := public.read_certified_str_monthly_settlement(
    v_ent_b, v_prop_a, '2026-06-01', '2026-08-31'
  );
  PERFORM pg_temp.record(
    'other_client_unchanged',
    (v_j->>'unavailable')::boolean = true
      AND (SELECT count(*) FROM finance.str_monthly_settlement_certifications c WHERE c.entity_id = v_ent_b AND c.property_id = v_prop_a) = 0
      AND (SELECT c.status FROM finance.str_monthly_settlement_certifications c WHERE c.idempotency_key = 'k-beta') = 'applied',
    v_j::text
  );

  v_j := finance.read_certified_str_monthly_settlement(
    v_ent_a, v_prop_a, '2026-06-01', '2026-08-31'
  );
  PERFORM pg_temp.record(
    'finance_reader_matches_public_wrapper',
    (v_j->>'certification_id')::uuid = v_id2 AND (v_j->>'unavailable')::boolean = false,
    v_j->>'certification_id'
  );

  SELECT count(*) INTO v_guest
  FROM finance.str_monthly_settlement_lines l
  WHERE l.evidence_note ILIKE '%guest%' OR l.evidence_ref ILIKE '%guest%';
  PERFORM pg_temp.record('no_guest_pii_rows', v_guest = 0, v_guest::text);

  v_after_fp := pg_temp.tx_fingerprint();
  SELECT total_received INTO v_jacob_after FROM public.v_cashbox_audit WHERE cash_box_name = 'Jacob';
  SELECT net INTO v_pnl_after FROM public.v_jj_pnl_fixture;
  SELECT count(*) INTO v_csc_after FROM finance.client_settlement_certifications;
  SELECT count(*) INTO v_cse_after FROM finance.client_settlement_events;
  SELECT count(*) INTO v_tx_after FROM public.transactions;
  PERFORM pg_temp.record('no_public_transactions_writes', v_before_fp = v_after_fp AND v_tx_before = v_tx_after, v_before_fp || ' -> ' || v_after_fp);
  PERFORM pg_temp.record('no_cashbox_writes', v_jacob_before = v_jacob_after, v_jacob_before::text);
  PERFORM pg_temp.record('no_pnl_writes', v_pnl_before = v_pnl_after, v_pnl_before::text);
  PERFORM pg_temp.record('no_existing_certification_writes', v_csc_before = v_csc_after, v_csc_after::text);
  PERFORM pg_temp.record('no_settlement_event_writes', v_cse_before = v_cse_after, v_cse_after::text);

  SELECT c.status INTO v_status
  FROM finance.str_monthly_settlement_certifications c
  WHERE c.id = v_id2;
  PERFORM pg_temp.record('applied_row_survives_matrix', v_status = 'applied', COALESCE(v_status, 'missing'));
END;
$$;

SELECT test_name, passed, detail
FROM matrix_result
ORDER BY test_name;
