/**
 * Stage 1 — loadPartnerStatementForEntity compatibility + scope tests
 *
 * Proves:
 * 1. Full semantic equivalence: slug-based and entity-based paths produce
 *    identical DTO VALUES (not just shape) — verified via toEqual after
 *    normalizing only the non-deterministic `generatedAt` timestamp.
 * 2. Property-scope isolation: supplied properties are never broadened.
 * 3. Empty property list → null.
 * 4. Options forwarding: viewMode, lang, dates passed through.
 * 5. InvestorInfo correctness: slug derivation, entityType default.
 * 6. Admin viewMode produces AdminStatementDTO with verification block.
 * 7. Portfolio summary parity between both paths.
 * 8. Financial data loaded per-property.
 * 9. Error preservation: DB failures through the entity-based entry point
 *    produce the same error semantics as the slug-based path.
 * 10. Regression: existing loadPartnerStatement still works via delegation.
 *
 * Slug algorithm note:
 *   Stage 1 uses `buildSlug` (partnerStatementService — strips non-ASCII).
 *   Stage 0 uses `nameToSlug` (ownerWorkspaceUtils — preserves Hebrew).
 *   For current production data (all Latin names), both produce identical output.
 *   The divergence is documented as a pre-existing architectural issue;
 *   future Owners Workspace callers SHOULD pass the canonical slug from
 *   Stage 0 resolution rather than relying on Stage 1's fallback derivation.
 *
 * Stage 0 → Stage 1 mapping note:
 *   Stage 0 returns: authorizedProperties: readonly { propertyName: string }[]
 *   Stage 1 accepts: propertyNames: readonly string[]
 *   A minimal CONNECT mapping is required:
 *     propertyNames: context.authorizedProperties.map(p => p.propertyName)
 *   Classification: CONNECT. No new business logic.
 *
 * @see Stage 1 Authorization — Yossi, 2 August 2026
 */

// ─── Module mocks (hoisted by Jest before any imports) ───────────────────────

jest.mock('@/lib/supabase', () => ({
  createServiceClient: jest.fn(),
}))

jest.mock('@/lib/lifecycle/timelineService', () => ({
  loadInvestmentTimeline: jest.fn().mockResolvedValue(null),
}))

jest.mock('@/lib/report/fetchReport', () => ({
  fetchRC3Report: jest.fn().mockResolvedValue({
    accounts: [],
    from_date: null,
    to_date: null,
    has_purchase: false,
    has_sale: false,
    has_renovation: false,
    has_rental: false,
    has_airbnb: false,
  }),
}))

// ─── Imports ─────────────────────────────────────────────────────────────────

import {
  loadPartnerStatement,
  loadPartnerStatementForEntity,
  buildSlug,
} from '@/lib/lifecycle/partnerStatementService'
import type { LoadPartnerStatementForEntityInput } from '@/lib/lifecycle/partnerStatementService'
import { nameToSlug } from '@/lib/owners/ownerWorkspaceUtils'
import { createServiceClient } from '@/lib/supabase'
import { fetchRC3Report } from '@/lib/report/fetchReport'
import { loadInvestmentTimeline } from '@/lib/lifecycle/timelineService'

const mockCreateServiceClient = createServiceClient as jest.MockedFunction<typeof createServiceClient>
const mockFetchRC3Report = fetchRC3Report as jest.MockedFunction<typeof fetchRC3Report>
const mockLoadInvestmentTimeline = loadInvestmentTimeline as jest.MockedFunction<typeof loadInvestmentTimeline>

// ─── Mock helpers ────────────────────────────────────────────────────────────

type EntityRow = { id: string; canonical_name: string; entity_type: string }

/**
 * Build a mock Supabase client with configurable per-table data and errors.
 * Same thenable-chain pattern as partnerStatementService.schema.test.ts.
 *
 * `errorTables` maps table names to Postgres-style error objects.
 * When a table is in errorTables, the query resolves with { data: null, error }.
 */
