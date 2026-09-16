-- Migration 20260917223000 — Tamir Kiti CUTOFF correction pack (PACK 1 of 2).
--
-- VERSION CHOICE: a full unique timestamp, never another 20260916_* name. 20260917223000 rather
-- than 20260916223000 because Production has already applied 20260917090000 and 20260917090100;
-- an earlier version would sort before them and would need --include-all to push.
--
-- PREPARED LOCALLY. NOT APPLIED. NOT COMMITTED. NOT CALLED.
-- Requires Yossi approval: clean clone -> branch -> PR -> CI -> merge -> separate Apply approval.
--
-- WHY A NEW FUNCTION INSTEAD OF A REPLACEMENT:
-- finance/public.apply_tamir_d1_d2_d3_20260916() encoded three events with two wrong receipt
-- dates (2026-05-31 instead of 2026-05-19, 2026-07-17 instead of 2026-07-07), an unresolved
-- rental month, and no knowledge of the two Kiti 2 July events. It must never run again, so this
-- migration DROPS both halves of that pair atomically and creates a correctly named replacement.
--
-- THE FIVE LOCKED CUTOFF EVENTS (Yossi, 2026-09-16), all on or before 2026-08-31:
--   E1  2026-06-16  owner-level  Jacob paid Tamir                              -2,625.00
--   E2  2026-05-19  Kiti 1       one receipt: 425 May + 700 June + 50 elec.    +1,175.00
--   E3  2026-07-07  Kiti 1       700 July rent + 50 electricity credit           +750.00
--   E4  2026-07-17  Kiti 2       July rent, GROSS                                +800.00
--   E5  2026-07-17  Kiti 2       drain clearing paid by the tenant                -85.00
--   delta = +1,175 + 750 + 800 - 85 - 2,625 = +15.00
--   closing 3,248.75 + 15.00 = 3,263.75 DUE TO TAMIR
--
-- CASH / CUSTODY TRUTH THAT MUST SURVIVE:
--   E2's 1,175 was received by Jacob; E1's 2,625 was paid out by Jacob.
--   E3's 750 and E4's 800 were received by Yossi, but the tenant paid the 85 drain cost directly,
--   so Yossi's custody grows by 750 + 800 - 85 = 1,465 and NOT by 1,550. E4 is still recorded
--   GROSS at 800 with the 85 as its own expense row: the owner must see both the full rent and
--   the cost. Runtime tests A-CUSTODY-1/2 and the receipt both prove the 715 net effect.
--
-- SEMANTICS OF THE 50 IN E2 AND E3:
--   a general electricity credit collected with the rent - NOT a final metered electricity charge
--   and NOT a deposit. It is carried as ELECTRICITY_CREDIT in k_note so a later true-up against
--   the real bill stays possible without touching these receipts.
--
-- DELIBERATELY OUT OF SCOPE (they belong to PACK 2, the September pack):
--   the new tenants' deposit legs, September rent for either apartment, and the September
--   brokerage fee. This function must not read, measure or assert the deposit layer at all.
--
-- ANCHOR POLICY (changed on Yossi's instruction, after fresh Production snapshot 2026-09-16
-- 19:33 UTC): NO global transactions count and NO bare Kiti row count are used as anchors -
-- both drift from unrelated import batches (the table moved 2,270 -> 2,310 in a single day).
-- Anchors are targeted only: idempotency keys, economic sums, exact dates, property ids, owner
-- identity, and duplicate guards. Row counts still appear in the receipt as information.
--
-- WHAT THIS MIGRATION CONTAINS:
--   DROP FUNCTION public.apply_tamir_d1_d2_d3_20260916()      (obsolete, must never run)
--   DROP FUNCTION finance.apply_tamir_d1_d2_d3_20260916()      (obsolete, must never run)
--   CREATE FUNCTION finance.apply_tamir_kiti_cutoff_20260831() (SECURITY DEFINER, no arguments)
--   CREATE FUNCTION public.apply_tamir_kiti_cutoff_20260831()  (SECURITY INVOKER wrapper, API reach)
--   EXECUTE grants for authenticated + service_role, revoked from PUBLIC and anon
-- and nothing else: no call to any function, no business INSERT / UPDATE / DELETE, no seed data,
-- no RLS change, no table or view change, no new bypass, no credentials.

DROP FUNCTION IF EXISTS public.apply_tamir_d1_d2_d3_20260916();
DROP FUNCTION IF EXISTS finance.apply_tamir_d1_d2_d3_20260916();

