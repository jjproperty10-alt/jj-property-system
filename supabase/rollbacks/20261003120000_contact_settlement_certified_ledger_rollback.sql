-- ============================================================
-- ROLLBACK for 20261003120000_contact_settlement_certified_ledger.sql
-- Restores the exact captured Production definition of
-- public.v_contact_settlement. Do not run without a separate approval.
-- Does not touch data. public.v_contact_settlement_summary was not changed by
-- the migration; its captured definition is kept below as a reference only.
--
-- Captured read-only from Production vsiiprzjrstjcmjpwcrd (PostgreSQL 17.6) on
-- 2026-10-03 (Bucharest) via pg_get_viewdef(oid, true) inside
-- BEGIN READ ONLY ... ROLLBACK:
--   public.v_contact_settlement          len 8417  md5 84b5a9448d4b8547b361602406bcf7e6
--   public.v_contact_settlement_summary  len 2294  md5 edd2b35127b5299e4f6b66c62abac7b7
--   owner postgres (both); reloptions NULL, i.e. not security_invoker (both);
--   ACL {postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres} (both).
-- Re-creating the captured text on local PostgreSQL 17 reproduces both md5s.
-- ============================================================

BEGIN;

-- Pre-check: the view must currently hold the migration's definition.
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
    RAISE EXCEPTION 'rollback pre-check: v_contact_settlement definition md5 % <> expected 3376f921ff58cfbdc2406bdb17fc2fd0', v_md5;
  END IF;
  IF v_owner IS DISTINCT FROM 'postgres' OR v_acl IS DISTINCT FROM '{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres}' OR v_opts IS NOT NULL THEN
    RAISE EXCEPTION 'rollback pre-check: owner/ACL/reloptions drift (owner %, acl %, opts %)', v_owner, v_acl, v_opts;
  END IF;
  IF v_cols IS DISTINCT FROM 'contact_id:uuid,contact_name:text,property_name:text,transaction_id:uuid,date:date,category:text,subcategory:text,payer:text,payee:text,amount_eur:numeric(12,2),client_charge:numeric(12,2),settlement_amount:numeric,settlement_class:text,settlement_effect:text,description:text,source:text' THEN
    RAISE EXCEPTION 'rollback pre-check: v_contact_settlement column signature drift: %', v_cols;
  END IF;
  IF v_smd5 IS DISTINCT FROM 'edd2b35127b5299e4f6b66c62abac7b7' OR v_scols IS DISTINCT FROM 'contact_id:uuid,contact_name:text,total_rows:bigint,purchase_capital:numeric,sale_expenses:numeric,operational_expenses:numeric,mgmt_fees:numeric,paid_to_owner:numeric,income_collected:numeric,client_payments:numeric,third_party_payments:numeric,unclassified:numeric,net_jj_settlement:numeric,net_deal_balance:numeric,attributed_rows:bigint,mapped_rows:bigint' THEN
    RAISE EXCEPTION 'rollback pre-check: v_contact_settlement_summary drift (md5 %, cols %)', v_smd5, v_scols;
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
           FROM transactions t
          WHERE t.review_status = 'active'::text OR t.review_status IS NULL
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
     JOIN transactions t ON t.id = sa.transaction_id
     JOIN contacts c ON c.id = sa.contact_id
  WHERE sa.voided_at IS NULL AND (t.review_status = 'active'::text OR t.review_status IS NULL) AND t.property_name IS NULL;

