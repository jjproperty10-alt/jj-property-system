/**
 * JJ Property 10 — Executive Summary M2
 * Pure business-logic helpers for the premium owner-facing summary.
 * Rules:
 *  - NEVER modify accounting logic, client_amount, or balance calculations
 *  - Reads computed aggregates from RC3AccountSection only
 *
 * Global Owner/Client Perspective Rule (Yossi, August 2026):
 *   ALL Purchase = JJ internal acquisition. Purchase contributes exactly €0
 *   to Owner/Client settlement. This is a universal rule — no property exception.
 *   Purchase sections are COMPLETELY HIDDEN from all owner/client-facing output:
 *   no summary cards, no detail sections, no transaction rows, no footer/settlement
 *   aggregation, no PDF output, no Print output, no Client Preview output.
 *   JJ internal views preserve Purchase data for audit purposes.
 *
 *   filterOwnerFacingSections() is the SINGLE authoritative filter.
 *   Every consumer that computes an owner/client-facing balance MUST use it.
 *
 * Constitutional:
 *   P-LEDGER-6: COALESCE(client_charge, amount_eur) for owner-facing amounts
 *   P-ARCH-1: NULL = Unknown, never 0
 *   Section 4 CLAUDE.md: Purchase Contract/Deposit ≠ cash movement
 */
import type { RC3AccountSection } from './types'

// ─── Global Owner/Client Perspective Filter ──────────────────────────────────

/**
 * Account types that are JJ-internal and excluded from all owner/client-facing
 * balance computations.
 *
 * Purchase = JJ's acquisition cost. The entire Purchase section (contracts,
 * deposits, payments, expenses) is JJ-internal — settled through Sale when the
 * property is resold. It never enters the Owner/Client net position.
 *
 * This is the SINGLE source of truth for this business rule. Adding a new
 * excluded type here automatically propagates to every consumer:
 * ownerFinancialAdapter, PDF template, Client Report Preview, Settlement Summary.
 */
const JJ_INTERNAL_ACCOUNT_TYPES = new Set<string>(['purchase'])

/**
 * Returns true if this section participates in owner/client-facing balance.
 * Purchase sections are JJ-internal acquisition cost — excluded from
 * Owner Summary, Property Net, Overall Net, PDF, and Client Report.
 */
export function isOwnerFacingSection(section: RC3AccountSection): boolean {
  return !JJ_INTERNAL_ACCOUNT_TYPES.has(section.account_type)
}

/**
 * Filter RC3 account sections to only those relevant to the Owner/Client
 * financial position. This is the SINGLE authoritative filter for the
 * Global Owner/Client Perspective Rule.
 *
 * Use this before ANY computation of owner-facing balances:
 *   - Owner Summary (Overall Net)
 *   - Property Net
 *   - PDF hero balance / final summary
 *   - Client Report Preview dashboard
 *   - Settlement Summary
 *
 * Purchase sections are excluded because they represent JJ's internal
 * acquisition cost, which contributes €0 to the Owner/Client settlement.
 * They remain visible in per-property detail for audit transparency.
 */
export function filterOwnerFacingSections(
  accounts: RC3AccountSection[],
): RC3AccountSection[] {
  return accounts.filter(isOwnerFacingSection)
}

/**
 * Compute net owner balance from owner-facing sections only.
 * Convenience wrapper: filterOwnerFacingSections + computeNetOwnerBalance.
 *
 * Use this when you have raw RC3 accounts and need the owner-facing net
 * in a single call. Purchase is automatically excluded.
 */
export function computeOwnerFacingNet(accounts: RC3AccountSection[]): number {
  return computeNetOwnerBalance(filterOwnerFacingSections(accounts))
}

/**
 * Account types included in the Executive Summary's operational KPIs.
 *
 * "Operational" here means RECURRING INCOME accounts — rental and airbnb —
 * where ongoing income/expense activity drives the owner's periodic balance.
 *
 * Excluded account types and why:
 *   - purchase: capital acquisition, not recurring income
 *   - sale: one-time disposition event, not recurring
 *   - renovation: contract-baseline debt model, not periodic income/expense
 *
 * Renovation IS operationally relevant to JJ, but it uses contract-baseline
 * semantics (debt = contract − payments) rather than periodic income/expense,
 * so it doesn't fit the operational KPI aggregation model.
 */
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
