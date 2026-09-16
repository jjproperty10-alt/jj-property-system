-- Migration 20260916_001 — create the one-shot atomic Apply function for Tamir D1+D2+D3.
--
-- PREPARED LOCALLY. NOT APPLIED. Requires Yossi approval (branch -> PR -> CI -> merge).
--
-- This migration creates TWO functions plus their EXECUTE grants:
--   finance.apply_tamir_d1_d2_d3_20260916()  the atomic Apply itself (SECURITY DEFINER)
--   public.apply_tamir_d1_d2_d3_20260916()   a thin SECURITY INVOKER wrapper, needed only
--                                            because the project API exposes
--                                            pgrst.db_schemas = public, lifecycle — the
--                                            finance schema is not reachable over REST.
--
-- It contains:
--   NO call to the function        NO seed data           NO business INSERT
--   NO D1/D2/D3 rows              NO data change         NO view change
--   NO change to finance.owner_transaction_links   NO change to public.transactions
--   NO change to existing RLS policies             NO new bypass
--
-- Authorization model (unchanged, reused as-is):
--   finance.apply_tamir_d1_d2_d3_20260916()
--     -> finance.assert_owner_link_authorized()
--          -> returns early only if auth.role() = 'service_role'
--          -> otherwise public.require_jj_staff(ARRAY['ceo','finance_admin'])
--               -> RAISES if auth.uid() IS NULL or the actor is not active ceo/finance_admin
--   created_by is metadata only and is never used as an authorization gate.

CREATE OR REPLACE FUNCTION finance.apply_tamir_d1_d2_d3_20260916()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  -- ---------------------------------------------------------------- locked values
  c_owner_entity_id CONSTANT uuid := '0f352012-1403-4e3b-982a-7c019ee89f1b';  -- lifecycle.entity_identity: Tamir
  c_kiti1_property  CONSTANT uuid := 'b54e015f-05f9-4f75-a3e7-9362c6e2e0ae';  -- public.properties: Tamir Kiti 1
  c_kiti1_name      CONSTANT text := 'Tamir Kiti 1';
  c_cutoff          CONSTANT date := DATE '2026-08-31';

  c_key_d1 CONSTANT text := 'tamir_owner_pmt_yaakov_2026-06-16_2625';
  c_key_d2 CONSTANT text := 'tamir_kiti1_rent_2026-05-31_1175';
  c_key_d3 CONSTANT text := 'tamir_kiti1_rent_2026-07-17_750';

  c_d1_amount CONSTANT numeric := 2625;
  c_d2_amount CONSTANT numeric := 1175;
  c_d3_amount CONSTANT numeric := 750;

  -- Curated payments-already-made anchor: the four rows that compose €19,100.
  -- Deliberately NOT a category sweep: Kiti-complex BPO rows (€4,019 / €1,910 / €3,565.69)
  -- belong to the Kiti settlement and are outside the €19,100 owner anchor.
  c_payment_anchor_ids CONSTANT uuid[] := ARRAY[
    'da46f998-f296-42ab-a3d7-2d6573b51eb1'::uuid,  -- 2024-10-30 Tamir Radisson  €1,000
    '3f290bef-94fa-4222-be52-e86457598ed8'::uuid,  -- 2025-12-31 Tamir Kiti 2    €4,100
    'def81208-30f9-4c13-8786-26fb708a39df'::uuid,  -- 2026-05-19 Tamir Kiti 2    €4,000
    '0e8f119f-c126-45a1-a342-2fe6e99b20fb'::uuid   -- 2026-08-24 owner-level     €10,000
  ];
  c_payments_before CONSTANT numeric := 19100;
  c_closing_before  CONSTANT numeric := 3248.75;
  c_closing_after   CONSTANT numeric := 2548.75;

  -- ---------------------------------------------------------------- state
  v_created_by text;
  v_d1_id uuid;
  v_d2_id uuid;
  v_d3_id uuid;
  v_link_id uuid;

  v_tx_before bigint;
  v_tx_total bigint;
  v_kiti1_rows bigint;
  v_rent_sum numeric;
  v_rent_rows bigint;
  v_owner_rows bigint;
  v_links bigint;
  v_n bigint;
  v_sum numeric;
  v_text text;

  -- pre-image snapshots used by the "nothing else moved" postconditions
  v_pre_jj_sum numeric;
  v_pre_jj_rows bigint;
  v_pre_other_sum numeric;
  v_pre_other_rows bigint;
  v_pre_mgmtfee_rows bigint;
  v_pre_mgmtfee_sum numeric;
  v_pre_deposit_sum numeric;
  v_pre_postcutoff_rows bigint;
  v_pre_postcutoff_sum numeric;
  v_pre_hist_null bigint;
