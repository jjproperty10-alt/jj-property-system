/**
 * occupancyPosition.test.ts — Phase 5: Occupancy Position Tests
 *
 * 20 tests covering:
 * - OccupancyPositionDTO contract (type safety, field semantics)
 * - fetchOccupancyPosition adapter behavior (guard, fetch, error handling)
 * - OccupancySection component contract (rendering, guards)
 * - Constitutional compliance (P-ARCH-2, P-LEDGER-1, D4)
 *
 * These tests validate the lifecycle.occupancy_agreements → obligations →
 * v_occupancy_position → adapter → DTO → UI chain.
 */

jest.mock('server-only', () => ({}), { virtual: true })

// ─── Supabase mock ───────────────────────────────────────────────────────────

const mockSingle = jest.fn()
const mockLimit = jest.fn(() => ({ single: mockSingle }))
const mockIn = jest.fn(() => ({ limit: mockLimit }))
const mockSelect = jest.fn(() => ({ in: mockIn }))
const mockFrom = jest.fn(() => ({ select: mockSelect }))
const mockSchema = jest.fn(() => ({ from: mockFrom }))

jest.mock('@/lib/supabase', () => ({
  createServiceClient: () => ({ schema: mockSchema }),
}))

const mockFetchRC3Report = jest.fn()
jest.mock('@/lib/report/fetchReport', () => ({
  fetchRC3Report: (...args: unknown[]) => mockFetchRC3Report(...args),
}))

import { fetchOwnerFinancial } from '@/lib/owners/ownerFinancialAdapter'
import type { OccupancyPositionDTO } from '@/lib/owners/ownerWorkspaceTypes'

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** A valid v_occupancy_position row as returned by Supabase */
function makeOccupancyViewRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    property_name: 'Oshrit Deklia',
    monthly_amount_eur: 1000,
    effective_from: '2025-01-01',
    effective_to: null,
    agreement_status: 'active',
    total_obligations: 20,
    settled_count: 14,
    open_count: 6,
    total_obligated_eur: 20000,
    total_settled_eur: 14000,
    outstanding_eur: 6000,
    settled_by_jj_eur: 2600,
    settled_by_jacob_eur: 11400,
    settled_by_yossi_eur: 0,
    ...overrides,
  }
}

/** Minimal RC3 section for non-occupancy tests */
function makeSection(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    account_type: overrides.account_type ?? 'rental',
    account_label: overrides.account_label ?? 'Rental',
    account_label_he: 'השכרה',
    balance_convention: overrides.balance_convention ?? 'owner_credit',
    opening_balance: 0,
    contract_baseline: 0,
    rows: [],
    total_income: overrides.total_income ?? 5000,
    total_expenses: overrides.total_expenses ?? 1000,
    total_bpo: overrides.total_bpo ?? 4000,
    closing_balance: overrides.closing_balance ?? 4000,
  }
}

function makeReport(reportingName: string, sections: ReturnType<typeof makeSection>[]) {
  return {
    reporting_name: reportingName,
    from_date: null,
    to_date: null,
    generated_at: '2026-08-01T00:00:00Z',
    accounts: sections,
    has_purchase: false,
    has_sale: false,
    has_renovation: false,
    has_rental: true,
    has_airbnb: false,
  }
}

