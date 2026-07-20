-- =============================================================================
-- M2 A1a: Safe Hostaway Property/Owner Mapping — v3 (final blocker fix)
-- JJ Property 10 · Created 2026-07-20 · v2 2026-07-20 · v3 2026-07-20
-- =============================================================================
-- SCOPE (mapping only — no financial snapshots):
--   1. Approve existing mapping: 510557 -> Miranta Radisson
--   2. Create identity chain for Orit Rob -> Orit Rob Pingodes
--   3. Create mapping: 534350 -> Orit Rob Pingodes
--   4. Verify existing mapping: 495138 -> Oren Kitty (read-only)
--
-- EXPLICITLY EXCLUDED (deferred to A1b):
--   - pms.upsert_financial_snapshot() function
--   - Backfill scripts
--   - pg dependency
--   - control_check formula
--   - Least-privilege role provisioning
--
-- FROZEN LISTINGS (must remain unchanged):
--   447075, 412145, 412147, 426237, 412148
--
-- SAFETY:
--   - Transactional (all-or-nothing)
--   - Idempotent (safe to re-run)
--   - Fail-closed (stops on any unexpected state)
--   - No DELETE
--   - No snapshot writes
--   - No transaction-table writes
--   - No function creation
--
-- CORRECTIONS IN v2:
--   1. Orit contact type: 'Owner' (matches convention), verified on reuse
--   2. Orit party: full field verification (party_type, status, contact_ref)
--   3. Orit external identity: full field verification (7 fields)
--   4. Soft-deleted contact_properties collision detection
--   5. Removed dead v_property_uuid
--   6. Orit mapping postcondition check (like Miranta)
--   7. Orit mapping UPDATE guarded with ROW_COUNT check
--
-- CORRECTIONS IN v3 (ChatGPT review blockers):
--   8. CRITICAL: v_current_target → v_orit_target (was undeclared in Orit DO block)
--   9. IDENTITY: party contact_ref=NULL → STOP (was auto-repaired, violates fail-closed)
--  10. Integration tests: production-safe claim removed, isolation gates added
--  11. Integration tests: self-contained fixture (creates schema + seeds data)
--
-- ROLLBACK (documentation only — do not execute):
--   See bottom of file.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. FROZEN-LISTING PROTECTION — canonical before-fingerprint
-- ---------------------------------------------------------------------------

CREATE TEMP TABLE _frozen_before AS
SELECT
  id, provider, external_id, jj_property_name, status, matched_by,
  confidence_label, match_confidence, approved_at, approved_by,
  mapping_version, evidence,
  md5(
    to_jsonb(jsonb_build_object(
      'id', id,
      'provider', provider,
      'external_id', external_id,
      'jj_property_name', jj_property_name,
      'status', status,
      'matched_by', matched_by,
      'confidence_label', confidence_label,
      'match_confidence', match_confidence,
      'approved_at', approved_at,
      'approved_by', approved_by,
      'mapping_version', mapping_version,
      'evidence', evidence
    ))::text
  ) AS row_hash
FROM pms.property_mappings
WHERE external_id IN ('447075','412145','412147','426237','412148')
ORDER BY external_id;

DO $frozen_count$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count FROM _frozen_before;
  IF v_count < 5 THEN
    RAISE EXCEPTION 'FROZEN STOP: Expected at least 5 frozen mapping rows, found %', v_count;
  END IF;
  IF (SELECT count(*) FROM (
    SELECT external_id FROM _frozen_before
    GROUP BY external_id HAVING count(*) > 1
  ) dup) > 0 THEN
    RAISE EXCEPTION 'FROZEN STOP: Duplicate frozen mapping rows detected';
  END IF;
  RAISE NOTICE 'FROZEN BEFORE: Captured % frozen mapping fingerprints', v_count;
END;
$frozen_count$;

-- ---------------------------------------------------------------------------
-- 1. MIRANTA: Approve mapping 510557 -> Miranta Radisson
-- ---------------------------------------------------------------------------

DO $miranta$
DECLARE
  v_mapping_id uuid;
  v_current_status text;
  v_current_target text;
  v_current_matched_by text;
  v_current_confidence_label text;
  v_current_match_confidence numeric;
  v_current_approved_by text;
  v_current_evidence jsonb;
  v_rows_updated int;
