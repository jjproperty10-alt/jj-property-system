-- ============================================================
-- 20261003120000 — v_contact_settlement reads the certified ledger
-- DRAFT ONLY. Do not apply to Production without a separate, explicit
-- Yossi approval. No data change, no row restore, no flag change.
--
-- Captured read-only from Production vsiiprzjrstjcmjpwcrd (PostgreSQL 17.6) on
-- 2026-10-03 (Bucharest) via pg_get_viewdef(oid, true) inside
-- BEGIN READ ONLY ... ROLLBACK:
--   public.v_contact_settlement          len 8417  md5 84b5a9448d4b8547b361602406bcf7e6
--   public.v_contact_settlement_summary  len 2294  md5 edd2b35127b5299e4f6b66c62abac7b7
--   owner postgres (both); reloptions NULL, i.e. not security_invoker (both);
--   ACL {postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres} (both).
-- Re-creating the captured text on local PostgreSQL 17 reproduces both md5s.
--
-- Bug: the live view admits rows on review_status only ('active' or NULL).
-- It still counts soft-deleted rows (is_deleted = true) and rows that have an
-- active public.transaction_exclusions entry. On 2026-10-03 that is 15 rows
-- across 6 contacts.
--
-- Yossi 2026-10-03 18:10, option 1: one transaction is counted once across every
-- consumer, through one shared inclusion mechanism. This draft creates that
-- mechanism and points v_contact_settlement at it. It does not retarget any
-- other consumer. The inventory and the later switch plan are in
-- docs/planning/canonical_transaction_inclusion_2026-10-03.md.
--
-- Shared mechanism (no transaction id is written into either object):
--   public.v_canonical_transaction_inclusion
--     one row per transaction that is certified
--       COALESCE(is_deleted, false) = false
--       AND (review_status = 'active' OR review_status IS NULL)
--       AND no active public.transaction_exclusions row
--     OR that public.canonical_inclusion_decided(id) accepts.
--   public.canonical_inclusion_decided(uuid)
--     returns false until a future append-only table
--     finance.canonical_inclusion_decisions exists. This draft does not create
--     that table and does not insert any decision row. The column contract is
--     described only in the planning doc. A later, separately approved
--     migration creates the table. Inclusion of a soft-deleted or excluded row
--     happens by a row in that table, not by clearing is_deleted, review_status,
--     or transaction_exclusions, and not by an allowlist in this view.
--
-- Both branches of v_contact_settlement read the shared view. The two
-- review_status filters are removed because the shared view already applies
-- them. Every classification CASE, settlement_amount, join, and column
-- name/order/type is identical to the captured definition.
--
-- public.v_contact_settlement_summary is NOT recreated. Its body reads only
-- public.v_contact_settlement, so it inherits the fix with an unchanged
-- definition. The guards below assert that it is unchanged.
--
-- What is not written into this view (see the planning doc):
--   Side A of pairs 1, 2, and 4, and the Uriel 1,800 receipt, are planned
--   include rows in the future decision table. Naming a canonical id is not
--   itself an include. Pair 5 side A is the canonical id and stays held:
--   no include row, and nothing is added on top of certification ad2ba8fd.
--   Side B stays out. Pair 3 stays held. The 975 Kamares tenant payment of
--   2026-08-13 is not an include row. No transaction id is written here.
--   Uriel 1,800 evidence ref:
--   uriel-kamares-1800-additional-receipt-yossi-2026-09-23.
--
-- Owner/grants: CREATE OR REPLACE VIEW keeps the owner (postgres) and the ACL
-- of v_contact_settlement. No WITH (...) clause on that view, so its reloptions
-- stay NULL as on Production. GRANT/REVOKE below apply only to the two new
-- objects, which are not granted to PUBLIC. The DO blocks abort on any drift.
--
-- Rollback: supabase/rollbacks/20261003120000_contact_settlement_certified_ledger_rollback.sql
-- ============================================================

BEGIN;

-- Pre-check: the live definition must equal the captured one.
DO $guard$
DECLARE
  v_md5   text;
  v_owner text;
  v_acl   text;
  v_opts  text[];
  v_cols  text;
  v_smd5  text;
  v_scols text;
