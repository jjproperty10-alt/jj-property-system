-- ============================================================
-- partnership Owner Statement evidence store
-- LOCAL IMPLEMENTATION ONLY. Do not Apply to Production or staging
-- without a separate Yossi authorization.
--
-- Hidden schema. Public SECURITY DEFINER wrappers only.
-- No public.transactions, settlement, Certified, or Avi writes.
-- ============================================================

CREATE SCHEMA IF NOT EXISTS partnership;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

COMMENT ON SCHEMA partnership IS
  'Hidden Owner Statement evidence schema. Not in PostgREST db_schemas. Access only via public SECURITY DEFINER wrappers.';

GRANT USAGE ON SCHEMA extensions TO postgres;
REVOKE ALL ON SCHEMA partnership FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION partnership.assert_exact_cents(p_value NUMERIC, p_label TEXT)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO ''
AS $os$
BEGIN
  IF p_value IS NULL THEN
    RAISE EXCEPTION '[input] % must be a finite exact-cent number.', p_label;
  END IF;
  IF p_value::text IN ('NaN', 'Infinity', '-Infinity') THEN
    RAISE EXCEPTION '[input] % must be a finite exact-cent number.', p_label;
  END IF;
  IF p_value IS DISTINCT FROM pg_catalog.round(p_value, 2) THEN
    RAISE EXCEPTION '[input] % must be exact cents (scale 2).', p_label;
  END IF;
  IF p_value < 0 OR p_value > 9999999999.99 THEN
    RAISE EXCEPTION '[input] % is out of range for NUMERIC(12,2).', p_label;
  END IF;
  RETURN p_value;
END;
$os$;

CREATE OR REPLACE FUNCTION partnership.parse_exact_cents_text(p_text TEXT, p_label TEXT)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO ''
AS $os$
DECLARE
  v_txt TEXT;
  v_num NUMERIC;
BEGIN
  v_txt := pg_catalog.btrim(COALESCE(p_text, ''));
  IF v_txt = '' THEN
    RAISE EXCEPTION '[input] % is required.', p_label;
  END IF;
  IF v_txt !~ '^[0-9]+(\.[0-9]{1,2})?$' THEN
    RAISE EXCEPTION '[input] % must be a non-negative exact-cent decimal.', p_label;
  END IF;
  v_num := v_txt::NUMERIC;
  RETURN partnership.assert_exact_cents(v_num, p_label);
END;
$os$;

