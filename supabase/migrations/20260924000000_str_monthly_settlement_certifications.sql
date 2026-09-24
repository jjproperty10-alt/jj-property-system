-- ============================================================
-- finance.str_monthly_settlement_certifications
-- LOCAL IMPLEMENTATION ONLY. Do not Apply to Production from this branch
-- without a separate Yossi authorization. No certification-row Apply.
-- Migration order: immediately after 20260923233000_owner_level_client_obligation.sql.
--
-- Purpose:
--   Generic certified monthly STR owner-settlement overlay.
--   owner_net is an approved accounting value supported by evidence.
--   Supporting PMS components are informational and are never invented as zero.
--
-- Safety:
--   - No INSERT/UPDATE/DELETE on public.transactions
--   - No cash, payer/payee, P&L, RC3, or settlement-event writes
--   - No writes to existing client-settlement certification tables
--   - No CREATE OR REPLACE of public cash/RC3/certified/settlement-summary views
--   - No pms schema exposure
--   - No seed rows (no client, property, or amount literals)
--   - Canonical property identity is public.property_definitions.property_id
-- ============================================================

CREATE SCHEMA IF NOT EXISTS finance;

-- ── 1. Header ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS finance.str_monthly_settlement_certifications (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id         UUID NOT NULL REFERENCES lifecycle.entity_identity(id),
  property_id       UUID NOT NULL REFERENCES public.property_definitions(property_id),
  period_from       DATE NOT NULL,
  period_to         DATE NOT NULL,
  currency          TEXT NOT NULL DEFAULT 'EUR'
                    CHECK (currency = 'EUR'),
  status            TEXT NOT NULL
                    CHECK (status IN ('draft', 'approved', 'applied', 'void')),
  version           INTEGER NOT NULL CHECK (version >= 1),
  supersedes_id     UUID REFERENCES finance.str_monthly_settlement_certifications(id),
  idempotency_key   TEXT NOT NULL UNIQUE,
  total_owner_net   NUMERIC(14,2) NOT NULL,
  reason            TEXT NOT NULL CHECK (length(btrim(reason)) > 0),
  evidence_ref      TEXT NOT NULL CHECK (length(btrim(evidence_ref)) > 0),
  opened_by         UUID NOT NULL,
  approved_by       UUID,
  applied_by        UUID,
  opened_at         TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  approved_at       TIMESTAMPTZ,
  applied_at        TIMESTAMPTZ,
  voided_at         TIMESTAMPTZ,
  voided_by         UUID,
  void_reason       TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT smsc_period_order CHECK (period_from <= period_to),
  CONSTRAINT smsc_supersedes_not_self CHECK (
    supersedes_id IS NULL OR supersedes_id <> id
  ),
  CONSTRAINT smsc_applied_pair CHECK (
    status <> 'applied'
    OR (
      approved_by IS NOT NULL
      AND approved_at IS NOT NULL
      AND applied_by IS NOT NULL
      AND applied_at IS NOT NULL
      AND opened_by IS NOT NULL
      AND opened_at IS NOT NULL
    )
  ),
  CONSTRAINT smsc_void_pair CHECK (
    status <> 'void'
    OR (
      voided_by IS NOT NULL
      AND voided_at IS NOT NULL
      AND void_reason IS NOT NULL
      AND length(btrim(void_reason)) > 0
    )
  )
);

COMMENT ON TABLE finance.str_monthly_settlement_certifications IS
  'Certified monthly STR owner settlement. owner_net is an approved accounting value. Never cash, never JJ P&L, never a second posting of a certified client closing.';

COMMENT ON COLUMN finance.str_monthly_settlement_certifications.property_id IS
  'Canonical reporting property UUID: public.property_definitions.property_id.';

COMMENT ON COLUMN finance.str_monthly_settlement_certifications.total_owner_net IS
  'Certified owner-net total for the exact period. Must equal the sum of monthly owner_net lines.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_smsc_applied_entity_property_period
  ON finance.str_monthly_settlement_certifications (entity_id, property_id, period_from, period_to)
  WHERE status = 'applied';

CREATE UNIQUE INDEX IF NOT EXISTS uq_smsc_entity_property_period_version
  ON finance.str_monthly_settlement_certifications (entity_id, property_id, period_from, period_to, version);

CREATE INDEX IF NOT EXISTS idx_smsc_entity_property_period_status
  ON finance.str_monthly_settlement_certifications (entity_id, property_id, period_from, period_to, status);

-- ── 2. Lines ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS finance.str_monthly_settlement_lines (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  certification_id                UUID NOT NULL
                                  REFERENCES finance.str_monthly_settlement_certifications(id),
  month_start                     DATE NOT NULL,
  reservation_count               INTEGER,
  nights                          INTEGER,
  owner_net                       NUMERIC(14,2) NOT NULL,
  source_authority                TEXT NOT NULL
                                  CHECK (source_authority IN (
                                    'platform_statement',
                                    'owner_statement',
                                    'approved_reconstruction'
                                  )),
  evidence_ref                    TEXT NOT NULL CHECK (length(btrim(evidence_ref)) > 0),
  evidence_note                   TEXT NOT NULL CHECK (length(btrim(evidence_note)) > 0),
  line_order                      INTEGER NOT NULL CHECK (line_order >= 1),
  metadata                        JSONB NOT NULL DEFAULT '{}'::jsonb,
  gross_accommodation             NUMERIC(14,2),
  platform_fee                    NUMERIC(14,2),
  cleaning_amount                 NUMERIC(14,2),
  tax_amount                      NUMERIC(14,2),
  management_fee                  NUMERIC(14,2),
  other_adjustments               NUMERIC(14,2),
  component_reconciliation_status TEXT NOT NULL
                                  CHECK (component_reconciliation_status IN (
                                    'complete',
                                    'partial',
                                    'certified_total_only'
                                  )),
  CONSTRAINT uq_smsc_line_month UNIQUE (certification_id, month_start),
  CONSTRAINT uq_smsc_line_order UNIQUE (certification_id, line_order),
  CONSTRAINT smsc_month_start_first CHECK (EXTRACT(DAY FROM month_start) = 1),
  CONSTRAINT smsc_reservation_count_nonneg CHECK (
    reservation_count IS NULL OR reservation_count >= 0
  ),
  CONSTRAINT smsc_nights_nonneg CHECK (nights IS NULL OR nights >= 0),
  CONSTRAINT smsc_line_metadata_object CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT smsc_certified_total_only_no_components CHECK (
    component_reconciliation_status <> 'certified_total_only'
    OR (
      gross_accommodation IS NULL
      AND platform_fee IS NULL
      AND cleaning_amount IS NULL
      AND tax_amount IS NULL
      AND management_fee IS NULL
      AND other_adjustments IS NULL
    )
  )
);

COMMENT ON TABLE finance.str_monthly_settlement_lines IS
  'Monthly certified owner-net lines. Components stay null when unknown. Null counts are not zero.';

