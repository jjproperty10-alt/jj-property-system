import { execFileSync } from 'child_process'
import fs from 'fs'
import path from 'path'

const root = path.resolve(__dirname, '..', '..', '..')
const migration = fs.readFileSync(
  path.join(root, 'supabase/migrations/20260926180000_property_children_operating_company_write_guard.sql'),
  'utf8',
)
const rollback = fs.readFileSync(
  path.join(root, 'supabase/rollbacks/20260926180000_property_children_operating_company_write_guard_rollback.sql'),
  'utf8',
)
const matrix = fs.readFileSync(
  path.join(root, 'supabase/tests/20260926180000_property_children_operating_company_write_guard_matrix.sql'),
  'utf8',
)
const runner = fs.readFileSync(
  path.join(root, 'scripts/run-property-children-operating-company-write-guard-matrix.cjs'),
  'utf8',
)
const tables = [
  'public.property_owners',
  'public.property_ownership',
  'public.ownership',
  'public.property_name_aliases',
  'public.property_reporting_map',
  'lifecycle.property_acquisition',
  'lifecycle.service_engagements',
  'lifecycle.management_fee_configs',
  'pms.property_mappings',
]
const triggers = [
  'trg_property_owners_operating_company',
  'trg_property_ownership_operating_company',
  'trg_ownership_operating_company',
  'trg_property_name_aliases_operating_company',
  'trg_property_reporting_map_operating_company',
  'trg_property_acquisition_operating_company',
  'trg_service_engagements_operating_company',
  'trg_management_fee_configs_operating_company',
  'trg_property_mappings_operating_company',
]

function functionBody(sql: string, marker: string) {
  const start = sql.indexOf(marker)
  const end = sql.indexOf(marker, start + marker.length)
  return sql.slice(start, end)
}

