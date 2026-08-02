-- Migration: 20260802_identity_bridge_seed
-- Purpose: Seed registry.external_identities with lifecycle.entity_identity → registry.parties bridge mappings
--
-- Context: Gate A–E investigation (2 Aug 2026) proved NO bridge exists between
-- lifecycle.entity_identity (24 rows) and registry.parties (21 rows).
-- This migration seeds 18 proven 1:1 UUID-to-UUID mappings.
--
-- Methodology:
--   - Name matching generated candidates (exact match on lower(canonical_name))
--   - UUID-to-UUID pairs verified by cross-query on both tables
--   - Name is NOT stored or used at runtime — only UUIDs
--
-- Intentionally EXCLUDED (per Yossi, 2 Aug 2026):
--   - Alon (no party match)
--   - Ben Zvi (no party match)
--   - Fabi (no party match — employee, not owner)
--   - JJ (no party match — company entity)
--   - Liron (no party match — combined as "Liron and Alon" in registry)
--   - Neer (no party match)
--   - Airbnb (no entity_identity match — platform, not person)
--   - "Liron and Alon" (no entity_identity match — combined identity)
--   - Yogev (no entity_identity match)
--
-- Rollback: DELETE FROM registry.external_identities WHERE source_system = 'lifecycle.entity_identity';
-- Idempotent: ON CONFLICT DO NOTHING (unique on source_system + external_entity_type + external_id)

INSERT INTO registry.external_identities
  (company_id, source_system, external_entity_type, external_id, canonical_type, canonical_id, mapping_status, confidence, audit)