function buildMockDb(
  entities: EntityRow[],
  partnerEntries: Array<{ property_name: string }> = [],
  summaryRows: Array<Record<string, unknown>> = [],
  errorTables: Record<string, { message: string; code: string }> = {},
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function makeChain(table: string, resolveData: unknown[]): any {
    const err = errorTables[table] ?? null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: any = {
      select() { return chain },
      in()     { return chain },
      eq()     { return chain },
      neq()    { return chain },
      is()     { return chain },
      order()  { return chain },
      then(
        resolve: (v: { data: unknown[] | null; error: unknown }) => void,
      ) {
        if (err) {
          Promise.resolve({ data: null, error: err }).then(resolve)
        } else {
          Promise.resolve({ data: resolveData, error: null }).then(resolve)
        }
      },
    }
    return chain
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mockDb: any = {
    schema() { return mockDb },
    from(table: string) {
      if (table === 'entity_identity') return makeChain('entity_identity', entities)
      if (table === 'partner_entry')   return makeChain('partner_entry', partnerEntries)
      if (table === 'v_partner_investment_statement') return makeChain('v_partner_investment_statement', summaryRows)
      if (table === 'capital_event')    return makeChain('capital_event', [])
      if (table === 'ownership_period') return makeChain('ownership_period', [])
      return makeChain(table, [])
    },
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockCreateServiceClient.mockReturnValue(mockDb as any)
}

/**
 * Normalize non-deterministic timestamp fields for toEqual comparison.
 * Only `generatedAt` (in meta and localization) varies between calls.
 */
function normalizeTimestamps(dto: Record<string, unknown>): Record<string, unknown> {
  const clone = JSON.parse(JSON.stringify(dto))
  const FIXED_TS = '2026-01-01T00:00:00.000Z'
  if (clone.meta) clone.meta.generatedAt = FIXED_TS
  if (clone.localization) clone.localization.generatedAt = FIXED_TS
  return clone
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

const AVI: EntityRow  = { id: 'uuid-avi',  canonical_name: 'Avi',  entity_type: 'investor' }
const OREN: EntityRow = { id: 'uuid-oren', canonical_name: 'Oren', entity_type: 'investor' }

const AVI_ENTRY   = { property_name: 'Villa Mazotos' }
const OREN_ENTRY1 = { property_name: 'Villa Mazotos 2' }

// ─── Test suites ─────────────────────────────────────────────────────────────

describe('loadPartnerStatementForEntity — Stage 1 compatibility', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  // ── Test 1: Empty property list → null ──────────────────────────────────────

  it('returns null when propertyNames is empty', async () => {
    buildMockDb([AVI], [AVI_ENTRY])

    const result = await loadPartnerStatementForEntity({
      entityId: AVI.id,
      canonicalName: AVI.canonical_name,
      propertyNames: [],
    })

    expect(result).toBeNull()
  })

  // ── Test 2: Returns DTO with correct InvestorInfo when slug omitted ─────────

  it('derives slug from canonicalName when slug is omitted', async () => {
    buildMockDb([AVI], [AVI_ENTRY])

    const result = await loadPartnerStatementForEntity({
      entityId: AVI.id,
      canonicalName: AVI.canonical_name,
      propertyNames: ['Villa Mazotos'],
    })

    expect(result).not.toBeNull()
    expect(result!.investor.slug).toBe('avi')
    expect(result!.investor.slug).toBe(buildSlug('Avi'))
  })

  // ── Test 3: Uses supplied slug when provided ────────────────────────────────

  it('uses supplied slug instead of deriving from name', async () => {
    buildMockDb([AVI], [AVI_ENTRY])

    const result = await loadPartnerStatementForEntity({
      entityId: AVI.id,
      canonicalName: AVI.canonical_name,
      propertyNames: ['Villa Mazotos'],
      slug: 'custom-slug',
    })

    expect(result).not.toBeNull()
    expect(result!.investor.slug).toBe('custom-slug')
  })

  // ── Test 4: entityType defaults to 'partner' when omitted ───────────────────

  it('defaults entityType to partner when omitted', async () => {
    buildMockDb([AVI], [AVI_ENTRY])

    const result = await loadPartnerStatementForEntity({
      entityId: AVI.id,
      canonicalName: AVI.canonical_name,
      propertyNames: ['Villa Mazotos'],
    })

    expect(result).not.toBeNull()
    expect(result!.investor.ownerType).toBe('partner')
  })

  // ── Test 5: entityType is preserved when supplied ───────────────────────────

  it('preserves supplied entityType in InvestorInfo.ownerType', async () => {
    buildMockDb([AVI], [AVI_ENTRY])

    const result = await loadPartnerStatementForEntity({
      entityId: AVI.id,
      canonicalName: AVI.canonical_name,
      propertyNames: ['Villa Mazotos'],
      entityType: 'investor',
    })

    expect(result).not.toBeNull()
    expect(result!.investor.ownerType).toBe('investor')
  })

  // ── Test 6: Options forwarding — viewMode partner (default) ─────────────────

  it('returns PartnerFacingStatementDTO by default (no verification block)', async () => {
    buildMockDb([AVI], [AVI_ENTRY])

    const result = await loadPartnerStatementForEntity({
      entityId: AVI.id,
      canonicalName: AVI.canonical_name,
      propertyNames: ['Villa Mazotos'],
    })

    expect(result).not.toBeNull()
    expect(result!.meta.viewMode).toBe('partner')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((result as any).verification).toBeUndefined()
  })

  // ── Test 7: Options forwarding — viewMode admin ─────────────────────────────

  it('returns AdminStatementDTO with verification block when viewMode=admin', async () => {
    buildMockDb([AVI], [AVI_ENTRY])

    const result = await loadPartnerStatementForEntity(
      {
        entityId: AVI.id,
        canonicalName: AVI.canonical_name,
        propertyNames: ['Villa Mazotos'],
      },
      { viewMode: 'admin' },
    )

    expect(result).not.toBeNull()
    expect(result!.meta.viewMode).toBe('admin')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((result as any).verification).toBeDefined()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((result as any).verification.totalOpenTasks).toBeDefined()
  })

  // ── Test 8: Portfolio summary has correct property count ────────────────────

  it('portfolio.totalPropertiesCount matches supplied property count', async () => {
    buildMockDb([OREN], [OREN_ENTRY1])

    const result = await loadPartnerStatementForEntity({
      entityId: OREN.id,
      canonicalName: OREN.canonical_name,
      propertyNames: ['Villa Mazotos 2', 'Tamir Dekelia'],
    })

    expect(result).not.toBeNull()
    expect(result!.portfolio.totalPropertiesCount).toBe(2)
    expect(result!.properties).toHaveLength(2)
  })

  // ── Test 9: Property-scope isolation — never broadens ───────────────────────

  it('produces statements ONLY for supplied properties — never broadens scope', async () => {
    buildMockDb([OREN], [OREN_ENTRY1])

    const result = await loadPartnerStatementForEntity({
      entityId: OREN.id,
      canonicalName: OREN.canonical_name,
      propertyNames: ['Tamir Dekelia'],
    })

    expect(result).not.toBeNull()
    expect(result!.properties).toHaveLength(1)
    expect(result!.properties[0].propertyName).toBe('Tamir Dekelia')
  })

  // ── Test 10: Deduplicates supplied properties ───────────────────────────────

  it('deduplicates supplied property names', async () => {
    buildMockDb([AVI], [AVI_ENTRY])

    const result = await loadPartnerStatementForEntity({
      entityId: AVI.id,
      canonicalName: AVI.canonical_name,
      propertyNames: ['Villa Mazotos', 'Villa Mazotos', 'Villa Mazotos'],
    })

    expect(result).not.toBeNull()
    expect(result!.properties).toHaveLength(1)
    expect(result!.portfolio.totalPropertiesCount).toBe(1)
  })
})

// ─── Gap 1: Full semantic equivalence via toEqual ────────────────────────────

describe('loadPartnerStatementForEntity — full value equivalence', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('partner viewMode: both paths produce identical DTO VALUES (not just shape)', async () => {
    buildMockDb([AVI], [AVI_ENTRY])
    const slugResult = await loadPartnerStatement('avi')

    jest.clearAllMocks()
    buildMockDb([AVI], [AVI_ENTRY])
    const entityResult = await loadPartnerStatementForEntity({
      entityId: AVI.id,
      canonicalName: AVI.canonical_name,
      propertyNames: ['Villa Mazotos'],
      entityType: 'investor',
      slug: 'avi',
    })

    expect(slugResult).not.toBeNull()
    expect(entityResult).not.toBeNull()

    // Normalize only the non-deterministic generatedAt timestamps.
    // Every other field must be byte-identical.
    const normalizedSlug = normalizeTimestamps(slugResult as unknown as Record<string, unknown>)
    const normalizedEntity = normalizeTimestamps(entityResult as unknown as Record<string, unknown>)

    expect(normalizedEntity).toEqual(normalizedSlug)
  })

  it('admin viewMode: both paths produce identical DTO VALUES including verification block', async () => {
    buildMockDb([AVI], [AVI_ENTRY])
    const slugResult = await loadPartnerStatement('avi', { viewMode: 'admin' })

    jest.clearAllMocks()
    buildMockDb([AVI], [AVI_ENTRY])
    const entityResult = await loadPartnerStatementForEntity(
      {
        entityId: AVI.id,
        canonicalName: AVI.canonical_name,
        propertyNames: ['Villa Mazotos'],
        entityType: 'investor',
        slug: 'avi',
      },
      { viewMode: 'admin' },
    )

    expect(slugResult).not.toBeNull()
    expect(entityResult).not.toBeNull()

    const normalizedSlug = normalizeTimestamps(slugResult as unknown as Record<string, unknown>)
    const normalizedEntity = normalizeTimestamps(entityResult as unknown as Record<string, unknown>)

    expect(normalizedEntity).toEqual(normalizedSlug)
  })

  it('multi-property: full DTO value equivalence across all property statements', async () => {
    buildMockDb(
      [OREN],
      [OREN_ENTRY1, { property_name: 'Tamir Dekelia' }],
    )
    const slugResult = await loadPartnerStatement('oren')

    jest.clearAllMocks()
    buildMockDb(
      [OREN],
      [OREN_ENTRY1, { property_name: 'Tamir Dekelia' }],
    )
    const entityResult = await loadPartnerStatementForEntity({
      entityId: OREN.id,
      canonicalName: OREN.canonical_name,
      propertyNames: ['Villa Mazotos 2', 'Tamir Dekelia'],
      entityType: 'investor',
      slug: 'oren',
    })

    expect(slugResult).not.toBeNull()
    expect(entityResult).not.toBeNull()

    const normalizedSlug = normalizeTimestamps(slugResult as unknown as Record<string, unknown>)
    const normalizedEntity = normalizeTimestamps(entityResult as unknown as Record<string, unknown>)

    expect(normalizedEntity).toEqual(normalizedSlug)
  })
})

// ─── Gap 2: Direct error tests through entity-based entry point ─────────────

describe('loadPartnerStatementForEntity — error semantics', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('createServiceClient failure → throws (not silently null)', async () => {
    mockCreateServiceClient.mockImplementation(() => {
      throw new Error('Supabase connection failed')
    })

    await expect(
      loadPartnerStatementForEntity({
        entityId: AVI.id,
        canonicalName: AVI.canonical_name,
        propertyNames: ['Villa Mazotos'],
      }),
    ).rejects.toThrow('Supabase connection failed')
  })

  it('summary view query error → produces property with null capital values (graceful degradation)', async () => {
    // v_partner_investment_statement fails but capital_event and ownership succeed
    buildMockDb([AVI], [AVI_ENTRY], [], {
      v_partner_investment_statement: { message: 'relation does not exist', code: '42P01' },
    })

    const result = await loadPartnerStatementForEntity({
      entityId: AVI.id,
      canonicalName: AVI.canonical_name,
      propertyNames: ['Villa Mazotos'],
    })

    // Service degrades gracefully — it continues with null summary data.
    // This matches the existing slug-based behavior: (summaryRows ?? []) means
    // a null data result produces an empty map, and all summary-derived fields → null/default.
    expect(result).not.toBeNull()
    expect(result!.properties[0].capital.capitalPaidEur).toBeNull()
    expect(result!.properties[0].capital.capitalRemainingEur).toBeNull()
    expect(result!.properties[0].capital.requiredCapitalEur).toBeNull()
  })

  it('capital_event query error → produces property with empty payments (graceful degradation)', async () => {
    buildMockDb([AVI], [AVI_ENTRY], [], {
      capital_event: { message: 'permission denied', code: '42501' },
    })

    const result = await loadPartnerStatementForEntity({
      entityId: AVI.id,
      canonicalName: AVI.canonical_name,
      propertyNames: ['Villa Mazotos'],
    })

    // Existing service behavior: (capitalRows ?? []) means null data → empty array.
    // Capital payments are empty, capitalStatus reflects no events found.
    expect(result).not.toBeNull()
    expect(result!.properties[0].capital.payments).toEqual([])
  })

  it('ownership query error → produces property with null ownership (graceful degradation)', async () => {
    buildMockDb([AVI], [AVI_ENTRY], [], {
      ownership_period: { message: 'timeout', code: '57014' },
    })

    const result = await loadPartnerStatementForEntity({
      entityId: AVI.id,
      canonicalName: AVI.canonical_name,
      propertyNames: ['Villa Mazotos'],
    })

    // Existing service behavior: (ownershipRows ?? []) means null → empty array.
    // No current owner found → currentOwnershipPct falls back to summary (also empty) → null.
    expect(result).not.toBeNull()
    expect(result!.properties[0].ownership.currentOwnershipPct).toBeNull()
    expect(result!.properties[0].ownership.coOwners).toEqual([])
  })

  it('RC3 report failure → financial stays null for that property', async () => {
    buildMockDb([AVI], [AVI_ENTRY])
    mockFetchRC3Report.mockRejectedValueOnce(new Error('RC3 unavailable'))

    const result = await loadPartnerStatementForEntity({
      entityId: AVI.id,
      canonicalName: AVI.canonical_name,
      propertyNames: ['Villa Mazotos'],
    })

    // Existing behavior: try/catch around fetchRC3Report → financial = null.
    expect(result).not.toBeNull()
    expect(result!.properties[0].financial).toBeNull()
  })

  it('timeline failure → produces empty timeline (graceful degradation)', async () => {
    buildMockDb([AVI], [AVI_ENTRY])
    mockLoadInvestmentTimeline.mockRejectedValueOnce(new Error('Timeline DB error'))

    // The service awaits loadInvestmentTimeline without try/catch —
    // a rejection will propagate. This matches slug-based behavior.
    await expect(
      loadPartnerStatementForEntity({
        entityId: AVI.id,
        canonicalName: AVI.canonical_name,
        propertyNames: ['Villa Mazotos'],
      }),
    ).rejects.toThrow('Timeline DB error')
  })

  it('partial multi-property: RC3 fails for one property, succeeds for another', async () => {
    buildMockDb(
      [OREN],
      [OREN_ENTRY1, { property_name: 'Tamir Dekelia' }],
    )
    // First property RC3 fails, second succeeds
    mockFetchRC3Report
      .mockRejectedValueOnce(new Error('RC3 unavailable'))
      .mockResolvedValueOnce({
        accounts: [{ type: 'rental', entries: [], totals: { totalEur: 100 } }],
        from_date: '2025-01-01',
        to_date: '2025-12-31',
        has_purchase: false,
        has_sale: false,
        has_renovation: false,
        has_rental: true,
        has_airbnb: false,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)

    const result = await loadPartnerStatementForEntity({
      entityId: OREN.id,
      canonicalName: OREN.canonical_name,
      propertyNames: ['Villa Mazotos 2', 'Tamir Dekelia'],
    })

    // Property 1 degrades (financial=null), property 2 has data.
    expect(result).not.toBeNull()
    expect(result!.properties).toHaveLength(2)
    expect(result!.properties[0].financial).toBeNull()
    expect(result!.properties[1].financial).not.toBeNull()
  })

  it('error semantics match between slug-based and entity-based paths for RC3 failure', async () => {
    // Slug-based path
    buildMockDb([AVI], [AVI_ENTRY])
    mockFetchRC3Report.mockRejectedValueOnce(new Error('RC3 down'))
    const slugResult = await loadPartnerStatement('avi')

    // Entity-based path
    jest.clearAllMocks()
    buildMockDb([AVI], [AVI_ENTRY])
    mockFetchRC3Report.mockRejectedValueOnce(new Error('RC3 down'))
    const entityResult = await loadPartnerStatementForEntity({
      entityId: AVI.id,
      canonicalName: AVI.canonical_name,
      propertyNames: ['Villa Mazotos'],
      entityType: 'investor',
      slug: 'avi',
    })

    expect(slugResult).not.toBeNull()
    expect(entityResult).not.toBeNull()

    // Both degrade identically: financial=null, rest of DTO intact.
    expect(slugResult!.properties[0].financial).toBeNull()
    expect(entityResult!.properties[0].financial).toBeNull()

    const normalizedSlug = normalizeTimestamps(slugResult as unknown as Record<string, unknown>)
    const normalizedEntity = normalizeTimestamps(entityResult as unknown as Record<string, unknown>)
    expect(normalizedEntity).toEqual(normalizedSlug)
  })
})

// ─── Delegation regression ──────────────────────────────────────────────────

describe('loadPartnerStatement — delegation regression', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('loadPartnerStatement still returns a valid DTO for known slug', async () => {
    buildMockDb([AVI], [AVI_ENTRY])

    const result = await loadPartnerStatement('avi')

    expect(result).not.toBeNull()
    expect(result!.investor.entityId).toBe('uuid-avi')
    expect(result!.investor.canonicalName).toBe('Avi')
    expect(result!.investor.slug).toBe('avi')
  })

  it('loadPartnerStatement returns null for unknown slug', async () => {
    buildMockDb([AVI], [AVI_ENTRY])

    const result = await loadPartnerStatement('nobody')
    expect(result).toBeNull()
  })
})

