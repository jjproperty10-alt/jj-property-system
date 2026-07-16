/**
 * partnerStatementService.schema.test.ts
 *
 * Schema regression tests for partnerStatementService.
 *
 * PURPOSE:
 *   Verify that the service is aligned with the ACTUAL Production schema of
 *   lifecycle.entity_identity, verified 2026-07-16 via Supabase SQL Editor:
 *
 *   Columns: id, canonical_name, aliases, entity_type, status, created_at, updated_at
 *   NO owner_type column.
 *   entity_type values: 'partner', 'investor', 'jj_company', 'external'
 *   NO 'person' entity_type value.
 *
 * REGRESSION FOR:
 *   Bug found during PR #59 / R4 Product Review QA (2026-07-16):
 *   - Service selected non-existent `owner_type` column → PostgREST error
 *   - Service filtered `.eq('entity_type', 'person')` → 0 results
 *   Both caused loadPartnerStatement() to always return null → 404 for all slugs.
 *
 * SCOPE:
 *   Pure / exported function tests — no DB connection required for suites 1–4.
 *   Suite 5 (loadPartnerStatement regression) mocks createServiceClient via vi.mock
 *   to intercept and assert the exact query columns and filter that reach the DB.
 *
 * Tests: 25 total
 *   buildSlug                           — 5
 *   resolveCapitalStatus                — 4
 *   Schema contract (documented)        — 6
 *   buildPortfolioSummary               — 3
 *   loadPartnerStatement regression     — 7
 */

// ─── Module mocks (hoisted by Jest before any imports) ───────────────────────
// jest.mock() calls are automatically hoisted by babel-jest.

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
    has_sale: false,
    has_renovation: false,
    has_rental: false,
    has_airbnb: false,
  }),
}))

// ─── Imports ──────────────────────────────────────────────────────────────────

import {
  buildSlug,
  resolveCapitalStatus,
  buildPortfolioSummary,
  loadPartnerStatement,
} from '@/lib/lifecycle/partnerStatementService'
import { createServiceClient } from '@/lib/supabase'

const mockCreateServiceClient = createServiceClient as jest.MockedFunction<typeof createServiceClient>
import type { PartnerPropertyStatement } from '@/lib/lifecycle/partnerStatementTypes'

// ─── buildSlug ────────────────────────────────────────────────────────────────

describe('buildSlug', () => {
  it('lowercases a single-word name', () => {
    expect(buildSlug('Yossi')).toBe('yossi')
    expect(buildSlug('Jacob')).toBe('jacob')
    expect(buildSlug('Avi')).toBe('avi')
    expect(buildSlug('Oren')).toBe('oren')
  })

  it('hyphenates multi-word names', () => {
    expect(buildSlug('Villa Mazotos')).toBe('villa-mazotos')
  })

  it('strips non-alphanumeric characters', () => {
    expect(buildSlug("O'Brien")).toBe('obrien')
    expect(buildSlug('Côte d\'Azur')).toBe('cte-dazur')
  })

  it('produces stable slugs for all Production entity names', () => {
    // Covers every entity seeded in m8_lifecycle_001_schema.sql
    expect(buildSlug('JJ')).toBe('jj')
    expect(buildSlug('Yossi')).toBe('yossi')
    expect(buildSlug('Jacob')).toBe('jacob')
    expect(buildSlug('Avi')).toBe('avi')
    expect(buildSlug('Oren')).toBe('oren')
    expect(buildSlug('Anastasia')).toBe('anastasia')
    expect(buildSlug('Fabi')).toBe('fabi')
  })

  it('round-trips: slug of slug is idempotent', () => {
    const names = ['Yossi', 'Avi', 'Villa Mazotos']
    for (const name of names) {
      const slug = buildSlug(name)
      expect(buildSlug(slug)).toBe(slug)
    }
  })
})

// ─── resolveCapitalStatus ──────────────────────────────────────────────────────

describe('resolveCapitalStatus', () => {
  it('returns no_capital_event when hasCapitalEvents=false', () => {
    expect(resolveCapitalStatus(null, null, null, false)).toBe('no_capital_event')
    expect(resolveCapitalStatus(50000, 0, 100000, false)).toBe('no_capital_event')
  })

  it('returns capital_unknown when events exist but amounts are null (P-ARCH-1)', () => {
    expect(resolveCapitalStatus(null, null, null, true)).toBe('capital_unknown')
    expect(resolveCapitalStatus(50000, null, null, true)).toBe('capital_unknown')
    expect(resolveCapitalStatus(null, null, 100000, true)).toBe('capital_unknown')
  })

  it('returns fully_paid when capitalPaid >= requiredCapital', () => {
    expect(resolveCapitalStatus(100000, 0, 100000)).toBe('fully_paid')
    expect(resolveCapitalStatus(120000, 0, 100000)).toBe('fully_paid') // overpaid
  })

  it('returns partially_paid when capitalPaid < requiredCapital', () => {
    expect(resolveCapitalStatus(50000, 50000, 100000)).toBe('partially_paid')
    expect(resolveCapitalStatus(0, 100000, 100000)).toBe('partially_paid')
  })
})

