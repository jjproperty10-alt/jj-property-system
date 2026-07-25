/**
 * ownerReservationAdapter.test.ts
 *
 * Tests for G3-B Reservation Adapter:
 * - maskGuestName: active, upcoming, historical, null
 * - fetchOwnerReservations: masking, payout preservation, status mapping,
 *   internal field exclusion, audit failure handling, empty input
 */

jest.mock('server-only', () => ({}), { virtual: true })

jest.mock('@/lib/supabase', () => ({
  // stub — not used since PropertyAuditService is mocked
  createServiceClient: () => ({}),
}))

const mockAuditProperty = jest.fn()
const mockListAuditableProperties = jest.fn()

jest.mock('@/lib/hostaway-audit', () => ({
  PropertyAuditService: jest.fn().mockImplementation(() => ({
    auditProperty:              (...args: unknown[]) => mockAuditProperty(...args),
    listAuditableProperties:    (...args: unknown[]) => mockListAuditableProperties(...args),
  })),
}))

import { maskGuestName, fetchOwnerReservations } from '@/lib/owners/ownerReservationAdapter'
import type { OwnerReservationAdapterInput } from '@/lib/owners/ownerReservationAdapter'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TODAY = '2026-07-25'

function makeReservation(overrides: {
  hostawayReservationId?: string
  guestName?: string | null
  checkIn?: string
  checkOut?: string
  status?: string
  nights?: number
  channel?: string
  channelRaw?: string
  payoutAmount?: number | null
  payoutSource?: string
} = {}) {
  return {
    hostawayReservationId: overrides.hostawayReservationId ?? 'res-001',
    hostawayPropertyId:    'ha-001',
    channel:               overrides.channel ?? 'airbnb',
    channelRaw:            overrides.channelRaw ?? 'Airbnb',
    status:                overrides.status ?? 'confirmed',
    guestName:             overrides.guestName !== undefined ? overrides.guestName : 'John Smith',
    checkIn:               overrides.checkIn ?? '2026-07-01',
    checkOut:              overrides.checkOut ?? '2026-07-07',
    nights:                overrides.nights ?? 6,
    guests:                2,
    currencyCode:          'EUR',
    financials: {
      totalPrice:       1000,
      cleaningFee:      100,
      hostServiceFee:   30,
      channelCommission: null,
      taxAmount:         null,
      payout: {
        amount:           overrides.payoutAmount !== undefined ? overrides.payoutAmount : 870,
        source:           overrides.payoutSource ?? 'reported',
        confidence:       'high' as const,
        calculationNote:  null,
      },
      basePrice:        900,
      payoutExpected:   870,
    },
    auditState:             'aggregate_match',
    aggregatePeriodId:      'agg-001',
    matchedTransactionIds:  [],
    jjPlatformIncome:       null,
    jjCleaning:             null,
    difference:             null,
  }
}

