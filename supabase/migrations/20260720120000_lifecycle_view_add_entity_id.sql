-- ============================================================
-- Supabase Migration
-- File:    20260720120000_lifecycle_view_add_entity_id.sql
-- Repo:    supabase/migrations/20260720120000_lifecycle_view_add_entity_id.sql
-- Purpose: Expose pe.entity_id (stable UUID) as column 15 in
--          lifecycle.v_partner_investment_statement.
--          Enables partnerStatementService.ts to filter by UUID identity.
--          All existing 14 columns and financial formulas preserved verbatim.
-- Safety:  Environment-neutral -- no hardcoded row counts or UUIDs.
--          Pre-migration state captured in temp table; post-verification
--          compares row-by-row against captured baseline.
--          CREATE OR REPLACE VIEW -- preserves owner and grants.
--          security_invoker=true explicitly re-declared.
-- Tested:  QA first. Production only after QA gates pass and PR merges.
-- Rollback: See c2_rollback.sql (executable, tested separately in QA).
-- ============================================================

-- ============================================================
-- STEP 1: PRECONDITIONS
-- ============================================================
DO $$
DECLARE
  v_col_count     INT;
  v_has_entity_id BOOLEAN;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.views
    WHERE table_schema = 'lifecycle'
      AND table_name   = 'v_partner_investment_statement'
  ) THEN
    RAISE EXCEPTION 'PRECONDITION FAIL: lifecycle.v_partner_investment_statement does not exist';
  END IF;

  SELECT COUNT(*) INTO v_col_count
  FROM information_schema.columns
  WHERE table_schema = 'lifecycle'
    AND table_name   = 'v_partner_investment_statement';

  IF v_col_count <> 14 THEN
    RAISE EXCEPTION 'PRECONDITION FAIL: expected 14 columns, found %. Migration already partially applied?', v_col_count;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'lifecycle'
      AND table_name   = 'v_partner_investment_statement'
      AND column_name  = 'entity_id'
  ) INTO v_has_entity_id;

  IF v_has_entity_id THEN
    RAISE EXCEPTION 'PRECONDITION FAIL: entity_id already present -- migration already applied?';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'lifecycle'
      AND c.relname = 'v_partner_investment_statement'
      AND c.relkind = 'v'
      AND ARRAY['security_invoker=true']::text[] <@ c.reloptions
  ) THEN
    RAISE WARNING 'security_invoker=true not detected in reloptions -- will be explicitly set by migration';
  END IF;

  RAISE NOTICE 'STEP 1 PASS -- 14 columns, entity_id absent, view exists';
END $$;

-- ============================================================
-- STEP 2: CAPTURE PRE-MIGRATION BASELINE (environment-neutral)
-- Captures current state of all 14 existing columns row-by-row.
-- Post-verification will compare against this -- no hardcoded values.
-- ============================================================
CREATE TEMP TABLE IF NOT EXISTS _view_baseline_before AS
  SELECT
    property_name,
    partner_name,
    inception_model,
    entry_date,
    entry_date_note,
    ownership_pct,
    agreed_entry_valuation_eur,
    required_entry_capital_eur,
    capital_paid_eur,
    capital_remaining_eur,
    total_distributions_eur,
    current_ownership_from,
    entry_status,
    entry_recorded_at
  FROM lifecycle.v_partner_investment_statement;

-- ============================================================
-- STEP 3: MIGRATION -- append entity_id as column 15
-- All 14 existing columns and subqueries reproduced verbatim
-- from pg_get_viewdef(Production, 2026-07-20).
-- ============================================================
CREATE OR REPLACE VIEW lifecycle.v_partner_investment_statement
  WITH (security_invoker = true)
