-- =============================================================================
-- Migration: 20260805_002_oshrit_occupancy_backfill
-- Description: Seed data for Oshrit Deklia occupancy agreement, 20 monthly
--              obligations (Jan 2025 – Aug 2026), and FIFO settlement evidence.
-- Depends on: 20260805_001_occupancy_model (schema must exist)
-- =============================================================================
-- IDEMPOTENCY:
-- - Agreement: INSERT ... ON CONFLICT (id) DO NOTHING
-- - Obligations: INSERT ... ON CONFLICT (idempotency_key) DO NOTHING
-- - Settlement updates: only applied when settled_amount_eur = 0
--   (already-settled rows are left untouched)
-- - Re-running produces 0 inserts, 0 updates, 0 errors.
-- =============================================================================
-- SAFETY CHECKS:
-- - Aborts if canonical entity identities do not exist
-- - Aborts if source transaction UUIDs do not exist in public.transactions
-- - Never mutates public.transactions
-- =============================================================================

DO $$
DECLARE
  -- Canonical entity identities (from lifecycle.entity_identity)
  v_oshrit_id   UUID := '32a6f2d3-4544-4706-89ae-a27dd889bc99';
  v_yossi_id    UUID := '4de83e15-e8cd-4abc-a104-5ddf8a2a3a4d';
  v_agreement_id UUID := '4cb278c6-50ae-47e0-b055-e5faa1d274d5';

  -- Source transaction UUIDs (from public.transactions — never mutated)
  v_tx_jj_offset UUID := '021b7db5-5a8d-45b6-ba25-60ea389c1c4b';  -- JJ €2,600 offset
  v_tx_jacob_1400 UUID := '04f53577-0228-4ac0-8063-6e3b642a69d8'; -- Jacob €1,400
  v_tx_jacob_5000a UUID := 'b42e3fca-d659-4b58-b6d1-0fe103c2b93d'; -- Jacob €5,000 (Oct 2025)
  v_tx_jacob_5000b UUID := '4a51ff77-6824-478b-91aa-2a005ca090fb'; -- Jacob €5,000 (May 2026)

  v_entity_count  INT;
  v_tx_count      INT;
  v_month         DATE;
  v_key           TEXT;
