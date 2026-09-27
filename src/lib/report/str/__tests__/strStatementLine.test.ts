import { buildStrStatementLine, roundEur, type StrLineEvidence } from '../strStatementLine'
import { bookingPaymentFeeEvidence } from '../bookingPaymentFeePolicy'

const airbnb = (o: Partial<StrLineEvidence> = {}): StrLineEvidence => ({
  reservationId: 'r1', channel: 'airbnb',
  grossEur: 1026, platformFeesEur: 159.03, platformFeesSource: 'hostaway:airbnbListingHostFee',
  cleaningEur: 60, taxesEur: 0, platformPayoutEvidenceEur: 866.97, ...o,
})
// Booking fixture = Tamir-style reservation: Hostaway paymentStatus "Paid" (Booking.com processed the
// payment → 1.6% payment fee evidenced). The gate is tested separately below.
const booking = (o: Partial<StrLineEvidence> = {}): StrLineEvidence => ({
  reservationId: 'r2', channel: 'booking',
  grossEur: 906.17, platformFeesEur: 135.93, platformFeesSource: 'hostaway:channelCommissionAmount',
  cleaningEur: 50, taxesEur: null, platformPayoutEvidenceEur: 770.24,
  bookingPaymentFee: bookingPaymentFeeEvidence({ paymentStatus: 'Paid' }), ...o,
})

