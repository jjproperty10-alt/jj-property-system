import {
  forecastAirbnbOwnerStatementAmounts,
  forecastVm1Reservation,
  forecastVm1Reservations,
  roundEur,
  VM1_FORECAST_BLOCK_REASON,
  VM1_FORECAST_MANAGEMENT_RATE,
  VM1_FORECAST_OCCUPANCY_TAX_RATE,
} from '../vm1ForecastCalculator'
import { VM1_HOSTAWAY_LISTING_ID } from '../vm1Identity'
import type { Vm1ForecastLine } from '../vm1ForecastCalculator'
import type { Vm1ReservationRow } from '../vm1IdentityAdapter'

const AS_OF = '2026-09-17'

function expectEmptyAmounts(line: Vm1ForecastLine) {
  expect(line.calculable).toBe(false)
  expect(line.grossRentalRevenue).toBeNull()
  expect(line.platformFees).toBeNull()
  expect(line.guestCleaning).toBeNull()
  expect(line.totalTaxes).toBeNull()
  expect(line.managementBase).toBeNull()
  expect(line.jjManagementCharge).toBeNull()
  expect(line.propertyNet).toBeNull()
}

function airbnbRow(overrides: Partial<Vm1ReservationRow> = {}): Vm1ReservationRow {
  return {
    externalId: '65733679',
    listingId: VM1_HOSTAWAY_LISTING_ID,
    channel: 'airbnb',
    status: 'confirmed',
    checkIn: '2026-09-03',
    checkOut: '2026-09-06',
    nights: 3,
    totalPrice: 1005.9,
    cleaningFee: 150,
    hostServiceFee: 155.91,
    expectedPayout: 849.99,
    taxAmount: 0,
    paymentStatus: 'Paid',
    cancellationDate: null,
    disposition: 'operational_candidate',
    reason: 'Confirmed stay with check-in on or after the new-period start.',
    ...overrides,
  }
}

describe('roundEur', () => {
  it('uses exact EUR cent rounding', () => {
    expect(roundEur(855.9 * 1.09)).toBe(932.93)
    expect(roundEur(855.9 * 0.09)).toBe(77.03)
    expect(roundEur(622.96 * 0.2)).toBe(124.59)
  })
})

describe('forecastAirbnbOwnerStatementAmounts — OWNER_MINIMAL fixtures (tests only)', () => {
  it('matches PDF 65733679', () => {
    const res = forecastAirbnbOwnerStatementAmounts({
      totalPrice: 1005.9,
      cleaningFee: 150,
      expectedPayout: 849.99,
    })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.amounts.grossRentalRevenue).toBe(932.93)
    expect(res.amounts.platformFees).toBe(82.94)
    expect(res.amounts.guestCleaning).toBe(150)
    expect(res.amounts.totalTaxes).toBe(77.03)
    expect(res.amounts.jjManagementCharge).toBe(124.59)
    expect(res.amounts.propertyNet).toBe(498.37)
    expect(res.amounts.managementBase).toBe(622.96)
  })

  it('matches PDF 64232458', () => {
    const res = forecastAirbnbOwnerStatementAmounts({
      totalPrice: 2346,
      cleaningFee: 150,
      expectedPayout: 1982.37,
    })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.amounts.grossRentalRevenue).toBe(2393.64)
    expect(res.amounts.platformFees).toBe(411.27)
    expect(res.amounts.guestCleaning).toBe(150)
    expect(res.amounts.totalTaxes).toBe(197.64)
    expect(res.amounts.jjManagementCharge).toBe(326.95)
    expect(res.amounts.propertyNet).toBe(1307.78)
  })

  it('does not treat total price as net and does not add 19% company VAT', () => {
    const res = forecastAirbnbOwnerStatementAmounts({
      totalPrice: 1005.9,
      cleaningFee: 150,
      expectedPayout: 849.99,
    })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.amounts.propertyNet).not.toBe(1005.9)
    expect(res.amounts.propertyNet).not.toBe(849.99)
    expect(VM1_FORECAST_OCCUPANCY_TAX_RATE).toBe(0.09)
    expect(VM1_FORECAST_MANAGEMENT_RATE).toBe(0.2)
    expect(res.amounts.totalTaxes).not.toBe(roundEur(849.99 * 0.19))
    expect(res.amounts.jjManagementCharge).not.toBe(roundEur(res.amounts.jjManagementCharge! * 1.19))
  })

  it('fails closed when cleaning cannot be isolated', () => {
    const res = forecastAirbnbOwnerStatementAmounts({
      totalPrice: 100,
      cleaningFee: 150,
      expectedPayout: 80,
    })
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.reason).toBe(VM1_FORECAST_BLOCK_REASON.cleaningExceedsTotal)
  })

  it('fails closed when expected payout exceeds forecast gross', () => {
    const res = forecastAirbnbOwnerStatementAmounts({
      totalPrice: 1005.9,
      cleaningFee: 150,
      expectedPayout: 1000,
    })
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.reason).toBe(VM1_FORECAST_BLOCK_REASON.payoutExceedsGross)
  })
})

