-- ============================================================
-- public.bind_client_obligation_property UUID bridge
-- LOCAL IMPLEMENTATION ONLY. Do not Apply to Production
-- without a separate Yossi authorization.
--
-- Same signature. p_property_id stays public.properties.id.
-- Active EPA is verified through registry.property_external_identities
-- by UUID only: external_id = public.properties.id::text and
-- canonical_property_id = lifecycle.entity_property_associations.property_id.
-- No canonical_name, property_name, or fuzzy match.
-- Does not insert EPA. Does not change public.properties or
-- property_definitions. Does not write public.transactions.
-- ============================================================

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
  v_canonical UUID;
  v_bridge_count INTEGER;
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

  IF pg_catalog.to_regclass('lifecycle.entity_property_associations') IS NULL THEN
    RAISE EXCEPTION '[denied] lifecycle.entity_property_associations is required; binding fails closed.';
  END IF;
  IF pg_catalog.to_regclass('registry.property_external_identities') IS NULL THEN
    RAISE EXCEPTION '[denied] registry.property_external_identities is required; binding fails closed.';
  END IF;

  SELECT count(*)::integer
    INTO v_bridge_count
  FROM registry.property_external_identities b
  WHERE b.mapping_status = 'approved'
    AND b.external_entity_type = 'property'
    AND b.external_id = p_property_id::text
    AND b.canonical_property_id IS NOT NULL;

  IF v_bridge_count = 0 THEN
    RAISE EXCEPTION '[denied] no approved UUID bridge from this public.properties.id.';
  END IF;
  IF v_bridge_count > 1 THEN
    RAISE EXCEPTION '[denied] multiple approved UUID bridges for this public.properties.id.';
  END IF;

  SELECT b.canonical_property_id
    INTO v_canonical
  FROM registry.property_external_identities b
  WHERE b.mapping_status = 'approved'
    AND b.external_entity_type = 'property'
    AND b.external_id = p_property_id::text
    AND b.canonical_property_id IS NOT NULL;

  IF NOT EXISTS (
    SELECT 1
    FROM lifecycle.entity_property_associations a
    WHERE a.entity_id = p_entity_id
      AND a.property_id = v_canonical
      AND a.status = 'active'
  ) THEN
    RAISE EXCEPTION '[denied] no active entity_property_associations row for this entity and canonical property.';
  END IF;

  SELECT a.entity_id INTO v_other_entity
  FROM lifecycle.entity_property_associations a
  WHERE a.property_id = v_canonical
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

REVOKE ALL ON FUNCTION public.bind_client_obligation_property(UUID, UUID, UUID, UUID, INTEGER, TEXT, TEXT, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bind_client_obligation_property(UUID, UUID, UUID, UUID, INTEGER, TEXT, TEXT, TEXT, UUID) FROM anon, service_role;
GRANT EXECUTE ON FUNCTION public.bind_client_obligation_property(UUID, UUID, UUID, UUID, INTEGER, TEXT, TEXT, TEXT, UUID) TO authenticated;

COMMENT ON FUNCTION public.bind_client_obligation_property(UUID, UUID, UUID, UUID, INTEGER, TEXT, TEXT, TEXT, UUID) IS
  'Bind one certification line to public.properties.id. Active EPA is checked via the approved UUID bridge only.';
