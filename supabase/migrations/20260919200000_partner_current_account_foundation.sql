-- ============================================================
-- Partner current-account + personal-funded client settlement
-- LOCAL IMPLEMENTATION ONLY. Do not Apply to Production from this
-- branch without a separate Yossi authorization.
--
-- Additive finance tables + SECURITY DEFINER RPCs.
-- Does not CREATE OR REPLACE RC3 / certified-ledger views.
-- Does not seed partners, Tamir, or Production actor UUIDs.
-- Does not change JJ-funded execute_client_cash_settlement posting.
-- Legacy public.business_events is not reused (incompatible BEM).
-- ============================================================

CREATE SCHEMA IF NOT EXISTS finance;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

DO $pre$
BEGIN
  IF to_regclass('finance.client_cash_settlement_executions') IS NULL THEN
    RAISE EXCEPTION '[preflight] finance.client_cash_settlement_executions is required.';
  END IF;
  IF to_regclass('lifecycle.entity_identity') IS NULL THEN
    RAISE EXCEPTION '[preflight] lifecycle.entity_identity is required.';
  END IF;
  IF to_regprocedure('finance.client_obligation_fifo_sha256(jsonb)') IS NULL THEN
    RAISE EXCEPTION '[preflight] finance.client_obligation_fifo_sha256 is required.';
  END IF;
END;
$pre$;