COMMENT ON COLUMN finance.str_monthly_settlement_lines.owner_net IS
  'Certified accounting owner net for the check-in month. Not derived from incomplete PMS components.';

COMMENT ON COLUMN finance.str_monthly_settlement_lines.component_reconciliation_status IS
  'complete, partial, or certified_total_only. partial and certified_total_only must not be presented as a component formula for owner_net.';

CREATE INDEX IF NOT EXISTS idx_smsc_lines_cert_month
  ON finance.str_monthly_settlement_lines (certification_id, month_start);

-- ── 3. Append-only audit ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS finance.str_monthly_settlement_audit (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  certification_id  UUID NOT NULL
                    REFERENCES finance.str_monthly_settlement_certifications(id),
  line_id           UUID,
  event             TEXT NOT NULL
                    CHECK (event IN (
                      'insert',
                      'line_insert',
                      'approve',
                      'apply',
                      'status_change',
                      'supersede',
                      'void'
                    )),
  actor             UUID,
  occurred_at       TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  old_row           JSONB,
  new_row           JSONB,
  reason            TEXT,
  evidence_ref      TEXT,
  transaction_id    TEXT NOT NULL
);

COMMENT ON TABLE finance.str_monthly_settlement_audit IS
  'Immutable append-only audit for monthly STR certifications. transaction_id is the database transaction id, not a ledger row.';

CREATE INDEX IF NOT EXISTS idx_smsc_audit_cert_at
  ON finance.str_monthly_settlement_audit (certification_id, occurred_at);

-- ── 4. Guards ────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION finance.trg_str_monthly_settlement_certifications_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO ''
AS $smsc$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'str_monthly_settlement_certifications forbids physical DELETE (id=%). Void instead.',
      OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'void' THEN
      RAISE EXCEPTION 'void certifications are immutable (id=%).', OLD.id
        USING ERRCODE = 'restrict_violation';
    END IF;

    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.entity_id IS DISTINCT FROM OLD.entity_id
       OR NEW.property_id IS DISTINCT FROM OLD.property_id
       OR NEW.period_from IS DISTINCT FROM OLD.period_from
       OR NEW.period_to IS DISTINCT FROM OLD.period_to
       OR NEW.currency IS DISTINCT FROM OLD.currency
       OR NEW.reason IS DISTINCT FROM OLD.reason
       OR NEW.evidence_ref IS DISTINCT FROM OLD.evidence_ref
       OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
       OR NEW.opened_by IS DISTINCT FROM OLD.opened_by
       OR NEW.opened_at IS DISTINCT FROM OLD.opened_at
       OR NEW.total_owner_net IS DISTINCT FROM OLD.total_owner_net
       OR NEW.version IS DISTINCT FROM OLD.version
       OR NEW.supersedes_id IS DISTINCT FROM OLD.supersedes_id
       OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
       OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
       OR NEW.applied_by IS DISTINCT FROM OLD.applied_by
       OR NEW.applied_at IS DISTINCT FROM OLD.applied_at
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
    THEN
      RAISE EXCEPTION 'str_monthly_settlement_certifications payload columns are immutable (id=%).',
        OLD.id
        USING ERRCODE = 'restrict_violation';
    END IF;

    IF NOT (OLD.status = 'applied' AND NEW.status = 'void') THEN
      RAISE EXCEPTION 'str_monthly_settlement_certifications status % cannot become % (id=%).',
        OLD.status, NEW.status, OLD.id
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$smsc$;

DROP TRIGGER IF EXISTS trg_str_monthly_settlement_certifications_guard
  ON finance.str_monthly_settlement_certifications;
CREATE TRIGGER trg_str_monthly_settlement_certifications_guard
  BEFORE UPDATE OR DELETE ON finance.str_monthly_settlement_certifications
  FOR EACH ROW EXECUTE FUNCTION finance.trg_str_monthly_settlement_certifications_guard();

CREATE OR REPLACE FUNCTION finance.trg_str_monthly_settlement_lines_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO ''
AS $smsc$
BEGIN
  RAISE EXCEPTION 'str_monthly_settlement_lines are immutable after insert. UPDATE and DELETE are prohibited.'
    USING ERRCODE = 'restrict_violation';
END;
$smsc$;

DROP TRIGGER IF EXISTS trg_str_monthly_settlement_lines_guard
  ON finance.str_monthly_settlement_lines;
CREATE TRIGGER trg_str_monthly_settlement_lines_guard
  BEFORE UPDATE OR DELETE ON finance.str_monthly_settlement_lines
  FOR EACH ROW EXECUTE FUNCTION finance.trg_str_monthly_settlement_lines_guard();

CREATE OR REPLACE FUNCTION finance.trg_str_monthly_settlement_audit_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO ''
AS $smsc$
BEGIN
  RAISE EXCEPTION 'str_monthly_settlement_audit is append-only. UPDATE and DELETE are prohibited.'
    USING ERRCODE = 'restrict_violation';
END;
$smsc$;

DROP TRIGGER IF EXISTS trg_str_monthly_settlement_audit_guard
  ON finance.str_monthly_settlement_audit;
CREATE TRIGGER trg_str_monthly_settlement_audit_guard
  BEFORE UPDATE OR DELETE ON finance.str_monthly_settlement_audit
  FOR EACH ROW EXECUTE FUNCTION finance.trg_str_monthly_settlement_audit_guard();

