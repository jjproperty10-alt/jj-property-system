-- Isolated Postgres stubs for managed-property identity reassignment.
-- Not applied to Production. No production client/property IDs.

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
END;
$roles$;

GRANT anon, authenticated, service_role TO CURRENT_USER;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS lifecycle;
CREATE SCHEMA IF NOT EXISTS public;

CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY,
  email text
);

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path TO ''
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.sub', true), ''),
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid;
$$;

CREATE OR REPLACE FUNCTION auth.role()
RETURNS text
LANGUAGE sql
STABLE
SET search_path TO ''
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  );
$$;

CREATE TABLE IF NOT EXISTS public.jj_staff_config (
  user_id uuid PRIMARY KEY,
  staff_role text,
  is_active boolean NOT NULL DEFAULT true
);

CREATE OR REPLACE FUNCTION public.require_jj_staff(p_allowed_roles text[] DEFAULT NULL::text[])
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor_id  uuid;
  v_is_active boolean;
  v_role      text;
BEGIN
  v_actor_id := auth.uid();
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION '[jj_auth] Authenticated session required.';
  END IF;
  SELECT is_active, staff_role
    INTO v_is_active, v_role
    FROM public.jj_staff_config
   WHERE user_id = v_actor_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION '[jj_auth] User % is not in jj_staff_config.', v_actor_id;
  END IF;
  IF NOT v_is_active THEN
    RAISE EXCEPTION '[jj_auth] User % is registered but is_active = false.', v_actor_id;
  END IF;
  IF p_allowed_roles IS NOT NULL AND NOT (v_role = ANY (p_allowed_roles)) THEN
    RAISE EXCEPTION '[jj_auth] User % has role ''%'' which is not permitted. Allowed roles: %.',
      v_actor_id, v_role, p_allowed_roles;
  END IF;
  RETURN v_actor_id;
END;
$$;

