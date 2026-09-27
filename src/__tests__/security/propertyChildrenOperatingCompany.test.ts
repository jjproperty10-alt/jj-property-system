import { execFileSync } from 'child_process'
import fs from 'fs'
import path from 'path'

const root = path.resolve(__dirname, '..', '..', '..')
const migration = fs.readFileSync(
  path.join(root, 'supabase/migrations/20260926140000_property_children_operating_company_id.sql'),
  'utf8',
)
const rollback = fs.readFileSync(
  path.join(root, 'supabase/rollbacks/20260926140000_property_children_operating_company_id_rollback.sql'),
  'utf8',
)
const matrix = fs.readFileSync(
  path.join(root, 'supabase/tests/20260926140000_property_children_operating_company_matrix.sql'),
  'utf8',
)
const runner = fs.readFileSync(
  path.join(root, 'scripts/run-property-children-operating-company-matrix.cjs'),
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

describe('property children operating company column', () => {
  it('adds a nullable company key on the nine child tables and does not fill it', () => {
    expect(migration.match(/ADD COLUMN operating_company_id uuid/g)).toHaveLength(9)
    expect(migration.match(/ON DELETE RESTRICT/g)).toHaveLength(9)
    expect(migration).not.toMatch(/\bDEFAULT\b/i)
    expect(migration).not.toMatch(/NOT NULL/)
    expect(migration).not.toContain('10f6e9b3-c5b9-4d95-a318-48f20f89477f')
    expect(migration).not.toMatch(/UPDATE\s+/i)
    expect(migration).not.toContain('ENABLE ROW LEVEL SECURITY')
    expect(migration).not.toContain('CREATE POLICY')
    expect(migration).not.toContain('external_id')
    expect(migration).not.toContain('pms.connections')
    expect(migration).not.toContain('raw_reservations')
    expect(migration).not.toContain('public.transactions')
    expect(migration).not.toContain('partnership_ownership')
    for (const table of tables) {
      expect(migration).toContain(`ALTER TABLE ${table}`)
    }
    const addAt = migration.indexOf('ADD COLUMN operating_company_id uuid')
    const guard = migration.slice(0, addAt)
    expect(guard).toContain('BLOCKED_BY_SCHEMA_DRIFT')
    expect(guard).toContain('BLOCKED_BY_PARENT')
    expect(guard).toContain('BLOCKED_BY_HISTORY')
    expect(guard).toContain('20260925120000')
    expect(guard).toContain('20260925140000')
    expect(guard).toContain('20260926120000')
    expect(guard).toContain('attribute.attnotnull')
  })

  it('drops only the new objects while every child value is still null', () => {
    const dropAt = rollback.indexOf('DROP CONSTRAINT')
    const guard = rollback.slice(0, dropAt)
    expect(dropAt).toBeGreaterThan(0)
    expect(rollback.indexOf('DROP INDEX')).toBeGreaterThan(dropAt)
    expect(rollback.indexOf('DROP COLUMN operating_company_id')).toBeGreaterThan(
      rollback.indexOf('DROP INDEX'),
    )
    expect(rollback.match(/DROP COLUMN operating_company_id/g)).toHaveLength(9)
    expect(rollback.match(/DROP CONSTRAINT /g)).toHaveLength(9)
    expect(guard).toContain("RAISE EXCEPTION 'BLOCKED_BY_ROLLBACK'")
    expect(guard).toContain('BLOCKED_BY_ROLLBACK: assigned value')
    expect(guard.indexOf('column_count <> 9 OR foreign_key_count <> 9 OR index_count <> 9')).toBeLessThan(
      guard.indexOf('BLOCKED_BY_ROLLBACK: assigned value'),
    )
    expect(guard).toContain("local_column.attname = 'operating_company_id'")
    expect(guard).toContain("referenced_namespace.nspname = 'registry'")
    expect(guard).toContain("referenced.relname = 'companies'")
    expect(guard).toContain("referenced_column.attname = 'company_id'")
    expect(guard).toContain("company_fk.contype = 'f'")
    expect(guard).toContain("company_fk.confdeltype = 'r'")
    expect(guard).toContain('company_fk.convalidated = true')
    expect(guard).toContain('company_fk.condeferrable = false')
    expect(guard).toContain('company_fk.condeferred = false')
    expect(guard).toContain('index_row.indisunique = false')
    expect(guard).toContain('index_row.indisvalid = true')
    expect(guard).toContain('index_row.indisready = true')
    expect(guard).toContain('index_row.indpred IS NULL')
    expect(guard).toContain('index_row.indexprs IS NULL')
    expect(guard).toContain('index_row.indnkeyatts = 1')
    expect(guard).toContain('index_row.indnatts = 1')
    expect(guard).toContain("attribute.atttypid = 'uuid'::regtype")
    expect(guard).toContain('attribute.attnotnull = false')
    expect(guard).toContain('attribute.atthasdef = false')
    expect(guard).toContain("attribute.attgenerated = ''")
    expect(guard).toContain("'pg_policy'::regclass")
    expect(guard).toContain("'pg_rewrite'::regclass")
    expect(guard).toContain("'pg_trigger'::regclass")
    expect(guard).toContain("'pg_proc'::regclass")
    expect(guard).toContain("'pg_attrdef'::regclass")
    expect(guard).toContain('pg_publication_rel')
    expect(guard).toContain('reviewed_dependency_count <> 18')
    for (const table of [
      "('public', 'property_owners')",
      "('public', 'property_ownership')",
      "('public', 'ownership')",
      "('public', 'property_name_aliases')",
      "('public', 'property_reporting_map')",
      "('lifecycle', 'property_acquisition')",
      "('lifecycle', 'service_engagements')",
      "('lifecycle', 'management_fee_configs')",
      "('pms', 'property_mappings')",
    ]) {
      expect(guard).toContain(table)
    }
    expect(rollback).not.toContain('CASCADE')
    expect(rollback).not.toMatch(/DELETE FROM/i)
    expect(rollback).not.toContain('DROP TABLE')
    expect(rollback).not.toMatch(/\bDEFAULT\b/i)
    expect(rollback).not.toContain('SET operating_company_id')
  })

  it('does not bypass the company identity guard', () => {
    const files = [migration, rollback, matrix, runner]
    for (const file of files) {
      expect(file).not.toMatch(/DISABLE TRIGGER/i)
      expect(file).not.toMatch(/ENABLE TRIGGER/i)
      expect(file).not.toContain('ALTER TABLE registry.companies')
      expect(file).not.toContain('CREATE OR REPLACE FUNCTION')
    }
  })

  it('runs failure cases through EXECUTE instead of a nested DO statement', () => {
    const artifact = execFileSync(
      'node',
      [path.join(root, 'scripts/run-property-children-operating-company-matrix.cjs')],
      { cwd: root, encoding: 'utf8' },
    ).trim()
    const generated = fs.readFileSync(artifact, 'utf8')
    const { assertNoDirectNestedDo } = require(path.join(
      root,
      'scripts/run-property-children-operating-company-matrix.cjs',
    )) as { assertNoDirectNestedDo: (sql: string) => void }
    expect(() => assertNoDirectNestedDo(generated)).not.toThrow()
    expect(generated).toContain('EXECUTE $phase3_run$')
    expect(generated).toContain('DO $drift$')
    expect(generated).toContain('DO $rollback$')
  })
})
