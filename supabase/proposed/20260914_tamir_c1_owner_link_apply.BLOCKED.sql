-- BLOCKED — do not run.
-- Proposed future Apply for Tamir C1 owner-level payment + owner_transaction_link.
-- C3 (29 Hostaway billing-only rows) is listed in the QA pack but is NOT this file.
--
-- Authorization required from Yossi before any execution.
-- This file is documentation of a dry-run. It is not a migration.
--
-- Shape:
--   1 transaction row (C1) + 1 association row (owner_transaction_links)
--   ≠ "30 database rows". Full future pack = C1×1 + C3×29 = 30 transactions
--     PLUS 1 owner link for C1.

-- INSERT INTO public.transactions (
--   date, category, subcategory, payer, payee, amount_eur, client_charge,
--   property_id, property_name, description, k_note, review_status
-- ) VALUES (
--   '2026-08-24',
--   'Management',
--   'Bank Payment to Owner',
--   'Jacob',
--   'Owner',
--   10000,
--   NULL,
--   NULL,
--   NULL,
--   'Yaakov paid Tamir €10,000 on account of Tamir’s overall owner balance',
--   'PROVENANCE=YOSSI_CONFIRMED;BENEFICIAL_PAYER=Yaakov;BENEFICIAL_PAYEE=Tamir;OWNER_ID=0f352012-1403-4e3b-982a-7c019ee89f1b;IDEMPOTENCY=tamir_owner_pmt_yaakov_2026-08-24_10000;OWNER_LEVEL_UNALLOCATED=true',
--   'active'
-- );
--
-- SELECT finance.link_owner_level_payment(
--   p_transaction_id  := '<c1-transaction-uuid>',
--   p_owner_entity_id := '0f352012-1403-4e3b-982a-7c019ee89f1b',
--   p_idempotency_key := 'tamir_owner_pmt_yaakov_2026-08-24_10000',
--   p_created_by      := 'yossi',
--   p_notes           := 'YOSSI_VERIFIED · OWNER_LEVEL_UNALLOCATED'
-- );

SELECT 'BLOCKED' AS apply_status,
       'C1 not inserted' AS c1,
       'C3 not inserted' AS c3,
       3248.75 AS certified_due_to_tamir_eur;
