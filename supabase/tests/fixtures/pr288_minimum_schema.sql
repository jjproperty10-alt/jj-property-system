-- Minimum schema for the #288 session-alias integration matrix.
-- Throwaway local Postgres only. The runner refuses any non-local host.
-- This file does not apply supabase/migrations. Those migrations refuse to run
-- unless production history pins match. Each object below is copied from the
-- cited file, or marked HARNESS when the repo has no statement for it.
--
-- Loaded after supabase/tests/fixtures/throwaway_company_base.sql, which
-- creates auth.uid()/auth.role(), registry.companies, access.company_memberships,
-- and the live company helpers (access.is_company_member,
-- access.resolve_verified_operating_company, and the internal permit functions).
--
-- Objects and where they come from
-- ---------------------------------
-- public.jj_staff_config
--   Columns used by finance.is_active_jj_staff and by
--   src/lib/statements/statementAuthService.ts. Shape matches
--   supabase/tests/20260919120000_ops_agent_core/00_bootstrap.sql.
--   No migration in this repo CREATE TABLEs it, enables RLS, or GRANTs it.
--   HARNESS: table only. No RLS. No GRANT to authenticated (the app reads it
--   with the service role, which this fixture simulates as the table owner).
-- public.user_roles
--   Columns read by src/lib/nav/resolveFrameUser.ts (role, full_name) and by
--   the membership bootstrap in supabase/migrations/20260924210000_access_company_memberships.sql
--   (user_id, role, is_active). #288's alias select and draft RPC do not read it.
--   HARNESS table so the superadmin row can exist.
-- access.company_memberships policy read_own_active_company_membership
--   and GRANT SELECT TO authenticated
--   Copied from supabase/migrations/20260924210000_access_company_memberships.sql.
--   The throwaway company fixture creates the table, enables RLS, and revokes
--   grants, but omits this policy. Without it, access.is_company_member()
--   cannot see the caller's row when the invoker is authenticated.
-- public.properties
--   id, name from supabase/schema.sql. operating_company_id uuid NOT NULL and
--   the company foreign key from supabase/migrations/20260925120000_properties_operating_company_id.sql
--   and 20260926120000_properties_operating_company_not_null.sql.
--   ENABLE ROW LEVEL SECURITY and policy authenticated_read_properties from
--   supabase/schema.sql. Restrictive policy company_member_read from
--   supabase/migrations/20260930120000_company_member_read_isolation.sql.
--   HARNESS: GRANT SELECT TO authenticated. schema.sql has no GRANT statement.
-- public.property_name_aliases
--   raw_name, canonical_name are the columns
--   listAssistantPropertyAliases selects. operating_company_id uuid NOT NULL
--   and the company foreign key from
--   supabase/migrations/20260926140000_property_children_operating_company_id.sql
--   and 20260926200000_property_children_operating_company_not_null.sql.
--   Restrictive policy company_member_read copied from
--   supabase/migrations/20260930120000_company_member_read_isolation.sql.
--   That migration does not ENABLE ROW LEVEL SECURITY, and no migration in
--   this repo does. RLS stays off. The policy is stored and not applied.
--   HARNESS: GRANT SELECT TO authenticated so the session role can issue the
--   same select. No GRANT appears in the repo. The matrix also measures the
--   revoke (repo-only privileges).
--   Not copied: registry.enforce_child_operating_company and
--   trg_property_name_aliases_operating_company. The #288 read path does not
--   insert aliases.
-- finance.is_active_jj_staff()
--   Body and grants from supabase/migrations/20260917090100_agent_transaction_drafts.sql
--   (anon revoke repeated by 20260923120000).
-- finance.agent_transaction_drafts, staff policies, guard trigger
--   From supabase/migrations/20260917090100_agent_transaction_drafts.sql.
--   operating_company_id uuid NOT NULL and the company foreign key are the
--   end state of 20260927120000, 20260927140000, and 20260927240000.
--   Restrictive company_member_read FOR SELECT from 20260930120000.
-- finance.enforce_agent_transaction_draft_company()
--   Latest body from supabase/migrations/20260929120000_verified_operating_company_context.sql.
--   Trigger name trg_agent_tx_drafts_company from 20260927160000.
-- public.create_agent_transaction_draft(...)
--   Body and grants from supabase/migrations/20260929200000_internal_operating_company_path.sql.
-- public.transactions
--   HARNESS probe table (id only). The live ledger is not built here. The
--   matrix uses it only as a row counter, and checks that none of the copied
--   functions INSERT into it. The guard trigger's error text names the table
--   and does not write it.
-- Not installed, because #288 does not call them:
--   public.list_ops_conversation, public.resolve_party_id,
--   public.resolve_party_canonical, public.approve_and_post_agent_transaction_draft,
--   public.contacts. Conversation restore is TypeScript and passes null company
--   ids, so the list RPC is not reached. Payer and payee are free text.

