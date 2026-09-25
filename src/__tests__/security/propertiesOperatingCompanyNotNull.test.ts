import { execFileSync } from 'child_process'
import fs from 'fs'
import path from 'path'

const root = path.resolve(__dirname, '..', '..', '..')
const migration = fs.readFileSync(
  path.join(root, 'supabase/migrations/20260926120000_properties_operating_company_not_null.sql'),
  'utf8',
)
const rollback = fs.readFileSync(
  path.join(root, 'supabase/rollbacks/20260926120000_properties_operating_company_not_null_rollback.sql'),
  'utf8',
)
const matrix = fs.readFileSync(
  path.join(root, 'supabase/tests/20260926120000_properties_operating_company_not_null_matrix.sql'),
  'utf8',
)
const runner = fs.readFileSync(
  path.join(root, 'scripts/run-properties-operating-company-not-null-matrix.cjs'),
  'utf8',
)

describe('property operating company requirement', () => {
  it('requires the column only after the reviewed assignment is complete', () => {
    const alterAt = migration.indexOf('ALTER COLUMN operating_company_id SET NOT NULL')
    expect(alterAt).toBeGreaterThan(migration.indexOf('BLOCKED_BY_NOT_NULL: company registry'))
    expect(alterAt).toBeGreaterThan(migration.indexOf('BLOCKED_BY_NOT_NULL: row count'))
    expect(alterAt).toBeGreaterThan(migration.indexOf('BLOCKED_BY_NOT_NULL: assignment'))
    expect(alterAt).toBeGreaterThan(migration.indexOf('BLOCKED_BY_NOT_NULL: column shape'))
    expect(migration).toContain('20260925140000')
    expect(migration).toContain('20260925120000')
    expect(migration.match(/ALTER COLUMN operating_company_id SET NOT NULL/g)).toHaveLength(2)
    expect(migration).not.toMatch(/\bDEFAULT\b/)
    expect(migration).not.toContain('ENABLE ROW LEVEL SECURITY')
    expect(migration).not.toContain('CREATE POLICY')
    expect(migration).not.toContain('UPDATE public.properties')
    expect(migration).not.toContain('public.transactions')
  })

  it('drops only the requirement and keeps the company assignment', () => {
    const dropAt = rollback.indexOf('ALTER COLUMN operating_company_id DROP NOT NULL')
    expect(dropAt).toBeGreaterThan(rollback.indexOf('BLOCKED_BY_ROLLBACK: mixed company'))
    expect(rollback.match(/ALTER COLUMN operating_company_id DROP NOT NULL/g)).toHaveLength(2)
    expect(rollback).not.toContain('SET operating_company_id')
    expect(rollback).not.toMatch(/DELETE FROM/i)
    expect(rollback).not.toContain('CASCADE')
    expect(rollback).not.toMatch(/\bDEFAULT\b/)
  })

  it('does not bypass the company identity guard', () => {
    for (const source of [migration, rollback, matrix, runner]) {
      expect(source).not.toMatch(/DISABLE TRIGGER/i)
      expect(source).not.toMatch(/ENABLE TRIGGER/i)
      expect(source).not.toMatch(/ALTER TABLE registry\.companies/i)
      expect(source).not.toMatch(/CREATE OR REPLACE FUNCTION/i)
    }
  })

  it('runs failure cases through EXECUTE instead of a nested DO statement', () => {
    const artifact = execFileSync(
      'node',
      [path.join(root, 'scripts/run-properties-operating-company-not-null-matrix.cjs')],
      { cwd: root, encoding: 'utf8' },
    ).trim()
    const generated = fs.readFileSync(artifact, 'utf8')
    const { assertNoDirectNestedDo } = require(path.join(
      root,
      'scripts/run-properties-operating-company-not-null-matrix.cjs',
    )) as { assertNoDirectNestedDo: (sql: string) => void }
    expect(() => assertNoDirectNestedDo(generated)).not.toThrow()
    expect(generated).toContain('EXECUTE $phase23_run$')
    expect(generated).toContain('DO $require$')
  })
})
