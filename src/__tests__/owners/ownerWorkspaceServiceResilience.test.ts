/**
 * ownerWorkspaceServiceResilience.test.ts
 *
 * Regression tests for the owner workspace SSR crash fix.
 *
 * Before the fix: unguarded createServiceClient() + queries in getOwnersRoom,
 * getOwnerWorkspace, getOwnerMaintenance caused uncaught exceptions that
 * propagated to Next.js App Router SSR → full-page crash (Digest 4142493441).
 *
 * After the fix: every read path catches exceptions and returns the
 * contract-defined empty fallback. The SSR layer never receives an unhandled throw.
 *
 * Three scenarios per function:
 *   S1 — createServiceClient() throws (missing env var / auth init failure)
 *   S2 — Supabase query throws (network error / permission error)
 *   S3 — success path: correct DTO returned, behaviour unchanged
 */

jest.mock('server-only', () => ({}))

jest.mock('@/lib/owners/ownerWorkspaceFixtures', () => ({
  FIXTURE_STATEMENT_STATUS: 'draft',
  FIXTURE_OWNER_BALANCE_EUR: null,
  FIXTURE_BALANCE_DIRECTION: 'balanced',
  FIXTURE_OPEN_CORRECTIONS: 0,
  FIXTURE_UPCOMING_COUNT: 0,
  FIXTURE_PRIORITY_GROUP: 'rest',
  FIXTURE_CLOSING_BALANCE_EUR: null,
}))

jest.mock('@/lib/owners/ownerWorkspaceUtils', () => ({
  nameToSlug: (name: string) =>
    name.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, ''),
  buildOwnerIdentity: (id: string, name: string, properties: string[]) => ({
    id,
    slug: name.toLowerCase().replace(/\s+/g, '-'),
    name,
    preferredLanguage: 'en' as const,
    flag: '🌍',
    initials: name.slice(0, 2).toUpperCase(),
    avatarColor: '#64748b',
    since: null,
    primaryProperty: properties[0] ?? null,
    properties,
  }),
  isSystemActor: (name: string) =>
    ['JJ', 'Airbnb', 'Anastasia', 'Tenant', 'Client', 'Owner'].includes(name),
}))

const mockCreateServiceClient = jest.fn()
jest.mock('@/lib/supabase', () => ({
  createServiceClient: (...args: unknown[]) => mockCreateServiceClient(...args),
}))

// ── Client factories ──────────────────────────────────────────────────────

function makeThrowingClient() {
  const boom = () => { throw new Error('[TEST] network error') }
  return {
    from: jest.fn().mockImplementation(boom),
    schema: jest.fn().mockImplementation(boom),
    rpc: jest.fn().mockImplementation(boom),
  }
}

function makeSuccessClient(txRows: Record<string, unknown>[]) {
  const chain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    not: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue({ data: txRows, error: null }),
  }
  const schemaChain = {
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({ data: [], error: null }),
    }),
  }
  return {
    from: jest.fn().mockReturnValue(chain),
    schema: jest.fn().mockReturnValue(schemaChain),
    rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
  }
}

const TX_ROOM = [
  { property_name: 'Villa Mazotos', payer: 'Avi', payee: 'JJ', review_status: 'active' },
  { property_name: 'Villa Mazotos', payer: 'JJ', payee: 'Avi', review_status: 'active' },
]
const TX_WORKSPACE = [
  { payer: 'Avi', payee: 'JJ', property_name: 'Villa Mazotos', review_status: 'active' },
]

// ── Subject under test ────────────────────────────────────────────────────

let getOwnersRoom: typeof import('@/lib/owners/ownerWorkspaceService').getOwnersRoom
let getOwnerWorkspace: typeof import('@/lib/owners/ownerWorkspaceService').getOwnerWorkspace
let getOwnerMaintenance: typeof import('@/lib/owners/ownerWorkspaceService').getOwnerMaintenance

beforeAll(async () => {
  const mod = await import('@/lib/owners/ownerWorkspaceService')
  getOwnersRoom = mod.getOwnersRoom
  getOwnerWorkspace = mod.getOwnerWorkspace
  getOwnerMaintenance = mod.getOwnerMaintenance
})

afterEach(() => jest.clearAllMocks())

// ── getOwnersRoom ─────────────────────────────────────────────────────────