CREATE SCHEMA IF NOT EXISTS finance;
GRANT USAGE ON SCHEMA finance TO authenticated;

CREATE TABLE public.jj_staff_config (
  user_id uuid PRIMARY KEY,
  staff_role text,
  is_active boolean NOT NULL DEFAULT true,
  granted_at timestamptz DEFAULT now(),
  granted_by uuid,
  notes text
);
REVOKE ALL ON TABLE public.jj_staff_config FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE public.user_roles (
  user_id uuid PRIMARY KEY,
  role text NOT NULL,
  full_name text,
  is_active boolean NOT NULL DEFAULT true
);
REVOKE ALL ON TABLE public.user_roles FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE access.company_memberships TO authenticated;
CREATE POLICY read_own_active_company_membership
  ON access.company_memberships
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()) AND is_active);

CREATE TABLE public.properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  operating_company_id uuid NOT NULL REFERENCES registry.companies (company_id),
  CONSTRAINT properties_name_unique UNIQUE (name)
);
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.properties FROM PUBLIC, anon, authenticated, service_role;
-- HARNESS grant. Not present in supabase/schema.sql.
GRANT SELECT ON TABLE public.properties TO authenticated;
CREATE POLICY authenticated_read_properties
  ON public.properties
  FOR SELECT
  TO authenticated
  USING (auth.role() = 'authenticated');
CREATE POLICY company_member_read
  ON public.properties
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (access.is_company_member(operating_company_id))
  WITH CHECK (access.is_company_member(operating_company_id));

CREATE TABLE public.property_name_aliases (
  raw_name text NOT NULL,
  canonical_name text NOT NULL,
  operating_company_id uuid NOT NULL REFERENCES registry.companies (company_id)
);
-- No ENABLE ROW LEVEL SECURITY. See header.
REVOKE ALL ON TABLE public.property_name_aliases FROM PUBLIC, anon, authenticated, service_role;
-- HARNESS grant. Not present in any migration. The matrix revokes it in a savepoint.
GRANT SELECT ON TABLE public.property_name_aliases TO authenticated;
CREATE POLICY company_member_read
  ON public.property_name_aliases
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (access.is_company_member(operating_company_id))
  WITH CHECK (access.is_company_member(operating_company_id));

CREATE OR REPLACE FUNCTION finance.is_active_jj_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
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

CREATE TABLE finance.agent_transaction_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  status text NOT NULL
    CHECK (status IN ('draft', 'needs_review', 'ready_for_approval', 'rejected')),
  date date NOT NULL,
  property_id uuid NULL,
  property_name_input text NOT NULL DEFAULT '',
  category text NOT NULL,
  subcategory text NOT NULL,
  payer_input text NULL,
  payee_input text NULL,
  amount_eur numeric(12,2) NULL,
  client_charge numeric(12,2) NULL,
  description text NULL,
  notes text NULL,
  source_type text NOT NULL DEFAULT 'manual_form',
  confidence text NULL,
  input_locale text NULL,
  schema_version integer NOT NULL DEFAULT 1,
  idempotency_key text NOT NULL UNIQUE,
  approved_by uuid NULL,
  approved_at timestamptz NULL,
  posted_transaction_id uuid NULL,
  operating_company_id uuid NOT NULL REFERENCES registry.companies (company_id),
  CONSTRAINT agent_drafts_posted_forbidden CHECK (posted_transaction_id IS NULL),
  CONSTRAINT agent_drafts_property_null_needs_review CHECK (
    property_id IS NOT NULL OR status = 'needs_review'
  )
);

