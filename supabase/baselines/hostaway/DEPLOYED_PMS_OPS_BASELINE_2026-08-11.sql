-- =====================================================================================
-- RECOVERED DEPLOYED-STATE SNAPSHOT
-- Captured from Supabase production (project vsiiprzjrstjcmjpwcrd) on 2026-08-11.
-- This is NOT the original historical migration sequence.
-- Do not apply blindly to an existing environment.
-- =====================================================================================
-- PURPOSE: source-control reproducibility, review, and rollback provenance for the
--          deployed Hostaway/PMS integration (schemas `pms` and `ops`). Reconstructed
--          from pg_catalog / information_schema — faithful to deployed shape, but it is
--          a SNAPSHOT, not a replayable migration. The authoritative schema was applied
--          in production via prior migrations (ledger: pms_phase1_001_schema,
--          pms_002_canonical_operational_fields, pms_003_mapping_evidence,
--          ops_001_m01_automation, ops_002_normalize_cron, ops_003_operational_metrics).
--
-- SAFETY:
--   * This file lives OUTSIDE supabase/migrations so the migration runner never applies it.
--   * A hard guard below aborts execution if anyone runs it directly.
--   * Zero data. Structure only. No secrets. No GRANTs beyond what is documented.
--   * RLS: every pms/ops table has RLS ENABLED with ZERO policies (deny-all by default);
--     access is via SECURITY DEFINER functions / service role only.
-- =====================================================================================

\echo 'REFUSING TO RUN: recovered deployed-state snapshot, not an executable migration.'
DO $$ BEGIN
  RAISE EXCEPTION 'DEPLOYED_PMS_OPS_BASELINE is a documentation snapshot and must not be executed directly.';
END $$;

-- =====================================================================================
-- SCHEMAS
-- =====================================================================================
-- CREATE SCHEMA IF NOT EXISTS pms;
-- CREATE SCHEMA IF NOT EXISTS ops;

-- =====================================================================================
-- PMS TABLES (11)  — RLS enabled, deny-all (no policies)
-- =====================================================================================

CREATE TABLE pms.providers (
  code text NOT NULL,
  display_name text NOT NULL,
  api_version text NOT NULL DEFAULT 'v1'::text,
  connector_version text NOT NULL DEFAULT '0.0.0'::text,
  capabilities jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT providers_pkey PRIMARY KEY (code),
  CONSTRAINT providers_status_check CHECK ((status = ANY (ARRAY['active'::text, 'disabled'::text])))
);
ALTER TABLE pms.providers ENABLE ROW LEVEL SECURITY;

CREATE TABLE pms.connections (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  display_name text NOT NULL,
  external_account_id text NOT NULL,
  credentials_ref text NOT NULL,
  status text NOT NULL DEFAULT 'active'::text,
  sync_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_sync_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT connections_provider_external_account_id_key UNIQUE (provider, external_account_id),
  CONSTRAINT connections_pkey PRIMARY KEY (id),
  CONSTRAINT connections_provider_fkey FOREIGN KEY (provider) REFERENCES pms.providers(code),
  CONSTRAINT connections_status_check CHECK ((status = ANY (ARRAY['active'::text, 'paused'::text, 'error'::text])))
);
ALTER TABLE pms.connections ENABLE ROW LEVEL SECURITY;

CREATE TABLE pms.raw_properties (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL,
  provider text NOT NULL,
  external_id text NOT NULL,
  raw jsonb NOT NULL,
  raw_hash text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  is_current boolean NOT NULL DEFAULT true,
  provider_updated_at timestamp with time zone,
  sync_run_id uuid,
  first_seen_at timestamp with time zone NOT NULL DEFAULT now(),
  synced_at timestamp with time zone NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'active'::text,
  CONSTRAINT raw_properties_connection_id_external_id_version_key UNIQUE (connection_id, external_id, version),
  CONSTRAINT raw_properties_pkey PRIMARY KEY (id),
  CONSTRAINT raw_properties_connection_id_fkey FOREIGN KEY (connection_id) REFERENCES pms.connections(id),
  CONSTRAINT raw_properties_sync_run_fk FOREIGN KEY (sync_run_id) REFERENCES pms.sync_runs(id),
  CONSTRAINT raw_properties_status_check CHECK ((status = ANY (ARRAY['active'::text, 'archived_at_provider'::text, 'invalid'::text])))
);
ALTER TABLE pms.raw_properties ENABLE ROW LEVEL SECURITY;

