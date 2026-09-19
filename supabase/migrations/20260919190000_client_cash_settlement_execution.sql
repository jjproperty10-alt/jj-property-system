-- ============================================================
-- Client cash settlement execution (Phase 2E)
-- LOCAL IMPLEMENTATION ONLY. Do not Apply to Production from this branch
-- without a separate Yossi authorization.
--
-- One client-level cash row in public.transactions (property_id NULL,
-- property_name NULL). FIFO allocations are separate and do not create P&L.
-- Does not CREATE OR REPLACE RC3 / certified-ledger views.
-- Does not use noncash_settlement_credit. Does not seed Tamir.
-- ============================================================

CREATE SCHEMA IF NOT EXISTS finance;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

DO $pre$
BEGIN
  IF to_regclass('finance.owner_transaction_links') IS NULL THEN
    RAISE EXCEPTION '[preflight] finance.owner_transaction_links is required.';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM finance.owner_transaction_links l
    WHERE l.link_role IS DISTINCT FROM 'owner_level_payment'
      AND l.link_role IS DISTINCT FROM 'client_level_payment'
  ) THEN
    RAISE EXCEPTION '[preflight] unexpected finance.owner_transaction_links.link_role values.';
  END IF;
END;
$pre$;

ALTER TABLE finance.owner_transaction_links
  DROP CONSTRAINT IF EXISTS owner_transaction_links_link_role_check;
ALTER TABLE finance.owner_transaction_links
  ADD CONSTRAINT owner_transaction_links_link_role_check
  CHECK (link_role IN ('owner_level_payment', 'client_level_payment'));

