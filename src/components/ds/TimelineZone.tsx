/**
 * TimelineZone — DS primitive for Owner Timeline (Past / Now / Upcoming).
 *
 * Certainty language (OWNER_VERTICAL_SLICE_BRIEF_v1.md Section 5.2):
 * - Filled circle ●  = confirmed event
 * - Open circle ○    = open / pending action
 * - Diamond ◆        = hard contractual deadline
 * - Dashed square ■  = AI forecast — always marked explicitly
 *
 * Rules:
 * - Shape AND text label encode certainty (not color alone)
 * - AI forecast events: dashed row border + square dot + "AI forecast · X% · not confirmed"
 * - motion-reduce safe
 * - RTL isolated
 */

import type { TimelineEventDTO, TimelineDotShape } from '@/lib/owners/ownerWorkspaceTypes'

// ─────────────────────────────────────────────────────────────
// Dot shape renderers
// ─────────────────────────────────────────────────────────────

interface DotProps {
  shape: TimelineDotShape
  label: string
}

function TimelineDot({ shape, label }: DotProps) {
  const base = 'flex-shrink-0 mt-0.5'

  if (shape === 'filled') {
    return (
      <span
        role="img"
        aria-label={label}
        className={`${base} w-3 h-3 rounded-full bg-gray-800`}
      />
    )
  }

  if (shape === 'open') {
    return (
      <span
        role="img"
        aria-label={label}
        className={`${base} w-3 h-3 rounded-full border-2 border-amber-500 bg-white`}
      />
    )
  }

  if (shape === 'diamond') {
    return (
      <span
        role="img"
        aria-label={label}
        className={`${base} w-3 h-3 rotate-45 bg-blue-600`}
        style={{ borderRadius: 2 }}
      />
    )
  }

  // dashed-square — AI forecast
  return (
    <span
      role="img"
      aria-label={label}
      className={`${base} w-3 h-3 border-2 border-dashed border-purple-400 bg-white`}
      style={{ borderRadius: 2 }}
    />
  )
}

// ─────────────────────────────────────────────────────────────
// Individual event row
// ─────────────────────────────────────────────────────────────

interface TimelineEventRowProps {
  event: TimelineEventDTO
}