CREATE TABLE pms.raw_reservations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL,
  provider text NOT NULL,
  external_id text NOT NULL,
  external_property_id text,
  raw jsonb NOT NULL,
  raw_hash text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  is_current boolean NOT NULL DEFAULT true,
  provider_updated_at timestamp with time zone,
  sync_run_id uuid,
  first_seen_at timestamp with time zone NOT NULL DEFAULT now(),
  synced_at timestamp with time zone NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'active'::text,
  CONSTRAINT raw_reservations_connection_id_external_id_version_key UNIQUE (connection_id, external_id, version),
  CONSTRAINT raw_reservations_pkey PRIMARY KEY (id),
  CONSTRAINT raw_reservations_connection_id_fkey FOREIGN KEY (connection_id) REFERENCES pms.connections(id),
  CONSTRAINT raw_reservations_sync_run_fk FOREIGN KEY (sync_run_id) REFERENCES pms.sync_runs(id),
  CONSTRAINT raw_reservations_status_check CHECK ((status = ANY (ARRAY['active'::text, 'archived_at_provider'::text, 'invalid'::text])))
);
ALTER TABLE pms.raw_reservations ENABLE ROW LEVEL SECURITY;

CREATE TABLE pms.raw_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL,
  source text NOT NULL,
  event_type text NOT NULL,
  external_id text,
  payload jsonb NOT NULL,
  dedupe_hash text NOT NULL,
  received_at timestamp with time zone NOT NULL DEFAULT now(),
  processed_at timestamp with time zone,
  status text NOT NULL DEFAULT 'received'::text,
  CONSTRAINT raw_events_connection_id_dedupe_hash_key UNIQUE (connection_id, dedupe_hash),
  CONSTRAINT raw_events_pkey PRIMARY KEY (id),
  CONSTRAINT raw_events_connection_id_fkey FOREIGN KEY (connection_id) REFERENCES pms.connections(id),
  CONSTRAINT raw_events_source_check CHECK ((source = ANY (ARRAY['webhook'::text, 'manual'::text, 'cron'::text]))),
  CONSTRAINT raw_events_status_check CHECK ((status = ANY (ARRAY['received'::text, 'queued'::text, 'processed'::text, 'discarded'::text])))
);
ALTER TABLE pms.raw_events ENABLE ROW LEVEL SECURITY;

CREATE TABLE pms.canonical_properties (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL,
  provider text NOT NULL,
  external_id text NOT NULL,
  source_raw_id uuid NOT NULL,
  mapper_version text NOT NULL,
  name text,
  internal_name text,
  address text,
  city text,
  country_code text,
  currency_code text,
  timezone text,
  person_capacity integer,
  bedrooms integer,
  status text NOT NULL DEFAULT 'active'::text,
  normalized_at timestamp with time zone NOT NULL DEFAULT now(),
  source_raw_version integer,
  CONSTRAINT canonical_properties_connection_id_external_id_key UNIQUE (connection_id, external_id),
  CONSTRAINT canonical_properties_pkey PRIMARY KEY (id),
  CONSTRAINT canonical_properties_connection_id_fkey FOREIGN KEY (connection_id) REFERENCES pms.connections(id),
  CONSTRAINT canonical_properties_source_raw_id_fkey FOREIGN KEY (source_raw_id) REFERENCES pms.raw_properties(id)
);
ALTER TABLE pms.canonical_properties ENABLE ROW LEVEL SECURITY;

