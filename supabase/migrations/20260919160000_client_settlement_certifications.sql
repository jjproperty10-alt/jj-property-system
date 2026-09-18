-- ============================================================
-- finance.client_settlement_certifications
-- LOCAL IMPLEMENTATION ONLY. Do not Apply to Production from this branch
-- without a separate Yossi authorization. No certification-row Apply.
--
-- Purpose:
--   Generic append-only certified client opening-obligation overlay.
--   Stores an approved opening total (sum of property lines) so reports can
--   compute certified closing = opening − FIFO credits.
--
-- Safety:
--   - No INSERT/UPDATE/DELETE on public.transactions
--   - No cash, payer/payee, P&L, RC3, or settlement-event writes
--   - No CREATE OR REPLACE of public cash/RC3/certified/settlement-summary views
--   - No seed rows (no client, property, or amount literals)
-- ============================================================

CREATE SCHEMA IF NOT EXISTS finance;

-- ── 1. Header ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS finance.client_settlement_certifications (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id            UUID NOT NULL REFERENCES lifecycle.entity_identity(id),
  as_of                DATE NOT NULL,
  currency             TEXT NOT NULL DEFAULT 'EUR'
                       CHECK (currency = 'EUR'),
  certification_type   TEXT NOT NULL DEFAULT 'opening_property_obligations'
                       CHECK (certification_type = 'opening_property_obligations'),
  status               TEXT NOT NULL
                       CHECK (status IN ('draft', 'approved', 'applied', 'void')),
  reason               TEXT NOT NULL CHECK (length(btrim(reason)) > 0),
  evidence_ref         TEXT NOT NULL CHECK (length(btrim(evidence_ref)) > 0),
  idempotency_key      TEXT NOT NULL UNIQUE,
  created_by           UUID NOT NULL,
  approved_by          UUID,
  applied_by           UUID,
  voided_by            UUID,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at          TIMESTAMPTZ,
  applied_at           TIMESTAMPTZ,
  voided_at            TIMESTAMPTZ,
  void_reason          TEXT,
  total_due_to_jj      NUMERIC(12,2) NOT NULL,
  version              INTEGER NOT NULL CHECK (version >= 1),
  supersedes_id        UUID REFERENCES finance.client_settlement_certifications(id),
  CONSTRAINT csc_applied_pair CHECK (
    status <> 'applied'
    OR (
      approved_by IS NOT NULL
      AND approved_at IS NOT NULL
      AND applied_by IS NOT NULL
      AND applied_at IS NOT NULL
    )
  ),
  CONSTRAINT csc_void_pair CHECK (
    status <> 'void'
    OR (voided_by IS NOT NULL AND voided_at IS NOT NULL)
  ),
  CONSTRAINT csc_supersedes_not_self CHECK (
    supersedes_id IS NULL OR supersedes_id <> id
  )
);

COMMENT ON TABLE finance.client_settlement_certifications IS
  'Certified client opening obligations. Settlement overlay only. Never cash, never JJ P&L.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_csc_applied_entity_asof_type
  ON finance.client_settlement_certifications (entity_id, as_of, certification_type)
  WHERE status = 'applied';

CREATE UNIQUE INDEX IF NOT EXISTS uq_csc_entity_asof_type_version
  ON finance.client_settlement_certifications (entity_id, as_of, certification_type, version);

CREATE INDEX IF NOT EXISTS idx_csc_entity_asof_status
  ON finance.client_settlement_certifications (entity_id, as_of, status);

CREATE INDEX IF NOT EXISTS idx_csc_idempotency
  ON finance.client_settlement_certifications (idempotency_key);

