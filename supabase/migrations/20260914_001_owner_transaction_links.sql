-- ============================================================
-- finance.owner_transaction_links — owner-level (unallocated) payments
-- ============================================================
-- LOCAL IMPLEMENTATION ONLY. Do not Apply to Production/staging from this branch
-- without a separate Yossi authorization.
--
-- Purpose:
--   Associate a ledger row that has no property_id / property_name with a
--   canonical owner (lifecycle.entity_identity) so it can enter OWNER SETTLEMENT
--   once, without entering property P&L, STR, or LTR.
--
-- P-ARCH-5 exception (Yossi, 2026-09-14, Alternative B):
--   This table holds FKs to public.transactions and lifecycle.entity_identity.
--   The original finance schema forbade cross-schema FKs; this association
--   table is the approved exception because the link IS the association.
--
-- Safety:
--   - public.transactions: no INSERT / UPDATE / DELETE in this migration
--   - C1 / C3 are NOT seeded here (fixture-only; Apply is blocked)
--   - Physical DELETE of links is forbidden; business rollback = is_deleted
-- ============================================================

BEGIN;

CREATE SCHEMA IF NOT EXISTS finance;

-- ── 1. Table ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS finance.owner_transaction_links (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id    UUID        NOT NULL REFERENCES public.transactions(id),
  owner_entity_id   UUID        NOT NULL REFERENCES lifecycle.entity_identity(id),
  link_role         TEXT        NOT NULL
                    CHECK (link_role IN ('owner_level_payment')),
  idempotency_key   TEXT        NOT NULL UNIQUE,
  review_status     TEXT        NOT NULL DEFAULT 'approved'
                    CHECK (review_status IN ('approved', 'needs_review', 'ignored')),
  is_deleted        BOOLEAN     NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by        TEXT        NOT NULL,
  deleted_at        TIMESTAMPTZ,
  deleted_by        TEXT,
  notes             TEXT,
  CONSTRAINT owner_tx_links_soft_delete_pair CHECK (
    (is_deleted = false AND deleted_at IS NULL AND deleted_by IS NULL)
    OR
    (is_deleted = true  AND deleted_at IS NOT NULL AND deleted_by IS NOT NULL)
  )
);

COMMENT ON TABLE finance.owner_transaction_links IS
  'Owner-level association for unallocated payments (no property). Counted in owner settlement only. Soft-delete only.';

-- One active owner link per transaction (soft-deleted rows may be replaced).
CREATE UNIQUE INDEX IF NOT EXISTS uq_owner_tx_links_active_transaction
  ON finance.owner_transaction_links (transaction_id)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_owner_tx_links_owner_active
  ON finance.owner_transaction_links (owner_entity_id)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_owner_tx_links_idempotency
  ON finance.owner_transaction_links (idempotency_key);

-- ── 2. Immutability: no physical DELETE; UPDATE = soft-delete / review only ─

CREATE OR REPLACE FUNCTION finance.trg_owner_tx_links_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'owner_transaction_links forbids physical DELETE; set is_deleted=true'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.transaction_id IS DISTINCT FROM OLD.transaction_id
       OR NEW.owner_entity_id IS DISTINCT FROM OLD.owner_entity_id
       OR NEW.link_role IS DISTINCT FROM OLD.link_role
       OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
    THEN
      RAISE EXCEPTION 'owner_transaction_links identity columns are immutable'
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_owner_tx_links_guard ON finance.owner_transaction_links;
CREATE TRIGGER trg_owner_tx_links_guard
  BEFORE UPDATE OR DELETE ON finance.owner_transaction_links
  FOR EACH ROW EXECUTE FUNCTION finance.trg_owner_tx_links_guard();

-- Flag NEEDS REVIEW when the linked transaction still has a property association.
CREATE OR REPLACE FUNCTION finance.trg_owner_tx_links_conflict_review()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_property_id   UUID;
  v_property_name TEXT;
BEGIN
  SELECT t.property_id, t.property_name
    INTO v_property_id, v_property_name
  FROM public.transactions t
  WHERE t.id = NEW.transaction_id;

  IF v_property_id IS NOT NULL OR v_property_name IS NOT NULL THEN
    NEW.review_status := 'needs_review';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_owner_tx_links_conflict_review ON finance.owner_transaction_links;
