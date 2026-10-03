-- DRAFT. Do not apply, merge, or deploy until this file is approved on its own.
-- Timestamp 20261003150300 does not collide with any migration already in supabase/migrations.
--
-- Live catalog (03.10.2026), which differs from supabase/migrations/20260812_003_pms_audit_read_rpcs.sql.
-- That file grants EXECUTE to service_role only. Live ACL on both functions is
-- {postgres=X, authenticated=X, service_role=X}. Both are LANGUAGE sql, SECURITY DEFINER,
-- search_path '', and neither checks the caller. They return guest_name and raw jsonb
-- (pms_reservations_for_property) or approved mapping rows (pms_resolve_mapping).
--
-- A guard of "raise unless finance.is_active_jj_staff()" is not safe for the app.
-- Every production call site uses the service-role client. service_role requests have
-- no auth.uid(), so is_active_jj_staff() is false and the guard would break those reads.
-- This draft therefore does not change the function bodies. It revokes EXECUTE from
-- authenticated (and from PUBLIC / anon, which live already does not grant).
-- service_role and the owner keep EXECUTE.
--
-- Call sites (see the test report for the breakage verdict):
--   src/lib/hostaway-audit/propertyAuditService.ts
--     rpc pms_resolve_mapping and rpc pms_reservations_for_property on the injected client.
--     Callers construct that client with createServiceClient():
--       src/lib/owners/ownerPortfolioAdapter.ts
--       src/lib/owners/ownerReservationAdapter.ts
--       src/lib/owners/ownerStrAuditAdapter.ts
--       src/lib/owners/ownerStrCockpit.ts
--       src/lib/report/str/ownerStrStatementService.ts
--   src/lib/partnership-workspace/vm1IdentityAdapter.ts
--     rpc pms_reservations_for_property only. It does not call pms_resolve_mapping.
--     The production caller passes createServiceClient() from
--     src/app/(app)/finance/external-partner/avi/operations/page.tsx.
--   src/lib/report/str/historicalChannelEvidence.ts calls different RPCs
--   (pms_historical_reservations_for_property, pms_historical_property_ids), not these two.
--   supabase/functions has no call to either RPC.

BEGIN;

DO $guard$
DECLARE
  reservations regprocedure;
  mapping regprocedure;
BEGIN
  reservations := to_regprocedure('public.pms_reservations_for_property(text, date, date)');
  mapping := to_regprocedure('public.pms_resolve_mapping(text)');
  IF reservations IS NULL OR mapping IS NULL THEN
    RAISE EXCEPTION 'BLOCKED_BY_FUNCTION_DRIFT: pms read RPCs are missing';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE oid IN (reservations, mapping)
      AND (NOT prosecdef OR prolang <> (SELECT oid FROM pg_language WHERE lanname = 'sql'))
  ) THEN
    RAISE EXCEPTION 'BLOCKED_BY_FUNCTION_DRIFT: pms read RPCs are not sql SECURITY DEFINER';
  END IF;
END
$guard$;

REVOKE EXECUTE ON FUNCTION public.pms_resolve_mapping(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.pms_reservations_for_property(text, date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pms_resolve_mapping(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.pms_reservations_for_property(text, date, date) TO service_role;

COMMIT;

-- ROLLBACK-BEGIN
-- BEGIN;
-- GRANT EXECUTE ON FUNCTION public.pms_resolve_mapping(text) TO authenticated;
-- GRANT EXECUTE ON FUNCTION public.pms_reservations_for_property(text, date, date) TO authenticated;
-- COMMIT;
-- ROLLBACK-END
