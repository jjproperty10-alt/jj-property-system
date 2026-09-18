/**
 * Pure certified-settlement presentation helpers.
 * No DB. No RC3 totals. No contact-settlement arithmetic.
 */

import type {
  CertifiedClientSettlementAvailable,
  CertifiedClientSettlementDto,
  CertifiedClosingDirection,
  CertifiedFifoCreditLine,
} from './certifiedClientSettlementTypes'

export function roundCertifiedEur(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

export function certifiedCents(n: number): number | null {
  if (!Number.isFinite(n)) return null
  const cents = Math.round(n * 100)
  if (Math.abs(n * 100 - cents) > 1e-6) return null
  return cents
}

export function closingDirectionFromDueToJj(closingDueToJj: number): CertifiedClosingDirection {
  if (Math.abs(closingDueToJj) < 0.005) return 'settled'
  return closingDueToJj > 0 ? 'client_owes_jj' : 'jj_owes_client'
}

/** FIFO credits reduce the amount due to JJ. Display as a negative settlement line. */
export function fifoCreditDisplayAmount(credit: CertifiedFifoCreditLine): number {
  return roundCertifiedEur(-Math.abs(credit.settlementAmount))
}

/**
 * Certified closing = opening − FIFO credits. Exclusions are never subtracted.
 * Extra RC3 / contact / Jumbo / rent figures are not inputs.
 */
export function composeCertifiedClosingDueToJj(
  openingDueToJj: number,
  fifoCreditsTotal: number,
): number {
  return roundCertifiedEur(openingDueToJj - fifoCreditsTotal)
}

export function isCertifiedAvailable(
  dto: CertifiedClientSettlementDto | null | undefined,
): dto is CertifiedClientSettlementAvailable {
  return dto != null && dto.unavailable === false
}

export function certifiedHeroLabelKey(
  direction: CertifiedClosingDirection,
): 'certClosingDueToJj' | 'certClosingDueToClient' | 'balSettled' {
  if (direction === 'client_owes_jj') return 'certClosingDueToJj'
  if (direction === 'jj_owes_client') return 'certClosingDueToClient'
  return 'balSettled'
}

export function certifiedToOwnerBalanceDirection(
  closingDueToJj: number,
): 'owner_owes_jj' | 'jj_owes_owner' | 'balanced' {
  const direction = closingDirectionFromDueToJj(closingDueToJj)
  if (direction === 'client_owes_jj') return 'owner_owes_jj'
  if (direction === 'jj_owes_client') return 'jj_owes_owner'
  return 'balanced'
}

export function fifoCreditLabelKey(
  credit: CertifiedFifoCreditLine,
): 'certNoncashCredit' | 'certIncludedCash' {
  return credit.cash ? 'certIncludedCash' : 'certNoncashCredit'
}

/** Contact settlement / RC3 net must never be added to certified closing. */
export function certifiedClosingIgnoresContactAndRc3(
  certified: CertifiedClientSettlementAvailable,
  _contactNetJjSettlement: number | null,
  _rc3Net: number | null,
): number {
  void _contactNetJjSettlement
  void _rc3Net
  return certified.closingDueToJj
}