BEGIN
  -- ===========================================================================
  -- SAFETY CHECK 1: Canonical identities must exist
  -- ===========================================================================
  SELECT COUNT(*) INTO v_entity_count
  FROM lifecycle.entity_identity
  WHERE id IN (v_oshrit_id, v_yossi_id);

  IF v_entity_count <> 2 THEN
    RAISE EXCEPTION 'ABORT: Expected 2 canonical entities (Oshrit + Yossi), found %', v_entity_count;
  END IF;

  -- ===========================================================================
  -- SAFETY CHECK 2: Source transactions must exist
  -- ===========================================================================
  SELECT COUNT(*) INTO v_tx_count
  FROM public.transactions
  WHERE id IN (v_tx_jj_offset, v_tx_jacob_1400, v_tx_jacob_5000a, v_tx_jacob_5000b);

  IF v_tx_count <> 4 THEN
    RAISE EXCEPTION 'ABORT: Expected 4 source transactions, found %', v_tx_count;
  END IF;

  -- ===========================================================================
  -- AGREEMENT: Insert Oshrit occupancy agreement (ON CONFLICT DO NOTHING)
  -- ===========================================================================
  INSERT INTO lifecycle.occupancy_agreements (
    id, property_name, owner_entity_id, occupant_entity_id,
    monthly_amount_eur, currency, effective_from, effective_to,
    due_day, status, governing_evidence, created_by, approved_by
  ) VALUES (
    v_agreement_id,
    'Oshrit Deklia',
    v_oshrit_id,
    v_yossi_id,
    1000.00,
    'EUR',
    '2025-01-01',
    NULL,  -- ongoing
    1,
    'active',
    'Yossi verbal confirmation + Architecture Audit 2026-08-05. Monthly occupancy €1,000 since Jan 2025.',
    'claude-autonomous',
    'Yossi'
  )
  ON CONFLICT (id) DO NOTHING;

  -- ===========================================================================
  -- OBLIGATIONS: Generate Jan 2025 – Aug 2026 (20 months)
  -- ON CONFLICT (idempotency_key) DO NOTHING
  -- ===========================================================================
  v_month := '2025-01-01'::DATE;
  WHILE v_month <= '2026-08-01'::DATE LOOP
    v_key := 'occ:' || v_agreement_id::TEXT || ':' || to_char(v_month, 'YYYY-MM');

    INSERT INTO lifecycle.occupancy_obligations (
      agreement_id, obligation_month, due_date, amount_eur,
      settled_amount_eur, status, settlement_evidence, idempotency_key
    ) VALUES (
      v_agreement_id,
      v_month,
      v_month,  -- due on 1st of month
      1000.00,
      0,        -- initially open; settlement applied below
      'open',
      NULL,
      v_key
    )
    ON CONFLICT (idempotency_key) DO NOTHING;

    v_month := v_month + INTERVAL '1 month';
  END LOOP;

  -- ===========================================================================
  -- SETTLEMENT EVIDENCE: FIFO allocation matching production exactly
  -- Only updates rows where settled_amount_eur = 0 (open obligations).
  -- Already-settled obligations are left untouched.
  -- ===========================================================================

  -- ----- Source 1: JJ offset €2,600 (tx 021b7db5, date 2025-01-14) -----
  -- FIFO: €1,000 to Jan 2025, €1,000 to Feb 2025, €600 to Mar 2025

  -- Jan 2025: JJ €1,000
  UPDATE lifecycle.occupancy_obligations
  SET settled_amount_eur = 1000.00,
      status = 'settled',
      settlement_evidence = '[{"date":"2025-01-14","payer":"JJ","amount":1000,"mechanism":"cross_department_offset","transaction_id":"021b7db5-5a8d-45b6-ba25-60ea389c1c4b"}]'::JSONB,
      updated_at = now()
  WHERE agreement_id = v_agreement_id
    AND obligation_month = '2025-01-01'
    AND settled_amount_eur = 0;

  -- Feb 2025: JJ €1,000
  UPDATE lifecycle.occupancy_obligations
  SET settled_amount_eur = 1000.00,
      status = 'settled',
      settlement_evidence = '[{"date":"2025-01-14","payer":"JJ","amount":1000,"mechanism":"cross_department_offset","transaction_id":"021b7db5-5a8d-45b6-ba25-60ea389c1c4b"}]'::JSONB,
      updated_at = now()
  WHERE agreement_id = v_agreement_id
    AND obligation_month = '2025-02-01'
    AND settled_amount_eur = 0;

  -- Mar 2025: JJ €600 (remainder of €2,600) + Jacob €400 (start of €1,400)
  UPDATE lifecycle.occupancy_obligations
  SET settled_amount_eur = 1000.00,
      status = 'settled',
      settlement_evidence = '[{"date":"2025-01-14","payer":"JJ","amount":600,"mechanism":"cross_department_offset","transaction_id":"021b7db5-5a8d-45b6-ba25-60ea389c1c4b"},{"date":"2025-05-01","payer":"Jacob","amount":400,"mechanism":"physical_transfer","transaction_id":"04f53577-0228-4ac0-8063-6e3b642a69d8"}]'::JSONB,
      updated_at = now()
  WHERE agreement_id = v_agreement_id
    AND obligation_month = '2025-03-01'
    AND settled_amount_eur = 0;

  -- ----- Source 2: Jacob €1,400 (tx 04f53577, date 2025-05-01) -----
  -- FIFO: €400 already applied to Mar 2025 above. Remaining €1,000 to Apr 2025.

  -- Apr 2025: Jacob €1,000
  UPDATE lifecycle.occupancy_obligations
  SET settled_amount_eur = 1000.00,
      status = 'settled',
      settlement_evidence = '[{"date":"2025-05-01","payer":"Jacob","amount":1000,"mechanism":"physical_transfer","transaction_id":"04f53577-0228-4ac0-8063-6e3b642a69d8"}]'::JSONB,
      updated_at = now()
  WHERE agreement_id = v_agreement_id
    AND obligation_month = '2025-04-01'
    AND settled_amount_eur = 0;

  -- ----- Source 3: Jacob €5,000 (tx b42e3fca, date 2025-10-01) -----
  -- FIFO: €1,000 each to May, Jun, Jul, Aug, Sep 2025

  -- May 2025: Jacob €1,000
  UPDATE lifecycle.occupancy_obligations
  SET settled_amount_eur = 1000.00,
      status = 'settled',
      settlement_evidence = '[{"date":"2025-10-01","payer":"Jacob","amount":1000,"mechanism":"physical_transfer","transaction_id":"b42e3fca-d659-4b58-b6d1-0fe103c2b93d"}]'::JSONB,
      updated_at = now()
  WHERE agreement_id = v_agreement_id
    AND obligation_month = '2025-05-01'
    AND settled_amount_eur = 0;

  -- Jun 2025: Jacob €1,000
  UPDATE lifecycle.occupancy_obligations
  SET settled_amount_eur = 1000.00,
      status = 'settled',
      settlement_evidence = '[{"date":"2025-10-01","payer":"Jacob","amount":1000,"mechanism":"physical_transfer","transaction_id":"b42e3fca-d659-4b58-b6d1-0fe103c2b93d"}]'::JSONB,
      updated_at = now()
  WHERE agreement_id = v_agreement_id
    AND obligation_month = '2025-06-01'
    AND settled_amount_eur = 0;

  -- Jul 2025: Jacob €1,000
  UPDATE lifecycle.occupancy_obligations
  SET settled_amount_eur = 1000.00,
      status = 'settled',
      settlement_evidence = '[{"date":"2025-10-01","payer":"Jacob","amount":1000,"mechanism":"physical_transfer","transaction_id":"b42e3fca-d659-4b58-b6d1-0fe103c2b93d"}]'::JSONB,
      updated_at = now()
  WHERE agreement_id = v_agreement_id
    AND obligation_month = '2025-07-01'
    AND settled_amount_eur = 0;

  -- Aug 2025: Jacob €1,000
  UPDATE lifecycle.occupancy_obligations
  SET settled_amount_eur = 1000.00,
      status = 'settled',
      settlement_evidence = '[{"date":"2025-10-01","payer":"Jacob","amount":1000,"mechanism":"physical_transfer","transaction_id":"b42e3fca-d659-4b58-b6d1-0fe103c2b93d"}]'::JSONB,
      updated_at = now()
  WHERE agreement_id = v_agreement_id
    AND obligation_month = '2025-08-01'
    AND settled_amount_eur = 0;

  -- Sep 2025: Jacob €1,000
  UPDATE lifecycle.occupancy_obligations
  SET settled_amount_eur = 1000.00,
      status = 'settled',
      settlement_evidence = '[{"date":"2025-10-01","payer":"Jacob","amount":1000,"mechanism":"physical_transfer","transaction_id":"b42e3fca-d659-4b58-b6d1-0fe103c2b93d"}]'::JSONB,
      updated_at = now()
  WHERE agreement_id = v_agreement_id
    AND obligation_month = '2025-09-01'
    AND settled_amount_eur = 0;

  -- ----- Source 4: Jacob €5,000 (tx 4a51ff77, date 2026-05-17) -----
  -- FIFO: €1,000 each to Oct, Nov, Dec 2025, Jan 2026, Feb 2026

  -- Oct 2025: Jacob €1,000
  UPDATE lifecycle.occupancy_obligations
  SET settled_amount_eur = 1000.00,
      status = 'settled',
      settlement_evidence = '[{"date":"2026-05-17","payer":"Jacob","amount":1000,"mechanism":"physical_transfer","transaction_id":"4a51ff77-6824-478b-91aa-2a005ca090fb"}]'::JSONB,
      updated_at = now()
  WHERE agreement_id = v_agreement_id
    AND obligation_month = '2025-10-01'
    AND settled_amount_eur = 0;

  -- Nov 2025: Jacob €1,000
  UPDATE lifecycle.occupancy_obligations
  SET settled_amount_eur = 1000.00,
      status = 'settled',
      settlement_evidence = '[{"date":"2026-05-17","payer":"Jacob","amount":1000,"mechanism":"physical_transfer","transaction_id":"4a51ff77-6824-478b-91aa-2a005ca090fb"}]'::JSONB,
      updated_at = now()
  WHERE agreement_id = v_agreement_id
    AND obligation_month = '2025-11-01'
    AND settled_amount_eur = 0;

  -- Dec 2025: Jacob €1,000
  UPDATE lifecycle.occupancy_obligations
  SET settled_amount_eur = 1000.00,
      status = 'settled',
      settlement_evidence = '[{"date":"2026-05-17","payer":"Jacob","amount":1000,"mechanism":"physical_transfer","transaction_id":"4a51ff77-6824-478b-91aa-2a005ca090fb"}]'::JSONB,
      updated_at = now()
  WHERE agreement_id = v_agreement_id
    AND obligation_month = '2025-12-01'
    AND settled_amount_eur = 0;

  -- Jan 2026: Jacob €1,000
  UPDATE lifecycle.occupancy_obligations
  SET settled_amount_eur = 1000.00,
      status = 'settled',
      settlement_evidence = '[{"date":"2026-05-17","payer":"Jacob","amount":1000,"mechanism":"physical_transfer","transaction_id":"4a51ff77-6824-478b-91aa-2a005ca090fb"}]'::JSONB,
      updated_at = now()
  WHERE agreement_id = v_agreement_id
    AND obligation_month = '2026-01-01'
    AND settled_amount_eur = 0;

  -- Feb 2026: Jacob €1,000
  UPDATE lifecycle.occupancy_obligations
  SET settled_amount_eur = 1000.00,
      status = 'settled',
      settlement_evidence = '[{"date":"2026-05-17","payer":"Jacob","amount":1000,"mechanism":"physical_transfer","transaction_id":"4a51ff77-6824-478b-91aa-2a005ca090fb"}]'::JSONB,
      updated_at = now()
  WHERE agreement_id = v_agreement_id
    AND obligation_month = '2026-02-01'
    AND settled_amount_eur = 0;

  -- Mar 2026 – Aug 2026: remain OPEN (no settlement evidence)

  RAISE NOTICE 'Oshrit occupancy backfill complete.';
END $$;
