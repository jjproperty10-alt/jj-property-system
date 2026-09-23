import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'

const repoRoot = join(__dirname, '..', '..', '..')
const migrationsDir = join(repoRoot, 'supabase', 'migrations')

describe('production RLS migration boundary', () => {
  const names = readdirSync(migrationsDir)

  test('the staging public-table migration is not in the migration directory', () => {
    expect(names).not.toContain('20260923_001_rls_advisor_public_tables.sql')
    expect(names.filter(name => name.includes('rls_advisor') || name.includes('production_rls_stage'))).toEqual([])
    expect(existsSync(join(migrationsDir, '20260923_001_rls_advisor_public_tables.sql'))).toBe(false)
  })

  test('the applied 23 September lockdown is recorded without granting public access', () => {
    const file = names.find(name => name.includes('record_applied_staff_lockdown'))
    expect(file).toBe('20260923120000_record_applied_staff_lockdown.sql')
    const sql = readFileSync(join(migrationsDir, file!), 'utf8')
    expect(sql).toContain('finance.is_active_jj_staff()')
    expect(sql).not.toContain('public.is_active_jj_staff')
    expect(sql).not.toContain('FORCE ROW LEVEL SECURITY')
    expect(sql).not.toMatch(/GRANT\s+SELECT[\s\S]*TO\s+anon/i)
    expect(sql).toContain('REVOKE ALL ON TABLE')
    expect(sql).toContain('v_cashbox_audit')
    expect(sql).toContain('v_unmapped_queue')
    expect(sql.indexOf('RETURN')).toBeGreaterThan(-1)
    expect(sql.indexOf('DROP POLICY')).toBeGreaterThan(sql.indexOf('RETURN'))
  })

  test('the rental contract policy revokes anon and keeps staff-only access', () => {
    const file = '20260923130000_rental_contracts_staff_only.sql'
    const sql = readFileSync(join(migrationsDir, file), 'utf8')
    expect(sql).toContain('DROP POLICY IF EXISTS auth_all_contracts')
    expect(sql).toContain('finance.is_active_jj_staff()')
    expect(sql).toContain('REVOKE ALL ON TABLE public.rental_contracts FROM anon')
    expect(sql).not.toMatch(/GRANT[\s\S]*TO\s+anon/i)
    expect(sql).not.toContain('lifecycle.rental_contracts')
    expect(sql.indexOf('RETURN')).toBeGreaterThan(-1)
    expect(sql.indexOf('DROP POLICY')).toBeGreaterThan(sql.indexOf('RETURN'))
  })
})

