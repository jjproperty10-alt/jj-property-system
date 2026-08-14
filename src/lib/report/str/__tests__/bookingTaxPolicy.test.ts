import { isBookingAccountVerifiedZero, JJ_BOOKING_TAX_POLICY } from '../bookingTaxPolicy'
import { buildStrStatementLine, type StrLineEvidence } from '../strStatementLine'

const line = (o: Partial<StrLineEvidence>): StrLineEvidence => ({
  reservationId: 'x', channel: 'booking', grossEur: 1131.71, platformFeesEur: 169.76,
  platformFeesSource: 'hostaway:channelCommissionAmount', cleaningEur: 50, taxesEur: null,
  platformPayoutEvidenceEur: null, ...o,
})

describe('isBookingAccountVerifiedZero — account-bounded, fail-closed', () => {
  it('applies to Booking + null tax within the validated regime', () => {
    expect(isBookingAccountVerifiedZero('booking', null, '2026-07-05')).toBe(true)
    expect(isBookingAccountVerifiedZero('booking', null, '2025-09-25')).toBe(true)
    expect(isBookingAccountVerifiedZero('booking', null, '2027-01-05')).toBe(true)
  })
  it('null is NOT globally zero — before the validated regime it does not apply', () => {
    expect(isBookingAccountVerifiedZero('booking', null, '2025-09-24')).toBe(false)
  })
  it('explicit tax (even 0) is authoritative — policy never overrides it', () => {
    expect(isBookingAccountVerifiedZero('booking', 0, '2026-07-05')).toBe(false)
    expect(isBookingAccountVerifiedZero('booking', 12.5, '2026-07-05')).toBe(false)
  })
  it('does NOT apply to Airbnb / Direct / Booking Engine', () => {
    expect(isBookingAccountVerifiedZero('airbnb', null, '2026-07-05')).toBe(false)
    expect(isBookingAccountVerifiedZero('direct', null, '2026-07-05')).toBe(false)
  })
  it('policy is documented and effective-dated from audited data', () => {
    expect(JJ_BOOKING_TAX_POLICY.taxTreatment).toBe('verified_zero')
    expect(JJ_BOOKING_TAX_POLICY.effectiveFrom).toBe('2025-09-25')
    expect(JJ_BOOKING_TAX_POLICY.effectiveTo).toBeNull()
    expect(JJ_BOOKING_TAX_POLICY.evidenceBasis.length).toBeGreaterThan(20)
  })
})

describe('buildStrStatementLine — Booking account policy closes the chain', () => {
  it('Booking null tax + account policy => tax verified 0, net computed, provenance tagged', () => {
    const l = buildStrStatementLine(line({ grossEur: 1131.71, platformFeesEur: 169.76, taxVerifiedZeroEvidence: true }))
    expect(l.taxes.value).toBe(0)
    expect(l.taxes.source).toContain('booking_account_policy_verified_zero')
    expect(l.managementFee.value).toBe(178.77)
    expect(l.netOwnerPayout.value).toBe(715.07)
    expect(l.needsReview).toBe(false)
  })
  it('Booking null tax WITHOUT policy still Needs Review (Unknown != 0)', () => {
    const l = buildStrStatementLine(line({ taxVerifiedZeroEvidence: false }))
    expect(l.taxes.value).toBeNull()
    expect(l.netOwnerPayout.value).toBeNull()
    expect(l.reviewReasons).toContain('tax_unknown')
  })
})
