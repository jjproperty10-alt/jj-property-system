-- =============================================================================
-- Migration: 20260811_001_p2_update_service_engagement
-- Description: P2 PR #4 — Service Engagement Write/Edit Lifecycle
-- Scope: GRANT UPDATE on service_engagements
--         + update_service_engagement RPC (typed-patch semantics)
--         + get_entity_associated_properties RPC (property dropdown)
-- Constitutional: P-ARCH-1 (NULL = Unknown), P-ARCH-4 (no delete),
--                 P-ARCH-5 (lifecycle isolation), P0 Architecture (LOCKED)
-- =============================================================================
-- IDEMPOTENCY:
-- CREATE OR REPLACE for functions. GRANT is idempotent. Re-running is safe.
-- =============================================================================
-- SAFETY:
-- No DROP, DELETE, TRUNCATE on any existing data.
-- No modification of existing tables, columns, constraints, or indexes.
-- public.transactions is not touched.
-- =============================================================================
-- ROLLBACK:
-- DROP FUNCTION IF EXISTS lifecycle.update_service_engagement(UUID,TEXT,BOOLEAN,DATE,BOOLEAN,DATE,BOOLEAN,TEXT);
-- DROP FUNCTION IF EXISTS lifecycle.get_entity_associated_properties(UUID);
-- REVOKE UPDATE ON TABLE lifecycle.service_engagements FROM service_role;
-- =============================================================================


-- ---------------------------------------------------------------------------
-- PART A: GRANT UPDATE to service_role
-- ---------------------------------------------------------------------------
-- PR #107 (20260810_002) only granted SELECT,INSERT. The update RPC needs
-- UPDATE permission via service_role (SECURITY DEFINER context).

GRANT UPDATE ON TABLE lifecycle.service_engagements TO service_role;


-- ---------------------------------------------------------------------------
-- PART B: RPC — update_service_engagement (typed-patch semantics)
-- ---------------------------------------------------------------------------
-- Updates a single service engagement using typed-patch semantics:
--   p_set_X = FALSE (default) → field is NOT touched (preserve existing value)
--   p_set_X = TRUE, p_X = value → field is SET to value (including NULL)
--
-- This distinguishes "field not supplied" from "field explicitly set to NULL".
--
-- Immutable fields (never changed): entity_id, property_id, service_type,
--   created_by, created_at.
--
-- Status transitions allowed: draft→active, active→suspended, suspended→active,
--   any→closed. No transition FROM closed.
--
-- Temporal validation: effective_to >= effective_from when both are non-null.
-- updated_at is set to now() on every successful update.
--
-- Returns the updated row for client-side confirmation.

CREATE OR REPLACE FUNCTION lifecycle.update_service_engagement(
  p_id                  UUID,
  p_status              TEXT    DEFAULT NULL,
  p_set_effective_from  BOOLEAN DEFAULT FALSE,
  p_effective_from      DATE    DEFAULT NULL,
  p_set_effective_to    BOOLEAN DEFAULT FALSE,
  p_effective_to        DATE    DEFAULT NULL,
  p_set_notes           BOOLEAN DEFAULT FALSE,
  p_notes               TEXT    DEFAULT NULL
)
RETURNS lifecycle.service_engagements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = lifecycle, public
AS $$
DECLARE
  v_row lifecycle.service_engagements;
  v_new_from DATE;
  v_new_to   DATE;
