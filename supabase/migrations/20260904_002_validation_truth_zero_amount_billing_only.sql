-- =====================================================================
-- Validation Truth — exclude legitimate billing-only rows from zero_amount
--
-- PURPOSE
--   Capture the full Production definition of public.v_transaction_issues
--   (security_invoker=true) and correct only the zero_amount predicate so
--   amount_eur=0 AND client_charge>0 is NOT flagged as a high-severity error.
--
-- BUSINESS RULE
--   amount_eur = 0 AND COALESCE(client_charge, 0) > 0
--   = legitimate billing-only (owner/client charge without JJ cash cost).
--   Do not delete, rewrite, or convert client_charge into amount_eur.
--
-- WHAT CHANGES
--   zero_amount WHERE: amount_eur <= 0
--     AND NOT (amount_eur = 0 AND COALESCE(client_charge, 0) > 0)
--   Equivalent: amount_eur < 0 OR (amount_eur = 0 AND COALESCE(client_charge, 0) = 0)
--
-- WHAT DOES NOT CHANGE
--   All other UNION branches, columns, severities, duplicate logic.
--   No transaction row mutations. No Client Report formula changes.
--
-- EXPECTED PRODUCTION EFFECT (evidence-backed)
--   zero_amount issues: 58 → 1 (57 billing-only false positives removed)
--
-- ROLLBACK (manual only — NOT a deployable migration):
--   docs/rollbacks/20260904_002_validation_truth_zero_amount_billing_only_rollback.sql
--
-- IMPLEMENT-ONLY: review + Yossi approval before applying to any environment.
-- =====================================================================

CREATE OR REPLACE VIEW public.v_transaction_issues
WITH (security_invoker = true)
AS
 SELECT transactions.id,
    transactions.date,
    transactions.amount_eur,
    transactions.category,
    transactions.subcategory,
    transactions.description,
    transactions.payer,
    transactions.payee,
    'missing_property'::text AS issue_type,
    'Missing property name'::text AS issue_description,
    'medium'::text AS severity
   FROM public.transactions
  WHERE (((transactions.property_name IS NULL) OR (transactions.property_name = ''::text))
    AND (transactions.category <> ALL (ARRAY['JJ'::text, 'Transfer'::text])))
UNION ALL
 SELECT transactions.id,
    transactions.date,
    transactions.amount_eur,
    transactions.category,
    transactions.subcategory,
    transactions.description,
    transactions.payer,
    transactions.payee,
    'missing_payer'::text AS issue_type,
    'Missing payer'::text AS issue_description,
    'medium'::text AS severity
   FROM public.transactions
  WHERE ((transactions.payer IS NULL) OR (transactions.payer = ''::text))
UNION ALL
 SELECT transactions.id,
    transactions.date,
    transactions.amount_eur,
    transactions.category,
    transactions.subcategory,
    transactions.description,
    transactions.payer,
    transactions.payee,
    'missing_payee'::text AS issue_type,
    'Missing payee'::text AS issue_description,
    'medium'::text AS severity
   FROM public.transactions
  WHERE ((transactions.payee IS NULL) OR (transactions.payee = ''::text))
UNION ALL
 SELECT transactions.id,
    transactions.date,
    transactions.amount_eur,
    transactions.category,
    transactions.subcategory,
    transactions.description,
    transactions.payer,
    transactions.payee,
    'missing_subcategory'::text AS issue_type,
    'Missing subcategory'::text AS issue_description,
    'low'::text AS severity
   FROM public.transactions
  WHERE ((transactions.subcategory IS NULL) OR (transactions.subcategory = ''::text))
UNION ALL
 SELECT transactions.id,
    transactions.date,
    transactions.amount_eur,
    transactions.category,
    transactions.subcategory,
    transactions.description,
    transactions.payer,
    transactions.payee,
    'large_amount'::text AS issue_type,
    concat('Unusually large amount: €', (round(transactions.amount_eur, 0))::text) AS issue_description,
    'high'::text AS severity
   FROM public.transactions
  WHERE ((transactions.amount_eur > (500000)::numeric)
    AND (transactions.subcategory <> ALL (ARRAY['Purchase Contract'::text, 'Sale Contract'::text])))
UNION ALL
 SELECT transactions.id,
    transactions.date,
    transactions.amount_eur,
    transactions.category,
    transactions.subcategory,
    transactions.description,
    transactions.payer,
    transactions.payee,
    'zero_amount'::text AS issue_type,
    'Zero or negative amount'::text AS issue_description,
    'high'::text AS severity
   FROM public.transactions
  WHERE (
    -- OLD: transactions.amount_eur <= 0
    -- NEW: exclude legitimate billing-only (cash 0, client_charge > 0).
    -- Negatives remain review candidates even when client_charge > 0.
    transactions.amount_eur < (0)::numeric
    OR (
      transactions.amount_eur = (0)::numeric
      AND COALESCE(transactions.client_charge, (0)::numeric) = (0)::numeric
    )
  )
UNION ALL
 SELECT t1.id,
    t1.date,
    t1.amount_eur,
    t1.category,
    t1.subcategory,
    t1.description,
    t1.payer,
    t1.payee,
    'duplicate'::text AS issue_type,
    concat('Possible duplicate of another transaction on ', (t1.date)::text) AS issue_description,
    'medium'::text AS severity
   FROM (public.transactions t1
     JOIN public.transactions t2 ON (((t1.id < t2.id)
       AND (t1.date = t2.date)
       AND (t1.amount_eur = t2.amount_eur)
       AND (lower(COALESCE(t1.property_name, ''::text)) = lower(COALESCE(t2.property_name, ''::text)))
       AND (lower(COALESCE(t1.description, ''::text)) = lower(COALESCE(t2.description, ''::text))))));

COMMENT ON VIEW public.v_transaction_issues IS
  'Data-quality issue queue. zero_amount excludes billing-only rows '
  '(amount_eur=0 AND client_charge>0). security_invoker=true. '
  'Validation Truth 20260904_002.';