CREATE OR REPLACE FUNCTION finance.str_monthly_settlement_audit_write(
  p_certification_id UUID,
  p_line_id          UUID,
  p_event            TEXT,
  p_actor            UUID,
  p_old_row          JSONB,
  p_new_row          JSONB,
  p_reason           TEXT,
  p_evidence_ref     TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SET search_path TO ''
AS $smsc$
BEGIN
  INSERT INTO finance.str_monthly_settlement_audit (
    certification_id, line_id, event, actor, old_row, new_row,
    reason, evidence_ref, transaction_id
  ) VALUES (
    p_certification_id,
    p_line_id,
    p_event,
    p_actor,
    p_old_row,
    p_new_row,
    p_reason,
    p_evidence_ref,
    pg_catalog.pg_current_xact_id()::text
  );
END;
$smsc$;

CREATE OR REPLACE FUNCTION finance.trg_str_monthly_settlement_certifications_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO ''
AS $smsc$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM finance.str_monthly_settlement_audit_write(
      NEW.id,
      NULL,
      'insert',
      NEW.opened_by,
      NULL,
      pg_catalog.to_jsonb(NEW),
      NEW.reason,
      NEW.evidence_ref
    );
    RETURN NEW;
  END IF;

  PERFORM finance.str_monthly_settlement_audit_write(
    NEW.id,
    NULL,
    CASE
      WHEN NEW.status IS DISTINCT FROM OLD.status THEN 'status_change'
      ELSE 'update'
    END,
    COALESCE(NEW.voided_by, NEW.applied_by, NEW.opened_by),
    pg_catalog.to_jsonb(OLD),
    pg_catalog.to_jsonb(NEW),
    NEW.void_reason,
    NEW.evidence_ref
  );
  RETURN NEW;
END;
$smsc$;

DROP TRIGGER IF EXISTS trg_str_monthly_settlement_certifications_audit
  ON finance.str_monthly_settlement_certifications;
CREATE TRIGGER trg_str_monthly_settlement_certifications_audit
  AFTER INSERT OR UPDATE ON finance.str_monthly_settlement_certifications
  FOR EACH ROW EXECUTE FUNCTION finance.trg_str_monthly_settlement_certifications_audit();

CREATE OR REPLACE FUNCTION finance.trg_str_monthly_settlement_lines_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO ''
AS $smsc$
BEGIN
  PERFORM finance.str_monthly_settlement_audit_write(
    NEW.certification_id,
    NEW.id,
    'line_insert',
    auth.uid(),
    NULL,
    pg_catalog.to_jsonb(NEW),
    NEW.evidence_note,
    NEW.evidence_ref
  );
  RETURN NEW;
END;
$smsc$;

DROP TRIGGER IF EXISTS trg_str_monthly_settlement_lines_audit
  ON finance.str_monthly_settlement_lines;
CREATE TRIGGER trg_str_monthly_settlement_lines_audit
  AFTER INSERT ON finance.str_monthly_settlement_lines
  FOR EACH ROW EXECUTE FUNCTION finance.trg_str_monthly_settlement_lines_audit();

CREATE OR REPLACE FUNCTION finance.trg_str_monthly_settlement_line_period()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO ''
AS $smsc$
DECLARE
  v_from      DATE;
  v_to        DATE;
  v_month_end DATE;
BEGIN
  IF EXTRACT(DAY FROM NEW.month_start) IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION '[input] month_start must be the first day of the month.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT c.period_from, c.period_to
    INTO v_from, v_to
  FROM finance.str_monthly_settlement_certifications c
  WHERE c.id = NEW.certification_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION '[not_found] certification % does not exist.', NEW.certification_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  v_month_end := (NEW.month_start + INTERVAL '1 month' - INTERVAL '1 day')::date;
  IF NEW.month_start < v_from OR v_month_end > v_to THEN
    RAISE EXCEPTION '[denied] month % is outside the certification period.', NEW.month_start
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$smsc$;

DROP TRIGGER IF EXISTS trg_str_monthly_settlement_line_period
  ON finance.str_monthly_settlement_lines;
CREATE TRIGGER trg_str_monthly_settlement_line_period
  BEFORE INSERT ON finance.str_monthly_settlement_lines
  FOR EACH ROW EXECUTE FUNCTION finance.trg_str_monthly_settlement_line_period();

CREATE OR REPLACE FUNCTION finance.trg_str_monthly_settlement_sum_deferred()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO ''
AS $smsc$
DECLARE
  v_id    UUID;
  v_total NUMERIC(14,2);
  v_sum   NUMERIC(14,2);
  v_n     INTEGER;
BEGIN
  IF TG_TABLE_NAME = 'str_monthly_settlement_certifications' THEN
    v_id := NEW.id;
  ELSE
    v_id := NEW.certification_id;
  END IF;

  SELECT c.total_owner_net
    INTO v_total
  FROM finance.str_monthly_settlement_certifications c
  WHERE c.id = v_id;

  SELECT COALESCE(pg_catalog.sum(l.owner_net), 0), pg_catalog.count(*)::integer
    INTO v_sum, v_n
  FROM finance.str_monthly_settlement_lines l
  WHERE l.certification_id = v_id;

  IF v_n < 1 THEN
    RAISE EXCEPTION '[denied] certification % has no monthly lines.', v_id
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF v_sum IS DISTINCT FROM v_total THEN
    RAISE EXCEPTION '[denied] monthly owner_net sum does not equal total_owner_net for %.', v_id
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NULL;
END;
$smsc$;

DROP TRIGGER IF EXISTS trg_str_monthly_settlement_sum_header
  ON finance.str_monthly_settlement_certifications;
CREATE CONSTRAINT TRIGGER trg_str_monthly_settlement_sum_header
  AFTER INSERT ON finance.str_monthly_settlement_certifications
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION finance.trg_str_monthly_settlement_sum_deferred();

DROP TRIGGER IF EXISTS trg_str_monthly_settlement_sum_lines
  ON finance.str_monthly_settlement_lines;
CREATE CONSTRAINT TRIGGER trg_str_monthly_settlement_sum_lines
  AFTER INSERT ON finance.str_monthly_settlement_lines
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION finance.trg_str_monthly_settlement_sum_deferred();

-- ── 5. RLS ───────────────────────────────────────────────────────────────────

ALTER TABLE finance.str_monthly_settlement_certifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.str_monthly_settlement_certifications FORCE ROW LEVEL SECURITY;
ALTER TABLE finance.str_monthly_settlement_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.str_monthly_settlement_lines FORCE ROW LEVEL SECURITY;
ALTER TABLE finance.str_monthly_settlement_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.str_monthly_settlement_audit FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deny_all_str_monthly_settlement_certifications
  ON finance.str_monthly_settlement_certifications;
CREATE POLICY deny_all_str_monthly_settlement_certifications
  ON finance.str_monthly_settlement_certifications AS RESTRICTIVE
  FOR ALL TO public
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS deny_all_str_monthly_settlement_lines
  ON finance.str_monthly_settlement_lines;
CREATE POLICY deny_all_str_monthly_settlement_lines
  ON finance.str_monthly_settlement_lines AS RESTRICTIVE
  FOR ALL TO public
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS deny_all_str_monthly_settlement_audit
  ON finance.str_monthly_settlement_audit;
CREATE POLICY deny_all_str_monthly_settlement_audit
  ON finance.str_monthly_settlement_audit AS RESTRICTIVE
  FOR ALL TO public
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE finance.str_monthly_settlement_certifications FROM PUBLIC;
REVOKE ALL ON TABLE finance.str_monthly_settlement_certifications FROM anon, authenticated;
REVOKE ALL ON TABLE finance.str_monthly_settlement_lines FROM PUBLIC;
REVOKE ALL ON TABLE finance.str_monthly_settlement_lines FROM anon, authenticated;
REVOKE ALL ON TABLE finance.str_monthly_settlement_audit FROM PUBLIC;
REVOKE ALL ON TABLE finance.str_monthly_settlement_audit FROM anon, authenticated;

GRANT USAGE ON SCHEMA finance TO service_role;
GRANT SELECT ON TABLE finance.str_monthly_settlement_certifications TO service_role;
GRANT SELECT ON TABLE finance.str_monthly_settlement_lines TO service_role;
GRANT SELECT ON TABLE finance.str_monthly_settlement_audit TO service_role;

-- ── 6. Helpers (postgres-only EXECUTE) ───────────────────────────────────────

CREATE OR REPLACE FUNCTION finance.assert_str_monthly_settlement_authorized()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $smsc$
DECLARE
  v_actor UUID;
BEGIN
  v_actor := public.require_jj_staff(ARRAY['ceo', 'finance_admin']);
  IF v_actor IS NULL THEN
    RAISE EXCEPTION '[jj_auth] Authenticated session required.';
  END IF;
  RETURN v_actor;
END;
$smsc$;

CREATE OR REPLACE FUNCTION finance.assert_str_monthly_exact_cents(p_value NUMERIC, p_label TEXT)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO ''
AS $smsc$
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
  RETURN p_value;
END;
$smsc$;

REVOKE ALL ON FUNCTION finance.assert_str_monthly_settlement_authorized() FROM PUBLIC;
REVOKE ALL ON FUNCTION finance.assert_str_monthly_settlement_authorized() FROM anon, authenticated, service_role;
REVOKE ALL ON FUNCTION finance.assert_str_monthly_exact_cents(NUMERIC, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION finance.assert_str_monthly_exact_cents(NUMERIC, TEXT) FROM anon, authenticated, service_role;
REVOKE ALL ON FUNCTION finance.str_monthly_settlement_audit_write(UUID, UUID, TEXT, UUID, JSONB, JSONB, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION finance.str_monthly_settlement_audit_write(UUID, UUID, TEXT, UUID, JSONB, JSONB, TEXT, TEXT) FROM anon, authenticated, service_role;
REVOKE ALL ON FUNCTION finance.trg_str_monthly_settlement_certifications_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION finance.trg_str_monthly_settlement_certifications_guard() FROM anon, authenticated, service_role;
REVOKE ALL ON FUNCTION finance.trg_str_monthly_settlement_lines_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION finance.trg_str_monthly_settlement_lines_guard() FROM anon, authenticated, service_role;
REVOKE ALL ON FUNCTION finance.trg_str_monthly_settlement_audit_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION finance.trg_str_monthly_settlement_audit_guard() FROM anon, authenticated, service_role;
REVOKE ALL ON FUNCTION finance.trg_str_monthly_settlement_certifications_audit() FROM PUBLIC;
REVOKE ALL ON FUNCTION finance.trg_str_monthly_settlement_certifications_audit() FROM anon, authenticated, service_role;
REVOKE ALL ON FUNCTION finance.trg_str_monthly_settlement_lines_audit() FROM PUBLIC;
REVOKE ALL ON FUNCTION finance.trg_str_monthly_settlement_lines_audit() FROM anon, authenticated, service_role;
REVOKE ALL ON FUNCTION finance.trg_str_monthly_settlement_line_period() FROM PUBLIC;
REVOKE ALL ON FUNCTION finance.trg_str_monthly_settlement_line_period() FROM anon, authenticated, service_role;
REVOKE ALL ON FUNCTION finance.trg_str_monthly_settlement_sum_deferred() FROM PUBLIC;
REVOKE ALL ON FUNCTION finance.trg_str_monthly_settlement_sum_deferred() FROM anon, authenticated, service_role;

-- ── 7. Atomic apply RPC ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.apply_str_monthly_settlement_certification(
  p_entity_id         UUID,
  p_property_id       UUID,
  p_period_from       DATE,
  p_period_to         DATE,
  p_version           INTEGER,
  p_supersedes_id     UUID,
  p_total_owner_net   NUMERIC,
  p_reason            TEXT,
  p_evidence_ref      TEXT,
  p_idempotency_key   TEXT,
  p_lines             JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $smsc$
DECLARE
  v_actor            UUID;
  v_existing         finance.str_monthly_settlement_certifications%ROWTYPE;
  v_prior            finance.str_monthly_settlement_certifications%ROWTYPE;
  v_id               UUID;
  v_elem             JSONB;
  v_key              TEXT;
  v_line_order       INTEGER;
  v_month            DATE;
  v_month_end        DATE;
  v_count            INTEGER;
  v_nights           INTEGER;
  v_owner_net        NUMERIC;
  v_source           TEXT;
  v_line_evidence    TEXT;
  v_note             TEXT;
  v_status           TEXT;
  v_metadata         JSONB;
  v_gross            NUMERIC;
  v_platform         NUMERIC;
  v_cleaning         NUMERIC;
  v_tax              NUMERIC;
  v_mgmt             NUMERIC;
  v_other            NUMERIC;
  v_sum              NUMERIC := 0;
  v_seen_orders      INTEGER[] := '{}';
  v_seen_months      DATE[] := '{}';
  v_norm_lines       JSONB := '[]'::jsonb;
  v_existing_lines   JSONB;
  v_n                INTEGER := 0;
  v_lock_key         TEXT;
  v_component_labels TEXT[] := ARRAY[
    'gross_accommodation',
    'platform_fee',
    'cleaning_amount',
    'tax_amount',
    'management_fee',
    'other_adjustments'
  ];
  v_component_label  TEXT;
  v_component_value  NUMERIC;
  v_component_json   JSONB;
BEGIN
  v_actor := finance.assert_str_monthly_settlement_authorized();

  IF p_entity_id IS NULL THEN
    RAISE EXCEPTION '[input] entity_id must be a UUID.';
  END IF;
  IF p_property_id IS NULL THEN
    RAISE EXCEPTION '[input] property_id must be a UUID.';
  END IF;
  IF p_period_from IS NULL OR p_period_to IS NULL THEN
    RAISE EXCEPTION '[input] period_from and period_to must be dates.';
  END IF;
  IF p_period_from > p_period_to THEN
    RAISE EXCEPTION '[input] period_from must be on or before period_to.';
  END IF;
  IF p_reason IS NULL OR pg_catalog.btrim(p_reason) = '' THEN
    RAISE EXCEPTION '[input] reason must be non-empty.';
  END IF;
  IF p_evidence_ref IS NULL OR pg_catalog.btrim(p_evidence_ref) = '' THEN
    RAISE EXCEPTION '[input] evidence_ref must be non-empty.';
  END IF;
  IF p_idempotency_key IS NULL OR pg_catalog.btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION '[input] idempotency_key must be non-empty.';
  END IF;
  IF p_version IS NULL OR p_version < 1 THEN
    RAISE EXCEPTION '[input] version must be an integer >= 1.';
  END IF;
  PERFORM finance.assert_str_monthly_exact_cents(p_total_owner_net, 'total_owner_net');
  IF NOT EXISTS (SELECT 1 FROM lifecycle.entity_identity e WHERE e.id = p_entity_id) THEN
    RAISE EXCEPTION '[not_found] entity_id does not exist.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.property_definitions d WHERE d.property_id = p_property_id
  ) THEN
    RAISE EXCEPTION '[not_found] property_id does not exist in the canonical property registry.';
  END IF;
  IF p_lines IS NULL OR pg_catalog.jsonb_typeof(p_lines) <> 'array' THEN
    RAISE EXCEPTION '[input] lines must be a JSON array.';
  END IF;
  IF pg_catalog.jsonb_array_length(p_lines) < 1 THEN
    RAISE EXCEPTION '[input] lines must not be empty.';
  END IF;

  FOR v_elem IN SELECT pg_catalog.jsonb_array_elements(p_lines)
  LOOP
    IF pg_catalog.jsonb_typeof(v_elem) <> 'object' THEN
      RAISE EXCEPTION '[input] each line must be a JSON object.';
    END IF;
    FOR v_key IN SELECT pg_catalog.jsonb_object_keys(v_elem)
    LOOP
      IF v_key NOT IN (
        'month_start', 'reservation_count', 'nights', 'owner_net',
        'source_authority', 'evidence_ref', 'evidence_note', 'line_order',
        'metadata', 'component_reconciliation_status',
        'gross_accommodation', 'platform_fee', 'cleaning_amount',
        'tax_amount', 'management_fee', 'other_adjustments'
      ) THEN
        RAISE EXCEPTION '[input] line field "%" is not allowed.', v_key;
      END IF;
    END LOOP;

    IF NOT (v_elem ? 'month_start')
       OR NOT (v_elem ? 'owner_net')
       OR NOT (v_elem ? 'source_authority')
       OR NOT (v_elem ? 'evidence_ref')
       OR NOT (v_elem ? 'evidence_note')
       OR NOT (v_elem ? 'line_order')
       OR NOT (v_elem ? 'component_reconciliation_status')
    THEN
      RAISE EXCEPTION '[input] line is missing a required field.';
    END IF;

    BEGIN
      v_line_order := (v_elem->>'line_order')::integer;
      v_month := (v_elem->>'month_start')::date;
      v_owner_net := (v_elem->>'owner_net')::numeric;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR datetime_field_overflow THEN
      RAISE EXCEPTION '[input] line_order, month_start, and owner_net must be valid.';
    END;

    IF v_line_order IS NULL OR v_line_order < 1 THEN
      RAISE EXCEPTION '[input] line_order must be an integer >= 1.';
    END IF;
    IF v_month IS NULL OR EXTRACT(DAY FROM v_month) IS DISTINCT FROM 1 THEN
      RAISE EXCEPTION '[input] month_start must be the first day of the month.';
    END IF;
    v_month_end := (v_month + INTERVAL '1 month' - INTERVAL '1 day')::date;
    IF v_month < p_period_from OR v_month_end > p_period_to THEN
      RAISE EXCEPTION '[denied] month % is outside the certification period.', v_month;
    END IF;
    PERFORM finance.assert_str_monthly_exact_cents(v_owner_net, 'owner_net');

    v_count := NULL;
    v_nights := NULL;
    IF v_elem ? 'reservation_count'
       AND pg_catalog.jsonb_typeof(v_elem->'reservation_count') <> 'null' THEN
      IF pg_catalog.jsonb_typeof(v_elem->'reservation_count') <> 'number'
         OR (v_elem->>'reservation_count') !~ '^[0-9]+$' THEN
        RAISE EXCEPTION '[input] reservation_count must be a non-negative integer or null.';
      END IF;
      v_count := (v_elem->>'reservation_count')::integer;
    END IF;
    IF v_elem ? 'nights'
       AND pg_catalog.jsonb_typeof(v_elem->'nights') <> 'null' THEN
      IF pg_catalog.jsonb_typeof(v_elem->'nights') <> 'number'
         OR (v_elem->>'nights') !~ '^[0-9]+$' THEN
        RAISE EXCEPTION '[input] nights must be a non-negative integer or null.';
      END IF;
      v_nights := (v_elem->>'nights')::integer;
    END IF;

    v_source := pg_catalog.btrim(v_elem->>'source_authority');
    v_line_evidence := pg_catalog.btrim(v_elem->>'evidence_ref');
    v_note := pg_catalog.btrim(v_elem->>'evidence_note');
    v_status := pg_catalog.btrim(v_elem->>'component_reconciliation_status');
    v_metadata := COALESCE(v_elem->'metadata', '{}'::jsonb);

    IF v_source NOT IN ('platform_statement', 'owner_statement', 'approved_reconstruction') THEN
      RAISE EXCEPTION '[input] source_authority is not recognized.';
    END IF;
    IF v_status NOT IN ('complete', 'partial', 'certified_total_only') THEN
      RAISE EXCEPTION '[input] component_reconciliation_status is not recognized.';
    END IF;
    IF v_line_evidence = '' OR v_note = '' THEN
      RAISE EXCEPTION '[input] line evidence fields must be non-empty.';
    END IF;
    IF pg_catalog.jsonb_typeof(v_metadata) <> 'object' THEN
      RAISE EXCEPTION '[input] metadata must be a JSON object.';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM pg_catalog.jsonb_object_keys(v_metadata) AS k
      WHERE k IN (
        'guest_name', 'guest_email', 'guest_phone',
        'email', 'phone', 'telephone', 'mobile'
      )
    ) THEN
      RAISE EXCEPTION '[denied] guest contact fields are not allowed in metadata.';
    END IF;

    v_component_json := '{}'::jsonb;
    FOREACH v_component_label IN ARRAY v_component_labels
    LOOP
      v_component_value := NULL;
      IF v_elem ? v_component_label
         AND pg_catalog.jsonb_typeof(v_elem->v_component_label) <> 'null' THEN
        BEGIN
          v_component_value := (v_elem->>v_component_label)::numeric;
        EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
          RAISE EXCEPTION '[input] % must be a finite exact-cent number or null.', v_component_label;
        END;
        PERFORM finance.assert_str_monthly_exact_cents(v_component_value, v_component_label);
      END IF;
      IF v_status = 'certified_total_only' AND v_component_value IS NOT NULL THEN
        RAISE EXCEPTION '[denied] certified_total_only lines cannot carry component amounts.';
      END IF;
      v_component_json := v_component_json || pg_catalog.jsonb_build_object(
        v_component_label,
        CASE
          WHEN v_component_value IS NULL THEN NULL
          ELSE pg_catalog.to_jsonb(pg_catalog.to_char(v_component_value, 'FM999999999990.00'))
        END
      );
    END LOOP;

    v_gross := NULLIF(v_component_json->>'gross_accommodation', '')::numeric;
    v_platform := NULLIF(v_component_json->>'platform_fee', '')::numeric;
    v_cleaning := NULLIF(v_component_json->>'cleaning_amount', '')::numeric;
    v_tax := NULLIF(v_component_json->>'tax_amount', '')::numeric;
    v_mgmt := NULLIF(v_component_json->>'management_fee', '')::numeric;
    v_other := NULLIF(v_component_json->>'other_adjustments', '')::numeric;

    IF v_line_order = ANY (v_seen_orders) THEN
      RAISE EXCEPTION '[denied] duplicate line_order is not allowed.';
    END IF;
    IF v_month = ANY (v_seen_months) THEN
      RAISE EXCEPTION '[denied] duplicate month_start is not allowed.';
    END IF;

    v_seen_orders := v_seen_orders || v_line_order;
    v_seen_months := v_seen_months || v_month;
    v_sum := v_sum + v_owner_net;
    v_n := v_n + 1;
    v_norm_lines := v_norm_lines || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'line_order', v_line_order,
        'month_start', pg_catalog.to_char(v_month, 'YYYY-MM-DD'),
        'reservation_count', v_count,
        'nights', v_nights,
        'owner_net_text', pg_catalog.to_char(v_owner_net, 'FM999999999990.00'),
        'source_authority', v_source,
        'evidence_ref', v_line_evidence,
        'evidence_note', v_note,
        'component_reconciliation_status', v_status,
        'gross_accommodation_text', CASE WHEN v_gross IS NULL THEN NULL ELSE pg_catalog.to_char(v_gross, 'FM999999999990.00') END,
        'platform_fee_text', CASE WHEN v_platform IS NULL THEN NULL ELSE pg_catalog.to_char(v_platform, 'FM999999999990.00') END,
        'cleaning_amount_text', CASE WHEN v_cleaning IS NULL THEN NULL ELSE pg_catalog.to_char(v_cleaning, 'FM999999999990.00') END,
        'tax_amount_text', CASE WHEN v_tax IS NULL THEN NULL ELSE pg_catalog.to_char(v_tax, 'FM999999999990.00') END,
        'management_fee_text', CASE WHEN v_mgmt IS NULL THEN NULL ELSE pg_catalog.to_char(v_mgmt, 'FM999999999990.00') END,
        'other_adjustments_text', CASE WHEN v_other IS NULL THEN NULL ELSE pg_catalog.to_char(v_other, 'FM999999999990.00') END,
        'metadata', v_metadata
      )
    );
  END LOOP;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(elem ORDER BY (elem->>'line_order')::integer),
    '[]'::jsonb
  )
    INTO v_norm_lines
  FROM pg_catalog.jsonb_array_elements(v_norm_lines) AS elem;

  v_sum := finance.assert_str_monthly_exact_cents(v_sum, 'sum(lines.owner_net)');
  IF v_sum IS DISTINCT FROM p_total_owner_net THEN
    RAISE EXCEPTION '[denied] header total_owner_net does not equal sum of monthly owner_net lines.';
  END IF;

  v_lock_key := p_entity_id::text || '|' || p_property_id::text || '|'
    || p_period_from::text || '|' || p_period_to::text;
  PERFORM pg_catalog.pg_advisory_xact_lock(872117, pg_catalog.hashtext(v_lock_key));
  PERFORM pg_catalog.pg_advisory_xact_lock(
    872117, pg_catalog.hashtext('idemp:' || pg_catalog.btrim(p_idempotency_key))
  );

  SELECT * INTO v_existing
  FROM finance.str_monthly_settlement_certifications c
  WHERE c.idempotency_key = pg_catalog.btrim(p_idempotency_key)
  FOR UPDATE;

  IF FOUND THEN
    SELECT pg_catalog.jsonb_agg(line ORDER BY (line->>'line_order')::integer)
      INTO v_existing_lines
    FROM (
      SELECT pg_catalog.jsonb_build_object(
        'line_order', l.line_order,
        'month_start', pg_catalog.to_char(l.month_start, 'YYYY-MM-DD'),
        'reservation_count', l.reservation_count,
        'nights', l.nights,
        'owner_net_text', pg_catalog.to_char(l.owner_net, 'FM999999999990.00'),
        'source_authority', l.source_authority,
        'evidence_ref', l.evidence_ref,
        'evidence_note', l.evidence_note,
        'component_reconciliation_status', l.component_reconciliation_status,
        'gross_accommodation_text', CASE WHEN l.gross_accommodation IS NULL THEN NULL ELSE pg_catalog.to_char(l.gross_accommodation, 'FM999999999990.00') END,
        'platform_fee_text', CASE WHEN l.platform_fee IS NULL THEN NULL ELSE pg_catalog.to_char(l.platform_fee, 'FM999999999990.00') END,
        'cleaning_amount_text', CASE WHEN l.cleaning_amount IS NULL THEN NULL ELSE pg_catalog.to_char(l.cleaning_amount, 'FM999999999990.00') END,
        'tax_amount_text', CASE WHEN l.tax_amount IS NULL THEN NULL ELSE pg_catalog.to_char(l.tax_amount, 'FM999999999990.00') END,
        'management_fee_text', CASE WHEN l.management_fee IS NULL THEN NULL ELSE pg_catalog.to_char(l.management_fee, 'FM999999999990.00') END,
        'other_adjustments_text', CASE WHEN l.other_adjustments IS NULL THEN NULL ELSE pg_catalog.to_char(l.other_adjustments, 'FM999999999990.00') END,
        'metadata', l.metadata
      ) AS line
      FROM finance.str_monthly_settlement_lines l
      WHERE l.certification_id = v_existing.id
    ) s;

    IF v_existing.entity_id IS DISTINCT FROM p_entity_id
       OR v_existing.property_id IS DISTINCT FROM p_property_id
       OR v_existing.period_from IS DISTINCT FROM p_period_from
       OR v_existing.period_to IS DISTINCT FROM p_period_to
       OR v_existing.version IS DISTINCT FROM p_version
       OR v_existing.supersedes_id IS DISTINCT FROM p_supersedes_id
       OR v_existing.total_owner_net IS DISTINCT FROM p_total_owner_net
       OR v_existing.reason IS DISTINCT FROM pg_catalog.btrim(p_reason)
       OR v_existing.evidence_ref IS DISTINCT FROM pg_catalog.btrim(p_evidence_ref)
       OR COALESCE(v_existing_lines, '[]'::jsonb) IS DISTINCT FROM v_norm_lines
    THEN
      RAISE EXCEPTION '[denied] idempotency_key already exists with a different payload.';
    END IF;

    RETURN pg_catalog.jsonb_build_object(
      'id', v_existing.id,
      'status', v_existing.status,
      'replay', true,
      'inserted', false,
      'inserted_count', 0,
      'actor', v_actor
    );
  END IF;

  IF p_supersedes_id IS NOT NULL THEN
    SELECT * INTO v_prior
    FROM finance.str_monthly_settlement_certifications c
    WHERE c.id = p_supersedes_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION '[not_found] supersedes_id does not exist.';
    END IF;
    IF v_prior.entity_id IS DISTINCT FROM p_entity_id
       OR v_prior.property_id IS DISTINCT FROM p_property_id
       OR v_prior.period_from IS DISTINCT FROM p_period_from
       OR v_prior.period_to IS DISTINCT FROM p_period_to
    THEN
      RAISE EXCEPTION '[denied] supersedes_id is not in the same entity/property/period chain.';
    END IF;
    IF v_prior.version IS DISTINCT FROM (p_version - 1) THEN
      RAISE EXCEPTION '[denied] version must be prior.version + 1 when superseding.';
    END IF;
    IF v_prior.status = 'applied' THEN
      UPDATE finance.str_monthly_settlement_certifications
         SET status = 'void',
             voided_by = v_actor,
             voided_at = pg_catalog.now(),
             void_reason = 'superseded',
             updated_at = pg_catalog.now()
       WHERE id = v_prior.id;
      PERFORM finance.str_monthly_settlement_audit_write(
        v_prior.id,
        NULL,
        'supersede',
        v_actor,
        pg_catalog.to_jsonb(v_prior),
        pg_catalog.jsonb_build_object('superseded_by_pending', true),
        'superseded',
        pg_catalog.btrim(p_evidence_ref)
      );
    ELSIF v_prior.status <> 'void' THEN
      RAISE EXCEPTION '[denied] superseded certification must be applied or void.';
    END IF;
  ELSE
    IF p_version <> 1 THEN
      RAISE EXCEPTION '[input] first certification in a chain must be version 1.';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM finance.str_monthly_settlement_certifications c
      WHERE c.entity_id = p_entity_id
        AND c.property_id = p_property_id
        AND c.period_from = p_period_from
        AND c.period_to = p_period_to
        AND c.status = 'applied'
    ) THEN
      RAISE EXCEPTION '[denied] an applied certification already exists for this entity/property/period.';
    END IF;
  END IF;

  INSERT INTO finance.str_monthly_settlement_certifications (
    entity_id, property_id, period_from, period_to, currency, status,
    reason, evidence_ref, idempotency_key,
    opened_by, approved_by, applied_by,
    opened_at, approved_at, applied_at,
    total_owner_net, version, supersedes_id
  ) VALUES (
    p_entity_id, p_property_id, p_period_from, p_period_to, 'EUR', 'applied',
    pg_catalog.btrim(p_reason), pg_catalog.btrim(p_evidence_ref),
    pg_catalog.btrim(p_idempotency_key),
    v_actor, v_actor, v_actor,
    pg_catalog.now(), pg_catalog.now(), pg_catalog.now(),
    p_total_owner_net, p_version, p_supersedes_id
  )
  RETURNING id INTO v_id;

  PERFORM finance.str_monthly_settlement_audit_write(
    v_id, NULL, 'approve', v_actor, NULL,
    pg_catalog.jsonb_build_object('status', 'approved'),
    pg_catalog.btrim(p_reason),
    pg_catalog.btrim(p_evidence_ref)
  );
  PERFORM finance.str_monthly_settlement_audit_write(
    v_id, NULL, 'apply', v_actor, NULL,
    pg_catalog.jsonb_build_object('status', 'applied'),
    pg_catalog.btrim(p_reason),
    pg_catalog.btrim(p_evidence_ref)
  );

  FOR v_elem IN
    SELECT elem
    FROM pg_catalog.jsonb_array_elements(v_norm_lines) AS elem
    ORDER BY (elem->>'line_order')::integer
  LOOP
    INSERT INTO finance.str_monthly_settlement_lines (
      certification_id, month_start, reservation_count, nights, owner_net,
      source_authority, evidence_ref, evidence_note, line_order, metadata,
      gross_accommodation, platform_fee, cleaning_amount, tax_amount,
      management_fee, other_adjustments, component_reconciliation_status
    ) VALUES (
      v_id,
      (v_elem->>'month_start')::date,
      CASE WHEN v_elem->'reservation_count' = 'null'::jsonb THEN NULL ELSE (v_elem->>'reservation_count')::integer END,
      CASE WHEN v_elem->'nights' = 'null'::jsonb THEN NULL ELSE (v_elem->>'nights')::integer END,
      (v_elem->>'owner_net_text')::numeric,
      v_elem->>'source_authority',
      v_elem->>'evidence_ref',
      v_elem->>'evidence_note',
      (v_elem->>'line_order')::integer,
      COALESCE(v_elem->'metadata', '{}'::jsonb),
      NULLIF(v_elem->>'gross_accommodation_text', '')::numeric,
      NULLIF(v_elem->>'platform_fee_text', '')::numeric,
      NULLIF(v_elem->>'cleaning_amount_text', '')::numeric,
      NULLIF(v_elem->>'tax_amount_text', '')::numeric,
      NULLIF(v_elem->>'management_fee_text', '')::numeric,
      NULLIF(v_elem->>'other_adjustments_text', '')::numeric,
      v_elem->>'component_reconciliation_status'
    );
  END LOOP;

  RETURN pg_catalog.jsonb_build_object(
    'id', v_id,
    'status', 'applied',
    'replay', false,
    'inserted', true,
    'inserted_count', v_n,
    'actor', v_actor
  );
