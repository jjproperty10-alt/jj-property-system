BEGIN;

INSERT INTO auth.users (id, email) VALUES
  ('22222222-2222-4222-8222-222222222222', 'staff@example.test'),
  ('33333333-3333-4333-8333-333333333333', 'outsider@example.test'),
  ('66666666-6666-4666-8666-666666666666', 'nonmember@example.test');
INSERT INTO public.jj_staff_config (user_id, staff_role, is_active) VALUES
  ('22222222-2222-4222-8222-222222222222', 'finance_admin', true),
  ('66666666-6666-4666-8666-666666666666', 'employee', true);
INSERT INTO access.company_memberships (company_id, user_id, is_active) VALUES
  ('99999999-9999-4999-8999-999999999999', '11111111-1111-4111-8111-111111111111', true),
  ('99999999-9999-4999-8999-999999999999', '22222222-2222-4222-8222-222222222222', true),
  ('99999999-9999-4999-8999-999999999999', '33333333-3333-4333-8333-333333333333', true);
INSERT INTO public.property_name_aliases (raw_name, canonical_name, operating_company_id)
VALUES ('fixture-alias', 'Villa Mazotos', '99999999-9999-4999-8999-999999999999');

CALL test.assume('33333333-3333-4333-8333-333333333333', 'authenticated');
CALL test.expect_eq(
  $$SELECT count(*)::text FROM public.property_name_aliases$$,
  '0',
  'after: non-staff company member reads 0 aliases'
);
CALL test.expect_sqlstate(
  $$INSERT INTO public.property_name_aliases (raw_name, canonical_name, operating_company_id)
    VALUES ('member-write', 'Villa Mazotos', '99999999-9999-4999-8999-999999999999')$$,
  '42501',
  'after: non-staff company member cannot write aliases'
);

CALL test.assume('22222222-2222-4222-8222-222222222222', 'authenticated');
CALL test.expect_eq(
  $$SELECT count(*)::text FROM public.property_name_aliases$$,
  '1',
  'after: staff company member reads aliases'
);
INSERT INTO public.property_name_aliases (raw_name, canonical_name, operating_company_id)
VALUES ('staff-write', 'Villa Mazotos', '99999999-9999-4999-8999-999999999999');

CALL test.assume('66666666-6666-4666-8666-666666666666', 'authenticated');
CALL test.expect_eq(
  $$SELECT count(*)::text FROM public.property_name_aliases$$,
  '0',
  'after: staff non-member still reads 0 aliases'
);
CALL test.expect_sqlstate(
  $$INSERT INTO public.property_name_aliases (raw_name, canonical_name, operating_company_id)
    VALUES ('nonmember-write', 'Villa Mazotos', '99999999-9999-4999-8999-999999999999')$$,
  '42501',
  'after: staff non-member cannot write aliases'
);

CALL test.assume(NULL, 'service_role');
CALL test.expect_eq(
  $$SELECT count(*)::text FROM public.property_name_aliases$$,
  '2',
  'after: service_role still reads aliases'
);

DO $policy$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'property_name_aliases'
      AND policyname = 'company_member_read'
      AND permissive = 'RESTRICTIVE'
  ) THEN
    RAISE EXCEPTION 'company_member_read was removed';
  END IF;
END
$policy$;

CALL test.release();
ROLLBACK;
