-- ============================================================
-- public.read_certified_client_settlement
-- LOCAL IMPLEMENTATION ONLY. Do not Apply to Production from this branch
-- without a separate Yossi authorization.
--
-- Purpose:
--   Narrow public SECURITY DEFINER wrapper so the Next.js service-role
--   client can read certified settlement through PostgREST public schema.
--   PostgREST does not expose schema finance (PGRST106). Do not expose it.
--
-- Safety:
--   - Read-only delegation to finance.read_certified_client_settlement
--   - No dynamic SQL, no arbitrary identifiers
--   - No writes, locks, or certification mutation
--   - EXECUTE granted to service_role only
--   - No finance schema/table/function grants to browser roles
-- ============================================================

CREATE OR REPLACE FUNCTION public.read_certified_client_settlement(
  p_entity_id UUID,
  p_as_of     DATE
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $wrap$
BEGIN
  IF p_entity_id IS NULL THEN
    RAISE EXCEPTION '[input] entity_id must be a UUID.';
  END IF;
  IF p_as_of IS NULL THEN
    RAISE EXCEPTION '[input] as_of must be a date.';
  END IF;

  RETURN finance.read_certified_client_settlement(p_entity_id, p_as_of);
END;
$wrap$;

COMMENT ON FUNCTION public.read_certified_client_settlement(UUID, DATE) IS
  'Service-role public wrapper. Read-only delegation to finance.read_certified_client_settlement. Does not expose schema finance.';

REVOKE ALL ON FUNCTION public.read_certified_client_settlement(UUID, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.read_certified_client_settlement(UUID, DATE) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.read_certified_client_settlement(UUID, DATE) TO service_role;