CREATE OR REPLACE FUNCTION finance.trg_agent_tx_drafts_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'agent_transaction_drafts forbids physical DELETE'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.created_by IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'agent_transaction_drafts.created_by must equal auth.uid()'
        USING ERRCODE = 'restrict_violation';
    END IF;
    NEW.posted_transaction_id := NULL;
    NEW.approved_by := NULL;
    NEW.approved_at := NULL;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
    THEN
      RAISE EXCEPTION 'agent_transaction_drafts identity columns are immutable'
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW.posted_transaction_id IS NOT NULL THEN
      RAISE EXCEPTION 'Phase 0D forbids posting drafts to public.transactions'
        USING ERRCODE = 'restrict_violation';
    END IF;
    NEW.updated_at := now();
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_agent_tx_drafts_guard
  BEFORE INSERT OR UPDATE OR DELETE ON finance.agent_transaction_drafts
  FOR EACH ROW EXECUTE FUNCTION finance.trg_agent_tx_drafts_guard();

CREATE OR REPLACE FUNCTION finance.enforce_agent_transaction_draft_company()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $draft$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.operating_company_id IS DISTINCT FROM OLD.operating_company_id THEN
      RAISE EXCEPTION 'BLOCKED_BY_COMPANY_REASSIGNMENT';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'BLOCKED_BY_SCHEMA_DRIFT';
  END IF;

  NEW.operating_company_id := access.resolve_verified_operating_company(NEW.operating_company_id, false);
  RETURN NEW;
END
$draft$;

REVOKE ALL ON FUNCTION finance.enforce_agent_transaction_draft_company() FROM PUBLIC;
REVOKE ALL ON FUNCTION finance.enforce_agent_transaction_draft_company() FROM anon, authenticated, service_role;

CREATE TRIGGER trg_agent_tx_drafts_company
  BEFORE INSERT OR UPDATE ON finance.agent_transaction_drafts
  FOR EACH ROW
  EXECUTE FUNCTION finance.enforce_agent_transaction_draft_company();

ALTER TABLE finance.agent_transaction_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.agent_transaction_drafts FORCE ROW LEVEL SECURITY;

CREATE POLICY agent_tx_drafts_staff_select
  ON finance.agent_transaction_drafts
  FOR SELECT
  TO authenticated
  USING (finance.is_active_jj_staff());

CREATE POLICY agent_tx_drafts_staff_insert
  ON finance.agent_transaction_drafts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    finance.is_active_jj_staff()
    AND created_by = auth.uid()
    AND posted_transaction_id IS NULL
  );

CREATE POLICY agent_tx_drafts_staff_update
  ON finance.agent_transaction_drafts
  FOR UPDATE
  TO authenticated
  USING (finance.is_active_jj_staff())
  WITH CHECK (
    finance.is_active_jj_staff()
    AND posted_transaction_id IS NULL
  );

CREATE POLICY company_member_read
  ON finance.agent_transaction_drafts
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (access.is_company_member(operating_company_id));

REVOKE ALL ON TABLE finance.agent_transaction_drafts FROM PUBLIC;
REVOKE ALL ON TABLE finance.agent_transaction_drafts FROM anon;
GRANT SELECT, INSERT, UPDATE ON TABLE finance.agent_transaction_drafts TO authenticated;

