-- Empty relations the cumulative reader references.
-- Not a migration. The 20260919160000 runner installs these only so
-- 20261002150000 can replace the reader before the matrix.
-- No rows: this fixture has no owner-level obligations or cash executions.

CREATE TABLE IF NOT EXISTS finance.client_owner_level_obligations (
  id uuid PRIMARY KEY,
  entity_id uuid NOT NULL,
  source_transaction_id uuid NOT NULL,
  component_code text NOT NULL,
  effective_date date NOT NULL,
  amount_due_to_jj numeric(12,2) NOT NULL,
  status text NOT NULL
);

CREATE TABLE IF NOT EXISTS finance.client_obligation_property_bindings (
  id uuid PRIMARY KEY,
  certification_line_id uuid NOT NULL,
  property_id uuid,
  status text NOT NULL
);

CREATE TABLE IF NOT EXISTS finance.client_cash_settlement_executions (
  id uuid PRIMARY KEY,
  entity_id uuid NOT NULL,
  direction text NOT NULL,
  amount numeric(12,2) NOT NULL,
  effective_date date NOT NULL,
  transaction_id uuid NOT NULL,
  reversal_of uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS finance.client_obligation_fifo_allocations (
  id uuid PRIMARY KEY,
  execution_id uuid NOT NULL,
  certification_line_id uuid NOT NULL,
  signed_amount numeric(12,2) NOT NULL
);

CREATE OR REPLACE VIEW finance.v_client_obligation_unbound_lines AS
SELECT
  c.id AS certification_id,
  l.id AS source_line_identity,
  l.property_key,
  l.line_order,
  pg_catalog.round((- l.amount_due_to_jj), 2) AS original_signed_amount,
  'unbound_certification_line'::text AS blocked_code
FROM finance.client_settlement_certification_lines l
JOIN finance.client_settlement_certifications c
  ON c.id = l.certification_id
WHERE c.status = 'applied';
