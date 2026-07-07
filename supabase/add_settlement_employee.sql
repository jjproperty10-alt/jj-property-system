-- ============================================================
-- JJ PROPERTY 10 — Settlement & Employee Views
-- Run this in Supabase SQL Editor
-- ============================================================

-- Employee config table (who counts as which role)
CREATE TABLE IF NOT EXISTS employee_config (
  id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,  -- exactly as it appears in payer/payee
  role        TEXT NOT NULL,         -- 'employee' | 'partner' | 'owner'
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Seed with current employees (can be updated via UI)
INSERT INTO employee_config (name, role) VALUES
  ('Anastasia', 'employee'),
  ('Fabi',      'employee'),
  ('fabi',      'employee'),
  ('Yossi',     'partner'),
  ('Jacob',     'partner'),
  ('JJ',        'jj')
ON CONFLICT (name) DO NOTHING;

-- Allow anon read
ALTER TABLE employee_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_read_employee_config" ON employee_config FOR SELECT USING (true);
CREATE POLICY "admin_write_employee_config" ON employee_config FOR ALL USING (true);

-- ============================================================
-- EMPLOYEE REIMBURSEMENT VIEW
-- Employee advanced money → JJ owes them back
-- ============================================================
DROP VIEW IF EXISTS v_employee_reimbursements CASCADE;
CREATE VIEW v_employee_reimbursements AS
SELECT
  t.payer AS employee_name,
  -- Total employee advanced (paid from own pocket for company)
  ROUND(SUM(CASE WHEN t.category != 'Transfer' THEN t.amount_eur ELSE 0 END), 2) AS total_advanced,
  -- Total reimbursed back to employee (Transfer payee = employee)
  ROUND((
    SELECT COALESCE(SUM(t2.amount_eur), 0)
    FROM transactions t2
    WHERE LOWER(t2.payee) = LOWER(t.payer)
      AND t2.category = 'Transfer'
  ), 2) AS total_reimbursed,
  -- Outstanding balance JJ owes employee
  ROUND(
    SUM(CASE WHEN t.category != 'Transfer' THEN t.amount_eur ELSE 0 END)
    - COALESCE((
        SELECT SUM(t2.amount_eur)
        FROM transactions t2
        WHERE LOWER(t2.payee) = LOWER(t.payer)
          AND t2.category = 'Transfer'
      ), 0)
  , 2) AS outstanding_balance,
  COUNT(CASE WHEN t.category != 'Transfer' THEN 1 END) AS transaction_count
FROM transactions t
WHERE LOWER(t.payer) IN (
  SELECT LOWER(ec.name) FROM employee_config ec WHERE ec.role = 'employee'
)
GROUP BY t.payer
HAVING SUM(CASE WHEN t.category != 'Transfer' THEN t.amount_eur ELSE 0 END) > 0;

-- ============================================================
-- PARTNER SETTLEMENT VIEW
-- Who owes who — based on cash positions & investments
-- ============================================================
DROP VIEW IF EXISTS v_partner_settlement CASCADE;
CREATE VIEW v_partner_settlement AS
WITH cash AS (
  SELECT box_name, ROUND(balance, 0) AS balance
  FROM v_cash_positions
  WHERE box_name IN ('Yossi', 'Jacob', 'JJ')
),
total_cash AS (
  SELECT SUM(balance) AS total FROM cash
),
ideal AS (
  -- 50/50 split between Yossi and Jacob (JJ is company)
  SELECT
    (SELECT balance FROM cash WHERE box_name = 'Yossi') AS yossi_actual,
    (SELECT balance FROM cash WHERE box_name = 'Jacob') AS jacob_actual,
    (SELECT balance FROM cash WHERE box_name = 'JJ')    AS jj_actual,
    -- Equal share of personal cash (Yossi + Jacob)
    ROUND(((SELECT balance FROM cash WHERE box_name = 'Yossi')
         + (SELECT balance FROM cash WHERE box_name = 'Jacob')) / 2, 0) AS ideal_each
)
SELECT
  yossi_actual,
  jacob_actual,
  jj_actual,
  ideal_each,
  -- How much Yossi is over/under his ideal share
  yossi_actual - ideal_each AS yossi_vs_ideal,
  -- How much Jacob is over/under
  jacob_actual - ideal_each AS jacob_vs_ideal,
  -- Settlement recommendation:
  -- If Yossi > ideal → Jacob should pay Yossi
  -- If Jacob > ideal → Yossi should pay Jacob
  CASE
    WHEN yossi_actual > jacob_actual
      THEN ROUND((yossi_actual - jacob_actual) / 2, 0)
    ELSE 0
  END AS jacob_should_pay_yossi,
  CASE
    WHEN jacob_actual > yossi_actual
      THEN ROUND((jacob_actual - yossi_actual) / 2, 0)
    ELSE 0
  END AS yossi_should_pay_jacob
FROM ideal;

-- ============================================================
-- UPDATE CASH MOVEMENTS: Make employees generic
-- ============================================================
DROP VIEW IF EXISTS v_cash_movements CASCADE;
CREATE VIEW v_cash_movements AS
SELECT
  id, date, category, subcategory, description, property_name, amount_eur,
  -- Payer → cash box mapping
  CASE
    WHEN LOWER(payer) = 'yossi'    THEN 'Yossi'
    WHEN LOWER(payer) IN ('jacob', 'yaacov') THEN 'Jacob'
    WHEN LOWER(payer) = 'jj'       THEN 'JJ'
    -- Employees: their payments come FROM JJ cash
    WHEN LOWER(payer) IN (SELECT LOWER(name) FROM employee_config WHERE role = 'employee')
      THEN 'JJ'
    WHEN LOWER(payer) = 'atm'      THEN 'JJ'
    ELSE NULL
  END AS payer_box,
  -- Payee → cash box mapping
  CASE
    WHEN LOWER(payee) = 'yossi'    THEN 'Yossi'
    WHEN LOWER(payee) IN ('jacob', 'yaacov') THEN 'Jacob'
    WHEN LOWER(payee) = 'jj'       THEN 'JJ'
    WHEN LOWER(payee) IN (SELECT LOWER(name) FROM employee_config WHERE role = 'employee')
      THEN 'JJ'
    ELSE NULL
  END AS payee_box,
  -- Is this an employee transaction?
  CASE WHEN LOWER(payer) IN (SELECT LOWER(name) FROM employee_config WHERE role = 'employee')
    THEN TRUE ELSE FALSE END AS is_employee_payer
FROM transactions;

-- Recreate cash positions
DROP VIEW IF EXISTS v_cash_positions CASCADE;
CREATE VIEW v_cash_positions AS
SELECT box_name, ROUND(SUM(inflow) - SUM(outflow), 2) AS balance
FROM (
  SELECT payee_box AS box_name, amount_eur AS inflow, 0 AS outflow
  FROM v_cash_movements WHERE payee_box IS NOT NULL
  UNION ALL
  SELECT payer_box AS box_name, 0 AS inflow, amount_eur AS outflow
  FROM v_cash_movements WHERE payer_box IS NOT NULL
) sub
WHERE box_name IS NOT NULL
GROUP BY box_name;
