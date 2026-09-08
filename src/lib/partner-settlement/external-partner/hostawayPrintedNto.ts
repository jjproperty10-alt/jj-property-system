/**
 * @module partner-settlement/external-partner/hostawayPrintedNto
 * @description Certified Hostaway rental-income credits for the Avi partner report.
 *
 * Yossi 2026-09-05: partner-report Hostaway credit uses the printed Net Owner
 * Payout, not a reconstruction of tax components. Tax lines of €190.35 or
 * €380.70 are not displayed or certified while they are not printed separately.
 *
 * Yossi 2026-09-08: the credit is the union of both printed owner statements.
 * The stay ledger lives in `aviHostawayStays`; totals here are summed from it
 * so a change to a stay moves the credit rather than silently disagreeing
 * with it.
 *
 * Direct stay 46340130 (19/09/2025) is taken from the Hostaway Accountant /
 * Owner Statement for 2025-09-01–2025-09-30 (issued 2026-09-05): NTO €1,609.34.
 * Avi 50% = €804.67.
 */

import { roundEur } from './roundEur'
import type { AviReportAirbnbCredits } from './externalPartnerAviReportTypes'
import {
  AVI_HOSTAWAY_NIGHTS,
  AVI_HOSTAWAY_P1_NTO_EUR,
  AVI_HOSTAWAY_P2_TOPUP_NTO_EUR,
  AVI_HOSTAWAY_STAY_COUNT,
  AVI_HOSTAWAY_STAYS,
  AVI_HOSTAWAY_UNION_NTO_EUR,
} from './aviHostawayStays'

export const HOSTAWAY_PRINTED_DIRECT_STAY_ID = '46340130'

const directStay = AVI_HOSTAWAY_STAYS.find((s) => s.reservationId === HOSTAWAY_PRINTED_DIRECT_STAY_ID)
if (!directStay) {
  throw new Error('certified_direct_stay_missing_from_stay_ledger')
}

export const HOSTAWAY_PRINTED_DIRECT_STAY = Object.freeze({
  reservationId: HOSTAWAY_PRINTED_DIRECT_STAY_ID,
  checkIn: directStay.checkIn,
  checkOut: directStay.checkOut,
  channel: 'Booking Engine',
  guestName: 'Tomer Niazof',
  listing: 'TM20-TelMar "Royal Villa"',
  printedNtoEur: directStay.printedNtoEur,
  aviShareEur: roundEur(directStay.printedNtoEur / 2),
  source:
    'Hostaway Accountant/Owner Statement 2025-09-01–2025-09-30, issued 2026-09-05, Net Owner Payout column',
})

/** Union of both printed owner statements, summed from the stay ledger. */
export const HOSTAWAY_PRINTED_NTO_TOTAL_EUR = AVI_HOSTAWAY_UNION_NTO_EUR

/** Printed NTO of included Hostaway stays other than 46340130. */
export const HOSTAWAY_PRINTED_OTHER_NTO_EUR = roundEur(
  HOSTAWAY_PRINTED_NTO_TOTAL_EUR - HOSTAWAY_PRINTED_DIRECT_STAY.printedNtoEur,
)

/** Statement covering 2025-08-04–2026-09-08. */
export const HOSTAWAY_STATEMENT_P1_NTO_EUR = AVI_HOSTAWAY_P1_NTO_EUR
/** Stays only in the 2025-07-01–2026-08-05 statement (July 2025). */
export const HOSTAWAY_STATEMENT_P2_TOPUP_NTO_EUR = AVI_HOSTAWAY_P2_TOPUP_NTO_EUR

export const HOSTAWAY_COMPLETED_STAY_COUNT = AVI_HOSTAWAY_STAY_COUNT
export const HOSTAWAY_COMPLETED_NIGHTS = AVI_HOSTAWAY_NIGHTS

export const HOSTAWAY_PRINTED_AVI_SHARE_EUR = roundEur(HOSTAWAY_PRINTED_NTO_TOTAL_EUR * 0.5)

export const HOSTAWAY_PRINTED_OTHER_AVI_SHARE_EUR = roundEur(
  HOSTAWAY_PRINTED_AVI_SHARE_EUR - HOSTAWAY_PRINTED_DIRECT_STAY.aviShareEur,
)

/** Private booking income already on the JJ ledger (Avi 50% of €1,360). */
export const PRIVATE_BOOKING_INCOME_TOTAL_EUR = 1_360
export const PRIVATE_BOOKING_AVI_CREDIT_EUR = roundEur(PRIVATE_BOOKING_INCOME_TOTAL_EUR / 2)

export const AVI_AIRBNB_INCOME_TOTAL_EUR = roundEur(
  PRIVATE_BOOKING_INCOME_TOTAL_EUR + HOSTAWAY_PRINTED_NTO_TOTAL_EUR,
)

export const AVI_TOTAL_INCOME_CREDIT_EUR = roundEur(
  PRIVATE_BOOKING_AVI_CREDIT_EUR + HOSTAWAY_PRINTED_AVI_SHARE_EUR,
)

export function composeAviAirbnbCredits(): AviReportAirbnbCredits {
  return {
    privateBookingTotalEur: PRIVATE_BOOKING_INCOME_TOTAL_EUR,
    privateBookingAviEur: PRIVATE_BOOKING_AVI_CREDIT_EUR,
    hostawayPrintedNtoTotalEur: HOSTAWAY_PRINTED_NTO_TOTAL_EUR,
    hostawayAviEur: HOSTAWAY_PRINTED_AVI_SHARE_EUR,
    otherHostawayPrintedNtoEur: HOSTAWAY_PRINTED_OTHER_NTO_EUR,
    otherHostawayAviEur: HOSTAWAY_PRINTED_OTHER_AVI_SHARE_EUR,
    totalAviEur: AVI_TOTAL_INCOME_CREDIT_EUR,
    completedStayCount: HOSTAWAY_COMPLETED_STAY_COUNT,
    completedNights: HOSTAWAY_COMPLETED_NIGHTS,
    statementP1NtoEur: HOSTAWAY_STATEMENT_P1_NTO_EUR,
    statementP2TopUpNtoEur: HOSTAWAY_STATEMENT_P2_TOPUP_NTO_EUR,
    certifiedDirectStay: {
      reservationId: HOSTAWAY_PRINTED_DIRECT_STAY.reservationId,
      checkIn: HOSTAWAY_PRINTED_DIRECT_STAY.checkIn,
      channel: HOSTAWAY_PRINTED_DIRECT_STAY.channel,
      guestName: HOSTAWAY_PRINTED_DIRECT_STAY.guestName,
      printedNtoEur: HOSTAWAY_PRINTED_DIRECT_STAY.printedNtoEur,
      aviShareEur: HOSTAWAY_PRINTED_DIRECT_STAY.aviShareEur,
      source: HOSTAWAY_PRINTED_DIRECT_STAY.source,
    },
  }
}
