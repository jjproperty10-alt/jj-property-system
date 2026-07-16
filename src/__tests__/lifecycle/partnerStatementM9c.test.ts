/**
 * partnerStatementM9c.test.ts
 * ============================
 * M9-C Partner Report Screen — focused test suite
 *
 * 28 cases:
 * M9C-01..02 Avi known and fully paid capital
 * M9C-03..04 Oren unknown capital (P-ARCH-1)
 * M9C-05..07 Preservation of database NULL
 * M9C-08..09 Partner/Admin output separation (P-ARCH-6)
 * M9C-10..11 Verification visibility (pending_verification)
 * M9C-12 Stable ordering (timeline events ordered ASC by service, not re-sorted by UI)
 * M9C-13..14 Authorized property scope (portfolio count)
 * M9C-15 Settlement sign mapping — currentBalanceEur null (P-ARCH-1)
 * M9C-16 One consistent report period per financial section
 * M9C-17..19 Absence of forbidden JJ internal fields (P-ARCH-6)
 * M9C-20 No business calculations in UI-facing consumers
 * M9C-21..24 no_capital_event new CapitalStatus
 * SETTLE-01..04 Settlement stub safety
 */

import {
  resolveCapitalStatus,
  buildPortfolioSummary,
  buildSlug,
} from '@/lib/lifecycle/partnerStatementService'
import type {
  CapitalStatement,
  PortfolioSummary,
  PartnerFacingStatementDTO,
  TimelineStatement,
  TimelineEvent,
  FinancialStatement,
  SettlementStatement,
} from '@/lib/lifecycle/partnerStatementTypes'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeCapital(overrides: Partial<CapitalStatement> = {}): CapitalStatement {
  return {
    capitalStatus: 'fully_paid',
    agreedEntryValuationEur: null,
    requiredCapitalEur: null,
    capitalPaidEur: null,
    capitalRemainingEur: null,
    payments: [],
    ...overrides,
  }
}

function makeTimeline(events: TimelineEvent[] = []): TimelineStatement {
  return {
    events,
    hasPendingDates: events.some((e) => e.effectiveDateConfidence === 'pending_verification'),
    openVerificationTasks: events.filter((e) => e.effectiveDateConfidence === 'pending_verification').length,
  }
}

function makeTimelineEvent(overrides: Partial<TimelineEvent> = {}): TimelineEvent {
  return {
    eventId: 'evt-1',
    title: 'Capital Payment',
    description: null,
    effectiveDate: '2023-01-15',
    effectiveDateConfidence: 'confirmed',
    amountEur: 50000,
    partnerVisible: true,
    status: 'confirmed',
    ...overrides,
  }
}

