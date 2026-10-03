/**
 * A missing SUPABASE_SERVICE_KEY must fail before any client is built.
 * The service client must not substitute NEXT_PUBLIC_SUPABASE_ANON_KEY.
 */
const mockClientCalls: unknown[][] = []
const mockSession = { user: { id: 'session-user' } as { id: string } | null }
const mockRpc = {
  current: { data: '00000000-0000-4000-8000-00000000000a' as unknown, error: null as { message: string } | null },
  sent: [] as string[],
}

jest.mock('@/lib/supabaseServer', () => ({
  createSupabaseServerClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: mockSession.user }, error: null }),
    },
    rpc: async (fn: string) =>
      fn === 'is_company_member'
        ? { data: true, error: null }
        : { data: mockSession.user?.id ?? null, error: null },
    schema: () => ({
      rpc: async () => ({ data: true, error: null }),
    }),
  }),
}))

jest.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => {
    mockClientCalls.push(args)
    const key = args[1]
    return {
      rpc: async () => mockRpc.current,
      from(relation: string) {
        return {
          select() {
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
                mockRpc.sent.push(`${String(key)}:${relation}`)
                return Promise.resolve({ data: [{ cash_box_name: 'JJ' }], error: null }).then(onFulfilled, onRejected)
              },
            }
            return filter
          },
        }
      },
    }
  },
}))

const originalKey = process.env.SUPABASE_SERVICE_KEY

afterEach(() => {
  if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_KEY
  else process.env.SUPABASE_SERVICE_KEY = originalKey
  mockRpc.current = { data: '00000000-0000-4000-8000-00000000000a', error: null }
  mockRpc.sent = []
})

async function load() {
  const [{ createServiceClient, MISSING_SERVICE_KEY_BLOCK }, { fetchAll }, { fetchOwnershipForProperty }, { requireDecisionSessionUser }] =
    await Promise.all([
      import('@/lib/supabase'),
      import('@/lib/ceo/fetchCeoDashboard'),
      import('@/lib/ownership/ownershipService'),
      import('@/lib/finance/loadFinanceDecision'),
    ])
  return { createServiceClient, MISSING_SERVICE_KEY_BLOCK, fetchAll, fetchOwnershipForProperty, requireDecisionSessionUser }
}

describe('missing SUPABASE_SERVICE_KEY fails closed and does not use the anon key', () => {
  test('the service client constructor never reads the anon key', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const source = readFileSync(resolve(__dirname, '../../lib/supabase.ts'), 'utf8')
    const body = source.slice(source.indexOf('function rawServiceClient'), source.indexOf('async function resolveSoleServiceCompany'))
    expect(body).toContain('SUPABASE_SERVICE_KEY')
    expect(body).not.toContain('ANON_KEY')
    expect(body).not.toContain('SUPABASE_SERVICE_ROLE_KEY')
  })

  test('CEO page and ownershipService throw before any read when the service key is absent', async () => {
    const { fetchAll, fetchOwnershipForProperty, MISSING_SERVICE_KEY_BLOCK } = await load()
    delete process.env.SUPABASE_SERVICE_KEY
    const callsBefore = mockClientCalls.length
    mockRpc.sent = []

    await expect(fetchAll()).rejects.toThrow(MISSING_SERVICE_KEY_BLOCK)
    await expect(fetchOwnershipForProperty('Villa Mazotos', 'Avi', '2026-06-01')).rejects.toThrow(
      MISSING_SERVICE_KEY_BLOCK,
    )

    expect(mockClientCalls.length).toBe(callsBefore)
    expect(mockRpc.sent).toEqual([])
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    expect(mockClientCalls.slice(callsBefore).some((call) => call[1] === anon)).toBe(false)
  })

  test('when the key is present, service reads use that key and not the anon key', async () => {
    process.env.SUPABASE_SERVICE_KEY = 'service-key-for-test'
    const { fetchAll } = await load()
    const callsBefore = mockClientCalls.length
    const dashboard = await fetchAll()
    expect(dashboard.cashboxes).toEqual([{ cash_box_name: 'JJ' }])
    const keys = mockClientCalls.slice(callsBefore).map((call) => call[1])
    expect(keys.length).toBeGreaterThan(0)
    expect(keys.every((key) => key === 'service-key-for-test')).toBe(true)
    expect(keys).not.toContain(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  })

  test('an rpc result of null or undefined returns no dashboard data, throws from ownership, and sends no read', async () => {
    process.env.SUPABASE_SERVICE_KEY = 'service-key-for-test'
    const { fetchAll, fetchOwnershipForProperty } = await load()
    for (const data of [null, undefined]) {
      mockRpc.current = { data, error: null }
      mockRpc.sent = []
      const dashboard = await fetchAll()
      expect(dashboard.cashboxes).toEqual([])
      expect(dashboard.anastasia).toBeNull()
      expect(dashboard.summary).toBeNull()
      expect(dashboard.pl).toBeNull()
      expect(dashboard.errors).toEqual(['BLOCKED_BY_COMPANY_CONTEXT'])
      await expect(fetchOwnershipForProperty('Villa Mazotos', 'Avi', '2026-06-01')).rejects.toThrow(
        'BLOCKED_BY_COMPANY_CONTEXT',
      )
      expect(mockRpc.sent).toEqual([])
    }
  })

  test('a missing service key blocks the decision path before any relation read and does not use the anon key', async () => {
    delete process.env.SUPABASE_SERVICE_KEY
    const { requireDecisionSessionUser, MISSING_SERVICE_KEY_BLOCK } = await load()
    const callsBefore = mockClientCalls.length
    await expect(requireDecisionSessionUser()).rejects.toThrow(MISSING_SERVICE_KEY_BLOCK)
    expect(mockClientCalls.length).toBe(callsBefore)
    expect(mockRpc.sent).toEqual([])
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    expect(mockClientCalls.slice(callsBefore).some((call) => call[1] === anon)).toBe(false)
  })
})
