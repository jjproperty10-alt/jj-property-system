-- Migration: 20260730_fix_management_relationship_grant.sql
-- Status: EXECUTED 2026-07-30 (applied directly, then committed to repo)
--
-- Root cause: g1a_migration.sql created lifecycle.management_relationship
-- but omitted GRANT SELECT to service_role. All other lifecycle tables
-- received explicit grants in their respective migrations.
--
-- Evidence chain:
--   1. trace_owners_pipeline.js: management_relationship returned HTTP 403
--   2. PostgREST error 42501: "permission denied for table management_relationship"
--   3. has_table_privilege('service_role', ..., 'SELECT') = false
--   4. information_schema.role_table_grants: management_relationship absent
--   5. pg_default_acl: no default ACL on lifecycle schema
--   6. All other lifecycle tables (entity_identity, verification_tasks,
--      investor_auth, etc.) have explicit GRANT SELECT to service_role
--
-- Impact: identityResolverService.getAllVerifiedOwners() silently returned []
--         because the catch block swallowed the 403 → Owners Room showed 0 owners
--
-- Idempotent: PostgreSQL GRANT is safe to run multiple times.
-- If the privilege already exists, this is a no-op.

GRANT SELECT ON TABLE lifecycle.management_relationship TO service_role;

-- Verification:
-- SELECT has_table_privilege('service_role', 'lifecycle.management_relationship', 'SELECT');
-- Expected: true
-- Actual: true ✅ (verified 2026-07-30)

-- Rollback:
-- REVOKE SELECT ON TABLE lifecycle.management_relationship FROM service_role;
