/**
 * Gate cert - statement lifecycle orchestration (pure) tests.
 * LOCKED: re-proposal feeds the next draft (deduped against current period);
 * only BALANCE_AFFECTING rows become included lines / snapshot entries; amounts
 * are taken verbatim (no recompute); re-proposed lines carry remaining amounts.
 */
import {
  currentPeriodDraftLines,
  reproposedDraftLines,
  planNextDraftLines,
  buildSnapshotEntries,
  draftLineTotals,
} from '@/lib/statements/statementLifecycle'
import type { TransactionDisposition } from '@/lib/statements/types'
import type { ReproposalResult } from '@/lib/statements/reproposal'

function disp(p: Partial<TransactionDisposition>): TransactionDisposition {
  return {
    transactionId: p.transactionId ?? '00000000-0000-0000-0000-000000000000',
    transactionDate: '2026-01-01', propertyName: 'Villa', category: 'rental', subcategory: null,
    description: null, payer: null, payee: null, amountEur: 100, clientCharge: null,
    clientAmountEur: p.clientAmountEur ?? 100, accountType: 'rental', isContractValue: false,
    isPlatformTracking: false, isBpo: p.isBpo ?? false, isBalanceAffecting: p.isBalanceAffecting ?? true,
    bucket: p.bucket ?? 'BALANCE_AFFECTING', balanceEffect: p.balanceEffect ?? 'income',
    displayGroup: p.displayGroup ?? 'income', displayLabel: p.displayLabel ?? 'Rent',
    signedBalanceEffect: p.signedBalanceEffect ?? 100, reason: '', includedInArithmetic: true,
    classifierVersion: 'v1', sourceDataHash: 'h', ...p,
  } as TransactionDisposition
}

function reproposal(ids: string[]): ReproposalResult {
  return { reproposal: ids, presented: [], settled: [], heldDeferred: [], internalOnly: [],
    outcomes: ids.map(id => ({ transactionId: id, disposition: 'open_reproposal', billingState: 'excluded', paymentState: null, presentationStatus: null, remainingEur: null })) }
}

const A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const C = 'cccccccc-cccc-cccc-cccc-cccccccccccc'

describe('current period draft lines = balance-affecting only', () => {
  test('only BALANCE_AFFECTING rows become included lines', () => {
    const rows = [
      disp({ transactionId: A, bucket: 'BALANCE_AFFECTING', clientAmountEur: 500 }),
      disp({ transactionId: B, bucket: 'EXCLUDED' }),
      disp({ transactionId: C, bucket: 'INFORMATIONAL' }),
    ]
    const lines = currentPeriodDraftLines(rows)
    expect(lines.map(l => l.sourceTransactionId)).toEqual([A])
    expect(lines[0]).toMatchObject({ releaseAmountEur: 500, includeInStatement: true, origin: 'current_period' })
  })
})

describe('re-proposal feeds the next draft', () => {
  test('known remaining -> line; UNKNOWN remaining -> unresolved (never a EUR 0 line)', () => {
    const { lines, unresolved } = reproposedDraftLines(reproposal([B, C]), { remainingByTxId: { [B]: 250, [C]: null } })
    expect(lines.map(l => l.sourceTransactionId)).toEqual([B])
    expect(lines[0]).toMatchObject({ releaseAmountEur: 250, includeInStatement: true, origin: 'reproposed' })
    // P-ARCH-1: unknown remaining must NOT become a 0 line; it is surfaced as unresolved
    expect(unresolved).toEqual([{ transactionId: C, reason: 'unknown_remaining_amount' }])
    expect(lines.some(l => l.releaseAmountEur === 0)).toBe(false)
  })

  test('planNextDraftLines merges current + re-proposed, deduped (current wins)', () => {
    const rows = [disp({ transactionId: A, clientAmountEur: 500 }), disp({ transactionId: B, clientAmountEur: 300 })]
    const rp = reproposal([B, C]) // B already in current period -> deduped out
    const plan = planNextDraftLines(rows, rp, { remainingByTxId: { [C]: 90 } })
    expect(plan.lines.map(l => l.sourceTransactionId)).toEqual([A, B, C])
    expect(plan.lines.find(l => l.sourceTransactionId === B)!.origin).toBe('current_period')
    expect(plan.lines.find(l => l.sourceTransactionId === C)!.origin).toBe('reproposed')
    expect(plan.canFinalize).toBe(true)
    expect(plan.unresolved).toEqual([])
  })

  test('unknown-remaining re-proposal blocks finalization', () => {
    const rows = [disp({ transactionId: A, clientAmountEur: 500 })]
    const plan = planNextDraftLines(rows, reproposal([C]), { remainingByTxId: { [C]: null } })
    expect(plan.lines.map(l => l.sourceTransactionId)).toEqual([A]) // C is NOT a line
    expect(plan.unresolved).toEqual([{ transactionId: C, reason: 'unknown_remaining_amount' }])
    expect(plan.canFinalize).toBe(false)
    expect(plan.lines.some(l => l.releaseAmountEur === 0)).toBe(false)
  })

  test('an unknown-remaining obligation already covered by the current period is resolved', () => {
    const rows = [disp({ transactionId: C, clientAmountEur: 300 })]
    const plan = planNextDraftLines(rows, reproposal([C]), { remainingByTxId: { [C]: null } })
    expect(plan.unresolved).toEqual([])
    expect(plan.canFinalize).toBe(true)
  })

  test('empty re-proposal -> just current period, finalizable', () => {
    const rows = [disp({ transactionId: A })]
    const plan = planNextDraftLines(rows, reproposal([]))
    expect(plan.lines.map(l => l.sourceTransactionId)).toEqual([A])
    expect(plan.canFinalize).toBe(true)
  })
})

describe('snapshot entries freeze balance-affecting classification verbatim', () => {
  test('maps balance-affecting rows; excludes others; no recompute', () => {
    const rows = [
      disp({ transactionId: A, bucket: 'BALANCE_AFFECTING', clientAmountEur: 500, signedBalanceEffect: 500, isBpo: false, balanceEffect: 'income', displayGroup: 'income', displayLabel: 'Rent' }),
      disp({ transactionId: B, bucket: 'EXCLUDED' }),
    ]
    const entries = buildSnapshotEntries(rows)
    expect(entries).toHaveLength(1)
    expect(entries[0]).toEqual({
      source_transaction_id: A, released_amount_eur: 500, signed_balance_effect_eur: 500,
      is_balance_affecting: true, is_bpo: false, balance_effect: 'income',
      display_group: 'income', display_label: 'Rent',
    })
  })
})

describe('draft line totals', () => {
  test('counts + release total by origin', () => {
    const rows = [disp({ transactionId: A, clientAmountEur: 500 })]
    const plan = planNextDraftLines(rows, reproposal([C]), { remainingByTxId: { [C]: 100 } })
    expect(draftLineTotals(plan.lines)).toEqual({ lineCount: 2, currentPeriodCount: 1, reproposedCount: 1, totalReleaseEur: 600 })
  })
})
