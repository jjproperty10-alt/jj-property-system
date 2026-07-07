-- ============================================================
-- JJ PROPERTY 10 — COMPLETE VIEW FIX
-- Paste this entire file in Supabase SQL Editor and click Run
-- ============================================================

-- Step 1: Drop all old views
DROP VIEW IF EXISTS v_property_summary CASCADE;
DROP VIEW IF EXISTS v_ceo_summary CASCADE;
DROP VIEW IF EXISTS v_owner_balances CASCADE;
DROP VIEW IF EXISTS v_cash_movements CASCADE;
DROP VIEW IF EXISTS v_cash_positions CASCADE;
DROP VIEW IF EXISTS v_money_location CASCADE;
DROP VIEW IF EXISTS v_settlement CASCADE;
DROP VIEW IF EXISTS v_renovation_summary CASCADE;
DROP VIEW IF EXISTS v_airbnb_summary CASCADE;
DROP VIEW IF EXISTS v_possible_duplicates CASCADE;

-- ============================================================
-- CASH MOVEMENTS & POSITIONS
-- ============================================================
CREATE VIEW v_cash_movements AS
SELECT
  id, date, category, subcategory, description, property_name, amount_eur,
  CASE
    WHEN LOWER(payer) = 'yossi'                       THEN 'Yossi'
    WHEN LOWER(payer) IN ('jacob','yaacov')            THEN 'Jacob'
    WHEN LOWER(payer) IN ('jj','anastasia','atm','fabi') THEN 'JJ'
    ELSE NULL
  END AS payer_box,
  CASE
    WHEN LOWER(payee) = 'yossi'                       THEN 'Yossi'
    WHEN LOWER(payee) IN ('jacob','yaacov')            THEN 'Jacob'
    WHEN LOWER(payee) IN ('jj','anastasia','fabi')     THEN 'JJ'
    ELSE NULL
  END AS payee_box
FROM transactions;

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

