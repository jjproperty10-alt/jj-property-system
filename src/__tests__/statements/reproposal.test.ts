/**
 * G8 - Re-proposal regression lock.
 * LOCKED: excluded/unbilled -> re-propose; Include != paid (presented is not
 * settled and not re-proposed); paymentState 'paid' settles and dominates; null
 * paymentState is never silently settled.
 */
import {
  classifyObligation,
  mustRepropose,
  computeReproposal,
  computeReproposalFromMap,
  type RowBillingState,
} from '@/lib/statements/reproposal'
import type { BillingStateDTO, BillingState, PaymentState, PresentationStatus } from '@/lib/owners/ownerWorkspaceTypes'

function pres(presentationStatus: PresentationStatus, deferUntilDate: string | null = null) {
  return { presentationStatus, deferUntilDate }
}

function st(billingState: BillingState, paymentState: PaymentState | null = null): BillingStateDTO {
  return {
    billingState,
    paymentState,
    draftLineId: null,
    snapshotId: null,
    allocatedAmountEur: null,
    remainingEur: null,
    canRepropose: billingState === 'excluded' || billingState === 'unbilled',
    lastTransitionAt: null,
  }
}

describe('G8 - classifyObligation', () => {
  test('excluded -> open_reproposal (exclude keeps the obligation open)', () => {
    expect(classifyObligation(st('excluded'))).toBe('open_reproposal')
  })
  test('unbilled -> open_reproposal (owed, never proposed yet)', () => {
    expect(classifyObligation(st('unbilled'))).toBe('open_reproposal')
  })
  test('pending / presented -> presented (Include != paid, but it is on a statement)', () => {
    expect(classifyObligation(st('pending'))).toBe('presented')
    expect(classifyObligation(st('presented'))).toBe('presented')
  })
  test('paymentState paid -> settled and dominates every billing state', () => {
    expect(classifyObligation(st('presented', 'paid'))).toBe('settled')
    expect(classifyObligation(st('excluded', 'paid'))).toBe('settled')
    expect(classifyObligation(st('unbilled', 'paid'))).toBe('settled')
    expect(classifyObligation(st('pending', 'paid'))).toBe('settled')
  })
  test('partially_paid does NOT settle (still owed)', () => {
    expect(classifyObligation(st('excluded', 'partially_paid'))).toBe('open_reproposal')
    expect(classifyObligation(st('presented', 'partially_paid'))).toBe('presented')
  })
  test('null paymentState is never silently settled', () => {
    expect(classifyObligation(st('excluded', null))).toBe('open_reproposal')
    expect(classifyObligation(st('presented', null))).toBe('presented')
  })
})

describe('G8 - Include != paid invariant', () => {
  test('a presented (included) but unpaid charge is neither settled nor re-proposed', () => {
    const s = st('presented', 'unpaid')
    expect(mustRepropose(s)).toBe(false)
    expect(classifyObligation(s)).toBe('presented')
  })
})

describe('G8 - computeReproposal (deterministic, order-preserving)', () => {
  const rows: RowBillingState[] = [
    { transactionId: 'a', state: st('excluded') },        // re-propose
    { transactionId: 'b', state: st('presented', 'unpaid') }, // presented
    { transactionId: 'c', state: st('unbilled') },        // re-propose
    { transactionId: 'd', state: st('presented', 'paid') }, // settled
    { transactionId: 'e', state: st('pending') },         // presented
    { transactionId: 'f', state: st('excluded', 'paid') }, // settled (paid dominates)
  ]

  test('buckets are correct and input order preserved', () => {
    const r = computeReproposal(rows)
    expect(r.reproposal).toEqual(['a', 'c'])
    expect(r.presented).toEqual(['b', 'e'])
    expect(r.settled).toEqual(['d', 'f'])
    expect(r.outcomes.map(o => o.transactionId)).toEqual(['a', 'b', 'c', 'd', 'e', 'f'])
  })

  test('outcome carries billing + payment state through', () => {
    const r = computeReproposal([{ transactionId: 'x', state: st('excluded', 'partially_paid') }])
    expect(r.outcomes[0]).toMatchObject({
      transactionId: 'x', disposition: 'open_reproposal',
      billingState: 'excluded', paymentState: 'partially_paid',
    })
  })

  test('empty input -> empty result (no coercion)', () => {
    expect(computeReproposal([])).toEqual({
      reproposal: [], presented: [], settled: [], heldDeferred: [], internalOnly: [], outcomes: [],
    })
  })
})

