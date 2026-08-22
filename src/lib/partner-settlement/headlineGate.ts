/**
 * @module partner-settlement/headlineGate
 * @description Stage 1 headline trust gate (12f).
 *
 * The Yossi<->Jacob "who owes whom" headline may assert a final debtor/creditor
 * ONLY when every mandatory gate passes. In Stage 1 the classification / ownership /
 * profit inputs are incomplete by design, so this returns PARTIAL or
 * PENDING_RECONCILIATION and canAssertDebtorCreditor = false.
 *
 * Pure function — no I/O. Unit-tested.
 */

import type { CertificationStatus, UnresolvedItem } from './partnerReportBTypes'

export interface GateInput {
  readonly unresolvedItems: readonly UnresolvedItem[]
  readonly ownershipPending: boolean
  readonly accountProfitPending: boolean
  readonly ownerBalanceUnreconciled: boolean
  readonly cashUnverified: boolean
  readonly moneyPositionPartial: boolean
  /** |EP_Yossi + EP_Jacob| ; null when equalization not computed (Stage 1) */
  readonly symmetryResidualEur: number | null
}

export interface GateResult {
  readonly certificationStatus: CertificationStatus
  readonly canAssertDebtorCreditor: boolean
  readonly blockingReasons: readonly string[]
}

/** Symmetry tolerance for the (EP_J - EP_Y)/2 validity guard. */
export const SYMMETRY_EPSILON = 0.01

/**
 * Reasons that HARD-BLOCK a final debtor/creditor assertion (→ PENDING_RECONCILIATION).
 * Scope-only caveats (cash unverified, money_position partial) downgrade to PARTIAL
 * but do not, by themselves, make a computed inter-partner subtotal meaningless.
 */
export function evaluateHeadlineGate(input: GateInput): GateResult {
  const hardReasons: string[] = []
  const softReasons: string[] = []

  if (input.unresolvedItems.length > 0) {
    hardReasons.push(`${input.unresolvedItems.length} unresolved item(s) must be classified`)
  }
  if (input.ownershipPending) hardReasons.push('property ownership pending confirmation')
  if (input.accountProfitPending) hardReasons.push('required account profit pending')
  if (input.ownerBalanceUnreconciled) hardReasons.push('owner balance not reconciled to one basis')

  if (input.symmetryResidualEur === null) {
    hardReasons.push('equalization not computed (Stage 1 framework)')
  } else if (Math.abs(input.symmetryResidualEur) > SYMMETRY_EPSILON) {
    hardReasons.push('equalization components not symmetric (EP_Y + EP_J != 0)')
  }

  if (input.cashUnverified) softReasons.push('cash is ledger-only, not verified vs bank/physical')
  if (input.moneyPositionPartial) softReasons.push('receivables/payables scope is partial')

  const blockingReasons = [...hardReasons, ...softReasons]

  if (blockingReasons.length === 0) {
    return { certificationStatus: 'CERTIFIED', canAssertDebtorCreditor: true, blockingReasons: [] }
  }
  if (hardReasons.length === 0) {
    // only scope caveats remain — a certified subtotal exists but is not the whole picture
    return { certificationStatus: 'PARTIAL', canAssertDebtorCreditor: false, blockingReasons }
  }
  return {
    certificationStatus: 'PENDING_RECONCILIATION',
    canAssertDebtorCreditor: false,
    blockingReasons,
  }
}