CREATE TABLE pms.canonical_reservations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL,
  provider text NOT NULL,
  external_id text NOT NULL,
  external_property_id text,
  source_raw_id uuid NOT NULL,
  mapper_version text NOT NULL,
  channel text,
  channel_raw text,
  status text,
  status_raw text,
  guest_name text,
  check_in date,
  check_out date,
  nights integer,
  currency_code text,
  total_price numeric,
  payout_expected numeric,
  remaining_balance numeric,
  financials jsonb NOT NULL DEFAULT '{}'::jsonb,
  provider_updated_at timestamp with time zone,
  cancelled_at timestamp with time zone,
  normalized_at timestamp with time zone NOT NULL DEFAULT now(),
  guests integer,
  cleaning_fee numeric,
  check_in_time integer,
  check_out_time integer,
  provider_created_at timestamp with time zone,
  source_raw_version integer,
  CONSTRAINT canonical_reservations_connection_id_external_id_key UNIQUE (connection_id, external_id),
  CONSTRAINT canonical_reservations_pkey PRIMARY KEY (id),
  CONSTRAINT canonical_reservations_connection_id_fkey FOREIGN KEY (connection_id) REFERENCES pms.connections(id),
  CONSTRAINT canonical_reservations_source_raw_id_fkey FOREIGN KEY (source_raw_id) REFERENCES pms.raw_reservations(id)
);
ALTER TABLE pms.canonical_reservations ENABLE ROW LEVEL SECURITY;

CREATE TABLE pms.property_mappings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  external_id text NOT NULL,
  jj_property_name text NOT NULL,
  match_confidence numeric,
  matched_by text NOT NULL DEFAULT 'manual'::text,
  status text NOT NULL DEFAULT 'proposed'::text,
  approved_by text,
  approved_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  confidence_label text,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  mapping_version text NOT NULL DEFAULT '1.0.0'::text,
  CONSTRAINT property_mappings_provider_external_id_key UNIQUE (provider, external_id),
  CONSTRAINT property_mappings_pkey PRIMARY KEY (id),
  CONSTRAINT property_mappings_confidence_label_check CHECK ((confidence_label = ANY (ARRAY['exact'::text, 'high'::text, 'medium'::text, 'low'::text]))),
  CONSTRAINT property_mappings_match_confidence_check CHECK (((match_confidence >= (0)::numeric) AND (match_confidence <= (1)::numeric))),
  CONSTRAINT property_mappings_matched_by_check CHECK ((matched_by = ANY (ARRAY['auto'::text, 'manual'::text]))),
  CONSTRAINT property_mappings_status_check CHECK ((status = ANY (ARRAY['proposed'::text, 'approved'::text, 'rejected'::text])))
);
ALTER TABLE pms.property_mappings ENABLE ROW LEVEL SECURITY;
-- NOTE (P1 target): a nullable `property_id uuid` column (soft reference to
-- public.property_definitions.property_id) is the planned P1 additive change. NOT present in this baseline.

