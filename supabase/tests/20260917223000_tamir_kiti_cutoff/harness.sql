-- Isolated test harness: faithful replica of the Production objects the Apply touches.
-- Function bodies for auth.*, public.require_jj_staff, public.log_transaction_change,
-- public.enforce_transactions_append_only, finance.assert_owner_link_authorized,
-- finance.link_owner_level_payment and finance.soft_delete_owner_transaction_link are
-- copied verbatim from Production (pg_get_functiondef output).

-- ---------------------------------------------------------------- roles
CREATE ROLE dbowner NOSUPERUSER BYPASSRLS NOLOGIN;   -- mirrors Production 'postgres' (owner, bypassrls, not superuser)
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

GRANT dbowner TO CURRENT_USER;

-- ---------------------------------------------------------------- schemas
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS finance;
CREATE SCHEMA IF NOT EXISTS lifecycle;
GRANT USAGE ON SCHEMA auth, lifecycle, public TO anon, authenticated, service_role, dbowner;
-- Production: anon has NO USAGE on finance (verified live), authenticated / service_role do.
GRANT USAGE ON SCHEMA finance TO authenticated, service_role, dbowner;
GRANT CREATE ON SCHEMA public, finance, lifecycle, auth TO dbowner;

-- ---------------------------------------------------------------- auth
CREATE TABLE auth.users (
  id    uuid PRIMARY KEY,
  email text
);

CREATE OR REPLACE FUNCTION auth.jwt()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  select
    coalesce(
        nullif(current_setting('request.jwt.claim', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')
    )::jsonb
$function$;

CREATE OR REPLACE FUNCTION auth.role()
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$
  select
  coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$function$;

CREATE OR REPLACE FUNCTION auth.uid()
 RETURNS uuid
 LANGUAGE sql
 STABLE
AS $function$
  select
  coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$function$;

-- ---------------------------------------------------------------- public tables
CREATE TABLE public.properties (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text,
  status     text,
  is_deleted boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.transactions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date          date NOT NULL,
  property_id   uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  property_name text,
  category      text NOT NULL,
  subcategory   text NOT NULL,
  description   text,
  payer         text,
  payee         text,
  amount_eur    numeric NOT NULL DEFAULT 0,
  client_charge numeric,
  notes         text,
  k_note        text,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now(),
  is_deleted    boolean DEFAULT false,
  deleted_by    text,
  deleted_at    timestamp,
  review_status text DEFAULT 'active'
);

CREATE TABLE public.property_definitions (
  property_id       uuid,
  property_name     text,
  canonical_name    text,
  relationship_type text
);

CREATE TABLE public.property_name_aliases (
  raw_name       text,
  canonical_name text,
  notes          text,
  created_at     timestamp DEFAULT now()
);

CREATE TABLE public.transaction_exclusions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid,
  duplicate_of   uuid,
  reason         text,
  is_active      boolean DEFAULT true,
  excluded_by    text,
  source_batch   text,
  created_at     timestamptz DEFAULT now()
);

CREATE TABLE public.audit_logs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid,
  user_email text,
  action     text NOT NULL,
  table_name text,
  record_id  uuid,
  old_values jsonb,
  new_values jsonb,
  ip_address text,
  created_at timestamp DEFAULT now()
);

CREATE TABLE public.jj_staff_config (
  user_id    uuid PRIMARY KEY,
  staff_role text,
  is_active  boolean NOT NULL DEFAULT true,
  granted_at timestamptz DEFAULT now(),
  granted_by uuid,
  notes      text
);

