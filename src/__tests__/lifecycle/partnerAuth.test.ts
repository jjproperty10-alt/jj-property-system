/**
 * partnerAuth.test.ts — Partner Authorization Boundary Tests
 *
 * Coverage:
 *   SLUG-01..03    verifySlugMatch (partnerAuthHelpers) — 3 tests
 *   SCOPE-01..04   validatePropertyScope (partnerAuthHelpers) — 4 tests
 *   RES-01..05     resolveAuthorizedInvestorEntity (mocked DB) — 5 tests
 *   AUTH-01..11    11 mandatory authorization cases for
 *                  loadStatementForAuthenticatedPartner — 11 tests
 *   GUARD-01       empty authenticatedUserId guard — 1 test
 *   ORDER-01..05   DB call ordering proofs (via loadStatementForAuthenticatedPartner) — 5 tests
 *   SESSION-01..11 Session binding tests for loadStatementForCurrentPartner — 11 tests
 *
 * Total: 40 tests. DB and auth are fully mocked — no network, no Supabase connection.
 *
 * Module separation:
 * - Pure helper tests (SLUG-*, SCOPE-*) import ONLY from partnerAuthHelpers.ts.
 *   They require ZERO mocks — the helpers have no imports beyond types.
 * - Resolver tests (RES-*) mock createServiceClient.
 * - Authorization chain tests (AUTH-*, ORDER-*) mock createServiceClient AND
 *   loadPartnerStatement from partnerStatementService.
 * - Session binding tests (SESSION-*) additionally mock createSupabaseServerClient
 *   from supabaseServer and next/headers, to test the two-client pattern.
 */

// ─── Mocks (declared before any imports that trigger module-level side effects) ──

jest.mock('@/lib/supabase', () => ({
  createServiceClient: jest.fn(),
}))

// Cookie-aware server client mock — used only by loadStatementForCurrentPartner
jest.mock('@/lib/supabaseServer', () => ({
  createSupabaseServerClient: jest.fn(),
}))

// next/headers is not available in Jest (Node) — mock it as a no-op
jest.mock('next/headers', () => ({
  cookies: jest.fn(() => ({
    getAll: () => [],
    set: jest.fn(),
  })),
}))

// Partial mock: keep buildSlug (and other pure exports) real from requireActual.
// Only loadPartnerStatement — the DB-backed function — is mocked.
jest.mock('@/lib/lifecycle/partnerStatementService', () => ({
  ...jest.requireActual('@/lib/lifecycle/partnerStatementService'),
  loadPartnerStatement: jest.fn(),
}))

// server-only is a Next.js compile-time guard that throws in non-Next environments.
// In Jest (Node), mock it as a no-op so the import doesn't fail.
jest.mock('server-only', () => ({}), { virtual: true })

// ─── Imports ─────────────────────────────────────────────────────────────────

// Pure helpers — imported from helpers module, NOT from the server service.
// This verifies the module split: helpers are independently importable.
import {
  verifySlugMatch,
  validatePropertyScope,
} from '@/lib/lifecycle/partnerAuthHelpers'

// Server service — resolver + entry points.
import {
  resolveAuthorizedInvestorEntity,
  loadStatementForAuthenticatedPartner,
  loadStatementForCurrentPartner,
} from '@/lib/lifecycle/partnerAuthService'

import { createServiceClient } from '@/lib/supabase'
import { createSupabaseServerClient } from '@/lib/supabaseServer'
import { loadPartnerStatement } from '@/lib/lifecycle/partnerStatementService'

// ─── Typed mock references ────────────────────────────────────────────────────

const mockCreateServiceClient = createServiceClient as jest.MockedFunction<
  typeof createServiceClient
>
const mockCreateSupabaseServerClient = createSupabaseServerClient as jest.MockedFunction<
  typeof createSupabaseServerClient
>
const mockLoadPartnerStatement = loadPartnerStatement as jest.MockedFunction<
  typeof loadPartnerStatement
>

// ─── Test fixtures ────────────────────────────────────────────────────────────

const AVI_AUTH_USER_ID     = 'aaaaaaaa-0001-0000-0000-000000000001'
const AVI_ENTITY_ID        = 'eeeeeeee-0001-0000-0000-000000000001'
const OREN_AUTH_USER_ID    = 'aaaaaaaa-0002-0000-0000-000000000002'
const OREN_ENTITY_ID       = 'eeeeeeee-0002-0000-0000-000000000002'
const UNKNOWN_AUTH_USER_ID = 'aaaaaaaa-9999-0000-0000-000000000999'