-- ============================================================
-- PROPERTY SUMMARY — FIXED
-- Key fixes:
--   1. Third-Party Payment separated (goes to seller, NOT JJ cash)
--   2. Renovation Extras uses ClientCharge (what we charge client)
--   3. Purchase Contract separate from Purchase Paid
-- ============================================================
CREATE VIEW v_property_summary AS
SELECT
  p.id, p.name, p.nickname, p.status,

  -- === PURCHASE ===
  COALESCE(SUM(CASE WHEN t.category='Purchase' AND t.subcategory='Purchase Contract'
    THEN t.amount_eur ELSE 0 END),0) AS purchase_contract,
  COALESCE(SUM(CASE WHEN t.category='Purchase' AND t.subcategory NOT IN ('Purchase Contract')
    THEN t.amount_eur ELSE 0 END),0) AS purchase_paid,

  -- === SALE ===
  COALESCE(SUM(CASE WHEN t.category='Sale' AND t.subcategory='Sale Contract'
    THEN t.amount_eur ELSE 0 END),0) AS sale_contract,
  -- Client Payment = cash that enters JJ/Yossi/Jacob
  COALESCE(SUM(CASE WHEN t.category='Sale' AND t.subcategory='Client Payment'
    THEN t.amount_eur ELSE 0 END),0) AS sale_received,
  -- Third-Party Payment = buyer paid seller directly (reduces balance but NOT JJ cash)
  COALESCE(SUM(CASE WHEN t.category='Sale' AND t.subcategory='Third-Party Payment'
    THEN t.amount_eur ELSE 0 END),0) AS third_party_payment,
  -- Sale costs (lawyer, tax, broker)
  COALESCE(SUM(CASE WHEN t.category='Sale' AND t.subcategory IN
    ('Sale Lawyer','Sale Tax','Broker Fee','Client Sale Expenses')
    THEN t.amount_eur ELSE 0 END),0) AS sale_costs,

  -- === RENOVATION ===
  COALESCE(SUM(CASE WHEN t.category='Renovation' AND t.subcategory='Renovation Contract'
    THEN t.amount_eur ELSE 0 END),0) AS renovation_contract,
  -- Extras: use ClientCharge (what we charge the client), not AmountEUR (what it costs)
  COALESCE(SUM(CASE WHEN t.category='Renovation' AND t.subcategory='Extras'
    THEN COALESCE(t.client_charge, t.amount_eur) ELSE 0 END),0) AS renovation_extras_charge,
  COALESCE(SUM(CASE WHEN t.category='Renovation' AND t.subcategory='Extras'
    THEN t.amount_eur ELSE 0 END),0) AS renovation_extras_cost,
  -- Client payments received
  COALESCE(SUM(CASE WHEN t.category='Renovation' AND t.subcategory='Client Payment'
    THEN t.amount_eur ELSE 0 END),0) AS renovation_received,
  -- Actual costs (workers, materials, etc.)
  COALESCE(SUM(CASE WHEN t.category='Renovation' AND t.subcategory NOT IN
    ('Renovation Contract','Extras','Client Payment')
    THEN t.amount_eur ELSE 0 END),0) AS renovation_costs,

  -- === MANAGEMENT ===
  COALESCE(SUM(CASE WHEN t.category='Management' AND t.subcategory IN
    ('Tenant Payment','Tenant Bank Payment','Client Payment')
    THEN t.amount_eur ELSE 0 END),0) AS management_income,
  COALESCE(SUM(CASE WHEN t.category='Management' AND t.subcategory NOT IN
    ('Tenant Payment','Tenant Bank Payment','Client Payment','Bank Payment to Owner','Management Fee','Deposit','Deposit Refund')
    THEN t.amount_eur ELSE 0 END),0) AS management_expenses,
  COALESCE(SUM(CASE WHEN t.category='Management' AND t.subcategory='Management Fee'
    THEN COALESCE(t.client_charge, t.amount_eur) ELSE 0 END),0) AS management_fees,
  COALESCE(SUM(CASE WHEN t.category='Management' AND t.subcategory='Bank Payment to Owner'
    THEN t.amount_eur ELSE 0 END),0) AS paid_to_owner,
  COALESCE(SUM(CASE WHEN t.category='Management' AND t.subcategory='Deposit'
    THEN t.amount_eur ELSE 0 END),0) AS deposit_held,

  -- === AIRBNB ===
  COALESCE(SUM(CASE WHEN t.category='Airbnb' AND t.subcategory='Platform Income'
    THEN t.amount_eur ELSE 0 END),0) AS airbnb_platform_income,
  COALESCE(SUM(CASE WHEN t.category='Airbnb' AND t.subcategory IN ('Management Fee','Design Fee')
    THEN COALESCE(t.client_charge, t.amount_eur) ELSE 0 END),0) AS airbnb_management_fee,
  COALESCE(SUM(CASE WHEN t.category='Airbnb' AND t.subcategory='Bank Payment to Owner'
    THEN t.amount_eur ELSE 0 END),0) AS airbnb_paid_to_owner,
  COALESCE(SUM(CASE WHEN t.category='Airbnb' AND t.subcategory NOT IN
    ('Platform Income','Management Fee','Design Fee','Bank Payment to Owner','Client Payment')
    THEN t.amount_eur ELSE 0 END),0) AS airbnb_expenses,

  COUNT(t.id) AS transaction_count
FROM properties p
LEFT JOIN transactions t ON t.property_id = p.id
GROUP BY p.id, p.name, p.nickname, p.status;

-- ============================================================
-- OWNER BALANCES (Management)
-- ============================================================
CREATE VIEW v_owner_balances AS
SELECT
  property_name, property_id,
  SUM(CASE WHEN subcategory IN ('Tenant Payment','Tenant Bank Payment','Client Payment')
    AND category='Management' THEN amount_eur ELSE 0 END) AS total_received,
  SUM(CASE WHEN subcategory NOT IN ('Tenant Payment','Tenant Bank Payment','Client Payment',
    'Bank Payment to Owner','Management Fee','Deposit','Deposit Refund')
    AND category='Management' THEN amount_eur ELSE 0 END) AS total_expenses,
  SUM(CASE WHEN subcategory='Management Fee' AND category='Management'
    THEN COALESCE(client_charge, amount_eur) ELSE 0 END) AS management_fees,
  SUM(CASE WHEN subcategory='Bank Payment to Owner' AND category='Management'
    THEN amount_eur ELSE 0 END) AS paid_to_owner,
  -- Balance due to owner
  SUM(CASE WHEN subcategory IN ('Tenant Payment','Tenant Bank Payment','Client Payment')
    AND category='Management' THEN amount_eur ELSE 0 END)
  - SUM(CASE WHEN subcategory NOT IN ('Tenant Payment','Tenant Bank Payment','Client Payment',
    'Bank Payment to Owner','Management Fee','Deposit','Deposit Refund')
    AND category='Management' THEN amount_eur ELSE 0 END)
  - SUM(CASE WHEN subcategory='Management Fee' AND category='Management'
    THEN COALESCE(client_charge, amount_eur) ELSE 0 END)
  - SUM(CASE WHEN subcategory='Bank Payment to Owner' AND category='Management'
    THEN amount_eur ELSE 0 END) AS balance_due_to_owner
