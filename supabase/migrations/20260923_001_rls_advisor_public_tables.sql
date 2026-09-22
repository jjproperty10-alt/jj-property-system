-- Security Advisor ERROR rls_disabled_in_public
-- Project: jj-staging-cert (vaevswwojwalsuradohu) only until Yossi approves production.
--
-- Tables: public.jj_staff_config, public.audit_logs, public.transactions,
-- and public._cert_log when that staging harness table exists.
--
-- Direct PostgREST access today is ALL for anon and authenticated, RLS off, 0 policies.
-- Server reads and writes use service_role (bypasses RLS) or SECURITY DEFINER
-- functions owned by postgres (require_jj_staff, log_transaction_change,
-- apply_correction_case). Those keep working without a client policy.
--
-- The logged-in settings screen counts transactions through the cookie client.
-- That SELECT is limited to an active jj_staff_config row. The anon key loses
-- every privilege on these tables.

BEGIN;

CREATE OR REPLACE FUNCTION public.is_active_jj_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.jj_staff_config AS s
    WHERE s.user_id = (SELECT auth.uid())
      AND s.is_active IS TRUE
  );
$$;

REVOKE ALL ON FUNCTION public.is_active_jj_staff() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_active_jj_staff() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_active_jj_staff() TO authenticated;

ALTER TABLE public.jj_staff_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.jj_staff_config FROM PUBLIC;
REVOKE ALL ON TABLE public.jj_staff_config FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.jj_staff_config FROM PUBLIC, anon, authenticated;

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.audit_logs FROM PUBLIC;
REVOKE ALL ON TABLE public.audit_logs FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.audit_logs FROM PUBLIC, anon, authenticated;

DO $cert$
BEGIN
  IF to_regclass('public._cert_log') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public._cert_log ENABLE ROW LEVEL SECURITY';
    EXECUTE 'REVOKE ALL ON TABLE public._cert_log FROM PUBLIC';
    EXECUTE 'REVOKE ALL ON TABLE public._cert_log FROM anon, authenticated';
    EXECUTE 'REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public._cert_log FROM PUBLIC, anon, authenticated';
  END IF;
END
$cert$;

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.transactions FROM PUBLIC;
REVOKE ALL ON TABLE public.transactions FROM anon;
REVOKE ALL ON TABLE public.transactions FROM authenticated;
GRANT SELECT ON TABLE public.transactions TO authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.transactions FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS auth_read_transactions ON public.transactions;
CREATE POLICY auth_read_transactions
  ON public.transactions
  FOR SELECT
  TO authenticated
  USING (public.is_active_jj_staff());

COMMIT;