describe('property children operating company write guard', () => {
  it('guards every child table before creating enforcement', () => {
    const createAt = migration.indexOf('CREATE FUNCTION registry.resolve_child_operating_company')
    const guard = migration.slice(0, createAt)
    expect(createAt).toBeGreaterThan(0)
    expect(guard.indexOf('LOCK TABLE')).toBeLessThan(guard.indexOf('FROM public.property_owners'))
    expect(guard).toContain('LOCK TABLE lifecycle.management_fee_configs IN SHARE ROW EXCLUSIVE MODE')
    expect(guard).toContain('LOCK TABLE registry.companies IN SHARE ROW EXCLUSIVE MODE')
    expect(guard).toContain('BLOCKED_BY_SCHEMA_DRIFT: enforcement present')
    expect(guard).toContain('BLOCKED_BY_SCHEMA_DRIFT: child schema')
    expect(guard).toContain('BLOCKED_BY_SCHEMA_DRIFT: audit trigger')
    expect(guard).toContain('BLOCKED_BY_HISTORY')
    expect(guard).toContain('BLOCKED_BY_COMPANY_CONTEXT')
    expect(guard).toContain('BLOCKED_BY_PARENT_COMPANY')
    expect(guard).toContain('BLOCKED_BY_SCHEMA_DRIFT: assignment')
    expect(guard).toContain('BLOCKED_BY_SCHEMA_DRIFT: global pin')
    expect(guard).toContain('20260925120000')
    expect(guard).toContain('20260925140000')
    expect(guard).toContain('20260926120000')
    expect(guard).toContain('20260926140000')
    expect(guard).toContain('20260926160000')
    expect(guard).toContain('20260926180000')
    expect(guard).toContain('ca7ceb8841f66d974dc72b972be902c3')
    expect(guard).toContain('1b014d4d7f0fa074f6ad3f50a7181e34')
    expect(guard).toContain('fbf261e717ed8a67f26e9ae35e344c54')
    expect(guard).toContain('39c35feee3d904605b3606f32e1d3f45')
    expect(guard).toContain('1e4cd7f35cfd5df00a734d7b7b9d020c')
    expect(guard).toContain('trg_transactions_append_only')
    expect(guard).toContain('companies_uuid_guard')
    expect(guard).toContain('trg_ira_audit_se')
    for (const table of tables) {
      expect(guard).toContain(table)
      expect(migration).toContain(`BEFORE INSERT OR UPDATE ON ${table}`)
    }
    for (const trigger of triggers) {
      expect(migration).toContain(trigger)
    }
    expect(migration).toContain('BLOCKED_BY_COMPANY_REASSIGNMENT')
    expect(migration).toContain('active_count <> 1')
    expect(migration).toContain("status = 'active'")
    expect(migration).not.toMatch(/SET NOT NULL/i)
    expect(migration).not.toMatch(/\bDEFAULT\b/)
    expect(migration).not.toContain('CREATE POLICY')
    expect(migration).not.toContain('ENABLE ROW LEVEL SECURITY')
    expect(migration).not.toMatch(/DISABLE TRIGGER/i)
    expect(migration).not.toMatch(/session_replication_role/i)
    expect(migration).not.toMatch(/CREATE OR REPLACE FUNCTION/i)
    expect(migration).not.toMatch(/\bUPDATE\s+(public|lifecycle|pms)\./i)
    expect(migration).not.toMatch(/\bINSERT\s+INTO\s+(public|lifecycle|pms|registry)\./i)
    expect(migration).not.toMatch(/\bDELETE\s+FROM\s+/i)
    expect(migration).not.toMatch(/INSERT\s+INTO\s+supabase_migrations/i)
  })

  it('does not hard-code the canonical company inside the guard functions', () => {
    const resolve = functionBody(migration, '$resolve$')
    const enforce = functionBody(migration, '$enforce$')
    expect(resolve).not.toContain('10f6e9b3-c5b9-4d95-a318-48f20f89477f')
    expect(enforce).not.toContain('10f6e9b3-c5b9-4d95-a318-48f20f89477f')
    expect(resolve).toContain('BLOCKED_BY_COMPANY_CONTEXT')
    expect(resolve).toContain('BLOCKED_BY_PARENT_COMPANY')
    expect(resolve).toContain('active_count <> 1')
    expect(resolve).toContain('p_supplied IS DISTINCT FROM sole_company')
    expect(resolve).not.toContain('RETURN p_supplied')
    expect(enforce).toContain('BLOCKED_BY_COMPANY_REASSIGNMENT')
    expect(enforce).toContain('BLOCKED_BY_SCHEMA_DRIFT')
    expect(enforce).not.toContain('EXECUTE')
    expect(migration).toContain('SET search_path = pg_catalog')
    expect(migration).toContain('SECURITY DEFINER')
    expect(migration).toContain('REVOKE ALL ON FUNCTION registry.enforce_child_operating_company() FROM anon, authenticated, service_role')
    expect(migration).toContain('REVOKE ALL ON FUNCTION registry.resolve_child_operating_company(uuid, uuid, boolean) FROM anon, authenticated, service_role')
    expect(migration).toContain('BLOCKED_BY_SCHEMA_DRIFT: function acl')
    expect(migration).not.toContain('GRANT EXECUTE')
  })

  it('validates enforcement before the rollback drops it', () => {
    const dropAt = rollback.indexOf('DROP TRIGGER')
    const guard = rollback.slice(0, dropAt)
    expect(dropAt).toBeGreaterThan(0)
    expect(guard).toContain('LOCK TABLE lifecycle.management_fee_configs IN SHARE ROW EXCLUSIVE MODE')
    expect(guard).toContain('BLOCKED_BY_ROLLBACK: trigger')
    expect(guard).toContain('BLOCKED_BY_ROLLBACK: function')
    expect(guard).toContain('BLOCKED_BY_ROLLBACK: function acl')
    expect(rollback).toContain('p_supplied IS DISTINCT FROM sole_company')
    expect(guard).toContain('BLOCKED_BY_ROLLBACK: dependency')
    expect(guard).toContain('BLOCKED_BY_ROLLBACK: child schema')
    expect(guard).toContain('BLOCKED_BY_ROLLBACK: assignment')
    expect(guard).toContain('BLOCKED_BY_ROLLBACK: history')
    expect(guard).toContain('BLOCKED_BY_ROLLBACK: audit trigger')
    expect(guard).toContain("'pg_policy'::regclass")
    expect(guard).toContain("'pg_attrdef'::regclass")
    expect(guard).toContain('20260926180000')
    for (const table of tables) {
      expect(guard).toContain(table)
    }
    expect(rollback).toContain('DROP FUNCTION registry.enforce_child_operating_company()')
    expect(rollback).toContain('DROP FUNCTION registry.resolve_child_operating_company(uuid, uuid, boolean)')
    expect(rollback).not.toMatch(/SET operating_company_id/i)
    expect(rollback).not.toMatch(/SET NOT NULL/i)
    expect(rollback).not.toMatch(/DROP COLUMN/i)
    expect(rollback).not.toContain('DROP CONSTRAINT')
    expect(rollback).not.toMatch(/INSERT\s+INTO\s+supabase_migrations/i)
    expect(rollback).not.toMatch(/DELETE\s+FROM\s+supabase_migrations/i)
  })

  it('runs the exact migration and rollback inside an outer rollback', () => {
    const built = execFileSync(
      process.execPath,
      ['-e', "process.stdout.write(require('./scripts/run-property-children-operating-company-write-guard-matrix.cjs').buildSql())"],
      { cwd: root, encoding: 'utf8' },
    )
    expect(built.trimStart().startsWith('BEGIN;')).toBe(true)
    expect(built.trimEnd().endsWith('ROLLBACK;')).toBe(true)
    expect(built).toContain('EXECUTE $phase32_run$')
    expect(built).toContain('CREATE FUNCTION registry.enforce_child_operating_company()')
    expect(built).toContain('DROP FUNCTION registry.enforce_child_operating_company()')
    expect(runner).toContain('assertNoDirectNestedDo')
    expect(() =>
      require(path.join(root, 'scripts/run-property-children-operating-company-write-guard-matrix.cjs')).assertNoDirectNestedDo(built),
    ).not.toThrow()
    expect(matrix).toContain('@@MIGRATION@@')
    expect(matrix).toContain('@@ROLLBACK@@')
    expect(matrix).toContain('second_company_fallback')
    expect(matrix).toContain('ownership_one_explicit_jj')
    expect(matrix).toContain('aliases_one_explicit_inactive')
    expect(matrix).toContain('reporting_two_omit')
    expect(matrix).toContain('acquisition_two_explicit_jj')
    expect(matrix).toContain('mappings_two_explicit_second')
    expect(matrix).toContain('engagement_parent_two_inherit')
    expect(matrix).toContain('function_acl')
    expect(matrix).toContain('reassignment')
    expect(matrix).toContain('clean_rollback')
  })
})
