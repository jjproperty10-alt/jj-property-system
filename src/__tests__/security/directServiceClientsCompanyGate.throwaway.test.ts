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
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { Client } from 'pg'
import { gateServiceReads, SERVICE_ROLE_COMPANY_WIDE_RELATIONS } from '@/lib/auth/serviceRoleCompanyGate'

const { assertThrowaway } = createRequire(__filename)('../../../scripts/run-throwaway-pg-matrix.cjs') as {
  assertThrowaway: (conninfo: string | undefined) => void
}

const COMPANY_A = '00000000-0000-4000-8000-00000000000a'
const MEMBER = '00000000-0000-4000-8000-0000000000a1'
const NON_MEMBER = '00000000-0000-4000-8000-0000000000b2'

const mockSession = {
  userId: MEMBER as string | null,
  rpcMode: 'sql' as 'sql' | 'error',
  schemas: [] as string[],
}

let mockDbClient: Client | null = null
let mockQueue: Promise<unknown> = Promise.resolve()

function mockEnqueue<T>(job: () => Promise<T>): Promise<T> {
  const run = mockQueue.then(job, job)
  mockQueue = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

async function mockQuerySessionRpc(
  db: Client,
  schema: string,
  fn: string,
  args: Record<string, unknown> | undefined,
  userId: string,
) {
  await db.query('ROLLBACK').catch(() => undefined)
  await db.query('BEGIN')
  try {
    await db.query(
      `SELECT set_config('request.jwt.claim.role', 'authenticated', true), set_config('request.jwt.claim.sub', $1, true)`,
      [userId],
    )
    await db.query('SET LOCAL ROLE authenticated')
    const result =
      schema === 'public' && fn === 'require_jj_staff'
        ? await db.query('SELECT public.require_jj_staff($1::text[]) AS result', [args?.p_allowed_roles ?? null])
        : schema === 'public' && fn === 'is_company_member'
          ? await db.query('SELECT public.is_company_member($1::uuid) AS result', [args?.p_company_id ?? null])
          : null
    if (!result) throw new Error(`unexpected rpc ${schema}.${fn}`)
    await db.query('COMMIT')
    return result.rows[0].result
  } catch (error) {
    await db.query('ROLLBACK').catch(() => undefined)
    throw error
  }
}

async function mockSessionCall(schema: string, fn: string, args?: Record<string, unknown>) {
  if (mockSession.rpcMode === 'error') return { data: null, error: { message: 'rpc down' } }
  if (!mockSession.userId || !mockDbClient) return { data: null, error: { message: 'no session' } }
  try {
    const data = await mockEnqueue(() =>
      mockQuerySessionRpc(mockDbClient as Client, schema, fn, args, mockSession.userId as string),
    )
    return { data, error: null }
  } catch (error) {
    return { data: null, error: { message: (error as Error).message } }
  }
}

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
  const { gateServiceReads: gate } = jest.requireActual<typeof import('@/lib/auth/serviceRoleCompanyGate')>(
    '@/lib/auth/serviceRoleCompanyGate',
  )

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
      limit() {
        return filter
      },
      gte() {
        return filter
      },
      lte() {
        return filter
      },
      in() {
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
    resolveSoleServiceCompany: () => mockDb.resolve(),
    createServiceClient: () => gate(buildClient(), () => mockDb.resolve()),
  }
})

