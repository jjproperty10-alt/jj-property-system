/**
 * Avi partner-report visual tokens — aligned with OwnerSettlementPdfV3 / RC3
 * client-report palette (presentation only; no accounting).
 *
 * Source of truth for the approved JJ client look:
 * `src/lib/pdf/OwnerSettlementPdfV3.tsx` (`C` palette) and
 * `src/app/client-report-rc3/page.tsx` (navy masthead).
 */
export const AVI_REPORT_COLORS = {
  navy: '#1e3a5f',
  navyLight: '#2d5a9e',
  navyDeep: '#0d1f36',
  green: '#15803d',
  greenBg: '#f0fdf4',
  greenBorder: '#86efac',
  red: '#b91c1c',
  redBg: '#fef2f2',
  amber: '#92400e',
  amberBg: '#fffbeb',
  grayBg: '#f8fafc',
  grayBorder: '#e2e8f0',
  grayLine: '#f1f5f9',
  grayText: '#64748b',
  grayMid: '#94a3b8',
  grayDark: '#1e293b',
  white: '#ffffff',
  orange: '#c2410c',
  orangeBg: '#fff7ed',
  purple: '#6d28d9',
  purpleBg: '#f5f3ff',
  blue: '#1d4ed8',
  blueBg: '#eff6ff',
} as const