function makePropertyAuditResult(
  reservations: ReturnType<typeof makeReservation>[] = [],
  opts: {
    success?: boolean
    error?: string
    payoutAmount?: number | null
    cancellations?: number
    channelBreakdown?: Array<{ channel: string; reservationCount: number; totalRevenue: number; totalPayout: number | null }>
    jjPropertyName?: string
  } = {},
) {
  if (opts.success === false) {
    return { success: false, audit: null, error: opts.error ?? 'no mapping' }
  }

  const revenueEligible = reservations.filter(r => r.status === 'confirmed' || r.status === 'modified').length
  const cancelled       = reservations.filter(r => r.status === 'cancelled').length

  return {
    success: true,
    error:   null,
    audit: {
      jjPropertyName:        opts.jjPropertyName ?? 'Villa Mazotos',
      hostawayPropertyId:    'ha-001',
      hostawayPropertyName:  'Villa Mazotos Hostaway',
      hostawayInternalName:  null,
      mappingConfidence:     'exact',
      mappingStatus:         'approved',
      auditId:               'HAU-2026-000001',
      auditDate:             '2026-07-25T00:00:00Z',
      dateRangeFrom:         '2026-07-01',
      dateRangeTo:           '2026-07-31',
      dateFilterMode:        'stay_overlaps',
      limitations: {
        dateFilterMode:                     'stay_overlaps',
        reservationLevelMatchingPossible:    false,
        matchingLimitationReason:           'test',
        comparisonGranularity:              'period_aggregate',
        unparseableJjPeriods:               0,
        reservationsWithMissingFinancials:  0,
        notes:                              [],
      },
      evidenceQuality: {
        reportedPayoutFraction:     1,
        completeFinancialsFraction: 1,
        overallQuality:             'high',
        qualityNote:                'test',
      },
      summary: {
        totalReservations:            reservations.length,
        revenueEligibleReservations:  revenueEligible,
        confirmedReservations:        revenueEligible,
        modifiedReservations:         0,
        cancelledReservations:        opts.cancellations ?? cancelled,
        inquiryReservations:          0,
        ownerStayReservations:        0,
        unknownStatusReservations:    0,
        channelBreakdown:             opts.channelBreakdown ?? [
          { channel: 'airbnb', reservationCount: revenueEligible, totalRevenue: 1000, totalPayout: opts.payoutAmount ?? 870 },
        ],
        hostawayTotalRevenue:         1000,
        hostawayTotalPayout: {
          amount:          opts.payoutAmount !== undefined ? opts.payoutAmount : 870,
          source:          'reported',
          confidence:      'high',
          calculationNote: null,
        },
        hostawayTotalCleaning:        100,
        jjAirbnbRows:                 0,
        jjPlatformIncomeTotal:        0,
        jjCleaningTotal:              0,
        jjManagementFeeTotal:         0,
        jjPeriodAggregateCount:       0,
        periodsCompared:              0,
        periodsMatched:               0,
        totalPeriodDifference:        null,
        auditStateDistribution: {
          exact: 0, aggregate_match: revenueEligible, probable: 0, difference: 0,
          missing_in_jj: 0, missing_in_hostaway: 0, not_comparable: 0, insufficient_evidence: 0,
        },
        totalDifferences:     0,
        totalDifferenceAmount: 0,
        earliestCheckIn:      reservations[0]?.checkIn ?? null,
        latestCheckOut:       reservations[0]?.checkOut ?? null,
        health:               'clean',
      },
      reservations,
      periodComparisons: [],
      differences:       [],
      dataSources:       [],
    },
  }
}

const BASE_INPUT: OwnerReservationAdapterInput = {
  properties: ['Villa Mazotos'],
  startDate:  '2026-07-01',
  endDate:    '2026-07-31',
  today:      TODAY,
}

// ─── maskGuestName unit tests ─────────────────────────────────────────────────

describe('maskGuestName', () => {
  it('returns null when guestName is null (P-ARCH-1: null is not fabricated)', () => {
    expect(maskGuestName(null, '2026-07-10', TODAY)).toBeNull()
  })

  it('returns "[Guest]" for historical reservation (checkOut < today)', () => {
    expect(maskGuestName('John Smith', '2026-07-10', TODAY)).toBe('[Guest]')
  })

  it('returns full name for same-day checkout (checkOut === today)', () => {
    expect(maskGuestName('John Smith', TODAY, TODAY)).toBe('John Smith')
  })

  it('returns full name for upcoming/active reservation (checkOut > today)', () => {
    expect(maskGuestName('Jane Doe', '2026-08-05', TODAY)).toBe('Jane Doe')
  })
})

// ─── fetchOwnerReservations ───────────────────────────────────────────────────

