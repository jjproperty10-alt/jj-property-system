-- Isolated extras after 20260919160000 bootstrap.
-- Canonical properties + EPA + staff helper. No production IDs. No Tamir.

CREATE TABLE IF NOT EXISTS public.properties (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  status text,
  is_deleted boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS lifecycle.entity_property_associations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES lifecycle.entity_identity(id),
  property_id uuid NOT NULL,
  association_source text NOT NULL DEFAULT 'wizard',
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS finance.agent_transaction_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS finance.owner_transaction_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid,
  owner_entity_id uuid,
  is_deleted boolean NOT NULL DEFAULT false
);

CREATE OR REPLACE VIEW finance.v_owner_level_payments AS
SELECT
  t.id AS transaction_id,
  t.amount_eur
FROM public.transactions t
WHERE false;

CREATE OR REPLACE FUNCTION finance.is_active_jj_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.jj_staff_config s
    WHERE s.user_id = auth.uid()
      AND s.is_active = true
  );
$$;

REVOKE ALL ON FUNCTION finance.is_active_jj_staff() FROM PUBLIC;
REVOKE ALL ON FUNCTION finance.is_active_jj_staff() FROM anon;
GRANT EXECUTE ON FUNCTION finance.is_active_jj_staff() TO authenticated;

INSERT INTO lifecycle.entity_identity (id, canonical_name, entity_type, status)
VALUES
  ('33333333-aaaa-4333-8333-333333333333', 'Client Gamma', 'external', 'active'),
  ('77777777-7777-4777-8777-777777777777', 'Client Delta', 'external', 'active'),
  ('88888888-8888-4888-8888-888888888888', 'Client Epsilon', 'external', 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.jj_staff_config (user_id, staff_role, is_active)
VALUES ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'ceo', false)
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO auth.users (id, email)
VALUES ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'inactive@example.test')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.properties (id, name) VALUES
  ('10101010-1010-4010-8010-101010101010', 'Fixture Property A'),
  ('20202020-2020-4020-8020-202020202020', 'Fixture Property B'),
  ('30303030-3030-4030-8030-303030303030', 'Fixture Property C'),
  ('40404040-4040-4040-8040-404040404040', 'Fixture Property Other'),
  ('50505050-5050-4050-8050-505050505050', 'Fixture Property E'),
  ('70707070-7070-4070-8070-707070707070', 'Fixture Property Orphan'),
  ('80808080-8080-4080-8080-808080808080', 'Fixture Property DraftAssoc'),
  ('90909090-9090-4090-8090-909090909090', 'Fixture Property F'),
  ('61616161-6161-4161-8161-616161616161', 'Fixture Property Shared');

INSERT INTO lifecycle.entity_property_associations (id, entity_id, property_id, association_source, status) VALUES
  ('aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '11111111-1111-4111-8111-111111111111', '10101010-1010-4010-8010-101010101010', 'wizard', 'active'),
  ('aaaaaaa2-aaaa-4aaa-8aaa-aaaaaaaaaaa2', '11111111-1111-4111-8111-111111111111', '20202020-2020-4020-8020-202020202020', 'wizard', 'active'),
  ('aaaaaaa3-aaaa-4aaa-8aaa-aaaaaaaaaaa3', '11111111-1111-4111-8111-111111111111', '30303030-3030-4030-8030-303030303030', 'wizard', 'active'),
  ('bbbbbbb4-bbbb-4bbb-8bbb-bbbbbbbbbbb4', '33333333-aaaa-4333-8333-333333333333', '40404040-4040-4040-8040-404040404040', 'wizard', 'active'),
  ('ddddddd5-dddd-4ddd-8ddd-ddddddddddd5', '77777777-7777-4777-8777-777777777777', '50505050-5050-4050-8050-505050505050', 'wizard', 'active'),
  ('eeeeeee6-eeee-4eee-8eee-eeeeeeeeeee6', '11111111-1111-4111-8111-111111111111', '80808080-8080-4080-8080-808080808080', 'wizard', 'draft'),
  ('fffffff7-ffff-4fff-8fff-fffffffffff7', '88888888-8888-4888-8888-888888888888', '90909090-9090-4090-8090-909090909090', 'wizard', 'active'),
  ('aaaaaaa8-aaaa-4aaa-8aaa-aaaaaaaaaaa8', '11111111-1111-4111-8111-111111111111', '61616161-6161-4161-8161-616161616161', 'wizard', 'active'),
  ('bbbbbbb9-bbbb-4bbb-8bbb-bbbbbbbbbbb9', '33333333-aaaa-4333-8333-333333333333', '61616161-6161-4161-8161-616161616161', 'wizard', 'active');

GRANT SELECT ON public.properties TO authenticated, service_role;
GRANT SELECT ON lifecycle.entity_property_associations TO authenticated, service_role;
GRANT SELECT ON finance.agent_transaction_drafts TO authenticated, service_role;
GRANT SELECT ON finance.owner_transaction_links TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION finance.is_active_jj_staff() TO postgres, authenticated;