-- ── Tables ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS partnership.owner_statement_document (
  id                       UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  canonical_property_id    UUID NOT NULL
                           REFERENCES public.property_definitions(property_id),
  listing_id               TEXT NOT NULL,
  source_kind              TEXT NOT NULL
                           CHECK (source_kind = 'hostaway_owner_statement'),
  document_hash            TEXT NOT NULL
                           CHECK (document_hash ~ '^[0-9a-f]{64}$'),
  parser_version           TEXT NOT NULL
                           CHECK (parser_version = 'hostaway_owner_minimal_xlsx_v1'),
  normalized_payload_hash  TEXT NOT NULL
                           CHECK (normalized_payload_hash ~ '^[0-9a-f]{64}$'),
  statement_from           DATE NOT NULL,
  statement_to             DATE NOT NULL,
  imported_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  imported_by              UUID NOT NULL,
  verified_at              TIMESTAMPTZ NOT NULL,
  verified_by              UUID NOT NULL,
  source_assertion         TEXT NOT NULL
                           CHECK (source_assertion = 'staff_confirmed_hostaway_download'),
  supersedes_document_id   UUID,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT os_doc_statement_range CHECK (statement_from <= statement_to),
  CONSTRAINT os_doc_supersedes_not_self CHECK (
    supersedes_document_id IS NULL OR supersedes_document_id <> id
  ),
  CONSTRAINT os_doc_slice_listing CHECK (listing_id = '412148'),
  CONSTRAINT os_doc_slice_property CHECK (
    canonical_property_id = '4eb09c84-907a-404c-b19a-7856f73fadff'::uuid
  ),
  CONSTRAINT os_doc_hash_unique UNIQUE (document_hash),
  CONSTRAINT os_doc_identity_unique UNIQUE (id, listing_id, canonical_property_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_os_doc_supersedes_once
  ON partnership.owner_statement_document (supersedes_document_id)
  WHERE supersedes_document_id IS NOT NULL;

DO $fk$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conname = 'os_doc_supersedes_same_identity'
  ) THEN
    ALTER TABLE partnership.owner_statement_document
      ADD CONSTRAINT os_doc_supersedes_same_identity
      FOREIGN KEY (supersedes_document_id, listing_id, canonical_property_id)
      REFERENCES partnership.owner_statement_document (id, listing_id, canonical_property_id);
  END IF;
END;
$fk$;

COMMENT ON TABLE partnership.owner_statement_document IS
  'Immutable Hostaway Owner Statement document. Evidence only. Not Draft, Certified, or settlement.';

CREATE TABLE IF NOT EXISTS partnership.owner_statement_line (
  id                     UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  document_id            UUID NOT NULL
                         REFERENCES partnership.owner_statement_document(id),
  reservation_id         TEXT NOT NULL
                         CHECK (
                           reservation_id = pg_catalog.btrim(reservation_id)
                           AND length(pg_catalog.btrim(reservation_id)) > 0
                           AND reservation_id ~ '^[0-9A-Za-z_-]{1,64}$'
                         ),
  check_in               DATE NOT NULL,
  check_out              DATE NOT NULL,
  reservation_status     TEXT NOT NULL
                         CHECK (reservation_status IN (
                           'confirmed', 'modified', 'cancelled', 'inquiry',
                           'new', 'unconfirmed', 'pending', 'ownerstay'
                         )),
  gross_rental_revenue   NUMERIC(12,2) NOT NULL CHECK (gross_rental_revenue >= 0),
  platform_fee           NUMERIC(12,2) NOT NULL CHECK (platform_fee >= 0),
  guest_cleaning         NUMERIC(12,2) NOT NULL CHECK (guest_cleaning >= 0),
  total_taxes            NUMERIC(12,2) NOT NULL CHECK (total_taxes >= 0),
  management_charge      NUMERIC(12,2) NOT NULL CHECK (management_charge >= 0),
  net_owner_payout       NUMERIC(12,2) NOT NULL CHECK (net_owner_payout >= 0),
  currency               TEXT NOT NULL CHECK (currency = 'EUR'),
  source_row_reference   TEXT NOT NULL
                         CHECK (source_row_reference ~ '^[A-Za-z0-9_.:-]{1,64}$'),
  reconciliation_status  TEXT NOT NULL
                         CHECK (reconciliation_status IN (
                           'admitted_candidate', 'forecast', 'modified', 'future',
                           'cancelled', 'inquiry', 'permanently_excluded',
                           'not_required', 'matched', 'conflict'
                         )),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT os_line_dates CHECK (check_out >= check_in),
  CONSTRAINT os_line_equation CHECK (
    net_owner_payout
      = gross_rental_revenue
      - platform_fee
      - guest_cleaning
      - total_taxes
      - management_charge
  ),
  CONSTRAINT os_line_reservation_unique UNIQUE (document_id, reservation_id),
  CONSTRAINT os_line_dates_unique UNIQUE (document_id, check_in, check_out)
);

COMMENT ON COLUMN partnership.owner_statement_line.source_row_reference IS
  'Deterministic sheet:row token. Not an identity key. Never a guest name.';
COMMENT ON TABLE partnership.owner_statement_line IS
  'Immutable Owner Statement lines. Listing identity lives on the parent document.';

CREATE TABLE IF NOT EXISTS partnership.owner_statement_document_event (
  id           UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  document_id  UUID NOT NULL
               REFERENCES partnership.owner_statement_document(id),
  event_type   TEXT NOT NULL CHECK (event_type = 'staff_void'),
  reason_code  TEXT NOT NULL CHECK (reason_code IN (
                 'wrong_property',
                 'wrong_listing',
                 'wrong_file',
                 'duplicate_upload',
                 'corrupted_source',
                 'other_requires_note'
               )),
  reason_note  TEXT,
  actor_id     UUID NOT NULL,
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT os_event_note_len CHECK (
    reason_note IS NULL OR char_length(reason_note) <= 256
  ),
  CONSTRAINT os_event_note_sanitized CHECK (
    reason_note IS NULL
    OR (
      reason_note !~ '[\x00-\x1F\x7F]'
      AND reason_note !~* '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}'
    )
  ),
  CONSTRAINT os_event_other_requires_note CHECK (
    reason_code <> 'other_requires_note'
    OR (reason_note IS NOT NULL AND length(pg_catalog.btrim(reason_note)) > 0)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_os_event_staff_void_once
  ON partnership.owner_statement_document_event (document_id)
  WHERE event_type = 'staff_void';

CREATE TABLE IF NOT EXISTS partnership.owner_statement_audit (
  id            UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  document_id   UUID NOT NULL
                REFERENCES partnership.owner_statement_document(id),
  line_id       UUID,
  event         TEXT NOT NULL CHECK (event IN ('document_insert', 'line_insert')),
  actor_id      UUID NOT NULL,
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE partnership.owner_statement_audit IS
  'Append-only insert log. No payload, amounts, hashes, filenames, or PII.';

-- ── Immutability ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION partnership.trg_owner_statement_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO ''
AS $os$
BEGIN
  RAISE EXCEPTION '% forbids % (id=%).', TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME, TG_OP,
    COALESCE(OLD.id, NEW.id)
    USING ERRCODE = 'restrict_violation';
END;
$os$;

DROP TRIGGER IF EXISTS trg_os_document_immutable ON partnership.owner_statement_document;
CREATE TRIGGER trg_os_document_immutable
  BEFORE UPDATE OR DELETE ON partnership.owner_statement_document
  FOR EACH ROW EXECUTE FUNCTION partnership.trg_owner_statement_immutable();

DROP TRIGGER IF EXISTS trg_os_line_immutable ON partnership.owner_statement_line;
CREATE TRIGGER trg_os_line_immutable
  BEFORE UPDATE OR DELETE ON partnership.owner_statement_line
  FOR EACH ROW EXECUTE FUNCTION partnership.trg_owner_statement_immutable();

DROP TRIGGER IF EXISTS trg_os_event_immutable ON partnership.owner_statement_document_event;
CREATE TRIGGER trg_os_event_immutable
  BEFORE UPDATE OR DELETE ON partnership.owner_statement_document_event
  FOR EACH ROW EXECUTE FUNCTION partnership.trg_owner_statement_immutable();

DROP TRIGGER IF EXISTS trg_os_audit_immutable ON partnership.owner_statement_audit;
CREATE TRIGGER trg_os_audit_immutable
  BEFORE UPDATE OR DELETE ON partnership.owner_statement_audit
  FOR EACH ROW EXECUTE FUNCTION partnership.trg_owner_statement_immutable();

CREATE OR REPLACE FUNCTION partnership.trg_os_document_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO ''
AS $os$
DECLARE
  v_actor UUID;
BEGIN
  v_actor := auth.uid();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION '[jj_auth] Authenticated session required for Owner Statement audit.';
  END IF;
  INSERT INTO partnership.owner_statement_audit (document_id, event, actor_id)
  VALUES (NEW.id, 'document_insert', v_actor);
  RETURN NEW;
END;
$os$;

CREATE OR REPLACE FUNCTION partnership.trg_os_line_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO ''
AS $os$
DECLARE
  v_actor UUID;
BEGIN
  v_actor := auth.uid();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION '[jj_auth] Authenticated session required for Owner Statement audit.';
  END IF;
  INSERT INTO partnership.owner_statement_audit (document_id, line_id, event, actor_id)
  VALUES (NEW.document_id, NEW.id, 'line_insert', v_actor);
  RETURN NEW;
END;
$os$;

DROP TRIGGER IF EXISTS trg_os_document_audit ON partnership.owner_statement_document;
CREATE TRIGGER trg_os_document_audit
  AFTER INSERT ON partnership.owner_statement_document
  FOR EACH ROW EXECUTE FUNCTION partnership.trg_os_document_audit();

DROP TRIGGER IF EXISTS trg_os_line_audit ON partnership.owner_statement_line;
CREATE TRIGGER trg_os_line_audit
  AFTER INSERT ON partnership.owner_statement_line
  FOR EACH ROW EXECUTE FUNCTION partnership.trg_os_line_audit();

-- ── Helpers ──────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION partnership.owner_statement_document_is_voided(p_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path TO ''
AS $os$
  SELECT EXISTS (
    SELECT 1
    FROM partnership.owner_statement_document_event e
    WHERE e.document_id = p_id
      AND e.event_type = 'staff_void'
  );
$os$;

CREATE OR REPLACE FUNCTION partnership.owner_statement_document_is_leaf(p_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path TO ''
AS $os$
  SELECT EXISTS (
    SELECT 1
    FROM partnership.owner_statement_document d
    WHERE d.id = p_id
      AND NOT EXISTS (
        SELECT 1
        FROM partnership.owner_statement_document c
        WHERE c.supersedes_document_id = d.id
      )
  );
$os$;

CREATE OR REPLACE FUNCTION partnership.owner_statement_document_is_effective(p_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path TO ''
AS $os$
  SELECT partnership.owner_statement_document_is_leaf(p_id)
     AND NOT partnership.owner_statement_document_is_voided(p_id);
$os$;

CREATE OR REPLACE FUNCTION partnership.assert_document_not_certified(p_document_id UUID)
RETURNS VOID
LANGUAGE plpgsql
STABLE
SET search_path TO ''
AS $os$
BEGIN
  IF p_document_id IS NULL THEN
    RAISE EXCEPTION '[input] document_id must be a UUID.';
  END IF;
  -- Temporary fail-closed compatibility guard for this slice.
  -- If partnership.certified_owner_statement_link does not exist, void may proceed.
  -- If a relation of that exact name exists in any form, void is blocked
  -- (certified_document_immutable). This function must not inspect columns
  -- or guess schema, and must not read an unknown relation shape.
  -- When a Certified OS link table is created later, THAT future migration
  -- must REPLACE this function with a version that checks linkage by
  -- p_document_id. Do not create the link table in this migration.
  IF pg_catalog.to_regclass('partnership.certified_owner_statement_link') IS NOT NULL THEN
    RAISE EXCEPTION '[certified_document_immutable] certified_owner_statement_link exists; void is blocked.'
      USING ERRCODE = 'restrict_violation';
  END IF;
END;
$os$;

CREATE OR REPLACE FUNCTION partnership.owner_statement_canonical_lines(p_lines JSONB)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $os$
  SELECT COALESCE(string_agg(part, E'\n' ORDER BY part), '')
  FROM (
    SELECT
      pg_catalog.btrim(elem->>'reservation_id') || '|' ||
      pg_catalog.btrim(elem->>'check_in') || '|' ||
      pg_catalog.btrim(elem->>'check_out') || '|' ||
      pg_catalog.btrim(elem->>'reservation_status') || '|' ||
      pg_catalog.to_char((elem->>'gross_rental_revenue')::numeric, 'FM9999999990.00') || '|' ||
      pg_catalog.to_char((elem->>'platform_fee')::numeric, 'FM9999999990.00') || '|' ||
      pg_catalog.to_char((elem->>'guest_cleaning')::numeric, 'FM9999999990.00') || '|' ||
      pg_catalog.to_char((elem->>'total_taxes')::numeric, 'FM9999999990.00') || '|' ||
      pg_catalog.to_char((elem->>'management_charge')::numeric, 'FM9999999990.00') || '|' ||
      pg_catalog.to_char((elem->>'net_owner_payout')::numeric, 'FM9999999990.00') || '|' ||
      pg_catalog.btrim(elem->>'currency') || '|' ||
      pg_catalog.btrim(elem->>'source_row_reference') || '|' ||
      pg_catalog.btrim(elem->>'reconciliation_status') AS part
    FROM pg_catalog.jsonb_array_elements(p_lines) AS elem
  ) s;
$os$;

CREATE OR REPLACE FUNCTION partnership.owner_statement_payload_hash(p_lines JSONB)
RETURNS TEXT
LANGUAGE sql
STABLE
SET search_path TO ''
AS $os$
  SELECT pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(partnership.owner_statement_canonical_lines(p_lines), 'UTF8'),
      'sha256'
    ),
    'hex'
  );
$os$;

CREATE OR REPLACE FUNCTION partnership.reject_unknown_keys(p_obj JSONB, p_allowed TEXT[], p_label TEXT)
RETURNS VOID
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO ''
AS $os$
DECLARE
  v_key TEXT;
BEGIN
  IF p_obj IS NULL OR pg_catalog.jsonb_typeof(p_obj) <> 'object' THEN
    RAISE EXCEPTION '[input] % must be a JSON object.', p_label;
  END IF;
  FOR v_key IN SELECT pg_catalog.jsonb_object_keys(p_obj)
  LOOP
    IF NOT (v_key = ANY (p_allowed)) THEN
      RAISE EXCEPTION '[input] % field "%" is not allowed.', p_label, v_key;
    END IF;
  END LOOP;
END;
$os$;

-- ── Ingest ───────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION partnership.ingest_owner_statement_document(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $os$
DECLARE
  v_actor UUID;
  v_auth UUID;
  v_doc JSONB;
  v_lines JSONB := '[]'::jsonb;
  v_elem JSONB;
  v_key TEXT;
  v_listing TEXT;
  v_property UUID;
  v_hash TEXT;
  v_parser TEXT;
  v_norm_hash TEXT;
  v_computed_hash TEXT;
  v_from DATE;
  v_to DATE;
  v_kind TEXT;
  v_assertion TEXT;
  v_supersedes UUID;
  v_existing partnership.owner_statement_document%ROWTYPE;
  v_parent partnership.owner_statement_document%ROWTYPE;
  v_norm JSONB := '[]'::jsonb;
  v_res TEXT;
  v_ci DATE;
  v_co DATE;
  v_status TEXT;
  v_recon TEXT;
  v_currency TEXT;
  v_rowref TEXT;
  v_gross NUMERIC;
  v_platform NUMERIC;
  v_cleaning NUMERIC;
  v_tax NUMERIC;
  v_mgmt NUMERIC;
  v_net NUMERIC;
  v_id UUID;
  v_line_id UUID;
  v_res_ids TEXT[];
  v_pair TEXT;
  v_conflict_res TEXT;
  v_conflict_pair TEXT;
  v_existing_canon TEXT;
  v_new_canon TEXT;
  v_now TIMESTAMPTZ := pg_catalog.now();
BEGIN
  v_auth := auth.uid();
  IF v_auth IS NULL THEN
    RAISE EXCEPTION '[jj_auth] Authenticated session required.';
  END IF;
  v_actor := public.require_jj_staff(ARRAY['ceo', 'finance_admin']);
  IF v_actor IS DISTINCT FROM v_auth THEN
    RAISE EXCEPTION '[jj_auth] staff actor must match auth.uid().';
  END IF;

  IF p_payload IS NULL OR pg_catalog.jsonb_typeof(p_payload) <> 'object' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_payload');
  END IF;

  BEGIN
    PERFORM partnership.reject_unknown_keys(
      p_payload,
      ARRAY[
        'canonical_property_id', 'listing_id', 'source_kind', 'document_hash',
        'parser_version', 'normalized_payload_hash', 'statement_from',
        'statement_to', 'source_assertion', 'supersedes_document_id', 'lines'
      ],
      'payload'
    );
  EXCEPTION
    WHEN others THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'unknown_field');
  END;

  IF p_payload ? 'actor_id' OR p_payload ? 'verified_by' OR p_payload ? 'verified_at'
     OR p_payload ? 'imported_by' OR p_payload ? 'imported_at' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'client_actor_forbidden');
  END IF;

  v_listing := pg_catalog.btrim(p_payload->>'listing_id');
  BEGIN
    v_property := (p_payload->>'canonical_property_id')::uuid;
  EXCEPTION
    WHEN others THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'identity_rejected');
  END;
  v_hash := pg_catalog.btrim(p_payload->>'document_hash');
  v_parser := pg_catalog.btrim(p_payload->>'parser_version');
  v_norm_hash := pg_catalog.btrim(p_payload->>'normalized_payload_hash');
  v_kind := pg_catalog.btrim(p_payload->>'source_kind');
  v_assertion := pg_catalog.btrim(p_payload->>'source_assertion');
  BEGIN
    v_from := (p_payload->>'statement_from')::date;
    v_to := (p_payload->>'statement_to')::date;
  EXCEPTION
    WHEN others THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'invalid_dates');
  END;
  IF p_payload ? 'supersedes_document_id'
     AND p_payload->>'supersedes_document_id' IS NOT NULL
     AND pg_catalog.btrim(p_payload->>'supersedes_document_id') <> '' THEN
    BEGIN
      v_supersedes := (p_payload->>'supersedes_document_id')::uuid;
    EXCEPTION
      WHEN others THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'invalid_supersedes');
    END;
  END IF;

  IF v_listing IS DISTINCT FROM '412148'
     OR v_property IS DISTINCT FROM '4eb09c84-907a-404c-b19a-7856f73fadff'::uuid THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'identity_rejected');
  END IF;
  IF v_kind IS DISTINCT FROM 'hostaway_owner_statement' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'source_kind_rejected');
  END IF;
  IF v_assertion IS DISTINCT FROM 'staff_confirmed_hostaway_download' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'source_assertion_rejected');
  END IF;
  IF v_hash IS NULL OR v_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'document_hash_rejected');
  END IF;
  IF v_norm_hash IS NULL OR v_norm_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'normalized_payload_hash_rejected');
  END IF;
  IF v_from IS NULL OR v_to IS NULL OR v_from > v_to THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_dates');
  END IF;

  v_lines := p_payload->'lines';
  IF v_lines IS NULL OR pg_catalog.jsonb_typeof(v_lines) <> 'array'
     OR pg_catalog.jsonb_array_length(v_lines) < 1 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'lines_required');
  END IF;

  v_res_ids := ARRAY[]::text[];
  FOR v_elem IN SELECT pg_catalog.jsonb_array_elements(v_lines)
  LOOP
    BEGIN
      PERFORM partnership.reject_unknown_keys(
        v_elem,
        ARRAY[
          'reservation_id', 'check_in', 'check_out', 'reservation_status',
          'gross_rental_revenue', 'platform_fee', 'guest_cleaning', 'total_taxes',
          'management_charge', 'net_owner_payout', 'currency',
          'source_row_reference', 'reconciliation_status'
        ],
        'line'
      );
    EXCEPTION
      WHEN others THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'unknown_field');
    END;

    v_res := pg_catalog.btrim(v_elem->>'reservation_id');
    v_status := pg_catalog.btrim(v_elem->>'reservation_status');
    v_recon := pg_catalog.btrim(v_elem->>'reconciliation_status');
    v_currency := pg_catalog.btrim(v_elem->>'currency');
    v_rowref := pg_catalog.btrim(v_elem->>'source_row_reference');
    BEGIN
      v_ci := (v_elem->>'check_in')::date;
      v_co := (v_elem->>'check_out')::date;
    EXCEPTION
      WHEN others THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'invalid_dates');
    END;
    BEGIN
      v_gross := partnership.parse_exact_cents_text(v_elem->>'gross_rental_revenue', 'gross_rental_revenue');
      v_platform := partnership.parse_exact_cents_text(v_elem->>'platform_fee', 'platform_fee');
      v_cleaning := partnership.parse_exact_cents_text(v_elem->>'guest_cleaning', 'guest_cleaning');
      v_tax := partnership.parse_exact_cents_text(v_elem->>'total_taxes', 'total_taxes');
      v_mgmt := partnership.parse_exact_cents_text(v_elem->>'management_charge', 'management_charge');
      v_net := partnership.parse_exact_cents_text(v_elem->>'net_owner_payout', 'net_owner_payout');
    EXCEPTION
      WHEN others THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'cent_rejected');
    END;

    IF v_res IS NULL OR v_res !~ '^[0-9A-Za-z_-]{1,64}$' THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'reservation_id_rejected');
    END IF;
    IF v_ci IS NULL OR v_co IS NULL OR v_co < v_ci THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'invalid_dates');
    END IF;
    IF v_status NOT IN (
      'confirmed', 'modified', 'cancelled', 'inquiry',
      'new', 'unconfirmed', 'pending', 'ownerstay'
    ) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'reservation_status_rejected');
    END IF;
    IF v_recon NOT IN (
      'admitted_candidate', 'forecast', 'modified', 'future',
      'cancelled', 'inquiry', 'permanently_excluded',
      'not_required', 'matched', 'conflict'
    ) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'reconciliation_status_rejected');
    END IF;
    IF v_currency IS DISTINCT FROM 'EUR' THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'currency_rejected');
    END IF;
    IF v_rowref IS NULL OR v_rowref !~ '^[A-Za-z0-9_.:-]{1,64}$' THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'source_row_reference_rejected');
    END IF;
    IF v_net IS DISTINCT FROM (v_gross - v_platform - v_cleaning - v_tax - v_mgmt) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'equation_rejected');
    END IF;

    v_norm := v_norm || jsonb_build_array(jsonb_build_object(
      'reservation_id', v_res,
      'check_in', v_ci,
      'check_out', v_co,
      'reservation_status', v_status,
      'gross_rental_revenue', v_gross,
      'platform_fee', v_platform,
      'guest_cleaning', v_cleaning,
      'total_taxes', v_tax,
      'management_charge', v_mgmt,
      'net_owner_payout', v_net,
      'currency', v_currency,
      'source_row_reference', v_rowref,
      'reconciliation_status', v_recon
    ));
    v_res_ids := array_append(v_res_ids, v_res);
  END LOOP;

  BEGIN
    v_computed_hash := partnership.owner_statement_payload_hash(v_norm);
  EXCEPTION
    WHEN others THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'normalized_payload_hash_rejected');
  END;

  -- Locks: listing, reservation ids sorted, date pairs sorted, document hash.
  PERFORM pg_catalog.pg_advisory_xact_lock(872010, pg_catalog.hashtext('os:listing:' || v_listing));

  FOR v_res IN
    SELECT DISTINCT x FROM unnest(v_res_ids) AS x ORDER BY x
  LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(
      872010, pg_catalog.hashtext('os:res:' || v_listing || ':' || v_res)
    );
  END LOOP;

  FOR v_pair IN
    SELECT DISTINCT (elem->>'check_in') || '|' || (elem->>'check_out')
    FROM pg_catalog.jsonb_array_elements(v_norm) elem
    ORDER BY 1
  LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(
      872010, pg_catalog.hashtext('os:dates:' || v_listing || ':' || v_pair)
    );
  END LOOP;

  PERFORM pg_catalog.pg_advisory_xact_lock(872010, pg_catalog.hashtext('os:hash:' || v_hash));

  SELECT * INTO v_existing
  FROM partnership.owner_statement_document d
  WHERE d.document_hash = v_hash;

  IF FOUND THEN
    IF partnership.owner_statement_document_is_voided(v_existing.id) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'voided_document_same_hash');
    END IF;

    SELECT COALESCE(jsonb_agg(line ORDER BY line->>'reservation_id'), '[]'::jsonb)
      INTO v_doc
    FROM (
      SELECT jsonb_build_object(
        'reservation_id', l.reservation_id,
        'check_in', l.check_in,
        'check_out', l.check_out,
        'reservation_status', l.reservation_status,
        'gross_rental_revenue', l.gross_rental_revenue,
        'platform_fee', l.platform_fee,
        'guest_cleaning', l.guest_cleaning,
        'total_taxes', l.total_taxes,
        'management_charge', l.management_charge,
        'net_owner_payout', l.net_owner_payout,
        'currency', l.currency,
        'source_row_reference', l.source_row_reference,
        'reconciliation_status', l.reconciliation_status
      ) AS line
      FROM partnership.owner_statement_line l
      WHERE l.document_id = v_existing.id
    ) s;

    v_existing_canon := partnership.owner_statement_canonical_lines(v_doc);
    v_new_canon := partnership.owner_statement_canonical_lines(v_norm);

    IF v_existing.parser_version IS NOT DISTINCT FROM v_parser
       AND v_existing.normalized_payload_hash IS NOT DISTINCT FROM v_norm_hash
       AND v_existing.listing_id IS NOT DISTINCT FROM v_listing
       AND v_existing.canonical_property_id IS NOT DISTINCT FROM v_property
       AND v_existing.statement_from IS NOT DISTINCT FROM v_from
       AND v_existing.statement_to IS NOT DISTINCT FROM v_to
       AND v_existing.source_kind IS NOT DISTINCT FROM v_kind
       AND v_existing.source_assertion IS NOT DISTINCT FROM v_assertion
       AND v_existing.supersedes_document_id IS NOT DISTINCT FROM v_supersedes
       AND v_existing_canon IS NOT DISTINCT FROM v_new_canon THEN
      RETURN jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'document_id', v_existing.id
      );
    END IF;

    RETURN jsonb_build_object('ok', false, 'reason', 'hash_payload_conflict');
  END IF;

  IF v_parser IS DISTINCT FROM 'hostaway_owner_minimal_xlsx_v1' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'parser_version_rejected');
  END IF;
  IF v_computed_hash IS DISTINCT FROM v_norm_hash THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'normalized_payload_hash_mismatch');
  END IF;

  IF v_supersedes IS NOT NULL THEN
    SELECT * INTO v_parent
    FROM partnership.owner_statement_document d
    WHERE d.id = v_supersedes;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'supersedes_not_found');
    END IF;
    IF v_parent.listing_id IS DISTINCT FROM v_listing
       OR v_parent.canonical_property_id IS DISTINCT FROM v_property THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'supersedes_identity_rejected');
    END IF;
    IF v_parent.document_hash IS NOT DISTINCT FROM v_hash THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'hash_payload_conflict');
    END IF;
    IF NOT partnership.owner_statement_document_is_leaf(v_parent.id) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'supersedes_not_leaf');
    END IF;
  END IF;

  SELECT l.reservation_id INTO v_conflict_res
  FROM partnership.owner_statement_line l
  JOIN partnership.owner_statement_document d ON d.id = l.document_id
  WHERE d.listing_id = v_listing
    AND partnership.owner_statement_document_is_effective(d.id)
    AND (v_supersedes IS NULL OR d.id IS DISTINCT FROM v_supersedes)
    AND l.reservation_id = ANY (v_res_ids)
  LIMIT 1;
  IF v_conflict_res IS NOT NULL THEN
    SELECT l.gross_rental_revenue, l.platform_fee, l.guest_cleaning,
           l.total_taxes, l.management_charge, l.net_owner_payout
      INTO v_gross, v_platform, v_cleaning, v_tax, v_mgmt, v_net
    FROM partnership.owner_statement_line l
    JOIN partnership.owner_statement_document d ON d.id = l.document_id
    WHERE d.listing_id = v_listing
      AND partnership.owner_statement_document_is_effective(d.id)
      AND l.reservation_id = v_conflict_res
    LIMIT 1;

    SELECT elem INTO v_elem
    FROM pg_catalog.jsonb_array_elements(v_norm) elem
    WHERE elem->>'reservation_id' = v_conflict_res
    LIMIT 1;

    IF v_elem IS NOT NULL
       AND (
         v_gross IS DISTINCT FROM (v_elem->>'gross_rental_revenue')::numeric
         OR v_platform IS DISTINCT FROM (v_elem->>'platform_fee')::numeric
         OR v_cleaning IS DISTINCT FROM (v_elem->>'guest_cleaning')::numeric
         OR v_tax IS DISTINCT FROM (v_elem->>'total_taxes')::numeric
         OR v_mgmt IS DISTINCT FROM (v_elem->>'management_charge')::numeric
         OR v_net IS DISTINCT FROM (v_elem->>'net_owner_payout')::numeric
       ) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'cent_conflict');
    END IF;
    RETURN jsonb_build_object('ok', false, 'reason', 'reservation_conflict');
  END IF;

  SELECT (elem->>'check_in') || '|' || (elem->>'check_out') INTO v_conflict_pair
  FROM pg_catalog.jsonb_array_elements(v_norm) elem
  WHERE EXISTS (
    SELECT 1
    FROM partnership.owner_statement_line l
    JOIN partnership.owner_statement_document d ON d.id = l.document_id
    WHERE d.listing_id = v_listing
      AND partnership.owner_statement_document_is_effective(d.id)
      AND (v_supersedes IS NULL OR d.id IS DISTINCT FROM v_supersedes)
      AND l.check_in = (elem->>'check_in')::date
      AND l.check_out = (elem->>'check_out')::date
  )
  LIMIT 1;
  IF v_conflict_pair IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'date_pair_conflict');
  END IF;

  INSERT INTO partnership.owner_statement_document (
    canonical_property_id, listing_id, source_kind, document_hash, parser_version,
    normalized_payload_hash, statement_from, statement_to, imported_at, imported_by,
    verified_at, verified_by, source_assertion, supersedes_document_id
  ) VALUES (
    v_property, v_listing, v_kind, v_hash, v_parser, v_norm_hash, v_from, v_to,
    v_now, v_actor, v_now, v_actor, v_assertion, v_supersedes
  ) RETURNING id INTO v_id;

  FOR v_elem IN SELECT pg_catalog.jsonb_array_elements(v_norm)
  LOOP
    INSERT INTO partnership.owner_statement_line (
      document_id, reservation_id, check_in, check_out, reservation_status,
      gross_rental_revenue, platform_fee, guest_cleaning, total_taxes,
      management_charge, net_owner_payout, currency, source_row_reference,
      reconciliation_status
    ) VALUES (
      v_id,
      v_elem->>'reservation_id',
      (v_elem->>'check_in')::date,
      (v_elem->>'check_out')::date,
      v_elem->>'reservation_status',
      (v_elem->>'gross_rental_revenue')::numeric,
      (v_elem->>'platform_fee')::numeric,
      (v_elem->>'guest_cleaning')::numeric,
      (v_elem->>'total_taxes')::numeric,
      (v_elem->>'management_charge')::numeric,
      (v_elem->>'net_owner_payout')::numeric,
      v_elem->>'currency',
      v_elem->>'source_row_reference',
      v_elem->>'reconciliation_status'
    ) RETURNING id INTO v_line_id;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'idempotent', false, 'document_id', v_id);