-- ── 2. Lines ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS finance.client_settlement_certification_lines (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  certification_id     UUID NOT NULL
                       REFERENCES finance.client_settlement_certifications(id),
  line_order           INTEGER NOT NULL CHECK (line_order >= 1),
  property_key         TEXT NOT NULL CHECK (length(btrim(property_key)) > 0),
  property_name        TEXT NOT NULL CHECK (length(btrim(property_name)) > 0),
  component_code       TEXT NOT NULL CHECK (length(btrim(component_code)) > 0),
  amount_due_to_jj     NUMERIC(12,2) NOT NULL,
  reason               TEXT NOT NULL CHECK (length(btrim(reason)) > 0),
  evidence_ref         TEXT NOT NULL CHECK (length(btrim(evidence_ref)) > 0),
  metadata             JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT uq_csc_line_identity UNIQUE (
    certification_id, property_key, component_code, line_order
  ),
  CONSTRAINT uq_csc_line_order UNIQUE (certification_id, line_order)
);

COMMENT ON COLUMN finance.client_settlement_certification_lines.amount_due_to_jj IS
  '+ due to JJ, − due to client. Exact cents. Not cash, not P&L.';

COMMENT ON TABLE finance.client_settlement_certification_lines IS
  'Opening-obligation property lines. Immutable after insert. No cash or transaction columns.';

CREATE INDEX IF NOT EXISTS idx_csc_lines_cert_order
  ON finance.client_settlement_certification_lines (certification_id, line_order);

-- ── 3. Append-only audit ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS finance.client_settlement_certification_audit (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  certification_id   UUID NOT NULL
                     REFERENCES finance.client_settlement_certifications(id),
  event              TEXT NOT NULL,
  actor              UUID,
  occurred_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  old_row            JSONB,
  new_row            JSONB
);

COMMENT ON TABLE finance.client_settlement_certification_audit IS
  'Immutable append-only old/new/event/actor/timestamp log for opening certifications.';

CREATE INDEX IF NOT EXISTS idx_csc_audit_cert_at
  ON finance.client_settlement_certification_audit (certification_id, occurred_at);

-- ── 4. Guards ────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION finance.trg_client_settlement_certifications_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO ''
AS $csc$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'client_settlement_certifications forbids physical DELETE (id=%). Void instead.',
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
       OR NEW.as_of IS DISTINCT FROM OLD.as_of
       OR NEW.currency IS DISTINCT FROM OLD.currency
       OR NEW.certification_type IS DISTINCT FROM OLD.certification_type
       OR NEW.reason IS DISTINCT FROM OLD.reason
       OR NEW.evidence_ref IS DISTINCT FROM OLD.evidence_ref
       OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.total_due_to_jj IS DISTINCT FROM OLD.total_due_to_jj
       OR NEW.version IS DISTINCT FROM OLD.version
       OR NEW.supersedes_id IS DISTINCT FROM OLD.supersedes_id
       OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
       OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
       OR NEW.applied_by IS DISTINCT FROM OLD.applied_by
       OR NEW.applied_at IS DISTINCT FROM OLD.applied_at
    THEN
      RAISE EXCEPTION 'client_settlement_certifications payload columns are immutable (id=%).',
        OLD.id
        USING ERRCODE = 'restrict_violation';
    END IF;

    IF NOT (OLD.status = 'applied' AND NEW.status = 'void') THEN
      RAISE EXCEPTION 'client_settlement_certifications status % cannot become % (id=%).',
        OLD.status, NEW.status, OLD.id
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$csc$;

DROP TRIGGER IF EXISTS trg_client_settlement_certifications_guard
  ON finance.client_settlement_certifications;
CREATE TRIGGER trg_client_settlement_certifications_guard
  BEFORE UPDATE OR DELETE ON finance.client_settlement_certifications
  FOR EACH ROW EXECUTE FUNCTION finance.trg_client_settlement_certifications_guard();

CREATE OR REPLACE FUNCTION finance.trg_client_settlement_certification_lines_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO ''
AS $csc$
BEGIN
  RAISE EXCEPTION 'client_settlement_certification_lines are immutable after insert. UPDATE and DELETE are prohibited.'
    USING ERRCODE = 'restrict_violation';
END;
$csc$;

DROP TRIGGER IF EXISTS trg_client_settlement_certification_lines_guard
  ON finance.client_settlement_certification_lines;
CREATE TRIGGER trg_client_settlement_certification_lines_guard
  BEFORE UPDATE OR DELETE ON finance.client_settlement_certification_lines
  FOR EACH ROW EXECUTE FUNCTION finance.trg_client_settlement_certification_lines_guard();