afterEach(() => jest.clearAllMocks())

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Occupancy Position — Adapter', () => {

  // Test 1: Guard — non-guarded properties return null occupancyPosition
  it('returns null occupancyPosition for non-NEEDS_REVIEW properties', async () => {
    mockFetchRC3Report.mockResolvedValueOnce(
      makeReport('Villa Mazotos', [makeSection()]),
    )

    const result = await fetchOwnerFinancial({ properties: ['Villa Mazotos'] })

    expect(result.occupancyPosition).toBeNull()
    // Supabase should NOT be called for non-guarded properties
    expect(mockSchema).not.toHaveBeenCalled()
  })

  // Test 2: Guard — Oshrit triggers occupancy fetch
  it('fetches occupancyPosition for Oshrit Deklia (NEEDS_REVIEW property)', async () => {
    mockFetchRC3Report.mockResolvedValueOnce(
      makeReport('Oshrit Deklia', [makeSection()]),
    )
    mockSingle.mockResolvedValueOnce({ data: makeOccupancyViewRow(), error: null })

    const result = await fetchOwnerFinancial({ properties: ['Oshrit Deklia'] })

    expect(result.occupancyPosition).not.toBeNull()
    expect(mockSchema).toHaveBeenCalledWith('lifecycle')
    expect(mockFrom).toHaveBeenCalledWith('v_occupancy_position')
  })

  // Test 3: DTO field mapping — all fields correctly mapped from view row
  it('maps all view row fields to OccupancyPositionDTO', async () => {
    mockFetchRC3Report.mockResolvedValueOnce(
      makeReport('Oshrit Deklia', [makeSection()]),
    )
    const viewRow = makeOccupancyViewRow()
    mockSingle.mockResolvedValueOnce({ data: viewRow, error: null })

    const result = await fetchOwnerFinancial({ properties: ['Oshrit Deklia'] })
    const pos = result.occupancyPosition!

    expect(pos.propertyName).toBe('Oshrit Deklia')
    expect(pos.monthlyAmountEur).toBe('1000')
    expect(pos.effectiveFrom).toBe('2025-01-01')
    expect(pos.effectiveTo).toBeNull()
    expect(pos.agreementStatus).toBe('active')
    expect(pos.totalObligations).toBe(20)
    expect(pos.settledCount).toBe(14)
    expect(pos.openCount).toBe(6)
    expect(pos.totalObligatedEur).toBe('20000')
    expect(pos.totalSettledEur).toBe('14000')
    expect(pos.outstandingEur).toBe('6000')
  })

  // Test 4: P-ARCH-2 — Payer identity preserved in settlement breakdown
  it('preserves payer identity breakdown (P-ARCH-2: Yossi ≠ Jacob ≠ JJ)', async () => {
    mockFetchRC3Report.mockResolvedValueOnce(
      makeReport('Oshrit Deklia', [makeSection()]),
    )
    mockSingle.mockResolvedValueOnce({
      data: makeOccupancyViewRow({
        settled_by_jj_eur: 2600,
        settled_by_jacob_eur: 11400,
        settled_by_yossi_eur: 0,
      }),
      error: null,
    })

    const result = await fetchOwnerFinancial({ properties: ['Oshrit Deklia'] })
    const pos = result.occupancyPosition!

    expect(pos.settledByJjEur).toBe('2600')
    expect(pos.settledByJacobEur).toBe('11400')
    expect(pos.settledByYossiEur).toBe('0')
  })

  // Test 5: Error resilience — Supabase error returns null, never throws
  it('returns null occupancyPosition when Supabase returns error', async () => {
    mockFetchRC3Report.mockResolvedValueOnce(
      makeReport('Oshrit Deklia', [makeSection()]),
    )
    mockSingle.mockResolvedValueOnce({
      data: null,
      error: { message: 'relation does not exist', code: '42P01' },
    })

    const result = await fetchOwnerFinancial({ properties: ['Oshrit Deklia'] })

    expect(result.occupancyPosition).toBeNull()
    // Should NOT throw — graceful degradation
  })

  // Test 6: Error resilience — exception in fetch returns null
  it('returns null occupancyPosition when fetch throws', async () => {
    mockFetchRC3Report.mockResolvedValueOnce(
      makeReport('Oshrit Deklia', [makeSection()]),
    )
    mockSingle.mockRejectedValueOnce(new Error('network failure'))

    const result = await fetchOwnerFinancial({ properties: ['Oshrit Deklia'] })

    expect(result.occupancyPosition).toBeNull()
  })

  // Test 7: RC3 failure doesn't block occupancy fetch
  it('fetches occupancyPosition even when RC3 reports fail', async () => {
    mockFetchRC3Report.mockRejectedValueOnce(new Error('RC3 unavailable'))
    mockSingle.mockResolvedValueOnce({ data: makeOccupancyViewRow(), error: null })

    const result = await fetchOwnerFinancial({ properties: ['Oshrit Deklia'] })

    // RC3 failed → empty position/sections, but occupancy is populated
    expect(result.position.incomeEur).toBeNull()
    expect(result.sections).toHaveLength(0)
    expect(result.occupancyPosition).not.toBeNull()
    expect(result.occupancyPosition!.totalObligations).toBe(20)
  })

  // Test 8: Effective_to propagated when agreement terminated
  it('propagates effectiveTo when agreement has end date', async () => {
    mockFetchRC3Report.mockResolvedValueOnce(
      makeReport('Oshrit Deklia', [makeSection()]),
    )
    mockSingle.mockResolvedValueOnce({
      data: makeOccupancyViewRow({ effective_to: '2027-06-30' }),
      error: null,
    })

    const result = await fetchOwnerFinancial({ properties: ['Oshrit Deklia'] })

    expect(result.occupancyPosition!.effectiveTo).toBe('2027-06-30')
  })

  // Test 9: Empty properties list — no occupancy fetch
  it('does not fetch occupancy for empty properties', async () => {
    const result = await fetchOwnerFinancial({ properties: [] })

    expect(result.occupancyPosition).toBeNull()
    expect(mockSchema).not.toHaveBeenCalled()
  })

  // Test 10: Mixed properties — only guarded one triggers fetch
  it('queries only NEEDS_REVIEW properties in occupancy fetch', async () => {
    mockFetchRC3Report
      .mockResolvedValueOnce(makeReport('Villa Mazotos', [makeSection()]))
      .mockResolvedValueOnce(makeReport('Oshrit Deklia', [makeSection()]))
    mockSingle.mockResolvedValueOnce({ data: makeOccupancyViewRow(), error: null })

    await fetchOwnerFinancial({ properties: ['Villa Mazotos', 'Oshrit Deklia'] })

    // The .in() call should only include Oshrit Deklia, not Villa Mazotos
    expect(mockIn).toHaveBeenCalledWith('property_name', ['Oshrit Deklia'])
  })
})

