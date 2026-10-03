-- Local PostgreSQL 17 reproduction of the 03.10.2026 catalog facts used by the
-- five drafts. This is not a production migration and it is not applied anywhere
-- except a disposable local database. Identifiers below are fixture stand-ins.

CREATE SCHEMA IF NOT EXISTS test;

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin') THEN
    CREATE ROLE supabase_admin NOLOGIN NOINHERIT;
  END IF;
END
$roles$;

GRANT anon, authenticated, service_role, supabase_admin TO postgres;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS finance;
CREATE SCHEMA IF NOT EXISTS access;
CREATE SCHEMA IF NOT EXISTS pms;

GRANT USAGE ON SCHEMA public, auth, finance TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA access TO authenticated, service_role;

CREATE TABLE auth.users (
  id uuid PRIMARY KEY,
  email text
);

CREATE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid
$$;

CREATE FUNCTION auth.role()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claims', true)::jsonb ->> 'role', ''),
    'anon'
  )
$$;

GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.role() TO anon, authenticated, service_role;

-- Defaults described for owners postgres and supabase_admin in schema public.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO anon, authenticated;

CREATE TABLE public.jj_staff_config (
  user_id uuid PRIMARY KEY,
  staff_role text,
  is_active boolean NOT NULL DEFAULT true
);
ALTER TABLE public.jj_staff_config ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE REFERENCES auth.users (id) ON DELETE CASCADE,
  email text,
  role text CHECK (role IN ('superadmin', 'partner', 'manager', 'employee', 'cleaner', 'viewer')),
  full_name text,
  is_active boolean,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Bodies copied from the repo migrations. require_jj_staff is the repeated
-- September bootstrap body; it is not in supabase/migrations, and the August
-- tamir harness uses longer exception text.
CREATE FUNCTION finance.is_active_jj_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.jj_staff_config AS staff_row
      WHERE staff_row.user_id = (SELECT auth.uid())
        AND staff_row.is_active
        AND staff_row.staff_role = 'ceo'
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_roles AS role_row
      WHERE role_row.user_id = (SELECT auth.uid())
        AND role_row.is_active IS TRUE
        AND role_row.role = 'superadmin'
    );
$$;

CREATE FUNCTION finance.is_active_jj_staff()
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

CREATE FUNCTION public.require_jj_staff(p_allowed_roles text[] DEFAULT NULL::text[])
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

REVOKE ALL ON FUNCTION finance.is_active_jj_admin() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION finance.is_active_jj_staff() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.require_jj_staff(text[]) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION finance.is_active_jj_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION finance.is_active_jj_staff() TO authenticated;
GRANT EXECUTE ON FUNCTION public.require_jj_staff(text[]) TO authenticated, service_role;

CREATE TABLE access.company_memberships (
  company_id uuid,
  user_id uuid,
  is_active boolean
);

CREATE FUNCTION access.is_company_member(target_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = pg_catalog
AS $$
  SELECT target_company_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM access.company_memberships AS membership
      WHERE membership.company_id = target_company_id
        AND membership.user_id = (SELECT auth.uid())
        AND membership.is_active
    );
$$;

REVOKE ALL ON FUNCTION access.is_company_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION access.is_company_member(uuid) TO authenticated, service_role;

CREATE TABLE public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  type text,
  email text,
  phone text,
  property_name text,
  notes text,
  is_deleted boolean,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.contact_properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid,
  property_name text,
  relationship_role text,
  confirmation_status text,
  is_deleted boolean
);

CREATE TABLE public.contact_opening_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid,
  property_name text,
  balance_eur numeric,
  as_of_date date,
  is_voided boolean
);

CREATE TABLE public.partnership_capital (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_name text,
  partner_name text,
  ownership_percent numeric,
  amount_paid_by_partner numeric,
  notes text,
  updated_at timestamptz,
  UNIQUE (property_name, partner_name)
);

CREATE TABLE public.case_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor uuid,
  action text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.property_name_aliases (
  raw_name text PRIMARY KEY,
  canonical_name text,
  operating_company_id uuid
);

