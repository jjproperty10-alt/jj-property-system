-- ============================================================
-- finance.client_owner_level_obligations
-- LOCAL IMPLEMENTATION ONLY. Do not Apply to Production from this branch
-- without a separate Yossi authorization.
--
-- Additive exception for one component: owner_general_payment.
-- Property-scoped certification lines stay on
-- finance.client_settlement_certification_lines, which still requires
-- property_key and property_name. This table has no property column.
-- A row is accepted only when the source transaction has property_id IS NULL.
-- It reduces the client total once. It does not post cash, P&L, or a
-- property balance. FIFO keeps the source transaction date.
-- ============================================================

CREATE TABLE IF NOT EXISTS finance.client_owner_level_obligations (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id               UUID NOT NULL REFERENCES lifecycle.entity_identity(id),
  source_transaction_id   UUID NOT NULL,
  component_code          TEXT NOT NULL
                          CHECK (component_code = 'owner_general_payment'),
  effective_date          DATE NOT NULL,
  amount_due_to_jj        NUMERIC(12,2) NOT NULL
                          CHECK (amount_due_to_jj > 0),
  currency                TEXT NOT NULL DEFAULT 'EUR'
                          CHECK (currency = 'EUR'),
  status                  TEXT NOT NULL
                          CHECK (status IN ('applied', 'void')),
  reason                  TEXT NOT NULL CHECK (length(btrim(reason)) > 0),
  evidence_ref            TEXT NOT NULL CHECK (length(btrim(evidence_ref)) > 0),
  idempotency_key         TEXT NOT NULL UNIQUE,
  version                 INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_by              UUID NOT NULL,
  applied_by              UUID NOT NULL,
  applied_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  voided_by               UUID,
  voided_at               TIMESTAMPTZ,
  void_reason             TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT colo_void_pair CHECK (
    status <> 'void'
    OR (voided_by IS NOT NULL AND voided_at IS NOT NULL AND length(btrim(void_reason)) > 0)
  )
);

COMMENT ON TABLE finance.client_owner_level_obligations IS
  'Certified owner-level client payment. No property. Not cash, not property P&L. Positive amount_due_to_jj reduces what JJ owes the client once.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_colo_applied_source
  ON finance.client_owner_level_obligations (entity_id, source_transaction_id)
  WHERE status = 'applied';

CREATE INDEX IF NOT EXISTS idx_colo_entity_date
  ON finance.client_owner_level_obligations (entity_id, effective_date, status);

CREATE TABLE IF NOT EXISTS finance.client_owner_level_obligation_audit (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obligation_id UUID NOT NULL
                REFERENCES finance.client_owner_level_obligations(id),
  event         TEXT NOT NULL,
  actor         UUID,
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  old_row       JSONB,
  new_row       JSONB
);

COMMENT ON TABLE finance.client_owner_level_obligation_audit IS
  'Append-only audit for owner-level client obligations. No DELETE.';

CREATE INDEX IF NOT EXISTS idx_colo_audit_at
  ON finance.client_owner_level_obligation_audit (obligation_id, occurred_at);

CREATE OR REPLACE FUNCTION finance.trg_client_owner_level_obligations_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO ''
AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'client_owner_level_obligations forbids physical DELETE (id=%). Void instead.',
      OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'void' THEN
      RAISE EXCEPTION 'void owner-level obligations are immutable (id=%).', OLD.id
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.entity_id IS DISTINCT FROM OLD.entity_id
       OR NEW.source_transaction_id IS DISTINCT FROM OLD.source_transaction_id
       OR NEW.component_code IS DISTINCT FROM OLD.component_code
       OR NEW.effective_date IS DISTINCT FROM OLD.effective_date
       OR NEW.amount_due_to_jj IS DISTINCT FROM OLD.amount_due_to_jj
       OR NEW.currency IS DISTINCT FROM OLD.currency
       OR NEW.reason IS DISTINCT FROM OLD.reason
       OR NEW.evidence_ref IS DISTINCT FROM OLD.evidence_ref
       OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
       OR NEW.version IS DISTINCT FROM OLD.version
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.applied_by IS DISTINCT FROM OLD.applied_by
       OR NEW.applied_at IS DISTINCT FROM OLD.applied_at
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
    THEN
      RAISE EXCEPTION 'owner-level obligation identity columns are immutable (id=%).', OLD.id
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW.status IS DISTINCT FROM 'void' OR OLD.status IS DISTINCT FROM 'applied' THEN
      RAISE EXCEPTION 'owner-level obligation update is only applied to void (id=%).', OLD.id
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_client_owner_level_obligations_guard
  ON finance.client_owner_level_obligations;
