-- Isolated Postgres stubs for draft approval RPCs.
-- Not applied to Production.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE auth.users (
  id uuid PRIMARY KEY,
  email text
);

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = ''
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
SET search_path = ''
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  );
$$;

CREATE TABLE public.jj_staff_config (
  user_id uuid PRIMARY KEY,
  staff_role text,
  is_active boolean NOT NULL DEFAULT true,
  granted_at timestamptz DEFAULT now(),
  granted_by uuid,
  notes text
);

CREATE TABLE public.properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL
);

-- Live insert contract used by statements.apply_correction_case (append-only).
CREATE TABLE public.transactions (
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

INSERT INTO public.transactions (id, date, amount_eur, description)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  '2026-01-01',
  10.00,
  'seed-row-do-not-change'
);

INSERT INTO public.jj_staff_config (user_id, staff_role, is_active)
VALUES (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'operations',
  true
);

INSERT INTO auth.users (id, email)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'staff@example.test'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'partner@example.test');

INSERT INTO public.properties (id, name)
VALUES (
  '6917f121-36fa-45c6-820d-38e0349c4ed0',
  'Liron and Alon'
);

GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
GRANT SELECT ON public.jj_staff_config TO authenticated, service_role;
GRANT SELECT ON public.properties TO authenticated, service_role;
REVOKE ALL ON TABLE public.transactions FROM PUBLIC;
REVOKE ALL ON TABLE public.transactions FROM anon, authenticated, service_role;
GRANT SELECT ON public.transactions TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.role() TO anon, authenticated, service_role;
