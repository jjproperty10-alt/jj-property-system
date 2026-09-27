import fs from 'fs'
import path from 'path'

const root = path.resolve(__dirname, '../../..')
const migrationPath = path.join(
  root,
  'supabase/migrations/20260927240000_agent_transaction_drafts_operating_company_not_null.sql',
)
const rollbackPath = path.join(
  root,
  'supabase/rollbacks/20260927240000_agent_transaction_drafts_operating_company_not_null_rollback.sql',
)
const matrixPath = path.join(
  root,
  'supabase/tests/20260927240000_agent_transaction_drafts_operating_company_not_null_matrix.sql',
)
const migrationBytes = fs.readFileSync(migrationPath)
const rollbackBytes = fs.readFileSync(rollbackPath)
const matrixBytes = fs.readFileSync(matrixPath)
const migration = migrationBytes.toString('utf8')
const rollback = rollbackBytes.toString('utf8')
const matrix = matrixBytes.toString('utf8')

describe('agent transaction draft company not null', () => {
  it('reads the generated SQL as LF and requires the column only after the guards', () => {
    expect(migrationBytes.includes(0x0d)).toBe(false)
    expect(rollbackBytes.includes(0x0d)).toBe(false)
    expect(matrixBytes.includes(0x0d)).toBe(false)
    const alterAt = migration.indexOf('ALTER COLUMN operating_company_id SET NOT NULL')
    const guards = migration.slice(0, alterAt)
    expect(migration.match(/ALTER COLUMN operating_company_id SET NOT NULL/g)).toHaveLength(1)
    expect(alterAt).toBeGreaterThan(guards.indexOf('BLOCKED_BY_HISTORY'))
    expect(alterAt).toBeGreaterThan(guards.indexOf('BLOCKED_BY_REAPPLY'))
    expect(alterAt).toBeGreaterThan(guards.indexOf('BLOCKED_BY_SCHEMA_DRIFT'))
    expect(alterAt).toBeGreaterThan(guards.indexOf('BLOCKED_BY_TRIGGER'))
    expect(alterAt).toBeGreaterThan(guards.indexOf('BLOCKED_BY_GLOBAL_PIN'))
    expect(guards).toContain('<> 186')
    expect(guards).toContain('20260927160000')
    expect(guards).toContain('20260927220000')
    expect(guards).toContain('20260927240000')
    expect(guards).toContain('d7d613bf138b734626f9a82df3ac7075')
    expect(guards).toContain('6c97411f192611b3070d9df7369435d8')
    expect(guards).toContain('dfcbb8a5bf1cd56e62b2cb9870870eb5')
    expect(guards).toContain('73fd015810eeb121646bdfecf4fef0f8')
    expect(guards).toContain('7dcd0c77d19854e707bbaa59bbf752cd')
    expect(guards).toContain('68b7d11d856c6c9065984bdbeb85daad')
    expect(guards).toContain('1e4cd7f35cfd5df00a734d7b7b9d020c')
    expect(guards.indexOf('LOCK TABLE finance.agent_transaction_drafts')).toBeLessThan(
      guards.indexOf('LOCK TABLE registry.companies'),
    )
    expect(migration).not.toContain('CREATE OR REPLACE')
    expect(migration).not.toContain('CREATE FUNCTION')
    expect(migration).not.toContain('CREATE TRIGGER')
    expect(migration).not.toContain('session_replication_role')
    expect(migration).not.toContain('DISABLE TRIGGER')
    expect(migration).not.toMatch(/\bUPDATE\s+finance\.agent_transaction_drafts\b/)
    expect(migration).not.toMatch(/\bINSERT\s+INTO\s+finance\.agent_transaction_drafts\b/)
    expect(migration).not.toMatch(/\bDELETE\s+FROM\s+finance\.agent_transaction_drafts\b/)
  })

  it('drops only the not-null requirement after the rollback guards', () => {
    const dropAt = rollback.indexOf('ALTER COLUMN operating_company_id DROP NOT NULL')
    const guards = rollback.slice(0, dropAt)
    expect(rollback.match(/ALTER COLUMN operating_company_id DROP NOT NULL/g)).toHaveLength(1)
    expect(dropAt).toBeGreaterThan(guards.indexOf('BLOCKED_BY_ROLLBACK'))
    expect(guards).toContain('<> 187')
    expect(guards).toContain('20260927240000')
    expect(guards).toContain('20260927220000')
    expect(guards).toContain('dfcbb8a5bf1cd56e62b2cb9870870eb5')
    expect(guards).toContain('73fd015810eeb121646bdfecf4fef0f8')
    expect(guards).toContain('7dcd0c77d19854e707bbaa59bbf752cd')
    expect(rollback).not.toContain('DROP COLUMN')
    expect(rollback).not.toContain('DROP INDEX')
    expect(rollback).not.toContain('DROP CONSTRAINT')
    expect(rollback).not.toContain('DROP FUNCTION')
    expect(rollback).not.toContain('DROP TRIGGER')
    expect(rollback).not.toContain('session_replication_role')
    expect(rollback).not.toContain('DISABLE TRIGGER')
    expect(rollback).not.toContain('CREATE OR REPLACE')
  })

  it('keeps the matrix inside an outer rollback and covers the not-null probes', () => {
    const { buildSql, assertNoDirectNestedDo } = require(path.join(
      root,
      'scripts/run-agent-transaction-drafts-operating-company-not-null-matrix.cjs',
    )) as { buildSql: () => string; assertNoDirectNestedDo: (sql: string) => void }
    const sql = buildSql()
    expect(() => assertNoDirectNestedDo(sql)).not.toThrow()
    expect(sql.startsWith('BEGIN;')).toBe(true)
    expect(sql.trimEnd().endsWith('ROLLBACK;')).toBe(true)
    expect(sql).not.toContain('@@MIGRATION@@')
    expect(sql).not.toContain('@@ROLLBACK@@')
    expect(sql).not.toContain('session_replication_role')
    expect(matrix).not.toContain('companies_uuid_guard')
    for (const step of [
      'history_present',
      'column_drift',
      'fk_drift',
      'index_drift',
      'original_guard_disabled',
      'company_trigger_disabled',
      'company_function_drift',
      'rpc_drift',
      'rls_drift',
      'not_null_installed',
      'rpc_omitted',
      'direct_authenticated_omitted',
      'explicit_null',
      'explicit_canonical',
      'unknown_company',
      'inactive_company',
      'two_omitted',
      'two_explicit_canonical',
      'two_explicit_other',
      'service_role_assigns',
      'service_role_rejects',
      'update_reassign',
      'update_null',
      'ordinary_update',
      'direct_execute_anon',
      'direct_execute_authenticated',
      'direct_execute_service_role',
      'reapply',
      'rows_unchanged',
      'rollback_column_drift',
      'rollback_drifted_function',
      'clean_rollback',
    ]) {
      expect(matrix).toContain(step)
    }
  })
})
