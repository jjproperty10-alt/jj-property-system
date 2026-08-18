/**
 * Pure money helpers — canonical direction + aggregation semantics.
 * No DB, no IO → unit-testable (Jest / ts-jest, node).
 *
 * These encode the LOCKED semantics (Yossi 2026-08-16):
 *   signed certified net position > 0  → counterparty owes JJ  → RECEIVABLE_TO_JJ
 *   signed certified net position < 0  → JJ owes counterparty   → PAYABLE_BY_JJ
 *   signed certified net position == 0 → SETTLED
 */

export type MoneyDirection = 'RECEIVABLE_TO_JJ' | 'PAYABLE_BY_JJ' | 'SETTLED'

/** Map a signed certified net position to canonical direction. */
export function directionFromSignedPosition(signedEur: number): MoneyDirection {
  if (signedEur > 0) return 'RECEIVABLE_TO_JJ'
  if (signedEur < 0) return 'PAYABLE_BY_JJ'
  return 'SETTLED'
}

/** Open amount is always the magnitude of the signed net position. */
export function openAmountFromSigned(signedEur: number): number {
  return Math.abs(signedEur)
}

/** Sum open amounts (strings or numbers) to a 2dp string. Ignores nullish. */
export function sumOpenEur(amounts: ReadonlyArray<string | number | null | undefined>): string {
  const total = amounts.reduce<number>((s, a) => s + (a == null ? 0 : Number(a) || 0), 0)
  return total.toFixed(2)
}