CREATE FUNCTION finance.apply_tamir_kiti_cutoff_20260831()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  -- ---------------------------------------------------------------- locked identities
  c_owner_entity_id CONSTANT uuid := '0f352012-1403-4e3b-982a-7c019ee89f1b';  -- lifecycle.entity_identity: Tamir
  c_kiti1_property  CONSTANT uuid := 'b54e015f-05f9-4f75-a3e7-9362c6e2e0ae';  -- public.properties: Tamir Kiti 1
  c_kiti2_property  CONSTANT uuid := '4dc5c26c-ce0c-49ec-8f44-a525f68f0b8a';  -- public.properties: Tamir Kiti 2
  c_kiti1_name      CONSTANT text := 'Tamir Kiti 1';
  c_kiti2_name      CONSTANT text := 'Tamir Kiti 2';
  c_cutoff          CONSTANT date := DATE '2026-08-31';

  -- ---------------------------------------------------------------- locked idempotency keys
  c_key_e1 CONSTANT text := 'tamir_owner_pmt_yaakov_2026-06-16_2625';
  c_key_e2 CONSTANT text := 'tamir_kiti1_rent_2026-05-19_1175';
  c_key_e3 CONSTANT text := 'tamir_kiti1_rent_2026-07-07_750';
  c_key_e4 CONSTANT text := 'tamir_kiti2_rent_2026-07-17_800';
  c_key_e5 CONSTANT text := 'tamir_kiti2_plumbing_2026-07-17_85';

  -- ---------------------------------------------------------------- locked amounts and dates
  c_e1_amount CONSTANT numeric := 2625;    c_e1_date CONSTANT date := DATE '2026-06-16';
  c_e2_amount CONSTANT numeric := 1175;    c_e2_date CONSTANT date := DATE '2026-05-19';
  c_e3_amount CONSTANT numeric := 750;     c_e3_date CONSTANT date := DATE '2026-07-07';
  c_e4_amount CONSTANT numeric := 800;     c_e4_date CONSTANT date := DATE '2026-07-17';
  c_e5_amount CONSTANT numeric := 85;      c_e5_date CONSTANT date := DATE '2026-07-17';

  -- E2 internal allocation of ONE receipt (never split into rows)
  c_e2_may_partial CONSTANT numeric := 425;  -- 2026-05-19 .. 2026-05-31
  c_e2_june_rent   CONSTANT numeric := 700;  -- June 2026 rent
  c_e2_june_elec   CONSTANT numeric := 50;   -- June 2026 general electricity credit
  c_occupancy_from CONSTANT date    := DATE '2026-05-19';  -- actual possession
  c_contract_start CONSTANT date    := DATE '2026-05-20';  -- contract commencement

  -- E3 internal allocation
  c_e3_july_rent CONSTANT numeric := 700;
  c_e3_july_elec CONSTANT numeric := 50;

  -- E4 / E5 cash truth
  c_e4_net_cash CONSTANT numeric := 715;  -- 800 gross - 85 paid by the tenant at source
  c_yossi_custody_delta CONSTANT numeric := 1465;  -- 750 + 800 - 85
  c_jacob_received CONSTANT numeric := 1175;
  c_jacob_paid     CONSTANT numeric := 2625;

  -- ---------------------------------------------------------------- client-safe descriptions
  c_e1_description CONSTANT text := 'Payment already made to owner on account of overall owner balance';
  c_e2_description CONSTANT text := 'Rent and electricity received for partial May and June 2026.';
  c_e3_description CONSTANT text := 'Rent and electricity received for July 2026.';
  c_e4_description CONSTANT text := 'Rent for July 2026 (drain-clearing cost deducted at source).';
  c_e5_description CONSTANT text := 'Drain clearing, July 2026.';

  -- ---------------------------------------------------------------- locked k_note payloads
  c_e1_knote CONSTANT text :=
    'PROVENANCE=YOSSI_CONFIRMED;BENEFICIAL_PAYER=Yaakov;BENEFICIAL_PAYEE=Tamir;'
    'OWNER_ID=0f352012-1403-4e3b-982a-7c019ee89f1b;RECEIVED_DATE=2026-06-16;'
    'OWNER_LEVEL_UNALLOCATED=true;STANDALONE=true;'
    'NOT_PART_OF=tamir_owner_pmt_yaakov_2026-08-24_10000;'
    'AUDIT_REF=kiti_historical_closure_2026-09-16;'
    'IDEMPOTENCY=tamir_owner_pmt_yaakov_2026-06-16_2625';

  c_e2_knote CONSTANT text :=
    'PROVENANCE=YOSSI_CONFIRMED;BENEFICIAL_PAYEE=Tamir;CUSTODY_HOLDER=Jacob;'
    'RECEIVED_DATE=2026-05-19;ACTUAL_OCCUPANCY_FROM=2026-05-19;CONTRACT_COMMENCEMENT=2026-05-20;'
    'ALLOCATION_MAY_PARTIAL=425;ALLOCATION_JUNE_RENT=700;ALLOCATION_JUNE_ELECTRICITY=50;'
    'ELECTRICITY_CREDIT=general_not_final_bill;DEPOSIT_INCLUDED=false;SINGLE_RECEIPT=true;'
    'AUDIT_REF=kiti_historical_closure_2026-09-16;'
    'IDEMPOTENCY=tamir_kiti1_rent_2026-05-19_1175';

  c_e3_knote CONSTANT text :=
    'PROVENANCE=YOSSI_CONFIRMED;BENEFICIAL_PAYEE=Tamir;CUSTODY_HOLDER=Yossi;'
    'RECEIVED_DATE=2026-07-07;RENTAL_MONTH=2026-07;'
    'ALLOCATION_JULY_RENT=700;ALLOCATION_JULY_ELECTRICITY=50;'
    'ELECTRICITY_CREDIT=general_not_final_bill;DEPOSIT_INCLUDED=false;'
    'AUDIT_REF=kiti_historical_closure_2026-09-16;'
    'IDEMPOTENCY=tamir_kiti1_rent_2026-07-07_750';

  c_e4_knote CONSTANT text :=
    'PROVENANCE=YOSSI_CONFIRMED;BENEFICIAL_PAYEE=Tamir;CUSTODY_HOLDER=Yossi;'
    'RECEIVED_DATE=2026-07-17;RENTAL_MONTH=2026-07;GROSS_RENT=800;'
    'DEDUCTED_AT_SOURCE=85;NET_CASH_RECEIVED=715;'
    'LINKED_EXPENSE=tamir_kiti2_plumbing_2026-07-17_85;DEPOSIT_INCLUDED=false;'
    'AUDIT_REF=kiti_historical_closure_2026-09-16;'
    'IDEMPOTENCY=tamir_kiti2_rent_2026-07-17_800';

  c_e5_knote CONSTANT text :=
    'PROVENANCE=YOSSI_CONFIRMED;OWNER_CHARGEABLE=Tamir;SERVICE_MONTH=2026-07;'
    'PAID_BY=tenant_at_source;DEDUCTED_FROM_RENT=800;NET_CASH_RECEIVED_BY_CUSTODY=715;'
    'LINKED_INCOME=tamir_kiti2_rent_2026-07-17_800;'
    'AUDIT_REF=kiti_historical_closure_2026-09-16;'
    'IDEMPOTENCY=tamir_kiti2_plumbing_2026-07-17_85';

  -- ---------------------------------------------------------------- economic anchors
  -- verified against Production 2026-09-16 19:33 UTC
  c_kiti1_rent_before CONSTANT numeric := 7685;      c_kiti1_rent_rows_before CONSTANT bigint := 12;
  c_kiti1_rent_after  CONSTANT numeric := 9610;      c_kiti1_rent_rows_after  CONSTANT bigint := 14;
  c_kiti2_rent_before CONSTANT numeric := 11716.86;  c_kiti2_rent_rows_before CONSTANT bigint := 14;
  c_kiti2_rent_after  CONSTANT numeric := 12516.86;  c_kiti2_rent_rows_after  CONSTANT bigint := 15;

  c_payment_anchor_ids CONSTANT uuid[] := ARRAY[
    'da46f998-f296-42ab-a3d7-2d6573b51eb1'::uuid,  -- 2024-10-30 Tamir Radisson  EUR  1,000
    '3f290bef-94fa-4222-be52-e86457598ed8'::uuid,  -- 2025-12-31 Tamir Kiti 2    EUR  4,100
    'def81208-30f9-4c13-8786-26fb708a39df'::uuid,  -- 2026-05-19 Tamir Kiti 2    EUR  4,000
    '0e8f119f-c126-45a1-a342-2fe6e99b20fb'::uuid   -- 2026-08-24 owner-level     EUR 10,000
  ];
  c_payments_before CONSTANT numeric := 19100;
  c_payments_after  CONSTANT numeric := 21725;
  c_closing_before  CONSTANT numeric := 3248.75;
  c_economic_delta  CONSTANT numeric := 15.00;
  c_closing_after   CONSTANT numeric := 3263.75;

  -- ---------------------------------------------------------------- state
  v_created_by text;
  v_e1_id uuid; v_e2_id uuid; v_e3_id uuid; v_e4_id uuid; v_e5_id uuid;
  v_link_id uuid;

  v_n bigint;
  v_sum numeric;
  v_sum2 numeric;
  v_rows bigint;
  v_text text;
  v_tx_before bigint;
  v_tx_after bigint;

  -- allocation read-back
  v_a_may numeric; v_a_rent numeric; v_a_elec numeric;
  v_a_jul_rent numeric; v_a_jul_elec numeric;
  v_occ_from date; v_contract_start date;
  v_gross numeric; v_deducted numeric; v_net numeric;

  -- pre-image snapshots for "nothing else moved"
  v_pre_jj_sum numeric;        v_pre_jj_rows bigint;
  v_pre_other_sum numeric;     v_pre_other_rows bigint;
  v_pre_mgmtfee_rows bigint;   v_pre_mgmtfee_sum numeric;
  v_pre_postcutoff_rows bigint; v_pre_postcutoff_sum numeric;
  v_pre_hist_null_k1 bigint;   v_pre_hist_null_k2 bigint;
