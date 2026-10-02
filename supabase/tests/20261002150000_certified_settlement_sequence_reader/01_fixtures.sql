-- Synthetic fixtures. No production client ids or names.
-- Runs against the PREVIOUS reader. Snapshots are the regression oracle.

INSERT INTO registry.companies (company_id, canonical_name, status) VALUES
  ('a0000000-0000-4000-8000-00000000000a', 'Company A', 'active'),
  ('b0000000-0000-4000-8000-00000000000b', 'Company B', 'active');

INSERT INTO public.jj_staff_config (user_id, staff_role, is_active) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ceo', true),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'statement_operator', true),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'finance_admin', true);

INSERT INTO access.company_memberships (user_id, company_id) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-00000000000a'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'b0000000-0000-4000-8000-00000000000b');

INSERT INTO lifecycle.entity_identity (id, canonical_name, entity_type, status) VALUES
  ('11111111-1111-4111-8111-111111111111', 'Sequence Client', 'external', 'active'),
  ('22222222-2222-4222-8222-222222222222', 'Single Cert Client', 'external', 'active'),
  ('33333333-3333-4333-8333-333333333333', 'Version Chain Client', 'external', 'active'),
  ('44444444-4444-4444-8444-444444444444', 'Single Cash Client', 'external', 'active'),
  ('55555555-5555-4555-8555-555555555550', 'Counterparty', 'external', 'active'),
  ('66666666-6666-4666-8666-666666666666', 'Supersede Guard Client', 'external', 'active');

INSERT INTO public.test_entity_company (entity_id, company_id) VALUES
  ('11111111-1111-4111-8111-111111111111', 'a0000000-0000-4000-8000-00000000000a'),
  ('22222222-2222-4222-8222-222222222222', 'b0000000-0000-4000-8000-00000000000b'),
  ('33333333-3333-4333-8333-333333333333', 'a0000000-0000-4000-8000-00000000000a'),
  ('44444444-4444-4444-8444-444444444444', 'b0000000-0000-4000-8000-00000000000b'),
  ('66666666-6666-4666-8666-666666666666', 'b0000000-0000-4000-8000-00000000000b');

INSERT INTO public.properties (id, name) VALUES
  ('55555555-5555-4555-8555-555555555551', 'Fixture Alpha'),
  ('55555555-5555-4555-8555-555555555552', 'Fixture Beta'),
  ('55555555-5555-4555-8555-555555555553', 'Fixture Gamma'),
  ('55555555-5555-4555-8555-555555555554', 'Fixture Delta'),
  ('55555555-5555-4555-8555-555555555555', 'Fixture Single'),
  ('55555555-5555-4555-8555-555555555556', 'Fixture Chain'),
  ('55555555-5555-4555-8555-555555555557', 'Fixture Cash'),
  ('55555555-5555-4555-8555-555555555558', 'Fixture Guard');

-- Sequence client: two applied openings, owner-level, one cash allocation.
INSERT INTO finance.client_settlement_certifications (
  id, entity_id, as_of, currency, certification_type, status, reason, evidence_ref,
  idempotency_key, created_by, approved_by, applied_by, created_at, approved_at, applied_at,
  total_due_to_jj, version, supersedes_id, voided_by, voided_at, void_reason
) VALUES
  (
    'c1000000-0000-4000-8000-000000000001',
    '11111111-1111-4111-8111-111111111111',
    '2026-07-01', 'EUR', 'opening_property_obligations', 'void',
    'voided noise', 'ev-void', 'k-void',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '2026-07-01', '2026-07-01', '2026-07-01',
    -111.00, 1, NULL,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '2026-07-02', 'voided'
  ),
  (
    'c1000000-0000-4000-8000-0000000000a1',
    '11111111-1111-4111-8111-111111111111',
    '2026-08-31', 'EUR', 'opening_property_obligations', 'applied',
    'first opening', 'ev-a', 'k-a',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '2026-08-31', '2026-08-31', '2026-08-31',
    -13248.75, 1, NULL, NULL, NULL, NULL
  ),
  (
    'c1000000-0000-4000-8000-0000000000b1',
    '11111111-1111-4111-8111-111111111111',
    '2026-09-17', 'EUR', 'opening_property_obligations', 'applied',
    'later opening', 'ev-b', 'k-b',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '2026-09-17', '2026-09-17', '2026-09-17',
    -720.00, 1, NULL, NULL, NULL, NULL
  );

