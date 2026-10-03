BEGIN;

INSERT INTO auth.users (id, email) VALUES
  ('22222222-2222-4222-8222-222222222222', 'staff@example.test'),
  ('33333333-3333-4333-8333-333333333333', 'outsider@example.test');
INSERT INTO public.jj_staff_config (user_id, staff_role, is_active)
VALUES ('22222222-2222-4222-8222-222222222222', 'finance_admin', true);

CALL test.assume('33333333-3333-4333-8333-333333333333', 'authenticated');
CALL test.expect_eq(
  $$SELECT count(*)::text FROM public.contact_opening_balances$$,
  '0',
  'after: non-staff reads 0 opening balances'
);
CALL test.expect_eq(
  $$SELECT count(*)::text FROM public.partnership_capital$$,
  '0',
  'after: non-staff reads 0 partnership_capital'
);
CALL test.expect_sqlstate(
  $$INSERT INTO public.partnership_capital (property_name, partner_name)
    VALUES ('X', 'Y')$$,
  '42501',
  'after: non-staff cannot write partnership_capital'
);
CALL test.expect_sqlstate(
  $$INSERT INTO public.case_audit_log (actor, action)
    VALUES ('33333333-3333-4333-8333-333333333333', 'nope')$$,
  '42501',
  'after: non-staff cannot insert case_audit_log'
);
CALL test.expect_eq(
  $$SELECT count(*)::text FROM public.case_audit_log$$,
  '1',
  'after: audit SELECT policy is still open to authenticated'
);

CALL test.assume('22222222-2222-4222-8222-222222222222', 'authenticated');
CALL test.expect_eq(
  $$SELECT count(*)::text FROM public.contact_opening_balances$$,
  '1',
  'after: staff reads opening balances'
);
CALL test.expect_eq(
  $$SELECT count(*)::text FROM public.partnership_capital$$,
  '1',
  'after: staff reads partnership_capital'
);
CALL test.expect_sqlstate(
  $$INSERT INTO public.contact_opening_balances (property_name, balance_eur)
    VALUES ('Staff', 1)$$,
  '42501',
  'after: staff cannot write opening balances'
);
CALL test.expect_sqlstate(
  $$INSERT INTO public.partnership_capital (property_name, partner_name)
    VALUES ('Staff Property', 'Staff Partner')$$,
  '42501',
  'after: staff cannot write partnership_capital'
);
INSERT INTO public.case_audit_log (actor, action)
VALUES ('22222222-2222-4222-8222-222222222222', 'staff-own');
CALL test.expect_sqlstate(
  $$INSERT INTO public.case_audit_log (actor, action)
    VALUES ('11111111-1111-4111-8111-111111111111', 'spoofed')$$,
  '42501',
  'after: staff cannot insert an audit row for another actor'
);

CALL test.assume('11111111-1111-4111-8111-111111111111', 'authenticated');
INSERT INTO public.contact_opening_balances (property_name, balance_eur)
VALUES ('Admin', 2);
INSERT INTO public.partnership_capital (property_name, partner_name, ownership_percent)
VALUES ('Admin Property', 'Admin Partner', 25);
CALL test.expect_eq(
  $$SELECT count(*)::text FROM public.contact_opening_balances$$,
  '2',
  'after: admin can write opening balances'
);
CALL test.expect_eq(
  $$SELECT count(*)::text FROM public.partnership_capital$$,
  '2',
  'after: admin can write partnership_capital'
);

CALL test.assume(NULL, 'service_role');
INSERT INTO public.partnership_capital (property_name, partner_name)
VALUES ('Service Property', 'Service Partner');
INSERT INTO public.contact_opening_balances (property_name, balance_eur)
VALUES ('Service', 3);
CALL test.expect_eq(
  $$SELECT count(*)::text FROM public.partnership_capital$$,
  '3',
  'after: service_role still reads and writes partnership_capital'
);
CALL test.expect_eq(
  $$SELECT count(*)::text FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'partnership_capital'
      AND policyname = 'Service role full access on partnership_capital'$$,
  '1',
  'after: service_role partnership_capital policy remains'
);

CALL test.release();
ROLLBACK;
