-- ============================================================================
-- Gap J+K: Language Persistence + Presentation Overrides
-- PR #166 Hard Gap Audit
--
-- Stores per-owner report preferences (language, RTL, header/footer text,
-- visibility toggles). Persisted in statement_series metadata — no new table.
--
-- statement_series already has all required columns for series-level config.
-- We add a dedicated report_preferences JSONB column for flexible per-owner
-- presentation settings that don't warrant individual columns.
--
-- Constitutional:
--   P-ARCH-1: NULL = Unknown. Defaults are applied at read time, not stored.
--   P-ARCH-5: No FK between schemas.
-- ============================================================================

-- Add report_preferences JSONB column to statement_series
-- Stores: { language, isRtl, titleOverride, headerText, footerText,
--           showInternalMargin, showPaymentAllocations, showBillingState,
--           dateFormat, currencyFormat }
-- NULL = use system defaults. Partial objects OK (merge with defaults at read time).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'statements'
      AND table_name = 'statement_series'
      AND column_name = 'report_preferences'
  ) THEN
    ALTER TABLE statements.statement_series
      ADD COLUMN report_preferences JSONB DEFAULT NULL;

    COMMENT ON COLUMN statements.statement_series.report_preferences IS
      'Per-owner report presentation preferences (language, RTL, header/footer, visibility toggles). NULL = system defaults.';
  END IF;
END $$;


-- ── RPC: get/set report preferences ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION statements.get_report_preferences(
  p_series_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_prefs JSONB;
BEGIN
  PERFORM statements.require_jj_staff();

  SELECT report_preferences INTO v_prefs
  FROM statements.statement_series
  WHERE series_id = p_series_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Statement series not found: %', p_series_id;
  END IF;

  -- Return stored prefs (caller merges with defaults)
  RETURN COALESCE(v_prefs, '{}'::JSONB);
END;
$$;


CREATE OR REPLACE FUNCTION statements.set_report_preferences(
  p_series_id UUID,
  p_preferences JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM statements.require_jj_staff();

  UPDATE statements.statement_series
  SET report_preferences = p_preferences,
      updated_at = now()
  WHERE series_id = p_series_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Statement series not found: %', p_series_id;
  END IF;
END;
$$;


-- ── Grants ──────────────────────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION statements.get_report_preferences TO service_role;
GRANT EXECUTE ON FUNCTION statements.set_report_preferences TO service_role;
