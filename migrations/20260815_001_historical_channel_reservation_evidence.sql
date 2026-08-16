-- Yogev / historical STR recovery: minimal append-only channel-source reservation evidence.
-- Stores recovered Booking/Airbnb reservation financials for properties whose channel data did NOT
-- come through Hostaway (e.g. deleted Hostaway listing). NEVER labelled Hostaway (CHECK enforced).
-- Read via service role .schema('pms'); RLS deny-all (no policies) — consistent with other pms tables.
-- Evidence/reporting layer ONLY: never auto-posts to public.transactions / FPE / Settlement.

CREATE TABLE IF NOT EXISTS pms.historical_channel_reservation_evidence (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- identity / provenance
  property_id            uuid        NOT NULL,   -- canonical public.property_definitions UUID
  channel                text        NOT NULL,   -- airbnb | booking | booking_direct | direct | bookingengine | other
  provider               text        NOT NULL,   -- real source system; NEVER 'hostaway'
  external_reservation_id text       NOT NULL,   -- channel confirmation/booking number
  source_type            text        NOT NULL,   -- e.g. airbnb_host_earnings_paid_detail | booking_extranet_reservation_detail
  source_reference       text,
  source_filename        text,
  source_row_reference   text,
  evidence_date          date,
  version                int         NOT NULL DEFAULT 1,
  is_current             boolean     NOT NULL DEFAULT true,
  ingested_at            timestamptz NOT NULL DEFAULT now(),
  ingested_by            text        NOT NULL,
  -- reservation facts (Unknown stays NULL, never derived at ingestion)
  booking_date           date,
  check_in_date          date        NOT NULL,
  check_out_date         date        NOT NULL,
  status                 text        NOT NULL,   -- paid | ok | confirmed | modified | cancelled | no_show | inquiry | other
  guest_name             text,
  currency               text        NOT NULL DEFAULT 'EUR',
  gross_amount           numeric,
  platform_fee           numeric,
  cleaning_fee           numeric,
  tax_amount             numeric,
  net_payout             numeric,
  payment_processing_fee numeric,
  management_fee         numeric,
  -- notes for embedded tax etc.
  amount_notes           text,
  -- conflict handling
  review_status          text        NOT NULL DEFAULT 'active',   -- active | needs_review | superseded
  review_reason          text,
  CONSTRAINT hist_evidence_provider_not_hostaway CHECK (provider <> 'hostaway'),
  CONSTRAINT hist_evidence_unique UNIQUE (property_id, channel, external_reservation_id, source_type, version)
);

CREATE INDEX IF NOT EXISTS ix_hist_evidence_property_checkin
  ON pms.historical_channel_reservation_evidence (property_id, check_in_date);
CREATE INDEX IF NOT EXISTS ix_hist_evidence_property_current
  ON pms.historical_channel_reservation_evidence (property_id, is_current, review_status);

ALTER TABLE pms.historical_channel_reservation_evidence ENABLE ROW LEVEL SECURITY;
-- No policies: deny-all for anon/authenticated; service_role bypasses RLS (server-side reads only).
