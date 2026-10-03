-- DRAFT. Do not apply, merge, or deploy until this file is approved on its own.
-- Timestamp 20261003150400 does not collide with any migration already in supabase/migrations.
--
-- Live catalog (03.10.2026): anon has ALL (arwdDxtm) on 44 public tables, all with RLS.
-- anon also has INSERT on seven views. Default privileges for postgres and
-- supabase_admin in schema public grant tables arwdDxtm to anon, authenticated, and
-- service_role; functions EXECUTE to those three; sequences rwU to anon and authenticated.
--
-- This draft revokes anon DML and maintenance privileges on the 44 tables and keeps
-- anon SELECT on those existing tables. It revokes anon INSERT/UPDATE/DELETE on the
-- seven views and does not revoke anon SELECT on the views. It revokes TRUNCATE,
-- REFERENCES, and TRIGGER from authenticated on the 44 tables and leaves
-- authenticated SELECT/INSERT/UPDATE/DELETE in place (RLS still applies).
-- service_role grants are not modified.
--
-- PostgreSQL 17 GRANT ALL includes MAINTAIN. This draft revokes MAINTAIN from anon
-- on the same 44 tables. After that revoke, anon must have no INSERT, UPDATE,
-- DELETE, TRUNCATE, MAINTAIN, REFERENCES, or TRIGGER on any ordinary public table.
-- The closing check raises BLOCKED_BY_ANON_GRANT and rolls the transaction back
-- if any public table still has one of those privileges. It does not revoke
-- privileges from tables outside the attested 44; an unexpected table stops the
-- draft instead of being stripped silently.
-- The rollback re-grants MAINTAIN together with the other restored anon privileges
-- on the 44 tables only.
--
-- anon SELECT is kept on the existing 44 tables. Grep of src/, scripts/, and
-- supabase/functions:
--   * Public routes (/login, /auth/callback, /auth/reset, /share/avi-external-partner)
--     do not query these tables.
--   * The browser singleton in src/lib/supabase.ts is createClient(url, anon key).
--     Cookie login uses createSupabaseBrowserClient, so this singleton runs as anon
--     unless a legacy localStorage session exists. It is used for SELECT (and some
--     writes) of contacts, contact_properties, contact_opening_balances, and
--     partnership_capital by src/app/contacts/page.tsx, src/app/client-report/page.tsx,
--     and src/lib/entity-registry.ts. Current policies already require
--     auth.role() = 'authenticated', so the anon role does not receive those rows
--     today. Revoking SELECT would still be a second break if a policy or a
--     security-invoker view later expects the grant.
--   * src/lib/ownership/ownershipService.ts falls back to the anon key when
--     SUPABASE_SERVICE_ROLE_KEY is unset and reads entity_registry and
--     partnership_ownership.
--   * Server pages that read v_ceo_summary use the service key, not the anon role.
-- Future tables do not get anon grants. That is deliberate: "stop granting anon
-- tables" clears the default, while existing SELECT is preserved.
--
-- supabase_admin default privileges can be changed only by a member of that role.
-- The DO block applies them when membership is present. Otherwise it raises a
-- notice and the owner runs the statements below as supabase_admin.
--
--   ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
--     REVOKE ALL ON TABLES FROM anon;
--   ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
--     REVOKE EXECUTE ON FUNCTIONS FROM anon;
--   ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
--     REVOKE ALL ON SEQUENCES FROM anon;

BEGIN;

DO $grants$
DECLARE
  tables text[] := ARRAY[
    'accounting_rules',
    'airbnb_reservations',
    'alerts',
    'business_cases',
    'business_event_sources',
    'business_events',
    'case_audit_log',
    'case_completeness_gaps',
    'case_entities',
    'case_relationships',
    'case_workflow_state',
    'category_subcategories',
    'contact_opening_balance_history',
    'contact_opening_balances',
    'contact_properties',
    'contacts',
    'custody_positions',
    'data_quality_backup_20260610',
    'entities',
    'entity_aliases',
    'entity_registry',
    'freeze_v1_ceo_kpis',
    'freeze_v1_ceo_summary',
    'freeze_v1_settlement',
    'ownership',
    'partnership_capital',
    'partnership_ownership',
    'payer_aliases',
    'pending_queue',
    'property_definitions',
    'property_name_aliases',
    'property_owners',
    'property_ownership',
    'property_reporting_map',
    'renovation_projects',
    'settlement_temporal_transitions',
    'tamir_redisson_backup_20260610',
    'transaction_business_metadata',
    'transaction_corrections',
    'transaction_exclusions',
    'transactions_backup_20260609',
    'transactions_deletion_backup',
    'user_profiles',
    'user_roles'
  ];
  views text[] := ARRAY[
    'v_airbnb_summary',
    'v_ceo_kpis',
    'v_ceo_summary',
    'v_owner_balances',
    'v_possible_duplicates',
    'v_rpt_contact_properties',
    'v_transaction_issues'
  ];
  table_list text;
  view_list text;