CREATE TRIGGER trg_owner_tx_links_conflict_review
  BEFORE INSERT OR UPDATE OF transaction_id ON finance.owner_transaction_links
  FOR EACH ROW EXECUTE FUNCTION finance.trg_owner_tx_links_conflict_review();

-- ── 3. Countable owner-level view (NOT joined to property P&L / STR / LTR) ──
-- Transaction is_deleted handling is local to this view (global is_deleted
-- gap is out of scope; C2 stays out).

CREATE OR REPLACE VIEW finance.v_owner_level_payments
  WITH (security_invoker = true)
AS
SELECT
  t.id                         AS transaction_id,
  l.owner_entity_id,
  e.canonical_name             AS owner_display_name,
  t.date,
  t.payer,
  t.payee,
  t.amount_eur,
  t.description,
  t.k_note,
  l.idempotency_key,
  l.review_status,
  l.link_role,
  l.created_at,
  l.notes
FROM finance.owner_transaction_links l
JOIN public.transactions t
  ON t.id = l.transaction_id
JOIN lifecycle.entity_identity e
  ON e.id = l.owner_entity_id
WHERE l.is_deleted = false
  AND COALESCE(t.is_deleted, false) = false
  AND (t.review_status IS NULL OR t.review_status = 'active')
  AND l.link_role = 'owner_level_payment'
  AND l.review_status = 'approved'
  AND t.category = 'Management'
  AND t.subcategory = 'Bank Payment to Owner'
  AND t.property_id IS NULL
  AND t.property_name IS NULL
  AND t.amount_eur > 0;

COMMENT ON VIEW finance.v_owner_level_payments IS
  'Countable owner-level Bank Payments to Owner. Do not join this view into property P&L, STR, or LTR.';

-- Conflicts: active link + property association. Composition flags NEEDS REVIEW
-- and must not double-count.
CREATE OR REPLACE VIEW finance.v_owner_level_payment_conflicts
  WITH (security_invoker = true)
AS
SELECT
  t.id                         AS transaction_id,
  l.owner_entity_id,
  t.property_id,
  t.property_name,
  t.date,
  t.payer,
  t.amount_eur,
  l.idempotency_key,
  l.review_status,
  l.is_deleted                 AS link_is_deleted
FROM finance.owner_transaction_links l
JOIN public.transactions t
  ON t.id = l.transaction_id
WHERE l.is_deleted = false
  AND l.link_role = 'owner_level_payment'
  AND (t.property_id IS NOT NULL OR t.property_name IS NOT NULL);

COMMENT ON VIEW finance.v_owner_level_payment_conflicts IS
  'Active owner links whose transaction still has a property association. Fail-closed: NEEDS REVIEW, do not count.';

-- ── 4. RLS + grants ─────────────────────────────────────────────────────────
-- Report adapters use createServiceClient() → service_role, which bypasses RLS.
-- RLS still fail-closes anon / authenticated / PostgREST client writes.
--
-- WRITE PATH: table INSERT/UPDATE are granted to nobody except the table owner.
-- Mutations go only through SECURITY DEFINER RPCs.
-- Auth gate (JWT DB context only — never created_by / notes / RPC params):
--   IF auth.role() = 'service_role' THEN trusted server path
--   ELSE PERFORM public.require_jj_staff(ARRAY['ceo','finance_admin'])
-- EXECUTE: authenticated + service_role. anon revoked.
-- READ PATH: GRANT SELECT on views/table to service_role (adapter).
-- Staff reads via get_owner_level_payments (DEFINER). Direct view SELECT stays
-- service_role-only because views are security_invoker + RLS deny-all.

ALTER TABLE finance.owner_transaction_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.owner_transaction_links FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deny_all_owner_transaction_links ON finance.owner_transaction_links;
CREATE POLICY deny_all_owner_transaction_links
  ON finance.owner_transaction_links AS RESTRICTIVE
  FOR ALL TO public
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE finance.owner_transaction_links FROM PUBLIC;
REVOKE ALL ON TABLE finance.owner_transaction_links FROM anon, authenticated;
REVOKE ALL ON finance.v_owner_level_payments FROM PUBLIC;
REVOKE ALL ON finance.v_owner_level_payments FROM anon, authenticated;
REVOKE ALL ON finance.v_owner_level_payment_conflicts FROM PUBLIC;
REVOKE ALL ON finance.v_owner_level_payment_conflicts FROM anon, authenticated;

