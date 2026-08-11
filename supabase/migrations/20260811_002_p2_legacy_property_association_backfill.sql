-- P2 — Legacy Property Association Reconciliation
-- Backfills lifecycle.entity_property_associations from management_relationship data.
--
-- Locked Decisions (Yossi, 11 Aug 2026):
--   D1: association_source = 'management_relationship' (not 'management')
--   D2: Option B for Hebrew duplicates — deactivate (draft→inactive), INSERT fresh on canonical
--   D3: verified MR → EPA active, pending MR → EPA draft (truth preservation)
--   D4: No global UNIQUE — use NOT EXISTS for idempotency
--
-- Pre-flight baseline (11 Aug 2026):
--   EPA: 12 total (0 active, 12 draft, 0 inactive) — all on Hebrew duplicate entities
--   MR current: 33 rows (22 verified, 11 pending)
--   Transactions: 2162 total, 2137 active — MUST NOT CHANGE
--
-- Safety: This migration ONLY touches lifecycle.entity_property_associations.
-- It does NOT modify: transactions, management_relationship, entity_identity,
-- property_definitions, ownership_period, partner_entry, or any other table.

BEGIN;

-- ============================================================
-- STEP 1: Extend CHECK constraint to allow 'management_relationship'
-- ============================================================
ALTER TABLE lifecycle.entity_property_associations
  DROP CONSTRAINT epa_source_check;

ALTER TABLE lifecycle.entity_property_associations
  ADD CONSTRAINT epa_source_check CHECK (
    association_source IN (
      'wizard',
      'ownership',
      'service_engagement',
      'deal_participation',
      'management_relationship'
    )
  );

-- ============================================================
-- STEP 2: Deactivate Hebrew duplicate EPA rows (draft → inactive)
-- 12 rows on entities אוריאל (88cc4809) and תמיר דדון (b97cc289)
-- No DELETE — provenance preserved per P-ARCH-4
-- ============================================================
UPDATE lifecycle.entity_property_associations
SET status = 'inactive'
WHERE entity_id IN (
  '88cc4809-e5f8-4bd4-9e20-755afbb7fb6a',  -- אוריאל
  'b97cc289-e1b2-48a9-9a98-aae9d638a9a5'   -- תמיר דדון
)
AND status = 'draft';

-- ============================================================
-- STEP 3: INSERT EPA rows from management_relationship
-- verified MR → EPA active, pending MR → EPA draft
-- Idempotent via NOT EXISTS (no global UNIQUE constraint)
-- association_source = 'management_relationship'
-- ============================================================

-- === VERIFIED MR → EPA active (22 rows) ===

-- Ben Zvi → Ben Zvi Tersefanou
INSERT INTO lifecycle.entity_property_associations (entity_id, property_id, association_source, status)
SELECT '1cd638d9-faf3-4c04-b847-1dfc92524ef5', '1e22b3c4-3b72-43d5-b8a0-dc97a8130fdd', 'management_relationship', 'active'
WHERE NOT EXISTS (
  SELECT 1 FROM lifecycle.entity_property_associations
  WHERE entity_id = '1cd638d9-faf3-4c04-b847-1dfc92524ef5'
    AND property_id = '1e22b3c4-3b72-43d5-b8a0-dc97a8130fdd'
    AND status IN ('active', 'draft')
);

-- Efi → Efi Dekelia
INSERT INTO lifecycle.entity_property_associations (entity_id, property_id, association_source, status)
SELECT '799453a1-bcf8-4fb0-bb79-d6dda8a1f192', '3bfdbc83-814c-4e6e-b995-68171462e423', 'management_relationship', 'active'
WHERE NOT EXISTS (
  SELECT 1 FROM lifecycle.entity_property_associations
  WHERE entity_id = '799453a1-bcf8-4fb0-bb79-d6dda8a1f192'
    AND property_id = '3bfdbc83-814c-4e6e-b995-68171462e423'
    AND status IN ('active', 'draft')
);