BEGIN
  SELECT id, status, jj_property_name, matched_by, confidence_label,
         match_confidence, approved_by, evidence
  INTO v_mapping_id, v_current_status, v_current_target,
       v_current_matched_by, v_current_confidence_label,
       v_current_match_confidence, v_current_approved_by, v_current_evidence
  FROM pms.property_mappings
  WHERE provider = 'hostaway' AND external_id = '510557';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'MIRANTA STOP: No mapping found for hostaway/510557';
  END IF;

  IF v_current_target != 'Miranta Radisson' THEN
    RAISE EXCEPTION 'MIRANTA STOP: Mapping 510557 points to "%" instead of "Miranta Radisson"',
      v_current_target;
  END IF;

  IF v_current_status = 'approved' THEN
    -- Idempotent path: verify all critical fields
    IF v_current_matched_by != 'manual' THEN
      RAISE EXCEPTION 'MIRANTA STOP: Already approved but matched_by is "%" not "manual"',
        v_current_matched_by;
    END IF;
    IF v_current_confidence_label != 'exact' THEN
      RAISE EXCEPTION 'MIRANTA STOP: Already approved but confidence_label is "%" not "exact"',
        v_current_confidence_label;
    END IF;
    IF v_current_match_confidence != 1.00 THEN
      RAISE EXCEPTION 'MIRANTA STOP: Already approved but match_confidence is % not 1.00',
        v_current_match_confidence;
    END IF;
    RAISE NOTICE 'MIRANTA: Already approved (id=%). All critical fields verified.', v_mapping_id;
    RETURN;
  END IF;

  IF v_current_status = 'proposed' THEN
    UPDATE pms.property_mappings
    SET status = 'approved',
        matched_by = 'manual',
        confidence_label = 'exact',
        match_confidence = 1.00,
        approved_at = now(),
        approved_by = 'M2-A1a migration (Yossi directive 2026-07-20)',
        evidence = jsonb_build_object(
          'migration', 'M2-A1a-safe-hostaway-mapping',
          'directive', 'Yossi approved 510557 -> Miranta Radisson',
          'previous_status', v_current_status,
          'previous_matched_by', v_current_matched_by,
          'previous_confidence_label', v_current_confidence_label,
          'previous_match_confidence', v_current_match_confidence,
          'previous_approved_by', v_current_approved_by,
          'previous_evidence', v_current_evidence,
          'approved_date', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
        )
    WHERE id = v_mapping_id;

    GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
    IF v_rows_updated != 1 THEN
      RAISE EXCEPTION 'MIRANTA STOP: Expected 1 row updated, got %', v_rows_updated;
    END IF;

    RAISE NOTICE 'MIRANTA: Approved mapping % (510557 -> Miranta Radisson)', v_mapping_id;
  ELSE
    RAISE EXCEPTION 'MIRANTA STOP: Unexpected status "%" for mapping %', v_current_status, v_mapping_id;
  END IF;
END;
$miranta$;

-- Post-Miranta verification
DO $miranta_verify$
DECLARE
  v_rec record;
BEGIN
  SELECT id, status, jj_property_name, matched_by, confidence_label, match_confidence
  INTO v_rec
  FROM pms.property_mappings
  WHERE provider = 'hostaway' AND external_id = '510557';

  IF v_rec.status != 'approved' THEN
    RAISE EXCEPTION 'MIRANTA VERIFY FAIL: status is "%" not "approved"', v_rec.status;
  END IF;
  IF v_rec.jj_property_name != 'Miranta Radisson' THEN
    RAISE EXCEPTION 'MIRANTA VERIFY FAIL: target is "%" not "Miranta Radisson"', v_rec.jj_property_name;
  END IF;
  IF v_rec.matched_by != 'manual' THEN
    RAISE EXCEPTION 'MIRANTA VERIFY FAIL: matched_by is "%" not "manual"', v_rec.matched_by;
  END IF;
  IF v_rec.confidence_label != 'exact' THEN
    RAISE EXCEPTION 'MIRANTA VERIFY FAIL: confidence_label is "%" not "exact"', v_rec.confidence_label;
  END IF;
  IF v_rec.match_confidence != 1.00 THEN
    RAISE EXCEPTION 'MIRANTA VERIFY FAIL: match_confidence is % not 1.00', v_rec.match_confidence;
  END IF;
  RAISE NOTICE 'MIRANTA VERIFY: PASS (id=%, all 5 fields confirmed)', v_rec.id;
END;
$miranta_verify$;

-- ---------------------------------------------------------------------------
-- 2. ORIT: Identity chain + mapping for 534350 -> Orit Rob Pingodes
-- ---------------------------------------------------------------------------
-- v2 corrections applied:
--   - Removed unused v_property_uuid (correction 5)
--   - Contact type = 'Owner' not 'owner' (correction 1)
--   - Contact reuse verifies type is 'Owner' (correction 1)
--   - Party reuse verifies party_type='client', status='active', contact_ref (correction 2)
--   - External identity reuse verifies all 7 fields (correction 3)
--   - Soft-deleted contact_properties explicitly detected and stopped (correction 4)
--   - Mapping UPDATE guarded with ROW_COUNT (correction 7)
--   - Post-mapping verification block added (correction 6)