FROM transactions
WHERE category='Management'
GROUP BY property_name, property_id;

-- ============================================================
-- RENOVATION SUMMARY (per property, detailed)
-- ============================================================
CREATE VIEW v_renovation_summary AS
SELECT
  p.id AS property_id,
  p.name AS property_name,
  -- What we promised to deliver
  COALESCE(SUM(CASE WHEN t.subcategory='Renovation Contract' THEN t.amount_eur ELSE 0 END),0) AS contract_value,
  -- Extras: charged to client (ClientCharge)
  COALESCE(SUM(CASE WHEN t.subcategory='Extras'
    THEN COALESCE(t.client_charge, t.amount_eur) ELSE 0 END),0) AS extras_charge,
  -- Total client charge = contract + extras
  COALESCE(SUM(CASE WHEN t.subcategory='Renovation Contract' THEN t.amount_eur ELSE 0 END),0)
  + COALESCE(SUM(CASE WHEN t.subcategory='Extras'
    THEN COALESCE(t.client_charge, t.amount_eur) ELSE 0 END),0) AS total_client_charge,
  -- What client has actually paid
  COALESCE(SUM(CASE WHEN t.subcategory='Client Payment' THEN t.amount_eur ELSE 0 END),0) AS client_paid,
  -- Client balance = what they still owe us
  (COALESCE(SUM(CASE WHEN t.subcategory='Renovation Contract' THEN t.amount_eur ELSE 0 END),0)
  + COALESCE(SUM(CASE WHEN t.subcategory='Extras'
    THEN COALESCE(t.client_charge, t.amount_eur) ELSE 0 END),0))
  - COALESCE(SUM(CASE WHEN t.subcategory='Client Payment' THEN t.amount_eur ELSE 0 END),0) AS client_balance,
  -- Actual costs (workers, materials, cleaning, etc.)
  COALESCE(SUM(CASE WHEN t.subcategory NOT IN ('Renovation Contract','Extras','Client Payment')
    THEN t.amount_eur ELSE 0 END),0) AS actual_costs,
  -- Real profit = what client paid - what it cost us
  COALESCE(SUM(CASE WHEN t.subcategory='Client Payment' THEN t.amount_eur ELSE 0 END),0)
  - COALESCE(SUM(CASE WHEN t.subcategory NOT IN ('Renovation Contract','Extras','Client Payment')
    THEN t.amount_eur ELSE 0 END),0) AS real_profit,
  -- Expected profit = total charge - total costs
  (COALESCE(SUM(CASE WHEN t.subcategory='Renovation Contract' THEN t.amount_eur ELSE 0 END),0)
  + COALESCE(SUM(CASE WHEN t.subcategory='Extras'
    THEN COALESCE(t.client_charge, t.amount_eur) ELSE 0 END),0))
  - COALESCE(SUM(CASE WHEN t.subcategory NOT IN ('Renovation Contract','Extras','Client Payment')
    THEN t.amount_eur ELSE 0 END),0) AS expected_profit,
  COUNT(t.id) AS transaction_count
FROM properties p
JOIN transactions t ON t.property_id = p.id AND t.category = 'Renovation'
GROUP BY p.id, p.name;

