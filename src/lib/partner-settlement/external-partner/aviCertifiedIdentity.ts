/**
 * @module partner-settlement/external-partner/aviCertifiedIdentity
 * @description Single certified Avi partner-report identity.
 *
 * A Certified Avi report DTO must match these four figures. Older snapshots
 * (pre-Hostaway −€18,900.84; superseded 2026-09-05 net −€380.50; and the
 * September-2026-stay identity net +€740.94) are not certified and must fail
 * closed before partners, layers, or print copy are attached.
 *
 * Reconciliation (after excluding the September 2026 Hostaway stay and
 * September recurring Airbnb operations):
 *   paid €280,600.00 + credits €19,495.25 − obligation €299,501.00 = +€594.25
 * A positive net means Avi is owed.
 *
 * No Production ledger writes.
 */

import { AVI_TOTAL_INCOME_CREDIT_EUR } from './hostawayPrintedNto'
import { roundEur } from './roundEur'

export const AVI_CERTIFIED_PAID_EUR = 280_600
export const AVI_CERTIFIED_CREDITS_EUR = AVI_TOTAL_INCOME_CREDIT_EUR
export const AVI_CERTIFIED_OBLIGATION_EUR = 299_501
export const AVI_CERTIFIED_NET_EUR = 594.25

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