DO $simple$
DECLARE
  name text;
  simple text[] := ARRAY[
    'accounting_rules',
    'airbnb_reservations',
    'alerts',
    'business_cases',
    'business_event_sources',
    'business_events',
    'case_completeness_gaps',
    'case_entities',
    'case_relationships',
    'case_workflow_state',
    'category_subcategories',
    'contact_opening_balance_history',
    'custody_positions',
    'data_quality_backup_20260610',
    'entities',
    'entity_aliases',
    'entity_registry',
    'freeze_v1_ceo_kpis',
    'freeze_v1_ceo_summary',
    'freeze_v1_settlement',
    'ownership',
    'partnership_ownership',
    'payer_aliases',
    'pending_queue',
    'property_definitions',
    'property_owners',
    'property_ownership',
    'property_reporting_map',
    'renovation_projects',
    'settlement_temporal_transitions',
    'tamir_redisson_backup_20260610',
    'transaction_business_metadata',
    'transaction_corrections',
    'transaction_exclusions',
    'transactions_backup_20260609',
    'transactions_deletion_backup',
    'user_profiles'
  ];
BEGIN
  FOREACH name IN ARRAY simple LOOP
    EXECUTE format('CREATE TABLE public.%I (id uuid PRIMARY KEY DEFAULT gen_random_uuid())', name);
  END LOOP;
END
$simple$;

DO $rls_grants$
DECLARE
  name text;
  all_tables text[] := ARRAY[
    'accounting_rules', 'airbnb_reservations', 'alerts', 'business_cases',
    'business_event_sources', 'business_events', 'case_audit_log',
    'case_completeness_gaps', 'case_entities', 'case_relationships',
    'case_workflow_state', 'category_subcategories', 'contact_opening_balance_history',
    'contact_opening_balances', 'contact_properties', 'contacts', 'custody_positions',
    'data_quality_backup_20260610', 'entities', 'entity_aliases', 'entity_registry',
    'freeze_v1_ceo_kpis', 'freeze_v1_ceo_summary', 'freeze_v1_settlement', 'ownership',
    'partnership_capital', 'partnership_ownership', 'payer_aliases', 'pending_queue',
    'property_definitions', 'property_name_aliases', 'property_owners',
    'property_ownership', 'property_reporting_map', 'renovation_projects',
    'settlement_temporal_transitions', 'tamir_redisson_backup_20260610',
    'transaction_business_metadata', 'transaction_corrections', 'transaction_exclusions',
    'transactions_backup_20260609', 'transactions_deletion_backup', 'user_profiles',
    'user_roles'
  ];
BEGIN
  IF array_length(all_tables, 1) <> 44 THEN
    RAISE EXCEPTION 'fixture table list must contain 44 relations';
  END IF;
  FOREACH name IN ARRAY all_tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', name);
    EXECUTE format(
      'GRANT ALL ON TABLE public.%I TO anon, authenticated, service_role',
      name
    );
  END LOOP;
END
$rls_grants$;

CREATE POLICY superadmin_manage_roles
  ON public.user_roles
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (auth.role() = 'authenticated');

CREATE POLICY user_can_read_own_role
  ON public.user_roles
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((user_id = auth.uid()) OR (auth.role() = 'authenticated'));

CREATE POLICY auth_all_contacts
  ON public.contacts
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (auth.role() = 'authenticated');

CREATE POLICY auth_all_contact_properties
  ON public.contact_properties
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (auth.role() = 'authenticated');

CREATE POLICY auth_write_opening_balances
  ON public.contact_opening_balances
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated read on partnership_capital"
  ON public.partnership_capital
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated write on partnership_capital"
  ON public.partnership_capital
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access on partnership_capital"
  ON public.partnership_capital
  AS PERMISSIVE
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY audit_log_insert
  ON public.case_audit_log
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY audit_log_select
  ON public.case_audit_log
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY auth_all_property_name_aliases
  ON public.property_name_aliases
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (auth.role() = 'authenticated');

CREATE POLICY company_member_read
  ON public.property_name_aliases
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (access.is_company_member(operating_company_id))
  WITH CHECK (access.is_company_member(operating_company_id));

