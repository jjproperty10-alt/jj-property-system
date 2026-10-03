/**
 * Opt-in: drives the company gate with the REAL resolver SQL
 * (access.resolve_service_read_company, copied verbatim from a read-only
 * Production capture into supabase/tests/fixtures/throwaway_company_base.sql)
 * on a THROWAWAY local PostgreSQL. Skipped unless JJ_THROWAWAY_PG is set.
 *
 *   JJ_THROWAWAY_PG='host=/tmp port=55432 user=postgres' npx jest directServiceClientsCompanyGate.throwaway
 *
 * Never point JJ_THROWAWAY_PG at Supabase; assertThrowaway() refuses it.
 *
 * FINDING: access.resolve_service_read_company does not check staff role or
 * company membership. It allows only service_role with a null auth.uid() and
 * exactly one active company. A member and a non-member are refused the same
 * way once a user id is present, because the function never reads
 * access.company_memberships or user_roles.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { Client } from 'pg'
import { gateServiceReads, SERVICE_ROLE_COMPANY_WIDE_RELATIONS } from '@/lib/auth/serviceRoleCompanyGate'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { assertThrowaway } = require('../../../scripts/run-throwaway-pg-matrix.cjs')

const COMPANY_A = '00000000-0000-4000-8000-00000000000a'
const MEMBER = '00000000-0000-4000-8000-0000000000a1'
const NON_MEMBER = '00000000-0000-4000-8000-0000000000b2'

const mockDb = {
  sent: [] as string[],
  resolve: (async () => COMPANY_A) as () => Promise<string>,
  rows: {
    v_cashbox_audit: [{ cash_box_name: 'JJ', balance: '10.00' }],
    v_anastasia_clearing: { anastasia_owes_jj: '7.00' },
    v_ceo_summary: { total_receivables: '2.00' },
    v_jj_company_pl: { net_company_pl: '3.00' },
    entity_registry: {
      id: 'entity-mazotos',
      canonical_name: 'Villa Mazotos',
      entity_type: 'partnership_property',
    },
    partnership_ownership: [
      {
        partner_name: 'Avi',
        ownership_pct: '50',
        effective_from: '2020-01-01',
        effective_to: null,
        confirmation_status: 'confirmed',
      },
    ],
  } as Record<string, unknown>,
}

jest.mock('@/lib/supabase', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { gateServiceReads: gate } = require('@/lib/auth/serviceRoleCompanyGate')

  function make(relation: string) {
    const filter = {
      eq() {
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
      then(
        onFulfilled?: ((value: unknown) => unknown) | null,
        onRejected?: ((reason: unknown) => unknown) | null,
      ) {
        mockDb.sent.push(relation)
        return Promise.resolve({ data: mockDb.rows[relation] ?? null, error: null }).then(onFulfilled, onRejected)
      },
    }
    return filter
  }

  function buildClient(): { from: (relation: string) => { select: () => ReturnType<typeof make> }; schema: () => ReturnType<typeof buildClient> } {
    const client = {
      from(relation: string) {
        return { select: () => make(relation) }
      },
      schema() {
        return buildClient()
      },
    }
    return client
  }

  return {
    createServiceClient: () => gate(buildClient(), () => mockDb.resolve()),
  }
})

const conninfo = process.env.JJ_THROWAWAY_PG
const maybe = conninfo ? describe : describe.skip
const root = path.resolve(__dirname, '..', '..', '..')

function toConfig(info: string, database: string) {
  const parts = Object.fromEntries(info.split(/\s+/).filter(Boolean).map((kv) => kv.split('=')))
  return { host: parts.host, port: Number(parts.port ?? 5432), user: parts.user, database }
}

maybe('company gate against the live resolver SQL (throwaway Postgres)', () => {
  const database = `jj_throwaway_gate_${process.pid}`
  let admin: Client
  let db: Client

  beforeAll(async () => {
    assertThrowaway(conninfo)
    admin = new Client(toConfig(conninfo as string, 'postgres'))
    await admin.connect()
    await admin.query(`DROP DATABASE IF EXISTS ${database}`)
    await admin.query(`CREATE DATABASE ${database}`)
    db = new Client(toConfig(conninfo as string, database))
    await db.connect()
    await db.query(readFileSync(path.join(root, 'supabase/tests/fixtures/throwaway_company_base.sql'), 'utf8'))
  })

  afterAll(async () => {
    await db?.end()
    await admin?.query(`DROP DATABASE IF EXISTS ${database}`)
    await admin?.end()
  })

  beforeEach(async () => {
    mockDb.sent = []
    mockDb.resolve = resolveAsServiceRole
    await db.query('DELETE FROM access.company_memberships')
    await db.query('DELETE FROM registry.companies')
    await db.query(
      `INSERT INTO registry.companies (company_id, canonical_name, status)
       VALUES ($1, 'Throwaway Company A', 'active')`,
      [COMPANY_A],
    )
    await db.query(
      `INSERT INTO access.company_memberships (company_id, user_id, membership_role, is_active)
       VALUES ($1, $2, 'company_admin', true)`,
      [COMPANY_A, MEMBER],
    )
  })

  async function resolveAsServiceRole(): Promise<string> {
    return callResolver('service_role', '')
  }

  let resolverQueue: Promise<unknown> = Promise.resolve()

  function callResolver(role: string, sub: string): Promise<string> {
    const run = resolverQueue.then(() => callResolverOnce(role, sub))
    resolverQueue = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  async function callResolverOnce(role: string, sub: string): Promise<string> {
    await db.query('ROLLBACK').catch(() => undefined)
    await db.query('BEGIN')
    try {
      await db.query(
        `SELECT set_config('request.jwt.claim.role', $1, true), set_config('request.jwt.claim.sub', $2, true)`,
        [role, sub],
      )
      await db.query('SET LOCAL ROLE service_role')
      const { rows } = await db.query('SELECT public.resolve_service_read_company(NULL) AS company')
      await db.query('COMMIT')
      const company = rows[0].company as string | null
      if (typeof company !== 'string' || company.length === 0) {
        throw new Error('BLOCKED_BY_COMPANY_CONTEXT')
      }
      return company
    } catch (error) {
      await db.query('ROLLBACK').catch(() => undefined)
      const message = (error as Error).message
      if (message.includes('BLOCKED_BY_COMPANY_CONTEXT')) throw new Error('BLOCKED_BY_COMPANY_CONTEXT')
      throw error
    }
  }

  async function loadComponents() {
    const [{ fetchAll }, { fetchOwnershipForProperty }] = await Promise.all([
      import('@/app/(app)/page'),
      import('@/lib/ownership/ownershipService'),
    ])
    return { fetchAll, fetchOwnershipForProperty }
  }

  async function expectComponentsClosed() {
    const { fetchAll, fetchOwnershipForProperty } = await loadComponents()
    mockDb.sent = []
    const dashboard = await fetchAll()
    expect(dashboard.cashboxes).toEqual([])
    expect(dashboard.anastasia).toBeNull()
    expect(dashboard.summary).toBeNull()
    expect(dashboard.pl).toBeNull()
    expect(dashboard.errors).toEqual(['BLOCKED_BY_COMPANY_CONTEXT'])
    await expect(fetchOwnershipForProperty('Villa Mazotos', 'Avi', '2026-06-01')).rejects.toThrow(
      'BLOCKED_BY_COMPANY_CONTEXT',
    )
    expect(mockDb.sent).toEqual([])
  }

  test('one active company: resolver returns that company and the three data paths return real rows', async () => {
    const company = await resolveAsServiceRole()
    expect(company).toBe(COMPANY_A)
    const { fetchAll, fetchOwnershipForProperty } = await loadComponents()
    mockDb.sent = []
    const dashboard = await fetchAll()
    expect(dashboard.errors).toEqual([])
    expect(dashboard.cashboxes).toEqual([{ cash_box_name: 'JJ', balance: '10.00' }])
    expect(dashboard.anastasia).toEqual({ anastasia_owes_jj: '7.00' })
    expect(dashboard.summary).toEqual({ total_receivables: '2.00' })
    expect(dashboard.pl).toEqual({ net_company_pl: '3.00' })
    expect(mockDb.sent.slice().sort()).toEqual(Array.from(SERVICE_ROLE_COMPANY_WIDE_RELATIONS).filter((relation) => relation.startsWith('v_')).sort())

    mockDb.sent = []
    const record = await fetchOwnershipForProperty('Villa Mazotos', 'Avi', '2026-06-01')
    expect(record.entityId).toBe('entity-mazotos')
    expect(record.hasOwnershipRecords).toBe(true)
    expect(record.ownershipPct).toBe(50)
    expect(record.ownershipPct).not.toBe(100)
    expect(mockDb.sent).toEqual(['entity_registry', 'partnership_ownership'])
  })

  test('zero active companies: components return no data and send no read', async () => {
    await db.query('DELETE FROM access.company_memberships')
    await db.query('DELETE FROM registry.companies')
    await expectComponentsClosed()
  })

  test('the sole company inactive: components return no data and send no read', async () => {
    await db.query(`UPDATE registry.companies SET status = 'inactive' WHERE company_id = $1`, [COMPANY_A])
    await expectComponentsClosed()
  })

  test('a second active company still refuses every company-wide read before it is sent', async () => {
    await db.query(
      `INSERT INTO registry.companies (company_id, canonical_name, status)
       VALUES ('00000000-0000-4000-8000-00000000000b', 'Throwaway Company B', 'active')`,
    )
    const sent: string[] = []
    const gated = gateServiceReads(recordingClient(sent), resolveAsServiceRole)
    for (const relation of Array.from(SERVICE_ROLE_COMPANY_WIDE_RELATIONS)) {
      await expect(gated.from(relation).select()).rejects.toThrow('BLOCKED_BY_COMPANY_CONTEXT')
    }
    expect(sent).toEqual([])
    await expectComponentsClosed()
  })

  test('an unlisted relation is refused even when the resolver would allow the company', async () => {
    const sent: string[] = []
    const gated = gateServiceReads(recordingClient(sent), resolveAsServiceRole)
    await expect(gated.from('transactions').select()).rejects.toThrow('BLOCKED_BY_UNGATED_RELATION')
    await expect(gated.from('claim_templates').select()).rejects.toThrow('BLOCKED_BY_UNGATED_RELATION')
    expect(sent).toEqual([])
    expect(await resolveAsServiceRole()).toBe(COMPANY_A)
  })

  test('finding: membership is not consulted; a user id is refused for a member and a non-member', async () => {
    const definition = await db.query(
      `SELECT pg_get_functiondef('access.resolve_service_read_company(uuid)'::regprocedure) AS def`,
    )
    expect(definition.rows[0].def).not.toContain('is_company_member')
    expect(definition.rows[0].def).not.toContain('user_roles')
    await expect(callResolver('service_role', MEMBER)).rejects.toThrow('BLOCKED_BY_COMPANY_CONTEXT')
    await expect(callResolver('service_role', NON_MEMBER)).rejects.toThrow('BLOCKED_BY_COMPANY_CONTEXT')
    await expect(callResolver('authenticated', MEMBER)).rejects.toThrow('BLOCKED_BY_COMPANY_CONTEXT')
    await expect(callResolver('authenticated', NON_MEMBER)).rejects.toThrow('BLOCKED_BY_COMPANY_CONTEXT')
  })
})

function recordingClient(sent: string[]) {
  return {
    from(relation: string) {
      return {
        select() {
          const filter = {
            eq() {
              return filter
            },
            then(onFulfilled?: ((v: unknown) => unknown) | null, onRejected?: ((r: unknown) => unknown) | null) {
              sent.push(relation)
              return Promise.resolve({ data: [], error: null }).then(onFulfilled, onRejected)
            },
          }
          return filter
        },
      }
    },
  }
}