function TimelineEventRow({ event }: TimelineEventRowProps) {
  const isAiForecast = event.dotShape === 'dashed-square'
  const isOverdue = event.zone === 'now'
  const dateUnconfirmed = event.dateConfidence === 'pending_verification'

  return (
    <div
      className={[
        'flex items-start gap-3 py-3 px-3 rounded-lg transition-colors',
        isAiForecast ? 'border border-dashed border-purple-200 bg-purple-50/30' : '',
        isOverdue ? 'bg-amber-50 border border-amber-200 rounded-lg' : '',
        'motion-reduce:transition-none',
      ].join(' ')}
    >
      {/* Connector line + dot */}
      <div className="flex flex-col items-center gap-1 mt-0.5">
        <TimelineDot shape={event.dotShape} label={event.dotLabel} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-medium text-gray-900">{event.title}</p>
            {event.propertyName && (
              <p className="text-xs text-gray-500 mt-0.5">{event.propertyName}</p>
            )}
          </div>

          {/* Date */}
          <div className="text-right flex-shrink-0">
            {event.date ? (
              <time
                dateTime={event.date}
                className={`text-xs ${dateUnconfirmed ? 'text-gray-400 italic' : 'text-gray-600'}`}
                dir="ltr"
              >
                {formatDate(event.date)}
                {dateUnconfirmed && (
                  <span className="ml-1 text-[10px]" aria-label="Date unconfirmed">
                    (unconfirmed)
                  </span>
                )}
              </time>
            ) : (
              <span className="text-xs text-gray-400" aria-label="Date unknown">—</span>
            )}
          </div>
        </div>

        {/* AI forecast badge */}
        {isAiForecast && event.aiForecast && (
          <div className="mt-1.5 inline-flex items-center gap-1 text-xs text-purple-600 bg-purple-100 rounded px-2 py-0.5">
            <span aria-hidden>■</span>
            {event.aiForecast.label}
          </div>
        )}

        {/* Overdue badge */}
        {isOverdue && (
          <div className="mt-1 inline-flex items-center gap-1 text-xs text-amber-700 font-medium">
            <span aria-hidden>○</span>
            <span>Overdue action required</span>
          </div>
        )}

        {/* Evidence link */}
        {event.evidenceRef && (
          <a
            href={event.evidenceRef}
            className="mt-1 text-xs text-blue-600 hover:text-blue-800 underline block"
            aria-label={`View evidence for ${event.title}`}
          >
            View evidence →
          </a>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Zone header
// ─────────────────────────────────────────────────────────────

interface ZoneHeaderProps {
  zone: 'past' | 'now' | 'upcoming'
  count: number
}

function ZoneHeader({ zone, count }: ZoneHeaderProps) {
  const config = {
    upcoming: { label: 'UPCOMING', icon: '→', color: 'text-blue-700 bg-blue-50 border-blue-200' },
    now: { label: 'NOW', icon: '●', color: 'text-amber-700 bg-amber-50 border-amber-200' },
    past: { label: 'PAST', icon: '○', color: 'text-gray-600 bg-gray-50 border-gray-200' },
  }[zone]

  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-semibold ${config.color}`}>
      <span aria-hidden>{config.icon}</span>
      <span>{config.label}</span>
      <span className="ml-auto text-xs font-normal opacity-70">{count} event{count !== 1 ? 's' : ''}</span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────

export interface TimelineZoneProps {
  events: TimelineEventDTO[]
}

/**
 * Full owner timeline with three zones: UPCOMING → NOW → PAST.
 *
 * Events are rendered newest-first within each zone.
 * AI forecast events are always visually distinguished.
 * Overdue events appear in the NOW zone regardless of original zone.
 */
export function TimelineZone({ events }: TimelineZoneProps) {
  const upcoming = events.filter(e => e.zone === 'upcoming').sort(byDateDesc)
  const now = events.filter(e => e.zone === 'now').sort(byDateDesc)
  const past = events.filter(e => e.zone === 'past').sort(byDateDesc)

  if (events.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <span className="text-3xl" aria-hidden>🕐</span>
        <p className="mt-2 text-sm font-medium">No timeline events</p>
        <p className="text-xs mt-1">Events will appear here as they happen</p>
      </div>
    )
  }

  return (
    <div className="space-y-6" aria-label="Owner timeline">

      {/* UPCOMING */}
      {upcoming.length > 0 && (
        <section aria-labelledby="zone-upcoming">
          <div id="zone-upcoming" className="mb-3">
            <ZoneHeader zone="upcoming" count={upcoming.length} />
          </div>
          <div className="space-y-1 pl-1">
            {upcoming.map(e => <TimelineEventRow key={e.id} event={e} />)}
          </div>
        </section>
      )}

      {/* Divider */}
      {upcoming.length > 0 && (now.length > 0 || past.length > 0) && (
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-xs text-gray-400 font-medium">Today</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>
      )}

      {/* NOW */}
      {now.length > 0 && (
        <section aria-labelledby="zone-now">
          <div id="zone-now" className="mb-3">
            <ZoneHeader zone="now" count={now.length} />
          </div>
          <div className="space-y-1 pl-1">
            {now.map(e => <TimelineEventRow key={e.id} event={e} />)}
          </div>
        </section>
      )}

      {/* PAST */}
      {past.length > 0 && (
        <section aria-labelledby="zone-past">
          <div id="zone-past" className="mb-3">
            <ZoneHeader zone="past" count={past.length} />
          </div>
          <div className="space-y-1 pl-1">
            {past.map(e => <TimelineEventRow key={e.id} event={e} />)}
          </div>
        </section>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function byDateDesc(a: TimelineEventDTO, b: TimelineEventDTO): number {
  if (!a.date && !b.date) return 0
  if (!a.date) return 1
  if (!b.date) return -1
  return b.date.localeCompare(a.date)
}

function formatDate(iso: string): string {
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
