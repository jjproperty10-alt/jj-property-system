-- =====================================================================================
-- RECOVERED DEPLOYED-STATE SNAPSHOT — STR settlement views
-- Captured from Supabase production (vsiiprzjrstjcmjpwcrd) on 2026-08-11.
-- This is NOT the original historical migration. Do not apply blindly.
-- =====================================================================================
-- CONTEXT: these views compute STR owner-settlement figures from Hostaway snapshots
-- blended with public.transactions. Per audit (2026-08-11) they are CURRENTLY UNWIRED
-- and NON-AUTHORITATIVE: no app service, no engine function, and no write path consumes
-- them. Captured for reproducibility only. Financial formulas are NOT part of P0/P1.
-- Architectural boundary: Hostaway/PMS is operational EVIDENCE, not a financial authority.
-- =====================================================================================

\echo 'REFUSING TO RUN: recovered deployed-state snapshot, not an executable migration.'
DO $$ BEGIN
  RAISE EXCEPTION 'STR_SETTLEMENT_VIEWS snapshot must not be executed directly.';
END $$;

-- pms.v_str_property_settlement  (joins pms.property_mappings.jj_property_name → contacts/transactions BY NAME)
CREATE OR REPLACE VIEW pms.v_str_property_settlement AS
 WITH reservation_monthly AS (
   SELECT e.property_external_id,
     date_trunc('month'::text, cr.check_in::timestamp with time zone)::date AS reporting_month,
     count(*) AS reservation_count, sum(cr.nights) AS booked_nights,
     sum(e.effective_rental_revenue) AS gross_rental_revenue,
     sum(e.effective_cleaning) AS cleaning_income,
     sum(e.effective_platform_fees) AS total_platform_fees,
     sum(e.effective_payment_fees) AS total_payment_fees,
     sum(e.effective_total_taxes) AS total_taxes,
     sum(e.effective_total_payout) AS total_payout,
     sum(e.effective_management_fee) AS management_fee,
     sum(e.effective_owner_payout) AS hostaway_owner_entitlement,
     count(*) AS snapshot_count,
     bool_and(e.source_control_check IS NOT NULL AND abs(e.source_control_check) < 0.01) AS all_control_checks_pass,
     bool_or(e.override_status = ANY (ARRAY['proposed'::text, 'rejected'::text])) AS has_unresolved_data
   FROM pms.v_reservation_financial_effective e
     JOIN pms.canonical_reservations cr ON cr.external_id = e.reservation_external_id AND cr.external_property_id = e.property_external_id
   GROUP BY e.property_external_id, (date_trunc('month'::text, cr.check_in::timestamp with time zone))
 ), property_identity AS (
   SELECT pm.external_id AS property_external_id, pm.jj_property_name, cp.name AS pms_listing_name,
     cp.internal_name, ctp.contact_id AS owner_contact_id, c.name AS owner_name
   FROM pms.property_mappings pm
     JOIN pms.canonical_properties cp ON cp.external_id = pm.external_id AND cp.provider = pm.provider
     LEFT JOIN contact_properties ctp ON ctp.property_name = pm.jj_property_name AND ctp.relationship_role = 'Owner'::text AND ctp.is_deleted = false
     LEFT JOIN contacts c ON c.id = ctp.contact_id
   WHERE pm.status = 'approved'::text
 ), jj_str_expenses AS (
   SELECT pm.external_id AS property_external_id,
     date_trunc('month'::text, t.date::timestamp with time zone)::date AS reporting_month,
     sum(COALESCE(t.client_charge, t.amount_eur)) FILTER (WHERE t.subcategory <> ALL (ARRAY['Platform Income'::text, 'Management Fee'::text, 'Client Payment'::text, 'Software/Hostaway'::text, 'Bank Payment to Owner'::text])) AS other_owner_chargeable_str_expenses
   FROM transactions t
     JOIN pms.property_mappings pm ON pm.jj_property_name = COALESCE(( SELECT a.canonical_name FROM property_name_aliases a WHERE a.raw_name = t.property_name), t.property_name) AND pm.status = 'approved'::text
   WHERE t.category = 'Airbnb'::text AND t.is_deleted = false AND NOT (EXISTS ( SELECT 1 FROM transaction_exclusions te WHERE te.transaction_id = t.id AND te.is_active = true)) AND (t.review_status IS NULL OR t.review_status = 'active'::text) AND (t.subcategory <> ALL (ARRAY['Platform Income'::text, 'Management Fee'::text, 'Client Payment'::text, 'Software/Hostaway'::text, 'Bank Payment to Owner'::text]))
   GROUP BY pm.external_id, (date_trunc('month'::text, t.date::timestamp with time zone))
 ), owner_payments AS (
   SELECT pm.external_id AS property_external_id,
     date_trunc('month'::text, t.date::timestamp with time zone)::date AS reporting_month,
     sum(COALESCE(t.client_charge, t.amount_eur)) AS owner_payments_attributed
   FROM transactions t
     JOIN pms.property_mappings pm ON pm.jj_property_name = COALESCE(( SELECT a.canonical_name FROM property_name_aliases a WHERE a.raw_name = t.property_name), t.property_name) AND pm.status = 'approved'::text
   WHERE t.category = 'Airbnb'::text AND (t.subcategory = ANY (ARRAY['Bank Payment to Owner'::text, 'Client Payment'::text])) AND t.is_deleted = false AND NOT (EXISTS ( SELECT 1 FROM transaction_exclusions te WHERE te.transaction_id = t.id AND te.is_active = true)) AND (t.review_status IS NULL OR t.review_status = 'active'::text)
   GROUP BY pm.external_id, (date_trunc('month'::text, t.date::timestamp with time zone))
 )
 SELECT pi.property_external_id, pi.jj_property_name AS property_name, pi.pms_listing_name, pi.internal_name,
    rm.reporting_month, pi.owner_contact_id, pi.owner_name, rm.reservation_count, rm.booked_nights,
    rm.gross_rental_revenue, rm.cleaning_income, rm.total_platform_fees, rm.total_payment_fees, rm.total_taxes,
    rm.total_payout, rm.management_fee, 40.00 AS hostaway_monthly_fee,
    COALESCE(jje.other_owner_chargeable_str_expenses, 0::numeric) AS other_owner_chargeable_str_expenses,
    40.00 + COALESCE(jje.other_owner_chargeable_str_expenses, 0::numeric) AS total_owner_chargeable_expenses,
    rm.hostaway_owner_entitlement,
    COALESCE(op.owner_payments_attributed, 0::numeric) AS owner_payments_attributed_to_property,
    rm.hostaway_owner_entitlement - 40.00 - COALESCE(jje.other_owner_chargeable_str_expenses, 0::numeric) - COALESCE(op.owner_payments_attributed, 0::numeric) AS property_period_balance,
    rm.snapshot_count, rm.all_control_checks_pass, 'CERTIFIED'::text AS source_confidence,
    rm.has_unresolved_data, NULL::numeric AS rounding_delta
   FROM reservation_monthly rm
     JOIN property_identity pi ON pi.property_external_id = rm.property_external_id
     LEFT JOIN jj_str_expenses jje ON jje.property_external_id = rm.property_external_id AND jje.reporting_month = rm.reporting_month
     LEFT JOIN owner_payments op ON op.property_external_id = rm.property_external_id AND op.reporting_month = rm.reporting_month;

-- public.v_str_settlement_report  (thin public wrapper)
CREATE OR REPLACE VIEW public.v_str_settlement_report AS
 SELECT property_name, owner_name, reporting_month, reservation_count, booked_nights,
    gross_rental_revenue, cleaning_income, total_platform_fees, total_payment_fees, total_taxes,
    total_payout, management_fee, hostaway_monthly_fee, other_owner_chargeable_str_expenses,
    total_owner_chargeable_expenses, hostaway_owner_entitlement, owner_payments_attributed_to_property,
    property_period_balance, snapshot_count, all_control_checks_pass, source_confidence,
    has_unresolved_data, rounding_delta
   FROM pms.v_str_property_settlement;
