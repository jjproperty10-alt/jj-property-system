-- RC3.1 Phase 2 Patch: Fix is_platform_tracking payer guard
-- Migration: 20260709_001_fix_platform_tracking_payer_guard
-- Applied: 2026-07-09
-- Approved by: Yossi (OQ-01)
--
-- BUG: Prior rule flagged ALL Airbnb Cleaning and Management Fee rows as
--      is_platform_tracking = TRUE regardless of who paid.
--
-- ROOT CAUSE: Missing payer = 'Airbnb' guard.
--
-- IMPACT:
--   14 rows were incorrectly treated as informational (platform tracking):
--     Airbnb Cleaning  / payer=Anastasia : 8 rows / â¬1,128.09
--     Airbnb Cleaning  / payer=JJ        : 2 rows / â¬260.18
--     Airbnb Cleaning  / payer=Yossi     : 1 row  / â¬100.00
--     Airbnb Mgmt Fee  / payer=Client    : 2 rows / â¬270.00
--     Airbnb Mgmt Fee  / payer=Tenant    : 1 row  / â¬75.00
--   Total misflagged: 14 rows / â¬1,833.27
--
-- FIX: Add AND t.payer = 'Airbnb' to is_platform_tracking condition.
--   Only rows where Airbnb platform paid are true platform tracking rows
--   (already netted from Platform Income and shown informational only).
--   Rows where JJ/Anastasia/Yossi paid are real expenses that reduce owner credit.
--   Rows where Client/Tenant paid are real management fee income to JJ.
--
-- BUSINESS RULE (from HISTORICAL_BUSINESS_RULES_V1.md, Section 4.6):
--   is_platform_tracking = TRUE only when payer = 'Airbnb'
--   AND subcategory IN ('Management Fee', 'Cleaning')
--   AND category = 'Airbnb'

CREATE OR REPLACE VIEW v_rc3_classified AS
SELECT
  t.*,

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
  -- payer = 'Airbnb' guard added.
  -- When payer = 'Airbnb': platform deducted this from Platform Income â informational only.
  -- When payer â  'Airbnb': JJ/Anastasia/Yossi physically paid â real expense â reduces owner credit.
  --                         Client/Tenant paid â real management fee income â reduces owner credit.
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
  AND t.reporting_name IS NOT NULL;

COMMENT ON VIEW v_rc3_classified IS
  'RC3.1 Phase 2 â Layer 1 master classification. '
  'is_platform_tracking payer guard fix applied 2026-07-09 (OQ-01). '
  'Base filters: active rows only, property-scoped only. '
  'All RC3 account views must SELECT from this view. '
  'No running balances. No settlement logic.';
