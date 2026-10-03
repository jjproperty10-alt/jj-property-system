-- Second local shape: case_audit_log has no actor-like uuid column.
DROP TABLE public.case_audit_log;
CREATE TABLE public.case_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text
);
ALTER TABLE public.case_audit_log ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.case_audit_log TO anon, authenticated, service_role;
CREATE POLICY audit_log_insert
  ON public.case_audit_log
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (true);
CREATE POLICY audit_log_select
  ON public.case_audit_log
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (true);
