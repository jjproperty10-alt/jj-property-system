import { readFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(__dirname, '..', '..', '..')

function read(file: string): string {
  return readFileSync(path.join(root, file), 'utf8')
}

describe('canonical name unique per company draft', () => {
  const migration = read('supabase/migrations/20261003140000_canonical_name_unique_per_company.sql')
  const rollback = read('supabase/rollbacks/20261003140000_canonical_name_unique_per_company_rollback.sql')
  const matrix = read('supabase/tests/20261003140000_canonical_name_unique_per_company_matrix.sql')

  test('fail-closes on index text and does not hard-code a company', () => {
    for (const file of [migration, rollback, matrix]) {
      expect(file.includes('\r')).toBe(false)
      expect(file).not.toContain('10f6e9b3-c5b9-4d95-a318-48f20f89477f')
      expect(file).not.toContain('00000000-0000-4000-8000-00000000000a')
      expect(file).not.toContain("version = '20260930220000'")
    }

    expect(migration).toContain("version = '20261003140000'")
    expect(migration).toContain('BLOCKED_BY_HISTORY')
    expect(migration).toContain('BLOCKED_BY_INDEXDEF')
    expect(migration).toContain('BLOCKED_BY_COMPANY_CONTEXT')
    expect(migration).toContain('access.resolve_verified_operating_company(NULL, false)')
    expect(migration).toContain('APPLYING THIS BLOCK REQUIRES YOSSI')
    expect(migration).toContain(
      'CREATE UNIQUE INDEX entity_registry_canonical_name_key ON public.entity_registry USING btree (canonical_name)',
    )
    expect(migration).toContain(
      'CREATE UNIQUE INDEX entities_canonical_name_key ON public.entities USING btree (canonical_name)',
    )
    expect(migration).not.toContain('DROP INDEX lifecycle.entity_identity_canonical_name_uq')
    expect(migration).not.toContain("WHERE canonical_name = 'JJ Property 10'")

    const enforce = migration.split('$enforce$')[1]
    expect(enforce).toContain('access.resolve_verified_operating_company')
    expect(enforce).not.toContain('canonical_name')

    expect(rollback).toContain('CREATE UNIQUE INDEX entity_registry_canonical_name_key')
    expect(rollback).toContain('CREATE UNIQUE INDEX entities_canonical_name_key')
    expect(rollback).toContain('DROP COLUMN operating_company_id')
    expect(rollback).toContain('BLOCKED_BY_ROLLBACK: canonical_name collision')
    expect(matrix).toContain('zero_active_refuses')
    expect(matrix).toContain('two_active_refuses')
    expect(matrix).toContain('same_name_two_companies')
    expect(matrix).toContain('duplicate_within_company_rejected')
    expect(matrix).toContain('null_company_rejected')
    expect(matrix).toContain('rollback_restores_indexdef')
  })
})
