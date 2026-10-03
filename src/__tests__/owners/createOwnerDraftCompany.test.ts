/**
 * 20261003130000: create_owner_draft writes a verified operating_company_id.
 * Static checks on the migration / rollback / matrix and the server action's
 * fail-closed mapping of the RPC's company errors.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it, expect, jest, beforeEach } from '@jest/globals'

jest.mock('server-only', () => ({}), { virtual: true })
jest.mock('next/headers', () => ({ cookies: jest.fn(() => ({ getAll: () => [] })) }), { virtual: true })
jest.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1', email: 'staff@example.test' } }, error: null }) },
  }),
}))
jest.mock('@/lib/identity/identityResolverService', () => ({
  getAllVerifiedOwners: async () => ({ owners: [], draftOwners: [] }),
}))

const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = []
let rpcError: { message: string } | null = null

jest.mock('@/lib/supabase', () => ({
  createServiceClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ single: async () => ({ data: { role: 'admin', is_active: true }, error: null }) }),
      }),
    }),
    schema: () => ({
      rpc: async (fn: string, args: Record<string, unknown>) => {
        rpcCalls.push({ fn, args })
        return rpcError ? { data: null, error: rpcError } : { data: 'entity-1', error: null }
      },
    }),
  }),
}))

const root = path.resolve(__dirname, '..', '..', '..')
const read = (file: string) => readFileSync(path.join(root, file), 'utf8')

const MIGRATION = 'supabase/migrations/20261003130000_create_owner_draft_operating_company.sql'
const ROLLBACK = 'supabase/rollbacks/20261003130000_create_owner_draft_operating_company_rollback.sql'
const MATRIX = 'supabase/tests/20261003130000_create_owner_draft_operating_company_matrix.sql'
const FIXTURE = 'supabase/tests/fixtures/20261003130000_create_owner_draft_fixture.sql'

describe('20261003130000 migration files', () => {
  const migration = read(MIGRATION)
  const rollback = read(ROLLBACK)
  const matrix = read(MATRIX)
  const fixture = read(FIXTURE)

  it('has no CRLF and no hard-coded Production company UUID', () => {
    for (const file of [migration, rollback, matrix, fixture]) {
      expect(file.includes('\r')).toBe(false)
      expect(file).not.toContain('10f6e9b3-c5b9-4d95-a318-48f20f89477f')
    }
  })

  it('cannot be applied before the real Slice A and pins the live function', () => {
    expect(migration).toContain('cannot be applied before the real Slice A')
    expect(migration).toContain('STAND-IN')
    expect(migration).toContain("version = '20260930220000') <> 1")
    expect(migration).toContain("version = '20261003130000') <> 0")
    expect(migration).toContain("md5(proc.prosrc) = '6539a074de7e8bf4c85045c6f115f575'")
    expect(migration).toContain('BLOCKED_BY_FUNCTION_DRIFT')
  })

  it('derives the company from property_definitions by UUID or the verified resolver, never by name', () => {
    const body = migration.slice(migration.indexOf('AS $owner_draft$'), migration.lastIndexOf('$owner_draft$;'))
    expect(body).toContain('FROM public.property_definitions AS definition')
    expect(body).toContain('WHERE definition.property_id = v_prop_id')
    expect(body).toContain('access.resolve_verified_operating_company(NULL, false)')
    expect(body).toContain('PERFORM access.arm_internal_operating_company(v_company)')
    expect(body).toContain('PERFORM access.disarm_internal_operating_company()')
    expect(body).toContain('operating_company_id')
    expect(body).not.toContain('property_name')
    expect(body).not.toContain('set_config')
  })

  it('rollback restores the exact live definition and grants', () => {
    expect(rollback).toContain("md5(proc.prosrc) = '071f0d8f3b7cab2cba1fbaa7d398232d'")
    expect(rollback).toContain("md5(proc.prosrc) = '6539a074de7e8bf4c85045c6f115f575'")
    expect(rollback).toContain("md5(pg_get_functiondef(proc.oid)) = 'c59126c54658c9330b051d33997da8ab'")
    expect(rollback).toContain("SET search_path TO 'lifecycle', 'public'")
    expect(rollback).toContain('TO service_role;')
  })

  it('matrix covers the two-company refusals and the exact rollback', () => {
    for (const step of [
      '04_one_company_no_property_gets_sole_company',
      '05_permit_disarmed_after_call',
      '07_unknown_property_blocked',
      '09_two_companies_no_property_blocked',
      '10_two_companies_property_b_written_as_b',
      '11_cross_company_properties_blocked',
      '13_inactive_parent_company_blocked',
      '15_never_reads_property_name',
      '17_rollback_restores_live_def_exactly',
      '20_permit_disarmed_after_error',
    ]) {
      expect(matrix).toContain(step)
    }
  })
})

describe('createOwnerAction maps company refusals fail-closed', () => {
  beforeEach(() => {
    rpcCalls.length = 0
    rpcError = null
  })

  it('never sends a company UUID to the RPC', async () => {
    const { createOwnerAction } = await import('@/lib/owners/createOwnerAction')
    const result = await createOwnerAction({ canonicalName: 'Owner One', relationshipType: 'managed_client' })
    expect(result).toEqual({ ok: true, entityId: 'entity-1', slug: 'owner-one' })
    expect(rpcCalls).toHaveLength(1)
    expect(Object.keys(rpcCalls[0].args).some((key) => key.includes('company'))).toBe(false)
  })

  it.each([
    ['BLOCKED_BY_COMPANY_CONTEXT', 'could not be verified'],
    ['BLOCKED_BY_PARENT_COMPANY', 'single company'],
  ])('%s becomes company_context', async (code, text) => {
    rpcError = { message: code }
    const { createOwnerAction } = await import('@/lib/owners/createOwnerAction')
    const result = await createOwnerAction({ canonicalName: 'Owner Two', relationshipType: 'managed_client' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe('company_context')
      expect(result.message).toContain(text)
    }
  })

  it('other RPC errors stay db_error', async () => {
    rpcError = { message: 'some other failure' }
    const { createOwnerAction } = await import('@/lib/owners/createOwnerAction')
    const result = await createOwnerAction({ canonicalName: 'Owner Three', relationshipType: 'managed_client' })
    expect(result).toEqual({ ok: false, error: 'db_error', message: 'some other failure' })
  })
})
