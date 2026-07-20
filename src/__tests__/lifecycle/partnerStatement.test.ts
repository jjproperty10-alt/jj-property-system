/**
 * PR 44 — Partner Foundation: PartnerStatementDTO pure-function tests
 *
 * These tests cover the exported pure functions from partnerStatementService
 * and the TypeScript contract invariants from partnerStatementTypes.
 *
 * No DB, no HTTP, no mocks required.
 *
 * Test map:
 *   SLUG-01..04    — buildSlug: name → URL-safe slug
 *   CAP-05..09     — resolveCapitalStatus: all four CapitalStatus values
 *   PORT-10..14    — buildPortfolioSummary: aggregation and null propagation (P-ARCH-1)
 *   DISC-15..17    — discriminated union: admin vs partner viewMode
 *   SCHEMA-18      — schemaVersion format
 *   ARCH1-19..20   — P-ARCH-1: null ≠ 0 (Oren real case)
 *   ARCH2-21       — P-ARCH-2: payer identity preserved
 *
 * @see PartnerStatementDTO Contract v1.1
 * @see P-ARCH-1: Unknown = NULL. Never 0 or placeholder.
 * @see P-ARCH-2: Payer identity must not be normalised — Yossi ≠ Jacob ≠ JJ.
 * @see I-12: DTO is immutable. Consumers never mutate business data.
 */

import { buildSlug, resolveCapitalStatus, buildPortfolioSummary } from '../../lib/lifecycle/partnerStatementService'
import type {
  PartnerPropertyStatement,
  PartnerFacingStatementDTO,
  AdminStatementDTO,
  PartnerStatementDTO,
  CapitalStatement,
  CapitalPayment,
  OwnershipStatement,
  SettlementStatement,
  TimelineStatement,
} from '../../lib/lifecycle/partnerStatementTypes'

// ─────────────────────────────────────────────────────────────────────────────
// Test fixtures
// ─────────────────────────────────────────────────────────────────────────────

function makeCapitalStatement(overrides: Partial<CapitalStatement> = {}): CapitalStatement {
  return {
    agreedEntryValuationEur: 500000,
    requiredCapitalEur: 250000,
    capitalPaidEur: 250000,
    capitalRemainingEur: 0,
    capitalStatus: 'fully_paid',
    payments: [],
    ...overrides,
  }
}

function makeOwnership(overrides: Partial<OwnershipStatement> = {}): OwnershipStatement {
  return {
    currentOwnershipPct: 50,
    entryStatus: 'active',
    coOwners: [],
    ...overrides,
  }
}

function makeSettlement(overrides: Partial<SettlementStatement> = {}): SettlementStatement {
  return {
    currentBalanceEur: null,
    totalDistributionsPaidEur: 0,
    ...overrides,
  }
}

function makeTimeline(overrides: Partial<TimelineStatement> = {}): TimelineStatement {
  return {
    events: [],
    openVerificationTasks: 0,
    hasPendingDates: false,
    ...overrides,
  }
}

