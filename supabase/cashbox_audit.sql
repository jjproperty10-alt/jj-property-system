-- ============================================================
-- JJ PROPERTY 10 — CASHBOX AUDIT
-- Must match Power BI exactly:
-- Yossi:     -57,272.94
-- Jacob:     +72,279.47
-- JJ:        +83,291.05
-- Anastasia: +9,610.52
--
-- RULE: balance = SUM(payee=box) - SUM(payer=box)
-- JJ = only literal 'jj' — NOT employees.
-- Anastasia = all active employees from employee_config (Fabi deactivated).
-- EXCEPTION: Salary subcategory excluded from Anastasia received (Power BI rule).
-- ============================================================

-- Make sure employee_config is readable (RLS off)
ALTER TABLE employee_config DISABLE ROW LEVEL SECURITY;

-- Drop old view
DROP VIEW IF EXISTS v_cashbox_audit CASCADE;

-- Create clean audit view
CREATE VIEW v_cashbox_audit AS
WITH emp_names AS (
  -- Generic: all employees from config, no hardcoding
  SELECT LOWER(name) AS emp_name
  FROM employee_config
  WHERE role = 'employee' AND is_active = TRUE
)
SELECT cash_box_name,
  ROUND(total_received, 2) AS total_received,
  ROUND(total_paid, 2)     AS total_paid,
  ROUND(total_received - total_paid, 2) AS balance,
  transaction_count_received,
  transaction_count_paid
FROM (

  -- YOSSI
  SELECT 'Yossi' AS cash_box_name, 1 AS sort_order,
    COALESCE(SUM(CASE WHEN LOWER(payee) = 'yossi' THEN amount_eur ELSE 0 END), 0) AS total_received,
    COALESCE(SUM(CASE WHEN LOWER(payer) = 'yossi' THEN amount_eur ELSE 0 END), 0) AS total_paid,
    COUNT(CASE WHEN LOWER(payee) = 'yossi' THEN 1 END) AS transaction_count_received,
    COUNT(CASE WHEN LOWER(payer) = 'yossi' THEN 1 END) AS transaction_count_paid
  FROM transactions

  UNION ALL

  -- JACOB (includes alternate spelling yaacov)
  SELECT 'Jacob', 2,
    COALESCE(SUM(CASE WHEN LOWER(payee) IN ('jacob','yaacov') THEN amount_eur ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN LOWER(payer) IN ('jacob','yaacov') THEN amount_eur ELSE 0 END), 0),
    COUNT(CASE WHEN LOWER(payee) IN ('jacob','yaacov') THEN 1 END),
    COUNT(CASE WHEN LOWER(payer) IN ('jacob','yaacov') THEN 1 END)
  FROM transactions

  UNION ALL

  -- JJ (ONLY literal 'jj' — employees are separate)
  SELECT 'JJ', 3,
    COALESCE(SUM(CASE WHEN LOWER(payee) = 'jj' THEN amount_eur ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN LOWER(payer) = 'jj' THEN amount_eur ELSE 0 END), 0),
    COUNT(CASE WHEN LOWER(payee) = 'jj' THEN 1 END),
    COUNT(CASE WHEN LOWER(payer) = 'jj' THEN 1 END)
  FROM transactions

  UNION ALL

  -- ANASTASIA (all active employees from employee_config)
  -- Salary excluded from received — Power BI rule: salary ≠ cashbox receipt
  SELECT 'Anastasia', 4,
    COALESCE(SUM(CASE WHEN LOWER(payee) IN (SELECT emp_name FROM emp_names)
      AND LOWER(COALESCE(subcategory,'')) NOT LIKE '%salary%'
      THEN amount_eur ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN LOWER(payer) IN (SELECT emp_name FROM emp_names) THEN amount_eur ELSE 0 END), 0),
    COUNT(CASE WHEN LOWER(payee) IN (SELECT emp_name FROM emp_names)
      AND LOWER(COALESCE(subcategory,'')) NOT LIKE '%salary%' THEN 1 END),
    COUNT(CASE WHEN LOWER(payer) IN (SELECT emp_name FROM emp_names) THEN 1 END)
  FROM transactions

) boxes
ORDER BY sort_order;

-- ============================================================
-- VERIFICATION QUERY — run this to confirm match with Power BI
-- ============================================================
-- SELECT cash_box_name, total_received, total_paid, balance
-- FROM v_cashbox_audit;
-- Expected:
-- Yossi            905076.66   962349.60   -57272.94
-- Jacob           1354726.97  1282447.50    72279.47
-- JJ               422931.30   339640.25    83291.05
-- Anastasia       174539.56   164929.04     9610.52
-- ============================================================