BEGIN
  -- ==========================================================================
  -- 0. AUTHORIZATION — reuse the existing gate, add nothing
  -- ==========================================================================
  PERFORM finance.assert_owner_link_authorized();

  v_created_by := coalesce(auth.uid()::text, 'service_role');

  -- ==========================================================================
  -- 0b. ALLOCATION LOCK — the locked components must reconstruct each receipt
  --     exactly, and the cash arithmetic must hold, before anything is read.
  -- ==========================================================================
  IF c_e2_may_partial + c_e2_june_rent + c_e2_june_elec <> c_e2_amount THEN
    RAISE EXCEPTION 'ALLOCATION_LOCK_FAILED: E2 allocation % + % + % <> receipt %',
      c_e2_may_partial, c_e2_june_rent, c_e2_june_elec, c_e2_amount;
  END IF;

  IF c_e3_july_rent + c_e3_july_elec <> c_e3_amount THEN
    RAISE EXCEPTION 'ALLOCATION_LOCK_FAILED: E3 allocation % + % <> receipt %',
      c_e3_july_rent, c_e3_july_elec, c_e3_amount;
  END IF;

  IF c_e4_amount - c_e5_amount <> c_e4_net_cash THEN
    RAISE EXCEPTION 'ALLOCATION_LOCK_FAILED: Kiti 2 gross % minus cost % <> net cash %',
      c_e4_amount, c_e5_amount, c_e4_net_cash;
  END IF;

  IF c_e3_amount + c_e4_amount - c_e5_amount <> c_yossi_custody_delta THEN
    RAISE EXCEPTION 'ALLOCATION_LOCK_FAILED: custody delta % does not equal % + % - %',
      c_yossi_custody_delta, c_e3_amount, c_e4_amount, c_e5_amount;
  END IF;

  IF c_e2_amount + c_e3_amount + c_e4_amount - c_e5_amount - c_e1_amount <> c_economic_delta
     OR c_closing_before + c_economic_delta <> c_closing_after THEN
    RAISE EXCEPTION 'ALLOCATION_LOCK_FAILED: economic delta does not reconstruct % -> %',
      c_closing_before, c_closing_after;
  END IF;

  IF c_occupancy_from >= c_contract_start THEN
    RAISE EXCEPTION 'ALLOCATION_LOCK_FAILED: occupancy % must precede contract commencement %',
      c_occupancy_from, c_contract_start;
  END IF;

  -- the locked k_note payloads must state the same facts
  IF c_e2_knote NOT LIKE '%ALLOCATION_MAY_PARTIAL=425%'
     OR c_e2_knote NOT LIKE '%ALLOCATION_JUNE_RENT=700%'
     OR c_e2_knote NOT LIKE '%ALLOCATION_JUNE_ELECTRICITY=50%'
     OR c_e2_knote NOT LIKE '%ELECTRICITY_CREDIT=general_not_final_bill%'
     OR c_e2_knote NOT LIKE '%DEPOSIT_INCLUDED=false%'
     OR c_e2_knote NOT LIKE '%RECEIVED_DATE=2026-05-19%'
     OR c_e2_knote LIKE '%NEEDS_REVIEW=%'
     OR c_e3_knote NOT LIKE '%RENTAL_MONTH=2026-07%'
     OR c_e3_knote NOT LIKE '%ALLOCATION_JULY_RENT=700%'
     OR c_e3_knote NOT LIKE '%ALLOCATION_JULY_ELECTRICITY=50%'
     OR c_e3_knote NOT LIKE '%RECEIVED_DATE=2026-07-07%'
     OR c_e3_knote LIKE '%RENTAL_MONTH=UNKNOWN%'
     OR c_e3_knote LIKE '%NEEDS_REVIEW=%'
     OR c_e4_knote NOT LIKE '%GROSS_RENT=800%'
     OR c_e4_knote NOT LIKE '%DEDUCTED_AT_SOURCE=85%'
     OR c_e4_knote NOT LIKE '%NET_CASH_RECEIVED=715%'
     OR c_e5_knote NOT LIKE '%PAID_BY=tenant_at_source%'
     OR c_e5_knote NOT LIKE '%LINKED_INCOME=tamir_kiti2_rent_2026-07-17_800%' THEN
    RAISE EXCEPTION 'ALLOCATION_LOCK_FAILED: locked k_note payloads do not match the verified facts';
  END IF;

  -- ==========================================================================
  -- 1. PRECONDITIONS — targeted anchors only. No global row count, no bare
  --    Kiti row count: those drift from unrelated import batches.
  -- ==========================================================================
  SELECT count(*) INTO v_tx_before FROM public.transactions;  -- receipt information only

  -- 1a. idempotency: none of the five keys may exist, in either layer
  SELECT count(*) INTO v_n FROM public.transactions
  WHERE k_note LIKE '%' || c_key_e1 || '%' OR k_note LIKE '%' || c_key_e2 || '%'
     OR k_note LIKE '%' || c_key_e3 || '%' OR k_note LIKE '%' || c_key_e4 || '%'
     OR k_note LIKE '%' || c_key_e5 || '%';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'ALREADY_APPLIED_OR_PREIMAGE_CHANGED: % row(s) already carry a cutoff-pack idempotency key', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM finance.owner_transaction_links WHERE idempotency_key = c_key_e1;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'ALREADY_APPLIED_OR_PREIMAGE_CHANGED: owner link idempotency key % already exists', c_key_e1;
  END IF;

  -- 1b. economic anchors: Kiti 1 and Kiti 2 rent through the cutoff
  SELECT coalesce(sum(amount_eur), 0), count(*) INTO v_sum, v_rows
  FROM public.transactions
  WHERE property_name = c_kiti1_name AND subcategory = 'Tenant Payment'
    AND date <= c_cutoff AND NOT coalesce(is_deleted, false);
  IF v_sum <> c_kiti1_rent_before OR v_rows <> c_kiti1_rent_rows_before THEN
    RAISE EXCEPTION 'ALREADY_APPLIED_OR_PREIMAGE_CHANGED: Kiti 1 rent through cutoff = % / % rows (expected % / %)',
      v_sum, v_rows, c_kiti1_rent_before, c_kiti1_rent_rows_before;
  END IF;

  SELECT coalesce(sum(amount_eur), 0), count(*) INTO v_sum, v_rows
  FROM public.transactions
  WHERE property_name = c_kiti2_name AND subcategory = 'Tenant Payment'
    AND date <= c_cutoff AND NOT coalesce(is_deleted, false);
  IF v_sum <> c_kiti2_rent_before OR v_rows <> c_kiti2_rent_rows_before THEN
    RAISE EXCEPTION 'ALREADY_APPLIED_OR_PREIMAGE_CHANGED: Kiti 2 rent through cutoff = % / % rows (expected % / %)',
      v_sum, v_rows, c_kiti2_rent_before, c_kiti2_rent_rows_before;
  END IF;

  -- 1c. the service months this pack fills must be empty
  SELECT count(*) INTO v_n FROM public.transactions
  WHERE property_name = c_kiti1_name AND subcategory = 'Tenant Payment'
    AND date BETWEEN DATE '2026-05-01' AND DATE '2026-07-31';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'ALREADY_APPLIED_OR_PREIMAGE_CHANGED: % Kiti 1 rent row(s) already exist between 2026-05-01 and 2026-07-31', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM public.transactions
  WHERE property_name = c_kiti2_name AND subcategory = 'Tenant Payment'
    AND date BETWEEN DATE '2026-07-01' AND DATE '2026-07-31';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'ALREADY_APPLIED_OR_PREIMAGE_CHANGED: % Kiti 2 July rent row(s) already exist', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM public.transactions
  WHERE property_name = c_kiti2_name AND subcategory = 'Plumber';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'ALREADY_APPLIED_OR_PREIMAGE_CHANGED: % Kiti 2 plumbing row(s) already exist', v_n;
  END IF;

  -- 1d. owner-level layer
  SELECT count(*) INTO v_n FROM public.transactions
  WHERE property_name IS NULL AND subcategory = 'Bank Payment to Owner';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'ALREADY_APPLIED_OR_PREIMAGE_CHANGED: owner-level payment rows = % (expected 1)', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM finance.owner_transaction_links WHERE is_deleted = false;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'ALREADY_APPLIED_OR_PREIMAGE_CHANGED: active owner links = % (expected 1)', v_n;
  END IF;

  SELECT coalesce(sum(amount_eur), 0), count(*) INTO v_sum, v_n
  FROM public.transactions
  WHERE id = ANY(c_payment_anchor_ids) AND NOT coalesce(is_deleted, false);
  IF v_n <> 4 OR v_sum <> c_payments_before THEN
    RAISE EXCEPTION 'ALREADY_APPLIED_OR_PREIMAGE_CHANGED: payments anchor = % across % rows (expected % / 4)',
      v_sum, v_n, c_payments_before;
  END IF;

  -- 1e. amount-level duplicate guards for each new amount
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

  SELECT count(*) INTO v_n FROM public.transactions
  WHERE property_name = c_kiti2_name AND date >= DATE '2026-01-01'
    AND abs(coalesce(amount_eur, 0)) BETWEEN 84.5 AND 85.5;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'ALREADY_APPLIED_OR_PREIMAGE_CHANGED: % existing Kiti 2 row(s) at EUR 85 in 2026', v_n;
  END IF;

  -- 1f. identity anchors: both canonical properties active, owner active, aliases present
  SELECT count(*) INTO v_n FROM public.properties
  WHERE id = c_kiti1_property AND name = c_kiti1_name AND NOT coalesce(is_deleted, false);
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'ALREADY_APPLIED_OR_PREIMAGE_CHANGED: canonical property % / % not found active', c_kiti1_property, c_kiti1_name;
  END IF;

  SELECT count(*) INTO v_n FROM public.properties
  WHERE id = c_kiti2_property AND name = c_kiti2_name AND NOT coalesce(is_deleted, false);
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'ALREADY_APPLIED_OR_PREIMAGE_CHANGED: canonical property % / % not found active', c_kiti2_property, c_kiti2_name;
  END IF;

  SELECT count(*) INTO v_n FROM lifecycle.entity_identity
  WHERE id = c_owner_entity_id AND status = 'active';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'ALREADY_APPLIED_OR_PREIMAGE_CHANGED: owner entity % not found active', c_owner_entity_id;
  END IF;

  SELECT count(*) INTO v_n FROM public.property_name_aliases
  WHERE raw_name IN (c_kiti1_name, c_kiti2_name);
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'ALREADY_APPLIED_OR_PREIMAGE_CHANGED: property_name_aliases rows for Kiti 1 + Kiti 2 = % (expected 2)', v_n;
  END IF;

  SELECT count(*) INTO v_n
  FROM public.transaction_exclusions e
  JOIN public.transactions t ON t.id = e.transaction_id
  WHERE t.property_name IN (c_kiti1_name, c_kiti2_name) AND e.is_active = true;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'ALREADY_APPLIED_OR_PREIMAGE_CHANGED: % active exclusion(s) on the Kiti apartments', v_n;
  END IF;

  -- ==========================================================================
  -- 2. PRE-IMAGE SNAPSHOTS for the "nothing else moved" postconditions.
  --    The deposit layer is deliberately absent: never read, never asserted.
  -- ==========================================================================
  SELECT coalesce(sum(amount_eur), 0), count(*) INTO v_pre_jj_sum, v_pre_jj_rows
  FROM public.transactions WHERE category = 'JJ';

  SELECT coalesce(sum(amount_eur), 0), count(*) INTO v_pre_other_sum, v_pre_other_rows
  FROM public.transactions
  WHERE property_name IS NOT NULL AND property_name NOT IN (c_kiti1_name, c_kiti2_name);

  SELECT count(*), coalesce(sum(coalesce(client_charge, amount_eur)), 0) INTO v_pre_mgmtfee_rows, v_pre_mgmtfee_sum
  FROM public.transactions WHERE subcategory = 'Management Fee';

  SELECT count(*), coalesce(sum(amount_eur), 0) INTO v_pre_postcutoff_rows, v_pre_postcutoff_sum
  FROM public.transactions
  WHERE property_name IN (c_kiti1_name, c_kiti2_name) AND date > c_cutoff;

  SELECT count(*) INTO v_pre_hist_null_k1 FROM public.transactions
  WHERE property_name = c_kiti1_name AND subcategory = 'Tenant Payment' AND property_id IS NULL;
  IF v_pre_hist_null_k1 <> 12 THEN
    RAISE EXCEPTION 'ALREADY_APPLIED_OR_PREIMAGE_CHANGED: historical Kiti 1 rent rows with NULL property_id = % (expected 12)', v_pre_hist_null_k1;
  END IF;

  SELECT count(*) INTO v_pre_hist_null_k2 FROM public.transactions
  WHERE property_name = c_kiti2_name AND subcategory = 'Tenant Payment' AND property_id IS NULL;
  IF v_pre_hist_null_k2 <> 14 THEN
    RAISE EXCEPTION 'ALREADY_APPLIED_OR_PREIMAGE_CHANGED: historical Kiti 2 rent rows with NULL property_id = % (expected 14)', v_pre_hist_null_k2;
  END IF;

  -- ==========================================================================
  -- 3. WRITES — 5 transactions + 1 owner link, all inside the caller's transaction
  -- ==========================================================================
  -- E1: owner-level payment. No property allocation by design (P-LEDGER owner layer).
  INSERT INTO public.transactions (
    date, category, subcategory, payer, payee, amount_eur, client_charge,
    property_id, property_name, description, k_note, review_status
  ) VALUES (
    c_e1_date, 'Management', 'Bank Payment to Owner', 'Jacob', 'Owner',
    c_e1_amount, NULL, NULL, NULL, c_e1_description, c_e1_knote, 'active'
  )
  RETURNING id INTO v_e1_id;

  v_link_id := finance.link_owner_level_payment(
    v_e1_id,
    c_owner_entity_id,
    c_key_e1,
    v_created_by,
    'YOSSI_VERIFIED - OWNER_LEVEL_UNALLOCATED - STANDALONE PAYMENT 2026-06-16'
  );

  -- E2: ONE Kiti 1 cash receipt of EUR 1,175 received by Jacob.
  -- The 425 / 700 / 50 split is internal metadata only - never several rows.
  INSERT INTO public.transactions (
    date, category, subcategory, payer, payee, amount_eur, client_charge,
    property_id, property_name, description, k_note, review_status
  ) VALUES (
    c_e2_date, 'Management', 'Tenant Payment', 'Tenant', 'Jacob',
    c_e2_amount, NULL, c_kiti1_property, c_kiti1_name, c_e2_description, c_e2_knote, 'active'
  )
  RETURNING id INTO v_e2_id;

  -- E3: Kiti 1 July receipt of EUR 750 received by Yossi = 700 rent + 50 electricity credit.
  INSERT INTO public.transactions (
    date, category, subcategory, payer, payee, amount_eur, client_charge,
    property_id, property_name, description, k_note, review_status
  ) VALUES (
    c_e3_date, 'Management', 'Tenant Payment', 'Tenant', 'Yossi',
    c_e3_amount, NULL, c_kiti1_property, c_kiti1_name, c_e3_description, c_e3_knote, 'active'
  )
  RETURNING id INTO v_e3_id;

  -- E4: Kiti 2 July rent recorded GROSS at EUR 800 even though only EUR 715 reached custody.
  INSERT INTO public.transactions (
    date, category, subcategory, payer, payee, amount_eur, client_charge,
    property_id, property_name, description, k_note, review_status
  ) VALUES (
    c_e4_date, 'Management', 'Tenant Payment', 'Tenant', 'Yossi',
    c_e4_amount, NULL, c_kiti2_property, c_kiti2_name, c_e4_description, c_e4_knote, 'active'
  )
  RETURNING id INTO v_e4_id;

  -- E5: the drain clearing the tenant paid directly, charged to the owner at cost.
  -- payer/payee record the real cash path (tenant -> tradesman) and are deliberately NOT
  -- normalised to 'company': no JJ cash moved, the tenant settled it at source (P-ARCH-2).
  -- client_charge stays NULL like every other cost row, so the owner-facing amount is
  -- COALESCE(client_charge, amount_eur) = 85 (P-LEDGER-6) without a second charge column.
  INSERT INTO public.transactions (
    date, category, subcategory, payer, payee, amount_eur, client_charge,
    property_id, property_name, description, k_note, review_status
  ) VALUES (
    c_e5_date, 'Management', 'Plumber', 'Tenant', 'Plumber',
    c_e5_amount, NULL, c_kiti2_property, c_kiti2_name, c_e5_description, c_e5_knote, 'active'
  )
  RETURNING id INTO v_e5_id;

  -- ==========================================================================
  -- 4. POSTCONDITIONS — any failure raises and rolls back all six writes
  -- ==========================================================================
  -- 4a. each key owns exactly one row, and the rows are five distinct rows.
  -- Counted on the 'IDEMPOTENCY=' form, never a bare substring: E4 and E5 quote each other's
  -- key in LINKED_INCOME / LINKED_EXPENSE, so a bare match would find the pair twice.
  SELECT count(*) INTO v_n FROM public.transactions WHERE k_note LIKE '%IDEMPOTENCY=' || c_key_e1 || '%';
  IF v_n <> 1 THEN RAISE EXCEPTION 'POSTCONDITION_FAILED: E1 key owns % rows (expected 1)', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.transactions WHERE k_note LIKE '%IDEMPOTENCY=' || c_key_e2 || '%';
  IF v_n <> 1 THEN RAISE EXCEPTION 'POSTCONDITION_FAILED: E2 key owns % rows (expected 1) - the single receipt was split', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.transactions WHERE k_note LIKE '%IDEMPOTENCY=' || c_key_e3 || '%';
  IF v_n <> 1 THEN RAISE EXCEPTION 'POSTCONDITION_FAILED: E3 key owns % rows (expected 1)', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.transactions WHERE k_note LIKE '%IDEMPOTENCY=' || c_key_e4 || '%';
  IF v_n <> 1 THEN RAISE EXCEPTION 'POSTCONDITION_FAILED: E4 key owns % rows (expected 1)', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.transactions WHERE k_note LIKE '%IDEMPOTENCY=' || c_key_e5 || '%';
  IF v_n <> 1 THEN RAISE EXCEPTION 'POSTCONDITION_FAILED: E5 key owns % rows (expected 1)', v_n; END IF;

  -- the gross-rent row and its cost row must point at each other, exactly once each
  SELECT count(*) INTO v_n FROM public.transactions
  WHERE id = v_e4_id AND k_note LIKE '%LINKED_EXPENSE=' || c_key_e5 || '%';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'POSTCONDITION_FAILED: the Kiti 2 rent row does not reference its drain-clearing cost';
  END IF;

  SELECT count(*) INTO v_n FROM public.transactions
  WHERE id = v_e5_id AND k_note LIKE '%LINKED_INCOME=' || c_key_e4 || '%';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'POSTCONDITION_FAILED: the drain-clearing cost row does not reference its rent row';
  END IF;

  IF v_e1_id IS NULL OR v_e2_id IS NULL OR v_e3_id IS NULL OR v_e4_id IS NULL OR v_e5_id IS NULL
     OR v_link_id IS NULL THEN
    RAISE EXCEPTION 'POSTCONDITION_FAILED: one of the five events or the owner link was not created';
  END IF;

  SELECT count(DISTINCT id) INTO v_n FROM public.transactions
  WHERE id IN (v_e1_id, v_e2_id, v_e3_id, v_e4_id, v_e5_id);
  IF v_n <> 5 THEN
    RAISE EXCEPTION 'POSTCONDITION_FAILED: expected 5 distinct new transactions, found %', v_n;
  END IF;

  -- 4b. economic anchors after the writes
  SELECT coalesce(sum(amount_eur), 0), count(*) INTO v_sum, v_rows
  FROM public.transactions
  WHERE property_name = c_kiti1_name AND subcategory = 'Tenant Payment'
    AND date <= c_cutoff AND NOT coalesce(is_deleted, false);
  IF v_sum <> c_kiti1_rent_after OR v_rows <> c_kiti1_rent_rows_after THEN
    RAISE EXCEPTION 'POSTCONDITION_FAILED: Kiti 1 rent through cutoff = % / % rows (expected % / %)',
      v_sum, v_rows, c_kiti1_rent_after, c_kiti1_rent_rows_after;
  END IF;

  SELECT coalesce(sum(amount_eur), 0), count(*) INTO v_sum, v_rows
  FROM public.transactions
  WHERE property_name = c_kiti2_name AND subcategory = 'Tenant Payment'
    AND date <= c_cutoff AND NOT coalesce(is_deleted, false);
  IF v_sum <> c_kiti2_rent_after OR v_rows <> c_kiti2_rent_rows_after THEN
    RAISE EXCEPTION 'POSTCONDITION_FAILED: Kiti 2 rent through cutoff = % / % rows (expected % / %)',
      v_sum, v_rows, c_kiti2_rent_after, c_kiti2_rent_rows_after;
  END IF;

  SELECT count(*) INTO v_n FROM public.transactions
  WHERE property_name IS NULL AND subcategory = 'Bank Payment to Owner';
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'POSTCONDITION_FAILED: owner-level payment rows = % (expected 2)', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM finance.owner_transaction_links WHERE is_deleted = false;
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'POSTCONDITION_FAILED: active owner links = % (expected 2)', v_n;
  END IF;

  SELECT coalesce(sum(amount_eur), 0) INTO v_sum
  FROM public.transactions
  WHERE (id = ANY(c_payment_anchor_ids) OR id = v_e1_id) AND NOT coalesce(is_deleted, false);
  IF v_sum <> c_payments_after THEN
    RAISE EXCEPTION 'POSTCONDITION_FAILED: payments already made to Tamir = % (expected %)', v_sum, c_payments_after;
  END IF;

  -- 4c. E1 shape and link
  SELECT count(*) INTO v_n FROM public.transactions
  WHERE id = v_e1_id AND date = c_e1_date AND property_id IS NULL AND property_name IS NULL
    AND amount_eur = c_e1_amount AND client_charge IS NULL
    AND category = 'Management' AND subcategory = 'Bank Payment to Owner'
    AND payer = 'Jacob' AND payee = 'Owner' AND review_status = 'active'
    AND description = c_e1_description AND k_note = c_e1_knote;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'POSTCONDITION_FAILED: E1 does not match the locked owner-level shape';
  END IF;

  SELECT count(*) INTO v_n FROM finance.owner_transaction_links
  WHERE id = v_link_id AND transaction_id = v_e1_id AND owner_entity_id = c_owner_entity_id
    AND link_role = 'owner_level_payment' AND review_status = 'approved' AND is_deleted = false
    AND idempotency_key = c_key_e1;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'POSTCONDITION_FAILED: E1 owner link is not a single approved active row';
  END IF;

  -- 4d. E2 / E3 shape: canonical Kiti 1, active, exact dates, custody, no deposit
  SELECT count(*) INTO v_n FROM public.transactions
  WHERE id = v_e2_id AND date = c_e2_date AND amount_eur = c_e2_amount AND client_charge IS NULL
    AND property_id = c_kiti1_property AND property_name = c_kiti1_name
    AND category = 'Management' AND subcategory = 'Tenant Payment'
    AND payer = 'Tenant' AND payee = 'Jacob' AND review_status = 'active'
    AND description = c_e2_description AND k_note = c_e2_knote;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'POSTCONDITION_FAILED: E2 does not match its locked values';
  END IF;

  SELECT count(*) INTO v_n FROM public.transactions
  WHERE id = v_e3_id AND date = c_e3_date AND amount_eur = c_e3_amount AND client_charge IS NULL
    AND property_id = c_kiti1_property AND property_name = c_kiti1_name
    AND category = 'Management' AND subcategory = 'Tenant Payment'
    AND payer = 'Tenant' AND payee = 'Yossi' AND review_status = 'active'
    AND description = c_e3_description AND k_note = c_e3_knote;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'POSTCONDITION_FAILED: E3 does not match its locked values';
  END IF;

  -- neither Kiti 1 receipt may be classified as a deposit
  SELECT count(*) INTO v_n FROM public.transactions
  WHERE id IN (v_e2_id, v_e3_id) AND (subcategory = 'Deposit' OR category = 'Deposit');
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'POSTCONDITION_FAILED: a Kiti 1 rent receipt was classified as a deposit';
  END IF;

  -- 4e. allocation read-back from the stored rows
  SELECT substring(k_note from 'ALLOCATION_MAY_PARTIAL=([0-9.]+)')::numeric,
         substring(k_note from 'ALLOCATION_JUNE_RENT=([0-9.]+)')::numeric,
         substring(k_note from 'ALLOCATION_JUNE_ELECTRICITY=([0-9.]+)')::numeric,
         substring(k_note from 'ACTUAL_OCCUPANCY_FROM=([0-9-]+)')::date,
         substring(k_note from 'CONTRACT_COMMENCEMENT=([0-9-]+)')::date
    INTO v_a_may, v_a_rent, v_a_elec, v_occ_from, v_contract_start
  FROM public.transactions WHERE id = v_e2_id;

  IF v_a_may IS DISTINCT FROM c_e2_may_partial
     OR v_a_rent IS DISTINCT FROM c_e2_june_rent
     OR v_a_elec IS DISTINCT FROM c_e2_june_elec
     OR v_a_may + v_a_rent + v_a_elec <> c_e2_amount THEN
    RAISE EXCEPTION 'POSTCONDITION_FAILED: stored E2 allocation is %/%/% (expected 425 / 700 / 50 = 1175)',
      v_a_may, v_a_rent, v_a_elec;
  END IF;

  IF v_occ_from IS DISTINCT FROM c_occupancy_from
     OR v_contract_start IS DISTINCT FROM c_contract_start
     OR v_occ_from >= v_contract_start THEN
    RAISE EXCEPTION 'POSTCONDITION_FAILED: E2 occupancy/contract dates stored as % / % (expected 2026-05-19 before 2026-05-20)',
      v_occ_from, v_contract_start;
  END IF;

  SELECT substring(k_note from 'ALLOCATION_JULY_RENT=([0-9.]+)')::numeric,
         substring(k_note from 'ALLOCATION_JULY_ELECTRICITY=([0-9.]+)')::numeric
    INTO v_a_jul_rent, v_a_jul_elec
  FROM public.transactions WHERE id = v_e3_id;

  IF v_a_jul_rent IS DISTINCT FROM c_e3_july_rent
     OR v_a_jul_elec IS DISTINCT FROM c_e3_july_elec
     OR v_a_jul_rent + v_a_jul_elec <> c_e3_amount THEN
    RAISE EXCEPTION 'POSTCONDITION_FAILED: stored E3 allocation is %/% (expected 700 / 50 = 750)',
      v_a_jul_rent, v_a_jul_elec;
  END IF;

  -- 4f. E4 gross / E5 cost / custody net = 715 proved from the stored rows
  SELECT count(*) INTO v_n FROM public.transactions
  WHERE id = v_e4_id AND date = c_e4_date AND amount_eur = c_e4_amount AND client_charge IS NULL
    AND property_id = c_kiti2_property AND property_name = c_kiti2_name
    AND category = 'Management' AND subcategory = 'Tenant Payment'
    AND payer = 'Tenant' AND payee = 'Yossi' AND review_status = 'active'
    AND description = c_e4_description AND k_note = c_e4_knote;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'POSTCONDITION_FAILED: E4 does not match its locked gross-rent values';
  END IF;

  SELECT count(*) INTO v_n FROM public.transactions
  WHERE id = v_e5_id AND date = c_e5_date AND amount_eur = c_e5_amount AND client_charge IS NULL
    AND coalesce(client_charge, amount_eur) = c_e5_amount
    AND property_id = c_kiti2_property AND property_name = c_kiti2_name
    AND category = 'Management' AND subcategory = 'Plumber'
    AND payer = 'Tenant' AND payee = 'Plumber' AND review_status = 'active'
    AND description = c_e5_description AND k_note = c_e5_knote;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'POSTCONDITION_FAILED: E5 does not match its locked cost values';
  END IF;

  SELECT substring(k_note from 'GROSS_RENT=([0-9.]+)')::numeric,
         substring(k_note from 'DEDUCTED_AT_SOURCE=([0-9.]+)')::numeric,
         substring(k_note from 'NET_CASH_RECEIVED=([0-9.]+)')::numeric
    INTO v_gross, v_deducted, v_net
  FROM public.transactions WHERE id = v_e4_id;

  IF v_gross IS DISTINCT FROM c_e4_amount
     OR v_deducted IS DISTINCT FROM c_e5_amount
     OR v_net IS DISTINCT FROM c_e4_net_cash
     OR v_gross - v_deducted <> v_net THEN
    RAISE EXCEPTION 'POSTCONDITION_FAILED: E4 cash arithmetic stored as % - % = % (expected 800 - 85 = 715)',
      v_gross, v_deducted, v_net;
  END IF;

  -- custody: the two rows Yossi received minus the cost the tenant settled directly
  SELECT coalesce(sum(amount_eur), 0) INTO v_sum
  FROM public.transactions WHERE id IN (v_e3_id, v_e4_id) AND payee = 'Yossi';
  IF v_sum - c_e5_amount <> c_yossi_custody_delta THEN
    RAISE EXCEPTION 'POSTCONDITION_FAILED: custody delta = % - % = % (expected %)',
      v_sum, c_e5_amount, v_sum - c_e5_amount, c_yossi_custody_delta;
  END IF;

  SELECT coalesce(sum(amount_eur), 0) INTO v_sum
  FROM public.transactions WHERE id = v_e2_id AND payee = 'Jacob';
  IF v_sum <> c_jacob_received THEN
    RAISE EXCEPTION 'POSTCONDITION_FAILED: Jacob received leg = % (expected %)', v_sum, c_jacob_received;
  END IF;

  SELECT coalesce(sum(amount_eur), 0) INTO v_sum
  FROM public.transactions WHERE id = v_e1_id AND payer = 'Jacob';
  IF v_sum <> c_jacob_paid THEN
    RAISE EXCEPTION 'POSTCONDITION_FAILED: Jacob paid leg = % (expected %)', v_sum, c_jacob_paid;
  END IF;

  -- 4g. nothing else moved
  SELECT count(*) INTO v_n FROM public.transactions
  WHERE property_name = c_kiti1_name AND subcategory = 'Tenant Payment' AND property_id IS NULL;
  IF v_n <> v_pre_hist_null_k1 THEN
    RAISE EXCEPTION 'POSTCONDITION_FAILED: historical Kiti 1 rent rows changed (% -> %)', v_pre_hist_null_k1, v_n;
  END IF;

  SELECT count(*) INTO v_n FROM public.transactions
  WHERE property_name = c_kiti2_name AND subcategory = 'Tenant Payment' AND property_id IS NULL;
  IF v_n <> v_pre_hist_null_k2 THEN
    RAISE EXCEPTION 'POSTCONDITION_FAILED: historical Kiti 2 rent rows changed (% -> %)', v_pre_hist_null_k2, v_n;
  END IF;

  SELECT count(*), coalesce(sum(amount_eur), 0) INTO v_n, v_sum
  FROM public.transactions
  WHERE property_name IN (c_kiti1_name, c_kiti2_name) AND date > c_cutoff;
  IF v_n <> v_pre_postcutoff_rows OR v_sum <> v_pre_postcutoff_sum THEN
    RAISE EXCEPTION 'POSTCONDITION_FAILED: post-cutoff Kiti rows changed (%/% -> %/%) - September belongs to pack 2',
      v_pre_postcutoff_rows, v_pre_postcutoff_sum, v_n, v_sum;
  END IF;

  SELECT count(*), coalesce(sum(coalesce(client_charge, amount_eur)), 0) INTO v_n, v_sum
  FROM public.transactions WHERE subcategory = 'Management Fee';
  IF v_n <> v_pre_mgmtfee_rows OR v_sum <> v_pre_mgmtfee_sum THEN
    RAISE EXCEPTION 'POSTCONDITION_FAILED: management fee rows changed (%/% -> %/%)',
      v_pre_mgmtfee_rows, v_pre_mgmtfee_sum, v_n, v_sum;
  END IF;

  SELECT coalesce(sum(amount_eur), 0), count(*) INTO v_sum, v_n
  FROM public.transactions WHERE category = 'JJ';
  IF v_sum <> v_pre_jj_sum OR v_n <> v_pre_jj_rows THEN
    RAISE EXCEPTION 'POSTCONDITION_FAILED: JJ P&L changed (%/% -> %/%) - expected delta EUR 0',
      v_pre_jj_rows, v_pre_jj_sum, v_n, v_sum;
  END IF;

  SELECT coalesce(sum(amount_eur), 0), count(*) INTO v_sum, v_n
  FROM public.transactions
  WHERE property_name IS NOT NULL AND property_name NOT IN (c_kiti1_name, c_kiti2_name);
  IF v_sum <> v_pre_other_sum OR v_n <> v_pre_other_rows THEN
    RAISE EXCEPTION 'POSTCONDITION_FAILED: other properties changed (%/% -> %/%) - expected delta EUR 0',
      v_pre_other_rows, v_pre_other_sum, v_n, v_sum;
  END IF;

  -- no deposit row may be created by this pack, anywhere, at any amount
  SELECT count(*) INTO v_n FROM public.transactions
  WHERE id IN (v_e1_id, v_e2_id, v_e3_id, v_e4_id, v_e5_id) AND (subcategory IN ('Deposit', 'Deposit refund') OR category = 'Deposit');
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'POSTCONDITION_FAILED: this pack created a deposit row (deposits belong to pack 2)';
  END IF;

  -- ==========================================================================
  -- 5. RECEIPT — proves the five events, the link, the closing and both custody
  --    deltas. No credentials, no tokens.
  -- ==========================================================================
  SELECT count(*) INTO v_tx_after FROM public.transactions;  -- information only, never an anchor

  SELECT coalesce(sum(amount_eur), 0) INTO v_sum
  FROM public.transactions
  WHERE property_name = c_kiti1_name AND subcategory = 'Tenant Payment'
    AND date <= c_cutoff AND NOT coalesce(is_deleted, false);

  SELECT coalesce(sum(amount_eur), 0) INTO v_sum2
  FROM public.transactions
  WHERE property_name = c_kiti2_name AND subcategory = 'Tenant Payment'
    AND date <= c_cutoff AND NOT coalesce(is_deleted, false);

  v_text := coalesce(auth.role(), 'none');

  RETURN jsonb_build_object(
    'receipt_version', 3,
    'pack', 'tamir_kiti_cutoff_20260831 (pack 1 of 2)',
    'function_name', 'finance.apply_tamir_kiti_cutoff_20260831',
    'inserted_transactions', 5,
    'inserted_owner_links', 1,
    'expected_audit_rows', 5,
    'events', jsonb_build_object(
      'e1_owner_payment', jsonb_build_object('id', v_e1_id, 'date', c_e1_date,
        'amount', c_e1_amount, 'effect_on_owner', -c_e1_amount, 'link_id', v_link_id),
      'e2_kiti1_receipt', jsonb_build_object('id', v_e2_id, 'date', c_e2_date,
        'amount', c_e2_amount, 'effect_on_owner', c_e2_amount, 'rows_created', 1,
        'allocation', jsonb_build_object(
          'may_partial_2026_05_19_to_2026_05_31', c_e2_may_partial,
          'june_2026_rent', c_e2_june_rent,
          'june_2026_electricity_credit', c_e2_june_elec),
        'actual_occupancy_from', c_occupancy_from,
        'contract_commencement', c_contract_start,
        'custody_holder', 'Jacob'),
      'e3_kiti1_receipt', jsonb_build_object('id', v_e3_id, 'date', c_e3_date,
        'amount', c_e3_amount, 'effect_on_owner', c_e3_amount,
        'allocation', jsonb_build_object('july_2026_rent', c_e3_july_rent,
                                         'july_2026_electricity_credit', c_e3_july_elec),
        'rental_month', '2026-07', 'custody_holder', 'Yossi'),
      'e4_kiti2_rent_gross', jsonb_build_object('id', v_e4_id, 'date', c_e4_date,
        'gross_amount', c_e4_amount, 'effect_on_owner', c_e4_amount,
        'deducted_at_source', c_e5_amount, 'net_cash_received', c_e4_net_cash,
        'rental_month', '2026-07', 'custody_holder', 'Yossi'),
      'e5_kiti2_drain_cost', jsonb_build_object('id', v_e5_id, 'date', c_e5_date,
        'amount', c_e5_amount, 'effect_on_owner', -c_e5_amount,
        'paid_by', 'tenant_at_source', 'service_month', '2026-07')),
    'closing_before', c_closing_before,
    'economic_delta', c_economic_delta,
    'closing_after', c_closing_after,
    'payments_to_owner_before', c_payments_before,
    'payments_to_owner_after', c_payments_after,
    'custody_delta', jsonb_build_object(
      'yossi', c_yossi_custody_delta,
      'yossi_composition', '750 (Kiti 1 July) + 800 (Kiti 2 July gross) - 85 (paid by tenant at source) = 1465',
      'jacob_received', c_jacob_received,
      'jacob_paid_out', c_jacob_paid,
      'jacob_net', c_jacob_received - c_jacob_paid),
    'jj_pnl_delta', 0,
    'other_properties_delta', 0,
    'kiti1_rent_after', v_sum,
    'kiti2_rent_after', v_sum2,
    'deposit_layer', 'not read, not measured, not asserted by this pack',
    'out_of_scope_pack_2', 'new tenants deposit legs, September rent, September brokerage',
    'transactions_total_before', v_tx_before,
    'transactions_total_after', v_tx_after,
    'row_count_anchors_used', false,
    'applied_at', now(),
    'executed_by', auth.uid(),
    'executed_role', v_text
  );
