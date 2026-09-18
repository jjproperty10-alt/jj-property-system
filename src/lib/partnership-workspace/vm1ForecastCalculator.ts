/**
 * VM1 staff forecast calculator — Hostaway owner-statement chain, VM1-only.
 *
 * Internal forecast. Not a Draft, Certified report, settlement, or cash receipt.
 * Does not import owner-STR statement builders (those are not partnership authority).
 *
 * Occupancy tax in this forecast is Hostaway's 9% statement column, not 19% JJ VAT.
 * Booking rows with no expected payout stay non-calculable.
 */

import { VM1_HOSTAWAY_LISTING_ID, VM1_NEW_PERIOD_START } from './vm1Identity'
import type { Vm1ReservationDisposition, Vm1ReservationRow } from './vm1IdentityAdapter'

/** Hostaway owner-statement occupancy tax rate (not company VAT). */
export const VM1_FORECAST_OCCUPANCY_TAX_RATE = 0.09 as const

/** Approved VM1 partnership management rate. */
export const VM1_FORECAST_MANAGEMENT_RATE = 0.2 as const

/** Exact fail-closed reasons. Do not clamp, rewrite, or fall back to totalPrice. */
export const VM1_FORECAST_BLOCK_REASON = {
  totalPrice: 'totalPrice must be a non-negative finite number. Do not use totalPrice as a payout fallback.',
  cleaningFee: 'cleaningFee must be a non-negative finite number.',
  expectedPayout:
    'expectedPayout must be a non-negative finite number. Do not use totalPrice as a payout fallback.',
  cleaningExceedsTotal: 'cleaningFee exceeds totalPrice.',
  accommodationNegative: 'accommodationBeforeTax is negative.',
  payoutExceedsGross: 'expectedPayout exceeds forecast gross rental revenue.',
  platformFeeNegative: 'derived platform fee is negative.',
  managementBaseNegative: 'managementBase is negative.',
  intermediate: (field: string) => `${field} is not a non-negative finite EUR value.`,
} as const

