BEGIN;

INSERT INTO auth.users (id) VALUES ('33333333-3333-4333-8333-333333333333');
CALL test.assume('33333333-3333-4333-8333-333333333333', 'authenticated');
CALL test.expect_eq(
  $$SELECT count(*)::text FROM public.contacts$$,
  '1',
  'before: any authenticated user reads contacts'
);
CALL test.expect_eq(
  $$SELECT count(*)::text FROM public.contact_properties$$,
  '0',
  'before: authenticated user can read contact_properties'
);
CALL test.release();
ROLLBACK;