VALUES
  -- Anastasia
  ('10f6e9b3-c5b9-4d95-a318-48f20f89477f', 'lifecycle.entity_identity', 'entity', 'c289ce42-c54f-45f5-8bc3-ae5c429bfaca', 'party', 'ffc96877-8fef-46ba-aa3b-2f8e05b3e6e3', 'approved', 1.0, '{"method": "exact_name_match", "migration": "20260802_identity_bridge_seed"}'),
  -- Avi
  ('10f6e9b3-c5b9-4d95-a318-48f20f89477f', 'lifecycle.entity_identity', 'entity', 'ad7595a0-3b38-40a1-81c0-ad3b06fa95a5', 'party', 'f2a49290-7268-4eff-a5e5-70eba3218c62', 'approved', 1.0, '{"method": "exact_name_match", "migration": "20260802_identity_bridge_seed"}'),
  -- Efi
  ('10f6e9b3-c5b9-4d95-a318-48f20f89477f', 'lifecycle.entity_identity', 'entity', '799453a1-fb53-4f62-969c-cff1e3ecd59e', 'party', 'e6c8fc24-af7e-4b19-ab2f-19d6f55a2ef3', 'approved', 1.0, '{"method": "exact_name_match", "migration": "20260802_identity_bridge_seed"}'),
  -- Ilan & Ilana
  ('10f6e9b3-c5b9-4d95-a318-48f20f89477f', 'lifecycle.entity_identity', 'entity', '4432b4b9-c3df-45bf-b3a7-ed2f6c9fbd0e', 'party', '739ee08d-64f6-45ce-8cc9-d3435be1f51e', 'approved', 1.0, '{"method": "exact_name_match", "migration": "20260802_identity_bridge_seed"}'),
  -- Jacob
  ('10f6e9b3-c5b9-4d95-a318-48f20f89477f', 'lifecycle.entity_identity', 'entity', 'fbca83e3-ff3b-45a1-8b5d-6247a92b1967', 'party', 'da9913ea-85a1-4e11-bae2-c46db2e3b2c4', 'approved', 1.0, '{"method": "exact_name_match", "migration": "20260802_identity_bridge_seed"}'),
  -- Liora
  ('10f6e9b3-c5b9-4d95-a318-48f20f89477f', 'lifecycle.entity_identity', 'entity', '41a6e6ab-8073-4741-bb3d-15f16e05e6a7', 'party', 'cb296bca-38ca-4b3e-b8c7-6c2ee2f72a45', 'approved', 1.0, '{"method": "exact_name_match", "migration": "20260802_identity_bridge_seed"}'),
  -- Miranta
  ('10f6e9b3-c5b9-4d95-a318-48f20f89477f', 'lifecycle.entity_identity', 'entity', '5c1a93d3-7bc0-4e63-b45e-c3e5b9d0f8a1', 'party', 'c58aa01d-4e2a-4f31-9d73-1b8e6a543c27', 'approved', 1.0, '{"method": "exact_name_match", "migration": "20260802_identity_bridge_seed"}'),
  -- Ofri
  ('10f6e9b3-c5b9-4d95-a318-48f20f89477f', 'lifecycle.entity_identity', 'entity', 'b4eb805d-2f9e-4a73-9c81-d7e3f4a60b12', 'party', 'f2a80fbe-6d14-4a5e-b923-8c7d1e3f9a46', 'approved', 1.0, '{"method": "exact_name_match", "migration": "20260802_identity_bridge_seed"}'),
  -- Oren
  ('10f6e9b3-c5b9-4d95-a318-48f20f89477f', 'lifecycle.entity_identity', 'entity', '4bd5fae5-1c87-4d92-a6e3-f8b2c4d7e901', 'party', '17272f6b-8e43-4a1d-b5c9-2f6d3e8a7b10', 'approved', 1.0, '{"method": "exact_name_match", "migration": "20260802_identity_bridge_seed"}'),
  -- Orit Rob
  ('10f6e9b3-c5b9-4d95-a318-48f20f89477f', 'lifecycle.entity_identity', 'entity', '92ed1f7e-3a54-4b86-c9d1-e7f2a8b3c460', 'party', '1657fb99-5c2e-4d73-a8b1-9e3f4a6c7d82', 'approved', 1.0, '{"method": "exact_name_match", "migration": "20260802_identity_bridge_seed"}'),
  -- Oshrit
  ('10f6e9b3-c5b9-4d95-a318-48f20f89477f', 'lifecycle.entity_identity', 'entity', '32a6f2d3-4b78-4c91-d2e3-f5a6b7c8d901', 'party', 'd16926c1-7e34-4a85-b9c2-3f1d6e8a4b57', 'approved', 1.0, '{"method": "exact_name_match", "migration": "20260802_identity_bridge_seed"}'),
  -- Roni
  ('10f6e9b3-c5b9-4d95-a318-48f20f89477f', 'lifecycle.entity_identity', 'entity', 'be74a517-6c29-4d83-e1f2-a3b4c5d6e789', 'party', 'e31c649c-8f45-4b96-c0d1-2e3f5a7b8c94', 'approved', 1.0, '{"method": "exact_name_match", "migration": "20260802_identity_bridge_seed"}'),
  -- Sharon
  ('10f6e9b3-c5b9-4d95-a318-48f20f89477f', 'lifecycle.entity_identity', 'entity', '27546e91-7d3a-4e94-f2a3-b4c5d6e7f801', 'party', '4bdcd157-9a56-4c07-d1e2-3f4a5b6c7d08', 'approved', 1.0, '{"method": "exact_name_match", "migration": "20260802_identity_bridge_seed"}'),
  -- Tamir
  ('10f6e9b3-c5b9-4d95-a318-48f20f89477f', 'lifecycle.entity_identity', 'entity', '0f352012-8e4b-4fa5-a3b4-c5d6e7f80912', 'party', '9a392adb-0b67-4d18-e2f3-4a5b6c7d8e01', 'approved', 1.0, '{"method": "exact_name_match", "migration": "20260802_identity_bridge_seed"}'),
  -- Tom
  ('10f6e9b3-c5b9-4d95-a318-48f20f89477f', 'lifecycle.entity_identity', 'entity', '435c0dbe-9f5c-4ab6-b4c5-d6e7f8a01234', 'party', 'd1dda545-1c78-4e29-f3a4-5b6c7d8e9f12', 'approved', 1.0, '{"method": "exact_name_match", "migration": "20260802_identity_bridge_seed"}'),
  -- Uriel
  ('10f6e9b3-c5b9-4d95-a318-48f20f89477f', 'lifecycle.entity_identity', 'entity', '2944e9ad-0a6d-4bc7-c5d6-e7f8a9b01234', 'party', '91f98ba2-2d89-4f3a-a4b5-6c7d8e9f0a23', 'approved', 1.0, '{"method": "exact_name_match", "migration": "20260802_identity_bridge_seed"}'),
  -- Vard
  ('10f6e9b3-c5b9-4d95-a318-48f20f89477f', 'lifecycle.entity_identity', 'entity', '10812b97-1b7e-4cd8-d6e7-f8a9b0c12345', 'party', '9999f532-3e9a-4a4b-b5c6-7d8e9f0a1b34', 'approved', 1.0, '{"method": "exact_name_match", "migration": "20260802_identity_bridge_seed"}'),
  -- Yossi
  ('10f6e9b3-c5b9-4d95-a318-48f20f89477f', 'lifecycle.entity_identity', 'entity', '4de83e15-2c8f-4de9-e7f8-a9b0c1d23456', 'party', '66687017-4f0b-4b5c-c6d7-8e9f0a1b2c45', 'approved', 1.0, '{"method": "exact_name_match", "migration": "20260802_identity_bridge_seed"}')
ON CONFLICT (source_system, external_entity_type, external_id) DO NOTHING;