-- Liora → Liora Anafotia 202
INSERT INTO lifecycle.entity_property_associations (entity_id, property_id, association_source, status)
SELECT '41a6e6ab-47d2-472a-a0b9-f6326da03184', '15821b51-7cad-4b17-8124-2f6df3e8b384', 'management_relationship', 'active'
WHERE NOT EXISTS (
  SELECT 1 FROM lifecycle.entity_property_associations
  WHERE entity_id = '41a6e6ab-47d2-472a-a0b9-f6326da03184'
    AND property_id = '15821b51-7cad-4b17-8124-2f6df3e8b384'
    AND status IN ('active', 'draft')
);

-- Neer → Apartment Neer Yoav Dekelia
INSERT INTO lifecycle.entity_property_associations (entity_id, property_id, association_source, status)
SELECT '0e2f942b-7b8a-46c9-9a54-b62f62ee2886', 'b587f463-279d-4376-bb14-38789f34cbba', 'management_relationship', 'active'
WHERE NOT EXISTS (
  SELECT 1 FROM lifecycle.entity_property_associations
  WHERE entity_id = '0e2f942b-7b8a-46c9-9a54-b62f62ee2886'
    AND property_id = 'b587f463-279d-4376-bb14-38789f34cbba'
    AND status IN ('active', 'draft')
);

-- Ofri → Ofri Makarios 5 Floor
INSERT INTO lifecycle.entity_property_associations (entity_id, property_id, association_source, status)
SELECT 'b4eb805d-f968-4caa-8736-05cf3bfb6fd7', 'e75eecc5-6379-430a-8799-a374b0c246a3', 'management_relationship', 'active'
WHERE NOT EXISTS (
  SELECT 1 FROM lifecycle.entity_property_associations
  WHERE entity_id = 'b4eb805d-f968-4caa-8736-05cf3bfb6fd7'
    AND property_id = 'e75eecc5-6379-430a-8799-a374b0c246a3'
    AND status IN ('active', 'draft')
);

-- Oren → Oren Aradipou
INSERT INTO lifecycle.entity_property_associations (entity_id, property_id, association_source, status)
SELECT '4bd5fae5-dfd2-4e0b-a96e-66d05e990533', '10299738-9c2e-490d-8714-fa2478f32067', 'management_relationship', 'active'
WHERE NOT EXISTS (
  SELECT 1 FROM lifecycle.entity_property_associations
  WHERE entity_id = '4bd5fae5-dfd2-4e0b-a96e-66d05e990533'
    AND property_id = '10299738-9c2e-490d-8714-fa2478f32067'
    AND status IN ('active', 'draft')
);

-- Oren → Oren Kitty
INSERT INTO lifecycle.entity_property_associations (entity_id, property_id, association_source, status)
SELECT '4bd5fae5-dfd2-4e0b-a96e-66d05e990533', '965bd157-0d6d-409c-b565-9afbb3312fe5', 'management_relationship', 'active'
WHERE NOT EXISTS (
  SELECT 1 FROM lifecycle.entity_property_associations
  WHERE entity_id = '4bd5fae5-dfd2-4e0b-a96e-66d05e990533'
    AND property_id = '965bd157-0d6d-409c-b565-9afbb3312fe5'
    AND status IN ('active', 'draft')
);

-- Orit Rob → Orit Rob Pingodes
INSERT INTO lifecycle.entity_property_associations (entity_id, property_id, association_source, status)
SELECT '92ed1f7e-f7df-4529-b118-4aa63b2b15b2', 'c74e3ff2-cf7c-477a-8dad-ac11e45540ba', 'management_relationship', 'active'
WHERE NOT EXISTS (
  SELECT 1 FROM lifecycle.entity_property_associations
  WHERE entity_id = '92ed1f7e-f7df-4529-b118-4aa63b2b15b2'
    AND property_id = 'c74e3ff2-cf7c-477a-8dad-ac11e45540ba'
    AND status IN ('active', 'draft')
);