AS
 SELECT pe.property_name,
    ei.canonical_name AS partner_name,
    pe.inception_model,
    pe.entry_date,
    pe.entry_date_note,
    pe.ownership_pct,
    pe.agreed_entry_valuation_eur,
    pe.required_entry_capital_eur,
    ( SELECT sum(ce.amount_eur) AS sum
           FROM lifecycle.capital_event ce
          WHERE ce.entity_id = pe.entity_id
            AND ce.property_name = pe.property_name
            AND ce.event_subtype = 'partner_entry_payment'::text
            AND ce.status <> 'void'::text
            AND ce.direction = 'inflow'::text) AS capital_paid_eur,
        CASE
            WHEN (( SELECT sum(ce.amount_eur) AS sum
               FROM lifecycle.capital_event ce
              WHERE ce.entity_id = pe.entity_id
                AND ce.property_name = pe.property_name
                AND ce.event_subtype = 'partner_entry_payment'::text
                AND ce.status <> 'void'::text
                AND ce.direction = 'inflow'::text)) IS NULL THEN NULL::numeric
            ELSE GREATEST(0::numeric, pe.required_entry_capital_eur - (( SELECT COALESCE(sum(ce.amount_eur), 0::numeric) AS "coalesce"
               FROM lifecycle.capital_event ce
              WHERE ce.entity_id = pe.entity_id
                AND ce.property_name = pe.property_name
                AND ce.event_subtype = 'partner_entry_payment'::text
                AND ce.status <> 'void'::text
                AND ce.direction = 'inflow'::text)))
        END AS capital_remaining_eur,
    ( SELECT COALESCE(sum(ce.amount_eur), 0::numeric) AS "coalesce"
           FROM lifecycle.capital_event ce
          WHERE ce.entity_id = pe.entity_id
            AND ce.property_name = pe.property_name
            AND ce.event_subtype = 'distribution_payment'::text
            AND ce.status <> 'void'::text
            AND ce.direction = 'outflow'::text) AS total_distributions_eur,
    ( SELECT op.effective_from
           FROM lifecycle.ownership_period op
          WHERE op.entity_id = pe.entity_id
            AND op.property_name = pe.property_name
            AND op.status <> 'void'::text
            AND op.effective_to IS NULL
          ORDER BY op.effective_from DESC
         LIMIT 1) AS current_ownership_from,
        CASE
            WHEN (( SELECT sum(ce.amount_eur) AS sum
               FROM lifecycle.capital_event ce
              WHERE ce.entity_id = pe.entity_id
                AND ce.property_name = pe.property_name
                AND ce.event_subtype = 'partner_entry_payment'::text
                AND ce.status <> 'void'::text
                AND ce.direction = 'inflow'::text)) IS NULL THEN 'capital_unknown'::text
            WHEN GREATEST(0::numeric, pe.required_entry_capital_eur - COALESCE(( SELECT sum(ce.amount_eur) AS sum
               FROM lifecycle.capital_event ce
              WHERE ce.entity_id = pe.entity_id
                AND ce.property_name = pe.property_name
                AND ce.event_subtype = 'partner_entry_payment'::text
                AND ce.status <> 'void'::text
                AND ce.direction = 'inflow'::text), 0::numeric)) = 0::numeric THEN 'fully_paid'::text
            ELSE 'partially_paid'::text
        END AS entry_status,
    pe.created_at AS entry_recorded_at,
    pe.entity_id          -- col 15: stable UUID (NEW -- appended per PG requirement)
   FROM lifecycle.partner_entry pe
     JOIN lifecycle.entity_identity ei ON ei.id = pe.entity_id
  WHERE pe.status <> 'void'::text;

-- ============================================================
-- STEP 4: POST-VERIFICATION (environment-neutral)
-- Compares all 14 pre-existing columns row-by-row against baseline.
-- Does NOT hardcode row counts, UUIDs, or financial values.
-- ============================================================
DO $$
DECLARE
  v_rows_before   INT;
  v_rows_after    INT;
  v_changed_rows  INT;
  v_null_uuid     INT;
  v_entity_type   TEXT;
  v_entity_pos    INT;
  v_auth_grant    BOOLEAN;
  v_svc_grant     BOOLEAN;
