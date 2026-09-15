/**
 * @module partner-settlement/external-partner/aviHostawayStays
 * @description Certified Hostaway stay ledger for the Avi partner report.
 *
 * Yossi 2026-09-08: income is the printed Net Owner Payout from two owner
 * statements, unioned with no double count. Statement P1 covers
 * 2025-08-04–2026-09-08 (26 stays, €34,614.17). Statement P2 covers
 * 2025-07-01–2026-08-05 and is used only for the three July 2025 stays that
 * pre-date P1 (€3,514.70). The 23 stays present in both carry identical
 * printed NTO, so the overlap is exact.
 *
 * Totals here are summed from the rows, never asserted. Tax components are not
 * reconstructed and are not displayed.
 *
 * Reservation 47817104 (2025-11-16) is NOT a stay: Hostaway status
 * `inquiryNotPossible`, source `rtb`, payment status Unknown, no confirmation
 * code and no finance record. It is recorded here as an explicit exclusion so
 * the absence is evidenced rather than silent.
 */

import { roundEur } from './roundEur'

/** Which printed owner statement is the authority for a stay's payout. */
export type AviStatementSource = 'P1' | 'P2'

export interface AviHostawayStay {
  readonly reservationId: string
  readonly channel: string
  readonly checkIn: string
  readonly checkOut: string
  readonly nights: number
  readonly printedNtoEur: number
  readonly statementSource: AviStatementSource
}

export const AVI_STATEMENT_PERIODS: Readonly<Record<AviStatementSource, string>> = Object.freeze({
  P1: '2025-08-04 – 2026-09-08',
  P2: '2025-07-01 – 2026-08-05',
})