BEGIN
  SELECT md5(pg_get_viewdef(c.oid, true)), pg_get_userbyid(c.relowner), c.relacl::text, c.reloptions,
         (SELECT string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod), ',' ORDER BY a.attnum)
            FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped)
    INTO v_md5, v_owner, v_acl, v_opts, v_cols
    FROM pg_class c WHERE c.oid = 'public.v_contact_settlement'::regclass;
  SELECT md5(pg_get_viewdef(c.oid, true)),
         (SELECT string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod), ',' ORDER BY a.attnum)
            FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped)
    INTO v_smd5, v_scols
    FROM pg_class c WHERE c.oid = 'public.v_contact_settlement_summary'::regclass;
  IF v_md5 IS DISTINCT FROM '84b5a9448d4b8547b361602406bcf7e6' THEN
    RAISE EXCEPTION 'pre-check: v_contact_settlement definition md5 % <> expected 84b5a9448d4b8547b361602406bcf7e6', v_md5;
  END IF;
  IF v_owner IS DISTINCT FROM 'postgres' OR v_acl IS DISTINCT FROM '{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres}' OR v_opts IS NOT NULL THEN
    RAISE EXCEPTION 'pre-check: owner/ACL/reloptions drift (owner %, acl %, opts %)', v_owner, v_acl, v_opts;
  END IF;
  IF v_cols IS DISTINCT FROM 'contact_id:uuid,contact_name:text,property_name:text,transaction_id:uuid,date:date,category:text,subcategory:text,payer:text,payee:text,amount_eur:numeric(12,2),client_charge:numeric(12,2),settlement_amount:numeric,settlement_class:text,settlement_effect:text,description:text,source:text' THEN
    RAISE EXCEPTION 'pre-check: v_contact_settlement column signature drift: %', v_cols;
  END IF;
  IF v_smd5 IS DISTINCT FROM 'edd2b35127b5299e4f6b66c62abac7b7' OR v_scols IS DISTINCT FROM 'contact_id:uuid,contact_name:text,total_rows:bigint,purchase_capital:numeric,sale_expenses:numeric,operational_expenses:numeric,mgmt_fees:numeric,paid_to_owner:numeric,income_collected:numeric,client_payments:numeric,third_party_payments:numeric,unclassified:numeric,net_jj_settlement:numeric,net_deal_balance:numeric,attributed_rows:bigint,mapped_rows:bigint' THEN
    RAISE EXCEPTION 'pre-check: v_contact_settlement_summary drift (md5 %, cols %)', v_smd5, v_scols;
  END IF;
END
$guard$;

-- One inclusion decision for every consumer. No transaction id is hardcoded.
-- The future decision table is not created here.
CREATE OR REPLACE FUNCTION public.canonical_inclusion_decided(p_transaction_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog
AS $$
DECLARE
  v_hit boolean;
BEGIN
  IF p_transaction_id IS NULL
     OR to_regclass('finance.canonical_inclusion_decisions') IS NULL THEN
    RETURN false;
  END IF;
  EXECUTE
    'SELECT EXISTS (
       SELECT 1
       FROM finance.canonical_inclusion_decisions AS d
       WHERE d.transaction_id = $1
         AND d.decision = ''include''
         AND d.voided_at IS NULL
     )'
    INTO v_hit
    USING p_transaction_id;
  RETURN COALESCE(v_hit, false);
END;
$$;

