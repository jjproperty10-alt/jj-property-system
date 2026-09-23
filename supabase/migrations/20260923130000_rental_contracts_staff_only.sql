-- Prepared staff-only policy for public.rental_contracts.
-- Do not apply to production until the contract screens have been checked
-- on a Preview that reads through the active-staff server path.
-- Applying this file removes anon privileges and replaces auth_all_contracts.
-- It does not grant any new privilege. The lifecycle rental table is untouched.
-- Authenticated grants stay in place; row access requires finance.is_active_jj_staff().

BEGIN;

REVOKE ALL ON TABLE public.rental_contracts FROM PUBLIC;
REVOKE ALL ON TABLE public.rental_contracts FROM anon;

DROP POLICY IF EXISTS auth_all_contracts ON public.rental_contracts;
DROP POLICY IF EXISTS staff_all_contracts ON public.rental_contracts;

CREATE POLICY staff_all_contracts
  ON public.rental_contracts
  FOR ALL
  TO authenticated
  USING (finance.is_active_jj_staff())
  WITH CHECK (finance.is_active_jj_staff());

COMMIT;