CREATE TABLE pms.reservation_financial_snapshots (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  connection_id uuid,
  reservation_external_id text NOT NULL,
  property_external_id text NOT NULL,
  channel text,
  source_type text NOT NULL,
  source_priority integer NOT NULL DEFAULT 1,
  source_label text NOT NULL DEFAULT 'CERTIFIED'::text,
  version integer NOT NULL DEFAULT 1,
  is_current boolean NOT NULL DEFAULT true,
  raw_response_hash text,
  superseded_at timestamp with time zone,
  accommodation numeric,
  rental_revenue numeric,
  platform_fees numeric,
  payment_fees numeric,
  cleaning numeric,
  total_taxes numeric,
  taxes_fv numeric,
  net_payout numeric,
  total_payout numeric,
  management_fee numeric,
  owner_payout numeric,
  control_check numeric,
  total_discounts numeric,
  override_status text NOT NULL DEFAULT 'none'::text,
  override_value jsonb,
  override_reason text,
  override_evidence_ref text,
  override_approved_by text,
  override_approved_at timestamp with time zone,
  raw_response jsonb,
  fetched_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT reservation_financial_snapshots_pkey PRIMARY KEY (id),
  CONSTRAINT reservation_financial_snapshots_connection_id_fkey FOREIGN KEY (connection_id) REFERENCES pms.connections(id),
  CONSTRAINT chk_control_check CHECK (((control_check IS NULL) OR (abs(control_check) < 0.01))),
  CONSTRAINT chk_override_approval CHECK (((override_status <> 'approved'::text) OR ((override_approved_by IS NOT NULL) AND (override_approved_at IS NOT NULL)))),
  CONSTRAINT chk_override_audit CHECK (((override_status = 'none'::text) OR (override_reason IS NOT NULL))),
  CONSTRAINT chk_override_status CHECK ((override_status = ANY (ARRAY['none'::text, 'proposed'::text, 'approved'::text, 'rejected'::text]))),
  CONSTRAINT chk_source_label CHECK ((source_label = ANY (ARRAY['CERTIFIED'::text, 'PROVEN'::text, 'DERIVED'::text]))),
  CONSTRAINT chk_source_priority CHECK (((source_priority >= 1) AND (source_priority <= 3))),
  CONSTRAINT chk_source_type CHECK ((source_type = ANY (ARRAY['hostaway_calculated_api'::text, 'jj_reconstruction'::text])))
);
ALTER TABLE pms.reservation_financial_snapshots ENABLE ROW LEVEL SECURITY;

CREATE TABLE pms.sync_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL,
  entity text NOT NULL,
  trigger text NOT NULL,
  connector_version text,
  mapper_version text,
  started_at timestamp with time zone NOT NULL DEFAULT now(),
  finished_at timestamp with time zone,
  status text NOT NULL DEFAULT 'running'::text,
  cursor_start text,
  cursor_end text,
  stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  CONSTRAINT sync_runs_pkey PRIMARY KEY (id),
  CONSTRAINT sync_runs_connection_id_fkey FOREIGN KEY (connection_id) REFERENCES pms.connections(id),
  CONSTRAINT sync_runs_entity_check CHECK ((entity = ANY (ARRAY['properties'::text, 'reservations'::text]))),
  CONSTRAINT sync_runs_status_check CHECK ((status = ANY (ARRAY['running'::text, 'success'::text, 'partial'::text, 'failed'::text]))),
  CONSTRAINT sync_runs_trigger_check CHECK ((trigger = ANY (ARRAY['manual'::text, 'cron'::text, 'webhook'::text])))
);
ALTER TABLE pms.sync_runs ENABLE ROW LEVEL SECURITY;

CREATE TABLE pms.sync_errors (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  sync_run_id uuid,
  connection_id uuid NOT NULL,
  entity text NOT NULL,
  external_id text,
  error_code text NOT NULL,
  message text,
  payload jsonb,
  retry_count integer NOT NULL DEFAULT 0,
  next_retry_at timestamp with time zone,
  status text NOT NULL DEFAULT 'open'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT sync_errors_pkey PRIMARY KEY (id),
  CONSTRAINT sync_errors_connection_id_fkey FOREIGN KEY (connection_id) REFERENCES pms.connections(id),
  CONSTRAINT sync_errors_sync_run_id_fkey FOREIGN KEY (sync_run_id) REFERENCES pms.sync_runs(id),
  CONSTRAINT sync_errors_status_check CHECK ((status = ANY (ARRAY['open'::text, 'retrying'::text, 'resolved'::text, 'abandoned'::text])))
);
ALTER TABLE pms.sync_errors ENABLE ROW LEVEL SECURITY;

