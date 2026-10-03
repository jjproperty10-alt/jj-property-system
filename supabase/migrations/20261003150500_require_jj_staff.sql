-- DRAFT. Do not apply, merge, or deploy until this file is approved on its own.
-- Timestamp 20261003150500 does not collide with any migration already in supabase/migrations.
--
-- public.require_jj_staff(text[]) is called from later migrations and is not created
-- by any file under supabase/migrations on main (b0bac3a). finance.is_active_jj_staff()
-- is the boolean form of the same jj_staff_config lookup and cannot be used where a
-- caller must raise. This draft creates the raising form from that predicate.
--
-- The body is the September bootstrap text (short [jj_auth] exceptions): active
-- jj_staff_config row for auth.uid(), optional staff_role allow-list, return the
-- uuid. The August harness uses the same lookup with longer exception text. If a
-- function with this signature already exists and its source contains that
-- predicate, this draft leaves the body and its grants unchanged. A different
-- body raises BLOCKED_BY_FUNCTION_DRIFT.
--
-- EXECUTE is granted to authenticated and service_role only when this draft
-- creates the function. anon and PUBLIC do not receive it. search_path is empty.
-- The function is SECURITY DEFINER so the lookup is not blocked by RLS on
-- jj_staff_config. It is not used in RLS USING expressions, because it raises.
--
-- Rollback drops the function only when its comment is the marker set here.
-- A function that already existed is not dropped.

BEGIN;

DO $require_jj_staff$
DECLARE
  existing_src text;
BEGIN
  SELECT proc.prosrc
    INTO existing_src
  FROM pg_catalog.pg_proc AS proc
  JOIN pg_catalog.pg_namespace AS nsp ON nsp.oid = proc.pronamespace
  WHERE nsp.nspname = 'public'
    AND proc.proname = 'require_jj_staff'
    AND pg_catalog.pg_get_function_identity_arguments(proc.oid) = 'p_allowed_roles text[]';

  IF existing_src IS NOT NULL THEN
    IF position('jj_staff_config' in existing_src) = 0
       OR position('auth.uid()' in existing_src) = 0
       OR position('[jj_auth]' in existing_src) = 0
       OR position('p_allowed_roles' in existing_src) = 0
       OR position('is_active' in existing_src) = 0
       OR position('staff_role' in existing_src) = 0
    THEN
      RAISE EXCEPTION
        'BLOCKED_BY_FUNCTION_DRIFT: public.require_jj_staff(text[]) exists but does not use the jj_staff_config staff predicate';
    END IF;
    RAISE NOTICE 'public.require_jj_staff(text[]) already exists with the staff predicate; body left unchanged';
    RETURN;
  END IF;

  EXECUTE $fn$
    CREATE FUNCTION public.require_jj_staff(p_allowed_roles text[] DEFAULT NULL::text[])
    RETURNS uuid
    LANGUAGE plpgsql
    STABLE
    SECURITY DEFINER
    SET search_path TO ''
    AS $body$
    DECLARE
      v_actor_id  uuid;
      v_is_active boolean;
      v_role      text;
    BEGIN
      v_actor_id := auth.uid();
      IF v_actor_id IS NULL THEN
        RAISE EXCEPTION '[jj_auth] Authenticated session required.';
      END IF;
      SELECT is_active, staff_role
        INTO v_is_active, v_role
        FROM public.jj_staff_config
       WHERE user_id = v_actor_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION '[jj_auth] User % is not in jj_staff_config.', v_actor_id;
      END IF;
      IF NOT v_is_active THEN
        RAISE EXCEPTION '[jj_auth] User % is registered but is_active = false.', v_actor_id;
      END IF;
      IF p_allowed_roles IS NOT NULL AND NOT (v_role = ANY (p_allowed_roles)) THEN
        RAISE EXCEPTION '[jj_auth] User % has role ''%'' which is not permitted. Allowed roles: %.',
          v_actor_id, v_role, p_allowed_roles;
      END IF;
      RETURN v_actor_id;
    END;
    $body$
  $fn$;

  COMMENT ON FUNCTION public.require_jj_staff(text[]) IS 'jj-draft-20261003150500';

  REVOKE ALL ON FUNCTION public.require_jj_staff(text[]) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.require_jj_staff(text[]) FROM anon;
  GRANT EXECUTE ON FUNCTION public.require_jj_staff(text[]) TO authenticated, service_role;
END
$require_jj_staff$;

COMMIT;

-- ROLLBACK-BEGIN
-- BEGIN;
-- DO $drop_require_jj_staff$
-- DECLARE
--   marker text;
-- BEGIN
--   SELECT description
--     INTO marker
--   FROM pg_catalog.pg_description AS comment
--   JOIN pg_catalog.pg_proc AS proc ON proc.oid = comment.objoid
--   JOIN pg_catalog.pg_namespace AS nsp ON nsp.oid = proc.pronamespace
--   WHERE nsp.nspname = 'public'
--     AND proc.proname = 'require_jj_staff'
--     AND pg_catalog.pg_get_function_identity_arguments(proc.oid) = 'p_allowed_roles text[]'
--     AND comment.objsubid = 0;
--   IF marker = 'jj-draft-20261003150500' THEN
--     DROP FUNCTION public.require_jj_staff(text[]);
--   END IF;
-- END
-- $drop_require_jj_staff$;
-- COMMIT;
-- ROLLBACK-END
