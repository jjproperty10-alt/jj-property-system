-- ============================================================
-- finance.client_settlement_layer
-- LOCAL IMPLEMENTATION ONLY. Do not Apply to Production from this branch
-- without a separate Yossi authorization. No settlement-event data Apply.
--
-- Purpose:
--   Settlement-only overlay that can (a) exclude an existing cash transaction
--   from client FIFO and (b) record a non-cash settlement credit, without
--   touching public.transactions, review_status, transaction_exclusions,
--   cashbox, certified-ledger, RC3, v_contact_settlement_summary, or JJ P&L.
--
-- Safety:
--   - No INSERT/UPDATE/DELETE on public.transactions
--   - No CREATE OR REPLACE of public cash/RC3/certified/settlement-summary views
--   - No seed rows (no client, counterparty, transaction, or amount literals)
-- ============================================================

CREATE SCHEMA IF NOT EXISTS finance;

-- ── 1. Events ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS finance.client_settlement_events (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id                UUID NOT NULL REFERENCES lifecycle.entity_identity(id),
  counterparty_entity_id   UUID REFERENCES lifecycle.entity_identity(id),
  effective_date           DATE NOT NULL,
  event_type               TEXT NOT NULL
                           CHECK (event_type IN (
                             'noncash_settlement_credit',
                             'exclude_transaction_from_settlement',
                             'include_transaction_in_settlement'
                           )),
  settlement_amount        NUMERIC(12,2) NOT NULL CHECK (settlement_amount > 0),
  source_transaction_id    UUID REFERENCES public.transactions(id),
  reason                   TEXT NOT NULL,
  evidence_ref             TEXT NOT NULL,
  created_by               UUID NOT NULL,
  idempotency_key          TEXT NOT NULL UNIQUE,
  status                   TEXT NOT NULL DEFAULT 'open'
                           CHECK (status IN ('open', 'approved', 'applied', 'rejected', 'void')),
  opened_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_at               TIMESTAMPTZ,
  applied_by               UUID,
  CONSTRAINT cse_counterparty_not_self CHECK (
    counterparty_entity_id IS NULL OR entity_id <> counterparty_entity_id
  ),
  CONSTRAINT cse_source_by_type CHECK (
    (
      event_type = 'noncash_settlement_credit'
      AND source_transaction_id IS NULL
      AND counterparty_entity_id IS NOT NULL
    )
    OR
    (
      event_type IN (
        'exclude_transaction_from_settlement',
        'include_transaction_in_settlement'
      )
      AND source_transaction_id IS NOT NULL
      AND counterparty_entity_id IS NULL
    )
  ),
  CONSTRAINT cse_applied_pair CHECK (
    status <> 'applied' OR (applied_at IS NOT NULL AND applied_by IS NOT NULL)
  )
);

COMMENT ON TABLE finance.client_settlement_events IS
  'Client settlement overlay. Settlement-only. Never a cash ledger, never JJ P&L.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_cse_exclude_nonterminal
  ON finance.client_settlement_events (entity_id, source_transaction_id)
  WHERE event_type = 'exclude_transaction_from_settlement'
    AND status NOT IN ('rejected', 'void');

CREATE UNIQUE INDEX IF NOT EXISTS uq_cse_include_nonterminal
  ON finance.client_settlement_events (entity_id, source_transaction_id)
  WHERE event_type = 'include_transaction_in_settlement'
    AND status NOT IN ('rejected', 'void');

CREATE UNIQUE INDEX IF NOT EXISTS uq_cse_noncash_nonterminal
  ON finance.client_settlement_events (
    entity_id, counterparty_entity_id, effective_date, settlement_amount
  )
  WHERE event_type = 'noncash_settlement_credit'
    AND status NOT IN ('rejected', 'void');

