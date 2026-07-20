import React from 'react'
import { MoneyValue } from '@/components/ds'
import type { TimelineStatement } from '@/lib/lifecycle/partnerStatementTypes'

// ─── Locale strings ───────────────────────────────────────────────────────────

type SupportedLocale = 'en' | 'he'

const STRINGS: Record<SupportedLocale, {
  sectionLabel:     string
  datePending:      string
  datePendingLabel: string
  moreEvents:       (n: number) => string
}> = {
  en: {
    sectionLabel:     'What Happened',
    datePending:      'Date pending',
    datePendingLabel: 'Date pending confirmation',
    moreEvents:       (n) => `+${n} more`,
  },
  he: {
    sectionLabel:     'מה קרה',
    datePending:      'תאריך ממתין',
    datePendingLabel: 'תאריך ממתין לאישור',
    moreEvents:       (n) => `+${n} עוד`,
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

/**
 * Returns true when the event's date has not yet been confirmed.
 *
 * Two conditions independently imply pending (P-ARCH-1):
 *   1. effectiveDate is null — date is entirely unknown.
 *   2. effectiveDateConfidence === 'pending_verification' — a date value exists
 *      in the data but has not yet been confirmed from a source document.
 *
 * Color is never the sole signal; callers must also render an explicit
 * accessible label (WCAG 1.4.1 — Use of Color).
 */
function isDatePending(
  effectiveDate: string | null,
  effectiveDateConfidence: string,
): boolean {
  return !effectiveDate || effectiveDateConfidence === 'pending_verification'
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
 * Date confidence indicators (WCAG 1.4.1 — color is never the sole signal):
 *   confirmed + non-null date  → green ✓  [data-testid="event-confirmed-indicator"]
 *   pending_verification or    → amber ⏰  [data-testid="event-pending-indicator"]
 *     null date                   + aria-label "{datePendingLabel}"
 *
 * Filtering contract: the PartnerStatementDTO already marks events as
 * partnerVisible. This component does NOT re-apply business logic — it
 * only enforces the 8-event display cap.
 *
 * null effectiveDate → "Date pending" text (P-ARCH-1).
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
        {shown.map((event) => {
          const pending = isDatePending(
            event.effectiveDate,
            event.effectiveDateConfidence,
          )

          return (
            <li
              key={event.eventId}
              className="flex items-start gap-3"
              data-testid="timeline-event"
            >
              {/* Date confidence indicator — never color alone (WCAG 1.4.1) */}
              {pending ? (
                <span
                  className="mt-0.5 text-amber-400 text-sm select-none"
                  aria-label={s.datePendingLabel}
                  data-testid="event-pending-indicator"
                >
                  ⏰
                </span>
              ) : (
                <span
                  className="mt-0.5 text-green-500 text-sm select-none"
                  aria-hidden="true"
                  data-testid="event-confirmed-indicator"
                >
                  ✓
                </span>
              )}

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

                {/* Date — always shown; "Date pending" text for unconfirmed (P-ARCH-1) */}
                <span
                  className="text-xs text-gray-400"
                  data-testid="event-date"
                >
                  {formatDate(event.effectiveDate, locale)}
                </span>
              </div>
            </li>
          )
        })}
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
