/**
 * The three direct service-key clients (CEO dashboard, finance decision page,
 * ownershipService) must go through the company-verified path:
 *   - no service key outside src/lib/supabase.ts,
 *   - company-wide reads wait for the verified company resolver and are never
 *     sent when it refuses (cross-company / ambiguous context),
 *   - no anon-key fallback in ownershipService.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import {
  gateServiceReads,
  SERVICE_ROLE_COMPANY_TABLES,
  SERVICE_ROLE_COMPANY_WIDE_RELATIONS,
} from '@/lib/auth/serviceRoleCompanyGate'

const root = path.resolve(__dirname, '..', '..', '..')
const read = (file: string) => readFileSync(path.join(root, file), 'utf8')

const CEO_PAGE = 'src/app/(app)/page.tsx'
const DECISION_PAGE = 'src/app/(app)/finance/decision/[partner]/[period]/page.tsx'
const OWNERSHIP = 'src/lib/ownership/ownershipService.ts'

type Filter = {
  sent: number
  eqs: string[]
  eq: (column: string, value: string) => Filter
  order: (column: string) => Filter
  single: () => Filter
  maybeSingle: () => Filter
  then: (
    onFulfilled?: ((value: unknown) => unknown) | null,
    onRejected?: ((reason: unknown) => unknown) | null,
  ) => Promise<unknown>
}

function mockClient(rows: Record<string, unknown>, log: Filter[]) {
  const make = (relation: string): Filter => {
    const filter: Filter = {
      sent: 0,
      eqs: [],
      eq(column, value) {
        filter.eqs.push(`${column}=${value}`)
        return filter
      },
      order() {
        return filter
      },
      single() {
        return filter
      },
      maybeSingle() {
        return filter
      },
      then(onFulfilled, onRejected) {
        filter.sent += 1
        return Promise.resolve({ data: rows[relation] ?? null, error: null }).then(onFulfilled, onRejected)
      },
    }
    log.push(filter)
    return filter
  }
  const client = {
    from(relation: string) {
      return { select: (..._args: unknown[]) => make(relation) }
    },
    schema(_name?: string) {
      return client
    },
  }
  return client
}

function listSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(path.join(root, dir))) {
    const rel = path.join(dir, entry)
    if (statSync(path.join(root, rel)).isDirectory()) {
      if (entry === '__tests__' || entry === 'node_modules') continue
      listSourceFiles(rel, out)
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(rel)
    }
  }
  return out
}

describe('direct service-key clients use the company gate', () => {
  test('no service key is read outside src/lib/supabase.ts', () => {
    const offenders = listSourceFiles('src').filter((file) => {
      if (file === path.join('src', 'lib', 'supabase.ts')) return false
      return /process\.env\.SUPABASE_SERVICE/.test(read(file))
    })
    expect(offenders).toEqual([])
  })

  test('the three former direct clients no longer build their own client', () => {
    for (const file of [CEO_PAGE, DECISION_PAGE, OWNERSHIP]) {
      const source = read(file)
      expect(source).not.toMatch(/process\.env\.SUPABASE_SERVICE/)
      expect(source).not.toContain("from '@supabase/supabase-js'")
      expect(source).not.toMatch(/\bcreateClient\(/)
      expect(source).not.toMatch(/\bcreateServerClient\(/)
    }
    expect(read(CEO_PAGE)).toContain("import { createServiceClient } from '@/lib/supabase'")
    expect(read(CEO_PAGE)).toContain('sb = createServiceClient()')
    expect(read(OWNERSHIP)).toContain("import { createServiceClient } from '@/lib/supabase'")
    expect(read(OWNERSHIP)).not.toContain('NEXT_PUBLIC_SUPABASE_ANON_KEY')
    expect(read(DECISION_PAGE)).toContain('requireStaffCompanyPermission')
    expect(read(CEO_PAGE)).toContain('requireStaffCompanyPermission')
    expect(read(OWNERSHIP)).toContain('requireStaffCompanyPermission')
  })

  test('session permission calls require_jj_staff and is_company_member, not the finance helpers', () => {
    const source = read('src/lib/auth/requireStaffCompanyPermission.ts')
    expect(source).toContain("rpc('require_jj_staff'")
    expect(source).toContain("rpc('is_company_member', { p_company_id: companyId })")
    expect(source).not.toContain("schema('access')")
    expect(source).not.toContain('schema("access")')
    const executable = source.slice(source.lastIndexOf('export async function'))
    expect(executable).not.toContain('is_active_jj_staff')
    expect(executable).not.toContain('is_active_jj_admin')
    expect(read('supabase/migrations/20260917090100_agent_transaction_drafts.sql')).toContain(
      'CREATE OR REPLACE FUNCTION finance.is_active_jj_staff()',
    )
    expect(read('supabase/migrations/20260924180000_employee_config_staff_and_definer_search_path.sql')).toContain(
      'CREATE OR REPLACE FUNCTION finance.is_active_jj_admin()',
    )
    expect(read('supabase/migrations/20260924210000_access_company_memberships.sql')).toContain(
      'CREATE FUNCTION access.is_company_member(target_company_id uuid)',
    )
    expect(read('supabase/migrations/20260917120000_agent_transaction_draft_public_rpcs.sql')).toContain(
      'finance is NOT exposed',
    )
    const definedInMigrations = readdirSync(path.join(root, 'supabase/migrations'))
      .filter((name) => name.endsWith('.sql'))
      .some((name) => /CREATE (OR REPLACE )?FUNCTION public\.require_jj_staff/.test(read(path.join('supabase/migrations', name))))
    expect(definedInMigrations).toBe(false)
  })

  test('the permission code never calls schema(access)', () => {
    const source = read('src/lib/auth/requireStaffCompanyPermission.ts')
    expect(source).not.toContain("schema('access')")
    expect(source).not.toContain('schema("access")')
    expect(source).toContain("rpc('is_company_member', { p_company_id: companyId })")
    const migration = read('supabase/migrations/20261003170000_public_is_company_member_wrapper.sql')
    const fn = migration.slice(migration.indexOf('CREATE OR REPLACE FUNCTION'), migration.indexOf('REVOKE ALL'))
    expect(fn).toContain('SECURITY INVOKER')
    expect(fn).not.toContain('SECURITY DEFINER')
    expect(fn).toContain("SET search_path = ''")
    expect(fn).toContain('SELECT access.is_company_member(p_company_id)')
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.is_company_member(uuid) FROM PUBLIC, anon')
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.is_company_member(uuid) TO authenticated')
    expect(read('supabase/migrations/20260924210000_access_company_memberships.sql')).toContain(
      'GRANT USAGE ON SCHEMA access TO authenticated, service_role',
    )
  })

  test('every relation the CEO page and ownershipService read is gated', () => {
    const ceo = read(CEO_PAGE)
    const ownership = read(OWNERSHIP)
    const decisionReads = [
      'src/lib/finance/computeFinancialPosition.ts',
      'src/lib/finance/evaluateDecision.ts',
      'src/lib/finance/evaluateClaim.ts',
    ].map(read).join('\n')
    const relations = Array.from(`${ceo}\n${ownership}\n${decisionReads}`.matchAll(/\.from\('([a-z_]+)'\)/g)).map((m) => m[1])
    expect(relations.length).toBeGreaterThan(0)
    for (const relation of relations) {
      expect(
        SERVICE_ROLE_COMPANY_TABLES.has(relation) || SERVICE_ROLE_COMPANY_WIDE_RELATIONS.has(relation),
      ).toBe(true)
    }
  })

  test('the company-wide set and the filtered set do not overlap', () => {
    for (const relation of Array.from(SERVICE_ROLE_COMPANY_WIDE_RELATIONS)) {
      expect(SERVICE_ROLE_COMPANY_TABLES.has(relation)).toBe(false)
    }
    expect(SERVICE_ROLE_COMPANY_TABLES.has('transactions')).toBe(false)
  })

  test('a company-wide read waits for the verified company and adds no filter', async () => {
    const log: Filter[] = []
    let resolved = 0
    const db = gateServiceReads(mockClient({ v_cashbox_audit: [{ cash_box_name: 'JJ' }] }, log), async () => {
      resolved += 1
      return 'company-a'
    })
    const result = (await db.from('v_cashbox_audit').select('*')) as { data: unknown }
    expect(result.data).toEqual([{ cash_box_name: 'JJ' }])
    expect(resolved).toBe(1)
    expect(log[0].eqs).toEqual([])
    expect(log[0].sent).toBe(1)
  })

  test('a refused company context never sends a company-wide read', async () => {
    const log: Filter[] = []
    const db = gateServiceReads(mockClient({}, log), async () => {
      throw new Error('BLOCKED_BY_COMPANY_CONTEXT')
    })
    for (const relation of Array.from(SERVICE_ROLE_COMPANY_WIDE_RELATIONS)) {
      await expect(db.from(relation).select('*')).rejects.toThrow('BLOCKED_BY_COMPANY_CONTEXT')
    }
    expect(log.every((filter) => filter.sent === 0)).toBe(true)
  })

  test('a relation outside both sets is refused and the client is not asked', async () => {
    const log: Filter[] = []
    let resolved = 0
    const db = gateServiceReads(mockClient({ user_roles: [{ id: 'role-1' }], transactions: [{ id: 'tx-1' }] }, log), async () => {
      resolved += 1
      return 'company-a'
    })
    await expect(db.from('user_roles').select('*')).rejects.toThrow('BLOCKED_BY_UNGATED_RELATION')
    await expect(db.from('transactions').select('*').eq('id', 'tx-1')).rejects.toThrow('BLOCKED_BY_UNGATED_RELATION')
    await expect(db.schema('finance').from('position_score_deltas').select('to_score')).rejects.toThrow('BLOCKED_BY_UNGATED_RELATION')
    await expect(db.schema('finance').from('decision_log').select('id')).rejects.toThrow('BLOCKED_BY_UNGATED_RELATION')
    expect(resolved).toBe(0)
    expect(log).toEqual([])
  })

  test('a null, undefined, or empty company id sends no read', async () => {
    for (const companyId of [null, undefined, ''] as Array<string | null | undefined>) {
      const log: Filter[] = []
      const db = gateServiceReads(mockClient({ v_cashbox_audit: [{ cash_box_name: 'JJ' }] }, log), async () => companyId as string)
      await expect(db.from('v_cashbox_audit').select('*').order('cash_box_name')).rejects.toThrow(
        'BLOCKED_BY_COMPANY_CONTEXT',
      )
      expect(log.every((filter) => filter.sent === 0)).toBe(true)
    }
  })
})

jest.mock('@/lib/supabaseServer', () => ({
  createSupabaseServerClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: 'staff-user' } }, error: null }),
    },
    rpc: async (fn: string) =>
      fn === 'is_company_member'
        ? { data: true, error: null }
        : { data: 'staff-user', error: null },
    schema: () => ({ rpc: async () => ({ data: true, error: null }) }),
  }),
}))

describe('ownershipService fails closed on a refused company context', () => {
  const log: Filter[] = []
  let refuse = false
  beforeEach(() => {
    log.length = 0
    refuse = false
  })

  jest.mock('@/lib/supabase', () => {
    const { gateServiceReads: gate } = jest.requireActual<typeof import('@/lib/auth/serviceRoleCompanyGate')>(
      '@/lib/auth/serviceRoleCompanyGate',
    )
    return {
      resolveSoleServiceCompany: async () => {
        if (refuse) throw new Error('BLOCKED_BY_COMPANY_CONTEXT')
        return 'company-a'
      },
      createServiceClient: () =>
        gate(
          mockClient(
            {
              entity_registry: { id: 'entity-1', canonical_name: 'Unit 1', entity_type: 'client_property' },
              partnership_ownership: [
                {
                  partner_name: 'Avi',
                  ownership_pct: '50',
                  effective_from: '2026-01-01',
                  effective_to: null,
                  confirmation_status: 'confirmed',
                },
              ],
            },
            log,
          ),
          async () => {
            if (refuse) throw new Error('BLOCKED_BY_COMPANY_CONTEXT')
            return 'company-a'
          },
        ),
    }
  })

  test('verified context: reads entity_registry and partnership_ownership', async () => {
    const { fetchOwnershipForProperty } = await import('@/lib/ownership/ownershipService')
    const record = await fetchOwnershipForProperty('Unit 1', 'Avi', '2026-06-01')
    expect(record.entityId).toBe('entity-1')
    expect(record.ownershipPct).toBe(50)
    expect(log.map((filter) => filter.sent)).toEqual([1, 1])
  })

  test('refused context: throws and sends nothing (no 100% passthrough)', async () => {
    refuse = true
    const { fetchOwnershipForProperty } = await import('@/lib/ownership/ownershipService')
    await expect(fetchOwnershipForProperty('Unit 1', 'Avi', '2026-06-01')).rejects.toThrow(
      'BLOCKED_BY_COMPANY_CONTEXT',
    )
    expect(log.every((filter) => filter.sent === 0)).toBe(true)
  })
})