CREATE UNIQUE INDEX IF NOT EXISTS uq_cse_applied_source_global
  ON finance.client_settlement_events (source_transaction_id)
  WHERE status = 'applied'
    AND source_transaction_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_cse_applied_include_or_exclude
  ON finance.client_settlement_events (entity_id, source_transaction_id)
  WHERE status = 'applied'
    AND event_type IN (
      'exclude_transaction_from_settlement',
      'include_transaction_in_settlement'
    );

CREATE INDEX IF NOT EXISTS idx_cse_entity_status_date
  ON finance.client_settlement_events (entity_id, status, effective_date);

CREATE INDEX IF NOT EXISTS idx_cse_idempotency
  ON finance.client_settlement_events (idempotency_key);

-- ── 2. Append-only audit log ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS finance.client_settlement_event_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID NOT NULL REFERENCES finance.client_settlement_events(id),
  action      TEXT NOT NULL,
  actor_id    UUID,
  at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  old_row     JSONB,
  new_row     JSONB
);

COMMENT ON TABLE finance.client_settlement_event_log IS
  'Append-only audit for client_settlement_events. Physical DELETE/UPDATE forbidden.';

CREATE INDEX IF NOT EXISTS idx_cse_log_event_at
  ON finance.client_settlement_event_log (event_id, at);

-- ── 3. Triggers ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION finance.trg_client_settlement_events_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO ''
AS $cse_fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'client_settlement_events forbids physical DELETE (id=%). Void instead.',
      OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.entity_id IS DISTINCT FROM OLD.entity_id
       OR NEW.counterparty_entity_id IS DISTINCT FROM OLD.counterparty_entity_id
       OR NEW.effective_date IS DISTINCT FROM OLD.effective_date
       OR NEW.event_type IS DISTINCT FROM OLD.event_type
       OR NEW.settlement_amount IS DISTINCT FROM OLD.settlement_amount
       OR NEW.source_transaction_id IS DISTINCT FROM OLD.source_transaction_id
       OR NEW.reason IS DISTINCT FROM OLD.reason
       OR NEW.evidence_ref IS DISTINCT FROM OLD.evidence_ref
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
       OR NEW.opened_at IS DISTINCT FROM OLD.opened_at
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
    THEN
      RAISE EXCEPTION 'client_settlement_events payload columns are immutable (id=%).',
        OLD.id
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$cse_fn$;

DROP TRIGGER IF EXISTS trg_client_settlement_events_guard ON finance.client_settlement_events;
CREATE TRIGGER trg_client_settlement_events_guard
  BEFORE UPDATE OR DELETE ON finance.client_settlement_events
  FOR EACH ROW EXECUTE FUNCTION finance.trg_client_settlement_events_guard();

CREATE OR REPLACE FUNCTION finance.trg_client_settlement_event_log_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO ''
AS $cse_fn$
BEGIN
  RAISE EXCEPTION 'client_settlement_event_log is append-only (P-ARCH-4). UPDATE and DELETE are prohibited.'
    USING ERRCODE = 'restrict_violation';
END;
$cse_fn$;

DROP TRIGGER IF EXISTS trg_client_settlement_event_log_guard ON finance.client_settlement_event_log;
CREATE TRIGGER trg_client_settlement_event_log_guard
  BEFORE UPDATE OR DELETE ON finance.client_settlement_event_log
  FOR EACH ROW EXECUTE FUNCTION finance.trg_client_settlement_event_log_guard();

CREATE OR REPLACE FUNCTION finance.trg_client_settlement_events_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO ''
AS $cse_fn$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO finance.client_settlement_event_log (event_id, action, actor_id, old_row, new_row)
    VALUES (NEW.id, 'insert', NEW.created_by, NULL, to_jsonb(NEW));
    RETURN NEW;
  END IF;

  INSERT INTO finance.client_settlement_event_log (event_id, action, actor_id, old_row, new_row)
  VALUES (
    NEW.id,
    CASE
      WHEN NEW.status IS DISTINCT FROM OLD.status THEN 'status_change'
      ELSE 'update'
    END,
    COALESCE(NEW.applied_by, NEW.created_by),
    to_jsonb(OLD),
    to_jsonb(NEW)
  );
  RETURN NEW;
