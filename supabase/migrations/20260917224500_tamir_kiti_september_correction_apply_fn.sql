-- PENDING — Tamir Kiti SEPTEMBER correction pack (PACK 2 of 2).
--
-- PREPARED ONLY. NOT A MIGRATION YET, NOT APPLIED, NOT COMMITTED, NOT CALLED.
-- Promote to supabase/migrations/ only after Yossi approves the QA report.
--
-- SCOPE: September 2026 for the Tamir Kiti complex, plus the two deposit legs that belong
-- to the new Kiti 1 tenancy. It must not touch the 2026-08-31 closing of EUR 3,263.75.
--
-- WHAT SEPTEMBER ALREADY CONTAINS (verified read-only in Production 2026-09-16 20:31 UTC).
-- All of it arrived from the WhatsApp import kit of 2026-09-14 marked "no Apply from this kit":
--   896c3124  2026-09-01  Kiti 1  Tenant Payment  EUR 700  payee JJ   September rent          CORRECT
--   c11cd8c4  2026-09-01  Kiti 1  Deposit         EUR  50  payee JJ   electricity advance     MISCLASSIFIED
--   1aecae2c  2026-09-03  Kiti 1  JJ / Brokerage  EUR 500  payee company  commission paid     MISCATEGORISED
--   4fa5ba3a  2026-09-14  Kiti 2  Tenant Payment  EUR 800  payee Yossi  September rent        CORRECT
-- So this pack creates NO rent row: the two rent receipts already exist and are anchored, not
-- rewritten. Their recorded recipients (JJ for Kiti 1, Yossi for Kiti 2) are preserved exactly.
--
-- THE FOUR THINGS THIS PACK DOES:
--   C1  reclassify the EUR 50 out of the deposit layer into electricity collected
--   C2  recategorise the EUR 500 commission out of category JJ into an owner expense
--   N1  record the EUR 200 of deposit the tenant paid and the letting agent holds (cash)
--   N2  apply that EUR 200 to the owner's commission obligation (billing only, no cash)
--
-- WHY THE RECLASSIFICATIONS GO THROUGH statements.apply_correction_case:
-- public.apply_transaction_correction is dead code. Proven in an isolated replica: the
-- trg_transactions_append_only trigger blocks EVERY field that function is allowed to
-- correct (category, subcategory, description, payer, payee, amount_eur, date), and its own
-- error text names the replacement path. So C1 and C2 use the sanctioned machinery:
--   open_correction_case (status open) -> transition_correction_case (approved)
--   -> apply_correction_case (inserts reversal + rebook, marks the case applied)
-- That machinery enforces reversal = -original, rebook = original amount, and net zero for a
-- reclassification. The original rows are never updated; nothing is silently rewritten.
--
-- CONSEQUENCE WORTH APPROVING CONSCIOUSLY: Production has zero statement_series rows and zero
-- correction cases, so this pack is the FIRST user of the statements correction subsystem. It
-- creates one series row for Tamir Kiti 1 (registry.parties already holds Tamir as an active
-- client party, so no new party is created) and two correction cases.
--
-- CONSEQUENCE 2: statements.* all call public.require_jj_staff(['ceo','finance_admin']), which
-- needs a real auth.uid(). service_role CANNOT run this pack, unlike the cutoff pack. It must be
-- called from Yossi's CEO session. The function asserts that up front instead of failing midway.
--
-- THE TWO EUR 200 LAYERS STAY SEPARATE, as Yossi required, and they are two distinct economic
-- events rather than one movement recorded twice:
--   N1 deposit custody: amount_eur 200, client_charge NULL, Tenant -> Broker. Part of the
--      tenant's EUR 750 deposit was genuinely received and is held by the agent.
--   N2 brokerage offset: amount_eur 0, client_charge 200, Owner -> Broker. That held money is
--      applied to the owner's commission obligation. Billing only at the moment of offset, so it
--      creates no second cash movement and is never a self-transfer.
-- Consequences the receipt states outright: deposit received EUR 750, liability to the tenant
-- EUR 750, remaining cash backing EUR 550, owner exposure to restore the deposit EUR 200, and
-- commission cash movement of EUR 500 only.
--
-- COMMISSION IS CHARGED ONCE: EUR 700 total = EUR 500 (existing row, recategorised, still
-- charged once) + EUR 200 (N2). Verified read-only that no second EUR 500 charge and no EUR 200
-- row of any kind exists in Tamir scope.
--
-- JJ P&L ANCHOR: measured as JJ's own money, i.e. category 'JJ' with client_charge IS NULL.
-- Production has 317 rows in category 'JJ'; exactly one carries a client_charge, and it is this
-- very EUR 500 pass-through. So JJ's own P&L delta is EUR 0 (asserted), while the raw category
-- bucket sheds exactly the EUR 500 that never belonged to it (also asserted, as -500). The
-- reversal row deliberately carries client_charge -500 so it stays in the pass-through bucket
-- and does not leak into JJ's own P&L.
--
-- SUBCATEGORY: 'Management' / 'Brokerage' reuses the existing vocabulary (2 rows today) rather
-- than inventing 'Brokerage Fee' (0 rows), so current report mappings pick it up.
--
-- ORDERING: this pack requires the cutoff pack to have been applied first. It asserts all five
-- cutoff idempotency keys are present exactly once, so the sequence cannot be inverted.
--
-- OWNER EFFECT OF THIS PACK: +50 electricity now kept as income, -200 new commission charge,
-- so -150. The 2026-08-31 closing stays EUR 3,263.75 and is asserted unchanged.