-- ============================================================
-- AIRBNB SUMMARY (per property, owner statement)
-- ============================================================
CREATE VIEW v_airbnb_summary AS
SELECT
  p.id AS property_id,
  p.name AS property_name,
  COALESCE(SUM(CASE WHEN t.subcategory='Platform Income' THEN t.amount_eur ELSE 0 END),0) AS platform_income,
  COALESCE(SUM(CASE WHEN t.subcategory IN ('Electricity Bill','Electricity') THEN t.amount_eur ELSE 0 END),0) AS electricity,
  COALESCE(SUM(CASE WHEN t.subcategory='Internet' THEN t.amount_eur ELSE 0 END),0) AS internet,
  COALESCE(SUM(CASE WHEN t.subcategory='Water' THEN t.amount_eur ELSE 0 END),0) AS water,
  COALESCE(SUM(CASE WHEN t.subcategory='HOA' THEN t.amount_eur ELSE 0 END),0) AS hoa,
  COALESCE(SUM(CASE WHEN t.subcategory='Pool Service' THEN t.amount_eur ELSE 0 END),0) AS pool_service,
  COALESCE(SUM(CASE WHEN t.subcategory='Insurance' THEN t.amount_eur ELSE 0 END),0) AS insurance,
  COALESCE(SUM(CASE WHEN t.subcategory IN ('Consumable Supplies','Guest Supplies','Kitchen Supplies') THEN t.amount_eur ELSE 0 END),0) AS consumables,
  COALESCE(SUM(CASE WHEN t.subcategory IN ('Cleaning','cleaning') THEN t.amount_eur ELSE 0 END),0) AS cleaning,
  COALESCE(SUM(CASE WHEN t.subcategory IN ('Repairs','Furniture','Electrical Appliances','Design') THEN t.amount_eur ELSE 0 END),0) AS maintenance,
  COALESCE(SUM(CASE WHEN t.subcategory='Management Fee'
    THEN COALESCE(t.client_charge, t.amount_eur) ELSE 0 END),0) AS management_fee,
  COALESCE(SUM(CASE WHEN t.subcategory='Bank Payment to Owner' THEN t.amount_eur ELSE 0 END),0) AS paid_to_owner,
  COALESCE(SUM(CASE WHEN t.subcategory NOT IN (
    'Platform Income','Electricity Bill','Electricity','Internet','Water','HOA','Pool Service',
    'Insurance','Consumable Supplies','Guest Supplies','Kitchen Supplies','Cleaning','cleaning',
    'Repairs','Furniture','Electrical Appliances','Design','Management Fee','Design Fee',
    'Bank Payment to Owner','Client Payment','Software / Hostaway'
  ) THEN t.amount_eur ELSE 0 END),0) AS other_expenses,
  COALESCE(SUM(CASE WHEN t.subcategory='Software / Hostaway' THEN t.amount_eur ELSE 0 END),0) AS software,
  -- Owner balance = income - all expenses - mgmt fee - paid
  COALESCE(SUM(CASE WHEN t.subcategory='Platform Income' THEN t.amount_eur ELSE 0 END),0)
  - COALESCE(SUM(CASE WHEN t.subcategory NOT IN ('Platform Income','Management Fee','Design Fee','Bank Payment to Owner','Client Payment')
    THEN t.amount_eur ELSE 0 END),0)
  - COALESCE(SUM(CASE WHEN t.subcategory='Management Fee'
    THEN COALESCE(t.client_charge, t.amount_eur) ELSE 0 END),0)
  - COALESCE(SUM(CASE WHEN t.subcategory='Bank Payment to Owner' THEN t.amount_eur ELSE 0 END),0) AS owner_balance_due,
  COUNT(t.id) AS transaction_count
FROM properties p
JOIN transactions t ON t.property_id = p.id AND t.category = 'Airbnb'
GROUP BY p.id, p.name;

-- ============================================================
-- CEO SUMMARY
-- ============================================================
CREATE VIEW v_ceo_summary AS
SELECT
  -- Real Profit by category (cash only — no contracts)
  ROUND(SUM(renovation_received - renovation_costs),0)                              AS renovation_real_profit,
  ROUND(SUM(sale_received - purchase_paid - sale_costs),0)                          AS sale_real_profit,
  ROUND(SUM(management_income - management_expenses - management_fees),0)           AS management_real_profit,
  ROUND(SUM(airbnb_platform_income - airbnb_expenses),0)                            AS airbnb_real_profit,
  ROUND(SUM(
    (renovation_received - renovation_costs)
    +(sale_received - purchase_paid - sale_costs)
    +(management_income - management_expenses - management_fees)
    +(airbnb_platform_income - airbnb_expenses)
  ),0) AS total_real_profit,

  -- FUTURE PROFIT = Expected net profit from open contracts
  -- Renovation: Total charge - Total costs (margin)
  ROUND(SUM(GREATEST(0,
    (renovation_contract + renovation_extras_charge) - renovation_costs
    - GREATEST(0, renovation_received - renovation_costs)
  )),0) AS renovation_future,
  -- Sale: Sale contract - Purchase contract - costs (margin not yet realized)
  ROUND(SUM(GREATEST(0,
    (sale_contract - purchase_contract - sale_costs)
    - GREATEST(0, sale_received - purchase_paid - sale_costs)
  )),0) AS sale_future,
  ROUND(SUM(
    GREATEST(0,(renovation_contract + renovation_extras_charge) - renovation_costs - GREATEST(0, renovation_received - renovation_costs))
    + GREATEST(0,(sale_contract - purchase_contract - sale_costs) - GREATEST(0, sale_received - purchase_paid - sale_costs))
  ),0) AS total_future_profit,

  -- RECEIVABLES = Cash still owed to us by clients (different from Future Profit!)
  -- Renovation receivable: what clients still need to pay
  ROUND(SUM(GREATEST(0,(renovation_contract + renovation_extras_charge) - renovation_received)),0) AS renovation_receivable,
  -- Sale receivable: what buyers still need to pay
  ROUND(SUM(GREATEST(0, sale_contract - sale_received - third_party_payment)),0)    AS sale_receivable,
  ROUND(SUM(
    GREATEST(0,(renovation_contract + renovation_extras_charge) - renovation_received)
    + GREATEST(0, sale_contract - sale_received - third_party_payment)
  ),0) AS total_receivables,

  -- Invested (actual cash paid only, never contract values)
  ROUND(SUM(purchase_paid),0) AS total_invested,

  -- Owner balances (management)
  ROUND(SUM(management_income - management_expenses - management_fees - paid_to_owner),0) AS management_owner_balance

