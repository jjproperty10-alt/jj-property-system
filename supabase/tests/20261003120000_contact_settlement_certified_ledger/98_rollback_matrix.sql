SELECT 'rollback_restores_live_md5' AS check_name, md5(pg_get_viewdef('public.v_contact_settlement'::regclass,true))='84b5a9448d4b8547b361602406bcf7e6' AS passed
UNION ALL SELECT 'rollback_restores_before_totals', NOT EXISTS (
  (SELECT contact_id,total_rows,net_jj_settlement,net_deal_balance FROM public._snap WHERE phase='before')
  EXCEPT (SELECT contact_id,total_rows,net_jj_settlement,net_deal_balance FROM public.v_contact_settlement_summary))
UNION ALL SELECT 'rollback_acl_unchanged', (SELECT relacl::text='{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres}' FROM pg_class WHERE oid='public.v_contact_settlement'::regclass);
