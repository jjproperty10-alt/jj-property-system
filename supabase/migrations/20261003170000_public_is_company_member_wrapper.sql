-- Draft only. Do not apply from this branch.
--
-- PostgREST exposes public and lifecycle (authenticator pgrst.db_schemas).
-- schema access is not exposed, so a session client cannot call
-- access.is_company_member directly.
--
-- authenticated already has USAGE on schema access. No later migration
-- revokes it:
--   supabase/migrations/20260924210000_access_company_memberships.sql
--   GRANT USAGE ON SCHEMA access TO authenticated, service_role;
-- The same migration grants EXECUTE on access.is_company_member(uuid)
-- to authenticated. This wrapper therefore stays SECURITY INVOKER.
-- It runs as the caller and does not adopt the owner role.
--
-- Timestamp is after 20261003150400.

BEGIN;

CREATE OR REPLACE FUNCTION public.is_company_member(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT access.is_company_member(p_company_id);
$$;

REVOKE ALL ON FUNCTION public.is_company_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_company_member(uuid) TO authenticated;

COMMIT;

-- ROLLBACK:
-- BEGIN;
-- REVOKE ALL ON FUNCTION public.is_company_member(uuid) FROM PUBLIC, anon, authenticated;
-- DROP FUNCTION public.is_company_member(uuid);
-- COMMIT;
