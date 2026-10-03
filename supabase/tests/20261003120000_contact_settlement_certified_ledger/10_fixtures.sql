-- Fixtures: one property-mapped contact (C1) and one allocation contact (C2).
INSERT INTO public.contacts (id, name) VALUES
 ('00000000-0000-0000-0000-0000000000c1', 'C1 Owner'),
 ('00000000-0000-0000-0000-0000000000c2', 'C2 Client');
INSERT INTO public.contact_properties (contact_id, property_name) VALUES ('00000000-0000-0000-0000-0000000000c1', 'P1');
INSERT INTO public.transactions (id, date, property_name, category, subcategory, payer, payee, amount_eur, is_deleted, review_status) VALUES
 ('00000000-0000-0000-0000-000000000001','2026-05-01','P1','Airbnb','Platform Income','Airbnb','JJ',100,false,'active'),          -- certified
 ('00000000-0000-0000-0000-000000000002','2026-05-02','P1','Management','Tenant Payment','tenant','Anastasia',50,true,'active'), -- soft-deleted
 ('00000000-0000-0000-0000-000000000003','2026-05-03','P1','Airbnb','Electricity bill','Anastasia','company',30,false,'active'), -- actively excluded
 ('00000000-0000-0000-0000-000000000004','2026-05-04','P1','Airbnb','Platform Income','Airbnb','JJ',70,false,'confirmed_duplicate'),
 ('00000000-0000-0000-0000-000000000005','2026-05-05','P1','Airbnb','Bank Payment to Owner','JJ','Owner',20,false,NULL),       -- certified (NULL status)
 ('00000000-0000-0000-0000-000000000006','2026-05-06',NULL,'General','Client Payment','Client','JJ',40,false,'active'),         -- allocation, certified
 ('00000000-0000-0000-0000-000000000007','2026-05-07',NULL,'General','Client Payment','Client','JJ',40,true,'active'),          -- allocation, soft-deleted
 ('00000000-0000-0000-0000-000000000008','2026-05-08','P1','Airbnb','Water bill','Anastasia','company',9,false,'active');        -- inactive exclusion only -> certified
INSERT INTO public.transaction_exclusions (transaction_id, reason, is_active) VALUES
 ('00000000-0000-0000-0000-000000000003','fixture active exclusion',true),
 ('00000000-0000-0000-0000-000000000008','fixture inactive exclusion',false);
INSERT INTO public.settlement_allocation (transaction_id, contact_id, allocated_amount) VALUES
 ('00000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-0000000000c2',40),
 ('00000000-0000-0000-0000-000000000007','00000000-0000-0000-0000-0000000000c2',40);
CREATE TABLE public._snap AS SELECT 'before'::text phase, contact_id, total_rows, net_jj_settlement, net_deal_balance FROM public.v_contact_settlement_summary;
