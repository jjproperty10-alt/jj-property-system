-- ===========================================================================
-- SUPERSEDED 2026-09-16 — DO NOT RUN. Kept for audit trail only.
--
-- Yossi chose Option 1 (atomic Apply through one authorized RPC), so the
-- execution path is now:
--   supabase/migrations/20260916_001_tamir_d1_d2_d3_apply_fn.sql
--   -> SELECT finance.apply_tamir_d1_d2_d3_20260916();
--
-- Two defects in this file were found by runtime testing and are corrected in
-- the function; both would have aborted an execution of this file:
--   1. Assertion A3.7 sums 'Bank Payment to Owner' where property_name IS NULL
--      OR IN ('Tamir Radisson','Tamir Kiti 2'). That sweep also captures the
--      €3,565.69 Kiti 2 row of 31/12/2025, giving €22,665.69 today and
--      €25,290.69 after D1 — not the €21,725 the assertion requires.
--      The function instead asserts the curated four-row €19,100 anchor by id.
--   2. Assertion A0 cannot be satisfied over the CLI session at all
--      (auth.uid() IS NULL, auth.role() IS NULL), which was the reason for
--      moving to the authorized-RPC route.
-- ===========================================================================
--
-- READY — NOT RUN. Atomic Apply for Tamir D1 + D2 + D3.
-- Prepared 2026-09-16. Requires explicit Yossi authorization before execution.
-- Contains ZERO credentials, zero tokens, zero connection strings.
--
-- Writes performed by this file (exactly 4 business rows, no more):
--   INSERT public.transactions               x3   (D1, D2, D3)
--   INSERT finance.owner_transaction_links   x1   (D1 link, via authorized RPC)
--
-- Automatic side effects of EXISTING triggers (not authored here, disclosed for completeness):
--   audit_transactions -> public.audit_logs  x3   (one per inserted transaction)
--
-- This file performs NO UPDATE, NO DELETE, NO DDL, NO migration, NO ON CONFLICT.
-- It does not touch: the 12 historical Kiti 1 rows, the €550 deposit (26/08/2026),
-- any row dated after 31/08/2026, any management fee, any rental_month, any other property.
--
-- AUTHORIZATION NOTE (read before running):
--   finance.link_owner_level_payment -> finance.assert_owner_link_authorized ->
--     returns early ONLY IF auth.role() = 'service_role';
--     otherwise calls public.require_jj_staff(ARRAY['ceo','finance_admin']),
--     which RAISES if auth.uid() IS NULL.
--   A plain psql / CLI session has no JWT: auth.role() = NULL and auth.uid() = NULL,
--   so the RPC WILL RAISE and this transaction WILL ROLL BACK by design.
--   Assertion A0 below stops the run early and explicitly instead of failing midway.

BEGIN;

-- ---------------------------------------------------------------------------
-- A0 — AUTHORIZATION ASSERTION (stop early if the owner-link gate cannot pass)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT (auth.role() IS NOT DISTINCT FROM 'service_role' OR auth.uid() IS NOT NULL) THEN
    RAISE EXCEPTION
      'STOP A0: unauthenticated session. auth.role()=% auth.uid()=%. '
      'finance.link_owner_level_payment requires service_role OR a ceo/finance_admin JWT. '
      'Do not proceed; use an approved authorized route.',
      coalesce(auth.role(), 'NULL'), coalesce(auth.uid()::text, 'NULL');
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- A1 — PRE-IMAGE ASSERTIONS (every anchor must match exactly)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_tx_total        BIGINT;
  v_kiti1_rows      BIGINT;
  v_kiti1_rent_sum  NUMERIC;
  v_kiti1_rent_rows BIGINT;
  v_owner_rows      BIGINT;
  v_links           BIGINT;
  v_prop_ok         BIGINT;
