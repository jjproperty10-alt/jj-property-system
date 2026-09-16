-- ============================================================
-- Phase 1B — public RPC bridge for finance.agent_transaction_drafts
-- LOCAL IMPLEMENTATION ONLY. Do not Apply to Production from this branch
-- without a separate Yossi authorization.
--
-- Fixes PGRST106 "Invalid schema: finance" on /transactions/new.
-- PostgREST db-schemas stay public, lifecycle. finance is NOT exposed.
-- Draft rows remain in finance.agent_transaction_drafts.
-- These wrappers never write public.transactions and never accept
-- posted_transaction_id or client-supplied created_by.
-- ============================================================

BEGIN;

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
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.list_agent_transaction_drafts()
RETURNS TABLE (
  id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid,
  status text,
  date date,
  property_id uuid,
  property_name_input text,
  category text,
  subcategory text,
  payer_input text,
  payee_input text,
  amount_eur numeric,
  client_charge numeric,
  description text,
  notes text,
  source_type text,
  confidence text,
  input_locale text,
  schema_version integer,
  idempotency_key text,
  approved_by uuid,
  approved_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated'
      USING ERRCODE = '42501';
  END IF;
  IF NOT finance.is_active_jj_staff() THEN
    RAISE EXCEPTION 'not authorized'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    d.id,
    d.created_at,
    d.updated_at,
    d.created_by,
    d.status,
    d.date,
    d.property_id,
    d.property_name_input,
    d.category,
    d.subcategory,
    d.payer_input,
    d.payee_input,
    d.amount_eur,
    d.client_charge,
    d.description,
    d.notes,
    d.source_type,
    d.confidence,
    d.input_locale,
    d.schema_version,
    d.idempotency_key,
    d.approved_by,
    d.approved_at
  FROM finance.agent_transaction_drafts d
  ORDER BY d.created_at DESC, d.id ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_agent_transaction_draft(
  p_id uuid,
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
  p_status text
)
RETURNS TABLE (
  id uuid,
  status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_status text;
  v_id uuid;
  v_row_status text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated'
      USING ERRCODE = '42501';
  END IF;
  IF NOT finance.is_active_jj_staff() THEN
    RAISE EXCEPTION 'not authorized'
      USING ERRCODE = '42501';
  END IF;

  IF p_id IS NULL
     OR p_date IS NULL
     OR p_category IS NULL OR btrim(p_category) = ''
     OR p_subcategory IS NULL OR btrim(p_subcategory) = '' THEN
    RAISE EXCEPTION 'id, date, category, and subcategory are required'
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

  UPDATE finance.agent_transaction_drafts d
     SET date = p_date,
         property_id = p_property_id,
         property_name_input = COALESCE(p_property_name_input, ''),
         category = p_category,
         subcategory = p_subcategory,
         payer_input = NULLIF(btrim(COALESCE(p_payer_input, '')), ''),
         payee_input = NULLIF(btrim(COALESCE(p_payee_input, '')), ''),
         amount_eur = p_amount_eur,
         client_charge = p_client_charge,
         description = NULLIF(btrim(COALESCE(p_description, '')), ''),
         notes = NULLIF(btrim(COALESCE(p_notes, '')), ''),
         status = v_status
   WHERE d.id = p_id
  RETURNING d.id, d.status INTO v_id, v_row_status;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'draft not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  id := v_id;
  status := v_row_status;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.create_agent_transaction_draft(date, uuid, text, text, text, text, text, numeric, numeric, text, text, text, text, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_agent_transaction_drafts() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_agent_transaction_draft(uuid, date, uuid, text, text, text, text, text, numeric, numeric, text, text, text) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.create_agent_transaction_draft(date, uuid, text, text, text, text, text, numeric, numeric, text, text, text, text, text, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.list_agent_transaction_drafts() FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_agent_transaction_draft(uuid, date, uuid, text, text, text, text, text, numeric, numeric, text, text, text) FROM anon;

REVOKE EXECUTE ON FUNCTION public.create_agent_transaction_draft(date, uuid, text, text, text, text, text, numeric, numeric, text, text, text, text, text, integer) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.list_agent_transaction_drafts() FROM service_role;
REVOKE EXECUTE ON FUNCTION public.update_agent_transaction_draft(uuid, date, uuid, text, text, text, text, text, numeric, numeric, text, text, text) FROM service_role;

GRANT EXECUTE ON FUNCTION public.create_agent_transaction_draft(date, uuid, text, text, text, text, text, numeric, numeric, text, text, text, text, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_agent_transaction_drafts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_agent_transaction_draft(uuid, date, uuid, text, text, text, text, text, numeric, numeric, text, text, text) TO authenticated;

COMMENT ON FUNCTION public.create_agent_transaction_draft(date, uuid, text, text, text, text, text, numeric, numeric, text, text, text, text, text, integer) IS
  'Staff-gated draft create. created_by = auth.uid(). Never posts to public.transactions.';
COMMENT ON FUNCTION public.list_agent_transaction_drafts() IS
  'Staff-gated draft list. Active staff may list all drafts. finance schema stays hidden from PostgREST.';
COMMENT ON FUNCTION public.update_agent_transaction_draft(uuid, date, uuid, text, text, text, text, text, numeric, numeric, text, text, text) IS
  'Staff-gated draft update of mutable fields only. Identity and posted_transaction_id stay immutable.';

COMMIT;