FROM v_property_summary;

-- ============================================================
-- MONEY LOCATION — Where is the money right now?
-- ============================================================
CREATE VIEW v_money_location AS
-- CASH BOXES
SELECT '💵 Cash — Yossi' AS location, 1 AS sort_order, COALESCE(b.balance, 0) AS amount
  FROM v_cash_positions b WHERE b.box_name = 'Yossi'
UNION ALL
SELECT '💵 Cash — Jacob', 2, COALESCE(b.balance, 0)
  FROM v_cash_positions b WHERE b.box_name = 'Jacob'
UNION ALL
SELECT '💵 Cash — JJ', 3, COALESCE(b.balance, 0)
  FROM v_cash_positions b WHERE b.box_name = 'JJ'
UNION ALL
-- INVESTED IN PROPERTIES (unsold)
SELECT '🏠 Invested in Properties', 4,
  ROUND(SUM(purchase_paid), 0)
  FROM v_property_summary WHERE sale_contract = 0 AND purchase_paid > 0
UNION ALL
-- OPEN RENOVATION COSTS (money out, not yet recovered)
SELECT '🔨 Open Renovation Costs', 5,
  ROUND(SUM(GREATEST(0, renovation_costs - renovation_received)), 0)
  FROM v_property_summary WHERE renovation_costs > renovation_received
UNION ALL
-- RECEIVABLES — RENOVATION (clients owe us)
SELECT '📋 Receivables — Renovation', 6,
  ROUND(SUM(GREATEST(0,(renovation_contract + renovation_extras_charge) - renovation_received)), 0)
  FROM v_property_summary WHERE renovation_contract > 0
UNION ALL
-- RECEIVABLES — SALE (buyers owe us)
SELECT '📋 Receivables — Sale', 7,
  ROUND(SUM(GREATEST(0, sale_contract - sale_received - third_party_payment)), 0)
  FROM v_property_summary WHERE sale_contract > 0
UNION ALL
-- DUE TO OWNERS (management — we hold this money for owners)
SELECT '⚠️ Due to Owners (Management)', 8,
  ROUND(SUM(balance_due_to_owner), 0) * -1
  FROM v_owner_balances WHERE balance_due_to_owner > 0
UNION ALL
-- DUE FROM TENANTS (unpaid rent from active contracts)
SELECT '🏠 Due from Tenants', 9,
  COALESCE((
    SELECT ROUND(SUM(rc.monthly_rent * 0.5), 0)
    FROM rental_contracts rc WHERE rc.status = 'active'
  ), 0);

-- ============================================================
-- DUPLICATE DETECTION
-- ============================================================
CREATE VIEW v_possible_duplicates AS
SELECT
  t1.id AS id_1, t2.id AS id_2,
  t1.date, t1.amount_eur, t1.property_name,
  t1.description, t1.category, t1.subcategory
FROM transactions t1
JOIN transactions t2
  ON t1.id < t2.id
  AND t1.date = t2.date
  AND t1.amount_eur = t2.amount_eur
  AND LOWER(COALESCE(t1.property_name,'')) = LOWER(COALESCE(t2.property_name,''))
  AND LOWER(COALESCE(t1.description,'')) = LOWER(COALESCE(t2.description,''));