jest.mock('@/lib/supabaseServer', () => ({
  createSupabaseServerClient: () => ({
    auth: {
      getUser: async () => ({
        data: { user: mockSession.userId ? { id: mockSession.userId } : null },
        error: null,
      }),
    },
    rpc: (fn: string, args?: Record<string, unknown>) => mockSessionCall('public', fn, args),
    schema: (schema: string) => {
      mockSession.schemas.push(schema)
      return {
        rpc: (fn: string, args?: Record<string, unknown>) => mockSessionCall(schema, fn, args),
      }
    },
  }),
}))

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
    mockDbClient = db
    const requireStaff = extractFunction(
      readFileSync(path.join(root, 'supabase/tests/20260916_tamir_d1_d2_d3/harness.sql'), 'utf8'),
      'public.require_jj_staff(p_allowed_roles text[] DEFAULT NULL::text[])',
    )
    const activeStaff = extractFunction(
      readFileSync(path.join(root, 'supabase/migrations/20260917090100_agent_transaction_drafts.sql'), 'utf8'),
      'finance.is_active_jj_staff()',
    )
    await db.query(`
      CREATE TABLE public.jj_staff_config (
        user_id uuid PRIMARY KEY,
        staff_role text,
        is_active boolean NOT NULL DEFAULT true
      );
      ${requireStaff}
      REVOKE ALL ON FUNCTION public.require_jj_staff(text[]) FROM PUBLIC;
      GRANT EXECUTE ON FUNCTION public.require_jj_staff(text[]) TO authenticated;
      CREATE POLICY read_own_active_company_membership
        ON access.company_memberships
        FOR SELECT
        TO authenticated
        USING (user_id = (SELECT auth.uid()) AND is_active);
      GRANT SELECT ON TABLE access.company_memberships TO authenticated;
      CREATE SCHEMA IF NOT EXISTS finance;
      GRANT USAGE ON SCHEMA finance TO authenticated;
      ${activeStaff}
      REVOKE ALL ON FUNCTION finance.is_active_jj_staff() FROM PUBLIC;
      GRANT EXECUTE ON FUNCTION finance.is_active_jj_staff() TO authenticated;
    `)
    await db.query(
      readFileSync(path.join(root, 'supabase/migrations/20261003170000_public_is_company_member_wrapper.sql'), 'utf8'),
    )
  })

  afterAll(async () => {
    await db?.end()
    await admin?.query(`DROP DATABASE IF EXISTS ${database}`)
    await admin?.end()
  })

  beforeEach(async () => {
    mockDb.sent = []
    mockDb.resolve = resolveAsServiceRole
    mockSession.userId = MEMBER
    mockSession.rpcMode = 'sql'
    mockSession.schemas = []
    await db.query('DELETE FROM access.company_memberships')
    await db.query('DELETE FROM public.jj_staff_config')
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
    await db.query(
      `INSERT INTO public.jj_staff_config (user_id, staff_role, is_active) VALUES ($1, 'ceo', true)`,
      [MEMBER],
    )
  })

  async function resolveAsServiceRole(): Promise<string> {
    return callResolver('service_role', '')
  }

  function callResolver(role: string, sub: string): Promise<string> {
    return mockEnqueue(() => callResolverOnce(role, sub))
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

  function decisionArgs() {
    return {
      entityId: 'Jacob',
      entityType: 'partner',
      periodStart: new Date(2026, 6, 1),
      periodEnd: new Date(2026, 6, 31),
      decisionType: 'approve_withdrawal',
    }
  }

  async function loadComponents() {
    const [{ fetchAll }, { fetchOwnershipForProperty }, { loadFinanceDecision }] = await Promise.all([
      import('@/lib/ceo/fetchCeoDashboard'),
      import('@/lib/ownership/ownershipService'),
      import('@/lib/finance/loadFinanceDecision'),
    ])
    return { fetchAll, fetchOwnershipForProperty, loadFinanceDecision }
  }

  async function expectComponentsClosed() {
    const { fetchAll, fetchOwnershipForProperty, loadFinanceDecision } = await loadComponents()
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
    await expect(loadFinanceDecision(decisionArgs())).rejects.toThrow('BLOCKED_BY_COMPANY_CONTEXT')
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

    mockDb.sent = []
    const { loadFinanceDecision } = await loadComponents()
    const loaded = await loadFinanceDecision(decisionArgs())
    expect(loaded.position.entityId).toBe('Jacob')
    expect(loaded.decision.entityId).toBe('Jacob')
    expect(loaded.decision.decisionType).toBe('approve_withdrawal')
    expect(mockDb.sent).toEqual(expect.arrayContaining(['claim_templates', 'v_cashbox_audit']))
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
    await expect(gated.from('position_score_deltas').select()).rejects.toThrow('BLOCKED_BY_UNGATED_RELATION')
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

  const MEMBER_NON_STAFF = '00000000-0000-4000-8000-0000000000c3'
  const INACTIVE_STAFF = '00000000-0000-4000-8000-0000000000d4'

  async function expectPermissionClosed() {
    const { fetchAll, fetchOwnershipForProperty, loadFinanceDecision } = await loadComponents()
    mockDb.sent = []
    const dashboard = await fetchAll()
    expect(dashboard.cashboxes).toEqual([])
    expect(dashboard.anastasia).toBeNull()
    expect(dashboard.summary).toBeNull()
    expect(dashboard.pl).toBeNull()
    expect(dashboard.errors).toEqual(['BLOCKED_BY_MISSING_PERMISSION'])
    await expect(fetchOwnershipForProperty('Villa Mazotos', 'Avi', '2026-06-01')).rejects.toThrow(
      'BLOCKED_BY_MISSING_PERMISSION',
    )
    await expect(loadFinanceDecision(decisionArgs())).rejects.toThrow('BLOCKED_BY_MISSING_PERMISSION')
    expect(mockDb.sent).toEqual([])
    expect(mockSession.schemas).toEqual([])
  }

  test('staff and member of the one active company: the three paths return data', async () => {
    const { fetchAll, fetchOwnershipForProperty, loadFinanceDecision } = await loadComponents()
    mockDb.sent = []
    const dashboard = await fetchAll()
    expect(dashboard.errors).toEqual([])
    expect(dashboard.cashboxes).toEqual([{ cash_box_name: 'JJ', balance: '10.00' }])
    expect(dashboard.anastasia).toEqual({ anastasia_owes_jj: '7.00' })
    expect(dashboard.summary).toEqual({ total_receivables: '2.00' })
    expect(dashboard.pl).toEqual({ net_company_pl: '3.00' })
    const record = await fetchOwnershipForProperty('Villa Mazotos', 'Avi', '2026-06-01')
    expect(record.ownershipPct).toBe(50)
    const loaded = await loadFinanceDecision(decisionArgs())
    expect(loaded.position.entityId).toBe('Jacob')
    expect(loaded.decision.decisionType).toBe('approve_withdrawal')
    expect(mockSession.schemas).toEqual([])
  })

  test('the permission code never calls schema(access)', async () => {
    const source = readFileSync(path.join(root, 'src/lib/auth/requireStaffCompanyPermission.ts'), 'utf8')
    expect(source).not.toContain("schema('access')")
    expect(source).not.toContain('schema("access")')
    const definition = await db.query(
      `SELECT prosecdef, pg_get_functiondef('public.is_company_member(uuid)'::regprocedure) AS def
       FROM pg_proc
       JOIN pg_namespace ON pg_namespace.oid = pg_proc.pronamespace
       WHERE pg_namespace.nspname = 'public' AND pg_proc.proname = 'is_company_member'`,
    )
    expect(definition.rows[0].prosecdef).toBe(false)
    expect(definition.rows[0].def).toContain('access.is_company_member')
    mockSession.schemas = []
    const { fetchAll } = await loadComponents()
    const dashboard = await fetchAll()
    expect(dashboard.errors).toEqual([])
    expect(mockSession.schemas).toEqual([])
  })

  test('staff + non-member: no data and no relation read', async () => {
    await db.query(
      `INSERT INTO public.jj_staff_config (user_id, staff_role, is_active) VALUES ($1, 'operations', true)`,
      [NON_MEMBER],
    )
    mockSession.userId = NON_MEMBER
    await expectPermissionClosed()
  })

  test('member + non-staff: no data and no relation read', async () => {
    await db.query(
      `INSERT INTO access.company_memberships (company_id, user_id, membership_role, is_active)
       VALUES ($1, $2, 'member', true)`,
      [COMPANY_A, MEMBER_NON_STAFF],
    )
    mockSession.userId = MEMBER_NON_STAFF
    await expectPermissionClosed()
  })

  test('inactive staff: no data and no relation read', async () => {
    await db.query(
      `INSERT INTO public.jj_staff_config (user_id, staff_role, is_active) VALUES ($1, 'ceo', false)`,
      [INACTIVE_STAFF],
    )
    await db.query(
      `INSERT INTO access.company_memberships (company_id, user_id, membership_role, is_active)
       VALUES ($1, $2, 'company_admin', true)`,
      [COMPANY_A, INACTIVE_STAFF],
    )
    mockSession.userId = INACTIVE_STAFF
    await expectPermissionClosed()
  })

  test('an RPC error: no data and no relation read', async () => {
    await db.query('REVOKE EXECUTE ON FUNCTION public.require_jj_staff(text[]) FROM authenticated')
    try {
      await expectPermissionClosed()
    } finally {
      await db.query('GRANT EXECUTE ON FUNCTION public.require_jj_staff(text[]) TO authenticated')
    }
  })

  test('an unauthenticated user: no data and no relation read', async () => {
    mockSession.userId = null
    await expectPermissionClosed()
  })

  test('finance.is_active_jj_staff is the migration body and is true only for active staff', async () => {
    const definition = await db.query(
      `SELECT pg_get_functiondef('finance.is_active_jj_staff()'::regprocedure) AS def`,
    )
    expect(definition.rows[0].def).toContain('jj_staff_config')
    expect(definition.rows[0].def).toContain('is_active')
    const active = await mockEnqueue(() => authenticatedBoolean(MEMBER))
    const inactive = await mockEnqueue(async () => {
      await db.query(
        `INSERT INTO public.jj_staff_config (user_id, staff_role, is_active) VALUES ($1, 'operations', false)`,
        [INACTIVE_STAFF],
      )
      return authenticatedBoolean(INACTIVE_STAFF)
    })
    expect(active).toBe(true)
    expect(inactive).toBe(false)
  })
})