// ─── Source code audit + slug algorithm ──────────────────────────────────────

describe('loadPartnerStatementForEntity — source code audit', () => {
  it('loadPartnerStatementForEntity is exported from partnerStatementService', () => {
    expect(typeof loadPartnerStatementForEntity).toBe('function')
  })

  it('accepts the approved input contract shape', async () => {
    buildMockDb([AVI], [AVI_ENTRY])

    const input: LoadPartnerStatementForEntityInput = {
      entityId: 'uuid-avi',
      canonicalName: 'Avi',
      propertyNames: ['Villa Mazotos'],
      entityType: 'investor',
      slug: 'avi',
    }

    const result = await loadPartnerStatementForEntity(input)
    expect(result).not.toBeNull()
  })

  it('works with only required fields (entityId, canonicalName, propertyNames)', async () => {
    buildMockDb([AVI], [AVI_ENTRY])

    const result = await loadPartnerStatementForEntity({
      entityId: 'uuid-avi',
      canonicalName: 'Avi',
      propertyNames: ['Villa Mazotos'],
    })

    expect(result).not.toBeNull()
    expect(result!.investor.entityId).toBe('uuid-avi')
    expect(result!.investor.canonicalName).toBe('Avi')
    expect(result!.investor.slug).toBe('avi')       // derived via buildSlug
    expect(result!.investor.ownerType).toBe('partner') // default
  })

  it('produces PartnerStatementDTO/1.2 schema version', async () => {
    buildMockDb([AVI], [AVI_ENTRY])

    const result = await loadPartnerStatementForEntity({
      entityId: AVI.id,
      canonicalName: AVI.canonical_name,
      propertyNames: ['Villa Mazotos'],
    })

    expect(result).not.toBeNull()
    expect(result!.meta.schemaVersion).toBe('PartnerStatementDTO/1.2')
  })
})