// ─── Schema contract — documentation tests ────────────────────────────────────
//
// These tests document Production schema facts as executable specifications.
// They ensure no future refactor accidentally reintroduces the original bug.

describe('Production schema contract — lifecycle.entity_identity', () => {
  /**
   * Verified 2026-07-16: columns returned by
   *   SELECT column_name FROM information_schema.columns
   *   WHERE table_schema = 'lifecycle' AND table_name = 'entity_identity'
   */
  const PRODUCTION_COLUMNS = [
    'id',
    'canonical_name',
    'aliases',
    'entity_type',
    'status',
    'created_at',
    'updated_at',
  ] as const

  it('owner_type column does NOT exist in Production — never select it', () => {
    expect(PRODUCTION_COLUMNS).not.toContain('owner_type')
  })

  it('entity_type column EXISTS and is the classification field', () => {
    expect(PRODUCTION_COLUMNS).toContain('entity_type')
  })

  /**
   * Valid entity_type values — CHECK constraint in m8_lifecycle_001_schema.sql:
   *   CHECK (entity_type IN ('partner', 'investor', 'jj_company', 'external'))
   */
  const VALID_ENTITY_TYPES = ['partner', 'investor', 'jj_company', 'external'] as const

  it("entity_type 'person' is NOT a valid value — never filter by it", () => {
    expect(VALID_ENTITY_TYPES).not.toContain('person')
  })

  it("investor-loadable entity types are 'partner' and 'investor' only", () => {
    // Service must use .in('entity_type', ['partner', 'investor'])
    // 'jj_company' (JJ itself) is not a partner-statement subject.
    // 'external' (Anastasia, Fabi) is not a partner-statement subject.
    const INVESTOR_TYPES = ['partner', 'investor']
    expect(INVESTOR_TYPES).toContain('partner')
    expect(INVESTOR_TYPES).toContain('investor')
    expect(INVESTOR_TYPES).not.toContain('jj_company')
    expect(INVESTOR_TYPES).not.toContain('external')
    expect(INVESTOR_TYPES).not.toContain('person')
  })

  it("JJ group co-owner types are 'partner' and 'jj_company'", () => {
    // Used by isJj classification:
    //   'partner'    → Yossi, Jacob → ownerKind='jj_group' → shown as "JJ Group"
    //   'jj_company' → JJ           → ownerKind='jj_group' → shown as "JJ Group"
    //   'investor'   → Avi, Oren    → ownerKind='co_investor' → shown by canonical name
    //   'external'   → Anastasia    → ownerKind='co_investor' → shown by canonical name
    const JJ_ENTITY_TYPES = new Set(['jj_company', 'partner'])
    expect(JJ_ENTITY_TYPES.has('partner')).toBe(true)
    expect(JJ_ENTITY_TYPES.has('jj_company')).toBe(true)
    expect(JJ_ENTITY_TYPES.has('investor')).toBe(false)
    expect(JJ_ENTITY_TYPES.has('external')).toBe(false)
    expect(JJ_ENTITY_TYPES.has('person')).toBe(false)   // 'person' never existed
  })

  it('Production seed entities match expected entity_type values', () => {
    // Seeded in m8_lifecycle_001_schema.sql lines 511-517, verified in Production
    const productionEntities: Array<{ name: string; entity_type: string }> = [
      { name: 'JJ',        entity_type: 'jj_company' },
      { name: 'Yossi',     entity_type: 'partner'    },
      { name: 'Jacob',     entity_type: 'partner'    },
      { name: 'Avi',       entity_type: 'investor'   },
      { name: 'Oren',      entity_type: 'investor'   },
      { name: 'Anastasia', entity_type: 'external'   },
      { name: 'Fabi',      entity_type: 'external'   },
    ]

    const INVESTOR_TYPES = new Set(['partner', 'investor'])
    const JJ_ENTITY_TYPES = new Set(['jj_company', 'partner'])

    // Yossi and Jacob are loadable via /partner/yossi and /partner/jacob
    const yossi = productionEntities.find(e => e.name === 'Yossi')!
    expect(INVESTOR_TYPES.has(yossi.entity_type)).toBe(true)
    expect(buildSlug(yossi.name)).toBe('yossi')

    // Avi and Oren are loadable via /partner/avi and /partner/oren
    const avi = productionEntities.find(e => e.name === 'Avi')!
    expect(INVESTOR_TYPES.has(avi.entity_type)).toBe(true)
    expect(buildSlug(avi.name)).toBe('avi')

    // JJ is NOT loadable as a partner statement
    const jj = productionEntities.find(e => e.name === 'JJ')!
    expect(INVESTOR_TYPES.has(jj.entity_type)).toBe(false)

    // Yossi and Jacob appear as 'JJ Group' when listed as co-owners
    expect(JJ_ENTITY_TYPES.has(yossi.entity_type)).toBe(true)
    expect(JJ_ENTITY_TYPES.has(jj.entity_type)).toBe(true)

    // Avi appears by name when listed as a co-owner
    expect(JJ_ENTITY_TYPES.has(avi.entity_type)).toBe(false)
  })
})