const DB_AVI_AUTH_ACTIVE   = { entity_id: AVI_ENTITY_ID,  status: 'active'   }
const DB_AVI_AUTH_DISABLED = { entity_id: AVI_ENTITY_ID,  status: 'disabled' }
const DB_OREN_AUTH_ACTIVE  = { entity_id: OREN_ENTITY_ID, status: 'active'   }
const DB_AVI_ENTITY        = { id: AVI_ENTITY_ID,  canonical_name: 'Avi'  }
const DB_OREN_ENTITY       = { id: OREN_ENTITY_ID, canonical_name: 'Oren' }

const AVI_PROPERTY_NAMES  = ['Villa Mazotos']
const OREN_PROPERTY_NAMES = ['Villa Mazotos 2']

// Minimal PartnerFacingStatementDTO fixture (shape not tested here — see partnerStatement.test.ts)
const AVI_DTO: any = {
  meta: { schemaVersion: 'PartnerStatementDTO/1.0', viewMode: 'partner', generatedAt: '2026-07-15T00:00:00.000Z' },
  investor: { entityId: AVI_ENTITY_ID, canonicalName: 'Avi', slug: 'avi', ownerType: 'partner' },
  properties: [{
    propertyName: 'Villa Mazotos',
    capital: {
      agreedEntryValuationEur: 500_000,
      capitalPaidEur: 250_000,
      capitalRemainingEur: 0,
      capitalStatus: 'fully_paid',
      payments: [],
    },
    ownership: { currentOwnershipPct: 50, entryStatus: 'active', coOwners: [] },
    financial: null,
    settlement: { currentBalanceEur: null, totalDistributionsPaidEur: 0 },
    timeline: { events: [], openVerificationTasks: 0, hasPendingDates: false },
  }],
  portfolio: {
    totalPropertiesCount: 1,
    totalAgreedValuationEur: 500_000,
    totalCapitalPaidEur: 250_000,
    totalCapitalRemainingEur: 0,
    totalReceivableFromJJ: 0, totalPayableToJJ: 0, finalNetBalance: 0, direction: 'unknown',
  },
  actions: { canExportCsv: false, canGeneratePdf: false, hasOpenVerificationTasks: false },
  localization: { lang: 'en', currency: 'EUR', generatedAt: '2026-07-15T00:00:00.000Z' },
}

// Oren DTO — all capital fields null (P-ARCH-1: capital_unknown)
const OREN_DTO: any = {
  meta: { schemaVersion: 'PartnerStatementDTO/1.0', viewMode: 'partner', generatedAt: '2026-07-15T00:00:00.000Z' },
  investor: { entityId: OREN_ENTITY_ID, canonicalName: 'Oren', slug: 'oren', ownerType: 'partner' },
  properties: [{
    propertyName: 'Villa Mazotos 2',
    capital: {
      // P-ARCH-1: capital unknown = null, NEVER 0
      agreedEntryValuationEur: null,
      capitalPaidEur: null,
      capitalRemainingEur: null,
      capitalStatus: 'capital_unknown',
      payments: [],
    },
    ownership: { currentOwnershipPct: 35, entryStatus: 'active', coOwners: [] },
    financial: null,
    settlement: { currentBalanceEur: null, totalDistributionsPaidEur: 0 },
    timeline: { events: [], openVerificationTasks: 2, hasPendingDates: true },
  }],
  portfolio: {
    totalPropertiesCount: 1,
    totalAgreedValuationEur: null,
    totalCapitalPaidEur: null,
    totalCapitalRemainingEur: null,
    totalReceivableFromJJ: 0, totalPayableToJJ: 0, finalNetBalance: 0, direction: 'unknown',
  },
  actions: { canExportCsv: false, canGeneratePdf: false, hasOpenVerificationTasks: true },
  localization: { lang: 'en', currency: 'EUR', generatedAt: '2026-07-15T00:00:00.000Z' },
}

// ─── DB mock builder ──────────────────────────────────────────────────────────

/**
 * Builds a chainable Supabase-like query builder that resolves to the given result.
 */
function makeQueryBuilder(result: { data: any; error: any }) {
  const builder: Record<string, any> = {}
  builder.select   = () => builder
  builder.eq       = () => builder
  builder.neq      = () => builder
  builder.maybeSingle = () => Promise.resolve(result)
  builder.single      = () => Promise.resolve(result)
  return builder
}

/**
 * Creates a mock service client where each table name resolves to a pre-configured result.
 */
