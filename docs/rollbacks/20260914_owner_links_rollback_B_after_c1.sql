-- Rollback B — after C1 has been inserted.
-- DRY-RUN ONLY. Do not execute against Production.
-- No DROP TABLE. No physical DELETE. Soft-delete the link and the C1 transaction.
-- Idempotency key and provenance columns remain on the row.

BEGIN;

SELECT l.id, l.transaction_id, l.idempotency_key, l.is_deleted, l.created_by, l.notes
FROM finance.owner_transaction_links l
WHERE l.idempotency_key = 'tamir_owner_pmt_yaakov_2026-08-24_10000';

UPDATE finance.owner_transaction_links
   SET is_deleted = true,
       deleted_at = now(),
       deleted_by = 'rollback_B_dry_run'
 WHERE idempotency_key = 'tamir_owner_pmt_yaakov_2026-08-24_10000'
   AND is_deleted = false;

UPDATE public.transactions t
   SET is_deleted = true
 WHERE t.date = DATE '2026-08-24'
   AND t.amount_eur = 10000
   AND t.category = 'Management'
   AND t.subcategory = 'Bank Payment to Owner'
   AND t.property_id IS NULL
   AND t.property_name IS NULL
   AND COALESCE(t.is_deleted, false) = false
   AND t.id IN (
     SELECT l.transaction_id
     FROM finance.owner_transaction_links l
     WHERE l.idempotency_key = 'tamir_owner_pmt_yaakov_2026-08-24_10000'
   );

SELECT 'B dry-run: link + C1 transaction would be soft-deleted; idempotency retained' AS status;

ROLLBACK;
