-- Restores the verified-company helper and the two write functions.
-- Drops the internal permit. Does not change rows and does not restore earlier guards.

BEGIN;

DO $guard$
BEGIN
  IF (SELECT count(*) FROM supabase_migrations.schema_migrations) <> 191
     OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260929200000') <> 1
     OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260929120000') <> 1
     OR to_regclass('access.internal_company_write_permit') IS NULL
     OR (SELECT count(*) FROM registry.companies) <> 1
     OR (SELECT count(*) FROM registry.companies WHERE canonical_name = 'Yossi Properties') <> 0
     OR (SELECT count(*) FROM access.company_memberships) <> 1 THEN
    RAISE EXCEPTION 'BLOCKED_BY_ROLLBACK';
  END IF;
END
$guard$;

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
SECURITY DEFINER
SET search_path = lifecycle, public
AS $restore_engagement$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO lifecycle.service_engagements (
    entity_id, property_id, service_type, status,
    effective_from, effective_to, notes, created_by
  ) VALUES (
    p_entity_id, p_property_id, p_service_type, p_status,
    p_effective_from, p_effective_to, p_notes,
    COALESCE(p_created_by, auth.uid())
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$restore_engagement$;

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
SET search_path = ''
AS $restore_draft$
DECLARE
  v_uid uuid;
  v_status text;
  v_id uuid;
  v_row_status text;
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
    idempotency_key
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
    btrim(p_idempotency_key)
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

  SELECT d.id, d.status
    INTO v_id, v_row_status
    FROM finance.agent_transaction_drafts d
   WHERE d.idempotency_key = btrim(p_idempotency_key);

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Draft already exists for this key.'
      USING ERRCODE = 'unique_violation';
  END IF;

  id := v_id;
  status := v_row_status;
  reused_existing := true;
  RETURN NEXT;
END;
$restore_draft$;

REVOKE ALL ON FUNCTION public.create_agent_transaction_draft(date, uuid, text, text, text, text, text, numeric, numeric, text, text, text, text, text, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_agent_transaction_draft(date, uuid, text, text, text, text, text, numeric, numeric, text, text, text, text, text, integer) FROM anon, service_role;
GRANT EXECUTE ON FUNCTION public.create_agent_transaction_draft(date, uuid, text, text, text, text, text, numeric, numeric, text, text, text, text, text, integer) TO authenticated;

DROP FUNCTION access.disarm_internal_operating_company();
DROP FUNCTION access.arm_internal_operating_company(uuid);
DROP TABLE access.internal_company_write_permit;

DO $post$
BEGIN
  IF to_regclass('access.internal_company_write_permit') IS NOT NULL
     OR EXISTS (
       SELECT 1
       FROM pg_proc AS proc
       JOIN pg_namespace AS namespace ON namespace.oid = proc.pronamespace
       WHERE namespace.nspname = 'access'
         AND proc.proname = 'arm_internal_operating_company'
     )
     OR (
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
     OR (SELECT count(*) FROM registry.companies WHERE canonical_name = 'Yossi Properties') <> 0 THEN
    RAISE EXCEPTION 'BLOCKED_BY_ROLLBACK';
  END IF;
END
$post$;

COMMIT;
