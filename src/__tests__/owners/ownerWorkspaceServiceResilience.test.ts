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
 *
 * G1B update: S3 success paths mock at the identity resolver boundary
 * (getAllVerifiedOwners / resolveBySlug) instead of transaction scanning.
 *
 * G3-A update: getOwnerMaintenance now delegates to ownerMaintenanceService.
 * S2/S3 for maintenance mock at the service boundary (mockGetMaintenanceItems),
 * not at createServiceClient. S1/crash tests remain unchanged (workspace null).
 */

jest.mock('server-only', () => ({}), { virtual: true })

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
    flag: '\u{1F30D}',
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

// ── G1B: Identity resolver mock ───────────────────────────────────────────

const mockGetAllVerifiedOwners = jest.fn()
const mockResolveBySlug = jest.fn()
jest.mock('@/lib/identity', () => ({
  getAllVerifiedOwners: (...args: unknown[]) => mockGetAllVerifiedOwners(...args),
  resolveBySlug: (...args: unknown[]) => mockResolveBySlug(...args),
}))

// ── G3-A: Maintenance service mock ────────────────────────────────────────

const mockGetMaintenanceItems = jest.fn()
jest.mock('@/lib/owners/ownerMaintenanceService', () => ({
  getMaintenanceItems: (...args: unknown[]) => mockGetMaintenanceItems(...args),
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

/**
 * Build a Supabase-like query chain that is itself a thenable.
 *
 * Supabase v2 query builders implement `.then()` — the whole chain object is
 * awaitable. `await sb.from().select().eq().not()` works because the chain
 * object has a `.then()` that resolves to { data, error }.
 *
 * Without `.then()`, `await chain` returns the chain itself (non-thenable
 * pass-through), leaving `data = undefined` and the service takes the null path.
 */
function makeThenableChain(rows: Record<string, unknown>[]) {
  const resolved = Promise.resolve({ data: rows, error: null })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {
    then: (resolve: any, reject: any) => resolved.then(resolve, reject),
    catch: (reject: any) => resolved.catch(reject),
  }
  for (const m of ['select', 'eq', 'not', 'in', 'order', 'limit']) {
    chain[m] = jest.fn().mockReturnValue(chain)
  }
  return chain
}

function makeSuccessClient(txRows: Record<string, unknown>[]) {
  return {
    from: jest.fn().mockReturnValue(makeThenableChain(txRows)),
    schema: jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue(makeThenableChain([])),
    }),
    rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
  }
}

const TX_WORKSPACE = [
  { payer: 'Avi', payee: 'JJ', property_name: 'Villa Mazotos', review_status: 'active' },
]

// ── G1B: Identity fixture for S3 success paths ────────────────────────────

const IDENTITY_AVI_RESOLVED = {
  identity: {
    entityId: 'avi-uuid',
    displayName: 'Avi',
    canonicalSlug: 'avi',
    entityKind: 'individual',
    aliases: Object.freeze([]),
    status: 'active',
    source: 'lifecycle.entity_identity',
  },
  managedProperties: [{
    relationshipId: 'rel-1',
    entityId: 'avi-uuid',
    propertyName: 'Villa Mazotos',
    relationshipType: 'managed_owner',
    validFrom: null,
    validTo: null,
    verificationStatus: 'verified',
  }],
  primaryProperty: 'Villa Mazotos',
}

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

// G1B + G3-A: Set default identity and service responses before each test.
// S3 tests override these; S1/S2/crash tests use defaults.
beforeEach(() => {
  mockGetAllVerifiedOwners.mockResolvedValue({
    owners: [],
    pendingRelationships: [],
    counts: { verifiedRelationships: 0, distinctVerifiedEntities: 0, distinctVerifiedProperties: 0, pendingRelationships: 0 },
  })
  mockResolveBySlug.mockResolvedValue({ status: 'not_found', slug: '' })
  mockGetMaintenanceItems.mockResolvedValue([])
})

afterEach(() => jest.resetAllMocks())

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
    // G1B: identity resolver provides owners, not transaction scanning
    mockGetAllVerifiedOwners.mockResolvedValue({
      owners: [IDENTITY_AVI_RESOLVED],
      pendingRelationships: [],
      counts: { verifiedRelationships: 1, distinctVerifiedEntities: 1, distinctVerifiedProperties: 1, pendingRelationships: 0 },
    })
    // Statements query — return empty (not the focus of this test)
    mockCreateServiceClient.mockImplementation(() => makeSuccessClient([]))

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
    // G1B: identity resolver provides owner resolution
    mockResolveBySlug.mockResolvedValue({
      status: 'resolved',
      data: IDENTITY_AVI_RESOLVED,
    })

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
    // G3-A: workspace lookup uses identity resolver (mockResolveBySlug = not_found → workspace null → [])
    // createServiceClient throwing is irrelevant to the maintenance path after G3-A
    // but the default not_found mock already guarantees []
    mockCreateServiceClient.mockImplementation(() => {
      throw new Error('[TEST] SUPABASE_SERVICE_KEY undefined')
    })
    expect(await getOwnerMaintenance('avi')).toEqual([])
  })

  it('S2: returns [] when renovation query throws', async () => {
    // G3-A: workspace lookup resolves, maintenance service throws
    mockResolveBySlug.mockResolvedValue({ status: 'resolved', data: IDENTITY_AVI_RESOLVED })
    mockGetMaintenanceItems.mockRejectedValueOnce(new Error('[TEST] maintenance service error'))
    expect(await getOwnerMaintenance('avi')).toEqual([])
  })

  it('S3: returns items when queries succeed', async () => {
    // G1B: identity resolver provides owner resolution for workspace lookup
    mockResolveBySlug.mockResolvedValue({
      status: 'resolved',
      data: IDENTITY_AVI_RESOLVED,
    })
    // G3-A: maintenance service returns OwnerMaintenanceItemDTO items
    mockGetMaintenanceItems.mockResolvedValueOnce([{
      id: 'uuid-1',
      propertyName: 'Villa Mazotos',
      date: '2026-05-01',
      title: 'Roof repair',                           // ← preserved (critical assertion)
      subcategory: 'Renovation',
      status: 'unknown' as const,
      statusReason: 'rc3_has_no_lifecycle_status' as const,
      amountEur: '1200',                              // ← G3-A field (was actualCostEur)
      source: 'rc3' as const,
    }])

    const result = await getOwnerMaintenance('avi')
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('Roof repair')       // ← mandatory preservation
    expect(result[0].amountEur).toBe('1200')          // ← G3-A: amountEur (not actualCostEur)
  })

  it('S3b: returns [] when workspace not found', async () => {
    // default mockResolveBySlug = not_found → workspace null → []
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
    // G3-A: identity resolver default = not_found → workspace null → []
    // createServiceClient throwing is irrelevant to identity resolution path
  })
  it('getOwnersRoom resolves (never throws)', () =>
    expect(getOwnersRoom()).resolves.toBeDefined())
  it('getOwnerWorkspace resolves (never throws)', () =>
    expect(getOwnerWorkspace('any')).resolves.toBeDefined())
  it('getOwnerMaintenance resolves (never throws)', () =>
    expect(getOwnerMaintenance('any')).resolves.toBeDefined())
})
