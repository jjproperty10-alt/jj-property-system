-- ============================================================
-- lifecycle.identity_reassignment
-- LOCAL IMPLEMENTATION ONLY. Do not Apply to Production from this branch
-- without a separate Yossi authorization. No C1 data Apply.
--
-- Purpose:
--   Coordinated, audited entity_id reassignment across the three managed-property
--   identity tables. Settlement-neutral. No cash, no JJ P&L, no public.transactions.
--
-- Safety:
--   - entity_id is the only mutable identity column this RPC writes
--   - Audit is append-only; UPDATE/DELETE of audit rows is forbidden
--   - No production client/property/transaction literals
-- ============================================================

CREATE SCHEMA IF NOT EXISTS lifecycle;

-- ── 1. Operations header (idempotency) ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS lifecycle.identity_reassignment_operations (
  id                                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key                   TEXT NOT NULL UNIQUE,
  management_relationship_id        UUID NOT NULL,
  entity_property_association_id    UUID NOT NULL,
  service_engagement_id             UUID NOT NULL,
  expected_old_entity_id            UUID NOT NULL,
  new_entity_id                     UUID NOT NULL,
  expected_property_name            TEXT NOT NULL,
  expected_canonical_property_id    UUID NOT NULL,
  expected_service_type             TEXT NOT NULL,
  reason                            TEXT NOT NULL,
  evidence_ref                      TEXT NOT NULL,
  actor                             UUID NOT NULL,
  created_at                        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE lifecycle.identity_reassignment_operations IS
  'Idempotency header for managed-property identity reassignment. Append-only.';

-- ── 2. Append-only audit ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS lifecycle.identity_reassignment_audit (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id    UUID NOT NULL REFERENCES lifecycle.identity_reassignment_operations(id),
  table_name      TEXT NOT NULL,
  row_id          UUID NOT NULL,
  operation       TEXT NOT NULL CHECK (operation = 'entity_reassignment'),
  old_entity_id   UUID NOT NULL,
  new_entity_id   UUID NOT NULL,
  old_row         JSONB NOT NULL,
  new_row         JSONB NOT NULL,
  reason          TEXT NOT NULL,
  evidence_ref    TEXT NOT NULL,
  actor           UUID NOT NULL,
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  transaction_id  BIGINT NOT NULL,
  CONSTRAINT ira_old_new_distinct CHECK (old_entity_id <> new_entity_id)
);

COMMENT ON TABLE lifecycle.identity_reassignment_audit IS
  'Append-only identity-reassignment audit. Physical UPDATE/DELETE forbidden.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_ira_operation_table_row
  ON lifecycle.identity_reassignment_audit (operation_id, table_name, row_id);

CREATE INDEX IF NOT EXISTS idx_ira_operation_id
  ON lifecycle.identity_reassignment_audit (operation_id);

CREATE INDEX IF NOT EXISTS idx_ira_row
  ON lifecycle.identity_reassignment_audit (table_name, row_id);

-- ── 3. Guards ────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION lifecycle.trg_identity_reassignment_audit_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO ''
AS $ira_fn$
BEGIN
  RAISE EXCEPTION 'identity_reassignment_audit is append-only. UPDATE and DELETE are prohibited.'
    USING ERRCODE = 'restrict_violation';
END;
$ira_fn$;

DROP TRIGGER IF EXISTS trg_identity_reassignment_audit_guard ON lifecycle.identity_reassignment_audit;
CREATE TRIGGER trg_identity_reassignment_audit_guard
  BEFORE UPDATE OR DELETE ON lifecycle.identity_reassignment_audit
  FOR EACH ROW EXECUTE FUNCTION lifecycle.trg_identity_reassignment_audit_guard();

CREATE OR REPLACE FUNCTION lifecycle.trg_identity_reassignment_operations_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO ''
AS $ira_fn$
BEGIN
  RAISE EXCEPTION 'identity_reassignment_operations is append-only. UPDATE and DELETE are prohibited.'
    USING ERRCODE = 'restrict_violation';
END;
$ira_fn$;

DROP TRIGGER IF EXISTS trg_identity_reassignment_operations_guard ON lifecycle.identity_reassignment_operations;
CREATE TRIGGER trg_identity_reassignment_operations_guard
  BEFORE UPDATE OR DELETE ON lifecycle.identity_reassignment_operations
  FOR EACH ROW EXECUTE FUNCTION lifecycle.trg_identity_reassignment_operations_guard();

CREATE OR REPLACE FUNCTION lifecycle.trg_identity_reassignment_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO ''
AS $ira_fn$
DECLARE
  v_op       UUID;
  v_reason   TEXT;
  v_evidence TEXT;
  v_actor    UUID;
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;
  IF NEW.entity_id IS NOT DISTINCT FROM OLD.entity_id THEN
    RETURN NEW;
  END IF;

  v_op := NULLIF(pg_catalog.current_setting('jj.ira.operation_id', true), '')::uuid;
  v_reason := NULLIF(btrim(pg_catalog.current_setting('jj.ira.reason', true)), '');
  v_evidence := NULLIF(btrim(pg_catalog.current_setting('jj.ira.evidence_ref', true)), '');
  v_actor := NULLIF(pg_catalog.current_setting('jj.ira.actor', true), '')::uuid;

  IF v_op IS NULL OR v_reason IS NULL OR v_evidence IS NULL OR v_actor IS NULL THEN
    RAISE EXCEPTION '[denied] entity_id change on %.% requires identity-reassignment audit context.',
      TG_TABLE_SCHEMA, TG_TABLE_NAME
      USING ERRCODE = 'restrict_violation';
  END IF;

  INSERT INTO lifecycle.identity_reassignment_audit (
    operation_id, table_name, row_id, operation,
    old_entity_id, new_entity_id, old_row, new_row,
    reason, evidence_ref, actor, occurred_at, transaction_id
  ) VALUES (
    v_op,
    TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME,
    NEW.id,
    'entity_reassignment',
    OLD.entity_id,
    NEW.entity_id,
    to_jsonb(OLD),
    to_jsonb(NEW),
    v_reason,
    v_evidence,
    v_actor,
    now(),
    pg_catalog.txid_current()
  );

  RETURN NEW;
END;
$ira_fn$;

DROP TRIGGER IF EXISTS trg_ira_audit_mr ON lifecycle.management_relationship;
CREATE TRIGGER trg_ira_audit_mr
  AFTER UPDATE OF entity_id ON lifecycle.management_relationship
  FOR EACH ROW EXECUTE FUNCTION lifecycle.trg_identity_reassignment_audit();

DROP TRIGGER IF EXISTS trg_ira_audit_epa ON lifecycle.entity_property_associations;
CREATE TRIGGER trg_ira_audit_epa
  AFTER UPDATE OF entity_id ON lifecycle.entity_property_associations
  FOR EACH ROW EXECUTE FUNCTION lifecycle.trg_identity_reassignment_audit();

DROP TRIGGER IF EXISTS trg_ira_audit_se ON lifecycle.service_engagements;
CREATE TRIGGER trg_ira_audit_se
  AFTER UPDATE OF entity_id ON lifecycle.service_engagements
  FOR EACH ROW EXECUTE FUNCTION lifecycle.trg_identity_reassignment_audit();

-- ── 4. RLS + grants ──────────────────────────────────────────────────────────

ALTER TABLE lifecycle.identity_reassignment_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE lifecycle.identity_reassignment_operations FORCE ROW LEVEL SECURITY;
ALTER TABLE lifecycle.identity_reassignment_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE lifecycle.identity_reassignment_audit FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deny_all_identity_reassignment_operations ON lifecycle.identity_reassignment_operations;
CREATE POLICY deny_all_identity_reassignment_operations
  ON lifecycle.identity_reassignment_operations AS RESTRICTIVE
  FOR ALL TO public
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS deny_all_identity_reassignment_audit ON lifecycle.identity_reassignment_audit;
CREATE POLICY deny_all_identity_reassignment_audit
  ON lifecycle.identity_reassignment_audit AS RESTRICTIVE
  FOR ALL TO public
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE lifecycle.identity_reassignment_operations FROM PUBLIC;
REVOKE ALL ON TABLE lifecycle.identity_reassignment_operations FROM anon, authenticated;
REVOKE ALL ON TABLE lifecycle.identity_reassignment_audit FROM PUBLIC;
REVOKE ALL ON TABLE lifecycle.identity_reassignment_audit FROM anon, authenticated;

GRANT SELECT ON TABLE lifecycle.identity_reassignment_operations TO service_role;
GRANT SELECT ON TABLE lifecycle.identity_reassignment_audit TO service_role;

-- ── 5. Authorization helper (postgres-only EXECUTE) ──────────────────────────

CREATE OR REPLACE FUNCTION lifecycle.assert_identity_reassignment_authorized()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $ira_fn$
DECLARE
  v_actor UUID;
BEGIN
  v_actor := public.require_jj_staff(ARRAY['ceo', 'finance_admin']);
  IF v_actor IS NULL THEN
    RAISE EXCEPTION '[denied] actor must be a UUID.';
  END IF;
  RETURN v_actor;
END;
$ira_fn$;

REVOKE ALL ON FUNCTION lifecycle.assert_identity_reassignment_authorized() FROM PUBLIC;
REVOKE ALL ON FUNCTION lifecycle.assert_identity_reassignment_authorized() FROM anon, authenticated, service_role;
REVOKE ALL ON FUNCTION lifecycle.trg_identity_reassignment_audit() FROM PUBLIC;
REVOKE ALL ON FUNCTION lifecycle.trg_identity_reassignment_audit() FROM anon, authenticated, service_role;
REVOKE ALL ON FUNCTION lifecycle.trg_identity_reassignment_audit_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION lifecycle.trg_identity_reassignment_audit_guard() FROM anon, authenticated, service_role;
REVOKE ALL ON FUNCTION lifecycle.trg_identity_reassignment_operations_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION lifecycle.trg_identity_reassignment_operations_guard() FROM anon, authenticated, service_role;

-- ── 6. Public staff RPC ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.apply_managed_property_identity_reassignment(
  p_management_relationship_id     UUID,
  p_entity_property_association_id UUID,
  p_service_engagement_id          UUID,
  p_expected_old_entity_id         UUID,
  p_new_entity_id                  UUID,
  p_expected_property_name         TEXT,
  p_expected_canonical_property_id UUID,
  p_expected_service_type          TEXT,
  p_reason                         TEXT,
  p_evidence_ref                   TEXT,
  p_idempotency_key                TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $ira_fn$
DECLARE
  v_actor UUID;
  v_existing lifecycle.identity_reassignment_operations%ROWTYPE;
  v_operation_id UUID;
  v_mr lifecycle.management_relationship%ROWTYPE;
  v_epa lifecycle.entity_property_associations%ROWTYPE;
  v_se lifecycle.service_engagements%ROWTYPE;
  v_old_status TEXT;
  v_new_status TEXT;
  v_conflict UUID;
  v_n INTEGER;
  v_audit_n INTEGER;
BEGIN
  v_actor := lifecycle.assert_identity_reassignment_authorized();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION '[denied] actor must be a UUID.';
  END IF;

  IF p_management_relationship_id IS NULL
     OR p_entity_property_association_id IS NULL
     OR p_service_engagement_id IS NULL
     OR p_expected_old_entity_id IS NULL
     OR p_new_entity_id IS NULL
     OR p_expected_canonical_property_id IS NULL THEN
    RAISE EXCEPTION '[input] all identity UUIDs are required.';
  END IF;
  IF p_expected_property_name IS NULL OR btrim(p_expected_property_name) = '' THEN
    RAISE EXCEPTION '[input] expected_property_name must be non-empty.';
  END IF;
  IF p_expected_service_type IS NULL OR btrim(p_expected_service_type) = '' THEN
    RAISE EXCEPTION '[input] expected_service_type must be non-empty.';
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

  PERFORM pg_catalog.pg_advisory_xact_lock(
    872004,
    pg_catalog.hashtext(
      'identity-reassignment:' || btrim(p_idempotency_key)
    )
  );

  SELECT * INTO v_existing
  FROM lifecycle.identity_reassignment_operations o
  WHERE o.idempotency_key = btrim(p_idempotency_key)
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.management_relationship_id IS DISTINCT FROM p_management_relationship_id
       OR v_existing.entity_property_association_id IS DISTINCT FROM p_entity_property_association_id
       OR v_existing.service_engagement_id IS DISTINCT FROM p_service_engagement_id
       OR v_existing.expected_old_entity_id IS DISTINCT FROM p_expected_old_entity_id
       OR v_existing.new_entity_id IS DISTINCT FROM p_new_entity_id
       OR v_existing.expected_property_name IS DISTINCT FROM btrim(p_expected_property_name)
       OR v_existing.expected_canonical_property_id IS DISTINCT FROM p_expected_canonical_property_id
       OR v_existing.expected_service_type IS DISTINCT FROM btrim(p_expected_service_type)
       OR v_existing.reason IS DISTINCT FROM btrim(p_reason)
       OR v_existing.evidence_ref IS DISTINCT FROM btrim(p_evidence_ref) THEN
      RAISE EXCEPTION '[denied] idempotency_key already exists with a different payload.';
    END IF;
    RETURN jsonb_build_object(
      'operation_id', v_existing.id,
      'replay', true,
      'idempotent', true,
      'updated_count', 0,
      'audit_count', 0,
      'affected', jsonb_build_object(
        'management_relationship_id', v_existing.management_relationship_id,
        'entity_property_association_id', v_existing.entity_property_association_id,
        'service_engagement_id', v_existing.service_engagement_id
      ),
      'old_entity_id', v_existing.expected_old_entity_id,
      'new_entity_id', v_existing.new_entity_id,
      'actor', v_existing.actor
    );
  END IF;

  IF p_expected_old_entity_id = p_new_entity_id THEN
    RAISE EXCEPTION '[denied] old_entity_id and new_entity_id must differ.';
  END IF;

  SELECT * INTO v_mr
  FROM lifecycle.management_relationship r
  WHERE r.id = p_management_relationship_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION '[not_found] management_relationship does not exist.';
  END IF;

  SELECT * INTO v_epa
  FROM lifecycle.entity_property_associations a
  WHERE a.id = p_entity_property_association_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION '[not_found] entity_property_associations row does not exist.';
  END IF;

  SELECT * INTO v_se
  FROM lifecycle.service_engagements e
  WHERE e.id = p_service_engagement_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION '[not_found] service_engagements row does not exist.';
  END IF;

  IF v_mr.entity_id IS DISTINCT FROM p_expected_old_entity_id
     OR v_epa.entity_id IS DISTINCT FROM p_expected_old_entity_id
     OR v_se.entity_id IS DISTINCT FROM p_expected_old_entity_id THEN
    RAISE EXCEPTION '[denied] all three rows must currently share expected_old_entity_id.';
  END IF;
  IF v_mr.property_name IS DISTINCT FROM btrim(p_expected_property_name) THEN
    RAISE EXCEPTION '[denied] management_relationship property_name does not match.';
  END IF;
  IF v_epa.property_id IS DISTINCT FROM p_expected_canonical_property_id
     OR v_se.property_id IS DISTINCT FROM p_expected_canonical_property_id THEN
    RAISE EXCEPTION '[denied] EPA/SE canonical property_id does not match.';
  END IF;
  IF v_se.service_type IS DISTINCT FROM btrim(p_expected_service_type) THEN
    RAISE EXCEPTION '[denied] service_engagements service_type does not match.';
  END IF;

  SELECT e.status INTO v_old_status
  FROM lifecycle.entity_identity e
  WHERE e.id = p_expected_old_entity_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION '[not_found] expected_old_entity_id does not exist.';
  END IF;
  SELECT e.status INTO v_new_status
  FROM lifecycle.entity_identity e
  WHERE e.id = p_new_entity_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION '[not_found] new_entity_id does not exist.';
  END IF;
  IF v_old_status IS DISTINCT FROM 'active' OR v_new_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION '[denied] old and new entities must be active.';
  END IF;

  SELECT r.id INTO v_conflict
  FROM lifecycle.management_relationship r
  WHERE r.entity_id = p_new_entity_id
    AND r.property_name = btrim(p_expected_property_name)
    AND r.status = 'active'
    AND r.id IS DISTINCT FROM p_management_relationship_id
  LIMIT 1;
  IF v_conflict IS NOT NULL THEN
    RAISE EXCEPTION '[denied] conflicting active management_relationship exists for the new entity.';
  END IF;

  SELECT a.id INTO v_conflict
  FROM lifecycle.entity_property_associations a
  WHERE a.entity_id = p_new_entity_id
    AND a.property_id = p_expected_canonical_property_id
    AND a.status = 'active'
    AND a.id IS DISTINCT FROM p_entity_property_association_id
  LIMIT 1;
  IF v_conflict IS NOT NULL THEN
    RAISE EXCEPTION '[denied] conflicting active entity_property_association exists for the new entity.';
  END IF;

  SELECT e.id INTO v_conflict
  FROM lifecycle.service_engagements e
  WHERE e.entity_id = p_new_entity_id
    AND e.property_id = p_expected_canonical_property_id
    AND e.service_type = btrim(p_expected_service_type)
    AND e.status = 'active'
    AND e.id IS DISTINCT FROM p_service_engagement_id
  LIMIT 1;
  IF v_conflict IS NOT NULL THEN
    RAISE EXCEPTION '[denied] conflicting active service_engagement exists for the new entity.';
  END IF;

  INSERT INTO lifecycle.identity_reassignment_operations (
    idempotency_key,
    management_relationship_id, entity_property_association_id, service_engagement_id,
    expected_old_entity_id, new_entity_id,
    expected_property_name, expected_canonical_property_id, expected_service_type,
    reason, evidence_ref, actor
  ) VALUES (
    btrim(p_idempotency_key),
    p_management_relationship_id, p_entity_property_association_id, p_service_engagement_id,
    p_expected_old_entity_id, p_new_entity_id,
    btrim(p_expected_property_name), p_expected_canonical_property_id, btrim(p_expected_service_type),
    btrim(p_reason), btrim(p_evidence_ref), v_actor
  )
  RETURNING id INTO v_operation_id;

  PERFORM pg_catalog.set_config('jj.ira.operation_id', v_operation_id::text, true);
  PERFORM pg_catalog.set_config('jj.ira.reason', btrim(p_reason), true);
  PERFORM pg_catalog.set_config('jj.ira.evidence_ref', btrim(p_evidence_ref), true);
  PERFORM pg_catalog.set_config('jj.ira.actor', v_actor::text, true);

  UPDATE lifecycle.management_relationship
     SET entity_id = p_new_entity_id
   WHERE id = p_management_relationship_id
     AND entity_id = p_expected_old_entity_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION '[denied] management_relationship update row_count=% (expected 1).', v_n;
  END IF;

  UPDATE lifecycle.entity_property_associations
     SET entity_id = p_new_entity_id
   WHERE id = p_entity_property_association_id
     AND entity_id = p_expected_old_entity_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION '[denied] entity_property_associations update row_count=% (expected 1).', v_n;
  END IF;

  UPDATE lifecycle.service_engagements
     SET entity_id = p_new_entity_id
   WHERE id = p_service_engagement_id
     AND entity_id = p_expected_old_entity_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION '[denied] service_engagements update row_count=% (expected 1).', v_n;
  END IF;

  SELECT count(*) INTO v_audit_n
  FROM lifecycle.identity_reassignment_audit a
  WHERE a.operation_id = v_operation_id;
  IF v_audit_n IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION '[denied] expected 3 audit rows, found %.', v_audit_n;
  END IF;

  SELECT * INTO v_mr FROM lifecycle.management_relationship WHERE id = p_management_relationship_id;
  SELECT * INTO v_epa FROM lifecycle.entity_property_associations WHERE id = p_entity_property_association_id;
  SELECT * INTO v_se FROM lifecycle.service_engagements WHERE id = p_service_engagement_id;

  IF v_mr.entity_id IS DISTINCT FROM p_new_entity_id
     OR v_epa.entity_id IS DISTINCT FROM p_new_entity_id
     OR v_se.entity_id IS DISTINCT FROM p_new_entity_id THEN
    RAISE EXCEPTION '[denied] postcondition failed: rows do not all point to new_entity_id.';
  END IF;
  IF v_mr.property_name IS DISTINCT FROM btrim(p_expected_property_name)
     OR v_epa.property_id IS DISTINCT FROM p_expected_canonical_property_id
     OR v_se.property_id IS DISTINCT FROM p_expected_canonical_property_id
     OR v_se.service_type IS DISTINCT FROM btrim(p_expected_service_type) THEN
    RAISE EXCEPTION '[denied] postcondition failed: property identity changed.';
  END IF;

  RETURN jsonb_build_object(
    'operation_id', v_operation_id,
    'replay', false,
    'idempotent', false,
    'updated_count', 3,
    'audit_count', 3,
    'affected', jsonb_build_object(
      'management_relationship_id', p_management_relationship_id,
      'entity_property_association_id', p_entity_property_association_id,
      'service_engagement_id', p_service_engagement_id
    ),
    'old_entity_id', p_expected_old_entity_id,
    'new_entity_id', p_new_entity_id,
    'actor', v_actor
  );
END;
$ira_fn$;

REVOKE ALL ON FUNCTION public.apply_managed_property_identity_reassignment(UUID, UUID, UUID, UUID, UUID, TEXT, UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_managed_property_identity_reassignment(UUID, UUID, UUID, UUID, UUID, TEXT, UUID, TEXT, TEXT, TEXT, TEXT) FROM anon, service_role;
GRANT EXECUTE ON FUNCTION public.apply_managed_property_identity_reassignment(UUID, UUID, UUID, UUID, UUID, TEXT, UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION public.apply_managed_property_identity_reassignment(UUID, UUID, UUID, UUID, UUID, TEXT, UUID, TEXT, TEXT, TEXT, TEXT) IS
  'Atomic managed-property identity reassignment. SECURITY DEFINER, require_jj_staff ceo/finance_admin, authenticated EXECUTE only. Writes entity_id only.';
