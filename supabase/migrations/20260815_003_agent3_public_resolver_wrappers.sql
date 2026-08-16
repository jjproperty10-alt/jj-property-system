-- Agent 3 — PUBLIC-schema wrappers for the registry resolvers (ADDITIVE)
-- Authorization: Yossi V1 Audit Decisions H.1 / H.3 (2026-08-15)
--
-- Reason: the `registry` schema is NOT in PostgREST "Exposed schemas" (same root cause
-- documented in 20260803_001_resolve_party_id_rpc.sql). supabase-js cannot call
-- registry.* directly. These narrow SECURITY DEFINER wrappers expose ONLY the two
-- canonical resolvers to the app, without exposing the whole registry schema.
--
-- SAFETY: creates two functions only. No table/view/row changes. service_role only.
-- Rollback: DROP FUNCTION IF EXISTS public.resolve_property_canonical(text);
--           DROP FUNCTION IF EXISTS public.resolve_party_canonical(text, text);

CREATE OR REPLACE FUNCTION public.resolve_property_canonical(p_input text)
RETURNS TABLE(status text, canonical_property_id uuid, canonical_name text, candidates text[])
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, registry AS $$
  SELECT r.status, r.canonical_property_id, r.canonical_name, r.candidates
  FROM registry.resolve_property(p_input) r;
$$;
REVOKE ALL ON FUNCTION public.resolve_property_canonical(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_property_canonical(text) FROM anon;
REVOKE ALL ON FUNCTION public.resolve_property_canonical(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_property_canonical(text) TO service_role;
COMMENT ON FUNCTION public.resolve_property_canonical IS
  'Agent 3: public bridge to registry.resolve_property (registry not exposed to PostgREST). service_role only.';

CREATE OR REPLACE FUNCTION public.resolve_party_canonical(p_input text, p_source_system text DEFAULT NULL)
RETURNS TABLE(status text, party_id uuid, canonical_name text, party_type text, candidates text[])
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, registry AS $$
  SELECT r.status, r.party_id, r.canonical_name, r.party_type, r.candidates
  FROM registry.resolve_party(p_input, p_source_system) r;
$$;
REVOKE ALL ON FUNCTION public.resolve_party_canonical(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_party_canonical(text, text) FROM anon;
REVOKE ALL ON FUNCTION public.resolve_party_canonical(text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_party_canonical(text, text) TO service_role;
COMMENT ON FUNCTION public.resolve_party_canonical IS
  'Agent 3: public bridge to registry.resolve_party (registry not exposed to PostgREST). service_role only.';
