-- Records the production lockdown already executed in the SQL editor on
-- 2026-09-23 against project vsiiprzjrstjcmjpwcrd. Those statements were not
-- rows in supabase_migrations.schema_migrations when they ran.
--
-- This file is idempotent. A later migration run drops and recreates the
-- same staff read policy and revokes the same client privileges. It does
-- not grant anon or PUBLIC access, does not create a public staff function,
-- and does not force row level security.
--
-- It is not the staging advisor migration. Do not replace this policy with
-- a staging copy: that copy would leave client writes open.

BEGIN;

REVOKE ALL ON FUNCTION finance.is_active_jj_staff() FROM PUBLIC;
REVOKE ALL ON FUNCTION finance.is_active_jj_staff() FROM anon;
GRANT EXECUTE ON FUNCTION finance.is_active_jj_staff() TO authenticated;

DROP POLICY IF EXISTS auth_write_transactions ON public.transactions;
DROP POLICY IF EXISTS auth_read_transactions ON public.transactions;

REVOKE ALL ON TABLE public.transactions FROM PUBLIC;
REVOKE ALL ON TABLE public.transactions FROM anon;
REVOKE ALL ON TABLE public.transactions FROM authenticated;
GRANT SELECT ON TABLE public.transactions TO authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.transactions FROM PUBLIC, anon, authenticated;

CREATE POLICY auth_read_transactions
  ON public.transactions
  FOR SELECT
  TO authenticated
  USING (finance.is_active_jj_staff());

DROP POLICY IF EXISTS auth_insert_audit ON public.audit_logs;
DROP POLICY IF EXISTS auth_read_audit ON public.audit_logs;

REVOKE ALL ON TABLE public.audit_logs FROM PUBLIC;
REVOKE ALL ON TABLE public.audit_logs FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.audit_logs FROM PUBLIC, anon, authenticated;

REVOKE ALL ON TABLE public.jj_staff_config FROM PUBLIC;
REVOKE ALL ON TABLE public.jj_staff_config FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.jj_staff_config FROM PUBLIC, anon, authenticated;

REVOKE ALL ON TABLE
  public.v_anastasia_clearing,
  public.v_cashbox_audit,
  public.v_client_property_ledger,
  public.v_entity_anastasia_reimbursement,
  public.v_entity_net_cash_position,
  public.v_entity_ownership_allocation,
  public.v_entity_resolved,
  public.v_entity_settlement,
  public.v_jj_company_pl,
  public.v_jj_internal_partnership_settlement,
  public.v_jj_property_net_position,
  public.v_ownership_summary,
  public.v_partnership_capital,
  public.v_partnership_expense_markup_allocation,
  public.v_partnership_partner_capital_allocation,
  public.v_property_summary,
  public.v_rpt_client_transactions,
  public.v_unmapped_queue
FROM anon, authenticated;

COMMIT;