-- ------------ PMS non-constraint indexes ------------
CREATE UNIQUE INDEX raw_properties_current_uq ON pms.raw_properties USING btree (connection_id, external_id) WHERE is_current;
CREATE UNIQUE INDEX raw_reservations_current_uq ON pms.raw_reservations USING btree (connection_id, external_id) WHERE is_current;
CREATE INDEX raw_reservations_prop_idx ON pms.raw_reservations USING btree (connection_id, external_property_id) WHERE is_current;
CREATE UNIQUE INDEX idx_rfs_current ON pms.reservation_financial_snapshots USING btree (provider, reservation_external_id, source_type) WHERE (is_current = true);
CREATE INDEX idx_rfs_property_current ON pms.reservation_financial_snapshots USING btree (property_external_id) WHERE (is_current = true);
CREATE UNIQUE INDEX idx_rfs_version ON pms.reservation_financial_snapshots USING btree (provider, reservation_external_id, source_type, version);

-- =====================================================================================
-- PMS VIEWS
-- =====================================================================================

CREATE OR REPLACE VIEW pms.v_reservation_financial_effective AS
 SELECT id, provider, connection_id, reservation_external_id, property_external_id, channel,
    source_type, source_priority, source_label, version, raw_response_hash, fetched_at, created_at,
    accommodation AS source_accommodation, rental_revenue AS source_rental_revenue,
    platform_fees AS source_platform_fees, payment_fees AS source_payment_fees,
    cleaning AS source_cleaning, total_taxes AS source_total_taxes, taxes_fv AS source_taxes_fv,
    net_payout AS source_net_payout, total_payout AS source_total_payout,
    management_fee AS source_management_fee, owner_payout AS source_owner_payout,
    control_check AS source_control_check, total_discounts AS source_total_discounts,
    CASE WHEN override_status = 'approved'::text AND override_value ? 'accommodation'::text THEN (override_value ->> 'accommodation'::text)::numeric ELSE accommodation END AS effective_accommodation,
    CASE WHEN override_status = 'approved'::text AND override_value ? 'rental_revenue'::text THEN (override_value ->> 'rental_revenue'::text)::numeric ELSE rental_revenue END AS effective_rental_revenue,
    CASE WHEN override_status = 'approved'::text AND override_value ? 'platform_fees'::text THEN (override_value ->> 'platform_fees'::text)::numeric ELSE platform_fees END AS effective_platform_fees,
    CASE WHEN override_status = 'approved'::text AND override_value ? 'payment_fees'::text THEN (override_value ->> 'payment_fees'::text)::numeric ELSE payment_fees END AS effective_payment_fees,
    CASE WHEN override_status = 'approved'::text AND override_value ? 'cleaning'::text THEN (override_value ->> 'cleaning'::text)::numeric ELSE cleaning END AS effective_cleaning,
    CASE WHEN override_status = 'approved'::text AND override_value ? 'total_taxes'::text THEN (override_value ->> 'total_taxes'::text)::numeric ELSE total_taxes END AS effective_total_taxes,
    CASE WHEN override_status = 'approved'::text AND override_value ? 'taxes_fv'::text THEN (override_value ->> 'taxes_fv'::text)::numeric ELSE taxes_fv END AS effective_taxes_fv,
    CASE WHEN override_status = 'approved'::text AND override_value ? 'net_payout'::text THEN (override_value ->> 'net_payout'::text)::numeric ELSE net_payout END AS effective_net_payout,
    CASE WHEN override_status = 'approved'::text AND override_value ? 'total_payout'::text THEN (override_value ->> 'total_payout'::text)::numeric ELSE total_payout END AS effective_total_payout,
    CASE WHEN override_status = 'approved'::text AND override_value ? 'management_fee'::text THEN (override_value ->> 'management_fee'::text)::numeric ELSE management_fee END AS effective_management_fee,
    CASE WHEN override_status = 'approved'::text AND override_value ? 'owner_payout'::text THEN (override_value ->> 'owner_payout'::text)::numeric ELSE owner_payout END AS effective_owner_payout,
    CASE WHEN override_status = 'approved'::text AND override_value ? 'total_discounts'::text THEN (override_value ->> 'total_discounts'::text)::numeric ELSE total_discounts END AS effective_total_discounts,
    override_status, override_value, override_reason, override_evidence_ref, override_approved_by, override_approved_at
   FROM pms.reservation_financial_snapshots
  WHERE is_current = true;