BEGIN
  SELECT count(*) INTO v_tx_total FROM public.transactions;
  IF v_tx_total <> 2270 THEN
    RAISE EXCEPTION 'STOP A1.1: transactions total = % (expected 2270). Anchor moved — no Apply.', v_tx_total;
  END IF;

  SELECT count(*) INTO v_kiti1_rows FROM public.transactions WHERE property_name = 'Tamir Kiti 1';
  IF v_kiti1_rows <> 19 THEN
    RAISE EXCEPTION 'STOP A1.2: Tamir Kiti 1 rows = % (expected 19). Anchor moved — no Apply.', v_kiti1_rows;
  END IF;

  SELECT coalesce(sum(amount_eur), 0), count(*) INTO v_kiti1_rent_sum, v_kiti1_rent_rows
  FROM public.transactions
  WHERE property_name = 'Tamir Kiti 1' AND subcategory = 'Tenant Payment'
    AND date <= DATE '2026-08-31' AND NOT coalesce(is_deleted, false);
  IF v_kiti1_rent_sum <> 7685 OR v_kiti1_rent_rows <> 12 THEN
    RAISE EXCEPTION 'STOP A1.3: Kiti 1 rent through cutoff = € % across % rows (expected 7685 / 12).',
      v_kiti1_rent_sum, v_kiti1_rent_rows;
  END IF;

  SELECT count(*) INTO v_owner_rows FROM public.transactions
  WHERE property_name IS NULL AND subcategory = 'Bank Payment to Owner';
  IF v_owner_rows <> 1 THEN
    RAISE EXCEPTION 'STOP A1.4: owner-level payment rows = % (expected 1).', v_owner_rows;
  END IF;

  SELECT count(*) INTO v_links FROM finance.owner_transaction_links WHERE is_deleted = false;
  IF v_links <> 1 THEN
    RAISE EXCEPTION 'STOP A1.5: active owner links = % (expected 1).', v_links;
  END IF;

  SELECT count(*) INTO v_prop_ok FROM public.properties
  WHERE id = 'b54e015f-05f9-4f75-a3e7-9362c6e2e0ae'
    AND name = 'Tamir Kiti 1' AND NOT coalesce(is_deleted, false);
  IF v_prop_ok <> 1 THEN
    RAISE EXCEPTION 'STOP A1.6: canonical property row for Tamir Kiti 1 not found as expected.';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- A2 — DUPLICATE ASSERTIONS (a duplicate is an explicit STOP, never a silent skip)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_keys   BIGINT;
  v_2625   BIGINT;
  v_1175   BIGINT;
  v_750    BIGINT;
  v_win_05 BIGINT;
  v_win_07 BIGINT;
  v_link_k BIGINT;
BEGIN
  SELECT count(*) INTO v_keys FROM public.transactions
  WHERE k_note ILIKE '%tamir_owner_pmt_yaakov_2026-06-16_2625%'
     OR k_note ILIKE '%tamir_kiti1_rent_2026-05-31_1175%'
     OR k_note ILIKE '%tamir_kiti1_rent_2026-07-17_750%';
  IF v_keys <> 0 THEN
    RAISE EXCEPTION 'STOP A2.1: % row(s) already carry a D1/D2/D3 idempotency key. Duplicate — no Apply.', v_keys;
  END IF;

  SELECT count(*) INTO v_link_k FROM finance.owner_transaction_links
  WHERE idempotency_key = 'tamir_owner_pmt_yaakov_2026-06-16_2625';
  IF v_link_k <> 0 THEN
    RAISE EXCEPTION 'STOP A2.2: owner link idempotency key already present. Duplicate — no Apply.';
  END IF;

  SELECT count(*) INTO v_2625 FROM public.transactions
  WHERE abs(coalesce(amount_eur, 0)) BETWEEN 2624.5 AND 2625.5
     OR abs(coalesce(client_charge, 0)) BETWEEN 2624.5 AND 2625.5;
  IF v_2625 <> 0 THEN
    RAISE EXCEPTION 'STOP A2.3: % existing row(s) at €2,625. Duplicate — no Apply.', v_2625;
  END IF;

  SELECT count(*) INTO v_1175 FROM public.transactions
  WHERE property_name ILIKE '%Tamir%'
    AND (abs(coalesce(amount_eur, 0)) BETWEEN 1174.5 AND 1175.5
      OR abs(coalesce(client_charge, 0)) BETWEEN 1174.5 AND 1175.5);
  IF v_1175 <> 0 THEN
    RAISE EXCEPTION 'STOP A2.4: % existing Tamir row(s) at €1,175. Duplicate — no Apply.', v_1175;
  END IF;

  SELECT count(*) INTO v_750 FROM public.transactions
  WHERE property_name ILIKE '%Tamir%' AND subcategory = 'Tenant Payment'
    AND abs(coalesce(amount_eur, 0)) BETWEEN 749.5 AND 750.5;
  IF v_750 <> 0 THEN
    RAISE EXCEPTION 'STOP A2.5: % existing Tamir rent row(s) at €750. Duplicate — no Apply.', v_750;
  END IF;

  SELECT count(*) INTO v_win_05 FROM public.transactions
  WHERE property_name = 'Tamir Kiti 1' AND date BETWEEN DATE '2026-05-24' AND DATE '2026-06-07';
  IF v_win_05 <> 0 THEN
    RAISE EXCEPTION 'STOP A2.6: % Kiti 1 row(s) inside the 31/05 ±7d window. Review before Apply.', v_win_05;
  END IF;

  SELECT count(*) INTO v_win_07 FROM public.transactions
  WHERE property_name = 'Tamir Kiti 1' AND date BETWEEN DATE '2026-07-10' AND DATE '2026-07-24';
  IF v_win_07 <> 0 THEN
    RAISE EXCEPTION 'STOP A2.7: % Kiti 1 row(s) inside the 17/07 ±7d window. Review before Apply.', v_win_07;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- W1 — INSERT D1: owner-level payment already made to Tamir (no property)