DO $orit$
DECLARE
  v_company_id    uuid := '10f6e9b3-c5b9-4d95-a318-48f20f89477f';
  v_contact_id    uuid;
  v_contact_count int;
  v_party_id      uuid;
  v_party_count   int;
  v_ext_id_count  int;
  v_cp_count      int;
  v_cp_deleted_count int;
  v_mapping_id    uuid;
  v_mapping_count int;
  v_rows_updated  int;
  -- Ambiguity counters
  v_contact_ambig int;
  v_party_ambig   int;
  v_ext_id_ambig  int;
  v_cp_ambig      int;
  -- Reuse verification variables
  v_contact_type  text;
  v_p_type        text;
  v_p_status      text;
  v_p_contact_ref uuid;
  v_ei_company    uuid;
  v_ei_can_type   text;
  v_ei_can_id     uuid;
  v_ei_map_status text;
  v_ei_confidence numeric;
  v_cp_role       text;
  v_cp_status     text;
  v_other_owner   int;
  v_orit_target   text;
  v_orit_status   text;
  v_orit_prev_evidence   jsonb;
  v_orit_prev_matched_by text;
  v_orit_prev_confidence text;
  v_orit_prev_match_conf numeric;
BEGIN

  -- == PHASE 1: Independent ambiguity checks across ALL 4 tables ==

  SELECT count(*) INTO v_contact_ambig
  FROM contacts
  WHERE lower(name) LIKE '%orit%'
    AND (is_deleted = false OR is_deleted IS NULL)
    AND lower(name) NOT IN ('orit rob');
  IF v_contact_ambig > 0 THEN
    RAISE EXCEPTION 'ORIT STOP: Found % unexpected Orit variant(s) in contacts table', v_contact_ambig;
  END IF;

  SELECT count(*) INTO v_party_ambig
  FROM registry.parties
  WHERE company_id = v_company_id
    AND lower(canonical_name) LIKE '%orit%'
    AND lower(canonical_name) NOT IN ('orit rob');
  IF v_party_ambig > 0 THEN
    RAISE EXCEPTION 'ORIT STOP: Found % unexpected Orit variant(s) in registry.parties', v_party_ambig;
  END IF;

  SELECT count(*) INTO v_ext_id_ambig
  FROM registry.external_identities ei
  JOIN contacts c ON c.id::text = ei.external_id
  WHERE ei.source_system = 'app.contacts'
    AND ei.external_entity_type = 'contact'
    AND ei.company_id = v_company_id
    AND lower(c.name) LIKE '%orit%'
    AND lower(c.name) NOT IN ('orit rob');
  IF v_ext_id_ambig > 0 THEN
    RAISE EXCEPTION 'ORIT STOP: Found % external identities linked to unexpected Orit variant(s)', v_ext_id_ambig;
  END IF;

  SELECT count(*) INTO v_cp_ambig
  FROM contact_properties cp
  JOIN contacts c ON c.id = cp.contact_id
  WHERE lower(c.name) LIKE '%orit%'
    AND lower(c.name) NOT IN ('orit rob')
    AND (cp.is_deleted = false OR cp.is_deleted IS NULL)
    AND (c.is_deleted = false OR c.is_deleted IS NULL);
  IF v_cp_ambig > 0 THEN
    RAISE EXCEPTION 'ORIT STOP: Found % contact_properties linked to unexpected Orit variant(s)', v_cp_ambig;
  END IF;

  RAISE NOTICE 'ORIT PHASE 1: All 4 ambiguity checks passed';

  -- == PHASE 2: Contact — find or create "Orit Rob" ==
  -- CORRECTION v2: Convention is type='Owner' (14 existing contacts use this)

  SELECT count(*) INTO v_contact_count
  FROM contacts
  WHERE lower(name) = 'orit rob' AND (is_deleted = false OR is_deleted IS NULL);

  IF v_contact_count > 1 THEN
    RAISE EXCEPTION 'ORIT STOP: Found % exact "Orit Rob" contacts — expected 0 or 1', v_contact_count;
  END IF;

  IF v_contact_count = 1 THEN
    -- CORRECTION v2: Verify contact type is compatible ('Owner' convention)
    SELECT id, type INTO v_contact_id, v_contact_type
    FROM contacts
    WHERE lower(name) = 'orit rob' AND (is_deleted = false OR is_deleted IS NULL);

    -- Ownership is governed by contact_properties.relationship_role, but
    -- the established contacts.type convention is 'Owner' for all property owners
    -- (14 of 15 contacts use 'Owner'). A reused contact must be compatible.
    IF v_contact_type IS NOT NULL AND v_contact_type != 'Owner' THEN
      RAISE EXCEPTION 'ORIT STOP: Existing contact % has type "%" — expected "Owner" or NULL. '
        'Do not silently modify an existing contact type.',
        v_contact_id, v_contact_type;
    END IF;
    RAISE NOTICE 'ORIT PHASE 2: Reusing existing contact % (type="%")',
      v_contact_id, COALESCE(v_contact_type, 'NULL');
  ELSE
    -- CORRECTION v2: 'Owner' not 'owner' to match the 14 existing contacts
    INSERT INTO contacts (name, type, notes)
    VALUES ('Orit Rob', 'Owner', 'Created by M2-A1a migration for Orit Rob Pingodes property')
    RETURNING id INTO v_contact_id;
    RAISE NOTICE 'ORIT PHASE 2: Created new contact % (Orit Rob, type=Owner)', v_contact_id;
  END IF;

  -- == PHASE 3: Registry party — find or create ==
  -- CORRECTION v2: Full field verification on reuse (party_type, status, contact_ref)
  -- CORRECTION v3: contact_ref=NULL → STOP (fail-closed, no auto-repair)

  SELECT count(*) INTO v_party_count
  FROM registry.parties
  WHERE company_id = v_company_id AND lower(canonical_name) = 'orit rob';

  IF v_party_count > 1 THEN
    RAISE EXCEPTION 'ORIT STOP: Found % "Orit Rob" parties — expected 0 or 1', v_party_count;
  END IF;

  IF v_party_count = 1 THEN
    SELECT party_id, party_type, status, contact_ref
    INTO v_party_id, v_p_type, v_p_status, v_p_contact_ref
    FROM registry.parties
    WHERE company_id = v_company_id AND lower(canonical_name) = 'orit rob';

    -- Verify party_type = 'client'
    IF v_p_type != 'client' THEN
      RAISE EXCEPTION 'ORIT STOP: Party % has party_type "%" — expected "client". '
        'Do not repair automatically.', v_party_id, v_p_type;
    END IF;

    -- Verify status = 'active'
    IF v_p_status != 'active' THEN
      RAISE EXCEPTION 'ORIT STOP: Party % has status "%" — expected "active". '
        'Do not repair automatically.', v_party_id, v_p_status;
    END IF;

    -- Verify contact_ref — fail-closed: do not repair existing canonical identity
    IF v_p_contact_ref IS NULL THEN
      RAISE EXCEPTION 'ORIT STOP: Existing party % has contact_ref=NULL. '
        'Do not repair an existing canonical identity inside this migration. '
        'Set contact_ref manually before re-running.', v_party_id;
    ELSIF v_p_contact_ref != v_contact_id THEN
      RAISE EXCEPTION 'ORIT STOP: Party % has conflicting contact_ref % (expected %)',
        v_party_id, v_p_contact_ref, v_contact_id;
    ELSE
      RAISE NOTICE 'ORIT PHASE 3: Existing party % verified (client/active/correct contact_ref)', v_party_id;
    END IF;
  ELSE
    INSERT INTO registry.parties (company_id, canonical_name, party_type, contact_ref, status)
    VALUES (v_company_id, 'Orit Rob', 'client', v_contact_id, 'active')
    RETURNING party_id INTO v_party_id;
    RAISE NOTICE 'ORIT PHASE 3: Created new party % (Orit Rob, client, active)', v_party_id;
  END IF;

  -- == PHASE 4: External identity — bind contact to party ==
  -- CORRECTION v2: Full 7-field verification on reuse

  SELECT count(*) INTO v_ext_id_count
  FROM registry.external_identities
  WHERE source_system = 'app.contacts'
    AND external_entity_type = 'contact'
    AND external_id = v_contact_id::text;

  IF v_ext_id_count > 1 THEN
    RAISE EXCEPTION 'ORIT STOP: Found % external identities for contact % — expected 0 or 1',
      v_ext_id_count, v_contact_id;
  END IF;

  IF v_ext_id_count = 1 THEN
    SELECT company_id, canonical_type, canonical_id, mapping_status, confidence
    INTO v_ei_company, v_ei_can_type, v_ei_can_id, v_ei_map_status, v_ei_confidence
    FROM registry.external_identities
    WHERE source_system = 'app.contacts'
      AND external_entity_type = 'contact'
      AND external_id = v_contact_id::text;

    -- Field 1-2: source_system + external_entity_type already matched in WHERE
    -- Field 3: external_id already matched in WHERE
    -- Field 4: company_id
    IF v_ei_company != v_company_id THEN
      RAISE EXCEPTION 'ORIT STOP: External identity company_id mismatch: % != %',
        v_ei_company, v_company_id;
    END IF;
    -- Field 5: canonical_type
    IF v_ei_can_type != 'party' THEN
      RAISE EXCEPTION 'ORIT STOP: External identity canonical_type is "%" not "party"',
        v_ei_can_type;
    END IF;
    -- Field 6: canonical_id
    IF v_ei_can_id != v_party_id THEN
      RAISE EXCEPTION 'ORIT STOP: External identity points to party % instead of %',
        v_ei_can_id, v_party_id;
    END IF;
    -- Field 7: mapping_status
    IF v_ei_map_status != 'approved' THEN
      RAISE EXCEPTION 'ORIT STOP: External identity mapping_status is "%" not "approved"',
        v_ei_map_status;
    END IF;
    -- Bonus: confidence
    IF v_ei_confidence != 1.0 THEN
      RAISE EXCEPTION 'ORIT STOP: External identity confidence is % not 1.0',
        v_ei_confidence;
    END IF;
    RAISE NOTICE 'ORIT PHASE 4: Existing external identity verified (all 7 fields pass)';
  ELSE
    INSERT INTO registry.external_identities (
      company_id, source_system, external_entity_type, external_id,
      canonical_type, canonical_id, mapping_status, confidence,
      audit
    ) VALUES (
      v_company_id, 'app.contacts', 'contact', v_contact_id::text,
      'party', v_party_id, 'approved', 1.0,
      jsonb_build_object(
        'migration', 'M2-A1a-safe-hostaway-mapping',
        'created_date', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      )
    );
    RAISE NOTICE 'ORIT PHASE 4: Created external identity binding contact % -> party %',
      v_contact_id, v_party_id;
  END IF;

  -- == PHASE 5: Contact-property — Owner of Orit Rob Pingodes ==
  -- CORRECTION v2: Detect soft-deleted rows FIRST (separate from active check)

  SELECT count(*) INTO v_cp_deleted_count
  FROM contact_properties
  WHERE contact_id = v_contact_id
    AND property_name = 'Orit Rob Pingodes'
    AND is_deleted = true;

  IF v_cp_deleted_count > 0 THEN
    RAISE EXCEPTION 'ORIT STOP: Found % soft-deleted contact_properties row(s) for contact % / '
      '"Orit Rob Pingodes". Do not insert a duplicate and do not reactivate without a '
      'separate business decision.', v_cp_deleted_count, v_contact_id;
  END IF;

  -- Now check active rows
  SELECT count(*) INTO v_cp_count
  FROM contact_properties
  WHERE contact_id = v_contact_id
    AND property_name = 'Orit Rob Pingodes'
    AND (is_deleted = false OR is_deleted IS NULL);

  IF v_cp_count > 1 THEN
    RAISE EXCEPTION 'ORIT STOP: Found % active contact_properties for contact % / '
      '"Orit Rob Pingodes" — expected 0 or 1', v_cp_count, v_contact_id;
  END IF;

  IF v_cp_count = 1 THEN
    SELECT relationship_role, confirmation_status
    INTO v_cp_role, v_cp_status
    FROM contact_properties
    WHERE contact_id = v_contact_id
      AND property_name = 'Orit Rob Pingodes'
      AND (is_deleted = false OR is_deleted IS NULL);

    IF v_cp_role != 'Owner' THEN
      RAISE EXCEPTION 'ORIT STOP: Existing contact_property has role "%" not "Owner". '
        'Do not alter without a separate business decision.', v_cp_role;
    END IF;
    IF v_cp_status != 'confirmed' THEN
      RAISE EXCEPTION 'ORIT STOP: Existing contact_property has status "%" not "confirmed". '
        'Do not alter without a separate business decision.', v_cp_status;
    END IF;
    RAISE NOTICE 'ORIT PHASE 5: Existing Owner/confirmed relationship verified';
  ELSE
    -- Also check: no OTHER contact already owns this property (prevent conflict)
    SELECT count(*) INTO v_other_owner
    FROM contact_properties
    WHERE property_name = 'Orit Rob Pingodes'
      AND contact_id != v_contact_id
      AND (is_deleted = false OR is_deleted IS NULL);

    IF v_other_owner > 0 THEN
      RAISE EXCEPTION 'ORIT STOP: Another contact already has an active relationship '
        'with property "Orit Rob Pingodes" (% row(s)). Resolve conflict first.', v_other_owner;
    END IF;

    INSERT INTO contact_properties (contact_id, property_name, relationship_role, confirmation_status, notes)
    VALUES (v_contact_id, 'Orit Rob Pingodes', 'Owner', 'confirmed',
      'Created by M2-A1a migration');
    RAISE NOTICE 'ORIT PHASE 5: Created Owner relationship for contact % -> Orit Rob Pingodes', v_contact_id;
  END IF;

  -- == PHASE 6: Property mapping — 534350 -> Orit Rob Pingodes ==

  SELECT count(*) INTO v_mapping_count
  FROM pms.property_mappings
  WHERE provider = 'hostaway' AND external_id = '534350';

  IF v_mapping_count > 1 THEN
    RAISE EXCEPTION 'ORIT STOP: Found % mappings for hostaway/534350 — expected 0 or 1', v_mapping_count;
  END IF;

  IF v_mapping_count = 1 THEN
    SELECT id, status, jj_property_name, evidence, matched_by,
           confidence_label, match_confidence
    INTO v_mapping_id, v_orit_status, v_orit_target,
         v_orit_prev_evidence, v_orit_prev_matched_by,
         v_orit_prev_confidence, v_orit_prev_match_conf
    FROM pms.property_mappings
    WHERE provider = 'hostaway' AND external_id = '534350';

    IF v_orit_target != 'Orit Rob Pingodes' THEN
      RAISE EXCEPTION 'ORIT STOP: Mapping 534350 points to "%" instead of "Orit Rob Pingodes"',
        v_orit_target;
    END IF;

    IF v_orit_status = 'proposed' THEN
      UPDATE pms.property_mappings
      SET status = 'approved',
          matched_by = 'manual',
          confidence_label = 'exact',
          match_confidence = 1.00,
          approved_at = now(),
          approved_by = 'M2-A1a migration (Yossi directive 2026-07-20)',
          evidence = jsonb_build_object(
            'migration', 'M2-A1a-safe-hostaway-mapping',
            'directive', 'Yossi approved 534350 -> Orit Rob Pingodes',
            'listing_name', 'Central Avenue',
            'previous_status', v_orit_status,
            'previous_matched_by', v_orit_prev_matched_by,
            'previous_confidence_label', v_orit_prev_confidence,
            'previous_match_confidence', v_orit_prev_match_conf,
            'previous_evidence', v_orit_prev_evidence,
            'approved_date', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
          )
      WHERE id = v_mapping_id;

      -- CORRECTION v2: ROW_COUNT guard
      GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
      IF v_rows_updated != 1 THEN
        RAISE EXCEPTION 'ORIT STOP: Expected 1 row updated on mapping approval, got %', v_rows_updated;
      END IF;
      RAISE NOTICE 'ORIT PHASE 6: Approved existing mapping % (534350 -> Orit Rob Pingodes)', v_mapping_id;

    ELSIF v_orit_status = 'approved' THEN
      -- Idempotent path: verify all critical fields
      IF v_orit_prev_matched_by != 'manual' THEN
        RAISE EXCEPTION 'ORIT STOP: Mapping 534350 approved but matched_by is "%" not "manual"',
          v_orit_prev_matched_by;
      END IF;
      IF v_orit_prev_confidence != 'exact' THEN
        RAISE EXCEPTION 'ORIT STOP: Mapping 534350 approved but confidence_label is "%" not "exact"',
          v_orit_prev_confidence;
      END IF;
      IF v_orit_prev_match_conf != 1.00 THEN
        RAISE EXCEPTION 'ORIT STOP: Mapping 534350 approved but match_confidence is % not 1.00',
          v_orit_prev_match_conf;
      END IF;
      RAISE NOTICE 'ORIT PHASE 6: Mapping 534350 already approved with correct fields (id=%)', v_mapping_id;
    ELSE
      RAISE EXCEPTION 'ORIT STOP: Mapping 534350 has unexpected status "%"', v_orit_status;
    END IF;
  ELSE
    -- Create new mapping (production path: 534350 has no existing mapping)
    INSERT INTO pms.property_mappings (
      provider, external_id, jj_property_name, status,
      matched_by, confidence_label, match_confidence,
      approved_at, approved_by, evidence
    ) VALUES (
      'hostaway', '534350', 'Orit Rob Pingodes', 'approved',
      'manual', 'exact', 1.00,
      now(), 'M2-A1a migration (Yossi directive 2026-07-20)',
      jsonb_build_object(
        'migration', 'M2-A1a-safe-hostaway-mapping',
        'directive', 'Yossi approved 534350 -> Orit Rob Pingodes',
        'listing_name', 'Central Avenue',
        'approved_date', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      )
    )
    RETURNING id INTO v_mapping_id;
    RAISE NOTICE 'ORIT PHASE 6: Created new approved mapping % (534350 -> Orit Rob Pingodes)', v_mapping_id;
  END IF;

