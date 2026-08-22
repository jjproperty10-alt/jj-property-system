import {
  currentAccount, economicPosition, equalizationHeadline, symmetryResidual, roundEur,
} from '@/lib/partner-settlement/partnerReportBFormulas'

describe('partnerReportBFormulas', () => {
  it('reimbursable EUR100 loan: JJ owes Yossi 100, headline B = 0 (no partner-to-partner claim)', () => {
    // Layer A: Yossi fronted 100 reimbursable; Jacob 0.
    const caY = currentAccount({ reimbursableFunding: 100 })
    const caJ = currentAccount({})
    expect(caY).toBe(100)
    expect(caJ).toBe(0)
    // A reimbursable loan contributes NO per-event burden to Layer B (undeclared entitlement 0).
    const epY = economicPosition(0, 0)
    const epJ = economicPosition(0, 0)
    const h = equalizationHeadline(epY, epJ)
    expect(h.amountEur).toBe(0)
    expect(h.debtor).toBeNull()
  })

  it('EUR100 capital 50/50 by Yossi: Jacob owes Yossi 50', () => {
    // capital imbalance: Yossi over-funded by 50, Jacob under by 50 (symmetric economic component)
    const epY = economicPosition(0, +50)
    const epJ = economicPosition(0, -50)
    const h = equalizationHeadline(epY, epJ)
    expect(h.debtor).toBe('Jacob')
    expect(h.creditor).toBe('Yossi')
    expect(h.amountEur).toBe(50)
    expect(symmetryResidual(epY, epJ)).toBe(0)
  })

  it('EUR10000 profit 50/50, Yossi drew 7k / Jacob 3k (declared): Yossi owes Jacob 2000', () => {
    const caY = currentAccount({ declaredAmountsDue: 5000, distributionsReceived: 7000 }) // -2000
    const caJ = currentAccount({ declaredAmountsDue: 5000, distributionsReceived: 3000 }) // +2000
    expect(caY).toBe(-2000)
    expect(caJ).toBe(2000)
    const epY = economicPosition(caY, 0)
    const epJ = economicPosition(caJ, 0)
    const h = equalizationHeadline(epY, epJ)
    expect(h.debtor).toBe('Yossi')
    expect(h.creditor).toBe('Jacob')
    expect(h.amountEur).toBe(2000)
    expect(symmetryResidual(epY, epJ)).toBe(0)
  })

  it('roundEur rounds at aggregate boundary', () => {
    expect(roundEur(1.005)).toBe(1.01)
    expect(roundEur(-1.005)).toBe(-1.01)
    expect(roundEur(0)).toBe(0)
  })
})
