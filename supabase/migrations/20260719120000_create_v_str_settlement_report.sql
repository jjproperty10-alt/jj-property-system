-- Migration: Create public.v_str_settlement_report wrapper view
-- Gate 2 requirement: expose STR settlement data to browser (authenticated only)
-- Source: pms.v_str_property_settlement (not directly accessible from browser)
--
-- Security:
--   - Wrapper view in public schema exposes minimum columns
--   - Only report-level aggregates, no sensitive payloads
--   - Authenticated role only, anon denied
--
-- Rollback:
--   DROP VIEW IF EXISTS public.v_str_settlement_report;
--   REVOKE SELECT ON public.v_str_settlement_report FROM authenticated;

CREATE OR REPLACE VIEW public.v_str_settlement_report AS
SELECT
  property_name,
  owner_name,
  reporting_month,
  reservation_count,
  booked_nights,
  gross_rental_revenue,
  cleaning_income,
  total_platform_fees,
  total_payment_fees,
  total_taxes,
  total_payout,
  management_fee,
  hostaway_monthly_fee,
  other_owner_chargeable_str_expenses,
  total_owner_chargeable_expenses,
  hostaway_owner_entitlement,
  owner_payments_attributed_to_property,
  property_period_balance,
  snapshot_count,
  all_control_checks_pass,
  source_confidence,
  has_unresolved_data,
  rounding_delta
FROM pms.v_str_property_settlement;

-- Grant access: authenticated only, anon denied
GRANT SELECT ON public.v_str_settlement_report TO authenticated;
