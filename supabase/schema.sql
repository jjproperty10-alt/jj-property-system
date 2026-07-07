-- ============================================================
-- JJ PROPERTY 10 — DATABASE SCHEMA
-- Supabase / PostgreSQL
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- PROPERTIES
-- ============================================================
CREATE TABLE properties (
  id           UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name         TEXT NOT NULL,
  nickname     TEXT,
  status       TEXT, -- 'Airbnb', 'Rent', 'Sale', 'Rent&Sale', 'Inactive'
  address      TEXT,
  owner_name   TEXT,
  email        TEXT,
  phone        TEXT,
  notes        TEXT,
  location_url TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT properties_name_unique UNIQUE (name)
);

-- ============================================================
-- CONTACTS
-- ============================================================
CREATE TABLE contacts (
  id           UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name         TEXT NOT NULL,
  type         TEXT, -- 'Tenant','Owner','Contractor','Partner','Employee','Client','Platform'
  phone        TEXT,
  email        TEXT,
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- MAIN TRANSACTIONS TABLE
-- ============================================================
CREATE TABLE transactions (
  id             UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  date           DATE NOT NULL,
  property_id    UUID REFERENCES properties(id) ON DELETE SET NULL,
  property_name  TEXT,  -- denormalized for fast display
  category       TEXT NOT NULL,
  -- Purchase | Sale | Renovation | Management | Transfer | JJ | Airbnb | General
  subcategory    TEXT NOT NULL,
  description    TEXT,
  payer          TEXT,
  payee          TEXT,
  amount_eur     NUMERIC(12,2) NOT NULL DEFAULT 0,
  client_charge  NUMERIC(12,2),
  notes          TEXT,
  k_note         TEXT,  -- split / allocation flag
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_transactions_date         ON transactions(date DESC);
CREATE INDEX idx_transactions_property_id  ON transactions(property_id);
CREATE INDEX idx_transactions_category     ON transactions(category);
CREATE INDEX idx_transactions_payer        ON transactions(payer);
CREATE INDEX idx_transactions_payee        ON transactions(payee);

-- ============================================================
-- OWNERSHIP ENGINE
-- ============================================================
CREATE TABLE ownership (
  id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  owner_name  TEXT NOT NULL,  -- 'Yossi', 'Jacob', 'JJ', or client name
  percentage  NUMERIC(5,2) NOT NULL CHECK (percentage > 0 AND percentage <= 100),
  start_date  DATE,
  end_date    DATE,  -- NULL = current
  notes       TEXT
);

-- ============================================================
-- RENTAL CONTRACTS
-- ============================================================
CREATE TABLE rental_contracts (
  id                   UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  property_id          UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  tenant_name          TEXT NOT NULL,
  start_date           DATE NOT NULL,
  end_date             DATE,
  monthly_rent         NUMERIC(12,2) NOT NULL,
  deposit              NUMERIC(12,2) DEFAULT 0,
  payment_day          INTEGER CHECK (payment_day BETWEEN 1 AND 31),
  management_fee_type  TEXT DEFAULT 'percentage', -- 'fixed' | 'percentage'
  management_fee_value NUMERIC(10,2) DEFAULT 0,
  status               TEXT DEFAULT 'active', -- active | expired | terminated
  notes                TEXT,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- AIRBNB RESERVATIONS
-- ============================================================
CREATE TABLE airbnb_reservations (
  id                   UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  property_id          UUID REFERENCES properties(id) ON DELETE SET NULL,
  platform             TEXT, -- Airbnb | Booking | VRBO | Hostaway | Direct
  reservation_code     TEXT,
  guest_name           TEXT,
  check_in             DATE NOT NULL,
  check_out            DATE NOT NULL,
  nights               INTEGER GENERATED ALWAYS AS (check_out - check_in) STORED,
  revenue_eur          NUMERIC(12,2) DEFAULT 0,
  platform_fee         NUMERIC(12,2) DEFAULT 0,
  net_revenue          NUMERIC(12,2) GENERATED ALWAYS AS (revenue_eur - platform_fee) STORED,
  guest_package_charge NUMERIC(12,2) DEFAULT 10,
  notes                TEXT,
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- RENOVATION PROJECTS
-- ============================================================
CREATE TABLE renovation_projects (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  property_id     UUID REFERENCES properties(id) ON DELETE SET NULL,
  client_name     TEXT,
  contract_amount NUMERIC(12,2) DEFAULT 0,
  extras_amount   NUMERIC(12,2) DEFAULT 0,
  status          TEXT DEFAULT 'active', -- active | completed | cancelled
  start_date      DATE,
  end_date        DATE,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ALERTS
-- ============================================================
CREATE TABLE alerts (
  id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  type        TEXT NOT NULL,
  -- contract_ending | owner_payment_due | rent_unpaid | negative_profit | duplicate
  title       TEXT NOT NULL,
  description TEXT,
  property_id UUID REFERENCES properties(id) ON DELETE CASCADE,
  due_date    DATE,
  is_read     BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- VIEWS — CASH BOX POSITIONS
-- ============================================================

-- Maps raw payer/payee names to canonical cash box names
CREATE OR REPLACE VIEW v_cash_movements AS
SELECT
  id,
  date,
  category,
  subcategory,
  description,
  property_name,
  amount_eur,
  -- Normalize payer to cash box
  CASE
    WHEN LOWER(payer) IN ('yossi')                     THEN 'Yossi'
    WHEN LOWER(payer) IN ('jacob', 'yaacov')           THEN 'Jacob'
    WHEN LOWER(payer) IN ('jj', 'anastasia', 'atm')   THEN 'JJ'
    ELSE NULL
  END AS payer_box,
  -- Normalize payee to cash box
  CASE
    WHEN LOWER(payee) IN ('yossi')                     THEN 'Yossi'
    WHEN LOWER(payee) IN ('jacob', 'yaacov')           THEN 'Jacob'
    WHEN LOWER(payee) IN ('jj', 'anastasia')           THEN 'JJ'
    ELSE NULL
  END AS payee_box
FROM transactions;

CREATE OR REPLACE VIEW v_cash_positions AS
SELECT
  box_name,
  SUM(inflow) - SUM(outflow) AS balance
FROM (
  -- Money IN (payee = this box)
  SELECT payee_box AS box_name, amount_eur AS inflow, 0 AS outflow
  FROM v_cash_movements
  WHERE payee_box IS NOT NULL
    AND category != 'Transfer'
  UNION ALL
  -- Transfer IN
  SELECT payee_box AS box_name, amount_eur AS inflow, 0 AS outflow
  FROM v_cash_movements
  WHERE payee_box IS NOT NULL
    AND category = 'Transfer'
  UNION ALL
  -- Money OUT (payer = this box)
  SELECT payer_box AS box_name, 0 AS inflow, amount_eur AS outflow
  FROM v_cash_movements
  WHERE payer_box IS NOT NULL
) sub
WHERE box_name IS NOT NULL
GROUP BY box_name;

-- ============================================================
-- VIEW — PROPERTY FINANCIAL SUMMARY
-- ============================================================
CREATE OR REPLACE VIEW v_property_summary AS
SELECT
  p.id,
  p.name,
  p.nickname,
  p.status,
  -- Total invested (Purchase)
  COALESCE(SUM(CASE WHEN t.category = 'Purchase' THEN t.amount_eur ELSE 0 END), 0) AS total_purchased,
  -- Total sale received
  COALESCE(SUM(CASE WHEN t.category = 'Sale' AND t.subcategory IN ('Client Payment','Third-Party Payment') THEN t.amount_eur ELSE 0 END), 0) AS total_sale_received,
  -- Total renovation cost
  COALESCE(SUM(CASE WHEN t.category = 'Renovation' AND t.subcategory NOT IN ('Renovation Contract','Client Payment','Extras') THEN t.amount_eur ELSE 0 END), 0) AS renovation_costs,
  -- Renovation revenue (client payments)
  COALESCE(SUM(CASE WHEN t.category = 'Renovation' AND t.subcategory = 'Client Payment' THEN t.amount_eur ELSE 0 END), 0) AS renovation_revenue,
  -- Management income (tenant payments)
  COALESCE(SUM(CASE WHEN t.category = 'Management' AND t.subcategory IN ('Tenant Payment','Tenant Bank Payment','Client Payment') THEN t.amount_eur ELSE 0 END), 0) AS management_income,
  -- Management expenses
  COALESCE(SUM(CASE WHEN t.category = 'Management' AND t.subcategory NOT IN ('Tenant Payment','Tenant Bank Payment','Client Payment','Bank Payment to Owner','Management Fee') THEN t.amount_eur ELSE 0 END), 0) AS management_expenses,
  -- Management fees collected
  COALESCE(SUM(CASE WHEN t.category = 'Management' AND t.subcategory = 'Management Fee' THEN t.client_charge ELSE 0 END), 0) AS management_fees,
  -- Paid to owner
  COALESCE(SUM(CASE WHEN t.category = 'Management' AND t.subcategory = 'Bank Payment to Owner' THEN t.amount_eur ELSE 0 END), 0) AS paid_to_owner,
  -- Airbnb revenue
  COALESCE(SUM(CASE WHEN t.category = 'Airbnb' AND t.subcategory = 'Platform Income' THEN t.amount_eur ELSE 0 END), 0) AS airbnb_revenue,
  -- Airbnb expenses
  COALESCE(SUM(CASE WHEN t.category = 'Airbnb' AND t.subcategory != 'Platform Income' THEN t.amount_eur ELSE 0 END), 0) AS airbnb_expenses,
  COUNT(t.id) AS transaction_count
FROM properties p
LEFT JOIN transactions t ON t.property_id = p.id
GROUP BY p.id, p.name, p.nickname, p.status;

-- ============================================================
-- VIEW — OWNER BALANCES (per property)
-- ============================================================
CREATE OR REPLACE VIEW v_owner_balances AS
SELECT
  property_name,
  property_id,
  SUM(CASE WHEN subcategory IN ('Tenant Payment','Tenant Bank Payment','Client Payment')
           AND category = 'Management' THEN amount_eur ELSE 0 END) AS total_received,
  SUM(CASE WHEN subcategory NOT IN ('Tenant Payment','Tenant Bank Payment','Client Payment',
           'Bank Payment to Owner','Management Fee')
           AND category = 'Management' THEN amount_eur ELSE 0 END) AS total_expenses,
  SUM(CASE WHEN subcategory = 'Management Fee' AND category = 'Management'
           THEN COALESCE(client_charge, 0) ELSE 0 END) AS management_fees,
  SUM(CASE WHEN subcategory = 'Bank Payment to Owner' AND category = 'Management'
           THEN amount_eur ELSE 0 END) AS paid_to_owner,
  -- Balance due to owner = received - expenses - fees - already paid
  SUM(CASE WHEN subcategory IN ('Tenant Payment','Tenant Bank Payment','Client Payment')
           AND category = 'Management' THEN amount_eur ELSE 0 END)
  - SUM(CASE WHEN subcategory NOT IN ('Tenant Payment','Tenant Bank Payment','Client Payment',
           'Bank Payment to Owner','Management Fee')
           AND category = 'Management' THEN amount_eur ELSE 0 END)
  - SUM(CASE WHEN subcategory = 'Management Fee' AND category = 'Management'
           THEN COALESCE(client_charge, 0) ELSE 0 END)
  - SUM(CASE WHEN subcategory = 'Bank Payment to Owner' AND category = 'Management'
           THEN amount_eur ELSE 0 END) AS balance_due_to_owner
FROM transactions
WHERE category = 'Management'
GROUP BY property_name, property_id;

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE properties           ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts             ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE ownership            ENABLE ROW LEVEL SECURITY;
ALTER TABLE rental_contracts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE airbnb_reservations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE renovation_projects  ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts               ENABLE ROW LEVEL SECURITY;

-- USER ROLES TABLE (linked to Supabase Auth)
CREATE TABLE user_profiles (
  id       UUID REFERENCES auth.users(id) PRIMARY KEY,
  name     TEXT NOT NULL,
  role     TEXT NOT NULL DEFAULT 'employee',
  -- super_admin | partner_admin | airbnb_manager | rental_manager | employee
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Helper function to get current user role
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT AS $$
  SELECT role FROM user_profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER;

-- ---- TRANSACTIONS POLICIES ----

-- Super Admin and Partner Admin: full read
CREATE POLICY "admins_read_transactions" ON transactions
  FOR SELECT USING (
    get_my_role() IN ('super_admin', 'partner_admin')
  );

-- Super Admin: full write
CREATE POLICY "super_admin_write_transactions" ON transactions
  FOR ALL USING (get_my_role() = 'super_admin');

-- Airbnb Manager: read/write only Airbnb transactions
CREATE POLICY "airbnb_manager_transactions" ON transactions
  FOR ALL USING (
    get_my_role() = 'airbnb_manager'
    AND category IN ('Airbnb', 'Transfer')
  );

-- Rental Manager: read/write only Management transactions
CREATE POLICY "rental_manager_transactions" ON transactions
  FOR ALL USING (
    get_my_role() = 'rental_manager'
    AND category IN ('Management')
  );

-- ---- PROPERTIES POLICIES ----
CREATE POLICY "authenticated_read_properties" ON properties
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "super_admin_write_properties" ON properties
  FOR ALL USING (get_my_role() = 'super_admin');

-- ---- PARTNER ADMIN: no system settings ----
CREATE POLICY "partner_admin_read_all" ON ownership
  FOR SELECT USING (get_my_role() IN ('super_admin', 'partner_admin'));

CREATE POLICY "super_admin_write_ownership" ON ownership
  FOR ALL USING (get_my_role() = 'super_admin');

-- Rental contracts: admins + rental manager
CREATE POLICY "managers_read_rental_contracts" ON rental_contracts
  FOR SELECT USING (
    get_my_role() IN ('super_admin', 'partner_admin', 'rental_manager')
  );
CREATE POLICY "super_admin_write_rental_contracts" ON rental_contracts
  FOR ALL USING (get_my_role() IN ('super_admin', 'rental_manager'));

-- Airbnb reservations: admins + airbnb manager
CREATE POLICY "managers_read_airbnb" ON airbnb_reservations
  FOR SELECT USING (
    get_my_role() IN ('super_admin', 'partner_admin', 'airbnb_manager')
  );
CREATE POLICY "managers_write_airbnb" ON airbnb_reservations
  FOR ALL USING (get_my_role() IN ('super_admin', 'airbnb_manager'));

-- Alerts: all authenticated users can read their own
CREATE POLICY "read_alerts" ON alerts
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "admin_manage_alerts" ON alerts
  FOR ALL USING (get_my_role() = 'super_admin');

-- ============================================================
-- TRIGGERS — updated_at auto-update
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_transactions_updated_at
  BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_properties_updated_at
  BEFORE UPDATE ON properties
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_rental_contracts_updated_at
  BEFORE UPDATE ON rental_contracts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- DUPLICATE DETECTION VIEW
-- ============================================================
CREATE OR REPLACE VIEW v_possible_duplicates AS
SELECT
  t1.id AS id_1,
  t2.id AS id_2,
  t1.date,
  t1.amount_eur,
  t1.property_name,
  t1.description,
  t1.category,
  t1.subcategory
FROM transactions t1
JOIN transactions t2
  ON t1.id < t2.id
  AND t1.date = t2.date
  AND t1.amount_eur = t2.amount_eur
  AND LOWER(COALESCE(t1.property_name,'')) = LOWER(COALESCE(t2.property_name,''))
  AND LOWER(COALESCE(t1.description,'')) = LOWER(COALESCE(t2.description,''));

-- ============================================================
-- SEED: CATEGORY / SUBCATEGORY REFERENCE
-- ============================================================
CREATE TABLE category_subcategories (
  category    TEXT NOT NULL,
  subcategory TEXT NOT NULL,
  PRIMARY KEY (category, subcategory)
);

INSERT INTO category_subcategories (category, subcategory) VALUES
-- Purchase
('Purchase','Purchase Contract'),
('Purchase','Purchase Payment'),
('Purchase','Purchase Deposit'),
('Purchase','Purchase Expenses'),
('Purchase','Purchase Tax'),
('Purchase','Purchase Lawyer'),
('Purchase','Brokerage'),
('Purchase','Other'),
-- Sale
('Sale','Sale Contract'),
('Sale','Client Payment'),
('Sale','Third-Party Payment'),
('Sale','Client Sale Expenses'),
('Sale','Sale Lawyer'),
('Sale','Sale Tax'),
('Sale','Broker Fee'),
('Sale','Other'),
-- Renovation
('Renovation','Renovation Contract'),
('Renovation','Extras'),
('Renovation','Client Payment'),
('Renovation','Materials'),
('Renovation','Workers'),
('Renovation','Contractors'),
('Renovation','Cleaning'),
('Renovation','Transport / Removal'),
('Renovation','Repairs'),
('Renovation','Furniture'),
('Renovation','Electrical Appliances'),
('Renovation','Curtains'),
('Renovation','Design'),
('Renovation','Aluminium'),
('Renovation','Carpenter'),
('Renovation','Plumber'),
('Renovation','Other'),
-- Management
('Management','Tenant Payment'),
('Management','Tenant Bank Payment'),
('Management','Client Payment'),
('Management','Deposit'),
('Management','Deposit Refund'),
('Management','Electricity'),
('Management','Water'),
('Management','Internet'),
('Management','HOA'),
('Management','Municipality Tax'),
('Management','Insurance'),
('Management','Property Insurance'),
('Management','Repairs'),
('Management','Plumber'),
('Management','Cleaning'),
('Management','Furniture'),
('Management','Electrical Appliances'),
('Management','Curtains'),
('Management','Design'),
('Management','Key Duplication'),
('Management','Management Fee'),
('Management','Bank Payment to Owner'),
('Management','Other'),
-- Transfer
('Transfer','Transfer'),
('Transfer','Partner Loan'),
('Transfer','Expense Reimbursement'),
('Transfer','Cash Withdrawal'),
('Transfer','Owner Payment'),
-- JJ
('JJ','Office Rent'),
('JJ','Office Supplies'),
('JJ','Office Maintenance'),
('JJ','General Office Expenses'),
('JJ','Legal / Accountant'),
('JJ','Salary Anastasia'),
('JJ','Salary Fabi'),
('JJ','Salary Employee'),
('JJ','Electricity'),
('JJ','Water'),
('JJ','Internet'),
('JJ','Insurance'),
('JJ','Marketing'),
('JJ','Cleaning Supplies'),
('JJ','Refreshments'),
('JJ','Airbnb Operations'),
('JJ','Bazaraki'),
('JJ','JJ Income'),
('JJ','Software / Hostaway'),
('JJ','Photography'),
('JJ','Car Expenses'),
('JJ','Other'),
-- Airbnb
('Airbnb','Platform Income'),
('Airbnb','Management Fee'),
('Airbnb','Design Fee'),
('Airbnb','Client Payment'),
('Airbnb','Bank Payment to Owner'),
('Airbnb','Electricity Bill'),
('Airbnb','Water'),
('Airbnb','Internet'),
('Airbnb','HOA'),
('Airbnb','Pool Service'),
('Airbnb','Insurance'),
('Airbnb','Software / Hostaway'),
('Airbnb','Consumable Supplies'),
('Airbnb','Guest Supplies'),
('Airbnb','Bedding / Pillows / Blankets'),
('Airbnb','Airbnb Equipment'),
('Airbnb','Kitchen Supplies'),
('Airbnb','Wine'),
('Airbnb','Photography'),
('Airbnb','Repairs'),
('Airbnb','Furniture'),
('Airbnb','Electrical Appliances'),
('Airbnb','Design'),
('Airbnb','Contractors'),
('Airbnb','Municipality Tax'),
('Airbnb','Other');