END;
$os$;

-- ── Reader ───────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION partnership.read_owner_statement_for_listing(
  p_listing_id TEXT,
  p_from DATE,
  p_to DATE
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $os$
DECLARE
  v_actor UUID;
  v_auth UUID;
  v_conflict_res TEXT;
  v_conflict_pair TEXT;
  v_docs JSONB;
  v_lines JSONB;
BEGIN
  v_auth := auth.uid();
  IF v_auth IS NULL THEN
    RAISE EXCEPTION '[jj_auth] Authenticated session required.';
  END IF;
  v_actor := public.require_jj_staff(ARRAY['ceo', 'finance_admin']);
  IF v_actor IS DISTINCT FROM v_auth THEN
    RAISE EXCEPTION '[jj_auth] staff actor must match auth.uid().';
  END IF;

  IF pg_catalog.btrim(COALESCE(p_listing_id, '')) IS DISTINCT FROM '412148' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'identity_rejected');
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_from > p_to THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_dates');
  END IF;

  SELECT l.reservation_id INTO v_conflict_res
  FROM partnership.owner_statement_line l
  JOIN partnership.owner_statement_document d ON d.id = l.document_id
  WHERE d.listing_id = '412148'
    AND partnership.owner_statement_document_is_effective(d.id)
    AND l.check_in >= p_from AND l.check_in <= p_to
  GROUP BY l.reservation_id
  HAVING count(*) > 1
  LIMIT 1;
  IF v_conflict_res IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'reservation_conflict');
  END IF;

  SELECT l.check_in::text || '|' || l.check_out::text INTO v_conflict_pair
  FROM partnership.owner_statement_line l
  JOIN partnership.owner_statement_document d ON d.id = l.document_id
  WHERE d.listing_id = '412148'
    AND partnership.owner_statement_document_is_effective(d.id)
    AND l.check_in >= p_from AND l.check_in <= p_to
  GROUP BY l.check_in, l.check_out
  HAVING count(*) > 1
  LIMIT 1;
  IF v_conflict_pair IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'date_pair_conflict');
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.statement_from), '[]'::jsonb)
    INTO v_docs
  FROM (
    SELECT d.id, d.listing_id, d.statement_from, d.statement_to, d.verified_at
    FROM partnership.owner_statement_document d
    WHERE d.listing_id = '412148'
      AND partnership.owner_statement_document_is_effective(d.id)
  ) s;

  SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.check_in, s.reservation_id), '[]'::jsonb)
    INTO v_lines
  FROM (
    SELECT
      l.document_id,
      l.reservation_id,
      l.check_in,
      l.check_out,
      l.reservation_status,
      l.reconciliation_status,
      l.currency,
      l.source_row_reference,
      l.gross_rental_revenue,
      l.platform_fee,
      l.guest_cleaning,
      l.total_taxes,
      l.management_charge,
      l.net_owner_payout
    FROM partnership.owner_statement_line l
    JOIN partnership.owner_statement_document d ON d.id = l.document_id
    WHERE d.listing_id = '412148'
      AND partnership.owner_statement_document_is_effective(d.id)
      AND l.check_in >= p_from
      AND l.check_in <= p_to
  ) s;

  IF v_lines = '[]'::jsonb THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_evidence');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'listing_id', '412148',
    'period_from', p_from,
    'period_to', p_to,
    'period_filter', 'line.check_in inclusive',
    'documents', v_docs,
    'lines', v_lines
  );
