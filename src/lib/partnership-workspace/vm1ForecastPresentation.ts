/**
 * VM1 staff forecast labels. Presentation only — no partner shares or settlement.
 */

import type { Vm1ForecastLine, Vm1ForecastRecognitionState } from './vm1ForecastCalculator'

export const VM1_FORECAST_SECTION_TITLE = 'Financial Forecast / תחזית כספית' as const

export const VM1_FORECAST_STAFF_NOTE =
  'Internal forecast only — not received cash, not settlement, not Certified.' as const

export const VM1_FORECAST_RECOGNITION_LABEL: Record<Vm1ForecastRecognitionState, string> = {
  excluded: 'Excluded',
  needs_review: 'Needs Review',
  blocked: 'Blocked — unknown payout',
  forecast: 'Forecast',
  completed_pending_reconciliation: 'Completed — pending reconciliation',
}

export function vm1ForecastRecognitionLabel(line: Pick<Vm1ForecastLine, 'recognitionState'>): string {
  return VM1_FORECAST_RECOGNITION_LABEL[line.recognitionState]
}
