-- =====================================================================
-- F2 (hardened) - Append-only correction application + lineage
-- Gate certification. Adds:
--   1. statements.correction_applied_transactions  (complete audit lineage,
--      one row per correcting transaction created)
--   2. statements.apply_correction_case(p_case_id, p_rows)  - the atomic,
--      APPROVED-gated, case-anchored, per-row-validated apply RPC that
--      INSERTs the correcting public.transactions rows, records lineage,
--      appends an event, and marks the case 'applied'. It NEVER updates or
--      deletes the original row.
--   3. statements.get_correction_applied_transactions(p_case_id) read RPC.
-- Deprecates the in-place public.apply_transaction_correction.
--
-- Forward-only, additive. IMPLEMENT-ONLY: REVIEW before applying; nothing
-- runs on PR open. Apply order: 001 -> 002 -> 003.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Lineage table: one row for EVERY transaction created by a correction.
-- No FK to public.transactions (cross-schema isolation P-ARCH-5): UUID
-- references without FK, consistent with statements.correction_cases.
-- Deny-all RLS; access only through SECURITY DEFINER staff-gated RPCs.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS statements.correction_applied_transactions (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id                 uuid NOT NULL REFERENCES statements.correction_cases(id),
  original_transaction_id uuid NULL,          -- from the case; NULL only for missing_charge/append
  applied_transaction_id  uuid NOT NULL,      -- the newly-inserted public.transactions id (no FK: cross-schema)
  entry_role              text NOT NULL CHECK (entry_role IN ('reversal','replacement','rebook','append')),
  sequence_no             integer NOT NULL,
  created_by              uuid,
  created_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_correction_applied_tx UNIQUE (case_id, applied_transaction_id)
);
CREATE INDEX IF NOT EXISTS idx_correction_applied_case ON statements.correction_applied_transactions(case_id);
CREATE INDEX IF NOT EXISTS idx_correction_applied_original ON statements.correction_applied_transactions(original_transaction_id);

ALTER TABLE statements.correction_applied_transactions ENABLE ROW LEVEL SECURITY;
-- deny-all: no policies created. Access is only via SECURITY DEFINER RPCs below.
REVOKE ALL ON statements.correction_applied_transactions FROM PUBLIC;
REVOKE ALL ON statements.correction_applied_transactions FROM anon, authenticated;
GRANT SELECT, INSERT ON statements.correction_applied_transactions TO service_role;

