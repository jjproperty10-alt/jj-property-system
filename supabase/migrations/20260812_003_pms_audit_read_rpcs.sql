-- 20260812_003_pms_audit_read_rpcs.sql
-- Applied to production 2026-08-12 (Supabase MCP migration `pms_audit_read_rpcs_v1`).
--
-- Why: the Owner Workspace Reservations tab + STR reconciliation read pms.* server-side via the
-- service client, but `pms` is NOT exposed to PostgREST (pgrst.db_schemas = public, lifecycle) and
-- service_role has no grants on pms. Result: every audit returned empty (blank Reservations/STR
-- for all owners). Instead of exposing the PII-bearing pms schema to the API, we read it through
-- public SECURITY DEFINER RPCs — the same pattern already used by get_auditable_properties_v1.
-- Read-only. No schema/data/table changes. anon has no EXECUTE; service_role only.

CREATE OR REPLACE FUNCTION public.pms_resolve_mapping(p_jj_property_name text)
RETURNS TABLE (
  external_id text, jj_property_name text, status text, confidence_label text,
  property_id uuid, hostaway_name text, hostaway_internal_name text
)
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT m.external_id, m.jj_property_name, m.status, m.confidence_label, m.property_id,
         cp.name, cp.internal_name
  FROM pms.property_mappings m
  LEFT JOIN pms.canonical_properties cp ON cp.external_id = m.external_id
  WHERE m.jj_property_name = p_jj_property_name AND m.status = 'approved'
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.pms_reservations_for_property(
  p_external_id text, p_from date, p_to date
)
RETURNS TABLE (
  external_id text, external_property_id text, channel text, channel_raw text, status text,
  guest_name text, check_in date, check_out date, nights integer, guests integer,
  currency_code text, total_price numeric, cleaning_fee numeric, raw jsonb
)
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT r.external_id, r.external_property_id, r.channel, r.channel_raw, r.status,
         r.guest_name, r.check_in, r.check_out, r.nights, r.guests, r.currency_code,
         r.total_price, r.cleaning_fee, rr.raw
  FROM pms.canonical_reservations r
  LEFT JOIN pms.raw_reservations rr ON rr.external_id = r.external_id AND rr.is_current
  WHERE r.external_property_id = p_external_id
    AND r.check_in <= p_to AND r.check_out >= p_from;
$$;

REVOKE ALL ON FUNCTION public.pms_resolve_mapping(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pms_reservations_for_property(text, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pms_resolve_mapping(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.pms_reservations_for_property(text, date, date) TO service_role;
