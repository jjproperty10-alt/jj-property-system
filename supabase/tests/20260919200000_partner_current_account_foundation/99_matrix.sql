-- Isolated partner-current-account matrix. Disposable database only.
-- No Production. No Tamir. No Production actor UUIDs.

CREATE TEMP TABLE matrix_result (
  test_name text PRIMARY KEY,
  passed boolean NOT NULL,
  detail text NOT NULL
);

CREATE OR REPLACE FUNCTION pg_temp.record(p_name text, p_ok boolean, p_detail text)
RETURNS void LANGUAGE sql SET search_path TO '' AS $$
  INSERT INTO pg_temp.matrix_result VALUES (p_name, p_ok, COALESCE(p_detail, ''))
  ON CONFLICT (test_name) DO UPDATE SET passed = EXCLUDED.passed, detail = EXCLUDED.detail;
$$;

CREATE OR REPLACE FUNCTION pg_temp.set_jwt(p_uid uuid, p_role text)
RETURNS void LANGUAGE plpgsql SET search_path TO '' AS $$
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
  v_zeta uuid := '66666666-6666-4666-8666-666666666666';
  v_north uuid := '81818181-8181-4818-8818-818181818181';
  v_south uuid := '82828282-8282-4828-8828-828282828282';
  v_inactive_p uuid := '83838383-8383-4838-8838-838383838383';
  v_pz uuid := '12121212-1212-4121-8121-121212121212';
  v_tx0 text; v_rc30 text; v_pnl0 numeric; v_led0 integer;
  v_j jsonb; v_j2 jsonb; v_read jsonb;
  v_ok boolean; v_err text;
  v_hash text; v_snap jsonb;
  v_event uuid; v_tx uuid; v_tx2 uuid; v_exec uuid;
  v_remain numeric; v_bal numeric;
  v_n integer; v_payer text; v_jj numeric;
  v_cert uuid; v_line uuid;
  v_jj_hash text; v_jj_snap jsonb;
  v_reimburse_event uuid;
  v_jj_exec uuid;
