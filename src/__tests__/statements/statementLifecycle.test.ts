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
  test('re-proposed obligations become included lines with remaining amounts', () => {
    const lines = reproposedDraftLines(reproposal([B, C]), { remainingByTxId: { [B]: 250, [C]: null } })
    expect(lines.map(l => l.sourceTransactionId)).toEqual([B, C])
    expect(lines[0]).toMatchObject({ releaseAmountEur: 250, includeInStatement: true, origin: 'reproposed' })
    // unknown remaining -> 0, surfaced not dropped
    expect(lines[1].releaseAmountEur).toBe(0)
  })

  test('planNextDraftLines merges current + re-proposed, deduped (current wins)', () => {
    const rows = [disp({ transactionId: A, clientAmountEur: 500 }), disp({ transactionId: B, clientAmountEur: 300 })]
    const rp = reproposal([B, C]) // B already in current period -> deduped out
    const lines = planNextDraftLines(rows, rp, { remainingByTxId: { [C]: 90 } })
    expect(lines.map(l => l.sourceTransactionId)).toEqual([A, B, C])
    expect(lines.find(l => l.sourceTransactionId === B)!.origin).toBe('current_period')
    expect(lines.find(l => l.sourceTransactionId === C)!.origin).toBe('reproposed')
  })

  test('empty re-proposal -> just current period', () => {
    const rows = [disp({ transactionId: A })]
    expect(planNextDraftLines(rows, reproposal([])).map(l => l.sourceTransactionId)).toEqual([A])
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
    const lines = planNextDraftLines(rows, reproposal([C]), { remainingByTxId: { [C]: 100 } })
    expect(draftLineTotals(lines)).toEqual({ lineCount: 2, currentPeriodCount: 1, reproposedCount: 1, totalReleaseEur: 600 })
  })
})
