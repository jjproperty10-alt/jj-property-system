-- ============================================================================
-- Gap C+D: Missing RPCs for billing state resolution + include/exclude toggle
--
-- PR #166 Consolidation — Hard Gap Audit
--
-- Creates:
--   1. get_draft_lines_for_transactions — fetch draft lines scoped to series+txIds
--   2. get_sent_entries_for_transactions — fetch sent entries scoped to series+txIds
--   3. toggle_draft_line_inclusion — include/exclude a transaction from a draft
--
-- Join paths (verified from production schema):
--   statement_draft_lines.draft_id → statement_drafts.draft_id
--   statement_drafts.series_id = p_series_id (scope to series)
--   sent_entry_snapshots.snapshot_id → sent_statement_snapshots.snapshot_id
--   sent_statement_snapshots.statement_series_id = p_series_id (scope to series)
--
-- All SECURITY DEFINER + require_jj_staff() + SET search_path = ''
-- Idempotent: CREATE OR REPLACE
-- ============================================================================

-- ── 1. get_draft_lines_for_transactions ──────────────────────────────────────
-- Returns draft lines for given transaction IDs within a specific series.
-- The adapter needs: source_transaction_id, include_in_statement, line_id, updated_at

CREATE OR REPLACE FUNCTION statements.get_draft_lines_for_transactions(
  p_series_id        UUID,
  p_transaction_ids  UUID[]
)
RETURNS TABLE (
  id                     UUID,
  source_transaction_id  UUID,
  include_in_statement   BOOLEAN,
  updated_at             TIMESTAMPTZ,
  draft_id               UUID,
  release_amount_eur     NUMERIC,
  reserved_amount_eur    NUMERIC,
  line_notes             TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
BEGIN
  PERFORM statements.require_jj_staff();

  RETURN QUERY
    SELECT
      dl.line_id          AS id,
      dl.source_transaction_id,
      dl.include_in_statement,
      dl.updated_at,
      dl.draft_id,
      dl.release_amount_eur,
      dl.reserved_amount_eur,
      dl.line_notes
    FROM statements.statement_draft_lines dl
    INNER JOIN statements.statement_drafts d
      ON d.draft_id = dl.draft_id
    WHERE d.series_id = p_series_id
      AND dl.source_transaction_id = ANY(p_transaction_ids)
    ORDER BY dl.created_at;
END;
$$;


-- ── 2. get_sent_entries_for_transactions ──────────────────────────────────────
-- Returns sent entry snapshots for given transaction IDs within a specific series.
-- The adapter needs: source_transaction_id, snapshot_id

CREATE OR REPLACE FUNCTION statements.get_sent_entries_for_transactions(
  p_series_id        UUID,
  p_transaction_ids  UUID[]
)
RETURNS TABLE (
  entry_id               UUID,
  source_transaction_id  UUID,
  snapshot_id            UUID,
  released_amount_eur    NUMERIC,
  display_label          TEXT,
  balance_effect         TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
BEGIN
  PERFORM statements.require_jj_staff();

  RETURN QUERY
    SELECT
      se.entry_id,
      se.source_transaction_id,
      se.snapshot_id,
      se.released_amount_eur,
      se.display_label,
      se.balance_effect
    FROM statements.sent_entry_snapshots se
    INNER JOIN statements.sent_statement_snapshots ss
      ON ss.snapshot_id = se.snapshot_id
    WHERE ss.statement_series_id = p_series_id
      AND se.source_transaction_id = ANY(p_transaction_ids)
    ORDER BY se.created_at;
END;
$$;


-- ── 3. toggle_draft_line_inclusion (Gap D) ───────────────────────────────────
-- Sets include_in_statement for a specific draft line.
-- Returns the updated line_id, or raises exception if not found.
-- This is the actual Include/Exclude workflow action.

CREATE OR REPLACE FUNCTION statements.toggle_draft_line_inclusion(
  p_line_id              UUID,
  p_include_in_statement BOOLEAN
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_line_id UUID;
BEGIN
  PERFORM statements.require_jj_staff();

  UPDATE statements.statement_draft_lines
  SET include_in_statement = p_include_in_statement,
      updated_at = now()
  WHERE line_id = p_line_id
  RETURNING line_id INTO v_line_id;

  IF v_line_id IS NULL THEN
    RAISE EXCEPTION 'Draft line not found: %', p_line_id;
  END IF;

  RETURN v_line_id;
END;
$$;


-- ── Grants ───────────────────────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION statements.get_draft_lines_for_transactions TO service_role;
GRANT EXECUTE ON FUNCTION statements.get_sent_entries_for_transactions TO service_role;
GRANT EXECUTE ON FUNCTION statements.toggle_draft_line_inclusion TO service_role;
