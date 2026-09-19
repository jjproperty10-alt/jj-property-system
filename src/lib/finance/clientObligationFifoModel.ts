/**
 * Pure client-obligation FIFO model (R-sign).
 * R > 0: JJ owes the client. R < 0: client owes JJ. S = -R.
 * No I/O.
 */

export type ObligationDirection = 'JJ_TO_CLIENT' | 'CLIENT_TO_JJ'

export const OBLIGATION_FIFO_POLICY = 'client-obligation-fifo-v2' as const

export function applyPaymentToR(direction: ObligationDirection, r: number, payment: number): number {
  if (!(payment > 0)) throw new Error('payment must be positive')
  const rounded = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
  return direction === 'JJ_TO_CLIENT' ? rounded(r - payment) : rounded(r + payment)
}

export function sFromR(r: number): number {
  return Math.round((-r + Number.EPSILON) * 100) / 100
}

export interface ObligationSlice {
  readonly propertyId: string
  readonly sourceLineIdentity: string
  readonly remainingSignedAmount: number
  readonly effectiveDate: string
  readonly certificationVersion: number
}

export interface FifoLine {
  readonly propertyId: string
  readonly sourceLineIdentity: string
  readonly openingRemainingAmount: number
  readonly amountApplied: number
  readonly remainingAfter: number
}

export function allocateObligationFifo(
  slices: readonly ObligationSlice[],
  direction: ObligationDirection,
  payment: number,
): { allocations: FifoLine[]; allocatedTotal: number; unappliedRemainder: number } {
  if (!(payment > 0)) throw new Error('payment must be positive')
  const wantPositive = direction === 'JJ_TO_CLIENT'
  const ordered = slices
    .filter((s) => (wantPositive ? s.remainingSignedAmount > 0 : s.remainingSignedAmount < 0))
    .slice()
    .sort((a, b) => {
      if (a.effectiveDate !== b.effectiveDate) return a.effectiveDate < b.effectiveDate ? -1 : 1
      if (a.certificationVersion !== b.certificationVersion) return a.certificationVersion - b.certificationVersion
      if (a.sourceLineIdentity !== b.sourceLineIdentity) return a.sourceLineIdentity < b.sourceLineIdentity ? -1 : 1
      return a.propertyId < b.propertyId ? -1 : 1
    })
  const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
  let remain = round(payment)
  const allocations: FifoLine[] = []
  for (const slice of ordered) {
    if (remain <= 0) break
    const opening = round(Math.abs(slice.remainingSignedAmount))
    const applied = round(Math.min(remain, opening))
    if (applied <= 0) continue
    allocations.push({
      propertyId: slice.propertyId,
      sourceLineIdentity: slice.sourceLineIdentity,
      openingRemainingAmount: opening,
      amountApplied: applied,
      remainingAfter: round(opening - applied),
    })
    remain = round(remain - applied)
  }
  const allocatedTotal = round(allocations.reduce((s, a) => s + a.amountApplied, 0))
  if (round(allocatedTotal + remain) !== round(payment)) {
    throw new Error('FIFO invariant failed')
  }
  return { allocations, allocatedTotal, unappliedRemainder: remain }
}
