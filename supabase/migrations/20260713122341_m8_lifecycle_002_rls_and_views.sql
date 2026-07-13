-- =============================================================================
-- m8_lifecycle_002_rls_and_views
-- Migration version: 20260713122341
-- Author: M8 Investment Lifecycle Delivery (2026-07-13)
--
-- What this migration does:
--   1. Enables RLS (deny-all baseline) on all 7 lifecycle tables.
--   2. Creates 3 views:
--        - v_lifecycle_active_events       : all non-void events (admin)
--        - v_partner_investment_statement  : partner-facing, ZERO jj_ fields
--        - v_jj_lifecycle_internal         : JJ-internal, includes all margin fields
--
-- Security model:
--   - RLS enabled + 0 policies = service_role only access (deny-all for anon/authenticated)
--   - All views use security_invoker = true
--   - v_partner_investment_statement NEVER exposes jj_cost_basis_eur or jj_margin_from_entry_eur
--   - v_jj_lifecycle_internal is JJ-admin only — NEVER wire to partner-facing APIs
--
-- Rollback: DROP SCHEMA lifecycle CASCADE; (removes schema, tables, views, RLS)
-- =============================================================================

-- ── 1. RLS — deny-all on all 7 lifecycle tables ──────────────────────────────

ALTER TABLE lifecycle.entity_identity       ENABLE ROW LEVEL SECURITY;
ALTER TABLE lifecycle.business_source       ENABLE ROW LEVEL SECURITY;
ALTER TABLE lifecycle.property_acquisition  ENABLE ROW LEVEL SECURITY;
ALTER TABLE lifecycle.partner_entry         ENABLE ROW LEVEL SECURITY;
ALTER TABLE lifecycle.capital_event         ENABLE ROW LEVEL SECURITY;
ALTER TABLE lifecycle.ownership_period      ENABLE ROW LEVEL SECURITY;
ALTER TABLE lifecycle.property_disposition  ENABLE ROW LEVEL SECURITY;

-- Zero policies intentionally — service_role bypasses RLS; anon/authenticated are denied.
-- If a future policy is needed, add it explicitly: DO NOT remove ENABLE ROW LEVEL SECURITY.

-- ── 2. View: v_lifecycle_active_events ───────────────────────────────────────
-- All non-void events across the 5 event tables, unified.
-- Audience: JJ admin (no margin fields here — metadata only).

CREATE OR REPLACE VIEW lifecycle.v_lifecycle_active_events
WITH (security_invoker = true) AS

  -- property_acquisition
  SELECT
    'property_acquisition'        AS event_table,
    pa.id                         AS event_id,
    pa.property_name,
    NULL::UUID                    AS entity_id,
    NULL::TEXT                    AS entity_name,
    pa.acquisition_date           AS effective_date,
    pa.event_type,
    pa.event_nature,
    pa.status,
    pa.recorded_by,
    pa.created_at,
    pa.supersedes_event_id
  FROM lifecycle.property_acquisition pa
  WHERE pa.status != 'void'

UNION ALL

  -- partner_entry
  SELECT
    'partner_entry'               AS event_table,
    pe.id                         AS event_id,
    pe.property_name,
    pe.entity_id,
    ei.canonical_name             AS entity_name,
    pe.entry_date                 AS effective_date,
    pe.event_type,
    pe.event_nature,
    pe.status,
    pe.recorded_by,
    pe.created_at,
    pe.supersedes_event_id
  FROM lifecycle.partner_entry pe
  JOIN lifecycle.entity_identity ei ON ei.id = pe.entity_id
  WHERE pe.status != 'void'

UNION ALL

  -- capital_event
  SELECT
    'capital_event'               AS event_table,
    ce.id                         AS event_id,
    ce.property_name,
    ce.entity_id,
    ei.canonical_name             AS entity_name,
    ce.effective_date,
    ce.event_type,
    ce.event_nature,
    ce.status,
    ce.recorded_by,
    ce.created_at,
    ce.supersedes_event_id
  FROM lifecycle.capital_event ce
  JOIN lifecycle.entity_identity ei ON ei.id = ce.entity_id
  WHERE ce.status != 'void'