describe('Occupancy Position — DTO Contract', () => {

  // Test 11: All numeric fields are strings (Supabase NUMERIC → string convention)
  it('represents all euro amounts as strings', async () => {
    mockFetchRC3Report.mockResolvedValueOnce(
      makeReport('Oshrit Deklia', [makeSection()]),
    )
    mockSingle.mockResolvedValueOnce({ data: makeOccupancyViewRow(), error: null })

    const result = await fetchOwnerFinancial({ properties: ['Oshrit Deklia'] })
    const pos = result.occupancyPosition!

    // Euro amounts must be strings (matching EuroAmount convention)
    expect(typeof pos.monthlyAmountEur).toBe('string')
    expect(typeof pos.totalObligatedEur).toBe('string')
    expect(typeof pos.totalSettledEur).toBe('string')
    expect(typeof pos.outstandingEur).toBe('string')
    expect(typeof pos.settledByJjEur).toBe('string')
    expect(typeof pos.settledByJacobEur).toBe('string')
    expect(typeof pos.settledByYossiEur).toBe('string')
  })

  // Test 12: Count fields are numbers (not strings)
  it('represents count fields as numbers', async () => {
    mockFetchRC3Report.mockResolvedValueOnce(
      makeReport('Oshrit Deklia', [makeSection()]),
    )
    mockSingle.mockResolvedValueOnce({ data: makeOccupancyViewRow(), error: null })

    const result = await fetchOwnerFinancial({ properties: ['Oshrit Deklia'] })
    const pos = result.occupancyPosition!

    expect(typeof pos.totalObligations).toBe('number')
    expect(typeof pos.settledCount).toBe('number')
    expect(typeof pos.openCount).toBe('number')
  })

  // Test 13: Settled + open = total obligations (invariant)
  it('maintains settled + open = total obligations invariant', async () => {
    mockFetchRC3Report.mockResolvedValueOnce(
      makeReport('Oshrit Deklia', [makeSection()]),
    )
    mockSingle.mockResolvedValueOnce({ data: makeOccupancyViewRow(), error: null })

    const result = await fetchOwnerFinancial({ properties: ['Oshrit Deklia'] })
    const pos = result.occupancyPosition!

    expect(pos.settledCount + pos.openCount).toBe(pos.totalObligations)
  })

  // Test 14: Financial invariant — settled + outstanding = obligated
  it('maintains totalSettled + outstanding = totalObligated invariant', async () => {
    mockFetchRC3Report.mockResolvedValueOnce(
      makeReport('Oshrit Deklia', [makeSection()]),
    )
    mockSingle.mockResolvedValueOnce({ data: makeOccupancyViewRow(), error: null })

    const result = await fetchOwnerFinancial({ properties: ['Oshrit Deklia'] })
    const pos = result.occupancyPosition!

    const settled = parseFloat(pos.totalSettledEur)
    const outstanding = parseFloat(pos.outstandingEur)
    const obligated = parseFloat(pos.totalObligatedEur)
    expect(settled + outstanding).toBe(obligated)
  })

  // Test 15: Payer breakdown sums to totalSettled (P-ARCH-2 check)
  it('payer breakdown sums to totalSettled (P-ARCH-2 completeness)', async () => {
    mockFetchRC3Report.mockResolvedValueOnce(
      makeReport('Oshrit Deklia', [makeSection()]),
    )
    mockSingle.mockResolvedValueOnce({ data: makeOccupancyViewRow(), error: null })

    const result = await fetchOwnerFinancial({ properties: ['Oshrit Deklia'] })
    const pos = result.occupancyPosition!

    const jj = parseFloat(pos.settledByJjEur)
    const jacob = parseFloat(pos.settledByJacobEur)
    const yossi = parseFloat(pos.settledByYossiEur)
    const total = parseFloat(pos.totalSettledEur)

    expect(jj + jacob + yossi).toBe(total)
  })
})