END;
$cse_fn$;

DROP TRIGGER IF EXISTS trg_client_settlement_events_audit ON finance.client_settlement_events;
CREATE TRIGGER trg_client_settlement_events_audit
  AFTER INSERT OR UPDATE ON finance.client_settlement_events
  FOR EACH ROW EXECUTE FUNCTION finance.trg_client_settlement_events_audit();

-- ── 4. Applied view + FIFO credits ───────────────────────────────────────────

CREATE OR REPLACE VIEW finance.v_client_settlement_applied
  WITH (security_invoker = true)
AS
SELECT
  e.id,
  e.entity_id,
  e.counterparty_entity_id,
  e.effective_date,
  e.event_type,
  e.settlement_amount,
  e.source_transaction_id,
  e.reason,
  e.evidence_ref,
  e.created_by,
  e.idempotency_key,
  e.status,
  e.opened_at,
  e.created_at,
  e.applied_at,
  e.applied_by
FROM finance.client_settlement_events e
WHERE e.status = 'applied';

COMMENT ON VIEW finance.v_client_settlement_applied IS
  'Applied client-settlement events only. Not a cashbox or RC3 view.';

CREATE OR REPLACE FUNCTION finance.client_fifo_credits(
  p_entity_id UUID,
  p_as_of     DATE
)
RETURNS TABLE (
  event_id                  UUID,
  event_type                TEXT,
  settlement_amount         NUMERIC,
  effective_date            DATE,
  source_transaction_id     UUID,
  source_transaction_date   DATE,
  created_at                TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO ''
AS $cse_fn$
BEGIN
  IF p_entity_id IS NULL THEN
    RAISE EXCEPTION '[input] entity_id must be a UUID.';
  END IF;
  IF p_as_of IS NULL THEN
    RAISE EXCEPTION '[input] as_of must be a date.';
  END IF;

  RETURN QUERY
  SELECT
    e.id,
    e.event_type,
    e.settlement_amount,
    e.effective_date,
    e.source_transaction_id,
    t.date,
    e.created_at
  FROM finance.client_settlement_events e
  LEFT JOIN public.transactions t
    ON t.id = e.source_transaction_id
  WHERE e.entity_id = p_entity_id
    AND e.status = 'applied'
    AND e.effective_date <= p_as_of
    AND e.event_type IN (
      'noncash_settlement_credit',
      'include_transaction_in_settlement'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM finance.client_settlement_events x
      WHERE x.entity_id = e.entity_id
        AND x.status = 'applied'
        AND x.event_type = 'exclude_transaction_from_settlement'
        AND x.source_transaction_id IS NOT NULL
        AND x.source_transaction_id = e.source_transaction_id
    )
  ORDER BY
    e.effective_date ASC,
    t.date ASC NULLS LAST,
    e.created_at ASC,
    e.id ASC;
END;
$cse_fn$;

COMMENT ON FUNCTION finance.client_fifo_credits(UUID, DATE) IS
  'Applied FIFO credits for one client as-of a date. Exclude events are omitted. '
  'Does not read or write cashbox, RC3, or P&L.';

-- ── 5. RLS + grants ──────────────────────────────────────────────────────────

ALTER TABLE finance.client_settlement_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.client_settlement_events FORCE ROW LEVEL SECURITY;
ALTER TABLE finance.client_settlement_event_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.client_settlement_event_log FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deny_all_client_settlement_events ON finance.client_settlement_events;
CREATE POLICY deny_all_client_settlement_events
  ON finance.client_settlement_events AS RESTRICTIVE
  FOR ALL TO public
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS deny_all_client_settlement_event_log ON finance.client_settlement_event_log;
CREATE POLICY deny_all_client_settlement_event_log
  ON finance.client_settlement_event_log AS RESTRICTIVE
  FOR ALL TO public
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE finance.client_settlement_events FROM PUBLIC;
REVOKE ALL ON TABLE finance.client_settlement_events FROM anon, authenticated;
REVOKE ALL ON TABLE finance.client_settlement_event_log FROM PUBLIC;
REVOKE ALL ON TABLE finance.client_settlement_event_log FROM anon, authenticated;
REVOKE ALL ON finance.v_client_settlement_applied FROM PUBLIC;
REVOKE ALL ON finance.v_client_settlement_applied FROM anon, authenticated;

GRANT USAGE ON SCHEMA finance TO service_role;
GRANT USAGE ON SCHEMA finance TO authenticated;
GRANT SELECT ON TABLE finance.client_settlement_events TO service_role;
GRANT SELECT ON TABLE finance.client_settlement_event_log TO service_role;
GRANT SELECT ON finance.v_client_settlement_applied TO service_role;

-- ── 6. Authorization helper (postgres-only EXECUTE) ──────────────────────────

CREATE OR REPLACE FUNCTION finance.assert_client_settlement_authorized()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $cse_fn$
BEGIN
  RETURN public.require_jj_staff(ARRAY['ceo', 'finance_admin']);
END;
$cse_fn$;

REVOKE ALL ON FUNCTION finance.assert_client_settlement_authorized() FROM PUBLIC;
REVOKE ALL ON FUNCTION finance.assert_client_settlement_authorized() FROM anon, authenticated, service_role;

REVOKE ALL ON FUNCTION finance.trg_client_settlement_events_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION finance.trg_client_settlement_events_guard() FROM anon, authenticated, service_role;
REVOKE ALL ON FUNCTION finance.trg_client_settlement_event_log_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION finance.trg_client_settlement_event_log_guard() FROM anon, authenticated, service_role;
REVOKE ALL ON FUNCTION finance.trg_client_settlement_events_audit() FROM PUBLIC;
REVOKE ALL ON FUNCTION finance.trg_client_settlement_events_audit() FROM anon, authenticated, service_role;

REVOKE ALL ON FUNCTION finance.client_fifo_credits(UUID, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION finance.client_fifo_credits(UUID, DATE) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION finance.client_fifo_credits(UUID, DATE) TO service_role;

-- ── 7. Public staff RPCs ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.open_client_settlement_event(
  p_entity_id              UUID,
  p_counterparty_entity_id UUID,
  p_effective_date         DATE,
  p_event_type             TEXT,
  p_settlement_amount      NUMERIC,
  p_source_transaction_id  UUID,
  p_reason                 TEXT,
  p_evidence_ref           TEXT,
  p_idempotency_key        TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $cse_fn$
DECLARE
  v_actor UUID;
  v_existing finance.client_settlement_events%ROWTYPE;
  v_id UUID;
BEGIN
  v_actor := finance.assert_client_settlement_authorized();

  IF p_entity_id IS NULL THEN
    RAISE EXCEPTION '[input] entity_id must be a UUID.';
  END IF;
  IF p_effective_date IS NULL THEN
    RAISE EXCEPTION '[input] effective_date must be a date.';
  END IF;
  IF p_event_type IS NULL OR btrim(p_event_type) = '' THEN
    RAISE EXCEPTION '[input] event_type must be non-empty.';
  END IF;
  IF p_settlement_amount IS NULL OR p_settlement_amount <= 0 THEN
    RAISE EXCEPTION '[input] settlement_amount must be positive.';
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION '[input] reason must be non-empty.';
  END IF;
  IF p_evidence_ref IS NULL OR btrim(p_evidence_ref) = '' THEN
    RAISE EXCEPTION '[input] evidence_ref must be non-empty.';
  END IF;
  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION '[input] idempotency_key must be non-empty.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM lifecycle.entity_identity e WHERE e.id = p_entity_id) THEN
    RAISE EXCEPTION '[not_found] entity_id does not exist.';
  END IF;
  IF p_event_type = 'noncash_settlement_credit' THEN
    IF p_counterparty_entity_id IS NULL THEN
      RAISE EXCEPTION '[input] counterparty_entity_id is required for noncash_settlement_credit.';
    END IF;
    IF p_source_transaction_id IS NOT NULL THEN
      RAISE EXCEPTION '[denied] noncash_settlement_credit cannot reference a source transaction.';
    END IF;
    IF p_counterparty_entity_id = p_entity_id THEN
      RAISE EXCEPTION '[denied] counterparty_entity_id must differ from entity_id.';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM lifecycle.entity_identity e WHERE e.id = p_counterparty_entity_id
    ) THEN
      RAISE EXCEPTION '[not_found] counterparty_entity_id does not exist.';
    END IF;
  ELSIF p_event_type IN (
    'exclude_transaction_from_settlement',
    'include_transaction_in_settlement'
  ) THEN
    IF p_source_transaction_id IS NULL THEN
      RAISE EXCEPTION '[input] source_transaction_id is required for include/exclude.';
    END IF;
    IF p_counterparty_entity_id IS NOT NULL THEN
      RAISE EXCEPTION '[denied] include/exclude cannot set counterparty_entity_id.';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.transactions t WHERE t.id = p_source_transaction_id
    ) THEN
      RAISE EXCEPTION '[not_found] source transaction does not exist.';
    END IF;
  ELSE
    RAISE EXCEPTION '[input] event_type is not allowed.';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    872003, pg_catalog.hashtext('open:' || btrim(p_idempotency_key))
  );

  SELECT * INTO v_existing
  FROM finance.client_settlement_events e
  WHERE e.idempotency_key = btrim(p_idempotency_key)
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.entity_id IS DISTINCT FROM p_entity_id
       OR v_existing.counterparty_entity_id IS DISTINCT FROM p_counterparty_entity_id
       OR v_existing.effective_date IS DISTINCT FROM p_effective_date
       OR v_existing.event_type IS DISTINCT FROM p_event_type
       OR v_existing.settlement_amount IS DISTINCT FROM p_settlement_amount
       OR v_existing.source_transaction_id IS DISTINCT FROM p_source_transaction_id
    THEN
      RAISE EXCEPTION '[denied] idempotency_key already exists with a different payload.';
    END IF;
    RETURN jsonb_build_object(
      'id', v_existing.id,
      'status', v_existing.status,
      'replay', true,
      'inserted', false,
      'inserted_count', 0,
      'actor', v_actor
    );
  END IF;

  INSERT INTO finance.client_settlement_events (
    entity_id, counterparty_entity_id, effective_date, event_type,
    settlement_amount, source_transaction_id, reason, evidence_ref,
    created_by, idempotency_key, status
  ) VALUES (
    p_entity_id, p_counterparty_entity_id, p_effective_date, p_event_type,
    p_settlement_amount, p_source_transaction_id, btrim(p_reason), btrim(p_evidence_ref),
    v_actor, btrim(p_idempotency_key), 'open'
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'id', v_id,
    'status', 'open',
    'replay', false,
    'inserted', true,
    'inserted_count', 1,
    'actor', v_actor
  );
