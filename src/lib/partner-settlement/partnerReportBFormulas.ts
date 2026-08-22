/**
 * @module partner-settlement/partnerReportBFormulas
 * @description Pure Layer-A / Layer-B formulas (12a). No I/O.
 *
 * Layer A = legal current account vs JJ (can be one-sided).
 * Layer B = derived inter-partner equalization, from FINALIZED partner positions
 * plus undeclared economic entitlement. Never re-adds a claim already in Layer A.
 *
 * These functions are the certified math; in Stage 1 they are unit-tested but the
 * service keeps the surfaced headline gated (12f/12g).
 */

export interface CurrentAccountComponents {
  readonly openingBalance?: number
  readonly reimbursableFunding?: number
  readonly declaredAmountsDue?: number
  readonly transfersCrediting?: number
  readonly reimbursementsReceived?: number
  readonly incomeCollectedPersonally?: number
  readonly withdrawals?: number
  readonly distributionsReceived?: number
  readonly companyMoneyStillHeld?: number
  readonly transfersDebiting?: number
}

/** CA_P: net amount JJ owes partner P (legal current account). */
export function currentAccount(c: CurrentAccountComponents): number {
  return (
    (c.openingBalance ?? 0)
    + (c.reimbursableFunding ?? 0)
    + (c.declaredAmountsDue ?? 0)
    + (c.transfersCrediting ?? 0)
    - (c.reimbursementsReceived ?? 0)
    - (c.incomeCollectedPersonally ?? 0)
    - (c.withdrawals ?? 0)
    - (c.distributionsReceived ?? 0)
    - (c.companyMoneyStillHeld ?? 0)
    - (c.transfersDebiting ?? 0)
  )
}

/**
 * EP_P: economic position feeding Layer B. Derived from the finalized current
 * account plus economic profit that is NOT yet declared/distributed (so it is not
 * already inside CA via declaredAmountsDue / distributionsReceived).
 */
export function economicPosition(currentAccountP: number, undeclaredEconomicEntitlement: number): number {
  return currentAccountP + undeclaredEconomicEntitlement
}

export interface Headline {
  readonly debtor: string | null
  readonly creditor: string | null
  readonly amountEur: number
}

export const EQUALIZATION_EPSILON = 0.005

/**
 * B = (EP_Jacob - EP_Yossi) / 2.
 * B > 0 -> Yossi owes Jacob; B < 0 -> Jacob owes Yossi.
 * roundEur applied by caller at the aggregate boundary.
 */
export function equalizationHeadline(epYossi: number, epJacob: number): Headline {
  const b = (epJacob - epYossi) / 2
  if (Math.abs(b) < EQUALIZATION_EPSILON) {
    return { debtor: null, creditor: null, amountEur: 0 }
  }
  if (b > 0) return { debtor: 'Yossi', creditor: 'Jacob', amountEur: b }
  return { debtor: 'Jacob', creditor: 'Yossi', amountEur: -b }
}

/** Symmetry residual for the /2 validity guard: EP_Y + EP_J (must be ~0). */
export function symmetryResidual(epYossi: number, epJacob: number): number {
  return epYossi + epJacob
}

/** Round EUR at aggregate boundary (mirrors report A roundEur semantics). */
export function roundEur(value: number): number {
  if (value === 0) return 0
  return (Math.sign(value) * Math.round(Math.abs(value) * 100 + Number.EPSILON * 100)) / 100
}
