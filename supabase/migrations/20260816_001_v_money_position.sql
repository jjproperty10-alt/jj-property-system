-- Canonical company-level money position (ADDITIVE, read-only view).
-- Authorization: Yossi "DECISION APPROVED — CONTINUE WIRING" (2026-08-16).
-- NORMALIZATION ONLY of certified public.v_counterparty_position. No recompute, no invented semantics.
-- final_counterparty_position already nets actual owner_payments + transfers + approved_offsets
-- + approved_adjustments (settled movements) → it is the certified OPEN position (not gross, not entitlement).
-- Scope v1: client counterparties. Partner/supplier/employee pending a ratified certified source.

CREATE OR REPLACE VIEW public.v_money_position AS
SELECT
  cp.counterparty_id                                   AS money_position_id,
  CASE cp.position_direction
    WHEN 'counterparty_owes_jj' THEN 'RECEIVABLE_TO_JJ'
    WHEN 'jj_owes_counterparty' THEN 'PAYABLE_BY_JJ'
    ELSE 'SETTLED'
  END                                                  AS direction,
  cp.counterparty_id                                   AS counterparty_contact_id,
  rp.party_id                                          AS counterparty_canonical_id,
  cp.counterparty_name                                 AS counterparty_name,
  'client'::text                                       AS counterparty_type,
  rp.party_id                                          AS canonical_owner_id,
  NULL::uuid                                           AS canonical_property_id,
  round(abs(cp.final_counterparty_position), 2)        AS open_amount_eur,
  round(cp.final_counterparty_position, 2)             AS signed_position_eur,
  round(cp.gross_counterparty_position, 2)             AS gross_amount_eur,
  round(coalesce(cp.owner_payments,0) + coalesce(cp.transfers_net,0)
        + coalesce(cp.approved_offsets_net,0) + coalesce(cp.approved_adjustments_net,0), 2)
                                                       AS settled_movements_eur,
  'counterparty_net_position'::text                    AS category,
  cp.position_label                                    AS business_reason,
  cp.confidence_status                                 AS confidence_status,
  cp.has_unresolved_history                            AS has_unresolved_history,
  cp.unresolved_item_count                             AS unresolved_item_count,
  CASE
    WHEN cp.position_direction = 'settled'  THEN 'SETTLED'
    WHEN cp.has_unresolved_history          THEN 'OPEN_UNRESOLVED'
    ELSE 'OPEN'
  END                                                  AS settlement_status,
  'v_counterparty_position'::text                      AS source_system,
  cp.counterparty_id::text                             AS source_reference,
  cp.related_property_count                            AS related_property_count,
  cp.str_properties                                    AS str_properties,
  jsonb_build_object(
    'str_balance',        cp.str_balance,
    'management_balance', cp.management_balance,
    'renovation_balance', cp.renovation_balance,
    'sale_balance',       cp.sale_balance,
    'gross',              cp.gross_counterparty_position,
    'owner_payments',     cp.owner_payments,
    'transfers_net',      cp.transfers_net,
    'approved_offsets_net', cp.approved_offsets_net,
    'approved_adjustments_net', cp.approved_adjustments_net
  )                                                    AS breakdown,
  cp.as_of_date                                        AS as_of_date
FROM public.v_counterparty_position cp
LEFT JOIN registry.parties rp ON rp.contact_ref = cp.counterparty_id;

COMMENT ON VIEW public.v_money_position IS
 'Canonical company-level money position (Wiring 2026-08-16). Normalizes certified public.v_counterparty_position into RECEIVABLE_TO_JJ / PAYABLE_BY_JJ / SETTLED with canonical party resolution (registry.parties via contact_ref). open_amount_eur = abs(final certified net position after settled movements). v1 scope = client counterparties.';