describe('buildStrStatementLine — decisions A & B', () => {
  it('Airbnb with known taxes: mgmt = JJ-derived 20% after platform fees; net = derived chain', () => {
    const l = buildStrStatementLine(airbnb())
    // Total payout 866.97; mgmt = 0.20*(866.97-60-0)=161.39; net = 866.97-60-161.39-0 = 645.58
    expect(l.managementFee.value).toBe(161.39)
    expect(l.managementFee.provenance).toBe('jj_derived')
    expect(l.netOwnerPayout.value).toBe(645.58)
    expect(l.netOwnerPayout.provenance).toBe('jj_derived')
    expect(l.gross.provenance).toBe('hostaway')
    expect(l.platformFees.provenance).toBe('hostaway')
    expect(l.needsReview).toBe(false)
  })

  it('Booking.com null taxes stays Unknown — mgmt + net Needs Review, NEVER coerced to 0', () => {
    const l = buildStrStatementLine(booking())
    expect(l.taxes.value).toBeNull()
    expect(l.taxes.provenance).toBe('unknown')
    expect(l.managementFee.value).toBeNull()
    expect(l.netOwnerPayout.value).toBeNull()
    expect(l.needsReview).toBe(true)
    expect(l.reviewReasons).toEqual(expect.arrayContaining(['tax_unknown', 'management_fee_unknown', 'net_owner_payout_unknown']))
  })

  it('explicit taxes = 0 (from source) computes cleanly (0 is not Unknown)', () => {
    const l = buildStrStatementLine(booking({ taxesEur: 0, platformPayoutEvidenceEur: 770.24 }))
    // Booking platform fees = 135.93 + round(906.17*1.6%)=14.50 => 150.43; totalPayout = 755.74
    // mgmt = 0.20*(755.74-50-0)=141.15; net = 755.74-50-141.15 = 564.59
    expect(l.platformFees.value).toBe(150.43)
    expect(l.managementFee.value).toBe(141.15)
    expect(l.netOwnerPayout.value).toBe(564.59)
    expect(l.needsReview).toBe(false)
  })

  it('Booking payment fee: platformFees = channelCommission + round(gross x 1.6%), cent-exact', () => {
    // Real Tamir Dekelia July reservation, matches Hostaway Owner Statement to the cent (187.87).
    const l = buildStrStatementLine(booking({ grossEur: 1131.71, platformFeesEur: 169.76 }))
    expect(l.platformFees.value).toBe(187.87)           // 169.76 + round(18.10736)=18.11
    expect(l.platformFees.source).toContain('booking_payment_fee_1_6pct')
  })

  it('Airbnb is NEVER charged the Booking payment fee (platformFees = host fee)', () => {
    const l = buildStrStatementLine(airbnb())
    expect(l.platformFees.value).toBe(159.03)
    expect(l.platformFees.source).not.toContain('booking_payment_fee')
  })

  it('Airbnb ignores any Booking payment-fee evidence and never fails closed on it', () => {
    const l = buildStrStatementLine(airbnb({ bookingPaymentFee: undefined }))
    expect(l.platformFees.value).toBe(159.03)
    expect(l.reviewReasons).not.toContain('booking_payment_fee_evidence_missing')
    expect(l.needsReview).toBe(false)
  })

  describe('Booking payment fee — per-reservation evidence gate (approved 2026-09-27)', () => {
    it('Orit 60635280: paymentStatus "Unknown" → NO payment fee; platform = commission only; net = Hostaway ownerPayout 625.20', () => {
      const l = buildStrStatementLine(booking({
        reservationId: '60635280', grossEur: 990, platformFeesEur: 148.5, cleaningEur: 60, taxesEur: 0,
        platformPayoutEvidenceEur: 841.5, bookingPaymentFee: bookingPaymentFeeEvidence({ paymentStatus: 'Unknown' }),
      }))
      expect(l.platformFees.value).toBe(148.5)
      expect(l.platformFees.source).toContain('booking_payment_fee_none[hostaway:paymentStatus=Unknown]')
      expect(l.platformFees.source).not.toContain('1_6pct')
      expect(l.managementFee.value).toBe(156.3)     // 0.20 x (841.50 - 60 - 0)
      expect(l.netOwnerPayout.value).toBe(625.2)    // = Hostaway financeCalculatedField ownerPayout
      expect(l.needsReview).toBe(false)
    })

    it('Orit 61196026: paymentStatus "Unknown" → 270 / 40.50 → mgmt 33.90 / net 135.60 (Hostaway ownerPayout)', () => {
      const l = buildStrStatementLine(booking({
        reservationId: '61196026', grossEur: 270, platformFeesEur: 40.5, cleaningEur: 60, taxesEur: 0,
        platformPayoutEvidenceEur: 229.5, bookingPaymentFee: bookingPaymentFeeEvidence({ paymentStatus: 'Unknown' }),
      }))
      expect(l.platformFees.value).toBe(40.5)
      expect(l.managementFee.value).toBe(33.9)
      expect(l.netOwnerPayout.value).toBe(135.6)
      expect(l.needsReview).toBe(false)
    })

    it('Tamir 60986104: paymentStatus "Paid" → 1131.71 / 169.76 → platform 187.87 (unchanged golden value)', () => {
      const l = buildStrStatementLine(booking({
        reservationId: '60986104', grossEur: 1131.71, platformFeesEur: 169.76,
        bookingPaymentFee: bookingPaymentFeeEvidence({ paymentStatus: 'Paid' }),
      }))
      expect(l.platformFees.value).toBe(187.87)
      expect(l.platformFees.source).toContain('jj_derived:booking_payment_fee_1_6pct[hostaway:paymentStatus=Paid]')
    })

    it('explicit Hostaway fee amount takes precedence over the 1.6% rate', () => {
      const l = buildStrStatementLine(booking({
        grossEur: 1131.71, platformFeesEur: 169.76,
        bookingPaymentFee: bookingPaymentFeeEvidence({ paymentStatus: 'Paid', explicitPaymentFeeEur: 18.11 }),
      }))
      expect(l.platformFees.value).toBe(187.87)
      expect(l.platformFees.source).toContain('hostaway:paymentFees:booking_payment_fee')
      expect(l.platformFees.source).not.toContain('1_6pct')
    })

    it('explicit amount 0 from Hostaway → no fee even if status were unknown', () => {
      const l = buildStrStatementLine(booking({
        grossEur: 990, platformFeesEur: 148.5, taxesEur: 0,
        bookingPaymentFee: bookingPaymentFeeEvidence({ paymentStatus: null, explicitPaymentFeeEur: 0 }),
      }))
      expect(l.platformFees.value).toBe(148.5)
      expect(l.needsReview).toBe(false)
    })

    it('missing evidence (no bookingPaymentFee) → Platform Fees Unknown → Needs Review (fail closed, never assumed)', () => {
      const l = buildStrStatementLine(booking({ taxesEur: 0, bookingPaymentFee: undefined }))
      expect(l.platformFees.value).toBeNull()
      expect(l.platformFees.provenance).toBe('unknown')
      expect(l.platformFees.source).toContain('booking_payment_fee_evidence_missing')
      expect(l.managementFee.value).toBeNull()
      expect(l.netOwnerPayout.value).toBeNull()
      expect(l.needsReview).toBe(true)
      expect(l.reviewReasons).toEqual(expect.arrayContaining(['booking_payment_fee_evidence_missing', 'platform_fees_unknown']))
    })

    it('unrecognised paymentStatus (e.g. "Pending", null) → evidence missing → fail closed', () => {
      for (const status of ['Pending', 'paid', '', null]) {
        const l = buildStrStatementLine(booking({ taxesEur: 0, bookingPaymentFee: bookingPaymentFeeEvidence({ paymentStatus: status }) }))
        expect(l.platformFees.value).toBeNull()
        expect(l.reviewReasons).toContain('booking_payment_fee_evidence_missing')
      }
    })

    it('booking_direct (recovered historical, actual fee recorded) is NOT gated and NOT surcharged', () => {
      const l = buildStrStatementLine(booking({ channel: 'booking_direct', taxesEur: 0, bookingPaymentFee: undefined }))
      expect(l.platformFees.value).toBe(135.93)
      expect(l.reviewReasons).not.toContain('booking_payment_fee_evidence_missing')
    })
  })

  it('verified-zero tax evidence unblocks a null-tax Booking line (0 is verified, not Unknown)', () => {
    const l = buildStrStatementLine(booking({ grossEur: 1131.71, platformFeesEur: 169.76, taxVerifiedZeroEvidence: true }))
    // platformFees 187.87; totalPayout 943.84; mgmt=0.20*(943.84-50)=178.77; net=943.84-50-178.77=715.07
    expect(l.taxes.value).toBe(0)
    expect(l.taxes.provenance).toBe('hostaway')
    expect(l.taxes.source).toContain('booking_account_policy_verified_zero')
    expect(l.managementFee.value).toBe(178.77)
    expect(l.netOwnerPayout.value).toBe(715.07)
    expect(l.needsReview).toBe(false)
  })

  it('null tax WITHOUT verified-zero evidence still Needs Review (Unknown != 0)', () => {
    const l = buildStrStatementLine(booking({ taxVerifiedZeroEvidence: false }))
    expect(l.taxes.value).toBeNull()
    expect(l.netOwnerPayout.value).toBeNull()
    expect(l.reviewReasons).toContain('tax_unknown')
  })

  it('platform payout evidence is separate and NEVER the net owner payout', () => {
    const l = buildStrStatementLine(airbnb())
    expect(l.platformPayoutEvidence.value).toBe(866.97)
    expect(l.platformPayoutEvidence.source).toContain('platform_payout_evidence')
    expect(l.netOwnerPayout.value).not.toBe(l.platformPayoutEvidence.value)
  })

  it('uses Hostaway managementFee when provided, flags material mismatch, keeps provenance', () => {
    const l = buildStrStatementLine(airbnb(), { hostawayManagementFee: 200 })
    expect(l.managementFee.value).toBe(200)
    expect(l.managementFee.provenance).toBe('hostaway')
    expect(l.reviewReasons).toContain('management_fee_mismatch') // expected ~161.39
  })

  it('unknown gross/platform propagate to Unknown + Needs Review', () => {
    const l = buildStrStatementLine(airbnb({ grossEur: null, platformPayoutEvidenceEur: null }))
    expect(l.gross.value).toBeNull()
    expect(l.managementFee.value).toBeNull()
    expect(l.netOwnerPayout.value).toBeNull()
    expect(l.reviewReasons).toEqual(expect.arrayContaining(['gross_unknown']))
  })

  it('roundEur is IEEE-safe', () => {
    expect(roundEur(161.394999999)).toBe(161.39)
    expect(roundEur(0.1 + 0.2)).toBe(0.3)
  })
})
