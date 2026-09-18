-- Isolated Postgres stubs for certified opening-obligation tests.
-- Not applied to Production. No production client/transaction IDs.
-- run-tests.cjs applies 20260919140000 then 20260919160000 after this file.

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
CREATE SCHEMA IF NOT EXISTS finance;
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
  UNION ALL
  SELECT 'JJ'::text,
         COALESCE(sum(CASE WHEN lower(payee) = 'jj' THEN amount_eur ELSE 0 END), 0),
         COALESCE(sum(CASE WHEN lower(payer) = 'jj' THEN amount_eur ELSE 0 END), 0)
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
  ('11111111-1111-4111-8111-111111111111', 'Client Alpha', 'external', 'active'),
  ('22222222-2222-4222-8222-222222222222', 'Client Beta', 'external', 'active');

INSERT INTO public.transactions (
  id, date, property_id, property_name, category, subcategory, description,
  payer, payee, amount_eur, client_charge, review_status, is_deleted
) VALUES
  ('33333333-3333-4333-8333-333333333333', '2026-08-05', NULL, NULL, 'Management', 'Client Payment', 'alpha cash one',
   'Client', 'Jacob', 100.00, NULL, 'active', false),
  ('44444444-4444-4444-8444-444444444444', '2026-08-12', NULL, NULL, 'Management', 'Client Payment', 'alpha cash two',
   'Client', 'Jacob', 200.00, NULL, 'active', false),
  ('55555555-5555-4555-8555-555555555555', '2026-07-01', NULL, NULL, 'Management', 'Office', 'jj cost',
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

GRANT USAGE ON SCHEMA public, auth, extensions, finance, lifecycle TO anon, authenticated, service_role;
GRANT SELECT ON public.jj_staff_config TO authenticated, service_role;
GRANT SELECT ON public.transactions TO authenticated, service_role;
GRANT SELECT ON lifecycle.entity_identity TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.role() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.require_jj_staff(text[]) TO postgres, authenticated, anon, service_role;