END;
$smsc$;

CREATE OR REPLACE FUNCTION public.void_str_monthly_settlement_certification(
  p_id            UUID,
  p_reason        TEXT,
  p_evidence_ref  TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $smsc$
DECLARE
  v_actor UUID;
  v_row   finance.str_monthly_settlement_certifications%ROWTYPE;
BEGIN
  v_actor := finance.assert_str_monthly_settlement_authorized();

  IF p_id IS NULL THEN
    RAISE EXCEPTION '[input] id must be a UUID.';
  END IF;
  IF p_reason IS NULL OR pg_catalog.btrim(p_reason) = '' THEN
    RAISE EXCEPTION '[input] reason must be non-empty.';
  END IF;
  IF p_evidence_ref IS NULL OR pg_catalog.btrim(p_evidence_ref) = '' THEN
    RAISE EXCEPTION '[input] evidence_ref must be non-empty.';
  END IF;

  SELECT * INTO v_row
  FROM finance.str_monthly_settlement_certifications c
  WHERE c.id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION '[not_found] certification % does not exist.', p_id;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    872117,
    pg_catalog.hashtext(
      v_row.entity_id::text || '|' || v_row.property_id::text || '|'
      || v_row.period_from::text || '|' || v_row.period_to::text
    )
  );

  SELECT * INTO v_row
  FROM finance.str_monthly_settlement_certifications c
  WHERE c.id = p_id
  FOR UPDATE;

  IF v_row.status = 'void' THEN
    RETURN pg_catalog.jsonb_build_object(
      'id', v_row.id,
      'status', v_row.status,
      'replay', true,
      'inserted_count', 0,
      'actor', v_actor
    );
  END IF;
  IF v_row.status <> 'applied' THEN
    RAISE EXCEPTION '[denied] certification % is in status "%" and cannot be voided.',
      p_id, v_row.status;
  END IF;

  UPDATE finance.str_monthly_settlement_certifications
     SET status = 'void',
         voided_by = v_actor,
         voided_at = pg_catalog.now(),
         void_reason = pg_catalog.btrim(p_reason),
         updated_at = pg_catalog.now()
   WHERE id = p_id;

  PERFORM finance.str_monthly_settlement_audit_write(
    p_id,
    NULL,
    'void',
    v_actor,
    pg_catalog.to_jsonb(v_row),
    pg_catalog.jsonb_build_object(
      'reason', pg_catalog.btrim(p_reason),
      'evidence_ref', pg_catalog.btrim(p_evidence_ref),
      'prior_status', v_row.status
    ),
    pg_catalog.btrim(p_reason),
    pg_catalog.btrim(p_evidence_ref)
  );

  RETURN pg_catalog.jsonb_build_object(
    'id', p_id,
    'status', 'void',
    'replay', false,
    'inserted_count', 0,
    'actor', v_actor
  );
