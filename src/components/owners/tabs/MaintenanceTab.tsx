/**
 * Maintenance Tab — "What operational work remains?"
 *
 * Shows open maintenance items grouped by status.
 */

import { EmptyState } from '@/components/ds'
import type { OwnerMaintenanceDTO, MaintenanceStatus } from '@/lib/owners/ownerWorkspaceTypes'

export interface MaintenanceTabProps {
  items: OwnerMaintenanceDTO[]
}

const STATUS_ORDER: MaintenanceStatus[] = ['open', 'in_progress', 'waiting', 'completed', 'verified']

const STATUS_CONFIG: Record<MaintenanceStatus, { label: string; dotClass: string; cardClass: string }> = {
  open: {
    label: 'Open',
    dotClass: 'bg-red-500',
    cardClass: 'border-red-200 bg-red-50',
  },
  in_progress: {
    label: 'In Progress',
    dotClass: 'bg-blue-500',
    cardClass: 'border-blue-200 bg-blue-50',
  },
  waiting: {
    label: 'Waiting',
    dotClass: 'bg-amber-400',
    cardClass: 'border-amber-200 bg-amber-50',
  },
  completed: {
    label: 'Completed',
    dotClass: 'bg-green-400',
    cardClass: 'border-gray-100 bg-white',
  },
  verified: {
    label: 'Verified',
    dotClass: 'bg-emerald-500',
    cardClass: 'border-emerald-100 bg-white',
  },
}

export function MaintenanceTab({ items }: MaintenanceTabProps) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon="🔧"
        headline="No maintenance items"
        message="Open maintenance requests and scheduled work will appear here."
      />
    )
  }

  const byStatus = new Map<MaintenanceStatus, OwnerMaintenanceDTO[]>()
  for (const item of items) {
    const existing = byStatus.get(item.status) ?? []
    byStatus.set(item.status, [...existing, item])
  }

  const openCount = byStatus.get('open')?.length ?? 0
  const inProgressCount = byStatus.get('in_progress')?.length ?? 0

  return (
    <div className="space-y-6">

      {/* Summary bar */}
      {(openCount > 0 || inProgressCount > 0) && (
        <div className="flex gap-3">
          {openCount > 0 && (
            <div className="flex-1 border border-red-200 bg-red-50 rounded-lg px-4 py-3 text-sm text-red-700 font-medium">
              ⚠ {openCount} open item{openCount !== 1 ? 's' : ''}
            </div>
          )}
          {inProgressCount > 0 && (
            <div className="flex-1 border border-blue-200 bg-blue-50 rounded-lg px-4 py-3 text-sm text-blue-700 font-medium">
              ⚡ {inProgressCount} in progress
            </div>
          )}
        </div>
      )}

      {/* Items by status group */}
      {STATUS_ORDER.filter(s => byStatus.has(s)).map(status => {
        const cfg = STATUS_CONFIG[status]
        const groupItems = byStatus.get(status)!

        return (
          <section key={status} aria-labelledby={`maint-${status}-heading`}>
            <h2
              id={`maint-${status}-heading`}
              className="flex items-center gap-2 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3"
            >
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dotClass}`} aria-hidden />
              {cfg.label} ({groupItems.length})
            </h2>

            <ul className="space-y-2" role="list">
              {groupItems.map(item => (
                <li
                  key={item.id}
                  className={`border rounded-lg px-4 py-3 ${cfg.cardClass}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{item.title}</p>
                      {item.ownerImpact && (
                        <p className="text-xs text-gray-600 mt-0.5">{item.ownerImpact}</p>
                      )}
                      <div className="flex flex-wrap items-center gap-3 mt-1.5">
                        <span className="text-xs text-gray-500">{item.propertyName}</span>
                        {item.supplier && (
                          <span className="text-xs text-gray-400">Supplier: {item.supplier}</span>
                        )}
                        {item.estimatedCostEur != null && (
                          <span className="text-xs text-gray-400" dir="ltr">
                            Est: €{parseFloat(item.estimatedCostEur).toLocaleString()}
                          </span>
                        )}
                        {item.actualCostEur != null && (
                          <span className="text-xs font-medium text-gray-700" dir="ltr">
                            Actual: €{parseFloat(item.actualCostEur).toLocaleString()}
                          </span>
                        )}
                      </div>
                      {item.nextAction && (
                        <p className="text-xs text-blue-600 mt-1 font-medium">
                          Next: {item.nextAction}
                        </p>
                      )}
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <time
                        className="text-xs text-gray-400 block"
                        dateTime={item.openedAt}
                        dir="ltr"
                      >
                        {formatDate(item.openedAt)}
                      </time>
                      {item.resolvedAt && (
                        <time
                          className="text-xs text-green-600 block"
                          dateTime={item.resolvedAt}
                          dir="ltr"
                        >
                          Done: {formatDate(item.resolvedAt)}
                        </time>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
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
