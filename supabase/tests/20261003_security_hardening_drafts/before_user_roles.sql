-- Live hole: an authenticated user with no role row can insert superadmin for themselves.
BEGIN;

INSERT INTO auth.users (id, email)
VALUES ('33333333-3333-4333-8333-333333333333', 'outsider@example.test');

CALL test.assume('33333333-3333-4333-8333-333333333333', 'authenticated');
INSERT INTO public.user_roles (user_id, email, role, full_name, is_active)
VALUES (
  '33333333-3333-4333-8333-333333333333',
  'outsider@example.test',
  'superadmin',
  'Outsider',
  true
);
CALL test.expect_eq(
  $$SELECT finance.is_active_jj_admin()::text$$,
  'true',
  'before: outsider self-grant makes is_active_jj_admin true'
);

CALL test.release();
ROLLBACK;
