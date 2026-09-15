-- Rollback index — finance.owner_transaction_links
-- DRY-RUN ONLY. Do not execute against Production.
--
-- A. Before use (no links / no dependents): docs/rollbacks/20260914_owner_links_rollback_A_before_use.sql
-- B. After C1 insert:                       docs/rollbacks/20260914_owner_links_rollback_B_after_c1.sql
-- C. C3 Hostaway rows:                      docs/rollbacks/20260914_owner_links_rollback_C_c3.sql
--
-- Never DROP TABLE and never physically DELETE after C1/C3 rows exist.

SELECT 'DRY_RUN_INDEX_ONLY — choose A, B, or C. Do not execute this file.' AS status;
