-- Throwaway proof of the shared inclusion mechanism.
-- The decision table is created only inside this transaction, then rolled back.
-- The migration does not create it and does not name these ids.
-- Pair 1 stand-in: side A is included once by a decision row; side B stays out.
-- Pair 5 stand-in: canonical id, no decision row, so it is not counted.
-- Documented-inclusion stand-in is counted once across two consumers
-- while is_deleted and the active exclusion stay set.
BEGIN;

INSERT INTO public.transactions (id, date, property_name, category, subcategory, payer, payee, amount_eur, is_deleted, review_status) VALUES
 ('00000000-0000-0000-0000-0000000000a1','2026-05-30','P1','Airbnb','Platform Income','Airbnb','JJ',10,true,'active'),
 ('00000000-0000-0000-0000-0000000000a2','2026-05-30','P1','Airbnb','Platform Income','Airbnb','JJ',10,false,'confirmed_duplicate'),
 ('00000000-0000-0000-0000-0000000000b5','2026-05-30','P1','Airbnb','Platform Income','Airbnb','JJ',12,true,'active'),
 ('00000000-0000-0000-0000-0000000000d1','2026-06-16','P1','Management','Tenant Payment','tenant','Anastasia',18,true,'active');
INSERT INTO public.transaction_exclusions (transaction_id, reason, is_active) VALUES
 ('00000000-0000-0000-0000-0000000000a1','pair 1 side A stand-in',true),
 ('00000000-0000-0000-0000-0000000000b5','pair 5 canonical held stand-in',true),
 ('00000000-0000-0000-0000-0000000000d1','documented inclusion stand-in',true);

CREATE SCHEMA IF NOT EXISTS finance;
CREATE TABLE finance.canonical_inclusion_decisions (
  id uuid PRIMARY KEY,
  transaction_id uuid NOT NULL,
  decision text NOT NULL,
  reason text NOT NULL,
  evidence_ref text NOT NULL,
  decided_by text NOT NULL,
  decided_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz
);
INSERT INTO finance.canonical_inclusion_decisions
  (id, transaction_id, decision, reason, evidence_ref, decided_by)
VALUES
  ('00000000-0000-0000-0000-0000000000e1',
   '00000000-0000-0000-0000-0000000000d1',
   'include',
   'synthetic documented inclusion',
   'test-documented-inclusion',
   'test'),
  ('00000000-0000-0000-0000-0000000000e3',
   '00000000-0000-0000-0000-0000000000a1',
   'include',
   'pair 1 side A stand-in',
   'test-pair1-side-a',
   'test'),
  ('00000000-0000-0000-0000-0000000000e2',
   '00000000-0000-0000-0000-000000000001',
   'include',
   'already certified; must still be one row',
   'test-already-certified',
   'test');

CREATE VIEW public.v_canonical_second_consumer AS
SELECT id AS transaction_id
FROM public.v_canonical_transaction_inclusion;

WITH consumers AS (
  SELECT transaction_id, 'settlement'::text AS consumer
  FROM public.v_contact_settlement
  WHERE transaction_id IN (
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-0000000000d1',
    '00000000-0000-0000-0000-0000000000a1',
    '00000000-0000-0000-0000-0000000000a2',
    '00000000-0000-0000-0000-0000000000b5'
  )
  UNION ALL
  SELECT transaction_id, 'second'::text
  FROM public.v_canonical_second_consumer
  WHERE transaction_id IN (
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-0000000000d1',
    '00000000-0000-0000-0000-0000000000a1',
    '00000000-0000-0000-0000-0000000000a2',
    '00000000-0000-0000-0000-0000000000b5'
  )
)
SELECT 'counted_once_across_two_consumers' AS check_name,
       (SELECT count(*) FROM consumers WHERE transaction_id='00000000-0000-0000-0000-000000000001')=2
       AND (SELECT count(DISTINCT transaction_id) FROM consumers WHERE transaction_id='00000000-0000-0000-0000-000000000001')=1
       AND (SELECT count(*) FROM public.v_canonical_transaction_inclusion WHERE id='00000000-0000-0000-0000-000000000001')=1
       AS passed
UNION ALL SELECT 'documented_inclusion_once_across_two_consumers',
       (SELECT count(*) FROM consumers WHERE transaction_id='00000000-0000-0000-0000-0000000000d1')=2
       AND (SELECT count(DISTINCT transaction_id) FROM consumers WHERE transaction_id='00000000-0000-0000-0000-0000000000d1')=1
       AND (SELECT count(*) FROM public.v_canonical_transaction_inclusion WHERE id='00000000-0000-0000-0000-0000000000d1')=1
UNION ALL SELECT 'pair1_side_a_included_once',
       (SELECT count(*) FROM consumers WHERE transaction_id='00000000-0000-0000-0000-0000000000a1')=2
       AND (SELECT count(*) FROM public.v_canonical_transaction_inclusion WHERE id='00000000-0000-0000-0000-0000000000a1')=1
UNION ALL SELECT 'pair1_side_b_excluded',
       NOT EXISTS (SELECT 1 FROM consumers WHERE transaction_id='00000000-0000-0000-0000-0000000000a2')
UNION ALL SELECT 'pair5_canonical_held_not_counted',
       NOT EXISTS (SELECT 1 FROM consumers WHERE transaction_id='00000000-0000-0000-0000-0000000000b5')
       AND NOT EXISTS (
         SELECT 1 FROM finance.canonical_inclusion_decisions
         WHERE transaction_id='00000000-0000-0000-0000-0000000000b5'
       )
UNION ALL SELECT 'no_flag_mutation',
       (SELECT is_deleted AND review_status='active' FROM public.transactions WHERE id='00000000-0000-0000-0000-0000000000d1')
       AND EXISTS (SELECT 1 FROM public.transaction_exclusions WHERE transaction_id='00000000-0000-0000-0000-0000000000d1' AND is_active)
       AND NOT (SELECT is_deleted FROM public.transactions WHERE id='00000000-0000-0000-0000-000000000001')
       AND (SELECT is_deleted AND review_status='active' FROM public.transactions WHERE id='00000000-0000-0000-0000-0000000000a1')
       AND EXISTS (SELECT 1 FROM public.transaction_exclusions WHERE transaction_id='00000000-0000-0000-0000-0000000000a1' AND is_active)
       AND (SELECT review_status='confirmed_duplicate' AND NOT is_deleted FROM public.transactions WHERE id='00000000-0000-0000-0000-0000000000a2')
       AND (SELECT is_deleted AND review_status='active' FROM public.transactions WHERE id='00000000-0000-0000-0000-0000000000b5');

ROLLBACK;