describe('getOwnersRoom', () => {
  it('S1: returns empty room when createServiceClient() throws', async () => {
    mockCreateServiceClient.mockImplementation(() => {
      throw new Error('[TEST] SUPABASE_SERVICE_KEY undefined')
    })
    const result = await getOwnersRoom()
    expect(result.items).toEqual([])
    expect(result.summary.totalOwners).toBe(0)
    expect(result.summary.openCorrections).toBe(0)
  })

  it('S2: returns empty room when transactions query throws', async () => {
    mockCreateServiceClient
      .mockImplementationOnce(() => makeThrowingClient())
      .mockImplementationOnce(() => makeSuccessClient([]))  // statements try
    const result = await getOwnersRoom()
    expect(result.items).toEqual([])
    expect(result.summary.totalOwners).toBe(0)
  })

  it('S3: returns room items when query succeeds', async () => {
    mockCreateServiceClient
      .mockImplementationOnce(() => makeSuccessClient(TX_ROOM))
      .mockImplementationOnce(() => makeSuccessClient([]))  // statements try
    const result = await getOwnersRoom()
    expect(result.items.length).toBeGreaterThanOrEqual(1)
    const names = result.items.map(i => i.identity.name)
    expect(names).toContain('Avi')
    expect(result.summary.totalOwners).toBe(result.items.length)
  })
})

// ── getOwnerWorkspace ─────────────────────────────────────────────────────

describe('getOwnerWorkspace', () => {
  it('S1: returns null when createServiceClient() throws', async () => {
    mockCreateServiceClient.mockImplementation(() => {
      throw new Error('[TEST] SUPABASE_SERVICE_KEY undefined')
    })
    expect(await getOwnerWorkspace('avi')).toBeNull()
  })

  it('S2: returns null when transactions query throws', async () => {
    mockCreateServiceClient.mockImplementation(() => makeThrowingClient())
    expect(await getOwnerWorkspace('avi')).toBeNull()
  })

  it('S3: returns workspace DTO when owner found', async () => {
    mockCreateServiceClient.mockImplementation(() => makeSuccessClient(TX_WORKSPACE))
    const result = await getOwnerWorkspace('avi')
    expect(result).not.toBeNull()
    expect(result!.identity.name).toBe('Avi')
    expect(result!.identity.properties).toContain('Villa Mazotos')
    expect(result!.currentPeriod.startDate).toMatch(/^\d{4}-\d{2}-01$/)
  })

  it('S3b: returns null when slug not found', async () => {
    mockCreateServiceClient.mockImplementation(() => makeSuccessClient(TX_WORKSPACE))
    expect(await getOwnerWorkspace('nonexistent')).toBeNull()
  })
})

// ── getOwnerMaintenance ───────────────────────────────────────────────────

describe('getOwnerMaintenance', () => {
  it('S1: returns [] when createServiceClient() throws on workspace lookup', async () => {
    mockCreateServiceClient.mockImplementation(() => {
      throw new Error('[TEST] SUPABASE_SERVICE_KEY undefined')
    })
    expect(await getOwnerMaintenance('avi')).toEqual([])
  })

  it('S2: returns [] when renovation query throws', async () => {
    mockCreateServiceClient
      .mockImplementationOnce(() => makeSuccessClient(TX_WORKSPACE))  // workspace lookup
      .mockImplementationOnce(() => makeThrowingClient())              // renovation query
    expect(await getOwnerMaintenance('avi')).toEqual([])
  })

  it('S3: returns items when queries succeed', async () => {
    const maintRows = [{
      id: 'uuid-1', date: '2026-05-01', description: 'Roof repair',
      property_name: 'Villa Mazotos', amount_eur: 1200, subcategory: 'Renovation', notes: null,
    }]
    const maintChain = {
      select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(),
      not: jest.fn().mockReturnThis(),    in: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({ data: maintRows, error: null }),
    }
    const maintClient = { from: jest.fn().mockReturnValue(maintChain), schema: jest.fn(), rpc: jest.fn() }

    mockCreateServiceClient
      .mockImplementationOnce(() => makeSuccessClient(TX_WORKSPACE))
      .mockImplementationOnce(() => maintClient)

    const result = await getOwnerMaintenance('avi')
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('Roof repair')
    expect(result[0].actualCostEur).toBe('1200')
  })

  it('S3b: returns [] when workspace not found', async () => {
    mockCreateServiceClient.mockImplementation(() => makeSuccessClient([]))
    expect(await getOwnerMaintenance('unknown')).toEqual([])
  })
})

// ── Crash regression: callers never receive an unhandled throw ────────────

describe('crash regression — no unhandled throw propagates to SSR', () => {
  beforeEach(() => {
    mockCreateServiceClient.mockImplementation(() => {
      throw new Error('[TEST] simulated infrastructure failure')
    })
  })
  it('getOwnersRoom resolves (never throws)', () =>
    expect(getOwnersRoom()).resolves.toBeDefined())
  it('getOwnerWorkspace resolves (never throws)', () =>
    expect(getOwnerWorkspace('any')).resolves.toBeDefined())
  it('getOwnerMaintenance resolves (never throws)', () =>
    expect(getOwnerMaintenance('any')).resolves.toBeDefined())
})