END;
$os$;

-- ── Void ─────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION partnership.void_owner_statement_document(
  p_document_id UUID,
  p_reason_code TEXT,
  p_reason_note TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $os$
DECLARE
  v_actor UUID;
  v_auth UUID;
  v_note TEXT;
  v_exists BOOLEAN;
BEGIN
  v_auth := auth.uid();
  IF v_auth IS NULL THEN
    RAISE EXCEPTION '[jj_auth] Authenticated session required.';
  END IF;
  v_actor := public.require_jj_staff(ARRAY['ceo', 'finance_admin']);
  IF v_actor IS DISTINCT FROM v_auth THEN
    RAISE EXCEPTION '[jj_auth] staff actor must match auth.uid().';
  END IF;

  IF p_document_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'document_not_found');
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM partnership.owner_statement_document d WHERE d.id = p_document_id
  ) INTO v_exists;
  IF NOT v_exists THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'document_not_found');
  END IF;

  IF partnership.owner_statement_document_is_voided(p_document_id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_voided');
  END IF;

  BEGIN
    PERFORM partnership.assert_document_not_certified(p_document_id);
  EXCEPTION
    WHEN others THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'certified_document_immutable');
  END;

  IF p_reason_code IS NULL OR p_reason_code NOT IN (
    'wrong_property', 'wrong_listing', 'wrong_file',
    'duplicate_upload', 'corrupted_source', 'other_requires_note'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'reason_rejected');
  END IF;

  v_note := NULLIF(pg_catalog.btrim(COALESCE(p_reason_note, '')), '');
  IF v_note IS NOT NULL THEN
    IF char_length(v_note) > 256 OR v_note ~ '[\x00-\x1F\x7F]'
       OR v_note ~* '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}' THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'reason_note_rejected');
    END IF;
  END IF;
  IF p_reason_code = 'other_requires_note' AND v_note IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'reason_note_required');
  END IF;

  INSERT INTO partnership.owner_statement_document_event (
    document_id, event_type, reason_code, reason_note, actor_id
  ) VALUES (
    p_document_id, 'staff_void', p_reason_code, v_note, v_actor
  );

  RETURN jsonb_build_object('ok', true, 'document_id', p_document_id, 'event_type', 'staff_void');