CREATE TABLE IF NOT EXISTS finance.partner_funding_events (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type           TEXT NOT NULL
                       CHECK (event_type IN (
                         'partner_funded_client_payment',
                         'partner_reimbursement',
                         'reversal'
                       )),
  effective_date       DATE NOT NULL,
  amount_eur           NUMERIC(14,2) NOT NULL CHECK (amount_eur > 0),
  partner_entity_id    UUID NOT NULL REFERENCES lifecycle.entity_identity(id),
  client_entity_id     UUID REFERENCES lifecycle.entity_identity(id),
  funding_source       TEXT NOT NULL
                       CHECK (funding_source IN ('PARTNER_PERSONAL', 'JJ')),
  status               TEXT NOT NULL DEFAULT 'posted'
                       CHECK (status IN ('posted', 'reversed')),
  idempotency_key      TEXT NOT NULL UNIQUE,
  payload_hash         TEXT NOT NULL,
  canonical_snapshot   JSONB NOT NULL,
  reversal_of          UUID REFERENCES finance.partner_funding_events(id),
  client_cash_execution_id UUID
                       REFERENCES finance.client_cash_settlement_executions(id),
  policy_version       TEXT NOT NULL DEFAULT 'partner-current-account-v1',
  created_by           UUID NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pfe_reversal_not_self CHECK (reversal_of IS NULL OR reversal_of <> id),
  CONSTRAINT pfe_client_required_for_client_pay CHECK (
    event_type <> 'partner_funded_client_payment' OR client_entity_id IS NOT NULL
  ),
  CONSTRAINT pfe_reimbursement_has_no_client CHECK (
    event_type <> 'partner_reimbursement' OR client_entity_id IS NULL
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_pfe_active_reversal
  ON finance.partner_funding_events (reversal_of)
  WHERE reversal_of IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pfe_partner_date
  ON finance.partner_funding_events (partner_entity_id, effective_date, created_at);

CREATE TABLE IF NOT EXISTS finance.partner_current_account_entries (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id             UUID NOT NULL REFERENCES finance.partner_funding_events(id),
  partner_entity_id    UUID NOT NULL REFERENCES lifecycle.entity_identity(id),
  effective_date       DATE NOT NULL,
  entry_type           TEXT NOT NULL
                       CHECK (entry_type IN ('personal_funding', 'reimbursement', 'reversal')),
  signed_amount_eur    NUMERIC(14,2) NOT NULL CHECK (signed_amount_eur <> 0),
  currency             TEXT NOT NULL DEFAULT 'EUR' CHECK (currency = 'EUR'),
  reversal_of          UUID REFERENCES finance.partner_current_account_entries(id),
  created_by           UUID NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pcae_reversal_not_self CHECK (reversal_of IS NULL OR reversal_of <> id)
);

CREATE INDEX IF NOT EXISTS idx_pcae_partner_date
  ON finance.partner_current_account_entries (partner_entity_id, effective_date, created_at);

CREATE TABLE IF NOT EXISTS finance.partner_funding_transaction_links (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id             UUID NOT NULL REFERENCES finance.partner_funding_events(id),
  transaction_id       UUID NOT NULL REFERENCES public.transactions(id),
  link_role            TEXT NOT NULL
                       CHECK (link_role IN ('external_payment', 'reimbursement', 'reversal')),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_pftl_transaction UNIQUE (transaction_id),
  CONSTRAINT uq_pftl_event_role UNIQUE (event_id, link_role)
);

CREATE TABLE IF NOT EXISTS finance.partner_funding_audit (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id             UUID NOT NULL REFERENCES finance.partner_funding_events(id),
  action               TEXT NOT NULL,
  actor                UUID NOT NULL,
  payload_hash         TEXT NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pfa_event
  ON finance.partner_funding_audit (event_id, created_at);

COMMENT ON TABLE finance.partner_funding_events IS
  'Append-only partner-funding business events. Not public.business_events.';
COMMENT ON TABLE finance.partner_current_account_entries IS
  'Append-only JJ↔partner current-account entries. partner_balance>0 means JJ owes partner.';

CREATE OR REPLACE FUNCTION finance.trg_partner_funding_append_only()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO ''
AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION '[append-only] partner funding rows cannot be deleted.';
  END IF;
  RAISE EXCEPTION '[append-only] partner funding identity is immutable.';
END;
$fn$;

DROP TRIGGER IF EXISTS trg_pfe_append_only ON finance.partner_funding_events;
CREATE TRIGGER trg_pfe_append_only
  BEFORE UPDATE OR DELETE ON finance.partner_funding_events
  FOR EACH ROW EXECUTE FUNCTION finance.trg_partner_funding_append_only();

DROP TRIGGER IF EXISTS trg_pcae_append_only ON finance.partner_current_account_entries;
CREATE TRIGGER trg_pcae_append_only
  BEFORE UPDATE OR DELETE ON finance.partner_current_account_entries
  FOR EACH ROW EXECUTE FUNCTION finance.trg_partner_funding_append_only();

DROP TRIGGER IF EXISTS trg_pftl_append_only ON finance.partner_funding_transaction_links;
CREATE TRIGGER trg_pftl_append_only
  BEFORE UPDATE OR DELETE ON finance.partner_funding_transaction_links
  FOR EACH ROW EXECUTE FUNCTION finance.trg_partner_funding_append_only();

DROP TRIGGER IF EXISTS trg_pfa_append_only ON finance.partner_funding_audit;
CREATE TRIGGER trg_pfa_append_only
  BEFORE UPDATE OR DELETE ON finance.partner_funding_audit
  FOR EACH ROW EXECUTE FUNCTION finance.trg_partner_funding_append_only();

ALTER TABLE finance.partner_funding_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.partner_funding_events FORCE ROW LEVEL SECURITY;
ALTER TABLE finance.partner_current_account_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.partner_current_account_entries FORCE ROW LEVEL SECURITY;
ALTER TABLE finance.partner_funding_transaction_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.partner_funding_transaction_links FORCE ROW LEVEL SECURITY;
ALTER TABLE finance.partner_funding_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.partner_funding_audit FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deny_all_partner_funding_events ON finance.partner_funding_events;
CREATE POLICY deny_all_partner_funding_events
  ON finance.partner_funding_events AS RESTRICTIVE FOR ALL TO public
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS deny_all_partner_current_account_entries ON finance.partner_current_account_entries;
CREATE POLICY deny_all_partner_current_account_entries
  ON finance.partner_current_account_entries AS RESTRICTIVE FOR ALL TO public
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS deny_all_partner_funding_transaction_links ON finance.partner_funding_transaction_links;
CREATE POLICY deny_all_partner_funding_transaction_links
  ON finance.partner_funding_transaction_links AS RESTRICTIVE FOR ALL TO public
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS deny_all_partner_funding_audit ON finance.partner_funding_audit;
CREATE POLICY deny_all_partner_funding_audit
  ON finance.partner_funding_audit AS RESTRICTIVE FOR ALL TO public
  USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE finance.partner_funding_events FROM PUBLIC;
REVOKE ALL ON TABLE finance.partner_funding_events FROM anon, authenticated, service_role;
REVOKE ALL ON TABLE finance.partner_current_account_entries FROM PUBLIC;
REVOKE ALL ON TABLE finance.partner_current_account_entries FROM anon, authenticated, service_role;
REVOKE ALL ON TABLE finance.partner_funding_transaction_links FROM PUBLIC;
REVOKE ALL ON TABLE finance.partner_funding_transaction_links FROM anon, authenticated, service_role;
REVOKE ALL ON TABLE finance.partner_funding_audit FROM PUBLIC;
REVOKE ALL ON TABLE finance.partner_funding_audit FROM anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION finance.assert_active_partner(p_partner_entity_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SET search_path TO ''
AS $fn$
DECLARE
  v_name TEXT;
  v_type TEXT;
  v_status TEXT;
BEGIN
  IF p_partner_entity_id IS NULL THEN
    RAISE EXCEPTION '[input] partner_entity_id must be a UUID.';
  END IF;
  SELECT e.canonical_name, e.entity_type, e.status
    INTO v_name, v_type, v_status
  FROM lifecycle.entity_identity e
  WHERE e.id = p_partner_entity_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION '[input] partner_entity_id is not a canonical identity.';
  END IF;
  IF v_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION '[input] partner identity is not active.';
  END IF;
  IF v_type IS DISTINCT FROM 'partner' THEN
    RAISE EXCEPTION '[input] partner_entity_id must be entity_type=partner.';
  END IF;
  RETURN v_name;
END;
$fn$;

CREATE OR REPLACE FUNCTION finance.partner_ca_balance(p_partner_entity_id UUID, p_as_of DATE)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SET search_path TO ''
AS $fn$
  SELECT COALESCE(pg_catalog.sum(e.signed_amount_eur), 0)
  FROM finance.partner_current_account_entries e
  WHERE e.partner_entity_id = p_partner_entity_id
    AND e.effective_date <= p_as_of;
$fn$;

CREATE OR REPLACE FUNCTION finance.partner_ca_totals(p_partner_entity_id UUID, p_as_of DATE)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path TO ''
AS $fn$
  SELECT pg_catalog.jsonb_build_object(
    'personal_funding', COALESCE(pg_catalog.sum(e.signed_amount_eur) FILTER (WHERE e.entry_type = 'personal_funding'), 0),
    'reimbursement', COALESCE(pg_catalog.sum(e.signed_amount_eur) FILTER (WHERE e.entry_type = 'reimbursement'), 0),
    'reversal', COALESCE(pg_catalog.sum(e.signed_amount_eur) FILTER (WHERE e.entry_type = 'reversal'), 0)
  )
  FROM finance.partner_current_account_entries e
  WHERE e.partner_entity_id = p_partner_entity_id
    AND e.effective_date <= p_as_of;
$fn$;

REVOKE ALL ON FUNCTION finance.assert_active_partner(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION finance.assert_active_partner(UUID) FROM anon, authenticated, service_role;
REVOKE ALL ON FUNCTION finance.partner_ca_balance(UUID, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION finance.partner_ca_balance(UUID, DATE) FROM anon, authenticated, service_role;
REVOKE ALL ON FUNCTION finance.partner_ca_totals(UUID, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION finance.partner_ca_totals(UUID, DATE) FROM anon, authenticated, service_role;
REVOKE ALL ON FUNCTION finance.trg_partner_funding_append_only() FROM PUBLIC;
REVOKE ALL ON FUNCTION finance.trg_partner_funding_append_only() FROM anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.list_partner_funding_actors()
RETURNS TABLE(entity_id UUID, canonical_name TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $fn$
BEGIN
  IF NOT finance.is_active_jj_staff() THEN
    RAISE EXCEPTION '[jj_auth] Active staff required.';
  END IF;
  PERFORM public.require_jj_staff(ARRAY['ceo', 'finance_admin', 'operations']);
  RETURN QUERY
  SELECT e.id, e.canonical_name
  FROM lifecycle.entity_identity e
  WHERE e.status = 'active'
    AND e.entity_type = 'partner'
  ORDER BY e.canonical_name, e.id;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.read_partner_current_account(
  p_partner_entity_id UUID,
  p_as_of DATE
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $fn$
DECLARE
  v_name TEXT;
  v_entries JSONB;
  v_balance NUMERIC;
BEGIN
  IF NOT finance.is_active_jj_staff() THEN
    RAISE EXCEPTION '[jj_auth] Active staff required.';
  END IF;
  PERFORM public.require_jj_staff(ARRAY['ceo', 'finance_admin', 'operations']);
  IF p_as_of IS NULL THEN
    RAISE EXCEPTION '[input] as_of must be a date.';
  END IF;
  v_name := finance.assert_active_partner(p_partner_entity_id);
  v_balance := pg_catalog.round(finance.partner_ca_balance(p_partner_entity_id, p_as_of), 2);
  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', e.id,
        'event_id', e.event_id,
        'effective_date', e.effective_date,
        'entry_type', e.entry_type,
        'signed_amount_eur', pg_catalog.to_char(e.signed_amount_eur, 'FM999999999990.00'),
        'currency', e.currency
      )
      ORDER BY e.effective_date, e.created_at, e.id
    ),
    '[]'::jsonb
  )
    INTO v_entries
  FROM finance.partner_current_account_entries e
  WHERE e.partner_entity_id = p_partner_entity_id
    AND e.effective_date <= p_as_of;
  RETURN pg_catalog.jsonb_build_object(
    'partner_entity_id', p_partner_entity_id,
    'canonical_name', v_name,
    'as_of', p_as_of,
    'balance', v_balance,
    'totals_by_entry_type', finance.partner_ca_totals(p_partner_entity_id, p_as_of),
    'entries', v_entries,
    'sign_convention', 'positive_means_jj_owes_partner',
    'policy_version', 'partner-current-account-v1'
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.preview_partner_funded_client_settlement(
  p_client_entity_id UUID,
  p_partner_entity_id UUID,
  p_direction TEXT,
  p_amount NUMERIC,
  p_effective_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $fn$
DECLARE
  v_actor UUID;
  v_partner TEXT;
  v_fifo JSONB;
  v_before NUMERIC;
  v_after NUMERIC;
  v_snapshot JSONB;
  v_hash TEXT;
  v_blocked TEXT;
BEGIN
  IF NOT finance.is_active_jj_staff() THEN
    RAISE EXCEPTION '[jj_auth] Active staff required.';
  END IF;
  v_actor := public.require_jj_staff(ARRAY['ceo', 'finance_admin']);
  IF p_direction IS DISTINCT FROM 'JJ_TO_CLIENT' THEN
    RAISE EXCEPTION '[input] direction must be JJ_TO_CLIENT in this phase.';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0
     OR p_amount IS DISTINCT FROM pg_catalog.round(p_amount, 2) THEN
    RAISE EXCEPTION '[input] amount must be a positive exact-cent number.';
  END IF;
  IF p_effective_date IS NULL THEN
    RAISE EXCEPTION '[input] effective_date must be a date.';
  END IF;
  IF p_client_entity_id IS NOT DISTINCT FROM p_partner_entity_id THEN
    RAISE EXCEPTION '[input] client and partner must be different identities.';
  END IF;
  v_partner := finance.assert_active_partner(p_partner_entity_id);
  v_fifo := public.preview_client_obligation_fifo(
    p_client_entity_id, 'JJ_TO_CLIENT', p_amount, p_effective_date
  );
  v_before := pg_catalog.round(finance.partner_ca_balance(p_partner_entity_id, p_effective_date), 2);
  v_after := pg_catalog.round(v_before + p_amount, 2);
  v_blocked := NULLIF(v_fifo->>'blocked_code', '');
  v_snapshot := pg_catalog.jsonb_build_object(
    'policy_version', 'partner-current-account-v1',
    'client_entity_id', p_client_entity_id,
    'partner_entity_id', p_partner_entity_id,
    'canonical_partner', v_partner,
    'canonical_client', v_fifo->>'canonical_client',
    'funding_source', 'PARTNER_PERSONAL',
    'direction', 'JJ_TO_CLIENT',
    'category', 'Management',
    'subcategory', 'Bank Payment to Owner',
    'payer', v_partner,
    'payee', 'Owner',
    'amount', pg_catalog.to_char(p_amount, 'FM999999999990.00'),
    'effective_date', p_effective_date,
    'sources', COALESCE(v_fifo->'canonical_snapshot'->'sources', v_fifo->'sources'),
    'allocations', COALESCE(v_fifo->'canonical_snapshot'->'allocations', '[]'::jsonb),
    'client_r_before', v_fifo->>'balance_before_R',
    'client_r_after', v_fifo->>'balance_after_R',
    'client_s_before', pg_catalog.to_char((- (v_fifo->>'balance_before_R')::numeric), 'FM999999999990.00'),
    'client_s_after', pg_catalog.to_char((- (v_fifo->>'balance_after_R')::numeric), 'FM999999999990.00'),
    'partner_balance_before', pg_catalog.to_char(v_before, 'FM999999999990.00'),
    'partner_balance_after', pg_catalog.to_char(v_after, 'FM999999999990.00'),
    'company_cash_effect', '0.00',
    'pnl_effect', '0.00',
    'blocked_code', v_blocked,
    'fifo_preview_hash', v_fifo->>'preview_hash'
  );
  v_hash := finance.client_obligation_fifo_sha256(v_snapshot);
  RETURN pg_catalog.jsonb_build_object(
    'ok', v_blocked IS NULL AND (v_fifo->>'ok') = 'true',
    'client_entity_id', p_client_entity_id,
    'partner_entity_id', p_partner_entity_id,
    'canonical_partner', v_partner,
    'canonical_client', v_fifo->>'canonical_client',
    'funding_source', 'PARTNER_PERSONAL',
    'direction', 'JJ_TO_CLIENT',
    'payer', v_partner,
    'payee', 'Owner',
    'amount', p_amount,
    'effective_date', p_effective_date,
    'balance_before_R', v_fifo->'balance_before_R',
    'balance_after_R', v_fifo->'balance_after_R',
    'partner_balance_before', v_before,
    'partner_balance_after', v_after,
    'company_cash_effect', 0,
    'pnl_effect', 0,
    'sources', v_fifo->'sources',
    'allocations', v_fifo->'allocations',
    'allocated_total', v_fifo->'allocated_total',
    'unapplied_remainder', v_fifo->'unapplied_remainder',
    'blocked_code', COALESCE(v_blocked, NULLIF(v_fifo->>'blocked_code', '')),
    'preview_hash', v_hash,
    'canonical_snapshot', v_snapshot,
    'policy_version', 'partner-current-account-v1',
    'actor', v_actor
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.execute_partner_funded_client_settlement(
  p_client_entity_id UUID,
  p_partner_entity_id UUID,
  p_direction TEXT,
  p_amount NUMERIC,
  p_effective_date DATE,
  p_preview_hash TEXT,
  p_preview_snapshot JSONB,
  p_idempotency_key TEXT
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
       OR v_existing.funding_source IS DISTINCT FROM 'PARTNER_PERSONAL' THEN
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
    reversal_of, created_by
  ) VALUES (
    'partner_funded_client_payment', p_effective_date, p_amount, p_partner_entity_id,
    p_client_entity_id, 'PARTNER_PERSONAL', 'posted', p_idempotency_key,
    p_preview_hash, p_preview_snapshot, NULL, v_actor
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

CREATE OR REPLACE FUNCTION public.preview_partner_reimbursement(
  p_partner_entity_id UUID,
  p_amount NUMERIC,
  p_effective_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $fn$
DECLARE
  v_actor UUID;
  v_partner TEXT;
  v_before NUMERIC;
  v_after NUMERIC;
  v_blocked TEXT;
  v_snapshot JSONB;
  v_hash TEXT;
BEGIN
  IF NOT finance.is_active_jj_staff() THEN
    RAISE EXCEPTION '[jj_auth] Active staff required.';
  END IF;
  v_actor := public.require_jj_staff(ARRAY['ceo', 'finance_admin']);
  IF p_amount IS NULL OR p_amount <= 0
     OR p_amount IS DISTINCT FROM pg_catalog.round(p_amount, 2) THEN
    RAISE EXCEPTION '[input] amount must be a positive exact-cent number.';
  END IF;
  IF p_effective_date IS NULL THEN
    RAISE EXCEPTION '[input] effective_date must be a date.';
  END IF;
  v_partner := finance.assert_active_partner(p_partner_entity_id);
  v_before := pg_catalog.round(finance.partner_ca_balance(p_partner_entity_id, p_effective_date), 2);
  IF v_before < p_amount THEN
    v_blocked := 'over_reimbursement';
  ELSE
    v_blocked := NULL;
  END IF;
  v_after := pg_catalog.round(v_before - p_amount, 2);
  v_snapshot := pg_catalog.jsonb_build_object(
    'policy_version', 'partner-current-account-v1',
    'partner_entity_id', p_partner_entity_id,
    'canonical_partner', v_partner,
    'funding_source', 'JJ',
    'event_type', 'partner_reimbursement',
    'category', 'Transfer',
    'subcategory', 'Expense Reimbursement',
    'payer', 'JJ',
    'payee', v_partner,
    'amount', pg_catalog.to_char(p_amount, 'FM999999999990.00'),
    'effective_date', p_effective_date,
    'partner_balance_before', pg_catalog.to_char(v_before, 'FM999999999990.00'),
    'partner_balance_after', pg_catalog.to_char(v_after, 'FM999999999990.00'),
    'company_cash_effect', pg_catalog.to_char((- p_amount), 'FM999999999990.00'),
    'client_effect', '0.00',
    'pnl_effect', '0.00',
    'blocked_code', v_blocked
  );
  v_hash := finance.client_obligation_fifo_sha256(v_snapshot);
  RETURN pg_catalog.jsonb_build_object(
    'ok', v_blocked IS NULL,
    'partner_entity_id', p_partner_entity_id,
    'canonical_partner', v_partner,
    'amount', p_amount,
    'effective_date', p_effective_date,
    'partner_balance_before', v_before,
    'partner_balance_after', v_after,
    'company_cash_effect', pg_catalog.round((- p_amount), 2),
    'client_effect', 0,
    'pnl_effect', 0,
    'blocked_code', v_blocked,
    'preview_hash', v_hash,
    'canonical_snapshot', v_snapshot,
    'policy_version', 'partner-current-account-v1',
    'actor', v_actor
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.execute_partner_reimbursement(
  p_partner_entity_id UUID,
  p_amount NUMERIC,
  p_effective_date DATE,
  p_preview_hash TEXT,
  p_preview_snapshot JSONB,
  p_idempotency_key TEXT
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
  v_tx UUID;
BEGIN
  IF NOT finance.is_active_jj_staff() THEN
    RAISE EXCEPTION '[jj_auth] Active staff required.';
  END IF;
  v_actor := public.require_jj_staff(ARRAY['ceo', 'finance_admin']);
  IF p_idempotency_key IS NULL OR pg_catalog.btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION '[input] idempotency_key must be non-empty.';
  END IF;
  IF finance.client_obligation_fifo_sha256(p_preview_snapshot) IS DISTINCT FROM p_preview_hash THEN
    RAISE EXCEPTION '[stale_preview] submitted snapshot does not match preview_hash.';
  END IF;
  v_partner := finance.assert_active_partner(p_partner_entity_id);

  PERFORM pg_catalog.pg_advisory_xact_lock(872108, pg_catalog.hashtext(p_idempotency_key));
  PERFORM pg_catalog.pg_advisory_xact_lock(872110, pg_catalog.hashtext(p_partner_entity_id::text));

  SELECT * INTO v_existing
  FROM finance.partner_funding_events e
  WHERE e.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_existing.payload_hash IS DISTINCT FROM p_preview_hash
       OR v_existing.partner_entity_id IS DISTINCT FROM p_partner_entity_id
       OR v_existing.amount_eur IS DISTINCT FROM p_amount
       OR v_existing.event_type IS DISTINCT FROM 'partner_reimbursement' THEN
      RAISE EXCEPTION '[idempotency_conflict] idempotency_key already used with a different payload.';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'ok', true,
      'replay', true,
      'event_id', v_existing.id,
      'transaction_id', (
        SELECT l.transaction_id FROM finance.partner_funding_transaction_links l
        WHERE l.event_id = v_existing.id AND l.link_role = 'reimbursement'
      )
    );
  END IF;

  v_preview := public.preview_partner_reimbursement(
    p_partner_entity_id, p_amount, p_effective_date
  );
  IF (v_preview->>'preview_hash') IS DISTINCT FROM p_preview_hash THEN
    RAISE EXCEPTION '[stale_preview] live state does not match submitted preview_hash.';
  END IF;
  IF (v_preview->>'ok') IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION '[blocked] %', COALESCE(v_preview->>'blocked_code', 'preview_not_ok');
  END IF;

  INSERT INTO finance.partner_funding_events (
    event_type, effective_date, amount_eur, partner_entity_id, client_entity_id,
    funding_source, status, idempotency_key, payload_hash, canonical_snapshot,
    created_by
  ) VALUES (
    'partner_reimbursement', p_effective_date, p_amount, p_partner_entity_id, NULL,
    'JJ', 'posted', p_idempotency_key, p_preview_hash, p_preview_snapshot, v_actor
  )
  RETURNING id INTO v_event;

  INSERT INTO public.transactions (
    date, property_id, property_name, category, subcategory, description,
    payer, payee, amount_eur, client_charge, review_status, is_deleted
  ) VALUES (
    p_effective_date, NULL, NULL, 'Transfer', 'Expense Reimbursement',
    'partner current-account reimbursement', 'JJ', v_partner, p_amount, NULL, 'active', false
  )
  RETURNING id INTO v_tx;

  INSERT INTO finance.partner_current_account_entries (
    event_id, partner_entity_id, effective_date, entry_type,
    signed_amount_eur, currency, created_by
  ) VALUES (
    v_event, p_partner_entity_id, p_effective_date, 'reimbursement',
    pg_catalog.round((- p_amount), 2), 'EUR', v_actor
  );

  INSERT INTO finance.partner_funding_transaction_links (event_id, transaction_id, link_role)
  VALUES (v_event, v_tx, 'reimbursement');

  INSERT INTO finance.partner_funding_audit (event_id, action, actor, payload_hash)
  VALUES (v_event, 'execute_partner_reimbursement', v_actor, p_preview_hash);

  RETURN pg_catalog.jsonb_build_object(
    'ok', true,
    'replay', false,
    'event_id', v_event,
    'transaction_id', v_tx,
    'partner_balance_after', v_preview->'partner_balance_after',
    'company_cash_effect', v_preview->'company_cash_effect',
    'client_effect', 0,
    'pnl_effect', 0,
    'actor', v_actor
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.reverse_partner_funding_event(
  p_event_id UUID,
  p_reason TEXT,
  p_idempotency_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
DECLARE
  v_actor UUID;
  v_src finance.partner_funding_events%ROWTYPE;
  v_existing finance.partner_funding_events%ROWTYPE;
  v_event UUID;
  v_tx UUID;
  v_orig_tx UUID;
  v_exec UUID;
  v_orig_exec UUID;
  v_link UUID;
  v_row RECORD;
  v_seq INTEGER := 0;
  v_payer TEXT;
  v_payee TEXT;
  v_cat TEXT;
  v_sub TEXT;
  v_desc TEXT;
  v_role TEXT;
  v_entry_type TEXT;
  v_ca_signed NUMERIC;
BEGIN
  IF NOT finance.is_active_jj_staff() THEN
    RAISE EXCEPTION '[jj_auth] Active staff required.';
  END IF;
  v_actor := public.require_jj_staff(ARRAY['ceo', 'finance_admin']);
  IF p_event_id IS NULL THEN
    RAISE EXCEPTION '[input] event_id must be a UUID.';
  END IF;
  IF p_reason IS NULL OR pg_catalog.btrim(p_reason) = '' THEN
    RAISE EXCEPTION '[input] reason is required.';
  END IF;
  IF p_idempotency_key IS NULL OR pg_catalog.btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION '[input] idempotency_key must be non-empty.';
  END IF;

  SELECT * INTO v_src FROM finance.partner_funding_events e WHERE e.id = p_event_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION '[not_found] event % does not exist.', p_event_id;
  END IF;
  IF v_src.event_type = 'reversal' OR v_src.reversal_of IS NOT NULL THEN
    RAISE EXCEPTION '[denied] reversing a reversal is not allowed.';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(872108, pg_catalog.hashtext(p_idempotency_key));
  PERFORM pg_catalog.pg_advisory_xact_lock(872111, pg_catalog.hashtext(p_event_id::text));

  SELECT * INTO v_existing
  FROM finance.partner_funding_events e
  WHERE e.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_existing.reversal_of IS DISTINCT FROM p_event_id THEN
      RAISE EXCEPTION '[idempotency_conflict] idempotency_key already used with a different payload.';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'ok', true, 'replay', true, 'event_id', v_existing.id, 'reversal_of', p_event_id
    );
  END IF;
  IF EXISTS (SELECT 1 FROM finance.partner_funding_events e WHERE e.reversal_of = p_event_id) THEN
    RAISE EXCEPTION '[denied] event % is already reversed.', p_event_id;
  END IF;

  SELECT l.transaction_id, l.link_role INTO v_orig_tx, v_role
  FROM finance.partner_funding_transaction_links l
  WHERE l.event_id = p_event_id
  ORDER BY l.created_at
  LIMIT 1;
  SELECT t.payer, t.payee, t.category, t.subcategory
    INTO v_payer, v_payee, v_cat, v_sub
  FROM public.transactions t WHERE t.id = v_orig_tx;

  IF v_src.event_type = 'partner_funded_client_payment' THEN
    v_desc := 'partner funded client settlement reversal';
    v_role := 'reversal';
    v_entry_type := 'reversal';
    v_ca_signed := pg_catalog.round((- v_src.amount_eur), 2);
  ELSE
    v_desc := 'partner current-account reimbursement reversal';
    v_role := 'reversal';
    v_entry_type := 'reversal';
    v_ca_signed := v_src.amount_eur;
  END IF;

  INSERT INTO finance.partner_funding_events (
    event_type, effective_date, amount_eur, partner_entity_id, client_entity_id,
    funding_source, status, idempotency_key, payload_hash, canonical_snapshot,
    reversal_of, created_by
  ) VALUES (
    'reversal', v_src.effective_date, v_src.amount_eur, v_src.partner_entity_id,
    v_src.client_entity_id, v_src.funding_source, 'posted', p_idempotency_key,
    v_src.payload_hash, v_src.canonical_snapshot, p_event_id, v_actor
  )
  RETURNING id INTO v_event;

  INSERT INTO public.transactions (
    date, property_id, property_name, category, subcategory, description,
    payer, payee, amount_eur, client_charge, review_status, is_deleted
  ) VALUES (
    v_src.effective_date, NULL, NULL, v_cat, v_sub, v_desc,
    v_payer, v_payee, pg_catalog.round((- v_src.amount_eur), 2), NULL, 'active', false
  )
  RETURNING id INTO v_tx;

  IF v_src.event_type = 'partner_funded_client_payment' THEN
    INSERT INTO finance.owner_transaction_links (
      transaction_id, owner_entity_id, link_role, idempotency_key,
      review_status, is_deleted, created_by
    ) VALUES (
      v_tx, v_src.client_entity_id, 'owner_level_payment',
      'pf-rev-link:' || p_idempotency_key, 'approved', false, v_actor::text
    )
    RETURNING id INTO v_link;

    SELECT x.id INTO v_orig_exec
    FROM finance.client_cash_settlement_executions x
    WHERE x.idempotency_key = 'pf-cash:' || v_src.idempotency_key;

    IF v_orig_exec IS NOT NULL THEN
      INSERT INTO finance.client_cash_settlement_executions (
        entity_id, direction, amount, effective_date, transaction_id, owner_link_id,
        preview_hash, canonical_snapshot, idempotency_key, reversal_of, actor
      ) VALUES (
        v_src.client_entity_id, 'JJ_TO_CLIENT', v_src.amount_eur, v_src.effective_date,
        v_tx, v_link, v_src.payload_hash, v_src.canonical_snapshot,
        'pf-cash:' || p_idempotency_key, v_orig_exec, v_actor
      )
      RETURNING id INTO v_exec;

      FOR v_row IN
        SELECT * FROM finance.client_obligation_fifo_allocations a
        WHERE a.execution_id = v_orig_exec
        ORDER BY a.sequence_no
      LOOP
        v_seq := v_seq + 1;
        INSERT INTO finance.client_obligation_fifo_allocations (
          execution_id, certification_line_id, property_id, sequence_no,
          signed_amount, allocated_amount
        ) VALUES (
          v_exec, v_row.certification_line_id, v_row.property_id, v_seq,
          pg_catalog.round((- v_row.signed_amount), 2), v_row.allocated_amount
        );
      END LOOP;
    END IF;
  END IF;

  INSERT INTO finance.partner_current_account_entries (
    event_id, partner_entity_id, effective_date, entry_type,
    signed_amount_eur, currency, created_by
  ) VALUES (
    v_event, v_src.partner_entity_id, v_src.effective_date, v_entry_type,
    v_ca_signed, 'EUR', v_actor
  );

  INSERT INTO finance.partner_funding_transaction_links (event_id, transaction_id, link_role)
  VALUES (v_event, v_tx, 'reversal');

  INSERT INTO finance.partner_funding_audit (event_id, action, actor, payload_hash)
  VALUES (v_event, 'reverse:' || p_reason, v_actor, v_src.payload_hash);

  RETURN pg_catalog.jsonb_build_object(
    'ok', true,
    'replay', false,
    'event_id', v_event,
    'transaction_id', v_tx,
    'reversal_of', p_event_id,
    'reason', p_reason,
    'actor', v_actor
  );
END;
$fn$;

-- #243 reverse_client_cash_settlement body, plus a fail-closed partner-funded
-- deny guard after auth/lookup and before any write or ordinary reversal work.
CREATE OR REPLACE FUNCTION public.reverse_client_cash_settlement(
  p_execution_id UUID,
  p_idempotency_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
DECLARE
  v_actor UUID;
  v_src finance.client_cash_settlement_executions%ROWTYPE;
  v_existing finance.client_cash_settlement_executions%ROWTYPE;
  v_post JSONB;
  v_tx UUID;
  v_link UUID;
  v_exec UUID;
  v_row RECORD;
  v_seq INTEGER := 0;
  v_rev_dir TEXT;
BEGIN
  IF NOT finance.is_active_jj_staff() THEN
    RAISE EXCEPTION '[jj_auth] Active staff required.';
  END IF;
  v_actor := public.require_jj_staff(ARRAY['ceo', 'finance_admin']);

  IF p_execution_id IS NULL THEN
    RAISE EXCEPTION '[input] execution_id must be a UUID.';
  END IF;
  IF p_idempotency_key IS NULL OR pg_catalog.btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION '[input] idempotency_key must be non-empty.';
  END IF;

  SELECT * INTO v_src
  FROM finance.client_cash_settlement_executions e
  WHERE e.id = p_execution_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION '[not_found] execution % does not exist.', p_execution_id;
  END IF;
  IF COALESCE(v_src.canonical_snapshot->>'funding_source', '') = 'PARTNER_PERSONAL'
     OR v_src.idempotency_key LIKE 'pf-cash:%'
     OR EXISTS (
          SELECT 1
          FROM finance.partner_funding_transaction_links l
          WHERE l.transaction_id = v_src.transaction_id
        )
     OR EXISTS (
          SELECT 1
          FROM finance.partner_funding_events e
          WHERE e.client_cash_execution_id = p_execution_id
        )
  THEN
    RAISE EXCEPTION '[denied] partner-funded cash must be reversed with reverse_partner_funding_event.';
  END IF;
  IF v_src.reversal_of IS NOT NULL THEN
    RAISE EXCEPTION '[denied] reversing a reversal is not allowed.';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    872007, pg_catalog.hashtext(v_src.entity_id::text)
  );

  SELECT * INTO v_existing
  FROM finance.client_cash_settlement_executions e
  WHERE e.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_existing.reversal_of IS DISTINCT FROM p_execution_id THEN
      RAISE EXCEPTION '[idempotency_conflict] idempotency_key already used with a different payload.';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'ok', true,
      'replay', true,
      'id', v_existing.id,
      'transaction_id', v_existing.transaction_id,
      'reversal_of', v_existing.reversal_of
    );
  END IF;

  IF EXISTS (
    SELECT 1 FROM finance.client_cash_settlement_executions e
    WHERE e.reversal_of = p_execution_id
  ) THEN
    RAISE EXCEPTION '[denied] execution % is already reversed.', p_execution_id;
  END IF;

  v_post := finance.client_cash_posting_fields(v_src.direction);
  INSERT INTO public.transactions (
    date, property_id, property_name, category, subcategory, description,
    payer, payee, amount_eur, client_charge, review_status, is_deleted
  ) VALUES (
    v_src.effective_date,
    NULL,
    NULL,
    v_post->>'category',
    v_post->>'subcategory',
    'client cash settlement reversal',
    v_post->>'payer',
    v_post->>'payee',
    pg_catalog.round((- v_src.amount), 2),
    NULL,
    'active',
    false
  )
  RETURNING id INTO v_tx;

  INSERT INTO finance.owner_transaction_links (
    transaction_id, owner_entity_id, link_role, idempotency_key,
    review_status, is_deleted, created_by
  ) VALUES (
    v_tx,
    v_src.entity_id,
    CASE WHEN v_src.direction = 'JJ_TO_CLIENT' THEN 'owner_level_payment' ELSE 'client_level_payment' END,
    'cash-link:' || p_idempotency_key,
    'approved',
    false,
    v_actor::text
  )
  RETURNING id INTO v_link;

  INSERT INTO finance.client_cash_settlement_executions (
    entity_id, direction, amount, effective_date, transaction_id, owner_link_id,
    preview_hash, canonical_snapshot, idempotency_key, reversal_of, actor
  ) VALUES (
    v_src.entity_id, v_src.direction, v_src.amount, v_src.effective_date, v_tx, v_link,
    v_src.preview_hash, v_src.canonical_snapshot, p_idempotency_key, p_execution_id, v_actor
  )
  RETURNING id INTO v_exec;

  FOR v_row IN
    SELECT * FROM finance.client_obligation_fifo_allocations a
    WHERE a.execution_id = p_execution_id
    ORDER BY a.sequence_no
  LOOP
    v_seq := v_seq + 1;
    INSERT INTO finance.client_obligation_fifo_allocations (
      execution_id, certification_line_id, property_id, sequence_no,
      signed_amount, allocated_amount
    ) VALUES (
      v_exec, v_row.certification_line_id, v_row.property_id, v_seq,
      pg_catalog.round((- v_row.signed_amount), 2), v_row.allocated_amount
    );
  END LOOP;

  RETURN pg_catalog.jsonb_build_object(
    'ok', true,
    'replay', false,
    'id', v_exec,
    'transaction_id', v_tx,
    'reversal_of', p_execution_id,
    'actor', v_actor
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.list_partner_funding_actors() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_partner_funding_actors() FROM anon, service_role;
GRANT EXECUTE ON FUNCTION public.list_partner_funding_actors() TO authenticated;

REVOKE ALL ON FUNCTION public.read_partner_current_account(UUID, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.read_partner_current_account(UUID, DATE) FROM anon, service_role;
GRANT EXECUTE ON FUNCTION public.read_partner_current_account(UUID, DATE) TO authenticated;

REVOKE ALL ON FUNCTION public.preview_partner_funded_client_settlement(UUID, UUID, TEXT, NUMERIC, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.preview_partner_funded_client_settlement(UUID, UUID, TEXT, NUMERIC, DATE) FROM anon, service_role;
GRANT EXECUTE ON FUNCTION public.preview_partner_funded_client_settlement(UUID, UUID, TEXT, NUMERIC, DATE) TO authenticated;

REVOKE ALL ON FUNCTION public.execute_partner_funded_client_settlement(UUID, UUID, TEXT, NUMERIC, DATE, TEXT, JSONB, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.execute_partner_funded_client_settlement(UUID, UUID, TEXT, NUMERIC, DATE, TEXT, JSONB, TEXT) FROM anon, service_role;
GRANT EXECUTE ON FUNCTION public.execute_partner_funded_client_settlement(UUID, UUID, TEXT, NUMERIC, DATE, TEXT, JSONB, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.preview_partner_reimbursement(UUID, NUMERIC, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.preview_partner_reimbursement(UUID, NUMERIC, DATE) FROM anon, service_role;
GRANT EXECUTE ON FUNCTION public.preview_partner_reimbursement(UUID, NUMERIC, DATE) TO authenticated;

REVOKE ALL ON FUNCTION public.execute_partner_reimbursement(UUID, NUMERIC, DATE, TEXT, JSONB, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.execute_partner_reimbursement(UUID, NUMERIC, DATE, TEXT, JSONB, TEXT) FROM anon, service_role;
GRANT EXECUTE ON FUNCTION public.execute_partner_reimbursement(UUID, NUMERIC, DATE, TEXT, JSONB, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.reverse_partner_funding_event(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reverse_partner_funding_event(UUID, TEXT, TEXT) FROM anon, service_role;
GRANT EXECUTE ON FUNCTION public.reverse_partner_funding_event(UUID, TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.reverse_client_cash_settlement(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reverse_client_cash_settlement(UUID, TEXT) FROM anon, service_role;
GRANT EXECUTE ON FUNCTION public.reverse_client_cash_settlement(UUID, TEXT) TO authenticated;
