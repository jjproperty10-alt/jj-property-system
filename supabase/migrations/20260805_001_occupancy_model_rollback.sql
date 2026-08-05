-- =============================================================================
-- ROLLBACK: 20260805_001_occupancy_model
-- Description: Removes all occupancy model objects from lifecycle schema
-- WARNING: This destroys all occupancy data (agreements, obligations, settlements)
-- =============================================================================
-- Execute this ONLY if rollback is required.
-- public.transactions is NOT affected.
-- =============================================================================

-- Drop view first (depends on both tables)
DROP VIEW IF EXISTS lifecycle.v_occupancy_position;

-- Drop obligations table (has FK to agreements)
DROP TABLE IF EXISTS lifecycle.occupancy_obligations;

-- Drop agreements table
DROP TABLE IF EXISTS lifecycle.occupancy_agreements;

-- =============================================================================
-- END OF ROLLBACK
-- =============================================================================
-- Verify after rollback:
--   SELECT COUNT(*) FROM lifecycle.occupancy_agreements;  -- should error (table gone)
--   SELECT COUNT(*) FROM public.transactions;             -- should be unchanged
-- =============================================================================