CREATE OR REPLACE FUNCTION finance.trg_client_settlement_certification_audit_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO ''
AS $csc$
BEGIN
  RAISE EXCEPTION 'client_settlement_certification_audit is append-only (P-ARCH-4). UPDATE and DELETE are prohibited.'
    USING ERRCODE = 'restrict_violation';
END;
$csc$;

DROP TRIGGER IF EXISTS trg_client_settlement_certification_audit_guard
  ON finance.client_settlement_certification_audit;
CREATE TRIGGER trg_client_settlement_certification_audit_guard
  BEFORE UPDATE OR DELETE ON finance.client_settlement_certification_audit
  FOR EACH ROW EXECUTE FUNCTION finance.trg_client_settlement_certification_audit_guard();

CREATE OR REPLACE FUNCTION finance.trg_client_settlement_certifications_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO ''
AS $csc$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO finance.client_settlement_certification_audit (
      certification_id, event, actor, old_row, new_row
    ) VALUES (
      NEW.id,
      'insert',
      NEW.created_by,
      NULL,
      pg_catalog.to_jsonb(NEW)
    );
    RETURN NEW;
  END IF;

  INSERT INTO finance.client_settlement_certification_audit (
    certification_id, event, actor, old_row, new_row
  ) VALUES (
    NEW.id,
    CASE
      WHEN NEW.status IS DISTINCT FROM OLD.status THEN 'status_change'
      ELSE 'update'
    END,
    COALESCE(NEW.voided_by, NEW.applied_by, NEW.created_by),
    pg_catalog.to_jsonb(OLD),
    pg_catalog.to_jsonb(NEW)
  );
  RETURN NEW;
END;
$csc$;

DROP TRIGGER IF EXISTS trg_client_settlement_certifications_audit
  ON finance.client_settlement_certifications;
CREATE TRIGGER trg_client_settlement_certifications_audit
  AFTER INSERT OR UPDATE ON finance.client_settlement_certifications
  FOR EACH ROW EXECUTE FUNCTION finance.trg_client_settlement_certifications_audit();

CREATE OR REPLACE FUNCTION finance.trg_client_settlement_certification_lines_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO ''
AS $csc$
BEGIN
  INSERT INTO finance.client_settlement_certification_audit (
    certification_id, event, actor, old_row, new_row
  ) VALUES (
    NEW.certification_id,
    'line_insert',
    auth.uid(),
    NULL,
    pg_catalog.to_jsonb(NEW)
  );
  RETURN NEW;
END;
$csc$;

DROP TRIGGER IF EXISTS trg_client_settlement_certification_lines_audit
  ON finance.client_settlement_certification_lines;
CREATE TRIGGER trg_client_settlement_certification_lines_audit
  AFTER INSERT ON finance.client_settlement_certification_lines
  FOR EACH ROW EXECUTE FUNCTION finance.trg_client_settlement_certification_lines_audit();

-- ── 5. RLS ───────────────────────────────────────────────────────────────────

ALTER TABLE finance.client_settlement_certifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.client_settlement_certifications FORCE ROW LEVEL SECURITY;
ALTER TABLE finance.client_settlement_certification_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.client_settlement_certification_lines FORCE ROW LEVEL SECURITY;
ALTER TABLE finance.client_settlement_certification_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.client_settlement_certification_audit FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deny_all_client_settlement_certifications
  ON finance.client_settlement_certifications;
CREATE POLICY deny_all_client_settlement_certifications
  ON finance.client_settlement_certifications AS RESTRICTIVE
  FOR ALL TO public
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS deny_all_client_settlement_certification_lines
  ON finance.client_settlement_certification_lines;
CREATE POLICY deny_all_client_settlement_certification_lines
  ON finance.client_settlement_certification_lines AS RESTRICTIVE
  FOR ALL TO public
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS deny_all_client_settlement_certification_audit
  ON finance.client_settlement_certification_audit;
