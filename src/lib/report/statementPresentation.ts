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
import type { DisplayGroup } from './types'
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

export interface OperatingIncomeSplit {
  /** Genuine operating income (Tenant Payment etc.) — real rental/platform income. */
  rentalIncome: number
  /** Cross-property settlements (a "Client Payment" credit used to settle another account). */
  crossPropertySettlements: number
}

/**
 * #1 (summary/KPI surface) — Split an OPERATING account's income into genuine
 * operating income vs cross-property settlements, at the aggregate (total) level.
 *
 * This is the KPI-level companion to splitOperatingIncome (which splits rows for
 * the detail tables). It exists so Rental Income / Operational Income KPIs never
 * fold in a "Client Payment" settlement — the same rule, defined once.
 *
 * Uses balance_effect so `rentalIncome + crossPropertySettlements` reconciles
 * EXACTLY to the account's total_income (income-group rows are precisely the
 * balance_effect > 0 rows in a rental/airbnb account). PRESENTATION ONLY — it
 * never changes a balance and contains no hardcoded names or amounts.
 *
 * Only meaningful for rental/airbnb accounts; callers guard by account_type.
 *
 * Structural param (screen reuse, 2026-08-24): typed to the minimal row shape it
 * reads, so BOTH the raw RC3AccountSection (PDF, server-side) AND the client-safe
 * ClientReportSection DTO (the /client-report-rc3 screen) can be passed. This is
 * the SAME single classification rule for PDF and screen — no duplicated logic.
 * Backward-compatible: RC3AccountSection remains assignable, existing callers
 * are unaffected.
 */
interface OperatingIncomeRowsSection {
  rows: ReadonlyArray<{ display_group: DisplayGroup; subcategory: string | null; balance_effect: number }>
}
export function splitOperatingIncomeTotals(section: OperatingIncomeRowsSection): OperatingIncomeSplit {
  let rentalIncome = 0
  let crossPropertySettlements = 0
  for (const r of section.rows) {
    if (r.display_group !== 'income') continue
    if (r.subcategory === 'Client Payment') crossPropertySettlements += r.balance_effect
    else rentalIncome += r.balance_effect
  }
  return { rentalIncome, crossPropertySettlements }
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
 *
 * Structural param (screen reuse, 2026-08-24): same rationale as
 * splitOperatingIncomeTotals — accepts both the raw RC3AccountSection (PDF) and
 * the client-safe ClientReportSection DTO (screen). Backward-compatible.
 */
interface StatementComponentsSection {
  account_type:      string
  contract_baseline: number
  rows:              ReadonlyArray<{ subcategory: string | null; display_group: DisplayGroup; client_amount: number }>
}
export function computeStatementComponents(accounts: readonly StatementComponentsSection[]): StatementComponents {
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
