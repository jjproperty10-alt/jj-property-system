/**
 * @module partner-settlement/external-partner/aviCertifiedIdentity
 * @description Single certified Avi partner-report identity (Yossi 2026-09-05).
 *
 * A Certified Avi report DTO must match these four figures. The pre-Hostaway
 * formula snapshot (−€18,900.84) is not a certified report and must fail closed
 * before partners, layers, or print copy are attached.
 *
 * No Production ledger writes.
 */

import { AVI_TOTAL_INCOME_CREDIT_EUR } from './hostawayPrintedNto'
import { roundEur } from './roundEur'

export const AVI_CERTIFIED_PAID_EUR = 280_600
export const AVI_CERTIFIED_CREDITS_EUR = AVI_TOTAL_INCOME_CREDIT_EUR
export const AVI_CERTIFIED_OBLIGATION_EUR = 300_620.84
export const AVI_CERTIFIED_NET_EUR = -380.5

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
  if (failures.length > 0) failures.unshift('certified_identity_mismatch')
  return failures
}
