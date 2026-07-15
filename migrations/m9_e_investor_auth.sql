-- ============================================================================
-- Migration: m9_e_investor_auth
-- Schema: lifecycle
-- Purpose: Explicit database-backed mapping from auth.users.id to
--          lifecycle.entity_identity.id (Partner Authorization Infrastructure)
--
-- Architecture decisions (approved Yossi, 15 July 2026):
--   - Authoritative chain: auth_user_id → entity_id → authorized scope
--   - No FK to auth.users (avoid Supabase auth schema complications)
--   - 1:1 cardinality enforced via UNIQUE constraints (v1 — no delegates)
--   - RLS deny-all: only service_role may read this table
--   - Disabling via status='disabled' only — never DELETE a mapping record
--   - Full audit trail (created_by, disabled_at, disabled_by)
--
-- Rollback: DROP TABLE lifecycle.investor_auth;
-- ============================================================================

CREATE TABLE lifecycle.investor_auth (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The Supabase auth user ID (from session.user.id on the server).
  -- NOT a FK to auth.users — kept as UUID with application-level integrity.
  -- Must only ever be populated from a verified server session, never from
  -- a client-provided value.
  auth_user_id    uuid NOT NULL,

  -- The lifecycle entity this user is authorized to access as a partner.
  -- FK enforces referential integrity within the lifecycle schema.
  entity_id       uuid NOT NULL
    REFERENCES lifecycle.entity_identity(id)
    ON DELETE RESTRICT,

  -- Active mappings authorize access. Disabled mappings are rejected.
  -- Never DELETE a mapping — set status='disabled' and record disabled_at/by.
  status          text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'disabled')),

  -- Audit fields
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid NULL,    -- auth.users.id of the admin who created this
  disabled_at     timestamptz NULL,
  disabled_by     uuid NULL,    -- auth.users.id of the admin who disabled this

  -- v1 cardinality: one auth user → one investor entity, one-to-one.
  -- Do NOT relax these constraints to support delegates / family / accountants.
  -- Those use cases require a separate Delegated Access model (post-v1).
  CONSTRAINT investor_auth_auth_user_unique
    UNIQUE (auth_user_id),

  CONSTRAINT investor_auth_entity_unique
    UNIQUE (entity_id),

  -- Logical consistency: disabled records must have disabled_at populated.
  CONSTRAINT investor_auth_disabled_audit
    CHECK (
      (status = 'active'   AND disabled_at IS NULL AND disabled_by IS NULL)
      OR
      (status = 'disabled' AND disabled_at IS NOT NULL)
    )
);

COMMENT ON TABLE lifecycle.investor_auth IS
  'Explicit auth user → investor entity mapping. '
  'Authoritative authorization source for partner-facing statement access. '
  'RLS deny-all — readable only via service_role. '
  'Cardinality v1: one-to-one. Delegate access requires a separate model.';

COMMENT ON COLUMN lifecycle.investor_auth.auth_user_id IS
  'Supabase auth.users.id. No FK — application-level integrity. '
  'Must only be resolved from a verified server session.';

COMMENT ON COLUMN lifecycle.investor_auth.entity_id IS
  'lifecycle.entity_identity.id of the authorized investor.';

COMMENT ON COLUMN lifecycle.investor_auth.status IS
  'active = access allowed. disabled = access rejected. '
  'Set disabled_at + disabled_by when disabling. Never DELETE.';

-- ── Indexes ──────────────────────────────────────────────────────────────────

-- Primary lookup: auth_user_id → entity_id (used by resolver on every request)
CREATE INDEX investor_auth_auth_user_idx ON lifecycle.investor_auth (auth_user_id)
  WHERE status = 'active';

-- Secondary: entity_id → auth_user_id (admin tooling, reverse lookup)
CREATE INDEX investor_auth_entity_idx ON lifecycle.investor_auth (entity_id);

-- ── Row Level Security ────────────────────────────────────────────────────────
--
-- deny-all: no anon, no authenticated user can read or write this table.
-- Only service_role (which bypasses RLS) may access it.
-- This matches the security posture of all other lifecycle tables.

ALTER TABLE lifecycle.investor_auth ENABLE ROW LEVEL SECURITY;

-- No policies are created — absence of policies = deny-all for non-service-role.

-- ── Explicit privilege removal ────────────────────────────────────────────────
--
-- Supabase may grant default table privileges to the anon and authenticated roles
-- depending on project configuration. Explicitly revoke them here to make intent
-- clear and guard against future default-grant changes.
--
-- service_role bypasses RLS entirely and retains access — these REVOKE statements
-- do NOT affect service_role reads (used by the authorization resolver).

REVOKE ALL ON TABLE lifecycle.investor_auth FROM anon;
REVOKE ALL ON TABLE lifecycle.investor_auth FROM authenticated;
REVOKE ALL ON SEQUENCE lifecycle.investor_auth_id_seq FROM anon;
REVOKE ALL ON SEQUENCE lifecycle.investor_auth_id_seq FROM authenticated;

-- Note: if the sequence name differs (e.g. the id column uses gen_random_uuid()
-- and no sequence exists), the REVOKE ON SEQUENCE lines will produce a
-- "does not exist" notice but not an error — safe to run regardless.

-- ── Verification query (run after applying migration) ─────────────────────────
--
-- SELECT
--   table_name,
--   row_security
-- FROM information_schema.tables
-- WHERE table_schema = 'lifecycle'
--   AND table_name = 'investor_auth';
--
-- Expected: row_security = 'ENABLED'
--
-- SELECT COUNT(*) FROM lifecycle.investor_auth;
-- Expected: 0 (empty — provisioning is a separate step)
