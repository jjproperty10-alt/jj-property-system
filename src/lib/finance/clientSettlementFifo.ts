/**
 * Pure client-FIFO composer. Mirrors finance.client_fifo_credits ordering:
 * effective_date → source transaction date (NULLS LAST) → created_at → event id.
 * Credits with effective_date after asOf are never returned.
 */

import type {
  ClientFifoCredit,
  ClientSettlementEvent,
} from './clientSettlementTypes'

function roundEur(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

function compareCredits(a: ClientFifoCredit, b: ClientFifoCredit): number {
  if (a.effectiveDate !== b.effectiveDate) return a.effectiveDate < b.effectiveDate ? -1 : 1
  const ad = a.sourceTransactionDate
  const bd = b.sourceTransactionDate
  if (ad !== bd) {
    if (ad == null) return 1
    if (bd == null) return -1
    return ad < bd ? -1 : 1
  }
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1
  return a.eventId < b.eventId ? -1 : 1
}

export function composeClientFifoCredits(
  events: readonly ClientSettlementEvent[],
  asOf: string,
): ClientFifoCredit[] {
  if (!asOf) throw new Error('as_of is required')
  const excluded = new Set(
    events
      .filter(
        (e) =>
          e.status === 'applied' &&
          e.eventType === 'exclude_transaction_from_settlement' &&
          e.sourceTransactionId != null,
      )
      .map((e) => e.sourceTransactionId as string),
  )

  const credits: ClientFifoCredit[] = []
  for (const e of events) {
    if (e.status !== 'applied') continue
    if (e.effectiveDate > asOf) continue
    if (
      e.eventType !== 'noncash_settlement_credit' &&
      e.eventType !== 'include_transaction_in_settlement'
    ) {
      continue
    }
    if (e.sourceTransactionId && excluded.has(e.sourceTransactionId)) continue
    credits.push({
      eventId: e.id,
      eventType: e.eventType,
      settlementAmount: roundEur(e.settlementAmount),
      effectiveDate: e.effectiveDate,
      sourceTransactionId: e.sourceTransactionId,
      sourceTransactionDate: e.sourceTransactionDate,
      createdAt: e.createdAt,
    })
  }
  return credits.sort(compareCredits)
}
