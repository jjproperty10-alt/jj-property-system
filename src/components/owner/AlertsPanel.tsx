/**
 * AlertsPanel — "needs attention" section on Portfolio Dashboard
 * Phase 2-B — 2026-07-13
 *
 * Surfaces actionable items derived from the ReportingOutput DTO.
 * Phase 2-B: alerts are derived from settlement direction only.
 * Phase 3+: richer alert types (unreviewed transactions, upcoming payments).
 */

import type { PropertySettlementDTO } from '@/lib/ownership/types'

interface Alert {
  propertyName: string
  message: string
}

interface Props {
  settlements: PropertySettlementDTO[]
}

export function AlertsPanel({ settlements }: Props) {
  const alerts: Alert[] = settlements
    .filter(s => s.direction === 'payable_to_jj')
    .map(s => ({
      propertyName: s.propertyName,
      message: 'Balance payable to JJ',
    }))

  if (alerts.length === 0) {
    return (
      <div className="bg-green-50 border border-green-100 rounded-xl px-4 py-3 mb-5 flex items-center gap-2">
        <span className="text-green-500 text-sm">✓</span>
        <span className="text-sm text-green-700">No items need attention</span>
      </div>
    )
  }

  return (
    <div className="mb-5">
      <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">
        Needs Attention
      </div>
      <div className="space-y-2">
        {alerts.map(a => (
          <div
            key={a.propertyName}
            className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-3"
          >
            <span className="text-amber-500 text-sm shrink-0">⚠</span>
            <span className="text-sm font-medium text-gray-800">{a.propertyName}</span>
            <span className="text-gray-300">—</span>
            <span className="text-xs text-gray-600">{a.message}</span>
          </div>
        ))}
      </div>
    </div>
  )
    }