BEGIN
  IF array_length(tables, 1) <> 44 OR array_length(views, 1) <> 7 THEN
    RAISE EXCEPTION 'BLOCKED_BY_LIST_DRIFT: expected 44 tables and 7 views';
  END IF;

  SELECT string_agg(format('public.%I', name), ', ' ORDER BY name)
    INTO table_list
  FROM unnest(tables) AS name;

  SELECT string_agg(format('public.%I', name), ', ' ORDER BY name)
    INTO view_list
  FROM unnest(views) AS name;

  EXECUTE format(
    'REVOKE INSERT, UPDATE, DELETE, TRUNCATE, MAINTAIN, REFERENCES, TRIGGER ON TABLE %s FROM anon',
    table_list
  );
  EXECUTE format(
    'REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE %s FROM authenticated',
    table_list
  );
  EXECUTE format(
    'REVOKE INSERT, UPDATE, DELETE ON TABLE %s FROM anon',
    view_list
  );
END
$grants$;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon;

DO $supabase_admin_defaults$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin') THEN
    RAISE NOTICE 'supabase_admin role is absent; default privileges for that role were not changed';
    RETURN;
  END IF;
  IF NOT pg_has_role(current_user, 'supabase_admin', 'MEMBER') THEN
    RAISE NOTICE 'current_user is not a member of supabase_admin; run the supabase_admin default-privilege statements as that role';
    RETURN;
  END IF;
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON TABLES FROM anon';
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon';
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon';
END
$supabase_admin_defaults$;

DO $assert_anon$
DECLARE
  leftovers text;
BEGIN
  SELECT string_agg(
           format('%I.%I:%s', namespace.nspname, relation.relname, privilege),
           ', ' ORDER BY relation.relname, privilege
         )
    INTO leftovers
  FROM pg_catalog.pg_class AS relation
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  CROSS JOIN unnest(ARRAY[
    'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'MAINTAIN', 'REFERENCES', 'TRIGGER'
  ]) AS privilege
  WHERE namespace.nspname = 'public'
    AND relation.relkind IN ('r', 'p')
    AND has_table_privilege('anon', relation.oid, privilege);

  IF leftovers IS NOT NULL THEN
    RAISE EXCEPTION 'BLOCKED_BY_ANON_GRANT: anon still has %', leftovers;
  END IF;
END
$assert_anon$;

COMMIT;

-- ROLLBACK-BEGIN
-- BEGIN;
-- DO $restore$
-- DECLARE
--   tables text[] := ARRAY[
--     'accounting_rules',
--     'airbnb_reservations',
--     'alerts',
--     'business_cases',
--     'business_event_sources',
--     'business_events',
--     'case_audit_log',
--     'case_completeness_gaps',
--     'case_entities',
--     'case_relationships',
--     'case_workflow_state',
--     'category_subcategories',
--     'contact_opening_balance_history',
--     'contact_opening_balances',
--     'contact_properties',
--     'contacts',
--     'custody_positions',
--     'data_quality_backup_20260610',
--     'entities',
--     'entity_aliases',
--     'entity_registry',
--     'freeze_v1_ceo_kpis',
--     'freeze_v1_ceo_summary',
--     'freeze_v1_settlement',
--     'ownership',
--     'partnership_capital',
--     'partnership_ownership',
--     'payer_aliases',
--     'pending_queue',
--     'property_definitions',
--     'property_name_aliases',
--     'property_owners',
--     'property_ownership',
--     'property_reporting_map',
--     'renovation_projects',
--     'settlement_temporal_transitions',
--     'tamir_redisson_backup_20260610',
--     'transaction_business_metadata',
--     'transaction_corrections',
--     'transaction_exclusions',
--     'transactions_backup_20260609',
--     'transactions_deletion_backup',
--     'user_profiles',
--     'user_roles'
--   ];
--   views text[] := ARRAY[
--     'v_airbnb_summary',
--     'v_ceo_kpis',
--     'v_ceo_summary',
--     'v_owner_balances',
--     'v_possible_duplicates',
--     'v_rpt_contact_properties',
--     'v_transaction_issues'
--   ];
--   table_list text;
--   view_list text;
-- BEGIN
--   SELECT string_agg(format('public.%I', name), ', ' ORDER BY name) INTO table_list FROM unnest(tables) AS name;
--   SELECT string_agg(format('public.%I', name), ', ' ORDER BY name) INTO view_list FROM unnest(views) AS name;
--   EXECUTE format(
--     'GRANT INSERT, UPDATE, DELETE, TRUNCATE, MAINTAIN, REFERENCES, TRIGGER ON TABLE %s TO anon',
--     table_list
--   );
--   EXECUTE format(
--     'GRANT TRUNCATE, REFERENCES, TRIGGER ON TABLE %s TO authenticated',
--     table_list
--   );
--   EXECUTE format('GRANT INSERT ON TABLE %s TO anon', view_list);
-- END
-- $restore$;
-- ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
-- ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon;
-- ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO anon;
-- DO $supabase_admin_restore$
-- BEGIN
--   IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin')
--      AND pg_has_role(current_user, 'supabase_admin', 'MEMBER') THEN
--     EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon';
--     EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon';
--     EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO anon';
--   END IF;
-- END
-- $supabase_admin_restore$;
-- COMMIT;
-- ROLLBACK-END
