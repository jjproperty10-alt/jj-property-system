/**
 * ownerReservationService.test.ts
 *
 * Tests for G3-B Reservation Service (thin wrapper):
 * - Delegates to fetchOwnerReservations (adapter)
 * - Absorbs all errors → empty DTO, never throws
 */

jest.mock('server-only', () => ({}), { virtual: true })

const mockFetchOwnerReservations = jest.fn()

jest.mock('@/lib/owners/ownerReservationAdapter', () => ({
  fetchOwnerReservations: (...args: unknown[]) => mockFetchOwnerReservations(...args),
}))

import { getReservations } from '@/lib/owners/ownerReservationService'
import type { OwnerReservationAdapterInput } from '@/lib/owners/ownerReservationService'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BASE_INPUT: OwnerReservationAdapterInput = {
  properties: ['Villa Mazotos'],
  startDate:  '2026-07-01',
  endDate:    '2026-07-31',
  today:      '2026-07-25',
}

function makeFilledSummary() {
  return {
    period: { startDate: '2026-07-01', endDate: '2026-07-31' },
    portfolio: {
      totalReservations: 5,
      occupancyPct:      null,
      revenueEur:        '4350',
      adr:               null,
      revPar:            null,
      cancellations:     1,
    },
    channelMix:   [{ channel: 'Airbnb', count: 4, revenueEur: '4350', pct: 80 }],
    reservations: [
      {
        id:           'res-001',
        guestName:    'Alice',
        propertyName: 'Villa Mazotos',
        channel:      'Airbnb',
        checkIn:      '2026-07-01',
        checkOut:     '2026-07-07',
        nights:       6,
        revenueEur:   '870',
        status:       'confirmed' as const,
        source:       'hostaway' as const,
        evidenceRef:  null,
      },
    ],
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ownerReservationService.getReservations', () => {
  beforeEach(() => {
    jest.resetAllMocks()
  })

  it('delegates to fetchOwnerReservations and returns the result', async () => {
    const filled = makeFilledSummary()
    mockFetchOwnerReservations.mockResolvedValueOnce(filled)

    const result = await getReservations(BASE_INPUT)

    expect(mockFetchOwnerReservations).toHaveBeenCalledTimes(1)
    expect(mockFetchOwnerReservations).toHaveBeenCalledWith(BASE_INPUT)
    expect(result).toEqual(filled)
  })

  it('passes all input fields through to the adapter', async () => {
    const input: OwnerReservationAdapterInput = {
      properties: ['Villa Mazotos', 'Tamir Dekelia'],
      startDate:  '2026-06-01',
      endDate:    '2026-06-30',
      today:      '2026-06-15',
    }
    mockFetchOwnerReservations.mockResolvedValueOnce(makeFilledSummary())

    await getReservations(input)

    expect(mockFetchOwnerReservations).toHaveBeenCalledWith(input)
  })

  it('returns empty DTO when adapter throws — never re-throws', async () => {
    mockFetchOwnerReservations.mockRejectedValueOnce(new Error('[TEST] adapter crash'))

    const result = await getReservations(BASE_INPUT)

    // Must not throw
    expect(result.reservations).toEqual([])
    expect(result.portfolio.totalReservations).toBe(0)
    expect(result.portfolio.revenueEur).toBeNull()
    expect(result.channelMix).toEqual([])
    expect(result.period.startDate).toBe(BASE_INPUT.startDate)
    expect(result.period.endDate).toBe(BASE_INPUT.endDate)
  })

  it('returns empty DTO when adapter throws with non-Error (string rejection)', async () => {
    mockFetchOwnerReservations.mockRejectedValueOnce('string error')

    const result = await getReservations(BASE_INPUT)

    expect(result.reservations).toEqual([])
    expect(result.portfolio.revenueEur).toBeNull()
  })

  it('returns empty DTO when adapter rejects with undefined', async () => {
    mockFetchOwnerReservations.mockRejectedValueOnce(undefined)

    const result = await getReservations(BASE_INPUT)

    expect(result.reservations).toEqual([])
  })
})