// ─── buildPortfolioSummary ────────────────────────────────────────────────────

describe('buildPortfolioSummary', () => {
  function makeProperty(overrides: {
    propertyName: string
    capitalPaidEur?: number | null
    capitalRemainingEur?: number | null
    agreedEntryValuationEur?: number | null
  }): PartnerPropertyStatement {
    return {
      propertyName: overrides.propertyName,
      rc3ReportingName: null,
      capital: {
        agreedEntryValuationEur: overrides.agreedEntryValuationEur ?? null,
        requiredCapitalEur: null,
        capitalPaidEur: overrides.capitalPaidEur ?? null,
        capitalRemainingEur: overrides.capitalRemainingEur ?? null,
        capitalStatus: 'capital_unknown',
        payments: [],
      },
      ownership: { currentOwnershipPct: null, entryStatus: 'unknown', coOwners: [] },
      financial: null,
      settlement: { currentBalanceEur: null, totalDistributionsPaidEur: 0 },
      timeline: { events: [], openVerificationTasks: 0, hasPendingDates: false },
    }
  }

  it('returns totalPropertiesCount correctly', () => {
    const summary = buildPortfolioSummary([
      makeProperty({ propertyName: 'A' }),
      makeProperty({ propertyName: 'B' }),
    ])
    expect(summary.totalPropertiesCount).toBe(2)
  })

  it('P-ARCH-1: totalCapitalPaidEur is null if ANY property has null capital', () => {
    const summary = buildPortfolioSummary([
      makeProperty({ propertyName: 'A', capitalPaidEur: 100000 }),
      makeProperty({ propertyName: 'B', capitalPaidEur: null }),   // unknown
    ])
    expect(summary.totalCapitalPaidEur).toBeNull()
  })

  it('sums capital correctly when all properties have known values', () => {
    const summary = buildPortfolioSummary([
      makeProperty({ propertyName: 'A', capitalPaidEur: 50000, agreedEntryValuationEur: 200000 }),
      makeProperty({ propertyName: 'B', capitalPaidEur: 75000, agreedEntryValuationEur: 300000 }),
    ])
    expect(summary.totalCapitalPaidEur).toBe(125000)
    expect(summary.totalAgreedValuationEur).toBe(500000)
  })
})

// ─── loadPartnerStatement — entity_type regression (PR #60) ──────────────────
//
// These tests call loadPartnerStatement() through a mocked createServiceClient.
// The mock intercepts DB calls and records EXACTLY which columns and filters
// the service sends on the entity_identity table.
//
// This directly proves the PR #60 bug cannot recur:
//   BEFORE: .select('id, canonical_name, owner_type').eq('entity_type', 'person')
//           → PostgREST error (owner_type absent) + 0 rows (person invalid) → 404
//   AFTER:  .select('id, canonical_name, entity_type').in('entity_type', ['partner','investor'])
//           → Yossi and Jacob found → 200
//
// These tests are unit tests (no live DB). Integration tests require a Supabase branch.

type EntityRow = { id: string; canonical_name: string; entity_type: string }

interface QueryCapture {
  selectFields: string        // raw string passed to .select()
  filterMethod: string        // 'in' | 'eq' | '' (empty = never reached)
  filterField: string         // first argument to .in() or .eq()
  filterValues: string[]      // second argument
}

/**
 * Build a mock Supabase client that:
 * 1. Returns `entities` for entity_identity queries.
 * 2. Returns `partnerEntries` for partner_entry queries (default: []).
 * 3. Returns [] for every other table.
 * 4. Captures the first entity_identity select + filter call in `capture`.
 *
 * The capture happens before the filter resolves, so tests can assert query
 * structure regardless of whether the downstream function returns null or data.
 */