describe('G8 - presentation override governs WHEN, never the money', () => {
  test('internal_only is suppressed from the owner statement (never re-proposed)', () => {
    const s = st('excluded')
    expect(classifyObligation(s, pres('internal_only'))).toBe('internal_only')
  })
  test('next_statement forces re-proposal of an open charge', () => {
    // even a presented charge explicitly moved to next_statement re-proposes
    expect(classifyObligation(st('presented', 'unpaid'), pres('next_statement'))).toBe('open_reproposal')
    expect(classifyObligation(st('excluded'), pres('next_statement'))).toBe('open_reproposal')
  })
  test('defer_until_date holds until asOf reaches the date, then re-proposes', () => {
    const s = st('excluded')
    const p = pres('defer_until_date', '2026-06-01')
    expect(classifyObligation(s, p, '2026-05-31')).toBe('held_deferred') // before
    expect(classifyObligation(s, p, '2026-06-01')).toBe('open_reproposal') // on/after
    expect(classifyObligation(s, p, '2026-07-15')).toBe('open_reproposal')
  })
  test('defer with no asOf (or no date) stays held (unknown is not proposed)', () => {
    expect(classifyObligation(st('excluded'), pres('defer_until_date', '2026-06-01'))).toBe('held_deferred')
    expect(classifyObligation(st('excluded'), pres('defer_until_date', null), '2026-06-01')).toBe('held_deferred')
  })
  test('include_now defers to the billing-state rule', () => {
    expect(classifyObligation(st('excluded'), pres('include_now'))).toBe('open_reproposal')
    expect(classifyObligation(st('presented', 'unpaid'), pres('include_now'))).toBe('presented')
  })
  test('payment paid dominates every presentation status', () => {
    expect(classifyObligation(st('excluded', 'paid'), pres('next_statement'))).toBe('settled')
    expect(classifyObligation(st('excluded', 'paid'), pres('internal_only'))).toBe('settled')
    expect(classifyObligation(st('excluded', 'paid'), pres('defer_until_date', '2026-06-01'), '2026-05-01')).toBe('settled')
  })
  test('computeReproposal buckets deferred and internal_only separately', () => {
    const rows = [
      { transactionId: 'a', state: st('excluded'), presentation: pres('next_statement') },
      { transactionId: 'b', state: st('excluded'), presentation: pres('internal_only') },
      { transactionId: 'c', state: st('excluded'), presentation: pres('defer_until_date', '2026-09-01') },
      { transactionId: 'd', state: st('unbilled') },
    ]
    const r = computeReproposal(rows, { asOf: '2026-08-20' })
    expect(r.reproposal).toEqual(['a', 'd'])
    expect(r.internalOnly).toEqual(['b'])
    expect(r.heldDeferred).toEqual(['c'])
    expect(r.outcomes[0].presentationStatus).toBe('next_statement')
  })
})

describe('G8 - computeReproposalFromMap', () => {
  test('reads a resolveBillingStates-style Map, preserving insertion order', () => {
    const m = new Map<string, BillingStateDTO>()
    m.set('t1', st('excluded'))
    m.set('t2', st('presented', 'paid'))
    m.set('t3', st('unbilled'))
    const r = computeReproposalFromMap(m)
    expect(r.reproposal).toEqual(['t1', 't3'])
    expect(r.settled).toEqual(['t2'])
  })
})
