-- Fixture data reproducing the exact Production pre-image the Apply asserts.
-- Totals: 2,270 transactions · Kiti 1 = 19 rows · Kiti 1 rent through cutoff = EUR 7,685 / 12
--         owner-level BPO rows = 1 · active owner links = 1 · payments anchor = EUR 19,100 / 4

-- identities
INSERT INTO auth.users (id, email) VALUES
  ('277f81e0-3b89-41ed-a099-22585959b77a', 'yossi@example.invalid'),
  ('11111111-2222-3333-4444-555555555555', 'nonstaff@example.invalid');

INSERT INTO public.jj_staff_config (user_id, staff_role, is_active, notes) VALUES
  ('277f81e0-3b89-41ed-a099-22585959b77a', 'ceo', true, 'Yossi Azizi - CEO (fixture)');

INSERT INTO lifecycle.entity_identity (id, canonical_name, aliases, entity_type, status) VALUES
  ('0f352012-1403-4e3b-982a-7c019ee89f1b', 'Tamir', ARRAY['Tamir','Tamir Levi'], 'managed_client', 'active');

-- properties
INSERT INTO public.properties (id, name, status, is_deleted) VALUES
  ('b54e015f-05f9-4f75-a3e7-9362c6e2e0ae', 'Tamir Kiti 1', 'Rent', false),
  ('4dc5c26c-ce0c-49ec-8f44-a525f68f0b8a', 'Tamir Kiti 2', 'Rent', false),
  ('18503f91-0293-4cb1-9fcf-b7d0d09c0ef1', 'Tamir Kiti',   'Rent', false);

INSERT INTO public.property_definitions (property_id, property_name, canonical_name, relationship_type) VALUES
  ('6549d995-cb14-4247-ae35-2ec97dad8cc9', 'Tamir Kiti 1', 'Tamir Kiti 1', 'client'),
  ('7c714522-421f-46b2-bde6-bc8c2f27049a', 'Tamir Kiti 2', 'Tamir Kiti 2', 'client');

INSERT INTO public.property_name_aliases (raw_name, canonical_name) VALUES
  ('Tamir Kiti 1', 'Tamir Kiti 1'),
  ('Tamir Kiti 2', 'Tamir Kiti 2');

-- Kiti 1: 12 tenant payments through cutoff = EUR 7,685, property_id NULL (historical)
INSERT INTO public.transactions (date, property_id, property_name, category, subcategory, payer, payee, amount_eur)
VALUES
  ('2025-03-24', NULL, 'Tamir Kiti 1', 'Management', 'Tenant Payment', 'Tenant', 'Yossi',     670),
  ('2025-04-17', NULL, 'Tamir Kiti 1', 'Management', 'Tenant Payment', 'Tenant', 'Anastasia', 670),
  ('2025-05-26', NULL, 'Tamir Kiti 1', 'Management', 'Tenant Payment', 'Tenant', 'Anastasia', 670),
  ('2025-06-24', NULL, 'Tamir Kiti 1', 'Management', 'Tenant Payment', 'Tenant', 'Anastasia', 670),
  ('2025-07-24', NULL, 'Tamir Kiti 1', 'Management', 'Tenant Payment', 'Tenant', 'Yossi',     670),
  ('2025-08-13', NULL, 'Tamir Kiti 1', 'Management', 'Tenant Payment', 'Tenant', 'Anastasia', 670),
  ('2025-09-01', NULL, 'Tamir Kiti 1', 'Management', 'Tenant Payment', 'Tenant', 'Anastasia', 670),
  ('2025-09-01', NULL, 'Tamir Kiti 1', 'Management', 'Tenant Payment', 'Tenant', 'Anastasia',  85),
  ('2025-10-01', NULL, 'Tamir Kiti 1', 'Management', 'Tenant Payment', 'Tenant', 'Yossi',     670),
  ('2025-11-13', NULL, 'Tamir Kiti 1', 'Management', 'Tenant Payment', 'Tenant', 'Anastasia', 670),
  ('2025-12-05', NULL, 'Tamir Kiti 1', 'Management', 'Tenant Payment', 'Tenant', 'Anastasia', 900),
  ('2026-01-01', NULL, 'Tamir Kiti 1', 'Management', 'Tenant Payment', 'Tenant', 'Yossi',     670);

