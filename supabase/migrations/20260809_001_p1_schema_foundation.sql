-- =============================================================================
-- Migration: 20260809_001_p1_schema_foundation
-- Description: Owner Workspace P1 — Schema Foundation
-- Scope: lifecycle schema (jj_relationships, entity_property_associations)
--         + lifecycle.entity_identity (6 new nullable columns)
--         + public.property_definitions (property_id UUID + 5 new columns)
-- Constitutional: P-ARCH-1 (NULL = Unknown), P-ARCH-5 (lifecycle isolation),
--                 P0 Architecture (LOCKED 2026-08-07), ADR-006 R7
-- =============================================================================
-- IDEMPOTENCY:
-- Every DDL statement uses IF NOT EXISTS or DO $$ guards.
-- Re-running this migration on a database that already has these objects
-- produces zero changes and zero errors.
-- =============================================================================
-- SAFETY:
-- No DROP, DELETE, TRUNCATE, or UPDATE on any existing data.
-- No modification of existing columns, constraints, or indexes.
-- All new columns are nullable with no defaults that change existing rows.
-- property_id backfill and NOT NULL are separate steps (not in this migration).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- OPERATION 1: ALTER lifecycle.entity_identity — add 6 nullable columns
-- ---------------------------------------------------------------------------
-- P0 Data Requirements Entity 1: contact_email, contact_phone,
-- preferred_language (CHECK he/en/ru), country, entity_legal_name,
-- internal_notes. All NULL = Unknown (P-ARCH-1).

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'lifecycle' AND table_name = 'entity_identity'
      AND column_name = 'contact_email'
  ) THEN
    ALTER TABLE lifecycle.entity_identity
      ADD COLUMN contact_email TEXT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'lifecycle' AND table_name = 'entity_identity'
      AND column_name = 'contact_phone'
  ) THEN
    ALTER TABLE lifecycle.entity_identity
      ADD COLUMN contact_phone TEXT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'lifecycle' AND table_name = 'entity_identity'
      AND column_name = 'preferred_language'
  ) THEN
    ALTER TABLE lifecycle.entity_identity
      ADD COLUMN preferred_language TEXT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'lifecycle' AND table_name = 'entity_identity'
      AND column_name = 'country'
  ) THEN
    ALTER TABLE lifecycle.entity_identity
      ADD COLUMN country TEXT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'lifecycle' AND table_name = 'entity_identity'
      AND column_name = 'entity_legal_name'
  ) THEN
    ALTER TABLE lifecycle.entity_identity
      ADD COLUMN entity_legal_name TEXT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'lifecycle' AND table_name = 'entity_identity'
      AND column_name = 'internal_notes'
  ) THEN
    ALTER TABLE lifecycle.entity_identity
      ADD COLUMN internal_notes TEXT;
  END IF;
END $$;

-- CHECK constraint on preferred_language (idempotent — skip if exists)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'entity_identity_preferred_language_check'
      AND conrelid = 'lifecycle.entity_identity'::regclass
  ) THEN
    ALTER TABLE lifecycle.entity_identity
      ADD CONSTRAINT entity_identity_preferred_language_check
      CHECK (preferred_language IN ('he', 'en', 'ru'));
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- OPERATION 2: ALTER public.property_definitions — add property_id + 5 cols
-- ---------------------------------------------------------------------------
-- P0 Data Requirements Entity 4 Phase A: property_id UUID (gen_random_uuid(),
-- initially nullable — backfill + UNIQUE in separate step), canonical_name,
-- display_name, reporting_name, address, aliases, property_status.
-- property_name remains PK throughout Phase A.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'property_definitions'
      AND column_name = 'property_id'
  ) THEN
    ALTER TABLE public.property_definitions
      ADD COLUMN property_id UUID DEFAULT gen_random_uuid();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'property_definitions'
      AND column_name = 'canonical_name'
  ) THEN
    ALTER TABLE public.property_definitions
      ADD COLUMN canonical_name TEXT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'property_definitions'
      AND column_name = 'display_name'
  ) THEN
    ALTER TABLE public.property_definitions
      ADD COLUMN display_name TEXT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'property_definitions'
      AND column_name = 'reporting_name'
  ) THEN
    ALTER TABLE public.property_definitions
      ADD COLUMN reporting_name TEXT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'property_definitions'
      AND column_name = 'address'
  ) THEN
    ALTER TABLE public.property_definitions
      ADD COLUMN address TEXT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'property_definitions'
      AND column_name = 'aliases'
  ) THEN
    ALTER TABLE public.property_definitions
      ADD COLUMN aliases TEXT[];
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'property_definitions'
      AND column_name = 'property_status'
  ) THEN
    ALTER TABLE public.property_definitions
      ADD COLUMN property_status TEXT;
  END IF;
END $$;

-- CHECK constraint on property_status (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'property_definitions_property_status_check'
      AND conrelid = 'public.property_definitions'::regclass
  ) THEN
    ALTER TABLE public.property_definitions
      ADD CONSTRAINT property_definitions_property_status_check
      CHECK (property_status IN ('active', 'planned', 'under_renovation', 'sold', 'inactive'));
  END IF;