CREATE POLICY deny_all_client_settlement_certification_audit
  ON finance.client_settlement_certification_audit AS RESTRICTIVE
  FOR ALL TO public
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE finance.client_settlement_certifications FROM PUBLIC;
REVOKE ALL ON TABLE finance.client_settlement_certifications FROM anon, authenticated;
REVOKE ALL ON TABLE finance.client_settlement_certification_lines FROM PUBLIC;
REVOKE ALL ON TABLE finance.client_settlement_certification_lines FROM anon, authenticated;
REVOKE ALL ON TABLE finance.client_settlement_certification_audit FROM PUBLIC;
REVOKE ALL ON TABLE finance.client_settlement_certification_audit FROM anon, authenticated;

GRANT USAGE ON SCHEMA finance TO service_role;
GRANT USAGE ON SCHEMA finance TO authenticated;
GRANT SELECT ON TABLE finance.client_settlement_certifications TO service_role;
GRANT SELECT ON TABLE finance.client_settlement_certification_lines TO service_role;
GRANT SELECT ON TABLE finance.client_settlement_certification_audit TO service_role;

-- ── 6. Helpers (postgres-only EXECUTE) ───────────────────────────────────────

CREATE OR REPLACE FUNCTION finance.assert_client_settlement_certification_authorized()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $csc$
BEGIN
  RETURN public.require_jj_staff(ARRAY['ceo', 'finance_admin']);
END;
$csc$;

CREATE OR REPLACE FUNCTION finance.assert_exact_cents(p_value NUMERIC, p_label TEXT)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO ''
AS $csc$
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
$csc$;

CREATE OR REPLACE FUNCTION finance.settlement_layer_available()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path TO ''
AS $csc$
  SELECT pg_catalog.to_regclass('finance.client_settlement_events') IS NOT NULL
     AND pg_catalog.to_regprocedure('finance.client_fifo_credits(uuid,date)') IS NOT NULL;
$csc$;

