-- ============================================================
-- JJ PROPERTY 10 — Settlement & Employee Fix (Proper Accounting)
-- ============================================================

-- 1. Disable RLS on employee_config (not sensitive, needed for views)
ALTER TABLE employee_config DISABLE ROW LEVEL SECURITY;

-- 2. EMPLOYEE REIMBURSEMENTS — Generic, based on Payer/Payee
-- Logic: Employee paid out → JJ owes them
--        Employee received back → reduces what JJ owes
DROP VIEW IF EXISTS v_employee_reimbursements CASCADE;
CREATE VIEW v_employee_reimbursements AS
SELECT
  ec.name AS employee_name,
  -- Total paid OUT by employee for company (not salary, not transfers)
  COALESCE((
    SELECT ROUND(SUM(t.amount_eur), 2)
    FROM transactions t
    WHERE LOWER(t.payer) = LOWER(ec.name)
      AND t.category NOT IN ('Transfer')
  ), 0) AS paid_for_company,
  -- Salary received
  COALESCE((
    SELECT ROUND(SUM(t.amount_eur), 2)
    FROM transactions t
    WHERE LOWER(t.payee) = LOWER(ec.name)
      AND t.subcategory ILIKE '%salary%'
  ), 0) AS salary_received,
  -- Cash transfers back to employee (reimbursements)
  COALESCE((
    SELECT ROUND(SUM(t.amount_eur), 2)
    FROM transactions t
    WHERE LOWER(t.payee) = LOWER(ec.name)
      AND t.category = 'Transfer'
  ), 0) AS transfers_received,
  -- Net: positive = JJ owes employee, negative = employee owes JJ
  COALESCE((
    SELECT ROUND(SUM(t.amount_eur), 2)
    FROM transactions t
    WHERE LOWER(t.payer) = LOWER(ec.name)
      AND t.category NOT IN ('Transfer')
  ), 0) -
  COALESCE((
    SELECT ROUND(SUM(t.amount_eur), 2)
    FROM transactions t
    WHERE LOWER(t.payee) = LOWER(ec.name)
  ), 0) AS net_owed_to_employee,
  COALESCE((
    SELECT COUNT(*)
    FROM transactions t
    WHERE LOWER(t.payer) = LOWER(ec.name)
  ), 0) AS tx_as_payer,
  COALESCE((
    SELECT COUNT(*)
    FROM transactions t
    WHERE LOWER(t.payee) = LOWER(ec.name)
  ), 0) AS tx_as_payee
FROM employee_config ec
WHERE ec.role = 'employee' AND ec.is_active = TRUE;

-- 3. PARTNER SETTLEMENT — Full accounting breakdown
-- Based on: who paid, who received, JJ 50/50, employee reimbursements
DROP VIEW IF EXISTS v_partner_settlement CASCADE;
CREATE VIEW v_partner_settlement AS
WITH
  cash_positions AS (
    SELECT box_name, COALESCE(balance, 0) AS balance FROM v_cash_positions
  ),
  partner_activity AS (
    SELECT
      -- Yossi: all cash OUT from his pocket (non-transfer)
      ROUND(SUM(CASE WHEN LOWER(payer) = 'yossi' AND category != 'Transfer' THEN amount_eur ELSE 0 END), 0) AS yossi_paid_out,
      -- Yossi: all cash IN to his pocket (non-transfer)
      ROUND(SUM(CASE WHEN LOWER(payee) = 'yossi' AND category != 'Transfer' THEN amount_eur ELSE 0 END), 0) AS yossi_received_in,
      -- Jacob: all cash OUT from his pocket (non-transfer)
      ROUND(SUM(CASE WHEN LOWER(payer) IN ('jacob','yaacov') AND category != 'Transfer' THEN amount_eur ELSE 0 END), 0) AS jacob_paid_out,
      -- Jacob: all cash IN to his pocket (non-transfer)
      ROUND(SUM(CASE WHEN LOWER(payee) IN ('jacob','yaacov') AND category != 'Transfer' THEN amount_eur ELSE 0 END), 0) AS jacob_received_in,
      -- Transfers Yossi → Jacob (already done settlements)
      ROUND(SUM(CASE WHEN LOWER(payer) = 'yossi' AND LOWER(payee) IN ('jacob','yaacov') AND category = 'Transfer' THEN amount_eur ELSE 0 END), 0) AS yossi_paid_jacob,
      -- Transfers Jacob → Yossi
      ROUND(SUM(CASE WHEN LOWER(payer) IN ('jacob','yaacov') AND LOWER(payee) = 'yossi' AND category = 'Transfer' THEN amount_eur ELSE 0 END), 0) AS jacob_paid_yossi
    FROM transactions
  )
