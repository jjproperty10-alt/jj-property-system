/**
 * client-report — presentation-only building blocks for the RC3 client report.
 *
 * Every component here is pure presentation: it receives already-computed data
 * through typed props and renders it. None of them contain financial formulas,
 * data queries, cross-property-offset logic, STR calculations, hardcoded
 * property names, or production writes.
 *
 * DTO GAP (documented, deferred): OwnerGeneralPaymentsSection is intentionally
 * NOT implemented in this pass. The RC3 DTO (RC3PropertyReport / RC3AccountSection)
 * has no owner-level general-payments concept — only per-account `total_bpo` /
 * `is_bpo` rows, which is not the same as a cross-property owner-level payment.
 * A future controlled DTO pass must first define its authoritative source,
 * report-period treatment, allocation status, balance effect, and double-count
 * prevention before that section is added.
 */
export { ReportPeriodHeader, type ReportPeriodHeaderProps, type ReportTypeLite } from './ReportPeriodHeader'
export { PropertySection, type PropertySectionProps, type PropertySectionTotals, type BalanceConventionLite } from './PropertySection'
export { OpeningClosingBalance, type OpeningClosingBalanceProps } from './OpeningClosingBalance'
export { TransactionDrilldown, type TransactionDrilldownProps } from './TransactionDrilldown'
export { SectionStatusBadge, type SectionStatusBadgeProps, type SectionStatus, type StatusMode } from './SectionStatusBadge'
export { ReportScopeSummary, type ReportScopeSummaryProps } from './ReportScopeSummary'
export { formatEur } from './formatEur'
