import fs from 'fs'
import path from 'path'

const root = path.resolve(__dirname, '../../..')
const migration = fs.readFileSync(
  path.join(root, 'supabase/migrations/20260927120000_agent_transaction_drafts_operating_company_id.sql'),
  'utf8',
)
const rollback = fs.readFileSync(
  path.join(root, 'supabase/rollbacks/20260927120000_agent_transaction_drafts_operating_company_id_rollback.sql'),
  'utf8',
)
const matrix = fs.readFileSync(
  path.join(root, 'supabase/tests/20260927120000_agent_transaction_drafts_operating_company_matrix.sql'),
  'utf8',
)
const runner = fs.readFileSync(
  path.join(root, 'scripts/run-agent-transaction-drafts-operating-company-matrix.cjs'),
  'utf8',
)

function beforeFirst(source: string, marker: string) {
  const at = source.indexOf(marker)
  expect(at).toBeGreaterThan(0)
  return source.slice(0, at)
}

describe('agent transaction draft operating company column', () => {
  it('adds one nullable company key after the production guards', () => {
    const guards = beforeFirst(migration, 'ADD COLUMN operating_company_id uuid')
    expect(migration.match(/ADD COLUMN operating_company_id uuid/g)).toHaveLength(1)
    expect(migration.match(/ON DELETE RESTRICT/g)).toHaveLength(1)
    expect(migration.match(/CREATE INDEX agent_transaction_drafts_operating_company_id_idx/g)).toHaveLength(1)
    expect(migration).not.toMatch(/SET NOT NULL/)
    expect(migration).not.toMatch(/\bDEFAULT\b/i)
    expect(migration).not.toMatch(/^\s*(INSERT|UPDATE|DELETE|MERGE|TRUNCATE)\b/im)
    expect(migration).not.toContain('CREATE OR REPLACE FUNCTION')
    expect(migration).not.toContain('CREATE POLICY')
    expect(migration).not.toContain('CREATE TRIGGER')
    expect(migration).not.toContain('ENABLE ROW LEVEL SECURITY')
    expect(migration).not.toMatch(/\bGRANT\b/)
    expect(migration).not.toMatch(/\bREVOKE\b/)
    expect(migration).not.toContain('session_replication_role')
    expect(guards).toContain('BLOCKED_BY_SCHEMA_DRIFT')
    expect(guards).toContain('BLOCKED_BY_HISTORY')
    expect(guards).toContain('BLOCKED_BY_ASSIGNMENT')
    expect(guards).toContain('BLOCKED_BY_ENFORCEMENT')
    expect(guards).toContain('BLOCKED_BY_GLOBAL_PIN')
    expect(guards).toContain('20260926200000')
    expect(guards).toContain('20260927120000')
    expect(guards).toContain('SHARE ROW EXCLUSIVE')
    expect(guards).toContain('finance.agent_transaction_drafts')
    expect(guards).toContain('registry.companies')
    expect(guards.indexOf('LOCK TABLE finance.agent_transaction_drafts')).toBeLessThan(
      guards.indexOf('LOCK TABLE registry.companies'),
    )
  })

  it('drops the index, the foreign key, and the column only while every value is null', () => {
    const guards = beforeFirst(rollback, 'DROP INDEX finance.agent_transaction_drafts_operating_company_id_idx')
    expect(rollback.match(/DROP INDEX finance\.agent_transaction_drafts_operating_company_id_idx/g)).toHaveLength(1)
    expect(rollback.match(/DROP CONSTRAINT agent_transaction_drafts_operating_company_fk/g)).toHaveLength(1)
    expect(rollback.match(/DROP COLUMN operating_company_id/g)).toHaveLength(1)
    expect(rollback.indexOf('DROP INDEX')).toBeLessThan(rollback.indexOf('DROP CONSTRAINT'))
    expect(rollback.indexOf('DROP CONSTRAINT')).toBeLessThan(rollback.indexOf('DROP COLUMN'))
    expect(guards).toContain('BLOCKED_BY_ROLLBACK')
    expect(guards).toContain('BLOCKED_BY_ROLLBACK: assigned value')
    expect(guards).toContain('20260927120000')
    expect(guards).toContain('reviewed_dependency_count <> 2')
    expect(guards).toContain("'pg_policy'::regclass")
    expect(guards).toContain("'pg_rewrite'::regclass")
    expect(guards).toContain("'pg_trigger'::regclass")
    expect(guards).toContain("'pg_proc'::regclass")
    expect(guards).toContain("'pg_attrdef'::regclass")
    expect(rollback).not.toContain('CASCADE')
    expect(rollback).not.toMatch(/^\s*DELETE FROM/im)
    expect(rollback).not.toContain('DROP TABLE')
    expect(rollback).not.toMatch(/\bDEFAULT\b/i)
  })

  it('keeps the matrix inside an outer rollback and covers the required probes', () => {
    const { buildSql, assertNoDirectNestedDo } = require(path.join(
      root,
      'scripts/run-agent-transaction-drafts-operating-company-matrix.cjs',
    )) as { buildSql: () => string; assertNoDirectNestedDo: (sql: string) => void }
    const sql = buildSql()
    expect(() => assertNoDirectNestedDo(sql)).not.toThrow()
    expect(sql.startsWith('BEGIN;')).toBe(true)
    expect(sql.trimEnd().endsWith('ROLLBACK;')).toBe(true)
    expect(sql).not.toContain('@@MIGRATION@@')
    expect(sql).not.toContain('@@ROLLBACK@@')
    for (const step of [
      'omit_insert',
      'explicit_company',
      'unknown_company',
      'create_rpc',
      'list_rpc',
      'reapply',
      'column_drift',
      'fk_drift',
      'index_drift',
      'rollback_assigned',
      'rollback_missing_fk',
      'rollback_missing_index',
      'clean_rollback',
    ]) {
      expect(matrix).toContain(step)
    }
    expect(runner).toContain('jj-s4-matrix-run.sql')
    expect(runner).toContain('process.env.TEMP')
    expect(matrix).not.toContain('INSERT INTO registry.companies')
    expect(sql).not.toContain('session_replication_role')
  })
})
