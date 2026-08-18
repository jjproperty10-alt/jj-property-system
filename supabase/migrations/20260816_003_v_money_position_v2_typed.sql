-- v_money_position V2 — typed UNION of certified counterparty classes (ADDITIVE, supersedes 001).
-- Authorization: Yossi "COMPLETE COMPANY MONEY POSITION" + CASH_CUSTODIAN correction (2026-08-16).
-- Sources (distinct audited semantics; NO double-count):
--   CLIENT          ← public.v_counterparty_position (final net after settled movements)
--   CASH_CUSTODIAN  ← public.v_anastasia_clearing (custodial cash held for JJ; DS-014 / BR-PAYMENT-INSTRUMENT-001)
-- EXCLUDED (documented): PARTNER (partner↔partner equity; sources disagree; belongs in Finance/Partner Settlement),
--   SUPPLIER (no certified source), TENANT (empty; owner-managed unless certified JJ creditor).
-- NOTE: v_employee_reimbursements is intentionally NOT used (conflicts with the locked cashbox rule).

DROP VIEW IF EXISTS public.v_money_position;

CREATE VIEW public.v_money_position AS
SELECT
  cp.counterparty_id                                   AS money_position_id,
  CASE cp.position_direction
    WHEN 'counterparty_owes_jj' THEN 'RECEIVABLE_TO_JJ'
    WHEN 'jj_owes_counterparty' THEN 'PAYABLE_BY_JJ'
    ELSE 'SETTLED' END                                 AS direction,
  cp.counterparty_id                                   AS counterparty_contact_id,
  rp.party_id                                          AS counterparty_canonical_id,
  cp.counterparty_name                                 AS counterparty_name,
  'CLIENT'::text                                       AS counterparty_type,
  rp.party_id                                          AS canonical_owner_id,
  NULL::uuid                                           AS canonical_property_id,
  round(abs(cp.final_counterparty_position), 2)        AS open_amount_eur,
  round(cp.final_counterparty_position, 2)             AS signed_position_eur,
  round(cp.gross_counterparty_position, 2)             AS gross_amount_eur,
  round(coalesce(cp.owner_payments,0)+coalesce(cp.transfers_net,0)
        +coalesce(cp.approved_offsets_net,0)+coalesce(cp.approved_adjustments_net,0),2) AS settled_movements_eur,
  'counterparty_net_position'::text                    AS category,
  NULL::text                                           AS subcategory,
  cp.position_label                                    AS business_reason,
  cp.confidence_status                                 AS confidence_status,
  cp.has_unresolved_history                            AS has_unresolved_history,
  cp.unresolved_item_count::integer                    AS unresolved_item_count,
  CASE WHEN cp.position_direction='settled' THEN 'SETTLED'
       WHEN cp.has_unresolved_history THEN 'OPEN_UNRESOLVED' ELSE 'OPEN' END AS settlement_status,
  'v_counterparty_position'::text                      AS source_system,
  cp.counterparty_id::text                             AS source_reference,
  jsonb_build_object(
    'str_balance', cp.str_balance, 'management_balance', cp.management_balance,
    'renovation_balance', cp.renovation_balance, 'sale_balance', cp.sale_balance,
    'gross', cp.gross_counterparty_position, 'owner_payments', cp.owner_payments,
    'transfers_net', cp.transfers_net, 'approved_offsets_net', cp.approved_offsets_net,
    'approved_adjustments_net', cp.approved_adjustments_net,
    'related_property_count', cp.related_property_count, 'str_properties', cp.str_properties
  )                                                    AS breakdown,
  cp.as_of_date                                        AS as_of_date
FROM public.v_counterparty_position cp
LEFT JOIN registry.parties rp ON rp.contact_ref = cp.counterparty_id

UNION ALL

SELECT
  ap.party_id                                          AS money_position_id,
  CASE WHEN ac.anastasia_owes_jj > 0 THEN 'RECEIVABLE_TO_JJ'
       WHEN ac.jj_owes_anastasia > 0 THEN 'PAYABLE_BY_JJ'
       ELSE 'SETTLED' END                              AS direction,
  NULL::uuid                                           AS counterparty_contact_id,
  ap.party_id                                          AS counterparty_canonical_id,
  ap.canonical_name                                    AS counterparty_name,
  'CASH_CUSTODIAN'::text                               AS counterparty_type,
  NULL::uuid                                           AS canonical_owner_id,
  NULL::uuid                                           AS canonical_property_id,
  round(greatest(ac.anastasia_owes_jj, ac.jj_owes_anastasia), 2) AS open_amount_eur,
  round(ac.anastasia_owes_jj - ac.jj_owes_anastasia, 2) AS signed_position_eur,
  NULL::numeric                                        AS gross_amount_eur,
  round(coalesce(ac.cash_transferred_out,0), 2)        AS settled_movements_eur,
  'cash_custody'::text                                 AS category,
  'cashbox_operator_holdings'::text                    AS subcategory,
  'JJ cash held by cashbox custodian (DS-014 / BR-PAYMENT-INSTRUMENT-001) — NOT an employee reimbursement'::text AS business_reason,
  'CERTIFIED'::text                                    AS confidence_status,
  false                                                AS has_unresolved_history,
  0::integer                                           AS unresolved_item_count,
  CASE WHEN ac.anastasia_owes_jj > 0 OR ac.jj_owes_anastasia > 0 THEN 'OPEN' ELSE 'SETTLED' END AS settlement_status,
  'v_anastasia_clearing'::text                         AS source_system,
  'anastasia_clearing'::text                           AS source_reference,
  jsonb_build_object(
    'cash_collected', ac.cash_collected, 'expenses_paid', ac.expenses_paid,
    'cash_transferred_out', ac.cash_transferred_out, 'cash_transfers_in', ac.cash_transfers_in,
    'cash_on_hand', ac.cash_on_hand, 'anastasia_owes_jj', ac.anastasia_owes_jj,
    'jj_owes_anastasia', ac.jj_owes_anastasia, 'rule', 'DS-014 / BR-PAYMENT-INSTRUMENT-001'
  )                                                    AS breakdown,
  NULL::date                                           AS as_of_date
FROM public.v_anastasia_clearing ac
JOIN registry.parties ap ON ap.canonical_name = 'Anastasia' AND ap.party_type = 'employee';

COMMENT ON VIEW public.v_money_position IS
 'Canonical company-level money position V2 (Wiring 2026-08-16). Typed UNION: CLIENT (v_counterparty_position) + CASH_CUSTODIAN cashbox holdings (v_anastasia_clearing, DS-014 — custodial cash, NOT reimbursement). No double-count. PARTNER/SUPPLIER/TENANT excluded (documented).';

REVOKE ALL ON public.v_money_position FROM anon;
REVOKE ALL ON public.v_money_position FROM authenticated;
GRANT SELECT ON public.v_money_position TO service_role;
