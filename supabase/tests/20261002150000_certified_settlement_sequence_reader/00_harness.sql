-- Minimal schema for the cumulative certified-settlement reader.
-- Built from the migrations' own DDL (columns and checks the reader touches).
-- Not a migration. Not applied to any remote database.
-- Omitted: public.transactions business columns beyond id/date, owner_transaction_links,
-- and history guards. Those objects are not read by finance.read_certified_client_settlement
-- except client_fifo_credits' left join to transactions.date.
-- FKs that exist only to block inserts are omitted so synthetic rows can be loaded
-- without the rest of Production history.

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
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'company_b_reader') THEN
    CREATE ROLE company_b_reader NOLOGIN;
  END IF;
END;
$roles$;

GRANT anon, authenticated, service_role, company_b_reader TO CURRENT_USER;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS finance;
CREATE SCHEMA IF NOT EXISTS lifecycle;
CREATE SCHEMA IF NOT EXISTS registry;
CREATE SCHEMA IF NOT EXISTS access;
CREATE SCHEMA IF NOT EXISTS public;

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

CREATE TABLE IF NOT EXISTS lifecycle.entity_identity (
  id uuid PRIMARY KEY,
  canonical_name text NOT NULL,
  entity_type text NOT NULL,
  status text NOT NULL DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS public.properties (
  id uuid PRIMARY KEY,
  name text NOT NULL
);

CREATE TABLE IF NOT EXISTS public.transactions (
  id uuid PRIMARY KEY,
  date date
);

CREATE TABLE IF NOT EXISTS finance.client_settlement_certifications (
  id                   uuid PRIMARY KEY,
  entity_id            uuid NOT NULL REFERENCES lifecycle.entity_identity(id),
  as_of                date NOT NULL,
  currency             text NOT NULL DEFAULT 'EUR',
  certification_type   text NOT NULL DEFAULT 'opening_property_obligations',
  status               text NOT NULL,
  reason               text NOT NULL,
  evidence_ref         text NOT NULL,
  idempotency_key      text NOT NULL UNIQUE,
  created_by           uuid NOT NULL,
  approved_by          uuid,
  applied_by           uuid,
  voided_by            uuid,
  created_at           timestamptz NOT NULL DEFAULT now(),
  approved_at          timestamptz,
  applied_at           timestamptz,
  voided_at            timestamptz,
  void_reason          text,
  total_due_to_jj      numeric(12,2) NOT NULL,
  version              integer NOT NULL,
  supersedes_id        uuid REFERENCES finance.client_settlement_certifications(id)
);

CREATE TABLE IF NOT EXISTS finance.client_settlement_certification_lines (
  id                   uuid PRIMARY KEY,
  certification_id     uuid NOT NULL REFERENCES finance.client_settlement_certifications(id),
  line_order           integer NOT NULL,
  property_key         text NOT NULL,
  property_name        text NOT NULL,
  component_code       text NOT NULL,
  amount_due_to_jj     numeric(12,2) NOT NULL,
  reason               text NOT NULL,
  evidence_ref         text NOT NULL,
  metadata             jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS finance.client_settlement_events (
  id                       uuid PRIMARY KEY,
  entity_id                uuid NOT NULL REFERENCES lifecycle.entity_identity(id),
  counterparty_entity_id   uuid REFERENCES lifecycle.entity_identity(id),
  effective_date           date NOT NULL,
  event_type               text NOT NULL,
  settlement_amount        numeric(12,2) NOT NULL,
  source_transaction_id    uuid REFERENCES public.transactions(id),
  reason                   text NOT NULL,
  evidence_ref             text NOT NULL,
  created_by               uuid NOT NULL,
  idempotency_key          text NOT NULL UNIQUE,
  status                   text NOT NULL,
  opened_at                timestamptz NOT NULL DEFAULT now(),
  created_at               timestamptz NOT NULL DEFAULT now(),
  applied_at               timestamptz,
  applied_by               uuid
);

CREATE TABLE IF NOT EXISTS finance.client_obligation_property_bindings (
  id                      uuid PRIMARY KEY,
  certification_id        uuid NOT NULL,
  certification_line_id   uuid NOT NULL REFERENCES finance.client_settlement_certification_lines(id),
  entity_id               uuid NOT NULL,
  property_id             uuid NOT NULL REFERENCES public.properties(id),
  certification_version   integer NOT NULL,
  property_key            text NOT NULL,
  status                  text NOT NULL,
  reason                  text NOT NULL,
  evidence_ref            text NOT NULL,
  idempotency_key         text NOT NULL UNIQUE,
  created_by              uuid NOT NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  supersedes_id           uuid
);

CREATE TABLE IF NOT EXISTS finance.client_cash_settlement_executions (
  id                   uuid PRIMARY KEY,
  entity_id            uuid NOT NULL REFERENCES lifecycle.entity_identity(id),
  direction            text NOT NULL,
  amount               numeric(12,2) NOT NULL,
  effective_date       date NOT NULL,
  transaction_id       uuid NOT NULL,
  owner_link_id        uuid NOT NULL,
  preview_hash         text NOT NULL,
  canonical_snapshot   jsonb NOT NULL,
  idempotency_key      text NOT NULL UNIQUE,
  reversal_of          uuid REFERENCES finance.client_cash_settlement_executions(id),
  actor                uuid NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS finance.client_obligation_fifo_allocations (
  id                      uuid PRIMARY KEY,
  execution_id            uuid NOT NULL REFERENCES finance.client_cash_settlement_executions(id),
  certification_line_id   uuid NOT NULL REFERENCES finance.client_settlement_certification_lines(id),
  property_id             uuid NOT NULL REFERENCES public.properties(id),
  sequence_no             integer NOT NULL,
  signed_amount           numeric(12,2) NOT NULL,
  allocated_amount        numeric(12,2) NOT NULL,
  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS finance.client_owner_level_obligations (
  id                      uuid PRIMARY KEY,
  entity_id               uuid NOT NULL REFERENCES lifecycle.entity_identity(id),
  source_transaction_id   uuid NOT NULL,
  component_code          text NOT NULL,
  effective_date          date NOT NULL,
  amount_due_to_jj        numeric(12,2) NOT NULL,
  currency                text NOT NULL DEFAULT 'EUR',
  status                  text NOT NULL,
  reason                  text NOT NULL,
  evidence_ref            text NOT NULL,
  idempotency_key         text NOT NULL UNIQUE,
  version                 integer NOT NULL DEFAULT 1,
  created_by              uuid NOT NULL,
  applied_by              uuid NOT NULL,
  applied_at              timestamptz NOT NULL DEFAULT now(),
  voided_by               uuid,
  voided_at               timestamptz,
  void_reason             text,
  created_at              timestamptz NOT NULL DEFAULT now()
);

-- Present so the fixture can prove the reader does not add this amount on
-- top of the FIFO allocation that already represents the same cash.
CREATE TABLE IF NOT EXISTS finance.partner_funding_events (
  id                        uuid PRIMARY KEY,
  amount_eur                numeric(12,2) NOT NULL,
  client_entity_id          uuid NOT NULL,
  funding_source            text NOT NULL,
  status                    text NOT NULL,
  client_cash_execution_id  uuid,
  transaction_id            uuid
);

CREATE TABLE IF NOT EXISTS registry.companies (
  company_id uuid PRIMARY KEY,
  canonical_name text NOT NULL,
  status text NOT NULL
);

CREATE TABLE IF NOT EXISTS access.company_memberships (
  user_id uuid NOT NULL,
  company_id uuid NOT NULL REFERENCES registry.companies(company_id),
  PRIMARY KEY (user_id, company_id)
);

CREATE TABLE IF NOT EXISTS public.test_entity_company (
  entity_id uuid PRIMARY KEY REFERENCES lifecycle.entity_identity(id),
  company_id uuid NOT NULL REFERENCES registry.companies(company_id)
);

CREATE OR REPLACE VIEW finance.v_client_obligation_unbound_lines
  WITH (security_invoker = true)
AS
SELECT
  c.entity_id,
  c.id AS certification_id,
  c.version AS certification_version,
  l.id AS source_line_identity,
  l.property_key,
  l.line_order,
  c.as_of AS effective_date,
  pg_catalog.round((- l.amount_due_to_jj), 2) AS original_signed_amount,
  'unbound_certification_line'::text AS blocked_code
FROM finance.client_settlement_certification_lines l
JOIN finance.client_settlement_certifications c
  ON c.id = l.certification_id
WHERE c.status = 'applied'
  AND NOT EXISTS (
    SELECT 1
    FROM finance.client_obligation_property_bindings b
    WHERE b.certification_line_id = l.id
      AND b.status = 'active'
  );

CREATE OR REPLACE FUNCTION finance.settlement_layer_available()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO ''
AS $csc$
  SELECT pg_catalog.to_regclass('finance.client_settlement_events') IS NOT NULL
     AND pg_catalog.to_regprocedure('finance.client_fifo_credits(uuid,date)') IS NOT NULL;
$csc$;

CREATE OR REPLACE FUNCTION finance.client_fifo_credits(
  p_entity_id UUID,
  p_as_of     DATE
)
RETURNS TABLE (
  event_id                  UUID,
  event_type                TEXT,
  settlement_amount         NUMERIC,
  effective_date            DATE,
  source_transaction_id     UUID,
  source_transaction_date   DATE,
  created_at                TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO ''
AS $cse_fn$
BEGIN
  IF p_entity_id IS NULL THEN
    RAISE EXCEPTION '[input] entity_id must be a UUID.';
  END IF;
  IF p_as_of IS NULL THEN
    RAISE EXCEPTION '[input] as_of must be a date.';
  END IF;

  RETURN QUERY
  SELECT
    e.id,
    e.event_type,
    e.settlement_amount,
    e.effective_date,
    e.source_transaction_id,
    t.date,
    e.created_at
  FROM finance.client_settlement_events e
  LEFT JOIN public.transactions t
    ON t.id = e.source_transaction_id
  WHERE e.entity_id = p_entity_id
    AND e.status = 'applied'
    AND e.effective_date <= p_as_of
    AND e.event_type IN (
      'noncash_settlement_credit',
      'include_transaction_in_settlement'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM finance.client_settlement_events x
      WHERE x.entity_id = e.entity_id
        AND x.status = 'applied'
        AND x.event_type = 'exclude_transaction_from_settlement'
        AND x.source_transaction_id IS NOT NULL
        AND x.source_transaction_id = e.source_transaction_id
    )
  ORDER BY
    e.effective_date ASC,
    t.date ASC NULLS LAST,
    e.created_at ASC,
    e.id ASC;
END;
$cse_fn$;

ALTER TABLE finance.client_settlement_certifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.client_settlement_certifications FORCE ROW LEVEL SECURITY;
ALTER TABLE finance.client_settlement_certification_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.client_settlement_certification_lines FORCE ROW LEVEL SECURITY;
ALTER TABLE finance.client_owner_level_obligations ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.client_owner_level_obligations FORCE ROW LEVEL SECURITY;
ALTER TABLE finance.client_cash_settlement_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.client_cash_settlement_executions FORCE ROW LEVEL SECURITY;
ALTER TABLE finance.client_obligation_fifo_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.client_obligation_fifo_allocations FORCE ROW LEVEL SECURITY;
ALTER TABLE finance.partner_funding_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.partner_funding_events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deny_all_client_settlement_certifications ON finance.client_settlement_certifications;
CREATE POLICY deny_all_client_settlement_certifications
  ON finance.client_settlement_certifications AS RESTRICTIVE
  FOR ALL TO public USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS deny_all_client_settlement_certification_lines ON finance.client_settlement_certification_lines;
CREATE POLICY deny_all_client_settlement_certification_lines
  ON finance.client_settlement_certification_lines AS RESTRICTIVE
  FOR ALL TO public USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS deny_all_client_owner_level_obligations ON finance.client_owner_level_obligations;
CREATE POLICY deny_all_client_owner_level_obligations
  ON finance.client_owner_level_obligations AS RESTRICTIVE
  FOR ALL TO public USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS deny_all_client_cash_settlement_executions ON finance.client_cash_settlement_executions;
CREATE POLICY deny_all_client_cash_settlement_executions
  ON finance.client_cash_settlement_executions AS RESTRICTIVE
  FOR ALL TO public USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS deny_all_client_obligation_fifo_allocations ON finance.client_obligation_fifo_allocations;
CREATE POLICY deny_all_client_obligation_fifo_allocations
  ON finance.client_obligation_fifo_allocations AS RESTRICTIVE
  FOR ALL TO public USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS deny_all_partner_funding_events ON finance.partner_funding_events;
CREATE POLICY deny_all_partner_funding_events
  ON finance.partner_funding_events AS RESTRICTIVE
  FOR ALL TO public USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE finance.client_settlement_certifications FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE finance.client_settlement_certification_lines FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE finance.client_owner_level_obligations FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE finance.client_cash_settlement_executions FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE finance.client_obligation_fifo_allocations FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE finance.partner_funding_events FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON finance.v_client_obligation_unbound_lines FROM PUBLIC, anon, authenticated, service_role;

GRANT USAGE ON SCHEMA finance TO service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role, company_b_reader;

CREATE TABLE IF NOT EXISTS public.test_oracle (
  label text PRIMARY KEY,
  payload jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS public.test_meta (
  key text PRIMARY KEY,
  value text NOT NULL
);
