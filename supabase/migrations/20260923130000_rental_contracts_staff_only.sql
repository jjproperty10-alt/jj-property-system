-- Records the staff-only policy for public.rental_contracts.
-- The same policy was applied in the production SQL editor after the
-- Preview contract screens passed. This file returns before any privilege
-- statement when that policy is already present.
-- It does not grant any new privilege. The lifecycle rental table is untouched.

DO $guard$
BEGIN
  IF EXISTS (
       SELECT 1
       FROM pg_policies
       WHERE schemaname = 'public'
         AND tablename = 'rental_contracts'
         AND policyname = 'staff_all_contracts'
         AND cmd = 'ALL'
         AND qual LIKE '%finance.is_active_jj_staff()%'
         AND with_check LIKE '%finance.is_active_jj_staff()%'
     )
     AND NOT EXISTS (
       SELECT 1
       FROM pg_policies
       WHERE schemaname = 'public'
         AND tablename = 'rental_contracts'
         AND policyname = 'auth_all_contracts'
     )
     AND NOT has_table_privilege('anon', 'public.rental_contracts', 'SELECT')
     AND NOT has_table_privilege('anon', 'public.rental_contracts', 'INSERT')
  THEN
    RETURN;
  END IF;

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
END
$guard$;
