import type { ClientSettlementEvent } from '../clientSettlementTypes'
import { composeClientFifoCredits } from '../clientSettlementFifo'

function ev(over: Partial<ClientSettlementEvent> & Pick<ClientSettlementEvent, 'id' | 'eventType' | 'effectiveDate' | 'settlementAmount' | 'createdAt'>): ClientSettlementEvent {
  return {
    entityId: '11111111-1111-4111-8111-111111111111',
    counterpartyEntityId: over.eventType === 'noncash_settlement_credit' ? '22222222-2222-4222-8222-222222222222' : null,
    sourceTransactionId: over.sourceTransactionId ?? null,
    sourceTransactionDate: over.sourceTransactionDate ?? null,
    reason: 'fixture',
    evidenceRef: 'ev',
    createdBy: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    idempotencyKey: over.id,
    status: 'applied',
    appliedAt: '2026-09-01T00:00:00Z',
    appliedBy: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    ...over,
  }
}

describe('composeClientFifoCredits', () => {
  const noncash = ev({
    id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1',
    eventType: 'noncash_settlement_credit',
    effectiveDate: '2026-05-01',
    settlementAmount: 75,
    createdAt: '2026-09-01T10:00:00Z',
  })
  const include = ev({
    id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2',
    eventType: 'include_transaction_in_settlement',
    effectiveDate: '2026-08-05',
    settlementAmount: 100,
    sourceTransactionId: '33333333-3333-4333-8333-333333333333',
    sourceTransactionDate: '2026-08-05',
    createdAt: '2026-09-01T11:00:00Z',
  })
  const exclude = ev({
    id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee3',
    eventType: 'exclude_transaction_from_settlement',
    effectiveDate: '2026-08-12',
    settlementAmount: 200,
    sourceTransactionId: '44444444-4444-4444-8444-444444444444',
    sourceTransactionDate: '2026-08-12',
    createdAt: '2026-09-01T12:00:00Z',
  })
  const later = ev({
    id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee4',
    eventType: 'noncash_settlement_credit',
    effectiveDate: '2026-09-01',
    settlementAmount: 10,
    createdAt: '2026-09-02T00:00:00Z',
  })
  const openRow = ev({
    id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee5',
    eventType: 'include_transaction_in_settlement',
    effectiveDate: '2026-01-01',
    settlementAmount: 5,
    status: 'open',
    createdAt: '2026-09-01T09:00:00Z',
  })

  test('orders by effective_date then source date then created_at then id', () => {
    const credits = composeClientFifoCredits([include, noncash, exclude], '2026-12-31')
    expect(credits.map((c) => c.settlementAmount)).toEqual([75, 100])
    expect(credits[0].eventType).toBe('noncash_settlement_credit')
    expect(credits[1].eventType).toBe('include_transaction_in_settlement')
  })

  test('omits exclude events and unapplied rows', () => {
    const credits = composeClientFifoCredits([include, exclude, openRow], '2026-12-31')
    expect(credits).toHaveLength(1)
    expect(credits[0].eventId).toBe(include.id)
  })

  test('never returns credits after asOf', () => {
    expect(composeClientFifoCredits([noncash, include, later], '2026-04-30')).toEqual([])
    expect(composeClientFifoCredits([noncash, include, later], '2026-05-01').map((c) => c.settlementAmount)).toEqual([75])
    expect(composeClientFifoCredits([noncash, include, later], '2026-08-05').map((c) => c.settlementAmount)).toEqual([75, 100])
  })

  test('drops an include whose source is excluded', () => {
    const includeSame = ev({
      ...include,
      id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee6',
      sourceTransactionId: exclude.sourceTransactionId,
    })
    expect(composeClientFifoCredits([includeSame, exclude], '2026-12-31')).toEqual([])
  })

  test('same effective_date uses source date NULLS LAST then created_at then id', () => {
    const a = ev({
      id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeea1',
      eventType: 'noncash_settlement_credit',
      effectiveDate: '2026-08-01',
      settlementAmount: 1,
      createdAt: '2026-09-01T10:00:00Z',
    })
    const b = ev({
      id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeea2',
      eventType: 'include_transaction_in_settlement',
      effectiveDate: '2026-08-01',
      settlementAmount: 2,
      sourceTransactionId: '33333333-3333-4333-8333-333333333333',
      sourceTransactionDate: '2026-07-01',
      createdAt: '2026-09-01T11:00:00Z',
    })
    const c = ev({
      id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeea0',
      eventType: 'include_transaction_in_settlement',
      effectiveDate: '2026-08-01',
      settlementAmount: 3,
      sourceTransactionId: '33333333-3333-4333-8333-333333333334',
      sourceTransactionDate: '2026-07-01',
      createdAt: '2026-09-01T11:00:00Z',
    })
    expect(composeClientFifoCredits([a, b, c], '2026-12-31').map((x) => x.settlementAmount)).toEqual([3, 2, 1])
  })
})