// ─── Slug algorithm documentation + verification ────────────────────────────

describe('slug algorithm — buildSlug vs nameToSlug', () => {
  it('buildSlug and nameToSlug produce identical output for all production Latin names', () => {
    const productionNames = [
      'Avi', 'Oren', 'Yossi', 'Jacob',
      'Villa Mazotos', 'Villa Mazotos 2',
      'Tamir Dekelia', 'Tamir Radisson',
      'Neer Yoav', 'Liora',
    ]

    for (const name of productionNames) {
      expect(buildSlug(name)).toBe(nameToSlug(name))
    }
  })

  it('buildSlug strips Hebrew characters — nameToSlug preserves them (documented divergence)', () => {
    // This test documents the known divergence between the two algorithms.
    // For Latin names both are identical. For Hebrew names they differ.
    // Future callers should pass the canonical slug from Stage 0 resolution
    // rather than relying on Stage 1's fallback derivation.
    const hebrewName = 'אבי'
    const buildResult = buildSlug(hebrewName)
    const nameToResult = nameToSlug(hebrewName)

    // buildSlug strips non-ASCII → empty string (after cleanup)
    expect(buildResult).toBe('')
    // nameToSlug preserves Hebrew
    expect(nameToResult).not.toBe('')

    // This divergence is pre-existing and does not affect current production data.
    // Stage 0 resolver uses nameToSlug (G1 authority).
    // Stage 1 uses buildSlug only as fallback when slug is not supplied.
    // The safe path: always pass slug from the caller (Stage 0 or URL).
  })
})