-- Update v_cash_positions to use v_cashbox_audit (keeps backward compatibility)
DROP VIEW IF EXISTS v_cash_positions CASCADE;
CREATE VIEW v_cash_positions AS
SELECT cash_box_name AS box_name, balance
FROM v_cashbox_audit;

-- Rebuild v_cash_movements (simplified, no employee grouping into JJ)
DROP VIEW IF EXISTS v_cash_movements CASCADE;
CREATE VIEW v_cash_movements AS
SELECT
  id, date, category, subcategory, description, property_name, amount_eur,
  CASE
    WHEN LOWER(payer) = 'yossi'                      THEN 'Yossi'
    WHEN LOWER(payer) IN ('jacob','yaacov')           THEN 'Jacob'
    WHEN LOWER(payer) = 'jj'                         THEN 'JJ'
    WHEN LOWER(payer) IN (SELECT LOWER(name) FROM employee_config WHERE role='employee' AND is_active=TRUE)
                                                     THEN 'Anastasia'
    ELSE NULL
  END AS payer_box,
  CASE
    WHEN LOWER(payee) = 'yossi'                      THEN 'Yossi'
    WHEN LOWER(payee) IN ('jacob','yaacov')           THEN 'Jacob'
    WHEN LOWER(payee) = 'jj'                         THEN 'JJ'
    WHEN LOWER(payee) IN (SELECT LOWER(name) FROM employee_config WHERE role='employee' AND is_active=TRUE)
                                                     THEN 'Anastasia'
    ELSE NULL
  END AS payee_box
FROM transactions;

-- Rebuild money location using correct JJ balance
DROP VIEW IF EXISTS v_money_location CASCADE;
CREATE VIEW v_money_location AS
SELECT location, sort_order, amount FROM (
  SELECT '💵 Cash — Yossi'   AS location, 1 AS sort_order, COALESCE(balance,0) AS amount FROM v_cashbox_audit WHERE cash_box_name='Yossi'
  UNION ALL SELECT '💵 Cash — Jacob',   2, COALESCE(balance,0) FROM v_cashbox_audit WHERE cash_box_name='Jacob'
  UNION ALL SELECT '💵 Cash — JJ',      3, COALESCE(balance,0) FROM v_cashbox_audit WHERE cash_box_name='JJ'
  UNION ALL SELECT '💵 Anastasia',4, COALESCE(balance,0) FROM v_cashbox_audit WHERE cash_box_name='Anastasia'
  UNION ALL SELECT '🏠 Invested in Properties', 5,
    ROUND(SUM(purchase_paid),0) FROM v_property_summary WHERE sale_contract=0 AND purchase_paid>0
  UNION ALL SELECT '🔨 Open Renovation Costs', 6,
    ROUND(SUM(GREATEST(0,renovation_costs-renovation_received)),0) FROM v_property_summary WHERE renovation_costs>renovation_received
  UNION ALL SELECT '📋 Receivables — Renovation', 7,
    ROUND(SUM(GREATEST(0,(renovation_contract+renovation_extras_charge)-renovation_received)),0) FROM v_property_summary WHERE renovation_contract>0
  UNION ALL SELECT '📋 Receivables — Sale', 8,
    ROUND(SUM(GREATEST(0,sale_contract-sale_received-third_party_payment)),0) FROM v_property_summary WHERE sale_contract>0
  UNION ALL SELECT '⚠️ Due to Owners', 9,
    ROUND(SUM(balance_due_to_owner),0)*-1 FROM v_owner_balances WHERE balance_due_to_owner>0
) loc ORDER BY sort_order;

