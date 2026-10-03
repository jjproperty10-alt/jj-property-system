-- Throwaway-only preconditions so the REAL Slice A migration
-- (supabase/migrations/20260930220000_client_entity_company_isolation.sql)
-- can run on local Postgres. Load AFTER throwaway_company_base.sql.
-- NEVER run against a Supabase project.
--
-- Slice A's opening guard is hard-coded to Production's shape on 2026-10-03.
-- This fixture satisfies that guard without copying Slice A. How:
--
--   schema_migrations count = 193
--     throwaway_company_base.sql already inserts the 4 real history rows the
--     company helpers need, including 20260930200000. This file adds 189
--     synthetic pad versions (19900101000001 .. 19900101000189). They are not
--     real migrations. 20260930220000 is intentionally absent so Slice A can
--     still see "not yet applied". 4 + 189 = 193.
--   companies = 1, active = 1, canonical_name <> 'Yossi Properties'
--     already true: Throwaway Company A (00000000-0000-4000-8000-00000000000a).
--   company_memberships = 1
--     already true in the base fixture.
--   lifecycle.entity_identity = 27 rows, column operating_company_id absent
--   lifecycle.management_relationship = 33 rows, column operating_company_id absent
--   registry.parties = 24 rows, every company_id = the sole company
--
-- Row level security is enabled and SELECT is granted to service_role and
-- authenticated so Slice A's own matrix can tell BYPASSRLS from the
-- RESTRICTIVE company_member_read policies. INSERT is not granted, so a
-- service_role insert is 42501. The foreign keys Slice A adds are NO ACTION
-- (Slice A does not say ON DELETE). This fixture does not add those columns.

INSERT INTO supabase_migrations.schema_migrations (version, name)
SELECT '19900101' || lpad(n::text, 6, '0'), 'throwaway_slice_a_history_pad'
FROM generate_series(1, 189) AS n;

CREATE TABLE lifecycle.entity_identity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_name text NOT NULL,
  aliases text[] NOT NULL DEFAULT '{}'::text[],
  entity_type text NOT NULL,
  status text NOT NULL DEFAULT 'active'::text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  contact_email text,
  contact_phone text,
  preferred_language text,
  country text,
  entity_legal_name text,
  internal_notes text,
  CONSTRAINT entity_identity_entity_type_check CHECK ((entity_type = ANY (ARRAY['partner'::text, 'investor'::text, 'jj_company'::text, 'external'::text, 'managed_client'::text, 'ownership_group'::text]))),
  CONSTRAINT entity_identity_preferred_language_check CHECK ((preferred_language = ANY (ARRAY['he'::text, 'en'::text, 'ru'::text]))),
  CONSTRAINT entity_identity_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text, 'void'::text])))
);

CREATE UNIQUE INDEX entity_identity_canonical_name_uq
  ON lifecycle.entity_identity (lower(canonical_name));

CREATE TABLE lifecycle.management_relationship (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES lifecycle.entity_identity (id),
  property_name text NOT NULL,
  relationship_type text NOT NULL DEFAULT 'managed_owner',
  status text NOT NULL DEFAULT 'active'
);

CREATE TABLE registry.parties (
  party_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES registry.companies (company_id),
  canonical_name text NOT NULL,
  party_type text NOT NULL DEFAULT 'owner',
  status text NOT NULL DEFAULT 'active'
);

INSERT INTO lifecycle.entity_identity (canonical_name, entity_type)
SELECT 'throwaway-client-' || lpad(n::text, 2, '0'), 'external'
FROM generate_series(1, 27) AS n;

INSERT INTO lifecycle.management_relationship (entity_id, property_name, relationship_type)
SELECT entity.id, 'throwaway-mr-' || lpad(n::text, 2, '0'), 'managed_owner'
FROM generate_series(1, 33) AS n
JOIN LATERAL (
  SELECT id
  FROM lifecycle.entity_identity
  ORDER BY canonical_name
  LIMIT 1
) AS entity ON true;

INSERT INTO registry.parties (company_id, canonical_name, party_type)
SELECT '00000000-0000-4000-8000-00000000000a', 'throwaway-party-' || lpad(n::text, 2, '0'), 'owner'
FROM generate_series(1, 24) AS n;

ALTER TABLE lifecycle.entity_identity ENABLE ROW LEVEL SECURITY;
ALTER TABLE lifecycle.management_relationship ENABLE ROW LEVEL SECURITY;
ALTER TABLE registry.parties ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE lifecycle.entity_identity, lifecycle.management_relationship, registry.parties
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE lifecycle.entity_identity, lifecycle.management_relationship, registry.parties
  TO authenticated, service_role;

DO $slice_a_preconditions$
DECLARE
  sole uuid;
BEGIN
  SELECT company_id INTO sole FROM registry.companies WHERE status = 'active';
  IF (SELECT count(*) FROM supabase_migrations.schema_migrations) <> 193
     OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260930200000') <> 1
     OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260930220000') <> 0
     OR (SELECT count(*) FROM registry.companies) <> 1
     OR (SELECT count(*) FROM registry.companies WHERE status = 'active') <> 1
     OR (SELECT count(*) FROM registry.companies WHERE canonical_name = 'Yossi Properties') <> 0
     OR (SELECT count(*) FROM access.company_memberships) <> 1
     OR (SELECT count(*) FROM lifecycle.entity_identity) <> 27
     OR (SELECT count(*) FROM lifecycle.management_relationship) <> 33
     OR (SELECT count(*) FROM registry.parties) <> 24
     OR (SELECT count(*) FROM registry.parties WHERE company_id = sole) <> 24
     OR EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'lifecycle'
         AND table_name IN ('entity_identity', 'management_relationship')
         AND column_name = 'operating_company_id'
     ) THEN
    RAISE EXCEPTION 'BLOCKED_BY_FIXTURE';
  END IF;
END
$slice_a_preconditions$;
