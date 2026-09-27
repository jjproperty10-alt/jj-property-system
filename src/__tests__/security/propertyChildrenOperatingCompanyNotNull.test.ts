import fs from 'fs'
import path from 'path'

const root = path.resolve(__dirname, '../../..')
const migration = fs.readFileSync(
  path.join(root, 'supabase/migrations/20260926200000_property_children_operating_company_not_null.sql'),
  'utf8',
)
const rollback = fs.readFileSync(
  path.join(root, 'supabase/rollbacks/20260926200000_property_children_operating_company_not_null_rollback.sql'),
  'utf8',
)
const matrix = fs.readFileSync(
  path.join(root, 'supabase/tests/20260926200000_property_children_operating_company_not_null_matrix.sql'),
  'utf8',
)
const runner = fs.readFileSync(
  path.join(root, 'scripts/run-property-children-operating-company-not-null-matrix.cjs'),
  'utf8',
)

function beforeFirst(source: string, marker: string) {
  const at = source.search(marker)
  expect(at).toBeGreaterThan(0)
  return source.slice(0, at)
}

describe('property child operating company not null', () => {
  it('sets exactly nine columns not null after every guard', () => {
    const guards = beforeFirst(migration, 'ALTER COLUMN operating_company_id SET NOT NULL')
    for (const token of [
      'BLOCKED_BY_SCHEMA_DRIFT',
      'BLOCKED_BY_HISTORY',
      'BLOCKED_BY_ASSIGNMENT',
      'BLOCKED_BY_ENFORCEMENT',
      'BLOCKED_BY_GLOBAL_PIN',
      '20260925120000',
      '20260925140000',
      '20260926120000',
      '20260926140000',
      '20260926160000',
      '20260926180000',
      '20260926200000',
    ]) {
      expect(guards).toContain(token)
    }
    expect(migration.match(/ALTER COLUMN operating_company_id SET NOT NULL/g)).toHaveLength(9)
    expect(
      migration.split('\n').filter((line) => /^\s*(INSERT|UPDATE|DELETE|MERGE|TRUNCATE)\b/i.test(line)),
    ).toEqual([])
    expect(migration).not.toMatch(/SET DEFAULT/)
    expect(migration).not.toMatch(/CREATE OR REPLACE/)
    expect(migration).not.toMatch(/CREATE TRIGGER/)
    expect(migration).not.toMatch(/DROP TRIGGER/)
    expect(migration).not.toMatch(/ADD CONSTRAINT/)
    expect(migration).not.toMatch(/CREATE INDEX/)
    expect(migration).not.toMatch(/session_replication_role/)
    expect(migration).not.toMatch(/migration repair/)
  })

  it('rolls back only the nine not-null flags after validation', () => {
    const guards = beforeFirst(rollback, 'ALTER COLUMN operating_company_id DROP NOT NULL')
    expect(guards).toContain('BLOCKED_BY_ROLLBACK')
    expect(guards).toContain('20260926200000')
    expect(rollback.match(/ALTER COLUMN operating_company_id DROP NOT NULL/g)).toHaveLength(9)
    expect(rollback).not.toMatch(/DROP COLUMN/)
    expect(rollback).not.toMatch(/DROP FUNCTION/)
    expect(rollback).not.toMatch(/DROP TRIGGER/)
    expect(rollback).not.toMatch(/\b(INSERT|UPDATE|DELETE|MERGE|TRUNCATE)\b/)
    expect(rollback).not.toMatch(/migration repair/)
  })

  it('runs the exact bodies inside an outer rollback', () => {
    const { buildSql } = require('../../../scripts/run-property-children-operating-company-not-null-matrix.cjs') as {
      buildSql: () => string
    }
    const sql = buildSql()
    expect(sql.startsWith('BEGIN;')).toBe(true)
    expect(sql.trimEnd().endsWith('ROLLBACK;')).toBe(true)
    expect(sql).toContain('ALTER COLUMN operating_company_id SET NOT NULL')
    expect(sql).toContain('ALTER COLUMN operating_company_id DROP NOT NULL')
    expect(sql).not.toContain('@@MIGRATION@@')
    expect(sql).not.toContain('@@ROLLBACK@@')
    expect(runner).toContain('jj-p33-matrix-run.sql')
    expect(runner).toContain('process.env.TEMP')
    expect(runner).not.toMatch(/migration repair/)
    expect(matrix).toContain('omit_property_ownership')
    expect(matrix).toContain('null_insert')
    expect(matrix).toContain('two_explicit_mappings')
    expect(matrix).toContain('two_parent_inherit')
    expect(matrix).toContain('service_role_insert')
    expect(matrix).toContain('direct_enforce_service')
    expect(matrix).toContain('rollback_drift')
    expect(matrix).toContain('clean_rollback')
    expect(fs.existsSync(path.join(root, 'jj-p33-matrix-run.sql'))).toBe(false)
  })
})
