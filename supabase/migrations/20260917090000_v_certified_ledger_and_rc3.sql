-- ============================================================
-- Phase 0D — Certified ledger predicate for RC3 + STR reads
-- LOCAL IMPLEMENTATION ONLY. Do not Apply to Production from this branch
-- without a separate Yossi authorization.
--
-- Certified admission (single predicate):
--   COALESCE(t.is_deleted, false) = false
--   AND (t.review_status = 'active' OR t.review_status IS NULL)
--   AND NOT EXISTS (
--     SELECT 1 FROM public.transaction_exclusions te
--     WHERE te.transaction_id = t.id AND te.is_active = true
--   )
--
-- Safety:
--   - NOT EXISTS avoids row multiplication when exclusion history exists
--   - Only te.is_active = true is an active exclusion
--   - Billing-only rows (amount_eur = 0 AND client_charge > 0) remain admitted
--   - Does not touch transactions data, exclusions data, cashbox, money
--     position, company P&L, Anastasia clearing, or Hostaway/PMS tables
--   - CREATE OR REPLACE VIEW — no DROP CASCADE
-- ============================================================

BEGIN;

-- Independent of RC3 classification. STR extras / Platform Income query this
-- view so they do not inherit account_type or reporting_name gates.
CREATE OR REPLACE VIEW public.v_certified_ledger_transactions
  WITH (security_invoker = true)
AS
SELECT t.*
FROM public.transactions t
WHERE COALESCE(t.is_deleted, false) = false
  AND (t.review_status = 'active' OR t.review_status IS NULL)
  AND NOT EXISTS (
    SELECT 1
    FROM public.transaction_exclusions te
    WHERE te.transaction_id = t.id
      AND te.is_active = true
  );

COMMENT ON VIEW public.v_certified_ledger_transactions IS
  'Certified ledger admission for direct transaction reads (STR extras, Platform Income). '
  'Predicate: not deleted, review_status active or NULL, no active transaction_exclusions. '
  'A row that is both deleted and excluded is omitted once. Billing-only rows remain. '
  'Not an RC3 classifier — no account_type / reporting_name transformation.';

-- Server/staff reads only. STR extras/PI and RC3 use service_role.
-- Do not GRANT to authenticated: live transactions RLS allows any authenticated
-- role to SELECT, so a partner/client PostgREST grant would leak this view.
GRANT SELECT ON public.v_certified_ledger_transactions TO service_role;
REVOKE ALL ON public.v_certified_ledger_transactions FROM PUBLIC;
REVOKE ALL ON public.v_certified_ledger_transactions FROM anon;
REVOKE ALL ON public.v_certified_ledger_transactions FROM authenticated;

-- Recreate RC3 Layer 1 with the LIVE column list/order from Phase 0C
-- pg_get_viewdef(v_rc3_classified), plus certified is_deleted + active-exclusion
-- gates. Explicit columns (not t.*) so CREATE OR REPLACE cannot shift types/order
-- if v_transactions_reporting later gains columns. Downstream v_rc3_* SELECT
-- these same columns and inherit the predicate automatically.
CREATE OR REPLACE VIEW public.v_rc3_classified AS
SELECT
  t.id,
  t.date,
  t.property_id,
  t.property_name,
  t.category,
  t.subcategory,
  t.description,
  t.payer,
  t.payee,
  t.amount_eur,
  t.client_charge,
  t.notes,
  t.k_note,
  t.created_at,
  t.updated_at,
  t.is_deleted,
  t.deleted_by,
  t.deleted_at,
  t.review_status,
  t.reporting_name,

  CASE t.category
    WHEN 'Purchase'   THEN 'purchase'
    WHEN 'Renovation' THEN 'renovation'
    WHEN 'Management' THEN 'rental'
    WHEN 'Airbnb'     THEN 'airbnb'
    WHEN 'Sale'       THEN 'sale'
    WHEN 'Transfer'   THEN 'transfer'
    WHEN 'JJ'         THEN 'jj'
    WHEN 'General'    THEN 'general'
    ELSE                   'unclassified'
  END AS account_type,

  COALESCE(t.client_charge, t.amount_eur) AS client_amount,

  COALESCE(t.subcategory IN ('Purchase Contract', 'Sale Contract', 'Renovation Contract'), FALSE)
    AS is_contract_value,

  -- FIXED 2026-07-09 (OQ-01, approved by Yossi):
  -- payer = 'Airbnb' guard. Unchanged in Phase 0D.
  COALESCE(
    t.category = 'Airbnb'
    AND t.subcategory IN ('Management Fee', 'Cleaning')
    AND t.payer = 'Airbnb',
    FALSE
  ) AS is_platform_tracking,

  COALESCE(t.subcategory = 'Bank Payment to Owner', FALSE)
    AS is_bpo

FROM v_transactions_reporting t
WHERE (t.review_status = 'active' OR t.review_status IS NULL)
  AND t.reporting_name IS NOT NULL
  AND COALESCE(t.is_deleted, false) = false
  AND NOT EXISTS (
    SELECT 1
    FROM public.transaction_exclusions te
    WHERE te.transaction_id = t.id
      AND te.is_active = true
  );

COMMENT ON VIEW public.v_rc3_classified IS
  'RC3 Layer 1 master classification. Certified ledger predicate (Phase 0D): '
  'not deleted; review_status active or NULL; no active transaction_exclusions; '
  'reporting_name IS NOT NULL. client_amount = COALESCE(client_charge, amount_eur). '
  'Billing-only rows remain. Downstream v_rc3_* must SELECT from this view. '
  'No running balances. No settlement logic. No cashbox/P&L/money-position change.';

COMMIT;
