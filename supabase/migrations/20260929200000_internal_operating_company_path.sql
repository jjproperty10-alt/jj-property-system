-- Verified internal company path.
-- A service_role write does not become trusted by role or by a caller UUID.
-- The only new authority is a permit row written by an ungranted function
-- and consumed in the same transaction by the company helper.
-- Direct inserts, set_config, and an explicit UUID stay fail-closed
-- once more than one company is active.
-- idempotency_key stays globally UNIQUE. Reuse is allowed only when the
-- existing draft belongs to the company this call would write. A key owned
-- by another company raises BLOCKED_BY_COMPANY_CONTEXT and returns nothing.
-- A later slice may scope the key to one company. This slice does not
-- change the existing global uniqueness constraint.
-- This migration does not insert a company, user, membership, or business row.

BEGIN;

DO $guard$
BEGIN
  LOCK TABLE registry.companies IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE access.company_memberships IN SHARE ROW EXCLUSIVE MODE;

  IF (SELECT count(*) FROM supabase_migrations.schema_migrations) <> 190
     OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260927260000') <> 1
     OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260928190000') <> 1
     OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260929120000') <> 1
     OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260929200000') <> 0
     OR (
       SELECT count(*) FROM (
         SELECT version FROM supabase_migrations.schema_migrations GROUP BY version HAVING count(*) > 1
       ) AS duplicated
     ) <> 0 THEN
    RAISE EXCEPTION 'BLOCKED_BY_HISTORY';
  END IF;

  IF to_regclass('access.internal_company_write_permit') IS NOT NULL
     OR EXISTS (
       SELECT 1
       FROM pg_proc AS proc
       JOIN pg_namespace AS namespace ON namespace.oid = proc.pronamespace
       WHERE namespace.nspname = 'access'
         AND proc.proname = 'arm_internal_operating_company'
     ) THEN
    RAISE EXCEPTION 'BLOCKED_BY_REAPPLY';
  END IF;

  IF (
       SELECT md5(proc.prosrc)
       FROM pg_proc AS proc
       JOIN pg_namespace AS namespace ON namespace.oid = proc.pronamespace
       WHERE namespace.nspname = 'access'
         AND proc.proname = 'resolve_verified_operating_company'
     ) IS DISTINCT FROM 'a121404d82f0a9d9c1cbe174165b01d1'
     OR (
       SELECT md5(proc.prosrc)
       FROM pg_proc AS proc
       JOIN pg_namespace AS namespace ON namespace.oid = proc.pronamespace
       WHERE namespace.nspname = 'public'
         AND proc.proname = 'create_agent_transaction_draft'
     ) IS DISTINCT FROM 'b21dc8fe041869cd7f790aca90e9372a'
     OR (
       SELECT md5(proc.prosrc)
       FROM pg_proc AS proc
       JOIN pg_namespace AS namespace ON namespace.oid = proc.pronamespace
       WHERE namespace.nspname = 'lifecycle'
         AND proc.proname = 'create_service_engagement'
     ) IS DISTINCT FROM '9f99e4749d6345398ae272c2355ca315'
     OR (
       SELECT md5(proc.prosrc)
       FROM pg_proc AS proc
       JOIN pg_namespace AS namespace ON namespace.oid = proc.pronamespace
       WHERE namespace.nspname = 'registry'
         AND proc.proname = 'forbid_uuid_change'
     ) IS DISTINCT FROM 'fe964c798154886e8dacc8edebef908a'
     OR (SELECT count(*) FROM registry.companies) <> 1
     OR (SELECT count(*) FROM registry.companies WHERE canonical_name = 'Yossi Properties') <> 0
     OR (SELECT count(*) FROM access.company_memberships) <> 1 THEN
    RAISE EXCEPTION 'BLOCKED_BY_SECURITY';
  END IF;
END
$guard$;

CREATE TABLE access.internal_company_write_permit (
  txid bigint PRIMARY KEY,
  company_id uuid NOT NULL
);

ALTER TABLE access.internal_company_write_permit ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE access.internal_company_write_permit FROM PUBLIC;
REVOKE ALL ON TABLE access.internal_company_write_permit FROM anon, authenticated, service_role;

CREATE FUNCTION access.arm_internal_operating_company(p_company uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $arm$
BEGIN
  IF p_company IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM registry.companies
       WHERE company_id = p_company
         AND status = 'active'
     ) THEN
    RAISE EXCEPTION 'BLOCKED_BY_COMPANY_CONTEXT';
  END IF;

  INSERT INTO access.internal_company_write_permit (txid, company_id)
  VALUES (pg_catalog.txid_current(), p_company)
  ON CONFLICT (txid) DO UPDATE
    SET company_id = EXCLUDED.company_id;
