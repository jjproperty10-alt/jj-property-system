-- Agent 3 — Canonical Party Resolver Convergence (ADDITIVE)
-- Authorization: Yossi V1 Audit Decision H.3 (2026-08-15)
-- Canonical party authority: registry.parties, bridged via registry.external_identities.
--
-- SAFETY CONTRACT:
--   * Creates a NEW function only. No changes to any table/view/row.
--   * Identity answers WHO. Lifecycle keeps BUSINESS-STATE/relationship (kept separate — not merged here).
--   * Does NOT re-point the ADR-006 Owner-Room resolver (identityResolverService.getAllVerifiedOwners),
--     because that changes what Agent 2's Owner Room consumes -> tracked as CROSS-AGENT DEPENDENCY.
--   * Fail-closed. No fuzzy matching.

CREATE OR REPLACE FUNCTION registry.resolve_party(p_input text, p_source_system text DEFAULT NULL)
RETURNS TABLE(status text, party_id uuid, canonical_name text, party_type text, candidates text[])
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, registry AS $fn$
DECLARE
  v_norm text := lower(btrim(p_input));
  v_is_uuid boolean := p_input ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  v_ids uuid[];
BEGIN
  IF p_input IS NULL OR btrim(p_input) = '' THEN
    RETURN QUERY SELECT 'not_found'::text, NULL::uuid, NULL::text, NULL::text, NULL::text[]; RETURN;
  END IF;

  IF p_source_system IS NOT NULL THEN
    SELECT array_agg(DISTINCT ei.canonical_id) INTO v_ids
    FROM registry.external_identities ei
    WHERE ei.source_system = p_source_system AND ei.external_id = p_input
      AND ei.mapping_status = 'approved' AND ei.canonical_type IN ('party','company')
      AND ei.canonical_id IS NOT NULL;
  ELSE
    SELECT array_agg(DISTINCT cid) INTO v_ids FROM (
      SELECT p.party_id AS cid FROM registry.parties p WHERE v_is_uuid AND p.party_id = p_input::uuid
      UNION
      SELECT p.party_id FROM registry.parties p WHERE v_is_uuid AND p.contact_ref = p_input::uuid
      UNION
      SELECT ei.canonical_id FROM registry.external_identities ei
        WHERE ei.external_id = p_input AND ei.mapping_status = 'approved'
          AND ei.canonical_type IN ('party','company') AND ei.canonical_id IS NOT NULL
      UNION
      SELECT p.party_id FROM registry.parties p WHERE NOT v_is_uuid AND lower(btrim(p.canonical_name)) = v_norm
      UNION
      SELECT pa.party_id FROM registry.party_aliases pa WHERE NOT v_is_uuid AND lower(btrim(pa.alias)) = v_norm
    ) q WHERE cid IS NOT NULL;
  END IF;

  IF v_ids IS NULL OR array_length(v_ids,1) IS NULL THEN
    RETURN QUERY SELECT 'not_found'::text, NULL::uuid, NULL::text, NULL::text, NULL::text[]; RETURN;
  ELSIF array_length(v_ids,1) = 1 THEN
    RETURN QUERY SELECT 'resolved'::text, v_ids[1], p.canonical_name, p.party_type, NULL::text[]
      FROM registry.parties p WHERE p.party_id = v_ids[1]; RETURN;
  ELSE
    RETURN QUERY SELECT 'ambiguous'::text, NULL::uuid, NULL::text, NULL::text,
      (SELECT array_agg(canonical_name ORDER BY canonical_name) FROM registry.parties WHERE party_id = ANY(v_ids)); RETURN;
  END IF;
END;
$fn$;

GRANT EXECUTE ON FUNCTION registry.resolve_party(text, text) TO authenticated, service_role;
