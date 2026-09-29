import { readFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(__dirname, '..', '..', '..')

function read(file: string): string {
  return readFileSync(path.join(root, file), 'utf8')
}

describe('company member read isolation', () => {
  const migration = read(
    'supabase/migrations/20260930120000_company_member_read_isolation.sql',
  )
  const rollback = read(
    'supabase/rollbacks/20260930120000_company_member_read_isolation_rollback.sql',
  )
  const matrix = read(
    'supabase/tests/20260930120000_company_member_read_isolation_matrix.sql',
  )
  const runner = read('scripts/run-company-member-read-isolation-matrix.cjs')

  test('keeps reads inside the caller membership', () => {
    for (const file of [migration, rollback, matrix, runner]) {
      expect(file.includes('\r')).toBe(false)
      expect(file).not.toContain('10f6e9b3-c5b9-4d95-a318-48f20f89477f')
    }
    expect(migration).toContain('<> 191')
    expect(migration).toContain("version = '20260929200000'")
    expect(migration).toContain('AS RESTRICTIVE')
    expect(migration).toContain('access.is_company_member(operating_company_id)')
    expect(migration).not.toContain('INSERT INTO registry.companies')
    expect(migration).not.toContain('set_config(')
    expect(rollback.match(/DROP POLICY company_member_read/g)).toHaveLength(7)
    expect(matrix).toContain('two_member_does_not_see_other_property')
    expect(matrix).toContain('two_member_does_not_see_other_draft')
    expect(matrix).toContain('two_service_role_bypasses_rls')
    expect(matrix).toContain('one_nonmember_sees_no_properties')
    expect(runner).toContain(".replaceAll('@@MIGRATION@@', () => migration)")
    expect(runner).toContain(".replaceAll('@@ROLLBACK@@', () => rollback)")
  })
})