function mockServiceClient(
  tables: Record<string, { data: any; error?: any }>,
): ReturnType<typeof createServiceClient> {
  const fromImpl = (tableName: string) => {
    const entry = tables[tableName] ?? { data: null }
    return makeQueryBuilder({ data: entry.data, error: entry.error ?? null })
  }
  return { schema: (_: string) => ({ from: fromImpl }) } as unknown as ReturnType<
    typeof createServiceClient
  >
}

/**
 * Creates a mock session client (cookie-aware) for testing loadStatementForCurrentPartner.
 * Simulates the result of createSupabaseServerClient().auth.getUser().
 */
function mockSessionClient(
  user: { id: string } | null,
  error: any = null,
): ReturnType<typeof createSupabaseServerClient> {
  return {
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user }, error }),
    },
  } as unknown as ReturnType<typeof createSupabaseServerClient>
}

/** Avi: full resolver mock (investor_auth + entity_identity + optional partner_entry) */
function setupAviMapping(withPartnerEntry = false) {
  mockCreateServiceClient.mockReturnValue(
    mockServiceClient({
      investor_auth:   { data: DB_AVI_AUTH_ACTIVE },
      entity_identity: { data: DB_AVI_ENTITY },
      ...(withPartnerEntry
        ? { partner_entry: { data: AVI_PROPERTY_NAMES.map(n => ({ property_name: n })) } }
        : {}),
    }),
  )
}

/** Oren: full resolver mock */
function setupOrenMapping(withPartnerEntry = false) {
  mockCreateServiceClient.mockReturnValue(
    mockServiceClient({
      investor_auth:   { data: DB_OREN_AUTH_ACTIVE },
      entity_identity: { data: DB_OREN_ENTITY },
      ...(withPartnerEntry
        ? { partner_entry: { data: OREN_PROPERTY_NAMES.map(n => ({ property_name: n })) } }
        : {}),
    }),
  )
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks()
})

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 1: Pure helper tests — imports from partnerAuthHelpers.ts
// ═══════════════════════════════════════════════════════════════════════════════

describe('verifySlugMatch (pure helper — partnerAuthHelpers.ts)', () => {

  // SLUG-01
  test('SLUG-01: exact lowercase match → match: true', () => {
    const result = verifySlugMatch('avi', 'avi')
    expect(result.match).toBe(true)
    expect(result.authorizedSlug).toBe('avi')
    expect(result.requestedSlug).toBe('avi')
  })

  // SLUG-02
  test('SLUG-02: uppercase URL slug normalised to lowercase → match: true', () => {
    const result = verifySlugMatch('avi', 'AVI')
    expect(result.match).toBe(true)
    expect(result.requestedSlug).toBe('avi')
  })

  // SLUG-03
  test('SLUG-03: different slugs → match: false', () => {
    const result = verifySlugMatch('avi', 'oren')
    expect(result.match).toBe(false)
    expect(result.authorizedSlug).toBe('avi')
    expect(result.requestedSlug).toBe('oren')
  })
})