-- ---------------------------------------------------------------------
-- apply_correction_case: atomic, approved-gated, case-anchored apply.
-- Returns {primary_transaction_id, applied_transaction_ids[], inserted_count}.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION statements.apply_correction_case(
  p_case_id uuid,
  p_rows    jsonb
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor       UUID;
  v_case        statements.correction_cases%ROWTYPE;
  v_orig        public.transactions%ROWTYPE;
  v_has_orig    BOOLEAN;
  v_row         JSONB;
  v_new_id      UUID;
  v_first_id    UUID := NULL;
  v_ids         UUID[] := ARRAY[]::UUID[];
  v_seq         INTEGER := 0;
  v_role        TEXT;
  v_amount      NUMERIC(12,2);
  v_sum         NUMERIC(12,2) := 0;
  v_prop        UUID;
  v_allow_prop  BOOLEAN;
  v_allow_party BOOLEAN;
BEGIN
  -- Governed: only CEO / finance admin may apply.
  v_actor := public.require_jj_staff(ARRAY['ceo','finance_admin']);

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) = 0 THEN
    RAISE EXCEPTION '[input] p_rows must be a non-empty JSON array of correcting rows.';
  END IF;

  -- (A1-A4) Case must exist, be EXACTLY 'approved', locked FOR UPDATE.
  SELECT * INTO v_case FROM statements.correction_cases WHERE id = p_case_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION '[not_found] Correction case % does not exist.', p_case_id;
  END IF;
  IF v_case.status <> 'approved' THEN
    RAISE EXCEPTION '[denied] Case % is in status "%": only an APPROVED case may be applied '
                    '(open/under_review/rejected/applied/void are refused).', p_case_id, v_case.status;
  END IF;

  -- (A5-A6) Canonical original comes from the CASE, never the caller.
  v_has_orig := v_case.original_transaction_id IS NOT NULL;
  IF v_has_orig THEN
    SELECT * INTO v_orig FROM public.transactions WHERE id = v_case.original_transaction_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION '[not_found] Original transaction % (from case) does not exist.', v_case.original_transaction_id;
    END IF;
  ELSIF v_case.correction_type <> 'missing_charge' THEN
    RAISE EXCEPTION '[integrity] Case % has no original_transaction_id but type is % (only missing_charge may omit it).',
      p_case_id, v_case.correction_type;
  END IF;

  -- Does the APPROVED case explicitly authorise property / party reassignment?
  v_allow_prop  := (v_case.corrected_field_values ? 'property_id') OR (v_case.corrected_field_values ? 'property_name');
  v_allow_party := (v_case.corrected_field_values ? 'payer') OR (v_case.corrected_field_values ? 'payee');

  -- (C) Validate + insert each row; build lineage.
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    v_seq  := v_seq + 1;
    v_role := v_row->>'role';

    IF v_role IS NULL OR v_role NOT IN ('reversal','replacement','rebook','append') THEN
      RAISE EXCEPTION '[input] row %: invalid role "%".', v_seq, v_role;
    END IF;

    -- append is only for a case without an original (missing_charge).
    IF v_role = 'append' AND v_has_orig THEN
      RAISE EXCEPTION '[integrity] row %: append role not permitted when the case has an original transaction.', v_seq;
    END IF;
    IF v_role <> 'append' AND NOT v_has_orig THEN
      RAISE EXCEPTION '[integrity] row %: role % requires an original transaction on the case.', v_seq, v_role;
    END IF;

    IF v_row->>'date' IS NULL OR trim(v_row->>'date') = '' THEN
      RAISE EXCEPTION '[input] row %: date is required.', v_seq;
    END IF;
    IF v_row->>'category' IS NULL OR trim(v_row->>'category') = '' THEN
      RAISE EXCEPTION '[input] row %: category is required.', v_seq;
    END IF;

    -- P-ARCH-1: amount must exist and parse. NEVER coalesce unknown to 0.
    IF v_row->>'amount_eur' IS NULL OR trim(v_row->>'amount_eur') = '' THEN
      RAISE EXCEPTION '[input] row %: amount_eur is required (Unknown != 0).', v_seq;
    END IF;
    BEGIN
      v_amount := (v_row->>'amount_eur')::NUMERIC(12,2);
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION '[input] row %: amount_eur "%" is not numeric.', v_seq, v_row->>'amount_eur';
    END;

    IF v_role <> 'append' THEN
      -- property_id must match original unless the case authorises a change.
      IF NOT v_allow_prop THEN
        v_prop := NULLIF(v_row->>'property_id','')::UUID;
        IF v_prop IS DISTINCT FROM v_orig.property_id THEN
          RAISE EXCEPTION '[integrity] row %: property_id % != original % and the case does not authorise property reassignment.',
            v_seq, v_prop, v_orig.property_id;
        END IF;
      END IF;
      -- payer/payee must match original unless the case authorises a change.
      IF NOT v_allow_party THEN
        IF (v_row->>'payer') IS DISTINCT FROM v_orig.payer OR (v_row->>'payee') IS DISTINCT FROM v_orig.payee THEN
          RAISE EXCEPTION '[integrity] row %: payer/payee change is not authorised by the case.', v_seq;
        END IF;
      END IF;
      -- reversal must negate the original amount exactly.
      IF v_role = 'reversal' AND v_amount IS DISTINCT FROM (-1 * v_orig.amount_eur) THEN
        RAISE EXCEPTION '[integrity] row %: reversal amount % must equal negated original % .', v_seq, v_amount, (-1 * v_orig.amount_eur);
      END IF;
      -- rebook (reclassification) must preserve the original amount exactly.
      IF v_role = 'rebook' AND v_amount IS DISTINCT FROM v_orig.amount_eur THEN
        RAISE EXCEPTION '[integrity] row %: rebook amount % must preserve original amount % (reclassification is amount-neutral).',
          v_seq, v_amount, v_orig.amount_eur;
      END IF;
    END IF;

    -- duplicate_resolution must not create a positive replacement unless the case approves a corrected amount.
    IF v_case.correction_type = 'duplicate_resolution'
       AND v_role IN ('replacement','rebook')
       AND v_case.corrected_amount_eur IS NULL THEN
      RAISE EXCEPTION '[integrity] row %: duplicate_resolution may not create a replacement/rebook unless the case sets a corrected amount.', v_seq;
    END IF;

    v_sum := v_sum + v_amount;

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
      v_amount,
      NULLIF(v_row->>'client_charge','')::NUMERIC(12,2),
      v_row->>'notes',
      v_row->>'k_note'
    )
    RETURNING id INTO v_new_id;

    v_ids := array_append(v_ids, v_new_id);
    IF v_first_id IS NULL THEN v_first_id := v_new_id; END IF;

    -- (B) complete lineage: one row per correcting transaction.
    INSERT INTO statements.correction_applied_transactions (
      case_id, original_transaction_id, applied_transaction_id, entry_role, sequence_no, created_by
    ) VALUES (
      p_case_id, v_case.original_transaction_id, v_new_id, v_role, v_seq, v_actor
    );
  END LOOP;

  -- Per-type net invariants (amount-neutral corrections must net to 0 across rows).
  IF v_case.correction_type IN ('reclassification','description_fix','date_correction') THEN
    IF v_sum IS DISTINCT FROM 0 THEN
      RAISE EXCEPTION '[integrity] % must be amount-neutral across correcting rows (net=%).', v_case.correction_type, v_sum;
    END IF;
  END IF;
  -- amount_correction / void-and-replace: original + rows must net to the approved corrected amount.
  IF v_case.correction_type = 'amount_correction' AND v_case.corrected_amount_eur IS NOT NULL AND v_has_orig THEN
    IF (v_orig.amount_eur + v_sum) IS DISTINCT FROM v_case.corrected_amount_eur THEN
      RAISE EXCEPTION '[integrity] amount_correction net (% + % = %) != approved corrected amount %.',
        v_orig.amount_eur, v_sum, (v_orig.amount_eur + v_sum), v_case.corrected_amount_eur;
    END IF;
  END IF;

  -- Transition the case to applied (atomic with the inserts + lineage).
  -- correction_cases.applied_transaction_id keeps the PRIMARY (first) id for
  -- backward compatibility; the complete audit source is the lineage table.
  UPDATE statements.correction_cases
     SET status                 = 'applied',
         applied_transaction_id = v_first_id,
         applied_at             = now(),
         resolved_by            = v_actor,
         resolved_at            = now(),
         updated_at             = now()
   WHERE id = p_case_id;

  INSERT INTO statements.correction_events (case_id, event_type, performed_by, notes)
  VALUES (p_case_id, 'applied', v_actor,
          format('[apply_correction_case] inserted %s correcting transaction(s); primary=%s', v_seq, v_first_id));

  RETURN jsonb_build_object(
    'primary_transaction_id', v_first_id,
    'applied_transaction_ids', to_jsonb(v_ids),
    'inserted_count', v_seq
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION statements.apply_correction_case(uuid, jsonb) TO service_role;

-- ---------------------------------------------------------------------
-- Read RPC for the lineage (staff-gated).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION statements.get_correction_applied_transactions(p_case_id uuid)
 RETURNS TABLE (
   id uuid, case_id uuid, original_transaction_id uuid, applied_transaction_id uuid,
   entry_role text, sequence_no integer, created_by uuid, created_at timestamptz)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  PERFORM public.require_jj_staff();
  RETURN QUERY
    SELECT c.id, c.case_id, c.original_transaction_id, c.applied_transaction_id,
           c.entry_role, c.sequence_no, c.created_by, c.created_at
      FROM statements.correction_applied_transactions c
     WHERE c.case_id = p_case_id
     ORDER BY c.sequence_no;
END;
$function$;

GRANT EXECUTE ON FUNCTION statements.get_correction_applied_transactions(uuid) TO service_role;

-- Deprecate the in-place corrector (non-destructive: keep the function, mark it).
COMMENT ON FUNCTION public.apply_transaction_correction(uuid, text, text, text, text, text) IS
  'DEPRECATED (Gate certification): superseded by statements.apply_correction_case (INSERT-only append model). '
  'The append-only guard on public.transactions (20260820_003) also blocks its in-place UPDATEs at runtime. '
  'Do not call from application code; retained for historical/audit reference only.';