REVOKE ALL ON FUNCTION finance.assert_client_settlement_certification_authorized() FROM PUBLIC;
REVOKE ALL ON FUNCTION finance.assert_client_settlement_certification_authorized() FROM anon, authenticated, service_role;
REVOKE ALL ON FUNCTION finance.assert_exact_cents(NUMERIC, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION finance.assert_exact_cents(NUMERIC, TEXT) FROM anon, authenticated, service_role;
REVOKE ALL ON FUNCTION finance.trg_client_settlement_certifications_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION finance.trg_client_settlement_certifications_guard() FROM anon, authenticated, service_role;
REVOKE ALL ON FUNCTION finance.trg_client_settlement_certification_lines_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION finance.trg_client_settlement_certification_lines_guard() FROM anon, authenticated, service_role;
REVOKE ALL ON FUNCTION finance.trg_client_settlement_certification_audit_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION finance.trg_client_settlement_certification_audit_guard() FROM anon, authenticated, service_role;
REVOKE ALL ON FUNCTION finance.trg_client_settlement_certifications_audit() FROM PUBLIC;
REVOKE ALL ON FUNCTION finance.trg_client_settlement_certifications_audit() FROM anon, authenticated, service_role;
REVOKE ALL ON FUNCTION finance.trg_client_settlement_certification_lines_audit() FROM PUBLIC;
REVOKE ALL ON FUNCTION finance.trg_client_settlement_certification_lines_audit() FROM anon, authenticated, service_role;
REVOKE ALL ON FUNCTION finance.settlement_layer_available() FROM PUBLIC;
REVOKE ALL ON FUNCTION finance.settlement_layer_available() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION finance.settlement_layer_available() TO service_role;

-- ── 7. Atomic create/validate/approve/apply RPC ──────────────────────────────

CREATE OR REPLACE FUNCTION public.apply_client_settlement_opening_certification(
  p_entity_id         UUID,
  p_as_of             DATE,
  p_reason            TEXT,
  p_evidence_ref      TEXT,
  p_idempotency_key   TEXT,
  p_version           INTEGER,
  p_supersedes_id     UUID,
  p_total_due_to_jj   NUMERIC,
  p_lines             JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $csc$
DECLARE
  v_actor            UUID;
  v_existing         finance.client_settlement_certifications%ROWTYPE;
  v_prior            finance.client_settlement_certifications%ROWTYPE;
  v_id               UUID;
  v_elem             JSONB;
  v_key              TEXT;
  v_line_order       INTEGER;
  v_property_key     TEXT;
  v_property_name    TEXT;
  v_component_code   TEXT;
  v_amount           NUMERIC;
  v_line_reason      TEXT;
  v_line_evidence    TEXT;
  v_metadata         JSONB;
  v_sum              NUMERIC := 0;
  v_seen_keys        TEXT[] := '{}';
  v_seen_orders      INTEGER[] := '{}';
  v_norm_lines       JSONB := '[]'::jsonb;
  v_existing_lines   JSONB;
  v_n                INTEGER := 0;
  v_lock_key         TEXT;
BEGIN
  v_actor := finance.assert_client_settlement_certification_authorized();

  IF p_entity_id IS NULL THEN
    RAISE EXCEPTION '[input] entity_id must be a UUID.';
  END IF;
  IF p_as_of IS NULL THEN
    RAISE EXCEPTION '[input] as_of must be a date.';
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
  PERFORM finance.assert_exact_cents(p_total_due_to_jj, 'total_due_to_jj');
  IF NOT EXISTS (SELECT 1 FROM lifecycle.entity_identity e WHERE e.id = p_entity_id) THEN
    RAISE EXCEPTION '[not_found] entity_id does not exist.';
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
        'line_order', 'property_key', 'property_name', 'component_code',
        'amount_due_to_jj', 'reason', 'evidence_ref', 'metadata'
      ) THEN
        RAISE EXCEPTION '[input] line field "%" is not allowed.', v_key;
      END IF;
    END LOOP;

    IF NOT (v_elem ? 'line_order')
       OR NOT (v_elem ? 'property_key')
       OR NOT (v_elem ? 'property_name')
       OR NOT (v_elem ? 'component_code')
       OR NOT (v_elem ? 'amount_due_to_jj')
       OR NOT (v_elem ? 'reason')
       OR NOT (v_elem ? 'evidence_ref')
    THEN
      RAISE EXCEPTION '[input] line is missing a required field.';
    END IF;

    BEGIN
      v_line_order := (v_elem->>'line_order')::integer;
      v_amount := (v_elem->>'amount_due_to_jj')::numeric;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION '[input] line_order and amount_due_to_jj must be finite numbers.';
    END;

    IF v_line_order IS NULL OR v_line_order < 1 THEN
      RAISE EXCEPTION '[input] line_order must be an integer >= 1.';
    END IF;
    PERFORM finance.assert_exact_cents(v_amount, 'amount_due_to_jj');

    v_property_key := pg_catalog.btrim(v_elem->>'property_key');
    v_property_name := pg_catalog.btrim(v_elem->>'property_name');
    v_component_code := pg_catalog.btrim(v_elem->>'component_code');
    v_line_reason := pg_catalog.btrim(v_elem->>'reason');
    v_line_evidence := pg_catalog.btrim(v_elem->>'evidence_ref');
    v_metadata := COALESCE(v_elem->'metadata', '{}'::jsonb);

    IF v_property_key = '' OR v_property_name = '' OR v_component_code = ''
       OR v_line_reason = '' OR v_line_evidence = '' THEN
      RAISE EXCEPTION '[input] line text fields must be non-empty.';
    END IF;
    IF pg_catalog.jsonb_typeof(v_metadata) <> 'object' THEN
      RAISE EXCEPTION '[input] metadata must be a JSON object.';
    END IF;
    IF v_line_order = ANY (v_seen_orders) THEN
      RAISE EXCEPTION '[denied] duplicate line_order is not allowed.';
    END IF;
    IF (v_property_key || chr(31) || v_component_code) = ANY (v_seen_keys) THEN
      RAISE EXCEPTION '[denied] duplicate line key is not allowed.';
    END IF;

    v_seen_orders := v_seen_orders || v_line_order;
    v_seen_keys := v_seen_keys || (v_property_key || pg_catalog.chr(31) || v_component_code);
    v_sum := v_sum + v_amount;
    v_n := v_n + 1;
    v_norm_lines := v_norm_lines || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'line_order', v_line_order,
        'property_key', v_property_key,
        'property_name', v_property_name,
        'component_code', v_component_code,
        'amount_due_to_jj_text', pg_catalog.to_char(v_amount, 'FM9999999990.00'),
        'reason', v_line_reason,
        'evidence_ref', v_line_evidence,
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

  v_sum := finance.assert_exact_cents(v_sum, 'sum(lines.amount_due_to_jj)');
  IF v_sum IS DISTINCT FROM p_total_due_to_jj THEN
    RAISE EXCEPTION '[denied] header total_due_to_jj does not equal sum of lines.';
  END IF;

  v_lock_key := p_entity_id::text || '|' || p_as_of::text || '|opening_property_obligations';
  PERFORM pg_catalog.pg_advisory_xact_lock(872005, pg_catalog.hashtext(v_lock_key));
  PERFORM pg_catalog.pg_advisory_xact_lock(
    872005, pg_catalog.hashtext('idemp:' || pg_catalog.btrim(p_idempotency_key))
  );

  SELECT * INTO v_existing
  FROM finance.client_settlement_certifications c
  WHERE c.idempotency_key = pg_catalog.btrim(p_idempotency_key)
  FOR UPDATE;

  IF FOUND THEN
    SELECT pg_catalog.jsonb_agg(line ORDER BY (line->>'line_order')::integer)
      INTO v_existing_lines
    FROM (
      SELECT pg_catalog.jsonb_build_object(
        'line_order', l.line_order,
        'property_key', l.property_key,
        'property_name', l.property_name,
        'component_code', l.component_code,
        'amount_due_to_jj_text', pg_catalog.to_char(l.amount_due_to_jj, 'FM9999999990.00'),
        'reason', l.reason,
        'evidence_ref', l.evidence_ref,
        'metadata', l.metadata
      ) AS line
      FROM finance.client_settlement_certification_lines l
      WHERE l.certification_id = v_existing.id
    ) s;

    IF v_existing.entity_id IS DISTINCT FROM p_entity_id
       OR v_existing.as_of IS DISTINCT FROM p_as_of
       OR v_existing.version IS DISTINCT FROM p_version
       OR v_existing.supersedes_id IS DISTINCT FROM p_supersedes_id
       OR v_existing.total_due_to_jj IS DISTINCT FROM p_total_due_to_jj
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
    FROM finance.client_settlement_certifications c
    WHERE c.id = p_supersedes_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION '[not_found] supersedes_id does not exist.';
    END IF;
    IF v_prior.entity_id IS DISTINCT FROM p_entity_id
       OR v_prior.as_of IS DISTINCT FROM p_as_of
       OR v_prior.certification_type IS DISTINCT FROM 'opening_property_obligations'
    THEN
      RAISE EXCEPTION '[denied] supersedes_id is not in the same entity/as_of/type chain.';
    END IF;
    IF v_prior.version IS DISTINCT FROM (p_version - 1) THEN
      RAISE EXCEPTION '[denied] version must be prior.version + 1 when superseding.';
    END IF;
    IF v_prior.status = 'applied' THEN
      UPDATE finance.client_settlement_certifications
         SET status = 'void',
             voided_by = v_actor,
             voided_at = pg_catalog.now(),
             void_reason = 'superseded'
       WHERE id = v_prior.id;
      INSERT INTO finance.client_settlement_certification_audit (
        certification_id, event, actor, old_row, new_row
      ) VALUES (
        v_prior.id,
        'supersede',
        v_actor,
        pg_catalog.to_jsonb(v_prior),
        pg_catalog.jsonb_build_object('superseded_by_pending', true)
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
      FROM finance.client_settlement_certifications c
      WHERE c.entity_id = p_entity_id
        AND c.as_of = p_as_of
        AND c.certification_type = 'opening_property_obligations'
        AND c.status = 'applied'
    ) THEN
      RAISE EXCEPTION '[denied] an applied certification already exists for this entity/as_of/type.';
    END IF;
  END IF;

  INSERT INTO finance.client_settlement_certifications (
    entity_id, as_of, currency, certification_type, status,
    reason, evidence_ref, idempotency_key,
    created_by, approved_by, applied_by,
    created_at, approved_at, applied_at,
    total_due_to_jj, version, supersedes_id
  ) VALUES (
    p_entity_id, p_as_of, 'EUR', 'opening_property_obligations', 'applied',
    pg_catalog.btrim(p_reason), pg_catalog.btrim(p_evidence_ref),
    pg_catalog.btrim(p_idempotency_key),
    v_actor, v_actor, v_actor,
    pg_catalog.now(), pg_catalog.now(), pg_catalog.now(),
    p_total_due_to_jj, p_version, p_supersedes_id
  )
  RETURNING id INTO v_id;

  FOR v_elem IN
    SELECT elem
    FROM pg_catalog.jsonb_array_elements(v_norm_lines) AS elem
    ORDER BY (elem->>'line_order')::integer
  LOOP
    INSERT INTO finance.client_settlement_certification_lines (
      certification_id, line_order, property_key, property_name, component_code,
      amount_due_to_jj, reason, evidence_ref, metadata
    ) VALUES (
      v_id,
      (v_elem->>'line_order')::integer,
      v_elem->>'property_key',
      v_elem->>'property_name',
      v_elem->>'component_code',
      (v_elem->>'amount_due_to_jj_text')::numeric,
      v_elem->>'reason',
      v_elem->>'evidence_ref',
      COALESCE(v_elem->'metadata', '{}'::jsonb)
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
$csc$;

CREATE OR REPLACE FUNCTION public.void_client_settlement_opening_certification(
  p_id            UUID,
  p_reason        TEXT,
  p_evidence_ref  TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $csc$
DECLARE
  v_actor UUID;
  v_row   finance.client_settlement_certifications%ROWTYPE;
BEGIN
  v_actor := finance.assert_client_settlement_certification_authorized();

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
  FROM finance.client_settlement_certifications c
  WHERE c.id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION '[not_found] certification % does not exist.', p_id;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    872005,
    pg_catalog.hashtext(
      v_row.entity_id::text || '|' || v_row.as_of::text || '|opening_property_obligations'
    )
  );

  SELECT * INTO v_row
  FROM finance.client_settlement_certifications c
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

  UPDATE finance.client_settlement_certifications
     SET status = 'void',
         voided_by = v_actor,
         voided_at = pg_catalog.now(),
         void_reason = pg_catalog.btrim(p_reason)
   WHERE id = p_id;

  INSERT INTO finance.client_settlement_certification_audit (
    certification_id, event, actor, old_row, new_row
  ) VALUES (
    p_id,
    'void',
    v_actor,
    pg_catalog.to_jsonb(v_row),
    pg_catalog.jsonb_build_object(
      'reason', pg_catalog.btrim(p_reason),
      'evidence_ref', pg_catalog.btrim(p_evidence_ref),
      'prior_status', v_row.status
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'id', p_id,
    'status', 'void',
    'replay', false,
    'inserted_count', 0,
    'actor', v_actor
  );
END;
$csc$;

-- ── 8. Service-role reader ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION finance.read_certified_client_settlement(
  p_entity_id UUID,
  p_as_of     DATE
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO ''
AS $csc$
DECLARE
  v_header           finance.client_settlement_certifications%ROWTYPE;
  v_lines            JSONB;
  v_fifo             JSONB;
  v_exclusions       JSONB;
  v_fifo_total       NUMERIC(12,2);
  v_closing          NUMERIC(12,2);
  v_layer_ok         BOOLEAN;
BEGIN
  IF p_entity_id IS NULL THEN
    RAISE EXCEPTION '[input] entity_id must be a UUID.';
  END IF;
  IF p_as_of IS NULL THEN
    RAISE EXCEPTION '[input] as_of must be a date.';
  END IF;

  v_layer_ok := finance.settlement_layer_available();

  SELECT * INTO v_header
  FROM finance.client_settlement_certifications c
  WHERE c.entity_id = p_entity_id
    AND c.as_of = p_as_of
    AND c.certification_type = 'opening_property_obligations'
    AND c.status = 'applied';

  IF NOT FOUND OR v_layer_ok IS NOT TRUE THEN
    RETURN pg_catalog.jsonb_build_object(
      'unavailable', true,
      'reason', CASE
        WHEN v_layer_ok IS NOT TRUE THEN 'settlement_layer_unavailable'
        ELSE 'no_applied_certification'
      END
    );
  END IF;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(pg_catalog.to_jsonb(l) ORDER BY l.line_order),
    '[]'::jsonb
  )
    INTO v_lines
  FROM finance.client_settlement_certification_lines l
  WHERE l.certification_id = v_header.id;

  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(f) ORDER BY f.effective_date, f.created_at, f.event_id), '[]'::jsonb),
         COALESCE(pg_catalog.sum(f.settlement_amount), 0)
    INTO v_fifo, v_fifo_total
  FROM finance.client_fifo_credits(p_entity_id, p_as_of) f;

  v_fifo_total := COALESCE(v_fifo_total, 0);
  v_closing := v_header.total_due_to_jj - v_fifo_total;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'event_id', e.id,
        'event_type', e.event_type,
        'settlement_amount', e.settlement_amount,
        'effective_date', e.effective_date,
        'source_transaction_id', e.source_transaction_id,
        'reason', e.reason,
        'evidence_ref', e.evidence_ref
      )
      ORDER BY e.effective_date, e.created_at, e.id
    ),
    '[]'::jsonb
  )
    INTO v_exclusions
  FROM finance.client_settlement_events e
  WHERE e.entity_id = p_entity_id
    AND e.status = 'applied'
    AND e.event_type = 'exclude_transaction_from_settlement'
    AND e.effective_date <= p_as_of;

  RETURN pg_catalog.jsonb_build_object(
    'unavailable', false,
    'certification', pg_catalog.to_jsonb(v_header),
    'lines', v_lines,
    'fifo_credits', v_fifo,
    'exclusions', v_exclusions,
    'certified_opening_due_to_jj', v_header.total_due_to_jj,
    'fifo_credits_total', v_fifo_total,
    'certified_closing_due_to_jj', v_closing
  );