-- pms.v_str_property_settlement and public.v_str_settlement_report are captured verbatim in
-- ./STR_SETTLEMENT_VIEWS_2026-08-11.sql (kept separate: financial-domain views, unwired/non-authoritative).

-- =====================================================================================
-- OPS TABLES / VIEWS
-- =====================================================================================

CREATE TABLE ops.health_checks (
  id bigint NOT NULL DEFAULT nextval('ops.health_checks_id_seq'::regclass),
  company_id uuid,
  connection_id uuid,
  check_name text NOT NULL,
  status text NOT NULL,
  value text,
  threshold text,
  checked_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT health_checks_pkey PRIMARY KEY (id),
  CONSTRAINT health_checks_status_check CHECK ((status = ANY (ARRAY['green'::text, 'yellow'::text, 'red'::text])))
);
CREATE INDEX health_checks_latest_idx ON ops.health_checks USING btree (check_name, checked_at DESC);
ALTER TABLE ops.health_checks ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE VIEW ops.v_operational_metrics AS
 WITH runs AS (
   SELECT sync_runs.entity, sync_runs.status, sync_runs.started_at, sync_runs.finished_at,
     EXTRACT(epoch FROM sync_runs.finished_at - sync_runs.started_at) AS dur_s
   FROM pms.sync_runs WHERE sync_runs.finished_at IS NOT NULL
 ), last_run AS (
   SELECT runs.entity, runs.status, runs.started_at, runs.finished_at, runs.dur_s
   FROM runs ORDER BY runs.started_at DESC LIMIT 1
 )
 SELECT metric, value FROM ( VALUES
   ('last_sync_duration_s'::text, (SELECT round(last_run.dur_s)::text FROM last_run)),
   ('avg_sync_duration_s'::text,  (SELECT round(avg(runs.dur_s))::text FROM runs WHERE runs.started_at > (now() - '7 days'::interval))),
   ('max_sync_duration_s'::text,  (SELECT round(max(runs.dur_s))::text FROM runs WHERE runs.started_at > (now() - '7 days'::interval))),
   ('successful_runs_7d'::text,   (SELECT count(*)::text FROM runs WHERE runs.status = 'success'::text AND runs.started_at > (now() - '7 days'::interval))),
   ('failed_runs_7d'::text,       (SELECT count(*)::text FROM runs WHERE (runs.status = ANY (ARRAY['failed'::text, 'partial'::text])) AND runs.started_at > (now() - '7 days'::interval))),
   ('runs_by_cron_7d'::text,      (SELECT count(*)::text FROM pms.sync_runs WHERE sync_runs.trigger = 'cron'::text AND sync_runs.started_at > (now() - '7 days'::interval))),
   ('last_health_check'::text,    (SELECT CASE WHEN bool_and(h.status = 'green'::text) THEN 'OK'::text ELSE 'DEGRADED: '::text || string_agg((h.check_name || '='::text) || h.status, ', '::text) FILTER (WHERE h.status <> 'green'::text) END FROM ( SELECT DISTINCT ON (health_checks.check_name) health_checks.check_name, health_checks.status FROM ops.health_checks ORDER BY health_checks.check_name, health_checks.checked_at DESC) h)),
   ('last_canonical_totals'::text,(SELECT ((((( SELECT count(*) FROM pms.canonical_properties))::text) || ' props / '::text) || ((( SELECT count(*) FROM pms.canonical_reservations))::text)) || ' resv'::text))
 ) m(metric, value);

-- =====================================================================================
-- OPS FUNCTIONS (SECURITY DEFINER)
-- =====================================================================================

CREATE OR REPLACE FUNCTION ops.invoke_pms_function(fn text, body jsonb DEFAULT '{}'::jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE k text; req_id bigint;
BEGIN
  SELECT decrypted_secret INTO k FROM vault.decrypted_secrets WHERE name='edge_invoke_key';
  SELECT net.http_post(
    url := 'https://vsiiprzjrstjcmjpwcrd.supabase.co/functions/v1/' || fn,
    body := body,
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||k,'apikey',k),
    timeout_milliseconds := 25000
  ) INTO req_id;
  RETURN req_id;