END
$arm$;

CREATE FUNCTION access.disarm_internal_operating_company()
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $disarm$
BEGIN
  DELETE FROM access.internal_company_write_permit
  WHERE txid = pg_catalog.txid_current();
END
$disarm$;

REVOKE ALL ON FUNCTION access.arm_internal_operating_company(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION access.arm_internal_operating_company(uuid) FROM anon, authenticated, service_role;
REVOKE ALL ON FUNCTION access.disarm_internal_operating_company() FROM PUBLIC;
REVOKE ALL ON FUNCTION access.disarm_internal_operating_company() FROM anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION access.resolve_verified_operating_company(
  p_requested uuid,
  p_inherited boolean
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $verified$
DECLARE
  actor uuid;
  session_role text;
  active_count integer;
  sole_company uuid;
  internal_company uuid;
BEGIN
  LOCK TABLE registry.companies IN SHARE ROW EXCLUSIVE MODE;

  actor := auth.uid();
  session_role := auth.role();

  IF session_role = 'anon'
     OR (session_role = 'authenticated' AND actor IS NULL) THEN
    RAISE EXCEPTION 'BLOCKED_BY_COMPANY_CONTEXT';
  END IF;

  SELECT count(*)
    INTO active_count
  FROM registry.companies
  WHERE status = 'active';

  IF active_count = 1 THEN
    SELECT company_id
      INTO sole_company
    FROM registry.companies
    WHERE status = 'active';
  END IF;

  SELECT permit.company_id
    INTO internal_company
  FROM access.internal_company_write_permit AS permit
  WHERE permit.txid = pg_catalog.txid_current();

  IF p_inherited THEN
    IF p_requested IS NULL
       OR NOT EXISTS (
         SELECT 1
         FROM registry.companies
         WHERE company_id = p_requested
           AND status = 'active'
       ) THEN
      RAISE EXCEPTION 'BLOCKED_BY_PARENT_COMPANY';
    END IF;
    IF actor IS NULL THEN
      IF internal_company IS NOT NULL
         AND p_requested IS NOT DISTINCT FROM internal_company THEN
        RETURN p_requested;
      END IF;
      IF active_count IS DISTINCT FROM 1
         OR p_requested IS DISTINCT FROM sole_company THEN
        RAISE EXCEPTION 'BLOCKED_BY_COMPANY_CONTEXT';
      END IF;
      RETURN p_requested;
    END IF;
    IF NOT access.is_company_member(p_requested) THEN
      RAISE EXCEPTION 'BLOCKED_BY_COMPANY_CONTEXT';
    END IF;
    RETURN p_requested;
  END IF;

  IF p_requested IS NULL THEN
    IF active_count IS DISTINCT FROM 1 OR sole_company IS NULL THEN
      RAISE EXCEPTION 'BLOCKED_BY_COMPANY_CONTEXT';
    END IF;
    IF actor IS NOT NULL AND NOT access.is_company_member(sole_company) THEN
      RAISE EXCEPTION 'BLOCKED_BY_COMPANY_CONTEXT';
    END IF;
    RETURN sole_company;
  END IF;

  IF actor IS NULL
     AND internal_company IS NOT NULL
     AND p_requested IS NOT DISTINCT FROM internal_company
     AND EXISTS (
       SELECT 1
       FROM registry.companies
       WHERE company_id = p_requested
         AND status = 'active'
     ) THEN
    RETURN p_requested;
  END IF;

  IF actor IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM registry.companies
       WHERE company_id = p_requested
         AND status = 'active'
     )
     OR NOT access.is_company_member(p_requested)
     OR (active_count = 1 AND p_requested IS DISTINCT FROM sole_company) THEN
    RAISE EXCEPTION 'BLOCKED_BY_COMPANY_CONTEXT';
  END IF;

  RETURN p_requested;
END
$verified$;

REVOKE ALL ON FUNCTION access.resolve_verified_operating_company(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION access.resolve_verified_operating_company(uuid, boolean) FROM anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION lifecycle.create_service_engagement(
  p_entity_id uuid,
  p_property_id uuid,
  p_service_type text,
  p_status text DEFAULT 'draft',
  p_effective_from date DEFAULT NULL,
  p_effective_to date DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_created_by uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $engagement$
DECLARE
  v_id uuid;
  v_company uuid;
BEGIN
  SELECT definition.operating_company_id
    INTO v_company
  FROM public.property_definitions AS definition
  WHERE definition.property_id = p_property_id;

  IF v_company IS NULL
     OR (
       SELECT count(*)
       FROM public.property_definitions AS definition
       WHERE definition.property_id = p_property_id
     ) IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'BLOCKED_BY_PARENT_COMPANY';
  END IF;

  PERFORM access.arm_internal_operating_company(v_company);

  INSERT INTO lifecycle.service_engagements (
    entity_id, property_id, service_type, status,
    effective_from, effective_to, notes, created_by
  ) VALUES (
    p_entity_id, p_property_id, p_service_type, p_status,
    p_effective_from, p_effective_to, p_notes,
    COALESCE(p_created_by, auth.uid())
  )
  RETURNING id INTO v_id;

  PERFORM access.disarm_internal_operating_company();
  RETURN v_id;
END
$engagement$;

REVOKE ALL ON FUNCTION lifecycle.create_service_engagement(uuid, uuid, text, text, date, date, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION lifecycle.create_service_engagement(uuid, uuid, text, text, date, date, text, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION lifecycle.create_service_engagement(uuid, uuid, text, text, date, date, text, uuid) TO service_role;

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

DO $post$
BEGIN
  IF (
       SELECT count(*)
       FROM pg_proc AS proc
       JOIN pg_namespace AS namespace ON namespace.oid = proc.pronamespace
       JOIN pg_roles AS owner_role ON owner_role.oid = proc.proowner
       WHERE namespace.nspname = 'access'
         AND proc.proname = 'arm_internal_operating_company'
         AND owner_role.rolname = 'postgres'
         AND proc.prosecdef
         AND proc.proconfig @> ARRAY['search_path=pg_catalog']
         AND proc.proacl::text = '{postgres=X/postgres}'
         AND position('set_config' in proc.prosrc) = 0
     ) <> 1
     OR (
       SELECT count(*)
       FROM pg_proc AS proc
       JOIN pg_namespace AS namespace ON namespace.oid = proc.pronamespace
       WHERE namespace.nspname = 'access'
         AND proc.proname = 'resolve_verified_operating_company'
         AND proc.proacl::text = '{postgres=X/postgres}'
         AND position('access.internal_company_write_permit' in proc.prosrc) > 0
         AND position('access.is_company_member' in proc.prosrc) > 0
         AND position('set_config' in proc.prosrc) = 0
     ) <> 1
     OR (
       SELECT count(*)
       FROM pg_proc AS proc
       JOIN pg_namespace AS namespace ON namespace.oid = proc.pronamespace
       WHERE namespace.nspname = 'lifecycle'
         AND proc.proname = 'create_service_engagement'
         AND position('access.arm_internal_operating_company' in proc.prosrc) > 0
         AND position('access.disarm_internal_operating_company' in proc.prosrc) > 0
         AND has_function_privilege('service_role', proc.oid, 'EXECUTE')
         AND NOT has_function_privilege('authenticated', proc.oid, 'EXECUTE')
     ) <> 1
     OR (
       SELECT count(*)
       FROM pg_proc AS proc
       JOIN pg_namespace AS namespace ON namespace.oid = proc.pronamespace
       WHERE namespace.nspname = 'public'
         AND proc.proname = 'create_agent_transaction_draft'
         AND position('public.properties' in proc.prosrc) > 0
         AND position('d.operating_company_id' in proc.prosrc) > 0
         AND position('BLOCKED_BY_COMPANY_CONTEXT' in proc.prosrc) > 0
         AND has_function_privilege('authenticated', proc.oid, 'EXECUTE')
         AND NOT has_function_privilege('service_role', proc.oid, 'EXECUTE')
     ) <> 1
     OR (
       SELECT md5(proc.prosrc)
       FROM pg_proc AS proc
       JOIN pg_namespace AS namespace ON namespace.oid = proc.pronamespace
       WHERE namespace.nspname = 'registry'
         AND proc.proname = 'forbid_uuid_change'
     ) IS DISTINCT FROM 'fe964c798154886e8dacc8edebef908a'
     OR (SELECT count(*) FROM registry.companies) <> 1
     OR (SELECT count(*) FROM registry.companies WHERE canonical_name = 'Yossi Properties') <> 0 THEN
    RAISE EXCEPTION 'BLOCKED_BY_SCHEMA_DRIFT';
  END IF;
END
$post$;

COMMIT;
