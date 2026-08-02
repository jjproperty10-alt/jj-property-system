-- Migration: resolve_party_id RPC
-- Purpose: Narrow SECURITY DEFINER function that reads registry.external_identities
--          without exposing the entire registry schema to PostgREST.
-- Context: PR #89 Audit Tab failed because registry schema is not in PostgREST
--          "Exposed schemas". This RPC provides a minimal, secure bridge.
-- Grants: postgres + service_role only. anon/authenticated revoked.
-- Rollback: DROP FUNCTION IF EXISTS public.resolve_party_id(UUID, UUID);

CREATE OR REPLACE FUNCTION public.resolve_party_id(
  p_entity_identity_id UUID,
  p_company_id UUID DEFAULT '10f6e9b3-c5b9-4d95-a318-48f20f89477f'
)
RETURNS TABLE(canonical_id UUID, mapping_status TEXT)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT ei.canonical_id, ei.mapping_status
  FROM registry.external_identities ei
  WHERE ei.source_system = 'lifecycle.entity_identity'
    AND ei.external_entity_type = 'entity'
    AND ei.external_id = p_entity_identity_id::text
    AND ei.company_id = p_company_id
    AND ei.mapping_status = 'approved';
$$;

-- Security: only service_role (used by createServiceClient) and postgres
REVOKE ALL ON FUNCTION public.resolve_party_id(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_party_id(UUID, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.resolve_party_id(UUID, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_party_id(UUID, UUID) TO service_role;

COMMENT ON FUNCTION public.resolve_party_id IS
  'R1 Audit RPC — bridges entity_identity.id to registry.parties.party_id '
  'without exposing registry schema to PostgREST. SECURITY DEFINER, '
  'service_role only. See PR #89 root cause analysis.';
