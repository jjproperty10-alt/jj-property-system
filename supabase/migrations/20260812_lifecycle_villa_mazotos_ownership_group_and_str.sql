-- =====================================================================================
-- Villa Mazotos — canonical ownership completion + ownership_group + STR engagement
-- Applied to production via Supabase MCP on 2026-08-12 (lifecycle_villa_mazotos_ownership_group_and_str).
-- Committed for source-control reproducibility. Additive · idempotent · fail-closed.
-- Identity/lifecycle only — NO financial mutation (no transactions/settlement/RC3/FPE/JHKA).
--
-- Ownership (M8 ownership_period authority): Avi 50 / Yossi 25 / Jacob 25 = 100%.
--   Avi 50% pre-existing. Yossi 25% partner_entry existed (confirmed) -> ownership_period added.
--   Jacob 25% proven by reconciliation (100-50-25), legacy property_owners, canonical docs, and
--   exact symmetry with Yossi (same JJ partner, same inception_model/valuation) -> partner_entry + ownership_period added.
--   Effective dates remain NULL + pending_verification (acquisition source-document date unverified — NOT fabricated).
-- ownership_group = identity/counterparty handle only (holds NO %; membership derives from ownership_period).
-- STR engagement (airbnb_str, effective_from = first confirmed Hostaway check-in 2025-07-21) attaches to the group.
--
-- ROLLBACK (doc): delete the airbnb_str engagement + 'ownership' entity_property_association +
--   'Villa Mazotos Ownership Group' entity + Jacob ownership_period/partner_entry + Yossi ownership_period;
--   revert entity_identity entity_type CHECK to the pre-'ownership_group' set.
-- =====================================================================================

INSERT INTO lifecycle.ownership_period
 (property_name, entity_id, ownership_pct, effective_from, effective_from_confidence,
  opened_by_partner_entry_id, business_source_id, event_type, event_nature, recorded_by, status)
SELECT 'Villa Mazotos','4de83e15-e8cd-4abc-a104-5ddf8a2a3a4d',25.0000,NULL,'pending_verification',
  'a8fb76be-099c-47a6-bfce-7ad28f9f57a8','66b39d29-b23e-47ef-baa0-c6182c4823aa',
  'ownership_period','lifecycle_event','villa_ownership_completion_2026-08-12','pending_verification'
WHERE NOT EXISTS (SELECT 1 FROM lifecycle.ownership_period
  WHERE property_name='Villa Mazotos' AND entity_id='4de83e15-e8cd-4abc-a104-5ddf8a2a3a4d');

INSERT INTO lifecycle.partner_entry
 (property_name, entity_id, inception_model, entry_date, entry_date_note, ownership_pct,
  agreed_entry_valuation_eur, business_source_id, event_type, event_nature, recorded_by, status)
SELECT 'Villa Mazotos','fbca83e3-ddde-4609-8c70-9e094f671808','from_acquisition_inception',NULL,
  'pending_verification — inception date aligns with acquisition; source document required',25.0000,
  500000.00,'66b39d29-b23e-47ef-baa0-c6182c4823aa',
  'partner_entry','lifecycle_event','villa_ownership_completion_2026-08-12','confirmed'
WHERE NOT EXISTS (SELECT 1 FROM lifecycle.partner_entry
  WHERE property_name='Villa Mazotos' AND entity_id='fbca83e3-ddde-4609-8c70-9e094f671808');

INSERT INTO lifecycle.ownership_period
 (property_name, entity_id, ownership_pct, effective_from, effective_from_confidence,
  opened_by_partner_entry_id, business_source_id, event_type, event_nature, recorded_by, status)
SELECT 'Villa Mazotos','fbca83e3-ddde-4609-8c70-9e094f671808',25.0000,NULL,'pending_verification',
  (SELECT id FROM lifecycle.partner_entry WHERE property_name='Villa Mazotos' AND entity_id='fbca83e3-ddde-4609-8c70-9e094f671808' LIMIT 1),
  '66b39d29-b23e-47ef-baa0-c6182c4823aa','ownership_period','lifecycle_event','villa_ownership_completion_2026-08-12','pending_verification'