describe('forecastVm1Reservation', () => {
  it('marks 65733679 completed pending reconciliation as of 2026-09-17', () => {
    const line = forecastVm1Reservation(airbnbRow(), { asOfIso: AS_OF })
    expect(line.calculable).toBe(true)
    expect(line.recognitionState).toBe('completed_pending_reconciliation')
    expect(line.propertyNet).toBe(498.37)
    expect(line.blockedReason).toBeNull()
  })

  it('marks future 64232458 as forecast only', () => {
    const line = forecastVm1Reservation(
      airbnbRow({
        externalId: '64232458',
        checkIn: '2026-09-18',
        checkOut: '2026-09-22',
        nights: 4,
        totalPrice: 2346,
        cleaningFee: 150,
        hostServiceFee: 363.63,
        expectedPayout: 1982.37,
        taxAmount: 0,
      }),
      { asOfIso: AS_OF },
    )
    expect(line.recognitionState).toBe('forecast')
    expect(line.calculable).toBe(true)
    expect(line.propertyNet).toBe(1307.78)
  })

  it('blocks Booking 53082517 — does not use total_price minus commission', () => {
    const line = forecastVm1Reservation(
      airbnbRow({
        externalId: '53082517',
        channel: 'booking',
        checkIn: '2026-09-11',
        checkOut: '2026-09-13',
        nights: 2,
        totalPrice: 1218.2,
        cleaningFee: 120,
        hostServiceFee: null,
        expectedPayout: null,
        taxAmount: null,
      }),
      { asOfIso: AS_OF },
    )
    expect(line.recognitionState).toBe('blocked')
    expect(line.blockedReason).toMatch(/UNKNOWN/i)
    expectEmptyAmounts(line)
    expect(line.propertyNet).not.toBe(716.78)
  })

  it('does not calculate modified 54972355 even though a PDF fixture exists', () => {
    const line = forecastVm1Reservation(
      airbnbRow({
        externalId: '54972355',
        channel: 'booking',
        status: 'modified',
        checkIn: '2026-09-22',
        checkOut: '2026-09-26',
        nights: 4,
        totalPrice: 2365.5,
        cleaningFee: 150,
        hostServiceFee: null,
        expectedPayout: null,
        taxAmount: null,
        disposition: 'needs_review',
        reason: 'Status is modified.',
      }),
      { asOfIso: AS_OF },
    )
    expect(line.recognitionState).toBe('needs_review')
    expectEmptyAmounts(line)
    expect(line.propertyNet).not.toBe(1458.26)
  })

  it('never forecasts certified 53139113', () => {
    const line = forecastVm1Reservation(
      airbnbRow({
        externalId: '53139113',
        checkIn: '2026-08-15',
        checkOut: '2026-08-29',
        nights: 14,
        totalPrice: 7463.28,
        cleaningFee: 120,
        expectedPayout: 6306.47,
        disposition: 'already_certified',
        reason: 'Already included in the frozen certified Avi stay set; never include again.',
      }),
      { asOfIso: AS_OF },
    )
    expect(line.recognitionState).toBe('excluded')
    expectEmptyAmounts(line)
  })

  it('does not invent Airbnb amounts when payout is missing', () => {
    const line = forecastVm1Reservation(airbnbRow({ expectedPayout: null }), { asOfIso: AS_OF })
    expect(line.recognitionState).toBe('blocked')
    expect(line.blockedReason).toBe(VM1_FORECAST_BLOCK_REASON.expectedPayout)
    expectEmptyAmounts(line)
  })

  it('does not allocate partner shares', () => {
    const line = forecastVm1Reservation(airbnbRow(), { asOfIso: AS_OF })
    expect(JSON.stringify(line)).not.toContain('Avi')
    expect(JSON.stringify(line)).not.toContain('Yossi')
    expect(JSON.stringify(line)).not.toContain('Yaakov')
    expect(line.propertyNet).not.toBe(roundEur(498.37 * 0.5))
  })
})

