-- =============================================================================
-- Migration: 20260805_001_occupancy_model
-- Description: Oshrit Deklia Occupancy & Partner Settlement Model
-- Scope: lifecycle schema only — Oshrit-specific occupancy obligations
-- Constitutional: P-ARCH-2, P-ARCH-5, P-LEDGER-1, D4
-- =============================================================================
-- IDEMPOTENCY NOTE:
-- This migration is written with IF NOT EXISTS guards on all DDL.
-- It faithfully reproduces the schema deployed to production on 2026-08-05.
-- Re-running this migration on a database that already has these objects
-- will produce zero changes and zero errors.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- TABLE 1: lifecycle.occupancy_agreements
-- ---------------------------------------------------------------------------
-- Purpose: Records occupancy arrangements where one entity occupies a property
-- owned/managed by another, with a recurring monthly obligation.

CREATE TABLE IF NOT EXISTS lifecycle.occupancy_agreements (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  property_name       TEXT          NOT NULL,
  owner_entity_id     UUID          NOT NULL,      -- FK to lifecycle.entity_identity
  occupant_entity_id  UUID          NOT NULL,      -- FK to lifecycle.entity_identity
  monthly_amount_eur  NUMERIC       NOT NULL,
  currency            TEXT          NOT NULL DEFAULT 'EUR',
  effective_from      DATE          NOT NULL,
  effective_to        DATE,                        -- NULL = ongoing
  due_day             INTEGER       NOT NULL DEFAULT 1,
  status              TEXT          NOT NULL DEFAULT 'active',
  governing_evidence  TEXT,                        -- free-text evidence reference
  created_by          TEXT,
  approved_by         TEXT,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),

  -- due_day must be 1–28 (avoids month-length edge cases)
  CONSTRAINT occupancy_agreements_due_day_check
    CHECK (due_day >= 1 AND due_day <= 28),

  -- status must be one of three values
  CONSTRAINT occupancy_agreements_status_check
    CHECK (status IN ('active', 'terminated', 'suspended'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_occ_agreements_property
  ON lifecycle.occupancy_agreements (property_name);
CREATE INDEX IF NOT EXISTS idx_occ_agreements_occupant
  ON lifecycle.occupancy_agreements (occupant_entity_id);

-- RLS: deny-all (consistent with lifecycle schema pattern)
ALTER TABLE lifecycle.occupancy_agreements ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'lifecycle'
      AND tablename = 'occupancy_agreements'
      AND policyname = 'deny_all_occupancy_agreements'
  ) THEN
    CREATE POLICY deny_all_occupancy_agreements
      ON lifecycle.occupancy_agreements
      AS RESTRICTIVE
      FOR ALL
      TO public
      USING (false);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- TABLE 2: lifecycle.occupancy_obligations
-- ---------------------------------------------------------------------------
-- Purpose: Individual monthly obligation records generated from an agreement.
-- Each row represents one month's payment obligation.
-- settlement_evidence (JSONB) records who paid, how much, and via what mechanism.

CREATE TABLE IF NOT EXISTS lifecycle.occupancy_obligations (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id        UUID          NOT NULL
    REFERENCES lifecycle.occupancy_agreements(id),
  obligation_month    DATE          NOT NULL,      -- first day of the month
  due_date            DATE          NOT NULL,
  amount_eur          NUMERIC       NOT NULL,
  settled_amount_eur  NUMERIC       NOT NULL DEFAULT 0,
  status              TEXT          NOT NULL DEFAULT 'open',
  settlement_evidence JSONB,                       -- array of {payer, amount, mechanism, transaction_id}
  idempotency_key     TEXT          NOT NULL UNIQUE, -- prevents duplicate generation
  reversal_of         UUID
    REFERENCES lifecycle.occupancy_obligations(id),
  generated_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),

  -- status must be one of four values
  CONSTRAINT occupancy_obligations_status_check
    CHECK (status IN ('open', 'partial', 'settled', 'reversed'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_occ_obligations_agreement
  ON lifecycle.occupancy_obligations (agreement_id);
CREATE INDEX IF NOT EXISTS idx_occ_obligations_month
  ON lifecycle.occupancy_obligations (obligation_month);
CREATE INDEX IF NOT EXISTS idx_occ_obligations_status
  ON lifecycle.occupancy_obligations (status);

-- RLS: deny-all (consistent with lifecycle schema pattern)
ALTER TABLE lifecycle.occupancy_obligations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'lifecycle'
      AND tablename = 'occupancy_obligations'
      AND policyname = 'deny_all_occupancy_obligations'
  ) THEN
    CREATE POLICY deny_all_occupancy_obligations
      ON lifecycle.occupancy_obligations
      AS RESTRICTIVE
      FOR ALL
      TO public
      USING (false);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- VIEW: lifecycle.v_occupancy_position
-- ---------------------------------------------------------------------------
-- Purpose: Aggregates obligations per agreement into a single-row position
-- showing total obligated, settled, outstanding, and per-payer breakdown.
-- P-ARCH-2: Preserves Yossi ≠ Jacob ≠ JJ in settlement breakdown.

CREATE OR REPLACE VIEW lifecycle.v_occupancy_position AS
SELECT
  a.id AS agreement_id,
  a.property_name,
  a.occupant_entity_id,
  a.owner_entity_id,
  a.monthly_amount_eur,
  a.effective_from,
  a.effective_to,
  a.status AS agreement_status,
  COUNT(o.id) AS total_obligations,
  COUNT(o.id) FILTER (WHERE o.status = 'settled') AS settled_count,
  COUNT(o.id) FILTER (WHERE o.status = 'partial') AS partial_count,
  COUNT(o.id) FILTER (WHERE o.status = 'open') AS open_count,
  COALESCE(SUM(o.amount_eur), 0) AS total_obligated_eur,
  COALESCE(SUM(o.settled_amount_eur), 0) AS total_settled_eur,
  COALESCE(SUM(o.amount_eur - o.settled_amount_eur), 0) AS outstanding_eur,
  MAX(o.obligation_month) AS latest_obligation_month,
  -- Per-payer breakdown from settlement_evidence JSONB
  (SELECT COALESCE(SUM((elem->>'amount')::numeric), 0)
   FROM lifecycle.occupancy_obligations o2,
        LATERAL jsonb_array_elements(o2.settlement_evidence) elem
   WHERE o2.agreement_id = a.id AND elem->>'payer' = 'JJ'
  ) AS settled_by_jj_eur,
  (SELECT COALESCE(SUM((elem->>'amount')::numeric), 0)
   FROM lifecycle.occupancy_obligations o2,
        LATERAL jsonb_array_elements(o2.settlement_evidence) elem
   WHERE o2.agreement_id = a.id AND elem->>'payer' = 'Jacob'
  ) AS settled_by_jacob_eur,
  (SELECT COALESCE(SUM((elem->>'amount')::numeric), 0)
   FROM lifecycle.occupancy_obligations o2,
        LATERAL jsonb_array_elements(o2.settlement_evidence) elem
   WHERE o2.agreement_id = a.id AND elem->>'payer' = 'Yossi'
  ) AS settled_by_yossi_eur
FROM lifecycle.occupancy_agreements a
LEFT JOIN lifecycle.occupancy_obligations o ON o.agreement_id = a.id
GROUP BY a.id, a.property_name, a.occupant_entity_id, a.owner_entity_id,
         a.monthly_amount_eur, a.effective_from, a.effective_to, a.status;

-- ---------------------------------------------------------------------------
-- GRANTS: service_role SELECT access
-- ---------------------------------------------------------------------------
-- The application reads occupancy data via createServiceClient() which uses
-- the service_role. service_role bypasses RLS but still needs table-level
-- SELECT privilege. Consistent with lifecycle.entity_identity pattern.
-- anon and authenticated remain denied (no GRANT + RLS deny-all).

GRANT SELECT ON lifecycle.occupancy_agreements TO service_role;
GRANT SELECT ON lifecycle.occupancy_obligations TO service_role;
GRANT SELECT ON lifecycle.v_occupancy_position TO service_role;

-- =============================================================================
-- END OF MIGRATION
-- =============================================================================
-- No functions were created (obligation generation and settlement matching
-- were performed as one-time data operations, not stored procedures).
-- service_role has SELECT only. anon and authenticated have no access.
-- No cross-schema FK (P-ARCH-5: lifecycle schema isolated from public).
-- public.transactions is NOT touched by this migration.
-- =============================================================================
