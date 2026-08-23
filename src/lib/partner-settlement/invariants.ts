/**
 * @module partner-settlement/invariants
 * @description Conservation & non-double-count invariants (12e / 11j). Pure.
 *
 * STAGE 2 — WIRED. partnerLedgerEngine runs withinPerTransactionCap on every
 * classified line and isEqualizationSymmetric on the derived EPs at runtime. A cap
 * violation blocks certification and appends a PER_TRANSACTION_CAP_VIOLATION
 * unresolved item; a broken symmetry blocks the debtor/creditor headline.
 */

import { EQUALIZATION_EPSILON, symmetryResidual } from './partnerReportBFormulas'

/**
 * Per-transaction cap: the total of all claims a single source transaction generates
 * (Layer A payable + any inter-partner Layer B claim) must not exceed its economic
 * amount. A reimbursable expense generates one Layer-A claim and 0 Layer-B; a capital
 * expense generates 0 Layer-A and <= its ownership-split Layer-B.
 */
export function withinPerTransactionCap(
  economicAmount: number,
  layerAClaim: number,
  layerBClaim: number,
  epsilon = 0.01,
): boolean {
  return Math.abs(layerAClaim) + Math.abs(layerBClaim) <= Math.abs(economicAmount) + epsilon
}

/** The (EP_J - EP_Y)/2 formula is only valid when the two EPs mirror (sum ~ 0). */
export function isEqualizationSymmetric(epYossi: number, epJacob: number): boolean {
  return Math.abs(symmetryResidual(epYossi, epJacob)) <= EQUALIZATION_EPSILON
}

/** Cash conservation: net of all party positions equals cash-in minus cash-out. */
export function isCashConserved(
  partyNetPositions: readonly number[],
  cashIn: number,
  cashOut: number,
  epsilon = 0.01,
): boolean {
  const sum = partyNetPositions.reduce((a, b) => a + b, 0)
  return Math.abs(sum - (cashIn - cashOut)) <= epsilon
}

/** opening + period activity = closing. */
export function rollForwardHolds(
  opening: number,
  periodActivity: number,
  closing: number,
  epsilon = 0.01,
): boolean {
  return Math.abs(opening + periodActivity - closing) <= epsilon
}