END $function$;

CREATE OR REPLACE FUNCTION ops.normalize_pms()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE n_prop int; n_resv int;
BEGIN
  WITH up AS (
    INSERT INTO pms.canonical_properties
      (connection_id, provider, external_id, source_raw_id, source_raw_version, mapper_version,
       name, internal_name, address, city, country_code, currency_code, timezone, person_capacity, bedrooms, status, normalized_at)
    SELECT r.connection_id, r.provider, r.external_id, r.id, r.version, '1.0.0',
           raw->>'name', raw->>'internalListingName', raw->>'address', raw->>'city', raw->>'countryCode',
           raw->>'currencyCode', raw->>'timeZoneName',
           nullif(raw->>'personCapacity','')::int, nullif(raw->>'bedroomsNumber','')::int, r.status, now()
    FROM pms.raw_properties r WHERE r.is_current
    ON CONFLICT (connection_id, external_id) DO UPDATE SET
      source_raw_id=EXCLUDED.source_raw_id, source_raw_version=EXCLUDED.source_raw_version,
      mapper_version=EXCLUDED.mapper_version, name=EXCLUDED.name, internal_name=EXCLUDED.internal_name,
      address=EXCLUDED.address, city=EXCLUDED.city, country_code=EXCLUDED.country_code,
      currency_code=EXCLUDED.currency_code, timezone=EXCLUDED.timezone,
      person_capacity=EXCLUDED.person_capacity, bedrooms=EXCLUDED.bedrooms, status=EXCLUDED.status, normalized_at=now()
    WHERE (pms.canonical_properties.source_raw_id, pms.canonical_properties.mapper_version)
          IS DISTINCT FROM (EXCLUDED.source_raw_id, EXCLUDED.mapper_version)
    RETURNING 1)
  SELECT count(*) INTO n_prop FROM up;

  WITH up AS (
    INSERT INTO pms.canonical_reservations
      (connection_id, provider, external_id, external_property_id, source_raw_id, source_raw_version, mapper_version,
       channel, channel_raw, status, status_raw, check_in, check_out, check_in_time, check_out_time,
       nights, guests, currency_code, total_price, cleaning_fee, remaining_balance,
       provider_created_at, provider_updated_at, cancelled_at, normalized_at)
    SELECT r.connection_id, r.provider, r.external_id, r.external_property_id, r.id, r.version, '1.0.0',
           CASE raw->>'channelName' WHEN 'airbnbOfficial' THEN 'airbnb' WHEN 'bookingcom' THEN 'booking'
             WHEN 'direct' THEN 'direct' WHEN 'bookingengine' THEN 'direct' WHEN 'homeaway' THEN 'vrbo' ELSE 'unknown' END,
           coalesce(raw->>'channelId','') || ':' || coalesce(raw->>'channelName','?'),
           CASE raw->>'status' WHEN 'new' THEN 'confirmed' WHEN 'modified' THEN 'modified' WHEN 'cancelled' THEN 'cancelled'
             WHEN 'ownerStay' THEN 'owner_stay' WHEN 'inquiry' THEN 'inquiry' WHEN 'inquiryPreapproved' THEN 'inquiry'
             ELSE 'unknown' END,
           raw->>'status',
           nullif(raw->>'arrivalDate','')::date, nullif(raw->>'departureDate','')::date,
           nullif(raw->>'checkInTime','')::int, nullif(raw->>'checkOutTime','')::int,
           nullif(raw->>'nights','')::int, nullif(raw->>'numberOfGuests','')::int,
           raw->>'currency', nullif(raw->>'totalPrice','')::numeric, nullif(raw->>'cleaningFee','')::numeric,
           nullif(raw->>'remainingBalance','')::numeric,
           nullif(raw->>'insertedOn','')::timestamptz, nullif(raw->>'updatedOn','')::timestamptz,
           nullif(raw->>'cancellationDate','')::timestamptz, now()
    FROM pms.raw_reservations r WHERE r.is_current
    ON CONFLICT (connection_id, external_id) DO UPDATE SET
      external_property_id=EXCLUDED.external_property_id, source_raw_id=EXCLUDED.source_raw_id,
      source_raw_version=EXCLUDED.source_raw_version, mapper_version=EXCLUDED.mapper_version,
      channel=EXCLUDED.channel, channel_raw=EXCLUDED.channel_raw, status=EXCLUDED.status, status_raw=EXCLUDED.status_raw,
      check_in=EXCLUDED.check_in, check_out=EXCLUDED.check_out, check_in_time=EXCLUDED.check_in_time,
      check_out_time=EXCLUDED.check_out_time, nights=EXCLUDED.nights, guests=EXCLUDED.guests,
      currency_code=EXCLUDED.currency_code, total_price=EXCLUDED.total_price, cleaning_fee=EXCLUDED.cleaning_fee,
      remaining_balance=EXCLUDED.remaining_balance, provider_created_at=EXCLUDED.provider_created_at,
      provider_updated_at=EXCLUDED.provider_updated_at, cancelled_at=EXCLUDED.cancelled_at, normalized_at=now()
    WHERE (pms.canonical_reservations.source_raw_id, pms.canonical_reservations.mapper_version)
          IS DISTINCT FROM (EXCLUDED.source_raw_id, EXCLUDED.mapper_version)
    RETURNING 1)
  SELECT count(*) INTO n_resv FROM up;

  RETURN jsonb_build_object('properties_updated', n_prop, 'reservations_updated', n_resv, 'at', now());
