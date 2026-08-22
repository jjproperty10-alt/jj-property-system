/**
 * @module partner-settlement/cashStatus
 * @description Ledger-vs-verified cash reconciliation (12b).
 *
 * v_cashbox_audit gives a LEDGER position. It is only "verified cash" when an
 * authoritative bank/physical-count source confirms it. Pure function.
 */

import type { CashVerificationStatus } from './partnerReportBTypes'

export interface CashVerification {
  readonly reconciliationDifference: number | null
  readonly verificationStatus: CashVerificationStatus
}

/** Tolerance (EUR) for treating ledger and verified cash as reconciled. */
export const CASH_RECONCILE_EPSILON = 0.01

export function computeCashVerification(
  ledger: number | null,
  verified: number | null,
  epsilon: number = CASH_RECONCILE_EPSILON,
): CashVerification {
  if (ledger === null || verified === null) {
    return { reconciliationDifference: null, verificationStatus: 'LEDGER_ONLY' }
  }
  const diff = ledger - verified
  return {
    reconciliationDifference: diff,
    verificationStatus: Math.abs(diff) <= epsilon ? 'RECONCILED' : 'DISCREPANCY',
  }
}