-- Rebuild partner settlement using correct cash positions
DROP VIEW IF EXISTS v_partner_settlement CASCADE;
CREATE VIEW v_partner_settlement AS
WITH cash AS (SELECT cash_box_name, balance FROM v_cashbox_audit)
SELECT
  COALESCE((SELECT balance FROM cash WHERE cash_box_name='Yossi'),0)  AS yossi_cash,
  COALESCE((SELECT balance FROM cash WHERE cash_box_name='Jacob'),0)  AS jacob_cash,
  COALESCE((SELECT balance FROM cash WHERE cash_box_name='JJ'),0)     AS jj_cash,
  ROUND(COALESCE((SELECT balance FROM cash WHERE cash_box_name='JJ'),0)/2,0) AS jj_share_each,
  COALESCE((SELECT balance FROM cash WHERE cash_box_name='Anastasia'),0) AS employee_balance,
  -- Total positions (cash + 50% JJ)
  COALESCE((SELECT balance FROM cash WHERE cash_box_name='Yossi'),0) +
    ROUND(COALESCE((SELECT balance FROM cash WHERE cash_box_name='JJ'),0)/2,0) AS yossi_total_position,
  COALESCE((SELECT balance FROM cash WHERE cash_box_name='Jacob'),0) +
    ROUND(COALESCE((SELECT balance FROM cash WHERE cash_box_name='JJ'),0)/2,0) AS jacob_total_position,
  -- Settlement: equalize the two partners' positions
  ROUND(ABS(
    (COALESCE((SELECT balance FROM cash WHERE cash_box_name='Yossi'),0) +
     ROUND(COALESCE((SELECT balance FROM cash WHERE cash_box_name='JJ'),0)/2,0))
    -
    (COALESCE((SELECT balance FROM cash WHERE cash_box_name='Jacob'),0) +
     ROUND(COALESCE((SELECT balance FROM cash WHERE cash_box_name='JJ'),0)/2,0))
  )/2, 0) AS settlement_amount,
  CASE
    WHEN (COALESCE((SELECT balance FROM cash WHERE cash_box_name='Yossi'),0) +
          ROUND(COALESCE((SELECT balance FROM cash WHERE cash_box_name='JJ'),0)/2,0)) >
         (COALESCE((SELECT balance FROM cash WHERE cash_box_name='Jacob'),0) +
          ROUND(COALESCE((SELECT balance FROM cash WHERE cash_box_name='JJ'),0)/2,0))
    THEN 'yossi_pays_jacob'
    WHEN (COALESCE((SELECT balance FROM cash WHERE cash_box_name='Jacob'),0) +
          ROUND(COALESCE((SELECT balance FROM cash WHERE cash_box_name='JJ'),0)/2,0)) >
         (COALESCE((SELECT balance FROM cash WHERE cash_box_name='Yossi'),0) +
          ROUND(COALESCE((SELECT balance FROM cash WHERE cash_box_name='JJ'),0)/2,0))
    THEN 'jacob_pays_yossi'
    ELSE 'balanced'
  END AS direction,
  -- Activity details for breakdown
  (SELECT ROUND(SUM(CASE WHEN LOWER(payer)='yossi' AND category!='Transfer' THEN amount_eur ELSE 0 END),0) FROM transactions) AS yossi_paid_out,
  (SELECT ROUND(SUM(CASE WHEN LOWER(payee)='yossi' AND category!='Transfer' THEN amount_eur ELSE 0 END),0) FROM transactions) AS yossi_received_in,
  (SELECT ROUND(SUM(CASE WHEN LOWER(payer) IN ('jacob','yaacov') AND category!='Transfer' THEN amount_eur ELSE 0 END),0) FROM transactions) AS jacob_paid_out,
  (SELECT ROUND(SUM(CASE WHEN LOWER(payee) IN ('jacob','yaacov') AND category!='Transfer' THEN amount_eur ELSE 0 END),0) FROM transactions) AS jacob_received_in,
  (SELECT ROUND(SUM(CASE WHEN LOWER(payer)='yossi' AND LOWER(payee) IN ('jacob','yaacov') AND category='Transfer' THEN amount_eur ELSE 0 END),0) FROM transactions) AS yossi_paid_jacob,
  (SELECT ROUND(SUM(CASE WHEN LOWER(payer) IN ('jacob','yaacov') AND LOWER(payee)='yossi' AND category='Transfer' THEN amount_eur ELSE 0 END),0) FROM transactions) AS jacob_paid_yossi,
  (SELECT ROUND(SUM(CASE WHEN LOWER(payer)='yossi' AND category!='Transfer' THEN amount_eur ELSE 0 END),0) FROM transactions) -
  (SELECT ROUND(SUM(CASE WHEN LOWER(payee)='yossi' AND category!='Transfer' THEN amount_eur ELSE 0 END),0) FROM transactions) AS yossi_net_paid,
  (SELECT ROUND(SUM(CASE WHEN LOWER(payer) IN ('jacob','yaacov') AND category!='Transfer' THEN amount_eur ELSE 0 END),0) FROM transactions) -
  (SELECT ROUND(SUM(CASE WHEN LOWER(payee) IN ('jacob','yaacov') AND category!='Transfer' THEN amount_eur ELSE 0 END),0) FROM transactions) AS jacob_net_paid;