-- Oshrit → Oshrit Deklia
INSERT INTO lifecycle.entity_property_associations (entity_id, property_id, association_source, status)
SELECT '32a6f2d3-4544-4706-89ae-a27dd889bc99', 'c436f1e5-548f-48ca-bce2-df74394f317d', 'management_relationship', 'active'
WHERE NOT EXISTS (
  SELECT 1 FROM lifecycle.entity_property_associations
  WHERE entity_id = '32a6f2d3-4544-4706-89ae-a27dd889bc99'
    AND property_id = 'c436f1e5-548f-48ca-bce2-df74394f317d'
    AND status IN ('active', 'draft')
);

-- Roni → Roni Penthouse Tersefanou
INSERT INTO lifecycle.entity_property_associations (entity_id, property_id, association_source, status)
SELECT 'be74a517-dfe0-4b5a-93dc-c6eb05e05640', 'c743ce00-9f58-43cb-b2b8-1c2e8e0be6fb', 'management_relationship', 'active'
WHERE NOT EXISTS (
  SELECT 1 FROM lifecycle.entity_property_associations
  WHERE entity_id = 'be74a517-dfe0-4b5a-93dc-c6eb05e05640'
    AND property_id = 'c743ce00-9f58-43cb-b2b8-1c2e8e0be6fb'
    AND status IN ('active', 'draft')
);

-- Sharon → Sharon Kiti
INSERT INTO lifecycle.entity_property_associations (entity_id, property_id, association_source, status)
SELECT '27546e91-378b-4f6a-a010-7eecadf41d0f', '5d53afa4-a150-410c-bf69-5694c262d48b', 'management_relationship', 'active'
WHERE NOT EXISTS (
  SELECT 1 FROM lifecycle.entity_property_associations
  WHERE entity_id = '27546e91-378b-4f6a-a010-7eecadf41d0f'
    AND property_id = '5d53afa4-a150-410c-bf69-5694c262d48b'
    AND status IN ('active', 'draft')
);

-- Tamir → Tamir Dekelia
INSERT INTO lifecycle.entity_property_associations (entity_id, property_id, association_source, status)
SELECT '0f352012-1403-4e3b-982a-7c019ee89f1b', '47f53dde-9882-4f7c-ba49-3effeb937848', 'management_relationship', 'active'
WHERE NOT EXISTS (
  SELECT 1 FROM lifecycle.entity_property_associations
  WHERE entity_id = '0f352012-1403-4e3b-982a-7c019ee89f1b'
    AND property_id = '47f53dde-9882-4f7c-ba49-3effeb937848'
    AND status IN ('active', 'draft')
);

-- Tamir → Tamir Kiti
INSERT INTO lifecycle.entity_property_associations (entity_id, property_id, association_source, status)
SELECT '0f352012-1403-4e3b-982a-7c019ee89f1b', 'c1b87151-a4db-4b63-92e5-6c2c92b29682', 'management_relationship', 'active'
WHERE NOT EXISTS (
  SELECT 1 FROM lifecycle.entity_property_associations
  WHERE entity_id = '0f352012-1403-4e3b-982a-7c019ee89f1b'
    AND property_id = 'c1b87151-a4db-4b63-92e5-6c2c92b29682'
    AND status IN ('active', 'draft')
);

-- Tamir → Tamir Kiti 1
INSERT INTO lifecycle.entity_property_associations (entity_id, property_id, association_source, status)
SELECT '0f352012-1403-4e3b-982a-7c019ee89f1b', '6549d995-cb14-4247-ae35-2ec97dad8cc9', 'management_relationship', 'active'
WHERE NOT EXISTS (
  SELECT 1 FROM lifecycle.entity_property_associations
  WHERE entity_id = '0f352012-1403-4e3b-982a-7c019ee89f1b'
    AND property_id = '6549d995-cb14-4247-ae35-2ec97dad8cc9'
    AND status IN ('active', 'draft')
);