BEGIN
  v_tx0 := pg_temp.tx_fp();
  v_rc30 := pg_temp.rc3_fp();
  SELECT net INTO v_pnl0 FROM public.v_jj_pnl_fixture;
  SELECT count(*) INTO v_led0 FROM public.v_certified_ledger_transactions;

  PERFORM pg_temp.set_jwt(v_ceo, 'authenticated');
  EXECUTE 'SET ROLE authenticated';
  v_j := public.apply_client_settlement_opening_certification(
    v_zeta, '2026-03-01', 'zeta opening', 'evidence:zeta',
    'cert-zeta-pca', 1, NULL, -5000.00,
    jsonb_build_array(
      jsonb_build_object('line_order', 1, 'property_key', 'zeta-z', 'property_name', 'Fixture Property Z',
        'component_code', 'opening_balance', 'amount_due_to_jj', -5000.00, 'reason', 'z', 'evidence_ref', 'ez')
    )
  );
  EXECUTE 'RESET ROLE';
  SELECT l.id, l.certification_id INTO v_line, v_cert
  FROM finance.client_settlement_certification_lines l WHERE l.property_key = 'zeta-z';
  EXECUTE 'SET ROLE authenticated';
  PERFORM public.bind_client_obligation_property(
    v_cert, v_line, v_zeta, v_pz, 1, 'bind zeta', 'ev-z', 'bind-zeta-z', NULL
  );

  -- SECURITY
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.set_jwt(NULL, 'anon');
  EXECUTE 'SET ROLE anon';
  v_ok := false; v_err := 'NO ERROR';
  BEGIN
    PERFORM public.preview_partner_funded_client_settlement(v_zeta, v_north, 'JJ_TO_CLIENT', 3260, '2026-09-17');
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; v_ok := true; END;
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.record('anon_denied', v_ok, v_err);

  PERFORM pg_temp.set_jwt(v_ceo, 'service_role');
  EXECUTE 'SET ROLE service_role';
  v_ok := false; v_err := 'NO ERROR';
  BEGIN
    PERFORM public.execute_partner_funded_client_settlement(
      v_zeta, v_north, 'JJ_TO_CLIENT', 3260, '2026-09-17', 'x', '{}'::jsonb, 'svc'
    );
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; v_ok := true; END;
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.record('service_role_execute_denied', v_ok, v_err);

  PERFORM pg_temp.set_jwt(v_inactive, 'authenticated');
  EXECUTE 'SET ROLE authenticated';
  v_ok := false; v_err := 'NO ERROR';
  BEGIN
    PERFORM public.preview_partner_funded_client_settlement(v_zeta, v_north, 'JJ_TO_CLIENT', 3260, '2026-09-17');
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; v_ok := v_err ILIKE '%jj_auth%'; END;
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.record('inactive_staff_denied', v_ok, v_err);

  PERFORM pg_temp.set_jwt(v_ops, 'authenticated');
  EXECUTE 'SET ROLE authenticated';
  v_ok := false; v_err := 'NO ERROR';
  BEGIN
    PERFORM public.preview_partner_funded_client_settlement(v_zeta, v_north, 'JJ_TO_CLIENT', 3260, '2026-09-17');
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; v_ok := v_err ILIKE '%jj_auth%' OR v_err ILIKE '%not permitted%'; END;
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.record('operations_write_denied', v_ok, v_err);

  PERFORM pg_temp.set_jwt(v_ops, 'authenticated');
  EXECUTE 'SET ROLE authenticated';
  v_ok := false; v_err := 'NO ERROR';
  BEGIN
    PERFORM 1 FROM public.list_partner_funding_actors();
    v_ok := true;
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; v_ok := false; END;
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.record('operations_list_actors_allowed', v_ok, v_err);

  PERFORM pg_temp.set_jwt(v_fin, 'authenticated');
  EXECUTE 'SET ROLE authenticated';
  v_ok := false; v_err := 'NO ERROR';
  BEGIN
    INSERT INTO finance.partner_funding_events (
      event_type, effective_date, amount_eur, partner_entity_id, funding_source,
      idempotency_key, payload_hash, canonical_snapshot, created_by
    ) VALUES (
      'partner_reimbursement', '2026-09-17', 1, v_north, 'JJ', 'direct', 'h', '{}'::jsonb, v_fin
    );
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; v_ok := true; END;
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.record('direct_table_insert_denied', v_ok, v_err);

  -- IDENTITY
  PERFORM pg_temp.set_jwt(v_fin, 'authenticated');
  EXECUTE 'SET ROLE authenticated';
  v_ok := false; v_err := 'NO ERROR';
  BEGIN
    PERFORM public.preview_partner_funded_client_settlement(v_zeta, v_zeta, 'JJ_TO_CLIENT', 3260, '2026-09-17');
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; v_ok := v_err ILIKE '%partner%' OR v_err ILIKE '%different%'; END;
  PERFORM pg_temp.record('non_partner_actor_rejected', v_ok, v_err);

  v_ok := false; v_err := 'NO ERROR';
  BEGIN
    PERFORM public.preview_partner_funded_client_settlement(v_zeta, v_inactive_p, 'JJ_TO_CLIENT', 3260, '2026-09-17');
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; v_ok := v_err ILIKE '%not active%'; END;
  PERFORM pg_temp.record('inactive_partner_rejected', v_ok, v_err);

  v_ok := false; v_err := 'NO ERROR';
  BEGIN
    PERFORM public.preview_partner_funded_client_settlement(v_zeta, v_north, 'CLIENT_TO_JJ', 3260, '2026-09-17');
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; v_ok := v_err ILIKE '%JJ_TO_CLIENT%'; END;
  PERFORM pg_temp.record('wrong_direction_rejected', v_ok, v_err);

  -- PREVIEW personal funded 3260
  v_j := public.preview_partner_funded_client_settlement(
    v_zeta, v_north, 'JJ_TO_CLIENT', 3260.00, '2026-09-17'
  );
  PERFORM pg_temp.record(
    'preview_personal_ok',
    (v_j->>'ok')::boolean
      AND v_j->>'payer' = 'Partner North'
      AND v_j->>'payee' = 'Owner'
      AND v_j->>'funding_source' = 'PARTNER_PERSONAL'
      AND (v_j->>'balance_before_R')::numeric = 5000
      AND (v_j->>'balance_after_R')::numeric = 1740
      AND (v_j->>'partner_balance_before')::numeric = 0
      AND (v_j->>'partner_balance_after')::numeric = 3260
      AND (v_j->>'company_cash_effect')::numeric = 0
      AND (v_j->>'pnl_effect')::numeric = 0
      AND (v_j->>'unapplied_remainder')::numeric = 0,
    v_j::text
  );
  v_hash := v_j->>'preview_hash';
  v_snap := v_j->'canonical_snapshot';
  v_j2 := public.preview_partner_funded_client_settlement(
    v_zeta, v_north, 'JJ_TO_CLIENT', 5000.01, '2026-09-17'
  );
  PERFORM pg_temp.record(
    'remainder_blocked',
    (v_j2->>'ok') = 'false' AND COALESCE(v_j2->>'blocked_code', '') <> '',
    COALESCE(v_j2->>'blocked_code', v_j2::text)
  );
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.set_jwt(v_ceo, 'authenticated');
  EXECUTE 'SET ROLE authenticated';
  v_j2 := public.preview_partner_funded_client_settlement(
    v_zeta, v_north, 'JJ_TO_CLIENT', 3260.00, '2026-09-17'
  );
  PERFORM pg_temp.record('ceo_preview_ok', (v_j2->>'ok')::boolean AND v_j2->>'preview_hash' = v_hash, v_j2->>'preview_hash');
  v_ok := false; v_err := 'NO ERROR';
  BEGIN
    PERFORM finance.partner_ca_balance(v_north, '2026-09-17');
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; v_ok := true; END;
  PERFORM pg_temp.record('helper_private', v_ok, v_err);
  v_j2 := public.preview_partner_funded_client_settlement(
    v_zeta, v_north, 'JJ_TO_CLIENT', 3260.00, '2026-09-17'
  );
  PERFORM pg_temp.record('preview_hash_stable', v_j2->>'preview_hash' = v_hash, v_j2->>'preview_hash');
  v_j2 := public.preview_partner_funded_client_settlement(
    v_zeta, v_south, 'JJ_TO_CLIENT', 3260.00, '2026-09-17'
  );
  PERFORM pg_temp.record('hash_changes_with_partner', v_j2->>'preview_hash' IS DISTINCT FROM v_hash, 'partner');
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.record('preview_writes_nothing', pg_temp.tx_fp() = v_tx0, pg_temp.tx_fp());

  -- JJ-funded still distinguishable
  PERFORM pg_temp.set_jwt(v_fin, 'authenticated');
  EXECUTE 'SET ROLE authenticated';
  v_j2 := public.preview_client_cash_settlement(v_zeta, 'JJ_TO_CLIENT', 3260.00, '2026-09-17');
  PERFORM pg_temp.record(
    'jj_funded_preview_still_payer_jj',
    v_j2->>'payer' = 'JJ' AND v_j2->>'preview_hash' IS DISTINCT FROM v_hash,
    v_j2->>'payer'
  );

  -- EXECUTE personal
  v_j := public.execute_partner_funded_client_settlement(
    v_zeta, v_north, 'JJ_TO_CLIENT', 3260.00, '2026-09-17',
    v_hash, v_snap, 'pf-zeta-3260'
  );
  v_event := (v_j->>'event_id')::uuid;
  v_tx := (v_j->>'transaction_id')::uuid;
  v_exec := (v_j->>'client_cash_execution_id')::uuid;
  PERFORM pg_temp.record('execute_ok', (v_j->>'ok')::boolean AND (v_j->>'replay') = 'false', v_j::text);
  EXECUTE 'RESET ROLE';

  SELECT count(*) INTO v_n FROM public.transactions WHERE id = v_tx;
  SELECT payer INTO v_payer FROM public.transactions WHERE id = v_tx;
  PERFORM pg_temp.record(
    'one_external_cash_partner_payer',
    v_n = 1 AND v_payer = 'Partner North'
      AND (SELECT property_id IS NULL AND property_name IS NULL AND client_charge IS NULL AND payee = 'Owner'
           AND subcategory = 'Bank Payment to Owner' FROM public.transactions WHERE id = v_tx),
    v_payer
  );
  PERFORM pg_temp.record(
    'one_event_one_ca_one_link',
    (SELECT count(*) FROM finance.partner_funding_events WHERE id = v_event) = 1
      AND (SELECT count(*) FROM finance.partner_current_account_entries WHERE event_id = v_event) = 1
      AND (SELECT signed_amount_eur FROM finance.partner_current_account_entries WHERE event_id = v_event) = 3260
      AND (SELECT count(*) FROM finance.partner_funding_transaction_links WHERE event_id = v_event) = 1
      AND (SELECT count(*) FROM finance.client_obligation_fifo_allocations WHERE execution_id = v_exec) >= 1
      AND (SELECT sum(allocated_amount) FROM finance.client_obligation_fifo_allocations WHERE execution_id = v_exec) = 3260,
    'legs'
  );
  SELECT remaining_signed_amount INTO v_remain FROM finance.v_client_property_obligation_register WHERE entity_id = v_zeta;
  PERFORM pg_temp.record('client_r_1740', v_remain = 1740, v_remain::text);
  SELECT finance.partner_ca_balance(v_north, '2026-09-17') INTO v_bal;
  PERFORM pg_temp.record('partner_liability_3260', v_bal = 3260, v_bal::text);
  SELECT COALESCE(sum(CASE WHEN lower(payer)='jj' THEN amount_eur ELSE 0 END),0) INTO v_jj
  FROM public.transactions WHERE id = v_tx;
  PERFORM pg_temp.record('jj_cash_row_not_jj_payer', v_jj = 0, v_jj::text);
  PERFORM pg_temp.record(
    'rc3_unchanged_personal',
    pg_temp.rc3_fp() = v_rc30 AND NOT EXISTS (SELECT 1 FROM public.v_rc3_classified WHERE id = v_tx),
    pg_temp.rc3_fp()
  );
  PERFORM pg_temp.record(
    'no_overlay_no_draft_no_clone',
    NOT EXISTS (SELECT 1 FROM public.transactions WHERE id = v_tx AND property_id IS NOT NULL)
      AND (SELECT count(*) FROM finance.agent_transaction_drafts) = (
        SELECT count(*) FROM finance.agent_transaction_drafts
      ),
    'clean'
  );
  PERFORM pg_temp.record(
    'certified_ledger_plus_one',
    (SELECT count(*) FROM public.v_certified_ledger_transactions) = v_led0 + 1,
    'led'
  );

  PERFORM pg_temp.set_jwt(v_fin, 'authenticated');
  EXECUTE 'SET ROLE authenticated';
  v_j2 := public.execute_partner_funded_client_settlement(
    v_zeta, v_north, 'JJ_TO_CLIENT', 3260.00, '2026-09-17',
    v_hash, v_snap, 'pf-zeta-3260'
  );
  PERFORM pg_temp.record(
    'replay_idempotent',
    (v_j2->>'replay') = 'true' AND (v_j2->>'transaction_id') = v_tx::text
      AND (SELECT count(*) FROM public.transactions WHERE description = 'partner funded client settlement') = 1,
    v_j2::text
  );
  v_ok := false; v_err := 'NO ERROR';
  BEGIN
    PERFORM public.execute_partner_funded_client_settlement(
      v_zeta, v_north, 'JJ_TO_CLIENT', 3260.00, '2026-09-18',
      v_hash, v_snap, 'pf-zeta-3260'
    );
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; v_ok := v_err ILIKE '%idempotency_conflict%'; END;
  PERFORM pg_temp.record('conflicting_replay_rejected', v_ok, v_err);

  SELECT count(*) INTO v_n FROM public.transactions;
  v_ok := false; v_err := 'NO ERROR';
  BEGIN
    PERFORM public.reverse_client_cash_settlement(v_exec, 'jj-rev-wrong');
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; v_ok := v_err ILIKE '%partner-funded%'; END;
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.record(
    'jj_reverse_guard',
    v_ok
      AND (SELECT count(*) FROM public.transactions) = v_n
      AND NOT EXISTS (
        SELECT 1 FROM finance.client_cash_settlement_executions WHERE idempotency_key = 'jj-rev-wrong'
      )
      AND NOT EXISTS (
        SELECT 1 FROM finance.partner_funding_events WHERE idempotency_key = 'jj-rev-wrong'
      )
      AND NOT EXISTS (
        SELECT 1 FROM finance.partner_current_account_entries e
        JOIN finance.partner_funding_events ev ON ev.id = e.event_id
        WHERE ev.idempotency_key = 'jj-rev-wrong'
      ),
    v_err
  );
  PERFORM pg_temp.set_jwt(v_fin, 'authenticated');
  EXECUTE 'SET ROLE authenticated';

  -- REIMBURSEMENT
  v_j := public.preview_partner_reimbursement(v_north, 3260.00, '2026-09-18');
  PERFORM pg_temp.record(
    'reimburse_preview',
    (v_j->>'ok')::boolean
      AND (v_j->>'company_cash_effect')::numeric = -3260
      AND (v_j->>'client_effect')::numeric = 0
      AND (v_j->>'partner_balance_after')::numeric = 0,
    v_j::text
  );
  v_j2 := public.preview_partner_reimbursement(v_north, 3260.01, '2026-09-18');
  PERFORM pg_temp.record(
    'over_reimbursement_blocked',
    (v_j2->>'ok') = 'false' AND v_j2->>'blocked_code' = 'over_reimbursement',
    v_j2->>'blocked_code'
  );
  v_j := public.execute_partner_reimbursement(
    v_north, 3260.00, '2026-09-18',
    v_j->>'preview_hash', v_j->'canonical_snapshot', 'pf-reimburse-3260'
  );
  v_tx2 := (v_j->>'transaction_id')::uuid;
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.record(
    'reimburse_execute',
    (SELECT payer FROM public.transactions WHERE id = v_tx2) = 'JJ'
      AND (SELECT payee FROM public.transactions WHERE id = v_tx2) = 'Partner North'
      AND (SELECT category FROM public.transactions WHERE id = v_tx2) = 'Transfer'
      AND (SELECT subcategory FROM public.transactions WHERE id = v_tx2) = 'Expense Reimbursement'
      AND (SELECT property_id FROM public.transactions WHERE id = v_tx2) IS NULL
      AND finance.partner_ca_balance(v_north, '2026-09-18') = 0
      AND (SELECT remaining_signed_amount FROM finance.v_client_property_obligation_register WHERE entity_id = v_zeta) = 1740
      AND NOT EXISTS (SELECT 1 FROM finance.owner_transaction_links WHERE transaction_id = v_tx2),
    v_tx2::text
  );
  PERFORM pg_temp.record('reimburse_rc3_unchanged', pg_temp.rc3_fp() = v_rc30, pg_temp.rc3_fp());

  -- reverse reimbursement restores CA, client unchanged
  EXECUTE 'RESET ROLE';
  SELECT id INTO v_reimburse_event
  FROM finance.partner_funding_events WHERE idempotency_key = 'pf-reimburse-3260';
  PERFORM pg_temp.set_jwt(v_fin, 'authenticated');
  EXECUTE 'SET ROLE authenticated';
  v_j := public.reverse_partner_funding_event(
    v_reimburse_event, 'test reverse reimbursement', 'pf-rev-reimburse'
  );
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.record(
    'reimburse_reversal',
    finance.partner_ca_balance(v_north, '2026-09-18') = 3260
      AND (SELECT remaining_signed_amount FROM finance.v_client_property_obligation_register WHERE entity_id = v_zeta) = 1740,
    finance.partner_ca_balance(v_north, '2026-09-18')::text
  );

  -- reverse original personal payment
  PERFORM pg_temp.set_jwt(v_fin, 'authenticated');
  EXECUTE 'SET ROLE authenticated';
  v_j := public.reverse_partner_funding_event(v_event, 'test reverse personal', 'pf-rev-personal');
  v_ok := false; v_err := 'NO ERROR';
  BEGIN
    PERFORM public.reverse_partner_funding_event(v_event, 'second', 'pf-rev-personal-2');
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; v_ok := v_err ILIKE '%already reversed%'; END;
  v_j2 := public.reverse_partner_funding_event(v_event, 'test reverse personal', 'pf-rev-personal');
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.record('second_reversal_denied', v_ok, v_err);
  PERFORM pg_temp.record('reversal_replay', (v_j2->>'replay') = 'true', v_j2::text);
  PERFORM pg_temp.record(
    'personal_reversal_restores',
    finance.partner_ca_balance(v_north, '2026-09-17') = 0
      AND (SELECT remaining_signed_amount FROM finance.v_client_property_obligation_register WHERE entity_id = v_zeta) = 5000
      AND EXISTS (SELECT 1 FROM public.transactions WHERE id = v_tx),
    'restored'
  );

  PERFORM pg_temp.set_jwt(v_fin, 'authenticated');
  EXECUTE 'SET ROLE authenticated';
  v_read := public.read_partner_current_account(v_north, '2026-09-18');
  PERFORM pg_temp.record(
    'reader_has_entries_no_pii',
    (v_read->>'canonical_name') = 'Partner North'
      AND v_read->>'partner_entity_id' = v_north::text
      AND (v_read->'entries') IS NOT NULL
      AND v_read::text NOT ILIKE '%password%'
      AND v_read::text NOT ILIKE '%token%',
    v_read->>'balance'
  );

  -- LEGACY JJ-FUNDED REVERSAL PARITY (#243 keys, cash, FIFO, replay)
  v_j := public.preview_client_cash_settlement(v_zeta, 'JJ_TO_CLIENT', 400.00, '2026-09-17');
  v_jj_hash := v_j->>'preview_hash';
  v_jj_snap := v_j->'canonical_snapshot';
  v_j := public.execute_client_cash_settlement(
    v_zeta, 'JJ_TO_CLIENT', 400.00, '2026-09-17',
    v_jj_hash, v_jj_snap, 'jj-legacy-400'
  );
  v_jj_exec := (v_j->>'id')::uuid;
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.record(
    'legacy_jj_execute_ok',
    (v_j->>'ok')::boolean
      AND (v_j->>'replay') = 'false'
      AND v_j ? 'id' AND v_j ? 'transaction_id' AND v_j ? 'owner_link_id' AND v_j ? 'actor'
      AND (SELECT payer FROM public.transactions WHERE id = (v_j->>'transaction_id')::uuid) = 'JJ'
      AND (SELECT remaining_signed_amount FROM finance.v_client_property_obligation_register WHERE entity_id = v_zeta) = 4600,
    v_j::text
  );
  PERFORM pg_temp.set_jwt(v_fin, 'authenticated');
  EXECUTE 'SET ROLE authenticated';
  v_j := public.reverse_client_cash_settlement(v_jj_exec, 'rev-jj-legacy-400');
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.record(
    'legacy_jj_reverse_ok',
    (v_j->>'ok')::boolean
      AND (v_j->>'replay') = 'false'
      AND v_j ? 'id' AND v_j ? 'transaction_id' AND v_j ? 'reversal_of' AND v_j ? 'actor'
      AND (v_j->>'reversal_of') = v_jj_exec::text
      AND (SELECT remaining_signed_amount FROM finance.v_client_property_obligation_register WHERE entity_id = v_zeta) = 5000
      AND (SELECT description FROM public.transactions WHERE id = (v_j->>'transaction_id')::uuid)
          = 'client cash settlement reversal'
      AND (SELECT payer FROM public.transactions WHERE id = (v_j->>'transaction_id')::uuid) = 'JJ'
      AND (SELECT pg_catalog.round(sum(a.signed_amount), 2)
           FROM finance.client_obligation_fifo_allocations a
           WHERE a.execution_id IN (v_jj_exec, (v_j->>'id')::uuid)) = 0,
    v_j::text
  );
  PERFORM pg_temp.set_jwt(v_fin, 'authenticated');
  EXECUTE 'SET ROLE authenticated';
  v_j2 := public.reverse_client_cash_settlement(v_jj_exec, 'rev-jj-legacy-400');
  v_ok := false; v_err := 'NO ERROR';
  BEGIN
    PERFORM public.reverse_client_cash_settlement(v_jj_exec, 'rev-jj-legacy-400-b');
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    v_ok := v_err ILIKE '%already reversed%' OR v_err ILIKE '%denied%';
  END;
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.record(
    'legacy_jj_reverse_replay',
    (v_j2->>'replay') = 'true'
      AND (v_j2->>'id') = (v_j->>'id')
      AND v_j2 ? 'transaction_id' AND v_j2 ? 'reversal_of'
      AND (SELECT remaining_signed_amount FROM finance.v_client_property_obligation_register WHERE entity_id = v_zeta) = 5000,
    v_j2::text
  );
  PERFORM pg_temp.record('legacy_jj_second_reversal_denied', v_ok, v_err);
END;
$$;

SELECT test_name, passed, detail FROM matrix_result ORDER BY test_name;