END;
$orit$;

-- CORRECTION v2: Post-Orit verification (symmetric with Miranta)
DO $orit_verify$
DECLARE
  v_rec record;
BEGIN
  SELECT id, provider, external_id, jj_property_name, status,
         matched_by, confidence_label, match_confidence
  INTO v_rec
  FROM pms.property_mappings
  WHERE provider = 'hostaway' AND external_id = '534350';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORIT VERIFY FAIL: No mapping found for hostaway/534350';
  END IF;
  IF v_rec.jj_property_name != 'Orit Rob Pingodes' THEN
    RAISE EXCEPTION 'ORIT VERIFY FAIL: target is "%" not "Orit Rob Pingodes"', v_rec.jj_property_name;
  END IF;
  IF v_rec.status != 'approved' THEN
    RAISE EXCEPTION 'ORIT VERIFY FAIL: status is "%" not "approved"', v_rec.status;
  END IF;
  IF v_rec.matched_by != 'manual' THEN
    RAISE EXCEPTION 'ORIT VERIFY FAIL: matched_by is "%" not "manual"', v_rec.matched_by;
  END IF;
  IF v_rec.confidence_label != 'exact' THEN
    RAISE EXCEPTION 'ORIT VERIFY FAIL: confidence_label is "%" not "exact"', v_rec.confidence_label;
  END IF;
  IF v_rec.match_confidence != 1.00 THEN
    RAISE EXCEPTION 'ORIT VERIFY FAIL: match_confidence is % not 1.00', v_rec.match_confidence;
  END IF;
  -- Note: pms.property_mappings has no company_id column — company isolation
  -- is enforced at the identity layer (registry.external_identities.company_id)
  RAISE NOTICE 'ORIT VERIFY: PASS (id=%, all 6 fields confirmed)', v_rec.id;