describe('forecastVm1Reservations', () => {
  it('maps a mixed operational set without summing', () => {
    const lines = forecastVm1Reservations(
      [
        airbnbRow({
          externalId: '53139113',
          checkIn: '2026-08-15',
          disposition: 'already_certified',
          reason: 'certified',
        }),
        airbnbRow(),
        airbnbRow({
          externalId: '53082517',
          channel: 'booking',
          expectedPayout: null,
          hostServiceFee: null,
          taxAmount: null,
        }),
      ],
      { asOfIso: AS_OF },
    )
    expect(lines).toHaveLength(3)
    expect(lines.filter((l) => l.calculable)).toHaveLength(1)
    expect(lines.some((l) => l.externalId === '53139113' && l.recognitionState === 'excluded')).toBe(true)
  })
})

describe('forecastVm1Reservation — fail-closed validation', () => {
  it('excludes a cancelled reservation without amounts', () => {
    const line = forecastVm1Reservation(
      airbnbRow({
        status: 'cancelled',
        disposition: 'excluded',
        reason: 'Cancelled reservations are not revenue.',
      }),
      { asOfIso: AS_OF },
    )
    expect(line.recognitionState).toBe('excluded')
    expectEmptyAmounts(line)
  })

  it('excludes an inquiry reservation without amounts', () => {
    const line = forecastVm1Reservation(
      airbnbRow({
        status: 'inquiry',
        disposition: 'excluded',
        reason: 'Inquiry reservations are not revenue.',
      }),
      { asOfIso: AS_OF },
    )
    expect(line.recognitionState).toBe('excluded')
    expectEmptyAmounts(line)
  })

  it('blocks when cleaningFee exceeds totalPrice', () => {
    const line = forecastVm1Reservation(airbnbRow({ totalPrice: 100, cleaningFee: 150, expectedPayout: 80 }), {
      asOfIso: AS_OF,
    })
    expect(line.recognitionState).toBe('blocked')
    expect(line.blockedReason).toBe(VM1_FORECAST_BLOCK_REASON.cleaningExceedsTotal)
    expectEmptyAmounts(line)
  })

  it('blocks when expectedPayout exceeds forecast gross', () => {
    const line = forecastVm1Reservation(airbnbRow({ expectedPayout: 1000 }), { asOfIso: AS_OF })
    expect(line.recognitionState).toBe('blocked')
    expect(line.blockedReason).toBe(VM1_FORECAST_BLOCK_REASON.payoutExceedsGross)
    expectEmptyAmounts(line)
  })

  it.each([
    [{ totalPrice: -1 }, VM1_FORECAST_BLOCK_REASON.totalPrice],
    [{ cleaningFee: -5 }, VM1_FORECAST_BLOCK_REASON.cleaningFee],
    [{ expectedPayout: -10 }, VM1_FORECAST_BLOCK_REASON.expectedPayout],
  ] as const)('blocks a negative input %j', (overrides, reason) => {
    const line = forecastVm1Reservation(airbnbRow(overrides), { asOfIso: AS_OF })
    expect(line.recognitionState).toBe('blocked')
    expect(line.blockedReason).toBe(reason)
    expectEmptyAmounts(line)
  })

  it.each([
    [{ totalPrice: Number.NaN }, VM1_FORECAST_BLOCK_REASON.totalPrice],
    [{ cleaningFee: Number.POSITIVE_INFINITY }, VM1_FORECAST_BLOCK_REASON.cleaningFee],
    [{ expectedPayout: Number.NEGATIVE_INFINITY }, VM1_FORECAST_BLOCK_REASON.expectedPayout],
    [{ expectedPayout: Number.NaN }, VM1_FORECAST_BLOCK_REASON.expectedPayout],
  ] as const)('blocks a non-finite input %j', (overrides, reason) => {
    const line = forecastVm1Reservation(airbnbRow(overrides), { asOfIso: AS_OF })
    expect(line.recognitionState).toBe('blocked')
    expect(line.blockedReason).toBe(reason)
    expectEmptyAmounts(line)
  })

  it('keeps valid 65733679 and 64232458 nets unchanged', () => {
    const completed = forecastVm1Reservation(airbnbRow(), { asOfIso: AS_OF })
    expect(completed.recognitionState).toBe('completed_pending_reconciliation')
    expect(completed.calculable).toBe(true)
    expect(completed.propertyNet).toBe(498.37)

    const future = forecastVm1Reservation(
      airbnbRow({
        externalId: '64232458',
        checkIn: '2026-09-18',
        checkOut: '2026-09-22',
        nights: 4,
        totalPrice: 2346,
        cleaningFee: 150,
        hostServiceFee: 363.63,
        expectedPayout: 1982.37,
        taxAmount: 0,
      }),
      { asOfIso: AS_OF },
    )
    expect(future.recognitionState).toBe('forecast')
    expect(future.calculable).toBe(true)
    expect(future.propertyNet).toBe(1307.78)
  })
})
