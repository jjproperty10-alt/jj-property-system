-- ============================================================
-- SECURITY LOCKDOWN -- JJ Property 10
-- Migration: 20260709_003_security_rls_lockdown.sql
-- Date: 2026-07-09
-- Author: Claude (Security Patch -- separate PR from PR#4)
-- ============================================================
--
-- PURPOSE: Eliminate all unauthenticated data exposure.
--   B1 -- Drop anon SELECT on transactions (2,127 rows leaked via anon key)
--   B2 -- Drop anon SELECT on contact_opening_balances, rental_contracts
--   B3 -- Enable RLS on 14 tables where rowsecurity = false
--
-- PRE-MIGRATION STATE (verified 2026-07-09):
--   * 10 anon/public SELECT policies expose sensitive data without auth
--   * 14 tables have RLS completely disabled (rowsecurity = false)
--   * Any person with the NEXT_PUBLIC anon key can read all transactions directly
--
-- SAFE TO RUN:
--   * Service role (Supabase admin / server API routes) bypasses RLS -- unaffected.
--   * Authenticated app users retain full access via existing auth_* policies.
--   * Anon / public role loses all SELECT access to sensitive tables.
--
-- AUTHENTICATED COVERAGE CONFIRMED (pre-run query on 2026-07-09):
--   transactions           -> auth_read_transactions (SELECT) + auth_write_transactions (ALL)
--   contact_opening_bal.   -> auth_write_opening_balances (ALL covers SELECT)
--   rental_contracts       -> auth_all_contracts (ALL covers SELECT)
--   contact_properties     -> auth_all_contact_properties (ALL covers SELECT)
--   contacts               -> auth_all_contacts (ALL covers SELECT)
--   employee_config        -> auth_all_employees (ALL covers SELECT)
--   properties             -> auth_all_properties (ALL covers SELECT)
--   property_name_aliases  -> auth_all_property_name_aliases (ALL covers SELECT)
--   property_definitions   -> auth_all_property_definitions (ALL covers SELECT)
--   property_owners        -> auth_all_property_owners (ALL covers SELECT)
--   property_reporting_map -> NO policy -> adding auth_read below
--
-- DO NOT MERGE on rc3/report-engine branch.
-- Apply via: Supabase Dashboard -> SQL Editor
-- ============================================================

BEGIN;

-- ============================================================
-- SECTION 1: DROP ALL ANON / PUBLIC READ POLICIES
-- ============================================================
-- Each DROP is idempotent (IF EXISTS). Safe to re-run.

-- B1 -- CRITICAL: transactions (2,127 rows fully exposed via anon key)
DROP POLICY IF EXISTS anon_read_transactions       ON transactions;

-- B2 -- contact_opening_balances + rental_contracts
DROP POLICY IF EXISTS anon_read_opening_balances   ON contact_opening_balances;
DROP POLICY IF EXISTS anon_read_contracts          ON rental_contracts;

-- Defense-in-depth: all remaining anon/public SELECT policies
DROP POLICY IF EXISTS anon_read_contact_properties    ON contact_properties;
DROP POLICY IF EXISTS anon_read_contacts              ON contacts;
DROP POLICY IF EXISTS anon_read_employee_config       ON employee_config;
DROP POLICY IF EXISTS dop_pilot_anon_read             ON properties;
DROP POLICY IF EXISTS anon_read_property_name_aliases ON property_name_aliases;
DROP POLICY IF EXISTS anon_read_property_definitions  ON property_definitions;
DROP POLICY IF EXISTS anon_read_property_owners       ON property_owners;

-- ============================================================
-- SECTION 2: ENABLE RLS ON B3 TABLES (rowsecurity was false)
-- ============================================================

-- Group A: In RC3 view chain -- enable + add authenticated SELECT
-- property_reporting_map is LEFT JOINed in v_transactions_reporting:
--   COALESCE(prm.canonical_name, t.property_name) AS reporting_name
--   FROM transactions t LEFT JOIN property_reporting_map prm ON (t.property_name = prm.raw_name)
-- This feeds v_rc3_classified -> v_rc3_sale/rental/airbnb/renovation.
-- This is the ONLY new CREATE POLICY in this migration.

ALTER TABLE property_reporting_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_read_property_reporting_map"
  ON property_reporting_map
  FOR SELECT
  TO authenticated
  USING (true);

-- Group B: Not in active view chain -- enable RLS, deny all by default
-- Service role bypasses RLS -> server-side ops unaffected.
-- Client-side queries return 0 rows -- intentional lockdown.

ALTER TABLE payer_aliases           ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting_rules        ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_cases          ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_event_sources  ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_events         ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_completeness_gaps  ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_entities           ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_relationships      ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_workflow_state     ENABLE ROW LEVEL SECURITY;
ALTER TABLE custody_positions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE entities                ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_queue           ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_corrections ENABLE ROW LEVEL SECURITY;

COMMIT;

-- ============================================================
-- POST-MIGRATION VERIFICATION QUERIES
-- Run in Supabase SQL Editor AFTER applying migration above.
-- ============================================================

-- V1: No anon/public SELECT policies on sensitive tables (expected: 0 rows)
-- SELECT tablename, policyname, roles, cmd, qual
-- FROM pg_policies
-- WHERE (roles::text LIKE '%anon%' OR roles::text LIKE '%public%')
--   AND cmd = 'SELECT'
--   AND tablename NOT IN ('audit_logs','user_roles')
-- ORDER BY tablename;
-- EXPECTED: 0 rows

-- V2: All 17 target tables have RLS enabled (expected: rowsecurity = true for all 17)
-- SELECT tablename, rowsecurity
-- FROM pg_tables
-- WHERE schemaname = 'public'
--   AND tablename IN (
--     'transactions','contact_opening_balances','rental_contracts',
--     'property_reporting_map','payer_aliases','accounting_rules',
--     'business_cases','business_event_sources','business_events',
--     'case_completeness_gaps','case_entities','case_relationships',
--     'case_workflow_state','custody_positions','entities',
--     'pending_queue','transaction_corrections'
--   )
-- ORDER BY tablename;
-- EXPECTED: 17 rows, all rowsecurity = true

-- V3: Auth policies on view-chain tables intact, no anon_ policies remain
-- SELECT tablename, policyname, roles, cmd, qual
-- FROM pg_policies
-- WHERE tablename IN (
--   'transactions','property_reporting_map','property_definitions',
--   'property_owners','contact_opening_balances','rental_contracts'
-- )
-- ORDER BY tablename, policyname;
-- EXPECTED: only auth_* policies, no anon_* policies

-- V4: Anon access blocked on transactions
-- SET LOCAL ROLE anon;
-- SELECT count(*) FROM transactions;
-- EXPECTED: permission denied (0 rows)
-- RESET ROLE;

-- V5: Authenticated access works on view-chain tables
-- SET LOCAL ROLE authenticated;
-- SELECT count(*) FROM property_reporting_map;  -- EXPECTED: > 0
-- SELECT count(*) FROM transactions;            -- EXPECTED: 2127
-- RESET ROLE;