CREATE TABLE IF NOT EXISTS finance.client_cash_settlement_executions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id            UUID NOT NULL REFERENCES lifecycle.entity_identity(id),
  direction            TEXT NOT NULL CHECK (direction IN ('JJ_TO_CLIENT', 'CLIENT_TO_JJ')),
  amount               NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  effective_date       DATE NOT NULL,
  transaction_id       UUID NOT NULL REFERENCES public.transactions(id),
  owner_link_id        UUID NOT NULL REFERENCES finance.owner_transaction_links(id),
  preview_hash         TEXT NOT NULL,
  canonical_snapshot   JSONB NOT NULL,
  idempotency_key      TEXT NOT NULL UNIQUE,
  reversal_of          UUID REFERENCES finance.client_cash_settlement_executions(id),
  actor                UUID NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ccse_reversal_not_self CHECK (reversal_of IS NULL OR reversal_of <> id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ccse_active_reversal
  ON finance.client_cash_settlement_executions (reversal_of)
  WHERE reversal_of IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ccse_entity_created
  ON finance.client_cash_settlement_executions (entity_id, created_at);

CREATE TABLE IF NOT EXISTS finance.client_obligation_fifo_allocations (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id            UUID NOT NULL
                          REFERENCES finance.client_cash_settlement_executions(id),
  certification_line_id   UUID NOT NULL
                          REFERENCES finance.client_settlement_certification_lines(id),
  property_id             UUID NOT NULL REFERENCES public.properties(id),
  sequence_no             INTEGER NOT NULL CHECK (sequence_no >= 1),
  signed_amount           NUMERIC(12,2) NOT NULL CHECK (signed_amount <> 0),
  allocated_amount        NUMERIC(12,2) NOT NULL CHECK (allocated_amount > 0),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_cofa_execution_seq UNIQUE (execution_id, sequence_no)
);

CREATE INDEX IF NOT EXISTS idx_cofa_line
  ON finance.client_obligation_fifo_allocations (certification_line_id);

COMMENT ON TABLE finance.client_cash_settlement_executions IS
  'Append-only client-level cash settlement executions. Reversal is a new row.';
COMMENT ON TABLE finance.client_obligation_fifo_allocations IS
  'Append-only FIFO slice allocations. Signed amounts change remaining R only. Not P&L.';

CREATE OR REPLACE FUNCTION finance.trg_client_cash_settlement_append_only()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO ''
AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION '[append-only] client cash settlement rows cannot be deleted.';
  END IF;
  RAISE EXCEPTION '[append-only] client cash settlement identity is immutable.';
END;
$fn$;

DROP TRIGGER IF EXISTS trg_ccse_append_only ON finance.client_cash_settlement_executions;
CREATE TRIGGER trg_ccse_append_only
  BEFORE UPDATE OR DELETE ON finance.client_cash_settlement_executions
  FOR EACH ROW EXECUTE FUNCTION finance.trg_client_cash_settlement_append_only();

DROP TRIGGER IF EXISTS trg_cofa_append_only ON finance.client_obligation_fifo_allocations;
CREATE TRIGGER trg_cofa_append_only
  BEFORE UPDATE OR DELETE ON finance.client_obligation_fifo_allocations
  FOR EACH ROW EXECUTE FUNCTION finance.trg_client_cash_settlement_append_only();

ALTER TABLE finance.client_cash_settlement_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.client_cash_settlement_executions FORCE ROW LEVEL SECURITY;
ALTER TABLE finance.client_obligation_fifo_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.client_obligation_fifo_allocations FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deny_all_client_cash_settlement_executions
  ON finance.client_cash_settlement_executions;
CREATE POLICY deny_all_client_cash_settlement_executions
  ON finance.client_cash_settlement_executions AS RESTRICTIVE
  FOR ALL TO public
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS deny_all_client_obligation_fifo_allocations
  ON finance.client_obligation_fifo_allocations;
CREATE POLICY deny_all_client_obligation_fifo_allocations
  ON finance.client_obligation_fifo_allocations AS RESTRICTIVE
  FOR ALL TO public
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE finance.client_cash_settlement_executions FROM PUBLIC;
REVOKE ALL ON TABLE finance.client_cash_settlement_executions FROM anon, authenticated, service_role;
REVOKE ALL ON TABLE finance.client_obligation_fifo_allocations FROM PUBLIC;
REVOKE ALL ON TABLE finance.client_obligation_fifo_allocations FROM anon, authenticated, service_role;

CREATE OR REPLACE VIEW finance.v_client_property_obligation_register
  WITH (security_invoker = true)
AS
SELECT
  c.entity_id,
  b.property_id,
  c.id AS certification_id,
  c.version AS certification_version,
  l.id AS source_line_identity,
  'certified_opening_line'::text AS source_kind,
  c.as_of AS effective_date,
  pg_catalog.round((- l.amount_due_to_jj), 2) AS original_signed_amount,
  pg_catalog.round(
    (- l.amount_due_to_jj) + COALESCE((
      SELECT pg_catalog.sum(a.signed_amount)
      FROM finance.client_obligation_fifo_allocations a
      WHERE a.certification_line_id = l.id
    ), 0),
    2
  ) AS remaining_signed_amount,
  CASE
    WHEN pg_catalog.round(
      (- l.amount_due_to_jj) + COALESCE((
        SELECT pg_catalog.sum(a.signed_amount)
        FROM finance.client_obligation_fifo_allocations a
        WHERE a.certification_line_id = l.id
      ), 0),
      2
    ) > 0 THEN 'JJ_OWES_CLIENT'
    WHEN pg_catalog.round(
      (- l.amount_due_to_jj) + COALESCE((
        SELECT pg_catalog.sum(a.signed_amount)
        FROM finance.client_obligation_fifo_allocations a
        WHERE a.certification_line_id = l.id
      ), 0),
      2
    ) < 0 THEN 'CLIENT_OWES_JJ'
    ELSE 'SETTLED'
  END AS direction,
  pg_catalog.lower(pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        pg_catalog.jsonb_build_object(
          'certification_line_id', l.id,
          'certification_version', c.version,
          'amount_due_to_jj', pg_catalog.to_char(l.amount_due_to_jj, 'FM999999999990.00'),
          'property_id', b.property_id,
          'binding_status', b.status
        )::text,
        'UTF8'
      ),
      'sha256'::text
    ),
    'hex'
  )) AS source_hash
FROM finance.client_settlement_certification_lines l
JOIN finance.client_settlement_certifications c
  ON c.id = l.certification_id
JOIN finance.client_obligation_property_bindings b
  ON b.certification_line_id = l.id
 AND b.status = 'active'
WHERE c.status = 'applied';

REVOKE ALL ON finance.v_client_property_obligation_register FROM PUBLIC;
REVOKE ALL ON finance.v_client_property_obligation_register FROM anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION finance.client_cash_posting_fields(p_direction TEXT)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $fn$
  SELECT CASE p_direction
    WHEN 'JJ_TO_CLIENT' THEN pg_catalog.jsonb_build_object(
      'category', 'Management',
      'subcategory', 'Bank Payment to Owner',
      'payer', 'JJ',
      'payee', 'Owner'
    )
    WHEN 'CLIENT_TO_JJ' THEN pg_catalog.jsonb_build_object(
      'category', 'Management',
      'subcategory', 'Client Payment',
      'payer', 'Client',
      'payee', 'JJ'
    )
    ELSE NULL
  END;
$fn$;