BEGIN
  -- Lock and fetch the current row
  SELECT * INTO v_row
  FROM lifecycle.service_engagements
  WHERE id = p_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Service engagement not found: %', p_id;
  END IF;

  -- ── Status transition validation ────────────────────────────────────────
  IF p_status IS NOT NULL AND p_status <> v_row.status THEN
    -- Cannot transition FROM closed
    IF v_row.status = 'closed' THEN
      RAISE EXCEPTION 'Cannot change status of a closed engagement (id=%)', p_id;
    END IF;

    -- Validate target status
    IF p_status NOT IN ('draft', 'active', 'suspended', 'closed') THEN
      RAISE EXCEPTION 'Invalid status: %', p_status;
    END IF;

    -- Validate specific transitions
    IF v_row.status = 'draft' AND p_status NOT IN ('active', 'closed') THEN
      RAISE EXCEPTION 'Draft can only transition to active or closed, not %', p_status;
    END IF;
    IF v_row.status = 'active' AND p_status NOT IN ('suspended', 'closed') THEN
      RAISE EXCEPTION 'Active can only transition to suspended or closed, not %', p_status;
    END IF;
    IF v_row.status = 'suspended' AND p_status NOT IN ('active', 'closed') THEN
      RAISE EXCEPTION 'Suspended can only transition to active or closed, not %', p_status;
    END IF;
  END IF;

  -- ── Compute new temporal values ─────────────────────────────────────────
  v_new_from := CASE WHEN p_set_effective_from THEN p_effective_from ELSE v_row.effective_from END;
  v_new_to   := CASE WHEN p_set_effective_to   THEN p_effective_to   ELSE v_row.effective_to   END;

  -- Temporal validation: effective_to >= effective_from when both non-null
  IF v_new_from IS NOT NULL AND v_new_to IS NOT NULL AND v_new_to < v_new_from THEN
    RAISE EXCEPTION 'effective_to (%) must be >= effective_from (%)', v_new_to, v_new_from;
  END IF;

  -- ── Apply update ────────────────────────────────────────────────────────
  UPDATE lifecycle.service_engagements
  SET
    status         = COALESCE(p_status, v_row.status),
    effective_from = v_new_from,
    effective_to   = v_new_to,
    notes          = CASE WHEN p_set_notes THEN p_notes ELSE v_row.notes END,
    updated_at     = now()
  WHERE id = p_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- Security: service_role only (called by Server Actions after staff auth)
REVOKE ALL ON FUNCTION lifecycle.update_service_engagement(UUID,TEXT,BOOLEAN,DATE,BOOLEAN,DATE,BOOLEAN,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION lifecycle.update_service_engagement(UUID,TEXT,BOOLEAN,DATE,BOOLEAN,DATE,BOOLEAN,TEXT) FROM anon;
REVOKE ALL ON FUNCTION lifecycle.update_service_engagement(UUID,TEXT,BOOLEAN,DATE,BOOLEAN,DATE,BOOLEAN,TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION lifecycle.update_service_engagement(UUID,TEXT,BOOLEAN,DATE,BOOLEAN,DATE,BOOLEAN,TEXT) TO service_role;

COMMENT ON FUNCTION lifecycle.update_service_engagement IS
  'P2 PR #4 — Updates a service engagement with typed-patch semantics. '
  'p_set_X booleans distinguish "not supplied" from "explicitly NULL". '
  'Status transitions: draft→active, active→suspended, suspended→active, any→closed. '
  'No transition from closed. Temporal: effective_to >= effective_from. '
  'SECURITY DEFINER, service_role only.';


-- ---------------------------------------------------------------------------
-- PART C: RPC — get_entity_associated_properties (property dropdown)
-- ---------------------------------------------------------------------------
-- Returns properties associated with an entity for UI selection.
-- Joins entity_property_associations → property_definitions to get names.
-- Used by the "Add Service" form to populate the property dropdown.

CREATE OR REPLACE FUNCTION lifecycle.get_entity_associated_properties(
  p_entity_id UUID
)
RETURNS TABLE (
  property_id     UUID,
  property_name   TEXT,
  association_source TEXT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = lifecycle, public
AS $$
  SELECT
    epa.property_id,
    COALESCE(pd.display_name, pd.canonical_name, pd.property_name) AS property_name,
    epa.association_source
  FROM lifecycle.entity_property_associations epa
  JOIN public.property_definitions pd
    ON pd.property_id = epa.property_id
  WHERE epa.entity_id = p_entity_id
    AND epa.status = 'active'
  ORDER BY property_name;
$$;

REVOKE ALL ON FUNCTION lifecycle.get_entity_associated_properties(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION lifecycle.get_entity_associated_properties(UUID) FROM anon;
REVOKE ALL ON FUNCTION lifecycle.get_entity_associated_properties(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION lifecycle.get_entity_associated_properties(UUID) TO service_role;

COMMENT ON FUNCTION lifecycle.get_entity_associated_properties IS
  'P2 PR #4 — Returns properties associated with an entity (active associations only). '
  'Joins entity_property_associations → property_definitions for display names. '
  'Used by Service Engagement UI for property dropdown. '
  'SECURITY DEFINER, service_role only.';
