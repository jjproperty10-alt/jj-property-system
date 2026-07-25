/**
 * Maintenance Tab — "What operational work remains?"
 *
 * G3-A: Updated to consume OwnerMaintenanceItemDTO (RC3 renovation records).
 *
 * Contract change (2026-07-25): items typed as OwnerMaintenanceItemDTO[] instead of
 * OwnerMaintenanceDTO[]. RC3 provides financial renovation records only — lifecycle
 * status (open/in_progress/waiting/completed/verified) is not available at this layer.
 * Lifecycle status classification is deferred to RC2 scope.
 *
 * Rendered fields: title, propertyName, date, amountEur, subcategory.
 * Not rendered: supplier, ownerImpact, nextAction, resolvedAt, estimatedCostEur, evidenceRefs.
 */

import { EmptyState } from '@/components/ds'
import type { OwnerMaintenanceItemDTO } from '@/lib/owners/ownerWorkspaceTypes'

export interface MaintenanceTabProps {
  items: OwnerMaintenanceItemDTO[]
}

export function MaintenanceTab({ items }: MaintenanceTabProps) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon="🔧"
        title="No maintenance items"
        description="Open maintenance requests and scheduled work will appear here."
      />
    )
  }

  return (
    <div className="space-y-6">

      {/* Status notice — lifecycle tracking not available at RC3 layer */}
      <div className="border border-gray-200 bg-gray-50 rounded-lg px-4 py-3 text-sm text-gray-600">
        Renovation records from accounting. Lifecycle status tracking requires RC2.
      </div>

      {/* Items list — sorted by date desc (adapter guarantee) */}
      <ul className="space-y-2" role="list">
        {items.map(item => (
          <li
            key={item.id}
            className="border border-gray-100 bg-white rounded-lg px-4 py-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">{item.title}</p>
                <div className="flex flex-wrap items-center gap-3 mt-1.5">
                  <span className="text-xs text-gray-500">{item.propertyName}</span>
                  {item.subcategory && (
                    <span className="text-xs text-gray-400">{item.subcategory}</span>
                  )}
                  {item.amountEur != null && (
                    <span className="text-xs font-medium text-gray-700" dir="ltr">
                      €{parseFloat(item.amountEur).toLocaleString()}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-1">Status not tracked</p>
              </div>
              <div className="flex-shrink-0 text-right">
                <time
                  className="text-xs text-gray-400 block"
                  dateTime={item.date}
                  dir="ltr"
                >
                  {formatDate(item.date)}
                </time>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return iso
  }
}