CREATE TABLE public._view_base_ceo_summary (id integer);
CREATE VIEW public.v_airbnb_summary AS SELECT 1::int AS id;
CREATE VIEW public.v_ceo_kpis AS SELECT 1::int AS id;
CREATE VIEW public.v_ceo_summary AS SELECT id FROM public._view_base_ceo_summary;
CREATE VIEW public.v_owner_balances AS SELECT 1::int AS id;
CREATE VIEW public.v_possible_duplicates AS SELECT 1::int AS id;
CREATE VIEW public.v_rpt_contact_properties AS SELECT 1::int AS id;
CREATE VIEW public.v_transaction_issues AS SELECT 1::int AS id;

-- Default table privileges also land on views. Reset them to the attested shape:
-- anon has SELECT and INSERT; authenticated has SELECT; service_role has ALL.
REVOKE ALL ON TABLE
  public.v_airbnb_summary,
  public.v_ceo_kpis,
  public.v_ceo_summary,
  public.v_owner_balances,
  public.v_possible_duplicates,
  public.v_rpt_contact_properties,
  public.v_transaction_issues
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON TABLE
  public.v_airbnb_summary,
  public.v_ceo_kpis,
  public.v_ceo_summary,
  public.v_owner_balances,
  public.v_possible_duplicates,
  public.v_rpt_contact_properties,
  public.v_transaction_issues
  TO anon;
GRANT SELECT ON TABLE
  public.v_airbnb_summary,
  public.v_ceo_kpis,
  public.v_ceo_summary,
  public.v_owner_balances,
  public.v_possible_duplicates,
  public.v_rpt_contact_properties,
  public.v_transaction_issues
  TO authenticated;
GRANT ALL ON TABLE
  public.v_airbnb_summary,
  public.v_ceo_kpis,
  public.v_ceo_summary,
  public.v_owner_balances,
  public.v_possible_duplicates,
  public.v_rpt_contact_properties,
  public.v_transaction_issues
  TO service_role;

CREATE TABLE pms.property_mappings (
  external_id text,
  jj_property_name text,
  status text,
  confidence_label text,
  property_id uuid
);
CREATE TABLE pms.canonical_properties (
  external_id text,
  name text,
  internal_name text
);
CREATE TABLE pms.canonical_reservations (
  external_id text,
  external_property_id text,
  channel text,
  channel_raw text,
  status text,
  guest_name text,
  check_in date,
  check_out date,
  nights integer,
  guests integer,
  currency_code text,
  total_price numeric,
  cleaning_fee numeric
);
CREATE TABLE pms.raw_reservations (
  external_id text,
  is_current boolean,
  raw jsonb
);

CREATE FUNCTION public.pms_resolve_mapping(p_jj_property_name text)
RETURNS TABLE (
  external_id text, jj_property_name text, status text, confidence_label text,
  property_id uuid, hostaway_name text, hostaway_internal_name text
)
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT m.external_id, m.jj_property_name, m.status, m.confidence_label, m.property_id,
         cp.name, cp.internal_name
  FROM pms.property_mappings m
  LEFT JOIN pms.canonical_properties cp ON cp.external_id = m.external_id
  WHERE m.jj_property_name = p_jj_property_name AND m.status = 'approved'
  LIMIT 1;
$$;

CREATE FUNCTION public.pms_reservations_for_property(
  p_external_id text, p_from date, p_to date
)
RETURNS TABLE (
  external_id text, external_property_id text, channel text, channel_raw text, status text,
  guest_name text, check_in date, check_out date, nights integer, guests integer,
  currency_code text, total_price numeric, cleaning_fee numeric, raw jsonb
)
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT r.external_id, r.external_property_id, r.channel, r.channel_raw, r.status,
         r.guest_name, r.check_in, r.check_out, r.nights, r.guests, r.currency_code,
         r.total_price, r.cleaning_fee, rr.raw
  FROM pms.canonical_reservations r
  LEFT JOIN pms.raw_reservations rr ON rr.external_id = r.external_id AND rr.is_current
  WHERE r.external_property_id = p_external_id
    AND r.check_in <= p_to AND r.check_out >= p_from;
$$;

