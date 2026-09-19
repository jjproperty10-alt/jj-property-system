-- ============================================================
-- finance.client_obligation_property_bindings
-- + remaining-obligation register + read-only FIFO preview
-- LOCAL IMPLEMENTATION ONLY. Do not Apply to Production from this branch
-- without a separate Yossi authorization.
--
-- Narrow additive Finance Architecture Freeze opening (Yossi, Phase 2D.2).
-- Does not write public.transactions. Does not alter RC3 / certified-ledger
-- view definitions. Does not post cash. Does not seed Tamir.
-- ============================================================

CREATE SCHEMA IF NOT EXISTS finance;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS finance.client_obligation_property_bindings (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  certification_id        UUID NOT NULL
                          REFERENCES finance.client_settlement_certifications(id),
  certification_line_id   UUID NOT NULL
                          REFERENCES finance.client_settlement_certification_lines(id),
  entity_id               UUID NOT NULL
                          REFERENCES lifecycle.entity_identity(id),
  property_id             UUID NOT NULL
                          REFERENCES public.properties(id),
  certification_version   INTEGER NOT NULL CHECK (certification_version >= 1),
  property_key            TEXT NOT NULL CHECK (length(btrim(property_key)) > 0),
  status                  TEXT NOT NULL
                          CHECK (status IN ('active', 'superseded', 'void')),
  reason                  TEXT NOT NULL CHECK (length(btrim(reason)) > 0),
  evidence_ref            TEXT NOT NULL CHECK (length(btrim(evidence_ref)) > 0),
  idempotency_key         TEXT NOT NULL UNIQUE,
  created_by              UUID NOT NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  supersedes_id           UUID REFERENCES finance.client_obligation_property_bindings(id),
  superseded_by           UUID REFERENCES finance.client_obligation_property_bindings(id),
  voided_by               UUID,
  voided_at               TIMESTAMPTZ,
  CONSTRAINT copb_supersedes_not_self CHECK (
    supersedes_id IS NULL OR supersedes_id <> id
  ),
  CONSTRAINT copb_void_pair CHECK (
    status <> 'void'
    OR (voided_by IS NOT NULL AND voided_at IS NOT NULL)
  )
);

