-- Throwaway-only fixture for local company-isolation matrices.
-- NEVER run this against a Supabase project (Production, Staging or any other).
-- The runner refuses any non-local connection string.
--
-- Function bodies below are copied from read-only captures of Production
-- (vsiiprzjrstjcmjpwcrd, 2026-10-03, BEGIN READ ONLY ... ROLLBACK) so the
-- matrices exercise the same company helpers the live database runs.
-- Live access.is_company_member stores CRLF line endings; this copy uses LF
-- (same tokens, same behaviour). Company and user UUIDs are synthetic.

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
END
$roles$;

CREATE SCHEMA auth;
CREATE SCHEMA registry;
CREATE SCHEMA access;
CREATE SCHEMA lifecycle;
CREATE SCHEMA supabase_migrations;

GRANT USAGE ON SCHEMA auth, registry, access, lifecycle, public TO anon, authenticated, service_role;

CREATE TABLE supabase_migrations.schema_migrations (
  version text NOT NULL,
  name text
);

-- Only the history rows the guards in these slices read.
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES
  ('20260929120000', 'verified_operating_company_context'),
  ('20260929200000', 'internal_operating_company_path'),
  ('20260930120000', 'company_member_read_isolation'),
  ('20260930200000', 'service_role_read_company');

CREATE OR REPLACE FUNCTION auth.jwt()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  select 
    coalesce(
        nullif(current_setting('request.jwt.claim', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')
    )::jsonb
$function$;

CREATE OR REPLACE FUNCTION auth.role()
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$function$;

CREATE OR REPLACE FUNCTION auth.uid()
 RETURNS uuid
 LANGUAGE sql
 STABLE
AS $function$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$function$;

CREATE TABLE registry.companies (
  company_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE registry.companies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE registry.companies FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE access.company_memberships (
  membership_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES registry.companies (company_id),
  user_id uuid NOT NULL,
  membership_role text NOT NULL DEFAULT 'company_admin',
  is_active boolean NOT NULL DEFAULT true
);
ALTER TABLE access.company_memberships ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE access.company_memberships FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE access.internal_company_write_permit (
  txid bigint PRIMARY KEY,
  company_id uuid NOT NULL
);
ALTER TABLE access.internal_company_write_permit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE access.internal_company_write_permit FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION access.is_company_member(target_company_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  SELECT target_company_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM access.company_memberships AS membership
      WHERE membership.company_id = target_company_id
        AND membership.user_id = (SELECT auth.uid())
        AND membership.is_active
    );
$function$;
REVOKE ALL ON FUNCTION access.is_company_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION access.is_company_member(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION access.arm_internal_operating_company(p_company uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
  IF p_company IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM registry.companies
       WHERE company_id = p_company
         AND status = 'active'
     ) THEN
    RAISE EXCEPTION 'BLOCKED_BY_COMPANY_CONTEXT';
  END IF;

  INSERT INTO access.internal_company_write_permit (txid, company_id)
  VALUES (pg_catalog.txid_current(), p_company)
  ON CONFLICT (txid) DO UPDATE
    SET company_id = EXCLUDED.company_id;
END
$function$;

CREATE OR REPLACE FUNCTION access.disarm_internal_operating_company()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
  DELETE FROM access.internal_company_write_permit
  WHERE txid = pg_catalog.txid_current();
END
$function$;
REVOKE ALL ON FUNCTION access.arm_internal_operating_company(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION access.disarm_internal_operating_company() FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION access.resolve_verified_operating_company(p_requested uuid, p_inherited boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  actor uuid;
  session_role text;
  active_count integer;
  sole_company uuid;
  internal_company uuid;
BEGIN
  LOCK TABLE registry.companies IN SHARE ROW EXCLUSIVE MODE;

  actor := auth.uid();
  session_role := auth.role();

  IF session_role = 'anon'
     OR (session_role = 'authenticated' AND actor IS NULL) THEN
    RAISE EXCEPTION 'BLOCKED_BY_COMPANY_CONTEXT';
  END IF;

  SELECT count(*)
    INTO active_count
  FROM registry.companies
  WHERE status = 'active';

  IF active_count = 1 THEN
    SELECT company_id
      INTO sole_company
    FROM registry.companies
    WHERE status = 'active';
  END IF;

  SELECT permit.company_id
    INTO internal_company
  FROM access.internal_company_write_permit AS permit
  WHERE permit.txid = pg_catalog.txid_current();

  IF p_inherited THEN
    IF p_requested IS NULL
       OR NOT EXISTS (
         SELECT 1
         FROM registry.companies
         WHERE company_id = p_requested
           AND status = 'active'
       ) THEN
      RAISE EXCEPTION 'BLOCKED_BY_PARENT_COMPANY';
    END IF;
    IF actor IS NULL THEN
      IF internal_company IS NOT NULL
         AND p_requested IS NOT DISTINCT FROM internal_company THEN
        RETURN p_requested;
      END IF;
      IF active_count IS DISTINCT FROM 1
         OR p_requested IS DISTINCT FROM sole_company THEN
        RAISE EXCEPTION 'BLOCKED_BY_COMPANY_CONTEXT';
      END IF;
      RETURN p_requested;
    END IF;
    IF NOT access.is_company_member(p_requested) THEN
      RAISE EXCEPTION 'BLOCKED_BY_COMPANY_CONTEXT';
    END IF;
    RETURN p_requested;
  END IF;

  IF p_requested IS NULL THEN
    IF active_count IS DISTINCT FROM 1 OR sole_company IS NULL THEN
      RAISE EXCEPTION 'BLOCKED_BY_COMPANY_CONTEXT';
    END IF;
    IF actor IS NOT NULL AND NOT access.is_company_member(sole_company) THEN
      RAISE EXCEPTION 'BLOCKED_BY_COMPANY_CONTEXT';
    END IF;
    RETURN sole_company;
  END IF;

  IF actor IS NULL
     AND internal_company IS NOT NULL
     AND p_requested IS NOT DISTINCT FROM internal_company
     AND EXISTS (
       SELECT 1
       FROM registry.companies
       WHERE company_id = p_requested
         AND status = 'active'
     ) THEN
    RETURN p_requested;
  END IF;

  IF actor IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM registry.companies
       WHERE company_id = p_requested
         AND status = 'active'
     )
     OR NOT access.is_company_member(p_requested)
     OR (active_count = 1 AND p_requested IS DISTINCT FROM sole_company) THEN
    RAISE EXCEPTION 'BLOCKED_BY_COMPANY_CONTEXT';
  END IF;

  RETURN p_requested;
END
$function$;
REVOKE ALL ON FUNCTION access.resolve_verified_operating_company(uuid, boolean) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION access.resolve_service_read_company(p_requested uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  actor uuid;
  session_role text;
  active_count integer;
  sole_company uuid;
  internal_company uuid;
BEGIN
  LOCK TABLE registry.companies IN SHARE ROW EXCLUSIVE MODE;

  actor := auth.uid();
  session_role := auth.role();

  IF session_role IS DISTINCT FROM 'service_role' OR actor IS NOT NULL THEN
    RAISE EXCEPTION 'BLOCKED_BY_COMPANY_CONTEXT';
  END IF;

  SELECT count(*)
    INTO active_count
  FROM registry.companies
  WHERE status = 'active';

  IF active_count = 1 THEN
    SELECT company_id
      INTO sole_company
    FROM registry.companies
    WHERE status = 'active';
  END IF;

  SELECT permit.company_id
    INTO internal_company
  FROM access.internal_company_write_permit AS permit
  WHERE permit.txid = pg_catalog.txid_current();

  IF p_requested IS NULL THEN
    IF active_count IS DISTINCT FROM 1 OR sole_company IS NULL THEN
      RAISE EXCEPTION 'BLOCKED_BY_COMPANY_CONTEXT';
    END IF;
    RETURN sole_company;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM registry.companies
    WHERE company_id = p_requested
      AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'BLOCKED_BY_COMPANY_CONTEXT';
  END IF;

  IF internal_company IS NOT NULL
     AND p_requested IS NOT DISTINCT FROM internal_company THEN
    RETURN p_requested;
  END IF;

  IF active_count = 1 AND p_requested IS NOT DISTINCT FROM sole_company THEN
    RETURN p_requested;
  END IF;

  RAISE EXCEPTION 'BLOCKED_BY_COMPANY_CONTEXT';
END
$function$;
REVOKE ALL ON FUNCTION access.resolve_service_read_company(uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.resolve_service_read_company(p_requested uuid)
 RETURNS uuid
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  SELECT access.resolve_service_read_company(p_requested);
$function$;
REVOKE ALL ON FUNCTION public.resolve_service_read_company(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_service_read_company(uuid) TO service_role;

-- One active company and one admin membership, like Production today. Synthetic UUIDs.
INSERT INTO registry.companies (company_id, canonical_name, status)
VALUES ('00000000-0000-4000-8000-00000000000a', 'Throwaway Company A', 'active');
INSERT INTO access.company_memberships (company_id, user_id, membership_role, is_active)
VALUES ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000a1', 'company_admin', true);
