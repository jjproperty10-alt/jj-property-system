-- =====================================================================
-- VERIFICATION baseline - deployed corrections + statements objects
-- Gate certification, F0. This migration DOES NOT redefine or overwrite
-- any deployed function body. It only ASSERTS that the expected deployed
-- objects (functions with expected signatures, tables, triggers) exist,
-- and FAILS LOUDLY if any is missing.
--
-- Rationale: the previous draft used CREATE OR REPLACE FUNCTION while
-- claiming to be a "no-op", which is a contradiction - CREATE OR REPLACE
-- can silently change a live body if the captured text drifted from
-- production. This version is purely read/assert, so applying it is
-- genuinely safe: it changes nothing and only proves the deployed surface
-- this package depends on is present. The live catalog remains the source
-- of truth for the actual bodies.
--
-- If any assertion fails, STOP and reconcile the environment before
-- applying 002/003.
-- =====================================================================

DO $verify$
DECLARE
  v_missing text[] := ARRAY[]::text[];
  v_check   record;
  -- (schema, name, identity_args) tuples that MUST exist.
  v_expected CONSTANT text[][] := ARRAY[
    ['public','require_jj_staff','p_allowed_roles text[]'],
    ['public','apply_transaction_correction','p_transaction_id uuid, p_field_name text, p_expected_old_value text, p_new_value text, p_correction_reason text, p_evidence_ref text'],
    ['public','update_updated_at',''],
    ['statements','open_correction_case','p_series_id uuid, p_original_tx_id uuid, p_correction_type text, p_description text, p_original_amount numeric, p_corrected_amount numeric, p_priority text, p_original_fields jsonb, p_corrected_fields jsonb'],
    ['statements','transition_correction_case','p_case_id uuid, p_new_status text, p_notes text, p_applied_tx_id uuid'],
    ['statements','create_statement_draft','p_series_id uuid'],
    ['statements','add_draft_line','p_draft_id uuid, p_source_transaction_id uuid, p_release_amount_eur numeric, p_include boolean, p_line_notes text'],
    ['statements','remove_draft_line','p_draft_id uuid, p_source_transaction_id uuid'],
    ['statements','set_draft_status','p_draft_id uuid, p_new_status text'],
    ['statements','cancel_statement_draft','p_draft_id uuid, p_reason text'],
    ['statements','compute_remaining_releasable','p_transaction_id uuid, p_exclude_draft_id uuid'],
    ['statements','send_statement','p_draft_id uuid, p_period_start date, p_period_end date, p_statement_type text, p_expected_closing_balance_eur numeric, p_entries jsonb, p_language text, p_balance_direction text, p_ownership_percentage numeric, p_checklist_result jsonb, p_delivery_channels jsonb, p_rendered_package_json jsonb, p_description_he text, p_description_en text'],
    ['statements','replace_sent_statement',NULL]  -- signature intentionally not pinned (long); existence-only
  ];
  i int;
  v_schema text; v_name text; v_args text;
  v_found int;
BEGIN
  FOR i IN 1 .. array_length(v_expected,1) LOOP
    v_schema := v_expected[i][1];
    v_name   := v_expected[i][2];
    v_args   := v_expected[i][3];  -- NULL => existence-only check

    IF v_args IS NULL THEN
      SELECT count(*) INTO v_found
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = v_schema AND p.proname = v_name;
      IF v_found = 0 THEN
        v_missing := array_append(v_missing, format('%s.%s (any signature)', v_schema, v_name));
      END IF;
    ELSE
      SELECT count(*) INTO v_found
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = v_schema AND p.proname = v_name
         AND pg_get_function_identity_arguments(p.oid) = v_args;
      IF v_found = 0 THEN
        v_missing := array_append(v_missing, format('%s.%s(%s)', v_schema, v_name, v_args));
      END IF;
    END IF;
  END LOOP;

  -- Required tables.
  FOR v_check IN
    SELECT * FROM (VALUES
      ('statements','correction_cases'),
      ('statements','correction_events'),
      ('statements','statement_series'),
      ('statements','statement_drafts'),
      ('statements','statement_draft_lines'),
      ('statements','sent_statement_snapshots'),
      ('statements','sent_entry_snapshots'),
      ('statements','statement_events'),
      ('public','transactions'),
      ('public','jj_staff_config')
    ) AS t(sch, tbl)
  LOOP
    IF to_regclass(format('%I.%I', v_check.sch, v_check.tbl)) IS NULL THEN
      v_missing := array_append(v_missing, format('table %s.%s', v_check.sch, v_check.tbl));
    END IF;
  END LOOP;

  -- Required triggers on public.transactions.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' AND c.relname='transactions' AND t.tgname='trg_transactions_updated_at'
  ) THEN
    v_missing := array_append(v_missing, 'trigger public.transactions.trg_transactions_updated_at');
  END IF;

  IF array_length(v_missing,1) IS NOT NULL THEN
    RAISE EXCEPTION 'F0 baseline verification FAILED. Missing deployed objects: %', array_to_string(v_missing, '; ');
  END IF;

  RAISE NOTICE 'F0 baseline verification OK: all expected deployed corrections/statements objects present.';
END
$verify$;