/** Printed Net Owner Payout per completed stay, by check-in date. */
export const AVI_HOSTAWAY_STAYS: readonly AviHostawayStay[] = Object.freeze([
  { reservationId: '45281078', channel: 'Airbnb', checkIn: '2025-07-21', checkOut: '2025-07-25', nights: 4, printedNtoEur: 997.68, statementSource: 'P2' },
  { reservationId: '45546499', channel: 'Airbnb', checkIn: '2025-07-26', checkOut: '2025-07-31', nights: 5, printedNtoEur: 1267.45, statementSource: 'P2' },
  { reservationId: '45071950', channel: 'Airbnb', checkIn: '2025-07-31', checkOut: '2025-08-06', nights: 6, printedNtoEur: 1249.57, statementSource: 'P2' },
  { reservationId: '45099856', channel: 'Airbnb', checkIn: '2025-08-10', checkOut: '2025-08-15', nights: 5, printedNtoEur: 1021.62, statementSource: 'P1' },
  { reservationId: '46249536', channel: 'Airbnb', checkIn: '2025-08-17', checkOut: '2025-08-21', nights: 4, printedNtoEur: 1001.6, statementSource: 'P1' },
  { reservationId: '47122744', channel: 'Airbnb', checkIn: '2025-09-04', checkOut: '2025-09-10', nights: 6, printedNtoEur: 1421.39, statementSource: 'P1' },
  { reservationId: '46340130', channel: 'Direct', checkIn: '2025-09-19', checkOut: '2025-09-24', nights: 5, printedNtoEur: 1609.34, statementSource: 'P1' },
  { reservationId: '46204443', channel: 'Airbnb', checkIn: '2025-09-30', checkOut: '2025-10-04', nights: 4, printedNtoEur: 1053.78, statementSource: 'P1' },
  { reservationId: '47697219', channel: 'Airbnb', checkIn: '2025-10-04', checkOut: '2025-10-10', nights: 6, printedNtoEur: 1738.46, statementSource: 'P1' },
  { reservationId: '46189717', channel: 'Airbnb', checkIn: '2025-10-11', checkOut: '2025-10-15', nights: 4, printedNtoEur: 1053.78, statementSource: 'P1' },
  { reservationId: '45067819', channel: 'Airbnb', checkIn: '2025-10-18', checkOut: '2025-10-24', nights: 6, printedNtoEur: 1289.17, statementSource: 'P1' },
  { reservationId: '47680013', channel: 'Airbnb', checkIn: '2025-10-31', checkOut: '2025-11-03', nights: 3, printedNtoEur: 762.94, statementSource: 'P1' },
  { reservationId: '52989026', channel: 'Booking.com', checkIn: '2026-01-27', checkOut: '2026-01-31', nights: 4, printedNtoEur: 761.43, statementSource: 'P1' },
  { reservationId: '54614231', channel: 'Booking.com', checkIn: '2026-02-28', checkOut: '2026-03-01', nights: 1, printedNtoEur: 177.1, statementSource: 'P1' },
  { reservationId: '53148211', channel: 'Booking.com', checkIn: '2026-03-30', checkOut: '2026-04-06', nights: 7, printedNtoEur: 1647.26, statementSource: 'P1' },
  { reservationId: '56961453', channel: 'Booking.com', checkIn: '2026-04-14', checkOut: '2026-04-17', nights: 3, printedNtoEur: 507.9, statementSource: 'P1' },
  { reservationId: '54429653', channel: 'Booking.com', checkIn: '2026-05-20', checkOut: '2026-05-25', nights: 5, printedNtoEur: 1277.32, statementSource: 'P1' },
  { reservationId: '57337399', channel: 'Booking.com', checkIn: '2026-05-29', checkOut: '2026-06-01', nights: 3, printedNtoEur: 661.78, statementSource: 'P1' },
  { reservationId: '57885547', channel: 'Booking.com', checkIn: '2026-06-03', checkOut: '2026-06-06', nights: 3, printedNtoEur: 610.79, statementSource: 'P1' },
  { reservationId: '60597534', channel: 'Booking.com', checkIn: '2026-06-07', checkOut: '2026-06-14', nights: 7, printedNtoEur: 1323.98, statementSource: 'P1' },
  { reservationId: '58738514', channel: 'Booking.com', checkIn: '2026-06-16', checkOut: '2026-06-23', nights: 7, printedNtoEur: 1473.3, statementSource: 'P1' },
  { reservationId: '59051397', channel: 'Booking.com', checkIn: '2026-06-28', checkOut: '2026-07-07', nights: 9, printedNtoEur: 2081.28, statementSource: 'P1' },
  { reservationId: '60265487', channel: 'Airbnb', checkIn: '2026-07-10', checkOut: '2026-07-21', nights: 11, printedNtoEur: 3110.91, statementSource: 'P1' },
  { reservationId: '58591403', channel: 'Booking.com', checkIn: '2026-07-24', checkOut: '2026-07-27', nights: 3, printedNtoEur: 764.78, statementSource: 'P1' },
  { reservationId: '53452135', channel: 'Booking.com', checkIn: '2026-07-30', checkOut: '2026-08-02', nights: 3, printedNtoEur: 1025.3, statementSource: 'P1' },
  { reservationId: '60931110', channel: 'Airbnb', checkIn: '2026-08-04', checkOut: '2026-08-08', nights: 4, printedNtoEur: 1513.81, statementSource: 'P1' },
  { reservationId: '48168608', channel: 'Airbnb', checkIn: '2026-08-08', checkOut: '2026-08-15', nights: 7, printedNtoEur: 1806.32, statementSource: 'P1' },
  { reservationId: '53139113', channel: 'Airbnb', checkIn: '2026-08-15', checkOut: '2026-08-29', nights: 14, printedNtoEur: 4420.46, statementSource: 'P1' },
  { reservationId: '65733679', channel: 'Airbnb', checkIn: '2026-09-03', checkOut: '2026-09-06', nights: 3, printedNtoEur: 498.37, statementSource: 'P1' },
])

