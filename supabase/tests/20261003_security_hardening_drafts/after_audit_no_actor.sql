DO $check$
DECLARE
  expr text;
BEGIN
  SELECT with_check INTO expr
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'case_audit_log'
    AND policyname = 'staff_insert_case_audit_log';
  IF expr IS NULL
     OR position('is_active_jj_staff' in expr) = 0
     OR position('auth.uid' in expr) > 0
  THEN
    RAISE EXCEPTION 'no-actor audit policy was %', expr;
  END IF;
END
$check$;
