import type { TimelineStatement, TimelineEvent } from '@/lib/lifecycle/partnerStatementTypes'

interface Props {
  timeline: TimelineStatement
}

/**
 * PartnerTimelineSection
 *
 * Renders ordered lifecycle events as a vertical timeline.
 * Events are pre-ordered (effectiveDate ASC, nulls last) by buildPartnerTimeline().
 * The UI does NOT re-sort.
 * Pending-date events shown with "date unconfirmed" label — P-ARCH-1 (no placeholder dates).
 * No business logic in this component.
 */
export function PartnerTimelineSection({ timeline }: Props) {
  if (timeline.events.length === 0 && !timeline.hasPendingDates) return null

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Timeline</h3>
        {timeline.hasPendingDates && timeline.openVerificationTasks > 0 && (
          <span className="text-[10px] text-amber-600 font-medium">
            {timeline.openVerificationTasks} date{timeline.openVerificationTasks !== 1 ? 's' : ''} pending confirmation
          </span>
        )}
      </div>

      {timeline.events.length === 0 ? (
        <p className="text-xs text-gray-400 italic">No timeline events recorded yet.</p>
      ) : (
        <ol className="relative pl-6 border-l-2 border-gray-100 space-y-5">
          {timeline.events.map((event) => (
            <TimelineEventItem key={event.eventId} event={event} />
          ))}
        </ol>
      )}
    </div>
  )
}

function TimelineEventItem({ event }: { event: TimelineEvent }) {
  const dateLabel = event.effectiveDate
    ? new Date(event.effectiveDate).toLocaleDateString('en-IE', {
        day: 'numeric', month: 'short', year: 'numeric',
      })
    : 'Date unknown'

  return (
    <li className="relative">
      <span className="absolute -left-[1.45rem] top-1 w-3 h-3 rounded-full border-2 border-white bg-blue-400 shadow-sm" />
      <div className="text-[10px] text-gray-400 mb-0.5 flex items-center gap-2">
        <span>{dateLabel}</span>
        {event.effectiveDateConfidence === 'pending_verification' && (
          <span className="text-amber-500 font-medium">date unconfirmed</span>
        )}
      </div>
      <div className="text-sm font-semibold text-gray-800 leading-tight">{event.title}</div>
      {event.description && (
        <div className="text-xs text-gray-500 mt-0.5">{event.description}</div>
      )}
      {event.amountEur !== null && (
        <div className="text-xs text-gray-600 mt-0.5 font-medium">
          {new Intl.NumberFormat('en-IE', {
            style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
          }).format(event.amountEur)}
        </div>
      )}
    </li>
  )
}
