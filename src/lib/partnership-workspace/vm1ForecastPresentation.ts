/**
 * VM1 staff forecast labels and grouping. Presentation only — no partner shares,
 * settlement, or recalculation of forecast amounts.
 */

import type { Vm1ForecastLine, Vm1ForecastRecognitionState } from './vm1ForecastCalculator'

export type { Vm1ForecastLine, Vm1ForecastRecognitionState }

export const VM1_FORECAST_SECTION_TITLE = 'Financial Forecast / תחזית כספית' as const

export const VM1_FORECAST_STAFF_NOTE =
  'Internal forecast only — not received cash, not settlement, not Certified.' as const

export const VM1_FORECAST_FINANCIAL_REVIEW_HEADING = 'Financial review / בדיקה כספית' as const

export const VM1_FORECAST_EXCLUDED_HEADING = 'Excluded evidence / ראיות מוחרגות' as const

export const VM1_FORECAST_RECOGNITION_LABEL: Record<Vm1ForecastRecognitionState, string> = {
  excluded: 'Excluded',
  needs_review: 'Needs Review',
  blocked: 'Blocked',
  forecast: 'Forecast',
  completed_pending_reconciliation: 'Completed — pending reconciliation',
}

export const VM1_FORECAST_RECOGNITION_LABEL_HE: Record<Vm1ForecastRecognitionState, string> = {
  excluded: 'מוחרג',
  needs_review: 'נדרשת בדיקה',
  blocked: 'חסום',
  forecast: 'תחזית',
  completed_pending_reconciliation: 'הושלם — ממתין להתאמה',
}

export const VM1_FORECAST_AMOUNT_FIELDS = [
  { key: 'grossRentalRevenue', label: 'Gross (forecast)' },
  { key: 'platformFees', label: 'Platform fee (forecast)' },
  { key: 'guestCleaning', label: 'Guest cleaning (forecast)' },
  { key: 'totalTaxes', label: 'Occupancy tax 9% (forecast)' },
  { key: 'jjManagementCharge', label: 'JJ management charge 20% (forecast)' },
  { key: 'propertyNet', label: 'Property net (forecast)' },
] as const

const FINANCIAL_REVIEW_ORDER: readonly Vm1ForecastRecognitionState[] = [
  'completed_pending_reconciliation',
  'forecast',
  'blocked',
  'needs_review',
]

export function vm1ForecastRecognitionLabel(line: Pick<Vm1ForecastLine, 'recognitionState'>): string {
  return VM1_FORECAST_RECOGNITION_LABEL[line.recognitionState]
}

export function vm1ForecastRecognitionLabelHe(line: Pick<Vm1ForecastLine, 'recognitionState'>): string {
  return VM1_FORECAST_RECOGNITION_LABEL_HE[line.recognitionState]
}

function compareCheckInThenId(a: Vm1ForecastLine, b: Vm1ForecastLine): number {
  const aIn = a.checkIn ?? ''
  const bIn = b.checkIn ?? ''
  if (aIn !== bIn) return aIn < bIn ? -1 : 1
  return a.externalId.localeCompare(b.externalId)
}

export function partitionVm1ForecastLines(lines: readonly Vm1ForecastLine[]): {
  readonly financialReview: readonly Vm1ForecastLine[]
  readonly excludedEvidence: readonly Vm1ForecastLine[]
} {
  const financialReview = lines
    .filter((line) => line.recognitionState !== 'excluded')
    .slice()
    .sort((a, b) => {
      const orderA = FINANCIAL_REVIEW_ORDER.indexOf(a.recognitionState)
      const orderB = FINANCIAL_REVIEW_ORDER.indexOf(b.recognitionState)
      if (orderA !== orderB) return orderA - orderB
      return compareCheckInThenId(a, b)
    })

  const excludedEvidence = lines
    .filter((line) => line.recognitionState === 'excluded')
    .slice()
    .sort(compareCheckInThenId)

  return { financialReview, excludedEvidence }
}