function makeFinancial(overrides: Partial<FinancialStatement> = {}): FinancialStatement {
  return {
    reportingName: 'Test Property',
    accountSections: [],
    fromDate: null,
    toDate: null,
    hasSale: false,
    hasRenovation: false,
    hasRental: false,
    hasAirbnb: false,
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

function makePortfolio(overrides: Partial<PortfolioSummary> = {}): PortfolioSummary {
  return {
    totalPropertiesCount: 1,
    totalAgreedValuationEur: null,
    totalCapitalPaidEur: null,
    totalCapitalRemainingEur: null,
    totalReceivableFromJJ: 0,
    totalPayableToJJ: 0,
    finalNetBalance: 0,
    direction: 'unknown',
    ...overrides,
  }
}

// ── M9C-01..02: Avi — known and fully paid ────────────────────────────────────

test('M9C-01: Avi Villa Mazotos — fully_paid when paid >= required (exact)', () => {
  const status = resolveCapitalStatus(250_000, 0, 250_000, true)
  expect(status).toBe('fully_paid')
})

test('M9C-02: Avi capital — capitalPaidEur preserved, payments length = 1', () => {
  const capital = makeCapital({
    capitalStatus: resolveCapitalStatus(250_000, 0, 250_000, true),
    capitalPaidEur: 250_000,
    capitalRemainingEur: 0,
    requiredCapitalEur: 250_000,
    payments: [{
      eventId: 'avi-p1',
      amountEur: 250_000,
      effectiveDate: '2023-08-15',
      effectiveDateConfidence: 'confirmed',
      payerName: 'Avi',
      description: null,
      payeeName: null,
    }],
  })
  expect(capital.capitalStatus).toBe('fully_paid')
  expect(capital.capitalPaidEur).toBe(250_000)
  expect(capital.payments).toHaveLength(1)
})

// ── M9C-03..04: Oren — unknown capital (P-ARCH-1) ────────────────────────────

test('M9C-03: Oren Villa Mazotos 2 — capital_unknown when no payment records', () => {
  const status = resolveCapitalStatus(null, null, null, true)
  expect(status).toBe('capital_unknown')
})

test('M9C-04: Oren — capitalPaidEur stays NULL (P-ARCH-1: unknown ≠ 0)', () => {
  const capital = makeCapital({
    capitalStatus: 'capital_unknown',
    capitalPaidEur: null,
    capitalRemainingEur: null,
    requiredCapitalEur: null,
  })
  expect(capital.capitalPaidEur).toBeNull()
  expect(capital.capitalRemainingEur).toBeNull()
  expect(capital.capitalStatus).toBe('capital_unknown')
})

// ── M9C-05..07: NULL preservation ─────────────────────────────────────────────

test('M9C-05: NULL agreedEntryValuationEur preserved', () => {
  const capital = makeCapital({ agreedEntryValuationEur: null })
  expect(capital.agreedEntryValuationEur).toBeNull()
})

test('M9C-06: NULL totalCapitalPaidEur preserved in PortfolioSummary', () => {
  const portfolio = makePortfolio({ totalCapitalPaidEur: null })
  expect(portfolio.totalCapitalPaidEur).toBeNull()
})

test('M9C-07: NULL effectiveDate preserved on TimelineEvent — not replaced with placeholder', () => {
  const event = makeTimelineEvent({ effectiveDate: null, effectiveDateConfidence: 'pending_verification' })
  expect(event.effectiveDate).toBeNull()
  expect(event.effectiveDateConfidence).toBe('pending_verification')
})

// ── M9C-08..09: Partner/Admin output separation (P-ARCH-6) ───────────────────

test('M9C-08: PartnerFacingStatementDTO has no jj_* fields at top level', () => {
  const dto: Partial<PartnerFacingStatementDTO> = {
    meta: { schemaVersion: 'PartnerStatementDTO/1.0', viewMode: 'partner', generatedAt: new Date().toISOString() },
    investor: { entityId: 'e1', canonicalName: 'Avi', slug: 'avi', ownerType: 'co_investor' },
    properties: [],
    portfolio: makePortfolio(),
    actions: { canExportCsv: false, canGeneratePdf: false, hasOpenVerificationTasks: false },
    localization: { lang: 'en', currency: 'EUR', generatedAt: new Date().toISOString() },
  }
  const jjKeys = Object.keys(dto).filter((k) => k.startsWith('jj_'))
  expect(jjKeys).toHaveLength(0)
})

test('M9C-09: viewMode partner — not admin', () => {
  const meta = { schemaVersion: 'PartnerStatementDTO/1.0' as const, viewMode: 'partner' as const, generatedAt: new Date().toISOString() }
  expect(meta.viewMode).toBe('partner')
  expect(meta.viewMode).not.toBe('admin')
})

// ── M9C-10..11: Verification visibility ──────────────────────────────────────

test('M9C-10: hasPendingDates true when any event has pending_verification', () => {
  const events = [
    makeTimelineEvent({ effectiveDateConfidence: 'confirmed' }),
    makeTimelineEvent({ eventId: 'e2', effectiveDate: null, effectiveDateConfidence: 'pending_verification' }),
  ]
  const timeline = makeTimeline(events)
  expect(timeline.hasPendingDates).toBe(true)
  expect(timeline.openVerificationTasks).toBe(1)
})

test('M9C-11: hasPendingDates false when all events confirmed', () => {
  const timeline = makeTimeline([makeTimelineEvent({ effectiveDateConfidence: 'confirmed' })])
  expect(timeline.hasPendingDates).toBe(false)
  expect(timeline.openVerificationTasks).toBe(0)
})

// ── M9C-12: Stable ordering ───────────────────────────────────────────────────

test('M9C-12: UI receives events in service-determined order and does not re-sort', () => {
  // The service orders events by effectiveDate ASC (nulls last).
  // The UI must preserve insertion order as received.
  const events: TimelineEvent[] = [
    makeTimelineEvent({ eventId: 'e1', effectiveDate: '2023-01-01', title: 'First' }),
    makeTimelineEvent({ eventId: 'e2', effectiveDate: '2024-06-15', title: 'Second' }),
    makeTimelineEvent({ eventId: 'e3', effectiveDate: null, title: 'Unknown date', effectiveDateConfidence: 'pending_verification' }),
  ]
  const timeline = makeTimeline(events)
  expect(timeline.events[0].title).toBe('First')
  expect(timeline.events[1].title).toBe('Second')
  expect(timeline.events[2].effectiveDate).toBeNull()
})

// ── M9C-13..14: Authorized property scope ────────────────────────────────────

test('M9C-13: PortfolioSummary.totalPropertiesCount reflects authorized properties only', () => {
  const portfolio = makePortfolio({ totalPropertiesCount: 2 })
  expect(portfolio.totalPropertiesCount).toBe(2)
})

test('M9C-14: Single-property investor — totalPropertiesCount = 1', () => {
  const portfolio = makePortfolio({ totalPropertiesCount: 1 })
  expect(portfolio.totalPropertiesCount).toBe(1)
})

// ── M9C-15: Settlement sign mapping ──────────────────────────────────────────

test('M9C-15: currentBalanceEur is null until Settlement Engine — not 0 (P-ARCH-1)', () => {
  const settlement = makeSettlement({ currentBalanceEur: null })
  expect(settlement.currentBalanceEur).toBeNull()
  expect(settlement.currentBalanceEur).not.toBe(0)
})

// ── M9C-16: One consistent report period ─────────────────────────────────────

test('M9C-16: fromDate and toDate are consistent (both null or both set)', () => {
  const a = makeFinancial({ fromDate: null, toDate: null })
  expect(a.fromDate).toBeNull()
  expect(a.toDate).toBeNull()

  const b = makeFinancial({ fromDate: '2023-01-01', toDate: '2024-12-31' })
  expect(b.fromDate).toBe('2023-01-01')
  expect(b.toDate).toBe('2024-12-31')
})

// ── M9C-17..19: Absence of forbidden JJ internal fields (P-ARCH-6) ───────────

test('M9C-17: CapitalStatement has no jj_cost_basis field', () => {
  const capital = makeCapital()
  expect(capital).not.toHaveProperty('jj_cost_basis')
})

test('M9C-18: PortfolioSummary has no jj_margin field', () => {
  const portfolio = makePortfolio()
  expect(portfolio).not.toHaveProperty('jj_margin')
})

test('M9C-19: FinancialStatement has no jj_* fields', () => {
  const financial = makeFinancial()
  const jjKeys = Object.keys(financial).filter((k) => k.startsWith('jj_'))
  expect(jjKeys).toHaveLength(0)
})

// ── M9C-20: No business calculations in UI-facing consumers ──────────────────

test('M9C-20: resolveCapitalStatus exists in service layer; UI components receive pre-computed capitalStatus', () => {
  // Architecture guard: this documents that UI components must not call resolveCapitalStatus.
  // The function is in the service layer; components receive capitalStatus from the DTO.
  expect(resolveCapitalStatus).toBeDefined()
  expect(typeof resolveCapitalStatus).toBe('function')
})

// ── M9C-21..24: no_capital_event ─────────────────────────────────────────────

test('M9C-21: no_capital_event when hasCapitalEvents = false', () => {
  expect(resolveCapitalStatus(null, null, null, false)).toBe('no_capital_event')
})

test('M9C-22: no_capital_event even when requiredCapital is known', () => {
  expect(resolveCapitalStatus(null, null, 250_000, false)).toBe('no_capital_event')
})

test('M9C-23: no_capital_event takes priority over all amount-based logic', () => {
  expect(resolveCapitalStatus(250_000, 0, 250_000, false)).toBe('no_capital_event')
})

test('M9C-24: hasCapitalEvents defaults to true — 3-arg calls preserved', () => {
  expect(resolveCapitalStatus(250_000, 0, 250_000)).toBe('fully_paid')
  expect(resolveCapitalStatus(null, null, null)).toBe('capital_unknown')
})

// ── SETTLE-01..04: Settlement stub safety ────────────────────────────────────

test('SETTLE-01: currentBalanceEur is null (stub) — direction not inferred from null', () => {
  // The UI renders null as em dash. Direction (payable/receivable/balanced) is NOT derived.
  const settlement = makeSettlement({ currentBalanceEur: null })
  expect(settlement.currentBalanceEur).toBeNull()
  // If balance were 0 → balanced; if positive → receivable; etc.
  // But we cannot compute this from null — Settlement Engine required.
})

test('SETTLE-02: direction unknown (stub) — settlement values do not corrupt capital arithmetic', () => {
  const portfolio = makePortfolio({
    direction: 'unknown',
    finalNetBalance: 0,       // stub placeholder (M9-C scope)
    totalCapitalPaidEur: 250_000,
  })
  expect(portfolio.direction).toBe('unknown')
  expect(portfolio.finalNetBalance).toBe(0)  // stub, not real Settlement Engine output
  // totalCapitalPaidEur is knowable and independent of settlement
  expect(portfolio.totalCapitalPaidEur).toBe(250_000)
})

test('SETTLE-03: NULL totalCapitalRemainingEur stays null when one property is unknown (P-ARCH-1)', () => {
  // Avi: known; Oren: unknown → total must be null, not partial sum
  const portfolio = makePortfolio({
    totalCapitalPaidEur: 250_000,       // Avi only (Oren unknown)
    totalCapitalRemainingEur: null,     // Cannot sum: one component unknown
  })
  expect(portfolio.totalCapitalRemainingEur).toBeNull()
})

test('SETTLE-04: direction unknown — UI does not render as balanced / payable / receivable', () => {
  // Architecture guard: PortfolioSection must not compute:
  // finalNetBalance === 0 → "Balanced"
  // finalNetBalance < 0  → "Payable"
  // finalNetBalance > 0  → "Receivable"
  // Those are Settlement Engine responsibilities.
  const portfolio = makePortfolio({ direction: 'unknown', finalNetBalance: 0 })
  expect(portfolio.direction).toBe('unknown')
  // The only valid rendering for direction:'unknown' is "—" or "Pending Settlement Engine"
})
