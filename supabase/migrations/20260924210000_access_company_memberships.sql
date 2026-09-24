-- Phase 1 membership foundation.
-- registry.companies.company_id is the only company key. This migration does not
-- create a company and does not write ledger, PMS, or reporting objects.
-- The bootstrap constant is the canonical company id, not a user id.
-- service_role has rolbypassrls, so these policies do not apply to it.
-- service_role still needs explicit table grants. It is the server administration
-- path and can read inactive rows and write memberships. Do not use it in the browser.

BEGIN;

CREATE SCHEMA access;

REVOKE ALL ON SCHEMA access FROM PUBLIC;
GRANT USAGE ON SCHEMA access TO authenticated, service_role;

CREATE TABLE access.company_memberships (
  membership_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  user_id uuid NOT NULL,
  membership_role text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT company_memberships_company_fk
    FOREIGN KEY (company_id) REFERENCES registry.companies (company_id) ON DELETE RESTRICT,
  CONSTRAINT company_memberships_user_fk
    FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE,
  CONSTRAINT company_memberships_one_per_user_company
    UNIQUE (company_id, user_id),
  CONSTRAINT company_memberships_role_check
    CHECK (membership_role = ANY (ARRAY['company_admin'::text, 'member'::text]))
);

CREATE INDEX company_memberships_user_id_idx
  ON access.company_memberships (user_id);

REVOKE ALL ON TABLE access.company_memberships FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE access.company_memberships TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE access.company_memberships TO service_role;

ALTER TABLE access.company_memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY read_own_active_company_membership
  ON access.company_memberships
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()) AND is_active);

CREATE FUNCTION access.reject_membership_identity_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF NEW.company_id IS DISTINCT FROM OLD.company_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
  THEN
    RAISE EXCEPTION 'BLOCKED_BY_IMMUTABLE_IDENTITY';
  END IF;
  NEW.updated_at := pg_catalog.now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER company_memberships_identity_immutable
  BEFORE UPDATE ON access.company_memberships
  FOR EACH ROW
  EXECUTE FUNCTION access.reject_membership_identity_change();

CREATE FUNCTION access.is_company_member(target_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = pg_catalog
AS $$
  SELECT target_company_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM access.company_memberships AS membership
      WHERE membership.company_id = target_company_id
        AND membership.user_id = (SELECT auth.uid())
        AND membership.is_active
    );
$$;

CREATE FUNCTION access.is_company_admin(target_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = pg_catalog
AS $$
  SELECT target_company_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM access.company_memberships AS membership
      WHERE membership.company_id = target_company_id
        AND membership.user_id = (SELECT auth.uid())
        AND membership.is_active
        AND membership.membership_role = 'company_admin'
    );
$$;

CREATE FUNCTION access.grant_company_membership(
  target_company_id uuid,
  target_user_id uuid,
  target_role text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  IF target_company_id IS NULL OR target_user_id IS NULL OR (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'BLOCKED_BY_COMPANY_CONTEXT';
  END IF;
  IF target_role IS DISTINCT FROM 'company_admin' AND target_role IS DISTINCT FROM 'member' THEN
    RAISE EXCEPTION 'BLOCKED_BY_ROLE';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM registry.companies AS company_row
    WHERE company_row.company_id = target_company_id
      AND company_row.status = 'active'
  ) THEN
    RAISE EXCEPTION 'BLOCKED_BY_COMPANY_CONTEXT';
  END IF;
  IF NOT access.is_company_admin(target_company_id) THEN
    RAISE EXCEPTION 'BLOCKED_BY_AUTHORIZATION';
  END IF;
  IF target_user_id = (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'BLOCKED_BY_SELF_GRANT';
  END IF;
  INSERT INTO access.company_memberships (company_id, user_id, membership_role, is_active)
  VALUES (target_company_id, target_user_id, target_role, true);
END;
$$;

REVOKE ALL ON FUNCTION access.reject_membership_identity_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION access.is_company_member(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION access.is_company_admin(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION access.grant_company_membership(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION access.is_company_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION access.is_company_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION access.grant_company_membership(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION access.is_company_member(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION access.is_company_admin(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION access.grant_company_membership(uuid, uuid, text) TO service_role;

DO $bootstrap$
DECLARE
  canonical_company uuid := '10f6e9b3-c5b9-4d95-a318-48f20f89477f';
  inserted_count integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM registry.companies AS company_row
    WHERE company_row.company_id = canonical_company
      AND company_row.status = 'active'
  ) THEN
    RAISE EXCEPTION 'BLOCKED_BY_COMPANY_CONTEXT: canonical company is missing or inactive';
  END IF;

  INSERT INTO access.company_memberships (company_id, user_id, membership_role, is_active)
  SELECT canonical_company, bootstrap_user.user_id, 'company_admin', true
  FROM (
    SELECT staff_row.user_id
    FROM public.jj_staff_config AS staff_row
    WHERE staff_row.is_active
      AND staff_row.staff_role = 'ceo'
    UNION
    SELECT role_row.user_id
    FROM public.user_roles AS role_row
    WHERE role_row.is_active IS TRUE
      AND role_row.role = 'superadmin'
  ) AS bootstrap_user
  WHERE bootstrap_user.user_id IS NOT NULL;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  IF inserted_count <> 1 THEN
    RAISE EXCEPTION 'BLOCKED_BY_BOOTSTRAP: expected one distinct active ceo/superadmin membership';
  END IF;
END
$bootstrap$;

COMMIT;
