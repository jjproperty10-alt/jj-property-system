-- =============================================================================
-- m8_lifecycle_003_nullable_dates
-- Applied: 2026-07-13
-- Author: M8 Business Validation Pilot
--
-- Purpose: Eliminate placeholder dates from production lifecycle data.
--
-- Problem: effective_from (ownership_period) and effective_date (capital_event)
--   were NOT NULL, forcing use of placeholder '2024-01-01' when the real date
--   is unknown. A placeholder date is indistinguishable from a real date to
--   future readers.
--
-- Solution (combines Yossi Option A + B):
--   1. Make both date columns nullable — NULL = date unknown (no ambiguity).
--   2. Add date_confidence TEXT column to both tables:
--        'confirmed'            — date is exact and document-verified
--        'estimated'            — date is approximate (e.g. "Q1 2024")
--        'pending_verification' — date unknown; source document required
--   3. Updated existing pilot records:
--        dates → NULL
--        date_confidence → 'pending_verification'
--
-- Result: no placeholder dates remain in any lifecycle table.
--
-- Rollback:
--   UPDATE lifecycle.ownership_period SET effective_from = '2024-01-01'
--     WHERE recorded_by = 'M8-pilot' AND effective_from IS NULL;
--   UPDATE lifecycle.capital_event SET effective_date = '2024-01-01'
--     WHERE recorded_by = 'M8-pilot' AND effective_date IS NULL;
--   ALTER TABLE lifecycle.ownership_period ALTER COLUMN effective_from SET NOT NULL;
--   ALTER TABLE lifecycle.capital_event ALTER COLUMN effective_date SET NOT NULL;
--   ALTER TABLE lifecycle.ownership_period DROP COLUMN effective_from_confidence;
--   ALTER TABLE lifecycle.capital_event DROP COLUMN effective_date_confidence;
-- =============================================================================

ALTER TABLE lifecycle.ownership_period
  ALTER COLUMN effective_from DROP NOT NULL;

ALTER TABLE lifecycle.ownership_period
  ADD COLUMN effective_from_confidence TEXT
    DEFAULT 'confirmed'
    CHECK (effective_from_confidence IN ('confirmed', 'estimated', 'pending_verification'));

COMMENT ON COLUMN lifecycle.ownership_period.effective_from_confidence IS
  'Confidence level of effective_from date. '
  '''confirmed'' = document-verified exact date. '
  '''estimated'' = approximate date (e.g. Q1 2024). '
  '''pending_verification'' = date unknown; effective_from should be NULL.';

ALTER TABLE lifecycle.capital_event
  ALTER COLUMN effective_date DROP NOT NULL;

ALTER TABLE lifecycle.capital_event
  ADD COLUMN effective_date_confidence TEXT
    DEFAULT 'confirmed'
    CHECK (effective_date_confidence IN ('confirmed', 'estimated', 'pending_verification'));

COMMENT ON COLUMN lifecycle.capital_event.effective_date_confidence IS
  'Confidence level of effective_date. '
  '''confirmed'' = document-verified exact date. '
  '''estimated'' = approximate date (e.g. Q1 2024). '
  '''pending_verification'' = date unknown; effective_date should be NULL.';

UPDATE lifecycle.ownership_period
SET effective_from = NULL, effective_from_confidence = 'pending_verification'
WHERE recorded_by = 'M8-pilot' AND effective_from = '2024-01-01';

UPDATE lifecycle.capital_event
SET effective_date = NULL, effective_date_confidence = 'pending_verification'
WHERE recorded_by = 'M8-pilot' AND effective_date = '2024-01-01';