CREATE TABLE IF NOT EXISTS lifecycle.entity_identity (
  id uuid PRIMARY KEY,
  canonical_name text NOT NULL,
  entity_type text NOT NULL,
  status text NOT NULL DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS lifecycle.management_relationship (
  id uuid PRIMARY KEY,
  entity_id uuid NOT NULL REFERENCES lifecycle.entity_identity(id),
  property_name text NOT NULL,
  relationship_type text NOT NULL,
  valid_from date,
  valid_to date,
  status text NOT NULL DEFAULT 'active',
  verification_status text,
  source_reference text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_mr_entity_property
  ON lifecycle.management_relationship (entity_id, property_name, valid_from) NULLS NOT DISTINCT;

CREATE TABLE IF NOT EXISTS lifecycle.entity_property_associations (
  id uuid PRIMARY KEY,
  entity_id uuid NOT NULL REFERENCES lifecycle.entity_identity(id),
  property_id uuid NOT NULL,
  association_source text,
  status text NOT NULL DEFAULT 'active',
  effective_from date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lifecycle.service_engagements (
  id uuid PRIMARY KEY,
  entity_id uuid NOT NULL REFERENCES lifecycle.entity_identity(id),
  property_id uuid NOT NULL,
  service_type text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  effective_from date,
  effective_to date,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  property_id uuid NULL,
  property_name text NULL,
  category text,
  subcategory text,
  description text,
  payer text,
  payee text,
  amount_eur numeric(12,2),
  client_charge numeric(12,2),
  notes text,
  k_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  review_status text DEFAULT 'active',
  is_deleted boolean DEFAULT false
);

CREATE OR REPLACE VIEW public.v_cashbox_audit AS
SELECT
  cash_box_name,
  round(total_received, 2) AS total_received,
  round(total_paid, 2) AS total_paid,
  round(total_received - total_paid, 2) AS balance
FROM (
  SELECT 'Jacob'::text AS cash_box_name,
         COALESCE(sum(CASE WHEN lower(payee) = ANY (ARRAY['jacob','yaacov']) THEN amount_eur ELSE 0 END), 0) AS total_received,
         COALESCE(sum(CASE WHEN lower(payer) = ANY (ARRAY['jacob','yaacov']) THEN amount_eur ELSE 0 END), 0) AS total_paid
  FROM public.transactions
  WHERE (review_status = 'active' OR review_status IS NULL)
    AND COALESCE(is_deleted, false) = false
) boxes;

CREATE OR REPLACE VIEW public.v_certified_ledger_transactions AS
SELECT t.*
FROM public.transactions t
WHERE COALESCE(t.is_deleted, false) = false
  AND (t.review_status = 'active' OR t.review_status IS NULL);

CREATE OR REPLACE VIEW public.v_rc3_classified AS
SELECT t.*, t.property_name AS reporting_name
FROM public.transactions t
WHERE t.property_name IS NOT NULL
  AND COALESCE(t.is_deleted, false) = false
  AND (t.review_status = 'active' OR t.review_status IS NULL);

CREATE OR REPLACE VIEW public.v_contact_settlement_summary AS
SELECT 'fixture'::text AS contact_name, 0::numeric AS net_jj_settlement;

CREATE OR REPLACE VIEW public.v_jj_pnl_fixture AS
SELECT
  COALESCE(sum(CASE WHEN lower(payee) = 'jj' THEN amount_eur ELSE 0 END), 0)
  - COALESCE(sum(CASE WHEN lower(payer) = 'jj' THEN amount_eur ELSE 0 END), 0) AS net
FROM public.transactions
WHERE (review_status = 'active' OR review_status IS NULL)
  AND COALESCE(is_deleted, false) = false;

INSERT INTO lifecycle.entity_identity (id, canonical_name, entity_type, status) VALUES
  ('11111111-1111-4111-8111-111111111111', 'Client Alpha', 'managed_client', 'active'),
  ('22222222-2222-4222-8222-222222222222', 'Client Beta', 'managed_client', 'active'),
  ('66666666-6666-4666-8666-666666666666', 'Client Gamma', 'managed_client', 'active'),
  ('77777777-7777-4777-8777-777777777777', 'Client Delta', 'managed_client', 'active'),
  ('55555555-5555-4555-8555-555555555555', 'Client Inactive', 'managed_client', 'inactive');

INSERT INTO lifecycle.management_relationship (
  id, entity_id, property_name, relationship_type, status, verification_status
) VALUES
  ('81818181-8181-4818-8818-818181818181', '11111111-1111-4111-8111-111111111111', 'Test Managed Property', 'managed_owner', 'active', 'verified'),
  ('82828282-8282-4828-8828-828282828282', '11111111-1111-4111-8111-111111111111', 'Second Managed Property', 'managed_owner', 'active', 'verified'),
  ('83838383-8383-4838-8838-838383838383', '66666666-6666-4666-8666-666666666666', 'Unrelated Property', 'managed_owner', 'active', 'verified'),
  ('84848484-8484-4848-8848-848484848484', '77777777-7777-4777-8777-777777777777', 'Alias Property', 'managed_owner', 'active', 'verified');

INSERT INTO lifecycle.entity_property_associations (
  id, entity_id, property_id, association_source, status
) VALUES
  ('91919191-9191-4919-8919-919191919191', '11111111-1111-4111-8111-111111111111', 'b1b1b1b1-b1b1-4bb1-8bb1-b1b1b1b1b1b1', 'management_relationship', 'active'),
  ('92929292-9292-4929-8929-929292929292', '11111111-1111-4111-8111-111111111111', 'b2b2b2b2-b2b2-4bb2-8bb2-b2b2b2b2b2b2', 'management_relationship', 'active'),
  ('93939393-9393-4939-8939-939393939393', '66666666-6666-4666-8666-666666666666', 'b3b3b3b3-b3b3-4bb3-8bb3-b3b3b3b3b3b3', 'management_relationship', 'active'),
  ('94949494-9494-4949-8949-949494949494', '77777777-7777-4777-8777-777777777777', 'b4b4b4b4-b4b4-4bb4-8bb4-b4b4b4b4b4b4', 'management_relationship', 'active');

INSERT INTO lifecycle.service_engagements (
  id, entity_id, property_id, service_type, status, effective_from
) VALUES
  ('a1a1a1a1-a1a1-4aa1-8aa1-a1a1a1a1a1a1', '11111111-1111-4111-8111-111111111111', 'b1b1b1b1-b1b1-4bb1-8bb1-b1b1b1b1b1b1', 'airbnb_str', 'active', '2025-01-01'),
  ('a2a2a2a2-a2a2-4aa2-8aa2-a2a2a2a2a2a2', '11111111-1111-4111-8111-111111111111', 'b2b2b2b2-b2b2-4bb2-8bb2-b2b2b2b2b2b2', 'airbnb_str', 'active', '2025-01-01'),
  ('a3a3a3a3-a3a3-4aa3-8aa3-a3a3a3a3a3a3', '66666666-6666-4666-8666-666666666666', 'b3b3b3b3-b3b3-4bb3-8bb3-b3b3b3b3b3b3', 'airbnb_str', 'active', '2025-01-01'),
  ('a4a4a4a4-a4a4-4aa4-8aa4-a4a4a4a4a4a4', '77777777-7777-4777-8777-777777777777', 'b4b4b4b4-b4b4-4bb4-8bb4-b4b4b4b4b4b4', 'airbnb_str', 'active', '2025-01-01');

INSERT INTO public.transactions (
  id, date, property_id, property_name, category, subcategory, description,
  payer, payee, amount_eur, client_charge, review_status, is_deleted
) VALUES
  ('33333333-3333-4333-8333-333333333333', '2026-08-05', NULL, NULL, 'Management', 'Client Payment', 'alpha cash one',
   'Client', 'Jacob', 100.00, NULL, 'active', false),
  ('44444444-4444-4444-8444-444444444444', '2026-08-12', NULL, NULL, 'Management', 'Client Payment', 'alpha cash two',
   'Client', 'Jacob', 200.00, NULL, 'active', false),
  ('35353535-3535-4353-8353-353535353535', '2026-07-01', NULL, NULL, 'Management', 'Office', 'jj cost',
   'JJ', 'Vendor', 50.00, NULL, 'active', false);

INSERT INTO public.jj_staff_config (user_id, staff_role, is_active) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ceo', true),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'finance_admin', true),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'operations', true),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'statement_operator', true);

INSERT INTO auth.users (id, email) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ceo@example.test'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'finance@example.test'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'ops@example.test'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'operator@example.test');

GRANT USAGE ON SCHEMA public, auth, extensions, lifecycle TO anon, authenticated, service_role;
GRANT SELECT ON public.jj_staff_config TO authenticated, service_role;
GRANT SELECT ON public.transactions TO authenticated, service_role;
GRANT SELECT ON lifecycle.entity_identity TO authenticated, service_role;
GRANT SELECT ON lifecycle.management_relationship, lifecycle.entity_property_associations, lifecycle.service_engagements TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.role() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.require_jj_staff(text[]) TO postgres, authenticated, anon, service_role;
