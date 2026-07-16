import React from 'react'
import { MoneyValue } from '@/components/ds'
import type { TimelineStatement } from '@/lib/lifecycle/partnerStatementTypes'

// ─── Locale strings ───────────────────────────────────────────────────────────

type SupportedLocale = 'en' | 'he'

const STRINGS: Record<SupportedLocale, {
  sectionLabel: string
  datePending: string
  moreEvents: (n: number) => string
}> = {
  en: {
    sectionLabel: 'What Happened',
    datePending:  'Date pending',
    moreEvents:   (n) => `+${n} more`,
  },
  he: {
    sectionLabel: 'מה קרה',
    datePending:  'תאריך ממתין',
    moreEvents:   (n) => `+${n} עוד`,
  },
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Maximum number of events shown before the overflow count. */
const MAX_EVENTS = 8

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Formats an ISO date string as "day Mon" (e.g. "3 Jan").
 * null → locale-specific "Date pending" string (P-ARCH-1).
 * timeZone: 'UTC' prevents off-by-one shifts from DST offsets.
 */
function formatDate(iso: string | null, locale: SupportedLocale): string {
  if (!iso) return STRINGS[locale].datePending
  const d = new Date(iso + 'T00:00:00Z')
  return d.toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-IE', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
}

// ─── Component ────────────────────────────────────────────────────────────────

interface HighlightTimelineProps {
  timeline: TimelineStatement
  /** Display locale. Defaults to 'en'. */
  locale?: SupportedLocale
  className?: string
}

/**
 * HighlightTimeline — Partner Report Story, Section 7
 *
 * Shows partner-visible lifecycle events (partnerVisible === true).
 * Max 8 events; an overflow count appears when more exist.
 *
 * Filtering contract: the PartnerStatementDTO already marks events as
 * partnerVisible. This component does NOT re-apply business logic — it
 * only enforces the 8-event display cap.
 *
 * null effectiveDate → "Date pending" (P-ARCH-1).
 * Zero visible events → renders nothing (silence > empty placeholder).
 */
export function HighlightTimeline({
  timeline,
  locale = 'en',
  className = '',
}: HighlightTimelineProps) {
  const s = STRINGS[locale]
  const visible = timeline.events.filter((e) => e.partnerVisible)

  if (visible.length === 0) return null

  const shown    = visible.slice(0, MAX_EVENTS)
  const overflow = visible.length - MAX_EVENTS

  return (
    <div
      className={`space-y-3 ${className}`.trim()}
      data-testid="highlight-timeline"
    >
      <p className="jj-label text-xs uppercase tracking-widest text-gray-400">
        {s.sectionLabel}
      </p>

      <ol className="space-y-3">
        {shown.map((event) => (
          <li
            key={event.eventId}
            className="flex items-start gap-3"
            data-testid="timeline-event"
          >
            {/* Checkmark — decorative only */}
            <span
              className="mt-0.5 text-green-500 text-sm select-none"
              aria-hidden="true"
            >
              ✓
            </span>

            <div className="flex-1 min-w-0">
              {/* Title + optional amount on same row */}
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium text-gray-800 truncate">
                  {event.title}
                </span>
                {event.amountEur !== null && (
                  <span className="shrink-0" data-testid="event-amount">
                    <MoneyValue amount={event.amountEur} size="sm" />
                  </span>
                )}
              </div>

              {/* Date — always shown (even when pending) */}
              <span
                className="text-xs text-gray-400"
                data-testid="event-date"
              >
                {formatDate(event.effectiveDate, locale)}
              </span>
            </div>
          </li>
        ))}
      </ol>

      {overflow > 0 && (
        <p
          className="text-xs text-gray-400 text-right"
          data-testid="timeline-overflow"
        >
          {s.moreEvents(overflow)}
        </p>
      )}
    </div>
  )
}
