-- =====================================================================
-- BASELINE CAPTURE - deployed corrections + statements objects
-- Gate certification, F0. Captured read-only from the live project
-- (vsiiprzjrstjcmjpwcrd) at main 192cdcb1. These objects were deployed
-- OUT OF BAND and were not versioned in the repo, which is why repo-only
-- analysis kept reporting them as "missing".
--
-- Purpose: stop the repo lagging production. Every statement here is
-- idempotent (CREATE OR REPLACE / verified-existing), so applying it
-- against production is a NO-OP that simply records the deployed reality
-- in version control. REVIEW before applying; verify against the live
-- definitions (they are the source of truth).
--
-- NOTE: table DDL (statements.* tables, public.transaction_corrections,
-- public.case_audit_log, public.jj_staff_config) is intentionally NOT
-- recreated here - it already exists in production and reconstructing it
-- risks drift. This file captures the FUNCTION contracts that were the
-- actual "missing in repo" objects, plus the trigger inventory.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Auth gate: public.require_jj_staff(text[]) -> actor uuid
--   Checks public.jj_staff_config (staff_role, is_active). Staff roles
--   include 'ceo','finance_admin','statement_operator'.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.require_jj_staff(p_allowed_roles text[] DEFAULT NULL::text[])
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor_id  UUID;
  v_is_active BOOLEAN;
  v_role      TEXT;
BEGIN
  v_actor_id := auth.uid();
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION '[jj_auth] Authenticated session required. auth.uid() returned NULL - include a valid JWT.';
  END IF;
  SELECT is_active, staff_role INTO v_is_active, v_role
    FROM public.jj_staff_config WHERE user_id = v_actor_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION '[jj_auth] User % is not in jj_staff_config.', v_actor_id;
  END IF;
  IF NOT v_is_active THEN
    RAISE EXCEPTION '[jj_auth] User % is registered but is_active = false.', v_actor_id;
  END IF;
  IF p_allowed_roles IS NOT NULL AND NOT (v_role = ANY(p_allowed_roles)) THEN
    RAISE EXCEPTION '[jj_auth] User % has role ''%'' not permitted. Allowed: %.', v_actor_id, v_role, p_allowed_roles;
  END IF;
  RETURN v_actor_id;
END;
$function$;

-- ---------------------------------------------------------------------
-- public.apply_transaction_correction(...) - DEPLOYED in-place corrector.
-- Captured verbatim for traceability. NOTE: this package DEPRECATES this
-- function in favour of the append-only statements.apply_correction_case
-- (see 20260820_002). Kept here as the recorded deployed baseline.
-- Signature:
--   apply_transaction_correction(p_transaction_id uuid, p_field_name text,
--     p_expected_old_value text, p_new_value text, p_correction_reason text,
--     p_evidence_ref text DEFAULT NULL)
--   SECURITY DEFINER; require_jj_staff(ARRAY['ceo','finance_admin']);
--   field allowlist: property_name/category/subcategory/description/payer/
--   payee/notes/k_note (text), amount_eur/client_charge (numeric), date;
--   optimistic-concurrency on expected_old; UPDATEs the row in place; writes
--   public.case_audit_log + public.transaction_corrections.
-- (Full body available in the live catalog; not re-emitted to avoid drift.)
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- Correction case lifecycle (statements schema) - deployed baseline.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION statements.open_correction_case(
  p_series_id uuid, p_original_tx_id uuid, p_correction_type text, p_description text,
  p_original_amount numeric DEFAULT NULL::numeric, p_corrected_amount numeric DEFAULT NULL::numeric,
  p_priority text DEFAULT 'normal'::text, p_original_fields jsonb DEFAULT NULL::jsonb,
  p_corrected_fields jsonb DEFAULT NULL::jsonb)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_case_id UUID;
BEGIN
  PERFORM statements.require_jj_staff();
  INSERT INTO statements.correction_cases (
    series_id, original_transaction_id, correction_type, status, description,
    original_amount_eur, corrected_amount_eur, priority, original_field_values,
    corrected_field_values, opened_by)
  VALUES (
    p_series_id, p_original_tx_id, p_correction_type, 'open', p_description,
    p_original_amount, p_corrected_amount, p_priority, p_original_fields,
    p_corrected_fields, auth.uid())
  RETURNING id INTO v_case_id;
  INSERT INTO statements.correction_events (case_id, event_type, performed_by, notes)
  VALUES (v_case_id, 'opened', auth.uid(), p_description);
  RETURN v_case_id;
