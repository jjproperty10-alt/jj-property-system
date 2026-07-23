/**
 * Relationship Tab — "What have JJ and the owner communicated, promised and agreed?"
 *
 * The relationship ledger: commitments, messages, promises, key conversations.
 * Arranged newest-first. Internal notes (audience='jj') are filtered out.
 * AI-generated entries are clearly labeled.
 */

import { EmptyState } from '@/components/ds'
import type { OwnerRelationshipEventDTO, RelationshipEventType } from '@/lib/owners/ownerWorkspaceTypes'

export interface RelationshipTabProps {
  events: OwnerRelationshipEventDTO[]
}

const TYPE_CONFIG: Partial<Record<RelationshipEventType, { icon: string; label: string; labelClass: string }>> = {
  whatsapp: { icon: '💬', label: 'WhatsApp', labelClass: 'text-green-600' },
  email: { icon: '📧', label: 'Email', labelClass: 'text-blue-600' },
  call: { icon: '📞', label: 'Call', labelClass: 'text-indigo-600' },
  meeting_note: { icon: '🗓', label: 'Meeting', labelClass: 'text-purple-600' },
  promise: { icon: '🤝', label: 'Promise', labelClass: 'text-amber-700' },
  approval: { icon: '✅', label: 'Approval', labelClass: 'text-green-600' },
  decision: { icon: '⚖', label: 'Decision', labelClass: 'text-gray-700' },
  internal_note: { icon: '🔒', label: 'Internal Note', labelClass: 'text-gray-400' },
  ai_summary: { icon: '🤖', label: 'AI Summary', labelClass: 'text-purple-500' },
}

export function RelationshipTab({ events }: RelationshipTabProps) {
  // Filter out JJ-internal events from owner-facing display
  const visibleEvents = events.filter(e => e.audience !== 'jj')

  if (visibleEvents.length === 0) {
    return (
      <EmptyState
        icon="🤝"
        title="No relationship history yet"
        description="Communications, promises, approvals and agreements will appear here."
      />
    )
  }

  // Newest first
  const sorted = [...visibleEvents].sort(
    (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
  )

  // Group by year + month for timeline feel
  const groups = groupByMonth(sorted)

  return (
    <div className="space-y-6">
      {groups.map(({ monthKey, label, items }) => (
        <section key={monthKey} aria-labelledby={`rel-${monthKey}-heading`}>
          <h2
            id={`rel-${monthKey}-heading`}
            className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3"
          >
            {label}
          </h2>

          <ul className="space-y-2" role="list">
            {items.map(event => {
              const cfg = TYPE_CONFIG[event.type] ?? { icon: '•', label: event.type, labelClass: 'text-gray-500' }
              return (
                <li
                  key={event.id}
                  className="flex items-start gap-3 border border-gray-100 rounded-lg px-4 py-3 bg-white"
                >
                  {/* Icon */}
                  <span className="text-base flex-shrink-0 mt-0.5" aria-hidden>
                    {cfg.icon}
                  </span>

                  <div className="flex-1 min-w-0">
                    {/* Type label + date + author */}
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <span className={`text-xs font-semibold ${cfg.labelClass}`}>{cfg.label}</span>
                      <time
                        className="text-xs text-gray-400"
                        dateTime={event.occurredAt}
                        dir="ltr"
                      >
                        {formatDate(event.occurredAt.slice(0, 10))}
                      </time>
                      {event.authorName && (
                        <span className="text-xs text-gray-400">· {event.authorName}</span>
                      )}
                    </div>

                    {/* Summary */}
                    <p className="text-sm text-gray-900">{event.summary}</p>

                    {/* Property context */}
                    {event.propertyName && (
                      <p className="text-xs text-gray-400 mt-1">{event.propertyName}</p>
                    )}

                    {/* AI-generated label */}
                    {event.isAiGenerated && (
                      <p
                        className="text-xs text-purple-500 mt-1 italic"
                        aria-label={`AI generated summary${event.aiConfidencePct != null ? ` with ${event.aiConfidencePct}% confidence` : ''}`}
                      >
                        AI summary
                        {event.aiConfidencePct != null && ` · ${event.aiConfidencePct}% confidence`}
                        {' · not confirmed'}
                      </p>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

interface MonthGroup {
  monthKey: string
  label: string
  items: OwnerRelationshipEventDTO[]
}

function groupByMonth(events: OwnerRelationshipEventDTO[]): MonthGroup[] {
  const map = new Map<string, OwnerRelationshipEventDTO[]>()
  for (const e of events) {
    const d = new Date(e.occurredAt)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const existing = map.get(key) ?? []
    map.set(key, [...existing, e])
  }
  return Array.from(map.entries()).map(([key, items]) => ({
    monthKey: key,
    label: new Date(`${key}-01`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
    items,
  }))
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return iso
  }
}
