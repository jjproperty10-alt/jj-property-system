DO $before$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc AS proc
    JOIN pg_namespace AS nsp ON nsp.oid = proc.pronamespace
    WHERE nsp.nspname = 'public'
      AND proc.proname = 'require_jj_staff'
  ) THEN
    RAISE EXCEPTION 'before: require_jj_staff must be absent, matching main';
  END IF;
END
$before$;

BEGIN;
CALL test.assume('11111111-1111-4111-8111-111111111111', 'authenticated');
CALL test.expect_sqlstate(
  $$SELECT public.require_jj_staff(NULL)$$,
  '42883',
  'before: require_jj_staff is not on main'
);
CALL test.release();
ROLLBACK;
