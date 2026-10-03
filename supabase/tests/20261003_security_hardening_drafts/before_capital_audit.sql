BEGIN;

INSERT INTO auth.users (id) VALUES ('33333333-3333-4333-8333-333333333333');
CALL test.assume('33333333-3333-4333-8333-333333333333', 'authenticated');
CALL test.expect_eq(
  $$SELECT count(*)::text FROM public.contact_opening_balances$$,
  '1',
  'before: any authenticated user reads opening balances'
);
CALL test.expect_eq(
  $$SELECT count(*)::text FROM public.partnership_capital$$,
  '1',
  'before: any authenticated user reads partnership_capital'
);
INSERT INTO public.partnership_capital (property_name, partner_name, ownership_percent)
VALUES ('Before Property', 'Before Partner', 10);
CALL test.expect_eq(
  $$SELECT count(*)::text FROM public.partnership_capital$$,
  '2',
  'before: any authenticated user writes partnership_capital'
);
INSERT INTO public.case_audit_log (actor, action)
VALUES ('11111111-1111-4111-8111-111111111111', 'spoofed');
CALL test.expect_eq(
  $$SELECT count(*)::text FROM public.case_audit_log WHERE action = 'spoofed'$$,
  '1',
  'before: any authenticated user inserts audit rows for someone else'
);

CALL test.release();
ROLLBACK;