END;
$os$;

-- ── Public wrappers ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ingest_partnership_owner_statement_document(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $wrap$
DECLARE
  v_actor UUID;
  v_auth UUID;
BEGIN
  v_auth := auth.uid();
  IF v_auth IS NULL THEN
    RAISE EXCEPTION '[jj_auth] Authenticated session required.';
  END IF;
  v_actor := public.require_jj_staff(ARRAY['ceo', 'finance_admin']);
  IF v_actor IS DISTINCT FROM v_auth THEN
    RAISE EXCEPTION '[jj_auth] staff actor must match auth.uid().';
  END IF;
  RETURN partnership.ingest_owner_statement_document(p_payload);
END;
$wrap$;

CREATE OR REPLACE FUNCTION public.read_partnership_owner_statement_for_listing(
  p_listing_id TEXT,
  p_from DATE,
  p_to DATE
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $wrap$
DECLARE
  v_actor UUID;
  v_auth UUID;
BEGIN
  v_auth := auth.uid();
  IF v_auth IS NULL THEN
    RAISE EXCEPTION '[jj_auth] Authenticated session required.';
  END IF;
  v_actor := public.require_jj_staff(ARRAY['ceo', 'finance_admin']);
  IF v_actor IS DISTINCT FROM v_auth THEN
    RAISE EXCEPTION '[jj_auth] staff actor must match auth.uid().';
  END IF;
  RETURN partnership.read_owner_statement_for_listing(p_listing_id, p_from, p_to);
END;
$wrap$;

CREATE OR REPLACE FUNCTION public.void_partnership_owner_statement_document(
  p_document_id UUID,
  p_reason_code TEXT,
  p_reason_note TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $wrap$
DECLARE
  v_actor UUID;
  v_auth UUID;
BEGIN
  v_auth := auth.uid();
  IF v_auth IS NULL THEN
    RAISE EXCEPTION '[jj_auth] Authenticated session required.';
  END IF;
  v_actor := public.require_jj_staff(ARRAY['ceo', 'finance_admin']);
  IF v_actor IS DISTINCT FROM v_auth THEN
    RAISE EXCEPTION '[jj_auth] staff actor must match auth.uid().';
  END IF;
  RETURN partnership.void_owner_statement_document(p_document_id, p_reason_code, p_reason_note);
END;
$wrap$;

COMMENT ON FUNCTION public.ingest_partnership_owner_statement_document(JSONB) IS
  'Staff-only public wrapper. User JWT. Hidden schema partnership. Evidence ingest only.';
COMMENT ON FUNCTION public.read_partnership_owner_statement_for_listing(TEXT, DATE, DATE) IS
  'Staff-only public wrapper. Effective Owner Statement evidence. Not an Avi DTO.';
COMMENT ON FUNCTION public.void_partnership_owner_statement_document(UUID, TEXT, TEXT) IS
  'Staff-only public wrapper. Append-only staff_void. Document rows stay immutable.';

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE partnership.owner_statement_document ENABLE ROW LEVEL SECURITY;
ALTER TABLE partnership.owner_statement_document FORCE ROW LEVEL SECURITY;
ALTER TABLE partnership.owner_statement_line ENABLE ROW LEVEL SECURITY;
ALTER TABLE partnership.owner_statement_line FORCE ROW LEVEL SECURITY;
ALTER TABLE partnership.owner_statement_document_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE partnership.owner_statement_document_event FORCE ROW LEVEL SECURITY;
ALTER TABLE partnership.owner_statement_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE partnership.owner_statement_audit FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deny_all_os_document ON partnership.owner_statement_document;
CREATE POLICY deny_all_os_document
  ON partnership.owner_statement_document AS RESTRICTIVE
  FOR ALL TO public USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS deny_all_os_line ON partnership.owner_statement_line;
CREATE POLICY deny_all_os_line
  ON partnership.owner_statement_line AS RESTRICTIVE
  FOR ALL TO public USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS deny_all_os_event ON partnership.owner_statement_document_event;
CREATE POLICY deny_all_os_event
  ON partnership.owner_statement_document_event AS RESTRICTIVE
  FOR ALL TO public USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS deny_all_os_audit ON partnership.owner_statement_audit;
CREATE POLICY deny_all_os_audit
  ON partnership.owner_statement_audit AS RESTRICTIVE
  FOR ALL TO public USING (false) WITH CHECK (false);

-- ── Grants / revokes / default privileges ────────────────────────────────────

REVOKE ALL ON SCHEMA partnership FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON ALL TABLES IN SCHEMA partnership FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA partnership FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA partnership FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON TABLE partnership.owner_statement_document FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE partnership.owner_statement_line FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE partnership.owner_statement_document_event FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE partnership.owner_statement_audit FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION partnership.assert_exact_cents(NUMERIC, TEXT) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION partnership.parse_exact_cents_text(TEXT, TEXT) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION partnership.trg_owner_statement_immutable() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION partnership.trg_os_document_audit() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION partnership.trg_os_line_audit() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION partnership.owner_statement_document_is_voided(UUID) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION partnership.owner_statement_document_is_leaf(UUID) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION partnership.owner_statement_document_is_effective(UUID) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION partnership.assert_document_not_certified(UUID) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION partnership.owner_statement_canonical_lines(JSONB) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION partnership.owner_statement_payload_hash(JSONB) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION partnership.reject_unknown_keys(JSONB, TEXT[], TEXT) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION partnership.ingest_owner_statement_document(JSONB) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION partnership.read_owner_statement_for_listing(TEXT, DATE, DATE) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION partnership.void_owner_statement_document(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ingest_partnership_owner_statement_document(JSONB) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.read_partnership_owner_statement_for_listing(TEXT, DATE, DATE) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.void_partnership_owner_statement_document(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.ingest_partnership_owner_statement_document(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.read_partnership_owner_statement_for_listing(TEXT, DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.void_partnership_owner_statement_document(UUID, TEXT, TEXT) TO authenticated;

DO $priv$
DECLARE
  r TEXT;
BEGIN
  FOREACH r IN ARRAY ARRAY['postgres', 'supabase_admin']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA partnership REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated, service_role',
        r
      );
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA partnership REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated, service_role',
        r
      );
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA partnership REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon, authenticated, service_role',
        r
      );
    END IF;
  END LOOP;
END;
$priv$;
