-- 20260907_001_pms_historical_reservations_rpc.sql
-- Why: historical-only STR properties (Uriel Duplex, Tom Dekelia, Yogev Port) were intentionally
-- removed from Hostaway. Their recovered Booking/Airbnb rows live in
-- pms.historical_channel_reservation_evidence. `pms` is NOT exposed to PostgREST
-- (pgrst.db_schemas = public, lifecycle), so the statement provider's .schema('pms') read
-- silently returned []. Same pattern as 20260812_003_pms_audit_read_rpcs.sql.
-- Read-only. No table/data/ledger changes. anon has no EXECUTE; service_role only.

CREATE OR REPLACE FUNCTION public.pms_historical_reservations_for_property(p_property_id uuid)
RETURNS TABLE (
  external_reservation_id text,
  channel text,
  provider text,
  guest_name text,
  check_in_date date,
  check_out_date date,
  status text,
  gross_amount numeric,
  platform_fee numeric,
  cleaning_fee numeric,
  tax_amount numeric,
  net_payout numeric
)
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT e.external_reservation_id, e.channel, e.provider, e.guest_name,
         e.check_in_date, e.check_out_date, e.status,
         e.gross_amount, e.platform_fee, e.cleaning_fee, e.tax_amount, e.net_payout
  FROM pms.historical_channel_reservation_evidence e
  WHERE e.property_id = p_property_id
    AND e.is_current = true
    AND e.review_status = 'active'
    AND e.provider <> 'hostaway';
$$;

CREATE OR REPLACE FUNCTION public.pms_historical_property_ids()
RETURNS TABLE (property_id uuid)
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT DISTINCT e.property_id
  FROM pms.historical_channel_reservation_evidence e
  WHERE e.is_current = true
    AND e.review_status = 'active'
    AND e.provider <> 'hostaway';
$$;

REVOKE ALL ON FUNCTION public.pms_historical_reservations_for_property(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pms_historical_property_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pms_historical_reservations_for_property(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.pms_historical_property_ids() TO service_role;
