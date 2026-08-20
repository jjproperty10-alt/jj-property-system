/**
 * JJ Property 10 — Owner/Client Report Composition Contract (G6)
 *
 * SINGLE canonical composition for owner/client-facing reports. Workspace, PDF,
 * and Print MUST derive the owner-facing account set and the Overall / Property
 * Net from HERE — never by calling computeNetOwnerBalance() over raw
 * `report.accounts` (which still contains JJ-internal Purchase).
 *
 * Why this exists (G6):
 *   Before G6, the PDF hero net computed `computeNetOwnerBalance(report.accounts)`
 *   over the UNFILTERED account set, so a property with a Purchase account could
 *   leak JJ-internal acquisition cost into the owner-facing net — diverging from
 *   the Owner Workspace, which computes net over owner-facing sections only.
 *   This contract makes the owner-facing net a single, reconciled quantity.
 *
 * Canonical rule (PR #170, executiveSummary.filterOwnerFacingSections):
 *   ALL Purchase = JJ internal acquisition → excluded from every owner/client
 *   net. Universal — no property exception.
 *
 * ACCOUNTING FREEZE: presentation/composition only. This module does NOT modify
 * balance_effect, closing_balance, client_amount, or any accounting field. It
 * only SELECTS owner-facing sections and SUMS existing closing balances via the
 * existing computeNetOwnerBalance().
 */
import type { RC3PropertyReport, RC3AccountSection } from './types'
import { filterOwnerFacingSections, computeNetOwnerBalance } from './executiveSummary'

export interface OwnerClientReportView {
  reporting_name: string
  from_date: string | null
  to_date: string | null
  /** Owner-facing account sections only (Purchase excluded). */
  ownerFacingAccounts: RC3AccountSection[]
  /** Canonical owner-facing Overall/Property Net for this property. */
  overallNet: number
}

/**
 * Compose the canonical owner/client view for a single property report.
 * The returned `overallNet` is THE owner-facing net for this property and must
 * be used identically by Workspace Property Net, PDF hero net, and Print.
 */
export function getOwnerClientReport(report: RC3PropertyReport): OwnerClientReportView {
  const ownerFacingAccounts = filterOwnerFacingSections(report.accounts)
  return {
    reporting_name: report.reporting_name,
    from_date: report.from_date,
    to_date: report.to_date,
    ownerFacingAccounts,
    overallNet: computeNetOwnerBalance(ownerFacingAccounts),
  }
}

/**
 * Canonical portfolio (multi-property) owner-facing net: sum of per-property
 * owner-facing nets. Used for Owner Summary / Full Owner Report overall net.
 */
export function getPortfolioOwnerNet(reports: RC3PropertyReport[]): number {
  let net = 0
  for (const r of reports) net += getOwnerClientReport(r).overallNet
  return net
}