CREATE TRIGGER trg_client_owner_level_obligations_guard
  BEFORE UPDATE OR DELETE ON finance.client_owner_level_obligations
  FOR EACH ROW EXECUTE FUNCTION finance.trg_client_owner_level_obligations_guard();

CREATE OR REPLACE FUNCTION finance.trg_client_owner_level_obligation_audit_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO ''
AS $fn$
BEGIN
  IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'client_owner_level_obligation_audit is append-only.'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_client_owner_level_obligation_audit_guard
  ON finance.client_owner_level_obligation_audit;
CREATE TRIGGER trg_client_owner_level_obligation_audit_guard
  BEFORE UPDATE OR DELETE ON finance.client_owner_level_obligation_audit
  FOR EACH ROW EXECUTE FUNCTION finance.trg_client_owner_level_obligation_audit_guard();

ALTER TABLE finance.client_owner_level_obligations ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.client_owner_level_obligations FORCE ROW LEVEL SECURITY;
ALTER TABLE finance.client_owner_level_obligation_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.client_owner_level_obligation_audit FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deny_all_client_owner_level_obligations
  ON finance.client_owner_level_obligations;
CREATE POLICY deny_all_client_owner_level_obligations
  ON finance.client_owner_level_obligations AS RESTRICTIVE
  FOR ALL TO public
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS deny_all_client_owner_level_obligation_audit
  ON finance.client_owner_level_obligation_audit;
CREATE POLICY deny_all_client_owner_level_obligation_audit
  ON finance.client_owner_level_obligation_audit AS RESTRICTIVE
  FOR ALL TO public
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE finance.client_owner_level_obligations FROM PUBLIC;
REVOKE ALL ON TABLE finance.client_owner_level_obligations FROM anon, authenticated, service_role;
REVOKE ALL ON TABLE finance.client_owner_level_obligation_audit FROM PUBLIC;
REVOKE ALL ON TABLE finance.client_owner_level_obligation_audit FROM anon, authenticated, service_role;

-- Bound property lines keep property_id. Owner-level rows are a separate
-- source_kind with property_id NULL and the source transaction date.
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
  pg_catalog.round((- l.amount_due_to_jj), 2) AS remaining_signed_amount,
  CASE
    WHEN (- l.amount_due_to_jj) > 0 THEN 'JJ_OWES_CLIENT'
    WHEN (- l.amount_due_to_jj) < 0 THEN 'CLIENT_OWES_JJ'
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
WHERE c.status = 'applied'
UNION ALL
SELECT
  o.entity_id,
  NULL::uuid AS property_id,
  o.id AS certification_id,
  o.version AS certification_version,
  o.id AS source_line_identity,
  'owner_general_payment'::text AS source_kind,
  o.effective_date,
  pg_catalog.round((- o.amount_due_to_jj), 2) AS original_signed_amount,
  pg_catalog.round((- o.amount_due_to_jj), 2) AS remaining_signed_amount,
  CASE
    WHEN (- o.amount_due_to_jj) > 0 THEN 'JJ_OWES_CLIENT'
    WHEN (- o.amount_due_to_jj) < 0 THEN 'CLIENT_OWES_JJ'
    ELSE 'SETTLED'
  END AS direction,
  pg_catalog.lower(pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        pg_catalog.jsonb_build_object(
          'obligation_id', o.id,
          'source_transaction_id', o.source_transaction_id,
          'component_code', o.component_code,
          'version', o.version,
          'amount_due_to_jj', pg_catalog.to_char(o.amount_due_to_jj, 'FM999999999990.00'),
          'effective_date', o.effective_date,
          'property_id', NULL
        )::text,
        'UTF8'
      ),
      'sha256'::text
    ),
    'hex'
  )) AS source_hash
FROM finance.client_owner_level_obligations o
WHERE o.status = 'applied';

COMMENT ON VIEW finance.v_client_property_obligation_register IS
  'Bound applied property lines plus applied owner_general_payment rows (property_id NULL). R-sign. Not RC3. Not property P&L.';