UNION ALL

  -- ownership_period
  SELECT
    'ownership_period'            AS event_table,
    op.id                         AS event_id,
    op.property_name,
    op.entity_id,
    ei.canonical_name             AS entity_name,
    op.effective_from             AS effective_date,
    op.event_type,
    op.event_nature,
    op.status,
    op.recorded_by,
    op.created_at,
    op.supersedes_event_id
  FROM lifecycle.ownership_period op
  JOIN lifecycle.entity_identity ei ON ei.id = op.entity_id
  WHERE op.status != 'void'

UNION ALL

  -- property_disposition
  SELECT
    'property_disposition'        AS event_table,
    pd.id                         AS event_id,
    pd.property_name,
    pd.disposing_entity_id        AS entity_id,
    ei.canonical_name             AS entity_name,
    pd.disposition_date           AS effective_date,
    pd.event_type,
    pd.event_nature,
    pd.status,
    pd.recorded_by,
    pd.created_at,
    pd.supersedes_event_id
  FROM lifecycle.property_disposition pd
  LEFT JOIN lifecycle.entity_identity ei ON ei.id = pd.disposing_entity_id
  WHERE pd.status != 'void';

-- ── 3. View: v_partner_investment_statement ───────────────────────────────────
-- Partner-facing investment summary per (property, partner).
-- ⚠️ INTENTIONALLY OMITS: jj_purchase_price_eur, jj_total_cost_eur,
--    jj_cost_basis_eur, jj_margin_from_entry_eur, jj_net_capital_at_risk_eur
-- If you add a column here, verify it contains ZERO internal JJ economics.

CREATE OR REPLACE VIEW lifecycle.v_partner_investment_statement
WITH (security_invoker = true) AS

SELECT
  pe.property_name,
  ei.canonical_name                                   AS partner_name,
  pe.inception_model,
  pe.entry_date,
  pe.entry_date_note,
  pe.ownership_pct,
  pe.agreed_entry_valuation_eur,
  pe.required_entry_capital_eur,

  -- Capital paid: sum of confirmed partner_entry_payment inflows
  (
    SELECT SUM(ce.amount_eur)
    FROM lifecycle.capital_event ce
    WHERE ce.entity_id         = pe.entity_id
      AND ce.property_name     = pe.property_name
      AND ce.event_subtype     = 'partner_entry_payment'
      AND ce.status           != 'void'
      AND ce.direction         = 'inflow'
  )                                                   AS capital_paid_eur,

  -- Capital remaining: NULL if capital_paid is unknown; GREATEST(0, required - paid) otherwise
  CASE
    WHEN (
      SELECT SUM(ce.amount_eur)
      FROM lifecycle.capital_event ce
      WHERE ce.entity_id         = pe.entity_id
        AND ce.property_name     = pe.property_name
        AND ce.event_subtype     = 'partner_entry_payment'
        AND ce.status           != 'void'
        AND ce.direction         = 'inflow'
    ) IS NULL THEN NULL
    ELSE GREATEST(0,
      pe.required_entry_capital_eur - (
        SELECT COALESCE(SUM(ce.amount_eur), 0)
        FROM lifecycle.capital_event ce
        WHERE ce.entity_id         = pe.entity_id
          AND ce.property_name     = pe.property_name
          AND ce.event_subtype     = 'partner_entry_payment'
          AND ce.status           != 'void'
          AND ce.direction         = 'inflow'
      )
    )
  END                                                 AS capital_remaining_eur,

  -- Total distributions paid to this partner on this property
  (
    SELECT SUM(ce.amount_eur)
    FROM lifecycle.capital_event ce
    WHERE ce.entity_id         = pe.entity_id
      AND ce.property_name     = pe.property_name
      AND ce.event_subtype     = 'distribution_payment'
      AND ce.status           != 'void'
      AND ce.direction         = 'outflow'
  )                                                   AS total_distributions_eur,

  -- Ownership period start (from the active ownership_period row)
  (
    SELECT op.effective_from
    FROM lifecycle.ownership_period op
    WHERE op.entity_id     = pe.entity_id
      AND op.property_name = pe.property_name
      AND op.status       != 'void'
      AND op.effective_to IS NULL
    ORDER BY op.effective_from DESC
    LIMIT 1
  )                                                   AS current_ownership_from,

  CASE
    WHEN (
      SELECT SUM(ce.amount_eur)
      FROM lifecycle.capital_event ce
      WHERE ce.entity_id         = pe.entity_id
        AND ce.property_name     = pe.property_name
        AND ce.event_subtype     = 'partner_entry_payment'
        AND ce.status           != 'void'
        AND ce.direction         = 'inflow'
    ) IS NULL                        THEN 'capital_unknown'
    WHEN GREATEST(0,
      pe.required_entry_capital_eur - COALESCE((
        SELECT SUM(ce.amount_eur)
        FROM lifecycle.capital_event ce
        WHERE ce.entity_id         = pe.entity_id
          AND ce.property_name     = pe.property_name
          AND ce.event_subtype     = 'partner_entry_payment'
          AND ce.status           != 'void'
          AND ce.direction         = 'inflow'
      ), 0)
    ) = 0                            THEN 'fully_paid'
    ELSE                                  'partially_paid'
  END                                                 AS entry_status,

  pe.created_at                                       AS entry_recorded_at

  -- ⚠️ jj_cost_basis_eur        — INTENTIONALLY OMITTED
  -- ⚠️ jj_margin_from_entry_eur — INTENTIONALLY OMITTED