-- Post-check: byte-identical to the captured Production definition.
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
    RAISE EXCEPTION 'rollback post-check: v_contact_settlement definition md5 % <> expected 84b5a9448d4b8547b361602406bcf7e6', v_md5;
  END IF;
  IF v_owner IS DISTINCT FROM 'postgres' OR v_acl IS DISTINCT FROM '{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres}' OR v_opts IS NOT NULL THEN
    RAISE EXCEPTION 'rollback post-check: owner/ACL/reloptions drift (owner %, acl %, opts %)', v_owner, v_acl, v_opts;
  END IF;
  IF v_cols IS DISTINCT FROM 'contact_id:uuid,contact_name:text,property_name:text,transaction_id:uuid,date:date,category:text,subcategory:text,payer:text,payee:text,amount_eur:numeric(12,2),client_charge:numeric(12,2),settlement_amount:numeric,settlement_class:text,settlement_effect:text,description:text,source:text' THEN
    RAISE EXCEPTION 'rollback post-check: v_contact_settlement column signature drift: %', v_cols;
  END IF;
  IF v_smd5 IS DISTINCT FROM 'edd2b35127b5299e4f6b66c62abac7b7' OR v_scols IS DISTINCT FROM 'contact_id:uuid,contact_name:text,total_rows:bigint,purchase_capital:numeric,sale_expenses:numeric,operational_expenses:numeric,mgmt_fees:numeric,paid_to_owner:numeric,income_collected:numeric,client_payments:numeric,third_party_payments:numeric,unclassified:numeric,net_jj_settlement:numeric,net_deal_balance:numeric,attributed_rows:bigint,mapped_rows:bigint' THEN
    RAISE EXCEPTION 'rollback post-check: v_contact_settlement_summary drift (md5 %, cols %)', v_smd5, v_scols;
  END IF;
END
$guard$;

COMMIT;

-- Reference only (unchanged by the migration, not executed):
-- CREATE OR REPLACE VIEW public.v_contact_settlement_summary AS
--  SELECT contact_id,
--     contact_name,
--     count(*) AS total_rows,
--     sum(
--         CASE
--             WHEN settlement_class = 'PURCHASE_CAPITAL'::text THEN settlement_amount
--             ELSE 0::numeric
--         END) AS purchase_capital,
--     sum(
--         CASE
--             WHEN settlement_class = 'SALE_EXPENSE'::text THEN settlement_amount
--             ELSE 0::numeric
--         END) AS sale_expenses,
--     sum(
--         CASE
--             WHEN settlement_class = 'OPERATIONAL_EXPENSE'::text THEN settlement_amount
--             ELSE 0::numeric
--         END) AS operational_expenses,
--     sum(
--         CASE
--             WHEN settlement_class = 'MGMT_FEE'::text THEN settlement_amount
--             ELSE 0::numeric
--         END) AS mgmt_fees,
--     sum(
--         CASE
--             WHEN settlement_class = 'PAID_TO_OWNER'::text THEN settlement_amount
--             ELSE 0::numeric
--         END) AS paid_to_owner,
--     sum(
--         CASE
--             WHEN settlement_class = 'INCOME_COLLECTED'::text THEN settlement_amount
--             ELSE 0::numeric
--         END) AS income_collected,
--     sum(
--         CASE
--             WHEN settlement_class = 'CLIENT_PAYMENT'::text THEN settlement_amount
--             ELSE 0::numeric
--         END) AS client_payments,
--     sum(
--         CASE
--             WHEN settlement_class = 'THIRD_PARTY_PAYMENT'::text THEN settlement_amount
--             ELSE 0::numeric
--         END) AS third_party_payments,
--     sum(
--         CASE
--             WHEN settlement_class = 'UNCLASSIFIED'::text THEN settlement_amount
--             ELSE 0::numeric
--         END) AS unclassified,
--     sum(
--         CASE
--             WHEN settlement_effect = 'INCREASES'::text THEN settlement_amount
--             WHEN settlement_effect = 'REDUCES'::text THEN - settlement_amount
--             ELSE 0::numeric
--         END) AS net_jj_settlement,
--     sum(
--         CASE
--             WHEN settlement_effect = 'INCREASES'::text THEN settlement_amount
--             WHEN settlement_effect = ANY (ARRAY['REDUCES'::text, 'DEAL_ONLY'::text]) THEN - settlement_amount
--             ELSE 0::numeric
--         END) AS net_deal_balance,
--     count(*) FILTER (WHERE source = 'settlement_allocation'::text) AS attributed_rows,
--     count(*) FILTER (WHERE source = 'property_mapped'::text) AS mapped_rows
--    FROM v_contact_settlement
--   GROUP BY contact_id, contact_name;
--