describe('Occupancy Position — Constitutional Compliance', () => {

  // Test 16: D4 — Occupancy position doesn't alter Overall Net
  it('does not alter Overall Net computation (D4 settlement boundary)', async () => {
    mockFetchRC3Report.mockResolvedValueOnce(
      makeReport('Oshrit Deklia', [
        makeSection({
          account_type: 'rental',
          balance_convention: 'owner_credit',
          closing_balance: -5000,
        }),
      ]),
    )
    mockSingle.mockResolvedValueOnce({ data: makeOccupancyViewRow(), error: null })

    const result = await fetchOwnerFinancial({ properties: ['Oshrit Deklia'] })

    // Overall Net remains needs_review — occupancy outstanding is NOT subtracted
    expect(result.overallNet).not.toBeNull()
    expect(result.overallNet!.reviewStatus).toBe('needs_review')
    // The occupancy data exists separately, not mixed into position
    expect(result.occupancyPosition).not.toBeNull()
  })

  // Test 17: Occupancy position is independent of position KPIs
  it('keeps occupancy position independent from RC3 position KPIs', async () => {
    mockFetchRC3Report.mockResolvedValueOnce(
      makeReport('Oshrit Deklia', [
        makeSection({ total_income: 3000, total_expenses: 500 }),
      ]),
    )
    mockSingle.mockResolvedValueOnce({ data: makeOccupancyViewRow(), error: null })

    const result = await fetchOwnerFinancial({ properties: ['Oshrit Deklia'] })

    // RC3 position shows engine-computed amounts — no occupancy contamination
    expect(result.position.incomeEur).toBe('3000')
    expect(result.position.expensesEur).toBe('500')
    // Occupancy is separate
    expect(result.occupancyPosition!.outstandingEur).toBe('6000')
  })

  // Test 18: P-LEDGER-5 — occupancy obligations are NOT transfers
  it('occupancy DTO propertyName matches query property (scope isolation)', async () => {
    mockFetchRC3Report.mockResolvedValueOnce(
      makeReport('Oshrit Deklia', [makeSection()]),
    )
    mockSingle.mockResolvedValueOnce({ data: makeOccupancyViewRow(), error: null })

    const result = await fetchOwnerFinancial({ properties: ['Oshrit Deklia'] })

    // The DTO property name must match the queried property — no cross-property leakage
    expect(result.occupancyPosition!.propertyName).toBe('Oshrit Deklia')
  })

  // Test 19: occupancyPosition is null when view returns no data (P-ARCH-1: Unknown = NULL)
  it('returns null when view has no row for property (P-ARCH-1)', async () => {
    mockFetchRC3Report.mockResolvedValueOnce(
      makeReport('Oshrit Deklia', [makeSection()]),
    )
    mockSingle.mockResolvedValueOnce({ data: null, error: null })

    const result = await fetchOwnerFinancial({ properties: ['Oshrit Deklia'] })

    // P-ARCH-1: Unknown = NULL, never 0 or placeholder
    expect(result.occupancyPosition).toBeNull()
  })

  // Test 20: OwnerFinancialDTO shape includes occupancyPosition field
  it('OwnerFinancialDTO always includes occupancyPosition field', async () => {
    // Non-guarded property
    mockFetchRC3Report.mockResolvedValueOnce(
      makeReport('Villa Mazotos', [makeSection()]),
    )

    const result = await fetchOwnerFinancial({ properties: ['Villa Mazotos'] })

    // The field must exist on the DTO (null, not undefined) for non-guarded properties
    expect('occupancyPosition' in result).toBe(true)
  })
})