CREATE FUNCTION finance.apply_tamir_kiti_september_20260930()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  -- ---------------------------------------------------------------- locked identities
  c_owner_party     CONSTANT uuid := '9a392adb-4f42-46a0-9c1d-672d44e94882';  -- registry.parties: Tamir (client, active)
  c_kiti1_property  CONSTANT uuid := 'b54e015f-05f9-4f75-a3e7-9362c6e2e0ae';
  c_kiti2_property  CONSTANT uuid := '4dc5c26c-ce0c-49ec-8f44-a525f68f0b8a';
  c_kiti1_name      CONSTANT text := 'Tamir Kiti 1';
  c_kiti2_name      CONSTANT text := 'Tamir Kiti 2';
  c_cutoff          CONSTANT date := DATE '2026-08-31';

  -- ---------------------------------------------------------------- the rows this pack acts on
  c_tx_elec50   CONSTANT uuid := 'c11cd8c4-bd12-5501-8f64-66ec1de093d0';  -- C1 subject
  c_tx_brok500  CONSTANT uuid := '1aecae2c-13e0-5fcc-a64d-8a5b003bed62';  -- C2 subject
  c_tx_rent700  CONSTANT uuid := '896c3124-4061-5cb8-b319-32744da183c6';  -- anchor only
  c_tx_k2rent   CONSTANT uuid := '4fa5ba3a-5f49-5a1a-8db4-f4fbaba2ef31';  -- anchor only
  c_tx_dep550   CONSTANT uuid := '79a153ee-54f7-5893-ad27-682d4bc62584';  -- anchor only

  -- ---------------------------------------------------------------- locked amounts
  c_elec_amount     CONSTANT numeric := 50;
  c_brok_paid       CONSTANT numeric := 500;   -- already in the ledger, recategorised here
  c_brok_retained   CONSTANT numeric := 200;   -- new row N2
  c_brok_total      CONSTANT numeric := 700;
  c_dep_at_jj       CONSTANT numeric := 550;
  c_dep_at_agent    CONSTANT numeric := 200;   -- new row N1
  c_dep_total       CONSTANT numeric := 750;
  c_kiti1_sept_rent CONSTANT numeric := 700;
  c_kiti2_sept_rent CONSTANT numeric := 800;
  c_owner_delta     CONSTANT numeric := -150;  -- +50 electricity kept, -200 commission
  c_cutoff_closing  CONSTANT numeric := 3263.75;

  -- Apply-time snapshot of JJ's own management-fee income, refreshed against Production on
  -- 2026-09-16 22:41 UTC. This is a drift guard for this one-shot pack, not a business rule:
  -- the pack must not touch management-fee income, so the figure has to be the same before
  -- the Apply as it was when the pack was verified, and identical again afterwards.
  c_mgmtfee_owner_before CONSTANT numeric := 25904.05;
  c_mgmtfee_rows_before  CONSTANT bigint  := 34;

  c_dep_date  CONSTANT date := DATE '2026-08-26';  -- when the tenant paid the agent
  c_brok_date CONSTANT date := DATE '2026-09-03';  -- when the commission was settled

  -- ---------------------------------------------------------------- cutoff-pack keys (ordering gate)
  c_p1_keys CONSTANT text[] := ARRAY[
    'tamir_owner_pmt_yaakov_2026-06-16_2625',
    'tamir_kiti1_rent_2026-05-19_1175',
    'tamir_kiti1_rent_2026-07-07_750',
    'tamir_kiti2_rent_2026-07-17_800',
    'tamir_kiti2_plumbing_2026-07-17_85'
  ];

  -- ---------------------------------------------------------------- this pack's keys
  c_key_elec_rev  CONSTANT text := 'tamir_kiti1_elec_reversal_2026-09-01_50';
  c_key_elec_reb  CONSTANT text := 'tamir_kiti1_elec_rebook_2026-09-01_50';
  c_key_brok_rev  CONSTANT text := 'tamir_kiti1_brokerage_reversal_2026-09-03_500';
  c_key_brok_reb  CONSTANT text := 'tamir_kiti1_brokerage_rebook_2026-09-03_500';
  c_key_dep_200   CONSTANT text := 'tamir_kiti1_deposit_agent_2026-08-26_200';
  c_key_brok_200  CONSTANT text := 'tamir_kiti1_brokerage_from_deposit_2026-09-03_200';

  -- ---------------------------------------------------------------- client-safe wording
  c_desc_elec_reb CONSTANT text :=
    'Electricity collected for September 2026 (general credit, not a final bill).';
  c_desc_brok_reb CONSTANT text :=
    'Letting commission, September 2026 - paid portion.';
  c_desc_dep_200  CONSTANT text :=
    'Tenant deposit received and held by the letting agent.';
  c_desc_brok_200 CONSTANT text :=
    'Letting commission, September 2026 - portion settled from the deposit funds held by the agent.';

  -- ---------------------------------------------------------------- state
  v_actor uuid;
  v_series_id uuid;
  v_case_elec uuid;
  v_case_brok uuid;
  v_applied_elec jsonb;
  v_applied_brok jsonb;
  v_row_dep200 uuid;
  v_row_brok200 uuid;

  v_orig_elec public.transactions;
  v_orig_brok public.transactions;
  v_rows jsonb;

  v_n bigint;
  v_sum numeric;
  v_rows_ct bigint;
  v_key text;

  -- pre-image snapshots
  v_pre_jj_own_sum numeric;      v_pre_jj_own_rows bigint;
  v_pre_jj_raw_sum numeric;
  v_pre_mgmtfee_owner numeric;   v_pre_mgmtfee_rows bigint;
  v_pre_cutoff_nondep numeric;
  v_pre_k1_rent_cutoff numeric;  v_pre_k2_rent_cutoff numeric;
  v_pre_other_sum numeric;       v_pre_other_rows bigint;
  v_pre_series bigint;           v_pre_cases bigint;
  v_pre_tx bigint;
  v_post_tx bigint;

  -- post measures
  v_dep_liability numeric;
  v_dep_cash_jj numeric;
  v_dep_cash_agent numeric;
  v_brok_owner_total numeric;
  v_elec_income numeric;
