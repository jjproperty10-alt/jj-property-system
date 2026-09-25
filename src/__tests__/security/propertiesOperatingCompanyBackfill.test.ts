import fs from 'fs'
import path from 'path'

const root = path.resolve(__dirname, '..', '..', '..')
const migration = fs.readFileSync(
  path.join(root, 'supabase/migrations/20260925140000_properties_operating_company_jj_backfill.sql'),
  'utf8',
)
const rollback = fs.readFileSync(
  path.join(root, 'supabase/rollbacks/20260925140000_properties_operating_company_jj_backfill_rollback.sql'),
  'utf8',
)
const matrix = fs.readFileSync(
  path.join(root, 'supabase/tests/20260925140000_properties_operating_company_backfill_matrix.sql'),
  'utf8',
)
const runner = fs.readFileSync(
  path.join(root, 'scripts/run-properties-operating-company-backfill-matrix.cjs'),
  'utf8',
)

describe('property operating company backfill', () => {
  it('assigns only null company keys and aborts before an update', () => {
    const updateAt = migration.indexOf('UPDATE public.properties')
    const guardAt = migration.indexOf('BLOCKED_BY_BACKFILL: company registry')
    expect(guardAt).toBeGreaterThan(-1)
    expect(updateAt).toBeGreaterThan(guardAt)
    expect(migration).toContain('SET operating_company_id = jj_company')
    expect(migration).toContain('WHERE operating_company_id IS NULL')
    expect(migration).toContain('updated_properties <> 40')
    expect(migration).toContain('updated_definitions <> 45')
    expect(migration).not.toMatch(/\bDEFAULT\b/)
    expect(migration).not.toMatch(/SET NOT NULL/)
    expect(migration).not.toMatch(/ADD COLUMN/)
    expect(migration).not.toContain('ENABLE ROW LEVEL SECURITY')
    expect(migration).not.toContain('CREATE POLICY')
  })

  it('requires the single company to be the active JJ company', () => {
    const statusAt = migration.indexOf("status = 'active'")
    const updateAt = migration.indexOf('UPDATE public.properties')
    expect(statusAt).toBeGreaterThan(-1)
    expect(updateAt).toBeGreaterThan(statusAt)
    expect(migration).toContain('BLOCKED_BY_BACKFILL: company registry')
  })

  it('does not bypass the company identity guard', () => {
    for (const source of [migration, rollback, matrix, runner]) {
      expect(source).not.toMatch(/DISABLE TRIGGER/i)
      expect(source).not.toMatch(/ENABLE TRIGGER/i)
      expect(source).not.toMatch(/ALTER TABLE registry\.companies/i)
      expect(source).not.toMatch(/CREATE OR REPLACE FUNCTION/i)
    }
  })

  it('guards the reviewed company, counts, keys, membership, and slice 2.1', () => {
    expect(migration).toContain("'10f6e9b3-c5b9-4d95-a318-48f20f89477f'")
    expect(migration).toContain('BLOCKED_BY_BACKFILL: row count')
    expect(migration).toContain('BLOCKED_BY_BACKFILL: preexisting assignment')
    expect(migration).toContain('BLOCKED_BY_BACKFILL: membership')
    expect(migration).toContain('BLOCKED_BY_BACKFILL: slice 2.1 history')
    expect(migration).toContain('20260925120000')
    expect(migration).toContain('properties_operating_company_fk')
    expect(migration).toContain("confdeltype = 'r'")
  })

  it('does not touch the ledger, views, or PMS', () => {
    expect(migration).not.toContain('public.transactions')
    expect(migration).not.toContain('v_certified_ledger_transactions')
    expect(migration).not.toContain('pms.')
    expect(migration).not.toContain('INSERT INTO registry.companies')
    expect(migration).not.toContain('INSERT INTO public.properties')
  })

  it('restores null only from the clean JJ assignment', () => {
    expect(rollback).toContain('BLOCKED_BY_ROLLBACK: mixed company')
    expect(rollback).toContain('BLOCKED_BY_ROLLBACK: row count')
    expect(rollback).toContain('SET operating_company_id = NULL')
    expect(rollback).toContain('cleared_properties <> 40')
    expect(rollback).toContain('cleared_definitions <> 45')
    expect(rollback).not.toContain('CASCADE')
    expect(rollback).not.toMatch(/DELETE FROM/i)
    expect(rollback.indexOf('BLOCKED_BY_ROLLBACK: mixed company')).toBeLessThan(
      rollback.indexOf('SET operating_company_id = NULL'),
    )
  })
})