END $$;

-- Backfill property_id for existing rows (idempotent — only fills NULLs)
UPDATE public.property_definitions
SET property_id = gen_random_uuid()
WHERE property_id IS NULL;

-- Backfill canonical_name from property_name for existing rows (only fills NULLs)
UPDATE public.property_definitions
SET canonical_name = property_name
WHERE canonical_name IS NULL;

-- UNIQUE constraint on property_id (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'property_definitions_property_id_unique'
      AND conrelid = 'public.property_definitions'::regclass
  ) THEN
    ALTER TABLE public.property_definitions
      ADD CONSTRAINT property_definitions_property_id_unique UNIQUE (property_id);
  END IF;
END $$;

-- NOT NULL on property_id after backfill (idempotent)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'property_definitions'
      AND column_name = 'property_id' AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE public.property_definitions
      ALTER COLUMN property_id SET NOT NULL;
  END IF;
END $$;

-- NOT NULL on canonical_name after backfill (idempotent)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'property_definitions'
      AND column_name = 'canonical_name' AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE public.property_definitions
      ALTER COLUMN canonical_name SET NOT NULL;
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- OPERATION 3: CREATE lifecycle.jj_relationships
-- ---------------------------------------------------------------------------
-- P0 Data Requirements Entity 2: Entity-wide JJ relationship.
-- NOT property-scoped. Answers "Why does JJ know this person?"
-- 5 relationship types. RLS deny-all (zero policies).

CREATE TABLE IF NOT EXISTS lifecycle.jj_relationships (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id             UUID        NOT NULL,
  relationship_type     TEXT        NOT NULL,
  status                TEXT        NOT NULL DEFAULT 'draft',
  effective_from        DATE,                           -- NULL = unknown (P-ARCH-1)
  effective_to          DATE,                           -- NULL = ongoing
  verification_status   TEXT        NOT NULL DEFAULT 'unknown',
  notes                 TEXT,
  created_by            TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- CHECK constraints per P0 spec
  CONSTRAINT jj_relationships_type_check
    CHECK (relationship_type IN (
      'managed_client', 'investor', 'deal_partner',
      'internal_partner', 'private_client'
    )),

  CONSTRAINT jj_relationships_status_check
    CHECK (status IN ('draft', 'active', 'suspended', 'closed')),

  CONSTRAINT jj_relationships_verification_check
    CHECK (verification_status IN ('verified', 'pending_verification', 'unknown')),

  -- effective_to >= effective_from when both non-null
  CONSTRAINT jj_relationships_date_order_check
    CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from),

  -- FK to entity_identity
  CONSTRAINT jj_relationships_entity_fk
    FOREIGN KEY (entity_id) REFERENCES lifecycle.entity_identity(id)
);

-- Index on entity_id for lookups
CREATE INDEX IF NOT EXISTS idx_jj_relationships_entity_id
  ON lifecycle.jj_relationships(entity_id);

-- RLS: enable + deny-all (zero policies = no access except service_role/postgres)
ALTER TABLE lifecycle.jj_relationships ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- OPERATION 4: CREATE lifecycle.entity_property_associations
-- ---------------------------------------------------------------------------
-- P0 Data Requirements Entity 10: Lightweight link between entity and property.
-- Does NOT carry financial truth. Weakest authority level.
-- FK to entity_identity + property_definitions.property_id.
-- RLS deny-all (zero policies).

CREATE TABLE IF NOT EXISTS lifecycle.entity_property_associations (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id             UUID        NOT NULL,
  property_id           UUID        NOT NULL,
  association_source    TEXT        NOT NULL,
  status                TEXT        NOT NULL DEFAULT 'draft',
  effective_from        DATE,                           -- NULL = unknown (P-ARCH-1)
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- CHECK constraints per P0 spec
  CONSTRAINT epa_source_check
    CHECK (association_source IN (
      'wizard', 'ownership', 'service_engagement', 'deal_participation'
    )),

  CONSTRAINT epa_status_check
    CHECK (status IN ('draft', 'active', 'inactive')),

  -- FK to entity_identity
  CONSTRAINT epa_entity_fk
    FOREIGN KEY (entity_id) REFERENCES lifecycle.entity_identity(id),

  -- FK to property_definitions.property_id
  CONSTRAINT epa_property_fk
    FOREIGN KEY (property_id)
    REFERENCES public.property_definitions(property_id)
);

-- Indexes for lookups
CREATE INDEX IF NOT EXISTS idx_epa_entity_id
  ON lifecycle.entity_property_associations(entity_id);

CREATE INDEX IF NOT EXISTS idx_epa_property_id
  ON lifecycle.entity_property_associations(property_id);

-- RLS: enable + deny-all (zero policies = no access except service_role/postgres)
ALTER TABLE lifecycle.entity_property_associations ENABLE ROW LEVEL SECURITY;


-- =============================================================================
-- END OF MIGRATION
-- =============================================================================
