/**
 * statementPresentation — PRESENTATION-ONLY helpers for the owner PDF.
 *
 * These functions decide how already-computed figures are LABELLED and GROUPED
 * in the client statement. They never change a balance, never recompute the net,
 * and contain no hardcoded property names or amounts. All values come from the
 * canonical RC3 DTO produced by fetchReport/computeBalance.
 *
 * Findings addressed (see PDF review):
 *   #1 splitOperatingIncome     — a rental/airbnb "Client Payment" is a
 *                                 cross-property settlement (credit), not rent.
 *   #2 renovationGroupHeaders   — in a renovation (debt) account the 'income'
 *                                 group holds client payments (Payments Received)
 *                                 and the 'expense' group holds Extras
 *                                 (Additional Approved Charges).
 *   #3 computeStatementComponents — explanatory component lines; NOT a balance.
 */
import type { RC3AccountSection } from './types'
import { t, type Lang } from './labels'

/** #2 — Corrected group headers for the renovation (debt) account. */
export function renovationGroupHeaders(lang: Lang): { income: string; expense: string } {
  return {
    // 'income' display_group = client payments (credits reducing debt)
    income: t('expensesRenov', lang),   // "Payments Received"
    // 'expense' display_group = Extras (charges added to debt)
    expense: t('incomeRenov', lang),    // "Additional Approved Charges"
  }
}

/**
 * #1 — Split an operating account's income-group rows into genuine rent income
 * vs cross-property settlements. A "Client Payment" in a rental/airbnb account
 * is a credit used to settle another property/account — not rental income.
 * Tenant Payments (rent) remain in `income`.
 */
export function splitOperatingIncome<T extends { subcategory: string | null }>(
  rows: T[],
): { income: T[]; settlements: T[] } {
  const settlements = rows.filter(r => r.subcategory === 'Client Payment')
  const income = rows.filter(r => r.subcategory !== 'Client Payment')
  return { income, settlements }
}

export interface StatementComponents {
  renovationContract: number
  approvedExtras: number
  paymentsReceived: number
  crossPropertySettlements: number
  propertyExpenses: number
}

/**
 * #3 — Explanatory breakdown of the statement into separate components.
 * PRESENTATION ONLY: these lines help a reader see contract, extras, payments,
 * settlements and expenses apart. They do NOT sum to the final balance and must
 * never be used to recompute it — the canonical net is authoritative.
 */
export function computeStatementComponents(accounts: RC3AccountSection[]): StatementComponents {
  let renovationContract = 0
  let approvedExtras = 0
  let paymentsReceived = 0
  let crossPropertySettlements = 0
  let propertyExpenses = 0

  for (const acc of accounts) {
    if (acc.account_type === 'renovation' || acc.account_type === 'sale' || acc.account_type === 'purchase') {
      if (acc.account_type === 'renovation') renovationContract += acc.contract_baseline
      for (const r of acc.rows) {
        if (r.subcategory === 'Extras') approvedExtras += r.client_amount
        else if (r.display_group === 'income') paymentsReceived += r.client_amount
      }
    } else if (acc.account_type === 'rental' || acc.account_type === 'airbnb') {
      for (const r of acc.rows) {
        if (r.subcategory === 'Client Payment') crossPropertySettlements += r.client_amount
        else if (r.display_group === 'expense') propertyExpenses += r.client_amount
      }
    }
  }
  return { renovationContract, approvedExtras, paymentsReceived, crossPropertySettlements, propertyExpenses }
}
