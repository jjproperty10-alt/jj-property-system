-- Isolated identity-reassignment matrix. Fail closed: any FAIL raises.

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
  v_old uuid := '11111111-1111-4111-8111-111111111111';
  v_new uuid := '22222222-2222-4222-8222-222222222222';
  v_gamma uuid := '66666666-6666-4666-8666-666666666666';
  v_delta uuid := '77777777-7777-4777-8777-777777777777';
  v_mr1 uuid := '81818181-8181-4818-8818-818181818181';
  v_epa1 uuid := '91919191-9191-4919-8919-919191919191';
  v_se1 uuid := 'a1a1a1a1-a1a1-4aa1-8aa1-a1a1a1a1a1a1';
  v_mr2 uuid := '82828282-8282-4828-8828-828282828282';
  v_epa2 uuid := '92929292-9292-4929-8929-929292929292';
  v_se2 uuid := 'a2a2a2a2-a2a2-4aa2-8aa2-a2a2a2a2a2a2';
  v_prop1 uuid := 'b1b1b1b1-b1b1-4bb1-8bb1-b1b1b1b1b1b1';
  v_prop2 uuid := 'b2b2b2b2-b2b2-4bb2-8bb2-b2b2b2b2b2b2';
  v_missing uuid := 'f1f1f1f1-f1f1-4ff1-8ff1-f1f1f1f1f1f1';
  v_before_fp text;
  v_after_fp text;
  v_jacob_before numeric;
  v_jacob_after numeric;
  v_pnl_before numeric;
  v_pnl_after numeric;
  v_j jsonb;
  v_err text;
  v_count integer;
  v_op uuid;
  v_gamma_before uuid;
  v_delta_before uuid;
  v_ok boolean;
  v_rpc text := 'public.apply_managed_property_identity_reassignment(uuid,uuid,uuid,uuid,uuid,text,uuid,text,text,text,text)';