REVOKE ALL ON FUNCTION finance.client_cash_posting_fields(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION finance.client_cash_posting_fields(TEXT) FROM anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.preview_client_obligation_fifo(
  p_entity_id UUID,
  p_direction TEXT,
  p_payment_amount NUMERIC,
  p_as_of DATE
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $fn$
DECLARE
  v_actor UUID;
  v_want_positive BOOLEAN;
  v_alloc JSONB := '[]'::jsonb;
  v_snap_alloc JSONB := '[]'::jsonb;
  v_unbound JSONB := '[]'::jsonb;
  v_unbound_ids JSONB := '[]'::jsonb;
  v_sources JSONB := '[]'::jsonb;
  v_remain NUMERIC;
  v_applied NUMERIC;
  v_opening NUMERIC;
  v_left NUMERIC;
  v_allocated NUMERIC := 0;
  v_before NUMERIC := 0;
  v_after NUMERIC;
  v_hash TEXT;
  v_blocked TEXT := NULL;
  v_snapshot JSONB;
  v_row RECORD;
  v_policy TEXT := 'client-cash-settlement-v1';
  v_post JSONB;
  v_client TEXT;
BEGIN
  IF NOT finance.is_active_jj_staff() THEN
    RAISE EXCEPTION '[jj_auth] Active staff required.';
  END IF;
  v_actor := public.require_jj_staff(ARRAY['ceo', 'finance_admin']);

  IF p_entity_id IS NULL THEN
    RAISE EXCEPTION '[input] entity_id must be a UUID.';
  END IF;
  IF p_direction IS NULL OR p_direction NOT IN ('JJ_TO_CLIENT', 'CLIENT_TO_JJ') THEN
    RAISE EXCEPTION '[input] direction must be JJ_TO_CLIENT or CLIENT_TO_JJ.';
  END IF;
  IF p_payment_amount IS NULL OR p_payment_amount <= 0
     OR p_payment_amount IS DISTINCT FROM pg_catalog.round(p_payment_amount, 2) THEN
    RAISE EXCEPTION '[input] payment_amount must be a positive exact-cent number.';
  END IF;
  IF p_as_of IS NULL THEN
    RAISE EXCEPTION '[input] as_of must be a date.';
  END IF;

  v_post := finance.client_cash_posting_fields(p_direction);
  SELECT e.canonical_name INTO v_client
  FROM lifecycle.entity_identity e
  WHERE e.id = p_entity_id AND e.status = 'active';
  IF v_client IS NULL THEN
    RAISE EXCEPTION '[input] entity_id must be an active lifecycle.entity_identity row.';
  END IF;

  v_want_positive := (p_direction = 'JJ_TO_CLIENT');

  SELECT COALESCE(pg_catalog.sum(reg.remaining_signed_amount), 0)
    INTO v_before
  FROM finance.v_client_property_obligation_register reg
  WHERE reg.entity_id = p_entity_id
    AND reg.effective_date <= p_as_of;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'certification_id', reg.certification_id,
        'certification_version', reg.certification_version,
        'certification_line_id', reg.source_line_identity,
        'property_id', reg.property_id,
        'source_hash', reg.source_hash,
        'signed_original_amount', pg_catalog.to_char(reg.original_signed_amount, 'FM999999999990.00'),
        'signed_remaining_amount', pg_catalog.to_char(reg.remaining_signed_amount, 'FM999999999990.00')
      )
      ORDER BY reg.effective_date, reg.certification_version,
               reg.source_line_identity, reg.property_id
    ),
    '[]'::jsonb
  )
    INTO v_sources
  FROM finance.v_client_property_obligation_register reg
  WHERE reg.entity_id = p_entity_id
    AND reg.effective_date <= p_as_of;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'certification_id', u.certification_id,
        'source_line_identity', u.source_line_identity,
        'blocked_code', u.blocked_code
      )
      ORDER BY u.effective_date, u.source_line_identity
    ),
    '[]'::jsonb
  )
    INTO v_unbound
  FROM finance.v_client_obligation_unbound_lines u
  WHERE u.entity_id = p_entity_id
    AND u.effective_date <= p_as_of;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.to_jsonb(u.source_line_identity)
      ORDER BY u.effective_date, u.source_line_identity
    ),
    '[]'::jsonb
  )
    INTO v_unbound_ids
  FROM finance.v_client_obligation_unbound_lines u
  WHERE u.entity_id = p_entity_id
    AND u.effective_date <= p_as_of;

  v_remain := p_payment_amount;

  FOR v_row IN
    SELECT *
    FROM finance.v_client_property_obligation_register x
    WHERE x.entity_id = p_entity_id
      AND x.effective_date <= p_as_of
      AND (
        (v_want_positive AND x.remaining_signed_amount > 0)
        OR ((NOT v_want_positive) AND x.remaining_signed_amount < 0)
      )
    ORDER BY x.effective_date ASC, x.certification_version ASC,
             x.source_line_identity ASC, x.property_id ASC
  LOOP
    EXIT WHEN v_remain <= 0;
    v_opening := pg_catalog.round(pg_catalog.abs(v_row.remaining_signed_amount), 2);
    v_applied := pg_catalog.round(LEAST(v_remain, v_opening), 2);
    IF v_applied <= 0 THEN
      CONTINUE;
    END IF;
    v_left := pg_catalog.round(v_opening - v_applied, 2);
    v_alloc := v_alloc || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'property_id', v_row.property_id,
        'certification_id', v_row.certification_id,
        'source_line_identity', v_row.source_line_identity,
        'source_kind', v_row.source_kind,
        'opening_remaining_amount', v_opening,
        'amount_applied', v_applied,
        'remaining_after', v_left,
        'signed_opening', v_row.remaining_signed_amount
      )
    );
    v_snap_alloc := v_snap_alloc || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'certification_line_id', v_row.source_line_identity,
        'property_id', v_row.property_id,
        'allocated_amount', pg_catalog.to_char(v_applied, 'FM999999999990.00')
      )
    );
    v_allocated := pg_catalog.round(v_allocated + v_applied, 2);
    v_remain := pg_catalog.round(v_remain - v_applied, 2);
  END LOOP;

  IF p_direction = 'JJ_TO_CLIENT' THEN
    v_after := pg_catalog.round(v_before - p_payment_amount, 2);
  ELSE
    v_after := pg_catalog.round(v_before + p_payment_amount, 2);
  END IF;

  IF pg_catalog.jsonb_array_length(v_unbound_ids) > 0 THEN
    v_blocked := 'unbound_certification_line';
  ELSIF v_allocated = 0 AND EXISTS (
    SELECT 1
    FROM finance.v_client_property_obligation_register x
    WHERE x.entity_id = p_entity_id
      AND x.effective_date <= p_as_of
      AND (
        (v_want_positive AND x.remaining_signed_amount < 0)
        OR ((NOT v_want_positive) AND x.remaining_signed_amount > 0)
      )
  ) THEN
    v_blocked := 'wrong_sign_obligation';
  ELSIF v_allocated = 0 THEN
    v_blocked := 'no_matching_obligation';
  ELSIF v_remain > 0 THEN
    v_blocked := 'unapplied_remainder';
  END IF;

  IF pg_catalog.round(v_allocated + v_remain, 2) IS DISTINCT FROM p_payment_amount THEN
    RAISE EXCEPTION '[invariant] allocated_total + unapplied_remainder must equal payment_amount.';
  END IF;

  v_snapshot := pg_catalog.jsonb_build_object(
    'policy_version', v_policy,
    'entity_id', p_entity_id,
    'canonical_client', v_client,
    'direction', p_direction,
    'category', v_post->>'category',
    'subcategory', v_post->>'subcategory',
    'payer', v_post->>'payer',
    'payee', v_post->>'payee',
    'payment_amount', pg_catalog.to_char(p_payment_amount, 'FM999999999990.00'),
    'as_of_date', p_as_of,
    'balance_before_R', pg_catalog.to_char(v_before, 'FM999999999990.00'),
    'balance_after_R', pg_catalog.to_char(v_after, 'FM999999999990.00'),
    'sources', v_sources,
    'allocations', v_snap_alloc,
    'allocated_total', pg_catalog.to_char(v_allocated, 'FM999999999990.00'),
    'unapplied_remainder', pg_catalog.to_char(v_remain, 'FM999999999990.00'),
    'blocked_code', v_blocked,
    'unbound_line_ids', v_unbound_ids
  );
  v_hash := finance.client_obligation_fifo_sha256(v_snapshot);

  RETURN pg_catalog.jsonb_build_object(
    'ok', v_blocked IS NULL,
    'entity_id', p_entity_id,
    'canonical_client', v_client,
    'direction', p_direction,
    'category', v_post->>'category',
    'subcategory', v_post->>'subcategory',
    'payer', v_post->>'payer',
    'payee', v_post->>'payee',
    'amount', p_payment_amount,
    'as_of', p_as_of,
    'effective_date', p_as_of,
    'balance_before_R', v_before,
    'balance_after_R', v_after,
    'sources', v_sources,
    'allocations', v_alloc,
    'allocated_total', v_allocated,
    'unapplied_remainder', v_remain,
    'blocked_code', v_blocked,
    'unbound_lines', v_unbound,
    'source_version_hash', finance.client_obligation_fifo_sha256(v_sources),
    'preview_hash', v_hash,
    'canonical_snapshot', v_snapshot,
    'policy_version', v_policy,
    'actor', v_actor
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.execute_client_cash_settlement(
  p_entity_id UUID,
  p_direction TEXT,
  p_amount NUMERIC,
  p_effective_date DATE,
  p_preview_hash TEXT,
  p_canonical_snapshot JSONB,
  p_idempotency_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
DECLARE
  v_actor UUID;
  v_preview JSONB;
  v_existing finance.client_cash_settlement_executions%ROWTYPE;
  v_post JSONB;
  v_tx UUID;
  v_link UUID;
  v_exec UUID;
  v_seq INTEGER := 0;
  v_alloc JSONB;
  v_elem JSONB;
  v_applied NUMERIC;
  v_signed NUMERIC;
  v_sum NUMERIC := 0;
  v_line UUID;
  v_prop UUID;
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
  IF p_canonical_snapshot IS NULL OR jsonb_typeof(p_canonical_snapshot) <> 'object' THEN
    RAISE EXCEPTION '[input] canonical_snapshot must be a JSON object.';
  END IF;
  IF finance.client_obligation_fifo_sha256(p_canonical_snapshot) IS DISTINCT FROM p_preview_hash THEN
    RAISE EXCEPTION '[stale_preview] submitted snapshot does not match preview_hash.';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    872007, pg_catalog.hashtext(p_entity_id::text)
  );
  PERFORM 1
  FROM finance.client_obligation_property_bindings b
  JOIN finance.client_settlement_certification_lines l
    ON l.id = b.certification_line_id
  JOIN finance.client_settlement_certifications c
    ON c.id = l.certification_id
  WHERE c.entity_id = p_entity_id
    AND b.status = 'active'
  FOR UPDATE OF b;

  SELECT * INTO v_existing
  FROM finance.client_cash_settlement_executions e
  WHERE e.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_existing.preview_hash IS DISTINCT FROM p_preview_hash
       OR v_existing.canonical_snapshot IS DISTINCT FROM p_canonical_snapshot
       OR v_existing.entity_id IS DISTINCT FROM p_entity_id
       OR v_existing.direction IS DISTINCT FROM p_direction
       OR v_existing.amount IS DISTINCT FROM p_amount
       OR v_existing.effective_date IS DISTINCT FROM p_effective_date THEN
      RAISE EXCEPTION '[idempotency_conflict] idempotency_key already used with a different payload.';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'ok', true,
      'replay', true,
      'id', v_existing.id,
      'transaction_id', v_existing.transaction_id,
      'owner_link_id', v_existing.owner_link_id,
      'preview_hash', v_existing.preview_hash,
      'actor', v_existing.actor
    );
  END IF;

  v_preview := public.preview_client_obligation_fifo(
    p_entity_id, p_direction, p_amount, p_effective_date
  );
  IF (v_preview->>'preview_hash') IS DISTINCT FROM p_preview_hash THEN
    RAISE EXCEPTION '[stale_preview] live FIFO state does not match submitted preview_hash.';
  END IF;
  IF (v_preview->>'ok') IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION '[blocked] %', COALESCE(v_preview->>'blocked_code', 'preview_not_ok');
  END IF;

  v_post := finance.client_cash_posting_fields(p_direction);
  INSERT INTO public.transactions (
    date, property_id, property_name, category, subcategory, description,
    payer, payee, amount_eur, client_charge, review_status, is_deleted
  ) VALUES (
    p_effective_date,
    NULL,
    NULL,
    v_post->>'category',
    v_post->>'subcategory',
    'client cash settlement',
    v_post->>'payer',
    v_post->>'payee',
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
    v_tx,
    p_entity_id,
    CASE WHEN p_direction = 'JJ_TO_CLIENT' THEN 'owner_level_payment' ELSE 'client_level_payment' END,
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
    p_entity_id, p_direction, p_amount, p_effective_date, v_tx, v_link,
    p_preview_hash, p_canonical_snapshot, p_idempotency_key, NULL, v_actor
  )
  RETURNING id INTO v_exec;

  FOR v_elem IN SELECT * FROM jsonb_array_elements(v_preview->'allocations')
  LOOP
    v_seq := v_seq + 1;
    v_applied := (v_elem->>'amount_applied')::numeric;
    v_line := (v_elem->>'source_line_identity')::uuid;
    v_prop := (v_elem->>'property_id')::uuid;
    IF p_direction = 'JJ_TO_CLIENT' THEN
      v_signed := pg_catalog.round((- v_applied), 2);
    ELSE
      v_signed := pg_catalog.round(v_applied, 2);
    END IF;
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

  RETURN pg_catalog.jsonb_build_object(
    'ok', true,
    'replay', false,
    'id', v_exec,
    'transaction_id', v_tx,
    'owner_link_id', v_link,
    'preview_hash', p_preview_hash,
    'allocated_total', v_sum,
    'actor', v_actor
  );
