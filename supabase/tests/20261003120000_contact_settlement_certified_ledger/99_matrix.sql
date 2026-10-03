-- Each row: check | passed
WITH s AS (SELECT * FROM public.v_contact_settlement_summary),
     c1 AS (SELECT * FROM s WHERE contact_id='00000000-0000-0000-0000-0000000000c1'),
     c2 AS (SELECT * FROM s WHERE contact_id='00000000-0000-0000-0000-0000000000c2'),
     b1 AS (SELECT * FROM public._snap WHERE phase='before' AND contact_id='00000000-0000-0000-0000-0000000000c1'),
     b2 AS (SELECT * FROM public._snap WHERE phase='before' AND contact_id='00000000-0000-0000-0000-0000000000c2')
SELECT 'before_c1_counts_deleted_and_excluded' AS check_name, ((SELECT total_rows FROM b1)=5 AND (SELECT net_jj_settlement FROM b1)=-91) AS passed
UNION ALL SELECT 'before_c2_counts_deleted_allocation', ((SELECT total_rows FROM b2)=2 AND (SELECT net_jj_settlement FROM b2)=-80)
UNION ALL SELECT 'after_c1_certified_only', ((SELECT total_rows FROM c1)=3 AND (SELECT net_jj_settlement FROM c1)=-71)
UNION ALL SELECT 'after_c2_certified_only', ((SELECT total_rows FROM c2)=1 AND (SELECT net_jj_settlement FROM c2)=-40)
UNION ALL SELECT 'soft_deleted_row_dropped', NOT EXISTS (SELECT 1 FROM public.v_contact_settlement WHERE transaction_id IN ('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000007'))
UNION ALL SELECT 'active_exclusion_dropped', NOT EXISTS (SELECT 1 FROM public.v_contact_settlement WHERE transaction_id='00000000-0000-0000-0000-000000000003')
UNION ALL SELECT 'inactive_exclusion_kept', EXISTS (SELECT 1 FROM public.v_contact_settlement WHERE transaction_id='00000000-0000-0000-0000-000000000008')
UNION ALL SELECT 'confirmed_duplicate_still_dropped', NOT EXISTS (SELECT 1 FROM public.v_contact_settlement WHERE transaction_id='00000000-0000-0000-0000-000000000004')
UNION ALL SELECT 'null_review_status_kept', EXISTS (SELECT 1 FROM public.v_contact_settlement WHERE transaction_id='00000000-0000-0000-0000-000000000005')
UNION ALL SELECT 'owner_postgres', (SELECT pg_get_userbyid(relowner)='postgres' FROM pg_class WHERE oid='public.v_contact_settlement'::regclass)
UNION ALL SELECT 'acl_unchanged', (SELECT relacl::text='{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres}' FROM pg_class WHERE oid='public.v_contact_settlement'::regclass)
UNION ALL SELECT 'not_security_invoker', (SELECT reloptions IS NULL FROM pg_class WHERE oid='public.v_contact_settlement'::regclass)
UNION ALL SELECT 'summary_definition_unchanged', md5(pg_get_viewdef('public.v_contact_settlement_summary'::regclass,true))='edd2b35127b5299e4f6b66c62abac7b7'
UNION ALL SELECT 'no_data_changed', (SELECT count(*) FROM public.transactions WHERE is_deleted)=2 AND (SELECT count(*) FROM public.transaction_exclusions WHERE is_active)=1
UNION ALL SELECT 'shared_view_present', to_regclass('public.v_canonical_transaction_inclusion') IS NOT NULL
UNION ALL SELECT 'decision_table_not_created', to_regclass('finance.canonical_inclusion_decisions') IS NULL
UNION ALL SELECT 'certified_row_once_in_shared_view', (SELECT count(*) FROM public.v_canonical_transaction_inclusion WHERE id='00000000-0000-0000-0000-000000000001')=1
UNION ALL SELECT 'certified_row_once_in_settlement', (SELECT count(*) FROM public.v_contact_settlement WHERE transaction_id='00000000-0000-0000-0000-000000000001')=1
UNION ALL SELECT 'canonical_not_public', NOT has_table_privilege('anon','public.v_canonical_transaction_inclusion','SELECT')
UNION ALL SELECT 'inclusion_fn_not_public', NOT has_function_privilege('anon','public.canonical_inclusion_decided(uuid)','EXECUTE');
