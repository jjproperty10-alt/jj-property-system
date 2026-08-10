-- =============================================================================
-- Migration: 20260810_002_p2_service_engagements
-- Description: P2 PR #1 — Service Engagement Schema Foundation
-- Scope: GRANT fix (jj_relationships, entity_property_associations)
--         + lifecycle.service_engagements table
--         + 3 SECURITY DEFINER RPCs (create, get-by-entity, get-by-property)
-- Constitutional: P-ARCH-1 (NULL = Unknown), P-ARCH-4 (no delete),
--                 P-ARCH-5 (lifecycle isolation), P0 Architecture (LOCKED)
-- =============================================================================
-- IDEMPOTENCY:
-- CREATE TABLE uses IF NOT EXISTS. GRANTs are idempotent by PostgreSQL spec.
-- CREATE OR REPLACE for functions. Re-running is safe.
-- =============================================================================
-- SAFETY:
-- No DROP, DELETE, TRUNCATE, or UPDATE on any existing data.
-- No modification of existing tables, columns, constraints, or indexes.
-- public.transactions is not touched.
-- =============================================================================
-- ROLLBACK:
-- DROP FUNCTION IF EXISTS lifecycle.create_service_engagement(UUID,UUID,TEXT,TEXT,DATE,DATE,TEXT,UUID);
-- DROP FUNCTION IF EXISTS lifecycle.get_entity_service_engagements(UUID);
-- DROP FUNCTION IF EXISTS lifecycle.get_property_service_engagements(UUID);
-- DROP TABLE IF EXISTS lifecycle.service_engagements;
-- (GRANTs are additive — no REVOKE needed for rollback)
-- =============================================================================


-- ---------------------------------------------------------------------------
-- PART A: GRANT FIX
-- ---------------------------------------------------------------------------
-- Root cause: P1 migration (20260809_001) created jj_relationships and
-- entity_property_associations but omitted GRANT SELECT to service_role.
-- Same bug class as 20260730_fix_management_relationship_grant.sql.
-- Impact: identityResolverService draft owner queries silently fail
-- (try/catch swallows 403 → drafts invisible in Owners Room).
-- PostgreSQL GRANT is idempotent — safe to run multiple times.

GRANT SELECT ON TABLE lifecycle.jj_relationships TO service_role;
GRANT SELECT ON TABLE lifecycle.entity_property_associations TO service_role;


-- ---------------------------------------------------------------------------
-- PART B: CREATE lifecycle.service_engagements
-- ---------------------------------------------------------------------------
-- Business model:
--   Entity + Property → 0..N Service Engagements (concurrent + sequential)
--   Service types: renovation, sale, management_ltr, airbnb_str
--   No financial semantics. No Commercial Terms. No terms_json.
--   Independent from: ownership, deal participation, settlement, financial events.
--
-- Design decisions:
--   - property_id UUID (new standard per P1 PR #106), NOT property_name TEXT
--   - NO UNIQUE constraint on (entity_id, property_id, service_type)
--     Multiple rows intentionally allowed (concurrent + reopened services)
--   - effective_from/to nullable: NULL = unknown (P-ARCH-1)
--   - No auto-close: creating a new engagement never modifies existing ones

CREATE TABLE IF NOT EXISTS lifecycle.service_engagements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  entity_id       UUID NOT NULL
                    REFERENCES lifecycle.entity_identity(id),

  property_id     UUID NOT NULL
                    REFERENCES public.property_definitions(property_id),

  service_type    TEXT NOT NULL
                    CHECK (service_type IN (
                      'renovation',
                      'sale',
                      'management_ltr',
                      'airbnb_str'
                    )),

  status          TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN (
                      'draft',
                      'active',
                      'suspended',
                      'closed'
                    )),

  effective_from  DATE,
  effective_to    DATE,

  notes           TEXT,

  created_by      UUID NOT NULL,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------------
-- PART C: INDEXES
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_se_entity_id
  ON lifecycle.service_engagements (entity_id);

CREATE INDEX IF NOT EXISTS idx_se_property_id
  ON lifecycle.service_engagements (property_id);

CREATE INDEX IF NOT EXISTS idx_se_entity_property
  ON lifecycle.service_engagements (entity_id, property_id);

CREATE INDEX IF NOT EXISTS idx_se_status
  ON lifecycle.service_engagements (status);


-- ---------------------------------------------------------------------------
-- PART D: RLS — deny-all
-- ---------------------------------------------------------------------------
-- Consistent with all lifecycle tables. Direct table access blocked for
-- anon and authenticated. All access via SECURITY DEFINER RPCs through
-- service_role (called by Server Actions after staff authorization).

ALTER TABLE lifecycle.service_engagements ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'lifecycle'
      AND tablename = 'service_engagements'
      AND policyname = 'deny_all_service_engagements'
  ) THEN
    CREATE POLICY deny_all_service_engagements
      ON lifecycle.service_engagements
      AS RESTRICTIVE
      FOR ALL
      TO PUBLIC
      USING (false);
  END IF;
