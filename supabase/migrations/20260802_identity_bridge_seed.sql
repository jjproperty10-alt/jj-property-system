-- Migration: 20260802_identity_bridge_seed
-- Purpose: Seed registry.external_identities with lifecycle.entity_identity → registry.parties bridge mappings
--
-- Context: Gate A-E investigation (2 Aug 2026) proved NO bridge exists between
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
--   - Liron (no party match)
--   - "Liron and Alon" (combined entity — no single party match)
--   - Neer (no party match — property name, not person)
--   - Airbnb (no party match — platform, not person)
--   - Yogev (no party match)
--
-- Rollback: DELETE FROM registry.external_identities WHERE source_system = 'lifecycle_entity_identity';

INSERT INTO registry.external_identities (source_system, external_id, canonical_id)
VALUES
  -- Anastasia
  ('lifecycle_entity_identity', 'c289ce42-697e-4814-9ef0-801ff5be85b3', 'ffc96877-e584-45ab-bb3b-912b0a165d06'),
  -- Avi
  ('lifecycle_entity_identity', 'ad7595a0-50c3-46a2-8d9a-7f36655ff239', 'f2a49290-7caa-465d-8f70-d52b16310107'),
  -- Efi
  ('lifecycle_entity_identity', '799453a1-bcf8-4fb0-bb79-d6dda8a1f192', 'e6c8fc24-f96c-49c9-a19d-d2bc05cf0266'),
  -- Ilan & Ilana
  ('lifecycle_entity_identity', '4432b4b9-4fe6-44a0-a649-af0667aacd0a', '739ee08d-d5cc-4a14-a286-8334e6027e32'),
  -- Jacob
  ('lifecycle_entity_identity', 'fbca83e3-ddde-4609-8c70-9e094f671808', 'da9913ea-7f56-4ed0-a3e0-92fbef51cf12'),
  -- Liora
  ('lifecycle_entity_identity', '41a6e6ab-47d2-472a-a0b9-f6326da03184', 'cb296bca-629c-4b64-8e36-72bb3684b912'),
  -- Miranta
  ('lifecycle_entity_identity', '5c1a93d3-428a-42d1-bd6e-39e5beb79455', 'c58aa01d-c9e5-471e-a11c-4d4d2089160e'),
  -- Ofri
  ('lifecycle_entity_identity', 'b4eb805d-f968-4caa-8736-05cf3bfb6fd7', 'f2a80fbe-bc20-4da3-868b-b092cdf2bf54'),
  -- Oren
  ('lifecycle_entity_identity', '4bd5fae5-dfd2-4e0b-a96e-66d05e990533', '17272f6b-c092-4584-85aa-aab7caeb70ad'),
  -- Orit Rob
  ('lifecycle_entity_identity', '92ed1f7e-f7df-4529-b118-4aa63b2b15b2', '1657fb99-8007-4b1e-8859-d3771497c5e8'),
  -- Oshrit
  ('lifecycle_entity_identity', '32a6f2d3-4544-4706-89ae-a27dd889bc99', 'd16926c1-e7ec-4d7e-9aff-4c44383dda20'),
  -- Roni
  ('lifecycle_entity_identity', 'be74a517-dfe0-4b5a-93dc-c6eb05e05640', 'e31c649c-94c8-40e8-bcd1-0f8fb959bb3a'),
  -- Sharon
  ('lifecycle_entity_identity', '27546e91-378b-4f6a-a010-7eecadf41d0f', '4bdcd157-bd8f-47d1-869b-55d6c6342e0a'),
  -- Tamir
  ('lifecycle_entity_identity', '0f352012-1403-4e3b-982a-7c019ee89f1b', '9a392adb-4f42-46a0-9c1d-672d44e94882'),
  -- Tom
  ('lifecycle_entity_identity', '435c0dbe-24c8-414b-8bed-046ae36dbae4', 'd1dda545-d88d-485d-9534-97312381e4fd'),
  -- Uriel
  ('lifecycle_entity_identity', '2944e9ad-c298-4dbf-b666-26561d934b61', '91f98ba2-77e6-4310-a518-c690647ad014'),
  -- Vard
  ('lifecycle_entity_identity', '10812b97-4af9-46c5-8557-bb1ad4c28b08', '9999f532-0e90-41de-929a-ca29ec6e3ded'),
  -- Yossi
  ('lifecycle_entity_identity', '4de83e15-e8cd-4abc-a104-5ddf8a2a3a4d', '66687017-422f-4fc2-99f0-0bc3701985b1')
ON CONFLICT (source_system, external_id) DO NOTHING;
