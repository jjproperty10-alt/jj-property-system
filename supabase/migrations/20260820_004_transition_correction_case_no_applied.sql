-- =====================================================================
-- F5 - Close the 'applied' bypass on transition_correction_case
-- Gate certification. INTENTIONAL, forward-only modification of the
-- deployed statements.transition_correction_case: it must NO LONGER be
-- able to move a correction case to 'applied' or to set
-- applied_transaction_id. A case may only become 'applied' through
-- statements.apply_correction_case (20260820_002), which inserts the
-- correcting transaction(s) AND the complete lineage. Otherwise a case
-- could be marked applied with no correcting transaction and no lineage -
-- exactly the protection this closure builds.
--
-- The body below is the deployed body with two added guards + a restricted
-- transition target set. All other behaviour (staff gate, terminal-state
-- refusal, event append) is preserved verbatim.
--
-- This is a deliberate function change (NOT a "capture"): CREATE OR REPLACE
-- is the intended mechanism here. IMPLEMENT-ONLY: review before applying.
-- Apply order: 001 -> 002 -> 003 -> 004.
-- =====================================================================

CREATE OR REPLACE FUNCTION statements.transition_correction_case(
  p_case_id uuid, p_new_status text, p_notes text DEFAULT NULL::text, p_applied_tx_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_current_status TEXT;
  v_event_type TEXT;
BEGIN
  -- Staff gate. The deployed body called statements.require_jj_staff() (no-arg,
  -- statements schema), but that function does NOT exist in the database - the
  -- only guard is public.require_jj_staff(text[]). The deployed call was a
  -- dangling reference that raised at runtime. Fixed here to the guard every
  -- other statements RPC uses, with the same roles as apply_correction_case
  -- (ceo, finance_admin) so the whole correction subsystem is gated identically.
  PERFORM public.require_jj_staff(ARRAY['ceo','finance_admin']);

  -- HARD BLOCK: 'applied' and applied_transaction_id are owned exclusively by
  -- statements.apply_correction_case. This RPC can never mark a case applied.
  IF p_new_status = 'applied' THEN
    RAISE EXCEPTION '[denied] Cannot transition a correction case to "applied" via transition_correction_case. '
                    'A case becomes applied ONLY through statements.apply_correction_case, which inserts the '
                    'correcting transaction(s) and the complete lineage.';
  END IF;
  IF p_applied_tx_id IS NOT NULL THEN
    RAISE EXCEPTION '[denied] applied_transaction_id may only be set by statements.apply_correction_case.';
  END IF;
  -- Restrict transitions to the legal non-applied targets.
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

  UPDATE statements.correction_cases
     SET status = p_new_status,
         resolved_by = CASE WHEN p_new_status IN ('approved','rejected','void') THEN auth.uid() ELSE resolved_by END,
         resolved_at = CASE WHEN p_new_status IN ('approved','rejected','void') THEN now() ELSE resolved_at END,
         resolution_notes = COALESCE(p_notes, resolution_notes),
         -- applied_transaction_id / applied_at are intentionally NOT touched here.
         updated_at = now()
   WHERE id = p_case_id;

  INSERT INTO statements.correction_events (case_id, event_type, performed_by, notes)
  VALUES (p_case_id, v_event_type, auth.uid(), p_notes);
END;
$function$;