END;
$orit_verify$;

-- ---------------------------------------------------------------------------
-- 3. OREN: Verify existing mapping 495138 -> Oren Kitty (read-only)
-- ---------------------------------------------------------------------------

DO $oren$
DECLARE
  v_rec record;
BEGIN
  SELECT id, status, jj_property_name, matched_by, confidence_label,
         match_confidence, approved_at
  INTO v_rec
  FROM pms.property_mappings
  WHERE provider = 'hostaway' AND external_id = '495138';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'OREN STOP: No mapping found for hostaway/495138';
  END IF;
  IF v_rec.jj_property_name != 'Oren Kitty' THEN
    RAISE EXCEPTION 'OREN STOP: Mapping 495138 points to "%" instead of "Oren Kitty"',
      v_rec.jj_property_name;
  END IF;
  IF v_rec.status != 'approved' THEN
    RAISE EXCEPTION 'OREN STOP: Mapping 495138 status is "%" — expected "approved"', v_rec.status;
  END IF;
  -- CORRECTION v2: Also verify matched_by, confidence_label, match_confidence
  IF v_rec.matched_by != 'manual' THEN
    RAISE EXCEPTION 'OREN STOP: Mapping 495138 matched_by is "%" — expected "manual"', v_rec.matched_by;
  END IF;
  IF v_rec.confidence_label != 'exact' THEN
    RAISE EXCEPTION 'OREN STOP: Mapping 495138 confidence_label is "%" — expected "exact"', v_rec.confidence_label;
  END IF;
  IF v_rec.match_confidence != 1.00 THEN
    RAISE EXCEPTION 'OREN STOP: Mapping 495138 match_confidence is % — expected 1.00', v_rec.match_confidence;
  END IF;

  RAISE NOTICE 'OREN VERIFY: PASS (id=%, status=%, target=%, matched_by=%, confidence_label=%, match_confidence=%, approved_at=%)',
    v_rec.id, v_rec.status, v_rec.jj_property_name, v_rec.matched_by,
    v_rec.confidence_label, v_rec.match_confidence, v_rec.approved_at;
