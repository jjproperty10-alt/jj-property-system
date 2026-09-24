-- Additive staff-only note on partner-funded client settlement execute.
-- The note is not part of the preview snapshot, the hash, or any client/owner report.

ALTER TABLE finance.partner_funding_events
  ADD COLUMN IF NOT EXISTS staff_note TEXT;

ALTER TABLE finance.partner_funding_events
  DROP CONSTRAINT IF EXISTS pfe_staff_note_len;

ALTER TABLE finance.partner_funding_events
  ADD CONSTRAINT pfe_staff_note_len
  CHECK (staff_note IS NULL OR char_length(staff_note) <= 2000);

COMMENT ON COLUMN finance.partner_funding_events.staff_note IS
  'Staff-internal note. Not copied to cash rows, snapshots, or client/owner reports.';

CREATE OR REPLACE FUNCTION public.execute_partner_funded_client_settlement(
  p_client_entity_id UUID,
  p_partner_entity_id UUID,
  p_direction TEXT,
  p_amount NUMERIC,
  p_effective_date DATE,
  p_preview_hash TEXT,
  p_preview_snapshot JSONB,
  p_idempotency_key TEXT,
  p_staff_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
DECLARE
  v_actor UUID;
  v_partner TEXT;
  v_preview JSONB;
  v_existing finance.partner_funding_events%ROWTYPE;
  v_event UUID;
  v_entry UUID;
  v_tx UUID;
  v_link UUID;
  v_exec UUID;
  v_seq INTEGER := 0;
  v_elem JSONB;
  v_applied NUMERIC;
  v_signed NUMERIC;
  v_sum NUMERIC := 0;
  v_line UUID;
  v_prop UUID;
  v_fifo JSONB;
  v_note TEXT;
BEGIN
  IF NOT finance.is_active_jj_staff() THEN
    RAISE EXCEPTION '[jj_auth] Active staff required.';
  END IF;
  v_actor := public.require_jj_staff(ARRAY['ceo', 'finance_admin']);
  IF p_idempotency_key IS NULL OR pg_catalog.btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION '[input] idempotency_key must be non-empty.';
  END IF;
  IF p_preview_hash IS NULL OR pg_catalog.btrim(p_preview_hash) = '' THEN
    RAISE EXCEPTION '[input] preview_hash must be non-empty.';
  END IF;
  IF p_preview_snapshot IS NULL OR jsonb_typeof(p_preview_snapshot) <> 'object' THEN
    RAISE EXCEPTION '[input] preview_snapshot must be a JSON object.';
  END IF;
  v_note := NULLIF(pg_catalog.btrim(p_staff_note), '');
  IF v_note IS NOT NULL AND pg_catalog.char_length(v_note) > 2000 THEN
    RAISE EXCEPTION '[input] staff_note exceeds 2000 characters.';
  END IF;
  IF finance.client_obligation_fifo_sha256(p_preview_snapshot) IS DISTINCT FROM p_preview_hash THEN
    RAISE EXCEPTION '[stale_preview] submitted snapshot does not match preview_hash.';
  END IF;
  v_partner := finance.assert_active_partner(p_partner_entity_id);

  PERFORM pg_catalog.pg_advisory_xact_lock(872108, pg_catalog.hashtext(p_idempotency_key));
  PERFORM pg_catalog.pg_advisory_xact_lock(
    872007, pg_catalog.hashtext(p_client_entity_id::text)
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    872109, pg_catalog.hashtext(p_client_entity_id::text || ':' || p_partner_entity_id::text)
  );
  PERFORM 1
  FROM finance.client_obligation_property_bindings b
  JOIN finance.client_settlement_certification_lines l
    ON l.id = b.certification_line_id
  JOIN finance.client_settlement_certifications c
    ON c.id = l.certification_id
  WHERE c.entity_id = p_client_entity_id
    AND b.status = 'active'
  FOR UPDATE OF b;

  SELECT * INTO v_existing
  FROM finance.partner_funding_events e
  WHERE e.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_existing.payload_hash IS DISTINCT FROM p_preview_hash
       OR v_existing.partner_entity_id IS DISTINCT FROM p_partner_entity_id
       OR v_existing.client_entity_id IS DISTINCT FROM p_client_entity_id
       OR v_existing.amount_eur IS DISTINCT FROM p_amount
       OR v_existing.effective_date IS DISTINCT FROM p_effective_date
       OR v_existing.funding_source IS DISTINCT FROM 'PARTNER_PERSONAL'
       OR v_existing.staff_note IS DISTINCT FROM v_note THEN
      RAISE EXCEPTION '[idempotency_conflict] idempotency_key already used with a different payload.';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'ok', true,
      'replay', true,
      'event_id', v_existing.id,
      'transaction_id', (
        SELECT l.transaction_id FROM finance.partner_funding_transaction_links l
        WHERE l.event_id = v_existing.id AND l.link_role = 'external_payment'
      ),
      'preview_hash', v_existing.payload_hash,
      'actor', v_existing.created_by
    );
  END IF;

  v_preview := public.preview_partner_funded_client_settlement(
    p_client_entity_id, p_partner_entity_id, p_direction, p_amount, p_effective_date
  );
  IF (v_preview->>'preview_hash') IS DISTINCT FROM p_preview_hash THEN
    RAISE EXCEPTION '[stale_preview] live state does not match submitted preview_hash.';
  END IF;
  IF (v_preview->>'ok') IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION '[blocked] %', COALESCE(v_preview->>'blocked_code', 'preview_not_ok');
  END IF;

  v_fifo := public.preview_client_obligation_fifo(
    p_client_entity_id, 'JJ_TO_CLIENT', p_amount, p_effective_date
  );

  INSERT INTO finance.partner_funding_events (
    event_type, effective_date, amount_eur, partner_entity_id, client_entity_id,
    funding_source, status, idempotency_key, payload_hash, canonical_snapshot,
    reversal_of, created_by, staff_note
  ) VALUES (
    'partner_funded_client_payment', p_effective_date, p_amount, p_partner_entity_id,
    p_client_entity_id, 'PARTNER_PERSONAL', 'posted', p_idempotency_key,
    p_preview_hash, p_preview_snapshot, NULL, v_actor, v_note
  )
  RETURNING id INTO v_event;

  INSERT INTO public.transactions (
    date, property_id, property_name, category, subcategory, description,
    payer, payee, amount_eur, client_charge, review_status, is_deleted
  ) VALUES (
    p_effective_date,
    NULL,
    NULL,
    'Management',
    'Bank Payment to Owner',
    'partner funded client settlement',
    v_partner,
    'Owner',
    p_amount,
    NULL,
    'active',
    false
  )
  RETURNING id INTO v_tx;

  INSERT INTO finance.owner_transaction_links (
    transaction_id, owner_entity_id, link_role, idempotency_key,
    review_status, is_deleted, created_by
  ) VALUES (
    v_tx, p_client_entity_id, 'owner_level_payment',
    'pf-link:' || p_idempotency_key, 'approved', false, v_actor::text
  )
  RETURNING id INTO v_link;

  INSERT INTO finance.client_cash_settlement_executions (
    entity_id, direction, amount, effective_date, transaction_id, owner_link_id,
    preview_hash, canonical_snapshot, idempotency_key, reversal_of, actor
  ) VALUES (
    p_client_entity_id, 'JJ_TO_CLIENT', p_amount, p_effective_date, v_tx, v_link,
    p_preview_hash, p_preview_snapshot, 'pf-cash:' || p_idempotency_key, NULL, v_actor
  )
  RETURNING id INTO v_exec;

  FOR v_elem IN SELECT * FROM jsonb_array_elements(v_fifo->'allocations')
  LOOP
    v_seq := v_seq + 1;
    v_applied := (v_elem->>'amount_applied')::numeric;
    v_line := (v_elem->>'source_line_identity')::uuid;
    v_prop := (v_elem->>'property_id')::uuid;
    v_signed := pg_catalog.round((- v_applied), 2);
    INSERT INTO finance.client_obligation_fifo_allocations (
      execution_id, certification_line_id, property_id, sequence_no,
      signed_amount, allocated_amount
    ) VALUES (
      v_exec, v_line, v_prop, v_seq, v_signed, v_applied
    );
    v_sum := pg_catalog.round(v_sum + v_applied, 2);
  END LOOP;
  IF v_sum IS DISTINCT FROM p_amount THEN
    RAISE EXCEPTION '[invariant] allocation sum % must equal amount %', v_sum, p_amount;
  END IF;

  INSERT INTO finance.partner_current_account_entries (
    event_id, partner_entity_id, effective_date, entry_type,
    signed_amount_eur, currency, reversal_of, created_by
  ) VALUES (
    v_event, p_partner_entity_id, p_effective_date, 'personal_funding',
    p_amount, 'EUR', NULL, v_actor
  )
  RETURNING id INTO v_entry;

  INSERT INTO finance.partner_funding_transaction_links (
    event_id, transaction_id, link_role
  ) VALUES (
    v_event, v_tx, 'external_payment'
  );

  INSERT INTO finance.partner_funding_audit (event_id, action, actor, payload_hash)
  VALUES (v_event, 'execute_partner_funded_client_settlement', v_actor, p_preview_hash);

  RETURN pg_catalog.jsonb_build_object(
    'ok', true,
    'replay', false,
    'event_id', v_event,
    'entry_id', v_entry,
    'transaction_id', v_tx,
    'client_cash_execution_id', v_exec,
    'client_balance_after_R', v_preview->'balance_after_R',
    'partner_balance_after', v_preview->'partner_balance_after',
    'company_cash_effect', 0,
    'pnl_effect', 0,
    'preview_hash', p_preview_hash,
    'actor', v_actor
  );
END;
$fn$;

DROP FUNCTION IF EXISTS public.execute_partner_funded_client_settlement(
  UUID, UUID, TEXT, NUMERIC, DATE, TEXT, JSONB, TEXT
);

REVOKE ALL ON FUNCTION public.execute_partner_funded_client_settlement(
  UUID, UUID, TEXT, NUMERIC, DATE, TEXT, JSONB, TEXT, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.execute_partner_funded_client_settlement(
  UUID, UUID, TEXT, NUMERIC, DATE, TEXT, JSONB, TEXT, TEXT
) FROM anon, service_role;
GRANT EXECUTE ON FUNCTION public.execute_partner_funded_client_settlement(
  UUID, UUID, TEXT, NUMERIC, DATE, TEXT, JSONB, TEXT, TEXT
) TO authenticated;

COMMENT ON FUNCTION public.execute_partner_funded_client_settlement(
  UUID, UUID, TEXT, NUMERIC, DATE, TEXT, JSONB, TEXT, TEXT
) IS
  'Posts a partner-funded client settlement. p_staff_note is staff-internal and is excluded from the preview hash.';
