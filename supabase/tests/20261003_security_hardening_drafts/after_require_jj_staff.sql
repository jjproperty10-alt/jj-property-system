BEGIN;

INSERT INTO auth.users (id, email) VALUES
  ('22222222-2222-4222-8222-222222222222', 'staff@example.test'),
  ('33333333-3333-4333-8333-333333333333', 'outsider@example.test'),
  ('66666666-6666-4666-8666-666666666666', 'inactive@example.test');
INSERT INTO public.jj_staff_config (user_id, staff_role, is_active) VALUES
  ('22222222-2222-4222-8222-222222222222', 'finance_admin', true),
  ('66666666-6666-4666-8666-666666666666', 'finance_admin', false);

CALL test.assume(NULL, 'anon');
CALL test.expect_sqlstate(
  $$SELECT public.require_jj_staff(NULL)$$,
  '42501',
  'after: anon cannot execute require_jj_staff'
);

CALL test.assume(NULL, 'authenticated');
CALL test.expect_message(
  $$SELECT public.require_jj_staff(NULL)$$,
  'Authenticated session required',
  'after: missing subject is rejected'
);

CALL test.assume('33333333-3333-4333-8333-333333333333', 'authenticated');
CALL test.expect_message(
  $$SELECT public.require_jj_staff(NULL)$$,
  'not in jj_staff_config',
  'after: non-staff is rejected'
);

CALL test.assume('66666666-6666-4666-8666-666666666666', 'authenticated');
CALL test.expect_message(
  $$SELECT public.require_jj_staff(NULL)$$,
  'is_active = false',
  'after: inactive staff is rejected'
);

CALL test.assume('22222222-2222-4222-8222-222222222222', 'authenticated');
CALL test.expect_eq(
  $$SELECT public.require_jj_staff(NULL)::text$$,
  '22222222-2222-4222-8222-222222222222',
  'after: active staff passes the open allow-list'
);
CALL test.expect_message(
  $$SELECT public.require_jj_staff(ARRAY['ceo']::text[])$$,
  'not permitted',
  'after: finance_admin is not a ceo'
);
CALL test.expect_eq(
  $$SELECT public.require_jj_staff(ARRAY['finance_admin']::text[])::text$$,
  '22222222-2222-4222-8222-222222222222',
  'after: finance_admin passes its own role'
);

CALL test.assume('11111111-1111-4111-8111-111111111111', 'authenticated');
CALL test.expect_eq(
  $$SELECT public.require_jj_staff(ARRAY['ceo']::text[])::text$$,
  '11111111-1111-4111-8111-111111111111',
  'after: ceo passes the ceo allow-list'
);

CALL test.assume('22222222-2222-4222-8222-222222222222', 'service_role');
CALL test.expect_eq(
  $$SELECT public.require_jj_staff(NULL)::text$$,
  '22222222-2222-4222-8222-222222222222',
  'after: service_role with a staff subject still runs the predicate'
);

DO $marker$
DECLARE
  marker text;
BEGIN
  SELECT description
    INTO marker
  FROM pg_description AS comment
  JOIN pg_proc AS proc ON proc.oid = comment.objoid
  JOIN pg_namespace AS nsp ON nsp.oid = proc.pronamespace
  WHERE nsp.nspname = 'public'
    AND proc.proname = 'require_jj_staff'
    AND pg_get_function_identity_arguments(proc.oid) = 'p_allowed_roles text[]'
    AND comment.objsubid = 0;
  IF marker IS DISTINCT FROM 'jj-draft-20261003150500' THEN
    RAISE EXCEPTION 'require_jj_staff comment was %', marker;
  END IF;
END
$marker$;

CALL test.release();
ROLLBACK;