END;
$cse_fn$;

CREATE OR REPLACE FUNCTION public.approve_client_settlement_event(
  p_id     UUID,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $cse_fn$
DECLARE
  v_actor UUID;
  v_event finance.client_settlement_events%ROWTYPE;
BEGIN
  v_actor := finance.assert_client_settlement_authorized();

  IF p_id IS NULL THEN
    RAISE EXCEPTION '[input] id must be a UUID.';
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION '[input] reason must be non-empty.';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    872003, pg_catalog.hashtext('approve:' || p_id::text)
  );

  SELECT * INTO v_event
  FROM finance.client_settlement_events e
  WHERE e.id = p_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '[not_found] settlement event % does not exist.', p_id;
  END IF;
  IF v_event.status = 'approved' THEN
    RETURN jsonb_build_object(
      'id', v_event.id,
      'status', v_event.status,
      'replay', true,
      'inserted_count', 0,
      'actor', v_actor
    );
  END IF;
  IF v_event.status <> 'open' THEN
    RAISE EXCEPTION '[denied] event % is in status "%" and cannot be approved.',
      p_id, v_event.status;
  END IF;

  UPDATE finance.client_settlement_events
     SET status = 'approved'
   WHERE id = p_id;

  INSERT INTO finance.client_settlement_event_log (event_id, action, actor_id, old_row, new_row)
  VALUES (
    p_id,
    'approve_reason',
    v_actor,
    NULL,
    jsonb_build_object('reason', btrim(p_reason))
  );

  RETURN jsonb_build_object(
    'id', p_id,
    'status', 'approved',
    'replay', false,
    'inserted_count', 0,
    'actor', v_actor
  );
