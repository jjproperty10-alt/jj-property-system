-- Isolated Postgres stubs for partnership Owner Statement store tests.
-- Not applied to Production. No guest names, no Production IDs beyond VM1 identity.

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

CREATE TABLE IF NOT EXISTS public.property_definitions (
  property_id uuid PRIMARY KEY,
  canonical_name text
);

INSERT INTO public.property_definitions (property_id, canonical_name) VALUES
  ('4eb09c84-907a-404c-b19a-7856f73fadff', 'Villa Mazotos')
ON CONFLICT (property_id) DO NOTHING;

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

DO $views$
BEGIN
  IF to_regclass('public.v_cashbox_audit') IS NULL THEN
    EXECUTE $sql$
      CREATE VIEW public.v_cashbox_audit AS
      SELECT 'JJ'::text AS cash_box_name, 0::numeric AS total_received, 0::numeric AS total_paid, 0::numeric AS balance
    $sql$;
  END IF;
  IF to_regclass('public.v_certified_ledger_transactions') IS NULL THEN
    EXECUTE $sql$
      CREATE VIEW public.v_certified_ledger_transactions AS
      SELECT t.* FROM public.transactions t
    $sql$;
  END IF;
  IF to_regclass('public.v_rc3_classified') IS NULL THEN
    EXECUTE $sql$
      CREATE VIEW public.v_rc3_classified AS
      SELECT t.*, t.property_name AS reporting_name FROM public.transactions t
    $sql$;
  END IF;
  IF to_regclass('public.v_contact_settlement_summary') IS NULL THEN
    EXECUTE $sql$
      CREATE VIEW public.v_contact_settlement_summary AS
      SELECT 'fixture'::text AS contact_name, 0::numeric AS net_jj_settlement
    $sql$;
  END IF;
END;
$views$;

INSERT INTO public.transactions (
  id, date, property_id, property_name, category, subcategory, description,
  payer, payee, amount_eur, client_charge, review_status, is_deleted
) VALUES
  ('33333333-3333-4333-8333-333333333333', '2026-08-05', NULL, NULL, 'Management', 'Office', 'isolation row',
   'JJ', 'Vendor', 50.00, NULL, 'active', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.jj_staff_config (user_id, staff_role, is_active) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ceo', true),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'finance_admin', true),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'operations', true),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'statement_operator', true)
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO auth.users (id, email) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ceo@example.test'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'finance@example.test'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'ops@example.test'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'operator@example.test'),
  ('ffffffff-ffff-4fff-8fff-ffffffffffff', 'share@example.test')
ON CONFLICT (id) DO NOTHING;

GRANT USAGE ON SCHEMA public, auth, extensions TO anon, authenticated, service_role;
GRANT SELECT ON public.jj_staff_config TO authenticated, service_role;
GRANT SELECT ON public.transactions TO authenticated, service_role;
GRANT SELECT ON public.property_definitions TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.role() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.require_jj_staff(text[]) TO postgres, authenticated, anon, service_role;
GRANT USAGE ON SCHEMA extensions TO postgres;
