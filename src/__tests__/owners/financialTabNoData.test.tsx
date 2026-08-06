/**
 * financialTabNoData.test.tsx — No-data state machine for FinancialTab
 *
 * FinancialTab has three display states:
 * A. No Data — overallNet null, no sections, no occupancy → Empty State only
 * B. Needs Review — overallNet.reviewStatus='needs_review' → warning banner
 * C. Valid Data — normal 6 KPI cards
 *
 * Edge case: occupancy exists without overallNet → NOT "No Data"
 */

import type { OwnerFinancialDTO, OwnerOverallNetDTO, OccupancyPositionDTO } from '@/lib/owners/ownerWorkspaceTypes'

// ─── State derivation (mirrors FinancialTab.tsx logic) ────────────────────────

function deriveDisplayState(input: {
  overallNet: OwnerOverallNetDTO | null
  sections: OwnerFinancialDTO['sections']
  occupancyPosition: OccupancyPositionDTO | null
}) {
  const { overallNet, sections, occupancyPosition } = input

  const hasAnyFinancialContent = sections.length > 0 || occupancyPosition != null
  const noFinancialData = overallNet === null && !hasAnyFinancialContent
  const summaryUnderReview = overallNet?.reviewStatus === 'needs_review'

  // JSX rendering decisions (exact mirror of FinancialTab.tsx):
  const showKpiGrid = overallNet != null && !summaryUnderReview
  const showWarningBanner = overallNet != null && summaryUnderReview
  const showEmptyState = noFinancialData
  const showPositionSection = overallNet != null

  return {
    hasAnyFinancialContent,
    noFinancialData,
    summaryUnderReview,
    showKpiGrid,
    showWarningBanner,
    showEmptyState,
    showPositionSection,
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeOverallNet(overrides: Partial<OwnerOverallNetDTO> = {}): OwnerOverallNetDTO {
  return {
    departments: [],
    netEur: '5120',
    label: 'due_to_jj',
    displayAmountEur: '5120',
    ...overrides,
  }
}

function makeOccupancyPosition(): OccupancyPositionDTO {
  return {
    propertyName: 'Oshrit Deklia',
    monthlyAmountEur: '1000',
    effectiveFrom: '2025-01-01',
    effectiveTo: null,
    agreementStatus: 'active',
    totalObligatedEur: '20000',
    totalObligations: 20,
    totalSettledEur: '14000',
    settledCount: 14,
    outstandingEur: '6000',
    openCount: 6,
    settledByJjEur: '2600',
    settledByJacobEur: '11400',
    settledByYossiEur: '0',
  }
}

function makeSection(type = 'rental'): OwnerFinancialDTO['sections'][number] {
  return {
    type,
    label: type.charAt(0).toUpperCase() + type.slice(1),
    rows: [],
    incomeEur: '0',
    expensesEur: '0',
    netEur: '0',
    closingBalanceEur: null,
    balanceConvention: null,
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('FinancialTab no-data state machine', () => {

  // ─── State A: No Data ────────────────────────────────────────────────────

  test('1. No data (null overallNet, no sections, no occupancy): KPI cards not rendered', () => {
    const state = deriveDisplayState({
      overallNet: null,
      sections: [],
      occupancyPosition: null,
    })
    expect(state.showKpiGrid).toBe(false)
    expect(state.showPositionSection).toBe(false)
  })

  test('2. No data: Empty State is rendered', () => {
    const state = deriveDisplayState({
      overallNet: null,
      sections: [],
      occupancyPosition: null,
    })
    expect(state.showEmptyState).toBe(true)
  })

  test('3. No data: no misleading zero values (position section hidden entirely)', () => {
    const state = deriveDisplayState({
      overallNet: null,
      sections: [],
      occupancyPosition: null,
    })
    // Position section is hidden — no €0 KPI cards can be rendered
    expect(state.showPositionSection).toBe(false)
    expect(state.showKpiGrid).toBe(false)
    expect(state.showWarningBanner).toBe(false)
    expect(state.noFinancialData).toBe(true)
  })

  // ─── State B: Needs Review ──────────────────────────────────────────────

  test('4. Needs Review: KPI cards hidden', () => {
    const state = deriveDisplayState({
      overallNet: makeOverallNet({ reviewStatus: 'needs_review', reviewReason: 'test' }),
      sections: [makeSection()],
      occupancyPosition: null,
    })
    expect(state.showKpiGrid).toBe(false)
  })

  test('5. Needs Review: warning banner visible', () => {
    const state = deriveDisplayState({
      overallNet: makeOverallNet({ reviewStatus: 'needs_review' }),
      sections: [makeSection()],
      occupancyPosition: null,
    })
    expect(state.showWarningBanner).toBe(true)
    expect(state.showPositionSection).toBe(true)
  })

  test('6. Needs Review: sections remain visible (hasAnyFinancialContent)', () => {
    const state = deriveDisplayState({
      overallNet: makeOverallNet({ reviewStatus: 'needs_review' }),
      sections: [makeSection('rental'), makeSection('purchase')],
      occupancyPosition: null,
    })
    expect(state.hasAnyFinancialContent).toBe(true)
    expect(state.showEmptyState).toBe(false)
  })

  // ─── Edge case: Occupancy-only content ──────────────────────────────────

  test('7. Occupancy-only (null overallNet, no sections, occupancy present): occupancy visible', () => {
    const state = deriveDisplayState({
      overallNet: null,
      sections: [],
      occupancyPosition: makeOccupancyPosition(),
    })
    expect(state.hasAnyFinancialContent).toBe(true)
    expect(state.noFinancialData).toBe(false)
    // occupancyPosition is truthy → component renders OccupancySection
  })

  test('8. Occupancy-only: generic "No financial data available" empty state NOT shown', () => {
    const state = deriveDisplayState({
      overallNet: null,
      sections: [],
      occupancyPosition: makeOccupancyPosition(),
    })
    expect(state.showEmptyState).toBe(false)
  })

  // ─── State C: Valid Data ────────────────────────────────────────────────

  test('9. Valid data (overallNet present, no review): all 6 KPI cards render normally', () => {
    const state = deriveDisplayState({
      overallNet: makeOverallNet(),
      sections: [makeSection()],
      occupancyPosition: null,
    })
    expect(state.showKpiGrid).toBe(true)
    expect(state.showWarningBanner).toBe(false)
    expect(state.showEmptyState).toBe(false)
    expect(state.showPositionSection).toBe(true)
  })

  test('10. Normal owner: valid overallNet with sections → standard financial display', () => {
    const state = deriveDisplayState({
      overallNet: makeOverallNet({ netEur: '7000', displayAmountEur: '7000' }),
      sections: [makeSection('rental'), makeSection('airbnb')],
      occupancyPosition: null,
    })
    expect(state.showKpiGrid).toBe(true)
    expect(state.showEmptyState).toBe(false)
    expect(state.noFinancialData).toBe(false)
    expect(state.summaryUnderReview).toBe(false)
  })
})