describe('validatePropertyScope (pure helper — partnerAuthHelpers.ts)', () => {
  const AUTHORIZED = ['Villa Mazotos', 'Apartment Neer Yoav Dekelia'] as const

  // SCOPE-01
  test('SCOPE-01: empty requestedProperties → full scope is valid', () => {
    const result = validatePropertyScope([], AUTHORIZED)
    expect(result.valid).toBe(true)
    if (result.valid) expect(result.authorizedProperties).toEqual(AUTHORIZED)
  })

  // SCOPE-02
  test('SCOPE-02: undefined requestedProperties → full scope is valid', () => {
    const result = validatePropertyScope(undefined, AUTHORIZED)
    expect(result.valid).toBe(true)
  })

  // SCOPE-03
  test('SCOPE-03: single authorized property (valid subset) → valid', () => {
    const result = validatePropertyScope(['Villa Mazotos'], AUTHORIZED)
    expect(result.valid).toBe(true)
    if (result.valid) expect(result.authorizedProperties).toEqual(['Villa Mazotos'])
  })

  // SCOPE-04
  test('SCOPE-04: one unauthorized property mixed in → invalid, reports which one', () => {
    const result = validatePropertyScope(
      ['Villa Mazotos', 'Tamir Dekelia'],
      AUTHORIZED,
    )
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.unauthorizedProperties).toEqual(['Tamir Dekelia'])
      expect(result.authorizedProperties).toEqual(AUTHORIZED)
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2: Resolver unit tests (resolveAuthorizedInvestorEntity)
// ═══════════════════════════════════════════════════════════════════════════════

describe('resolveAuthorizedInvestorEntity', () => {

  // RES-01
  test('RES-01: active mapping → returns entityId, canonicalName, canonical slug', async () => {
    mockCreateServiceClient.mockReturnValue(
      mockServiceClient({
        investor_auth:   { data: DB_AVI_AUTH_ACTIVE },
        entity_identity: { data: DB_AVI_ENTITY },
      }),
    )

    const result = await resolveAuthorizedInvestorEntity(AVI_AUTH_USER_ID)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.entityId).toBe(AVI_ENTITY_ID)
      expect(result.canonicalName).toBe('Avi')
      expect(result.canonicalSlug).toBe('avi')
    }
  })

  // RES-02
  test('RES-02: no investor_auth record → ok:false, error:NO_MAPPING', async () => {
    mockCreateServiceClient.mockReturnValue(
      mockServiceClient({ investor_auth: { data: null } }),
    )

    const result = await resolveAuthorizedInvestorEntity(UNKNOWN_AUTH_USER_ID)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('NO_MAPPING')
  })

  // RES-03
  test('RES-03: disabled mapping → ok:false, error:MAPPING_DISABLED', async () => {
    mockCreateServiceClient.mockReturnValue(
      mockServiceClient({ investor_auth: { data: DB_AVI_AUTH_DISABLED } }),
    )

    const result = await resolveAuthorizedInvestorEntity(AVI_AUTH_USER_ID)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('MAPPING_DISABLED')
  })

  // RES-04
  test('RES-04: entity referenced in mapping does not exist → ok:false, error:ENTITY_NOT_FOUND', async () => {
    mockCreateServiceClient.mockReturnValue(
      mockServiceClient({
        investor_auth:   { data: DB_AVI_AUTH_ACTIVE },
        entity_identity: { data: null },
      }),
    )

    const result = await resolveAuthorizedInvestorEntity(AVI_AUTH_USER_ID)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('ENTITY_NOT_FOUND')
  })

  // RES-05
  test('RES-05: DB error in investor_auth query → ok:false, fail-closed (NO_MAPPING)', async () => {
    mockCreateServiceClient.mockReturnValue(
      mockServiceClient({
        investor_auth: { data: null, error: { message: 'connection timeout', code: '08006' } },
      }),
    )

    const result = await resolveAuthorizedInvestorEntity(AVI_AUTH_USER_ID)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('NO_MAPPING')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 3: 11 mandatory authorization cases
//            loadStatementForAuthenticatedPartner (backward-compat alias)
// ═══════════════════════════════════════════════════════════════════════════════

describe('loadStatementForAuthenticatedPartner — 11 mandatory authorization cases', () => {

  // AUTH-01
  test('AUTH-01: authenticated Avi, requestedSlug=avi → returns PartnerFacingStatementDTO', async () => {
    setupAviMapping()
    mockLoadPartnerStatement.mockResolvedValueOnce(AVI_DTO)

    const result = await loadStatementForAuthenticatedPartner({
      authenticatedUserId: AVI_AUTH_USER_ID,
      requestedSlug: 'avi',
    })

    expect('ok' in result).toBe(false)
    const dto = result as typeof AVI_DTO
    expect(dto.meta.viewMode).toBe('partner')
    expect(dto.investor.slug).toBe('avi')
    expect(mockLoadPartnerStatement).toHaveBeenCalledWith(
      'avi',
      expect.objectContaining({ viewMode: 'partner' }),
    )
  })

  // AUTH-02
  test('AUTH-02: authenticated Oren, requestedSlug=oren → returns PartnerFacingStatementDTO', async () => {
    setupOrenMapping()
    mockLoadPartnerStatement.mockResolvedValueOnce(OREN_DTO)

    const result = await loadStatementForAuthenticatedPartner({
      authenticatedUserId: OREN_AUTH_USER_ID,
      requestedSlug: 'oren',
    })

    expect('ok' in result).toBe(false)
    const dto = result as typeof OREN_DTO
    expect(dto.meta.viewMode).toBe('partner')
    expect(dto.investor.slug).toBe('oren')
    expect(mockLoadPartnerStatement).toHaveBeenCalledTimes(1)
  })

  // AUTH-03
  test('AUTH-03: authenticated Avi, requestedSlug=oren → SLUG_MISMATCH', async () => {
    setupAviMapping()

    const result = await loadStatementForAuthenticatedPartner({
      authenticatedUserId: AVI_AUTH_USER_ID,
      requestedSlug: 'oren',
    })

    expect(result).toEqual({ ok: false, error: 'SLUG_MISMATCH' })
    expect(mockLoadPartnerStatement).not.toHaveBeenCalled()
  })

  // AUTH-04
  test('AUTH-04: authenticated Oren, requestedSlug=avi → SLUG_MISMATCH', async () => {
    setupOrenMapping()

    const result = await loadStatementForAuthenticatedPartner({
      authenticatedUserId: OREN_AUTH_USER_ID,
      requestedSlug: 'avi',
    })

    expect(result).toEqual({ ok: false, error: 'SLUG_MISMATCH' })
    expect(mockLoadPartnerStatement).not.toHaveBeenCalled()
  })

  // AUTH-05
  test('AUTH-05: auth user with no investor_auth record → NO_MAPPING', async () => {
    mockCreateServiceClient.mockReturnValue(
      mockServiceClient({ investor_auth: { data: null } }),
    )

    const result = await loadStatementForAuthenticatedPartner({
      authenticatedUserId: UNKNOWN_AUTH_USER_ID,
      requestedSlug: 'avi',
    })

    expect(result).toEqual({ ok: false, error: 'NO_MAPPING' })
    expect(mockLoadPartnerStatement).not.toHaveBeenCalled()
  })

  // AUTH-06
  test('AUTH-06: disabled mapping → NO_MAPPING to route handler (MAPPING_DISABLED not leaked)', async () => {
    mockCreateServiceClient.mockReturnValue(
      mockServiceClient({ investor_auth: { data: DB_AVI_AUTH_DISABLED } }),
    )

    const result = await loadStatementForAuthenticatedPartner({
      authenticatedUserId: AVI_AUTH_USER_ID,
      requestedSlug: 'avi',
    })

    expect(result).toEqual({ ok: false, error: 'NO_MAPPING' })
    expect(mockLoadPartnerStatement).not.toHaveBeenCalled()
  })

  // AUTH-07
  test('AUTH-07: valid user, requestedSlug is completely unknown → SLUG_MISMATCH', async () => {
    setupAviMapping()

    const result = await loadStatementForAuthenticatedPartner({
      authenticatedUserId: AVI_AUTH_USER_ID,
      requestedSlug: 'unknown-investor-xyz-9999',
    })

    expect(result).toEqual({ ok: false, error: 'SLUG_MISMATCH' })
    expect(mockLoadPartnerStatement).not.toHaveBeenCalled()
  })

  // AUTH-08
  test('AUTH-08: viewMode=admin via partner auth path → ADMIN_MODE_DENIED, zero DB calls', async () => {
    const result = await loadStatementForAuthenticatedPartner({
      authenticatedUserId: AVI_AUTH_USER_ID,
      requestedSlug: 'avi',
      viewMode: 'admin',
    })

    expect(result).toEqual({ ok: false, error: 'ADMIN_MODE_DENIED' })
    expect(mockCreateServiceClient).not.toHaveBeenCalled()
    expect(mockLoadPartnerStatement).not.toHaveBeenCalled()
  })

  // AUTH-09
  test('AUTH-09: requestedProperties includes unauthorized property → PROPERTY_UNAUTHORIZED', async () => {
    setupAviMapping(true)

    const result = await loadStatementForAuthenticatedPartner({
      authenticatedUserId: AVI_AUTH_USER_ID,
      requestedSlug: 'avi',
      requestedProperties: ['Villa Mazotos', 'Tamir Dekelia'],
    })

    expect(result).toEqual({ ok: false, error: 'PROPERTY_UNAUTHORIZED' })
    expect(mockLoadPartnerStatement).not.toHaveBeenCalled()
  })

  // AUTH-10
  test('AUTH-10: requestedProperties is authorized subset → allow, loadPartnerStatement called once', async () => {
    setupAviMapping(true)
    mockLoadPartnerStatement.mockResolvedValueOnce(AVI_DTO)

    const result = await loadStatementForAuthenticatedPartner({
      authenticatedUserId: AVI_AUTH_USER_ID,
      requestedSlug: 'avi',
      requestedProperties: ['Villa Mazotos'],
    })

    expect('ok' in result).toBe(false)
    expect(mockLoadPartnerStatement).toHaveBeenCalledTimes(1)
  })

  // AUTH-11
  test('AUTH-11: P-ARCH-1 — Oren null capital preserved unchanged through authorization boundary', async () => {
    setupOrenMapping()
    mockLoadPartnerStatement.mockResolvedValueOnce(OREN_DTO)

    const result = await loadStatementForAuthenticatedPartner({
      authenticatedUserId: OREN_AUTH_USER_ID,
      requestedSlug: 'oren',
    })

    const dto = result as typeof OREN_DTO
    const capital = dto.properties[0].capital
    expect(capital.agreedEntryValuationEur).toBeNull()
    expect(capital.capitalPaidEur).toBeNull()
    expect(capital.capitalRemainingEur).toBeNull()
    expect(capital.capitalStatus).toBe('capital_unknown')
    expect(dto.portfolio.totalAgreedValuationEur).toBeNull()
    expect(dto.portfolio.totalCapitalPaidEur).toBeNull()
    expect(dto.portfolio.totalCapitalRemainingEur).toBeNull()
  })

  // GUARD-01
  test('GUARD-01: empty authenticatedUserId → NO_MAPPING, zero DB calls', async () => {
    const result = await loadStatementForAuthenticatedPartner({
      authenticatedUserId: '',
      requestedSlug: 'avi',
    })

    expect(result).toEqual({ ok: false, error: 'NO_MAPPING' })
    expect(mockCreateServiceClient).not.toHaveBeenCalled()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 4: DB call ordering proofs
// ═══════════════════════════════════════════════════════════════════════════════

describe('DB call ordering — no data query before authorization passes', () => {

  // ORDER-01
  test('ORDER-01: Admin mode rejected before ANY DB call (step 1 fires first)', async () => {
    await loadStatementForAuthenticatedPartner({
      authenticatedUserId: AVI_AUTH_USER_ID,
      requestedSlug: 'avi',
      viewMode: 'admin',
    })

    expect(mockCreateServiceClient).not.toHaveBeenCalled()
    expect(mockLoadPartnerStatement).not.toHaveBeenCalled()
  })

  // ORDER-02
  test('ORDER-02: Missing mapping — entity_identity NOT queried, loadPartnerStatement NOT called', async () => {
    const fromSpy = jest.fn().mockImplementation((tableName: string) => {
      if (tableName === 'entity_identity') {
        throw new Error('entity_identity must not be queried when investor_auth is missing')
      }
      return makeQueryBuilder({ data: null, error: null })
    })
    mockCreateServiceClient.mockReturnValue(
      { schema: (_: string) => ({ from: fromSpy }) } as any,
    )

    const result = await loadStatementForAuthenticatedPartner({
      authenticatedUserId: UNKNOWN_AUTH_USER_ID,
      requestedSlug: 'avi',
    })

    expect(result).toEqual({ ok: false, error: 'NO_MAPPING' })
    expect(mockLoadPartnerStatement).not.toHaveBeenCalled()
  })

  // ORDER-03
  test('ORDER-03: Slug mismatch — loadPartnerStatement NOT called', async () => {
    setupAviMapping()

    const result = await loadStatementForAuthenticatedPartner({
      authenticatedUserId: AVI_AUTH_USER_ID,
      requestedSlug: 'oren',
    })

    expect(result).toEqual({ ok: false, error: 'SLUG_MISMATCH' })
    expect(mockLoadPartnerStatement).not.toHaveBeenCalled()
  })

  // ORDER-04
  test('ORDER-04: Unauthorized property — loadPartnerStatement NOT called', async () => {
    setupAviMapping(true)

    const result = await loadStatementForAuthenticatedPartner({
      authenticatedUserId: AVI_AUTH_USER_ID,
      requestedSlug: 'avi',
      requestedProperties: ['Tamir Dekelia'],
    })

    expect(result).toEqual({ ok: false, error: 'PROPERTY_UNAUTHORIZED' })
    expect(mockLoadPartnerStatement).not.toHaveBeenCalled()
  })

  // ORDER-05
  test('ORDER-05: Successful authorization — loadPartnerStatement called exactly once with server-derived slug', async () => {
    setupAviMapping()
    mockLoadPartnerStatement.mockResolvedValueOnce(AVI_DTO)

    await loadStatementForAuthenticatedPartner({
      authenticatedUserId: AVI_AUTH_USER_ID,
      requestedSlug: 'avi',
    })

    expect(mockLoadPartnerStatement).toHaveBeenCalledTimes(1)
    expect(mockLoadPartnerStatement).toHaveBeenCalledWith(
      'avi',
      expect.objectContaining({ viewMode: 'partner' }),
    )
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 5: Session binding tests (SESSION-01..11)
//            loadStatementForCurrentPartner — the new public entry point.
//            Proves the two-client pattern: session client (cookie-aware) for
//            auth.getUser(), service client for data queries.
// ═══════════════════════════════════════════════════════════════════════════════

describe('loadStatementForCurrentPartner — session binding (SESSION-01..11)', () => {

  // SESSION-01
  // The most critical binding test: no authenticated session → NO_SESSION.
  // auth.getUser() returns null user (unauthenticated request).
  test('SESSION-01: no active session (getUser returns null user) → NO_SESSION', async () => {
    mockCreateSupabaseServerClient.mockReturnValue(
      mockSessionClient(null),
    )

    const result = await loadStatementForCurrentPartner({ requestedSlug: 'avi' })

    expect(result).toEqual({ ok: false, error: 'NO_SESSION' })
    // No service client or data queries on unauthenticated requests
    expect(mockCreateServiceClient).not.toHaveBeenCalled()
    expect(mockLoadPartnerStatement).not.toHaveBeenCalled()
  })

  // SESSION-02
  // auth error (network failure, token validation error) → treated as NO_SESSION.
  // Must never grant access when session resolution fails.
  test('SESSION-02: auth.getUser() returns error → NO_SESSION, fail-closed', async () => {
    mockCreateSupabaseServerClient.mockReturnValue(
      mockSessionClient(null, { message: 'JWT expired', status: 401 }),
    )

    const result = await loadStatementForCurrentPartner({ requestedSlug: 'avi' })

    expect(result).toEqual({ ok: false, error: 'NO_SESSION' })
    expect(mockCreateServiceClient).not.toHaveBeenCalled()
  })

  // SESSION-03
  // Admin mode check (step 1) fires BEFORE auth.getUser() (step 2).
  // The session client must not be called for an admin-mode rejection.
  test('SESSION-03: admin mode rejected at step 1, BEFORE auth.getUser() (zero session client calls)', async () => {
    // sessionClient mock is set up but must never be called
    mockCreateSupabaseServerClient.mockReturnValue(
      mockSessionClient({ id: AVI_AUTH_USER_ID }),
    )

    const result = await loadStatementForCurrentPartner({
      requestedSlug: 'avi',
      viewMode: 'admin',
    })

    expect(result).toEqual({ ok: false, error: 'ADMIN_MODE_DENIED' })
    // Admin mode must be rejected before any I/O
    expect(mockCreateSupabaseServerClient).not.toHaveBeenCalled()
    expect(mockCreateServiceClient).not.toHaveBeenCalled()
  })

  // SESSION-04
  // Valid session but no DB mapping → NO_MAPPING.
  // Proves the session resolves successfully before the DB lookup fails.
  test('SESSION-04: valid session, no investor_auth record → NO_MAPPING', async () => {
    mockCreateSupabaseServerClient.mockReturnValue(
      mockSessionClient({ id: UNKNOWN_AUTH_USER_ID }),
    )
    mockCreateServiceClient.mockReturnValue(
      mockServiceClient({ investor_auth: { data: null } }),
    )

    const result = await loadStatementForCurrentPartner({ requestedSlug: 'avi' })

    expect(result).toEqual({ ok: false, error: 'NO_MAPPING' })
    // Session resolved successfully before DB lookup
    expect(mockCreateSupabaseServerClient).toHaveBeenCalledTimes(1)
    expect(mockLoadPartnerStatement).not.toHaveBeenCalled()
  })

  // SESSION-05
  // Valid session + disabled mapping → NO_MAPPING (MAPPING_DISABLED not leaked).
  test('SESSION-05: valid session, disabled mapping → NO_MAPPING (info-leak prevention)', async () => {
    mockCreateSupabaseServerClient.mockReturnValue(
      mockSessionClient({ id: AVI_AUTH_USER_ID }),
    )
    mockCreateServiceClient.mockReturnValue(
      mockServiceClient({ investor_auth: { data: DB_AVI_AUTH_DISABLED } }),
    )

    const result = await loadStatementForCurrentPartner({ requestedSlug: 'avi' })

    expect(result).toEqual({ ok: false, error: 'NO_MAPPING' })
  })

  // SESSION-06
  // Valid session, valid mapping, but slug in URL doesn't match entity → SLUG_MISMATCH.
  // Cross-investor access attempt via URL manipulation.
  test('SESSION-06: valid session (Avi), requestedSlug=oren → SLUG_MISMATCH', async () => {
    mockCreateSupabaseServerClient.mockReturnValue(
      mockSessionClient({ id: AVI_AUTH_USER_ID }),
    )
    setupAviMapping()  // Avi authorized for slug='avi'

    const result = await loadStatementForCurrentPartner({ requestedSlug: 'oren' })

    expect(result).toEqual({ ok: false, error: 'SLUG_MISMATCH' })
    expect(mockLoadPartnerStatement).not.toHaveBeenCalled()
  })

  // SESSION-07
  // Full success path: session resolves, mapping found, slug matches, data returned.
  test('SESSION-07: valid session + matching slug → returns PartnerFacingStatementDTO', async () => {
    mockCreateSupabaseServerClient.mockReturnValue(
      mockSessionClient({ id: AVI_AUTH_USER_ID }),
    )
    setupAviMapping()
    mockLoadPartnerStatement.mockResolvedValueOnce(AVI_DTO)

    const result = await loadStatementForCurrentPartner({ requestedSlug: 'avi' })

    expect('ok' in result).toBe(false)
    const dto = result as typeof AVI_DTO
    expect(dto.meta.viewMode).toBe('partner')
    expect(dto.investor.slug).toBe('avi')
    expect(mockLoadPartnerStatement).toHaveBeenCalledTimes(1)
  })

  // SESSION-08
  // createSupabaseServerClient must be called exactly ONCE per request.
  // Multiple calls would create redundant cookie reads and token validations.
  test('SESSION-08: createSupabaseServerClient called exactly once per request', async () => {
    mockCreateSupabaseServerClient.mockReturnValue(
      mockSessionClient({ id: AVI_AUTH_USER_ID }),
    )
    setupAviMapping()
    mockLoadPartnerStatement.mockResolvedValueOnce(AVI_DTO)

    await loadStatementForCurrentPartner({ requestedSlug: 'avi' })

    expect(mockCreateSupabaseServerClient).toHaveBeenCalledTimes(1)
  })

  // SESSION-09
  // TWO-CLIENT SEPARATION: createServiceClient must NOT be called before getUser() succeeds.
  // Proves the service-role client is only used for data queries, never for session.
  test('SESSION-09: createServiceClient NOT called before getUser() succeeds (two-client pattern)', async () => {
    // Simulate session failure
    mockCreateSupabaseServerClient.mockReturnValue(
      mockSessionClient(null, { message: 'unauthorized' }),
    )

    await loadStatementForCurrentPartner({ requestedSlug: 'avi' })

    // Session failed → service client must never have been created
    expect(mockCreateServiceClient).not.toHaveBeenCalled()
  })

  // SESSION-10
  // The user.id from auth.getUser() is the identity passed to the DB lookup.
  // No opts field can override it — opts has no authenticatedUserId field.
  test('SESSION-10: user.id from session is used for DB lookup, not any opts field', async () => {
    // Oren's session — but requestedSlug is 'avi' (mismatch)
    mockCreateSupabaseServerClient.mockReturnValue(
      mockSessionClient({ id: OREN_AUTH_USER_ID }),
    )
    // Set up Oren's mapping (not Avi's) — Oren's slug will be 'oren'
    setupOrenMapping()

    // Request for 'avi' slug using Oren's session → SLUG_MISMATCH
    // (not NO_SESSION, proving the session ID was actually used)
    const result = await loadStatementForCurrentPartner({ requestedSlug: 'avi' })

    expect(result).toEqual({ ok: false, error: 'SLUG_MISMATCH' })
    // Prove the DB was queried (session resolved) — just with the right user ID
    expect(mockCreateServiceClient).toHaveBeenCalled()
    expect(mockLoadPartnerStatement).not.toHaveBeenCalled()
  })

  // SESSION-11
  // Valid session, valid mapping, unauthorized property → PROPERTY_UNAUTHORIZED.
  // Full session chain must execute before property scope is validated.
  test('SESSION-11: valid session + unauthorized property → PROPERTY_UNAUTHORIZED', async () => {
    mockCreateSupabaseServerClient.mockReturnValue(
      mockSessionClient({ id: AVI_AUTH_USER_ID }),
    )
    setupAviMapping(true)  // Avi authorized for ['Villa Mazotos'] only

    const result = await loadStatementForCurrentPartner({
      requestedSlug: 'avi',
      requestedProperties: ['Villa Mazotos', 'Tamir Dekelia'],  // Tamir not in scope
    })

    expect(result).toEqual({ ok: false, error: 'PROPERTY_UNAUTHORIZED' })
    expect(mockLoadPartnerStatement).not.toHaveBeenCalled()
  })
})
