BEGIN;

INSERT INTO auth.users (id) VALUES ('33333333-3333-4333-8333-333333333333');
CALL test.assume('33333333-3333-4333-8333-333333333333', 'authenticated');
CALL test.expect_eq(
  $$SELECT guest_name FROM public.pms_reservations_for_property('412148', '2026-10-01', '2026-10-31')$$,
  'Guest Fixture',
  'before: authenticated user can read guest_name through the definer RPC'
);
CALL test.expect_eq(
  $$SELECT jj_property_name FROM public.pms_resolve_mapping('Villa Mazotos')$$,
  'Villa Mazotos',
  'before: authenticated user can resolve a mapping'
);
CALL test.release();
ROLLBACK;
