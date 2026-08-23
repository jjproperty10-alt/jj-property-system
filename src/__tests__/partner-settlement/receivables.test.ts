import { summarizeMoneyPosition } from '@/lib/partner-settlement/moneyPosition'

describe('summarizeMoneyPosition (QA #5 — null preservation)', () => {
  it('does NOT coerce a null open_amount_eur to 0; surfaces it as unknownRows', () => {
    const rows = [
      { direction: 'RECEIVABLE_TO_JJ', counterparty_type: 'owner', open_amount_eur: 100 },
      { direction: 'RECEIVABLE_TO_JJ', counterparty_type: 'supplier', open_amount_eur: null },
      { direction: 'PAYABLE_BY_JJ', counterparty_type: 'owner', open_amount_eur: 50 },
    ]
    const s = summarizeMoneyPosition(rows)
    expect(s.receivableToJjEur).toBe(100) // the null row is NOT added as 0
    expect(s.payableByJjEur).toBe(50)
    expect(s.unknownRows).toBe(1)          // unknown is surfaced, not swallowed
    expect(s.scope).toBe('PARTIAL')
  })

  it('returns null totals (not 0) when there are no rows at all', () => {
    const s = summarizeMoneyPosition([])
    expect(s.receivableToJjEur).toBeNull()
    expect(s.payableByJjEur).toBeNull()
    expect(s.unknownRows).toBe(0)
  })
})
