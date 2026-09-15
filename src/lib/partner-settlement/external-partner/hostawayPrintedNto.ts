/**
 * @module partner-settlement/external-partner/hostawayPrintedNto
 * @description Certified Hostaway rental-income credits for the Avi partner report.
 *
 * Yossi 2026-09-05: partner-report Hostaway credit uses the printed Net Owner
 * Payout, not a reconstruction of tax components. Tax lines of €190.35 or
 * €380.70 are not displayed or certified while they are not printed separately.
 *
 * Direct stay 46340130 (19/09/2025) is taken from the Hostaway Accountant /
 * Owner Statement for 2025-09-01–2025-09-30 (issued 2026-09-05): NTO €1,609.34.
 * Avi 50% = €804.67.
 *
 * Other completed, paid Hostaway stays are the certified roll-up locked with
 * the approved Avi balance of €380.50. Production ledger writes are out of
 * scope for this module.
 */

import { roundEur } from './roundEur'
import type { AviReportAirbnbCredits } from './externalPartnerAviReportTypes'

export const HOSTAWAY_PRINTED_DIRECT_STAY_ID = '46340130'

export const HOSTAWAY_PRINTED_DIRECT_STAY = Object.freeze({
  reservationId: HOSTAWAY_PRINTED_DIRECT_STAY_ID,
  checkIn: '2025-09-19',
  checkOut: '2025-09-24',
  channel: 'Booking Engine',
  guestName: 'Tomer Niazof',
  listing: 'TM20-TelMar "Royal Villa"',
  printedNtoEur: 1609.34,
  aviShareEur: 804.67,
  source:
    'Hostaway Accountant/Owner Statement 2025-09-01–2025-09-30, issued 2026-09-05, Net Owner Payout column',
})

/** Printed NTO of included Hostaway stays other than 46340130. */
export const HOSTAWAY_PRINTED_OTHER_NTO_EUR = 36_311.33

export const HOSTAWAY_PRINTED_NTO_TOTAL_EUR = roundEur(
  HOSTAWAY_PRINTED_DIRECT_STAY.printedNtoEur + HOSTAWAY_PRINTED_OTHER_NTO_EUR,
)

export const HOSTAWAY_PRINTED_AVI_SHARE_EUR = roundEur(HOSTAWAY_PRINTED_NTO_TOTAL_EUR * 0.5)

export const HOSTAWAY_PRINTED_OTHER_AVI_SHARE_EUR = roundEur(
  HOSTAWAY_PRINTED_AVI_SHARE_EUR - HOSTAWAY_PRINTED_DIRECT_STAY.aviShareEur,
)

/** Private booking income already on the JJ ledger (Avi 50% of €1,360). */
export const PRIVATE_BOOKING_INCOME_TOTAL_EUR = 1_360
export const PRIVATE_BOOKING_AVI_CREDIT_EUR = 680

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
