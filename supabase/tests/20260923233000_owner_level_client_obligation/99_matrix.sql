-- Isolated owner-level obligation matrix. Disposable database only.
-- No Production. No production client or actor UUIDs.

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
  SELECT count(*)::text || ':' || md5(COALESCE(string_agg(
    t.id::text || ':' || COALESCE(t.amount_eur, 0)::text || ':' || COALESCE(t.property_id::text, ''),
    '|' ORDER BY t.id), ''))
  FROM public.transactions t;
$$;

CREATE OR REPLACE FUNCTION pg_temp.rc3_fp()
RETURNS text LANGUAGE sql STABLE SET search_path TO '' AS $$
  SELECT count(*)::text || ':' || md5(COALESCE(string_agg(id::text, '|' ORDER BY id), ''))
  FROM public.v_rc3_classified;
$$;

CREATE OR REPLACE FUNCTION pg_temp.ledger_fp()
RETURNS text LANGUAGE sql STABLE SET search_path TO '' AS $$
  SELECT count(*)::text || ':' || md5(COALESCE(string_agg(id::text, '|' ORDER BY id), ''))
  FROM public.v_certified_ledger_transactions;
$$;

CREATE OR REPLACE FUNCTION pg_temp.client_r(p_entity uuid, p_as_of date)
RETURNS numeric LANGUAGE sql STABLE SET search_path TO '' AS $$
  SELECT COALESCE(round(sum(r.remaining_signed_amount), 2), 0)
  FROM finance.v_client_property_obligation_register r
  WHERE r.entity_id = p_entity
    AND r.effective_date <= p_as_of;
$$;