BEGIN
  -- ==========================================================================
  -- 0. AUTHORIZATION — reuse the existing gate, add nothing
  -- ==========================================================================
  PERFORM finance.assert_owner_link_authorized();

  v_created_by := coalesce(auth.uid()::text, 'service_role');

  -- ==========================================================================
  -- 1. PRECONDITIONS — any mismatch aborts before the first INSERT
  -- ==========================================================================
  -- The table-wide row count is NOT asserted against a fixed number: unrelated batches
  -- (other properties, other owners) legitimately change it between preparation and Apply.
  -- It is captured here and asserted as a delta of exactly +3 after the writes. Every anchor
  -- that protects the Tamir economics stays absolute, so a stray row inside the Tamir scope
  -- still aborts the Apply.
  SELECT count(*) INTO v_tx_before FROM public.transactions;

  SELECT count(*) INTO v_kiti1_rows FROM public.transactions WHERE property_name = c_kiti1_name;
  IF v_kiti1_rows <> 19 THEN
    RAISE EXCEPTION 'ALREADY_APPLIED_OR_PREIMAGE_CHANGED: Tamir Kiti 1 rows = % (expected 19)', v_kiti1_rows;
  END IF;

  SELECT coalesce(sum(amount_eur), 0), count(*) INTO v_rent_sum, v_rent_rows
  FROM public.transactions
  WHERE property_name = c_kiti1_name AND subcategory = 'Tenant Payment'
    AND date <= c_cutoff AND NOT coalesce(is_deleted, false);
  IF v_rent_sum <> 7685 OR v_rent_rows <> 12 THEN
    RAISE EXCEPTION 'ALREADY_APPLIED_OR_PREIMAGE_CHANGED: Kiti 1 rent through cutoff = % across % rows (expected 7685 / 12)',
      v_rent_sum, v_rent_rows;
  END IF;

  SELECT count(*) INTO v_owner_rows FROM public.transactions
  WHERE property_name IS NULL AND subcategory = 'Bank Payment to Owner';
  IF v_owner_rows <> 1 THEN
    RAISE EXCEPTION 'ALREADY_APPLIED_OR_PREIMAGE_CHANGED: owner-level payment rows = % (expected 1)', v_owner_rows;
  END IF;

  SELECT count(*) INTO v_links FROM finance.owner_transaction_links WHERE is_deleted = false;
  IF v_links <> 1 THEN
    RAISE EXCEPTION 'ALREADY_APPLIED_OR_PREIMAGE_CHANGED: active owner links = % (expected 1)', v_links;
  END IF;

  -- idempotency keys must be absent in both layers
  SELECT count(*) INTO v_n FROM public.transactions
  WHERE k_note LIKE '%' || c_key_d1 || '%'
     OR k_note LIKE '%' || c_key_d2 || '%'
     OR k_note LIKE '%' || c_key_d3 || '%';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'ALREADY_APPLIED_OR_PREIMAGE_CHANGED: % transaction row(s) already carry a D1/D2/D3 idempotency key', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM finance.owner_transaction_links WHERE idempotency_key = c_key_d1;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'ALREADY_APPLIED_OR_PREIMAGE_CHANGED: owner link idempotency key % already exists', c_key_d1;
  END IF;

  -- amount-level duplicate guards
  SELECT count(*) INTO v_n FROM public.transactions
  WHERE abs(coalesce(amount_eur, 0)) BETWEEN 2624.5 AND 2625.5
     OR abs(coalesce(client_charge, 0)) BETWEEN 2624.5 AND 2625.5;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'ALREADY_APPLIED_OR_PREIMAGE_CHANGED: % existing row(s) at EUR 2625', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM public.transactions
  WHERE property_name LIKE 'Tamir%'
    AND (abs(coalesce(amount_eur, 0)) BETWEEN 1174.5 AND 1175.5
      OR abs(coalesce(client_charge, 0)) BETWEEN 1174.5 AND 1175.5);
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'ALREADY_APPLIED_OR_PREIMAGE_CHANGED: % existing Tamir row(s) at EUR 1175', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM public.transactions
  WHERE property_name LIKE 'Tamir%' AND subcategory = 'Tenant Payment'
    AND abs(coalesce(amount_eur, 0)) BETWEEN 749.5 AND 750.5;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'ALREADY_APPLIED_OR_PREIMAGE_CHANGED: % existing Tamir rent row(s) at EUR 750', v_n;
  END IF;

  -- canonical property must exist, be active, and carry the exact name
  SELECT count(*) INTO v_n FROM public.properties
  WHERE id = c_kiti1_property AND name = c_kiti1_name AND NOT coalesce(is_deleted, false);
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'ALREADY_APPLIED_OR_PREIMAGE_CHANGED: canonical property % / % not found active (matches = %)',
      c_kiti1_property, c_kiti1_name, v_n;
  END IF;

  -- owner entity must exist and be active (FK target of owner_transaction_links)
  SELECT count(*) INTO v_n FROM lifecycle.entity_identity
  WHERE id = c_owner_entity_id AND status = 'active';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'ALREADY_APPLIED_OR_PREIMAGE_CHANGED: owner entity % not found active', c_owner_entity_id;
  END IF;

  -- no active exclusion may touch Tamir Kiti 1
  SELECT count(*) INTO v_n
  FROM public.transaction_exclusions e
  JOIN public.transactions t ON t.id = e.transaction_id
  WHERE t.property_name = c_kiti1_name AND e.is_active = true;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'ALREADY_APPLIED_OR_PREIMAGE_CHANGED: % active exclusion(s) on Tamir Kiti 1', v_n;
  END IF;

  -- reporting prerequisites so D2/D3 are counted exactly once downstream
  SELECT count(*) INTO v_n FROM public.property_name_aliases WHERE raw_name = c_kiti1_name;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'ALREADY_APPLIED_OR_PREIMAGE_CHANGED: property_name_aliases rows for % = % (expected 1)', c_kiti1_name, v_n;
  END IF;

  -- curated payments anchor must still be exactly EUR 19,100 across 4 live rows
  SELECT coalesce(sum(amount_eur), 0), count(*) INTO v_sum, v_n
  FROM public.transactions
  WHERE id = ANY(c_payment_anchor_ids) AND NOT coalesce(is_deleted, false);
  IF v_n <> 4 OR v_sum <> c_payments_before THEN
    RAISE EXCEPTION 'ALREADY_APPLIED_OR_PREIMAGE_CHANGED: payments anchor = % across % rows (expected 19100 / 4)', v_sum, v_n;
  END IF;

  -- ==========================================================================
  -- 2. PRE-IMAGE SNAPSHOTS for the "nothing else moved" postconditions
  -- ==========================================================================
  SELECT coalesce(sum(amount_eur), 0), count(*) INTO v_pre_jj_sum, v_pre_jj_rows
  FROM public.transactions WHERE category = 'JJ';

  SELECT coalesce(sum(amount_eur), 0), count(*) INTO v_pre_other_sum, v_pre_other_rows
  FROM public.transactions WHERE property_name IS NOT NULL AND property_name <> c_kiti1_name;

  SELECT count(*), coalesce(sum(coalesce(client_charge, amount_eur)), 0) INTO v_pre_mgmtfee_rows, v_pre_mgmtfee_sum
  FROM public.transactions WHERE subcategory = 'Management Fee';

  SELECT coalesce(sum(amount_eur), 0) INTO v_pre_deposit_sum
  FROM public.transactions WHERE property_name = c_kiti1_name AND subcategory = 'Deposit';

  SELECT count(*), coalesce(sum(amount_eur), 0) INTO v_pre_postcutoff_rows, v_pre_postcutoff_sum
  FROM public.transactions WHERE property_name = c_kiti1_name AND date > c_cutoff;

  SELECT count(*) INTO v_pre_hist_null
  FROM public.transactions
  WHERE property_name = c_kiti1_name AND subcategory = 'Tenant Payment' AND property_id IS NULL;

  IF v_pre_hist_null <> 12 THEN
    RAISE EXCEPTION 'ALREADY_APPLIED_OR_PREIMAGE_CHANGED: historical Kiti 1 rent rows with NULL property_id = % (expected 12)',
      v_pre_hist_null;
  END IF;

  -- ==========================================================================
  -- 3. WRITES — 3 transactions + 1 owner link, all inside the caller's transaction
  -- ==========================================================================
  INSERT INTO public.transactions (
    date, category, subcategory, payer, payee, amount_eur, client_charge,
    property_id, property_name, description, k_note, review_status
  ) VALUES (
    DATE '2026-06-16',
    'Management',
    'Bank Payment to Owner',
    'Jacob',
    'Owner',
    c_d1_amount,
    NULL,
    NULL,
    NULL,
    'Payment already made to owner on account of overall owner balance',
    'PROVENANCE=YOSSI_CONFIRMED;BENEFICIAL_PAYER=Yaakov;BENEFICIAL_PAYEE=Tamir;OWNER_ID=0f352012-1403-4e3b-982a-7c019ee89f1b;IDEMPOTENCY=tamir_owner_pmt_yaakov_2026-06-16_2625;OWNER_LEVEL_UNALLOCATED=true;STANDALONE=true;NOT_PART_OF=tamir_owner_pmt_yaakov_2026-08-24_10000',
    'active'
  )
  RETURNING id INTO v_d1_id;

  v_link_id := finance.link_owner_level_payment(
    v_d1_id,
    c_owner_entity_id,
    c_key_d1,
    v_created_by,
    'YOSSI_VERIFIED - OWNER_LEVEL_UNALLOCATED - STANDALONE PAYMENT 2026-06-16'
  );

  INSERT INTO public.transactions (
    date, category, subcategory, payer, payee, amount_eur, client_charge,
    property_id, property_name, description, k_note, review_status
  ) VALUES (
    DATE '2026-05-31',
    'Management',
    'Tenant Payment',
    'Tenant',
    'Jacob',
    c_d2_amount,
    NULL,
    c_kiti1_property,
    c_kiti1_name,
    'Rent received (rental month pending allocation)',
    'PROVENANCE=YOSSI_CONFIRMED;BENEFICIAL_PAYEE=Tamir;CUSTODY_HOLDER=Jacob;RECEIVED_DATE=2026-05-31;RENTAL_MONTH=UNKNOWN;NEEDS_REVIEW=rental_month;PENDING_BATCH=kiti_rent_consolidated_review;IDEMPOTENCY=tamir_kiti1_rent_2026-05-31_1175',
    'active'
  )
  RETURNING id INTO v_d2_id;

  INSERT INTO public.transactions (
    date, category, subcategory, payer, payee, amount_eur, client_charge,
    property_id, property_name, description, k_note, review_status
  ) VALUES (
    DATE '2026-07-17',
    'Management',
    'Tenant Payment',
    'Tenant',
    'Yossi',
    c_d3_amount,
    NULL,
    c_kiti1_property,
    c_kiti1_name,
    'Rent received (rental month pending allocation)',
    'PROVENANCE=YOSSI_CONFIRMED;BENEFICIAL_PAYEE=Tamir;CUSTODY_HOLDER=Yossi;RECEIVED_DATE=2026-07-17;RENTAL_MONTH=UNKNOWN;NEEDS_REVIEW=rental_month;PENDING_BATCH=kiti_rent_consolidated_review;IDEMPOTENCY=tamir_kiti1_rent_2026-07-17_750',
    'active'
  )
  RETURNING id INTO v_d3_id;

  -- ==========================================================================
  -- 4. POSTCONDITIONS — any failure raises and rolls back all four rows
  -- ==========================================================================
  SELECT count(*) INTO v_tx_total FROM public.transactions;
  IF v_tx_total <> v_tx_before + 3 THEN
    RAISE EXCEPTION
      'POSTCONDITION_FAILED: transactions total moved from % to % (expected % = +3). '
      'If another batch committed during this call, nothing was written - re-run.',
      v_tx_before, v_tx_total, v_tx_before + 3;
  END IF;

  SELECT count(*) INTO v_kiti1_rows FROM public.transactions WHERE property_name = c_kiti1_name;
  IF v_kiti1_rows <> 21 THEN
    RAISE EXCEPTION 'POSTCONDITION_FAILED: Kiti 1 rows = % (expected 21)', v_kiti1_rows;
  END IF;

  SELECT coalesce(sum(amount_eur), 0), count(*) INTO v_rent_sum, v_rent_rows
  FROM public.transactions
  WHERE property_name = c_kiti1_name AND subcategory = 'Tenant Payment'
    AND date <= c_cutoff AND NOT coalesce(is_deleted, false);
  IF v_rent_sum <> 9610 OR v_rent_rows <> 14 THEN
    RAISE EXCEPTION 'POSTCONDITION_FAILED: Kiti 1 rent through cutoff = % across % rows (expected 9610 / 14)',
      v_rent_sum, v_rent_rows;
  END IF;

  SELECT count(*) INTO v_owner_rows FROM public.transactions
  WHERE property_name IS NULL AND subcategory = 'Bank Payment to Owner';
  IF v_owner_rows <> 2 THEN
    RAISE EXCEPTION 'POSTCONDITION_FAILED: owner-level payment rows = % (expected 2)', v_owner_rows;
  END IF;

  SELECT count(*) INTO v_links FROM finance.owner_transaction_links WHERE is_deleted = false;
  IF v_links <> 2 THEN
    RAISE EXCEPTION 'POSTCONDITION_FAILED: active owner links = % (expected 2)', v_links;
  END IF;

  -- D1 identity: no property allocation
  SELECT count(*) INTO v_n FROM public.transactions
  WHERE id = v_d1_id AND property_id IS NULL AND property_name IS NULL
    AND amount_eur = c_d1_amount AND client_charge IS NULL
    AND category = 'Management' AND subcategory = 'Bank Payment to Owner'
    AND payer = 'Jacob' AND payee = 'Owner' AND review_status = 'active';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'POSTCONDITION_FAILED: D1 row does not match the locked owner-level shape';
  END IF;

  -- D1 link: approved, active, correct owner and role
  SELECT count(*) INTO v_n FROM finance.owner_transaction_links
  WHERE id = v_link_id AND transaction_id = v_d1_id AND owner_entity_id = c_owner_entity_id
    AND link_role = 'owner_level_payment' AND review_status = 'approved' AND is_deleted = false
    AND idempotency_key = c_key_d1;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'POSTCONDITION_FAILED: D1 owner link is not a single approved active row';
  END IF;

  -- D2 / D3 identity: canonical property, active, rental month still unknown
  SELECT count(*) INTO v_n FROM public.transactions
  WHERE id IN (v_d2_id, v_d3_id)
    AND property_id = c_kiti1_property AND property_name = c_kiti1_name
    AND category = 'Management' AND subcategory = 'Tenant Payment'
    AND client_charge IS NULL AND review_status = 'active'
    AND k_note LIKE '%RENTAL_MONTH=UNKNOWN%'
    AND k_note LIKE '%NEEDS_REVIEW=rental_month%'
    AND k_note LIKE '%PENDING_BATCH=kiti_rent_consolidated_review%';
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'POSTCONDITION_FAILED: D2/D3 rows do not match the locked rent shape (matched %)', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM public.transactions
  WHERE id = v_d2_id AND date = DATE '2026-05-31' AND amount_eur = c_d2_amount
    AND payer = 'Tenant' AND payee = 'Jacob'
    AND k_note LIKE '%RECEIVED_DATE=2026-05-31%' AND k_note LIKE '%CUSTODY_HOLDER=Jacob%';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'POSTCONDITION_FAILED: D2 row does not match its locked values';
  END IF;

  SELECT count(*) INTO v_n FROM public.transactions
  WHERE id = v_d3_id AND date = DATE '2026-07-17' AND amount_eur = c_d3_amount
    AND payer = 'Tenant' AND payee = 'Yossi'
    AND k_note LIKE '%RECEIVED_DATE=2026-07-17%' AND k_note LIKE '%CUSTODY_HOLDER=Yossi%';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'POSTCONDITION_FAILED: D3 row does not match its locked values';
  END IF;

  -- each idempotency key exactly once
  SELECT count(*) INTO v_n FROM public.transactions WHERE k_note LIKE '%' || c_key_d1 || '%';
  IF v_n <> 1 THEN RAISE EXCEPTION 'POSTCONDITION_FAILED: D1 key appears % times (expected 1)', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.transactions WHERE k_note LIKE '%' || c_key_d2 || '%';
  IF v_n <> 1 THEN RAISE EXCEPTION 'POSTCONDITION_FAILED: D2 key appears % times (expected 1)', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.transactions WHERE k_note LIKE '%' || c_key_d3 || '%';
  IF v_n <> 1 THEN RAISE EXCEPTION 'POSTCONDITION_FAILED: D3 key appears % times (expected 1)', v_n; END IF;

  -- payments already made to Tamir = 19,100 + 2,625
  SELECT coalesce(sum(amount_eur), 0) INTO v_sum
  FROM public.transactions
  WHERE (id = ANY(c_payment_anchor_ids) OR id = v_d1_id) AND NOT coalesce(is_deleted, false);
  IF v_sum <> 21725 THEN
    RAISE EXCEPTION 'POSTCONDITION_FAILED: payments already made to Tamir = % (expected 21725)', v_sum;
  END IF;

  -- historical rows untouched
  SELECT count(*) INTO v_n
  FROM public.transactions
  WHERE property_name = c_kiti1_name AND subcategory = 'Tenant Payment' AND property_id IS NULL;
  IF v_n <> v_pre_hist_null THEN
    RAISE EXCEPTION 'POSTCONDITION_FAILED: historical NULL-property_id rent rows changed (% -> %)', v_pre_hist_null, v_n;
  END IF;

  -- EUR 550 deposit untouched
  SELECT coalesce(sum(amount_eur), 0) INTO v_sum
  FROM public.transactions WHERE property_name = c_kiti1_name AND subcategory = 'Deposit';
  IF v_sum <> v_pre_deposit_sum THEN
    RAISE EXCEPTION 'POSTCONDITION_FAILED: Kiti 1 deposits changed (% -> %)', v_pre_deposit_sum, v_sum;
  END IF;

  -- post-cutoff rows untouched
  SELECT count(*), coalesce(sum(amount_eur), 0) INTO v_n, v_sum
  FROM public.transactions WHERE property_name = c_kiti1_name AND date > c_cutoff;
  IF v_n <> v_pre_postcutoff_rows OR v_sum <> v_pre_postcutoff_sum THEN
    RAISE EXCEPTION 'POSTCONDITION_FAILED: post-cutoff Kiti 1 rows changed (%/% -> %/%)',
      v_pre_postcutoff_rows, v_pre_postcutoff_sum, v_n, v_sum;
  END IF;

  -- no management fee created
  SELECT count(*), coalesce(sum(coalesce(client_charge, amount_eur)), 0) INTO v_n, v_sum
  FROM public.transactions WHERE subcategory = 'Management Fee';
  IF v_n <> v_pre_mgmtfee_rows OR v_sum <> v_pre_mgmtfee_sum THEN
    RAISE EXCEPTION 'POSTCONDITION_FAILED: management fee rows changed (%/% -> %/%)',
      v_pre_mgmtfee_rows, v_pre_mgmtfee_sum, v_n, v_sum;
  END IF;

  -- JJ P&L untouched
  SELECT coalesce(sum(amount_eur), 0), count(*) INTO v_sum, v_n
  FROM public.transactions WHERE category = 'JJ';
  IF v_sum <> v_pre_jj_sum OR v_n <> v_pre_jj_rows THEN
    RAISE EXCEPTION 'POSTCONDITION_FAILED: JJ category rows changed (%/% -> %/%)',
      v_pre_jj_rows, v_pre_jj_sum, v_n, v_sum;
  END IF;

  -- every other named property untouched
  SELECT coalesce(sum(amount_eur), 0), count(*) INTO v_sum, v_n
  FROM public.transactions WHERE property_name IS NOT NULL AND property_name <> c_kiti1_name;
  IF v_sum <> v_pre_other_sum OR v_n <> v_pre_other_rows THEN
    RAISE EXCEPTION 'POSTCONDITION_FAILED: other properties changed (%/% -> %/%)',
      v_pre_other_rows, v_pre_other_sum, v_n, v_sum;
  END IF;

  -- ==========================================================================
  -- 5. RECEIPT — no credentials, no tokens
  -- ==========================================================================
  SELECT coalesce(sum(amount_eur), 0) INTO v_rent_sum
  FROM public.transactions
  WHERE property_name = c_kiti1_name AND subcategory = 'Tenant Payment'
    AND date <= c_cutoff AND NOT coalesce(is_deleted, false);

  v_text := coalesce(auth.role(), 'none');

  RETURN jsonb_build_object(
    'receipt_version', 1,
    'function_name', 'finance.apply_tamir_d1_d2_d3_20260916',
    'd1_transaction_id', v_d1_id,
    'd1_link_id', v_link_id,
    'd2_transaction_id', v_d2_id,
    'd3_transaction_id', v_d3_id,
    'inserted_transactions', 3,
    'inserted_owner_links', 1,
    'expected_audit_rows', 3,
    'transactions_before', v_tx_before,
    'transactions_after', v_tx_before + 3,
    'closing_before', c_closing_before,
    'economic_delta', -700.00,
    'closing_after', c_closing_after,
    'payments_to_owner_after', 21725.00,
    'kiti1_rent_after', v_rent_sum,
    'rental_month_status', 'UNKNOWN - pending kiti_rent_consolidated_review',
    'applied_at', now(),
    'executed_by', auth.uid(),
    'executed_role', v_text
  );
