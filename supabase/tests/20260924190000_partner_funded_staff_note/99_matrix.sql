-- Isolated staff-note matrix. Disposable database only. No Production ids.

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

DO $$
DECLARE
  v_fin uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  v_zeta uuid := '66666666-6666-4666-8666-666666666666';
  v_north uuid := '81818181-8181-4818-8818-818181818181';
  v_pz uuid := '12121212-1212-4121-8121-121212121212';
  v_note text := 'יוסי שילם אישית לתמיר דדון ביום 17/09/2026: €2,100 וכן ₪4,700 בשווי מוסכם של €1,350. סך הכול התקבל €3,450. התשלום בוצע עבור JJ.';
  v_preview jsonb;
  v_exec jsonb;
  v_replay jsonb;
  v_hash text;
  v_snap jsonb;
  v_event uuid;
  v_tx uuid;
  v_ok boolean;
  v_err text;
  v_cert uuid;
  v_line uuid;
  v_events integer;
  v_note_stored text;
BEGIN
  PERFORM pg_temp.set_jwt(v_fin, 'authenticated');
  EXECUTE 'SET ROLE authenticated';
  PERFORM public.apply_client_settlement_opening_certification(
    v_zeta, '2026-03-01', 'zeta opening', 'evidence:zeta',
    'cert-zeta-note', 1, NULL, -5000.00,
    jsonb_build_array(jsonb_build_object(
      'line_order', 1, 'property_key', 'zeta-z', 'property_name', 'Fixture Property Z',
      'component_code', 'opening_balance', 'amount_due_to_jj', -5000.00,
      'reason', 'z', 'evidence_ref', 'ez'
    ))
  );
  EXECUTE 'RESET ROLE';
  SELECT l.id, l.certification_id INTO v_line, v_cert
  FROM finance.client_settlement_certification_lines l
  WHERE l.property_key = 'zeta-z' AND l.evidence_ref = 'ez';
  EXECUTE 'SET ROLE authenticated';
  PERFORM public.bind_client_obligation_property(
    v_cert, v_line, v_zeta, v_pz, 1, 'bind zeta', 'ev-z', 'bind-zeta-note', NULL
  );
  v_preview := public.preview_partner_funded_client_settlement(
    v_zeta, v_north, 'JJ_TO_CLIENT', 100.00, '2026-09-17'
  );
  v_hash := v_preview->>'preview_hash';
  v_snap := v_preview->'canonical_snapshot';

  v_exec := public.execute_partner_funded_client_settlement(
    v_zeta, v_north, 'JJ_TO_CLIENT', 100.00, '2026-09-17',
    v_hash, v_snap, 'pf-note-hebrew', v_note
  );
  v_event := (v_exec->>'event_id')::uuid;
  v_tx := (v_exec->>'transaction_id')::uuid;
  EXECUTE 'RESET ROLE';
  SELECT e.staff_note INTO v_note_stored
  FROM finance.partner_funding_events e WHERE e.id = v_event;
  PERFORM pg_temp.record(
    'hebrew_shekel_stored',
    (v_exec->>'ok')::boolean AND v_note_stored = v_note AND position('₪' IN v_note_stored) > 0,
    COALESCE(v_note_stored, 'null')
  );
  PERFORM pg_temp.record(
    'snapshot_excludes_note',
    (v_exec->>'preview_hash') = v_hash
      AND position(v_note IN v_snap::text) = 0
      AND position(v_note IN (SELECT canonical_snapshot::text FROM finance.partner_funding_events WHERE id = v_event)) = 0
      AND position('staff_note' IN v_snap::text) = 0,
    v_hash
  );
  PERFORM pg_temp.record(
    'no_leak_to_cash_rows',
    (SELECT description FROM public.transactions WHERE id = v_tx) = 'partner funded client settlement'
      AND (SELECT notes IS NULL AND k_note IS NULL FROM public.transactions WHERE id = v_tx)
      AND (SELECT notes IS NULL FROM finance.owner_transaction_links WHERE transaction_id = v_tx)
      AND (SELECT count(*) FROM finance.partner_funding_audit a WHERE a.event_id = v_event AND a.action = 'execute_partner_funded_client_settlement' AND position(v_note IN a.action) = 0) = 1
      AND (SELECT count(*) FROM finance.partner_current_account_entries WHERE event_id = v_event) = 1
      AND (SELECT count(*) FROM finance.client_cash_settlement_executions WHERE transaction_id = v_tx) = 1
      AND (SELECT count(*) FROM finance.client_obligation_fifo_allocations a JOIN finance.client_cash_settlement_executions x ON x.id = a.execution_id WHERE x.transaction_id = v_tx) = 1,
    'leak'
  );

  EXECUTE 'SET ROLE authenticated';
  v_replay := public.execute_partner_funded_client_settlement(
    v_zeta, v_north, 'JJ_TO_CLIENT', 100.00, '2026-09-17',
    v_hash, v_snap, 'pf-note-hebrew', v_note
  );
  EXECUTE 'RESET ROLE';
  SELECT count(*) INTO v_events FROM finance.partner_funding_events WHERE idempotency_key = 'pf-note-hebrew';
  PERFORM pg_temp.record(
    'identical_replay',
    (v_replay->>'replay') = 'true' AND (v_replay->>'event_id')::uuid = v_event AND v_events = 1,
    v_replay::text
  );

  EXECUTE 'SET ROLE authenticated';
  v_ok := false; v_err := 'NO ERROR';
  BEGIN
    PERFORM public.execute_partner_funded_client_settlement(
      v_zeta, v_north, 'JJ_TO_CLIENT', 100.00, '2026-09-17',
      v_hash, v_snap, 'pf-note-hebrew', v_note || ' extra'
    );
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    v_ok := v_err ILIKE '%idempotency_conflict%';
  END;
  EXECUTE 'RESET ROLE';
  SELECT count(*) INTO v_events FROM finance.partner_funding_events WHERE idempotency_key = 'pf-note-hebrew';
  SELECT staff_note INTO v_note_stored FROM finance.partner_funding_events WHERE id = v_event;
  PERFORM pg_temp.record(
    'conflicting_note_rejected',
    v_ok AND v_events = 1 AND v_note_stored = v_note,
    v_err
  );

  EXECUTE 'SET ROLE authenticated';
  v_exec := public.execute_partner_funded_client_settlement(
    v_zeta, v_north, 'JJ_TO_CLIENT', 50.00, '2026-09-17',
    (public.preview_partner_funded_client_settlement(v_zeta, v_north, 'JJ_TO_CLIENT', 50.00, '2026-09-17')->>'preview_hash'),
    public.preview_partner_funded_client_settlement(v_zeta, v_north, 'JJ_TO_CLIENT', 50.00, '2026-09-17')->'canonical_snapshot',
    'pf-note-blank', '   '
  );
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.record(
    'blank_note_is_null',
    (SELECT staff_note IS NULL FROM finance.partner_funding_events WHERE id = (v_exec->>'event_id')::uuid),
    COALESCE((SELECT staff_note FROM finance.partner_funding_events WHERE id = (v_exec->>'event_id')::uuid), 'null')
  );

  EXECUTE 'SET ROLE authenticated';
  v_preview := public.preview_partner_funded_client_settlement(
    v_zeta, v_north, 'JJ_TO_CLIENT', 25.00, '2026-09-17'
  );
  v_exec := public.execute_partner_funded_client_settlement(
    v_zeta, v_north, 'JJ_TO_CLIENT', 25.00, '2026-09-17',
    v_preview->>'preview_hash', v_preview->'canonical_snapshot', 'pf-note-omitted'
  );
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.record(
    'omitted_note_is_null',
    (SELECT staff_note IS NULL FROM finance.partner_funding_events WHERE idempotency_key = 'pf-note-omitted'),
    'omitted'
  );

  SELECT count(*) INTO v_events FROM finance.partner_funding_events;
  EXECUTE 'SET ROLE authenticated';
  v_ok := false; v_err := 'NO ERROR';
  BEGIN
    PERFORM public.execute_partner_funded_client_settlement(
      v_zeta, v_north, 'JJ_TO_CLIENT', 10.00, '2026-09-17',
      (public.preview_partner_funded_client_settlement(v_zeta, v_north, 'JJ_TO_CLIENT', 10.00, '2026-09-17')->>'preview_hash'),
      public.preview_partner_funded_client_settlement(v_zeta, v_north, 'JJ_TO_CLIENT', 10.00, '2026-09-17')->'canonical_snapshot',
      'pf-note-too-long', repeat('א', 2001)
    );
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    v_ok := v_err ILIKE '%2000%';
  END;
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.record(
    'over_2000_rejected',
    v_ok AND (SELECT count(*) FROM finance.partner_funding_events) = v_events
      AND NOT EXISTS (SELECT 1 FROM finance.partner_funding_events WHERE idempotency_key = 'pf-note-too-long'),
    v_err
  );

  EXECUTE 'SET ROLE authenticated';
  PERFORM public.reverse_partner_funding_event(v_event, 'fixture reversal', 'pf-note-reverse');
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.record(
    'reversal_keeps_original_note_only',
    (SELECT staff_note FROM finance.partner_funding_events WHERE id = v_event) = v_note
      AND (SELECT staff_note IS NULL FROM finance.partner_funding_events WHERE reversal_of = v_event)
      AND NOT EXISTS (
        SELECT 1 FROM public.transactions t
        WHERE t.description LIKE '%' || v_note || '%'
      ),
    'reversal'
  );

  PERFORM pg_temp.record(
    'views_hide_staff_note',
    NOT EXISTS (
      SELECT 1 FROM pg_views v
      WHERE v.definition ILIKE '%staff_note%'
    )
    AND position('staff_note' IN pg_get_viewdef('finance.v_owner_level_payments'::regclass, true)) = 0,
    'views'
  );

  EXECUTE 'SET ROLE anon';
  v_ok := false; v_err := 'NO ERROR';
  BEGIN
    PERFORM 1 FROM finance.partner_funding_events;
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; v_ok := true; END;
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.record('anon_table_denied', v_ok, v_err);

  EXECUTE 'SET ROLE service_role';
  v_ok := false; v_err := 'NO ERROR';
  BEGIN
    PERFORM 1 FROM finance.partner_funding_events;
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; v_ok := true; END;
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.record('service_role_table_denied', v_ok, v_err);

  EXECUTE 'SET ROLE authenticated';
  v_ok := false; v_err := 'NO ERROR';
  BEGIN
    INSERT INTO finance.partner_funding_events (
      event_type, effective_date, amount_eur, partner_entity_id, funding_source,
      idempotency_key, payload_hash, canonical_snapshot, created_by, staff_note
    ) VALUES (
      'partner_reimbursement', '2026-09-17', 1, v_north, 'JJ',
      'direct-note', 'h', '{}'::jsonb, v_fin, v_note
    );
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; v_ok := true; END;
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.record('direct_insert_denied', v_ok, v_err);
END;
$$;

SELECT test_name, passed, detail FROM matrix_result ORDER BY test_name;