-- ---------------------------------------------------------------------------
INSERT INTO public.transactions (
  date, category, subcategory, payer, payee, amount_eur, client_charge,
  property_id, property_name, description, k_note, review_status
) VALUES (
  '2026-06-16',
  'Management',
  'Bank Payment to Owner',
  'Jacob',
  'Owner',
  2625,
  NULL,
  NULL,
  NULL,
  'Payment already made to owner on account of overall owner balance — €2,625',
  'PROVENANCE=YOSSI_CONFIRMED;BENEFICIAL_PAYER=Yaakov;BENEFICIAL_PAYEE=Tamir;OWNER_ID=0f352012-1403-4e3b-982a-7c019ee89f1b;IDEMPOTENCY=tamir_owner_pmt_yaakov_2026-06-16_2625;OWNER_LEVEL_UNALLOCATED=true;STANDALONE=true;NOT_PART_OF=tamir_owner_pmt_yaakov_2026-08-24_10000',
  'active'
);

-- ---------------------------------------------------------------------------
-- W2 — D1 owner-level link (authorized RPC; trigger keeps review_status='approved'
--      because the linked transaction has property_id and property_name NULL)
-- ---------------------------------------------------------------------------
SELECT finance.link_owner_level_payment(
  p_transaction_id  := (SELECT id FROM public.transactions
                         WHERE k_note LIKE '%IDEMPOTENCY=tamir_owner_pmt_yaakov_2026-06-16_2625%'
                           AND NOT coalesce(is_deleted, false)),
  p_owner_entity_id := '0f352012-1403-4e3b-982a-7c019ee89f1b',
  p_idempotency_key := 'tamir_owner_pmt_yaakov_2026-06-16_2625',
  p_created_by      := 'yossi',
  p_notes           := 'YOSSI_VERIFIED · OWNER_LEVEL_UNALLOCATED · STANDALONE PAYMENT 16/06/2026'
);

-- ---------------------------------------------------------------------------
-- W3 — INSERT D2: Tamir Kiti 1 rent received 31/05/2026 (custody Jacob)
-- ---------------------------------------------------------------------------
INSERT INTO public.transactions (
  date, category, subcategory, payer, payee, amount_eur, client_charge,
  property_id, property_name, description, k_note, review_status
) VALUES (
  '2026-05-31',
  'Management',
  'Tenant Payment',
  'Tenant',
  'Jacob',
  1175,
  NULL,
  'b54e015f-05f9-4f75-a3e7-9362c6e2e0ae',
  'Tamir Kiti 1',
  'Rent received — €1,175 (rental month pending allocation)',
  'PROVENANCE=YOSSI_CONFIRMED;BENEFICIAL_PAYEE=Tamir;CUSTODY_HOLDER=Jacob;RECEIVED_DATE=2026-05-31;RENTAL_MONTH=UNKNOWN;NEEDS_REVIEW=rental_month;PENDING_BATCH=kiti_rent_consolidated_review;IDEMPOTENCY=tamir_kiti1_rent_2026-05-31_1175',
  'active'
);

