import {
  bookingPaymentFeeEvidence,
  BOOKING_PAYMENT_PROCESSED_STATUS,
  BOOKING_PAYMENT_NOT_PROCESSED_STATUS,
} from '../bookingPaymentFeePolicy'
import { buildStrStatementLine, JJ_BOOKING_PAYMENT_FEE_RATE, roundEur, type StrLineEvidence } from '../strStatementLine'

describe('bookingPaymentFeeEvidence — precedence and fail-closed', () => {
  it('explicit Hostaway amount wins over any status', () => {
    expect(bookingPaymentFeeEvidence({ paymentStatus: 'Unknown', explicitPaymentFeeEur: 18.11 })).toEqual({
      kind: 'explicit_amount', amountEur: 18.11, source: 'hostaway:paymentFees',
    })
    expect(bookingPaymentFeeEvidence({ paymentStatus: null, explicitPaymentFeeEur: 0 }).kind).toBe('explicit_amount')
  })
  it('"Paid" → processed_by_channel; "Unknown" → not_processed_by_channel', () => {
    expect(bookingPaymentFeeEvidence({ paymentStatus: BOOKING_PAYMENT_PROCESSED_STATUS }).kind).toBe('processed_by_channel')
    expect(bookingPaymentFeeEvidence({ paymentStatus: ' Paid ' }).kind).toBe('processed_by_channel')
    expect(bookingPaymentFeeEvidence({ paymentStatus: BOOKING_PAYMENT_NOT_PROCESSED_STATUS }).kind).toBe('not_processed_by_channel')
  })
  it('anything else is missing evidence (never guessed): null, empty, other statuses, wrong case', () => {
    for (const s of [null, undefined, '', 'Pending', 'paid', 'PAID', 'unknown', 'Partial']) {
      expect(bookingPaymentFeeEvidence({ paymentStatus: s }).kind).toBe('missing')
    }
    expect(bookingPaymentFeeEvidence({ paymentStatus: 'Pending' }).source).toBe('hostaway:paymentStatus=Pending')
  })
  it('non-finite explicit amounts are ignored and fall through to the status rule', () => {
    expect(bookingPaymentFeeEvidence({ paymentStatus: 'Paid', explicitPaymentFeeEur: Number.NaN }).kind).toBe('processed_by_channel')
  })
})

/**
 * Evidence basis (read-only portfolio scan, 2026-09-27T15:35Z, Hostaway financeCalculatedField, all 239
 * revenue-eligible Booking.com reservations on the 8 mapped listings, check-in 2025-01-01..2026-12-31):
 *   226 reservations paymentStatus "Paid"    → otaPaymentProcessingFee > 0
 *    13 reservations paymentStatus "Unknown" → otaPaymentProcessingFee = 0
 * The 13 zero-fee reservations (gross / channel commission) are reproduced below. Guest names excluded.
 */
const ZERO_FEE_RESERVATIONS: ReadonlyArray<{ property: string; id: string; checkIn: string; gross: number; commission: number }> = [
  { property: 'Ofri Makarios 5 Floor', id: '52213931', checkIn: '2026-01-23', gross: 475.85, commission: 71.38 },
  { property: 'Ofri Makarios 5 Floor', id: '52292932', checkIn: '2026-02-08', gross: 349.2, commission: 52.38 },
  { property: 'Ofri Makarios 5 Floor', id: '52451769', checkIn: '2026-02-15', gross: 595.74, commission: 89.36 },
  { property: 'Ofri Makarios 5 Floor', id: '52342639', checkIn: '2026-02-23', gross: 275.72, commission: 41.36 },
  { property: 'Ofri Makarios 5 Floor', id: '52349185', checkIn: '2026-03-06', gross: 338.15, commission: 50.72 },
  { property: 'Oren Kitty', id: '56798028', checkIn: '2026-03-28', gross: 289.52, commission: 43.43 },
  { property: 'Oren Kitty', id: '57152413', checkIn: '2026-04-03', gross: 397.38, commission: 59.61 },
  { property: 'Oren Kitty', id: '58179487', checkIn: '2026-04-23', gross: 274.21, commission: 41.13 },
  { property: 'Orit Rob Pingodes', id: '60635280', checkIn: '2026-06-10', gross: 990, commission: 148.5 },
  { property: 'Orit Rob Pingodes', id: '61196026', checkIn: '2026-06-20', gross: 270, commission: 40.5 },
  { property: 'Tamir Radisson', id: '47997658', checkIn: '2025-09-25', gross: 205.44, commission: 30.82 },
  { property: 'Tamir Dekelia', id: '48427432', checkIn: '2025-10-05', gross: 390.56, commission: 58.58 },
  { property: 'Tamir Dekelia', id: '49391264', checkIn: '2025-10-29', gross: 143.28, commission: 21.49 },
]