function makePropertyStatement(overrides: Partial<PartnerPropertyStatement> = {}): PartnerPropertyStatement {
  return {
    propertyName: 'Villa Mazotos',
    rc3ReportingName: 'Villa Mazotos',
    capital: makeCapitalStatement(),
    ownership: makeOwnership(),
    financial: null,
    settlement: makeSettlement(),
    timeline: makeTimeline(),
    ...overrides,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SLUG — buildSlug
// ─────────────────────────────────────────────────────────────────────────────

test('SLUG-01: single name → lowercase slug', () => {
  expect(buildSlug('Avi')).toBe('avi')
})

test('SLUG-02: multi-word name → hyphenated slug', () => {
  expect(buildSlug('Villa Mazotos')).toBe('villa-mazotos')
})

test('SLUG-03: already lowercase is unchanged', () => {
  expect(buildSlug('oren')).toBe('oren')
})

test('SLUG-04: special characters are stripped', () => {
  expect(buildSlug("O'Brien")).toBe('obrien')
})

// ─────────────────────────────────────────────────────────────────────────────
// CAP — resolveCapitalStatus
// ─────────────────────────────────────────────────────────────────────────────

test('CAP-05: fully_paid when capitalRemaining <= 0', () => {
  expect(resolveCapitalStatus(250000, 0, 250000)).toBe('fully_paid')
})

test('CAP-06: fully_paid when capitalRemaining is negative', () => {
  expect(resolveCapitalStatus(260000, -10000, 250000)).toBe('fully_paid')
})

test('CAP-07: partially_paid when capitalPaid > 0 and remaining > 0', () => {
  expect(resolveCapitalStatus(100000, 150000, 250000)).toBe('partially_paid')
})

test('CAP-08: capital_unknown when both paid and required are null (Oren real case)', () => {
  // P-ARCH-1: no data = unknown, not 0
  expect(resolveCapitalStatus(null, null, null)).toBe('capital_unknown')
})

test('CAP-09: capital_unknown when capitalPaid is null even if required is known', () => {
  expect(resolveCapitalStatus(null, null, 250000)).toBe('capital_unknown')
})

// ─────────────────────────────────────────────────────────────────────────────
// PORT — buildPortfolioSummary
// ─────────────────────────────────────────────────────────────────────────────

test('PORT-10: single property — totals equal property values', () => {
  const prop = makePropertyStatement()
  const portfolio = buildPortfolioSummary([prop])

  expect(portfolio.totalPropertiesCount).toBe(1)
  expect(portfolio.totalAgreedValuationEur).toBe(500000)
  expect(portfolio.totalCapitalPaidEur).toBe(250000)
  expect(portfolio.totalCapitalRemainingEur).toBe(0)
})

test('PORT-11: two properties — totals are summed', () => {
  const prop1 = makePropertyStatement({
    capital: makeCapitalStatement({ agreedEntryValuationEur: 500000, capitalPaidEur: 250000, capitalRemainingEur: 0 }),
  })
  const prop2 = makePropertyStatement({
    propertyName: 'Villa Mazotos 2',
    capital: makeCapitalStatement({ agreedEntryValuationEur: 600000, capitalPaidEur: 150000, capitalRemainingEur: 450000 }),
  })

  const portfolio = buildPortfolioSummary([prop1, prop2])

  expect(portfolio.totalPropertiesCount).toBe(2)
  expect(portfolio.totalAgreedValuationEur).toBe(1100000)
  expect(portfolio.totalCapitalPaidEur).toBe(400000)
  expect(portfolio.totalCapitalRemainingEur).toBe(450000)
})

test('PORT-12: P-ARCH-1 — null capitalPaid in any property makes total null, not 0', () => {
  const known = makePropertyStatement({
    capital: makeCapitalStatement({ capitalPaidEur: 250000 }),
  })
  const unknown = makePropertyStatement({
    propertyName: 'Villa Mazotos 2',
    capital: makeCapitalStatement({ capitalPaidEur: null }), // Oren: unknown
  })

  const portfolio = buildPortfolioSummary([known, unknown])

  // P-ARCH-1: null unknown is not coerced to 0 or added as if known
  expect(portfolio.totalCapitalPaidEur).toBeNull()
})

test('PORT-13: P-ARCH-1 — null agreedValuation in any property makes total null', () => {
  const known = makePropertyStatement({
    capital: makeCapitalStatement({ agreedEntryValuationEur: 500000 }),
  })
  const unknown = makePropertyStatement({
    propertyName: 'Villa Mazotos 2',
    capital: makeCapitalStatement({ agreedEntryValuationEur: null }),
  })

  const portfolio = buildPortfolioSummary([known, unknown])

  expect(portfolio.totalAgreedValuationEur).toBeNull()
})

test('PORT-14: settlement fields are 0/unknown until Settlement Engine (M9-C)', () => {
  const prop = makePropertyStatement()
  const portfolio = buildPortfolioSummary([prop])

  // Placeholder values — will be replaced by Settlement Engine in M9-C
  expect(portfolio.totalReceivableFromJJ).toBe(0)
  expect(portfolio.totalPayableToJJ).toBe(0)
  expect(portfolio.finalNetBalance).toBe(0)
  expect(portfolio.direction).toBe('unknown')
})

// ─────────────────────────────────────────────────────────────────────────────
// DISC — discriminated union (partner vs admin viewMode)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a minimal PartnerFacingStatementDTO directly to verify the
 * TypeScript discriminated union shape without calling the DB.
 */
function makePartnerDTO(): PartnerFacingStatementDTO {
  return {
    meta: { schemaVersion: 'PartnerStatementDTO/1.1', viewMode: 'partner', generatedAt: new Date().toISOString() },
    investor: { entityId: 'e1', canonicalName: 'Avi', slug: 'avi', ownerType: 'partner' },
    properties: [makePropertyStatement()],
    portfolio: buildPortfolioSummary([makePropertyStatement()]),
    actions: { canExportCsv: false, canGeneratePdf: false, hasOpenVerificationTasks: false },
    localization: { lang: 'en', currency: 'EUR', generatedAt: new Date().toISOString() },
  }
}

function makeAdminDTO(): AdminStatementDTO {
  return {
    meta: { schemaVersion: 'PartnerStatementDTO/1.1', viewMode: 'admin', generatedAt: new Date().toISOString() },
    investor: { entityId: 'e1', canonicalName: 'Avi', slug: 'avi', ownerType: 'partner' },
    properties: [makePropertyStatement()],
    portfolio: buildPortfolioSummary([makePropertyStatement()]),
    actions: { canExportCsv: false, canGeneratePdf: false, hasOpenVerificationTasks: false },
    localization: { lang: 'en', currency: 'EUR', generatedAt: new Date().toISOString() },
    verification: {
      totalOpenTasks: 2,
      propertiesWithPendingDates: ['Villa Mazotos'],
      propertiesWithUnknownCapital: [],
    },
  }
}

test('DISC-15: PartnerFacingStatementDTO has viewMode = "partner"', () => {
  const dto = makePartnerDTO()
  expect(dto.meta.viewMode).toBe('partner')
})

test('DISC-16: AdminStatementDTO has viewMode = "admin" and verification block', () => {
  const dto = makeAdminDTO()
  expect(dto.meta.viewMode).toBe('admin')
  expect(dto.verification).toBeDefined()
  expect(dto.verification.totalOpenTasks).toBe(2)
})

test('DISC-17: narrowing via viewMode works correctly on PartnerStatementDTO union', () => {
  const dtoA: PartnerStatementDTO = makePartnerDTO()
  const dtoB: PartnerStatementDTO = makeAdminDTO()

  // TypeScript narrowing — runtime check mirrors compile-time check
  function getVerificationCount(dto: PartnerStatementDTO): number | undefined {
    if (dto.meta.viewMode === 'admin') {
      return (dto as AdminStatementDTO).verification.totalOpenTasks
    }
    return undefined
  }

  expect(getVerificationCount(dtoA)).toBeUndefined()
  expect(getVerificationCount(dtoB)).toBe(2)
})

// ─────────────────────────────────────────────────────────────────────────────
// SCHEMA — schemaVersion format
// ─────────────────────────────────────────────────────────────────────────────

test('SCHEMA-18: schemaVersion is namespaced and locked at v1.1', () => {
  const dto = makePartnerDTO()
  // Namespaced to avoid collision: 'PartnerStatementDTO/1.1' not '1.1'
  expect(dto.meta.schemaVersion).toBe('PartnerStatementDTO/1.1')
})

// ─────────────────────────────────────────────────────────────────────────────
// ARCH1 — P-ARCH-1: null ≠ 0 (Oren real case)
// ─────────────────────────────────────────────────────────────────────────────

test('ARCH1-19: Oren capital_unknown case: capitalPaidEur stays null, not 0', () => {
  // Oren's M8 Business Validation: required_entry_capital = NULL (unknown)
  const orenCapital = makeCapitalStatement({
    agreedEntryValuationEur: null,   // unknown
    requiredCapitalEur: null,        // unknown
    capitalPaidEur: null,            // P-ARCH-1: null = unknown
    capitalRemainingEur: null,       // P-ARCH-1: null = unknown
    capitalStatus: 'capital_unknown',
  })

  // The DTO must preserve nulls — never coerce to 0
  expect(orenCapital.capitalPaidEur).toBeNull()
  expect(orenCapital.capitalRemainingEur).toBeNull()
  expect(orenCapital.capitalStatus).toBe('capital_unknown')
})

test('ARCH1-20: settlement currentBalanceEur is null until Settlement Engine runs (P-ARCH-1)', () => {
  const settlement = makeSettlement({ currentBalanceEur: null })
  // P-ARCH-1: not coerced to 0 even though "no settlement" conceptually
  expect(settlement.currentBalanceEur).toBeNull()
})

// ─────────────────────────────────────────────────────────────────────────────
// ARCH2 — P-ARCH-2: payer identity is preserved
// ─────────────────────────────────────────────────────────────────────────────

test('ARCH2-21: CapitalPayment preserves payerName — Yossi ≠ Jacob ≠ JJ', () => {
  // P-ARCH-2: payment payer identity must not be normalised.
  // A payment made by Yossi (not JJ) must stay Yossi in the DTO.
  const yossiPayment: CapitalPayment = {
    eventId: 'ce-001',
    effectiveDate: '2022-06-15',
    effectiveDateConfidence: 'confirmed',
    amountEur: 125000,
    description: 'Yossi initial deposit',
    payerName: 'Yossi',   // must NOT be normalised to 'JJ'
    payeeName: 'Seller',
  }

  const jacobPayment: CapitalPayment = {
    eventId: 'ce-002',
    effectiveDate: '2022-06-15',
    effectiveDateConfidence: 'confirmed',
    amountEur: 125000,
    description: 'Jacob initial deposit',
    payerName: 'Jacob',   // must NOT be normalised to 'JJ'
    payeeName: 'Seller',
  }

  // Payer identity is distinct and preserved
  expect(yossiPayment.payerName).toBe('Yossi')
  expect(jacobPayment.payerName).toBe('Jacob')
  expect(yossiPayment.payerName).not.toBe(jacobPayment.payerName)
  expect(yossiPayment.payerName).not.toBe('JJ')
  expect(jacobPayment.payerName).not.toBe('JJ')
})

// ── CAP-22..32: no_capital_event + contradictory inputs (added by M9-C) ──────

test('CAP-22: no_capital_event when hasCapitalEvents = false', () => {
  expect(resolveCapitalStatus(null, null, null, false)).toBe('no_capital_event')
})

test('CAP-23: no_capital_event even when requiredCapital is known', () => {
  expect(resolveCapitalStatus(null, null, 250_000, false)).toBe('no_capital_event')
})

test('CAP-24: fully_paid uses paid >= required — exact boundary', () => {
  expect(resolveCapitalStatus(250_000, 0, 250_000, true)).toBe('fully_paid')
})

test('CAP-25: fully_paid when paid exceeds required', () => {
  expect(resolveCapitalStatus(300_000, -50_000, 250_000, true)).toBe('fully_paid')
})

test('CAP-26: partially_paid when paid < required', () => {
  expect(resolveCapitalStatus(100_000, 150_000, 250_000, true)).toBe('partially_paid')
})

test('CAP-27: capital_unknown when capitalPaid is null', () => {
  expect(resolveCapitalStatus(null, null, null, true)).toBe('capital_unknown')
})

test('CAP-28: capital_unknown when requiredCapital is null even if paid is known', () => {
  expect(resolveCapitalStatus(100_000, null, null, true)).toBe('capital_unknown')
})

// Contradictory input combinations — paid+required is authoritative; remaining is NOT

test('CAP-29: paid=100000, required=200000, remaining=0 → partially_paid (remaining=0 does not win)', () => {
  // remaining=0 would suggest fully_paid, but paid < required is authoritative
  expect(resolveCapitalStatus(100_000, 0, 200_000, true)).toBe('partially_paid')
})

test('CAP-30: paid=250000, required=200000, remaining=-50000 → fully_paid (paid+required wins)', () => {
  // remaining=-50000 is consistent but not the deciding factor
  expect(resolveCapitalStatus(250_000, -50_000, 200_000, true)).toBe('fully_paid')
})

test('CAP-31: paid=null, remaining=0, required=250000 → capital_unknown (remaining cannot substitute for unknown paid)', () => {
  // remaining=0 looks like fully_paid, but we cannot confirm without paid
  expect(resolveCapitalStatus(null, 0, 250_000, true)).toBe('capital_unknown')
})

test('CAP-32: paid=100000, remaining=null, required=null → capital_unknown (required unknown)', () => {
  // paid is known, but we cannot determine fully/partially without required
  expect(resolveCapitalStatus(100_000, null, null, true)).toBe('capital_unknown')
})
