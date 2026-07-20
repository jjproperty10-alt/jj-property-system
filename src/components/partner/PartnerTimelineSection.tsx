import type { TimelineStatement } from '@/lib/lifecycle/partnerStatementTypes'
import { HighlightTimeline } from './HighlightTimeline'

interface Props { timeline: TimelineStatement }

/**
 * PartnerTimelineSection — section wrapper for the investment timeline.
 *
 * Event list rendering is delegated to HighlightTimeline (FR-001: single
 * component ownership). This component owns the section header, empty-state
 * copy, and the pending-date badge only.
 *
 * Previously contained inline EventItem — removed. HighlightTimeline is the
 * canonical owner of partner-visible event list rendering.
 */
export function PartnerTimelineSection({ timeline }: Props) {
  if (timeline.events.length === 0 && !timeline.hasPendingDates) return null

  return (
    <section className="px-6 py-6">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-widest text-gray-600">Timeline</h3>
        {timeline.hasPendingDates && timeline.openVerificationTasks > 0 && (
          <span className="text-xs font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
            {timeline.openVerificationTasks}{' '}
            {timeline.openVerificationTasks === 1 ? 'date' : 'dates'} to confirm
          </span>
        )}
      </div>

      {timeline.events.length === 0 ? (
        <p className="mt-3 text-xs text-gray-500 italic">No timeline events recorded yet.</p>
      ) : (
        <HighlightTimeline timeline={timeline} className="mt-4" />
      )}
    </section>
  )
}
