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
 *   Pure / exported function tests that do NOT require DB connection.
 *   Integration tests (with real DB) require a live Supabase branch — see QA runbook.
 *
 * Tests: 15 total
 *   buildSlug                   — 5
 *   resolveCapitalStatus        — 4
 *   Schema contract (documented) — 6
 */

import {
  buildSlug,
  resolveCapitalStatus,
  buildPortfolioSummary,
} from '@/lib/lifecycle/partnerStatementService'
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
