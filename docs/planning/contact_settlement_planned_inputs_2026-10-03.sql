-- READ-ONLY planning report for 20261003120000_contact_settlement_certified_ledger.
-- Run only inside BEGIN READ ONLY ... ROLLBACK (included). Writes nothing.
-- Sign: net_jj_settlement convention of v_contact_settlement_summary
--   (INCREASES +, REDUCES -; positive = owner owes JJ, negative = JJ owes owner).
-- Columns:
--   net_current   = live view today (admits soft-deleted / actively-excluded rows)
--   net_proposed  = same logic over public.v_certified_ledger_transactions (the migration)
--   d_*           = planned inputs, classified with the same rules, NOT counted by the view:
--     pairs 1,2,4 side A (cfb1b60c, 20eaeb18, dc3d60fb)  Yossi 03.10 12:56; DS-016, DS-008, STR recon 15.08
--     pair 5 side A (10622dde; twin 9a5fdde0 excluded)   Yossi 03.10 13:18 by ID
--     group 1 batch 2509d3ad (10 rows)                  restore decision recorded, write NOT approved
--     pair 3 side A (82c8ee31)                           UNKNOWN: shown for information, never summed
-- The classification CTEs restate the view's CASE logic compactly. On 2026-10-03 the
-- 'cur' scenario reproduced public.v_contact_settlement_summary exactly for all 16 contacts.
BEGIN READ ONLY;
WITH ids AS (SELECT * FROM (VALUES
 ('p1245','cfb1b60c-90f9-47c1-930f-6c7737ccf448'::uuid),('p1245','20eaeb18-a457-4740-acb2-0fe446a01460'),('p1245','dc3d60fb-f3a3-4ca6-9fc4-46ef40e4bdb3'),
 ('p1245','10622dde-dd02-464f-a6e1-d98cb25cde83'),
 ('p3_unknown','82c8ee31-3667-4c7e-893f-c0d7a6acb70b'),
 ('g1','7acdcebd-7d83-44b5-8080-d048d8fdb104'),('g1','07859b5d-5d04-4a1b-ba87-c5f51374546d'),('g1','ba646d2d-9122-4909-ae02-8a67739a0172'),('g1','98a46392-8d8b-435d-b81b-2689bebf2f94'),('g1','886b710b-63c1-4d99-af52-1809766ec0d4'),('g1','2976a45a-7b7c-460f-860f-c800b629ec45'),('g1','11c038f8-b9c7-4962-ae14-15dc694e6283'),('g1','3c54f570-4991-4a21-8e4e-f0c946c914c0'),('g1','490f499a-343d-4100-aaad-69fd6d707b08'),('g1','b18d427d-cc6d-4bba-a7d7-f94aee3eeacd')) v(scen,id)),
src AS (
 SELECT 'cur'::text scen,t.id,t.date,t.property_name,t.category,t.subcategory,t.payer,t.payee,t.amount_eur,t.client_charge FROM transactions t WHERE t.review_status='active' OR t.review_status IS NULL
 UNION ALL SELECT 'prop',t.id,t.date,t.property_name,t.category,t.subcategory,t.payer,t.payee,t.amount_eur,t.client_charge FROM v_certified_ledger_transactions t
 UNION ALL SELECT i.scen,t.id,t.date,t.property_name,t.category,t.subcategory,t.payer,t.payee,t.amount_eur,t.client_charge FROM transactions t JOIN ids i ON i.id=t.id),
k AS (SELECT t.*,
 (t.subcategory IN ('Purchase Contract','Sale Contract','Renovation Contract')) x_contract,
 (t.category='Transfer') x_tr,
 (t.subcategory IN ('Cleaning','Management Fee') AND t.category='Airbnb') x_air,
 (t.category='Purchase' AND t.subcategory<>'Purchase Contract' AND COALESCE(t.payer,'') NOT IN ('Client','Owner')) x_pc,
 (t.payer IN ('Client','Owner') AND t.payee IN ('Yossi','Jacob','JJ')) x_cp,
 (t.payer='Tenant' AND t.payee IN ('Yossi','Jacob','JJ','Anastasia')) x_ten,
 (t.payer='Airbnb' AND t.payee IN ('Yossi','Jacob','JJ','Anastasia')) x_abb,
 (t.payer IN ('Yossi','Jacob','JJ','Anastasia') AND t.payee NOT IN ('Yossi','Jacob','JJ','Anastasia') AND t.property_name IS NOT NULL) x_op
 FROM src t),
