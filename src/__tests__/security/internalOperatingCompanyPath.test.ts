import fs from 'fs'
import path from 'path'

const root = path.resolve(__dirname, '../../..')

function read(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

const migration = read('supabase/migrations/20260929200000_internal_operating_company_path.sql')
const rollback = read('supabase/rollbacks/20260929200000_internal_operating_company_path_rollback.sql')
const matrix = read('supabase/tests/20260929200000_internal_operating_company_path_matrix.sql')
const runner = read('scripts/run-internal-operating-company-path-matrix.cjs')

describe('internal operating company path', () => {
  test('keeps the internal path ungranted and rejects a caller uuid', () => {
    for (const file of [migration, rollback, matrix, runner]) {
      expect(file.includes('\r')).toBe(false)
      expect(file).not.toContain('10f6e9b3-c5b9-4d95-a318-48f20f89477f')
    }
    expect(migration).toContain('<> 190')
    expect(migration).toContain("version = '20260929120000') <> 1")
    expect(migration).toContain('internal_company_write_permit')
    expect(migration).toContain('REVOKE ALL ON FUNCTION access.arm_internal_operating_company(uuid) FROM anon, authenticated, service_role')
    expect(migration).toContain("position('set_config' in proc.prosrc) = 0")
    expect(migration).not.toContain('set_config(')
    expect(migration).not.toContain('INSERT INTO registry.companies')
    expect(rollback).toContain('a121404d82f0a9d9c1cbe174165b01d1')
    expect(rollback).toContain('b21dc8fe041869cd7f790aca90e9372a')
    expect(rollback).toContain('9f99e4749d6345398ae272c2355ca315')
    expect(rollback).toContain('DROP TABLE access.internal_company_write_permit')
    expect(matrix).toContain('two_guc_does_not_authorize')
    expect(matrix).toContain('two_engagement_inherits_parent')
    expect(migration).toContain('idempotency_key stays globally UNIQUE')
    expect(migration).not.toContain('UNIQUE (operating_company_id, idempotency_key)')
    expect(migration).toContain('d.operating_company_id')
    expect(matrix).toContain('two_draft_key_other_company_blocked')
    expect(matrix).toContain('one_draft_reuse_same_company')
    expect(matrix).toContain('two_draft_omit_blocked')
    expect(matrix).toContain('@@MIGRATION@@')
    expect(matrix).toContain('@@ROLLBACK@@')
    expect(runner).toContain(".replaceAll('@@MIGRATION@@', () => migration)")
    expect(runner).toContain(".replaceAll('@@ROLLBACK@@', () => rollback)")
  })
})