FROM lifecycle.partner_entry pe
JOIN lifecycle.entity_identity ei ON ei.id = pe.entity_id
WHERE pe.status != 'void';

-- ── 4. View: v_jj_lifecycle_internal ─────────────────────────────────────────
-- JJ-internal full view including all margin / cost-basis fields.
-- ⚠️ NEVER expose this view to partner-facing API routes.
-- Use ONLY in JJ admin dashboards behind service_role or verified JJ-admin auth.

CREATE OR REPLACE VIEW lifecycle.v_jj_lifecycle_internal
WITH (security_invoker = true) AS

SELECT
  -- Acquisition (JJ-internal cost)
  pa.property_name,
  pa.acquisition_date,
  pa.acquisition_date_note,
  pa.jj_purchase_price_eur,
  pa.jj_closing_costs_eur,
  pa.jj_total_cost_eur,                   -- ← JJ purchase price + closing costs
  pa.acquisition_status,
  pa.status                                AS acquisition_status_flag,

  -- Partner entry (margin analysis)
  pe.entity_id,
  ei.canonical_name                        AS partner_name,
  pe.inception_model,
  pe.entry_date,
  pe.ownership_pct,
  pe.agreed_entry_valuation_eur,
  pe.required_entry_capital_eur,
  pe.jj_cost_basis_eur,                   -- ← JJ cost for this partner's % (INTERNAL)
  pe.jj_margin_from_entry_eur,            -- ← JJ margin = required - cost_basis (INTERNAL)

  -- Derived: JJ net capital at risk (cost basis minus what partner paid)
  CASE
    WHEN (
      SELECT SUM(ce.amount_eur)
      FROM lifecycle.capital_event ce
      WHERE ce.entity_id         = pe.entity_id
        AND ce.property_name     = pe.property_name
        AND ce.event_subtype     = 'partner_entry_payment'
        AND ce.status           != 'void'
        AND ce.direction         = 'inflow'
    ) IS NULL
    THEN NULL  -- Capital unknown; cannot compute net
    ELSE pe.jj_cost_basis_eur - COALESCE((
      SELECT SUM(ce.amount_eur)
      FROM lifecycle.capital_event ce
      WHERE ce.entity_id         = pe.entity_id
        AND ce.property_name     = pe.property_name
        AND ce.event_subtype     = 'partner_entry_payment'
        AND ce.status           != 'void'
        AND ce.direction         = 'inflow'
    ), 0)
  END                                      AS jj_net_capital_at_risk_eur

FROM lifecycle.partner_entry pe
JOIN lifecycle.entity_identity ei ON ei.id = pe.entity_id
LEFT JOIN lifecycle.property_acquisition pa
  ON pa.property_name = pe.property_name
 AND pa.status != 'void'
WHERE pe.status != 'void';

-- =============================================================================
-- END OF MIGRATION
-- =============================================================================
