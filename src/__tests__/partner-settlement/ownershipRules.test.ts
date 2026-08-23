import { resolvePartnerSplit, APPROVED_OWNERSHIP_FACTS } from '@/lib/partner-settlement/ownershipRules'

describe('resolvePartnerSplit', () => {
  it('Villa Mazotos uses the authorized special fact: Yossi 25% / Jacob 25% (whole property)', () => {
    const s = resolvePartnerSplit('Villa Mazotos')
    expect(s.yossi).toBeCloseTo(0.25, 6)
    expect(s.jacob).toBeCloseTo(0.25, 6)
    expect(s.confidence).toBe('estimated')
    expect(APPROVED_OWNERSHIP_FACTS['villa mazotos'].externalPct).toBe(50)
  })

  it('uses confirmed canonical 50/50 shares when present', () => {
    const s = resolvePartnerSplit('SomeProp', [
      { party: 'Yossi', pct: 50, confidence: 'confirmed' },
      { party: 'Jacob', pct: 50, confidence: 'confirmed' },
    ])
    expect(s.yossi).toBeCloseTo(0.5, 6)
    expect(s.jacob).toBeCloseTo(0.5, 6)
    expect(s.confidence).toBe('confirmed')
  })

  it('confirmed canonical shares override the approved fact for Villa Mazotos', () => {
    const s = resolvePartnerSplit('Villa Mazotos', [
      { party: 'Yossi', pct: 30, confidence: 'confirmed' },
      { party: 'Jacob', pct: 20, confidence: 'confirmed' },
    ])
    expect(s.yossi).toBeCloseTo(0.30, 6)
    expect(s.jacob).toBeCloseTo(0.20, 6)
    expect(s.confidence).toBe('confirmed')
  })

  it('NEVER assumes 50/50 for an unconfirmed property with no fact → PENDING (null)', () => {
    const s = resolvePartnerSplit('Unknown Prop')
    expect(s.yossi).toBeNull()
    expect(s.jacob).toBeNull()
    expect(s.confidence).toBe('pending_verification')
  })

  it('pending_verification canonical shares do NOT count as confirmed', () => {
    const s = resolvePartnerSplit('SomeProp', [
      { party: 'Yossi', pct: 50, confidence: 'pending_verification' },
      { party: 'Jacob', pct: 50, confidence: 'pending_verification' },
    ])
    expect(s.confidence).toBe('pending_verification')
    expect(s.yossi).toBeNull()
  })
})
