-- =============================================================================
-- ROLLBACK: 20260805_002_oshrit_occupancy_backfill
-- Description: Removes Oshrit-specific backfill data only.
--              Does NOT drop the occupancy schema (that belongs to migration 001).
-- WARNING: This deletes all Oshrit obligations and the Oshrit agreement.
-- =============================================================================
-- public.transactions is NOT affected.
-- =============================================================================

-- Delete obligations first (FK to agreements)
DELETE FROM lifecycle.occupancy_obligations
WHERE agreement_id = '4cb278c6-50ae-47e0-b055-e5faa1d274d5';

-- Delete the agreement
DELETE FROM lifecycle.occupancy_agreements
WHERE id = '4cb278c6-50ae-47e0-b055-e5faa1d274d5';

-- =============================================================================
-- Verify after rollback:
--   SELECT COUNT(*) FROM lifecycle.occupancy_agreements;   -- should be 0
--   SELECT COUNT(*) FROM lifecycle.occupancy_obligations;  -- should be 0
--   SELECT * FROM lifecycle.v_occupancy_position;          -- should return 0 rows
--   SELECT COUNT(*) FROM public.transactions;              -- should be unchanged
-- =============================================================================