REVOKE ALL ON finance.v_client_property_obligation_register FROM PUBLIC;
REVOKE ALL ON finance.v_client_property_obligation_register FROM anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.apply_owner_level_client_obligation(
  p_entity_id              UUID,
  p_source_transaction_id  UUID,
  p_component_code         TEXT,
  p_amount_due_to_jj       NUMERIC,
  p_reason                 TEXT,
  p_evidence_ref           TEXT,
  p_idempotency_key        TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
DECLARE
  v_actor   UUID;
  v_tx      public.transactions%ROWTYPE;
  v_existing finance.client_owner_level_obligations%ROWTYPE;
  v_id      UUID;
  v_key     TEXT;
BEGIN
  v_actor := finance.assert_client_settlement_certification_authorized();

  IF p_entity_id IS NULL OR p_source_transaction_id IS NULL THEN
    RAISE EXCEPTION '[input] entity_id and source_transaction_id are required.';
  END IF;
  IF p_component_code IS NULL
     OR pg_catalog.btrim(p_component_code) IS DISTINCT FROM 'owner_general_payment' THEN
    RAISE EXCEPTION '[denied] a null-property certification is allowed only for component owner_general_payment.';
  END IF;
  IF p_reason IS NULL OR pg_catalog.btrim(p_reason) = ''
     OR p_evidence_ref IS NULL OR pg_catalog.btrim(p_evidence_ref) = ''
     OR p_idempotency_key IS NULL OR pg_catalog.btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION '[input] reason, evidence_ref, and idempotency_key must be non-empty.';
  END IF;
  PERFORM finance.assert_exact_cents(p_amount_due_to_jj, 'amount_due_to_jj');
  IF p_amount_due_to_jj <= 0 THEN
    RAISE EXCEPTION '[denied] owner_general_payment amount_due_to_jj must be positive.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM lifecycle.entity_identity e WHERE e.id = p_entity_id) THEN
    RAISE EXCEPTION '[not_found] entity_id does not exist.';
  END IF;

  SELECT * INTO v_tx
  FROM public.transactions t
  WHERE t.id = p_source_transaction_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION '[not_found] source transaction does not exist.';
  END IF;
  IF v_tx.property_id IS NOT NULL THEN
    RAISE EXCEPTION '[denied] owner_general_payment requires source transaction property_id IS NULL.';
  END IF;
  IF COALESCE(v_tx.is_deleted, false) THEN
    RAISE EXCEPTION '[denied] source transaction is deleted.';
  END IF;
  IF v_tx.review_status IS NOT NULL AND v_tx.review_status <> 'active' THEN
    RAISE EXCEPTION '[denied] source transaction is not active.';
  END IF;
  IF v_tx.date IS NULL THEN
    RAISE EXCEPTION '[denied] source transaction date is required.';
  END IF;
  IF v_tx.amount_eur IS DISTINCT FROM p_amount_due_to_jj THEN
    RAISE EXCEPTION '[denied] amount_due_to_jj must equal the source transaction amount_eur.';
  END IF;

  v_key := pg_catalog.btrim(p_idempotency_key);
  PERFORM pg_catalog.pg_advisory_xact_lock(872007, pg_catalog.hashtext('colo:' || v_key));
  PERFORM pg_catalog.pg_advisory_xact_lock(
    872007, pg_catalog.hashtext('colo-src:' || p_entity_id::text || ':' || p_source_transaction_id::text)
  );

  SELECT * INTO v_existing
  FROM finance.client_owner_level_obligations o
  WHERE o.idempotency_key = v_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.entity_id IS DISTINCT FROM p_entity_id
       OR v_existing.source_transaction_id IS DISTINCT FROM p_source_transaction_id
       OR v_existing.component_code IS DISTINCT FROM 'owner_general_payment'
       OR v_existing.amount_due_to_jj IS DISTINCT FROM p_amount_due_to_jj
       OR v_existing.effective_date IS DISTINCT FROM v_tx.date
       OR v_existing.reason IS DISTINCT FROM pg_catalog.btrim(p_reason)
       OR v_existing.evidence_ref IS DISTINCT FROM pg_catalog.btrim(p_evidence_ref)
    THEN
      RAISE EXCEPTION '[denied] idempotency_key already exists with a different payload.';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'id', v_existing.id,
      'status', v_existing.status,
      'replay', true,
      'inserted', false,
      'effective_date', v_existing.effective_date,
      'actor', v_actor
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM finance.client_owner_level_obligations o
    WHERE o.entity_id = p_entity_id
      AND o.source_transaction_id = p_source_transaction_id
      AND o.status = 'applied'
  ) THEN
    RAISE EXCEPTION '[denied] source transaction is already an applied owner-level obligation.';
  END IF;

  INSERT INTO finance.client_owner_level_obligations (
    entity_id, source_transaction_id, component_code, effective_date,
    amount_due_to_jj, status, reason, evidence_ref, idempotency_key,
    created_by, applied_by
  ) VALUES (
    p_entity_id, p_source_transaction_id, 'owner_general_payment', v_tx.date,
    p_amount_due_to_jj, 'applied', pg_catalog.btrim(p_reason),
    pg_catalog.btrim(p_evidence_ref), v_key, v_actor, v_actor
  )
  RETURNING id INTO v_id;

  INSERT INTO finance.client_owner_level_obligation_audit (
    obligation_id, event, actor, new_row
  )
  SELECT v_id, 'applied', v_actor, pg_catalog.to_jsonb(o)
  FROM finance.client_owner_level_obligations o
  WHERE o.id = v_id;

  RETURN pg_catalog.jsonb_build_object(
    'id', v_id,
    'status', 'applied',
    'replay', false,
    'inserted', true,
    'effective_date', v_tx.date,
    'actor', v_actor
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.void_owner_level_client_obligation(
  p_id            UUID,
  p_reason        TEXT,
  p_evidence_ref  TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
DECLARE
  v_actor UUID;
  v_row   finance.client_owner_level_obligations%ROWTYPE;
BEGIN
  v_actor := finance.assert_client_settlement_certification_authorized();
  IF p_id IS NULL THEN
    RAISE EXCEPTION '[input] id must be a UUID.';
  END IF;
  IF p_reason IS NULL OR pg_catalog.btrim(p_reason) = ''
     OR p_evidence_ref IS NULL OR pg_catalog.btrim(p_evidence_ref) = '' THEN
    RAISE EXCEPTION '[input] reason and evidence_ref must be non-empty.';
  END IF;

  SELECT * INTO v_row
  FROM finance.client_owner_level_obligations o
  WHERE o.id = p_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION '[not_found] owner-level obligation % does not exist.', p_id;
  END IF;
  IF v_row.status = 'void' THEN
    RAISE EXCEPTION '[denied] owner-level obligation % is already void.', p_id;
  END IF;

  UPDATE finance.client_owner_level_obligations
  SET status = 'void',
      voided_by = v_actor,
      voided_at = pg_catalog.now(),
      void_reason = pg_catalog.btrim(p_reason)
  WHERE id = p_id;

  INSERT INTO finance.client_owner_level_obligation_audit (
    obligation_id, event, actor, old_row, new_row
  )
  SELECT p_id, 'void', v_actor, pg_catalog.to_jsonb(v_row), pg_catalog.to_jsonb(o)
  FROM finance.client_owner_level_obligations o
  WHERE o.id = p_id;

  RETURN pg_catalog.jsonb_build_object(
    'id', p_id,
    'status', 'void',
    'actor', v_actor,
    'evidence_ref', pg_catalog.btrim(p_evidence_ref)
  );
END;
$fn$;

COMMENT ON FUNCTION public.apply_owner_level_client_obligation(
  UUID, UUID, TEXT, NUMERIC, TEXT, TEXT, TEXT
) IS
  'Certify one owner_general_payment from a source transaction with property_id NULL. Does not write public.transactions or a property balance.';

COMMENT ON FUNCTION public.void_owner_level_client_obligation(UUID, TEXT, TEXT) IS
  'Void an applied owner-level obligation. Restores it to the client total. Audit is kept. No DELETE.';

REVOKE ALL ON FUNCTION finance.trg_client_owner_level_obligations_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION finance.trg_client_owner_level_obligations_guard() FROM anon, authenticated, service_role;
REVOKE ALL ON FUNCTION finance.trg_client_owner_level_obligation_audit_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION finance.trg_client_owner_level_obligation_audit_guard() FROM anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.apply_owner_level_client_obligation(
  UUID, UUID, TEXT, NUMERIC, TEXT, TEXT, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_owner_level_client_obligation(
  UUID, UUID, TEXT, NUMERIC, TEXT, TEXT, TEXT
) FROM anon, service_role;
GRANT EXECUTE ON FUNCTION public.apply_owner_level_client_obligation(
  UUID, UUID, TEXT, NUMERIC, TEXT, TEXT, TEXT
) TO authenticated;

REVOKE ALL ON FUNCTION public.void_owner_level_client_obligation(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.void_owner_level_client_obligation(UUID, TEXT, TEXT) FROM anon, service_role;
GRANT EXECUTE ON FUNCTION public.void_owner_level_client_obligation(UUID, TEXT, TEXT) TO authenticated;