COMMENT ON TABLE finance.client_obligation_property_bindings IS
  'Append-only canonical binding of a certified opening line UUID to public.properties.id. Never cash, never P&L, never RC3 rewrite.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_copb_active_line
  ON finance.client_obligation_property_bindings (certification_line_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_copb_entity_status
  ON finance.client_obligation_property_bindings (entity_id, status);

CREATE INDEX IF NOT EXISTS idx_copb_property
  ON finance.client_obligation_property_bindings (property_id);

CREATE TABLE IF NOT EXISTS finance.client_obligation_property_binding_audit (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  binding_id    UUID NOT NULL
                REFERENCES finance.client_obligation_property_bindings(id),
  event         TEXT NOT NULL,
  actor         UUID,
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  old_row       JSONB,
  new_row       JSONB
);

COMMENT ON TABLE finance.client_obligation_property_binding_audit IS
  'Immutable append-only audit for obligation property bindings.';

CREATE INDEX IF NOT EXISTS idx_copb_audit_binding_at
  ON finance.client_obligation_property_binding_audit (binding_id, occurred_at);

CREATE OR REPLACE FUNCTION finance.trg_client_obligation_property_bindings_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO ''
AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'client_obligation_property_bindings forbids physical DELETE (id=%).',
      OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.certification_id IS DISTINCT FROM OLD.certification_id
       OR NEW.certification_line_id IS DISTINCT FROM OLD.certification_line_id
       OR NEW.entity_id IS DISTINCT FROM OLD.entity_id
       OR NEW.property_id IS DISTINCT FROM OLD.property_id
       OR NEW.certification_version IS DISTINCT FROM OLD.certification_version
       OR NEW.property_key IS DISTINCT FROM OLD.property_key
       OR NEW.reason IS DISTINCT FROM OLD.reason
       OR NEW.evidence_ref IS DISTINCT FROM OLD.evidence_ref
       OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.supersedes_id IS DISTINCT FROM OLD.supersedes_id
    THEN
      RAISE EXCEPTION 'client_obligation_property_bindings identity columns are immutable (id=%).',
        OLD.id
        USING ERRCODE = 'restrict_violation';
    END IF;

    IF OLD.status = 'void' OR OLD.status = 'superseded' THEN
      IF NOT (
        OLD.status = 'superseded'
        AND NEW.status = 'superseded'
        AND NEW.superseded_by IS NOT NULL
        AND OLD.superseded_by IS NULL
      ) THEN
        RAISE EXCEPTION 'terminal obligation bindings are immutable (id=%).', OLD.id
          USING ERRCODE = 'restrict_violation';
      END IF;
    ELSIF OLD.status = 'active' THEN
      IF NEW.status NOT IN ('superseded', 'void') THEN
        RAISE EXCEPTION 'client_obligation_property_bindings status % cannot become % (id=%).',
          OLD.status, NEW.status, OLD.id
          USING ERRCODE = 'restrict_violation';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_client_obligation_property_bindings_guard
  ON finance.client_obligation_property_bindings;
CREATE TRIGGER trg_client_obligation_property_bindings_guard
  BEFORE UPDATE OR DELETE ON finance.client_obligation_property_bindings
  FOR EACH ROW EXECUTE FUNCTION finance.trg_client_obligation_property_bindings_guard();

CREATE OR REPLACE FUNCTION finance.trg_client_obligation_property_binding_audit_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO ''
AS $fn$
BEGIN
  RAISE EXCEPTION 'client_obligation_property_binding_audit is append-only.'
    USING ERRCODE = 'restrict_violation';
END;
$fn$;

DROP TRIGGER IF EXISTS trg_client_obligation_property_binding_audit_guard
  ON finance.client_obligation_property_binding_audit;
CREATE TRIGGER trg_client_obligation_property_binding_audit_guard
  BEFORE UPDATE OR DELETE ON finance.client_obligation_property_binding_audit
  FOR EACH ROW EXECUTE FUNCTION finance.trg_client_obligation_property_binding_audit_guard();

ALTER TABLE finance.client_obligation_property_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.client_obligation_property_bindings FORCE ROW LEVEL SECURITY;
ALTER TABLE finance.client_obligation_property_binding_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.client_obligation_property_binding_audit FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deny_all_client_obligation_property_bindings
  ON finance.client_obligation_property_bindings;
CREATE POLICY deny_all_client_obligation_property_bindings
  ON finance.client_obligation_property_bindings AS RESTRICTIVE
  FOR ALL TO public
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS deny_all_client_obligation_property_binding_audit
  ON finance.client_obligation_property_binding_audit;
CREATE POLICY deny_all_client_obligation_property_binding_audit
  ON finance.client_obligation_property_binding_audit AS RESTRICTIVE
  FOR ALL TO public
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE finance.client_obligation_property_bindings FROM PUBLIC;
REVOKE ALL ON TABLE finance.client_obligation_property_bindings FROM anon, authenticated, service_role;
REVOKE ALL ON TABLE finance.client_obligation_property_binding_audit FROM PUBLIC;
REVOKE ALL ON TABLE finance.client_obligation_property_binding_audit FROM anon, authenticated, service_role;

-- R = -amount_due_to_jj. Bound applied opening lines only.
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
WHERE c.status = 'applied';

COMMENT ON VIEW finance.v_client_property_obligation_register IS
  'Bound APPLIED certified opening obligations only (void/draft/superseded headers excluded). R-sign. Not an RC3 replacement.';

CREATE OR REPLACE VIEW finance.v_client_obligation_unbound_lines
  WITH (security_invoker = true)
AS
SELECT
  c.entity_id,
  c.id AS certification_id,
  c.version AS certification_version,
  l.id AS source_line_identity,
  l.property_key,
  l.line_order,
  c.as_of AS effective_date,
  pg_catalog.round((- l.amount_due_to_jj), 2) AS original_signed_amount,
  'unbound_certification_line'::text AS blocked_code
FROM finance.client_settlement_certification_lines l
JOIN finance.client_settlement_certifications c
  ON c.id = l.certification_id
WHERE c.status = 'applied'
  AND NOT EXISTS (
    SELECT 1
    FROM finance.client_obligation_property_bindings b
    WHERE b.certification_line_id = l.id
      AND b.status = 'active'
  );

COMMENT ON VIEW finance.v_client_obligation_unbound_lines IS
  'Applied certified opening lines with no active canonical property binding. Not allocatable.';

REVOKE ALL ON finance.v_client_property_obligation_register FROM PUBLIC;
REVOKE ALL ON finance.v_client_property_obligation_register FROM anon, authenticated, service_role;
REVOKE ALL ON finance.v_client_obligation_unbound_lines FROM PUBLIC;
REVOKE ALL ON finance.v_client_obligation_unbound_lines FROM anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.bind_client_obligation_property(
  p_certification_id        UUID,
  p_certification_line_id   UUID,
  p_entity_id               UUID,
  p_property_id             UUID,
  p_expected_certification_version INTEGER,
  p_reason                  TEXT,
  p_evidence_ref            TEXT,
  p_idempotency_key         TEXT,
  p_supersedes_id           UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
DECLARE
  v_actor UUID;
  v_cert finance.client_settlement_certifications%ROWTYPE;
  v_line finance.client_settlement_certification_lines%ROWTYPE;
  v_existing finance.client_obligation_property_bindings%ROWTYPE;
  v_prior finance.client_obligation_property_bindings%ROWTYPE;
  v_id UUID;
  v_other_entity UUID;
BEGIN
  IF NOT finance.is_active_jj_staff() THEN
    RAISE EXCEPTION '[jj_auth] Active staff required.';
  END IF;
  v_actor := public.require_jj_staff(ARRAY['ceo', 'finance_admin']);

  IF p_certification_id IS NULL OR p_certification_line_id IS NULL
     OR p_entity_id IS NULL OR p_property_id IS NULL THEN
    RAISE EXCEPTION '[input] certification, line, entity, and property UUIDs are required.';
  END IF;
  IF p_expected_certification_version IS NULL OR p_expected_certification_version < 1 THEN
    RAISE EXCEPTION '[input] expected certification version must be >= 1.';
  END IF;
  IF p_reason IS NULL OR pg_catalog.btrim(p_reason) = '' THEN
    RAISE EXCEPTION '[input] reason must be non-empty.';
  END IF;
  IF p_evidence_ref IS NULL OR pg_catalog.btrim(p_evidence_ref) = '' THEN
    RAISE EXCEPTION '[input] evidence_ref must be non-empty.';
  END IF;
  IF p_idempotency_key IS NULL OR pg_catalog.btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION '[input] idempotency_key must be non-empty.';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    872006, pg_catalog.hashtext(p_certification_line_id::text)
  );

  SELECT * INTO v_existing
  FROM finance.client_obligation_property_bindings b
  WHERE b.idempotency_key = pg_catalog.btrim(p_idempotency_key)
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.certification_id IS DISTINCT FROM p_certification_id
       OR v_existing.certification_line_id IS DISTINCT FROM p_certification_line_id
       OR v_existing.entity_id IS DISTINCT FROM p_entity_id
       OR v_existing.property_id IS DISTINCT FROM p_property_id
       OR v_existing.certification_version IS DISTINCT FROM p_expected_certification_version
    THEN
      RAISE EXCEPTION '[denied] idempotency_key already exists with a different payload.';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'id', v_existing.id,
      'status', v_existing.status,
      'replay', true,
      'inserted_count', 0,
      'actor', v_actor
    );
  END IF;

  SELECT * INTO v_cert
  FROM finance.client_settlement_certifications c
  WHERE c.id = p_certification_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '[not_found] certification does not exist.';
  END IF;
  IF v_cert.status <> 'applied' THEN
    RAISE EXCEPTION '[denied] certification % is not applied (status=%).',
      p_certification_id, v_cert.status;
  END IF;
  IF v_cert.version IS DISTINCT FROM p_expected_certification_version THEN
    RAISE EXCEPTION '[stale] certification version % does not match expected %.',
      v_cert.version, p_expected_certification_version;
  END IF;
  IF v_cert.entity_id IS DISTINCT FROM p_entity_id THEN
    RAISE EXCEPTION '[denied] entity_id does not match the certification entity.';
  END IF;

  SELECT * INTO v_line
  FROM finance.client_settlement_certification_lines l
  WHERE l.id = p_certification_line_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '[not_found] certification line does not exist.';
  END IF;
  IF v_line.certification_id IS DISTINCT FROM p_certification_id THEN
    RAISE EXCEPTION '[denied] line does not belong to the given certification.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.properties p WHERE p.id = p_property_id) THEN
    RAISE EXCEPTION '[not_found] property_id does not exist in public.properties.';
  END IF;

  -- Canonical assignment: lifecycle.entity_property_associations
  -- (20260809_001_p1_schema_foundation.sql). Required row:
  --   entity_id + property_id + status = 'active'
  -- draft/inactive do not qualify. Missing row fails closed.
  -- Do not use lifecycle.management_relationship.property_name.
  IF pg_catalog.to_regclass('lifecycle.entity_property_associations') IS NULL THEN
    RAISE EXCEPTION '[denied] lifecycle.entity_property_associations is required; binding fails closed.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM lifecycle.entity_property_associations a
    WHERE a.entity_id = p_entity_id
      AND a.property_id = p_property_id
      AND a.status = 'active'
  ) THEN
    RAISE EXCEPTION '[denied] no active entity_property_associations row for this entity_id and property_id.';
  END IF;

  SELECT a.entity_id INTO v_other_entity
  FROM lifecycle.entity_property_associations a
  WHERE a.property_id = p_property_id
    AND a.status = 'active'
    AND a.entity_id IS DISTINCT FROM p_entity_id
  LIMIT 1;
  IF v_other_entity IS NOT NULL THEN
    RAISE EXCEPTION '[denied] property is assigned to a different entity in entity_property_associations.';
  END IF;

  SELECT * INTO v_prior
  FROM finance.client_obligation_property_bindings b
  WHERE b.certification_line_id = p_certification_line_id
    AND b.status = 'active'
  FOR UPDATE;

  IF FOUND THEN
    IF p_supersedes_id IS NULL THEN
      RAISE EXCEPTION '[denied] an active binding already exists for this line; pass supersedes_id to remap.';
    END IF;
    IF v_prior.id IS DISTINCT FROM p_supersedes_id THEN
      RAISE EXCEPTION '[denied] supersedes_id does not match the active binding.';
    END IF;
    IF v_prior.property_id = p_property_id AND v_prior.entity_id = p_entity_id THEN
      RAISE EXCEPTION '[denied] remapping requires a different canonical property_id.';
    END IF;
  ELSIF p_supersedes_id IS NOT NULL THEN
    RAISE EXCEPTION '[denied] supersedes_id was provided but no active binding exists.';
  END IF;

  IF p_supersedes_id IS NOT NULL THEN
    UPDATE finance.client_obligation_property_bindings
       SET status = 'superseded'
     WHERE id = p_supersedes_id
       AND status = 'active';
    IF NOT FOUND THEN
      RAISE EXCEPTION '[denied] active binding % could not be superseded.', p_supersedes_id;
    END IF;
  END IF;

  INSERT INTO finance.client_obligation_property_bindings (
    certification_id, certification_line_id, entity_id, property_id,
    certification_version, property_key, status, reason, evidence_ref,
    idempotency_key, created_by, supersedes_id
  ) VALUES (
    p_certification_id,
    p_certification_line_id,
    p_entity_id,
    p_property_id,
    p_expected_certification_version,
    v_line.property_key,
    'active',
    pg_catalog.btrim(p_reason),
    pg_catalog.btrim(p_evidence_ref),
    pg_catalog.btrim(p_idempotency_key),
    v_actor,
    p_supersedes_id
  )
  RETURNING id INTO v_id;

  IF p_supersedes_id IS NOT NULL THEN
    UPDATE finance.client_obligation_property_bindings
       SET superseded_by = v_id
     WHERE id = p_supersedes_id
       AND status = 'superseded'
       AND superseded_by IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION '[denied] superseded binding % could not record successor.', p_supersedes_id;
    END IF;
  END IF;

  INSERT INTO finance.client_obligation_property_binding_audit (
    binding_id, event, actor, old_row, new_row
  ) VALUES (
    v_id,
    CASE WHEN p_supersedes_id IS NULL THEN 'bind' ELSE 'supersede' END,
    v_actor,
    CASE WHEN p_supersedes_id IS NULL THEN NULL ELSE pg_catalog.to_jsonb(v_prior) END,
    pg_catalog.jsonb_build_object(
      'id', v_id,
      'certification_line_id', p_certification_line_id,
      'property_id', p_property_id
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'id', v_id,
    'status', 'active',
    'replay', false,
    'inserted_count', 1,
    'actor', v_actor
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION finance.client_obligation_fifo_sha256(p_snapshot jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path TO ''
AS $fn$
  SELECT pg_catalog.lower(
    pg_catalog.encode(
      extensions.digest(
        pg_catalog.convert_to(p_snapshot::text, 'UTF8'),
        'sha256'::text
      ),
      'hex'
    )
  );
$fn$;

COMMENT ON FUNCTION finance.client_obligation_fifo_sha256(jsonb) IS
  'SHA-256 hex of one canonical jsonb::text snapshot. Not a browser RPC.';

REVOKE ALL ON FUNCTION finance.client_obligation_fifo_sha256(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION finance.client_obligation_fifo_sha256(jsonb) FROM anon, authenticated, service_role;

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
  v_policy TEXT := 'client-obligation-fifo-v2';
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
  ELSIF v_remain > 0 THEN
    v_blocked := 'unapplied_remainder';
  END IF;

  IF pg_catalog.round(v_allocated + v_remain, 2) IS DISTINCT FROM p_payment_amount THEN
    RAISE EXCEPTION '[invariant] allocated_total + unapplied_remainder must equal payment_amount.';
  END IF;

  v_snapshot := pg_catalog.jsonb_build_object(
    'policy_version', v_policy,
    'entity_id', p_entity_id,
    'direction', p_direction,
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
    'direction', p_direction,
    'amount', p_payment_amount,
    'as_of', p_as_of,
    'balance_before_R', v_before,
    'balance_after_R', v_after,
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

REVOKE ALL ON FUNCTION public.bind_client_obligation_property(UUID, UUID, UUID, UUID, INTEGER, TEXT, TEXT, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bind_client_obligation_property(UUID, UUID, UUID, UUID, INTEGER, TEXT, TEXT, TEXT, UUID) FROM anon, service_role;
GRANT EXECUTE ON FUNCTION public.bind_client_obligation_property(UUID, UUID, UUID, UUID, INTEGER, TEXT, TEXT, TEXT, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.preview_client_obligation_fifo(UUID, TEXT, NUMERIC, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.preview_client_obligation_fifo(UUID, TEXT, NUMERIC, DATE) FROM anon, service_role;
GRANT EXECUTE ON FUNCTION public.preview_client_obligation_fifo(UUID, TEXT, NUMERIC, DATE) TO authenticated;

REVOKE ALL ON FUNCTION finance.trg_client_obligation_property_bindings_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION finance.trg_client_obligation_property_bindings_guard() FROM anon, authenticated, service_role;
REVOKE ALL ON FUNCTION finance.trg_client_obligation_property_binding_audit_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION finance.trg_client_obligation_property_binding_audit_guard() FROM anon, authenticated, service_role;
REVOKE ALL ON FUNCTION finance.client_obligation_fifo_sha256(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION finance.client_obligation_fifo_sha256(jsonb) FROM anon, authenticated, service_role;