END;
$csc$;

COMMENT ON FUNCTION public.apply_client_settlement_opening_certification(
  UUID, DATE, TEXT, TEXT, TEXT, INTEGER, UUID, NUMERIC, JSONB
) IS
  'Create, validate, approve, and apply one opening-obligation certification atomically. SECURITY DEFINER, require_jj_staff ceo/finance_admin, authenticated EXECUTE only. Never writes public.transactions.';

COMMENT ON FUNCTION public.void_client_settlement_opening_certification(UUID, TEXT, TEXT) IS
  'Void an applied opening-obligation certification through an audited RPC. No DELETE.';

COMMENT ON FUNCTION finance.read_certified_client_settlement(UUID, DATE) IS
  'Service-role reader: applied opening certification + FIFO credits + exclusions + certified closing. unavailable=true unless both layers exist.';

REVOKE ALL ON FUNCTION public.apply_client_settlement_opening_certification(
  UUID, DATE, TEXT, TEXT, TEXT, INTEGER, UUID, NUMERIC, JSONB
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_client_settlement_opening_certification(
  UUID, DATE, TEXT, TEXT, TEXT, INTEGER, UUID, NUMERIC, JSONB
) FROM anon, service_role;
REVOKE ALL ON FUNCTION public.void_client_settlement_opening_certification(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.void_client_settlement_opening_certification(UUID, TEXT, TEXT) FROM anon, service_role;
REVOKE ALL ON FUNCTION finance.read_certified_client_settlement(UUID, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION finance.read_certified_client_settlement(UUID, DATE) FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION public.apply_client_settlement_opening_certification(
  UUID, DATE, TEXT, TEXT, TEXT, INTEGER, UUID, NUMERIC, JSONB
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.void_client_settlement_opening_certification(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION finance.read_certified_client_settlement(UUID, DATE) TO service_role;
