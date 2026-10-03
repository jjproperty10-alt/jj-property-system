DO $after$
DECLARE
  name text;
  tables text[] := ARRAY[
    'accounting_rules', 'airbnb_reservations', 'alerts', 'business_cases',
    'business_event_sources', 'business_events', 'case_audit_log',
    'case_completeness_gaps', 'case_entities', 'case_relationships',
    'case_workflow_state', 'category_subcategories', 'contact_opening_balance_history',
    'contact_opening_balances', 'contact_properties', 'contacts', 'custody_positions',
    'data_quality_backup_20260610', 'entities', 'entity_aliases', 'entity_registry',
    'freeze_v1_ceo_kpis', 'freeze_v1_ceo_summary', 'freeze_v1_settlement', 'ownership',
    'partnership_capital', 'partnership_ownership', 'payer_aliases', 'pending_queue',
    'property_definitions', 'property_name_aliases', 'property_owners',
    'property_ownership', 'property_reporting_map', 'renovation_projects',
    'settlement_temporal_transitions', 'tamir_redisson_backup_20260610',
    'transaction_business_metadata', 'transaction_corrections', 'transaction_exclusions',
    'transactions_backup_20260609', 'transactions_deletion_backup', 'user_profiles',
    'user_roles'
  ];
  views text[] := ARRAY[
    'v_airbnb_summary', 'v_ceo_kpis', 'v_ceo_summary', 'v_owner_balances',
    'v_possible_duplicates', 'v_rpt_contact_properties', 'v_transaction_issues'
  ];
  privilege text;
BEGIN
  IF array_length(tables, 1) <> 44 OR array_length(views, 1) <> 7 THEN
    RAISE EXCEPTION 'after grant list drifted';
  END IF;
  FOREACH name IN ARRAY tables LOOP
    IF NOT has_table_privilege('anon', format('public.%I', name), 'SELECT') THEN
      RAISE EXCEPTION 'anon lost SELECT on %', name;
    END IF;
    FOREACH privilege IN ARRAY ARRAY['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'MAINTAIN', 'REFERENCES', 'TRIGGER'] LOOP
      IF has_table_privilege('anon', format('public.%I', name), privilege) THEN
        RAISE EXCEPTION 'anon still has % on %', privilege, name;
      END IF;
    END LOOP;
    FOREACH privilege IN ARRAY ARRAY['TRUNCATE', 'REFERENCES', 'TRIGGER'] LOOP
      IF has_table_privilege('authenticated', format('public.%I', name), privilege) THEN
        RAISE EXCEPTION 'authenticated still has % on %', privilege, name;
      END IF;
    END LOOP;
    FOREACH privilege IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'] LOOP
      IF NOT has_table_privilege('service_role', format('public.%I', name), privilege) THEN
        RAISE EXCEPTION 'service_role lost % on %', privilege, name;
      END IF;
    END LOOP;
  END LOOP;
  FOREACH name IN ARRAY views LOOP
    IF has_table_privilege('anon', format('public.%I', name), 'INSERT')
       OR has_table_privilege('anon', format('public.%I', name), 'UPDATE')
       OR has_table_privilege('anon', format('public.%I', name), 'DELETE')
    THEN
      RAISE EXCEPTION 'anon still writes view %', name;
    END IF;
    IF NOT has_table_privilege('anon', format('public.%I', name), 'SELECT') THEN
      RAISE EXCEPTION 'anon lost SELECT on view %', name;
    END IF;
    IF NOT has_table_privilege('service_role', format('public.%I', name), 'SELECT')
       OR NOT has_table_privilege('service_role', format('public.%I', name), 'INSERT')
    THEN
      RAISE EXCEPTION 'service_role lost view access on %', name;
    END IF;
  END LOOP;
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    CROSS JOIN unnest(ARRAY[
      'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'MAINTAIN', 'REFERENCES', 'TRIGGER'
    ]) AS anon_privilege(privilege_name)
    WHERE namespace.nspname = 'public'
      AND relation.relkind IN ('r', 'p')
      AND has_table_privilege('anon', relation.oid, anon_privilege.privilege_name)
  ) THEN
    RAISE EXCEPTION 'anon still has a write or maintenance privilege on a public table';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_default_acl AS def
    JOIN pg_roles AS owner ON owner.oid = def.defaclrole
    LEFT JOIN pg_namespace AS nsp ON nsp.oid = def.defaclnamespace
    JOIN LATERAL aclexplode(def.defaclacl) AS priv ON true
    LEFT JOIN pg_roles AS grantee ON grantee.oid = priv.grantee
    WHERE owner.rolname IN ('postgres', 'supabase_admin')
      AND nsp.nspname = 'public'
      AND grantee.rolname = 'anon'
  ) THEN
    RAISE EXCEPTION 'anon remains in postgres or supabase_admin default privileges';
  END IF;
END
$after$;

BEGIN;
CALL test.assume(NULL, 'anon');
CALL test.expect_sqlstate(
  $$INSERT INTO public.contacts (name) VALUES ('anon')$$,
  '42501',
  'after: anon cannot INSERT contacts'
);
CALL test.expect_sqlstate(
  $$UPDATE public.user_roles SET notes = 'anon'$$,
  '42501',
  'after: anon cannot UPDATE user_roles'
);
CALL test.expect_sqlstate(
  $$DELETE FROM public.partnership_capital$$,
  '42501',
  'after: anon cannot DELETE partnership_capital'
);
CALL test.expect_sqlstate(
  $$TRUNCATE public.alerts$$,
  '42501',
  'after: anon cannot TRUNCATE alerts'
);
CALL test.expect_sqlstate(
  $$INSERT INTO public.v_ceo_summary (id) VALUES (1)$$,
  '42501',
  'after: anon cannot INSERT a listed view'
);
CALL test.assume(NULL, 'service_role');
INSERT INTO public.alerts (id) VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
DELETE FROM public.alerts WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
CALL test.expect_eq(
  $$SELECT count(*)::text FROM public.contacts$$,
  '1',
  'after: service_role still reads a protected table'
);
CALL test.release();
CREATE TABLE public.draft_default_probe (id integer);
DO $probe$
BEGIN
  IF has_table_privilege('anon', 'public.draft_default_probe', 'SELECT')
     OR has_table_privilege('anon', 'public.draft_default_probe', 'INSERT')
     OR has_table_privilege('anon', 'public.draft_default_probe', 'MAINTAIN')
  THEN
    RAISE EXCEPTION 'new table still received anon privileges from defaults';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.draft_default_probe', 'SELECT')
     OR NOT has_table_privilege('service_role', 'public.draft_default_probe', 'INSERT')
  THEN
    RAISE EXCEPTION 'new table lost authenticated or service_role default privileges';
  END IF;
END
$probe$;
ROLLBACK;
