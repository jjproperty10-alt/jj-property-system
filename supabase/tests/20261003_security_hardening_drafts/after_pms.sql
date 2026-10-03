BEGIN;

INSERT INTO auth.users (id, email) VALUES
  ('22222222-2222-4222-8222-222222222222', 'staff@example.test'),
  ('33333333-3333-4333-8333-333333333333', 'outsider@example.test');
INSERT INTO public.jj_staff_config (user_id, staff_role, is_active)
VALUES ('22222222-2222-4222-8222-222222222222', 'finance_admin', true);

CALL test.assume('33333333-3333-4333-8333-333333333333', 'authenticated');
CALL test.expect_sqlstate(
  $$SELECT guest_name FROM public.pms_reservations_for_property('412148', '2026-10-01', '2026-10-31')$$,
  '42501',
  'after: non-staff authenticated user cannot execute pms_reservations_for_property'
);
CALL test.expect_sqlstate(
  $$SELECT jj_property_name FROM public.pms_resolve_mapping('Villa Mazotos')$$,
  '42501',
  'after: non-staff authenticated user cannot execute pms_resolve_mapping'
);

CALL test.assume('22222222-2222-4222-8222-222222222222', 'authenticated');
CALL test.expect_eq(
  $$SELECT finance.is_active_jj_staff()::text$$,
  'true',
  'after: staff helper still true before the revoked RPC'
);
CALL test.expect_sqlstate(
  $$SELECT guest_name FROM public.pms_reservations_for_property('412148', '2026-10-01', '2026-10-31')$$,
  '42501',
  'after: staff user session is also refused because EXECUTE was revoked'
);

CALL test.assume(NULL, 'service_role');
CALL test.expect_eq(
  $$SELECT guest_name FROM public.pms_reservations_for_property('412148', '2026-10-01', '2026-10-31')$$,
  'Guest Fixture',
  'after: service_role still reads reservations'
);
CALL test.expect_eq(
  $$SELECT jj_property_name FROM public.pms_resolve_mapping('Villa Mazotos')$$,
  'Villa Mazotos',
  'after: service_role still resolves mappings'
);

CALL test.release();
ROLLBACK;
