/**
 * ownerFinancialService.test.ts
 *
 * G3-A: Unit tests for the Owner Financial service boundary.
 *
 * Tests verify:
 * - Service delegates to adapter
 * - Adapter throws → service returns empty DTO (never throws itself)
 * - Empty properties → empty DTO
 */

jest.mock('server-only', () => ({}), { virtual: true })

const mockFetchOwnerFinancial = jest.fn()
jest.mock('@/lib/owners/ownerFinancialAdapter', () => ({
  fetchOwnerFinancial: (...args: unknown[]) => mockFetchOwnerFinancial(...args),
}))

import { getFinancial } from '@/lib/owners/ownerFinancialService'
import type { OwnerFinancialDTO } from '@/lib/owners/ownerWorkspaceTypes'

const EMPTY_DTO: OwnerFinancialDTO = {
  position: {
    incomeEur:         null,
    expensesEur:       null,
    netEur:            null,
    paidToOwnerEur:    null,
    pendingEur:        null,
    closingBalanceEur: null,
  },
  overallNet: null,
  sections:   [],
  timeline:   [],
}

const POPULATED_DTO: OwnerFinancialDTO = {
  position: {
    incomeEur:         '5000',
    expensesEur:       '800',
    netEur:            '4200',
    paidToOwnerEur:    '4000',
    pendingEur:        null,
    closingBalanceEur: '6000',
  },
  overallNet: {
    departments: [{ type: 'airbnb', label: 'Airbnb', closingBalanceEur: '6000', normalizedEur: '6000', label_status: 'due_to_you', displayAmountEur: '6000' }],
    netEur: '6000',
    label: 'due_to_you',
    displayAmountEur: '6000',
  },
  sections:  [{ type: 'airbnb', label: 'Airbnb', incomeEur: '5000', expensesEur: '800', netEur: '4200', closingBalanceEur: '6000', balanceConvention: 'owner_credit', rows: [] }],
  timeline:  [],
}

afterEach(() => jest.clearAllMocks())

describe('getFinancial', () => {
  it('delegates to fetchOwnerFinancial and returns its result', async () => {
    mockFetchOwnerFinancial.mockResolvedValueOnce(POPULATED_DTO)

    const result = await getFinancial({
      properties: ['Villa Mazotos'],
      fromDate: '2026-01-01',
      toDate:   '2026-06-30',
    })

    expect(mockFetchOwnerFinancial).toHaveBeenCalledWith({
      properties: ['Villa Mazotos'],
      fromDate: '2026-01-01',
      toDate:   '2026-06-30',
    })
    expect(result).toEqual(POPULATED_DTO)
  })

  it('returns empty DTO when adapter throws (never re-throws)', async () => {
    mockFetchOwnerFinancial.mockRejectedValueOnce(new Error('[TEST] adapter failure'))

    const result = await getFinancial({ properties: ['Villa Mazotos'] })

    // Must not throw
    expect(result).toEqual(EMPTY_DTO)
  })

  it('returns empty DTO when properties is empty (adapter returns empty DTO)', async () => {
    mockFetchOwnerFinancial.mockResolvedValueOnce(EMPTY_DTO)

    const result = await getFinancial({ properties: [] })

    expect(result.sections).toHaveLength(0)
    expect(result.position.incomeEur).toBeNull()
  })
})