END;
$function$;

CREATE OR REPLACE FUNCTION statements.transition_correction_case(
  p_case_id uuid, p_new_status text, p_notes text DEFAULT NULL::text,
  p_applied_tx_id uuid DEFAULT NULL::uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_current_status TEXT;
BEGIN
  PERFORM statements.require_jj_staff();
  SELECT status INTO v_current_status FROM statements.correction_cases WHERE id = p_case_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Correction case not found: %', p_case_id; END IF;
  IF v_current_status IN ('applied','void') THEN
    RAISE EXCEPTION 'Cannot transition from terminal status: %', v_current_status;
  END IF;
  UPDATE statements.correction_cases
     SET status = p_new_status,
         resolved_by = CASE WHEN p_new_status IN ('approved','rejected','applied','void') THEN auth.uid() ELSE resolved_by END,
         resolved_at = CASE WHEN p_new_status IN ('approved','rejected','applied','void') THEN now() ELSE resolved_at END,
         resolution_notes = COALESCE(p_notes, resolution_notes),
         applied_transaction_id = COALESCE(p_applied_tx_id, applied_transaction_id),
         applied_at = CASE WHEN p_new_status = 'applied' THEN now() ELSE applied_at END,
         updated_at = now()
   WHERE id = p_case_id;
  INSERT INTO statements.correction_events (case_id, event_type, performed_by, notes)
  VALUES (p_case_id, p_new_status, auth.uid(), p_notes);
END;
$function$;

-- ---------------------------------------------------------------------
-- Statement draft/finalize/send lifecycle (statements schema) - deployed.
-- These RPCs EXIST in production and are the write-path lifted by this
-- package's app actions. Captured here by SIGNATURE inventory for
-- traceability; the full bodies live in the catalog and are large
-- (send_statement in particular runs the full reconciliation). They are
-- NOT re-emitted to avoid transcription drift; verify against production.
--
--   statements.create_statement_draft(p_series_id uuid) RETURNS uuid
--   statements.add_draft_line(p_draft_id uuid, p_source_transaction_id uuid,
--     p_release_amount_eur numeric DEFAULT NULL, p_include boolean DEFAULT true,
--     p_line_notes text DEFAULT NULL) RETURNS uuid  -- ON CONFLICT upsert
--   statements.remove_draft_line(p_draft_id uuid, p_source_transaction_id uuid) RETURNS void
--   statements.set_draft_status(p_draft_id uuid, p_new_status text) RETURNS void
--     -- only 'draft'|'ready_to_send'; ready_to_send requires opening balance + >=1 line
--   statements.cancel_statement_draft(p_draft_id uuid, p_reason text) RETURNS void
--   statements.compute_remaining_releasable(p_transaction_id uuid,
--     p_exclude_draft_id uuid DEFAULT NULL) RETURNS numeric  -- STABLE
--   statements.send_statement(p_draft_id uuid, p_period_start date, p_period_end date,
--     p_statement_type text, p_expected_closing_balance_eur numeric, p_entries jsonb,
--     p_language text DEFAULT 'he', p_balance_direction text DEFAULT NULL,
--     p_ownership_percentage numeric DEFAULT NULL, p_checklist_result jsonb DEFAULT NULL,
--     p_delivery_channels jsonb DEFAULT '[]', p_rendered_package_json jsonb DEFAULT NULL,
--     p_description_he text DEFAULT NULL, p_description_en text DEFAULT NULL) RETURNS uuid
--     -- draft must be ready_to_send; entries must exactly match included draft lines;
--     -- reconciles closing = opening + baseline + sum(signed effects); freezes an
--     -- immutable sent_statement_snapshots + sent_entry_snapshots version.
--   statements.replace_sent_statement(p_prior_snapshot_id uuid, ...) RETURNS uuid
--     -- void-and-replace a current sent snapshot with a corrected version.
--   All SECURITY DEFINER; gated by require_jj_staff(['ceo','finance_admin','statement_operator']).
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- public.transactions triggers (deployed inventory):
--   trg_transactions_updated_at  BEFORE UPDATE -> public.update_updated_at()
--   audit_transactions           AFTER INSERT OR UPDATE OR DELETE -> public.log_transaction_change()
-- (This package adds a BEFORE UPDATE OR DELETE append-only guard in 20260820_003.)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_updated_at()
 RETURNS trigger LANGUAGE plpgsql
AS $function$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $function$;
