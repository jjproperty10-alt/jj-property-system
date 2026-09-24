import { readFileSync } from 'fs'
import { join } from 'path'

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260924210000_access_company_memberships.sql'),
  'utf8',
)
const rollback = readFileSync(
  join(process.cwd(), 'supabase/rollbacks/20260924210000_access_company_memberships_rollback.sql'),
  'utf8',
)

describe('company membership foundation', () => {
  it('uses company_id and one membership per user per company', () => {
    expect(migration).toContain('CREATE SCHEMA access')
    expect(migration).toContain('CREATE TABLE access.company_memberships')
    expect(migration).toContain(
      'FOREIGN KEY (company_id) REFERENCES registry.companies (company_id) ON DELETE RESTRICT',
    )
    expect(migration).toContain(
      'FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE',
    )
    expect(migration).toContain('UNIQUE (company_id, user_id)')
    expect(migration).not.toContain('operating_company_id')
    expect(migration).not.toContain('CREATE TABLE registry.companies')
  })

  it('keeps role and active state closed', () => {
    expect(migration).toContain(
      "CHECK (membership_role = ANY (ARRAY['company_admin'::text, 'member'::text]))",
    )
    expect(migration).toContain('is_active boolean NOT NULL DEFAULT true')
    expect(migration).toContain('created_at timestamptz NOT NULL')
    expect(migration).toContain('updated_at timestamptz NOT NULL')
    expect(migration).toContain('BLOCKED_BY_IMMUTABLE_IDENTITY')
  })

  it('fails closed for non-members, inactive rows, and a missing company', () => {
    expect(migration).toContain('CREATE FUNCTION access.is_company_member(target_company_id uuid)')
    expect(migration).toContain('CREATE FUNCTION access.is_company_admin(target_company_id uuid)')
    expect(migration).toContain('target_company_id IS NOT NULL')
    expect(migration).toContain('membership.is_active')
    expect(migration).toContain("membership.membership_role = 'company_admin'")
    expect(migration).toContain('SET search_path = pg_catalog')
    expect(migration).toContain('USING (user_id = (SELECT auth.uid()) AND is_active)')
    const memberFn = migration.slice(
      migration.indexOf('CREATE FUNCTION access.is_company_member'),
      migration.indexOf('CREATE FUNCTION access.is_company_admin'),
    )
    const adminFn = migration.slice(
      migration.indexOf('CREATE FUNCTION access.is_company_admin'),
      migration.indexOf('CREATE FUNCTION access.grant_company_membership'),
    )
    expect(memberFn).not.toContain('SECURITY DEFINER')
    expect(adminFn).not.toContain('SECURITY DEFINER')
  })

  it('denies anon and blocks self-grant or role elevation', () => {
    expect(migration).toContain(
      'REVOKE ALL ON FUNCTION access.is_company_member(uuid) FROM PUBLIC, anon',
    )
    expect(migration).toContain(
      'REVOKE ALL ON FUNCTION access.is_company_admin(uuid) FROM PUBLIC, anon',
    )
    expect(migration).toContain(
      'REVOKE ALL ON TABLE access.company_memberships FROM PUBLIC, anon, authenticated',
    )
    expect(migration).toContain('GRANT SELECT ON TABLE access.company_memberships TO authenticated')
    expect(migration).not.toMatch(/GRANT (INSERT|UPDATE|DELETE|ALL) ON TABLE access\.company_memberships TO authenticated/)
    expect(migration).toContain('SECURITY DEFINER')
    expect(migration).toContain('BLOCKED_BY_SELF_GRANT')
    expect(migration).toContain('BLOCKED_BY_AUTHORIZATION')
    expect(migration).toContain('BLOCKED_BY_COMPANY_CONTEXT')
    expect(migration).toContain("target_user_id = (SELECT auth.uid())")
  })

  it('bootstraps one JJ admin without a second company or a personal id', () => {
    expect(migration).toContain("'10f6e9b3-c5b9-4d95-a318-48f20f89477f'")
    expect(migration).toContain('UNION')
    expect(migration).toContain("staff_row.staff_role = 'ceo'")
    expect(migration).toContain("role_row.role = 'superadmin'")
    expect(migration).toContain('inserted_count <> 1')
    expect(migration.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g)).toEqual([
      '10f6e9b3-c5b9-4d95-a318-48f20f89477f',
    ])
    expect(migration).not.toMatch(/INSERT INTO registry\.companies/i)
    expect(migration).not.toMatch(/public\.transactions|v_certified_ledger|v_rc3_classified|v_cashbox_audit|v_jj_company_pl/)
  })

  it('documents service_role as the bypass administration path', () => {
    expect(migration).toContain('service_role has rolbypassrls')
    expect(migration).toContain(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE access.company_memberships TO service_role',
    )
  })

  it('rolls back the reviewed objects explicitly and aborts on anything else', () => {
    expect(rollback).toContain('BLOCKED_BY_ROLLBACK: unexpected access objects')
    expect(rollback).toContain('BLOCKED_BY_ROLLBACK: unexpected dependency on access')
    expect(rollback).toContain('DROP POLICY read_own_active_company_membership ON access.company_memberships')
    expect(rollback).toContain('DROP TRIGGER company_memberships_identity_immutable ON access.company_memberships')
    expect(rollback).toContain('DROP FUNCTION access.grant_company_membership(uuid, uuid, text)')
    expect(rollback).toContain('DROP FUNCTION access.is_company_admin(uuid)')
    expect(rollback).toContain('DROP FUNCTION access.is_company_member(uuid)')
    expect(rollback).toContain('DROP FUNCTION access.reject_membership_identity_change()')
    expect(rollback).toContain('DROP CONSTRAINT company_memberships_one_per_user_company')
    expect(rollback).toContain('DROP CONSTRAINT company_memberships_pkey')
    expect(rollback).toContain('DROP INDEX access.company_memberships_user_id_idx')
    expect(rollback).toContain('DROP TABLE access.company_memberships')
    expect(rollback).toContain('DROP SCHEMA access')
    expect(rollback).not.toContain('CASCADE')
    expect(rollback).not.toMatch(/DELETE FROM|DROP TABLE registry|DROP TABLE auth/)
  })
})
