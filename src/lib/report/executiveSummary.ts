/**
 * JJ Property 10 — Executive Summary M2
 * Pure business-logic helpers for the premium owner-facing summary.
 * Rules:
 *  - NEVER modify accounting logic, client_amount, or balance calculations
 *  - Reads computed aggregates from RC3AccountSection only
 */
import type { RC3AccountSection } from './types'

export const OPERATIONAL_ACCOUNT_TYPES = new Set<string>(['rental', 'airbnb'])

export interface OperationalKPIs {
  income:         number
  expenses:       number
  transfers:      number
  netBalance:     number
  hasOperational: boolean
}

export function computeOperationalKPIs(accounts: RC3AccountSection[]): OperationalKPIs {
  const opAccounts = accounts.filter(a => OPERATIONAL_ACCOUNT_TYPES.has(a.account_type))
  let income = 0, expenses = 0, transfers = 0, netBalance = 0
  for (const acc of opAccounts) {
    income    += acc.total_income
    expenses  += acc.total_expenses
    transfers += acc.total_bpo
    if (acc.balance_convention === 'owner_credit') { netBalance += acc.closing_balance }
    else { netBalance -= acc.closing_balance }
  }
  return { income, expenses, transfers, netBalance, hasOperational: opAccounts.length > 0 }
}

export function computeNetOwnerBalance(accounts: RC3AccountSection[]): number {
  let net = 0
  for (const acc of accounts) {
    if (acc.balance_convention === 'owner_credit') { net += acc.closing_balance }
    else { net -= acc.closing_balance }
  }
  return net
}
