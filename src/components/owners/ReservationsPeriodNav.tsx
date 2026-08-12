/**
 * ReservationsPeriodNav — month navigation for the Owner Reservations / STR screen.
 *
 * Presentational, URL-driven (server-rendered anchors — no client state). The page computes
 * all hrefs and labels; this component only renders them. Owned by the "make STR screen useful"
 * PR (FR-001: single component ownership).
 *
 * Product intent:
 *  - always show which month is displayed
 *  - move previous / next month
 *  - if the view auto-defaulted to the latest active month (because the current month had no
 *    activity), say so explicitly (never silently change the user's month)
 *  - offer a one-click jump to the latest active period when the selected month is empty
 */

export interface ReservationsPeriodNavProps {
  readonly selectedLabel: string
  readonly prevHref: string
  readonly nextHref: string
  /** Shown when the view auto-defaulted to the latest active month. */
  readonly autoDefaultedLabel?: string | null
  /** Latest active period jump — shown when the selected month has no activity. */
  readonly latestActiveLabel?: string | null
  readonly latestActiveHref?: string | null
}

export function ReservationsPeriodNav({
  selectedLabel,
  prevHref,
  nextHref,
  autoDefaultedLabel,
  latestActiveLabel,
  latestActiveHref,
}: ReservationsPeriodNavProps) {
  return (
    <div data-testid="reservations-period-nav" className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <a
          href={prevHref}
          data-testid="res-period-prev"
          className="text-sm px-3 py-1.5 rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50"
          aria-label="Previous month"
        >
          ‹ Prev
        </a>
        <div data-testid="res-period-label" className="text-sm font-semibold text-gray-900" dir="ltr">
          {selectedLabel}
        </div>
        <a
          href={nextHref}
          data-testid="res-period-next"
          className="text-sm px-3 py-1.5 rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50"
          aria-label="Next month"
        >
          Next ›
        </a>
      </div>

      {autoDefaultedLabel ? (
        <div data-testid="res-period-autodefault" className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-1.5">
          Current month has no reservations — showing latest active period: <strong>{autoDefaultedLabel}</strong>.
        </div>
      ) : null}

      {latestActiveLabel && latestActiveHref ? (
        <a
          href={latestActiveHref}
          data-testid="res-period-latest-link"
          className="text-xs text-blue-700 hover:underline self-start"
        >
          View latest active period: {latestActiveLabel} →
        </a>
      ) : null}
    </div>
  )
}
