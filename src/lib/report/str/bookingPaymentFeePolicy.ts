/**
 * bookingPaymentFeePolicy — evidence gate for the Booking.com payment-processing fee
 * ("Payments by Booking.com", 1.6 % of gross).
 *
 * Owner decision (Yossi, 2026-09-27): the fee is included ONLY when there is explicit evidence for the
 * reservation — never automatically for every Booking reservation.
 *
 * Evidence (read-only portfolio scan, 2026-09-27, Hostaway financeCalculatedField for all 239
 * revenue-eligible Booking reservations across the 8 mapped listings, check-in 2025-01-01..2026-12-31):
 *   - 226/226 reservations with Hostaway `paymentStatus = "Paid"`    → `otaPaymentProcessingFee` > 0
 *   - 13/13   reservations with Hostaway `paymentStatus = "Unknown"` → `otaPaymentProcessingFee` = 0
 *   Hostaway's own Booking payout formula is
 *   `totalPayoutBCom = accommodation + discounts + guestFees + taxes − paymentFees − hostChannelFee`,
 *   so a zero `paymentFees` means Booking.com deducted no payment fee for that reservation.
 *
 * Precedence, strongest evidence first:
 *   1. explicit fee amount from Hostaway (`paymentFees` / `otaPaymentProcessingFee`) — used verbatim;
 *   2. Hostaway `paymentStatus`: "Paid" → payment processed by Booking.com → fee = round(gross × 1.6 %);
 *      "Unknown" → not processed by Booking.com → no payment fee;
 *   3. anything else (missing / unrecognised status) → evidence missing → the line fails closed
 *      (Platform Fees Unknown → Needs Review). Never guessed.
 *
 * Report calculation only — never creates or mutates transactions.
 */

/** Hostaway `paymentStatus` values that carry payment-fee evidence for Booking.com reservations. */
export const BOOKING_PAYMENT_PROCESSED_STATUS = 'Paid'
export const BOOKING_PAYMENT_NOT_PROCESSED_STATUS = 'Unknown'

export type BookingPaymentFeeEvidence =
  /** Hostaway states the fee amount explicitly (financeCalculatedField paymentFees / otaPaymentProcessingFee). */
  | { readonly kind: 'explicit_amount'; readonly amountEur: number; readonly source: string }
  /** Hostaway paymentStatus = "Paid": Booking.com processed the payment; fee is 1.6 % of gross (proven 226/226). */
  | { readonly kind: 'processed_by_channel'; readonly source: string }
  /** Hostaway paymentStatus = "Unknown": Booking.com did not process the payment; no fee (proven 13/13). */
  | { readonly kind: 'not_processed_by_channel'; readonly source: string }
  /** No usable evidence — the line must fail closed. */
  | { readonly kind: 'missing'; readonly source: string }

/**
 * Derive the payment-fee evidence for one Booking.com reservation from Hostaway fields.
 * `explicitPaymentFeeEur` wins when present (it is the source amount, not a policy).
 */
export function bookingPaymentFeeEvidence(input: {
  readonly paymentStatus: string | null | undefined
  readonly explicitPaymentFeeEur?: number | null
}): BookingPaymentFeeEvidence {
  if (input.explicitPaymentFeeEur != null && Number.isFinite(input.explicitPaymentFeeEur)) {
    return { kind: 'explicit_amount', amountEur: input.explicitPaymentFeeEur, source: 'hostaway:paymentFees' }
  }
  const status = input.paymentStatus == null ? null : String(input.paymentStatus).trim()
  if (status === BOOKING_PAYMENT_PROCESSED_STATUS) {
    return { kind: 'processed_by_channel', source: 'hostaway:paymentStatus=Paid' }
  }
  if (status === BOOKING_PAYMENT_NOT_PROCESSED_STATUS) {
    return { kind: 'not_processed_by_channel', source: 'hostaway:paymentStatus=Unknown' }
  }
  return { kind: 'missing', source: status == null ? 'hostaway:paymentStatus(null)' : `hostaway:paymentStatus=${status}` }
}
