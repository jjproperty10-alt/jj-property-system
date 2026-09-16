-- Pack 2 harness extension: the statements correction subsystem and registry.parties,
-- replicated from Production. Table shapes and constraints come from information_schema /
-- pg_constraint; the four function bodies are copied verbatim from pg_get_functiondef.
-- Load this AFTER harness.sql.

-- ---------------------------------------------------------------- registry.parties
CREATE SCHEMA registry;

CREATE TABLE registry.parties (
  party_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL,
  canonical_name text NOT NULL,
  party_type     text NOT NULL,
  contact_ref    uuid,
  status         text NOT NULL DEFAULT 'active',
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- statements schema
CREATE SCHEMA statements;

CREATE TABLE statements.statement_series (
  series_id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_party_id          uuid NOT NULL REFERENCES registry.parties(party_id) ON DELETE RESTRICT,
  owner_display_name      text NOT NULL,
  property_display_name   text NOT NULL,
  property_acquisition_id uuid,
  account_type            text,
  series_status           text NOT NULL DEFAULT 'active'
                            CHECK (series_status = ANY (ARRAY['active','cancelled'])),
  created_by              uuid REFERENCES auth.users(id),
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE statements.correction_cases (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id               uuid NOT NULL REFERENCES statements.statement_series(series_id),
  original_transaction_id uuid NOT NULL,
  correction_type         text NOT NULL CHECK (correction_type = ANY (ARRAY[
                            'amount_correction','reclassification','duplicate_resolution',
                            'missing_charge','disputed_charge','description_fix','date_correction'])),
  status                  text NOT NULL DEFAULT 'open' CHECK (status = ANY (ARRAY[
                            'open','under_review','approved','rejected','applied','void'])),
  description             text NOT NULL,
  original_amount_eur     numeric,
  corrected_amount_eur    numeric,
  priority                text NOT NULL DEFAULT 'normal'
                            CHECK (priority = ANY (ARRAY['low','normal','high','urgent'])),
  original_field_values   jsonb,
  corrected_field_values  jsonb,
  opened_by               uuid,
  opened_at               timestamptz NOT NULL DEFAULT now(),
  resolved_by             uuid,
  resolved_at             timestamptz,
  resolution_notes        text,
  applied_transaction_id  uuid,
  applied_at              timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE statements.correction_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id      uuid NOT NULL REFERENCES statements.correction_cases(id),
  event_type   text NOT NULL CHECK (event_type = ANY (ARRAY[
                 'opened','assigned','under_review','evidence_added','approved',
                 'rejected','applied','voided','comment'])),
  performed_by uuid,
  notes        text,
  metadata     jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE statements.correction_applied_transactions (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id                 uuid NOT NULL REFERENCES statements.correction_cases(id),
  original_transaction_id uuid,
  applied_transaction_id  uuid NOT NULL,
  entry_role              text NOT NULL CHECK (entry_role = ANY (ARRAY[
                            'reversal','replacement','rebook','append'])),
  sequence_no             integer NOT NULL,
  created_by              uuid,
  created_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_correction_applied_tx UNIQUE (case_id, applied_transaction_id)
);

ALTER TABLE statements.statement_series               ENABLE ROW LEVEL SECURITY;
ALTER TABLE statements.correction_cases               ENABLE ROW LEVEL SECURITY;
ALTER TABLE statements.correction_events              ENABLE ROW LEVEL SECURITY;
ALTER TABLE statements.correction_applied_transactions ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------- functions (verbatim)
CREATE OR REPLACE FUNCTION statements.trg_correction_events_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION 'correction_events is append-only (P-ARCH-4). UPDATE and DELETE are prohibited.';
END;
$function$;

CREATE TRIGGER trg_correction_events_no_update BEFORE UPDATE OR DELETE
  ON statements.correction_events
  FOR EACH ROW EXECUTE FUNCTION statements.trg_correction_events_immutable();

CREATE OR REPLACE FUNCTION statements.open_correction_case(p_series_id uuid, p_original_tx_id uuid, p_correction_type text, p_description text, p_original_amount numeric DEFAULT NULL::numeric, p_corrected_amount numeric DEFAULT NULL::numeric, p_priority text DEFAULT 'normal'::text, p_original_fields jsonb DEFAULT NULL::jsonb, p_corrected_fields jsonb DEFAULT NULL::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_case_id UUID;
BEGIN
  PERFORM public.require_jj_staff(ARRAY['ceo','finance_admin']);

  INSERT INTO statements.correction_cases (
    series_id, original_transaction_id, correction_type,
    status, description, original_amount_eur, corrected_amount_eur,
    priority, original_field_values, corrected_field_values,
    opened_by
  )
  VALUES (
    p_series_id, p_original_tx_id, p_correction_type,
    'open', p_description, p_original_amount, p_corrected_amount,
    p_priority, p_original_fields, p_corrected_fields,
    auth.uid()
  )
  RETURNING id INTO v_case_id;

  INSERT INTO statements.correction_events (case_id, event_type, performed_by, notes)
  VALUES (v_case_id, 'opened', auth.uid(), p_description);

  RETURN v_case_id;
END;
$function$;

CREATE OR REPLACE FUNCTION statements.transition_correction_case(p_case_id uuid, p_new_status text, p_notes text DEFAULT NULL::text, p_applied_tx_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_current_status TEXT;
  v_event_type TEXT;
BEGIN
  PERFORM public.require_jj_staff(ARRAY['ceo','finance_admin']);

  IF p_new_status = 'applied' THEN
    RAISE EXCEPTION '[denied] Cannot transition a correction case to "applied" via transition_correction_case. '
                    'A case becomes applied ONLY through statements.apply_correction_case, which inserts the '
                    'correcting transaction(s) and the complete lineage.';
  END IF;
  IF p_applied_tx_id IS NOT NULL THEN
    RAISE EXCEPTION '[denied] applied_transaction_id may only be set by statements.apply_correction_case.';
  END IF;
  IF p_new_status NOT IN ('under_review','approved','rejected','void') THEN
    RAISE EXCEPTION '[input] Invalid transition target "%". Allowed: under_review, approved, rejected, void '
                    '(applied is reached only via apply_correction_case).', p_new_status;
  END IF;

  SELECT status INTO v_current_status
    FROM statements.correction_cases WHERE id = p_case_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Correction case not found: %', p_case_id;
  END IF;
  IF v_current_status IN ('applied', 'void') THEN
    RAISE EXCEPTION 'Cannot transition from terminal status: %', v_current_status;
  END IF;

  v_event_type := p_new_status;
  IF p_new_status = 'void' THEN v_event_type := 'voided'; END IF;

  UPDATE statements.correction_cases
     SET status = p_new_status,
         resolved_by = CASE WHEN p_new_status IN ('approved','rejected','void') THEN auth.uid() ELSE resolved_by END,
         resolved_at = CASE WHEN p_new_status IN ('approved','rejected','void') THEN now() ELSE resolved_at END,
         resolution_notes = COALESCE(p_notes, resolution_notes),
         updated_at = now()
   WHERE id = p_case_id;

  INSERT INTO statements.correction_events (case_id, event_type, performed_by, notes)
  VALUES (p_case_id, v_event_type, auth.uid(), p_notes);
END;
$function$;

CREATE OR REPLACE FUNCTION statements.apply_correction_case(p_case_id uuid, p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor       UUID;
  v_case        statements.correction_cases%ROWTYPE;
  v_orig        public.transactions%ROWTYPE;
  v_orig_json   JSONB;
  v_has_orig    BOOLEAN;
  v_row         JSONB;
  v_new_id      UUID;
  v_first_id    UUID := NULL;
  v_ids         UUID[] := ARRAY[]::UUID[];
  v_seq         INTEGER := 0;
  v_role        TEXT;
  v_amount      NUMERIC(12,2);
  v_sum         NUMERIC(12,2) := 0;
  v_field       TEXT;
  v_is_forward  BOOLEAN;
  v_authorised  BOOLEAN;
  v_submitted   TEXT;
  v_expected    TEXT;
  v_src_label   TEXT;
BEGIN
  v_actor := public.require_jj_staff(ARRAY['ceo','finance_admin']);

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) = 0 THEN
    RAISE EXCEPTION '[input] p_rows must be a non-empty JSON array of correcting rows.';
  END IF;

  SELECT * INTO v_case FROM statements.correction_cases WHERE id = p_case_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION '[not_found] Correction case % does not exist.', p_case_id;
  END IF;
  IF v_case.status <> 'approved' THEN
    RAISE EXCEPTION '[denied] Case % is in status "%": only an APPROVED case may be applied '
                    '(open/under_review/rejected/applied/void are refused).', p_case_id, v_case.status;
  END IF;

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

  IF v_has_orig THEN
    v_orig_json := to_jsonb(v_orig);
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    v_seq  := v_seq + 1;
    v_role := v_row->>'role';

    IF v_role IS NULL OR v_role NOT IN ('reversal','replacement','rebook','append') THEN
      RAISE EXCEPTION '[input] row %: invalid role "%".', v_seq, v_role;
    END IF;

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

    IF v_row->>'amount_eur' IS NULL OR trim(v_row->>'amount_eur') = '' THEN
      RAISE EXCEPTION '[input] row %: amount_eur is required (Unknown != 0).', v_seq;
    END IF;
    BEGIN
      v_amount := (v_row->>'amount_eur')::NUMERIC(12,2);
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION '[input] row %: amount_eur "%" is not numeric.', v_seq, v_row->>'amount_eur';
    END;

    IF v_role <> 'append' THEN
      FOREACH v_field IN ARRAY ARRAY['property_id','property_name','category','subcategory','description','payer','payee','date'] LOOP
        v_is_forward := (v_role IN ('replacement','rebook'));
        v_authorised := (v_case.corrected_field_values ? v_field);
        v_submitted  := v_row->>v_field;
        IF v_is_forward AND v_authorised THEN
          v_expected := v_case.corrected_field_values->>v_field;
          v_src_label := 'approved corrected value';
        ELSE
          v_expected := v_orig_json->>v_field;
          v_src_label := 'original value';
        END IF;
        IF v_field = 'property_id' THEN
          v_submitted := NULLIF(v_submitted, '');
          v_expected  := NULLIF(v_expected, '');
        END IF;
        IF v_submitted IS DISTINCT FROM v_expected THEN
          RAISE EXCEPTION '[integrity] row %: field "%" submitted "%" does not match the % "%" for this approved case.',
            v_seq, v_field, v_submitted, v_src_label, v_expected;
        END IF;
      END LOOP;

      IF v_role = 'reversal' AND v_amount IS DISTINCT FROM (-1 * v_orig.amount_eur) THEN
        RAISE EXCEPTION '[integrity] row %: reversal amount % must equal negated original % .', v_seq, v_amount, (-1 * v_orig.amount_eur);
      END IF;
      IF v_role = 'rebook' AND v_amount IS DISTINCT FROM v_orig.amount_eur THEN
        RAISE EXCEPTION '[integrity] row %: rebook amount % must preserve original amount % (reclassification is amount-neutral).',
          v_seq, v_amount, v_orig.amount_eur;
      END IF;
    END IF;

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

    INSERT INTO statements.correction_applied_transactions (
      case_id, original_transaction_id, applied_transaction_id, entry_role, sequence_no, created_by
    ) VALUES (
      p_case_id, v_case.original_transaction_id, v_new_id, v_role, v_seq, v_actor
    );
  END LOOP;

  IF v_case.correction_type IN ('reclassification','description_fix','date_correction') THEN
    IF v_sum IS DISTINCT FROM 0 THEN
      RAISE EXCEPTION '[integrity] % must be amount-neutral across correcting rows (net=%).', v_case.correction_type, v_sum;
    END IF;
  END IF;
  IF v_case.correction_type = 'amount_correction' AND v_case.corrected_amount_eur IS NOT NULL AND v_has_orig THEN
    IF (v_orig.amount_eur + v_sum) IS DISTINCT FROM v_case.corrected_amount_eur THEN
      RAISE EXCEPTION '[integrity] amount_correction net (% + % = %) != approved corrected amount %.',
        v_orig.amount_eur, v_sum, (v_orig.amount_eur + v_sum), v_case.corrected_amount_eur;
    END IF;
  END IF;

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

-- ---------------------------------------------------------------- ownership / grants
ALTER SCHEMA registry   OWNER TO dbowner;
ALTER SCHEMA statements OWNER TO dbowner;
ALTER TABLE registry.parties                           OWNER TO dbowner;
ALTER TABLE statements.statement_series                OWNER TO dbowner;
ALTER TABLE statements.correction_cases                OWNER TO dbowner;
ALTER TABLE statements.correction_events               OWNER TO dbowner;
ALTER TABLE statements.correction_applied_transactions OWNER TO dbowner;
ALTER FUNCTION statements.trg_correction_events_immutable()   OWNER TO dbowner;
ALTER FUNCTION statements.open_correction_case(uuid, uuid, text, text, numeric, numeric, text, jsonb, jsonb) OWNER TO dbowner;
ALTER FUNCTION statements.transition_correction_case(uuid, text, text, uuid) OWNER TO dbowner;
ALTER FUNCTION statements.apply_correction_case(uuid, jsonb) OWNER TO dbowner;

GRANT USAGE ON SCHEMA registry, statements TO authenticated, service_role;
GRANT SELECT ON registry.parties TO authenticated, service_role;
GRANT SELECT ON statements.statement_series, statements.correction_cases,
                statements.correction_events, statements.correction_applied_transactions
  TO authenticated;
GRANT INSERT, SELECT ON statements.statement_series, statements.correction_cases TO service_role;
