-- Rollback A — before any owner-level links or dependents exist.
-- DRY-RUN ONLY. Do not execute against Production.
-- DROP TABLE is allowed only when the table is empty and unused.

BEGIN;

DO $$
DECLARE
  n bigint;
BEGIN
  IF to_regclass('finance.owner_transaction_links') IS NULL THEN
    RAISE NOTICE 'A: table does not exist — nothing to drop';
    RETURN;
  END IF;

  SELECT count(*) INTO n FROM finance.owner_transaction_links;
  IF n > 0 THEN
    RAISE EXCEPTION 'A blocked: % link row(s) exist. Use rollback B (soft-delete), not DROP TABLE', n;
  END IF;
END $$;

DROP FUNCTION IF EXISTS finance.get_owner_level_payments(UUID);
DROP FUNCTION IF EXISTS finance.soft_delete_owner_transaction_link(UUID, TEXT);
DROP FUNCTION IF EXISTS finance.link_owner_level_payment(UUID, UUID, TEXT, TEXT, TEXT);

DROP VIEW IF EXISTS finance.v_owner_level_payment_conflicts;
DROP VIEW IF EXISTS finance.v_owner_level_payments;

DROP TRIGGER IF EXISTS trg_owner_tx_links_conflict_review ON finance.owner_transaction_links;
DROP TRIGGER IF EXISTS trg_owner_tx_links_guard ON finance.owner_transaction_links;

DROP FUNCTION IF EXISTS finance.trg_owner_tx_links_conflict_review();
DROP FUNCTION IF EXISTS finance.trg_owner_tx_links_guard();

DROP TABLE IF EXISTS finance.owner_transaction_links;

ROLLBACK;
-- Replace ROLLBACK with COMMIT only after Yossi authorizes a pre-use drop.