END;
$oren$;

-- ---------------------------------------------------------------------------
-- 4. FROZEN-LISTING PROTECTION — verify after-fingerprint matches before
-- ---------------------------------------------------------------------------

DO $frozen_check$
DECLARE
  v_before_count int;
  v_after_count int;
  v_mismatch_count int;
  v_new_rows int;
  v_dup_count int;
BEGIN
  SELECT count(*) INTO v_before_count FROM _frozen_before;

  -- Check 1: No new rows inserted for frozen listings
  SELECT count(*) INTO v_new_rows
  FROM pms.property_mappings pm
  WHERE pm.external_id IN ('447075','412145','412147','426237','412148')
    AND NOT EXISTS (SELECT 1 FROM _frozen_before fb WHERE fb.id = pm.id);
  IF v_new_rows > 0 THEN
    RAISE EXCEPTION 'FROZEN STOP: % new mapping row(s) inserted for frozen listings', v_new_rows;
  END IF;

  -- Check 2: No existing rows modified (hash comparison)
  SELECT count(*) INTO v_mismatch_count
  FROM _frozen_before fb
  JOIN pms.property_mappings pm ON pm.id = fb.id
  WHERE md5(
    to_jsonb(jsonb_build_object(
      'id', pm.id,
      'provider', pm.provider,
      'external_id', pm.external_id,
      'jj_property_name', pm.jj_property_name,
      'status', pm.status,
      'matched_by', pm.matched_by,
      'confidence_label', pm.confidence_label,
      'match_confidence', pm.match_confidence,
      'approved_at', pm.approved_at,
      'approved_by', pm.approved_by,
      'mapping_version', pm.mapping_version,
      'evidence', pm.evidence
    ))::text
  ) != fb.row_hash;
  IF v_mismatch_count > 0 THEN
    RAISE EXCEPTION 'FROZEN STOP: % frozen mapping row(s) were modified', v_mismatch_count;
  END IF;

  -- Check 3: Row count unchanged
  SELECT count(*) INTO v_after_count
  FROM pms.property_mappings
  WHERE external_id IN ('447075','412145','412147','426237','412148');
  IF v_after_count != v_before_count THEN
    RAISE EXCEPTION 'FROZEN STOP: Row count changed from % to %', v_before_count, v_after_count;
  END IF;

  -- Check 4: No duplicates introduced
  SELECT count(*) INTO v_dup_count
  FROM (
    SELECT external_id FROM pms.property_mappings
    WHERE external_id IN ('447075','412145','412147','426237','412148')
    GROUP BY external_id HAVING count(*) > 1
  ) dup;
  IF v_dup_count > 0 THEN
    RAISE EXCEPTION 'FROZEN STOP: % frozen external_id(s) have duplicate rows', v_dup_count;
  END IF;

  RAISE NOTICE 'FROZEN VERIFY: PASS — all % frozen rows unchanged, no duplicates', v_before_count;