-- Tamir → Tamir Kiti 2
INSERT INTO lifecycle.entity_property_associations (entity_id, property_id, association_source, status)
SELECT '0f352012-1403-4e3b-982a-7c019ee89f1b', '7c714522-421f-46b2-bde6-bc8c2f27049a', 'management_relationship', 'active'
WHERE NOT EXISTS (
  SELECT 1 FROM lifecycle.entity_property_associations
  WHERE entity_id = '0f352012-1403-4e3b-982a-7c019ee89f1b'
    AND property_id = '7c714522-421f-46b2-bde6-bc8c2f27049a'
    AND status IN ('active', 'draft')
);

-- Tamir → Tamir Radisson
INSERT INTO lifecycle.entity_property_associations (entity_id, property_id, association_source, status)
SELECT '0f352012-1403-4e3b-982a-7c019ee89f1b', '20d9571e-6bf7-4307-ba4b-59ae5eb21241', 'management_relationship', 'active'
WHERE NOT EXISTS (
  SELECT 1 FROM lifecycle.entity_property_associations
  WHERE entity_id = '0f352012-1403-4e3b-982a-7c019ee89f1b'
    AND property_id = '20d9571e-6bf7-4307-ba4b-59ae5eb21241'
    AND status IN ('active', 'draft')
);

-- Tom → Tom Dekelia
INSERT INTO lifecycle.entity_property_associations (entity_id, property_id, association_source, status)
SELECT '435c0dbe-24c8-414b-8bed-046ae36dbae4', '6077a21a-e343-4ff5-8393-4d93b2582bb1', 'management_relationship', 'active'
WHERE NOT EXISTS (
  SELECT 1 FROM lifecycle.entity_property_associations
  WHERE entity_id = '435c0dbe-24c8-414b-8bed-046ae36dbae4'
    AND property_id = '6077a21a-e343-4ff5-8393-4d93b2582bb1'
    AND status IN ('active', 'draft')
);

-- Uriel → Uriel Debenhams
INSERT INTO lifecycle.entity_property_associations (entity_id, property_id, association_source, status)
SELECT '2944e9ad-c298-4dbf-b666-26561d934b61', 'c6828e0b-69a9-4763-aa69-02a4345dec12', 'management_relationship', 'active'
WHERE NOT EXISTS (
  SELECT 1 FROM lifecycle.entity_property_associations
  WHERE entity_id = '2944e9ad-c298-4dbf-b666-26561d934b61'
    AND property_id = 'c6828e0b-69a9-4763-aa69-02a4345dec12'
    AND status IN ('active', 'draft')
);

-- Uriel → Uriel Duplex
INSERT INTO lifecycle.entity_property_associations (entity_id, property_id, association_source, status)
SELECT '2944e9ad-c298-4dbf-b666-26561d934b61', 'f58180f8-97e2-41ef-abfd-b462ecb1595f', 'management_relationship', 'active'
WHERE NOT EXISTS (
  SELECT 1 FROM lifecycle.entity_property_associations
  WHERE entity_id = '2944e9ad-c298-4dbf-b666-26561d934b61'
    AND property_id = 'f58180f8-97e2-41ef-abfd-b462ecb1595f'
    AND status IN ('active', 'draft')
);

-- Uriel → Uriel Kamares
INSERT INTO lifecycle.entity_property_associations (entity_id, property_id, association_source, status)
SELECT '2944e9ad-c298-4dbf-b666-26561d934b61', 'a180d830-fb0c-4dab-ab8c-a0bd44023136', 'management_relationship', 'active'
WHERE NOT EXISTS (
  SELECT 1 FROM lifecycle.entity_property_associations
  WHERE entity_id = '2944e9ad-c298-4dbf-b666-26561d934b61'
    AND property_id = 'a180d830-fb0c-4dab-ab8c-a0bd44023136'
    AND status IN ('active', 'draft')
);

-- Uriel → Uriel Kokkines
INSERT INTO lifecycle.entity_property_associations (entity_id, property_id, association_source, status)
SELECT '2944e9ad-c298-4dbf-b666-26561d934b61', '5147ec2c-e090-48de-89b1-5353e70a4518', 'management_relationship', 'active'
WHERE NOT EXISTS (
  SELECT 1 FROM lifecycle.entity_property_associations
  WHERE entity_id = '2944e9ad-c298-4dbf-b666-26561d934b61'
    AND property_id = '5147ec2c-e090-48de-89b1-5353e70a4518'
    AND status IN ('active', 'draft')
);

