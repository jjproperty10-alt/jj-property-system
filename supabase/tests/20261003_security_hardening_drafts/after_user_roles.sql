BEGIN;

INSERT INTO auth.users (id, email) VALUES
  ('22222222-2222-4222-8222-222222222222', 'staff@example.test'),
  ('33333333-3333-4333-8333-333333333333', 'outsider@example.test'),
  ('44444444-4444-4444-8444-444444444444', 'target@example.test'),
  ('55555555-5555-4555-8555-555555555555', 'ceo-only@example.test');

INSERT INTO public.jj_staff_config (user_id, staff_role, is_active) VALUES
  ('22222222-2222-4222-8222-222222222222', 'finance_admin', true),
  ('55555555-5555-4555-8555-555555555555', 'ceo', true);

INSERT INTO public.user_roles (user_id, email, role, full_name, is_active) VALUES
  ('22222222-2222-4222-8222-222222222222', 'staff@example.test', 'employee', 'Staff', true),
  ('44444444-4444-4444-8444-444444444444', 'target@example.test', 'cleaner', 'Target', true),
  ('55555555-5555-4555-8555-555555555555', 'ceo-only@example.test', 'partner', 'Ceo Only', true);

CALL test.assume('33333333-3333-4333-8333-333333333333', 'authenticated');
CALL test.expect_sqlstate(
  $$INSERT INTO public.user_roles (user_id, role, is_active)
    VALUES ('33333333-3333-4333-8333-333333333333', 'superadmin', true)$$,
  '42501',
  'after: outsider direct INSERT is denied'
);
CALL test.expect_sqlstate(
  $$UPDATE public.user_roles SET role = 'superadmin'
    WHERE user_id = '33333333-3333-4333-8333-333333333333'$$,
  '42501',
  'after: outsider direct UPDATE is denied'
);
CALL test.expect_message(
  $$SELECT role FROM public.admin_manage_user_role(
      '33333333-3333-4333-8333-333333333333', 'superadmin', true)$$,
  'BLOCKED_BY_AUTHORIZATION',
  'after: outsider admin function is denied'
);
CALL test.expect_eq(
  $$SELECT finance.is_active_jj_admin()::text$$,
  'false',
  'after: outsider is_active_jj_admin is false'
);
CALL test.expect_eq(
  $$SELECT finance.is_active_jj_staff()::text$$,
  'false',
  'after: outsider is_active_jj_staff is false'
);

CALL test.assume('22222222-2222-4222-8222-222222222222', 'authenticated');
CALL test.expect_eq(
  $$SELECT count(*)::text FROM public.jj_staff_config$$,
  '0',
  'after: staff RLS hides jj_staff_config rows from the caller'
);
CALL test.expect_eq(
  $$SELECT finance.is_active_jj_staff()::text$$,
  'true',
  'after: staff is_active_jj_staff stays true via SECURITY DEFINER'
);
CALL test.expect_eq(
  $$SELECT finance.is_active_jj_admin()::text$$,
  'false',
  'after: non-admin staff is_active_jj_admin is false'
);

CALL test.assume('11111111-1111-4111-8111-111111111111', 'authenticated');
CALL test.expect_eq(
  $$SELECT finance.is_active_jj_admin()::text$$,
  'true',
  'after: real admin is_active_jj_admin stays true'
);
CALL test.expect_eq(
  $$SELECT role FROM public.admin_manage_user_role(
      '44444444-4444-4444-8444-444444444444', 'manager', true)$$,
  'manager',
  'after: admin sets another user to manager'
);
CALL test.expect_eq(
  $$SELECT role FROM public.admin_manage_user_role(
      '44444444-4444-4444-8444-444444444444', 'superadmin', true)$$,
  'superadmin',
  'after: active superadmin grants superadmin to someone else'
);
CALL test.expect_eq(
  $$SELECT role FROM public.admin_manage_user_role(
      '44444444-4444-4444-8444-444444444444', 'superadmin', true,
      'target@example.test', 'Target', 'kept')$$,
  'superadmin',
  'after: superadmin can modify another superadmin row'
);
CALL test.expect_eq(
  $$SELECT role FROM public.admin_manage_user_role(
      '44444444-4444-4444-8444-444444444444', 'employee', true)$$,
  'employee',
  'after: superadmin can demote another superadmin'
);
CALL test.expect_message(
  $$SELECT role FROM public.admin_manage_user_role(
      '11111111-1111-4111-8111-111111111111', 'viewer', true)$$,
  'BLOCKED_BY_SELF_ESCALATION',
  'after: admin cannot change own role'
);

