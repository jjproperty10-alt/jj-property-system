-- Isolated extras for 20260919190000. Disposable DB only. No Tamir. No Production.
-- Recreates the production-shaped owner_transaction_links table because the
-- 19170000 isolated stub is too thin. link_role matches origin/main
-- (owner_level_payment only). Phase 2E migration expands the constraint.

DROP VIEW IF EXISTS finance.v_owner_level_payment_conflicts;
DROP VIEW IF EXISTS finance.v_owner_level_payments;
DROP TABLE IF EXISTS finance.owner_transaction_links;

CREATE TABLE finance.owner_transaction_links (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id    UUID NOT NULL REFERENCES public.transactions(id),
  owner_entity_id   UUID NOT NULL REFERENCES lifecycle.entity_identity(id),
  link_role         TEXT NOT NULL
                    CHECK (link_role IN ('owner_level_payment')),
  idempotency_key   TEXT NOT NULL UNIQUE,
  review_status     TEXT NOT NULL DEFAULT 'approved'
                    CHECK (review_status IN ('approved', 'needs_review', 'ignored')),
  is_deleted        BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by        TEXT NOT NULL,
  deleted_at        TIMESTAMPTZ,
  deleted_by        TEXT,
  notes             TEXT
);

CREATE OR REPLACE VIEW finance.v_owner_level_payments
  WITH (security_invoker = true)
AS
SELECT
  t.id                         AS transaction_id,
  l.owner_entity_id,
  e.canonical_name             AS owner_display_name,
  t.date,
  t.payer,
  t.payee,
  t.amount_eur,
  t.description,
  t.k_note,
  l.idempotency_key,
  l.review_status,
  l.link_role,
  l.created_at,
  l.notes
FROM finance.owner_transaction_links l
JOIN public.transactions t
  ON t.id = l.transaction_id
JOIN lifecycle.entity_identity e
  ON e.id = l.owner_entity_id
WHERE false;

CREATE OR REPLACE VIEW finance.v_owner_level_payment_conflicts
  WITH (security_invoker = true)
AS
SELECT
  t.id                         AS transaction_id,
  l.owner_entity_id,
  t.property_id,
  t.property_name,
  t.date,
  t.payer,
  t.amount_eur,
  l.idempotency_key,
  l.review_status,
  l.is_deleted                 AS link_is_deleted
FROM finance.owner_transaction_links l
JOIN public.transactions t
  ON t.id = l.transaction_id
WHERE false;

CREATE OR REPLACE VIEW public.v_transactions_reporting AS
SELECT t.*, t.property_name AS reporting_name
FROM public.transactions t;

GRANT SELECT ON public.v_transactions_reporting TO authenticated, service_role;
REVOKE ALL ON TABLE finance.owner_transaction_links FROM PUBLIC;
REVOKE ALL ON TABLE finance.owner_transaction_links FROM anon, authenticated, service_role;
ALTER TABLE finance.owner_transaction_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.owner_transaction_links FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_owner_transaction_links ON finance.owner_transaction_links;
CREATE POLICY deny_all_owner_transaction_links
  ON finance.owner_transaction_links AS RESTRICTIVE
  FOR ALL TO public
  USING (false)
  WITH CHECK (false);

INSERT INTO lifecycle.entity_identity (id, canonical_name, entity_type, status)
VALUES ('66666666-6666-4666-8666-666666666666', 'Client Zeta', 'external', 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.properties (id, name) VALUES
  ('12121212-1212-4121-8121-121212121212', 'Fixture Property Z'),
  ('13131313-1313-4131-8131-131313131313', 'Fixture Property Z2')
ON CONFLICT (id) DO NOTHING;

INSERT INTO lifecycle.entity_property_associations (id, entity_id, property_id, association_source, status) VALUES
  ('abababab-abab-4aba-8aba-abababababa1', '66666666-6666-4666-8666-666666666666', '12121212-1212-4121-8121-121212121212', 'wizard', 'active'),
  ('abababab-abab-4aba-8aba-abababababa2', '66666666-6666-4666-8666-666666666666', '13131313-1313-4131-8131-131313131313', 'wizard', 'active')
ON CONFLICT (id) DO NOTHING;