-- Kiti 1: other historical rows
INSERT INTO public.transactions (date, property_id, property_name, category, subcategory, payer, payee, amount_eur)
VALUES
  ('2026-01-27', NULL, 'Tamir Kiti 1', 'Management', 'Minor Renovation',      'Jacob', 'company', 450),
  ('2025-12-31', NULL, 'Tamir Kiti 1', 'Management', 'Bank Payment to Owner', 'JJ',    'Owner',  4019),
  ('2025-12-31', NULL, 'Tamir Kiti 1', 'Management', 'Bank Payment to Owner', 'JJ',    'Owner',  1910);

-- Kiti 1: within-cutoff deposit (stays out of rental income) + 3 post-cutoff rows
INSERT INTO public.transactions (date, property_id, property_name, category, subcategory, payer, payee, amount_eur)
VALUES
  ('2026-08-26', 'b54e015f-05f9-4f75-a3e7-9362c6e2e0ae', 'Tamir Kiti 1', 'Management', 'Deposit',        'Tenant', 'JJ',  550),
  ('2026-09-01', 'b54e015f-05f9-4f75-a3e7-9362c6e2e0ae', 'Tamir Kiti 1', 'Management', 'Tenant Payment', 'Tenant', 'JJ',  700),
  ('2026-09-01', 'b54e015f-05f9-4f75-a3e7-9362c6e2e0ae', 'Tamir Kiti 1', 'Management', 'Deposit',        'Tenant', 'JJ',   50),
  ('2026-09-03', 'b54e015f-05f9-4f75-a3e7-9362c6e2e0ae', 'Tamir Kiti 1', 'JJ',         'Brokerage',      'Jacob',  'company', 500);

-- payments anchor: the four rows composing EUR 19,100 (fixed ids, as in Production)
INSERT INTO public.transactions (id, date, property_id, property_name, category, subcategory, payer, payee, amount_eur, k_note)
VALUES
  ('da46f998-f296-42ab-a3d7-2d6573b51eb1', '2024-10-30', NULL, 'Tamir Radisson', 'Management', 'Bank Payment to Owner', 'Jacob', 'Owner',  1000, NULL),
  ('3f290bef-94fa-4222-be52-e86457598ed8', '2025-12-31', NULL, 'Tamir Kiti 2',   'Management', 'Bank Payment to Owner', 'Yossi', 'Owner',  4100, NULL),
  ('def81208-30f9-4c13-8786-26fb708a39df', '2026-05-19', NULL, 'Tamir Kiti 2',   'Management', 'Bank Payment to Owner', 'Yossi', 'Owner',  4000, NULL),
  ('0e8f119f-c126-45a1-a342-2fe6e99b20fb', '2026-08-24', NULL, NULL,             'Management', 'Bank Payment to Owner', 'Jacob', 'Owner', 10000,
   'PROVENANCE=YOSSI_CONFIRMED;OWNER_ID=0f352012-1403-4e3b-982a-7c019ee89f1b;IDEMPOTENCY=tamir_owner_pmt_yaakov_2026-08-24_10000;OWNER_LEVEL_UNALLOCATED=true');

-- decoy: a Kiti-complex BPO row that is deliberately OUTSIDE the EUR 19,100 anchor
INSERT INTO public.transactions (date, property_id, property_name, category, subcategory, payer, payee, amount_eur)
VALUES ('2025-12-31', NULL, 'Tamir Kiti 2', 'Management', 'Bank Payment to Owner', 'JJ', 'Owner', 3565.69);

-- C1 owner-level link (1 active link)
INSERT INTO finance.owner_transaction_links (transaction_id, owner_entity_id, link_role, idempotency_key, created_by, notes)
VALUES ('0e8f119f-c126-45a1-a342-2fe6e99b20fb', '0f352012-1403-4e3b-982a-7c019ee89f1b',
        'owner_level_payment', 'tamir_owner_pmt_yaakov_2026-08-24_10000', 'yossi',
        'YOSSI_VERIFIED - OWNER_LEVEL_UNALLOCATED');

-- filler rows to reach exactly 2,270 (24 specific rows already inserted)
INSERT INTO public.transactions (date, property_id, property_name, category, subcategory, payer, payee, amount_eur)
SELECT
  DATE '2025-01-01' + (g % 600),
  NULL,
  CASE WHEN g % 3 = 0 THEN 'Filler Property A'
       WHEN g % 3 = 1 THEN 'Filler Property B'
       ELSE 'Filler Property C' END,
  CASE WHEN g % 4 = 0 THEN 'JJ' ELSE 'Airbnb' END,
  CASE WHEN g % 4 = 0 THEN 'Other' ELSE 'Consumable Supplies' END,
  'JJ',
  'company',
  1
FROM generate_series(1, 2246) g;

-- clear the audit rows produced while loading fixtures, so audit deltas start from zero
DELETE FROM public.audit_logs;