REVOKE ALL ON FUNCTION public.pms_resolve_mapping(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.pms_reservations_for_property(text, date, date) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pms_resolve_mapping(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pms_reservations_for_property(text, date, date) TO authenticated, service_role;

INSERT INTO auth.users (id, email)
VALUES ('11111111-1111-4111-8111-111111111111', 'admin@example.test');

INSERT INTO public.user_roles (user_id, email, role, full_name, is_active, notes)
VALUES (
  '11111111-1111-4111-8111-111111111111',
  'admin@example.test',
  'superadmin',
  'Local Admin',
  true,
  'fixture'
);

INSERT INTO public.jj_staff_config (user_id, staff_role, is_active)
VALUES ('11111111-1111-4111-8111-111111111111', 'ceo', true);

INSERT INTO public.contacts (id, name, type, email)
VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Fixture Contact', 'owner', 'contact@example.test');

INSERT INTO public.contact_opening_balances (contact_id, property_name, balance_eur, as_of_date, is_voided)
VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Fixture Property', 10, '2026-01-01', false);

INSERT INTO public.partnership_capital (property_name, partner_name, ownership_percent, amount_paid_by_partner)
VALUES ('Fixture Property', 'Fixture Partner', 50, 0);

INSERT INTO public.case_audit_log (actor, action)
VALUES ('11111111-1111-4111-8111-111111111111', 'fixture');

INSERT INTO pms.property_mappings (external_id, jj_property_name, status, confidence_label)
VALUES ('412148', 'Villa Mazotos', 'approved', 'fixture');
INSERT INTO pms.canonical_properties (external_id, name, internal_name)
VALUES ('412148', 'Villa Mazotos', 'TM20');
INSERT INTO pms.canonical_reservations (
  external_id, external_property_id, channel, channel_raw, status, guest_name,
  check_in, check_out, nights, guests, currency_code, total_price, cleaning_fee
) VALUES (
  'res-1', '412148', 'airbnb', 'airbnb', 'confirmed', 'Guest Fixture',
  '2026-10-01', '2026-10-04', 3, 2, 'EUR', 100, 20
);
INSERT INTO pms.raw_reservations (external_id, is_current, raw)
VALUES ('res-1', true, '{"totalPrice":"100"}'::jsonb);

CREATE FUNCTION test.grant_policy_md5(
  relations text[],
  functions text[],
  defacl_owners text[]
)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = pg_catalog
AS $$
  SELECT md5(coalesce(string_agg(line, E'\n' ORDER BY line), ''))
  FROM (
    SELECT format(
      'policy|%s|%s|%s|%s|%s|%s|%s|%s',
      pol.schemaname,
      pol.tablename,
      pol.policyname,
      pol.permissive,
      pol.cmd,
      (
        SELECT coalesce(string_agg(role_name::text, ',' ORDER BY role_name::text), '')
        FROM unnest(pol.roles) AS role_name
      ),
      coalesce(pol.qual, ''),
      coalesce(pol.with_check, '')
    ) AS line
    FROM pg_catalog.pg_policies AS pol
    WHERE (pol.schemaname || '.' || pol.tablename) = ANY (relations)

    UNION ALL

    SELECT format(
      'rel|%s|%s|%s|%s|%s',
      nsp.nspname,
      cls.relname,
      coalesce(grantee.rolname, 'public'),
      priv.privilege_type,
      priv.is_grantable::text
    )
    FROM pg_catalog.pg_class AS cls
    JOIN pg_catalog.pg_namespace AS nsp ON nsp.oid = cls.relnamespace
    JOIN LATERAL pg_catalog.aclexplode(cls.relacl) AS priv ON true
    LEFT JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = priv.grantee
    WHERE (nsp.nspname || '.' || cls.relname) = ANY (relations)
      AND cls.relacl IS NOT NULL

    UNION ALL

    SELECT format('rel-null|%s|%s', nsp.nspname, cls.relname)
    FROM pg_catalog.pg_class AS cls
    JOIN pg_catalog.pg_namespace AS nsp ON nsp.oid = cls.relnamespace
    WHERE (nsp.nspname || '.' || cls.relname) = ANY (relations)
      AND cls.relacl IS NULL

    UNION ALL

    SELECT format(
      'pro|%s|%s|%s|%s|%s',
      nsp.nspname,
      proc.proname || '(' || pg_catalog.pg_get_function_identity_arguments(proc.oid) || ')',
      coalesce(grantee.rolname, 'public'),
      priv.privilege_type,
      priv.is_grantable::text
    )
    FROM pg_catalog.pg_proc AS proc
    JOIN pg_catalog.pg_namespace AS nsp ON nsp.oid = proc.pronamespace
    JOIN LATERAL pg_catalog.aclexplode(proc.proacl) AS priv ON true
    LEFT JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = priv.grantee
    WHERE (nsp.nspname || '.' || proc.proname) = ANY (functions)
      AND proc.proacl IS NOT NULL

    UNION ALL

    SELECT format(
      'defacl|%s|%s|%s|%s|%s',
      owner.rolname,
      coalesce(nsp.nspname, ''),
      def.defaclobjtype,
      coalesce(grantee.rolname, 'public'),
      priv.privilege_type
    )
    FROM pg_catalog.pg_default_acl AS def
    JOIN pg_catalog.pg_roles AS owner ON owner.oid = def.defaclrole
    LEFT JOIN pg_catalog.pg_namespace AS nsp ON nsp.oid = def.defaclnamespace
    JOIN LATERAL pg_catalog.aclexplode(def.defaclacl) AS priv ON true
    LEFT JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = priv.grantee
    WHERE owner.rolname = ANY (defacl_owners)
      AND nsp.nspname = 'public'
  ) AS lines;
$$;

CREATE PROCEDURE test.assume(p_user uuid, p_role text)
LANGUAGE plpgsql
AS $$
DECLARE
  payload text;
BEGIN
  IF p_user IS NULL THEN
    payload := json_build_object('role', p_role)::text;
  ELSE
    payload := json_build_object('sub', p_user, 'role', p_role)::text;
  END IF;
  PERFORM set_config('request.jwt.claims', payload, true);
  EXECUTE format('SET LOCAL ROLE %I', p_role);
END;
$$;

CREATE PROCEDURE test.release()
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  RESET ROLE;
END;
$$;

CREATE PROCEDURE test.expect_eq(p_sql text, p_expected text, p_label text)
LANGUAGE plpgsql
AS $$
DECLARE
  got text;
BEGIN
  EXECUTE p_sql INTO got;
  IF got IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION 'FAIL %: expected [%] got [%]', p_label, p_expected, got;
  END IF;
  RAISE NOTICE 'PASS %', p_label;
END;
$$;

CREATE PROCEDURE test.expect_sqlstate(p_sql text, p_sqlstate text, p_label text)
LANGUAGE plpgsql
AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
    RAISE EXCEPTION 'FAIL %: expected SQLSTATE % but statement succeeded', p_label, p_sqlstate;
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE 'FAIL %' THEN
        RAISE;
      END IF;
      IF SQLSTATE IS DISTINCT FROM p_sqlstate THEN
        RAISE EXCEPTION 'FAIL %: expected SQLSTATE % but got % (%).',
          p_label, p_sqlstate, SQLSTATE, SQLERRM;
      END IF;
  END;
  RAISE NOTICE 'PASS %', p_label;
END;
$$;

CREATE PROCEDURE test.expect_message(p_sql text, p_token text, p_label text)
LANGUAGE plpgsql
AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
    RAISE EXCEPTION 'FAIL %: expected message containing % but statement succeeded', p_label, p_token;
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE 'FAIL %' THEN
        RAISE;
      END IF;
      IF position(p_token in SQLERRM) = 0 THEN
        RAISE EXCEPTION 'FAIL %: expected message containing % but got % (%).',
          p_label, p_token, SQLSTATE, SQLERRM;
      END IF;
  END;
  RAISE NOTICE 'PASS %', p_label;
END;
$$;

GRANT USAGE ON SCHEMA test TO anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA test TO anon, authenticated, service_role;
GRANT EXECUTE ON ALL PROCEDURES IN SCHEMA test TO anon, authenticated, service_role;
