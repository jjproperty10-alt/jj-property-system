/**
 * Services Tab — "What services are active on each property?"
 *
 * P2 PR #3: Properties & Services UI
 *
 * Displays service engagements grouped by property.
 * Within each property: active services first, then historical (closed/suspended).
 *
 * Read-only — no editing, no financials.
 * Empty state renders cleanly when lifecycle.service_engagements has 0 rows (normal).
 *
 * Architecture:
 * - Receives OwnerServiceEngagementsDTO from page (server component)
 * - Uses DS components: EmptyState, StatusBadge, SectionHeader
 * - No client-side data fetching
 * - P-ARCH-1: null dates rendered as em dash, never "Unknown"
 */

import { EmptyState, StatusBadge } from '@/components/ds'
import type {
  OwnerServiceEngagementsDTO,
  PropertyServiceEngagementsDTO,
  ServiceEngagementDTO,
  ServiceType,
  ServiceEngagementStatus,
} from '@/lib/owners/ownerWorkspaceTypes'
import type { StatusToken } from '@/lib/ds/tokens'

// ─── Display mappings ────────────────────────────────────────────────────────

const SERVICE_TYPE_LABELS: Record<ServiceType, string> = {
  renovation: 'Renovation',
  sale: 'Sale',
  management_ltr: 'Management (LTR)',
  airbnb_str: 'Airbnb (STR)',
}

const STATUS_MAP: Record<ServiceEngagementStatus, { token: StatusToken; label: string }> = {
  active: { token: 'active', label: 'Active' },
  draft: { token: 'pending', label: 'Draft' },
  suspended: { token: 'attention', label: 'Suspended' },
  closed: { token: 'completed', label: 'Closed' },
}

/** Active/draft sort before closed/suspended */
const STATUS_SORT_ORDER: Record<ServiceEngagementStatus, number> = {
  active: 0,
  draft: 1,
  suspended: 2,
  closed: 3,
}

// ─── Props ───────────────────────────────────────────────────────────────────

export interface ServicesTabProps {
  dto: OwnerServiceEngagementsDTO
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ServicesTab({ dto }: ServicesTabProps) {
  if (dto.totalEngagements === 0) {
    return (
      <EmptyState
        icon="📋"
        title="No services configured"
        description="Service engagements for each property will appear here once configured."
      />
    )
  }

  return (
    <div className="space-y-8">
      {dto.properties.map(property => (
        <PropertyServiceGroup key={property.propertyId} property={property} />
      ))}
    </div>
  )
}

// ─── Property group ──────────────────────────────────────────────────────────

function PropertyServiceGroup({ property }: { property: PropertyServiceEngagementsDTO }) {
  const displayName = property.propertyName ?? property.propertyId.slice(0, 8)

  // Sort: active/draft first, then suspended/closed
  const sorted = [...property.engagements].sort(
    (a, b) => STATUS_SORT_ORDER[a.status] - STATUS_SORT_ORDER[b.status]
  )

  const activeCount = sorted.filter(e => e.status === 'active' || e.status === 'draft').length
  const historicalCount = sorted.length - activeCount

  return (
    <section aria-labelledby={`property-${property.propertyId}`}>
      {/* Property header */}
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h3
          id={`property-${property.propertyId}`}
          className="text-sm font-semibold text-gray-900"
        >
          {displayName}
        </h3>
        <span className="text-xs text-gray-400">
          {activeCount > 0 && `${activeCount} active`}
          {activeCount > 0 && historicalCount > 0 && ' · '}
          {historicalCount > 0 && `${historicalCount} closed`}
        </span>
      </div>

      {/* Engagements list */}
      <ul className="space-y-2" role="list">
        {sorted.map(engagement => (
          <ServiceEngagementRow key={engagement.id} engagement={engagement} />
        ))}
      </ul>
    </section>
  )
}

// ─── Single engagement row ───────────────────────────────────────────────────

function ServiceEngagementRow({ engagement }: { engagement: ServiceEngagementDTO }) {
  const typeLabel = SERVICE_TYPE_LABELS[engagement.serviceType] ?? engagement.serviceType
  const { token, label } = STATUS_MAP[engagement.status] ?? { token: 'unknown' as StatusToken, label: engagement.status }

  return (
    <li className="border border-gray-100 bg-white rounded-lg px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Service type + status */}
          <div className="flex items-center gap-2.5">
            <span className="text-sm font-medium text-gray-900">{typeLabel}</span>
            <StatusBadge status={token} label={label} />
          </div>

          {/* Date range */}
          <div className="flex items-center gap-1.5 mt-1.5">
            <span className="text-xs text-gray-500" dir="ltr">
              {formatDate(engagement.effectiveFrom)}
              {' — '}
              {engagement.effectiveTo ? formatDate(engagement.effectiveTo) : 'Present'}
            </span>
          </div>

          {/* Notes (if present) */}
          {engagement.notes && (
            <p className="text-xs text-gray-400 mt-1 line-clamp-2">{engagement.notes}</p>
          )}
        </div>
      </div>
    </li>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}