BEGIN
  -- ==========================================================================
  -- 0. AUTHORIZATION — a real CEO / finance_admin session is mandatory here,
  --    because every statements.* function demands one. Asserted up front so
  --    service_role fails immediately instead of halfway through.
  -- ==========================================================================
  v_actor := public.require_jj_staff(ARRAY['ceo', 'finance_admin']);

  -- ==========================================================================
  -- 0b. ARITHMETIC LOCKS
  -- ==========================================================================
  IF c_brok_retained + c_brok_paid <> c_brok_total THEN
    RAISE EXCEPTION 'ALLOCATION_LOCK_FAILED: commission % + % <> %', c_brok_retained, c_brok_paid, c_brok_total;
  END IF;
  IF c_dep_at_jj + c_dep_at_agent <> c_dep_total THEN
    RAISE EXCEPTION 'ALLOCATION_LOCK_FAILED: deposit % + % <> %', c_dep_at_jj, c_dep_at_agent, c_dep_total;
  END IF;
  IF c_kiti1_sept_rent + c_elec_amount <> c_dep_total THEN
    RAISE EXCEPTION 'ALLOCATION_LOCK_FAILED: Kiti 1 September charge % + % should equal the % contractual monthly total',
      c_kiti1_sept_rent, c_elec_amount, c_dep_total;
  END IF;
  IF c_elec_amount - c_brok_retained <> c_owner_delta THEN
    RAISE EXCEPTION 'ALLOCATION_LOCK_FAILED: owner delta % does not equal % - %',
      c_owner_delta, c_elec_amount, c_brok_retained;
  END IF;
  IF c_brok_date <= c_cutoff THEN
    RAISE EXCEPTION 'ALLOCATION_LOCK_FAILED: the commission charge % must fall after the % cutoff', c_brok_date, c_cutoff;
  END IF;

  -- ==========================================================================
  -- 1. ORDERING GATE — the cutoff pack must already be applied
  -- ==========================================================================
  FOREACH v_key IN ARRAY c_p1_keys LOOP
    SELECT count(*) INTO v_n FROM public.transactions WHERE k_note LIKE '%IDEMPOTENCY=' || v_key || '%';
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'CUTOFF_PACK_NOT_APPLIED: key % owns % rows (expected 1). Apply the cutoff pack first.', v_key, v_n;
    END IF;
  END LOOP;

  -- ==========================================================================
  -- 2. IDEMPOTENCY — none of this pack's six keys may exist
  -- ==========================================================================
  SELECT count(*) INTO v_n FROM public.transactions
  WHERE k_note LIKE '%IDEMPOTENCY=' || c_key_elec_rev || '%'
     OR k_note LIKE '%IDEMPOTENCY=' || c_key_elec_reb || '%'
     OR k_note LIKE '%IDEMPOTENCY=' || c_key_brok_rev || '%'
     OR k_note LIKE '%IDEMPOTENCY=' || c_key_brok_reb || '%'
     OR k_note LIKE '%IDEMPOTENCY=' || c_key_dep_200 || '%'
     OR k_note LIKE '%IDEMPOTENCY=' || c_key_brok_200 || '%';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'ALREADY_APPLIED_OR_PREIMAGE_CHANGED: % row(s) already carry a September-pack key', v_n;
  END IF;

  -- no correction case may already exist against either subject row
  SELECT count(*) INTO v_n FROM statements.correction_cases
  WHERE original_transaction_id IN (c_tx_elec50, c_tx_brok500);
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'ALREADY_APPLIED_OR_PREIMAGE_CHANGED: % correction case(s) already target these rows', v_n;
  END IF;

  -- ==========================================================================
  -- 3. PRE-IMAGE OF THE TWO SUBJECT ROWS — exact expected values, no guessing.
  --    This is the same expected-old-value discipline the governed correction
  --    function used, enforced here because that function can no longer run.
  -- ==========================================================================
  SELECT * INTO v_orig_elec FROM public.transactions WHERE id = c_tx_elec50 FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ALREADY_APPLIED_OR_PREIMAGE_CHANGED: the EUR 50 row % no longer exists', c_tx_elec50;
  END IF;
  IF v_orig_elec.date <> DATE '2026-09-01'
     OR v_orig_elec.property_id IS DISTINCT FROM c_kiti1_property
     OR v_orig_elec.property_name <> c_kiti1_name
     OR v_orig_elec.category <> 'Management'
     OR v_orig_elec.subcategory <> 'Deposit'
     OR v_orig_elec.payer <> 'Tenant'
     OR v_orig_elec.payee <> 'JJ'
     OR v_orig_elec.amount_eur <> c_elec_amount
     OR v_orig_elec.client_charge IS NOT NULL
     OR coalesce(v_orig_elec.is_deleted, false)
     OR v_orig_elec.review_status <> 'active' THEN
    RAISE EXCEPTION 'ALREADY_APPLIED_OR_PREIMAGE_CHANGED: the EUR 50 row is not in its expected pre-image state';
  END IF;

  SELECT * INTO v_orig_brok FROM public.transactions WHERE id = c_tx_brok500 FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ALREADY_APPLIED_OR_PREIMAGE_CHANGED: the EUR 500 commission row % no longer exists', c_tx_brok500;
  END IF;
  IF v_orig_brok.date <> c_brok_date
     OR v_orig_brok.property_id IS DISTINCT FROM c_kiti1_property
     OR v_orig_brok.property_name <> c_kiti1_name
     OR v_orig_brok.category <> 'JJ'
     OR v_orig_brok.subcategory <> 'Brokerage'
     OR v_orig_brok.payer <> 'Jacob'
     OR v_orig_brok.payee <> 'company'
     OR v_orig_brok.amount_eur <> c_brok_paid
     OR v_orig_brok.client_charge <> c_brok_paid
     OR coalesce(v_orig_brok.is_deleted, false)
     OR v_orig_brok.review_status <> 'active' THEN
    RAISE EXCEPTION 'ALREADY_APPLIED_OR_PREIMAGE_CHANGED: the EUR 500 commission row is not in its expected pre-image state';
  END IF;

  -- ==========================================================================
  -- 4. ANCHORS THIS PACK MUST NOT CREATE OR DISTURB
  -- ==========================================================================
  -- Kiti 1 September rent: exactly one row, EUR 700, recipient as recorded
  SELECT count(*) INTO v_n FROM public.transactions
  WHERE id = c_tx_rent700 AND date = DATE '2026-09-01' AND property_name = c_kiti1_name
    AND subcategory = 'Tenant Payment' AND amount_eur = c_kiti1_sept_rent AND payee = 'JJ'
    AND NOT coalesce(is_deleted, false);
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'ALREADY_APPLIED_OR_PREIMAGE_CHANGED: the Kiti 1 September rent row is not EUR % with its recorded recipient', c_kiti1_sept_rent;
  END IF;

  SELECT count(*) INTO v_n FROM public.transactions
  WHERE property_name = c_kiti1_name AND subcategory = 'Tenant Payment'
    AND date BETWEEN DATE '2026-09-01' AND DATE '2026-09-30' AND NOT coalesce(is_deleted, false);
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'ALREADY_APPLIED_OR_PREIMAGE_CHANGED: Kiti 1 has % September rent rows (expected exactly 1)', v_n;
  END IF;

  -- Kiti 2 September rent: exactly one row, EUR 800, recipient preserved
  SELECT count(*) INTO v_n FROM public.transactions
  WHERE id = c_tx_k2rent AND date = DATE '2026-09-14' AND property_name = c_kiti2_name
    AND subcategory = 'Tenant Payment' AND amount_eur = c_kiti2_sept_rent AND payee = 'Yossi'
    AND NOT coalesce(is_deleted, false);
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'ALREADY_APPLIED_OR_PREIMAGE_CHANGED: the Kiti 2 September rent row is not EUR % with its recorded recipient', c_kiti2_sept_rent;
  END IF;

  SELECT count(*) INTO v_n FROM public.transactions
  WHERE property_name = c_kiti2_name AND subcategory = 'Tenant Payment'
    AND date BETWEEN DATE '2026-09-01' AND DATE '2026-09-30' AND NOT coalesce(is_deleted, false);
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'ALREADY_APPLIED_OR_PREIMAGE_CHANGED: Kiti 2 has % September rent rows (expected exactly 1)', v_n;
  END IF;

  -- the EUR 550 deposit already at JJ
  SELECT count(*) INTO v_n FROM public.transactions
  WHERE id = c_tx_dep550 AND date = c_dep_date AND subcategory = 'Deposit'
    AND amount_eur = c_dep_at_jj AND payee = 'JJ' AND NOT coalesce(is_deleted, false);
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'ALREADY_APPLIED_OR_PREIMAGE_CHANGED: the EUR % deposit row is not in its expected state', c_dep_at_jj;
  END IF;

  -- deposit layer before: exactly the EUR 550 and the misclassified EUR 50
  SELECT coalesce(sum(amount_eur), 0), count(*) INTO v_sum, v_rows_ct
  FROM public.transactions
  WHERE property_name = c_kiti1_name AND subcategory IN ('Deposit', 'Deposit refund')
    AND NOT coalesce(is_deleted, false);
  IF v_sum <> c_dep_at_jj + c_elec_amount OR v_rows_ct <> 2 THEN
    RAISE EXCEPTION 'ALREADY_APPLIED_OR_PREIMAGE_CHANGED: Kiti 1 deposit layer is % across % rows (expected % across 2)',
      v_sum, v_rows_ct, c_dep_at_jj + c_elec_amount;
  END IF;

  -- no EUR 200 row of any kind may already exist in Tamir scope
  SELECT count(*) INTO v_n FROM public.transactions
  WHERE property_name LIKE 'Tamir%' AND date >= DATE '2026-08-01'
    AND (abs(coalesce(amount_eur, 0)) BETWEEN 199.5 AND 200.5
      OR abs(coalesce(client_charge, 0)) BETWEEN 199.5 AND 200.5);
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'ALREADY_APPLIED_OR_PREIMAGE_CHANGED: % existing EUR 200 row(s) in Tamir scope since 2026-08-01', v_n;
  END IF;

  -- commission must currently be charged exactly once, at EUR 500
  SELECT coalesce(sum(coalesce(client_charge, amount_eur)), 0), count(*) INTO v_sum, v_rows_ct
  FROM public.transactions
  WHERE property_name = c_kiti1_name AND subcategory IN ('Brokerage', 'Brokerage Fee')
    AND NOT coalesce(is_deleted, false);
  IF v_sum <> c_brok_paid OR v_rows_ct <> 1 THEN
    RAISE EXCEPTION 'ALREADY_APPLIED_OR_PREIMAGE_CHANGED: commission currently charged % across % row(s) (expected % across 1)',
      v_sum, v_rows_ct, c_brok_paid;
  END IF;

  -- identity anchors
  SELECT count(*) INTO v_n FROM registry.parties
  WHERE party_id = c_owner_party AND status = 'active';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'ALREADY_APPLIED_OR_PREIMAGE_CHANGED: owner party % not found active', c_owner_party;
  END IF;

  SELECT count(*) INTO v_n FROM public.properties
  WHERE id = c_kiti1_property AND name = c_kiti1_name AND NOT coalesce(is_deleted, false);
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'ALREADY_APPLIED_OR_PREIMAGE_CHANGED: canonical property % not found active', c_kiti1_name;
  END IF;

  -- ==========================================================================
  -- 5. PRE-IMAGE SNAPSHOTS for the neutrality postconditions
  -- ==========================================================================
  SELECT coalesce(sum(amount_eur), 0), count(*) INTO v_pre_jj_own_sum, v_pre_jj_own_rows
  FROM public.transactions WHERE category = 'JJ' AND client_charge IS NULL;

  SELECT coalesce(sum(amount_eur), 0) INTO v_pre_jj_raw_sum
  FROM public.transactions WHERE category = 'JJ';

  SELECT coalesce(sum(coalesce(client_charge, amount_eur)), 0), count(*)
    INTO v_pre_mgmtfee_owner, v_pre_mgmtfee_rows
  FROM public.transactions WHERE subcategory = 'Management Fee';
  IF v_pre_mgmtfee_owner <> c_mgmtfee_owner_before OR v_pre_mgmtfee_rows <> c_mgmtfee_rows_before THEN
    RAISE EXCEPTION 'ALREADY_APPLIED_OR_PREIMAGE_CHANGED: management fee income = % across % rows (expected % / %)',
      v_pre_mgmtfee_owner, v_pre_mgmtfee_rows, c_mgmtfee_owner_before, c_mgmtfee_rows_before;
  END IF;

  -- the cutoff economics: everything on or before 2026-08-31 except the deposit layer
  SELECT coalesce(sum(coalesce(client_charge, amount_eur)), 0) INTO v_pre_cutoff_nondep
  FROM public.transactions
  WHERE property_name IN (c_kiti1_name, c_kiti2_name) AND date <= c_cutoff
    AND subcategory NOT IN ('Deposit', 'Deposit refund') AND NOT coalesce(is_deleted, false);

  SELECT coalesce(sum(amount_eur), 0) INTO v_pre_k1_rent_cutoff
  FROM public.transactions
  WHERE property_name = c_kiti1_name AND subcategory = 'Tenant Payment'
    AND date <= c_cutoff AND NOT coalesce(is_deleted, false);

  SELECT coalesce(sum(amount_eur), 0) INTO v_pre_k2_rent_cutoff
  FROM public.transactions
  WHERE property_name = c_kiti2_name AND subcategory = 'Tenant Payment'
    AND date <= c_cutoff AND NOT coalesce(is_deleted, false);

  SELECT coalesce(sum(amount_eur), 0), count(*) INTO v_pre_other_sum, v_pre_other_rows
  FROM public.transactions
  WHERE property_name IS NOT NULL AND property_name NOT IN (c_kiti1_name, c_kiti2_name);

  SELECT count(*) INTO v_pre_series FROM statements.statement_series;
  SELECT count(*) INTO v_pre_cases FROM statements.correction_cases;
  SELECT count(*) INTO v_pre_tx FROM public.transactions;  -- receipt information only

  -- ==========================================================================
  -- 6. WRITES
  -- ==========================================================================
  -- 6a. the statement series these correction cases hang from. property_acquisition_id stays
  -- NULL: no acquisition record exists for Kiti 1, and the column is nullable.
  INSERT INTO statements.statement_series (
    owner_party_id, owner_display_name, property_display_name, series_status, created_by
  ) VALUES (
    c_owner_party, 'Tamir', c_kiti1_name, 'active', v_actor
  )
  RETURNING series_id INTO v_series_id;

  -- 6b. C1 — the EUR 50 leaves the deposit layer and becomes electricity collected.
  v_case_elec := statements.open_correction_case(
    v_series_id,
    c_tx_elec50,
    'reclassification',
    'September 2026 electricity credit was imported as a deposit. Its own description states it is '
    'not rent and not a final electricity charge, so it is reclassified out of the deposit layer. '
    'Amount, date, recipient and property are unchanged.',
    c_elec_amount,
    c_elec_amount,
    'high',
    jsonb_build_object('category', v_orig_elec.category, 'subcategory', v_orig_elec.subcategory,
                       'description', v_orig_elec.description),
    jsonb_build_object('subcategory', 'Electricity', 'description', c_desc_elec_reb)
  );

  PERFORM statements.transition_correction_case(
    v_case_elec, 'approved',
    'Approved by Yossi as part of the Tamir Kiti September correction pack.'
  );

  -- reversal mirrors the original exactly; rebook carries only the approved corrected fields
  v_rows := jsonb_build_array(
    jsonb_build_object(
      'role', 'reversal',
      'date', to_char(v_orig_elec.date, 'YYYY-MM-DD'),
      'property_id', v_orig_elec.property_id::text,
      'property_name', v_orig_elec.property_name,
      'category', v_orig_elec.category,
      'subcategory', v_orig_elec.subcategory,
      'description', v_orig_elec.description,
      'payer', v_orig_elec.payer,
      'payee', v_orig_elec.payee,
      'amount_eur', (-1 * c_elec_amount)::text,
      'k_note', 'PROVENANCE=YOSSI_CONFIRMED;REVERSAL_OF=' || c_tx_elec50 ||
                ';REASON=misclassified_as_deposit;CASE=' || v_case_elec ||
                ';AUDIT_REF=kiti_september_pack_2026-09-16;IDEMPOTENCY=' || c_key_elec_rev
    ),
    jsonb_build_object(
      'role', 'rebook',
      'date', to_char(v_orig_elec.date, 'YYYY-MM-DD'),
      'property_id', v_orig_elec.property_id::text,
      'property_name', v_orig_elec.property_name,
      'category', v_orig_elec.category,
      'subcategory', 'Electricity',
      'description', c_desc_elec_reb,
      'payer', v_orig_elec.payer,
      'payee', v_orig_elec.payee,
      'amount_eur', c_elec_amount::text,
      'k_note', 'PROVENANCE=YOSSI_CONFIRMED;REBOOK_OF=' || c_tx_elec50 ||
                ';ELECTRICITY_CREDIT=general_not_final_bill;DEPOSIT_INCLUDED=false;SERVICE_MONTH=2026-09' ||
                ';CASE=' || v_case_elec ||
                ';AUDIT_REF=kiti_september_pack_2026-09-16;IDEMPOTENCY=' || c_key_elec_reb
    )
  );
  v_applied_elec := statements.apply_correction_case(v_case_elec, v_rows);

  -- 6c. C2 — the EUR 500 commission leaves category JJ and becomes an owner expense.
  -- The reversal deliberately carries client_charge -500 so it stays in the pass-through
  -- bucket; otherwise it would land in JJ's own P&L and break the EUR 0 invariant.
  v_case_brok := statements.open_correction_case(
    v_series_id,
    c_tx_brok500,
    'reclassification',
    'September 2026 letting commission was imported under category JJ although it is charged to '
    'the owner and is neither JJ income nor a JJ operating cost. Recategorised as an owner '
    'expense. Amount, date, payer, payee and property are unchanged, and the owner is still '
    'charged exactly once.',
    c_brok_paid,
    c_brok_paid,
    'high',
    jsonb_build_object('category', v_orig_brok.category, 'subcategory', v_orig_brok.subcategory,
                       'description', v_orig_brok.description),
    jsonb_build_object('category', 'Management', 'subcategory', 'Brokerage', 'description', c_desc_brok_reb)
  );

  PERFORM statements.transition_correction_case(
    v_case_brok, 'approved',
    'Approved by Yossi as part of the Tamir Kiti September correction pack.'
  );

  v_rows := jsonb_build_array(
    jsonb_build_object(
      'role', 'reversal',
      'date', to_char(v_orig_brok.date, 'YYYY-MM-DD'),
      'property_id', v_orig_brok.property_id::text,
      'property_name', v_orig_brok.property_name,
      'category', v_orig_brok.category,
      'subcategory', v_orig_brok.subcategory,
      'description', v_orig_brok.description,
      'payer', v_orig_brok.payer,
      'payee', v_orig_brok.payee,
      'amount_eur', (-1 * c_brok_paid)::text,
      'client_charge', (-1 * c_brok_paid)::text,
      'k_note', 'PROVENANCE=YOSSI_CONFIRMED;REVERSAL_OF=' || c_tx_brok500 ||
                ';REASON=owner_expense_miscategorised_as_JJ;PASSTHROUGH=true;CASE=' || v_case_brok ||
                ';AUDIT_REF=kiti_september_pack_2026-09-16;IDEMPOTENCY=' || c_key_brok_rev
    ),
    jsonb_build_object(
      'role', 'rebook',
      'date', to_char(v_orig_brok.date, 'YYYY-MM-DD'),
      'property_id', v_orig_brok.property_id::text,
      'property_name', v_orig_brok.property_name,
      'category', 'Management',
      'subcategory', 'Brokerage',
      'description', c_desc_brok_reb,
      'payer', v_orig_brok.payer,
      'payee', v_orig_brok.payee,
      'amount_eur', c_brok_paid::text,
      'client_charge', c_brok_paid::text,
      'k_note', 'PROVENANCE=YOSSI_CONFIRMED;REBOOK_OF=' || c_tx_brok500 ||
                ';OWNER_CHARGEABLE=Tamir;COMMISSION_PART=paid_by_company;COMMISSION_TOTAL=700' ||
                ';SERVICE_MONTH=2026-09;CASE=' || v_case_brok ||
                ';AUDIT_REF=kiti_september_pack_2026-09-16;IDEMPOTENCY=' || c_key_brok_reb
    )
  );
  v_applied_brok := statements.apply_correction_case(v_case_brok, v_rows);

  -- 6d. N1 — deposit money the tenant paid and the agent retained. A liability, never income,
  -- so client_charge stays NULL and the row never enters the owner's income.
  INSERT INTO public.transactions (
    date, category, subcategory, payer, payee, amount_eur, client_charge,
    property_id, property_name, description, k_note, review_status
  ) VALUES (
    c_dep_date, 'Management', 'Deposit', 'Tenant', 'Broker',
    c_dep_at_agent, NULL, c_kiti1_property, c_kiti1_name, c_desc_dep_200,
    'PROVENANCE=YOSSI_CONFIRMED;DEPOSIT_LAYER=true;NOT_INCOME=true;CUSTODY_HOLDER=Broker;'
    'DEPOSIT_TOTAL=750;DEPOSIT_AT_JJ=550;DEPOSIT_AT_AGENT=200;'
    'APPLIED_TO=' || c_key_brok_200 || ';'
    'AUDIT_REF=kiti_september_pack_2026-09-16;IDEMPOTENCY=' || c_key_dep_200,
    'active'
  )
  RETURNING id INTO v_row_dep200;

  -- 6e. N2 — the same EUR 200 applied to the owner's commission obligation. Billing only:
  -- amount_eur = 0 because no second cash movement happened, client_charge = 200 because the
  -- owner is charged. Payer is the canonical 'Owner' token (103 rows use it) and payee is the
  -- agent, so this is a real two-party offset and never a self-transfer. The shape matches 105
  -- existing zero-cash owner charges in the ledger.
  INSERT INTO public.transactions (
    date, category, subcategory, payer, payee, amount_eur, client_charge,
    property_id, property_name, description, k_note, review_status
  ) VALUES (
    c_brok_date, 'Management', 'Brokerage', 'Owner', 'Broker',
    0, c_brok_retained, c_kiti1_property, c_kiti1_name, c_desc_brok_200,
    'PROVENANCE=YOSSI_CONFIRMED;OWNER_CHARGEABLE=Tamir;COMMISSION_PART=retained_from_deposit;'
    'COMMISSION_TOTAL=700;BILLING_ONLY=true;CASH_MOVEMENT=0;'
    'SETTLED_FROM=deposit_funds_held_by_agent;DEPOSIT_APPLIED=200;'
    'NO_JJ_CASH=true;DEPOSIT_LIABILITY_UNCHANGED=750;OWNER_EXPOSURE_TO_RESTORE_DEPOSIT=200;'
    'SERVICE_MONTH=2026-09;SOURCE_DEPOSIT=' || c_key_dep_200 || ';'
    'AUDIT_REF=kiti_september_pack_2026-09-16;IDEMPOTENCY=' || c_key_brok_200,
    'active'
  )
  RETURNING id INTO v_row_brok200;

  -- ==========================================================================
  -- 7. POSTCONDITIONS
  -- ==========================================================================
  -- 7a. exactly six rows appended, one series, two applied cases.
  -- Counted by this pack's own audit reference rather than by a global row total, so unrelated
  -- ledger activity can never make the assertion pass or fail for the wrong reason.
  SELECT count(*) INTO v_n FROM public.transactions
  WHERE k_note LIKE '%AUDIT_REF=kiti_september_pack_2026-09-16%';
  IF v_n <> 6 THEN
    RAISE EXCEPTION 'POSTCONDITION_FAILED: this pack owns % rows (expected 6)', v_n;
  END IF;
  SELECT count(*) INTO v_post_tx FROM public.transactions;  -- receipt information only

  IF (v_applied_elec->>'inserted_count')::int <> 2 OR (v_applied_brok->>'inserted_count')::int <> 2 THEN
    RAISE EXCEPTION 'POSTCONDITION_FAILED: correction cases inserted % and % rows (expected 2 each)',
      v_applied_elec->>'inserted_count', v_applied_brok->>'inserted_count';
  END IF;

  SELECT count(*) INTO v_n FROM statements.statement_series;
  IF v_n <> v_pre_series + 1 THEN
    RAISE EXCEPTION 'POSTCONDITION_FAILED: statement_series moved from % to %', v_pre_series, v_n;
  END IF;

  SELECT count(*) INTO v_n FROM statements.correction_cases
  WHERE id IN (v_case_elec, v_case_brok) AND status = 'applied' AND series_id = v_series_id;
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'POSTCONDITION_FAILED: % of 2 correction cases reached status applied', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM statements.correction_applied_transactions
  WHERE case_id IN (v_case_elec, v_case_brok) AND entry_role IN ('reversal', 'rebook');
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'POSTCONDITION_FAILED: % of 4 reversal/rebook lineage rows recorded', v_n;
  END IF;

  -- 7b. NO SILENT UPDATE — both originals must be byte-for-byte untouched
  SELECT count(*) INTO v_n FROM public.transactions
  WHERE id = c_tx_elec50 AND subcategory = 'Deposit' AND category = 'Management'
    AND amount_eur = c_elec_amount AND client_charge IS NULL
    AND description = v_orig_elec.description AND NOT coalesce(is_deleted, false);
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'POSTCONDITION_FAILED: the original EUR 50 row was modified instead of reversed';
  END IF;

  SELECT count(*) INTO v_n FROM public.transactions
  WHERE id = c_tx_brok500 AND category = 'JJ' AND subcategory = 'Brokerage'
    AND amount_eur = c_brok_paid AND client_charge = c_brok_paid
    AND description = v_orig_brok.description AND NOT coalesce(is_deleted, false);
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'POSTCONDITION_FAILED: the original EUR 500 row was modified instead of reversed';
  END IF;

  -- 7c. each of the six keys owns exactly one row
  FOREACH v_key IN ARRAY ARRAY[c_key_elec_rev, c_key_elec_reb, c_key_brok_rev,
                               c_key_brok_reb, c_key_dep_200, c_key_brok_200] LOOP
    SELECT count(*) INTO v_n FROM public.transactions WHERE k_note LIKE '%IDEMPOTENCY=' || v_key || '%';
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'POSTCONDITION_FAILED: key % owns % rows (expected 1)', v_key, v_n;
    END IF;
  END LOOP;

  -- 7d. DEPOSIT LAYER — EUR 750 received, EUR 550 in cash at JJ, EUR 200 consumed as commission
  SELECT coalesce(sum(amount_eur), 0), count(*) INTO v_dep_liability, v_rows_ct
  FROM public.transactions
  WHERE property_name = c_kiti1_name AND subcategory IN ('Deposit', 'Deposit refund')
    AND NOT coalesce(is_deleted, false);
  IF v_dep_liability <> c_dep_total OR v_rows_ct <> 4 THEN
    RAISE EXCEPTION 'POSTCONDITION_FAILED: deposit layer is % across % rows (expected % across 4)',
      v_dep_liability, v_rows_ct, c_dep_total;
  END IF;

  SELECT coalesce(sum(amount_eur), 0) INTO v_dep_cash_jj
  FROM public.transactions
  WHERE property_name = c_kiti1_name AND subcategory IN ('Deposit', 'Deposit refund')
    AND payee = 'JJ' AND NOT coalesce(is_deleted, false);
  IF v_dep_cash_jj <> c_dep_at_jj THEN
    RAISE EXCEPTION 'POSTCONDITION_FAILED: deposit cash at JJ is % (expected %)', v_dep_cash_jj, c_dep_at_jj;
  END IF;

  SELECT coalesce(sum(amount_eur), 0) INTO v_dep_cash_agent
  FROM public.transactions
  WHERE property_name = c_kiti1_name AND subcategory IN ('Deposit', 'Deposit refund')
    AND payee = 'Broker' AND NOT coalesce(is_deleted, false);
  IF v_dep_cash_agent <> c_dep_at_agent THEN
    RAISE EXCEPTION 'POSTCONDITION_FAILED: deposit received at the agent is % (expected %)',
      v_dep_cash_agent, c_dep_at_agent;
  END IF;

  -- the misclassified EUR 50 nets out of the deposit layer entirely
  SELECT coalesce(sum(amount_eur), 0) INTO v_sum
  FROM public.transactions
  WHERE property_name = c_kiti1_name AND subcategory = 'Deposit'
    AND date = DATE '2026-09-01' AND NOT coalesce(is_deleted, false);
  IF v_sum <> 0 THEN
    RAISE EXCEPTION 'POSTCONDITION_FAILED: the September EUR 50 still contributes % to the deposit layer', v_sum;
  END IF;

  -- 7e. ELECTRICITY — EUR 50 collected, in its own layer, separate from rent
  SELECT coalesce(sum(coalesce(client_charge, amount_eur)), 0) INTO v_elec_income
  FROM public.transactions
  WHERE property_name = c_kiti1_name AND subcategory IN ('Electricity', 'Electricity bill')
    AND date BETWEEN DATE '2026-09-01' AND DATE '2026-09-30' AND NOT coalesce(is_deleted, false);
  IF v_elec_income <> c_elec_amount THEN
    RAISE EXCEPTION 'POSTCONDITION_FAILED: September electricity collected is % (expected %)',
      v_elec_income, c_elec_amount;
  END IF;

  -- 7f. COMMISSION — charged to the owner exactly once, EUR 700 in total
  SELECT coalesce(sum(coalesce(client_charge, amount_eur)), 0), count(*)
    INTO v_brok_owner_total, v_rows_ct
  FROM public.transactions
  WHERE property_name = c_kiti1_name AND subcategory IN ('Brokerage', 'Brokerage Fee')
    AND NOT coalesce(is_deleted, false);
  IF v_brok_owner_total <> c_brok_total OR v_rows_ct <> 4 THEN
    RAISE EXCEPTION 'POSTCONDITION_FAILED: commission charged to the owner is % across % rows (expected % across 4)',
      v_brok_owner_total, v_rows_ct, c_brok_total;
  END IF;

  -- the retained leg is billing only: it charges the owner without inventing a cash movement
  SELECT count(*) INTO v_n FROM public.transactions
  WHERE id = v_row_brok200 AND amount_eur = 0 AND client_charge = c_brok_retained
    AND payer = 'Owner' AND payee = 'Broker'
    AND category = 'Management' AND subcategory = 'Brokerage';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'POSTCONDITION_FAILED: the retained commission leg is not a billing-only Owner to agent charge (amount 0 / charge %)',
      c_brok_retained;
  END IF;

  -- so commission CASH is only the EUR 500 that actually left: original 500, reversed -500,
  -- rebooked 500, plus zero for the retained leg
  SELECT coalesce(sum(amount_eur), 0) INTO v_sum
  FROM public.transactions
  WHERE property_name = c_kiti1_name AND subcategory IN ('Brokerage', 'Brokerage Fee')
    AND NOT coalesce(is_deleted, false);
  IF v_sum <> c_brok_paid THEN
    RAISE EXCEPTION 'POSTCONDITION_FAILED: commission cash movement is % (expected only the % actually paid)',
      v_sum, c_brok_paid;
  END IF;

  -- and no row this pack created may be a self-transfer
  SELECT count(*) INTO v_n FROM public.transactions
  WHERE k_note LIKE '%AUDIT_REF=kiti_september_pack_2026-09-16%' AND payer = payee;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'POSTCONDITION_FAILED: % row(s) in this pack record the same party as payer and payee', v_n;
  END IF;

  -- and no owner charge is left sitting under category JJ. The original row and its reversal both
  -- stay in place, as they must, so the test is that they net to zero rather than that the rows
  -- have disappeared.
  SELECT coalesce(sum(client_charge), 0) INTO v_sum FROM public.transactions
  WHERE property_name LIKE 'Tamir%' AND category = 'JJ' AND client_charge IS NOT NULL
    AND NOT coalesce(is_deleted, false);
  IF v_sum <> 0 THEN
    RAISE EXCEPTION 'POSTCONDITION_FAILED: % of owner charge still sits under category JJ in Tamir scope', v_sum;
  END IF;

  -- 7g. JJ NEUTRALITY — own P&L untouched, raw bucket sheds exactly the pass-through EUR 500
  SELECT coalesce(sum(amount_eur), 0), count(*) INTO v_sum, v_rows_ct
  FROM public.transactions WHERE category = 'JJ' AND client_charge IS NULL;
  IF v_sum <> v_pre_jj_own_sum OR v_rows_ct <> v_pre_jj_own_rows THEN
    RAISE EXCEPTION 'POSTCONDITION_FAILED: JJ own P&L moved from % (% rows) to % (% rows); delta must be 0',
      v_pre_jj_own_sum, v_pre_jj_own_rows, v_sum, v_rows_ct;
  END IF;

  SELECT coalesce(sum(amount_eur), 0) INTO v_sum FROM public.transactions WHERE category = 'JJ';
  IF v_sum <> v_pre_jj_raw_sum - c_brok_paid THEN
    RAISE EXCEPTION 'POSTCONDITION_FAILED: raw JJ bucket is % (expected % - %)',
      v_sum, v_pre_jj_raw_sum, c_brok_paid;
  END IF;

  SELECT coalesce(sum(coalesce(client_charge, amount_eur)), 0), count(*) INTO v_sum, v_rows_ct
  FROM public.transactions WHERE subcategory = 'Management Fee';
  IF v_sum <> v_pre_mgmtfee_owner OR v_rows_ct <> v_pre_mgmtfee_rows THEN
    RAISE EXCEPTION 'POSTCONDITION_FAILED: JJ management fee income changed from % to %', v_pre_mgmtfee_owner, v_sum;
  END IF;

  -- 7h. CUSTODY — no cash moved for JJ or either partner
  SELECT coalesce(sum(CASE WHEN payee IN ('JJ', 'Yossi', 'Jacob', 'company', 'Anastasia')
                          THEN amount_eur ELSE 0 END), 0) INTO v_sum
  FROM public.transactions
  WHERE id IN (v_row_dep200, v_row_brok200)
     OR id IN (SELECT applied_transaction_id FROM statements.correction_applied_transactions
                WHERE case_id IN (v_case_elec, v_case_brok));
  IF v_sum <> 0 THEN
    RAISE EXCEPTION 'POSTCONDITION_FAILED: this pack moved % of custody cash (expected 0)', v_sum;
  END IF;

  -- 7i. THE 2026-08-31 CLOSING IS UNTOUCHED. The only new row dated on or before the cutoff is
  -- the deposit receipt, and a deposit is neither income nor expense.
  SELECT coalesce(sum(coalesce(client_charge, amount_eur)), 0) INTO v_sum
  FROM public.transactions
  WHERE property_name IN (c_kiti1_name, c_kiti2_name) AND date <= c_cutoff
    AND subcategory NOT IN ('Deposit', 'Deposit refund') AND NOT coalesce(is_deleted, false);
  IF v_sum <> v_pre_cutoff_nondep THEN
    RAISE EXCEPTION 'POSTCONDITION_FAILED: cutoff economics moved from % to %', v_pre_cutoff_nondep, v_sum;
  END IF;

  SELECT count(*) INTO v_n FROM public.transactions
  WHERE date <= c_cutoff
    AND (id IN (v_row_dep200, v_row_brok200)
      OR id IN (SELECT applied_transaction_id FROM statements.correction_applied_transactions
                 WHERE case_id IN (v_case_elec, v_case_brok)));
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'POSTCONDITION_FAILED: % new rows fall on or before the cutoff (expected exactly 1, the deposit)', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM public.transactions
  WHERE id = v_row_dep200 AND date <= c_cutoff AND subcategory = 'Deposit' AND client_charge IS NULL;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'POSTCONDITION_FAILED: the pre-cutoff row is not a non-chargeable deposit';
  END IF;

  SELECT coalesce(sum(amount_eur), 0) INTO v_sum
  FROM public.transactions
  WHERE property_name = c_kiti1_name AND subcategory = 'Tenant Payment'
    AND date <= c_cutoff AND NOT coalesce(is_deleted, false);
  IF v_sum <> v_pre_k1_rent_cutoff THEN
    RAISE EXCEPTION 'POSTCONDITION_FAILED: Kiti 1 rent through the cutoff moved from % to %', v_pre_k1_rent_cutoff, v_sum;
  END IF;

  SELECT coalesce(sum(amount_eur), 0) INTO v_sum
  FROM public.transactions
  WHERE property_name = c_kiti2_name AND subcategory = 'Tenant Payment'
    AND date <= c_cutoff AND NOT coalesce(is_deleted, false);
  IF v_sum <> v_pre_k2_rent_cutoff THEN
    RAISE EXCEPTION 'POSTCONDITION_FAILED: Kiti 2 rent through the cutoff moved from % to %', v_pre_k2_rent_cutoff, v_sum;
  END IF;

  -- 7j. NOTHING ELSE MOVED
  SELECT coalesce(sum(amount_eur), 0), count(*) INTO v_sum, v_rows_ct
  FROM public.transactions
  WHERE property_name IS NOT NULL AND property_name NOT IN (c_kiti1_name, c_kiti2_name);
  IF v_sum <> v_pre_other_sum OR v_rows_ct <> v_pre_other_rows THEN
    RAISE EXCEPTION 'POSTCONDITION_FAILED: other properties moved from % (% rows) to % (% rows)',
      v_pre_other_sum, v_pre_other_rows, v_sum, v_rows_ct;
  END IF;

  -- the September rent rows are still single and still carry their recorded recipients
  SELECT count(*) INTO v_n FROM public.transactions
  WHERE subcategory = 'Tenant Payment' AND date BETWEEN DATE '2026-09-01' AND DATE '2026-09-30'
    AND property_name IN (c_kiti1_name, c_kiti2_name) AND NOT coalesce(is_deleted, false);
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'POSTCONDITION_FAILED: % September rent rows across the Kiti flats (expected 2)', v_n;
  END IF;

  -- ==========================================================================
  -- 8. RECEIPT
  -- ==========================================================================
  RETURN jsonb_build_object(
    'version', 1,
    'pack', 'tamir_kiti_september_2026',
    'applied_at', now(),
    'applied_by', v_actor,
    'transactions_inserted', 6,
    'correction_cases_applied', 2,
    'statement_series_created', v_series_id,
    'mechanism', 'statements.apply_correction_case (reversal + rebook); originals never updated',
    'originals_untouched', jsonb_build_array(c_tx_elec50, c_tx_brok500),
    'rows', jsonb_build_object(
      'electricity_reversal', v_applied_elec->'applied_transaction_ids'->0,
      'electricity_rebook',   v_applied_elec->'applied_transaction_ids'->1,
      'commission_reversal',  v_applied_brok->'applied_transaction_ids'->0,
      'commission_rebook',    v_applied_brok->'applied_transaction_ids'->1,
      'deposit_at_agent',     v_row_dep200,
      'commission_from_deposit', v_row_brok200
    ),
    'deposit_layer', jsonb_build_object(
      'received_total', v_dep_liability,
      'cash_at_jj', v_dep_cash_jj,
      'received_at_agent', v_dep_cash_agent,
      'applied_to_commission', c_brok_retained,
      'remaining_cash_backing', v_dep_cash_jj,
      'liability_to_tenant', c_dep_total,
      'owner_exposure_to_restore_deposit', c_dep_total - v_dep_cash_jj,
      'is_income', false
    ),
    'agent_deposit_position', jsonb_build_object(
      'received', v_dep_cash_agent,
      'applied_to_commission', c_brok_retained,
      'remaining_held', v_dep_cash_agent - c_brok_retained
    ),
    'owner_expense', jsonb_build_object(
      'commission_total', v_brok_owner_total,
      'commission_retained_from_deposit', c_brok_retained,
      'commission_paid_by_company', c_brok_paid,
      'commission_cash_movement', c_brok_paid,
      'retained_leg_is_billing_only', true,
      'charged_twice', false
    ),
    'owner_income_september', jsonb_build_object(
      'kiti1_rent', c_kiti1_sept_rent,
      'kiti1_electricity_collected', v_elec_income,
      'kiti2_rent', c_kiti2_sept_rent,
      'created_by_this_pack', jsonb_build_array('kiti1_electricity_collected')
    ),
    'jj_pnl', jsonb_build_object(
      'own_money_sum_before', v_pre_jj_own_sum,
      'own_money_sum_after', v_pre_jj_own_sum,
      'own_money_delta', 0,
      'raw_category_bucket_before', v_pre_jj_raw_sum,
      'raw_category_bucket_after', v_pre_jj_raw_sum - c_brok_paid,
      'raw_category_bucket_delta', -1 * c_brok_paid,
      'raw_delta_reason', 'the pass-through commission leaves category JJ; it was never JJ money',
      'management_fee_income_unchanged', v_pre_mgmtfee_owner
    ),
    'custody_delta', jsonb_build_object(
      'JJ', 0, 'Yossi', 0, 'Jacob', 0, 'company', 0,
      'agent_net_after_offset', v_dep_cash_agent - c_brok_retained),
    'cutoff_closing', jsonb_build_object(
      'as_of', c_cutoff,
      'due_to_tamir', c_cutoff_closing,
      'changed_by_this_pack', false
    ),
    'owner_balance_delta_this_pack', c_owner_delta,
    'transactions_total_before', v_pre_tx,
    'transactions_total_after', v_post_tx
  );