WHERE NOT EXISTS (SELECT 1 FROM lifecycle.ownership_period
  WHERE property_name='Villa Mazotos' AND entity_id='fbca83e3-ddde-4609-8c70-9e094f671808');

DO $$ DECLARE tot numeric;
BEGIN
  SELECT coalesce(sum(ownership_pct),0) INTO tot FROM lifecycle.ownership_period
   WHERE property_name='Villa Mazotos' AND effective_to IS NULL;
  IF tot <> 100 THEN RAISE EXCEPTION 'Villa Mazotos current ownership != 100%% (got %)', tot; END IF;
END $$;

DO $$ DECLARE cn text;
BEGIN
  SELECT c.conname INTO cn FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace
   WHERE n.nspname='lifecycle' AND r.relname='entity_identity' AND c.contype='c' AND pg_get_constraintdef(c.oid) ILIKE '%entity_type%';
  IF cn IS NOT NULL THEN EXECUTE format('ALTER TABLE lifecycle.entity_identity DROP CONSTRAINT %I', cn); END IF;
  ALTER TABLE lifecycle.entity_identity ADD CONSTRAINT entity_identity_entity_type_check
    CHECK (entity_type = ANY (ARRAY['partner'::text,'investor'::text,'jj_company'::text,'external'::text,'managed_client'::text,'ownership_group'::text]));
END $$;

INSERT INTO lifecycle.entity_identity (canonical_name, entity_type, status)
SELECT 'Villa Mazotos Ownership Group','ownership_group','active'
WHERE NOT EXISTS (SELECT 1 FROM lifecycle.entity_identity WHERE canonical_name='Villa Mazotos Ownership Group' AND entity_type='ownership_group');

INSERT INTO lifecycle.entity_property_associations (entity_id, property_id, association_source, status, notes)
SELECT (SELECT id FROM lifecycle.entity_identity WHERE canonical_name='Villa Mazotos Ownership Group' AND entity_type='ownership_group'),
  '4eb09c84-907a-404c-b19a-7856f73fadff','ownership','active',
  'Collective ownership vehicle for Villa Mazotos (Avi 50 / Yossi 25 / Jacob 25). Identity/counterparty only — no ownership %; split lives in lifecycle.ownership_period.'
WHERE NOT EXISTS (SELECT 1 FROM lifecycle.entity_property_associations
  WHERE property_id='4eb09c84-907a-404c-b19a-7856f73fadff' AND association_source='ownership'
    AND entity_id=(SELECT id FROM lifecycle.entity_identity WHERE canonical_name='Villa Mazotos Ownership Group' AND entity_type='ownership_group'));

INSERT INTO lifecycle.service_engagements (entity_id, property_id, service_type, status, effective_from, notes, created_by)
SELECT (SELECT id FROM lifecycle.entity_identity WHERE canonical_name='Villa Mazotos Ownership Group' AND entity_type='ownership_group'),
  '4eb09c84-907a-404c-b19a-7856f73fadff','airbnb_str','active','2025-07-21',
  'Short-term rental management by JJ — Hostaway listing: TelMar Royal Villa (partnership-owned; counterparty = Villa Mazotos Ownership Group)',
  '277f81e0-3b89-41ed-a099-22585959b77a'
WHERE NOT EXISTS (SELECT 1 FROM lifecycle.service_engagements
  WHERE property_id='4eb09c84-907a-404c-b19a-7856f73fadff' AND service_type='airbnb_str' AND status IN ('active','draft','suspended'));

DO $$ DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM lifecycle.service_engagements
   WHERE property_id='4eb09c84-907a-404c-b19a-7856f73fadff' AND service_type='airbnb_str' AND status='active';
  IF n <> 1 THEN RAISE EXCEPTION 'Villa Mazotos active airbnb_str engagements != 1 (got %)', n; END IF;
END $$;
