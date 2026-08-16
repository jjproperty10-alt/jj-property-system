-- ============================================================================
-- Gap E+F: FIFO Allocation Engine + Integrity Enforcement
-- PR #166 Hard Gap Audit
--
-- Constitutional:
--   P-ARCH-1: NULL = Unknown. Never 0 or placeholder.
--   P-ARCH-5: No FK to public.transactions (cross-schema reads OK, no constraints).
--   P-LEDGER-6: Owner-facing amounts = COALESCE(client_charge, amount_eur).
--
-- Changes:
--   1. REPLACE allocate_payment — adds integrity checks:
--      - Verify both transactions exist + active
--      - No over-allocation of charge
--      - No over-allocation of payment
--   2. NEW fifo_allocate_payment — automatic oldest-first allocation
--
-- Idempotent: CREATE OR REPLACE on functions.
-- Rollback: Re-apply original allocate_payment from 20260816_001.
-- ============================================================================


-- ── 1. Enhanced allocate_payment with integrity enforcement ──────────────────

CREATE OR REPLACE FUNCTION statements.allocate_payment(
  p_series_id             UUID,
  p_payment_transaction_id UUID,
  p_charge_transaction_id  UUID,
  p_amount_eur            NUMERIC,
  p_method                TEXT DEFAULT 'manual',
  p_notes                 TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id UUID;
  v_charge_amount NUMERIC;
  v_payment_amount NUMERIC;
  v_existing_charge_alloc NUMERIC;
  v_existing_payment_alloc NUMERIC;
  v_charge_exists BOOLEAN;
  v_payment_exists BOOLEAN;
BEGIN
  -- Staff gate
  PERFORM statements.require_jj_staff();

  -- Validate method
  IF p_method NOT IN ('fifo', 'manual') THEN
    RAISE EXCEPTION 'Invalid allocation method: %', p_method;
  END IF;

  -- Validate amount
  IF p_amount_eur <= 0 THEN
    RAISE EXCEPTION 'Allocation amount must be positive';
  END IF;

  -- ── Integrity Gate 1: Charge transaction exists + active ──
  SELECT true, COALESCE(client_charge, amount_eur)
  INTO v_charge_exists, v_charge_amount
  FROM public.transactions
  WHERE id = p_charge_transaction_id
    AND (review_status = 'active' OR review_status IS NULL);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Charge transaction not found or not active: %', p_charge_transaction_id;
  END IF;

  -- ── Integrity Gate 2: Payment transaction exists + active ──
  SELECT true, COALESCE(client_charge, amount_eur)
  INTO v_payment_exists, v_payment_amount
  FROM public.transactions
  WHERE id = p_payment_transaction_id
    AND (review_status = 'active' OR review_status IS NULL);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment transaction not found or not active: %', p_payment_transaction_id;
  END IF;

  -- ── Integrity Gate 3: No over-allocation of charge ──
  -- Sum existing allocations for this charge, excluding the current pair (for upsert)
  SELECT COALESCE(SUM(allocated_amount_eur), 0)
  INTO v_existing_charge_alloc
  FROM statements.payment_allocations
  WHERE charge_transaction_id = p_charge_transaction_id
    AND payment_transaction_id != p_payment_transaction_id;

  IF v_existing_charge_alloc + p_amount_eur > ABS(v_charge_amount) THEN
    RAISE EXCEPTION 'Over-allocation: charge % has €% allocated + €% new = €% > €% total',
      p_charge_transaction_id,
      v_existing_charge_alloc,
      p_amount_eur,
      v_existing_charge_alloc + p_amount_eur,
      ABS(v_charge_amount);
  END IF;

  -- ── Integrity Gate 4: No over-allocation of payment ──
  SELECT COALESCE(SUM(allocated_amount_eur), 0)
  INTO v_existing_payment_alloc
  FROM statements.payment_allocations
  WHERE payment_transaction_id = p_payment_transaction_id
    AND charge_transaction_id != p_charge_transaction_id;

  IF v_existing_payment_alloc + p_amount_eur > ABS(v_payment_amount) THEN
    RAISE EXCEPTION 'Over-allocation: payment % has €% allocated + €% new = €% > €% total',
      p_payment_transaction_id,
      v_existing_payment_alloc,
      p_amount_eur,
      v_existing_payment_alloc + p_amount_eur,
      ABS(v_payment_amount);
  END IF;

  -- ── Insert/Upsert ──
  INSERT INTO statements.payment_allocations (
    series_id, payment_transaction_id, charge_transaction_id,
    allocated_amount_eur, allocation_method, allocated_by, notes
  )
  VALUES (
    p_series_id, p_payment_transaction_id, p_charge_transaction_id,
    p_amount_eur, p_method, auth.uid(), p_notes
  )
  ON CONFLICT (payment_transaction_id, charge_transaction_id)
  DO UPDATE SET
    allocated_amount_eur = EXCLUDED.allocated_amount_eur,
    allocation_method = EXCLUDED.allocation_method,
    allocated_by = EXCLUDED.allocated_by,
    notes = EXCLUDED.notes,
    allocated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;


-- ── 2. FIFO automatic allocation ────────────────────────────────────────────
-- Takes a payment transaction and allocates it to the oldest unpaid charges
-- in the same series. Returns number of allocations created.
--
-- Algorithm:
--   1. Get all charge transactions for this series (from draft lines)
--   2. Order by date ASC (oldest first)
--   3. For each charge, compute remaining = charge_amount - sum(existing allocations)
--   4. Allocate min(remaining, available_payment) to each charge
--   5. Stop when payment is fully allocated or no more charges

CREATE OR REPLACE FUNCTION statements.fifo_allocate_payment(
  p_series_id              UUID,
  p_payment_transaction_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_payment_amount NUMERIC;
  v_remaining_payment NUMERIC;
  v_charge RECORD;
  v_charge_remaining NUMERIC;
  v_alloc_amount NUMERIC;
  v_existing_alloc NUMERIC;
  v_count INTEGER := 0;
BEGIN
  -- Staff gate
  PERFORM statements.require_jj_staff();

  -- Get payment amount (P-LEDGER-6: owner-facing amount)
  SELECT ABS(COALESCE(client_charge, amount_eur))
  INTO v_payment_amount
  FROM public.transactions
  WHERE id = p_payment_transaction_id
    AND (review_status = 'active' OR review_status IS NULL);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment transaction not found or not active: %', p_payment_transaction_id;
  END IF;

  -- Compute how much of this payment is already allocated
  SELECT COALESCE(SUM(allocated_amount_eur), 0)
  INTO v_existing_alloc
  FROM statements.payment_allocations
  WHERE payment_transaction_id = p_payment_transaction_id;

  v_remaining_payment := v_payment_amount - v_existing_alloc;

  IF v_remaining_payment <= 0 THEN
    -- Payment is fully allocated already
    RETURN 0;
  END IF;

  -- Get charge transactions for this series, ordered by date ASC (FIFO)
  -- Charges are identified via draft lines → drafts → series
  -- Each charge has a remaining balance = charge_amount - sum(allocations)
  FOR v_charge IN
    SELECT
      t.id AS tx_id,
      t.date AS tx_date,
      ABS(COALESCE(t.client_charge, t.amount_eur)) AS charge_amount,
      COALESCE(
        (SELECT SUM(pa.allocated_amount_eur)
         FROM statements.payment_allocations pa
         WHERE pa.charge_transaction_id = t.id),
        0
      ) AS already_allocated
    FROM statements.statement_draft_lines sdl
    JOIN statements.statement_drafts sd ON sd.draft_id = sdl.draft_id
    JOIN public.transactions t ON t.id = sdl.transaction_id
    WHERE sd.series_id = p_series_id
      AND sdl.include_in_statement = true
      AND sdl.line_type = 'charge'
      AND (t.review_status = 'active' OR t.review_status IS NULL)
    ORDER BY t.date ASC, t.created_at ASC
  LOOP
    -- Skip if charge is fully allocated
    v_charge_remaining := v_charge.charge_amount - v_charge.already_allocated;
    IF v_charge_remaining <= 0 THEN
      CONTINUE;
    END IF;

    -- Allocate min(remaining_payment, charge_remaining)
    v_alloc_amount := LEAST(v_remaining_payment, v_charge_remaining);

    -- Insert allocation (use the integrity-enforcing allocate_payment)
    -- But call directly to avoid double staff-gate overhead
    INSERT INTO statements.payment_allocations (
      series_id, payment_transaction_id, charge_transaction_id,
      allocated_amount_eur, allocation_method, allocated_by, notes
    )
    VALUES (
      p_series_id, p_payment_transaction_id, v_charge.tx_id,
      v_alloc_amount, 'fifo', auth.uid(), 'Auto-allocated via FIFO'
    )
    ON CONFLICT (payment_transaction_id, charge_transaction_id)
    DO UPDATE SET
      allocated_amount_eur = EXCLUDED.allocated_amount_eur,
      allocation_method = 'fifo',
      allocated_by = EXCLUDED.allocated_by,
      notes = 'Auto-allocated via FIFO (updated)',
      allocated_at = now();

    v_count := v_count + 1;
    v_remaining_payment := v_remaining_payment - v_alloc_amount;

    EXIT WHEN v_remaining_payment <= 0;
  END LOOP;

  RETURN v_count;
END;
$$;


-- ── 3. Grants ───────────────────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION statements.allocate_payment TO service_role;
GRANT EXECUTE ON FUNCTION statements.fifo_allocate_payment TO service_role;


-- ── 4. Verification ─────────────────────────────────────────────────────────
-- SELECT proname FROM pg_proc
--   WHERE pronamespace = 'statements'::regnamespace
--     AND proname IN ('allocate_payment', 'fifo_allocate_payment');
-- Expected: 2 rows
