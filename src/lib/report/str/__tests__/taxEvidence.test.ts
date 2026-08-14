import { isTaxVerifiedZero, VERIFIED_ZERO_TAX_REGISTER } from '../taxEvidence'

describe('isTaxVerifiedZero — narrow, evidence-backed only', () => {
  it('Tamir July 2026 Booking has explicit Hostaway evidence -> verified zero', () => {
    expect(isTaxVerifiedZero('booking', 'Tamir Dekelia', '2026-07-03')).toBe(true)
    expect(isTaxVerifiedZero('booking', 'Tamir Radisson', '2026-07-31')).toBe(true)
  })
  it('does NOT generalize to months without evidence', () => {
    expect(isTaxVerifiedZero('booking', 'Tamir Dekelia', '2026-08-04')).toBe(false)
    expect(isTaxVerifiedZero('booking', 'Tamir Radisson', '2026-06-30')).toBe(false)
  })
  it('does NOT apply to non-Booking channels or unlisted properties', () => {
    expect(isTaxVerifiedZero('airbnb', 'Tamir Dekelia', '2026-07-03')).toBe(false)
    expect(isTaxVerifiedZero('booking', 'Orit Rob Pingodes', '2026-07-03')).toBe(false)
  })
  it('every register entry cites an evidence source', () => {
    for (const e of VERIFIED_ZERO_TAX_REGISTER) {
      expect(e.channel).toBe('booking')
      expect(e.source.length).toBeGreaterThan(10)
      expect(e.periodStart <= e.periodEnd).toBe(true)
    }
  })
})