export function roundEur(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function failClosed(reason: string): { readonly ok: false; readonly reason: string } {
  return { ok: false, reason }
}

function requireRoundedEur(
  value: number,
  field: string,
): { readonly ok: true; readonly value: number } | { readonly ok: false; readonly reason: string } {
  const rounded = roundEur(value)
  if (!isNonNegativeFiniteNumber(rounded)) {
    return failClosed(VM1_FORECAST_BLOCK_REASON.intermediate(field))
  }
  return { ok: true, value: rounded }
}

export type Vm1ForecastRecognitionState =
  | 'excluded'
  | 'needs_review'
  | 'blocked'
  | 'forecast'
  | 'completed_pending_reconciliation'

export interface Vm1ForecastAmounts {
  readonly grossRentalRevenue: number | null
  readonly platformFees: number | null
  readonly guestCleaning: number | null
  readonly totalTaxes: number | null
  readonly managementBase: number | null
  readonly jjManagementCharge: number | null
  readonly propertyNet: number | null
}

export interface Vm1ForecastLine extends Vm1ForecastAmounts {
  readonly externalId: string
  readonly channel: string | null
  readonly status: string
  readonly checkIn: string | null
  readonly checkOut: string | null
  readonly listingId: string
  readonly operationalDisposition: Vm1ReservationDisposition
  readonly recognitionState: Vm1ForecastRecognitionState
  readonly calculable: boolean
  readonly blockedReason: string | null
}

export interface Vm1ForecastCalculatorInput {
  readonly asOfIso: string
  readonly newPeriodStart?: string
}

const EMPTY_AMOUNTS: Vm1ForecastAmounts = {
  grossRentalRevenue: null,
  platformFees: null,
  guestCleaning: null,
  totalTaxes: null,
  managementBase: null,
  jjManagementCharge: null,
  propertyNet: null,
}

function channelKey(channel: string | null): string {
  return (channel ?? '').trim().toLowerCase()
}

function isAirbnb(channel: string | null): boolean {
  const c = channelKey(channel)
  return c === 'airbnb' || c === 'airbnbofficial'
}

function isBooking(channel: string | null): boolean {
  const c = channelKey(channel)
  return c === 'booking' || c === 'booking.com' || c === 'bookingcom'
}

/**
 * Hostaway OWNER_MINIMAL presentation of Airbnb stays with a proven payout:
 * occupancy tax and gross are 9% of (total_price − cleaning), platform is
 * restated so Gross − Platform = expected_payout, then the 20% chain.
 */
export function forecastAirbnbOwnerStatementAmounts(input: {
  readonly totalPrice: number | null
  readonly cleaningFee: number | null
  readonly expectedPayout: number | null
}): { readonly ok: true; readonly amounts: Vm1ForecastAmounts } | { readonly ok: false; readonly reason: string } {
  if (!isNonNegativeFiniteNumber(input.totalPrice)) {
    return failClosed(VM1_FORECAST_BLOCK_REASON.totalPrice)
  }
  if (!isNonNegativeFiniteNumber(input.cleaningFee)) {
    return failClosed(VM1_FORECAST_BLOCK_REASON.cleaningFee)
  }
  if (!isNonNegativeFiniteNumber(input.expectedPayout)) {
    return failClosed(VM1_FORECAST_BLOCK_REASON.expectedPayout)
  }

  const totalPrice = input.totalPrice
  const cleaningFee = input.cleaningFee
  const expectedPayout = input.expectedPayout

  if (cleaningFee > totalPrice) {
    return failClosed(VM1_FORECAST_BLOCK_REASON.cleaningExceedsTotal)
  }

  const accommodationRaw = totalPrice - cleaningFee
  if (!Number.isFinite(accommodationRaw) || accommodationRaw < 0) {
    return failClosed(VM1_FORECAST_BLOCK_REASON.accommodationNegative)
  }
  const accommodation = requireRoundedEur(accommodationRaw, 'accommodationBeforeTax')
  if (!accommodation.ok) return accommodation
  if (accommodation.value < 0) {
    return failClosed(VM1_FORECAST_BLOCK_REASON.accommodationNegative)
  }

  const guestCleaning = requireRoundedEur(cleaningFee, 'guestCleaning')
  if (!guestCleaning.ok) return guestCleaning

  const totalTaxes = requireRoundedEur(
    accommodation.value * VM1_FORECAST_OCCUPANCY_TAX_RATE,
    'totalTaxes',
  )
  if (!totalTaxes.ok) return totalTaxes

  const grossRentalRevenue = requireRoundedEur(
    accommodation.value * (1 + VM1_FORECAST_OCCUPANCY_TAX_RATE),
    'grossRentalRevenue',
  )
  if (!grossRentalRevenue.ok) return grossRentalRevenue

  if (expectedPayout > grossRentalRevenue.value) {
    return failClosed(VM1_FORECAST_BLOCK_REASON.payoutExceedsGross)
  }

  const platformRaw = grossRentalRevenue.value - expectedPayout
  if (!Number.isFinite(platformRaw)) {
    return failClosed(VM1_FORECAST_BLOCK_REASON.intermediate('platformFees'))
  }
  if (platformRaw < 0) {
    return failClosed(VM1_FORECAST_BLOCK_REASON.platformFeeNegative)
  }
  const platformFees = requireRoundedEur(platformRaw, 'platformFees')
  if (!platformFees.ok) return platformFees
  if (platformFees.value < 0) {
    return failClosed(VM1_FORECAST_BLOCK_REASON.platformFeeNegative)
  }

  const managementBaseRaw =
    grossRentalRevenue.value - platformFees.value - guestCleaning.value - totalTaxes.value
  if (!Number.isFinite(managementBaseRaw)) {
    return failClosed(VM1_FORECAST_BLOCK_REASON.intermediate('managementBase'))
  }
  if (managementBaseRaw < 0) {
    return failClosed(VM1_FORECAST_BLOCK_REASON.managementBaseNegative)
  }
  const managementBase = requireRoundedEur(managementBaseRaw, 'managementBase')
  if (!managementBase.ok) return managementBase
  if (managementBase.value < 0) {
    return failClosed(VM1_FORECAST_BLOCK_REASON.managementBaseNegative)
  }

  const jjManagementCharge = requireRoundedEur(
    managementBase.value * VM1_FORECAST_MANAGEMENT_RATE,
    'jjManagementCharge',
  )
  if (!jjManagementCharge.ok) return jjManagementCharge

  const propertyNet = requireRoundedEur(
    managementBase.value - jjManagementCharge.value,
    'propertyNet',
  )
  if (!propertyNet.ok) return propertyNet

  return {
    ok: true,
    amounts: {
      grossRentalRevenue: grossRentalRevenue.value,
      platformFees: platformFees.value,
      guestCleaning: guestCleaning.value,
      totalTaxes: totalTaxes.value,
      managementBase: managementBase.value,
      jjManagementCharge: jjManagementCharge.value,
      propertyNet: propertyNet.value,
    },
  }
}

function recognitionAfterGates(
  row: Vm1ReservationRow,
  asOfIso: string,
): Exclude<Vm1ForecastRecognitionState, 'excluded' | 'needs_review' | 'blocked'> {
  const checkOut = row.checkOut
  if (checkOut != null && checkOut < asOfIso) return 'completed_pending_reconciliation'
  return 'forecast'
}

export function forecastVm1Reservation(
  row: Vm1ReservationRow,
  input: Vm1ForecastCalculatorInput,
): Vm1ForecastLine {
  const newPeriodStart = input.newPeriodStart ?? VM1_NEW_PERIOD_START
  const base = {
    externalId: row.externalId,
    channel: row.channel,
    status: row.status,
    checkIn: row.checkIn,
    checkOut: row.checkOut,
    listingId: row.listingId,
    operationalDisposition: row.disposition,
  }

  const blocked = (recognitionState: Vm1ForecastRecognitionState, blockedReason: string): Vm1ForecastLine => ({
    ...base,
    ...EMPTY_AMOUNTS,
    recognitionState,
    calculable: false,
    blockedReason,
  })

  if (row.listingId !== VM1_HOSTAWAY_LISTING_ID) {
    return blocked('needs_review', 'Listing is not VM1 Hostaway listing 412148.')
  }
  if (row.disposition === 'already_certified') {
    return blocked('excluded', 'Already certified; never included in the new-period forecast.')
  }
  if (row.disposition === 'excluded') {
    return blocked('excluded', row.reason)
  }
  if (row.checkIn == null || row.checkIn < newPeriodStart) {
    return blocked('excluded', `Check-in is before new-period start ${newPeriodStart}.`)
  }
  if (row.disposition === 'needs_review' || row.status.toLowerCase() === 'modified') {
    return blocked('needs_review', 'Modified or unverified status is not forecast-calculable.')
  }

  if (isBooking(row.channel)) {
    return blocked(
      'blocked',
      'Booking payout/tax are UNKNOWN on the Hostaway reservation feed. Forecast totals stay blocked.',
    )
  }

  if (!isAirbnb(row.channel)) {
    return blocked('blocked', `Channel '${row.channel ?? 'unknown'}' has no VM1 forecast payout evidence.`)
  }

  const computed = forecastAirbnbOwnerStatementAmounts({
    totalPrice: row.totalPrice,
    cleaningFee: row.cleaningFee,
    expectedPayout: row.expectedPayout,
  })
  if (!computed.ok) {
    return blocked('blocked', computed.reason)
  }

  const recognitionState = recognitionAfterGates(row, input.asOfIso)
  return {
    ...base,
    ...computed.amounts,
    recognitionState,
    calculable: true,
    blockedReason: null,
  }
}

export function forecastVm1Reservations(
  rows: readonly Vm1ReservationRow[],
  input: Vm1ForecastCalculatorInput,
): readonly Vm1ForecastLine[] {
  return rows.map((row) => forecastVm1Reservation(row, input))
}