END;
$cse_fn$;

CREATE OR REPLACE FUNCTION public.apply_client_settlement_event(p_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $cse_fn$
DECLARE
  v_actor UUID;
  v_event finance.client_settlement_events%ROWTYPE;
  v_tx    public.transactions%ROWTYPE;
  v_other UUID;
BEGIN
  v_actor := finance.assert_client_settlement_authorized();

  IF p_id IS NULL THEN
    RAISE EXCEPTION '[input] id must be a UUID.';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    872003, pg_catalog.hashtext('apply:' || p_id::text)
  );

  SELECT * INTO v_event
  FROM finance.client_settlement_events e
  WHERE e.id = p_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '[not_found] settlement event % does not exist.', p_id;
  END IF;

  IF v_event.status = 'applied' THEN
    RETURN jsonb_build_object(
      'id', v_event.id,
      'status', v_event.status,
      'replay', true,
      'inserted_count', 0,
      'actor', v_actor
    );
  END IF;

  IF v_event.status <> 'approved' THEN
    RAISE EXCEPTION '[denied] event % is in status "%" and cannot be applied.',
      p_id, v_event.status;
  END IF;

  IF v_event.event_type IN (
    'exclude_transaction_from_settlement',
    'include_transaction_in_settlement'
  ) THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      872003, pg_catalog.hashtext('src:' || v_event.source_transaction_id::text)
    );

    SELECT * INTO v_tx
    FROM public.transactions t
    WHERE t.id = v_event.source_transaction_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION '[not_found] source transaction does not exist.';
    END IF;
    IF COALESCE(v_tx.is_deleted, false) = true THEN
      RAISE EXCEPTION '[denied] source transaction is deleted.';
    END IF;
    IF v_tx.review_status IS DISTINCT FROM 'active' AND v_tx.review_status IS NOT NULL THEN
      RAISE EXCEPTION '[denied] source transaction is not active.';
    END IF;
    IF v_tx.amount_eur IS DISTINCT FROM v_event.settlement_amount THEN
      RAISE EXCEPTION '[denied] source amount_eur does not equal settlement_amount.';
    END IF;

    SELECT e.id INTO v_other
    FROM finance.client_settlement_events e
    WHERE e.status = 'applied'
      AND e.source_transaction_id = v_event.source_transaction_id
      AND e.entity_id IS DISTINCT FROM v_event.entity_id
    LIMIT 1;
    IF v_other IS NOT NULL THEN
      RAISE EXCEPTION '[denied] source transaction is already used by another entity.';
    END IF;

    IF v_event.event_type = 'exclude_transaction_from_settlement' THEN
      SELECT e.id INTO v_other
      FROM finance.client_settlement_events e
      WHERE e.status = 'applied'
        AND e.entity_id = v_event.entity_id
        AND e.source_transaction_id = v_event.source_transaction_id
        AND e.event_type = 'include_transaction_in_settlement'
      LIMIT 1;
      IF v_other IS NOT NULL THEN
        RAISE EXCEPTION '[denied] applied include and exclude cannot coexist for the same entity/source.';
      END IF;
    END IF;

    IF v_event.event_type = 'include_transaction_in_settlement' THEN
      SELECT e.id INTO v_other
      FROM finance.client_settlement_events e
      WHERE e.status = 'applied'
        AND e.entity_id = v_event.entity_id
        AND e.source_transaction_id = v_event.source_transaction_id
        AND e.event_type = 'exclude_transaction_from_settlement'
      LIMIT 1;
      IF v_other IS NOT NULL THEN
        RAISE EXCEPTION '[denied] applied include and exclude cannot coexist for the same entity/source.';
      END IF;
    END IF;
  END IF;

  UPDATE finance.client_settlement_events
     SET status = 'applied',
         applied_at = now(),
         applied_by = v_actor
   WHERE id = p_id;

  RETURN jsonb_build_object(
    'id', p_id,
    'status', 'applied',
    'replay', false,
    'inserted_count', 0,
    'actor', v_actor
  );
