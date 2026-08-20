-- =====================================================================
-- F2 - Append-only correction application (INSERT-only)
-- Gate certification. Adds statements.apply_correction_case, the atomic
-- RPC that APPLIES a correction case by INSERTing the correcting
-- public.transactions row(s) built by the app (buildCorrectionInsertRows /
-- G7 buildCorrectionPlan), links them to the case, appends an 'applied'
-- event, and marks the case 'applied'. It NEVER updates or deletes the
-- original row - history stays immutable; corrections are appended.
--
-- This SUPERSEDES the in-place public.apply_transaction_correction, which
-- is deprecated below (and will additionally be blocked at runtime by the
-- append-only guard in 20260820_003, since it performs UPDATEs).
--
-- Forward-only, additive. REVIEW before applying. Nothing runs on open.
-- =====================================================================

CREATE OR REPLACE FUNCTION statements.apply_correction_case(
  p_case_id uuid,
  p_rows    jsonb   -- array of complete correcting rows (see buildCorrectionInsertRows)
)
 RETURNS uuid       -- the first inserted (primary) correcting transaction id
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor_id  UUID;
  v_case      statements.correction_cases%ROWTYPE;
  v_row       JSONB;
  v_new_id    UUID;
  v_first_id  UUID := NULL;
  v_count     INTEGER := 0;
BEGIN
  -- Governed: only CEO / finance admin may apply a correction.
  v_actor_id := public.require_jj_staff(ARRAY['ceo','finance_admin']);

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) = 0 THEN
    RAISE EXCEPTION '[input] p_rows must be a non-empty JSON array of correcting rows.';
  END IF;

  -- Lock the case; must exist and be non-terminal.
  SELECT * INTO v_case FROM statements.correction_cases WHERE id = p_case_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION '[not_found] Correction case % does not exist.', p_case_id;
  END IF;
  IF v_case.status IN ('applied','void') THEN
    RAISE EXCEPTION '[denied] Case % is in terminal status "%": cannot apply.', p_case_id, v_case.status;
  END IF;

  -- Append each correcting row as a NEW public.transactions row (never UPDATE/DELETE).
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    IF v_row->>'category' IS NULL OR trim(v_row->>'category') = '' THEN
      RAISE EXCEPTION '[input] Each correcting row requires a non-empty category (row %).', v_count;
    END IF;
    IF v_row->>'date' IS NULL THEN
      RAISE EXCEPTION '[input] Each correcting row requires a date (row %).', v_count;
    END IF;

    INSERT INTO public.transactions (
      date, property_id, property_name, category, subcategory,
      description, payer, payee, amount_eur, client_charge, notes, k_note
    ) VALUES (
      (v_row->>'date')::DATE,
      NULLIF(v_row->>'property_id','')::UUID,
      v_row->>'property_name',
      v_row->>'category',
      COALESCE(v_row->>'subcategory',''),
      v_row->>'description',
      v_row->>'payer',
      v_row->>'payee',
      COALESCE((v_row->>'amount_eur')::NUMERIC(12,2), 0),
      NULLIF(v_row->>'client_charge','')::NUMERIC(12,2),
      v_row->>'notes',
      v_row->>'k_note'
    )
    RETURNING id INTO v_new_id;

    IF v_first_id IS NULL THEN v_first_id := v_new_id; END IF;
    v_count := v_count + 1;
  END LOOP;

  -- Link the applied transaction id + mark the case applied (atomic with the inserts).
  UPDATE statements.correction_cases
     SET status                 = 'applied',
         applied_transaction_id = v_first_id,
         applied_at             = now(),
         resolved_by            = v_actor_id,
         resolved_at            = now(),
         updated_at             = now()
   WHERE id = p_case_id;

  INSERT INTO statements.correction_events (case_id, event_type, performed_by, notes)
  VALUES (p_case_id, 'applied', v_actor_id,
          format('[apply_correction_case] inserted %s correcting transaction(s); primary=%s', v_count, v_first_id));

  RETURN v_first_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION statements.apply_correction_case(uuid, jsonb) TO service_role;

-- Deprecate the in-place corrector (non-destructive: keep the function, mark it).
COMMENT ON FUNCTION public.apply_transaction_correction(uuid, text, text, text, text, text) IS
  'DEPRECATED (Gate certification): superseded by statements.apply_correction_case (INSERT-only append model). '
  'The append-only guard on public.transactions (20260820_003) also blocks its in-place UPDATEs at runtime. '
  'Do not call from application code; retained for historical/audit reference only.';