INSERT INTO finance.client_settlement_certification_lines (
  id, certification_id, line_order, property_key, property_name, component_code,
  amount_due_to_jj, reason, evidence_ref
) VALUES
  ('c2000000-0000-4000-8000-0000000000a1', 'c1000000-0000-4000-8000-0000000000a1', 1, 'alpha', 'Fixture Alpha', 'opening_balance', -8000.00, 'a1', 'ev-a1'),
  ('c2000000-0000-4000-8000-0000000000a2', 'c1000000-0000-4000-8000-0000000000a1', 2, 'beta', 'Fixture Beta', 'opening_balance', -5248.75, 'a2', 'ev-a2'),
  ('c2000000-0000-4000-8000-0000000000b1', 'c1000000-0000-4000-8000-0000000000b1', 1, 'gamma', 'Fixture Gamma', 'opening_balance', -500.00, 'b1', 'ev-b1'),
  ('c2000000-0000-4000-8000-0000000000b2', 'c1000000-0000-4000-8000-0000000000b1', 2, 'delta', 'Fixture Delta', 'opening_balance', -220.00, 'b2', 'ev-b2');

INSERT INTO finance.client_obligation_property_bindings (
  id, certification_id, certification_line_id, entity_id, property_id, certification_version,
  property_key, status, reason, evidence_ref, idempotency_key, created_by
) VALUES
  ('b1000000-0000-4000-8000-0000000000a1', 'c1000000-0000-4000-8000-0000000000a1', 'c2000000-0000-4000-8000-0000000000a1', '11111111-1111-4111-8111-111111111111', '55555555-5555-4555-8555-555555555551', 1, 'alpha', 'active', 'bind', 'ev', 'bind-a1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('b1000000-0000-4000-8000-0000000000a2', 'c1000000-0000-4000-8000-0000000000a1', 'c2000000-0000-4000-8000-0000000000a2', '11111111-1111-4111-8111-111111111111', '55555555-5555-4555-8555-555555555552', 1, 'beta', 'active', 'bind', 'ev', 'bind-a2', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('b1000000-0000-4000-8000-0000000000b1', 'c1000000-0000-4000-8000-0000000000b1', 'c2000000-0000-4000-8000-0000000000b1', '11111111-1111-4111-8111-111111111111', '55555555-5555-4555-8555-555555555553', 1, 'gamma', 'active', 'bind', 'ev', 'bind-b1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('b1000000-0000-4000-8000-0000000000b2', 'c1000000-0000-4000-8000-0000000000b1', 'c2000000-0000-4000-8000-0000000000b2', '11111111-1111-4111-8111-111111111111', '55555555-5555-4555-8555-555555555554', 1, 'delta', 'active', 'bind', 'ev', 'bind-b2', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

INSERT INTO finance.client_owner_level_obligations (
  id, entity_id, source_transaction_id, component_code, effective_date, amount_due_to_jj,
  status, reason, evidence_ref, idempotency_key, created_by, applied_by,
  voided_by, voided_at, void_reason
) VALUES
  (
    '01000000-0000-4000-8000-000000000001',
    '11111111-1111-4111-8111-111111111111',
    '71000000-0000-4000-8000-000000000001',
    'owner_general_payment', '2026-08-24', 10000.00, 'applied',
    'owner level', 'ev-o', 'k-o',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    NULL, NULL, NULL
  ),
  (
    '01000000-0000-4000-8000-000000000002',
    '11111111-1111-4111-8111-111111111111',
    '71000000-0000-4000-8000-000000000002',
    'owner_general_payment', '2026-08-24', 999.00, 'void',
    'void owner level', 'ev-ov', 'k-ov',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '2026-08-25', 'void'
  ),
  (
    '01000000-0000-4000-8000-000000000003',
    '11111111-1111-4111-8111-111111111111',
    '71000000-0000-4000-8000-000000000003',
    'owner_general_payment', '2026-10-15', 50.00, 'applied',
    'future owner level', 'ev-of', 'k-of',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    NULL, NULL, NULL
  );

INSERT INTO finance.client_cash_settlement_executions (
  id, entity_id, direction, amount, effective_date, transaction_id, owner_link_id,
  preview_hash, canonical_snapshot, idempotency_key, reversal_of, actor, created_at
) VALUES (
  'e1000000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  'JJ_TO_CLIENT', 3450.00, '2026-09-25',
  '71000000-0000-4000-8000-000000000010',
  '81000000-0000-4000-8000-000000000010',
  'hash-1', '{}'::jsonb, 'k-exec-1', NULL,
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '2026-09-25 12:00:00+00'
);

INSERT INTO finance.client_obligation_fifo_allocations (
  id, execution_id, certification_line_id, property_id, sequence_no, signed_amount, allocated_amount
) VALUES (
  'f1000000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000001',
  'c2000000-0000-4000-8000-0000000000a1',
  '55555555-5555-4555-8555-555555555551',
  1, -3450.00, 3450.00
);

INSERT INTO finance.partner_funding_events (
  id, amount_eur, client_entity_id, funding_source, status, client_cash_execution_id, transaction_id
) VALUES (
  '91000000-0000-4000-8000-000000000001',
  3450.00,
  '11111111-1111-4111-8111-111111111111',
  'PARTNER_PERSONAL',
  'posted',
  NULL,
  '71000000-0000-4000-8000-000000000010'
);

-- Single-cert client modelled on a one-certification client: FIFO credit plus an
-- informational exclusion, no cash, no owner-level obligation.
INSERT INTO finance.client_settlement_certifications (
  id, entity_id, as_of, currency, certification_type, status, reason, evidence_ref,
  idempotency_key, created_by, approved_by, applied_by, created_at, approved_at, applied_at,
  total_due_to_jj, version, supersedes_id
) VALUES (
  'c1000000-0000-4000-8000-0000000000c1',
  '22222222-2222-4222-8222-222222222222',
  '2026-07-31', 'EUR', 'opening_property_obligations', 'applied',
  'single opening', 'ev-s', 'k-s',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '2026-07-31', '2026-07-31', '2026-07-31',
  1234.56, 1, NULL
);

INSERT INTO finance.client_settlement_certification_lines (
  id, certification_id, line_order, property_key, property_name, component_code,
  amount_due_to_jj, reason, evidence_ref, metadata
) VALUES (
  'c2000000-0000-4000-8000-0000000000c1',
  'c1000000-0000-4000-8000-0000000000c1',
  1, 'single', 'Fixture Single', 'opening_balance', 1234.56, 's', 'ev-s',
  '{"source":"fixture"}'::jsonb
);

INSERT INTO finance.client_obligation_property_bindings (
  id, certification_id, certification_line_id, entity_id, property_id, certification_version,
  property_key, status, reason, evidence_ref, idempotency_key, created_by
) VALUES (
  'b1000000-0000-4000-8000-0000000000c1',
  'c1000000-0000-4000-8000-0000000000c1',
  'c2000000-0000-4000-8000-0000000000c1',
  '22222222-2222-4222-8222-222222222222',
  '55555555-5555-4555-8555-555555555555',
  1, 'single', 'active', 'bind', 'ev', 'bind-c1',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
);

INSERT INTO public.transactions (id, date) VALUES
  ('71000000-0000-4000-8000-0000000000e1', '2026-07-15');

INSERT INTO finance.client_settlement_events (
  id, entity_id, counterparty_entity_id, effective_date, event_type, settlement_amount,
  source_transaction_id, reason, evidence_ref, created_by, idempotency_key, status,
  applied_at, applied_by, created_at
) VALUES
  (
    'd1000000-0000-4000-8000-000000000001',
    '22222222-2222-4222-8222-222222222222',
    '55555555-5555-4555-8555-555555555550',
    '2026-07-20', 'noncash_settlement_credit', 10.00, NULL,
    'credit', 'ev-credit', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'k-credit', 'applied',
    '2026-07-20', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '2026-07-20'
  ),
  (
    'd1000000-0000-4000-8000-000000000002',
    '22222222-2222-4222-8222-222222222222',
    NULL,
    '2026-07-21', 'exclude_transaction_from_settlement', 5.00,
    '71000000-0000-4000-8000-0000000000e1',
    'exclude', 'ev-ex', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'k-ex', 'applied',
    '2026-07-21', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '2026-07-21'
  );

-- Version chain: v1 and v2 void, v3 applied. Plus a void on another as_of.
INSERT INTO finance.client_settlement_certifications (
  id, entity_id, as_of, currency, certification_type, status, reason, evidence_ref,
  idempotency_key, created_by, approved_by, applied_by, created_at, approved_at, applied_at,
  total_due_to_jj, version, supersedes_id, voided_by, voided_at, void_reason
) VALUES
  (
    'c1000000-0000-4000-8000-0000000000d1',
    '33333333-3333-4333-8333-333333333333',
    '2026-06-30', 'EUR', 'opening_property_obligations', 'void',
    'v1', 'ev-v1', 'k-v1',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '2026-06-01', '2026-06-01', '2026-06-01',
    10.00, 1, NULL,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '2026-06-02', 'superseded'
  ),
  (
    'c1000000-0000-4000-8000-0000000000d2',
    '33333333-3333-4333-8333-333333333333',
    '2026-06-30', 'EUR', 'opening_property_obligations', 'void',
    'v2', 'ev-v2', 'k-v2',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '2026-06-02', '2026-06-02', '2026-06-02',
    20.00, 2, 'c1000000-0000-4000-8000-0000000000d1',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '2026-06-03', 'superseded'
  ),
  (
    'c1000000-0000-4000-8000-0000000000d3',
    '33333333-3333-4333-8333-333333333333',
    '2026-06-30', 'EUR', 'opening_property_obligations', 'applied',
    'v3', 'ev-v3', 'k-v3',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '2026-06-03', '2026-06-03', '2026-06-03',
    880.40, 3, 'c1000000-0000-4000-8000-0000000000d2',
    NULL, NULL, NULL
  ),
  (
    'c1000000-0000-4000-8000-0000000000d0',
    '33333333-3333-4333-8333-333333333333',
    '2026-05-31', 'EUR', 'opening_property_obligations', 'void',
    'other date void', 'ev-v0', 'k-v0',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '2026-05-31', '2026-05-31', '2026-05-31',
    9999.00, 1, NULL,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '2026-06-01', 'void'
  );

INSERT INTO finance.client_settlement_certification_lines (
  id, certification_id, line_order, property_key, property_name, component_code,
  amount_due_to_jj, reason, evidence_ref
) VALUES
  ('c2000000-0000-4000-8000-0000000000d1', 'c1000000-0000-4000-8000-0000000000d1', 1, 'chain', 'Fixture Chain', 'opening_balance', 10.00, 'v1', 'ev'),
  ('c2000000-0000-4000-8000-0000000000d2', 'c1000000-0000-4000-8000-0000000000d2', 1, 'chain', 'Fixture Chain', 'opening_balance', 20.00, 'v2', 'ev'),
  ('c2000000-0000-4000-8000-0000000000d3', 'c1000000-0000-4000-8000-0000000000d3', 1, 'chain', 'Fixture Chain', 'opening_balance', 880.40, 'v3', 'ev'),
  ('c2000000-0000-4000-8000-0000000000d0', 'c1000000-0000-4000-8000-0000000000d0', 1, 'chain', 'Fixture Chain', 'opening_balance', 9999.00, 'v0', 'ev');

INSERT INTO finance.client_obligation_property_bindings (
  id, certification_id, certification_line_id, entity_id, property_id, certification_version,
  property_key, status, reason, evidence_ref, idempotency_key, created_by
) VALUES (
  'b1000000-0000-4000-8000-0000000000d3',
  'c1000000-0000-4000-8000-0000000000d3',
  'c2000000-0000-4000-8000-0000000000d3',
  '33333333-3333-4333-8333-333333333333',
  '55555555-5555-4555-8555-555555555556',
  3, 'chain', 'active', 'bind', 'ev', 'bind-d3',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
);

-- Single certification plus cash, no owner-level, no second cert.
INSERT INTO finance.client_settlement_certifications (
  id, entity_id, as_of, currency, certification_type, status, reason, evidence_ref,
  idempotency_key, created_by, approved_by, applied_by, created_at, approved_at, applied_at,
  total_due_to_jj, version, supersedes_id
) VALUES (
  'c1000000-0000-4000-8000-0000000000e1',
  '44444444-4444-4444-8444-444444444444',
  '2026-08-15', 'EUR', 'opening_property_obligations', 'applied',
  'cash opening', 'ev-cash', 'k-cash',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '2026-08-15', '2026-08-15', '2026-08-15',
  -2000.00, 1, NULL
);

INSERT INTO finance.client_settlement_certification_lines (
  id, certification_id, line_order, property_key, property_name, component_code,
  amount_due_to_jj, reason, evidence_ref
) VALUES (
  'c2000000-0000-4000-8000-0000000000e1',
  'c1000000-0000-4000-8000-0000000000e1',
  1, 'cashprop', 'Fixture Cash', 'opening_balance', -2000.00, 'cash', 'ev'
);

INSERT INTO finance.client_obligation_property_bindings (
  id, certification_id, certification_line_id, entity_id, property_id, certification_version,
  property_key, status, reason, evidence_ref, idempotency_key, created_by
) VALUES (
  'b1000000-0000-4000-8000-0000000000e1',
  'c1000000-0000-4000-8000-0000000000e1',
  'c2000000-0000-4000-8000-0000000000e1',
  '44444444-4444-4444-8444-444444444444',
  '55555555-5555-4555-8555-555555555557',
  1, 'cashprop', 'active', 'bind', 'ev', 'bind-e1',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
);

INSERT INTO finance.client_cash_settlement_executions (
  id, entity_id, direction, amount, effective_date, transaction_id, owner_link_id,
  preview_hash, canonical_snapshot, idempotency_key, reversal_of, actor, created_at
) VALUES (
  'e1000000-0000-4000-8000-0000000000e1',
  '44444444-4444-4444-8444-444444444444',
  'JJ_TO_CLIENT', 400.00, '2026-08-20',
  '71000000-0000-4000-8000-0000000000e2',
  '81000000-0000-4000-8000-0000000000e2',
  'hash-e', '{}'::jsonb, 'k-exec-e', NULL,
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '2026-08-20 12:00:00+00'
);

INSERT INTO finance.client_obligation_fifo_allocations (
  id, execution_id, certification_line_id, property_id, sequence_no, signed_amount, allocated_amount
) VALUES (
  'f1000000-0000-4000-8000-0000000000e1',
  'e1000000-0000-4000-8000-0000000000e1',
  'c2000000-0000-4000-8000-0000000000e1',
  '55555555-5555-4555-8555-555555555557',
  1, -400.00, 400.00
);

-- Predecessor left applied AND superseded by an applied successor. The partial
-- unique index on Production forbids this; the harness omits that index so the
-- guard can be proved. The previous reader already returns only the successor.
INSERT INTO finance.client_settlement_certifications (
  id, entity_id, as_of, currency, certification_type, status, reason, evidence_ref,
  idempotency_key, created_by, approved_by, applied_by, created_at, approved_at, applied_at,
  total_due_to_jj, version, supersedes_id
) VALUES
  (
    'c1000000-0000-4000-8000-0000000000f1',
    '66666666-6666-4666-8666-666666666666',
    '2026-01-01', 'EUR', 'opening_property_obligations', 'applied',
    'predecessor still marked applied', 'ev-g1', 'k-g1',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '2026-01-01', '2026-01-01', '2026-01-01',
    100.00, 1, NULL
  ),
  (
    'c1000000-0000-4000-8000-0000000000f2',
    '66666666-6666-4666-8666-666666666666',
    '2026-01-01', 'EUR', 'opening_property_obligations', 'applied',
    'applied successor', 'ev-g2', 'k-g2',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '2026-01-02', '2026-01-02', '2026-01-02',
    40.00, 2, 'c1000000-0000-4000-8000-0000000000f1'
  );

INSERT INTO finance.client_settlement_certification_lines (
  id, certification_id, line_order, property_key, property_name, component_code,
  amount_due_to_jj, reason, evidence_ref
) VALUES
  ('c2000000-0000-4000-8000-0000000000f1', 'c1000000-0000-4000-8000-0000000000f1', 1, 'guard', 'Fixture Guard', 'opening_balance', 100.00, 'g1', 'ev'),
  ('c2000000-0000-4000-8000-0000000000f2', 'c1000000-0000-4000-8000-0000000000f2', 1, 'guard', 'Fixture Guard', 'opening_balance', 40.00, 'g2', 'ev');

INSERT INTO finance.client_obligation_property_bindings (
  id, certification_id, certification_line_id, entity_id, property_id, certification_version,
  property_key, status, reason, evidence_ref, idempotency_key, created_by
) VALUES
  ('b1000000-0000-4000-8000-0000000000f1', 'c1000000-0000-4000-8000-0000000000f1', 'c2000000-0000-4000-8000-0000000000f1', '66666666-6666-4666-8666-666666666666', '55555555-5555-4555-8555-555555555558', 1, 'guard', 'active', 'bind', 'ev', 'bind-f1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('b1000000-0000-4000-8000-0000000000f2', 'c1000000-0000-4000-8000-0000000000f2', 'c2000000-0000-4000-8000-0000000000f2', '66666666-6666-4666-8666-666666666666', '55555555-5555-4555-8555-555555555558', 2, 'guard', 'active', 'bind', 'ev', 'bind-f2', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

INSERT INTO public.test_oracle (label, payload)
SELECT 'sequence_before_cash', finance.read_certified_client_settlement(
  '11111111-1111-4111-8111-111111111111', '2026-09-24'
);

INSERT INTO public.test_oracle (label, payload)
SELECT 'sequence_after_cash', finance.read_certified_client_settlement(
  '11111111-1111-4111-8111-111111111111', '2026-10-02'
);

INSERT INTO public.test_oracle (label, payload)
SELECT 'single_cert', finance.read_certified_client_settlement(
  '22222222-2222-4222-8222-222222222222', '2026-10-02'
);

INSERT INTO public.test_oracle (label, payload)
SELECT 'version_chain', finance.read_certified_client_settlement(
  '33333333-3333-4333-8333-333333333333', '2026-10-02'
);

INSERT INTO public.test_oracle (label, payload)
SELECT 'single_cash', finance.read_certified_client_settlement(
  '44444444-4444-4444-8444-444444444444', '2026-10-02'
);

INSERT INTO public.test_oracle (label, payload)
SELECT 'supersede_guard', finance.read_certified_client_settlement(
  '66666666-6666-4666-8666-666666666666', '2026-10-02'
);

INSERT INTO public.test_meta (key, value) VALUES
  ('wrapper_def', pg_get_functiondef('public.read_certified_client_settlement(uuid,date)'::regprocedure)),
  ('balance_def', pg_get_functiondef('public.read_client_settlement_balance(uuid,date)'::regprocedure)),
  (
    'finance_owner',
    (
      SELECT r.rolname
      FROM pg_proc p
      JOIN pg_roles r ON r.oid = p.proowner
      WHERE p.oid = 'finance.read_certified_client_settlement(uuid,date)'::regprocedure
    )
  ),
  (
    'finance_flags',
    (
      SELECT p.prosecdef::text || '|' || p.provolatile::text || '|' || COALESCE(p.proconfig::text, '')
      FROM pg_proc p
      WHERE p.oid = 'finance.read_certified_client_settlement(uuid,date)'::regprocedure
    )
  );
