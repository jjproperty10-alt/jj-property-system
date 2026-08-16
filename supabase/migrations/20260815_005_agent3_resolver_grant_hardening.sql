-- Agent 3 — least-privilege hardening for the canonical resolvers (Yossi 2026-08-15 #6)
-- registry.* resolvers become service_role only, matching the public wrappers.
-- registry schema is not exposed to PostgREST; this removes the unused 'authenticated' grant (defense-in-depth).
-- Verified after apply: anon=false, authenticated=false, service_role=true for all four functions.
-- SAFETY: grant changes only. No data/schema-object changes.

REVOKE EXECUTE ON FUNCTION registry.resolve_property(text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION registry.resolve_property(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION registry.resolve_party(text, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION registry.resolve_party(text, text) FROM PUBLIC;

-- Note: public.resolve_property_canonical / public.resolve_party_canonical were already
-- REVOKEd from PUBLIC/anon/authenticated and GRANTed to service_role only (migration 003).