-- ---------------------------------------------------------------------------
-- W4 — INSERT D3: Tamir Kiti 1 rent received 17/07/2026 (custody Yossi)
-- ---------------------------------------------------------------------------
INSERT INTO public.transactions (
  date, category, subcategory, payer, payee, amount_eur, client_charge,
  property_id, property_name, description, k_note, review_status
) VALUES (
  '2026-07-17',
  'Management',
  'Tenant Payment',
  'Tenant',
  'Yossi',
  750,
  NULL,
  'b54e015f-05f9-4f75-a3e7-9362c6e2e0ae',
  'Tamir Kiti 1',
  'Rent received — €750 (rental month pending allocation)',
  'PROVENANCE=YOSSI_CONFIRMED;BENEFICIAL_PAYEE=Tamir;CUSTODY_HOLDER=Yossi;RECEIVED_DATE=2026-07-17;RENTAL_MONTH=UNKNOWN;NEEDS_REVIEW=rental_month;PENDING_BATCH=kiti_rent_consolidated_review;IDEMPOTENCY=tamir_kiti1_rent_2026-07-17_750',
  'active'
);

-- ---------------------------------------------------------------------------
-- A3 — POST-CONDITION ASSERTIONS (any failure rolls the whole transaction back)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_tx_total   BIGINT;
  v_kiti1_rows BIGINT;
  v_rent_sum   NUMERIC;
  v_rent_rows  BIGINT;
  v_owner_rows BIGINT;
  v_links      BIGINT;
  v_d1 BIGINT; v_d2 BIGINT; v_d3 BIGINT;
  v_payments   NUMERIC;
  v_link_status TEXT;
  v_hist_null  BIGINT;
  v_deposit    NUMERIC;
  v_postcutoff BIGINT;
BEGIN
  SELECT count(*) INTO v_tx_total FROM public.transactions;
  IF v_tx_total <> 2273 THEN
    RAISE EXCEPTION 'STOP A3.1: transactions total = % (expected 2273).', v_tx_total;
  END IF;

  SELECT count(*) INTO v_kiti1_rows FROM public.transactions WHERE property_name = 'Tamir Kiti 1';
  IF v_kiti1_rows <> 21 THEN
    RAISE EXCEPTION 'STOP A3.2: Kiti 1 rows = % (expected 21).', v_kiti1_rows;
  END IF;

  SELECT coalesce(sum(amount_eur), 0), count(*) INTO v_rent_sum, v_rent_rows
  FROM public.transactions
  WHERE property_name = 'Tamir Kiti 1' AND subcategory = 'Tenant Payment'
    AND date <= DATE '2026-08-31' AND NOT coalesce(is_deleted, false);
  IF v_rent_sum <> 9610 OR v_rent_rows <> 14 THEN
    RAISE EXCEPTION 'STOP A3.3: Kiti 1 rent = € % across % rows (expected 9610 / 14).', v_rent_sum, v_rent_rows;
  END IF;

  SELECT count(*) INTO v_owner_rows FROM public.transactions
  WHERE property_name IS NULL AND subcategory = 'Bank Payment to Owner';
  IF v_owner_rows <> 2 THEN
    RAISE EXCEPTION 'STOP A3.4: owner-level payment rows = % (expected 2).', v_owner_rows;
  END IF;

  SELECT count(*) INTO v_links FROM finance.owner_transaction_links WHERE is_deleted = false;
  IF v_links <> 2 THEN
    RAISE EXCEPTION 'STOP A3.5: active owner links = % (expected 2).', v_links;
  END IF;

  SELECT count(*) INTO v_d1 FROM public.transactions
   WHERE k_note LIKE '%IDEMPOTENCY=tamir_owner_pmt_yaakov_2026-06-16_2625%';
  SELECT count(*) INTO v_d2 FROM public.transactions
   WHERE k_note LIKE '%IDEMPOTENCY=tamir_kiti1_rent_2026-05-31_1175%';
  SELECT count(*) INTO v_d3 FROM public.transactions
   WHERE k_note LIKE '%IDEMPOTENCY=tamir_kiti1_rent_2026-07-17_750%';
  IF v_d1 <> 1 OR v_d2 <> 1 OR v_d3 <> 1 THEN
    RAISE EXCEPTION 'STOP A3.6: row counts D1/D2/D3 = %/%/% (expected 1/1/1).', v_d1, v_d2, v_d3;
  END IF;

  SELECT coalesce(sum(amount_eur), 0) INTO v_payments
  FROM public.transactions
  WHERE subcategory = 'Bank Payment to Owner' AND NOT coalesce(is_deleted, false)
    AND (property_name IS NULL OR property_name IN ('Tamir Radisson', 'Tamir Kiti 2'))
    AND date <= DATE '2026-08-31';
  IF v_payments <> 21725 THEN
    RAISE EXCEPTION 'STOP A3.7: payments already made to Tamir = € % (expected 21725).', v_payments;
  END IF;

  SELECT review_status INTO v_link_status FROM finance.owner_transaction_links
  WHERE idempotency_key = 'tamir_owner_pmt_yaakov_2026-06-16_2625';
  IF v_link_status <> 'approved' THEN
    RAISE EXCEPTION 'STOP A3.8: D1 link review_status = % (expected approved).', v_link_status;
  END IF;

  -- historical rows untouched: the 12 pre-existing rent rows keep property_id NULL
  SELECT count(*) INTO v_hist_null FROM public.transactions
  WHERE property_name = 'Tamir Kiti 1' AND subcategory = 'Tenant Payment'
    AND property_id IS NULL AND date <= DATE '2026-01-31';
  IF v_hist_null <> 12 THEN
    RAISE EXCEPTION 'STOP A3.9: historical Kiti 1 rent rows with NULL property_id = % (expected 12).', v_hist_null;
  END IF;

  -- €550 deposit untouched and still excluded from rent
  SELECT coalesce(sum(amount_eur), 0) INTO v_deposit FROM public.transactions
  WHERE property_name = 'Tamir Kiti 1' AND subcategory = 'Deposit' AND date = DATE '2026-08-26';
  IF v_deposit <> 550 THEN
    RAISE EXCEPTION 'STOP A3.10: €550 deposit row changed (found € %).', v_deposit;
  END IF;

  -- post-cutoff rows untouched
  SELECT count(*) INTO v_postcutoff FROM public.transactions
  WHERE property_name = 'Tamir Kiti 1' AND date > DATE '2026-08-31';
  IF v_postcutoff <> 3 THEN
    RAISE EXCEPTION 'STOP A3.11: post-cutoff Kiti 1 rows = % (expected 3, unchanged).', v_postcutoff;
  END IF;