END;
$function$;

-- --------------------------------------------------------------------------
-- EXECUTE grants: least privilege. No new table write, no new bypass.
-- --------------------------------------------------------------------------
REVOKE ALL ON FUNCTION finance.apply_tamir_kiti_cutoff_20260831() FROM PUBLIC;
REVOKE ALL ON FUNCTION finance.apply_tamir_kiti_cutoff_20260831() FROM anon;
GRANT EXECUTE ON FUNCTION finance.apply_tamir_kiti_cutoff_20260831() TO authenticated;
GRANT EXECUTE ON FUNCTION finance.apply_tamir_kiti_cutoff_20260831() TO service_role;

-- --------------------------------------------------------------------------
-- API-reachable wrapper. The finance schema is not exposed to PostgREST, so the
-- CEO session calls this public wrapper. SECURITY INVOKER: it runs as the caller,
-- so the caller still needs EXECUTE here, and the real authorization decision
-- stays inside finance.assert_owner_link_authorized().
-- --------------------------------------------------------------------------
CREATE FUNCTION public.apply_tamir_kiti_cutoff_20260831()
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $wrapper$
  SELECT finance.apply_tamir_kiti_cutoff_20260831();
$wrapper$;

REVOKE ALL ON FUNCTION public.apply_tamir_kiti_cutoff_20260831() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_tamir_kiti_cutoff_20260831() FROM anon;
GRANT EXECUTE ON FUNCTION public.apply_tamir_kiti_cutoff_20260831() TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_tamir_kiti_cutoff_20260831() TO service_role;

