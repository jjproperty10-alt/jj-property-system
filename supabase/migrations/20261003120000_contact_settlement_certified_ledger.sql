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
-- across 6 contacts; excluding them moves net_jj_settlement by +9,701.45 in
-- total (Liron and Alon, Ofri, Tamir, Tom, Uriel, Yogev).
--
-- Fix: both branches of the view (property_mapped and settlement_allocation)
-- read public.v_certified_ledger_transactions (migration 20260917090000)
-- instead of public.transactions. That view applies the canonical certified
-- predicate:
--   COALESCE(is_deleted, false) = false
--   AND (review_status = 'active' OR review_status IS NULL)
--   AND NOT EXISTS (active transaction_exclusions row)
-- The two review_status filters are removed because the certified predicate
-- already contains them. Every classification CASE, settlement_amount, join,
-- and column name/order/type is identical to the captured definition.
--
-- public.v_contact_settlement_summary is NOT recreated. Its body reads only
-- public.v_contact_settlement, so it inherits the fix with an unchanged
-- definition. The guards below assert that it is unchanged.
--
-- Planned inputs are deliberately NOT allowlisted in this view:
--   twin pairs 1, 2, 4 side A (cfb1b60c, 20eaeb18, dc3d60fb; DS-016, DS-008,
--   STR recon 2026-08-15), pair 5 side A (10622dde; Yossi 03.10 13:18 by ID,
--   twin 9a5fdde0 stays excluded), and Group 1 batch 2509d3ad (10 rows). All are soft-deleted; the pair rows
--   also carry an active transaction_exclusions entry. An allowlist would make
--   this view disagree with the certified ledger. Their impact is reported by
--   the read-only docs/planning/contact_settlement_planned_inputs_2026-10-03.sql.
--   They enter this view only after a separately approved data change makes
--   them certified (is_deleted = false AND exclusion deactivated).
-- Pair 3 (82c8ee31/e4a8a01c Tamir 3,404.03) is UNKNOWN and not counted.
--
-- Owner/grants: CREATE OR REPLACE VIEW keeps the owner (postgres) and the ACL.
-- No WITH (...) clause, so reloptions stay NULL as on Production. No GRANT or
-- REVOKE is issued. The DO blocks abort the transaction on any drift.
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
           FROM v_certified_ledger_transactions t
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
     JOIN v_certified_ledger_transactions t ON t.id = sa.transaction_id
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
  IF v_md5 IS DISTINCT FROM '3376f921ff58cfbdc2406bdb17fc2fd0' THEN
    RAISE EXCEPTION 'post-check: v_contact_settlement definition md5 % <> expected 3376f921ff58cfbdc2406bdb17fc2fd0', v_md5;
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
