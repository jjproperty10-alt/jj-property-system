-- =====================================================================================
-- P2 — STR Service Engagement Linkage (linkage/configuration only · idempotent)
-- Applied to production via Supabase MCP on 2026-08-11 (lifecycle_p2_str_service_engagement_linkage).
-- Committed here for source-control reproducibility.
--
-- Creates airbnb_str service engagements for the 4 evidence-proven Hostaway properties:
--   Apartment Neer Yoav Dekelia, Ofri Makarios 5 Floor, Oren Kitty, Orit Rob Pingodes.
-- Each: identity VERIFIED (property_id); owner/entity VERIFIED (active management_relationship
-- managed_owner); JJ STR management VERIFIED (active mgmt relationship + STR reservations +
-- Airbnb ledger activity); effective_from = first CONFIRMED Hostaway check-in (same convention
-- as the two existing Tamir engagements); entity_id = the active managed_owner entity.
--
-- INTENTIONALLY EXCLUDED — NEEDS BUSINESS DECISION (not guessed):
--   * Villa Mazotos    — partnership-owned; no management_relationship / owner entity (entity_id is NOT NULL).
--   * Miranta Radisson — owner property-association still in 'draft'; minimal activity.
--
-- Idempotent: inserts only where no active/draft/suspended airbnb_str engagement already exists.
-- NO financial mutation. NO change to v_str_property_settlement / RC3 / FPE / Settlement / JHKA.
-- ROLLBACK (documentation only):
--   DELETE FROM lifecycle.service_engagements
--   WHERE service_type='airbnb_str' AND notes LIKE 'Short-term rental management by JJ — Hostaway listing:%'
--     AND property_id IN ('b587f463-279d-4376-bb14-38789f34cbba','e75eecc5-6379-430a-8799-a374b0c246a3',
--                         '965bd157-0d6d-409c-b565-9afbb3312fe5','c74e3ff2-cf7c-477a-8dad-ac11e45540ba');
-- =====================================================================================

INSERT INTO lifecycle.service_engagements
  (entity_id, property_id, service_type, status, effective_from, notes, created_by)
SELECT v.entity_id::uuid, v.property_id::uuid, 'airbnb_str', 'active', v.eff::date, v.notes,
       '277f81e0-3b89-41ed-a099-22585959b77a'::uuid
FROM (VALUES
 ('0e2f942b-7b8a-46c9-9a54-b62f62ee2886','b587f463-279d-4376-bb14-38789f34cbba','2025-08-24','Short-term rental management by JJ — Hostaway listing: TM04-TelMar "Sunrise View"'),
 ('b4eb805d-f968-4caa-8736-05cf3bfb6fd7','e75eecc5-6379-430a-8799-a374b0c246a3','2025-11-15','Short-term rental management by JJ — Hostaway listing: TM05-TelMar "Sky View"'),
 ('4bd5fae5-dfd2-4e0b-a96e-66d05e990533','965bd157-0d6d-409c-b565-9afbb3312fe5','2026-03-28','Short-term rental management by JJ — Hostaway listing: TelMar Kiti Escape House'),
 ('92ed1f7e-f7df-4529-b118-4aa63b2b15b2','c74e3ff2-cf7c-477a-8dad-ac11e45540ba','2026-06-20','Short-term rental management by JJ — Hostaway listing: TelMar Central Avenue Stay')
) AS v(entity_id, property_id, eff, notes)
WHERE NOT EXISTS (
  SELECT 1 FROM lifecycle.service_engagements se
  WHERE se.property_id = v.property_id::uuid
    AND se.service_type = 'airbnb_str'
    AND se.status IN ('active','draft','suspended')
);