CALL test.assume('55555555-5555-4555-8555-555555555555', 'authenticated');
CALL test.expect_eq(
  $$SELECT finance.is_active_jj_admin()::text$$,
  'true',
  'after: ceo staff row still counts as admin'
);
CALL test.expect_message(
  $$SELECT role FROM public.admin_manage_user_role(
      '33333333-3333-4333-8333-333333333333', 'superadmin', true)$$,
  'BLOCKED_BY_SUPERADMIN_GRANT',
  'after: ceo who is not superadmin cannot grant superadmin'
);
CALL test.expect_eq(
  $$SELECT role FROM public.admin_manage_user_role(
      '33333333-3333-4333-8333-333333333333', 'viewer', true,
      'outsider@example.test', 'Outsider', 'hidden')$$,
  'viewer',
  'after: ceo admin can grant a non-superadmin role'
);
CALL test.expect_message(
  $$SELECT role FROM public.admin_manage_user_role(
      '11111111-1111-4111-8111-111111111111', 'viewer', true)$$,
  'BLOCKED_BY_SUPERADMIN_PROTECT',
  'after: ceo cannot demote a superadmin'
);
CALL test.expect_message(
  $$SELECT role FROM public.admin_manage_user_role(
      '11111111-1111-4111-8111-111111111111', 'superadmin', false)$$,
  'BLOCKED_BY_SUPERADMIN_PROTECT',
  'after: ceo cannot deactivate a superadmin'
);
CALL test.expect_message(
  $$SELECT role FROM public.admin_manage_user_role(
      '11111111-1111-4111-8111-111111111111', 'superadmin', true,
      'tampered@example.test', 'Tampered', 'tampered')$$,
  'BLOCKED_BY_SUPERADMIN_PROTECT',
  'after: ceo cannot modify a superadmin row'
);
CALL test.expect_message(
  $$SELECT role FROM public.admin_manage_user_role(
      '55555555-5555-4555-8555-555555555555', 'superadmin', true)$$,
  'BLOCKED_BY_SELF_ESCALATION',
  'after: ceo cannot self-escalate'
);
CALL test.expect_message(
  $$UPDATE public.user_roles SET role = 'viewer'
    WHERE user_id = '11111111-1111-4111-8111-111111111111'$$,
  'permission denied',
  'after: ceo authenticated session cannot update a superadmin row'
);
CALL test.expect_message(
  $$DELETE FROM public.user_roles
    WHERE user_id = '11111111-1111-4111-8111-111111111111'$$,
  'permission denied',
  'after: ceo authenticated session cannot delete a superadmin row'
);

CALL test.assume('55555555-5555-4555-8555-555555555555', 'service_role');
CALL test.expect_message(
  $$UPDATE public.user_roles SET role = 'viewer'
    WHERE user_id = '11111111-1111-4111-8111-111111111111'$$,
  'BLOCKED_BY_SUPERADMIN_PROTECT',
  'after: ceo service-role session cannot demote a superadmin'
);
CALL test.expect_message(
  $$UPDATE public.user_roles SET notes = 'tampered'
    WHERE user_id = '11111111-1111-4111-8111-111111111111'$$,
  'BLOCKED_BY_SUPERADMIN_PROTECT',
  'after: ceo service-role session cannot modify a superadmin row'
);
CALL test.expect_message(
  $$UPDATE public.user_roles SET role = 'superadmin'
    WHERE user_id = '44444444-4444-4444-8444-444444444444'$$,
  'BLOCKED_BY_SUPERADMIN_PROTECT',
  'after: ceo service-role session cannot grant superadmin'
);
CALL test.expect_message(
  $$DELETE FROM public.user_roles
    WHERE user_id = '11111111-1111-4111-8111-111111111111'$$,
  'BLOCKED_BY_SUPERADMIN_PROTECT',
  'after: ceo service-role session cannot delete a superadmin row'
);
CALL test.assume(NULL, 'service_role');
CALL test.expect_eq(
  $$SELECT role FROM public.user_roles WHERE user_id = '11111111-1111-4111-8111-111111111111'$$,
  'superadmin',
  'after: denied ceo changes leave the superadmin row unchanged'
);

CALL test.assume('33333333-3333-4333-8333-333333333333', 'authenticated');
CALL test.expect_eq(
  $$SELECT count(*)::text FROM public.user_roles$$,
  '1',
  'after: user reads only their own role row'
);
CALL test.expect_eq(
  $$SELECT coalesce(string_agg(email, ',' ORDER BY email), '') FROM public.user_roles$$,
  'outsider@example.test',
  'after: other users email full_name and notes are not visible'
);

CALL test.assume('11111111-1111-4111-8111-111111111111', 'service_role');
CALL test.expect_message(
  $$UPDATE public.user_roles SET role = 'viewer'
    WHERE user_id = '11111111-1111-4111-8111-111111111111'$$,
  'BLOCKED_BY_SELF_ESCALATION',
  'after: trigger blocks a direct self role change even for service_role'
);

CALL test.assume(NULL, 'service_role');
UPDATE public.user_roles
   SET role = 'cleaner'
 WHERE user_id = '44444444-4444-4444-8444-444444444444';
CALL test.expect_eq(
  $$SELECT role FROM public.user_roles WHERE user_id = '44444444-4444-4444-8444-444444444444'$$,
  'cleaner',
  'after: service_role without a user jwt still writes another row'
);
CALL test.expect_eq(
  $$SELECT count(*)::text FROM public.user_roles$$,
  '5',
  'after: service_role still reads every role row'
);

CALL test.release();
ROLLBACK;
