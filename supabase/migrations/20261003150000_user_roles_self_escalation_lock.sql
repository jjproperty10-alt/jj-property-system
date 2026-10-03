-- DRAFT. Do not apply, merge, or deploy until this file is approved on its own.
-- Timestamp 20261003150000 does not collide with any migration already in supabase/migrations.
--
-- Live catalog (03.10.2026): public.user_roles has RLS and two permissive policies.
--   superadmin_manage_roles FOR ALL TO public USING (auth.role() = 'authenticated')
--   user_can_read_own_role FOR SELECT TO public
--     USING ((user_id = auth.uid()) OR (auth.role() = 'authenticated'))
-- Any signed-in user can insert or update a superadmin row for themselves.
-- finance.is_active_jj_admin() is SECURITY DEFINER and trusts that table.
--
-- This draft:
--   * drops the ALL policy
--   * keeps a SELECT policy for the caller's own row only
--   * revokes INSERT/UPDATE/DELETE (and TRUNCATE/REFERENCES/TRIGGER) from
--     anon and authenticated; service_role keeps its table grants
--   * adds public.admin_manage_user_role(), SECURITY DEFINER, search_path ''
--   * adds a BEFORE INSERT/UPDATE/DELETE trigger that blocks self-escalation
--     even when the writer bypasses RLS
--   * a caller who is not an active superadmin cannot grant superadmin, and
--     cannot demote, deactivate, delete, or otherwise modify a superadmin row
-- finance.is_active_jj_admin() stays true for an active ceo. That check is no
-- longer enough to touch a superadmin row. No app path writes user_roles;
-- the reads are service-role selects. This draft does not replace
-- finance.is_active_jj_admin(), finance.is_active_jj_staff(), or
-- public.require_jj_staff().
--
-- Repo bodies (not restated here):
--   finance.is_active_jj_admin()  supabase/migrations/20260924180000_employee_config_staff_and_definer_search_path.sql
--     SECURITY DEFINER, search_path pg_catalog. True when the caller is an active
--     jj_staff_config ceo OR an active user_roles superadmin.
--   finance.is_active_jj_staff()  supabase/migrations/20260917090100_agent_transaction_drafts.sql
--     SECURITY DEFINER, search_path ''. True when the caller has any active jj_staff_config row.
--   public.require_jj_staff(text[]) is NOT in supabase/migrations.
--     Test harnesses define it. The September bootstrap copies share one body
--     (jj_staff_config lookup, short exceptions). The August tamir harnesses share
--     a longer exception text. Those copies differ. This draft does not choose one
--     and does not CREATE OR REPLACE the function.
--   access.is_company_member(uuid) is in 20260924210000 and is not SECURITY DEFINER.
--   access.grant_company_membership(uuid,uuid,text) is in the same file and is SECURITY DEFINER.
--
-- email, full_name, and notes of other users are not granted by a policy.
-- The admin function returns only id, user_id, role, is_active.

BEGIN;

DO $guard$
BEGIN
  IF (
    SELECT count(*)
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_roles'
      AND policyname IN ('superadmin_manage_roles', 'user_can_read_own_role')
  ) <> 2
  THEN
    RAISE EXCEPTION 'BLOCKED_BY_POLICY_DRIFT: user_roles is not the two-policy live set';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc AS proc
    JOIN pg_namespace AS namespace ON namespace.oid = proc.pronamespace
    WHERE namespace.nspname = 'finance'
      AND proc.proname = 'is_active_jj_admin'
      AND proc.prosecdef
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_proc AS proc
    JOIN pg_namespace AS namespace ON namespace.oid = proc.pronamespace
    WHERE namespace.nspname = 'finance'
      AND proc.proname = 'is_active_jj_staff'
      AND proc.prosecdef
  ) THEN
    RAISE EXCEPTION 'BLOCKED_BY_FUNCTION_DRIFT: finance staff helpers are missing or not SECURITY DEFINER';
  END IF;
END
$guard$;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.user_roles
  FROM PUBLIC, anon, authenticated;

DROP POLICY superadmin_manage_roles ON public.user_roles;
DROP POLICY user_can_read_own_role ON public.user_roles;

CREATE POLICY user_can_read_own_role
  ON public.user_roles
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((user_id = (SELECT auth.uid())));

CREATE FUNCTION public.user_roles_block_self_escalation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  actor uuid;
  caller_is_superadmin boolean;
BEGIN
  actor := auth.uid();

  IF actor IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  caller_is_superadmin := EXISTS (
    SELECT 1
    FROM public.user_roles AS role_row
    WHERE role_row.user_id = actor
      AND role_row.is_active IS TRUE
      AND role_row.role = 'superadmin'
  );

  IF TG_OP = 'DELETE' THEN
    IF OLD.role = 'superadmin' AND NOT caller_is_superadmin THEN
      RAISE EXCEPTION 'BLOCKED_BY_SUPERADMIN_PROTECT'
        USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.user_id = actor THEN
      RAISE EXCEPTION 'BLOCKED_BY_SELF_ESCALATION'
        USING ERRCODE = '42501';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.user_id = actor OR NEW.user_id = actor THEN
      IF NEW.role IS DISTINCT FROM OLD.role
         OR NEW.is_active IS DISTINCT FROM OLD.is_active
         OR NEW.user_id IS DISTINCT FROM OLD.user_id
      THEN
        RAISE EXCEPTION 'BLOCKED_BY_SELF_ESCALATION'
          USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  IF NOT caller_is_superadmin THEN
    IF TG_OP = 'INSERT' AND NEW.role = 'superadmin' THEN
      RAISE EXCEPTION 'BLOCKED_BY_SUPERADMIN_PROTECT'
        USING ERRCODE = '42501';
    END IF;
    IF TG_OP = 'UPDATE'
       AND (OLD.role = 'superadmin' OR NEW.role = 'superadmin')
    THEN
      RAISE EXCEPTION 'BLOCKED_BY_SUPERADMIN_PROTECT'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.user_roles_block_self_escalation() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_roles_block_self_escalation() TO authenticated, service_role;

