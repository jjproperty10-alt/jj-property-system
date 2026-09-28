-- =====================================================================
-- 20260928190000_str_monthly_certification_definer_privileges
--
-- Repairs a Production privilege defect in the monthly STR certification
-- layer (20260924000000_str_monthly_settlement_certifications.sql).
--
-- Defect (reproduced in isolation, SQLSTATE 42501):
--   finance.trg_str_monthly_settlement_sum_deferred() is attached to
--   finance.str_monthly_settlement_certifications / _lines as CONSTRAINT
--   TRIGGERs DEFERRABLE INITIALLY DEFERRED but was created SECURITY INVOKER.
--   Deferred constraint triggers fire at COMMIT, after the SECURITY DEFINER
--   RPC public.apply_str_monthly_settlement_certification has returned, so
--   they execute as the PostgREST session role (authenticated), which has
--   no SELECT on finance.str_monthly_settlement_*. The commit fails with
--   "permission denied for table str_monthly_settlement_certifications"
--   and the whole certification rolls back.
--
-- Fix: make the deferred sum-check trigger function SECURITY DEFINER with
-- an empty search_path, owned by the owner of the tables it reads, and
-- re-assert the committed SECURITY DEFINER / search_path contract on the
-- apply / void / public-reader entry points (idempotent, no behavior change).
--
-- Guarantees:
--   * No business-data change; no INSERT/UPDATE/DELETE on any table.
--   * No certification is inserted, applied, voided or superseded.
--   * No new table grant to anon, authenticated or service_role.
--   * ENABLE / FORCE ROW LEVEL SECURITY and the deny-all policies are untouched.
--   * Nothing in pms or public.transactions is referenced or exposed.
-- =====================================================================

BEGIN;

-- ── 1. Deferred sum check runs with the table owner's privileges ─────────────
CREATE OR REPLACE FUNCTION finance.trg_str_monthly_settlement_sum_deferred()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
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

COMMENT ON FUNCTION finance.trg_str_monthly_settlement_sum_deferred() IS
  'Deferred header/lines sum check for monthly STR certifications. SECURITY DEFINER (fires at COMMIT, after the apply RPC has returned, so it must not depend on the session role). Read-only. Not directly executable by any API role.';

REVOKE ALL ON FUNCTION finance.trg_str_monthly_settlement_sum_deferred() FROM PUBLIC;
REVOKE ALL ON FUNCTION finance.trg_str_monthly_settlement_sum_deferred() FROM anon, authenticated, service_role;

-- ── 2. Deliberate owner: the trigger function is owned by the owner of the
--       tables it reads, and that owner must actually hold SELECT on them.
--       Fails closed instead of leaving a half-repaired layer.
DO $owner$
DECLARE
  v_tbl_owner name;
  v_fn_owner  name;
  v_fn        oid := 'finance.trg_str_monthly_settlement_sum_deferred()'::regprocedure;
BEGIN
  SELECT pg_catalog.pg_get_userbyid(c.relowner)
    INTO v_tbl_owner
  FROM pg_catalog.pg_class c
  WHERE c.oid = 'finance.str_monthly_settlement_certifications'::regclass;

  IF v_tbl_owner IS DISTINCT FROM (
       SELECT pg_catalog.pg_get_userbyid(c.relowner)
       FROM pg_catalog.pg_class c
       WHERE c.oid = 'finance.str_monthly_settlement_lines'::regclass
     ) THEN
    RAISE EXCEPTION 'str monthly certification tables have different owners; refusing to repair.';
  END IF;

  SELECT pg_catalog.pg_get_userbyid(p.proowner) INTO v_fn_owner
  FROM pg_catalog.pg_proc p WHERE p.oid = v_fn;

  IF v_fn_owner IS DISTINCT FROM v_tbl_owner THEN
    EXECUTE pg_catalog.format(
      'ALTER FUNCTION finance.trg_str_monthly_settlement_sum_deferred() OWNER TO %I', v_tbl_owner);
  END IF;

  IF NOT pg_catalog.has_schema_privilege(v_tbl_owner, 'finance', 'USAGE')
     OR NOT pg_catalog.has_table_privilege(v_tbl_owner, 'finance.str_monthly_settlement_certifications', 'SELECT')
     OR NOT pg_catalog.has_table_privilege(v_tbl_owner, 'finance.str_monthly_settlement_lines', 'SELECT') THEN
    RAISE EXCEPTION 'owner % lacks SELECT on finance.str_monthly_settlement_*; refusing to repair.', v_tbl_owner;
  END IF;

  -- FORCE RLS applies to the owner too; the deny-all policies would block the
  -- definer unless the owner bypasses RLS (same model the client-settlement
  -- certification layer already relies on in Production).
  IF NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_roles r
       WHERE r.rolname = v_tbl_owner AND (r.rolbypassrls OR r.rolsuper)
     ) THEN
    RAISE EXCEPTION 'owner % cannot bypass FORCE RLS on finance.str_monthly_settlement_*; refusing to repair.', v_tbl_owner;
  END IF;
END
$owner$;

-- ── 3. Re-assert the committed contract on the entry points (idempotent) ─────
ALTER FUNCTION public.apply_str_monthly_settlement_certification(
  UUID, UUID, DATE, DATE, INTEGER, UUID, NUMERIC, TEXT, TEXT, TEXT, JSONB
) SECURITY DEFINER SET search_path TO '';

ALTER FUNCTION public.void_str_monthly_settlement_certification(UUID, TEXT, TEXT)
  SECURITY DEFINER SET search_path TO '';

ALTER FUNCTION public.read_certified_str_monthly_settlement(UUID, UUID, DATE, DATE)
  SECURITY DEFINER SET search_path TO '';

ALTER FUNCTION finance.assert_str_monthly_settlement_authorized()
  SECURITY DEFINER SET search_path TO '';

-- EXECUTE rules stay exactly as committed in 20260924000000:
--   apply/void  → authenticated only (service_role and anon revoked)
--   public read → service_role only (anon/authenticated revoked)
REVOKE ALL ON FUNCTION public.apply_str_monthly_settlement_certification(
  UUID, UUID, DATE, DATE, INTEGER, UUID, NUMERIC, TEXT, TEXT, TEXT, JSONB
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.apply_str_monthly_settlement_certification(
  UUID, UUID, DATE, DATE, INTEGER, UUID, NUMERIC, TEXT, TEXT, TEXT, JSONB
) TO authenticated;

REVOKE ALL ON FUNCTION public.void_str_monthly_settlement_certification(UUID, TEXT, TEXT)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.void_str_monthly_settlement_certification(UUID, TEXT, TEXT)
  TO authenticated;

REVOKE ALL ON FUNCTION public.read_certified_str_monthly_settlement(UUID, UUID, DATE, DATE)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.read_certified_str_monthly_settlement(UUID, UUID, DATE, DATE)
  TO service_role;

COMMIT;
