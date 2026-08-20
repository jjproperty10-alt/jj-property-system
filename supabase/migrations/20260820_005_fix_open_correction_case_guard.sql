-- =====================================================================
-- F6 - Fix the dangling staff guard on open_correction_case
--
-- Gate certification precheck (Phase A) found that the DEPLOYED
-- statements.open_correction_case calls `statements.require_jj_staff()`
-- (no-arg, statements schema), but that function DOES NOT EXIST anywhere
-- in the database - the only staff guard is public.require_jj_staff(text[]).
-- The call is a dangling reference that raises
--   `function statements.require_jj_staff() does not exist`
-- at runtime, so opening a correction case via the RPC is currently broken.
-- (transition_correction_case had the identical defect; migration 004 fixes
-- that one. This migration fixes open_correction_case the same way.)
--
-- This is a deliberate, forward-only CREATE OR REPLACE. The body is the
-- deployed body verbatim EXCEPT the guard line, which now calls the guard
-- that actually exists, with the same roles as apply_correction_case /
-- transition_correction_case (ceo, finance_admin) so the whole correction
-- subsystem is gated identically.
--
-- IMPLEMENT-ONLY: review before applying. Apply order: 001 -> 002 -> 003 -> 004 -> 005.
-- =====================================================================

CREATE OR REPLACE FUNCTION statements.open_correction_case(
  p_series_id uuid, p_original_tx_id uuid, p_correction_type text, p_description text,
  p_original_amount numeric DEFAULT NULL::numeric, p_corrected_amount numeric DEFAULT NULL::numeric,
  p_priority text DEFAULT 'normal'::text, p_original_fields jsonb DEFAULT NULL::jsonb,
  p_corrected_fields jsonb DEFAULT NULL::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_case_id UUID;
BEGIN
  -- Fixed staff gate (was the dangling statements.require_jj_staff()).
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
