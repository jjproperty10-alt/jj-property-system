-- =====================================================================================
-- P1 — Canonical Property UUID Adaptation  (additive · reversible · idempotent · fail-closed)
-- Applied to production via Supabase MCP on 2026-08-11 (migration: pms_p1_property_id_uuid).
-- Committed here for source-control reproducibility (P0 lesson).
--
-- Adds pms.property_mappings.property_id (nullable). Backfills the 8 VERIFIED Hostaway
-- mappings from public.property_definitions. Enforces: approved mapping => property_id NOT NULL.
-- PMS isolation preserved: NO cross-schema FK, NO destructive cascade, NO UNIQUE on property_id.
-- Existing UNIQUE (provider, external_id) remains the source-identity authority.
--
-- ROLLBACK (documentation only):
--   ALTER TABLE pms.property_mappings DROP CONSTRAINT IF EXISTS property_mappings_approved_has_property_id;
--   ALTER TABLE pms.property_mappings DROP COLUMN IF EXISTS property_id;
-- =====================================================================================

ALTER TABLE pms.property_mappings ADD COLUMN IF NOT EXISTS property_id uuid;

COMMENT ON COLUMN pms.property_mappings.property_id IS
  'Canonical JJ property identity (public.property_definitions.property_id). Authoritative Hostaway->JJ machine identity as of P1. Soft reference (no FK) to preserve PMS isolation. jj_property_name is display/legacy only.';

UPDATE pms.property_mappings AS pm SET property_id = v.pid::uuid
FROM (VALUES
 ('412145','47f53dde-9882-4f7c-ba49-3effeb937848'),
 ('412147','20d9571e-6bf7-4307-ba4b-59ae5eb21241'),
 ('412148','4eb09c84-907a-404c-b19a-7856f73fadff'),
 ('426237','b587f463-279d-4376-bb14-38789f34cbba'),
 ('447075','e75eecc5-6379-430a-8799-a374b0c246a3'),
 ('495138','965bd157-0d6d-409c-b565-9afbb3312fe5'),
 ('510557','a48fc1cc-9303-44db-bc18-6730d6270019'),
 ('534350','c74e3ff2-cf7c-477a-8dad-ac11e45540ba')
) AS v(ext, pid)
WHERE pm.provider = 'hostaway' AND pm.external_id = v.ext;

DO $$
DECLARE bad int;
BEGIN
  SELECT count(*) INTO bad
  FROM pms.property_mappings m
  WHERE m.status = 'approved'
    AND (m.property_id IS NULL
         OR NOT EXISTS (SELECT 1 FROM public.property_definitions pd WHERE pd.property_id = m.property_id));
  IF bad > 0 THEN
    RAISE EXCEPTION 'P1 abort: % approved mapping(s) have NULL or dangling property_id', bad;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = r.relnamespace
    WHERE n.nspname = 'pms' AND r.relname = 'property_mappings'
      AND c.conname = 'property_mappings_approved_has_property_id'
  ) THEN
    ALTER TABLE pms.property_mappings
      ADD CONSTRAINT property_mappings_approved_has_property_id
      CHECK (status <> 'approved' OR property_id IS NOT NULL);
  END IF;
END $$;