cl AS (SELECT k.*,
 CASE WHEN x_contract OR x_tr OR x_air THEN 'NO_EFFECT' WHEN subcategory='Third-Party Payment' THEN 'DEAL_ONLY' WHEN subcategory='Bank Payment to Owner' THEN 'INCREASES'
  WHEN subcategory IN ('Platform Income','Rent','Tenant Payment','Staff Accommodation Rent') THEN 'REDUCES' WHEN subcategory='Management Fee' AND category<>'Airbnb' THEN 'INCREASES'
  WHEN subcategory IN ('Client Sale Expenses','Sale Tax') THEN 'INCREASES' WHEN x_pc THEN 'INCREASES' WHEN x_cp OR x_ten OR x_abb THEN 'REDUCES' WHEN x_op THEN 'INCREASES' ELSE 'NO_EFFECT' END eff,
 CASE WHEN x_pc THEN COALESCE(client_charge,amount_eur) WHEN subcategory IN ('Client Sale Expenses','Sale Tax') THEN COALESCE(client_charge,amount_eur)
  WHEN subcategory='Management Fee' AND category<>'Airbnb' THEN COALESCE(client_charge,amount_eur)
  WHEN x_op AND NOT x_contract AND category<>'Transfer' AND NOT x_air AND subcategory NOT IN ('Third-Party Payment','Bank Payment to Owner','Platform Income','Rent','Tenant Payment','Staff Accommodation Rent','Client Sale Expenses','Sale Tax') AND NOT x_pc THEN COALESCE(client_charge,amount_eur)
  ELSE amount_eur END amt
 FROM k),
v AS (
 SELECT cl.scen,c.id cid,c.name cname,cl.id tid,cl.eff,cl.amt FROM cl JOIN contact_properties cp ON cp.property_name=cl.property_name AND cp.is_deleted=false JOIN contacts c ON c.id=cp.contact_id WHERE cl.eff<>'NO_EFFECT' AND cl.property_name IS NOT NULL
 UNION ALL
 SELECT k.scen,sa.contact_id,c.name,k.id,CASE WHEN x_cp OR x_ten OR x_abb THEN 'REDUCES' ELSE 'NO_EFFECT' END,sa.allocated_amount FROM settlement_allocation sa JOIN k ON k.id=sa.transaction_id JOIN contacts c ON c.id=sa.contact_id WHERE sa.voided_at IS NULL AND k.property_name IS NULL),
agg AS (SELECT cid,cname,scen,count(*) n,round(sum(CASE eff WHEN 'INCREASES' THEN amt WHEN 'REDUCES' THEN -amt ELSE 0 END),2) net FROM v GROUP BY 1,2,3),
p AS (SELECT cid,cname,
 max(n) FILTER (WHERE scen='cur') rows_current, max(net) FILTER (WHERE scen='cur') net_current,
 max(n) FILTER (WHERE scen='prop') rows_proposed, max(net) FILTER (WHERE scen='prop') net_proposed,
 COALESCE(max(net) FILTER (WHERE scen='p1245'),0) d_pairs_1_2_4_5_side_a,
 COALESCE(max(net) FILTER (WHERE scen='g1'),0) d_group1_batch_2509d3ad,
 COALESCE(max(net) FILTER (WHERE scen='p3_unknown'),0) d_pair_3_unknown_not_counted
 FROM agg GROUP BY 1,2)
SELECT cname contact, rows_current, net_current, rows_proposed, net_proposed,
 d_pairs_1_2_4_5_side_a, d_group1_batch_2509d3ad, d_pair_3_unknown_not_counted,
 net_proposed + d_pairs_1_2_4_5_side_a + d_group1_batch_2509d3ad AS net_proposed_plus_planned
FROM p
WHERE net_current IS DISTINCT FROM net_proposed OR rows_current IS DISTINCT FROM rows_proposed
 OR d_pairs_1_2_4_5_side_a<>0 OR d_group1_batch_2509d3ad<>0 OR d_pair_3_unknown_not_counted<>0
ORDER BY cname;
ROLLBACK;
