-- =============================================================================
-- M8 LIFECYCLE SCHEMA — Migration m8_lifecycle_001_schema
-- JJ Property 10 · Created 2026-07-13
-- =============================================================================
-- SCOPE: Creates the `lifecycle` schema with 7 canonical tables.
--        Zero impact on public.transactions or any existing engine.
--        Rollback: DROP SCHEMA lifecycle CASCADE;
--
-- GATE B7: PASS (2026-07-13) — all OQ-1 through OQ-6 resolved.
-- ADR PRINCIPLES: P7 (ownership → investment events), P8 (capital ≠ P&L),
--                 P9 (one movement → one canonical event → many projections).
--
-- TABLE MAP:
--   lifecycle.business_source        — evidence registry (contracts, docs)
--   lifecycle.property_acquisition   — acquisition event per property
--   lifecycle.partner_entry          — partner entry event per (property, partner)
--   lifecycle.capital_event          — all capital movements (ledger)
--   lifecycle.ownership_period       — time-boxed ownership % records
--   lifecycle.property_disposition   — sale / transfer events
--   lifecycle.entity_identity        — canonical partner/entity names
--
-- IMMUTABILITY: No DELETE on confirmed records. Corrections via void-and-replace:
--   set status='void', create replacement linked via supersedes_event_id.
--
-- CONFIDENTIALITY:
--   jj_internal_* fields must NEVER appear in partner-facing views/APIs.
--   Views prefixed v_partner_* are safe. v_jj_lifecycle_internal is JJ-only.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. CREATE SCHEMA
-- ─────────────────────────────────────────────────────────────────────────────

CREATE SCHEMA IF NOT EXISTS lifecycle;

COMMENT ON SCHEMA lifecycle IS
  'M8 Investment Lifecycle — canonical event store for JJ Property 10. '
  'Zero FK dependencies on public schema. Rollback: DROP SCHEMA lifecycle CASCADE.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. entity_identity
--    Canonical registry of all partners, investors, and entities.
--    Single source of truth for name resolution. No auth coupling.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE lifecycle.entity_identity (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Canonical display name (Avi, Oren, Jacob, Yossi, JJ, etc.)
  canonical_name        TEXT NOT NULL,

  -- Alternative names / spellings ever used in source documents
  aliases               TEXT[] NOT NULL DEFAULT '{}',

  -- Entity type
  entity_type           TEXT NOT NULL
                        CHECK (entity_type IN ('partner', 'investor', 'jj_company', 'external')),

  -- P9 fields
  status                TEXT NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'inactive', 'void')),

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX entity_identity_canonical_name_uq
  ON lifecycle.entity_identity (lower(canonical_name));

COMMENT ON TABLE lifecycle.entity_identity IS
  'Canonical partner/entity registry. Name resolution source of truth. '
  'Aliases allow matching historical documents with varying spellings.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. business_source
--    Evidence registry: contracts, bank statements, Yossi confirmations.
--    Every lifecycle event links to ≥1 business_source for auditability.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE lifecycle.business_source (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Type of evidence
  source_type           TEXT NOT NULL
                        CHECK (source_type IN (
                          'purchase_contract',
                          'partner_agreement',
                          'bank_statement',
                          'hostaway_record',
                          'accounting_transaction',
                          'yossi_verbal_confirmation',
                          'yossi_written_confirmation',
                          'email_or_message',
                          'invoice',
                          'legal_document',
                          'internal_note',
                          'other'
                        )),

  -- Human-readable description of what this source proves
  description           TEXT NOT NULL,

  -- Optional reference: file path, URL, document number
  reference             TEXT,

  -- Date the source document was created / dated
  source_date           DATE,

  -- Who recorded this source entry
  recorded_by           TEXT NOT NULL DEFAULT 'system',

  -- P9 fields
  status                TEXT NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'void')),

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE lifecycle.business_source IS
  'Evidence registry. Every lifecycle event references at least one business_source. '
  'Provides full audit trail linking system records to real-world documents.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. property_acquisition