export interface AviExcludedReservation {
  readonly reservationId: string
  readonly channel: string
  readonly checkIn: string
  readonly nights: number
  readonly hostawayStatus: string
  readonly reason: string
}

/**
 * Records in the reporting window that are not completed stays. They earn no
 * payout, no night count and no guest-consumables charge.
 */
export const AVI_EXCLUDED_RESERVATIONS: readonly AviExcludedReservation[] = Object.freeze([
  {
    reservationId: '47817104',
    channel: 'Booking.com',
    checkIn: '2025-11-16',
    nights: 3,
    hostawayStatus: 'inquiryNotPossible',
    reason:
      'Request to book that was never accepted: source rtb, payment status Unknown, no confirmation code, no finance record, absent from both printed statements.',
  },
])

export const AVI_REPORT_CUTOFF_DATE = '2026-09-08'

/** Latest completed-stay checkout included in the certified Hostaway union. */
export const AVI_HOSTAWAY_LAST_CHECKOUT_DATE = AVI_HOSTAWAY_STAYS.reduce(
  (latest, stay) => (stay.checkOut > latest ? stay.checkOut : latest),
  AVI_HOSTAWAY_STAYS[0].checkOut,
)

export const AVI_HOSTAWAY_STAY_COUNT = AVI_HOSTAWAY_STAYS.length

export const AVI_HOSTAWAY_NIGHTS = AVI_HOSTAWAY_STAYS.reduce((s, r) => s + r.nights, 0)

export const AVI_HOSTAWAY_UNION_NTO_EUR = roundEur(
  AVI_HOSTAWAY_STAYS.reduce((s, r) => s + r.printedNtoEur, 0),
)

export const AVI_HOSTAWAY_P1_NTO_EUR = roundEur(
  AVI_HOSTAWAY_STAYS.filter((r) => r.statementSource === 'P1').reduce((s, r) => s + r.printedNtoEur, 0),
)

export const AVI_HOSTAWAY_P2_TOPUP_NTO_EUR = roundEur(
  AVI_HOSTAWAY_STAYS.filter((r) => r.statementSource === 'P2').reduce((s, r) => s + r.printedNtoEur, 0),
)

export function aviStayCheckInMonth(stay: AviHostawayStay): string {
  return stay.checkIn.slice(0, 7)
}

export interface AviStayMonthGroup {
  readonly month: string
  readonly stays: readonly AviHostawayStay[]
  readonly nights: number
  readonly printedNtoEur: number
}

/**
 * Completed stays grouped by check-in month. Nights and payout follow check-in,
 * so a stay that spans a month boundary is reported once, in its arrival month.
 *
 * Grouping uses a plain record, not a Map: the build target is ES5 without
 * `downlevelIteration`, where spreading a Map iterator compiles to an empty
 * array under the Jest transform.
 */
export function aviStaysByCheckInMonth(): readonly AviStayMonthGroup[] {
  const byMonth: Record<string, AviHostawayStay[]> = {}
  const months: string[] = []
  for (const stay of AVI_HOSTAWAY_STAYS) {
    const key = aviStayCheckInMonth(stay)
    if (byMonth[key] === undefined) {
      byMonth[key] = []
      months.push(key)
    }
    byMonth[key].push(stay)
  }
  return months
    .sort((a, b) => a.localeCompare(b))
    .map((month) => {
      const stays = byMonth[month]
      return {
        month,
        stays,
        nights: stays.reduce((s, r) => s + r.nights, 0),
        printedNtoEur: roundEur(stays.reduce((s, r) => s + r.printedNtoEur, 0)),
      }
    })
}

/** A reservation id may be counted at most once across the two statements. */
export function aviDuplicateStayIds(): string[] {
  const seen: Record<string, true> = {}
  const dupes: string[] = []
  for (const stay of AVI_HOSTAWAY_STAYS) {
    if (seen[stay.reservationId]) dupes.push(stay.reservationId)
    seen[stay.reservationId] = true
  }
  return dupes
}