REVOKE ALL ON FUNCTION public.canonical_inclusion_decided(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.canonical_inclusion_decided(uuid) TO service_role;

CREATE OR REPLACE VIEW public.v_canonical_transaction_inclusion
WITH (security_invoker = true) AS
SELECT t.*
FROM public.transactions t
WHERE (
    COALESCE(t.is_deleted, false) = false
    AND (t.review_status = 'active' OR t.review_status IS NULL)
    AND NOT EXISTS (
      SELECT 1
      FROM public.transaction_exclusions te
      WHERE te.transaction_id = t.id
        AND te.is_active = true
    )
  )
  OR public.canonical_inclusion_decided(t.id);

REVOKE ALL ON public.v_canonical_transaction_inclusion FROM PUBLIC;
GRANT SELECT ON public.v_canonical_transaction_inclusion TO service_role;

CREATE OR REPLACE VIEW public.v_contact_settlement AS
 WITH classified AS (
         SELECT t.id,
            t.date,
            t.property_name,
            t.category,
            t.subcategory,
            t.payer,
            t.payee,
            t.amount_eur,
            t.client_charge,
            t.description,
                CASE
                    WHEN t.subcategory = ANY (ARRAY['Purchase Contract'::text, 'Sale Contract'::text, 'Renovation Contract'::text]) THEN 'EXCLUDED'::text
                    WHEN t.category = 'Transfer'::text THEN 'EXCLUDED'::text
                    WHEN (t.subcategory = ANY (ARRAY['Cleaning'::text, 'Management Fee'::text])) AND t.category = 'Airbnb'::text THEN 'EXCLUDED'::text
                    WHEN t.subcategory = 'Third-Party Payment'::text THEN 'THIRD_PARTY_PAYMENT'::text
                    WHEN t.subcategory = 'Bank Payment to Owner'::text THEN 'PAID_TO_OWNER'::text
                    WHEN t.subcategory = ANY (ARRAY['Platform Income'::text, 'Rent'::text, 'Tenant Payment'::text, 'Staff Accommodation Rent'::text]) THEN 'INCOME_COLLECTED'::text
                    WHEN t.subcategory = 'Management Fee'::text AND t.category <> 'Airbnb'::text THEN 'MGMT_FEE'::text
                    WHEN t.subcategory = ANY (ARRAY['Client Sale Expenses'::text, 'Sale Tax'::text]) THEN 'SALE_EXPENSE'::text
                    WHEN t.category = 'Purchase'::text AND t.subcategory <> 'Purchase Contract'::text AND (COALESCE(t.payer, ''::text) <> ALL (ARRAY['Client'::text, 'Owner'::text])) THEN 'PURCHASE_CAPITAL'::text
                    WHEN (t.payer = ANY (ARRAY['Client'::text, 'Owner'::text])) AND (t.payee = ANY (ARRAY['Yossi'::text, 'Jacob'::text, 'JJ'::text])) THEN 'CLIENT_PAYMENT'::text
                    WHEN t.payer = 'Tenant'::text AND (t.payee = ANY (ARRAY['Yossi'::text, 'Jacob'::text, 'JJ'::text, 'Anastasia'::text])) THEN 'INCOME_COLLECTED'::text
                    WHEN t.payer = 'Airbnb'::text AND (t.payee = ANY (ARRAY['Yossi'::text, 'Jacob'::text, 'JJ'::text, 'Anastasia'::text])) THEN 'INCOME_COLLECTED'::text
                    WHEN (t.payer = ANY (ARRAY['Yossi'::text, 'Jacob'::text, 'JJ'::text, 'Anastasia'::text])) AND (t.payee <> ALL (ARRAY['Yossi'::text, 'Jacob'::text, 'JJ'::text, 'Anastasia'::text])) AND t.property_name IS NOT NULL THEN 'OPERATIONAL_EXPENSE'::text
                    ELSE 'UNCLASSIFIED'::text
                END AS settlement_class,
                CASE
                    WHEN t.subcategory = ANY (ARRAY['Purchase Contract'::text, 'Sale Contract'::text, 'Renovation Contract'::text]) THEN 'NO_EFFECT'::text
                    WHEN t.category = 'Transfer'::text THEN 'NO_EFFECT'::text
                    WHEN (t.subcategory = ANY (ARRAY['Cleaning'::text, 'Management Fee'::text])) AND t.category = 'Airbnb'::text THEN 'NO_EFFECT'::text
                    WHEN t.subcategory = 'Third-Party Payment'::text THEN 'DEAL_ONLY'::text
                    WHEN t.subcategory = 'Bank Payment to Owner'::text THEN 'INCREASES'::text
                    WHEN t.subcategory = ANY (ARRAY['Platform Income'::text, 'Rent'::text, 'Tenant Payment'::text, 'Staff Accommodation Rent'::text]) THEN 'REDUCES'::text
                    WHEN t.subcategory = 'Management Fee'::text AND t.category <> 'Airbnb'::text THEN 'INCREASES'::text
                    WHEN t.subcategory = ANY (ARRAY['Client Sale Expenses'::text, 'Sale Tax'::text]) THEN 'INCREASES'::text
                    WHEN t.category = 'Purchase'::text AND t.subcategory <> 'Purchase Contract'::text AND (COALESCE(t.payer, ''::text) <> ALL (ARRAY['Client'::text, 'Owner'::text])) THEN 'INCREASES'::text
                    WHEN (t.payer = ANY (ARRAY['Client'::text, 'Owner'::text])) AND (t.payee = ANY (ARRAY['Yossi'::text, 'Jacob'::text, 'JJ'::text])) THEN 'REDUCES'::text
                    WHEN t.payer = 'Tenant'::text AND (t.payee = ANY (ARRAY['Yossi'::text, 'Jacob'::text, 'JJ'::text, 'Anastasia'::text])) THEN 'REDUCES'::text
                    WHEN t.payer = 'Airbnb'::text AND (t.payee = ANY (ARRAY['Yossi'::text, 'Jacob'::text, 'JJ'::text, 'Anastasia'::text])) THEN 'REDUCES'::text
                    WHEN (t.payer = ANY (ARRAY['Yossi'::text, 'Jacob'::text, 'JJ'::text, 'Anastasia'::text])) AND (t.payee <> ALL (ARRAY['Yossi'::text, 'Jacob'::text, 'JJ'::text, 'Anastasia'::text])) AND t.property_name IS NOT NULL THEN 'INCREASES'::text
                    ELSE 'NO_EFFECT'::text
                END AS settlement_effect,
                CASE
                    WHEN t.category = 'Purchase'::text AND t.subcategory <> 'Purchase Contract'::text AND (COALESCE(t.payer, ''::text) <> ALL (ARRAY['Client'::text, 'Owner'::text])) THEN COALESCE(t.client_charge, t.amount_eur)
                    WHEN t.subcategory = ANY (ARRAY['Client Sale Expenses'::text, 'Sale Tax'::text]) THEN COALESCE(t.client_charge, t.amount_eur)
                    WHEN t.subcategory = 'Management Fee'::text AND t.category <> 'Airbnb'::text THEN COALESCE(t.client_charge, t.amount_eur)
                    WHEN (t.payer = ANY (ARRAY['Yossi'::text, 'Jacob'::text, 'JJ'::text, 'Anastasia'::text])) AND (t.payee <> ALL (ARRAY['Yossi'::text, 'Jacob'::text, 'JJ'::text, 'Anastasia'::text])) AND t.property_name IS NOT NULL AND (t.subcategory <> ALL (ARRAY['Purchase Contract'::text, 'Sale Contract'::text, 'Renovation Contract'::text])) AND t.category <> 'Transfer'::text AND NOT ((t.subcategory = ANY (ARRAY['Cleaning'::text, 'Management Fee'::text])) AND t.category = 'Airbnb'::text) AND (t.subcategory <> ALL (ARRAY['Third-Party Payment'::text, 'Bank Payment to Owner'::text, 'Platform Income'::text, 'Rent'::text, 'Tenant Payment'::text, 'Staff Accommodation Rent'::text, 'Client Sale Expenses'::text, 'Sale Tax'::text])) AND NOT (t.category = 'Purchase'::text AND t.subcategory <> 'Purchase Contract'::text AND (COALESCE(t.payer, ''::text) <> ALL (ARRAY['Client'::text, 'Owner'::text]))) THEN COALESCE(t.client_charge, t.amount_eur)
                    ELSE t.amount_eur
                END AS settlement_amount
           FROM v_canonical_transaction_inclusion t
        )
 SELECT c.id AS contact_id,
    c.name AS contact_name,
    cl.property_name,
    cl.id AS transaction_id,
    cl.date,
    cl.category,
    cl.subcategory,
    cl.payer,
    cl.payee,
    cl.amount_eur,
    cl.client_charge,
    cl.settlement_amount,
    cl.settlement_class,
    cl.settlement_effect,
    cl.description,
    'property_mapped'::text AS source
   FROM classified cl
     JOIN contact_properties cp ON cp.property_name = cl.property_name AND cp.is_deleted = false
     JOIN contacts c ON c.id = cp.contact_id
  WHERE cl.settlement_effect <> 'NO_EFFECT'::text AND cl.property_name IS NOT NULL
UNION ALL
 SELECT sa.contact_id,
    c.name AS contact_name,
    t.property_name,
    t.id AS transaction_id,
    t.date,
    t.category,
    t.subcategory,
    t.payer,
    t.payee,
    t.amount_eur,
    t.client_charge,
    sa.allocated_amount AS settlement_amount,
        CASE
            WHEN (t.payer = ANY (ARRAY['Client'::text, 'Owner'::text])) AND (t.payee = ANY (ARRAY['Yossi'::text, 'Jacob'::text, 'JJ'::text])) THEN 'CLIENT_PAYMENT'::text
            WHEN t.payer = 'Tenant'::text AND (t.payee = ANY (ARRAY['Yossi'::text, 'Jacob'::text, 'JJ'::text, 'Anastasia'::text])) THEN 'INCOME_COLLECTED'::text
            WHEN t.payer = 'Airbnb'::text AND (t.payee = ANY (ARRAY['Yossi'::text, 'Jacob'::text, 'JJ'::text, 'Anastasia'::text])) THEN 'INCOME_COLLECTED'::text
            ELSE 'UNCLASSIFIED'::text
        END AS settlement_class,
        CASE
            WHEN (t.payer = ANY (ARRAY['Client'::text, 'Owner'::text])) AND (t.payee = ANY (ARRAY['Yossi'::text, 'Jacob'::text, 'JJ'::text])) THEN 'REDUCES'::text
            WHEN t.payer = 'Tenant'::text AND (t.payee = ANY (ARRAY['Yossi'::text, 'Jacob'::text, 'JJ'::text, 'Anastasia'::text])) THEN 'REDUCES'::text
            WHEN t.payer = 'Airbnb'::text AND (t.payee = ANY (ARRAY['Yossi'::text, 'Jacob'::text, 'JJ'::text, 'Anastasia'::text])) THEN 'REDUCES'::text
            ELSE 'NO_EFFECT'::text
        END AS settlement_effect,
    t.description,
    'settlement_allocation'::text AS source
   FROM settlement_allocation sa
     JOIN v_canonical_transaction_inclusion t ON t.id = sa.transaction_id
     JOIN contacts c ON c.id = sa.contact_id
  WHERE sa.voided_at IS NULL AND t.property_name IS NULL;

-- Post-check: new definition, same owner/ACL/options/columns, summary untouched.
DO $guard$
DECLARE
  v_md5   text;
  v_owner text;
  v_acl   text;
  v_opts  text[];
  v_cols  text;
  v_smd5  text;
  v_scols text;
BEGIN
  SELECT md5(pg_get_viewdef(c.oid, true)), pg_get_userbyid(c.relowner), c.relacl::text, c.reloptions,
         (SELECT string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod), ',' ORDER BY a.attnum)
            FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped)
    INTO v_md5, v_owner, v_acl, v_opts, v_cols
    FROM pg_class c WHERE c.oid = 'public.v_contact_settlement'::regclass;
  SELECT md5(pg_get_viewdef(c.oid, true)),
         (SELECT string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod), ',' ORDER BY a.attnum)
            FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped)
    INTO v_smd5, v_scols
    FROM pg_class c WHERE c.oid = 'public.v_contact_settlement_summary'::regclass;
  IF v_md5 IS DISTINCT FROM '5858d732fc385d506a81d8de6ef7ad9b' THEN
    RAISE EXCEPTION 'post-check: v_contact_settlement definition md5 % <> expected 5858d732fc385d506a81d8de6ef7ad9b', v_md5;
  END IF;
  IF to_regclass('public.v_canonical_transaction_inclusion') IS NULL
     OR to_regprocedure('public.canonical_inclusion_decided(uuid)') IS NULL THEN
    RAISE EXCEPTION 'post-check: shared inclusion objects missing';
  END IF;
  IF to_regclass('finance.canonical_inclusion_decisions') IS NOT NULL THEN
    RAISE EXCEPTION 'post-check: this draft must not create the decision table';
  END IF;
  IF v_owner IS DISTINCT FROM 'postgres' OR v_acl IS DISTINCT FROM '{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres}' OR v_opts IS NOT NULL THEN
    RAISE EXCEPTION 'post-check: owner/ACL/reloptions drift (owner %, acl %, opts %)', v_owner, v_acl, v_opts;
  END IF;
  IF v_cols IS DISTINCT FROM 'contact_id:uuid,contact_name:text,property_name:text,transaction_id:uuid,date:date,category:text,subcategory:text,payer:text,payee:text,amount_eur:numeric(12,2),client_charge:numeric(12,2),settlement_amount:numeric,settlement_class:text,settlement_effect:text,description:text,source:text' THEN
    RAISE EXCEPTION 'post-check: v_contact_settlement column signature drift: %', v_cols;
  END IF;
  IF v_smd5 IS DISTINCT FROM 'edd2b35127b5299e4f6b66c62abac7b7' OR v_scols IS DISTINCT FROM 'contact_id:uuid,contact_name:text,total_rows:bigint,purchase_capital:numeric,sale_expenses:numeric,operational_expenses:numeric,mgmt_fees:numeric,paid_to_owner:numeric,income_collected:numeric,client_payments:numeric,third_party_payments:numeric,unclassified:numeric,net_jj_settlement:numeric,net_deal_balance:numeric,attributed_rows:bigint,mapped_rows:bigint' THEN
    RAISE EXCEPTION 'post-check: v_contact_settlement_summary drift (md5 %, cols %)', v_smd5, v_scols;
  END IF;
END
$guard$;

COMMIT;