BEGIN
  v_before_fp := pg_temp.tx_fingerprint();
  SELECT total_received INTO v_jacob_before FROM public.v_cashbox_audit WHERE cash_box_name = 'Jacob';
  SELECT net INTO v_pnl_before FROM public.v_jj_pnl_fixture;
  SELECT entity_id INTO v_gamma_before FROM lifecycle.management_relationship WHERE id = '83838383-8383-4838-8838-838383838383';
  SELECT entity_id INTO v_delta_before FROM lifecycle.management_relationship WHERE id = '84848484-8484-4848-8848-848484848484';

  PERFORM pg_temp.record(
    'catalog_tables',
    to_regclass('lifecycle.identity_reassignment_audit') IS NOT NULL
    AND to_regclass('lifecycle.identity_reassignment_operations') IS NOT NULL,
    'audit+operations'
  );

  PERFORM pg_temp.record(
    'rpc_authenticated_execute',
    has_function_privilege('authenticated', v_rpc, 'EXECUTE'),
    'authenticated EXECUTE'
  );
  PERFORM pg_temp.record(
    'rpc_anon_no_execute',
    NOT has_function_privilege('anon', v_rpc, 'EXECUTE'),
    'anon denied'
  );
  PERFORM pg_temp.record(
    'rpc_service_role_no_execute',
    NOT has_function_privilege('service_role', v_rpc, 'EXECUTE'),
    'service_role denied'
  );
  PERFORM pg_temp.record(
    'helper_no_client_execute',
    NOT has_function_privilege('authenticated', 'lifecycle.assert_identity_reassignment_authorized()', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'lifecycle.assert_identity_reassignment_authorized()', 'EXECUTE')
    AND NOT has_function_privilege('service_role', 'lifecycle.assert_identity_reassignment_authorized()', 'EXECUTE'),
    'helper locked'
  );
  PERFORM pg_temp.record(
    'no_direct_update_grants',
    NOT has_table_privilege('authenticated', 'lifecycle.management_relationship', 'UPDATE')
    AND NOT has_table_privilege('authenticated', 'lifecycle.entity_property_associations', 'UPDATE')
    AND NOT has_table_privilege('authenticated', 'lifecycle.service_engagements', 'UPDATE')
    AND NOT has_table_privilege('anon', 'lifecycle.management_relationship', 'UPDATE')
    AND NOT has_table_privilege('service_role', 'lifecycle.management_relationship', 'UPDATE'),
    'no client UPDATE'
  );

  PERFORM pg_temp.set_jwt(NULL, 'anon');
  BEGIN
    SET LOCAL ROLE anon;
    PERFORM public.apply_managed_property_identity_reassignment(
      v_mr1, v_epa1, v_se1, v_old, v_new, 'Test Managed Property', v_prop1, 'airbnb_str',
      'r', 'e', 'k-anon'
    );
    PERFORM pg_temp.record('anon_rpc_denied', false, 'unexpected success');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.record('anon_rpc_denied', true, SQLERRM);
  END;
  RESET ROLE;

  PERFORM pg_temp.set_jwt(v_ops, 'authenticated');
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM public.apply_managed_property_identity_reassignment(
      v_mr1, v_epa1, v_se1, v_old, v_new, 'Test Managed Property', v_prop1, 'airbnb_str',
      'r', 'e', 'k-ops'
    );
    PERFORM pg_temp.record('operations_rpc_denied', false, 'unexpected success');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.record('operations_rpc_denied', SQLERRM ILIKE '%not permitted%' OR SQLERRM ILIKE '%jj_auth%', SQLERRM);
  END;
  RESET ROLE;

  PERFORM pg_temp.set_jwt(v_str, 'authenticated');
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM public.apply_managed_property_identity_reassignment(
      v_mr1, v_epa1, v_se1, v_old, v_new, 'Test Managed Property', v_prop1, 'airbnb_str',
      'r', 'e', 'k-stmt'
    );
    PERFORM pg_temp.record('statement_operator_rpc_denied', false, 'unexpected success');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.record('statement_operator_rpc_denied', SQLERRM ILIKE '%not permitted%' OR SQLERRM ILIKE '%jj_auth%', SQLERRM);
  END;
  RESET ROLE;

  PERFORM pg_temp.set_jwt(v_ceo, 'service_role');
  BEGIN
    SET LOCAL ROLE service_role;
    PERFORM public.apply_managed_property_identity_reassignment(
      v_mr1, v_epa1, v_se1, v_old, v_new, 'Test Managed Property', v_prop1, 'airbnb_str',
      'r', 'e', 'k-svc'
    );
    PERFORM pg_temp.record('service_role_rpc_denied', false, 'unexpected success');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.record('service_role_rpc_denied', true, SQLERRM);
  END;
  RESET ROLE;

  PERFORM set_config('request.jwt.claim.sub', '', false);
  PERFORM set_config('request.jwt.claim.role', '', false);
  PERFORM set_config('request.jwt.claims', '{}', false);
  BEGIN
    PERFORM public.apply_managed_property_identity_reassignment(
      v_mr1, v_epa1, v_se1, v_old, v_new, 'Test Managed Property', v_prop1, 'airbnb_str',
      'r', 'e', 'k-nosession'
    );
    PERFORM pg_temp.record('no_session_denied', false, 'unexpected success');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.record('no_session_denied', SQLERRM ILIKE '%Authenticated session required%', SQLERRM);
  END;

  PERFORM pg_temp.set_jwt(v_ceo, 'authenticated');
  SET LOCAL ROLE authenticated;
  v_j := public.apply_managed_property_identity_reassignment(
    v_mr1, v_epa1, v_se1, v_old, v_new, 'Test Managed Property', v_prop1, 'airbnb_str',
    'reassign test property to beta', 'evidence-alpha-beta', 'idem-alpha-beta-1'
  );
  RESET ROLE;

  v_op := (v_j->>'operation_id')::uuid;
  PERFORM pg_temp.record(
    'ceo_succeeds',
    (v_j->>'replay')::boolean = false
    AND (v_j->>'updated_count')::int = 3
    AND (v_j->>'audit_count')::int = 3
    AND (v_j->>'actor') = v_ceo::text
    AND (v_j->>'old_entity_id') = v_old::text
    AND (v_j->>'new_entity_id') = v_new::text,
    v_j::text
  );

  SELECT count(*) INTO v_count FROM lifecycle.identity_reassignment_audit WHERE operation_id = v_op;
  PERFORM pg_temp.record('audit_three_rows', v_count = 3, v_count::text);

  PERFORM pg_temp.record(
    'audit_payload',
    (SELECT bool_and(
        actor = v_ceo
        AND reason = 'reassign test property to beta'
        AND evidence_ref = 'evidence-alpha-beta'
        AND old_entity_id = v_old
        AND new_entity_id = v_new
        AND old_row ? 'entity_id'
        AND new_row ? 'entity_id'
        AND operation = 'entity_reassignment'
        AND transaction_id IS NOT NULL
      )
     FROM lifecycle.identity_reassignment_audit WHERE operation_id = v_op),
    'actor/reason/json'
  );

  PERFORM pg_temp.record(
    'rows_now_beta',
    (SELECT entity_id FROM lifecycle.management_relationship WHERE id = v_mr1) = v_new
    AND (SELECT entity_id FROM lifecycle.entity_property_associations WHERE id = v_epa1) = v_new
    AND (SELECT entity_id FROM lifecycle.service_engagements WHERE id = v_se1) = v_new,
    'entity_id=beta'
  );

  PERFORM pg_temp.set_jwt(v_ceo, 'authenticated');
  SET LOCAL ROLE authenticated;
  v_j := public.apply_managed_property_identity_reassignment(
    v_mr1, v_epa1, v_se1, v_old, v_new, 'Test Managed Property', v_prop1, 'airbnb_str',
    'reassign test property to beta', 'evidence-alpha-beta', 'idem-alpha-beta-1'
  );
  RESET ROLE;
  PERFORM pg_temp.record(
    'replay_zero_writes',
    (v_j->>'replay')::boolean = true
    AND (v_j->>'idempotent')::boolean = true
    AND (v_j->>'updated_count')::int = 0
    AND (v_j->>'audit_count')::int = 0
    AND (v_j->>'operation_id') = v_op::text
    AND (SELECT count(*) FROM lifecycle.identity_reassignment_audit) = 3,
    v_j::text
  );

  PERFORM pg_temp.set_jwt(v_ceo, 'authenticated');
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM public.apply_managed_property_identity_reassignment(
      v_mr1, v_epa1, v_se1, v_old, v_new, 'Test Managed Property', v_prop1, 'airbnb_str',
      'different reason', 'evidence-alpha-beta', 'idem-alpha-beta-1'
    );
    PERFORM pg_temp.record('idempotency_conflict', false, 'unexpected success');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.record('idempotency_conflict', SQLERRM ILIKE '%different payload%', SQLERRM);
  END;
  RESET ROLE;

  PERFORM pg_temp.set_jwt(v_fin, 'authenticated');
  SET LOCAL ROLE authenticated;
  v_j := public.apply_managed_property_identity_reassignment(
    v_mr2, v_epa2, v_se2, v_old, v_new, 'Second Managed Property', v_prop2, 'airbnb_str',
    'finance admin reassignment', 'evidence-fin', 'idem-fin-1'
  );
  RESET ROLE;
  PERFORM pg_temp.record(
    'finance_admin_succeeds',
    (v_j->>'replay')::boolean = false
    AND (v_j->>'updated_count')::int = 3
    AND (v_j->>'actor') = v_fin::text
    AND (SELECT entity_id FROM lifecycle.management_relationship WHERE id = v_mr2) = v_new,
    v_j::text
  );

  -- Fail-closed cases against a fresh clone of group 1 semantics: use missing/wrong inputs on already-moved rows.
  PERFORM pg_temp.set_jwt(v_ceo, 'authenticated');
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM public.apply_managed_property_identity_reassignment(
      '84848484-8484-4848-8848-848484848484',
      '94949494-9494-4949-8949-949494949494',
      'a4a4a4a4-a4a4-4aa4-8aa4-a4a4a4a4a4a4',
      v_delta, v_new, 'Wrong Name', 'b4b4b4b4-b4b4-4bb4-8bb4-b4b4b4b4b4b4', 'airbnb_str',
      'r', 'e', 'k-wrong-name'
    );
    PERFORM pg_temp.record('wrong_property_name_rolls_back', false, 'unexpected success');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.record('wrong_property_name_rolls_back', SQLERRM ILIKE '%property_name%', SQLERRM);
  END;
  RESET ROLE;

  PERFORM pg_temp.set_jwt(v_ceo, 'authenticated');
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM public.apply_managed_property_identity_reassignment(
      '84848484-8484-4848-8848-848484848484',
      '94949494-9494-4949-8949-949494949494',
      'a4a4a4a4-a4a4-4aa4-8aa4-a4a4a4a4a4a4',
      v_old, v_new, 'Alias Property', 'b4b4b4b4-b4b4-4bb4-8bb4-b4b4b4b4b4b4', 'airbnb_str',
      'r', 'e', 'k-wrong-old'
    );
    PERFORM pg_temp.record('wrong_old_entity_rolls_back', false, 'unexpected success');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.record('wrong_old_entity_rolls_back', SQLERRM ILIKE '%expected_old_entity_id%', SQLERRM);
  END;
  RESET ROLE;

  PERFORM pg_temp.set_jwt(v_ceo, 'authenticated');
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM public.apply_managed_property_identity_reassignment(
      '84848484-8484-4848-8848-848484848484',
      '94949494-9494-4949-8949-949494949494',
      'a4a4a4a4-a4a4-4aa4-8aa4-a4a4a4a4a4a4',
      v_delta, v_new, 'Alias Property', v_missing, 'airbnb_str',
      'r', 'e', 'k-wrong-prop'
    );
    PERFORM pg_temp.record('wrong_canonical_rolls_back', false, 'unexpected success');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.record('wrong_canonical_rolls_back', SQLERRM ILIKE '%property_id%', SQLERRM);
  END;
  RESET ROLE;

  PERFORM pg_temp.set_jwt(v_ceo, 'authenticated');
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM public.apply_managed_property_identity_reassignment(
      '84848484-8484-4848-8848-848484848484',
      '94949494-9494-4949-8949-949494949494',
      'a4a4a4a4-a4a4-4aa4-8aa4-a4a4a4a4a4a4',
      v_delta, v_new, 'Alias Property', 'b4b4b4b4-b4b4-4bb4-8bb4-b4b4b4b4b4b4', 'long_term',
      'r', 'e', 'k-wrong-svc'
    );
    PERFORM pg_temp.record('wrong_service_type_rolls_back', false, 'unexpected success');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.record('wrong_service_type_rolls_back', SQLERRM ILIKE '%service_type%', SQLERRM);
  END;
  RESET ROLE;

  PERFORM pg_temp.set_jwt(v_ceo, 'authenticated');
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM public.apply_managed_property_identity_reassignment(
      '84848484-8484-4848-8848-848484848484',
      '94949494-9494-4949-8949-949494949494',
      v_missing,
      v_delta, v_new, 'Alias Property', 'b4b4b4b4-b4b4-4bb4-8bb4-b4b4b4b4b4b4', 'airbnb_str',
      'r', 'e', 'k-missing-se'
    );
    PERFORM pg_temp.record('missing_row_rolls_back', false, 'unexpected success');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.record('missing_row_rolls_back', SQLERRM ILIKE '%does not exist%', SQLERRM);
  END;
  RESET ROLE;

  -- Conflict: Beta already owns Test Managed Property after ceo success.
  -- Attempt to move Gamma's Unrelated Property is fine; instead insert a competing Beta MR
  -- is already present. Move Delta's alias onto Beta with same name would require same property_name.
  -- Create a competing active EPA for Beta on a new third property then try to reassign Gamma onto Beta
  -- with Gamma's own property - no conflict. Real conflict: try reassigning Gamma's trio onto Beta
  -- after we copy Beta onto Gamma's property? Simpler: try to reassign Gamma MR/EPA/SE to Beta
  -- while Beta already has an active MR with the SAME property_name. Change Gamma property_name
  -- is not allowed here. Insert extra active EPA for Beta + Gamma's property_id.
  INSERT INTO lifecycle.entity_property_associations (
    id, entity_id, property_id, association_source, status
  ) VALUES (
    '95959595-9595-4959-8959-959595959595', v_new, 'b3b3b3b3-b3b3-4bb3-8bb3-b3b3b3b3b3b3', 'management_relationship', 'active'
  );

  PERFORM pg_temp.set_jwt(v_ceo, 'authenticated');
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM public.apply_managed_property_identity_reassignment(
      '83838383-8383-4838-8838-838383838383',
      '93939393-9393-4939-8939-939393939393',
      'a3a3a3a3-a3a3-4aa3-8aa3-a3a3a3a3a3a3',
      v_gamma, v_new, 'Unrelated Property', 'b3b3b3b3-b3b3-4bb3-8bb3-b3b3b3b3b3b3', 'airbnb_str',
      'should conflict', 'ev-conflict', 'k-conflict'
    );
    PERFORM pg_temp.record('new_entity_conflict_rolls_back', false, 'unexpected success');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.record('new_entity_conflict_rolls_back', SQLERRM ILIKE '%conflicting active%', SQLERRM);
  END;
  RESET ROLE;

  PERFORM pg_temp.record(
    'conflict_did_not_move_gamma',
    (SELECT entity_id FROM lifecycle.management_relationship WHERE id = '83838383-8383-4838-8838-838383838383') = v_gamma
    AND (SELECT count(*) FROM lifecycle.identity_reassignment_operations WHERE idempotency_key = 'k-conflict') = 0,
    'gamma unchanged'
  );

  -- Forced audit failure on a remaining Alpha-owned row? Group 1 and 2 already moved.
  -- Use Delta trio (still Delta). Replace MR audit trigger, attempt Delta -> Beta.
  CREATE OR REPLACE FUNCTION lifecycle.trg_ira_force_fail()
  RETURNS trigger
  LANGUAGE plpgsql
  AS $ff$
  BEGIN
    RAISE EXCEPTION 'forced audit failure';
  END;
  $ff$;
  DROP TRIGGER trg_ira_audit_mr ON lifecycle.management_relationship;
  CREATE TRIGGER trg_ira_audit_mr
    AFTER UPDATE OF entity_id ON lifecycle.management_relationship
    FOR EACH ROW EXECUTE FUNCTION lifecycle.trg_ira_force_fail();

  PERFORM pg_temp.set_jwt(v_ceo, 'authenticated');
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM public.apply_managed_property_identity_reassignment(
      '84848484-8484-4848-8848-848484848484',
      '94949494-9494-4949-8949-949494949494',
      'a4a4a4a4-a4a4-4aa4-8aa4-a4a4a4a4a4a4',
      v_delta, v_new, 'Alias Property', 'b4b4b4b4-b4b4-4bb4-8bb4-b4b4b4b4b4b4', 'airbnb_str',
      'force fail', 'ev-fail', 'k-force-fail'
    );
    PERFORM pg_temp.record('forced_audit_failure_rolls_back', false, 'unexpected success');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.record('forced_audit_failure_rolls_back', SQLERRM ILIKE '%forced audit failure%', SQLERRM);
  END;
  RESET ROLE;

  PERFORM pg_temp.record(
    'forced_fail_left_delta',
    (SELECT entity_id FROM lifecycle.management_relationship WHERE id = '84848484-8484-4848-8848-848484848484') = v_delta
    AND (SELECT entity_id FROM lifecycle.entity_property_associations WHERE id = '94949494-9494-4949-8949-949494949494') = v_delta
    AND (SELECT entity_id FROM lifecycle.service_engagements WHERE id = 'a4a4a4a4-a4a4-4aa4-8aa4-a4a4a4a4a4a4') = v_delta
    AND (SELECT count(*) FROM lifecycle.identity_reassignment_operations WHERE idempotency_key = 'k-force-fail') = 0,
    'delta unchanged'
  );

  DROP TRIGGER trg_ira_audit_mr ON lifecycle.management_relationship;
  CREATE TRIGGER trg_ira_audit_mr
    AFTER UPDATE OF entity_id ON lifecycle.management_relationship
    FOR EACH ROW EXECUTE FUNCTION lifecycle.trg_identity_reassignment_audit();
  DROP FUNCTION lifecycle.trg_ira_force_fail();

  BEGIN
    UPDATE lifecycle.identity_reassignment_audit SET reason = 'tamper' WHERE operation_id = v_op;
    PERFORM pg_temp.record('audit_update_denied', false, 'unexpected success');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.record('audit_update_denied', SQLERRM ILIKE '%append-only%', SQLERRM);
  END;

  BEGIN
    DELETE FROM lifecycle.identity_reassignment_audit WHERE operation_id = v_op;
    PERFORM pg_temp.record('audit_delete_denied', false, 'unexpected success');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.record('audit_delete_denied', SQLERRM ILIKE '%append-only%', SQLERRM);
  END;

  PERFORM pg_temp.set_jwt(v_ceo, 'authenticated');
  BEGIN
    SET LOCAL ROLE authenticated;
    UPDATE lifecycle.management_relationship SET entity_id = v_old WHERE id = v_mr1;
    PERFORM pg_temp.record('authenticated_table_update_denied', false, 'unexpected success');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.record('authenticated_table_update_denied', true, SQLERRM);
  END;
  RESET ROLE;

  PERFORM pg_temp.record(
    'unrelated_history_unchanged',
    (SELECT entity_id FROM lifecycle.management_relationship WHERE id = '83838383-8383-4838-8838-838383838383') = v_gamma_before
    AND (SELECT entity_id FROM lifecycle.management_relationship WHERE id = '84848484-8484-4848-8848-848484848484') = v_delta_before
    AND (SELECT entity_id FROM lifecycle.entity_property_associations WHERE id = '93939393-9393-4939-8939-939393939393') = v_gamma
    AND (SELECT entity_id FROM lifecycle.service_engagements WHERE id = 'a3a3a3a3-a3a3-4aa3-8aa3-a3a3a3a3a3a3') = v_gamma,
    'gamma/delta intact'
  );

  v_after_fp := pg_temp.tx_fingerprint();
  SELECT total_received INTO v_jacob_after FROM public.v_cashbox_audit WHERE cash_box_name = 'Jacob';
  SELECT net INTO v_pnl_after FROM public.v_jj_pnl_fixture;
  PERFORM pg_temp.record(
    'cash_pnl_tx_unchanged',
    v_before_fp = v_after_fp AND v_jacob_before = v_jacob_after AND v_pnl_before = v_pnl_after,
    v_before_fp || ' -> ' || v_after_fp
  );

  PERFORM pg_temp.record(
    'no_settlement_tables_touched',
    to_regclass('finance.client_settlement_events') IS NULL,
    'settlement absent'
  );
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM matrix_result WHERE passed IS NOT TRUE) THEN
    RAISE EXCEPTION 'ROLE_MATRIX_FAIL %',
      (SELECT json_agg(m) FROM matrix_result m WHERE passed IS NOT TRUE);
  END IF;
END;
$$;

SELECT test_name, passed, detail FROM matrix_result ORDER BY test_name;
