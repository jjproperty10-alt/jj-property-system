/**
 * P-UI-504b — split report accounts into DISPLAY vs SUMMARY sets.
 *
 * Display (account list / drill-down): report-type scoped, Purchase RETAINED
 *   (shown for reference — does not affect the settlement balance).
 * Summary (headline net + module cards + FinalSummary): additionally excludes
 *   Purchase via filterOwnerFacingSections (Global Owner/Client Perspective Rule),
 *   i.e. identical to the previous single-filter `visibleAccounts` — net unchanged.
 *
 * Kept in a dedicated module (not exported from the Next.js `page.tsx`) so the
 * route file exposes only its default export.
 */
import { filterSectionsByReportType, type ReportType } from './reportTypes'
import { filterOwnerFacingSections } from './executiveSummary'

export function partitionReportAccounts<T extends { account_type: string }>(
  accounts: T[],
  reportType: ReportType,
): { displayAccounts: T[]; summaryAccounts: T[] } {
  const displayAccounts = filterSectionsByReportType(accounts, reportType)
  const summaryAccounts = filterOwnerFacingSections(displayAccounts)
  return { displayAccounts, summaryAccounts }
}