END;
$smsc$;

-- ── 8. Readers ───────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION finance.read_certified_str_monthly_settlement(
  p_entity_id   UUID,
  p_property_id UUID,
  p_period_from DATE,
  p_period_to   DATE
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO ''
AS $smsc$
DECLARE
  v_header  finance.str_monthly_settlement_certifications%ROWTYPE;
  v_months  JSONB;
  v_sum     NUMERIC(14,2);
BEGIN
  IF p_entity_id IS NULL OR p_property_id IS NULL OR p_period_from IS NULL OR p_period_to IS NULL THEN
    RAISE EXCEPTION '[input] entity_id, property_id, period_from, and period_to are required.';
  END IF;

  SELECT * INTO v_header
  FROM finance.str_monthly_settlement_certifications c
  WHERE c.entity_id = p_entity_id
    AND c.property_id = p_property_id
    AND c.period_from = p_period_from
    AND c.period_to = p_period_to
    AND c.status = 'applied';

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object(
      'unavailable', true,
      'reason', 'no_applied_certification'
    );
  END IF;

  SELECT pg_catalog.sum(l.owner_net)
    INTO v_sum
  FROM finance.str_monthly_settlement_lines l
  WHERE l.certification_id = v_header.id;

  SELECT COALESCE(pg_catalog.jsonb_agg(line ORDER BY month_start, line_order), '[]'::jsonb)
    INTO v_months
  FROM (
    SELECT
      l.month_start,
      l.line_order,
      CASE
        WHEN pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
          'gross_accommodation', l.gross_accommodation,
          'platform_fee', l.platform_fee,
          'cleaning_amount', l.cleaning_amount,
          'tax_amount', l.tax_amount,
          'management_fee', l.management_fee,
          'other_adjustments', l.other_adjustments
        )) = '{}'::jsonb
        THEN pg_catalog.jsonb_build_object(
          'month', pg_catalog.to_char(l.month_start, 'YYYY-MM-DD'),
          'reservation_count', l.reservation_count,
          'nights', l.nights,
          'owner_net', l.owner_net,
          'source_authority', l.source_authority,
          'evidence_note', l.evidence_note,
          'component_reconciliation_status', l.component_reconciliation_status
        )
        ELSE pg_catalog.jsonb_build_object(
          'month', pg_catalog.to_char(l.month_start, 'YYYY-MM-DD'),
          'reservation_count', l.reservation_count,
          'nights', l.nights,
          'owner_net', l.owner_net,
          'source_authority', l.source_authority,
          'evidence_note', l.evidence_note,
          'component_reconciliation_status', l.component_reconciliation_status,
          'components', pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
            'gross_accommodation', l.gross_accommodation,
            'platform_fee', l.platform_fee,
            'cleaning_amount', l.cleaning_amount,
            'tax_amount', l.tax_amount,
            'management_fee', l.management_fee,
            'other_adjustments', l.other_adjustments
          ))
        )
      END AS line
    FROM finance.str_monthly_settlement_lines l
    WHERE l.certification_id = v_header.id
  ) s;

  RETURN pg_catalog.jsonb_build_object(
    'unavailable', false,
    'certification_id', v_header.id,
    'entity_id', v_header.entity_id,
    'property_id', v_header.property_id,
    'period_from', v_header.period_from,
    'period_to', v_header.period_to,
    'version', v_header.version,
    'total_owner_net', v_header.total_owner_net,
    'months', v_months,
    'reconciliation', pg_catalog.jsonb_build_object(
      'monthly_sum', v_sum,
      'certified_total', v_header.total_owner_net,
      'difference', v_header.total_owner_net - v_sum,
      'status', CASE
        WHEN v_header.total_owner_net IS NOT DISTINCT FROM v_sum THEN 'exact'
        ELSE 'mismatch'
      END
    )
  );