-- ---------------------------------------------------------------- lifecycle
CREATE TABLE lifecycle.entity_identity (
  id             uuid PRIMARY KEY,
  canonical_name text NOT NULL,
  aliases        text[] NOT NULL DEFAULT '{}',
  entity_type    text NOT NULL,
  status         text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- finance links table
CREATE TABLE finance.owner_transaction_links (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id  uuid NOT NULL REFERENCES public.transactions(id),
  owner_entity_id uuid NOT NULL REFERENCES lifecycle.entity_identity(id),
  link_role       text NOT NULL CHECK (link_role = 'owner_level_payment'),
  idempotency_key text NOT NULL UNIQUE,
  review_status   text NOT NULL DEFAULT 'approved'
                    CHECK (review_status = ANY (ARRAY['approved','needs_review','ignored'])),
  is_deleted      boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      text NOT NULL,
  deleted_at      timestamptz,
  deleted_by      text,
  notes           text,
  CONSTRAINT owner_tx_links_soft_delete_pair CHECK (
    ((is_deleted = false) AND (deleted_at IS NULL) AND (deleted_by IS NULL))
    OR ((is_deleted = true) AND (deleted_at IS NOT NULL) AND (deleted_by IS NOT NULL)))
);

CREATE UNIQUE INDEX uq_owner_tx_links_active_transaction
  ON finance.owner_transaction_links (transaction_id) WHERE (is_deleted = false);
CREATE INDEX idx_owner_tx_links_owner_active
  ON finance.owner_transaction_links (owner_entity_id) WHERE (is_deleted = false);
CREATE INDEX idx_owner_tx_links_idempotency
  ON finance.owner_transaction_links (idempotency_key);

-- ---------------------------------------------------------------- functions (verbatim)
CREATE OR REPLACE FUNCTION public.require_jj_staff(p_allowed_roles text[] DEFAULT NULL::text[])
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor_id  UUID;
  v_is_active BOOLEAN;
  v_role      TEXT;
BEGIN
  v_actor_id := auth.uid();

  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION
      '[jj_auth] Authenticated session required. '
      'auth.uid() returned NULL - include a valid JWT in the request.';
  END IF;

  SELECT is_active, staff_role
    INTO v_is_active, v_role
    FROM public.jj_staff_config
   WHERE user_id = v_actor_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      '[jj_auth] User % is not in jj_staff_config. '
      'Contact Yossi to be registered as JJ internal staff.', v_actor_id;
  END IF;

  IF NOT v_is_active THEN
    RAISE EXCEPTION
      '[jj_auth] User % is registered but is_active = false. '
      'Contact Yossi to re-enable access.', v_actor_id;
  END IF;

  IF p_allowed_roles IS NOT NULL AND NOT (v_role = ANY(p_allowed_roles)) THEN
    RAISE EXCEPTION
      '[jj_auth] User % has role ''%'' which is not permitted for this operation. '
      'Allowed roles: %.', v_actor_id, v_role, p_allowed_roles;
  END IF;

  RETURN v_actor_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.log_transaction_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO audit_logs (user_id, user_email, action, table_name, record_id, old_values, new_values)
  VALUES (
    auth.uid(),
    (SELECT email FROM auth.users WHERE id = auth.uid()),
    TG_OP,
    TG_TABLE_NAME,
    CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END,
    CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN row_to_json(OLD)::jsonb ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN row_to_json(NEW)::jsonb ELSE NULL END
  );
  RETURN COALESCE(NEW, OLD);
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_transactions_append_only()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION
      '[append-only] public.transactions does not allow DELETE (id=%). '
      'Void/correct by appending a new row via statements.apply_correction_case.',
      OLD.id;
  END IF;

  IF (NEW.date          IS DISTINCT FROM OLD.date)
     OR (NEW.property_id   IS DISTINCT FROM OLD.property_id)
     OR (NEW.property_name IS DISTINCT FROM OLD.property_name)
     OR (NEW.category      IS DISTINCT FROM OLD.category)
     OR (NEW.subcategory   IS DISTINCT FROM OLD.subcategory)
     OR (NEW.description   IS DISTINCT FROM OLD.description)
     OR (NEW.payer         IS DISTINCT FROM OLD.payer)
     OR (NEW.payee         IS DISTINCT FROM OLD.payee)
     OR (NEW.amount_eur    IS DISTINCT FROM OLD.amount_eur)
     OR (NEW.client_charge IS DISTINCT FROM OLD.client_charge)
     OR (NEW.notes         IS DISTINCT FROM OLD.notes)
     OR (NEW.k_note        IS DISTINCT FROM OLD.k_note)
  THEN
    RAISE EXCEPTION
      '[append-only] public.transactions financial/descriptive columns are immutable (id=%). '
      'Corrections must append a new row via statements.apply_correction_case; '
      'only review_status / is_deleted / deleted_by / deleted_at may be updated.',
      OLD.id;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$function$;

CREATE OR REPLACE FUNCTION finance.assert_owner_link_authorized()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF auth.role() IS NOT DISTINCT FROM 'service_role' THEN
    RETURN;
  END IF;
  PERFORM public.require_jj_staff(ARRAY['ceo','finance_admin']);
END;
$function$;

CREATE OR REPLACE FUNCTION finance.link_owner_level_payment(p_transaction_id uuid, p_owner_entity_id uuid, p_idempotency_key text, p_created_by text, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_id UUID;
BEGIN
  PERFORM finance.assert_owner_link_authorized();

  IF p_transaction_id IS NULL OR p_owner_entity_id IS NULL
     OR p_idempotency_key IS NULL OR btrim(p_idempotency_key) = ''
     OR p_created_by IS NULL OR btrim(p_created_by) = '' THEN
    RAISE EXCEPTION 'link_owner_level_payment: required arguments missing'
      USING ERRCODE = 'not_null_violation';
  END IF;

  INSERT INTO finance.owner_transaction_links (
    transaction_id, owner_entity_id, link_role, idempotency_key, created_by, notes
  ) VALUES (
    p_transaction_id, p_owner_entity_id, 'owner_level_payment',
    p_idempotency_key, p_created_by, p_notes
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION finance.soft_delete_owner_transaction_link(p_link_id uuid, p_deleted_by text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  PERFORM finance.assert_owner_link_authorized();

  IF p_deleted_by IS NULL OR btrim(p_deleted_by) = '' THEN
    RAISE EXCEPTION 'soft_delete_owner_transaction_link: deleted_by required'
      USING ERRCODE = 'not_null_violation';
  END IF;

  UPDATE finance.owner_transaction_links
     SET is_deleted = true,
         deleted_at = now(),
         deleted_by = p_deleted_by
   WHERE id = p_link_id
     AND is_deleted = false;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'soft_delete_owner_transaction_link: link not found or already deleted'
      USING ERRCODE = 'no_data_found';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION finance.trg_owner_tx_links_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'owner_transaction_links forbids physical DELETE; set is_deleted=true'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.transaction_id IS DISTINCT FROM OLD.transaction_id
       OR NEW.owner_entity_id IS DISTINCT FROM OLD.owner_entity_id
       OR NEW.link_role IS DISTINCT FROM OLD.link_role
       OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
    THEN
      RAISE EXCEPTION 'owner_transaction_links identity columns are immutable'
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION finance.trg_owner_tx_links_conflict_review()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_property_id   UUID;
  v_property_name TEXT;
BEGIN
  SELECT t.property_id, t.property_name
    INTO v_property_id, v_property_name
  FROM public.transactions t
  WHERE t.id = NEW.transaction_id;

  IF v_property_id IS NOT NULL OR v_property_name IS NOT NULL THEN
    NEW.review_status := 'needs_review';
  END IF;

  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------- triggers
CREATE TRIGGER audit_transactions AFTER INSERT OR DELETE OR UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.log_transaction_change();
CREATE TRIGGER trg_transactions_append_only BEFORE DELETE OR UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_transactions_append_only();
CREATE TRIGGER trg_transactions_updated_at BEFORE UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER trg_owner_tx_links_conflict_review BEFORE INSERT OR UPDATE OF transaction_id
  ON finance.owner_transaction_links
  FOR EACH ROW EXECUTE FUNCTION finance.trg_owner_tx_links_conflict_review();
CREATE TRIGGER trg_owner_tx_links_guard BEFORE DELETE OR UPDATE ON finance.owner_transaction_links
  FOR EACH ROW EXECUTE FUNCTION finance.trg_owner_tx_links_guard();

-- ---------------------------------------------------------------- RLS (as in Production)
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY auth_read_transactions  ON public.transactions FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY auth_write_transactions ON public.transactions FOR ALL    USING (auth.role() = 'authenticated');

ALTER TABLE finance.owner_transaction_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.owner_transaction_links FORCE ROW LEVEL SECURITY;
CREATE POLICY deny_all_owner_transaction_links ON finance.owner_transaction_links
  AS RESTRICTIVE FOR ALL TO public USING (false) WITH CHECK (false);

-- ---------------------------------------------------------------- grants (as in Production)
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.transactions
  TO anon, authenticated, service_role;
GRANT SELECT ON finance.owner_transaction_links TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.properties, public.property_definitions,
  public.property_name_aliases, public.transaction_exclusions, public.audit_logs,
  public.jj_staff_config TO anon, authenticated, service_role;
GRANT SELECT ON lifecycle.entity_identity TO anon, authenticated, service_role;

-- ---------------------------------------------------------------- ownership mirrors Production
ALTER TABLE public.transactions             OWNER TO dbowner;
ALTER TABLE public.properties               OWNER TO dbowner;
ALTER TABLE public.property_definitions     OWNER TO dbowner;
ALTER TABLE public.property_name_aliases    OWNER TO dbowner;
ALTER TABLE public.transaction_exclusions   OWNER TO dbowner;
ALTER TABLE public.audit_logs               OWNER TO dbowner;
ALTER TABLE public.jj_staff_config          OWNER TO dbowner;
ALTER TABLE lifecycle.entity_identity       OWNER TO dbowner;
ALTER TABLE finance.owner_transaction_links OWNER TO dbowner;
ALTER TABLE auth.users                      OWNER TO dbowner;
ALTER FUNCTION auth.uid()                                 OWNER TO dbowner;
ALTER FUNCTION auth.role()                                OWNER TO dbowner;
ALTER FUNCTION auth.jwt()                                 OWNER TO dbowner;
ALTER FUNCTION public.require_jj_staff(text[])            OWNER TO dbowner;
ALTER FUNCTION public.log_transaction_change()            OWNER TO dbowner;
ALTER FUNCTION public.enforce_transactions_append_only()  OWNER TO dbowner;
ALTER FUNCTION public.update_updated_at()                 OWNER TO dbowner;
ALTER FUNCTION finance.assert_owner_link_authorized()     OWNER TO dbowner;
ALTER FUNCTION finance.link_owner_level_payment(uuid, uuid, text, text, text) OWNER TO dbowner;
ALTER FUNCTION finance.soft_delete_owner_transaction_link(uuid, text)         OWNER TO dbowner;
ALTER FUNCTION finance.trg_owner_tx_links_guard()           OWNER TO dbowner;
ALTER FUNCTION finance.trg_owner_tx_links_conflict_review() OWNER TO dbowner;

-- Production ACL on the gate: EXECUTE for the owner only.
REVOKE ALL ON FUNCTION finance.assert_owner_link_authorized() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION finance.link_owner_level_payment(uuid, uuid, text, text, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION finance.soft_delete_owner_transaction_link(uuid, text)
  TO authenticated, service_role;
