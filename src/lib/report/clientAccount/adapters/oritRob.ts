/**
 * Orit Rob — period account through the universal engine.
 * Identity, scope, and Hebrew gender only. No amounts, balances, or transaction ids.
 * Display groups are row tags (displayGroupKey), not ids stored in this adapter.
 * The report stays blocked until a certified client settlement exists for this entity.
 */

import type { ClientReportAdapter } from './types'

export const ORIT_ROB_PERIOD = { start: '2026-04-01', end: '2026-08-31' } as const

export const oritRobAdapter: ClientReportAdapter = {
  clientSlug: 'orit-rob',
  clientDisplayName: 'אורית רוב',
  reportTitle: 'סיכום חשבון לקוח לתקופה',
  reportLanguage: 'he',
  reportType: 'period_account',
  asOf: ORIT_ROB_PERIOD.end,
  period: ORIT_ROB_PERIOD,
  identity: { kind: 'canonicalName', canonicalNames: ['Orit Rob', 'Orit Rob Pingodes'] },
  strMonthly: ORIT_ROB_PERIOD,
  evidence: () => ({ hebrewOwesForm: 'feminine' as const }),
}