END $$;

COMMIT;

-- ---------------------------------------------------------------------------
-- POST-APPLY REPORT (read-only; run after COMMIT)
-- ---------------------------------------------------------------------------
SELECT 'APPLIED' AS status,
       (SELECT count(*) FROM public.transactions) AS tx_total_expect_2273,
       (SELECT sum(amount_eur) FROM public.transactions
          WHERE property_name = 'Tamir Kiti 1' AND subcategory = 'Tenant Payment'
            AND date <= DATE '2026-08-31' AND NOT coalesce(is_deleted, false)) AS kiti1_rent_expect_9610,
       (SELECT count(*) FROM finance.owner_transaction_links WHERE is_deleted = false) AS links_expect_2,
       2548.75 AS expected_due_to_tamir_eur;

SELECT 'CLEARING — compare to €64,361.82 directional' AS note,
       jacob_cash, yossi_cash, direction, settlement_amount
FROM public.v_partner_settlement;

SELECT 'KITI 1 OWNER BALANCE — sum both property_id groups, ignore post-cutoff rows' AS note,
       property_name, property_id, total_received, total_expenses, paid_to_owner, balance_due_to_owner
FROM public.v_owner_balances
WHERE property_name = 'Tamir Kiti 1';

-- ---------------------------------------------------------------------------
-- ROLLBACK PATH (soft-delete only; run ONLY on Yossi instruction)
--   Sanctioned by public.enforce_transactions_append_only, which blocks DELETE and
--   permits updates to review_status / is_deleted / deleted_by / deleted_at only.
-- ---------------------------------------------------------------------------
-- BEGIN;
-- SELECT finance.soft_delete_owner_transaction_link(
--   p_link_id    := (SELECT id FROM finance.owner_transaction_links
--                      WHERE idempotency_key = 'tamir_owner_pmt_yaakov_2026-06-16_2625'),
--   p_deleted_by := 'rollback_d1_d2_d3');
-- UPDATE public.transactions
--    SET is_deleted = true, deleted_at = now(), deleted_by = 'rollback_d1_d2_d3'
--  WHERE coalesce(is_deleted, false) = false
--    AND (k_note LIKE '%IDEMPOTENCY=tamir_owner_pmt_yaakov_2026-06-16_2625%'
--      OR k_note LIKE '%IDEMPOTENCY=tamir_kiti1_rent_2026-05-31_1175%'
--      OR k_note LIKE '%IDEMPOTENCY=tamir_kiti1_rent_2026-07-17_750%');
-- COMMIT;