async function authenticatedBoolean(userId: string): Promise<boolean> {
  const db = mockDbClient
  if (!db) throw new Error('no client')
  await db.query('ROLLBACK').catch(() => undefined)
  await db.query('BEGIN')
  try {
    await db.query(
      `SELECT set_config('request.jwt.claim.role', 'authenticated', true), set_config('request.jwt.claim.sub', $1, true)`,
      [userId],
    )
    await db.query('SET LOCAL ROLE authenticated')
    const { rows } = await db.query('SELECT finance.is_active_jj_staff() AS ok')
    await db.query('COMMIT')
    return rows[0].ok === true
  } catch (error) {
    await db.query('ROLLBACK').catch(() => undefined)
    throw error
  }
}

function extractFunction(sql: string, signature: string): string {
  const marker = `CREATE OR REPLACE FUNCTION ${signature}`
  const start = sql.indexOf(marker)
  if (start < 0) throw new Error(`missing ${signature}`)
  const dollar = sql.slice(start).match(/AS\s+(\$[A-Za-z0-9_]*\$)/)
  if (!dollar || dollar.index === undefined) throw new Error(`no body ${signature}`)
  const tag = dollar[1]
  const bodyAt = start + dollar.index
  const end = sql.indexOf(`${tag};`, bodyAt)
  if (end < 0) throw new Error(`unterminated ${signature}`)
  return sql.slice(start, end + tag.length + 1)
}

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
