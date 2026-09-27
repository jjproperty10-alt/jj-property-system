import { execFileSync } from 'child_process'
import fs from 'fs'
import path from 'path'

const root = path.resolve(__dirname, '..', '..', '..')
const migration = fs.readFileSync(
  path.join(root, 'supabase/migrations/20260926160000_property_children_operating_company_jj_backfill.sql'),
  'utf8',
)
const rollback = fs.readFileSync(
  path.join(root, 'supabase/rollbacks/20260926160000_property_children_operating_company_jj_backfill_rollback.sql'),
  'utf8',
)
const matrix = fs.readFileSync(
  path.join(root, 'supabase/tests/20260926160000_property_children_operating_company_backfill_matrix.sql'),
  'utf8',
)
const runner = fs.readFileSync(
  path.join(root, 'scripts/run-property-children-operating-company-backfill-matrix.cjs'),
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

function updatesOnlyCompany(sql: string) {
  const updates = sql.match(/UPDATE\s+[\s\S]*?;/g) ?? []
  expect(updates.length).toBeGreaterThan(0)
  for (const statement of updates) {
    expect(statement).toMatch(/SET operating_company_id =/)
    expect(statement).not.toMatch(/\bJOIN\b/i)
    expect(statement).not.toMatch(/\bFROM\b/i)
  }
}

describe('property children operating company backfill', () => {
  it('assigns the nine child tables directly to the canonical company', () => {
    const updateAt = migration.indexOf('UPDATE public.property_owners')
    const guard = migration.slice(0, updateAt)
    expect(updateAt).toBeGreaterThan(0)
    expect(guard).toContain('LOCK TABLE lifecycle.management_fee_configs IN SHARE ROW EXCLUSIVE MODE')
    expect(guard).toContain('LOCK TABLE public.property_reporting_map IN SHARE ROW EXCLUSIVE MODE')
    expect(guard.indexOf('LOCK TABLE')).toBeLessThan(guard.indexOf('FROM public.property_owners'))
    expect(guard).toContain('BLOCKED_BY_BACKFILL: company registry')
    expect(guard).toContain('BLOCKED_BY_BACKFILL: membership')
    expect(guard).toContain('BLOCKED_BY_BACKFILL: history')
    expect(guard).toContain('BLOCKED_BY_BACKFILL: root column')
    expect(guard).toContain('BLOCKED_BY_BACKFILL: root registry')
    expect(guard).toContain('BLOCKED_BY_BACKFILL: child schema')
    expect(guard).toContain('BLOCKED_BY_BACKFILL: row count')
    expect(guard).toContain('BLOCKED_BY_BACKFILL: preexisting assignment')
    expect(guard).toContain('BLOCKED_BY_BACKFILL: global pin')
    expect(guard).toContain("'10f6e9b3-c5b9-4d95-a318-48f20f89477f'")
    expect(guard).toContain("status = 'active'")
    expect(guard).toContain('20260925120000')
    expect(guard).toContain('20260925140000')
    expect(guard).toContain('20260926120000')
    expect(guard).toContain('20260926140000')
    expect(guard).toContain('20260926160000')
    expect(guard).toContain('<> 262')
    expect(migration).toContain('updated_property_owners <> 92')
    expect(migration).toContain('updated_property_ownership <> 73')
    expect(migration).toContain('updated_ownership <> 0')
    expect(migration).toContain('updated_property_name_aliases <> 54')
    expect(migration).toContain('updated_property_reporting_map <> 9')
    expect(migration).toContain('updated_property_acquisition <> 2')
    expect(migration).toContain('updated_service_engagements <> 24')
    expect(migration).toContain('updated_management_fee_configs <> 0')
    expect(migration).toContain('updated_property_mappings <> 8')
    expect(migration).toContain('<> 262')
    for (const table of tables) {
      expect(migration).toContain(`UPDATE ${table}`)
      expect(migration).toContain(`FROM ${table}`)
    }
    expect(migration.match(/SET operating_company_id = jj_company/g)).toHaveLength(9)
    expect(migration.match(/WHERE operating_company_id IS NULL;/g)).toHaveLength(9)
    updatesOnlyCompany(migration.slice(updateAt))
  })

  it('keeps schema, ledger, and history writes out of the assignment', () => {
    for (const source of [migration, rollback]) {
      expect(source).not.toMatch(/\bINSERT\b/i)
      expect(source).not.toMatch(/\bDELETE\b/i)
      expect(source).not.toMatch(/\bTRUNCATE\b/i)
      expect(source).not.toMatch(/\bMERGE\b/i)
      expect(source).not.toMatch(/\bALTER\b/i)
      expect(source).not.toMatch(/\bDROP\b/i)
      expect(source).not.toMatch(/\bDEFAULT\b/i)
      expect(source).not.toMatch(/SET NOT NULL/i)
      expect(source).not.toMatch(/\bADD\b/i)
      expect(source).not.toContain('CREATE POLICY')
      expect(source).not.toContain('ENABLE ROW LEVEL SECURITY')
      expect(source).not.toContain('CREATE TRIGGER')
      expect(source).not.toContain('CREATE OR REPLACE FUNCTION')
      expect(source).not.toMatch(/DISABLE TRIGGER/i)
      expect(source).not.toMatch(/ENABLE TRIGGER/i)
      expect(source).not.toMatch(/INSERT\s+INTO\s+supabase_migrations/i)
      expect(source).not.toMatch(/DELETE\s+FROM\s+supabase_migrations/i)
      expect(source).not.toMatch(/UPDATE\s+supabase_migrations/i)
    }
    expect(migration).not.toMatch(/UPDATE[\s\S]*\bJOIN\s+public\.properties\b/i)
    expect(migration).not.toMatch(/UPDATE[\s\S]*\bJOIN\s+public\.property_definitions\b/i)
    expect(migration).toContain('v_certified_ledger_transactions')
    expect(migration).toContain('ca7ceb8841f66d974dc72b972be902c3')
    expect(migration).toContain('1b014d4d7f0fa074f6ad3f50a7181e34')
    expect(migration).toContain('fbf261e717ed8a67f26e9ae35e344c54')
    expect(migration).toContain('39c35feee3d904605b3606f32e1d3f45')
    expect(migration).toContain('1e4cd7f35cfd5df00a734d7b7b9d020c')
    expect(migration).toContain('trg_transactions_append_only')
    expect(migration).toContain('companies_uuid_guard')
  })

  it('validates every child table before the rollback update', () => {
    const updateAt = rollback.indexOf('SET operating_company_id = NULL')
    const guard = rollback.slice(0, updateAt)
    expect(updateAt).toBeGreaterThan(0)
    expect(guard).toContain('LOCK TABLE lifecycle.management_fee_configs IN SHARE ROW EXCLUSIVE MODE')
    expect(guard).toContain('BLOCKED_BY_ROLLBACK: row count')
    expect(guard).toContain('BLOCKED_BY_ROLLBACK: assignment')
    expect(guard).toContain('BLOCKED_BY_ROLLBACK: history')
    expect(guard).toContain('column_count <> 9 OR foreign_key_count <> 9 OR index_count <> 9')
    expect(guard).toContain('reviewed_dependency_count <> 18')
    expect(guard).toContain("'pg_policy'::regclass")
    expect(guard).toContain("'pg_attrdef'::regclass")
    expect(guard).toContain('20260926160000')
    expect(guard).toContain("'10f6e9b3-c5b9-4d95-a318-48f20f89477f'")
    for (const table of tables) {
      expect(guard).toContain(table)
    }
    expect(rollback).toContain('cleared_property_owners <> 92')
    expect(rollback).toContain('cleared_property_mappings <> 8')
    expect(rollback).toContain('<> 262')
    expect(rollback.match(/SET operating_company_id = NULL/g)).toHaveLength(9)
    updatesOnlyCompany(rollback.slice(updateAt))
  })

  it('does not bypass the company identity guard', () => {
    for (const source of [migration, rollback, matrix, runner]) {
      expect(source).not.toMatch(/DISABLE TRIGGER/i)
      expect(source).not.toMatch(/ENABLE TRIGGER/i)
      expect(source).not.toContain('ALTER TABLE registry.companies')
      expect(source).not.toContain('CREATE OR REPLACE FUNCTION')
    }
  })

  it('runs failure cases through EXECUTE instead of a nested DO statement', () => {
    const artifact = execFileSync(
      'node',
      [path.join(root, 'scripts/run-property-children-operating-company-backfill-matrix.cjs')],
      { cwd: root, encoding: 'utf8' },
    ).trim()
    const generated = fs.readFileSync(artifact, 'utf8')
    const { assertNoDirectNestedDo } = require(path.join(
      root,
      'scripts/run-property-children-operating-company-backfill-matrix.cjs',
    )) as { assertNoDirectNestedDo: (sql: string) => void }
    expect(() => assertNoDirectNestedDo(generated)).not.toThrow()
    expect(generated).toContain('EXECUTE $phase31_run$')
    expect(generated).toContain('DO $backfill$')
    expect(generated).toContain('DO $rollback$')
    expect(generated.startsWith('\nBEGIN;') || generated.startsWith('BEGIN;')).toBe(true)
    expect(generated.trimEnd().endsWith('ROLLBACK;')).toBe(true)
  })
})