/** Representative "Paid" reservations with Hostaway otaPaymentProcessingFee (scan 2026-09-27). */
const PAID_FEE_RESERVATIONS: ReadonlyArray<{ property: string; id: string; gross: number; commission: number; hostawayPaymentFee: number; hostawayPlatformFees: number }> = [
  { property: 'Tamir Dekelia', id: '60986104', gross: 1131.71, commission: 169.76, hostawayPaymentFee: 18.11, hostawayPlatformFees: 187.87 },
  { property: 'Ofri Makarios 5 Floor', id: '53938840', gross: 750.19, commission: 112.53, hostawayPaymentFee: 12.0, hostawayPlatformFees: 124.53 },
  { property: 'Ofri Makarios 5 Floor', id: '55368211', gross: 842.0, commission: 126.3, hostawayPaymentFee: 13.47, hostawayPlatformFees: 139.77 },
  { property: 'Ofri Makarios 5 Floor', id: '60225289', gross: 578.68, commission: 86.8, hostawayPaymentFee: 9.26, hostawayPlatformFees: 96.06 },
  { property: 'Ofri Makarios 5 Floor', id: '57558855', gross: 662.9, commission: 99.44, hostawayPaymentFee: 10.61, hostawayPlatformFees: 110.05 },
]

const line = (o: Partial<StrLineEvidence>): StrLineEvidence => ({
  reservationId: 'x', channel: 'booking', grossEur: 0, platformFeesEur: 0,
  platformFeesSource: 'hostaway:channelCommissionAmount', cleaningEur: 50, taxesEur: 0,
  platformPayoutEvidenceEur: null, ...o,
})

describe('Booking payment fee — portfolio evidence (scan 2026-09-27)', () => {
  it('scan coverage: 226 Paid-with-fee + 13 Unknown-with-zero = 239, no exceptions', () => {
    expect(226 + ZERO_FEE_RESERVATIONS.length).toBe(239)
  })

  it('all 13 "Unknown" reservations: Platform Fees = channel commission only (no 1.6%), matching Hostaway paymentFees = 0', () => {
    for (const r of ZERO_FEE_RESERVATIONS) {
      const l = buildStrStatementLine(line({
        reservationId: r.id, grossEur: r.gross, platformFeesEur: r.commission,
        bookingPaymentFee: bookingPaymentFeeEvidence({ paymentStatus: 'Unknown' }),
      }))
      expect(l.platformFees.value).toBe(r.commission)
      expect(l.platformFees.source).not.toContain('1_6pct')
      expect(l.reviewReasons).not.toContain('booking_payment_fee_evidence_missing')
    }
  })

  it('"Paid" reservations: 1.6% rate reproduces Hostaway otaPaymentProcessingFee and PlatformFees cent-exact (Tamir unchanged)', () => {
    for (const r of PAID_FEE_RESERVATIONS) {
      expect(roundEur(r.gross * JJ_BOOKING_PAYMENT_FEE_RATE)).toBe(r.hostawayPaymentFee)
      const l = buildStrStatementLine(line({
        reservationId: r.id, grossEur: r.gross, platformFeesEur: r.commission,
        bookingPaymentFee: bookingPaymentFeeEvidence({ paymentStatus: 'Paid' }),
      }))
      expect(l.platformFees.value).toBe(r.hostawayPlatformFees)
    }
  })

  it('Orit June 2026: the two Bookings without a fee reconcile to Hostaway ownerPayout (625.20 + 135.60)', () => {
    const orit = ZERO_FEE_RESERVATIONS.filter(r => r.property === 'Orit Rob Pingodes')
    const nets = orit.map(r => buildStrStatementLine(line({
      reservationId: r.id, grossEur: r.gross, platformFeesEur: r.commission, cleaningEur: 60,
      bookingPaymentFee: bookingPaymentFeeEvidence({ paymentStatus: 'Unknown' }),
    })).netOwnerPayout.value)
    expect(nets).toEqual([625.2, 135.6])
  })
})