END;
$fn$;

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

CREATE OR REPLACE FUNCTION public.preview_client_cash_settlement(
  p_entity_id UUID,
  p_direction TEXT,
  p_amount NUMERIC,
  p_effective_date DATE
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $fn$
  SELECT public.preview_client_obligation_fifo(
    p_entity_id, p_direction, p_amount, p_effective_date
  );
$fn$;

REVOKE ALL ON FUNCTION public.preview_client_obligation_fifo(UUID, TEXT, NUMERIC, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.preview_client_obligation_fifo(UUID, TEXT, NUMERIC, DATE) FROM anon, service_role;
GRANT EXECUTE ON FUNCTION public.preview_client_obligation_fifo(UUID, TEXT, NUMERIC, DATE) TO authenticated;

REVOKE ALL ON FUNCTION public.preview_client_cash_settlement(UUID, TEXT, NUMERIC, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.preview_client_cash_settlement(UUID, TEXT, NUMERIC, DATE) FROM anon, service_role;
GRANT EXECUTE ON FUNCTION public.preview_client_cash_settlement(UUID, TEXT, NUMERIC, DATE) TO authenticated;

REVOKE ALL ON FUNCTION public.execute_client_cash_settlement(UUID, TEXT, NUMERIC, DATE, TEXT, JSONB, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.execute_client_cash_settlement(UUID, TEXT, NUMERIC, DATE, TEXT, JSONB, TEXT) FROM anon, service_role;
GRANT EXECUTE ON FUNCTION public.execute_client_cash_settlement(UUID, TEXT, NUMERIC, DATE, TEXT, JSONB, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.reverse_client_cash_settlement(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reverse_client_cash_settlement(UUID, TEXT) FROM anon, service_role;
GRANT EXECUTE ON FUNCTION public.reverse_client_cash_settlement(UUID, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION finance.trg_client_cash_settlement_append_only() FROM PUBLIC;
REVOKE ALL ON FUNCTION finance.trg_client_cash_settlement_append_only() FROM anon, authenticated, service_role;
REVOKE ALL ON FUNCTION finance.client_cash_posting_fields(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION finance.client_cash_posting_fields(TEXT) FROM anon, authenticated, service_role;

CREATE OR REPLACE VIEW finance.v_owner_level_payments
  WITH (security_invoker = true)
AS
SELECT
  t.id                         AS transaction_id,
  l.owner_entity_id,
  e.canonical_name             AS owner_display_name,
  t.date,
  t.payer,
  t.payee,
  t.amount_eur,
  t.description,
  t.k_note,
  l.idempotency_key,
  l.review_status,
  l.link_role,
  l.created_at,
  l.notes
FROM finance.owner_transaction_links l
JOIN public.transactions t
  ON t.id = l.transaction_id
JOIN lifecycle.entity_identity e
  ON e.id = l.owner_entity_id
WHERE l.is_deleted = false
  AND COALESCE(t.is_deleted, false) = false
  AND (t.review_status IS NULL OR t.review_status = 'active')
  AND l.link_role = 'owner_level_payment'
  AND l.review_status = 'approved'
  AND t.category = 'Management'
  AND t.subcategory = 'Bank Payment to Owner'
  AND t.property_id IS NULL
  AND t.property_name IS NULL
  AND t.amount_eur > 0
  AND NOT EXISTS (
    SELECT 1
    FROM finance.client_cash_settlement_executions x
    JOIN finance.client_cash_settlement_executions r
      ON r.reversal_of = x.id
    WHERE x.transaction_id = t.id
  );

COMMENT ON VIEW finance.v_owner_level_payments IS
  'Countable owner-level Bank Payments to Owner. Reversed cash executions are excluded. Do not join into property P&L.';

REVOKE ALL ON finance.v_owner_level_payments FROM PUBLIC;
REVOKE ALL ON finance.v_owner_level_payments FROM anon, authenticated;
GRANT SELECT ON finance.v_owner_level_payments TO service_role;

CREATE OR REPLACE FUNCTION public.list_client_settlement_entities()
RETURNS TABLE(id UUID, canonical_name TEXT)
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
  ORDER BY e.canonical_name, e.id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.list_client_settlement_entities() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_client_settlement_entities() FROM anon, service_role;
GRANT EXECUTE ON FUNCTION public.list_client_settlement_entities() TO authenticated;

-- ── Canonical reader: opening + overlay FIFO + cash allocations as-of ────────
-- Signature/columns of finance.read_certified_client_settlement stay JSONB.
-- Existing keys are preserved. Cash remaining is additive. Overlay stays overlay.
-- public.read_certified_client_settlement (19180000) is not rewritten here.

CREATE OR REPLACE FUNCTION finance.read_certified_client_settlement(
  p_entity_id UUID,
  p_as_of     DATE
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $csc$
DECLARE
  v_header           finance.client_settlement_certifications%ROWTYPE;
  v_lines            JSONB;
  v_fifo             JSONB;
  v_exclusions       JSONB;
  v_slices           JSONB;
  v_unbound          JSONB;
  v_cash_exec        JSONB;
  v_fifo_total       NUMERIC(12,2);
  v_closing          NUMERIC(12,2);
  v_alloc_signed     NUMERIC(12,2);
  v_remaining_due    NUMERIC(12,2);
  v_remaining_r      NUMERIC(12,2);
  v_layer_ok         BOOLEAN;
BEGIN
  IF p_entity_id IS NULL THEN
    RAISE EXCEPTION '[input] entity_id must be a UUID.';
  END IF;
  IF p_as_of IS NULL THEN
    RAISE EXCEPTION '[input] as_of must be a date.';
  END IF;

  v_layer_ok := finance.settlement_layer_available();

  SELECT * INTO v_header
  FROM finance.client_settlement_certifications c
  WHERE c.entity_id = p_entity_id
    AND c.as_of <= p_as_of
    AND c.certification_type = 'opening_property_obligations'
    AND c.status = 'applied'
  ORDER BY c.as_of DESC, c.version DESC
  LIMIT 1;

  IF NOT FOUND OR v_layer_ok IS NOT TRUE THEN
    RETURN pg_catalog.jsonb_build_object(
      'unavailable', true,
      'reason', CASE
        WHEN v_layer_ok IS NOT TRUE THEN 'settlement_layer_unavailable'
        ELSE 'no_applied_certification'
      END
    );
  END IF;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(pg_catalog.to_jsonb(l) ORDER BY l.line_order),
    '[]'::jsonb
  )
    INTO v_lines
  FROM finance.client_settlement_certification_lines l
  WHERE l.certification_id = v_header.id;

  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(f) ORDER BY f.effective_date, f.created_at, f.event_id), '[]'::jsonb),
         COALESCE(pg_catalog.sum(f.settlement_amount), 0)
    INTO v_fifo, v_fifo_total
  FROM finance.client_fifo_credits(p_entity_id, p_as_of) f;

  v_fifo_total := COALESCE(v_fifo_total, 0);
  v_closing := pg_catalog.round(v_header.total_due_to_jj - v_fifo_total, 2);

  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'event_id', e.id,
        'event_type', e.event_type,
        'settlement_amount', e.settlement_amount,
        'effective_date', e.effective_date,
        'source_transaction_id', e.source_transaction_id,
        'reason', e.reason,
        'evidence_ref', e.evidence_ref
      )
      ORDER BY e.effective_date, e.created_at, e.id
    ),
    '[]'::jsonb
  )
    INTO v_exclusions
  FROM finance.client_settlement_events e
  WHERE e.entity_id = p_entity_id
    AND e.status = 'applied'
    AND e.event_type = 'exclude_transaction_from_settlement'
    AND e.effective_date <= p_as_of;

  SELECT COALESCE(pg_catalog.sum(a.signed_amount), 0)
    INTO v_alloc_signed
  FROM finance.client_obligation_fifo_allocations a
  JOIN finance.client_cash_settlement_executions x
    ON x.id = a.execution_id
  JOIN finance.client_settlement_certification_lines l
    ON l.id = a.certification_line_id
  WHERE l.certification_id = v_header.id
    AND x.effective_date <= p_as_of;

  v_alloc_signed := COALESCE(v_alloc_signed, 0);
  v_remaining_due := pg_catalog.round(v_closing - v_alloc_signed, 2);
  v_remaining_r := pg_catalog.round((- v_remaining_due), 2);

  SELECT COALESCE(
    pg_catalog.jsonb_agg(s.j ORDER BY s.line_order, s.property_key),
    '[]'::jsonb
  )
    INTO v_slices
  FROM (
    SELECT
      l.line_order,
      l.property_key,
      pg_catalog.jsonb_build_object(
        'certification_line_id', l.id,
        'line_order', l.line_order,
        'property_key', l.property_key,
        'property_name', l.property_name,
        'property_id', b.property_id,
        'binding_status', CASE WHEN b.property_id IS NULL THEN 'unbound' ELSE 'bound' END,
        'original_signed_amount', pg_catalog.round((- l.amount_due_to_jj), 2),
        'allocated_signed_amount', pg_catalog.round(COALESCE((
          SELECT pg_catalog.sum(a.signed_amount)
          FROM finance.client_obligation_fifo_allocations a
          JOIN finance.client_cash_settlement_executions x
            ON x.id = a.execution_id
          WHERE a.certification_line_id = l.id
            AND x.effective_date <= p_as_of
        ), 0), 2),
        'remaining_signed_amount', pg_catalog.round(
          (- l.amount_due_to_jj) + COALESCE((
            SELECT pg_catalog.sum(a.signed_amount)
            FROM finance.client_obligation_fifo_allocations a
            JOIN finance.client_cash_settlement_executions x
              ON x.id = a.execution_id
            WHERE a.certification_line_id = l.id
              AND x.effective_date <= p_as_of
          ), 0),
          2
        )
      ) AS j
    FROM finance.client_settlement_certification_lines l
    LEFT JOIN finance.client_obligation_property_bindings b
      ON b.certification_line_id = l.id
     AND b.status = 'active'
    WHERE l.certification_id = v_header.id
  ) s;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'certification_line_id', u.source_line_identity,
        'property_key', u.property_key,
        'line_order', u.line_order,
        'original_signed_amount', u.original_signed_amount,
        'remaining_signed_amount', u.original_signed_amount,
        'blocked_code', u.blocked_code
      )
      ORDER BY u.line_order, u.source_line_identity
    ),
    '[]'::jsonb
  )
    INTO v_unbound
  FROM finance.v_client_obligation_unbound_lines u
  WHERE u.certification_id = v_header.id;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'execution_id', x.id,
        'transaction_id', x.transaction_id,
        'direction', x.direction,
        'amount', x.amount,
        'effective_date', x.effective_date,
        'reversal_of', x.reversal_of
      )
      ORDER BY x.effective_date, x.created_at, x.id
    ),
    '[]'::jsonb
  )
    INTO v_cash_exec
  FROM finance.client_cash_settlement_executions x
  WHERE x.entity_id = p_entity_id
    AND x.effective_date <= p_as_of
    AND EXISTS (
      SELECT 1
      FROM finance.client_obligation_fifo_allocations a
      JOIN finance.client_settlement_certification_lines l
        ON l.id = a.certification_line_id
      WHERE a.execution_id = x.id
        AND l.certification_id = v_header.id
    );

  RETURN pg_catalog.jsonb_build_object(
    'unavailable', false,
    'as_of', p_as_of,
    'certification_as_of', v_header.as_of,
    'certification', pg_catalog.to_jsonb(v_header),
    'lines', v_lines,
    'fifo_credits', v_fifo,
    'exclusions', v_exclusions,
    'certified_opening_due_to_jj', v_header.total_due_to_jj,
    'fifo_credits_total', v_fifo_total,
    'certified_closing_due_to_jj', v_closing,
    'cash_allocation_signed_total', v_alloc_signed,
    'certified_remaining_due_to_jj', v_remaining_due,
    'remaining_r', v_remaining_r,
    'remaining_s', v_remaining_due,
    'obligation_slices', v_slices,
    'unbound_lines', v_unbound,
    'cash_executions', v_cash_exec
  );