describe('fetchOwnerReservations', () => {
  beforeEach(() => {
    jest.resetAllMocks()
  })

  it('returns empty summary when properties array is empty', async () => {
    const result = await fetchOwnerReservations({
      ...BASE_INPUT,
      properties: [],
    })
    expect(result.reservations).toEqual([])
    expect(result.portfolio.totalReservations).toBe(0)
    expect(result.portfolio.revenueEur).toBeNull()
    expect(mockAuditProperty).not.toHaveBeenCalled()
  })

  it('active reservation preserves full guest name', async () => {
    mockAuditProperty.mockResolvedValueOnce(
      makePropertyAuditResult([
        makeReservation({ guestName: 'Alice Active', checkOut: '2026-08-10' }),
      ]),
    )
    const result = await fetchOwnerReservations(BASE_INPUT)
    expect(result.reservations[0].guestName).toBe('Alice Active')
  })

  it('upcoming reservation preserves full guest name', async () => {
    mockAuditProperty.mockResolvedValueOnce(
      makePropertyAuditResult([
        makeReservation({ guestName: 'Bob Future', checkOut: '2026-09-01' }),
      ]),
    )
    const result = await fetchOwnerReservations(BASE_INPUT)
    expect(result.reservations[0].guestName).toBe('Bob Future')
  })

  it('historical reservation anonymises to "[Guest]"', async () => {
    mockAuditProperty.mockResolvedValueOnce(
      makePropertyAuditResult([
        makeReservation({ guestName: 'Carol Historic', checkOut: '2026-07-10' }),
      ]),
    )
    const result = await fetchOwnerReservations(BASE_INPUT)
    expect(result.reservations[0].guestName).toBe('[Guest]')
  })

  it('null guest name remains null', async () => {
    mockAuditProperty.mockResolvedValueOnce(
      makePropertyAuditResult([
        makeReservation({ guestName: null, checkOut: '2026-08-10' }),
      ]),
    )
    const result = await fetchOwnerReservations(BASE_INPUT)
    expect(result.reservations[0].guestName).toBeNull()
  })

  it('preserves authoritative payout amount as revenueEur string', async () => {
    mockAuditProperty.mockResolvedValueOnce(
      makePropertyAuditResult([
        makeReservation({ payoutAmount: 850.50, checkOut: '2026-08-10' }),
      ], { payoutAmount: 850.50 }),
    )
    const result = await fetchOwnerReservations(BASE_INPUT)
    // Payout preserved exactly — no arithmetic
    expect(result.reservations[0].revenueEur).toBe('850.5')
    // Portfolio total from engine summary, not per-reservation sum
    expect(result.portfolio.revenueEur).toBe('850.5')
  })

  it('revenueEur is null when payout amount is null (G3-9: explicit unavailability)', async () => {
    mockAuditProperty.mockResolvedValueOnce(
      makePropertyAuditResult([
        makeReservation({ payoutAmount: null, checkOut: '2026-08-10' }),
      ], { payoutAmount: null }),
    )
    const result = await fetchOwnerReservations(BASE_INPUT)
    expect(result.reservations[0].revenueEur).toBeNull()
    expect(result.portfolio.revenueEur).toBeNull()
  })

  it('cancelled reservation maps to "cancelled" status', async () => {
    mockAuditProperty.mockResolvedValueOnce(
      makePropertyAuditResult([
        makeReservation({ status: 'cancelled', checkOut: '2026-08-10' }),
      ], { cancellations: 1 }),
    )
    const result = await fetchOwnerReservations(BASE_INPUT)
    expect(result.reservations[0].status).toBe('cancelled')
    expect(result.portfolio.cancellations).toBe(1)
  })

  it('internal audit fields are absent from output (G3-10: no internal fields)', async () => {
    mockAuditProperty.mockResolvedValueOnce(
      makePropertyAuditResult([
        makeReservation({ checkOut: '2026-08-10' }),
      ]),
    )
    const result = await fetchOwnerReservations(BASE_INPUT)
    const row = result.reservations[0]
    // Internal Hostaway Audit fields must not appear in owner-facing DTO
    expect(row).not.toHaveProperty('auditState')
    expect(row).not.toHaveProperty('aggregatePeriodId')
    expect(row).not.toHaveProperty('matchedTransactionIds')
    expect(row).not.toHaveProperty('financials')
    expect(row).not.toHaveProperty('difference')
    expect(row).not.toHaveProperty('hostawayReservationId')
    expect(row).not.toHaveProperty('hostawayPropertyId')
  })

  it('returns empty summary when auditProperty returns success=false (unmapped property)', async () => {
    mockAuditProperty.mockResolvedValueOnce(
      makePropertyAuditResult([], { success: false, error: 'No approved mapping found' }),
    )
    const result = await fetchOwnerReservations(BASE_INPUT)
    expect(result.reservations).toEqual([])
    expect(result.portfolio.totalReservations).toBe(0)
  })

  it('returns empty summary when auditProperty throws (service fault)', async () => {
    mockAuditProperty.mockRejectedValueOnce(new Error('[TEST] network failure'))
    const result = await fetchOwnerReservations(BASE_INPUT)
    expect(result.reservations).toEqual([])
    expect(result.portfolio.revenueEur).toBeNull()
  })

  it('source is always "hostaway" for all reservation rows', async () => {
    mockAuditProperty.mockResolvedValueOnce(
      makePropertyAuditResult([
        makeReservation({ checkOut: '2026-08-10' }),
      ]),
    )
    const result = await fetchOwnerReservations(BASE_INPUT)
    expect(result.reservations[0].source).toBe('hostaway')
  })
})