SELECT
  -- Current cash balances
  COALESCE((SELECT balance FROM cash_positions WHERE box_name = 'Yossi'), 0) AS yossi_cash,
  COALESCE((SELECT balance FROM cash_positions WHERE box_name = 'Jacob'), 0) AS jacob_cash,
  COALESCE((SELECT balance FROM cash_positions WHERE box_name = 'JJ'),    0) AS jj_cash,

  -- Each partner's share of JJ (50/50)
  ROUND(COALESCE((SELECT balance FROM cash_positions WHERE box_name = 'JJ'), 0) / 2, 0) AS jj_share_each,

  -- Transaction activity
  pa.yossi_paid_out,
  pa.yossi_received_in,
  pa.jacob_paid_out,
  pa.jacob_received_in,
  pa.yossi_paid_jacob,
  pa.jacob_paid_yossi,

  -- Net paid by each partner (positive = partner is "owed back")
  pa.yossi_paid_out - pa.yossi_received_in AS yossi_net_paid,
  pa.jacob_paid_out - pa.jacob_received_in AS jacob_net_paid,

  -- TOTAL POSITION per partner = cash in pocket + 50% of JJ
  COALESCE((SELECT balance FROM cash_positions WHERE box_name = 'Yossi'), 0) +
    ROUND(COALESCE((SELECT balance FROM cash_positions WHERE box_name = 'JJ'), 0) / 2, 0) AS yossi_total_position,

  COALESCE((SELECT balance FROM cash_positions WHERE box_name = 'Jacob'), 0) +
    ROUND(COALESCE((SELECT balance FROM cash_positions WHERE box_name = 'JJ'), 0) / 2, 0) AS jacob_total_position,

  -- SETTLEMENT CALCULATION
  -- The partner with the higher total position "owes" the other to equalize
  ROUND((
    ABS(
      (COALESCE((SELECT balance FROM cash_positions WHERE box_name = 'Yossi'), 0) +
       ROUND(COALESCE((SELECT balance FROM cash_positions WHERE box_name = 'JJ'), 0) / 2, 0))
      -
      (COALESCE((SELECT balance FROM cash_positions WHERE box_name = 'Jacob'), 0) +
       ROUND(COALESCE((SELECT balance FROM cash_positions WHERE box_name = 'JJ'), 0) / 2, 0))
    )
  ) / 2, 0) AS settlement_amount,

  -- Direction: who pays whom
  CASE
    WHEN (COALESCE((SELECT balance FROM cash_positions WHERE box_name = 'Yossi'), 0) +
          ROUND(COALESCE((SELECT balance FROM cash_positions WHERE box_name = 'JJ'), 0) / 2, 0))
       > (COALESCE((SELECT balance FROM cash_positions WHERE box_name = 'Jacob'), 0) +
          ROUND(COALESCE((SELECT balance FROM cash_positions WHERE box_name = 'JJ'), 0) / 2, 0))
    THEN 'yossi_pays_jacob'
    WHEN (COALESCE((SELECT balance FROM cash_positions WHERE box_name = 'Jacob'), 0) +
          ROUND(COALESCE((SELECT balance FROM cash_positions WHERE box_name = 'JJ'), 0) / 2, 0))
       > (COALESCE((SELECT balance FROM cash_positions WHERE box_name = 'Yossi'), 0) +
          ROUND(COALESCE((SELECT balance FROM cash_positions WHERE box_name = 'JJ'), 0) / 2, 0))
    THEN 'jacob_pays_yossi'
    ELSE 'balanced'
  END AS direction

FROM partner_activity pa;