BEGIN
  -- 1. Column count = 15
  IF (SELECT COUNT(*) FROM information_schema.columns
      WHERE table_schema = 'lifecycle'
        AND table_name   = 'v_partner_investment_statement') <> 15 THEN
    RAISE EXCEPTION 'POST-VERIFY FAIL: expected 15 columns';
  END IF;

  -- 2. entity_id is uuid at position 15
  SELECT data_type, ordinal_position
  INTO v_entity_type, v_entity_pos
  FROM information_schema.columns
  WHERE table_schema = 'lifecycle'
    AND table_name   = 'v_partner_investment_statement'
    AND column_name  = 'entity_id';

  IF v_entity_type <> 'uuid' THEN
    RAISE EXCEPTION 'POST-VERIFY FAIL: entity_id type is %, expected uuid', v_entity_type;
  END IF;
  IF v_entity_pos <> 15 THEN
    RAISE EXCEPTION 'POST-VERIFY FAIL: entity_id at position %, expected 15', v_entity_pos;
  END IF;

  -- 3. Row count unchanged (compare against captured baseline)
  SELECT COUNT(*) INTO v_rows_before FROM _view_baseline_before;
  SELECT COUNT(*) INTO v_rows_after  FROM lifecycle.v_partner_investment_statement;

  IF v_rows_before <> v_rows_after THEN
    RAISE EXCEPTION 'POST-VERIFY FAIL: row count changed from % to %', v_rows_before, v_rows_after;
  END IF;

  -- 4. Zero changed financial values across all pre-existing columns
  -- Joins on property_name + partner_name (natural identity key for this view)
  SELECT COUNT(*) INTO v_changed_rows
  FROM lifecycle.v_partner_investment_statement v
  JOIN _view_baseline_before b
    ON v.property_name = b.property_name
   AND v.partner_name  = b.partner_name
  WHERE
    v.inception_model              IS DISTINCT FROM b.inception_model              OR
    v.entry_date                   IS DISTINCT FROM b.entry_date                   OR
    v.entry_date_note              IS DISTINCT FROM b.entry_date_note              OR
    v.ownership_pct                IS DISTINCT FROM b.ownership_pct                OR
    v.agreed_entry_valuation_eur   IS DISTINCT FROM b.agreed_entry_valuation_eur   OR
    v.required_entry_capital_eur   IS DISTINCT FROM b.required_entry_capital_eur   OR
    v.capital_paid_eur             IS DISTINCT FROM b.capital_paid_eur             OR
    v.capital_remaining_eur        IS DISTINCT FROM b.capital_remaining_eur        OR
    v.total_distributions_eur      IS DISTINCT FROM b.total_distributions_eur      OR
    v.current_ownership_from       IS DISTINCT FROM b.current_ownership_from       OR
    v.entry_status                 IS DISTINCT FROM b.entry_status                 OR
    v.entry_recorded_at            IS DISTINCT FROM b.entry_recorded_at;

  IF v_changed_rows > 0 THEN
    RAISE EXCEPTION 'POST-VERIFY FAIL: % rows have changed values in pre-existing columns', v_changed_rows;
  END IF;

  -- 5. entity_id IS NOT NULL for every row
  SELECT COUNT(*) INTO v_null_uuid
  FROM lifecycle.v_partner_investment_statement
  WHERE entity_id IS NULL;

  IF v_null_uuid > 0 THEN
    RAISE EXCEPTION 'POST-VERIFY FAIL: % rows have NULL entity_id', v_null_uuid;
  END IF;

  -- 6. Grants preserved
  SELECT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'lifecycle' AND table_name = 'v_partner_investment_statement'
      AND grantee = 'authenticated' AND privilege_type = 'SELECT'
  ) INTO v_auth_grant;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'lifecycle' AND table_name = 'v_partner_investment_statement'
      AND grantee = 'service_role' AND privilege_type = 'SELECT'
  ) INTO v_svc_grant;

  IF NOT v_auth_grant OR NOT v_svc_grant THEN
    RAISE EXCEPTION 'POST-VERIFY FAIL: grants missing -- auth=%, svc=%', v_auth_grant, v_svc_grant;
  END IF;

  RAISE NOTICE 'POST-VERIFICATION PASS -- 15 cols, entity_id uuid@15, rows=% (unchanged), 0 changed values, 0 NULL UUIDs, grants intact', v_rows_after;
END $$;

-- Clean up temp table
DROP TABLE IF EXISTS _view_baseline_before;
