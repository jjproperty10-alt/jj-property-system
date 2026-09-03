/**
 * P-UI-504d — Client-report account partitioning (Client Report Privacy Rule).
 *
 * BUSINESS RULE (Yossi — final authority):
 *   `purchase` = JJ's INTERNAL acquisition. It must be COMPLETELY HIDDEN from the
 *   client report / UI / PDF / drill-down / export — its contract, payments, costs
 *   and any of their components never appear in a client-facing view OR summary.
 *   Internal screens (e.g. /properties) preserve Purchase and do not use this
 *   partition. Defense-in-depth: the DTO boundary in clientReportDto.ts is the
 *   primary serialization gate; this module is the screen-level secondary gate.
 *
 * Therefore BOTH sets exclude Purchase via the SINGLE canonical account_type
 * filter (filterOwnerFacingSections), while reportType (full/periodic) scoping is
 * preserved. `displayAccounts` (account list / drill-down) equals
 * `summaryAccounts` (headline net + module cards + FinalSummary).
 *
 * The two-field shape is kept for call-site compatibility with the route.
 * Kept in a dedicated module (not exported from the Next.js `page.tsx`) so the
 * route file exposes only its default export.
 */
import { filterSectionsByReportType, type ReportType } from './reportTypes'
import { filterOwnerFacingSections } from './executiveSummary'

export function partitionReportAccounts<T extends { account_type: string }>(
  accounts: T[],
  reportType: ReportType,
): { displayAccounts: T[]; summaryAccounts: T[] } {
  // reportType scope first, then the canonical Purchase (owner-facing) filter.
  const scoped = filterSectionsByReportType(accounts, reportType)
  const summaryAccounts = filterOwnerFacingSections(scoped)
  // Drill-down uses the SAME owner-facing set — Purchase excluded.
  const displayAccounts = summaryAccounts
  return { displayAccounts, summaryAccounts }
}
