/**
 * Client cash settlement posting + R-sign helpers. No I/O.
 * R > 0 JJ owes client. R < 0 client owes JJ. S = -R.
 */
import type { ObligationDirection } from './clientObligationFifoModel'
import { applyPaymentToR } from './clientObligationFifoModel'

export const CLIENT_CASH_POLICY = 'client-cash-settlement-v1' as const

export interface CashPostingFields {
  readonly category: 'Management'
  readonly subcategory: 'Bank Payment to Owner' | 'Client Payment'
  readonly payer: 'JJ' | 'Client'
  readonly payee: 'Owner' | 'JJ'
}

export function cashPostingFields(direction: ObligationDirection): CashPostingFields {
  if (direction === 'JJ_TO_CLIENT') {
    return { category: 'Management', subcategory: 'Bank Payment to Owner', payer: 'JJ', payee: 'Owner' }
  }
  return { category: 'Management', subcategory: 'Client Payment', payer: 'Client', payee: 'JJ' }
}

export function signedAllocation(direction: ObligationDirection, applied: number): number {
  if (!(applied > 0)) throw new Error('applied must be positive')
  const rounded = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
  return direction === 'JJ_TO_CLIENT' ? rounded(-applied) : rounded(applied)
}

export { applyPaymentToR }