END;
$frozen_check$;

DROP TABLE IF EXISTS _frozen_before;

COMMIT;

-- =============================================================================
-- ROLLBACK SQL (documentation only — DO NOT EXECUTE without business approval)
-- =============================================================================
-- WARNING: Only removes records provably created by this migration.
-- Does NOT delete pre-existing contacts or parties that were reused.
-- All rollback queries use migration-specific markers.
--
-- -- 1. Revert Miranta to proposed
-- UPDATE pms.property_mappings
-- SET status = 'proposed',
--     matched_by = (evidence->>'previous_matched_by'),
--     confidence_label = (evidence->>'previous_confidence_label'),
--     match_confidence = (evidence->>'previous_match_confidence')::numeric,
--     approved_at = NULL,
--     approved_by = NULL,
--     evidence = evidence->'previous_evidence'
-- WHERE provider = 'hostaway' AND external_id = '510557'
--   AND approved_by = 'M2-A1a migration (Yossi directive 2026-07-20)';
--
-- -- 2. Remove Orit mapping
-- DELETE FROM pms.property_mappings
-- WHERE provider = 'hostaway' AND external_id = '534350'
--   AND evidence->>'migration' = 'M2-A1a-safe-hostaway-mapping';
--
-- -- 3. Remove Orit contact_properties
-- DELETE FROM contact_properties
-- WHERE property_name = 'Orit Rob Pingodes'
--   AND notes = 'Created by M2-A1a migration';
--
-- -- 4. Remove Orit external identity
-- DELETE FROM registry.external_identities
-- WHERE source_system = 'app.contacts'
--   AND audit->>'migration' = 'M2-A1a-safe-hostaway-mapping';
--
-- -- 5. Remove Orit party (only if created by this migration and no other refs)
-- DELETE FROM registry.parties
-- WHERE company_id = '10f6e9b3-c5b9-4d95-a318-48f20f89477f'
--   AND lower(canonical_name) = 'orit rob'
--   AND NOT EXISTS (
--     SELECT 1 FROM registry.external_identities
--     WHERE canonical_id = party_id
--       AND audit->>'migration' != 'M2-A1a-safe-hostaway-mapping'
--   );
--
-- -- 6. Remove Orit contact (only if created by this migration and no other refs)
-- DELETE FROM contacts
-- WHERE notes = 'Created by M2-A1a migration for Orit Rob Pingodes property'
--   AND NOT EXISTS (SELECT 1 FROM contact_properties WHERE contact_id = id)
--   AND NOT EXISTS (SELECT 1 FROM registry.parties WHERE contact_ref = id);
