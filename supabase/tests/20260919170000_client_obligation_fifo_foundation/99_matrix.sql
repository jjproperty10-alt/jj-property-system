-- Isolated role/FIFO matrix for obligation identity foundation.
-- Disposable database only. No Production. No Tamir.

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

CREATE OR REPLACE FUNCTION pg_temp.ledger_fp()
RETURNS text LANGUAGE sql STABLE SET search_path TO '' AS $$
  SELECT count(*)::text || ':' || md5(COALESCE(string_agg(id::text, '|' ORDER BY id), ''))
  FROM public.v_certified_ledger_transactions;
$$;

GRANT ALL ON TABLE matrix_result TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION pg_temp.record(text, boolean, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION pg_temp.set_jwt(uuid, text) TO anon, authenticated, service_role;

DO $$
DECLARE
  v_ceo uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  v_ops uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  v_inactive uuid := 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  v_alpha uuid := '11111111-1111-4111-8111-111111111111';
  v_gamma uuid := '33333333-aaaa-4333-8333-333333333333';
  v_pa uuid := '10101010-1010-4010-8010-101010101010';
  v_pb uuid := '20202020-2020-4020-8020-202020202020';
  v_pc uuid := '30303030-3030-4030-8030-303030303030';
  v_pother uuid := '40404040-4040-4040-8040-404040404040';
  v_unknown uuid := '99999999-9999-4999-8999-999999999999';
  v_tx0 text; v_rc30 text; v_led0 text;
  v_drafts0 integer; v_events0 integer; v_own0 integer;
  v_j jsonb;
  v_cert uuid;
  v_cert_b uuid;
  v_cert_c uuid;
  v_cert_neg uuid;
  v_la uuid; v_lb uuid; v_lc uuid; v_lneg uuid; v_lunbound uuid; v_gline uuid;
  v_delta uuid := '77777777-7777-4777-8777-777777777777';
  v_pe uuid := '50505050-5050-4050-8050-505050505050';
  v_orphan uuid := '70707070-7070-4070-8070-707070707070';
  v_draftprop uuid := '80808080-8080-4080-8080-808080808080';
  v_epsilon uuid := '88888888-8888-4888-8888-888888888888';
  v_pf uuid := '90909090-9090-4090-8090-909090909090';
  v_pshared uuid := '61616161-6161-4161-8161-616161616161';
  v_bind uuid; v_bind2 uuid;
  v_err text; v_ok boolean;
  v_hash1 text; v_hash2 text; v_hash3 text;
  v_unbound_n integer;
  v_snap jsonb;
  v_h_a text; v_h_b text;
BEGIN
  v_tx0 := pg_temp.tx_fp();
  v_rc30 := pg_temp.rc3_fp();
  v_led0 := pg_temp.ledger_fp();
  SELECT count(*) INTO v_drafts0 FROM finance.agent_transaction_drafts;
  SELECT count(*) INTO v_events0 FROM finance.client_settlement_events;
  SELECT count(*) INTO v_own0 FROM finance.owner_transaction_links;

  PERFORM pg_temp.record(
    'rls_force_enabled',
    EXISTS (
      SELECT 1 FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'finance'
        AND c.relname = 'client_obligation_property_bindings'
        AND c.relrowsecurity
        AND c.relforcerowsecurity
    )
    AND EXISTS (
      SELECT 1 FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'finance'
        AND c.relname = 'client_obligation_property_binding_audit'
        AND c.relrowsecurity
        AND c.relforcerowsecurity
    ),
    'ENABLE + FORCE RLS'
  );
  PERFORM pg_temp.record(
    'no_permissive_browser_write_policy',
    NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_policies p
      WHERE p.schemaname = 'finance'
        AND p.tablename IN (
          'client_obligation_property_bindings',
          'client_obligation_property_binding_audit'
        )
        AND p.permissive = 'PERMISSIVE'
    )
    AND NOT has_table_privilege('authenticated', 'finance.client_obligation_property_bindings', 'INSERT')
    AND NOT has_table_privilege('authenticated', 'finance.client_obligation_property_bindings', 'UPDATE')
    AND NOT has_table_privilege('authenticated', 'finance.client_obligation_property_bindings', 'DELETE')
    AND NOT has_table_privilege('service_role', 'finance.client_obligation_property_bindings', 'INSERT')
    AND NOT has_table_privilege('anon', 'finance.client_obligation_property_bindings', 'SELECT'),
    'revokes + no permissive write policy'
  );

  PERFORM pg_temp.record(
    'rpc_authenticated_execute',
    has_function_privilege('authenticated', 'public.bind_client_obligation_property(uuid,uuid,uuid,uuid,integer,text,text,text,uuid)', 'EXECUTE')
    AND has_function_privilege('authenticated', 'public.preview_client_obligation_fifo(uuid,text,numeric,date)', 'EXECUTE'),
    'authenticated EXECUTE'
  );
  PERFORM pg_temp.record(
    'rpc_anon_no_execute',
    NOT has_function_privilege('anon', 'public.bind_client_obligation_property(uuid,uuid,uuid,uuid,integer,text,text,text,uuid)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.preview_client_obligation_fifo(uuid,text,numeric,date)', 'EXECUTE'),
    'anon denied'
  );
  PERFORM pg_temp.record(
    'rpc_service_role_no_execute',
    NOT has_function_privilege('service_role', 'public.bind_client_obligation_property(uuid,uuid,uuid,uuid,integer,text,text,text,uuid)', 'EXECUTE')
    AND NOT has_function_privilege('service_role', 'public.preview_client_obligation_fifo(uuid,text,numeric,date)', 'EXECUTE'),
    'service_role denied'
  );

  PERFORM pg_temp.set_jwt(NULL, 'anon');
  BEGIN
    EXECUTE 'SET ROLE anon';
    v_ok := false; v_err := 'NO ERROR';
    BEGIN
      PERFORM public.preview_client_obligation_fifo(v_alpha, 'JJ_TO_CLIENT', 10, '2026-08-31');
    EXCEPTION WHEN OTHERS THEN
      v_err := SQLERRM;
      v_ok := v_err ILIKE '%permission denied%' OR v_err ILIKE '%must be owner%';
    END;
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('anon_preview_denied', v_ok, v_err);
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('anon_preview_denied', false, SQLERRM);
  END;

  PERFORM pg_temp.set_jwt(v_ceo, 'service_role');
  BEGIN
    EXECUTE 'SET ROLE service_role';
    v_ok := false; v_err := 'NO ERROR';
    BEGIN
      PERFORM public.bind_client_obligation_property(
        v_alpha, v_alpha, v_alpha, v_pa, 1, 'r', 'e', 'k-sr', NULL
      );
    EXCEPTION WHEN OTHERS THEN
      v_err := SQLERRM;
      v_ok := v_err ILIKE '%permission denied%' OR v_err ILIKE '%must be owner%';
    END;
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('service_role_bind_denied', v_ok, v_err);
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('service_role_bind_denied', false, SQLERRM);
  END;

  PERFORM pg_temp.set_jwt(v_inactive, 'authenticated');
  BEGIN
    EXECUTE 'SET ROLE authenticated';
    v_ok := false; v_err := 'NO ERROR';
    BEGIN
      PERFORM public.preview_client_obligation_fifo(v_alpha, 'JJ_TO_CLIENT', 10, '2026-08-31');
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

  PERFORM pg_temp.set_jwt(v_ops, 'authenticated');
  BEGIN
    EXECUTE 'SET ROLE authenticated';
    v_ok := false; v_err := 'NO ERROR';
    BEGIN
      PERFORM public.bind_client_obligation_property(
        v_alpha, v_alpha, v_alpha, v_pa, 1, 'r', 'e', 'k-ops', NULL
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

  PERFORM pg_temp.record(
    'no_freetext_bind_argument',
    NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = 'bind_client_obligation_property'
        AND pg_catalog.pg_get_function_identity_arguments(p.oid) ILIKE '%property_name%'
    ),
    'bind arguments are UUIDs'
  );

  PERFORM pg_temp.set_jwt(v_ceo, 'authenticated');
  EXECUTE 'SET ROLE authenticated';
  v_j := public.apply_client_settlement_opening_certification(
    v_alpha, '2026-01-01', 'opening A', 'evidence:fifo-a',
    'cert-pos-a', 1, NULL, -1000.00,
    jsonb_build_array(
      jsonb_build_object('line_order', 1, 'property_key', 'line-a', 'property_name', 'Fixture A',
        'component_code', 'opening_balance', 'amount_due_to_jj', -1000.00, 'reason', 'a', 'evidence_ref', 'ea')
    )
  );
  v_cert := (v_j->>'id')::uuid;
  v_j := public.apply_client_settlement_opening_certification(
    v_alpha, '2026-01-02', 'opening B', 'evidence:fifo-b',
    'cert-pos-b', 1, NULL, -2500.00,
    jsonb_build_array(
      jsonb_build_object('line_order', 1, 'property_key', 'line-b', 'property_name', 'Fixture B',
        'component_code', 'opening_balance', 'amount_due_to_jj', -2500.00, 'reason', 'b', 'evidence_ref', 'eb')
    )
  );
  v_j := public.apply_client_settlement_opening_certification(
    v_alpha, '2026-01-03', 'opening C unbound', 'evidence:fifo-c',
    'cert-pos-c', 1, NULL, -900.00,
    jsonb_build_array(
      jsonb_build_object('line_order', 1, 'property_key', 'line-c', 'property_name', 'Fixture C',
        'component_code', 'opening_balance', 'amount_due_to_jj', -900.00, 'reason', 'c', 'evidence_ref', 'ec'),
      jsonb_build_object('line_order', 2, 'property_key', 'line-unbound', 'property_name', 'Unbound',
        'component_code', 'opening_balance', 'amount_due_to_jj', 0.00, 'reason', 'u', 'evidence_ref', 'eu')
    )
  );
  EXECUTE 'RESET ROLE';
  SELECT l.id, l.certification_id INTO v_la, v_cert FROM finance.client_settlement_certification_lines l WHERE l.property_key = 'line-a';
  SELECT l.id, l.certification_id INTO v_lb, v_cert_b FROM finance.client_settlement_certification_lines l WHERE l.property_key = 'line-b';
  SELECT l.id, l.certification_id INTO v_lc, v_cert_c FROM finance.client_settlement_certification_lines l WHERE l.property_key = 'line-c';
  SELECT l.id INTO v_lunbound FROM finance.client_settlement_certification_lines l WHERE l.property_key = 'line-unbound';
  EXECUTE 'SET ROLE authenticated';

  v_j := public.apply_client_settlement_opening_certification(
    v_alpha, '2026-02-01', 'opening client owes', 'evidence:fifo-neg',
    'cert-neg-1', 1, NULL, 5000.00,
    jsonb_build_array(
      jsonb_build_object('line_order', 1, 'property_key', 'line-neg', 'property_name', 'Fixture A',
        'component_code', 'opening_balance', 'amount_due_to_jj', 5000.00, 'reason', 'n', 'evidence_ref', 'en')
    )
  );
  v_cert_neg := (v_j->>'id')::uuid;
  EXECUTE 'RESET ROLE';
  SELECT l.id INTO v_lneg FROM finance.client_settlement_certification_lines l WHERE l.certification_id = v_cert_neg;
  EXECUTE 'SET ROLE authenticated';

  v_ok := false; v_err := 'NO ERROR';
  BEGIN
    PERFORM public.bind_client_obligation_property(
      v_cert, v_la, v_alpha, v_unknown, 1, 'r', 'e', 'k-unknown', NULL
    );
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    v_ok := v_err ILIKE '%not_found%' AND v_err ILIKE '%propert%';
  END;
  PERFORM pg_temp.record('unknown_property_rejected', v_ok, v_err);

  v_ok := false; v_err := 'NO ERROR';
  BEGIN
    PERFORM public.bind_client_obligation_property(
      v_cert, v_la, v_alpha, v_pshared, 1, 'r', 'e', 'k-wrong-ent', NULL
    );
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    v_ok := v_err ILIKE '%different entity%';
  END;
  PERFORM pg_temp.record('wrong_entity_property_rejected', v_ok, v_err);

  v_ok := false; v_err := 'NO ERROR';
  BEGIN
    PERFORM public.bind_client_obligation_property(
      v_cert, v_la, v_alpha, v_orphan, 1, 'r', 'e', 'k-orphan', NULL
    );
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    v_ok := v_err ILIKE '%no active entity_property_associations%';
  END;
  PERFORM pg_temp.record('missing_entity_property_assignment_rejected', v_ok, v_err);

  v_ok := false; v_err := 'NO ERROR';
  BEGIN
    PERFORM public.bind_client_obligation_property(
      v_cert, v_la, v_alpha, v_draftprop, 1, 'r', 'e', 'k-draft-epa', NULL
    );
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    v_ok := v_err ILIKE '%no active entity_property_associations%';
  END;
  PERFORM pg_temp.record('draft_entity_property_assignment_rejected', v_ok, v_err);

  v_ok := false; v_err := 'NO ERROR';
  BEGIN
    PERFORM public.bind_client_obligation_property(
      v_cert, v_la, v_alpha, v_pa, 99, 'r', 'e', 'k-ver', NULL
    );
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    v_ok := v_err ILIKE '%stale%' OR v_err ILIKE '%version%';
  END;
  PERFORM pg_temp.record('changed_certification_version_rejected', v_ok, v_err);

  v_j := public.bind_client_obligation_property(
    v_cert, v_la, v_alpha, v_pa, 1, 'bind A', 'ev-a', 'k-bind-a', NULL
  );
  v_bind := (v_j->>'id')::uuid;
  PERFORM pg_temp.record('ceo_bind_allowed', (v_j->>'status') = 'active' AND (v_j->>'replay')::boolean = false, v_j::text);

  v_j := public.bind_client_obligation_property(
    v_cert, v_la, v_alpha, v_pa, 1, 'bind A', 'ev-a', 'k-bind-a', NULL
  );
  PERFORM pg_temp.record('identical_bind_replay', (v_j->>'replay')::boolean = true AND (v_j->>'id') = v_bind::text, v_j::text);

  v_ok := false; v_err := 'NO ERROR';
  BEGIN
    PERFORM public.bind_client_obligation_property(
      v_cert, v_la, v_alpha, v_pb, 1, 'bind A other', 'ev-a', 'k-bind-a', NULL
    );
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    v_ok := v_err ILIKE '%different payload%';
  END;
  PERFORM pg_temp.record('conflicting_replay_rejected', v_ok, v_err);

  v_j := public.bind_client_obligation_property(
    v_cert, v_la, v_alpha, v_pb, 1, 'remap A to B', 'ev-ab', 'k-bind-a2', v_bind
  );
  v_bind2 := (v_j->>'id')::uuid;
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.record(
    'append_only_supersession',
    (v_j->>'status') = 'active'
      AND (SELECT status FROM finance.client_obligation_property_bindings WHERE id = v_bind) = 'superseded'
      AND (SELECT count(*) FROM finance.client_obligation_property_bindings WHERE certification_line_id = v_la) = 2,
    v_j::text
  );
  PERFORM pg_temp.set_jwt(v_ceo, 'authenticated');
  EXECUTE 'SET ROLE authenticated';

  -- restore A as the active property for FIFO (supersede B back to A)
  v_j := public.bind_client_obligation_property(
    v_cert, v_la, v_alpha, v_pa, 1, 'remap back to A', 'ev-a3', 'k-bind-a3', v_bind2
  );
  PERFORM public.bind_client_obligation_property(
    v_cert_b, v_lb, v_alpha, v_pb, 1, 'bind B', 'ev-b', 'k-bind-b', NULL
  );
  PERFORM public.bind_client_obligation_property(
    v_cert_c, v_lc, v_alpha, v_pc, 1, 'bind C', 'ev-c', 'k-bind-c', NULL
  );
  PERFORM public.bind_client_obligation_property(
    v_cert_neg, v_lneg, v_alpha, v_pa, 1, 'bind neg', 'ev-n', 'k-bind-n', NULL
  );

  EXECUTE 'RESET ROLE';
  SELECT count(*) INTO v_unbound_n FROM finance.v_client_obligation_unbound_lines WHERE entity_id = v_alpha;
  PERFORM pg_temp.record('unbound_lines_reported', v_unbound_n = 1 AND v_lunbound IS NOT NULL, v_unbound_n::text);

  PERFORM pg_temp.set_jwt(v_ceo, 'authenticated');
  EXECUTE 'SET ROLE authenticated';
  v_j := public.preview_client_obligation_fifo(v_alpha, 'JJ_TO_CLIENT', 3260, '2026-08-31');
  v_hash3 := v_j->>'preview_hash';
  PERFORM pg_temp.record(
    'unbound_blocks_entire_preview',
    (v_j->>'blocked_code') = 'unbound_certification_line'
      AND (v_j->>'ok')::boolean = false
      AND jsonb_array_length(v_j->'unbound_lines') = 1
      AND jsonb_array_length(v_j->'canonical_snapshot'->'unbound_line_ids') = 1
      AND (v_j->'canonical_snapshot'->'unbound_line_ids'->0 #>> '{}') = v_lunbound::text
      AND v_hash3 ~ '^[a-f0-9]{64}$',
    v_j::text
  );
  PERFORM public.bind_client_obligation_property(
    v_cert_c, v_lunbound, v_alpha, v_pc, 1, 'bind unbound zero', 'ev-u', 'k-bind-u', NULL
  );
  EXECUTE 'RESET ROLE';
  BEGIN
    UPDATE finance.client_obligation_property_bindings SET reason = 'x' WHERE id = v_bind;
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    v_ok := v_err ILIKE '%immutable%' OR v_err ILIKE '%forbids%';
  END;
  PERFORM pg_temp.record('update_identity_blocked', v_ok, v_err);

  v_ok := false; v_err := 'NO ERROR';
  BEGIN
    DELETE FROM finance.client_obligation_property_bindings WHERE id = v_bind;
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    v_ok := v_err ILIKE '%DELETE%';
  END;
  PERFORM pg_temp.record('delete_binding_blocked', v_ok, v_err);

  PERFORM pg_temp.set_jwt(v_ceo, 'authenticated');
  EXECUTE 'SET ROLE authenticated';
  v_j := public.preview_client_obligation_fifo(v_alpha, 'JJ_TO_CLIENT', 3260, '2026-08-31');
  PERFORM pg_temp.record(
    'fifo_three_properties',
    (v_j->>'allocated_total')::numeric = 3260
      AND (v_j->>'unapplied_remainder')::numeric = 0
      AND (v_j->'allocations'->0->>'amount_applied')::numeric = 1000
      AND (v_j->'allocations'->1->>'amount_applied')::numeric = 2260
      AND jsonb_array_length(v_j->'allocations') = 2
      AND (v_j->>'blocked_code') IS NULL,
    v_j::text
  );

  v_j := public.preview_client_obligation_fifo(v_alpha, 'JJ_TO_CLIENT', 3260, '2026-08-31');
  -- remaining after hypothetical 3260 from 4400 positive + 5000 negative net:
  -- register R = 1000+2500+900-5000 = -600 before payment
  -- JJ_TO_CLIENT consumes only positives 4400, so allocated 3260, remainder 0
  -- balance_before_R is SUM of all remaining including negative = -600
  PERFORM pg_temp.record(
    'jj_to_client_skips_negative',
    jsonb_array_length(v_j->'allocations') = 2
      AND (SELECT bool_and((a->>'signed_opening')::numeric > 0) FROM jsonb_array_elements(v_j->'allocations') a),
    v_j::text
  );

  v_j := public.preview_client_obligation_fifo(v_alpha, 'CLIENT_TO_JJ', 3260, '2026-08-31');
  PERFORM pg_temp.record(
    'client_to_jj_signs',
    (v_j->>'allocated_total')::numeric = 3260
      AND (v_j->>'unapplied_remainder')::numeric = 0
      AND (SELECT bool_and((a->>'signed_opening')::numeric < 0) FROM jsonb_array_elements(v_j->'allocations') a)
      AND (v_j->>'balance_before_R')::numeric = -600
      AND (v_j->>'balance_after_R')::numeric = 2660,
    v_j::text
  );

  -- Isolated 5000 JJ-owes proof uses only positive slices for R' formula in TS;
  -- SQL net includes mixed cert. Dedicated cert entity Gamma for clean 5000.
  -- Reuse Gamma with one line -5000.
  v_j := public.apply_client_settlement_opening_certification(
    v_gamma, '2026-01-01', 'gamma opening', 'evidence:g',
    'cert-g-1', 1, NULL, -5000.00,
    jsonb_build_array(
      jsonb_build_object('line_order', 1, 'property_key', 'g-a', 'property_name', 'Other',
        'component_code', 'opening_balance', 'amount_due_to_jj', -5000.00, 'reason', 'g', 'evidence_ref', 'eg')
    )
  );
  v_cert := (v_j->>'id')::uuid;
  EXECUTE 'RESET ROLE';
  SELECT l.id INTO v_gline FROM finance.client_settlement_certification_lines l WHERE l.certification_id = v_cert;
  EXECUTE 'SET ROLE authenticated';
  PERFORM public.bind_client_obligation_property(
    v_cert, v_gline, v_gamma, v_pother, 1, 'bind g', 'ev-g', 'k-bind-g', NULL
  );
  v_j := public.preview_client_obligation_fifo(v_gamma, 'JJ_TO_CLIENT', 3260, '2026-08-31');
  PERFORM pg_temp.record(
    'jj_pays_5000_to_1740',
    (v_j->>'balance_before_R')::numeric = 5000
      AND (v_j->>'balance_after_R')::numeric = 1740
      AND (v_j->>'allocated_total')::numeric = 3260,
    v_j::text
  );

  v_j := public.apply_client_settlement_opening_certification(
    v_gamma, '2026-03-01', 'gamma owes', 'evidence:g2',
    'cert-g-2', 1, NULL, 5000.00,
    jsonb_build_array(
      jsonb_build_object('line_order', 1, 'property_key', 'g-neg', 'property_name', 'Other',
        'component_code', 'opening_balance', 'amount_due_to_jj', 5000.00, 'reason', 'g2', 'evidence_ref', 'eg2')
    )
  );
  v_cert := (v_j->>'id')::uuid;
  EXECUTE 'RESET ROLE';
  SELECT l.id INTO v_gline FROM finance.client_settlement_certification_lines l WHERE l.certification_id = v_cert;
  EXECUTE 'SET ROLE authenticated';
  PERFORM public.bind_client_obligation_property(
    v_cert, v_gline, v_gamma, v_pother, 1, 'bind g2', 'ev-g2', 'k-bind-g2', NULL
  );
  -- Gamma now has R = 5000 + (-5000) = 0 mixed. Separate entity needed...
  -- Use Beta 22222222 for client-owes only.
  v_j := public.apply_client_settlement_opening_certification(
    '22222222-2222-4222-8222-222222222222', '2026-01-01', 'beta owes', 'evidence:beta',
    'cert-beta-1', 1, NULL, 5000.00,
    jsonb_build_array(
      jsonb_build_object('line_order', 1, 'property_key', 'beta-a', 'property_name', 'Fixture A',
        'component_code', 'opening_balance', 'amount_due_to_jj', 5000.00, 'reason', 'beta', 'evidence_ref', 'ebeta')
    )
  );
  -- Beta has no EPA for v_pa — allow bind because no conflicting EPA for this property+other?
  -- v_pa has EPA to Alpha, so bind Beta+v_pa should fail wrong entity.
  -- Add EPA for beta to a new property... we only have 4 properties. Bind beta to v_pa will fail.
  -- Create association-free property? All A,B,C belong to Alpha. Other belongs to Gamma.
  -- For Beta, skip EPA check by using a property with no EPA... we don't have one.
  -- Allow bind if EPA is for SAME property to Alpha - that's wrong entity. So Beta cannot bind any current property.
  -- Add property D without EPA in this DO? INSERT may fail under authenticated.
  -- Use SET ROLE postgres temporarily? We're authenticated.
  -- Bind Beta to v_pother fails (Gamma EPA).
  -- I'll insert property as postgres by RESET ROLE.
  EXECUTE 'RESET ROLE';
  INSERT INTO public.properties (id, name) VALUES ('60606060-6060-4060-8060-606060606060', 'Fixture Property D')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO lifecycle.entity_property_associations (id, entity_id, property_id, status)
  VALUES ('ccccccc6-cccc-4ccc-8ccc-ccccccccccc6', '22222222-2222-4222-8222-222222222222', '60606060-6060-4060-8060-606060606060', 'active')
  ON CONFLICT (id) DO NOTHING;
  PERFORM pg_temp.set_jwt(v_ceo, 'authenticated');
  EXECUTE 'RESET ROLE';
  SELECT c.id, l.id INTO v_cert, v_gline
  FROM finance.client_settlement_certifications c
  JOIN finance.client_settlement_certification_lines l ON l.certification_id = c.id
  WHERE c.idempotency_key = 'cert-beta-1';
  EXECUTE 'SET ROLE authenticated';
  PERFORM public.bind_client_obligation_property(
    v_cert, v_gline,
    '22222222-2222-4222-8222-222222222222',
    '60606060-6060-4060-8060-606060606060',
    1, 'bind beta', 'ev-beta', 'k-bind-beta', NULL
  );
  v_j := public.preview_client_obligation_fifo('22222222-2222-4222-8222-222222222222', 'CLIENT_TO_JJ', 3260, '2026-08-31');
  PERFORM pg_temp.record(
    'client_pays_5000_to_1740',
    (v_j->>'balance_before_R')::numeric = -5000
      AND (v_j->>'balance_after_R')::numeric = -1740
      AND (v_j->>'allocated_total')::numeric = 3260,
    v_j::text
  );

  v_j := public.preview_client_obligation_fifo(v_gamma, 'JJ_TO_CLIENT', 3260, '2026-08-31');
  -- gamma mixed 5000 and -5000 after second cert — skip, already recorded 5000 path before second cert...
  -- second cert already applied. Recompute: R=0, JJ_TO_CLIENT allocates 3260 from the +5000 slice, remainder 0.
  -- Insufficient remainder test on Beta with huge payment:
  v_j := public.preview_client_obligation_fifo('22222222-2222-4222-8222-222222222222', 'CLIENT_TO_JJ', 3260, '2026-08-31');
  -- matching abs 5000, payment 3260 ok.
  -- For insufficient, pay 3260 against only 2000:
  -- Use leftover of Alpha positives after... they are still full because preview is read-only.
  v_j := public.preview_client_obligation_fifo(v_alpha, 'JJ_TO_CLIENT', 3260, '2026-08-31');
  -- positives 4400, not insufficient.
  -- Preview a 9000 payment:
  v_j := public.preview_client_obligation_fifo(v_alpha, 'JJ_TO_CLIENT', 9000, '2026-08-31');
  PERFORM pg_temp.record(
    'insufficient_remainder_blocked',
    (v_j->>'allocated_total')::numeric = 4400
      AND (v_j->>'unapplied_remainder')::numeric = 4600
      AND (v_j->>'blocked_code') = 'unapplied_remainder'
      AND (v_j->>'allocated_total')::numeric + (v_j->>'unapplied_remainder')::numeric = 9000,
    v_j::text
  );

  v_j := public.preview_client_obligation_fifo(v_alpha, 'JJ_TO_CLIENT', 3260, '2026-08-31');
  v_hash1 := v_j->>'preview_hash';
  v_j := public.preview_client_obligation_fifo(v_alpha, 'JJ_TO_CLIENT', 3260, '2026-08-31');
  v_hash2 := v_j->>'preview_hash';
  PERFORM pg_temp.record(
    'preview_hash_stable',
    v_hash1 = v_hash2 AND v_hash1 ~ '^[a-f0-9]{64}$',
    v_hash1
  );
  PERFORM pg_temp.record(
    'preview_hash_changes_with_unbound_set',
    v_hash3 IS DISTINCT FROM v_hash1 AND v_hash3 ~ '^[a-f0-9]{64}$',
    v_hash3
  );

  v_j := public.preview_client_obligation_fifo(v_alpha, 'JJ_TO_CLIENT', 3261, '2026-08-31');
  PERFORM pg_temp.record('preview_hash_changes_with_amount', (v_j->>'preview_hash') IS DISTINCT FROM v_hash1, v_j->>'preview_hash');

  v_j := public.preview_client_obligation_fifo(v_alpha, 'JJ_TO_CLIENT', 3260, '2026-01-01');
  PERFORM pg_temp.record('preview_hash_changes_with_date', (v_j->>'preview_hash') IS DISTINCT FROM v_hash1, v_j->>'preview_hash');

  v_j := public.preview_client_obligation_fifo(v_alpha, 'CLIENT_TO_JJ', 3260, '2026-08-31');
  PERFORM pg_temp.record('preview_hash_changes_with_direction', (v_j->>'preview_hash') IS DISTINCT FROM v_hash1, v_j->>'preview_hash');

  EXECUTE 'RESET ROLE';
  v_h_a := finance.client_obligation_fifo_sha256(
    jsonb_build_object('policy_version', 'client-obligation-fifo-v2', 'entity_id', v_alpha)
  );
  v_h_b := finance.client_obligation_fifo_sha256(
    jsonb_build_object('entity_id', v_alpha, 'policy_version', 'client-obligation-fifo-v2')
  );
  PERFORM pg_temp.record('preview_hash_key_reorder_stable', v_h_a = v_h_b AND v_h_a ~ '^[a-f0-9]{64}$', v_h_a);
  v_h_a := finance.client_obligation_fifo_sha256('{"k":"a|b"}'::jsonb);
  v_h_b := finance.client_obligation_fifo_sha256('{"k":"a","x":"b"}'::jsonb);
  PERFORM pg_temp.record('preview_hash_delimiter_no_collision', v_h_a IS DISTINCT FROM v_h_b, v_h_a || ' vs ' || v_h_b);
  PERFORM pg_temp.set_jwt(v_ceo, 'authenticated');
  EXECUTE 'SET ROLE authenticated';
  v_j := public.apply_client_settlement_opening_certification(
    v_delta, '2026-01-01', 'delta 2000', 'evidence:delta',
    'cert-delta-1', 1, NULL, -2000.00,
    jsonb_build_array(
      jsonb_build_object('line_order', 1, 'property_key', 'delta-a', 'property_name', 'Fixture E',
        'component_code', 'opening_balance', 'amount_due_to_jj', -2000.00, 'reason', 'd', 'evidence_ref', 'ed')
    )
  );
  v_cert := (v_j->>'id')::uuid;
  EXECUTE 'RESET ROLE';
  SELECT l.id INTO v_gline FROM finance.client_settlement_certification_lines l WHERE l.certification_id = v_cert;
  EXECUTE 'SET ROLE authenticated';
  PERFORM public.bind_client_obligation_property(
    v_cert, v_gline, v_delta, v_pe, 1, 'bind delta', 'ev-d', 'k-bind-d', NULL
  );
  v_j := public.preview_client_obligation_fifo(v_delta, 'JJ_TO_CLIENT', 3260, '2026-08-31');
  PERFORM pg_temp.record(
    'insufficient_2000_payment_3260',
    (v_j->>'allocated_total')::numeric = 2000
      AND (v_j->>'unapplied_remainder')::numeric = 1260
      AND (v_j->>'blocked_code') = 'unapplied_remainder'
      AND (v_j->>'allocated_total')::numeric + (v_j->>'unapplied_remainder')::numeric = 3260,
    v_j::text
  );

  v_j := public.apply_client_settlement_opening_certification(
    v_delta, '2026-05-01', 'delta void target', 'evidence:void',
    'cert-delta-void', 1, NULL, -1.00,
    jsonb_build_array(
      jsonb_build_object('line_order', 1, 'property_key', 'delta-void', 'property_name', 'Fixture E',
        'component_code', 'opening_balance', 'amount_due_to_jj', -1.00, 'reason', 'v', 'evidence_ref', 'evoid')
    )
  );
  v_cert := (v_j->>'id')::uuid;
  PERFORM public.void_client_settlement_opening_certification(v_cert, 'supersede for bind test', 'evidence:void2');
  EXECUTE 'RESET ROLE';
  SELECT l.id INTO v_gline FROM finance.client_settlement_certification_lines l WHERE l.certification_id = v_cert;
  EXECUTE 'SET ROLE authenticated';
  v_ok := false; v_err := 'NO ERROR';
  BEGIN
    PERFORM public.bind_client_obligation_property(
      v_cert, v_gline, v_delta, v_pe, 1, 'bind voided', 'ev-void', 'k-bind-void', NULL
    );
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    v_ok := v_err ILIKE '%not applied%' OR v_err ILIKE '%status%';
  END;
  PERFORM pg_temp.record('superseded_certification_rejected', v_ok, v_err);

  v_j := public.preview_client_obligation_fifo(v_delta, 'JJ_TO_CLIENT', 3260, '2026-08-31');
  PERFORM pg_temp.record(
    'void_certification_excluded',
    (v_j->>'balance_before_R')::numeric = 2000
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(COALESCE(v_j->'canonical_snapshot'->'sources', '[]'::jsonb)) s
        WHERE (s->>'signed_original_amount') IN ('1.00', '-1.00')
      ),
    v_j::text
  );

  v_j := public.apply_client_settlement_opening_certification(
    v_epsilon, '2026-06-01', 'epsilon v1', 'evidence:eps1',
    'cert-eps-1', 1, NULL, -100.00,
    jsonb_build_array(
      jsonb_build_object('line_order', 1, 'property_key', 'eps-a', 'property_name', 'Fixture F',
        'component_code', 'opening_balance', 'amount_due_to_jj', -100.00, 'reason', 'e1', 'evidence_ref', 'ee1')
    )
  );
  v_cert := (v_j->>'id')::uuid;
  EXECUTE 'RESET ROLE';
  SELECT l.id INTO v_gline FROM finance.client_settlement_certification_lines l WHERE l.certification_id = v_cert;
  EXECUTE 'SET ROLE authenticated';
  PERFORM public.bind_client_obligation_property(
    v_cert, v_gline, v_epsilon, v_pf, 1, 'bind eps v1', 'ev-eps1', 'k-bind-eps1', NULL
  );
  v_j := public.apply_client_settlement_opening_certification(
    v_epsilon, '2026-06-01', 'epsilon v2', 'evidence:eps2',
    'cert-eps-2', 2, v_cert, -250.00,
    jsonb_build_array(
      jsonb_build_object('line_order', 1, 'property_key', 'eps-a', 'property_name', 'Fixture F',
        'component_code', 'opening_balance', 'amount_due_to_jj', -250.00, 'reason', 'e2', 'evidence_ref', 'ee2')
    )
  );
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.record(
    'superseded_version_excluded_until_bound',
    (SELECT status FROM finance.client_settlement_certifications WHERE idempotency_key = 'cert-eps-1') = 'void'
      AND NOT EXISTS (
        SELECT 1 FROM finance.v_client_property_obligation_register r
        WHERE r.entity_id = v_epsilon AND r.original_signed_amount = 100
      )
      AND EXISTS (
        SELECT 1 FROM finance.v_client_obligation_unbound_lines u
        WHERE u.entity_id = v_epsilon
      ),
    'v1 voided; v2 unbound'
  );
  PERFORM pg_temp.set_jwt(v_ceo, 'authenticated');
  EXECUTE 'SET ROLE authenticated';
  v_j := public.preview_client_obligation_fifo(v_epsilon, 'JJ_TO_CLIENT', 50, '2026-08-31');
  PERFORM pg_temp.record(
    'current_applied_unbound_after_supersede',
    (v_j->>'blocked_code') = 'unbound_certification_line'
      AND (v_j->>'balance_before_R')::numeric = 0,
    v_j::text
  );
  EXECUTE 'RESET ROLE';
  SELECT l.id, l.certification_id INTO v_gline, v_cert
  FROM finance.client_settlement_certifications c
  JOIN finance.client_settlement_certification_lines l ON l.certification_id = c.id
  WHERE c.idempotency_key = 'cert-eps-2';
  EXECUTE 'SET ROLE authenticated';
  PERFORM public.bind_client_obligation_property(
    v_cert, v_gline, v_epsilon, v_pf, 2, 'bind eps v2', 'ev-eps2', 'k-bind-eps2', NULL
  );
  v_j := public.preview_client_obligation_fifo(v_epsilon, 'JJ_TO_CLIENT', 50, '2026-08-31');
  PERFORM pg_temp.record(
    'current_applied_version_only',
    (v_j->>'blocked_code') IS NULL
      AND (v_j->>'balance_before_R')::numeric = 250
      AND (v_j->>'allocated_total')::numeric = 50
      AND (v_j->'canonical_snapshot'->'sources'->0->>'signed_original_amount') = '250.00',
    v_j::text
  );

  EXECUTE 'RESET ROLE';
  INSERT INTO finance.client_settlement_certifications (
    id, entity_id, as_of, status, reason, evidence_ref, idempotency_key,
    created_by, total_due_to_jj, version
  ) VALUES (
    'aaaaaaa0-aaaa-4aaa-8aaa-aaaaaaaaaaa0',
    v_epsilon, '2026-09-01', 'draft', 'draft only', 'evidence:draft',
    'cert-eps-draft', v_ceo, -10.00, 1
  );
  INSERT INTO finance.client_settlement_certification_lines (
    id, certification_id, line_order, property_key, property_name, component_code,
    amount_due_to_jj, reason, evidence_ref
  ) VALUES (
    'bbbbbbb0-bbbb-4bbb-8bbb-bbbbbbbbbbb0',
    'aaaaaaa0-aaaa-4aaa-8aaa-aaaaaaaaaaa0',
    1, 'eps-draft', 'Fixture F', 'opening_balance', -10.00, 'draft', 'evidence:draft-line'
  );
  PERFORM pg_temp.record(
    'draft_certification_excluded',
    NOT EXISTS (
      SELECT 1 FROM finance.v_client_property_obligation_register r
      WHERE r.source_line_identity = 'bbbbbbb0-bbbb-4bbb-8bbb-bbbbbbbbbbb0'
    )
    AND NOT EXISTS (
      SELECT 1 FROM finance.v_client_obligation_unbound_lines u
      WHERE u.source_line_identity = 'bbbbbbb0-bbbb-4bbb-8bbb-bbbbbbbbbbb0'
    ),
    'draft omitted from register and unbound'
  );

  PERFORM pg_temp.set_jwt(v_ceo, 'authenticated');
  EXECUTE 'SET ROLE authenticated';
  v_ok := false; v_err := 'NO ERROR';
  BEGIN
    INSERT INTO finance.client_obligation_property_bindings (
      certification_id, certification_line_id, entity_id, property_id,
      certification_version, property_key, status, reason, evidence_ref,
      idempotency_key, created_by
    ) VALUES (
      v_cert, v_gline, v_epsilon, v_pf, 2, 'x', 'active', 'r', 'e', 'k-direct-auth', v_ceo
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
    INSERT INTO finance.client_obligation_property_bindings (
      certification_id, certification_line_id, entity_id, property_id,
      certification_version, property_key, status, reason, evidence_ref,
      idempotency_key, created_by
    ) VALUES (
      v_cert, v_gline, v_epsilon, v_pf, 2, 'x', 'active', 'r', 'e', 'k-direct-sr', v_ceo
    );
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    v_ok := v_err ILIKE '%permission denied%';
  END;
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.record('service_role_direct_write_denied', v_ok, v_err);

  EXECUTE 'RESET ROLE';

  PERFORM pg_temp.record('public_transactions_unchanged', pg_temp.tx_fp() = v_tx0, pg_temp.tx_fp());
  PERFORM pg_temp.record('rc3_fingerprint_unchanged', pg_temp.rc3_fp() = v_rc30, pg_temp.rc3_fp());
  PERFORM pg_temp.record('certified_ledger_unchanged', pg_temp.ledger_fp() = v_led0, pg_temp.ledger_fp());
  PERFORM pg_temp.record(
    'drafts_unchanged',
    (SELECT count(*) FROM finance.agent_transaction_drafts) = v_drafts0,
    'drafts'
  );
  PERFORM pg_temp.record(
    'overlay_events_unchanged',
    (SELECT count(*) FROM finance.client_settlement_events) = v_events0,
    'events'
  );
  PERFORM pg_temp.record(
    'owner_level_rows_unchanged',
    (SELECT count(*) FROM finance.owner_transaction_links) = v_own0,
    'owner links'
  );
  PERFORM pg_temp.record(
    'certification_rows_not_mutated_after_apply',
    (SELECT count(*) FROM finance.client_settlement_certifications WHERE status = 'applied') >= 4
      AND (SELECT count(*) FROM finance.client_settlement_certification_lines) >= 7,
    'certs intact'
  );
  PERFORM pg_temp.record(
    'no_cash_row_created',
    NOT EXISTS (
      SELECT 1 FROM public.transactions
      WHERE subcategory IN ('Bank Payment to Owner', 'Client Payment')
        AND id NOT IN ('33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444')
    ),
    'no new cash'
  );
END;
$$;

SELECT * FROM matrix_result ORDER BY test_name;