GRANT ALL ON TABLE matrix_result TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION pg_temp.record(text, boolean, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION pg_temp.set_jwt(uuid, text) TO anon, authenticated, service_role;

DO $$
DECLARE
  v_ceo uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  v_client uuid := '91919191-9191-4919-8919-919191919191';
  v_partner uuid := '81818181-8181-4818-8818-818181818181';
  v_prop_a uuid := '91910000-0000-4000-8000-00000000000a';
  v_prop_b uuid := '91910000-0000-4000-8000-00000000000b';
  v_prop_c uuid := '91910000-0000-4000-8000-00000000000c';
  v_src uuid := '0e0e0e0e-0e0e-40e0-8e0e-0e0e0e0e0e0e';
  v_prop_tx uuid := '0f0f0f0f-0f0f-40f0-8f0f-0f0f0f0f0f0f';
  v_jj_orig uuid := 'a1111111-1111-4111-8111-111111111111';
  v_jj_rev uuid := 'a2222222-2222-4222-8222-222222222222';
  v_rebook uuid := 'a3333333-3333-4333-8333-333333333333';
  v_offset uuid := 'a4444444-4444-4444-8444-444444444444';
  v_tx0 text; v_rc30 text; v_led0 text;
  v_j jsonb; v_preview jsonb; v_exec jsonb;
  v_ok boolean; v_err text;
  v_id uuid; v_cert uuid; v_line uuid; v_line_b uuid; v_event uuid;
  v_r numeric; v_n integer; v_brok numeric; v_cash numeric; v_fifo_net numeric;
  v_alloc text; v_hash text; v_snap jsonb;
  v_bind record;
BEGIN
  INSERT INTO lifecycle.entity_identity (id, canonical_name, entity_type, status)
  VALUES (v_client, 'Client Fixture', 'external', 'active')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.properties (id, name) VALUES
    (v_prop_a, 'Fixture Property A'),
    (v_prop_b, 'Fixture Property B'),
    (v_prop_c, 'Fixture Property C');

  INSERT INTO lifecycle.entity_property_associations (id, entity_id, property_id, association_source, status)
  VALUES
    ('91919191-aaaa-4919-8919-919191919101', v_client, v_prop_a, 'wizard', 'active'),
    ('91919191-aaaa-4919-8919-919191919102', v_client, v_prop_b, 'wizard', 'active'),
    ('91919191-aaaa-4919-8919-919191919103', v_client, v_prop_c, 'wizard', 'active')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.transactions (
    id, date, property_id, property_name, category, subcategory,
    description, payer, payee, amount_eur, review_status
  ) VALUES
    (v_src, '2026-08-24', NULL, NULL, 'Management', 'Bank Payment to Owner',
     'owner general payment fixture', 'Jacob', 'Owner', 10000.00, 'active'),
    (v_prop_tx, '2026-09-02', v_prop_a, 'Fixture Property A', 'Management', 'Electricity',
     'property scoped fixture', 'JJ', 'Supplier', 50.00, 'active'),
    (v_jj_orig, '2026-09-03', v_prop_a, 'Fixture Property A', 'JJ', 'Brokerage',
     'original brokerage', 'Jacob', 'company', 500.00, 'active'),
    (v_jj_rev, '2026-09-03', v_prop_a, 'Fixture Property A', 'JJ', 'Brokerage',
     'brokerage reversal', 'Jacob', 'company', -500.00, 'active'),
    (v_rebook, '2026-09-03', v_prop_a, 'Fixture Property A', 'Management', 'Brokerage',
     'brokerage rebook', 'Jacob', 'company', 500.00, 'active'),
    (v_offset, '2026-09-03', v_prop_a, 'Fixture Property A', 'Management', 'Brokerage',
     'brokerage offset', 'Owner', 'Broker', 0.00, 'active');
  UPDATE public.transactions SET client_charge = 500.00 WHERE id IN (v_jj_orig, v_rebook);
  UPDATE public.transactions SET client_charge = -500.00 WHERE id = v_jj_rev;
  UPDATE public.transactions SET client_charge = 200.00 WHERE id = v_offset;

  v_tx0 := pg_temp.tx_fp();
  v_rc30 := pg_temp.rc3_fp();
  v_led0 := pg_temp.ledger_fp();

  PERFORM pg_temp.set_jwt(v_ceo, 'authenticated');
  EXECUTE 'SET ROLE authenticated';
  v_j := public.apply_client_settlement_opening_certification(
    v_client, '2026-08-31', 'fixture opening', 'evidence:opening',
    'cert-fixture-opening', 1, NULL, -13248.75,
    jsonb_build_array(
      jsonb_build_object(
        'line_order', 1, 'property_key', 'fixture-a', 'property_name', 'Fixture Property A',
        'component_code', 'opening_balance', 'amount_due_to_jj', -8000.00,
        'reason', 'a', 'evidence_ref', 'ea'),
      jsonb_build_object(
        'line_order', 2, 'property_key', 'fixture-b', 'property_name', 'Fixture Property B',
        'component_code', 'opening_balance', 'amount_due_to_jj', -5248.75,
        'reason', 'b', 'evidence_ref', 'eb')
    )
  );
  EXECUTE 'RESET ROLE';

  SELECT l.id, l.certification_id INTO v_line, v_cert
  FROM finance.client_settlement_certification_lines l
  WHERE l.property_key = 'fixture-a';
  SELECT l.id INTO v_line_b
  FROM finance.client_settlement_certification_lines l
  WHERE l.property_key = 'fixture-b';

  EXECUTE 'SET ROLE authenticated';
  PERFORM public.bind_client_obligation_property(
    v_cert, v_line, v_client, v_prop_a, 1, 'bind a', 'ev-a', 'bind-fixture-a', NULL
  );
  PERFORM public.bind_client_obligation_property(
    v_cert, v_line_b, v_client, v_prop_b, 1, 'bind b', 'ev-b', 'bind-fixture-b', NULL
  );
  EXECUTE 'RESET ROLE';

  v_r := pg_temp.client_r(v_client, '2026-08-31');
  PERFORM pg_temp.record(
    'balance_before_owner_payment',
    v_r = 13248.75,
    v_r::text
  );

  EXECUTE 'SET ROLE authenticated';
  v_ok := false; v_err := 'NO ERROR';
  BEGIN
    PERFORM public.apply_client_settlement_opening_certification(
      v_client, '2026-08-30', 'missing property', 'evidence:missing',
      'cert-missing-property', 1, NULL, -1.00,
      jsonb_build_array(jsonb_build_object(
        'line_order', 1, 'property_key', '', 'property_name', 'Fixture Property A',
        'component_code', 'opening_balance', 'amount_due_to_jj', -1.00,
        'reason', 'r', 'evidence_ref', 'e'))
    );
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    v_ok := true;
  END;
  PERFORM pg_temp.record('property_component_without_property_rejected', v_ok, v_err);

  v_ok := false; v_err := 'NO ERROR';
  BEGIN
    PERFORM public.apply_owner_level_client_obligation(
      v_client, v_src, 'opening_balance', 10000.00, 'wrong component', 'ev', 'colo-wrong'
    );
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    v_ok := v_err ILIKE '%owner_general_payment%';
  END;
  PERFORM pg_temp.record('unauthorized_component_rejected', v_ok, v_err);

  v_ok := false; v_err := 'NO ERROR';
  BEGIN
    PERFORM public.apply_owner_level_client_obligation(
      v_client, v_prop_tx, 'owner_general_payment', 50.00, 'has property', 'ev', 'colo-has-property'
    );
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    v_ok := v_err ILIKE '%property_id IS NULL%';
  END;
  PERFORM pg_temp.record('property_backed_source_rejected', v_ok, v_err);

  v_j := public.apply_owner_level_client_obligation(
    v_client, v_src, 'owner_general_payment', 10000.00,
    'general owner payment', 'evidence:src', 'colo-fixture-10000'
  );
  v_id := (v_j->>'id')::uuid;
  EXECUTE 'RESET ROLE';

  v_r := pg_temp.client_r(v_client, '2026-08-31');
  PERFORM pg_temp.record(
    'close_after_owner_payment',
    v_r = 3248.75
      AND (SELECT amount_due_to_jj FROM finance.client_settlement_certification_lines WHERE id = v_line) = -8000.00
      AND (SELECT amount_due_to_jj FROM finance.client_settlement_certification_lines WHERE id = v_line_b) = -5248.75
      AND (SELECT count(*) FROM finance.client_owner_level_obligations WHERE source_transaction_id = v_src AND status = 'applied') = 1,
    v_r::text
  );

  EXECUTE 'SET ROLE authenticated';
  v_j := public.apply_owner_level_client_obligation(
    v_client, v_src, 'owner_general_payment', 10000.00,
    'general owner payment', 'evidence:src', 'colo-fixture-10000'
  );
  EXECUTE 'RESET ROLE';
  SELECT count(*) INTO v_n
  FROM finance.client_owner_level_obligations
  WHERE source_transaction_id = v_src;
  PERFORM pg_temp.record(
    'replay_idempotent',
    (v_j->>'replay')::boolean = true
      AND (v_j->>'inserted')::boolean = false
      AND (v_j->>'id')::uuid = v_id
      AND v_n = 1
      AND pg_temp.client_r(v_client, '2026-08-31') = 3248.75,
    v_j::text
  );

  EXECUTE 'SET ROLE authenticated';
  v_ok := false; v_err := 'NO ERROR';
  BEGIN
    PERFORM public.apply_owner_level_client_obligation(
      v_client, v_src, 'owner_general_payment', 10000.00,
      'changed reason', 'evidence:src', 'colo-fixture-10000'
    );
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    v_ok := v_err ILIKE '%different payload%';
  END;
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.record('payload_change_rejected', v_ok, v_err);

  EXECUTE 'SET ROLE authenticated';
  PERFORM public.void_owner_level_client_obligation(v_id, 'reverse fixture', 'evidence:void');
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.record(
    'reversal_restores_client_balance',
    pg_temp.client_r(v_client, '2026-08-31') = 13248.75
      AND EXISTS (
        SELECT 1 FROM finance.client_owner_level_obligation_audit a
        WHERE a.obligation_id = v_id AND a.event = 'void'
      )
      AND NOT EXISTS (
        SELECT 1 FROM finance.v_client_property_obligation_register r
        WHERE r.source_line_identity = v_id
      ),
    pg_temp.client_r(v_client, '2026-08-31')::text
  );

  EXECUTE 'SET ROLE authenticated';
  v_j := public.apply_owner_level_client_obligation(
    v_client, v_src, 'owner_general_payment', 10000.00,
    'general owner payment', 'evidence:src', 'colo-fixture-10000-reapply'
  );
  v_id := (v_j->>'id')::uuid;
  v_j := public.apply_client_settlement_opening_certification(
    v_client, '2026-09-17', 'fixture september', 'evidence:sept',
    'cert-fixture-sept', 1, NULL, -720.00,
    jsonb_build_array(
      jsonb_build_object('line_order', 1, 'property_key', 'sept-a', 'property_name', 'Fixture Property A',
        'component_code', 'tenant_payment', 'amount_due_to_jj', -700.00, 'reason', 'rent', 'evidence_ref', 'rent-700'),
      jsonb_build_object('line_order', 2, 'property_key', 'sept-a', 'property_name', 'Fixture Property A',
        'component_code', 'electricity', 'amount_due_to_jj', 50.00, 'reason', 'elec', 'evidence_ref', 'elec-50'),
      jsonb_build_object('line_order', 3, 'property_key', 'sept-a', 'property_name', 'Fixture Property A',
        'component_code', 'brokerage', 'amount_due_to_jj', 500.00, 'reason', 'client_charge only', 'evidence_ref', v_rebook::text),
      jsonb_build_object('line_order', 4, 'property_key', 'sept-a', 'property_name', 'Fixture Property A',
        'component_code', 'brokerage_deposit_offset', 'amount_due_to_jj', 200.00, 'reason', 'client_charge only', 'evidence_ref', v_offset::text),
      jsonb_build_object('line_order', 5, 'property_key', 'sept-a', 'property_name', 'Fixture Property A',
        'component_code', 'trust_deposit', 'amount_due_to_jj', 0.00, 'reason', 'trust', 'evidence_ref', 'dep-50'),
      jsonb_build_object('line_order', 6, 'property_key', 'sept-a', 'property_name', 'Fixture Property A',
        'component_code', 'trust_deposit_reversal', 'amount_due_to_jj', 0.00, 'reason', 'trust', 'evidence_ref', 'dep-rev'),
      jsonb_build_object('line_order', 7, 'property_key', 'sept-b', 'property_name', 'Fixture Property B',
        'component_code', 'tenant_payment', 'amount_due_to_jj', -800.00, 'reason', 'rent', 'evidence_ref', 'rent-800'),
      jsonb_build_object('line_order', 8, 'property_key', 'sept-c', 'property_name', 'Fixture Property C',
        'component_code', 'internet', 'amount_due_to_jj', 30.00, 'reason', 'internet', 'evidence_ref', 'net-30'),
      jsonb_build_object('line_order', 9, 'property_key', 'sept-c', 'property_name', 'Fixture Property C',
        'component_code', 'other', 'amount_due_to_jj', 0.00, 'reason', 'client_charge zero', 'evidence_ref', 'other-0')
    )
  );
  EXECUTE 'RESET ROLE';
  SELECT c.id INTO v_cert
  FROM finance.client_settlement_certifications c
  WHERE c.idempotency_key = 'cert-fixture-sept';
  CREATE TEMP TABLE sept_bind (
    line_id uuid,
    certification_id uuid,
    property_id uuid,
    line_order integer
  ) ON COMMIT DROP;
  INSERT INTO sept_bind (line_id, certification_id, property_id, line_order)
  SELECT l.id, l.certification_id,
    CASE l.property_key
      WHEN 'sept-b' THEN v_prop_b
      WHEN 'sept-c' THEN v_prop_c
      ELSE v_prop_a
    END,
    l.line_order
  FROM finance.client_settlement_certification_lines l
  WHERE l.certification_id = v_cert;
  GRANT SELECT ON sept_bind TO authenticated;
  EXECUTE 'SET ROLE authenticated';
  FOR v_bind IN
    SELECT line_id, certification_id, property_id, line_order FROM sept_bind ORDER BY line_order
  LOOP
    PERFORM public.bind_client_obligation_property(
      v_bind.certification_id, v_bind.line_id, v_client, v_bind.property_id, 1,
      'bind sept', 'ev-s', 'bind-sept-' || v_bind.line_order::text, NULL
    );
  END LOOP;
  EXECUTE 'RESET ROLE';
  SELECT count(*) INTO v_n FROM finance.client_owner_level_obligations;
  EXECUTE 'SET ROLE authenticated';
  v_preview := public.preview_partner_funded_client_settlement(
    v_client, v_partner, 'JJ_TO_CLIENT', 3450.00, '2026-09-17'
  );
  EXECUTE 'RESET ROLE';

  SELECT COALESCE(sum(l.amount_due_to_jj), 0) INTO v_brok
  FROM finance.client_settlement_certification_lines l
  WHERE l.certification_id = v_cert
    AND l.component_code IN ('brokerage', 'brokerage_deposit_offset');
  v_alloc := COALESCE(v_preview->'allocations')::text;
  PERFORM pg_temp.record(
    'brokerage_charged_once_from_client_charge',
    v_brok = 700.00
      AND NOT EXISTS (
        SELECT 1 FROM finance.client_settlement_certification_lines l
        WHERE l.evidence_ref IN (v_jj_orig::text, v_jj_rev::text)
      )
      AND (SELECT client_charge FROM public.transactions WHERE id = v_rebook) = 500
      AND (SELECT amount_eur FROM public.transactions WHERE id = v_rebook) = 500
      AND (SELECT client_charge FROM public.transactions WHERE id = v_offset) = 200
      AND (SELECT amount_eur FROM public.transactions WHERE id = v_offset) = 0,
    v_brok::text
  );
  PERFORM pg_temp.record(
    'preview_3450_remainder_zero',
    (v_preview->>'ok') = 'true'
      AND (v_preview->>'unapplied_remainder')::numeric = 0
      AND (v_preview->>'blocked_code') IS NULL
      AND (v_preview->>'balance_before_R')::numeric = 3968.75
      AND (v_preview->>'balance_after_R')::numeric = 518.75
      AND (v_preview->>'partner_balance_before')::numeric = 0
      AND (v_preview->>'partner_balance_after')::numeric = 3450.00
      AND (v_preview->>'company_cash_effect')::numeric = 0
      AND (v_preview->>'pnl_effect')::numeric = 0
      AND COALESCE(v_alloc, '') NOT LIKE '%' || v_id::text || '%'
      AND (SELECT count(*) FROM finance.client_owner_level_obligations) = v_n
      AND pg_temp.client_r(v_client, '2026-08-31') = 3248.75
      AND pg_temp.client_r(v_client, '2026-09-17') = 3968.75,
    v_preview::text
  );

  SELECT balance INTO v_cash FROM public.v_cashbox_audit WHERE cash_box_name = 'JJ';
  v_hash := v_preview->>'preview_hash';
  v_snap := v_preview->'canonical_snapshot';
  EXECUTE 'SET ROLE authenticated';
  v_exec := public.execute_partner_funded_client_settlement(
    v_client, v_partner, 'JJ_TO_CLIENT', 3450.00, '2026-09-17',
    v_hash, v_snap, 'pf-fixture-3450'
  );
  EXECUTE 'RESET ROLE';
  v_event := (v_exec->>'event_id')::uuid;
  PERFORM pg_temp.record(
    'execute_reduces_tamir_once',
    (v_exec->>'ok') = 'true'
      AND (v_exec->>'replay') = 'false'
      AND finance.partner_ca_balance(v_partner, '2026-09-17') = 3450.00
      AND (
        SELECT COALESCE(sum(a.allocated_amount), 0)
        FROM finance.client_obligation_fifo_allocations a
        JOIN finance.client_cash_settlement_executions x ON x.id = a.execution_id
        WHERE x.entity_id = v_client AND x.reversal_of IS NULL
      ) = 3450.00
      AND (SELECT count(*) FROM finance.client_cash_settlement_executions x
           WHERE x.entity_id = v_client AND x.reversal_of IS NULL) = 1
      AND (SELECT balance FROM public.v_cashbox_audit WHERE cash_box_name = 'JJ') IS NOT DISTINCT FROM v_cash
      AND pg_temp.rc3_fp() = v_rc30,
    v_exec::text
  );

  EXECUTE 'SET ROLE authenticated';
  v_j := public.reverse_partner_funding_event(v_event, 'restore fixture', 'pf-fixture-3450-rev');
  EXECUTE 'RESET ROLE';
  SELECT COALESCE(sum(a.signed_amount), 0) INTO v_fifo_net
  FROM finance.client_obligation_fifo_allocations a
  JOIN finance.client_cash_settlement_executions x ON x.id = a.execution_id
  WHERE x.entity_id = v_client;
  PERFORM pg_temp.record(
    'reversal_restores_fifo_and_partner',
    (v_j->>'ok') = 'true'
      AND finance.partner_ca_balance(v_partner, '2026-09-17') = 0
      AND v_fifo_net = 0
      AND pg_temp.client_r(v_client, '2026-09-17') = 3968.75
      AND (SELECT balance FROM public.v_cashbox_audit WHERE cash_box_name = 'JJ') IS NOT DISTINCT FROM v_cash,
    v_fifo_net::text
  );

  EXECUTE 'SET ROLE authenticated';
  v_ok := false; v_err := 'NO ERROR';
  BEGIN
    INSERT INTO finance.client_owner_level_obligations (
      entity_id, source_transaction_id, component_code, effective_date,
      amount_due_to_jj, status, reason, evidence_ref, idempotency_key,
      created_by, applied_by
    ) VALUES (
      v_client, v_src, 'owner_general_payment', '2026-08-24',
      1.00, 'applied', 'direct', 'ev', 'colo-direct-auth', v_ceo, v_ceo
    );
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    v_ok := v_err ILIKE '%permission denied%';
  END;
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.record('authenticated_direct_write_denied', v_ok, v_err);

  PERFORM pg_temp.set_jwt(v_ceo, 'service_role');
  EXECUTE 'SET ROLE service_role';
  v_ok := false; v_err := 'NO ERROR';
  BEGIN
    PERFORM public.apply_owner_level_client_obligation(
      v_client, v_src, 'owner_general_payment', 10000.00, 'sr', 'ev', 'colo-sr'
    );
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    v_ok := v_err ILIKE '%permission denied%';
  END;
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.record('service_role_execute_denied', v_ok, v_err);

  PERFORM pg_temp.set_jwt(NULL, 'anon');
  EXECUTE 'SET ROLE anon';
  v_ok := false; v_err := 'NO ERROR';
  BEGIN
    PERFORM public.apply_owner_level_client_obligation(
      v_client, v_src, 'owner_general_payment', 10000.00, 'anon', 'ev', 'colo-anon'
    );
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    v_ok := v_err ILIKE '%permission denied%';
  END;
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.record('anon_execute_denied', v_ok, v_err);

  PERFORM pg_temp.record(
    'source_rows_and_rc3_unchanged',
    pg_temp.rc3_fp() = v_rc30
      AND (SELECT amount_eur FROM public.transactions WHERE id = v_rebook) = 500
      AND (SELECT client_charge FROM public.transactions WHERE id = v_rebook) = 500
      AND (SELECT amount_eur FROM public.transactions WHERE id = v_offset) = 0
      AND (SELECT client_charge FROM public.transactions WHERE id = v_offset) = 200
      AND (SELECT amount_eur FROM public.transactions WHERE id = v_jj_orig) = 500
      AND (SELECT amount_eur FROM public.transactions WHERE id = v_jj_rev) = -500
      AND (SELECT amount_eur FROM public.transactions WHERE id = v_src) = 10000
      AND NOT EXISTS (
        SELECT 1 FROM public.transactions t
        WHERE t.id IN (v_rebook, v_offset, v_jj_orig, v_jj_rev, v_src)
          AND COALESCE(t.is_deleted, false)
      ),
    pg_temp.rc3_fp()
  );
END;
$$;

SELECT test_name, passed, detail FROM matrix_result ORDER BY test_name;
