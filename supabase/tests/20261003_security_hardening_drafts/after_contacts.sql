BEGIN;

INSERT INTO auth.users (id, email) VALUES
  ('22222222-2222-4222-8222-222222222222', 'staff@example.test'),
  ('33333333-3333-4333-8333-333333333333', 'outsider@example.test');
INSERT INTO public.jj_staff_config (user_id, staff_role, is_active)
VALUES ('22222222-2222-4222-8222-222222222222', 'finance_admin', true);

CALL test.expect_eq(
  $$SELECT count(*)::text FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('contacts', 'contact_properties')
      AND column_name IN ('company', 'company_id', 'operating_company_id')$$,
  '0',
  'after: contacts still have no company column'
);
CALL test.expect_eq(
  $$SELECT count(*)::text FROM pg_policies
    WHERE policyname = 'contact_properties_company_member'$$,
  '0',
  'after: property-name company option was not installed'
);

CALL test.assume('33333333-3333-4333-8333-333333333333', 'authenticated');
CALL test.expect_eq(
  $$SELECT count(*)::text FROM public.contacts$$,
  '0',
  'after: non-staff authenticated user reads 0 contacts'
);
CALL test.expect_eq(
  $$SELECT count(*)::text FROM public.contact_properties$$,
  '0',
  'after: non-staff authenticated user reads 0 contact_properties'
);
CALL test.expect_sqlstate(
  $$INSERT INTO public.contacts (name) VALUES ('nope')$$,
  '42501',
  'after: non-staff cannot insert contacts'
);

CALL test.assume('22222222-2222-4222-8222-222222222222', 'authenticated');
CALL test.expect_eq(
  $$SELECT count(*)::text FROM public.contacts$$,
  '1',
  'after: staff still reads contacts'
);
INSERT INTO public.contact_properties (property_name, relationship_role)
VALUES ('Fixture Property', 'owner');
CALL test.expect_eq(
  $$SELECT count(*)::text FROM public.contact_properties$$,
  '1',
  'after: staff can still write contact_properties'
);

CALL test.assume(NULL, 'anon');
CALL test.expect_eq(
  $$SELECT count(*)::text FROM public.contacts$$,
  '0',
  'after: anon reads 0 contacts'
);

CALL test.assume(NULL, 'service_role');
CALL test.expect_eq(
  $$SELECT count(*)::text FROM public.contacts$$,
  '1',
  'after: service_role still reads contacts'
);
INSERT INTO public.contacts (name) VALUES ('service write');
CALL test.expect_eq(
  $$SELECT count(*)::text FROM public.contacts$$,
  '2',
  'after: service_role still writes contacts'
);

CALL test.release();
ROLLBACK;
