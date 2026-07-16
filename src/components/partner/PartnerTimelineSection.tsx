import type { TimelineStatement, TimelineEvent } from '@/lib/lifecycle/partnerStatementTypes'

interface Props { timeline: TimelineStatement }

const eur = (n: number) =>
  new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)

/**
 * PartnerTimelineSection — PR D: Modern Visual Polish
 *
 * Business logic UNCHANGED from PR C. Visual changes:
 * - No outer card wrapper (section lives inside article divide-y stack)
 * - Verification task count shown as a styled pill badge
 * - Timeline dot uses solid blue-500 with white border ring
 * - Unconfirmed dates shown with amber "· unconfirmed" inline label
 * - Empty state still returns null when no events and no pending dates
 * - tabular-nums on date strings
 *
 * P-ARCH-1: effectiveDate null renders as "Date unknown" — not coerced to a date.
 * Events are pre-ordered by the service (dated ASC, null-date last, UUID tie-break).
 * The UI does NOT re-sort.
 */
export function PartnerTimelineSection({ timeline }: Props) {
  if (timeline.events.length === 0 && !timeline.hasPendingDates) return null

  return (
    <section className="px-6 py-6">
      <div className="flex items-center justify-between">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Timeline</h3>
        {timeline.hasPendingDates && timeline.openVerificationTasks > 0 && (
          <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
            {timeline.openVerificationTasks}{' '}
            {timeline.openVerificationTasks === 1 ? 'date' : 'dates'} to confirm
          </span>
        )}
      </div>

      {timeline.events.length === 0 ? (
        <p className="mt-3 text-xs text-gray-400 italic">No timeline events recorded yet.</p>
      ) : (
        <ol className="mt-4 relative pl-5 border-l-2 border-gray-100 space-y-5">
          {timeline.events.map((event) => (
            <EventItem key={event.eventId} event={event} />
          ))}
        </ol>
      )}
    </section>
  )
}

function EventItem({ event }: { event: TimelineEvent }) {
  const dateLabel = event.effectiveDate
    ? new Date(event.effectiveDate).toLocaleDateString('en-IE', {
        day: 'numeric', month: 'short', year: 'numeric',
      })
    : 'Date unknown'

  const isPending = event.effectiveDateConfidence === 'pending_verification'

  return (
    <li className="relative">
      {/* Timeline dot */}
      <span className="absolute -left-[1.45rem] top-1 w-3 h-3 rounded-full border-2 border-white bg-blue-500 shadow-sm" />

      <div className="flex items-center gap-2 mb-0.5">
        <span className="text-[10px] tabular-nums text-gray-400">{dateLabel}</span>
        {isPending && (
          <span className="text-[10px] font-semibold text-amber-500">· unconfirmed</span>
        )}
      </div>

      <div className="text-sm font-semibold text-gray-800 leading-snug">{event.title}</div>
      {event.description && (
        <div className="text-xs text-gray-500 mt-0.5 leading-relaxed">{event.description}</div>
      )}
      {event.amountEur !== null && (
        <div className="text-xs font-semibold text-gray-600 mt-0.5 tabular-nums">{eur(event.amountEur)}</div>
      )}
    </li>
  )
}