END;
$smsc$;

CREATE OR REPLACE FUNCTION public.read_certified_str_monthly_settlement(
  p_entity_id   UUID,
  p_property_id UUID,
  p_period_from DATE,
  p_period_to   DATE
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $smsc$
BEGIN
  IF p_entity_id IS NULL OR p_property_id IS NULL OR p_period_from IS NULL OR p_period_to IS NULL THEN
    RAISE EXCEPTION '[input] entity_id, property_id, period_from, and period_to are required.';
  END IF;

  RETURN finance.read_certified_str_monthly_settlement(
    p_entity_id, p_property_id, p_period_from, p_period_to
  );
END;
$smsc$;

COMMENT ON FUNCTION public.apply_str_monthly_settlement_certification(
  UUID, UUID, DATE, DATE, INTEGER, UUID, NUMERIC, TEXT, TEXT, TEXT, JSONB
) IS
  'Create, validate, approve, and apply one monthly STR owner-settlement certification atomically. SECURITY DEFINER, require_jj_staff ceo/finance_admin, authenticated EXECUTE only. Never writes public.transactions.';

COMMENT ON FUNCTION public.void_str_monthly_settlement_certification(UUID, TEXT, TEXT) IS
  'Void an applied monthly STR certification through an audited RPC. No DELETE.';

COMMENT ON FUNCTION finance.read_certified_str_monthly_settlement(UUID, UUID, DATE, DATE) IS
  'Postgres-only exact-period reader for an applied monthly STR certification. unavailable=true when no applied row matches the exact period.';

COMMENT ON FUNCTION public.read_certified_str_monthly_settlement(UUID, UUID, DATE, DATE) IS
  'Service-role public wrapper. Read-only delegation to finance.read_certified_str_monthly_settlement. Does not expose schema finance.';

REVOKE ALL ON FUNCTION public.apply_str_monthly_settlement_certification(
  UUID, UUID, DATE, DATE, INTEGER, UUID, NUMERIC, TEXT, TEXT, TEXT, JSONB
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_str_monthly_settlement_certification(
  UUID, UUID, DATE, DATE, INTEGER, UUID, NUMERIC, TEXT, TEXT, TEXT, JSONB
) FROM anon, service_role;
REVOKE ALL ON FUNCTION public.void_str_monthly_settlement_certification(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.void_str_monthly_settlement_certification(UUID, TEXT, TEXT) FROM anon, service_role;
REVOKE ALL ON FUNCTION finance.read_certified_str_monthly_settlement(UUID, UUID, DATE, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION finance.read_certified_str_monthly_settlement(UUID, UUID, DATE, DATE) FROM anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.read_certified_str_monthly_settlement(UUID, UUID, DATE, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.read_certified_str_monthly_settlement(UUID, UUID, DATE, DATE) FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION public.apply_str_monthly_settlement_certification(
  UUID, UUID, DATE, DATE, INTEGER, UUID, NUMERIC, TEXT, TEXT, TEXT, JSONB
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.void_str_monthly_settlement_certification(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.read_certified_str_monthly_settlement(UUID, UUID, DATE, DATE) TO service_role;
