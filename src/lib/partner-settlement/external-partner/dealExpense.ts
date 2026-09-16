/**
 * @module partner-settlement/external-partner/dealExpense
 * @description Pass-through deal/purchase-expense settlement.
 * Deal expenses stay in full and split by ownership %. A partner's payment
 * toward expenses reduces THAT partner's balance once. A conduit recipient
 * is not credited with an investment.
 */

import { roundEur } from './roundEur'
import type { ExternalPartnerOwner } from './types'

export interface ExternalPartnerDealExpenseInput {
  readonly totalDealExpenses: number | null
  readonly owners: readonly ExternalPartnerOwner[]
  readonly paymentsTowardExpenses?: Readonly<Record<string, number>>
  readonly conduitReceipts?: Readonly<Record<string, number>>
}

export interface ExternalPartnerDealExpenseLine {
  readonly partner: string
  readonly ownershipPct: number
  readonly expenseObligation: number | null
  readonly paidTowardExpenses: number
  readonly conduitReceived: number
  readonly balance: number | null
  readonly status: 'computed' | 'blocked'
  readonly blockedReasons: readonly string[]
}

export interface ExternalPartnerDealExpenseResult {
  readonly totalDealExpenses: number | null
  readonly lines: readonly ExternalPartnerDealExpenseLine[]
  readonly integrity: {
    readonly sumObligation: number | null
    readonly obligationTiesToTotal: boolean | null
    readonly sumPaidTowardExpenses: number
    readonly warnings: readonly string[]
  }
}

export function composeExternalPartnerDealExpense(
  input: ExternalPartnerDealExpenseInput,
): ExternalPartnerDealExpenseResult {
  const { totalDealExpenses, owners } = input
  const paid = input.paymentsTowardExpenses ?? {}
  const conduit = input.conduitReceipts ?? {}
  const known = totalDealExpenses !== null
  const lines: ExternalPartnerDealExpenseLine[] = owners.map((o) => {
    const reasons: string[] = []
    const obligation = known
      ? roundEur((totalDealExpenses as number) * o.ownershipPct / 100)
      : null
    if (!known) reasons.push('deal_expenses_unverified')
    const paidTowardExpenses = paid[o.partner] ?? 0
    const conduitReceived = conduit[o.partner] ?? 0
    const balance = obligation !== null ? roundEur(paidTowardExpenses - obligation) : null
    return {
      partner: o.partner,
      ownershipPct: o.ownershipPct,
      expenseObligation: obligation,
      paidTowardExpenses,
      conduitReceived,
      balance,
      status: obligation !== null ? 'computed' : 'blocked',
      blockedReasons: reasons,
    }
  })
  const allComputed = lines.every((l) => l.status === 'computed')
  const sumObligation = allComputed
    ? roundEur(lines.reduce((s, l) => s + (l.expenseObligation as number), 0))
    : null
  const obligationTies =
    sumObligation !== null && known
      ? Math.abs(sumObligation - (totalDealExpenses as number)) < 0.005
      : null
  const warnings: string[] = []
  const ownershipSum = owners.reduce((s, o) => s + o.ownershipPct, 0)
  if (Math.abs(ownershipSum - 100) > 1e-9) {
    warnings.push(`ownership_pct_sums_to_${ownershipSum}_not_100`)
  }
  return {
    totalDealExpenses,
    lines,
    integrity: {
      sumObligation,
      obligationTiesToTotal: obligationTies,
      sumPaidTowardExpenses: roundEur(Object.values(paid).reduce((s, v) => s + v, 0)),
      warnings,
    },
  }
}
