-- Migration: get_owner_statement_snapshots RPC
-- Same pattern as resolve_party_id — SECURITY DEFINER reads from
-- statements schema (not exposed to PostgREST) internally.
-- Grants: service_role only.
-- Safe search_path to prevent search-path injection.

CREATE OR REPLACE FUNCTION public.get_owner_statement_snapshots(
  p_owner_party_id UUID,
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
  snapshot_id UUID,
  version_number INTEGER,
  period_start DATE,
  period_end DATE,
  created_at TIMESTAMPTZ,
  delivery_channels JSONB,
  is_voided BOOLEAN,
  is_current_in_series BOOLEAN,
  parent_snapshot_id UUID
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT
    s.snapshot_id,
    s.version_number,
    s.period_start,
    s.period_end,
    s.created_at,
    s.delivery_channels,
    s.is_voided,
    s.is_current_in_series,
    s.parent_snapshot_id
  FROM statements.sent_statement_snapshots AS s
  WHERE s.owner_party_id = p_owner_party_id
  ORDER BY s.version_number DESC, s.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
$$;

REVOKE ALL
ON FUNCTION public.get_owner_statement_snapshots(UUID, INTEGER)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
ON FUNCTION public.get_owner_statement_snapshots(UUID, INTEGER)
TO service_role;