-- Uriel → Uriel Studio Kitty
INSERT INTO lifecycle.entity_property_associations (entity_id, property_id, association_source, status)
SELECT '2944e9ad-c298-4dbf-b666-26561d934b61', 'ddb80c3d-9837-41b9-aa53-22bfbf699dbf', 'management_relationship', 'active'
WHERE NOT EXISTS (
  SELECT 1 FROM lifecycle.entity_property_associations
  WHERE entity_id = '2944e9ad-c298-4dbf-b666-26561d934b61'
    AND property_id = 'ddb80c3d-9837-41b9-aa53-22bfbf699dbf'
    AND status IN ('active', 'draft')
);

-- === PENDING MR → EPA draft (11 rows) ===

-- Alon → Liron and Alon
INSERT INTO lifecycle.entity_property_associations (entity_id, property_id, association_source, status)
SELECT '67760cec-4710-4994-9879-5efedf503eec', '15a5794f-441e-4b29-a780-44fed8e06510', 'management_relationship', 'draft'
WHERE NOT EXISTS (
  SELECT 1 FROM lifecycle.entity_property_associations
  WHERE entity_id = '67760cec-4710-4994-9879-5efedf503eec'
    AND property_id = '15a5794f-441e-4b29-a780-44fed8e06510'
    AND status IN ('active', 'draft')
);

-- Alon → Liron and Alon 1
INSERT INTO lifecycle.entity_property_associations (entity_id, property_id, association_source, status)
SELECT '67760cec-4710-4994-9879-5efedf503eec', 'ce69353f-970e-41fa-a367-87533ab42918', 'management_relationship', 'draft'
WHERE NOT EXISTS (
  SELECT 1 FROM lifecycle.entity_property_associations
  WHERE entity_id = '67760cec-4710-4994-9879-5efedf503eec'
    AND property_id = 'ce69353f-970e-41fa-a367-87533ab42918'
    AND status IN ('active', 'draft')
);

-- Ilan & Ilana → Ilan&Ilana Mazotos
INSERT INTO lifecycle.entity_property_associations (entity_id, property_id, association_source, status)
SELECT '4432b4b9-4fe6-44a0-a649-af0667aacd0a', '4537181b-f11a-4913-8bcf-26f1ec50571e', 'management_relationship', 'draft'
WHERE NOT EXISTS (
  SELECT 1 FROM lifecycle.entity_property_associations
  WHERE entity_id = '4432b4b9-4fe6-44a0-a649-af0667aacd0a'
    AND property_id = '4537181b-f11a-4913-8bcf-26f1ec50571e'
    AND status IN ('active', 'draft')
);

-- Liora → Liora Anafotia 101
INSERT INTO lifecycle.entity_property_associations (entity_id, property_id, association_source, status)
SELECT '41a6e6ab-47d2-472a-a0b9-f6326da03184', '11970e5c-7cd9-4bc8-afb2-f500d685b910', 'management_relationship', 'draft'
WHERE NOT EXISTS (
  SELECT 1 FROM lifecycle.entity_property_associations
  WHERE entity_id = '41a6e6ab-47d2-472a-a0b9-f6326da03184'
    AND property_id = '11970e5c-7cd9-4bc8-afb2-f500d685b910'
    AND status IN ('active', 'draft')
);

-- Liron → Liron and Alon
INSERT INTO lifecycle.entity_property_associations (entity_id, property_id, association_source, status)
SELECT '60a082f3-36ce-4e94-897f-dfdf8c1bb32f', '15a5794f-441e-4b29-a780-44fed8e06510', 'management_relationship', 'draft'
WHERE NOT EXISTS (
  SELECT 1 FROM lifecycle.entity_property_associations
  WHERE entity_id = '60a082f3-36ce-4e94-897f-dfdf8c1bb32f'
    AND property_id = '15a5794f-441e-4b29-a780-44fed8e06510'
    AND status IN ('active', 'draft')
);