END;
$function$;

COMMENT ON FUNCTION finance.apply_tamir_d1_d2_d3_20260916() IS
  'One-shot atomic Apply for Tamir D1 (EUR 2,625 owner payment 2026-06-16), D2 (EUR 1,175 Kiti 1 rent 2026-05-31), '
  'D3 (EUR 750 Kiti 1 rent 2026-07-17) plus the D1 owner-level link. All values are locked in the body; the function '
  'takes no arguments. Authorization reuses finance.assert_owner_link_authorized (service_role or active ceo/finance_admin). '
  'Replay and pre-image drift both raise ALREADY_APPLIED_OR_PREIMAGE_CHANGED. Remove via migration 20260916_002 after the '
  'Apply receipt is archived.';

-- ---------------------------------------------------------------------------
-- EXECUTE grants: least privilege, no new table write, no new bypass
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION finance.apply_tamir_d1_d2_d3_20260916() FROM PUBLIC;
REVOKE ALL ON FUNCTION finance.apply_tamir_d1_d2_d3_20260916() FROM anon;
GRANT EXECUTE ON FUNCTION finance.apply_tamir_d1_d2_d3_20260916() TO authenticated;
GRANT EXECUTE ON FUNCTION finance.apply_tamir_d1_d2_d3_20260916() TO service_role;

