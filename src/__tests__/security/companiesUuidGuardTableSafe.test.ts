import fs from 'fs'
import path from 'path'

const root = path.resolve(__dirname, '../../..')
const migrationPath = path.join(
  root,
  'supabase/migrations/20260927260000_companies_uuid_guard_table_safe.sql',
)
const rollbackPath = path.join(
  root,
  'supabase/rollbacks/20260927260000_companies_uuid_guard_table_safe_rollback.sql',
)
const matrixPath = path.join(
  root,
  'supabase/tests/20260927260000_companies_uuid_guard_table_safe_matrix.sql',
)
const runnerPath = path.join(root, 'scripts/run-companies-uuid-guard-table-safe-matrix.cjs')
const migrationBytes = fs.readFileSync(migrationPath)
const rollbackBytes = fs.readFileSync(rollbackPath)
const matrixBytes = fs.readFileSync(matrixPath)
const runnerBytes = fs.readFileSync(runnerPath)
const migration = migrationBytes.toString('utf8')
const rollback = rollbackBytes.toString('utf8')
const matrix = matrixBytes.toString('utf8')

function functionBody(sql: string) {
  const start = sql.indexOf('AS $function$')
  const end = sql.indexOf('$function$;')
  return sql.slice(start, end)
}

describe('companies uuid guard table safe', () => {
  it('reads LF files and replaces only the shared function after the guards', () => {
    for (const bytes of [migrationBytes, rollbackBytes, matrixBytes, runnerBytes]) {
      expect(bytes.includes(0x0d)).toBe(false)
    }
    const replaceAt = migration.indexOf('CREATE OR REPLACE FUNCTION registry.forbid_uuid_change()')
    const guards = migration.slice(0, replaceAt)
    expect(migration.match(/CREATE OR REPLACE FUNCTION/g)).toHaveLength(1)
    expect(replaceAt).toBeGreaterThan(guards.indexOf('BLOCKED_BY_HISTORY'))
    expect(replaceAt).toBeGreaterThan(guards.indexOf('BLOCKED_BY_REAPPLY'))
    expect(replaceAt).toBeGreaterThan(guards.indexOf('BLOCKED_BY_SCHEMA_DRIFT'))
    expect(replaceAt).toBeGreaterThan(guards.indexOf('BLOCKED_BY_TRIGGER'))
    expect(replaceAt).toBeGreaterThan(guards.indexOf('BLOCKED_BY_DEPENDENCY'))
    expect(replaceAt).toBeGreaterThan(guards.indexOf('BLOCKED_BY_SECURITY'))
    expect(replaceAt).toBeGreaterThan(guards.indexOf('BLOCKED_BY_GLOBAL_PIN'))
    expect(guards).toContain('<> 187')
    expect(guards).toContain('20260927240000')
    expect(guards).toContain('20260927260000')
    expect(guards.indexOf('LOCK TABLE registry.companies')).toBeLessThan(
      guards.indexOf('LOCK TABLE registry.parties'),
    )
    expect(migration).not.toContain('CREATE TRIGGER')
    expect(migration).not.toContain('DROP TRIGGER')
    expect(migration).not.toContain('ALTER TABLE')
    expect(migration).not.toContain('CREATE POLICY')
    expect(migration).not.toContain('ENABLE ROW LEVEL SECURITY')
    expect(migration).not.toContain('session_replication_role')
    expect(migration).not.toContain('DISABLE TRIGGER')
    expect(migration).not.toMatch(/\bEXECUTE\b/)
    expect(migration).not.toContain('CREATE INDEX')
    expect(migration).not.toContain('ADD CONSTRAINT')
  })

  it('branches on the invoking table before reading table-specific fields', () => {
    const body = functionBody(migration)
    expect(body).toContain('TG_TABLE_SCHEMA')
    expect(body).toContain('TG_TABLE_NAME')
    expect(body).not.toContain('10f6e9b3-c5b9-4d95-a318-48f20f89477f')
    const companies = body.slice(
      body.indexOf("TG_TABLE_NAME = 'companies'"),
      body.indexOf("TG_TABLE_NAME = 'parties'"),
    )
    const parties = body.slice(
      body.indexOf("TG_TABLE_NAME = 'parties'"),
      body.indexOf('BLOCKED_BY_UUID_GUARD_TABLE'),
    )
    expect(companies).toContain('company_id')
    expect(companies).not.toContain('party_id')
    expect(parties).toContain('party_id')
    expect(parties).not.toContain('company_id')
    expect(migration).toContain('fe964c798154886e8dacc8edebef908a')
    expect(body).not.toContain('fe964c798154886e8dacc8edebef908a')
    expect(body.match(/NEW\.company_id/g)).toHaveLength(1)
    expect(body.match(/NEW\.party_id/g)).toHaveLength(1)
  })

  it('restores the exact old definition only after the rollback guards', () => {
    const replaceAt = rollback.indexOf('CREATE OR REPLACE FUNCTION registry.forbid_uuid_change()')
    const guards = rollback.slice(0, replaceAt)
    expect(rollback.match(/CREATE OR REPLACE FUNCTION/g)).toHaveLength(1)
    expect(replaceAt).toBeGreaterThan(guards.indexOf('BLOCKED_BY_ROLLBACK'))
    expect(guards).toContain('<> 188')
    expect(guards).toContain('20260927260000')
    expect(guards).toContain('fe964c798154886e8dacc8edebef908a')
    expect(guards).toContain('1e4cd7f35cfd5df00a734d7b7b9d020c')
    expect(functionBody(rollback)).toContain("TG_TABLE_NAME='companies' AND NEW.company_id <> OLD.company_id")
    expect(functionBody(rollback)).toContain("TG_TABLE_NAME='parties' AND NEW.party_id <> OLD.party_id")
    expect(rollback).toContain('1a56112bb0b16e14ea9407cef27bd7b5')
    expect(rollback).toContain('5181844513754066b432e1a529ad84e3')
    expect(rollback).not.toContain('DROP TRIGGER')
    expect(rollback).not.toContain('ALTER TABLE')
    expect(rollback).not.toContain('CREATE POLICY')
    expect(rollback).not.toContain('session_replication_role')
    expect(rollback).not.toMatch(/\bEXECUTE\b/)
  })

  it('keeps the matrix inside an outer rollback', () => {
    const { buildSql, assertNoDirectNestedDo } = require(runnerPath) as {
      buildSql: () => string
      assertNoDirectNestedDo: (sql: string) => void
    }
    const sql = buildSql()
    expect(() => assertNoDirectNestedDo(sql)).not.toThrow()
    expect(sql.startsWith('BEGIN;')).toBe(true)
    expect(sql.trimEnd().endsWith('ROLLBACK;')).toBe(true)
    expect(sql).not.toContain('@@MIGRATION@@')
    expect(sql).not.toContain('@@ROLLBACK@@')
    expect(sql).not.toContain('session_replication_role')
    for (const step of [
      'baseline_bug',
      'history_drift',
      'trigger_disabled',
      'trigger_definition_drift',
      'function_drift',
      'search_path_drift',
      'acl_drift',
      'dependency_drift',
      'forward_installed',
      'company_update_ok',
      'company_uuid_rejected',
      'company_uuid_unchanged',
      'company_insert_delete',
      'party_update_ok',
      'party_uuid_rejected',
      'party_insert_delete',
      'execute_privileges',
      'unexpected_table',
      'reapply',
      'rollback_missing_trigger',
      'rollback_function_drift',
      'defect_restored',
      'clean_rollback',
    ]) {
      expect(matrix).toContain(step)
    }
  })
})