END;
$cse_fn$;

CREATE OR REPLACE FUNCTION public.void_client_settlement_event(
  p_id     UUID,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $cse_fn$
DECLARE
  v_actor UUID;
  v_event finance.client_settlement_events%ROWTYPE;
BEGIN
  v_actor := finance.assert_client_settlement_authorized();

  IF p_id IS NULL THEN
    RAISE EXCEPTION '[input] id must be a UUID.';
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION '[input] reason must be non-empty.';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    872003, pg_catalog.hashtext('void:' || p_id::text)
  );

  SELECT * INTO v_event
  FROM finance.client_settlement_events e
  WHERE e.id = p_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '[not_found] settlement event % does not exist.', p_id;
  END IF;
  IF v_event.status = 'void' THEN
    RETURN jsonb_build_object(
      'id', v_event.id,
      'status', v_event.status,
      'replay', true,
      'inserted_count', 0,
      'actor', v_actor
    );
  END IF;

  UPDATE finance.client_settlement_events
     SET status = 'void'
   WHERE id = p_id;

  INSERT INTO finance.client_settlement_event_log (event_id, action, actor_id, old_row, new_row)
  VALUES (
    p_id,
    'void_reason',
    v_actor,
    NULL,
    jsonb_build_object('reason', btrim(p_reason), 'prior_status', v_event.status)
  );

  RETURN jsonb_build_object(
    'id', p_id,
    'status', 'void',
    'replay', false,
    'inserted_count', 0,
    'actor', v_actor
  );
