import fs from 'fs'
import path from 'path'

const root = path.resolve(__dirname, '../../..')
const migrationPath = path.join(
  root,
  'supabase/migrations/20260929120000_verified_operating_company_context.sql',
)
const rollbackPath = path.join(
  root,
  'supabase/rollbacks/20260929120000_verified_operating_company_context_rollback.sql',
)
const matrixPath = path.join(
  root,
  'supabase/tests/20260929120000_verified_operating_company_context_matrix.sql',
)
const runnerPath = path.join(root, 'scripts/run-verified-operating-company-context-matrix.cjs')
const migrationBytes = fs.readFileSync(migrationPath)
const rollbackBytes = fs.readFileSync(rollbackPath)
const matrixBytes = fs.readFileSync(matrixPath)
const runnerBytes = fs.readFileSync(runnerPath)
const migration = migrationBytes.toString('utf8')
const rollback = rollbackBytes.toString('utf8')
const matrix = matrixBytes.toString('utf8')

describe('verified operating company context', () => {
  it('keeps the slice files LF and refuses an unverified company uuid', () => {
    for (const bytes of [migrationBytes, rollbackBytes, matrixBytes, runnerBytes]) {
      expect(bytes.includes(0x0d)).toBe(false)
    }
    expect(migration).not.toContain('10f6e9b3-c5b9-4d95-a318-48f20f89477f')
    expect(rollback).not.toContain('10f6e9b3-c5b9-4d95-a318-48f20f89477f')
    expect(migration).not.toMatch(/\bEXECUTE\b/)
    expect(migration).not.toContain('set_config(')
    expect(migration).not.toContain('ALTER TABLE')
    expect(migration).not.toContain('CREATE POLICY')
    expect(migration).not.toContain('CREATE TRIGGER')
    expect(migration).not.toContain('INSERT INTO registry.companies')
    expect(migration).not.toContain('INSERT INTO auth.users')
    expect(migration).not.toContain('INSERT INTO access.company_memberships')
    const helperAt = migration.indexOf(
      'CREATE FUNCTION access.resolve_verified_operating_company(',
    )
    const resolveAt = migration.indexOf(
      'CREATE OR REPLACE FUNCTION registry.resolve_child_operating_company(',
    )
    const draftAt = migration.indexOf(
      'CREATE OR REPLACE FUNCTION finance.enforce_agent_transaction_draft_company()',
    )
    const guards = migration.slice(0, helperAt)
    expect(helperAt).toBeGreaterThan(guards.indexOf('BLOCKED_BY_HISTORY'))
    expect(helperAt).toBeGreaterThan(guards.indexOf('BLOCKED_BY_REAPPLY'))
    expect(helperAt).toBeGreaterThan(guards.indexOf('BLOCKED_BY_SECURITY'))
    expect(helperAt).toBeGreaterThan(guards.indexOf('BLOCKED_BY_TRIGGER'))
    expect(helperAt).toBeGreaterThan(guards.indexOf('BLOCKED_BY_GLOBAL_PIN'))
    expect(helperAt).toBeGreaterThan(guards.indexOf('BLOCKED_BY_RLS'))
    expect(guards).toContain('<> 189')
    expect(guards).toContain("version = '20260928190000') <> 1")
    expect(guards).toContain('20260929120000')
    expect(helperAt).toBeLessThan(resolveAt)
    expect(resolveAt).toBeLessThan(draftAt)
    expect(migration).toContain('access.is_company_member(p_requested)')
    expect(migration).toContain('auth.uid()')
    expect(migration).toContain("session_role = 'anon'")
    expect(migration).toContain('REVOKE ALL ON FUNCTION access.resolve_verified_operating_company(uuid, boolean) FROM anon, authenticated, service_role')
    expect(migration).toContain('SET search_path = pg_catalog')
    expect(migration).toContain('fe964c798154886e8dacc8edebef908a')
  })

  it('restores the previous resolvers and leaves the uuid guard untouched', () => {
    expect(rollback.indexOf('CREATE OR REPLACE FUNCTION registry.resolve_child_operating_company(')).toBeGreaterThan(
      rollback.indexOf('BLOCKED_BY_ROLLBACK'),
    )
    expect(rollback).toContain('DROP FUNCTION access.resolve_verified_operating_company(uuid, boolean);')
    expect(rollback).toContain('eacbfd7957ced1264a3b9c3339c37b01')
    expect(rollback).toContain('dfcbb8a5bf1cd56e62b2cb9870870eb5')
    expect(rollback).toContain('fe964c798154886e8dacc8edebef908a')
    expect(rollback).not.toContain('CREATE OR REPLACE FUNCTION registry.forbid_uuid_change')
    expect(rollback).not.toContain('INSERT INTO registry.companies')
    expect(matrix).toContain('two_service_explicit_blocked')
    expect(matrix).toContain('two_omission_blocked')
    expect(matrix).toContain('context_does_not_leak')
    expect(matrix).toContain('@@MIGRATION@@')
    expect(matrix).toContain('@@ROLLBACK@@')
  })
})