END $$;

-- service_role needs direct table access for the SECURITY DEFINER functions
GRANT SELECT, INSERT ON TABLE lifecycle.service_engagements TO service_role;


-- ---------------------------------------------------------------------------
-- PART E: RPC — create_service_engagement
-- ---------------------------------------------------------------------------
-- Creates a single service engagement. Does not infer entity, property, or
-- service type. Does not auto-close or modify any existing record.
-- Does not touch ownership, associations, transactions, or financial data.

CREATE OR REPLACE FUNCTION lifecycle.create_service_engagement(
  p_entity_id      UUID,
  p_property_id    UUID,
  p_service_type   TEXT,
  p_status         TEXT DEFAULT 'draft',
  p_effective_from DATE DEFAULT NULL,
  p_effective_to   DATE DEFAULT NULL,
  p_notes          TEXT DEFAULT NULL,
  p_created_by     UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = lifecycle, public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO lifecycle.service_engagements (
    entity_id,
    property_id,
    service_type,
    status,
    effective_from,
    effective_to,
    notes,
    created_by
  ) VALUES (
    p_entity_id,
    p_property_id,
    p_service_type,
    p_status,
    p_effective_from,
    p_effective_to,
    p_notes,
    COALESCE(p_created_by, auth.uid())
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Security: service_role only (called by Server Actions after staff auth)
REVOKE ALL ON FUNCTION lifecycle.create_service_engagement(UUID,UUID,TEXT,TEXT,DATE,DATE,TEXT,UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION lifecycle.create_service_engagement(UUID,UUID,TEXT,TEXT,DATE,DATE,TEXT,UUID) FROM anon;
REVOKE ALL ON FUNCTION lifecycle.create_service_engagement(UUID,UUID,TEXT,TEXT,DATE,DATE,TEXT,UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION lifecycle.create_service_engagement(UUID,UUID,TEXT,TEXT,DATE,DATE,TEXT,UUID) TO service_role;

COMMENT ON FUNCTION lifecycle.create_service_engagement IS
  'P2 PR #1 — Creates a service engagement for an entity on a property. '
  'SECURITY DEFINER, service_role only. No auto-close, no inference, '
  'no financial side-effects. See P2 Planning Gate v2.0.';


-- ---------------------------------------------------------------------------
-- PART E: RPC — get_entity_service_engagements
-- ---------------------------------------------------------------------------
-- Returns all service engagements for a given entity, ordered by
-- effective_from DESC NULLS LAST, created_at DESC.

CREATE OR REPLACE FUNCTION lifecycle.get_entity_service_engagements(
  p_entity_id UUID
)
RETURNS SETOF lifecycle.service_engagements
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = lifecycle, public
AS $$
  SELECT *
  FROM lifecycle.service_engagements
  WHERE entity_id = p_entity_id
  ORDER BY effective_from DESC NULLS LAST, created_at DESC;
$$;

REVOKE ALL ON FUNCTION lifecycle.get_entity_service_engagements(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION lifecycle.get_entity_service_engagements(UUID) FROM anon;
REVOKE ALL ON FUNCTION lifecycle.get_entity_service_engagements(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION lifecycle.get_entity_service_engagements(UUID) TO service_role;

COMMENT ON FUNCTION lifecycle.get_entity_service_engagements IS
  'P2 PR #1 — Returns all service engagements for an entity. '
  'Deterministic order: effective_from DESC NULLS LAST, created_at DESC. '
  'SECURITY DEFINER, service_role only.';


-- ---------------------------------------------------------------------------
-- PART E: RPC — get_property_service_engagements
-- ---------------------------------------------------------------------------
-- Returns all service engagements for a given property, ordered by
-- effective_from DESC NULLS LAST, created_at DESC.

CREATE OR REPLACE FUNCTION lifecycle.get_property_service_engagements(
  p_property_id UUID
)
RETURNS SETOF lifecycle.service_engagements
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = lifecycle, public
AS $$
  SELECT *
  FROM lifecycle.service_engagements
  WHERE property_id = p_property_id
  ORDER BY effective_from DESC NULLS LAST, created_at DESC;
$$;

REVOKE ALL ON FUNCTION lifecycle.get_property_service_engagements(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION lifecycle.get_property_service_engagements(UUID) FROM anon;
REVOKE ALL ON FUNCTION lifecycle.get_property_service_engagements(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION lifecycle.get_property_service_engagements(UUID) TO service_role;

COMMENT ON FUNCTION lifecycle.get_property_service_engagements IS
  'P2 PR #1 — Returns all service engagements for a property (by property_id UUID). '
  'Deterministic order: effective_from DESC NULLS LAST, created_at DESC. '
  'SECURITY DEFINER, service_role only.';
