/**
 * ownerSettlementAdapter — G5 temporal certification tests.
 *
 * Proves fail-closed semantics:
 * 1. Sharon transition → YELLOW
 * 2. Oren transition → YELLOW
 * 3. Normal contact with successful temporal query → GREEN
 * 4. Temporal DB failure → NEVER GREEN (fail-closed)
 */

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockFrom = jest.fn()
const mockSelect = jest.fn()
const mockEq = jest.fn()
const mockLimit = jest.fn()
const mockSingle = jest.fn()

jest.mock('server-only', () => ({}), { virtual: true })

jest.mock('@/lib/supabase', () => ({
  createServiceClient: () => ({
    from: mockFrom,
  }),
}))

import { fetchAllSettlements, fetchSettlementByName } from '@/lib/owners/ownerSettlementAdapter'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function setupTemporalQuery(result: { data: unknown[] | null; error: unknown }) {
  // temporal query chain: from → select → eq
  const temporalChain = {
    select: jest.fn().mockReturnValue({
      eq: jest.fn().mockResolvedValue(result),
    }),
  }
  return temporalChain
}

function setupSummaryQuery(result: { data: unknown[] | null; error: unknown }) {
  return {
    select: jest.fn().mockResolvedValue(result),
  }
}

function setupSingleSummaryQuery(result: { data: unknown | null; error: unknown }) {
  const chain = {
    select: jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue(result),
        }),
      }),
    }),
  }
  return chain
}

beforeEach(() => {
  jest.clearAllMocks()
})

// ─── Test 1: Sharon transition → YELLOW ──────────────────────────────────────

describe('G5 temporal certification', () => {
  it('Sharon transition marks her YELLOW', async () => {
    const temporalData = [
      {
        contact_name_from: 'Sharon',
        contact_name_to: 'NewOwner',
        certification_status: 'yellow',
      },
    ]

    const summaryData = [
      {
        contact_id: 'sharon-id',
        contact_name: 'Sharon',
        total_rows: 10,
        net_jj_settlement: -500,
        net_deal_balance: null,
      },
    ]

    mockFrom.mockImplementation((table: string) => {
      if (table === 'settlement_temporal_transitions') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ data: temporalData, error: null }),
          }),
        }
      }
      if (table === 'v_contact_settlement_summary') {
        return {
          select: jest.fn().mockResolvedValue({ data: summaryData, error: null }),
        }
      }
      return { select: jest.fn().mockResolvedValue({ data: [], error: null }) }
    })

    const result = await fetchAllSettlements()
    const sharon = result.get('Sharon')

    expect(sharon).toBeDefined()
    expect(sharon!.temporalStatus).toBe('yellow')
    expect(sharon!.temporalReason).toContain('NewOwner')
  })

  // ─── Test 2: Oren transition → YELLOW ────────────────────────────────────

  it('Oren transition marks him YELLOW', async () => {
    const temporalData = [
      {
        contact_name_from: 'PreviousOwner',
        contact_name_to: 'Oren',
        certification_status: 'yellow',
      },
    ]

    const summaryData = [
      {
        contact_id: 'oren-id',
        contact_name: 'Oren',
        total_rows: 5,
        net_jj_settlement: 1200,
        net_deal_balance: null,
      },
    ]

    mockFrom.mockImplementation((table: string) => {
      if (table === 'settlement_temporal_transitions') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ data: temporalData, error: null }),
          }),
        }
      }
      if (table === 'v_contact_settlement_summary') {
        return {
          select: jest.fn().mockResolvedValue({ data: summaryData, error: null }),
        }
      }
      return { select: jest.fn().mockResolvedValue({ data: [], error: null }) }
    })

    const result = await fetchAllSettlements()
    const oren = result.get('Oren')

    expect(oren).toBeDefined()
    expect(oren!.temporalStatus).toBe('yellow')
    expect(oren!.temporalReason).toContain('PreviousOwner')
  })

  // ─── Test 3: Normal contact with successful query → GREEN ────────────────

  it('normal contact with successful temporal query gets GREEN', async () => {
    // No temporal transitions — empty result
    const temporalData: unknown[] = []

    const summaryData = [
      {
        contact_id: 'normal-id',
        contact_name: 'NormalOwner',
        total_rows: 20,
        net_jj_settlement: 3000,
        net_deal_balance: null,
      },
    ]

    mockFrom.mockImplementation((table: string) => {
      if (table === 'settlement_temporal_transitions') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ data: temporalData, error: null }),
          }),
        }
      }
      if (table === 'v_contact_settlement_summary') {
        return {
          select: jest.fn().mockResolvedValue({ data: summaryData, error: null }),
        }
      }
      return { select: jest.fn().mockResolvedValue({ data: [], error: null }) }
    })

    const result = await fetchAllSettlements()
    const normal = result.get('NormalOwner')

    expect(normal).toBeDefined()
    expect(normal!.temporalStatus).toBe('green')
    expect(normal!.temporalReason).toBeNull()
  })

  // ─── Test 4: Temporal DB failure → NEVER GREEN ───────────────────────────

  it('temporal DB failure → contacts get YELLOW, never GREEN (G5 fail-closed)', async () => {
    // Temporal query FAILS
    const temporalError = { message: 'relation "settlement_temporal_transitions" does not exist', code: '42P01' }

    const summaryData = [
      {
        contact_id: 'victim-id',
        contact_name: 'VictimOwner',
        total_rows: 15,
        net_jj_settlement: 800,
        net_deal_balance: null,
      },
    ]

    mockFrom.mockImplementation((table: string) => {
      if (table === 'settlement_temporal_transitions') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ data: null, error: temporalError }),
          }),
        }
      }
      if (table === 'v_contact_settlement_summary') {
        return {
          select: jest.fn().mockResolvedValue({ data: summaryData, error: null }),
        }
      }
      return { select: jest.fn().mockResolvedValue({ data: [], error: null }) }
    })

    // Suppress expected console.error
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation()

    const result = await fetchAllSettlements()
    const victim = result.get('VictimOwner')

    expect(victim).toBeDefined()
    // G5: MUST NOT be green when temporal query failed
    expect(victim!.temporalStatus).not.toBe('green')
    // Should be yellow (fail-closed)
    expect(victim!.temporalStatus).toBe('yellow')
    expect(victim!.temporalReason).toContain('fail-closed')

    consoleSpy.mockRestore()
  })

  // ─── Test 5: fetchSettlementByName also fail-closed on temporal failure ──

  it('fetchSettlementByName: temporal failure → YELLOW (G5)', async () => {
    const temporalError = { message: 'permission denied', code: '42501' }

    const summaryRow = {
      contact_id: 'single-id',
      contact_name: 'SingleOwner',
      total_rows: 8,
      net_jj_settlement: -200,
      net_deal_balance: null,
    }

    mockFrom.mockImplementation((table: string) => {
      if (table === 'settlement_temporal_transitions') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ data: null, error: temporalError }),
          }),
        }
      }
      if (table === 'v_contact_settlement_summary') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              limit: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({ data: summaryRow, error: null }),
              }),
            }),
          }),
        }
      }
      return { select: jest.fn().mockResolvedValue({ data: [], error: null }) }
    })

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation()

    const dto = await fetchSettlementByName('SingleOwner')

    expect(dto).not.toBeNull()
    expect(dto!.temporalStatus).not.toBe('green')
    expect(dto!.temporalStatus).toBe('yellow')
    expect(dto!.temporalReason).toContain('fail-closed')

    consoleSpy.mockRestore()
  })
})
