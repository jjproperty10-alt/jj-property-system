import { evaluateHeadlineGate } from '@/lib/partner-settlement/headlineGate'
import type { UnresolvedItem } from '@/lib/partner-settlement/partnerReportBTypes'

const clean = {
  unresolvedItems: [] as UnresolvedItem[],
  ownershipPending: false,
  accountProfitPending: false,
  ownerBalanceUnreconciled: false,
  cashUnverified: false,
  moneyPositionPartial: false,
  symmetryResidualEur: 0,
}

describe('headlineGate', () => {
  it('CERTIFIED only when every gate passes', () => {
    const r = evaluateHeadlineGate(clean)
    expect(r.certificationStatus).toBe('CERTIFIED')
    expect(r.canAssertDebtorCreditor).toBe(true)
    expect(r.blockingReasons).toHaveLength(0)
  })

  it('blocks (PENDING_RECONCILIATION) on any unresolved item', () => {
    const r = evaluateHeadlineGate({
      ...clean,
      unresolvedItems: [{ kind: 'TRANSFER_PURPOSE_UNKNOWN', ref: 'tx', reason: 'x' }],
    })
    expect(r.certificationStatus).toBe('PENDING_RECONCILIATION')
    expect(r.canAssertDebtorCreditor).toBe(false)
  })

  it('blocks when ownership or account profit pending', () => {
    expect(evaluateHeadlineGate({ ...clean, ownershipPending: true }).canAssertDebtorCreditor).toBe(false)
    expect(evaluateHeadlineGate({ ...clean, accountProfitPending: true }).certificationStatus).toBe('PENDING_RECONCILIATION')
  })

  it('blocks when equalization is not computed (Stage 1)', () => {
    const r = evaluateHeadlineGate({ ...clean, symmetryResidualEur: null })
    expect(r.certificationStatus).toBe('PENDING_RECONCILIATION')
  })

  it('blocks when EP components are not symmetric', () => {
    const r = evaluateHeadlineGate({ ...clean, symmetryResidualEur: 10 })
    expect(r.canAssertDebtorCreditor).toBe(false)
    expect(r.blockingReasons.join(' ')).toMatch(/symmetric/i)
  })

  it('PARTIAL when only scope caveats remain (subtotal exists, not final)', () => {
    const r = evaluateHeadlineGate({ ...clean, cashUnverified: true, moneyPositionPartial: true })
    expect(r.certificationStatus).toBe('PARTIAL')
    expect(r.canAssertDebtorCreditor).toBe(false)
  })
})