END;
$function$;

REVOKE ALL ON FUNCTION finance.apply_tamir_kiti_september_20260930() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION finance.apply_tamir_kiti_september_20260930() TO authenticated;
-- service_role is deliberately NOT granted: statements.* requires a real auth.uid(),
-- so a service_role call could only ever fail. The CEO session is the only valid caller.

COMMENT ON FUNCTION finance.apply_tamir_kiti_september_20260930() IS
'Tamir Kiti September 2026 correction pack (pack 2 of 2). Appends six rows: reversal + rebook '
'moving EUR 50 out of the deposit layer into electricity collected, reversal + rebook moving the '
'EUR 500 letting commission out of category JJ into an owner expense, the EUR 200 of deposit the '
'agent holds as cash, and that same EUR 200 applied to the commission as a billing-only charge '
'(amount 0 / client_charge 200, Owner to agent). Reclassifications run through '
'statements.apply_correction_case, so no historical row is ever updated. Commission totals EUR 700 '
'charged once with EUR 500 of cash movement; deposit totals EUR 750 and stays a liability with '
'EUR 550 of cash backing and EUR 200 of owner exposure; JJ own P&L delta EUR 0; the '
'2026-08-31 closing of EUR 3,263.75 is asserted unchanged. Requires the cutoff pack first, is '
'idempotent through six keys, and requires a CEO / finance_admin session.';

-- thin public wrapper: public is the schema exposed to the API
CREATE FUNCTION public.apply_tamir_kiti_september_20260930()
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $wrapper$
  SELECT finance.apply_tamir_kiti_september_20260930();
$wrapper$;

REVOKE ALL ON FUNCTION public.apply_tamir_kiti_september_20260930() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_tamir_kiti_september_20260930() TO authenticated;

COMMENT ON FUNCTION public.apply_tamir_kiti_september_20260930() IS
'API-facing wrapper for finance.apply_tamir_kiti_september_20260930(). SECURITY INVOKER: the '
'caller''s own CEO / finance_admin identity is what the underlying function authorises against.';
