import { readFileSync } from 'fs'
import { join } from 'path'

const sql = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260924180000_employee_config_staff_and_definer_search_path.sql',
  ),
  'utf8',
)

describe('foundation hardening migration', () => {
  it('limits update to the active ceo or superadmin helper', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION finance.is_active_jj_admin()')
    expect(sql).toContain("staff_row.staff_role = 'ceo'")
    expect(sql).toContain("role_row.role = 'superadmin'")
    expect(sql).toContain('USING (finance.is_active_jj_staff() OR finance.is_active_jj_admin())')
    expect(sql).toContain('USING (finance.is_active_jj_admin())')
    expect(sql).toContain('SET search_path = pg_catalog')
    expect(sql).toContain('REVOKE ALL ON FUNCTION finance.is_active_jj_admin() FROM PUBLIC')
    expect(sql).toContain('REVOKE ALL ON FUNCTION finance.is_active_jj_admin() FROM anon')
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION finance.is_active_jj_admin() TO authenticated')
  })

  it('drops only the two reviewed legacy policies and aborts on drift', () => {
    expect(sql).toContain("ARRAY['auth_all_employees', 'auth_write_employee_config']")
    expect(sql).toContain("roles IS DISTINCT FROM ARRAY['public']::name[]")
    expect(sql).toContain("permissive IS DISTINCT FROM 'PERMISSIVE'")
    expect(sql).toContain('BLOCKED_BY_POLICY_DRIFT')
    expect(sql).toContain('DROP POLICY auth_all_employees')
    expect(sql).toContain('DROP POLICY auth_write_employee_config')
    expect(sql).not.toMatch(/FOR policy_name IN/)
  })

  it('pins the five function body hashes and does not replace those bodies', () => {
    for (const hash of [
      'a1fafaf84da07f26dc9d03fe9f4cde98',
      '76caa884ab258aa906a49e22bc2a60d0',
      '95965998ccd72a1def58e4d86878860a',
      'be7b77fa642d0e64dfdd0714c4a51232',
      'd9d7c8bf8863649520cf26951ddf2643',
    ]) {
      expect(sql).toContain(hash)
    }
    expect(sql).toContain('ALTER FUNCTION %s SET search_path = pg_catalog')
    expect(sql).toContain('BLOCKED_BY_FUNCTION_DEFINITION_DRIFT')
    expect(sql).not.toMatch(/CREATE OR REPLACE FUNCTION ops\./)
    expect(sql).not.toMatch(/CREATE OR REPLACE FUNCTION public\.resolve_party_id/)
  })

  it('does not grant browser insert, delete, or truncate', () => {
    expect(sql).toContain(
      'REVOKE INSERT, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.employee_config FROM PUBLIC, anon, authenticated',
    )
    expect(sql).not.toContain('GRANT INSERT')
    expect(sql).not.toContain('GRANT ALL')
  })
})