END;
$csc$;

COMMENT ON FUNCTION finance.read_certified_client_settlement(UUID, DATE) IS
  'Applied opening + overlay FIFO credits + cash allocation remaining as-of. Overlay is not cash. Closing due_to_jj remains opening minus overlay; remaining applies signed allocations. SECURITY DEFINER, empty search_path.';

REVOKE ALL ON FUNCTION finance.read_certified_client_settlement(UUID, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION finance.read_certified_client_settlement(UUID, DATE) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION finance.read_certified_client_settlement(UUID, DATE) TO service_role;

CREATE OR REPLACE FUNCTION public.read_client_settlement_balance(
  p_entity_id UUID,
  p_as_of     DATE
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $wrap$
BEGIN
  IF NOT finance.is_active_jj_staff() THEN
    RAISE EXCEPTION '[jj_auth] Active staff required.';
  END IF;
  PERFORM public.require_jj_staff(ARRAY['ceo', 'finance_admin', 'operations']);
  IF p_entity_id IS NULL THEN
    RAISE EXCEPTION '[input] entity_id must be a UUID.';
  END IF;
  IF p_as_of IS NULL THEN
    RAISE EXCEPTION '[input] as_of must be a date.';
  END IF;
  RETURN finance.read_certified_client_settlement(p_entity_id, p_as_of);
END;
$wrap$;

COMMENT ON FUNCTION public.read_client_settlement_balance(UUID, DATE) IS
  'Session-JWT staff read of the canonical certified settlement reader including cash allocation remaining. Does not expose schema finance.';

REVOKE ALL ON FUNCTION public.read_client_settlement_balance(UUID, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.read_client_settlement_balance(UUID, DATE) FROM anon, service_role;
GRANT EXECUTE ON FUNCTION public.read_client_settlement_balance(UUID, DATE) TO authenticated;