COMMENT ON FUNCTION finance.apply_tamir_kiti_cutoff_20260831() IS
  'One-shot atomic Apply for the five verified Tamir Kiti events through 2026-08-31: '
  'E1 EUR 2,625 owner-level payment 2026-06-16 (+ owner link); '
  'E2 EUR 1,175 Kiti 1 receipt 2026-05-19 as ONE row = 425 partial May + 700 June rent + 50 June electricity credit; '
  'E3 EUR 750 Kiti 1 receipt 2026-07-07 = 700 July rent + 50 July electricity credit; '
  'E4 EUR 800 Kiti 2 July rent recorded GROSS; E5 EUR 85 drain clearing paid by the tenant at source, '
  'so custody grows by 715 net on that pair. Delta +EUR 15 -> closing EUR 3,263.75 DUE TO TAMIR. '
  'Anchors are targeted (idempotency, amounts, dates, property ids, owner identity, duplicate guards); '
  'no global or per-property row count is used. Deposits, September rent and September brokerage are out '
  'of scope (pack 2). Replay or pre-image drift raises ALREADY_APPLIED_OR_PREIMAGE_CHANGED; a broken '
  'allocation raises ALLOCATION_LOCK_FAILED. All values locked in the body; takes no arguments.';

COMMENT ON FUNCTION public.apply_tamir_kiti_cutoff_20260831() IS
  'API-reachable wrapper for finance.apply_tamir_kiti_cutoff_20260831(). SECURITY INVOKER, no logic, '
  'no arguments. Exists only because the finance schema is not exposed to PostgREST.';
