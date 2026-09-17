-- ============================================================
-- Controlled draft approval — public SECURITY DEFINER RPCs
-- LOCAL IMPLEMENTATION ONLY. Do not Apply to Production from this branch
-- without a separate Yossi authorization.
--
-- Adds explicit staff-gated edit / reject / approve-and-post.
-- Posting is INSERT-only into public.transactions (append-only).
-- Never automatic. Replay is idempotent: one draft → one transaction.
-- finance schema stays hidden from PostgREST.
-- ============================================================

BEGIN;

ALTER TABLE finance.agent_transaction_drafts
  DROP CONSTRAINT IF EXISTS agent_drafts_posted_forbidden;

ALTER TABLE finance.agent_transaction_drafts
  DROP CONSTRAINT IF EXISTS agent_transaction_drafts_status_check;

ALTER TABLE finance.agent_transaction_drafts
  ADD CONSTRAINT agent_transaction_drafts_status_check
  CHECK (status IN ('draft', 'needs_review', 'ready_for_approval', 'rejected', 'posted'));

ALTER TABLE finance.agent_transaction_drafts
  DROP CONSTRAINT IF EXISTS agent_drafts_property_null_needs_review;

ALTER TABLE finance.agent_transaction_drafts
  ADD CONSTRAINT agent_drafts_property_null_needs_review
  CHECK (property_id IS NOT NULL OR status IN ('needs_review', 'rejected'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_tx_drafts_posted_tx_unique
  ON finance.agent_transaction_drafts (posted_transaction_id)
  WHERE posted_transaction_id IS NOT NULL;

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
    IF NEW.status = 'posted' THEN
      RAISE EXCEPTION 'drafts cannot be inserted as posted'
        USING ERRCODE = 'restrict_violation';
    END IF;
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

    IF OLD.posted_transaction_id IS NOT NULL
       AND NEW.posted_transaction_id IS DISTINCT FROM OLD.posted_transaction_id THEN
      RAISE EXCEPTION 'posted_transaction_id is immutable once set'
        USING ERRCODE = 'restrict_violation';
    END IF;

    IF OLD.status = 'posted' THEN
      IF NEW.status IS DISTINCT FROM 'posted'
         OR NEW.date IS DISTINCT FROM OLD.date
         OR NEW.property_id IS DISTINCT FROM OLD.property_id
         OR NEW.property_name_input IS DISTINCT FROM OLD.property_name_input
         OR NEW.category IS DISTINCT FROM OLD.category
         OR NEW.subcategory IS DISTINCT FROM OLD.subcategory
         OR NEW.payer_input IS DISTINCT FROM OLD.payer_input
         OR NEW.payee_input IS DISTINCT FROM OLD.payee_input
         OR NEW.amount_eur IS DISTINCT FROM OLD.amount_eur
         OR NEW.client_charge IS DISTINCT FROM OLD.client_charge
         OR NEW.description IS DISTINCT FROM OLD.description
         OR NEW.notes IS DISTINCT FROM OLD.notes THEN
        RAISE EXCEPTION 'posted drafts are immutable'
          USING ERRCODE = 'restrict_violation';
      END IF;
    END IF;

    IF NEW.status = 'posted' AND NEW.posted_transaction_id IS NULL THEN
      RAISE EXCEPTION 'posted drafts require posted_transaction_id'
        USING ERRCODE = 'restrict_violation';
    END IF;

    NEW.updated_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP POLICY IF EXISTS agent_tx_drafts_staff_update ON finance.agent_transaction_drafts;
CREATE POLICY agent_tx_drafts_staff_update
  ON finance.agent_transaction_drafts
  FOR UPDATE
  TO authenticated
  USING (finance.is_active_jj_staff())
  WITH CHECK (
    finance.is_active_jj_staff()
    AND (
      posted_transaction_id IS NULL
      OR status = 'posted'
    )
  );

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
  IF v_status NOT IN ('draft', 'needs_review', 'ready_for_approval') THEN
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
     AND d.status IN ('draft', 'needs_review', 'ready_for_approval')
  RETURNING d.id, d.status INTO v_id, v_row_status;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'draft is not editable'
      USING ERRCODE = 'restrict_violation';
  END IF;

  id := v_id;
  status := v_row_status;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_agent_transaction_draft(p_id uuid)
RETURNS TABLE (
  id uuid,
  status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
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
  IF p_id IS NULL THEN
    RAISE EXCEPTION 'id is required'
      USING ERRCODE = 'not_null_violation';
  END IF;

  UPDATE finance.agent_transaction_drafts d
     SET status = 'rejected'
   WHERE d.id = p_id
     AND d.status IN ('draft', 'needs_review', 'ready_for_approval')
  RETURNING d.id, d.status INTO v_id, v_row_status;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'draft cannot be rejected'
      USING ERRCODE = 'restrict_violation';
  END IF;

  id := v_id;
  status := v_row_status;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_and_post_agent_transaction_draft(p_id uuid)
RETURNS TABLE (
  id uuid,
  status text,
  posted_transaction_id uuid,
  reused_existing boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_draft finance.agent_transaction_drafts%ROWTYPE;
  v_property_name text;
  v_tx_id uuid;
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
  IF p_id IS NULL THEN
    RAISE EXCEPTION 'id is required'
      USING ERRCODE = 'not_null_violation';
  END IF;

  SELECT d.*
    INTO v_draft
    FROM finance.agent_transaction_drafts d
   WHERE d.id = p_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'draft not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  IF v_draft.status = 'posted' AND v_draft.posted_transaction_id IS NOT NULL THEN
    id := v_draft.id;
    status := v_draft.status;
    posted_transaction_id := v_draft.posted_transaction_id;
    reused_existing := true;
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_draft.status = 'rejected' THEN
    RAISE EXCEPTION 'rejected drafts cannot be posted'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF v_draft.status NOT IN ('draft', 'needs_review', 'ready_for_approval') THEN
    RAISE EXCEPTION 'draft cannot be posted'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF v_draft.date IS NULL
     OR v_draft.property_id IS NULL
     OR v_draft.category IS NULL OR btrim(v_draft.category) = ''
     OR v_draft.subcategory IS NULL OR btrim(v_draft.subcategory) = ''
     OR v_draft.payer_input IS NULL OR btrim(v_draft.payer_input) = ''
     OR v_draft.payee_input IS NULL OR btrim(v_draft.payee_input) = ''
     OR v_draft.amount_eur IS NULL THEN
    RAISE EXCEPTION 'missing required posting fields'
      USING ERRCODE = 'not_null_violation';
  END IF;

  SELECT p.name
    INTO v_property_name
    FROM public.properties p
   WHERE p.id = v_draft.property_id;

  IF v_property_name IS NULL THEN
    v_property_name := NULLIF(btrim(v_draft.property_name_input), '');
  END IF;
  IF v_property_name IS NULL THEN
    RAISE EXCEPTION 'missing required posting fields'
      USING ERRCODE = 'not_null_violation';
  END IF;

  INSERT INTO public.transactions AS posted_tx (
    date, property_id, property_name, category, subcategory,
    description, payer, payee, amount_eur, client_charge, notes, k_note
  ) VALUES (
    v_draft.date,
    v_draft.property_id,
    v_property_name,
    v_draft.category,
    v_draft.subcategory,
    v_draft.description,
    v_draft.payer_input,
    v_draft.payee_input,
    v_draft.amount_eur,
    v_draft.client_charge,
    v_draft.notes,
    NULL
  )
  RETURNING posted_tx.id INTO v_tx_id;

  UPDATE finance.agent_transaction_drafts d
     SET status = 'posted',
         posted_transaction_id = v_tx_id,
         approved_by = v_uid,
         approved_at = now()
   WHERE d.id = v_draft.id
     AND d.status IN ('draft', 'needs_review', 'ready_for_approval')
     AND d.posted_transaction_id IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'draft posting lost the row lock'
      USING ERRCODE = 'serialization_failure';
  END IF;

  id := v_draft.id;
  status := 'posted';
  posted_transaction_id := v_tx_id;
  reused_existing := false;
  RETURN NEXT;
END;
$$;

DROP FUNCTION IF EXISTS public.list_agent_transaction_drafts();

CREATE FUNCTION public.list_agent_transaction_drafts()
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
  approved_at timestamptz,
  posted_transaction_id uuid
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
    d.approved_at,
    d.posted_transaction_id
  FROM finance.agent_transaction_drafts d
  ORDER BY d.created_at DESC, d.id ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_agent_transaction_draft(p_id uuid)
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
  approved_at timestamptz,
  posted_transaction_id uuid
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
  IF p_id IS NULL THEN
    RAISE EXCEPTION 'id is required'
      USING ERRCODE = 'not_null_violation';
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
    d.approved_at,
    d.posted_transaction_id
  FROM finance.agent_transaction_drafts d
  WHERE d.id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_agent_transaction_draft(uuid, date, uuid, text, text, text, text, text, numeric, numeric, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reject_agent_transaction_draft(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.approve_and_post_agent_transaction_draft(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_agent_transaction_drafts() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_agent_transaction_draft(uuid) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.update_agent_transaction_draft(uuid, date, uuid, text, text, text, text, text, numeric, numeric, text, text, text) FROM anon, service_role;
REVOKE EXECUTE ON FUNCTION public.reject_agent_transaction_draft(uuid) FROM anon, service_role;
REVOKE EXECUTE ON FUNCTION public.approve_and_post_agent_transaction_draft(uuid) FROM anon, service_role;
REVOKE EXECUTE ON FUNCTION public.list_agent_transaction_drafts() FROM anon, service_role;
REVOKE EXECUTE ON FUNCTION public.get_agent_transaction_draft(uuid) FROM anon, service_role;

GRANT EXECUTE ON FUNCTION public.update_agent_transaction_draft(uuid, date, uuid, text, text, text, text, text, numeric, numeric, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_agent_transaction_draft(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_and_post_agent_transaction_draft(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_agent_transaction_drafts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_agent_transaction_draft(uuid) TO authenticated;

COMMENT ON FUNCTION public.approve_and_post_agent_transaction_draft(uuid) IS
  'Staff-gated explicit approve-and-post. Atomic INSERT into public.transactions. Replay returns the same posted_transaction_id.';
COMMENT ON FUNCTION public.reject_agent_transaction_draft(uuid) IS
  'Staff-gated reject. Does not delete the draft and never writes public.transactions.';
COMMENT ON FUNCTION public.update_agent_transaction_draft(uuid, date, uuid, text, text, text, text, text, numeric, numeric, text, text, text) IS
  'Staff-gated draft-only edit. Refuses posted/rejected rows. Never writes public.transactions.';

COMMIT;