GRANT USAGE ON SCHEMA finance TO service_role;
GRANT USAGE ON SCHEMA finance TO authenticated;
GRANT SELECT ON TABLE finance.owner_transaction_links TO service_role;
GRANT SELECT ON finance.v_owner_level_payments TO service_role;
GRANT SELECT ON finance.v_owner_level_payment_conflicts TO service_role;

-- ── 5. RPCs ─────────────────────────────────────────────────────────────────
-- JWT gate: auth.role() / auth.uid() only. created_by and other params are
-- provenance, not authorization.

CREATE OR REPLACE FUNCTION finance.assert_owner_link_authorized()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.role() IS NOT DISTINCT FROM 'service_role' THEN
    RETURN;
  END IF;
  PERFORM public.require_jj_staff(ARRAY['ceo','finance_admin']);
END;
$$;

CREATE OR REPLACE FUNCTION finance.link_owner_level_payment(
  p_transaction_id  UUID,
  p_owner_entity_id UUID,
  p_idempotency_key TEXT,
  p_created_by      TEXT,
  p_notes           TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id UUID;
BEGIN
  PERFORM finance.assert_owner_link_authorized();

  IF p_transaction_id IS NULL OR p_owner_entity_id IS NULL
     OR p_idempotency_key IS NULL OR btrim(p_idempotency_key) = ''
     OR p_created_by IS NULL OR btrim(p_created_by) = '' THEN
    RAISE EXCEPTION 'link_owner_level_payment: required arguments missing'
      USING ERRCODE = 'not_null_violation';
  END IF;

  INSERT INTO finance.owner_transaction_links (
    transaction_id, owner_entity_id, link_role, idempotency_key, created_by, notes
  ) VALUES (
    p_transaction_id, p_owner_entity_id, 'owner_level_payment',
    p_idempotency_key, p_created_by, p_notes
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION finance.soft_delete_owner_transaction_link(
  p_link_id    UUID,
  p_deleted_by TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM finance.assert_owner_link_authorized();

  IF p_deleted_by IS NULL OR btrim(p_deleted_by) = '' THEN
    RAISE EXCEPTION 'soft_delete_owner_transaction_link: deleted_by required'
      USING ERRCODE = 'not_null_violation';
  END IF;

  UPDATE finance.owner_transaction_links
     SET is_deleted = true,
         deleted_at = now(),
         deleted_by = p_deleted_by
   WHERE id = p_link_id
     AND is_deleted = false;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'soft_delete_owner_transaction_link: link not found or already deleted'
      USING ERRCODE = 'no_data_found';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION finance.get_owner_level_payments(
  p_owner_entity_id UUID
)
RETURNS TABLE (
  transaction_id     UUID,
  owner_entity_id    UUID,
  owner_display_name TEXT,
  date               DATE,
  payer              TEXT,
  payee              TEXT,
  amount_eur         NUMERIC,
  description        TEXT,
  idempotency_key    TEXT,
  review_status      TEXT,
  link_role          TEXT,
  created_at         TIMESTAMPTZ,
  notes              TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
BEGIN
  PERFORM finance.assert_owner_link_authorized();

  RETURN QUERY
  SELECT
    v.transaction_id,
    v.owner_entity_id,
    v.owner_display_name,
    v.date,
    v.payer,
    v.payee,
    v.amount_eur,
    v.description,
    v.idempotency_key,
    v.review_status,
    v.link_role,
    v.created_at,
    v.notes
  FROM finance.v_owner_level_payments v
  WHERE v.owner_entity_id = p_owner_entity_id
  ORDER BY v.date, v.transaction_id;
END;
$$;

REVOKE ALL ON FUNCTION finance.assert_owner_link_authorized() FROM PUBLIC;
REVOKE ALL ON FUNCTION finance.assert_owner_link_authorized() FROM anon, authenticated;
REVOKE ALL ON FUNCTION finance.link_owner_level_payment(UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION finance.soft_delete_owner_transaction_link(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION finance.get_owner_level_payments(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION finance.link_owner_level_payment(UUID, UUID, TEXT, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION finance.soft_delete_owner_transaction_link(UUID, TEXT) FROM anon;
REVOKE ALL ON FUNCTION finance.get_owner_level_payments(UUID) FROM anon;

GRANT EXECUTE ON FUNCTION finance.link_owner_level_payment(UUID, UUID, TEXT, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION finance.soft_delete_owner_transaction_link(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION finance.get_owner_level_payments(UUID) TO authenticated, service_role;

COMMIT;
