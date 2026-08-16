-- Agent 3 — Ben Zvi + Neer canonicalization & Liora 201→101 alias (ADDITIVE / corrective)
-- Authorization: Yossi Final Decisions (2026-08-15) #1 and #2.
--
-- #1 Ben Zvi + Neer: real Owner Room owners that existed only in lifecycle.entity_identity.
--    Create canonical registry.parties + bridge their existing lifecycle identity.
--    NO fabricated contact data — contact_ref stays NULL (same as Airbnb/Yossi/Jacob parties).
--    Requirement: the Owner Room owner set must not drop from 14 to 12.
-- #2 Liora Anafotia 201: prior approved+executed migration 20260807_001_liora_201_to_101.sql
--    established 201 as a data-entry error for 101. That governs; supersedes the temporary
--    H.4 CONFLICT. Represent it as a LEGACY_ALIAS in the bridge/resolver. NO new historical merge.
--
-- SAFETY: writes only to registry.parties, registry.external_identities, registry.property_external_identities.
--         No changes to transactions, property_definitions, lifecycle.*, pms.*, or any view. Idempotent.

-- #1a — canonical parties (contact_ref NULL — no fabricated contact)
INSERT INTO registry.parties (company_id, canonical_name, party_type, contact_ref, status)
SELECT '10f6e9b3-c5b9-4d95-a318-48f20f89477f', v.name, 'client', NULL, 'active'
FROM (VALUES ('Ben Zvi'),('Neer')) v(name)
WHERE NOT EXISTS (SELECT 1 FROM registry.parties p WHERE lower(p.canonical_name)=lower(v.name));

-- #1b — bridge existing lifecycle identity -> canonical party (idempotent; joins by name)
INSERT INTO registry.external_identities (company_id, source_system, external_entity_type, external_id, canonical_type, canonical_id, mapping_status, confidence, audit)
SELECT '10f6e9b3-c5b9-4d95-a318-48f20f89477f','lifecycle.entity_identity','entity', m.lifecycle_id, 'party', p.party_id, 'approved', 1.0,
   jsonb_build_object('agent','agent3','decision','Yossi 2026-08-15 #1','basis','preserve Owner Room owner; lifecycle managed_client with verified relationship; no contact fabricated')
FROM (VALUES ('Ben Zvi','1cd638d9-faf3-4c04-b847-1dfc92524ef5'),
             ('Neer','0e2f942b-7b8a-46c9-9a54-b62f62ee2886')) m(name, lifecycle_id)
JOIN registry.parties p ON lower(p.canonical_name)=lower(m.name)
WHERE NOT EXISTS (
  SELECT 1 FROM registry.external_identities e
  WHERE e.source_system='lifecycle.entity_identity' AND e.external_entity_type='entity' AND e.external_id=m.lifecycle_id
);

-- #2a — Liora 201 legacy properties row: CONFLICT -> approved LEGACY_ALIAS of canonical 101
UPDATE registry.property_external_identities
SET canonical_property_id = (SELECT property_id FROM public.property_definitions WHERE property_name='Liora Anafotia 101'),
    canonical_name='Liora Anafotia 101', mapping_status='approved', match_method='approved_alias', confidence=1.0, updated_at=now(),
    audit=jsonb_build_object('agent','agent3','decision','Yossi 2026-08-15 #2','governed_by','20260807_001_liora_201_to_101.sql','basis','201 = data-entry error for 101; prior approved+executed migration is authoritative; supersedes temporary H.4 CONFLICT')
WHERE source_system='app.properties'
  AND external_id=(SELECT id::text FROM public.properties WHERE name='Liora Anafotia 201');

-- #2b — Liora 201 raw ledger name -> canonical 101
INSERT INTO registry.property_external_identities (source_system, external_entity_type, external_id, canonical_property_id, canonical_name, mapping_status, confidence, match_method, audit)
SELECT 'ledger.property_name','property_name','Liora Anafotia 201',
       (SELECT property_id FROM public.property_definitions WHERE property_name='Liora Anafotia 101'),
       'Liora Anafotia 101','approved',1.0,'approved_alias',
       jsonb_build_object('agent','agent3','decision','Yossi 2026-08-15 #2','governed_by','20260807_001_liora_201_to_101.sql')
ON CONFLICT (source_system, external_id) DO NOTHING;