CREATE TRIGGER user_roles_block_self_escalation
  BEFORE INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.user_roles_block_self_escalation();

CREATE FUNCTION public.admin_manage_user_role(
  p_target_user_id uuid,
  p_role text,
  p_is_active boolean,
  p_email text DEFAULT NULL,
  p_full_name text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  role text,
  is_active boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor uuid;
  existing_role text;
  existing_active boolean;
  row_exists boolean;
  caller_is_superadmin boolean;
  written record;
BEGIN
  actor := auth.uid();
  IF actor IS NULL OR NOT finance.is_active_jj_admin() THEN
    RAISE EXCEPTION 'BLOCKED_BY_AUTHORIZATION';
  END IF;
  IF p_target_user_id IS NULL OR p_role IS NULL OR p_is_active IS NULL THEN
    RAISE EXCEPTION 'BLOCKED_BY_INPUT';
  END IF;
  IF p_role NOT IN ('superadmin', 'partner', 'manager', 'employee', 'cleaner', 'viewer') THEN
    RAISE EXCEPTION 'BLOCKED_BY_ROLE';
  END IF;

  SELECT role_row.role, role_row.is_active
    INTO existing_role, existing_active
  FROM public.user_roles AS role_row
  WHERE role_row.user_id = p_target_user_id;
  row_exists := FOUND;

  IF p_target_user_id = actor
     AND (
       NOT row_exists
       OR existing_role IS DISTINCT FROM p_role
       OR existing_active IS DISTINCT FROM p_is_active
     )
  THEN
    RAISE EXCEPTION 'BLOCKED_BY_SELF_ESCALATION';
  END IF;

  caller_is_superadmin := EXISTS (
    SELECT 1
    FROM public.user_roles AS role_row
    WHERE role_row.user_id = actor
      AND role_row.is_active IS TRUE
      AND role_row.role = 'superadmin'
  );

  IF row_exists AND existing_role = 'superadmin' AND NOT caller_is_superadmin THEN
    RAISE EXCEPTION 'BLOCKED_BY_SUPERADMIN_PROTECT';
  END IF;

  IF p_role = 'superadmin' AND (NOT row_exists OR existing_role IS DISTINCT FROM 'superadmin') THEN
    IF NOT caller_is_superadmin THEN
      RAISE EXCEPTION 'BLOCKED_BY_SUPERADMIN_GRANT';
    END IF;
  END IF;

  IF row_exists THEN
    UPDATE public.user_roles AS role_row
       SET role = p_role,
           is_active = p_is_active,
           email = COALESCE(p_email, role_row.email),
           full_name = COALESCE(p_full_name, role_row.full_name),
           notes = COALESCE(p_notes, role_row.notes),
           updated_at = pg_catalog.now()
     WHERE role_row.user_id = p_target_user_id
    RETURNING role_row.id, role_row.user_id, role_row.role, role_row.is_active
    INTO written;
  ELSE
    INSERT INTO public.user_roles AS role_row (user_id, email, role, full_name, is_active, notes)
    VALUES (p_target_user_id, p_email, p_role, p_full_name, p_is_active, p_notes)
    RETURNING role_row.id, role_row.user_id, role_row.role, role_row.is_active
    INTO written;
  END IF;

  id := written.id;
  user_id := written.user_id;
  role := written.role;
  is_active := written.is_active;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_manage_user_role(uuid, text, boolean, text, text, text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.admin_manage_user_role(uuid, text, boolean, text, text, text)
  TO authenticated;

COMMIT;

-- ROLLBACK-BEGIN
-- BEGIN;
-- DROP TRIGGER IF EXISTS user_roles_block_self_escalation ON public.user_roles;
-- DROP FUNCTION IF EXISTS public.admin_manage_user_role(uuid, text, boolean, text, text, text);
-- DROP FUNCTION IF EXISTS public.user_roles_block_self_escalation();
-- DROP POLICY IF EXISTS user_can_read_own_role ON public.user_roles;
-- CREATE POLICY superadmin_manage_roles
--   ON public.user_roles
--   AS PERMISSIVE
--   FOR ALL
--   TO public
--   USING (auth.role() = 'authenticated');
-- CREATE POLICY user_can_read_own_role
--   ON public.user_roles
--   AS PERMISSIVE
--   FOR SELECT
--   TO public
--   USING ((user_id = auth.uid()) OR (auth.role() = 'authenticated'));
-- GRANT INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
--   ON TABLE public.user_roles
--   TO anon, authenticated;
-- COMMIT;
-- ROLLBACK-END