--    One row per property. Records the acquisition event.
--    purchase_price_eur is JJ-internal only (never shown to partners).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE lifecycle.property_acquisition (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Property identifier (matches public.transactions.property_name)
  property_name         TEXT NOT NULL,

  -- Acquisition date (contract signed)
  acquisition_date      DATE,
  acquisition_date_note TEXT, -- e.g. 'confirmed_business_sequence_pending_exact_date'

  -- JJ-internal fields (NEVER shown to partners)
  jj_purchase_price_eur NUMERIC(14,2),
  jj_closing_costs_eur  NUMERIC(14,2) DEFAULT 0,
  jj_total_cost_eur     NUMERIC(14,2)
                        GENERATED ALWAYS AS (
                          COALESCE(jj_purchase_price_eur, 0) + COALESCE(jj_closing_costs_eur, 0)
                        ) STORED,

  -- Acquisition status
  acquisition_status    TEXT NOT NULL DEFAULT 'in_progress'
                        CHECK (acquisition_status IN (
                          'in_progress', 'completed', 'cancelled', 'void'
                        )),

  -- Business source reference
  business_source_id    UUID REFERENCES lifecycle.business_source(id),

  -- P9 canonical fields
  event_type            TEXT NOT NULL DEFAULT 'property_acquisition',
  event_nature          TEXT NOT NULL DEFAULT 'lifecycle_event'
                        CHECK (event_nature IN ('lifecycle_event', 'accounting_event', 'settlement_event')),
  recorded_by           TEXT NOT NULL DEFAULT 'system',
  status                TEXT NOT NULL DEFAULT 'confirmed'
                        CHECK (status IN ('pending_verification', 'confirmed', 'void')),

  -- Void-and-replace immutability
  supersedes_event_id   UUID REFERENCES lifecycle.property_acquisition(id),

  -- Audit
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX property_acquisition_name_active_uq
  ON lifecycle.property_acquisition (property_name)
  WHERE status != 'void';

COMMENT ON TABLE lifecycle.property_acquisition IS
  'One active row per property. jj_purchase_price_eur and jj_total_cost_eur '
  'are JJ-internal; never exposed to partner-facing views or APIs.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. partner_entry
--    One row per (property, partner) entry event.
--    agreed_entry_valuation_eur is partner-visible.
--    jj_cost_basis_eur and jj_margin_eur are JJ-internal only.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE lifecycle.partner_entry (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Links
  property_name         TEXT NOT NULL,
  entity_id             UUID NOT NULL REFERENCES lifecycle.entity_identity(id),

  -- Entry participation model
  inception_model       TEXT NOT NULL DEFAULT 'standard'
                        CHECK (inception_model IN (
                          'from_acquisition_inception', -- partner co-owns from day 1
                          'standard'                    -- partner entered after acquisition
                        )),

  -- Entry date
  entry_date            DATE,
  entry_date_note       TEXT, -- 'confirmed_business_sequence_pending_exact_date', etc.

  -- Partner-visible financials
  ownership_pct         NUMERIC(6,4) NOT NULL
                        CHECK (ownership_pct > 0 AND ownership_pct <= 100),
  agreed_entry_valuation_eur  NUMERIC(14,2) NOT NULL,
  required_entry_capital_eur  NUMERIC(14,2)
                        GENERATED ALWAYS AS (
                          ROUND(agreed_entry_valuation_eur * ownership_pct / 100, 2)
                        ) STORED,

  -- JJ-internal fields (NEVER shown to partner)
  jj_cost_basis_eur     NUMERIC(14,2), -- = purchase_price × ownership_pct / 100
  jj_margin_from_entry_eur NUMERIC(14,2), -- = required_entry_capital − jj_cost_basis

  -- Business source reference
  business_source_id    UUID REFERENCES lifecycle.business_source(id),

  -- P9 canonical fields
  event_type            TEXT NOT NULL DEFAULT 'partner_entry',
  event_nature          TEXT NOT NULL DEFAULT 'lifecycle_event'
                        CHECK (event_nature IN ('lifecycle_event', 'accounting_event', 'settlement_event')),
  recorded_by           TEXT NOT NULL DEFAULT 'system',
  status                TEXT NOT NULL DEFAULT 'confirmed'
                        CHECK (status IN ('pending_verification', 'confirmed', 'void')),

  -- Void-and-replace immutability
  supersedes_event_id   UUID REFERENCES lifecycle.partner_entry(id),

  -- Audit
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX partner_entry_property_idx ON lifecycle.partner_entry (property_name);
CREATE INDEX partner_entry_entity_idx   ON lifecycle.partner_entry (entity_id);

-- Only one active entry per (property, partner)
CREATE UNIQUE INDEX partner_entry_active_uq
  ON lifecycle.partner_entry (property_name, entity_id)
  WHERE status != 'void';

COMMENT ON TABLE lifecycle.partner_entry IS
  'Partner entry event per (property, partner). '
  'agreed_entry_valuation_eur and required_entry_capital_eur are partner-visible. '
  'jj_cost_basis_eur and jj_margin_from_entry_eur are JJ-internal — NEVER shown to partner.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. capital_event
--    Unified capital ledger. Every capital movement creates one row here.
--    P9: one economic movement → one canonical capital_event.
--    Immutable: corrections via void + replacement (supersedes_event_id).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE lifecycle.capital_event (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Links
  property_name         TEXT NOT NULL,
  entity_id             UUID NOT NULL REFERENCES lifecycle.entity_identity(id),

  -- Capital event subtype (OQ-4: unified ledger with distinct subtypes)
  event_subtype         TEXT NOT NULL
                        CHECK (event_subtype IN (
                          -- Partner capital movements
                          'partner_entry_payment',          -- partner pays JJ for entry
                          'capital_call',                   -- JJ calls additional capital from partner
                          'additional_capital_contribution',-- voluntary additional capital
                          'capital_refund',                 -- return of capital to partner
                          'capital_withdrawal',             -- partner withdraws capital

                          -- Ownership changes (capital dimension)
                          'ownership_increase',             -- partner buys more %
                          'ownership_decrease',             -- partner sells %
                          'buyout_internal',                -- JJ buys out partner (internal)

                          -- Acquisition funding
                          'acquisition_payment',            -- payment toward property purchase
                          'acquisition_expense',            -- closing cost, legal fee, etc.

                          -- Operations
                          'distribution_payment',           -- P7: actual cash paid to partner
                          'refinance_capital_event',        -- OQ-3: refinance proceeds

                          -- Cross-entity (Partner Capital Rule)
                          'partner_acquisition_payment'     -- partner funds acquisition directly
                        )),

  -- Direction: did JJ receive capital (+) or distribute (−)?
  direction             TEXT NOT NULL
                        CHECK (direction IN ('inflow', 'outflow')),

  -- Amount
  amount_eur            NUMERIC(14,2) NOT NULL CHECK (amount_eur >= 0),

  -- Effective date of the economic movement
  effective_date        DATE NOT NULL,

  -- Partner Capital Rule: payer/payee must be preserved (Yossi ≠ Jacob ≠ JJ)
  payer_name            TEXT,   -- canonical name of who paid
  payee_name            TEXT,   -- canonical name of who received

  -- Links to lifecycle context and accounting evidence
  linked_partner_entry_id       UUID REFERENCES lifecycle.partner_entry(id),
  linked_acquisition_id         UUID REFERENCES lifecycle.property_acquisition(id),
  linked_accounting_transaction_id UUID, -- FK to public.transactions.id (cross-schema: no PG FK)

  -- Business source
  business_source_id    UUID REFERENCES lifecycle.business_source(id),

  -- P9 canonical fields
  event_type            TEXT NOT NULL DEFAULT 'capital_event',
  event_nature          TEXT NOT NULL DEFAULT 'accounting_event'
                        CHECK (event_nature IN ('lifecycle_event', 'accounting_event', 'settlement_event')),
  recorded_by           TEXT NOT NULL DEFAULT 'system',
  status                TEXT NOT NULL DEFAULT 'confirmed'
                        CHECK (status IN ('pending_verification', 'confirmed', 'void')),

  -- Void-and-replace immutability (P9 + G11 + G19 invariant)
  supersedes_event_id   UUID REFERENCES lifecycle.capital_event(id),

  -- Notes / explanation
  notes                 TEXT,

  -- Audit
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX capital_event_property_idx      ON lifecycle.capital_event (property_name);
CREATE INDEX capital_event_entity_idx        ON lifecycle.capital_event (entity_id);
CREATE INDEX capital_event_effective_date_idx ON lifecycle.capital_event (effective_date);
CREATE INDEX capital_event_subtype_idx       ON lifecycle.capital_event (event_subtype);
CREATE INDEX capital_event_status_idx        ON lifecycle.capital_event (status);

-- Quickly find all active (non-voided) events for a partner on a property
CREATE INDEX capital_event_active_partner_idx
  ON lifecycle.capital_event (property_name, entity_id, status)
  WHERE status != 'void';

COMMENT ON TABLE lifecycle.capital_event IS
  'Unified capital ledger. One row per economic capital movement (P9). '
  'Immutable: use void + replacement (supersedes_event_id). '
  'Subtypes: partner_entry_payment, distribution_payment, refinance_capital_event, '
  'acquisition_payment, capital_call, buyout_internal, etc. '
  'payer_name/payee_name must preserve Partner Capital Rule identity (Yossi ≠ Jacob ≠ JJ). '
  'linked_accounting_transaction_id references public.transactions.id (no PG FK — cross-schema).';


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. ownership_period
--    Time-boxed ownership % for (property, entity).
--    Effective dates determine which rows are active at a reference date.
--    Closed by external_transfer or internal_buyout.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE lifecycle.ownership_period (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Links
  property_name         TEXT NOT NULL,
  entity_id             UUID NOT NULL REFERENCES lifecycle.entity_identity(id),

  -- Ownership percentage during this period
  ownership_pct         NUMERIC(6,4) NOT NULL
                        CHECK (ownership_pct > 0 AND ownership_pct <= 100),

  -- Period bounds
  effective_from        DATE NOT NULL,
  effective_to          DATE,   -- NULL = current / open

  -- Source lifecycle events that opened/closed this period
  opened_by_partner_entry_id    UUID REFERENCES lifecycle.partner_entry(id),
  closed_by_disposition_id      UUID, -- FK added after property_disposition is created (see ALTER TABLE below)

  -- Business source
  business_source_id    UUID REFERENCES lifecycle.business_source(id),

  -- P9 canonical fields
  event_type            TEXT NOT NULL DEFAULT 'ownership_period',
  event_nature          TEXT NOT NULL DEFAULT 'lifecycle_event'
                        CHECK (event_nature IN ('lifecycle_event', 'accounting_event', 'settlement_event')),
  recorded_by           TEXT NOT NULL DEFAULT 'system',
  status                TEXT NOT NULL DEFAULT 'confirmed'
                        CHECK (status IN ('pending_verification', 'confirmed', 'void')),

  -- Void-and-replace immutability
  supersedes_event_id   UUID REFERENCES lifecycle.ownership_period(id),

  -- Audit
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Effective_to must be after effective_from
  CONSTRAINT ownership_period_dates_chk CHECK (effective_to IS NULL OR effective_to > effective_from)
);

CREATE INDEX ownership_period_property_idx     ON lifecycle.ownership_period (property_name);
CREATE INDEX ownership_period_entity_idx       ON lifecycle.ownership_period (entity_id);
CREATE INDEX ownership_period_effective_idx    ON lifecycle.ownership_period (property_name, effective_from, effective_to);

-- No two active (non-void) ownership periods for the same (property, entity) may overlap.
-- Enforced by application layer; PG exclusion constraint on dates:
-- (Would require btree_gist extension — added as comment for future enforcement)
-- CREATE EXTENSION IF NOT EXISTS btree_gist;
-- ALTER TABLE lifecycle.ownership_period ADD CONSTRAINT ownership_period_no_overlap
--   EXCLUDE USING gist (
--     property_name WITH =,
--     entity_id WITH =,
--     daterange(effective_from, effective_to, '[)') WITH &&
--   ) WHERE (status != 'void');

COMMENT ON TABLE lifecycle.ownership_period IS
  'Time-boxed ownership % for (property, entity). '
  'effective_to=NULL means current owner. '
  'P7: Ownership is always allocated via Investment Events (partner_entry, disposition). '
  'OQ-3: Refinance does NOT create a new ownership_period unless ownership actually changes. '
  'OQ-6: External transfer closes Avi''s period and opens David''s; no JJ capital_event.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 7. property_disposition
--    Sale, external transfer, or internal buyout event.
--    OQ-6: external_transfer vs internal_buyout distinguished here.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE lifecycle.property_disposition (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Property
  property_name         TEXT NOT NULL,

  -- Disposition type (OQ-6)
  disposition_type      TEXT NOT NULL
                        CHECK (disposition_type IN (
                          'sale',               -- JJ sells property to external buyer
                          'external_transfer',  -- Partner sells their stake; JJ not a party
                          'internal_buyout'     -- JJ buys out a partner's stake
                        )),

  -- Effective date
  disposition_date      DATE NOT NULL,

  -- Selling party (which entity is disposing)
  disposing_entity_id   UUID REFERENCES lifecycle.entity_identity(id),

  -- Acquiring party (external buyer or incoming partner)
  acquiring_entity_id   UUID REFERENCES lifecycle.entity_identity(id),

  -- Consideration (JJ-internal for sale; partner-visible for external transfer)
  consideration_eur     NUMERIC(14,2),

  -- JJ-internal fields (only relevant for internal_buyout or sale)
  jj_capital_event_required  BOOLEAN NOT NULL DEFAULT false,
  -- OQ-6: jj_capital_event_required = false for external_transfer; true for internal_buyout

  -- Business source
  business_source_id    UUID REFERENCES lifecycle.business_source(id),

  -- P9 canonical fields
  event_type            TEXT NOT NULL DEFAULT 'property_disposition',
  event_nature          TEXT NOT NULL DEFAULT 'lifecycle_event'
                        CHECK (event_nature IN ('lifecycle_event', 'accounting_event', 'settlement_event')),
  recorded_by           TEXT NOT NULL DEFAULT 'system',
  status                TEXT NOT NULL DEFAULT 'confirmed'
                        CHECK (status IN ('pending_verification', 'confirmed', 'void')),

  -- Void-and-replace immutability
  supersedes_event_id   UUID REFERENCES lifecycle.property_disposition(id),

  -- Notes
  notes                 TEXT,

  -- Audit
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX property_disposition_property_idx ON lifecycle.property_disposition (property_name);
CREATE INDEX property_disposition_type_idx     ON lifecycle.property_disposition (disposition_type);

COMMENT ON TABLE lifecycle.property_disposition IS
  'Sale / transfer events. '
  'OQ-6: external_transfer → no JJ capital_event (jj_capital_event_required=false); '
  'internal_buyout → JJ capital_event required (jj_capital_event_required=true). '
  'Closing ownership_period.closed_by_disposition_id points here.';


-- ─────────────────────────────────────────────────────────────────────────────
-- NOW: fix the FK reference in ownership_period that points to disposition
--      (defined before disposition table existed above — rebuild the constraint)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE lifecycle.ownership_period
  ADD CONSTRAINT ownership_period_closed_by_fk
  FOREIGN KEY (closed_by_disposition_id)
  REFERENCES lifecycle.property_disposition(id);


-- ─────────────────────────────────────────────────────────────────────────────
-- SEED: entity_identity — known partners
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO lifecycle.entity_identity (canonical_name, aliases, entity_type) VALUES
  ('JJ',        ARRAY['JJ Property 10', 'JJ Company'],         'jj_company'),
  ('Yossi',     ARRAY['Yossi Azizi', 'יוסי'],                  'partner'),
  ('Jacob',     ARRAY['Jacob'],                                  'partner'),
  ('Avi',       ARRAY['Avi', 'אבי'],                           'investor'),
  ('Oren',      ARRAY['Oren', 'אורן'],                         'investor'),
  ('Anastasia', ARRAY['Anastasia'],                             'external'),
  ('Fabi',      ARRAY['Fabi', 'fabi'],                         'external')
ON CONFLICT (lower(canonical_name)) DO NOTHING;


-- ─────────────────────────────────────────────────────────────────────────────
-- COMMENTS on confidentiality constraints
-- ─────────────────────────────────────────────────────────────────────────────

COMMENT ON COLUMN lifecycle.property_acquisition.jj_purchase_price_eur IS
  'JJ INTERNAL ONLY — must never appear in partner-facing views or APIs.';
COMMENT ON COLUMN lifecycle.property_acquisition.jj_total_cost_eur IS
  'JJ INTERNAL ONLY — computed: purchase_price + closing_costs.';
COMMENT ON COLUMN lifecycle.partner_entry.jj_cost_basis_eur IS
  'JJ INTERNAL ONLY — equals purchase_price × ownership_pct / 100.';
COMMENT ON COLUMN lifecycle.partner_entry.jj_margin_from_entry_eur IS
  'JJ INTERNAL ONLY — equals required_entry_capital − jj_cost_basis. NEVER shown to partner.';


-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION REGISTRY
-- ─────────────────────────────────────────────────────────────────────────────

-- Record this migration in pms migrations table if it exists, otherwise skip.
-- The lifecycle schema is independent of pms schema.
-- Run via Supabase Dashboard SQL Editor or apply_migration MCP tool.

-- Verify migration:
-- SELECT schemaname, tablename FROM pg_tables WHERE schemaname = 'lifecycle' ORDER BY tablename;
-- Expected: business_source, capital_event, entity_identity, ownership_period,
--           partner_entry, property_acquisition, property_disposition

-- =============================================================================
-- END m8_lifecycle_001_schema.sql
-- =============================================================================
