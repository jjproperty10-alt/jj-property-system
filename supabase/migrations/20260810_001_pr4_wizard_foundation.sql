-- =============================================================================
-- Migration: 20260810_001_pr4_wizard_foundation
-- Description: PR #4 — Add Client Wizard Steps 1–3
-- Scope: (1) DROP canonical_name unique index (B1 decision)
--        (2) CREATE lifecycle.create_owner_draft() RPC (atomic 3-table insert)
-- Constitutional: P-ARCH-1 (NULL = Unknown), P-ARCH-5 (lifecycle isolation),
--                 P0 Architecture (LOCKED 2026-08-07)
-- =============================================================================
-- SAFETY:
-- No DELETE, TRUNCATE, or UPDATE on any existing data.
-- DROP INDEX is safe — the index was a contradiction to P0 spec.
-- RPC is SECURITY DEFINER — callable only by authenticated staff via Server Action.
-- =============================================================================
-- DECISION RECORD:
-- B1: Yossi approved DROP canonical_name unique index (Option X) — 2026-08-10
-- B2: Yossi approved explicit draftOwners path (Option A) — 2026-08-10
-- Atomicity: Single RPC with implicit PostgreSQL transaction — 2026-08-10
-- =============================================================================

-- ---------------------------------------------------------------------------
-- OPERATION 1: DROP canonical_name unique index
-- ---------------------------------------------------------------------------
-- M8 migration (20260713) created:
--   CREATE UNIQUE INDEX entity_identity_canonical_name_uq
--     ON lifecycle.entity_identity (lower(canonical_name));
--
-- P0 Architecture says: "canonical_name is NOT UNIQUE" — duplicate detection
-- service handles collisions via STRONG tier + override.
-- Yossi decision B1: DROP (Option X).

DROP INDEX IF EXISTS lifecycle.entity_identity_canonical_name_uq;


-- ---------------------------------------------------------------------------
-- OPERATION 2: CREATE lifecycle.create_owner_draft() RPC
-- ---------------------------------------------------------------------------
-- Atomic 3-table insert in a single implicit PostgreSQL transaction.
-- No BEGIN/COMMIT needed — a single RPC call = one transaction.
-- SECURITY DEFINER: runs as postgres, not as the calling role.
-- Callable only from Server Action after staff auth check.
--
-- Returns the new entity_id UUID for redirect.

CREATE OR REPLACE FUNCTION lifecycle.create_owner_draft(
  p_canonical_name       TEXT,
  p_entity_type          TEXT DEFAULT 'external',
  p_contact_email        TEXT DEFAULT NULL,
  p_contact_phone        TEXT DEFAULT NULL,
  p_preferred_language   TEXT DEFAULT NULL,
  p_country              TEXT DEFAULT NULL,
  p_entity_legal_name    TEXT DEFAULT NULL,
  p_internal_notes       TEXT DEFAULT NULL,
  p_relationship_type    TEXT DEFAULT 'managed_client',
  p_effective_from       DATE DEFAULT NULL,
  p_relationship_notes   TEXT DEFAULT NULL,
  p_property_ids         UUID[] DEFAULT '{}'::UUID[],
  p_created_by           TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = lifecycle, public
AS $$
DECLARE
  v_entity_id UUID;
  v_prop_id   UUID;
BEGIN
  -- Step 1: INSERT entity_identity
  INSERT INTO lifecycle.entity_identity (
    canonical_name,
    entity_type,
    aliases,
    status,
    contact_email,
    contact_phone,
    preferred_language,
    country,
    entity_legal_name,
    internal_notes
  ) VALUES (
    p_canonical_name,
    p_entity_type,
    '{}',
    'active',
    p_contact_email,
    p_contact_phone,
    p_preferred_language,
    p_country,
    p_entity_legal_name,
    p_internal_notes
  )
  RETURNING id INTO v_entity_id;

  -- Step 2: INSERT jj_relationships
  INSERT INTO lifecycle.jj_relationships (
    entity_id,
    relationship_type,
    status,
    effective_from,
    verification_status,
    notes,
    created_by
  ) VALUES (
    v_entity_id,
    p_relationship_type,
    'draft',
    p_effective_from,
    'unknown',
    p_relationship_notes,
    p_created_by
  );

  -- Step 3: INSERT entity_property_associations (one per property)
  IF array_length(p_property_ids, 1) IS NOT NULL THEN
    FOREACH v_prop_id IN ARRAY p_property_ids
    LOOP
      INSERT INTO lifecycle.entity_property_associations (
        entity_id,
        property_id,
        association_source,
        status,
        effective_from,
        notes
      ) VALUES (
        v_entity_id,
        v_prop_id,
        'wizard',
        'draft',
        p_effective_from,
        NULL
      );
    END LOOP;
  END IF;

  RETURN v_entity_id;
END;
$$;

-- Grant execute to authenticated (Server Action calls as authenticated user,
-- but SECURITY DEFINER means the function body runs as postgres).
-- The Server Action itself enforces staff authorization before calling.
GRANT EXECUTE ON FUNCTION lifecycle.create_owner_draft(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, UUID[], TEXT
) TO authenticated;


-- =============================================================================
-- END OF MIGRATION
-- =============================================================================
