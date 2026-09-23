import { existsSync, readdirSync } from 'fs'
import { join } from 'path'

const repoRoot = join(__dirname, '..', '..', '..')
const migrationsDir = join(repoRoot, 'supabase', 'migrations')

describe('production RLS migration boundary', () => {
  test('the staging public-table migration is not in the migration directory', () => {
    const names = readdirSync(migrationsDir)
    expect(names).not.toContain('20260923_001_rls_advisor_public_tables.sql')
    expect(names.filter(name => name.includes('rls_advisor') || name.includes('production_rls_stage'))).toEqual([])
    expect(existsSync(join(migrationsDir, '20260923_001_rls_advisor_public_tables.sql'))).toBe(false)
  })
})
