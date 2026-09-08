/**
 * @module partner-settlement/external-partner/aviCertifiedIdentity
 * @description Single certified Avi partner-report identity (Yossi 2026-09-08).
 *
 * A Certified Avi report DTO must match these four figures. The pre-Hostaway
 * formula snapshot (−€18,900.84) and the superseded 2026-09-05 identity
 * (obligation €300,620.84, net −€380.50) are not certified reports and must
 * fail closed before partners, layers, or print copy are attached.
 *
 * Reconciliation:
 *   paid €280,600.00 + credits €19,744.44 − obligation €299,603.50 = +€740.94
 * A positive net means Avi is owed.
 *
 * No Production ledger writes.
 */

import { AVI_TOTAL_INCOME_CREDIT_EUR } from './hostawayPrintedNto'
import { roundEur } from './roundEur'

export const AVI_CERTIFIED_PAID_EUR = 280_600
export const AVI_CERTIFIED_CREDITS_EUR = AVI_TOTAL_INCOME_CREDIT_EUR
export const AVI_CERTIFIED_OBLIGATION_EUR = 299_603.5
export const AVI_CERTIFIED_NET_EUR = 740.94

const EPS = 0.005

function matchesCertifiedEur(actual: number, expected: number): boolean {
  return Math.abs(roundEur(actual) - expected) < EPS
}

export function aviCertifiedIdentityFailures(share: {
  readonly paidEur: number
  readonly creditsEur: number
  readonly obligationEur: number
  readonly netEur: number
}): string[] {
  const failures: string[] = []
  if (!matchesCertifiedEur(share.paidEur, AVI_CERTIFIED_PAID_EUR)) {
    failures.push('certified_identity_mismatch:paid')
  }
  if (!matchesCertifiedEur(share.creditsEur, AVI_CERTIFIED_CREDITS_EUR)) {
    failures.push('certified_identity_mismatch:credits')
  }
  if (!matchesCertifiedEur(share.obligationEur, AVI_CERTIFIED_OBLIGATION_EUR)) {
    failures.push('certified_identity_mismatch:obligation')
  }
  if (!matchesCertifiedEur(share.netEur, AVI_CERTIFIED_NET_EUR)) {
    failures.push('certified_identity_mismatch:net')
  }
  if (
    !matchesCertifiedEur(
      share.paidEur + share.creditsEur - share.obligationEur,
      roundEur(share.netEur),
    )
  ) {
    failures.push('certified_identity_mismatch:reconciliation')
  }
  if (failures.length > 0) failures.unshift('certified_identity_mismatch')
  return failures
}

/** The four certified figures must themselves reconcile. Guards a bad edit. */
export function aviCertifiedIdentityIsSelfConsistent(): boolean {
  return (
    Math.abs(
      roundEur(AVI_CERTIFIED_PAID_EUR + AVI_CERTIFIED_CREDITS_EUR - AVI_CERTIFIED_OBLIGATION_EUR) -
        AVI_CERTIFIED_NET_EUR,
    ) < EPS
  )
}
