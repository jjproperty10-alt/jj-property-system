-- =====================================================================
-- Atomic public reclassification workflow (C3/C4/C6)
--
-- Completes the correction path without exposing the statements schema:
--   authorize → create case if absent → approve → statements.apply_correction_case
-- One transaction: any RAISE rolls back case, events, and correcting rows.
--
-- Parameters (no arbitrary SQL/table/function names, no p_rows injection):
--   p_source_id          uuid   original public.transactions.id
--   p_correction_type    text   must be 'reclassification'
--   p_corrected_fields   jsonb  whitelist: property_id, subcategory, description
--   p_reason             text   stored as correction_cases.description
--   p_natural_key        text   must match the deterministic server key
--
-- Natural key:
--   {source_id}|reclassification|{property_id}|{subcategory}|{description}
--   missing whitelist keys are empty strings.
--
-- Filename order: after 20260918090000_agent_draft_approval_rpcs.sql
-- (current origin/main head). Does not create public.apply_correction_case.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.apply_reclassification_correction(uuid, text, jsonb, text, text);
-- =====================================================================

CREATE OR REPLACE FUNCTION public.apply_reclassification_correction(
  p_source_id        uuid,
  p_correction_type  text,
  p_corrected_fields jsonb,
  p_reason           text,
  p_natural_key      text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_actor            uuid;
  v_orig             public.transactions%ROWTYPE;
  v_corr             jsonb := '{}'::jsonb;
  v_key              text;
  v_key_name         text;
  v_series           uuid;
  v_case             statements.correction_cases%ROWTYPE;
  v_case_id          uuid;
  v_created          boolean := false;
  v_rows             jsonb;
  v_applied          jsonb;
  v_ids              uuid[] := ARRAY[]::uuid[];
  v_reversal_id      uuid;
  v_rebook_id        uuid;
  v_orig_fields      jsonb;
  v_pid              uuid;
  v_opened_by        uuid;
  v_resolved_by      uuid;
BEGIN
  v_actor := public.require_jj_staff(ARRAY['ceo','finance_admin']);

  IF p_source_id IS NULL THEN
    RAISE EXCEPTION '[input] source_id must be a UUID.';
  END IF;
  IF btrim(COALESCE(p_correction_type, '')) IS DISTINCT FROM 'reclassification' THEN
    RAISE EXCEPTION '[input] correction_type must be reclassification.';
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION '[input] reason must be non-empty.';
  END IF;
  IF p_natural_key IS NULL OR btrim(p_natural_key) = '' THEN
    RAISE EXCEPTION '[input] natural key must be non-empty.';
  END IF;
  IF p_corrected_fields IS NULL OR jsonb_typeof(p_corrected_fields) <> 'object' THEN
    RAISE EXCEPTION '[input] corrected_fields must be a JSON object.';
  END IF;

  FOR v_key_name IN SELECT jsonb_object_keys(p_corrected_fields) LOOP
    IF v_key_name NOT IN ('property_id', 'subcategory', 'description') THEN
      RAISE EXCEPTION '[denied] corrected field "%" is not allowed (C3/C4/C6 whitelist).', v_key_name;
    END IF;
  END LOOP;

  IF p_corrected_fields ? 'property_id' THEN
    BEGIN
      v_pid := NULLIF(btrim(p_corrected_fields->>'property_id'), '')::uuid;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION '[input] property_id must be a UUID.';
    END;
    IF v_pid IS NULL THEN
      RAISE EXCEPTION '[input] property_id must be a UUID.';
    END IF;
    v_corr := v_corr || jsonb_build_object('property_id', v_pid);
  END IF;
  IF p_corrected_fields ? 'subcategory' THEN
    IF btrim(COALESCE(p_corrected_fields->>'subcategory', '')) = '' THEN
      RAISE EXCEPTION '[input] subcategory must be non-empty when provided.';
    END IF;
    v_corr := v_corr || jsonb_build_object('subcategory', p_corrected_fields->>'subcategory');
  END IF;
  IF p_corrected_fields ? 'description' THEN
    IF btrim(COALESCE(p_corrected_fields->>'description', '')) = '' THEN
      RAISE EXCEPTION '[input] description must be non-empty when provided.';
    END IF;
    v_corr := v_corr || jsonb_build_object('description', p_corrected_fields->>'description');
  END IF;
  IF v_corr = '{}'::jsonb THEN
    RAISE EXCEPTION '[input] corrected_fields must include property_id, subcategory, and/or description.';
  END IF;

  SELECT * INTO v_orig FROM public.transactions WHERE id = p_source_id FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION '[not_found] Source transaction % does not exist.', p_source_id;
  END IF;

  v_key := p_source_id::text
        || '|reclassification|'
        || COALESCE(v_corr->>'property_id', '')
        || '|'
        || COALESCE(v_corr->>'subcategory', '')
        || '|'
        || COALESCE(v_corr->>'description', '');
  IF btrim(p_natural_key) IS DISTINCT FROM v_key THEN
    RAISE EXCEPTION '[input] natural key mismatch.';
  END IF;

  -- Frozen money fields are not correctable through this RPC.
  IF (v_corr ? 'amount_eur') OR (v_corr ? 'client_charge') OR (v_corr ? 'payer')
     OR (v_corr ? 'payee') OR (v_corr ? 'date') THEN
    RAISE EXCEPTION '[denied] frozen money fields cannot be changed.';
  END IF;

  v_orig_fields := '{}'::jsonb;
  IF v_corr ? 'property_id' THEN
    v_orig_fields := v_orig_fields || jsonb_build_object('property_id', v_orig.property_id);
  END IF;
  IF v_corr ? 'subcategory' THEN
    v_orig_fields := v_orig_fields || jsonb_build_object('subcategory', v_orig.subcategory);
  END IF;
  IF v_corr ? 'description' THEN
    v_orig_fields := v_orig_fields || jsonb_build_object('description', v_orig.description);
  END IF;

  -- Existing case for this natural key (idempotent create).
  SELECT * INTO v_case
    FROM statements.correction_cases c
   WHERE c.original_transaction_id = p_source_id
     AND c.correction_type = 'reclassification'
     AND c.corrected_field_values IS NOT DISTINCT FROM v_corr
     AND c.status NOT IN ('rejected', 'void')
   ORDER BY c.opened_at
   LIMIT 1
   FOR UPDATE;

  IF v_case.id IS NOT NULL AND v_case.status = 'applied' THEN
    SELECT cat.applied_transaction_id INTO v_reversal_id
      FROM statements.correction_applied_transactions cat
     WHERE cat.case_id = v_case.id AND cat.entry_role = 'reversal'
     ORDER BY cat.sequence_no LIMIT 1;
    SELECT cat.applied_transaction_id INTO v_rebook_id
      FROM statements.correction_applied_transactions cat
     WHERE cat.case_id = v_case.id AND cat.entry_role IN ('rebook', 'replacement')
     ORDER BY cat.sequence_no LIMIT 1;
    SELECT coalesce(array_agg(cat.applied_transaction_id ORDER BY cat.sequence_no), ARRAY[]::uuid[])
      INTO v_ids
      FROM statements.correction_applied_transactions cat
     WHERE cat.case_id = v_case.id;
    RETURN jsonb_build_object(
      'correction_case_id', v_case.id,
      'reversal_id', v_reversal_id,
      'rebook_id', v_rebook_id,
      'replay', true,
      'idempotent', true,
      'inserted_count', 0,
      'applied_transaction_ids', to_jsonb(v_ids),
      'opened_by', v_case.opened_by,
      'resolved_by', v_case.resolved_by,
      'actor', v_actor
    );
  END IF;

  IF v_case.id IS NULL THEN
    SELECT s.series_id INTO v_series
      FROM statements.statement_series s
     ORDER BY s.series_id
     LIMIT 1;
    IF v_series IS NULL THEN
      RAISE EXCEPTION '[blocked] no statement_series exists; cannot open a correction case.';
    END IF;

    v_case_id := statements.open_correction_case(
      v_series,
      p_source_id,
      'reclassification',
      btrim(p_reason),
      v_orig.amount_eur,
      v_orig.amount_eur,
      'normal',
      v_orig_fields,
      v_corr
    );
    v_created := true;
    -- Preserve case state machine: open → approved (audit event via transition RPC).
    PERFORM statements.transition_correction_case(v_case_id, 'approved', btrim(p_reason), NULL);
  ELSE
    v_case_id := v_case.id;
    IF v_case.status IN ('open', 'under_review') THEN
      PERFORM statements.transition_correction_case(v_case_id, 'approved', btrim(p_reason), NULL);
    ELSIF v_case.status <> 'approved' THEN
      RAISE EXCEPTION '[denied] Case % is in status "%" and cannot be applied.', v_case_id, v_case.status;
    END IF;
  END IF;

  -- INSERT-only correcting rows. Original money columns are copied, never updated.
  v_rows := jsonb_build_array(
    jsonb_build_object(
      'role', 'reversal',
      'date', v_orig.date,
      'property_id', v_orig.property_id,
      'property_name', v_orig.property_name,
      'category', v_orig.category,
      'subcategory', v_orig.subcategory,
      'description', v_orig.description,
      'payer', v_orig.payer,
      'payee', v_orig.payee,
      'amount_eur', (-1 * v_orig.amount_eur),
      'client_charge', CASE WHEN v_orig.client_charge IS NULL THEN NULL ELSE (-1 * v_orig.client_charge) END,
      'notes', v_orig.notes,
      'k_note', v_orig.k_note,
      'corrects_transaction_id', v_orig.id
    ),
    jsonb_build_object(
      'role', 'rebook',
      'date', v_orig.date,
      'property_id', CASE WHEN v_corr ? 'property_id' THEN (v_corr->>'property_id')::uuid ELSE v_orig.property_id END,
      'property_name', v_orig.property_name,
      'category', v_orig.category,
      'subcategory', CASE WHEN v_corr ? 'subcategory' THEN v_corr->>'subcategory' ELSE v_orig.subcategory END,
      'description', CASE WHEN v_corr ? 'description' THEN v_corr->>'description' ELSE v_orig.description END,
      'payer', v_orig.payer,
      'payee', v_orig.payee,
      'amount_eur', v_orig.amount_eur,
      'client_charge', v_orig.client_charge,
      'notes', v_orig.notes,
      'k_note', v_orig.k_note,
      'corrects_transaction_id', v_orig.id
    )
  );

  v_applied := statements.apply_correction_case(v_case_id, v_rows);

  SELECT array_agg(cat.applied_transaction_id ORDER BY cat.sequence_no)
    INTO v_ids
    FROM statements.correction_applied_transactions cat
   WHERE cat.case_id = v_case_id;
  SELECT cat.applied_transaction_id INTO v_reversal_id
    FROM statements.correction_applied_transactions cat
   WHERE cat.case_id = v_case_id AND cat.entry_role = 'reversal'
   ORDER BY cat.sequence_no LIMIT 1;
  SELECT cat.applied_transaction_id INTO v_rebook_id
    FROM statements.correction_applied_transactions cat
   WHERE cat.case_id = v_case_id AND cat.entry_role IN ('rebook', 'replacement')
   ORDER BY cat.sequence_no LIMIT 1;
  SELECT c.opened_by, c.resolved_by
    INTO v_opened_by, v_resolved_by
    FROM statements.correction_cases c
   WHERE c.id = v_case_id;

  RETURN jsonb_build_object(
    'correction_case_id', v_case_id,
    'reversal_id', v_reversal_id,
    'rebook_id', v_rebook_id,
    'replay', false,
    'idempotent', false,
    'inserted_count', COALESCE((v_applied->>'inserted_count')::int, 0),
    'applied_transaction_ids', to_jsonb(COALESCE(v_ids, ARRAY[]::uuid[])),
    'created_case', v_created,
    'opened_by', v_opened_by,
    'resolved_by', v_resolved_by,
    'actor', v_actor
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.apply_reclassification_correction(uuid, text, jsonb, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_reclassification_correction(uuid, text, jsonb, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.apply_reclassification_correction(uuid, text, jsonb, text, text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.apply_reclassification_correction(uuid, text, jsonb, text, text) TO authenticated;

COMMENT ON FUNCTION public.apply_reclassification_correction(uuid, text, jsonb, text, text) IS
  'Atomic public workflow: open (if needed) → approve → statements.apply_correction_case. '
  'SECURITY DEFINER, empty search_path, require_jj_staff(ceo,finance_admin). '
  'authenticated EXECUTE only. Does not expose the statements schema. '
  'Rollback: DROP FUNCTION IF EXISTS public.apply_reclassification_correction(uuid, text, jsonb, text, text);';
