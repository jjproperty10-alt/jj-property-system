import fs from 'fs'
import path from 'path'

const root = path.resolve(__dirname, '..', '..', '..')
const migration = fs.readFileSync(
  path.join(root, 'supabase/migrations/20260925120000_properties_operating_company_id.sql'),
  'utf8',
)
const rollback = fs.readFileSync(
  path.join(root, 'supabase/rollbacks/20260925120000_properties_operating_company_id_rollback.sql'),
  'utf8',
)

describe('properties operating company slice', () => {
  it('adds a nullable company key with a restrict foreign key and no default', () => {
    expect(migration).toContain('ADD COLUMN operating_company_id uuid')
    expect(migration).toContain('REFERENCES registry.companies (company_id)')
    expect(migration).toContain('ON DELETE RESTRICT')
    expect(migration).not.toMatch(/DEFAULT/i)
    expect(migration).not.toMatch(/NOT NULL/i)
    expect(migration).not.toMatch(/SET NULL/i)
    expect(migration).not.toContain('ENABLE ROW LEVEL SECURITY')
    expect(migration).not.toContain('CREATE POLICY')
  })

  it('does not hard-code one company id', () => {
    expect(migration).not.toContain('10f6e9b3-c5b9-4d95-a318-48f20f89477f')
    expect(migration).not.toContain('jj_check')
    expect(rollback).not.toContain('jj_check')
  })

  it('aborts when the column, constraint, index, or company key already drifted', () => {
    expect(migration).toContain('BLOCKED_BY_SCHEMA_DRIFT')
    expect(migration).toContain("company_column.attname = 'company_id'")
    expect(migration).toContain('properties_operating_company_id_idx')
    expect(migration).toContain('property_definitions_operating_company_id_idx')
  })

  it('does not backfill or touch ledger, views, or PMS objects', () => {
    expect(migration).not.toMatch(/UPDATE\s+public\.(properties|property_definitions)/i)
    expect(migration).not.toContain('public.transactions')
    expect(migration).not.toContain('transaction_exclusions')
    expect(migration).not.toContain('v_certified_ledger_transactions')
    expect(migration).not.toContain('v_rc3_classified')
    expect(migration).not.toContain('pms.')
    expect(migration).not.toContain('INSERT INTO registry.companies')
    expect(migration).not.toContain('access.company_memberships')
  })

  it('rolls the reviewed objects back without a cascading drop', () => {
    expect(rollback).toContain('DROP CONSTRAINT properties_operating_company_fk')
    expect(rollback).toContain('DROP CONSTRAINT property_definitions_operating_company_fk')
    expect(rollback).toContain('DROP INDEX public.properties_operating_company_id_idx')
    expect(rollback).toContain('DROP COLUMN operating_company_id')
    expect(rollback).toContain('BLOCKED_BY_ROLLBACK: unexpected dependency')
    expect(rollback).not.toContain('CASCADE')
    expect(rollback).not.toMatch(/DELETE FROM/i)
    expect(rollback).not.toContain('DROP TABLE')
  })
})
