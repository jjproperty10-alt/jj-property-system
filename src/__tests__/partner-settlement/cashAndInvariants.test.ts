import { computeCashVerification } from '@/lib/partner-settlement/cashStatus'
import {
  withinPerTransactionCap, isEqualizationSymmetric, isCashConserved, rollForwardHolds,
} from '@/lib/partner-settlement/invariants'

describe('computeCashVerification (ledger vs verified, 12b)', () => {
  it('LEDGER_ONLY when no verified source', () => {
    expect(computeCashVerification(100, null).verificationStatus).toBe('LEDGER_ONLY')
  })
  it('RECONCILED when ledger matches verified', () => {
    const r = computeCashVerification(100, 100)
    expect(r.verificationStatus).toBe('RECONCILED')
    expect(r.reconciliationDifference).toBe(0)
  })
  it('DISCREPANCY when ledger differs from verified', () => {
    const r = computeCashVerification(100, 90)
    expect(r.verificationStatus).toBe('DISCREPANCY')
    expect(r.reconciliationDifference).toBe(10)
  })
})

describe('invariants (12e)', () => {
  it('per-transaction cap: reimbursable expense (A=100,B=0) within cap', () => {
    expect(withinPerTransactionCap(100, 100, 0)).toBe(true)
  })
  it('per-transaction cap: capital expense (A=0,B=50) within cap', () => {
    expect(withinPerTransactionCap(100, 0, 50)).toBe(true)
  })
  it('per-transaction cap: double-count (A=100,B=50) EXCEEDS cap', () => {
    expect(withinPerTransactionCap(100, 100, 50)).toBe(false)
  })
  it('equalization symmetry guard', () => {
    expect(isEqualizationSymmetric(50, -50)).toBe(true)
    expect(isEqualizationSymmetric(2000, -2000)).toBe(true)
    expect(isEqualizationSymmetric(50, -40)).toBe(false)
  })
  it('cash conservation', () => {
    expect(isCashConserved([-2000, 2000], 0, 0)).toBe(true)
    expect(isCashConserved([50, -50], 100, 100)).toBe(true)
  })
  it('opening + activity = closing', () => {
    expect(rollForwardHolds(100, 50, 150)).toBe(true)
    expect(rollForwardHolds(100, 50, 200)).toBe(false)
  })
})