-- ---------------------------------------------------------------------------
-- API-reachable wrapper. Adds reachability only — never authority.
--
-- SECURITY INVOKER: it runs as the caller, so a caller still needs USAGE on the
-- finance schema and EXECUTE on the inner function, and the inner function still
-- runs finance.assert_owner_link_authorized() before anything else. anon has
-- neither USAGE on finance nor EXECUTE here, so it is blocked twice over.
-- The wrapper contains no logic, no arguments and no values of its own.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_tamir_d1_d2_d3_20260916()
RETURNS jsonb
LANGUAGE sql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $wrapper$
  SELECT finance.apply_tamir_d1_d2_d3_20260916();
$wrapper$;

COMMENT ON FUNCTION public.apply_tamir_d1_d2_d3_20260916() IS
  'API-reachable wrapper for finance.apply_tamir_d1_d2_d3_20260916(). SECURITY INVOKER, no logic, '
  'no arguments. Exists only because pgrst.db_schemas does not expose the finance schema. '
  'Authorization is unchanged and is enforced inside the inner function. '
  'Remove together with the inner function via migration 20260916_002.';

REVOKE ALL ON FUNCTION public.apply_tamir_d1_d2_d3_20260916() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_tamir_d1_d2_d3_20260916() FROM anon;
GRANT EXECUTE ON FUNCTION public.apply_tamir_d1_d2_d3_20260916() TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_tamir_d1_d2_d3_20260916() TO service_role;