END;
$cse_fn$;

REVOKE ALL ON FUNCTION public.open_client_settlement_event(UUID, UUID, DATE, TEXT, NUMERIC, UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.open_client_settlement_event(UUID, UUID, DATE, TEXT, NUMERIC, UUID, TEXT, TEXT, TEXT) FROM anon, service_role;
REVOKE ALL ON FUNCTION public.approve_client_settlement_event(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.approve_client_settlement_event(UUID, TEXT) FROM anon, service_role;
REVOKE ALL ON FUNCTION public.apply_client_settlement_event(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_client_settlement_event(UUID) FROM anon, service_role;
REVOKE ALL ON FUNCTION public.void_client_settlement_event(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.void_client_settlement_event(UUID, TEXT) FROM anon, service_role;

GRANT EXECUTE ON FUNCTION public.open_client_settlement_event(UUID, UUID, DATE, TEXT, NUMERIC, UUID, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_client_settlement_event(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_client_settlement_event(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.void_client_settlement_event(UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION public.open_client_settlement_event(UUID, UUID, DATE, TEXT, NUMERIC, UUID, TEXT, TEXT, TEXT) IS
  'Open a client-settlement event. SECURITY DEFINER, require_jj_staff ceo/finance_admin, authenticated EXECUTE only.';
COMMENT ON FUNCTION public.approve_client_settlement_event(UUID, TEXT) IS
  'Approve an open client-settlement event. Does not write public.transactions.';
COMMENT ON FUNCTION public.apply_client_settlement_event(UUID) IS
  'Apply an approved client-settlement event. Locks event and source row. Replay returns inserted_count=0.';
COMMENT ON FUNCTION public.void_client_settlement_event(UUID, TEXT) IS
  'Void a client-settlement event. Preserves the row and audit history. No DELETE.';