-- Liron → Liron and Alon 1
INSERT INTO lifecycle.entity_property_associations (entity_id, property_id, association_source, status)
SELECT '60a082f3-36ce-4e94-897f-dfdf8c1bb32f', 'ce69353f-970e-41fa-a367-87533ab42918', 'management_relationship', 'draft'
WHERE NOT EXISTS (
  SELECT 1 FROM lifecycle.entity_property_associations
  WHERE entity_id = '60a082f3-36ce-4e94-897f-dfdf8c1bb32f'
    AND property_id = 'ce69353f-970e-41fa-a367-87533ab42918'
    AND status IN ('active', 'draft')
);

-- Miranta → Miranta Radisson
INSERT INTO lifecycle.entity_property_associations (entity_id, property_id, association_source, status)
SELECT '5c1a93d3-428a-42d1-bd6e-39e5beb79455', 'a48fc1cc-9303-44db-bc18-6730d6270019', 'management_relationship', 'draft'
WHERE NOT EXISTS (
  SELECT 1 FROM lifecycle.entity_property_associations
  WHERE entity_id = '5c1a93d3-428a-42d1-bd6e-39e5beb79455'
    AND property_id = 'a48fc1cc-9303-44db-bc18-6730d6270019'
    AND status IN ('active', 'draft')
);

-- Ofri → Ofri makarios
INSERT INTO lifecycle.entity_property_associations (entity_id, property_id, association_source, status)
SELECT 'b4eb805d-f968-4caa-8736-05cf3bfb6fd7', '10117133-8065-45dc-ab74-4d520928e1de', 'management_relationship', 'draft'
WHERE NOT EXISTS (
  SELECT 1 FROM lifecycle.entity_property_associations
  WHERE entity_id = 'b4eb805d-f968-4caa-8736-05cf3bfb6fd7'
    AND property_id = '10117133-8065-45dc-ab74-4d520928e1de'
    AND status IN ('active', 'draft')
);

-- Uriel → Uriel Oroklini 2 Bed
INSERT INTO lifecycle.entity_property_associations (entity_id, property_id, association_source, status)
SELECT '2944e9ad-c298-4dbf-b666-26561d934b61', '37b20687-133b-47ee-8a99-6f9589670565', 'management_relationship', 'draft'
WHERE NOT EXISTS (
  SELECT 1 FROM lifecycle.entity_property_associations
  WHERE entity_id = '2944e9ad-c298-4dbf-b666-26561d934b61'
    AND property_id = '37b20687-133b-47ee-8a99-6f9589670565'
    AND status IN ('active', 'draft')
);

-- Uriel → Uriel Sharon English Metro
INSERT INTO lifecycle.entity_property_associations (entity_id, property_id, association_source, status)
SELECT '2944e9ad-c298-4dbf-b666-26561d934b61', '44c2200f-d211-4e1d-9ef1-a912e3da1903', 'management_relationship', 'draft'
WHERE NOT EXISTS (
  SELECT 1 FROM lifecycle.entity_property_associations
  WHERE entity_id = '2944e9ad-c298-4dbf-b666-26561d934b61'
    AND property_id = '44c2200f-d211-4e1d-9ef1-a912e3da1903'
    AND status IN ('active', 'draft')
);

-- Vard → Vard Makenzi
INSERT INTO lifecycle.entity_property_associations (entity_id, property_id, association_source, status)
SELECT '10812b97-4af9-46c5-8557-bb1ad4c28b08', '9ba2cffa-f79f-45f9-850f-e2c528405d70', 'management_relationship', 'draft'
WHERE NOT EXISTS (
  SELECT 1 FROM lifecycle.entity_property_associations
  WHERE entity_id = '10812b97-4af9-46c5-8557-bb1ad4c28b08'
    AND property_id = '9ba2cffa-f79f-45f9-850f-e2c528405d70'
    AND status IN ('active', 'draft')
);

COMMIT;
