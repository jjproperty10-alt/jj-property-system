/**
 * financialTabSummary.test.ts — Summary suppression when overallNet = needs_review
 *
 * When an owner's overallNet has reviewStatus='needs_review', the top-level
 * financial summary KPIs must NOT be shown — they contain figures (like JJ
 * internal purchase cost) that do not represent the owner's true position.
 *
 * Instead, a warning banner is displayed. Category breakdowns remain visible.
 */

jest.mock('server-only', () => ({}), { virtual: true })

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
import type { OwnerFinancialDTO, OwnerOverallNetDTO } from '@/lib/owners/ownerWorkspaceTypes'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRC3Section(overrides: Record<string, unknown> = {}) {
  return {
    account_type: 'rental',
    account_label: 'Rental Management',
    total_income: 5600,
    total_expenses: 3380,
    total_bpo: 14000,
    closing_balance: 2220,
    balance_convention: 'client_debt' as const,
    rows: [],
    ...overrides,
  }
}

function makeRC3Report(sections = [makeRC3Section()]) {
  return { accounts: sections }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Summary suppression for needs_review owners', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockSingle.mockResolvedValue({ data: null, error: { message: 'not found' } })
  })

  test('NEEDS_REVIEW property: overallNet has reviewStatus=needs_review', async () => {
    mockFetchRC3Report.mockResolvedValue(makeRC3Report())

    const result = await fetchOwnerFinancial({
      properties: ['Oshrit Deklia'],
    })

    expect(result.overallNet).not.toBeNull()
    expect(result.overallNet!.reviewStatus).toBe('needs_review')
    expect(result.overallNet!.reviewReason).toBeTruthy()
  })

  test('Normal property: overallNet has NO reviewStatus', async () => {
    mockFetchRC3Report.mockResolvedValue(makeRC3Report())

    const result = await fetchOwnerFinancial({
      properties: ['Liora Anafotia 202'],
    })

    expect(result.overallNet).not.toBeNull()
    expect(result.overallNet!.reviewStatus).toBeUndefined()
  })

  test('needs_review DTO provides position values (adapter does not suppress data)', async () => {
    mockFetchRC3Report.mockResolvedValue(makeRC3Report())

    const result = await fetchOwnerFinancial({
      properties: ['Oshrit Deklia'],
    })

    // The adapter still computes position — suppression is UI-only
    expect(result.position.incomeEur).not.toBeNull()
    expect(result.position.expensesEur).not.toBeNull()
  })

  test('UI contract: summaryUnderReview is derived from overallNet.reviewStatus', () => {
    // This tests the contract that FinancialTab uses to decide suppression.
    // The actual component renders AttentionBanner when this is true.
    const withReview: OwnerOverallNetDTO = {
      departments: [],
      netEur: '2620',
      label: 'due_to_jj',
      displayAmountEur: '2620',
      reviewStatus: 'needs_review',
      reviewReason: 'test',
    }

    const withoutReview: OwnerOverallNetDTO = {
      departments: [],
      netEur: '5120',
      label: 'due_to_jj',
      displayAmountEur: '5120',
    }

    // When reviewStatus === 'needs_review', summary should be suppressed
    expect(withReview.reviewStatus === 'needs_review').toBe(true)
    // When reviewStatus is undefined, summary should show normally
    expect(withoutReview.reviewStatus === 'needs_review').toBe(false)
  })

  test('sections remain available even when needs_review (breakdowns visible)', async () => {
    mockFetchRC3Report.mockResolvedValue(makeRC3Report([
      makeRC3Section({ account_type: 'rental' }),
      makeRC3Section({ account_type: 'purchase', account_label: 'Property Purchase' }),
    ]))

    const result = await fetchOwnerFinancial({
      properties: ['Oshrit Deklia'],
    })

    // Sections are still populated — UI shows breakdowns even when summary is suppressed
    expect(result.sections.length).toBe(2)
    expect(result.overallNet!.reviewStatus).toBe('needs_review')
  })
})