CREATE OR REPLACE FUNCTION public.create_agent_transaction_draft(
  p_date date,
  p_property_id uuid,
  p_property_name_input text,
  p_category text,
  p_subcategory text,
  p_payer_input text,
  p_payee_input text,
  p_amount_eur numeric,
  p_client_charge numeric,
  p_description text,
  p_notes text,
  p_status text,
  p_idempotency_key text,
  p_source_type text,
  p_schema_version integer
)
RETURNS TABLE (
  id uuid,
  status text,
  reused_existing boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $draft_rpc$
DECLARE
  v_uid uuid;
  v_status text;
  v_id uuid;
  v_row_status text;
  v_company uuid;
  v_existing_company uuid;
  v_expected_company uuid;
  v_active_count integer;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated'
      USING ERRCODE = '42501';
  END IF;
  IF NOT finance.is_active_jj_staff() THEN
    RAISE EXCEPTION 'not authorized'
      USING ERRCODE = '42501';
  END IF;

  IF p_date IS NULL
     OR p_category IS NULL OR btrim(p_category) = ''
     OR p_subcategory IS NULL OR btrim(p_subcategory) = ''
     OR p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'date, category, subcategory, and idempotency_key are required'
      USING ERRCODE = 'not_null_violation';
  END IF;

  v_status := CASE
    WHEN p_property_id IS NULL THEN 'needs_review'
    ELSE COALESCE(NULLIF(btrim(p_status), ''), 'draft')
  END;
  IF v_status NOT IN ('draft', 'needs_review', 'ready_for_approval', 'rejected') THEN
    RAISE EXCEPTION 'invalid draft status'
      USING ERRCODE = 'check_violation';
  END IF;

  v_company := NULL;
  IF p_property_id IS NOT NULL THEN
    SELECT property.operating_company_id
      INTO v_company
    FROM public.properties AS property
    WHERE property.id = p_property_id;
    IF v_company IS NULL THEN
      RAISE EXCEPTION 'BLOCKED_BY_PARENT_COMPANY';
    END IF;
  END IF;

  INSERT INTO finance.agent_transaction_drafts AS d (
    created_by,
    status,
    date,
    property_id,
    property_name_input,
    category,
    subcategory,
    payer_input,
    payee_input,
    amount_eur,
    client_charge,
    description,
    notes,
    source_type,
    schema_version,
    idempotency_key,
    operating_company_id
  ) VALUES (
    v_uid,
    v_status,
    p_date,
    p_property_id,
    COALESCE(p_property_name_input, ''),
    p_category,
    p_subcategory,
    NULLIF(btrim(COALESCE(p_payer_input, '')), ''),
    NULLIF(btrim(COALESCE(p_payee_input, '')), ''),
    p_amount_eur,
    p_client_charge,
    NULLIF(btrim(COALESCE(p_description, '')), ''),
    NULLIF(btrim(COALESCE(p_notes, '')), ''),
    COALESCE(NULLIF(btrim(COALESCE(p_source_type, '')), ''), 'manual_form'),
    COALESCE(p_schema_version, 1),
    btrim(p_idempotency_key),
    v_company
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING d.id, d.status
    INTO v_id, v_row_status;

  IF v_id IS NOT NULL THEN
    id := v_id;
    status := v_row_status;
    reused_existing := false;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT d.id, d.status, d.operating_company_id
    INTO v_id, v_row_status, v_existing_company
    FROM finance.agent_transaction_drafts AS d
   WHERE d.idempotency_key = btrim(p_idempotency_key);

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Draft already exists for this key.'
      USING ERRCODE = 'unique_violation';
  END IF;

  v_expected_company := v_company;
  IF v_expected_company IS NULL THEN
    SELECT count(*)
      INTO v_active_count
    FROM registry.companies
    WHERE status = 'active';
    IF v_active_count = 1 THEN
      SELECT company_id
        INTO v_expected_company
      FROM registry.companies
      WHERE status = 'active';
    END IF;
  END IF;

  IF v_existing_company IS DISTINCT FROM v_expected_company THEN
    RAISE EXCEPTION 'BLOCKED_BY_COMPANY_CONTEXT';
  END IF;

  id := v_id;
  status := v_row_status;
  reused_existing := true;
  RETURN NEXT;
END
$draft_rpc$;

REVOKE ALL ON FUNCTION public.create_agent_transaction_draft(date, uuid, text, text, text, text, text, numeric, numeric, text, text, text, text, text, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_agent_transaction_draft(date, uuid, text, text, text, text, text, numeric, numeric, text, text, text, text, text, integer) FROM anon, service_role;
GRANT EXECUTE ON FUNCTION public.create_agent_transaction_draft(date, uuid, text, text, text, text, text, numeric, numeric, text, text, text, text, text, integer) TO authenticated;

-- HARNESS probe. Not the live ledger. Authenticated has no privilege on it.
CREATE TABLE public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid()
);
REVOKE ALL ON TABLE public.transactions FROM PUBLIC, anon, authenticated, service_role;