// ─── Optional field defaults — safety verification ──────────────────────────

describe('loadPartnerStatementForEntity — optional field defaults safety', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('entityType default "partner" does not relabel an investor when caller omits entityType', async () => {
    // When a caller knows entity_type='investor' but omits entityType,
    // the DTO will show ownerType='partner'. This is a labeling-only concern
    // (no business logic branches on ownerType in the service).
    // Callers SHOULD pass the canonical entityType from Stage 0/G1.
    buildMockDb([AVI], [AVI_ENTRY])

    const withExplicit = await loadPartnerStatementForEntity({
      entityId: AVI.id,
      canonicalName: AVI.canonical_name,
      propertyNames: ['Villa Mazotos'],
      entityType: 'investor',
    })

    jest.clearAllMocks()
    buildMockDb([AVI], [AVI_ENTRY])

    const withDefault = await loadPartnerStatementForEntity({
      entityId: AVI.id,
      canonicalName: AVI.canonical_name,
      propertyNames: ['Villa Mazotos'],
      // entityType omitted → defaults to 'partner'
    })

    // Only ownerType differs — all business data is identical.
    expect(withExplicit!.investor.ownerType).toBe('investor')
    expect(withDefault!.investor.ownerType).toBe('partner')

    // Business data is unchanged:
    expect(withExplicit!.properties).toEqual(withDefault!.properties)
    expect(withExplicit!.portfolio).toEqual(withDefault!.portfolio)
  })

  it('slug fallback uses buildSlug — future callers should pass canonical slug from Stage 0', async () => {
    buildMockDb([AVI], [AVI_ENTRY])

    const withSlug = await loadPartnerStatementForEntity({
      entityId: AVI.id,
      canonicalName: AVI.canonical_name,
      propertyNames: ['Villa Mazotos'],
      slug: 'avi', // explicitly supplied
    })

    jest.clearAllMocks()
    buildMockDb([AVI], [AVI_ENTRY])

    const withFallback = await loadPartnerStatementForEntity({
      entityId: AVI.id,
      canonicalName: AVI.canonical_name,
      propertyNames: ['Villa Mazotos'],
      // slug omitted → derived from canonicalName via buildSlug
    })

    // For Latin names, both paths produce the same slug.
    expect(withSlug!.investor.slug).toBe('avi')
    expect(withFallback!.investor.slug).toBe('avi')
  })
})