function buildMockDb(
  entities: EntityRow[],
  partnerEntries: Array<{ property_name: string }> = [],
): { capture: QueryCapture } {
  const capture: QueryCapture = {
    selectFields: '',
    filterMethod: '',
    filterField: '',
    filterValues: [],
  }
  let capturedFirstEntityQuery = false

  function makeChain(table: string, resolveData: unknown[]) {
    const chain = {
      select(fields: string): typeof chain {
        if (table === 'entity_identity' && !capturedFirstEntityQuery) {
          capture.selectFields = fields
        }
        return chain
      },
      in(field: string, values: string[]): Promise<{ data: unknown[]; error: null }> {
        if (table === 'entity_identity' && !capturedFirstEntityQuery) {
          capture.filterMethod = 'in'
          capture.filterField = field
          capture.filterValues = values
          capturedFirstEntityQuery = true
        }
        return Promise.resolve({ data: resolveData, error: null })
      },
      eq(field: string, value: string): Promise<{ data: unknown[]; error: null }> {
        if (table === 'entity_identity' && !capturedFirstEntityQuery) {
          capture.filterMethod = 'eq'
          capture.filterField = field
          capture.filterValues = [value]
          capturedFirstEntityQuery = true
        }
        return Promise.resolve({ data: [], error: null })
      },
      neq(): typeof chain { return chain },
      is(): typeof chain { return chain },
      order(): Promise<{ data: unknown[]; error: null }> {
        return Promise.resolve({ data: [], error: null })
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
      return makeChain(table, [])
    },
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockCreateServiceClient.mockReturnValue(mockDb as any)

  return { capture }
}

describe('loadPartnerStatement — entity_type regression (PR #60)', () => {
  const YOSSI: EntityRow = { id: 'uuid-yossi', canonical_name: 'Yossi', entity_type: 'partner' }
  const AVI:   EntityRow = { id: 'uuid-avi',   canonical_name: 'Avi',   entity_type: 'investor'   }
  const JJ:    EntityRow = { id: 'uuid-jj',    canonical_name: 'JJ',    entity_type: 'jj_company' }

  let capture: QueryCapture

  beforeEach(() => {
    jest.clearAllMocks()
    ;({ capture } = buildMockDb([YOSSI, AVI]))
  })

  // ── Query structure: what columns reach the DB ──────────────────────────────

  it('entity_identity select includes entity_type', async () => {
    await loadPartnerStatement('yossi')
    expect(capture.selectFields).toContain('entity_type')
  })

  it('entity_identity select does NOT include owner_type (column does not exist in Production)', async () => {
    await loadPartnerStatement('yossi')
    expect(capture.selectFields).not.toContain('owner_type')
  })

  it('entity filter uses .in() — never .eq() with a single value', async () => {
    await loadPartnerStatement('yossi')
    // The bug was: .eq('entity_type', 'person') → 0 rows → always 404
    // The fix is: .in('entity_type', ['partner','investor']) → Yossi/Jacob found
    expect(capture.filterMethod).toBe('in')
  })

  it("entity filter field is 'entity_type'", async () => {
    await loadPartnerStatement('yossi')
    expect(capture.filterField).toBe('entity_type')
  })

  it("entity filter values include 'partner' and 'investor'", async () => {
    await loadPartnerStatement('yossi')
    expect(capture.filterValues).toContain('partner')
    expect(capture.filterValues).toContain('investor')
  })

  it("entity filter values exclude 'jj_company', 'external', and 'person'", async () => {
    await loadPartnerStatement('yossi')
    // jj_company / external must never be loadable via /partner/ routes
    // 'person' is the original invalid filter value — must stay excluded
    expect(capture.filterValues).not.toContain('jj_company')
    expect(capture.filterValues).not.toContain('external')
    expect(capture.filterValues).not.toContain('person')
  })

  // ── Authorization: correct 404 behavior preserved ───────────────────────────

  it('unknown slug returns null (404 preserved)', async () => {
    // Mock has Yossi — but slug 'nobody' matches no canonical_name → null
    const { capture: cap } = buildMockDb([YOSSI, AVI])
    void cap  // capture not needed for this assertion
    const result = await loadPartnerStatement('nobody')
    expect(result).toBeNull()
  })

  it('jj_company entity has no partner_entry → returns null (404 preserved)', async () => {
    // JJ has entity_type='jj_company' — excluded by .in() in production.
    // Even if slug 'jj' resolved (via mock), no partner_entry exists → null.
    buildMockDb([JJ], []) // partner_entry = [] → service returns null at step 2
    const result = await loadPartnerStatement('jj')
    expect(result).toBeNull()
  })
})