END $function$;

CREATE OR REPLACE FUNCTION ops.refresh_health()
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  INSERT INTO ops.health_checks (connection_id, check_name, status, value, threshold)
  SELECT c.id, 'sync_freshness',
    CASE WHEN c.last_sync_at > now() - interval '2 hours' THEN 'green'
         WHEN c.last_sync_at > now() - interval '6 hours' THEN 'yellow' ELSE 'red' END,
    coalesce(c.last_sync_at::text,'never'), '<=2h green / <=6h yellow'
  FROM pms.connections c WHERE c.status='active'
  UNION ALL
  SELECT NULL, 'open_sync_errors',
    CASE WHEN count(*)=0 THEN 'green' WHEN count(*)<5 THEN 'yellow' ELSE 'red' END,
    count(*)::text, '0 green / <5 yellow'
  FROM pms.sync_errors WHERE status='open'
  UNION ALL
  SELECT NULL, 'stuck_running_runs',
    CASE WHEN count(*)=0 THEN 'green' ELSE 'red' END, count(*)::text, '0'
  FROM pms.sync_runs WHERE status='running' AND started_at < now() - interval '15 minutes'
  UNION ALL
  SELECT NULL, 'unmapped_current_listings',
    CASE WHEN count(*)=0 THEN 'green' ELSE 'yellow' END, count(*)::text, '0'
  FROM pms.raw_properties rp
  WHERE rp.is_current AND NOT EXISTS
    (SELECT 1 FROM pms.property_mappings m WHERE m.external_id=rp.external_id AND m.status='approved');
$function$;

CREATE OR REPLACE FUNCTION ops.watchdog_stuck_runs()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE n int;
BEGIN
  UPDATE pms.sync_runs SET status='failed', finished_at=now(),
    error='watchdog: stuck >15min, marked failed automatically'
  WHERE status='running' AND started_at < now() - interval '15 minutes';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $function$;

-- =====================================================================================
-- KNOWN ADVISOR FINDINGS AT CAPTURE (informational — NOT fixed here, per P0 scope):
--   * ops.* functions above have role-mutable search_path (WARN). Do not "fix" in P0.
--   * pms.*/ops.* tables: RLS enabled, no policies (deny-all) — intentional.
-- Cron schedule is documented in ../../functions/../docs/hostaway and CRON_JOBS_2026-08-11.sql.
-- =====================================================================================
