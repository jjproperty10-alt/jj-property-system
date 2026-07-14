/**
 * TimelineEventCard — M9-B redesign.
 *
 * Design rules:
 *   - NO icon inside this card (icon lives only in the dot, rendered by InvestmentTimeline)
 *   - "EVENT N" label always visible (collapsed + expanded)
 *   - Status badge always visible (collapsed + expanded)
 *   - Amount is the primary visual element (largest text on the card)
 *   - partnerDescription shown as payee/subtitle line when present
 *   - Smooth 200ms expand/collapse via max-height transition
 *   - Status colour is the ONLY accent: rest of card uses neutral surfaces
 *
 * Visibility rules (unchanged from M9-A / PR #44):
 *   - Uses event.partnerDescription in partner mode (never adminDescription)
 *   - Uses event.dateDisplay (null when pending) — never event.effectiveDate
 *   - P-ARCH-1: null values show "Unknown" / "Date pending verification"
 *   - P-ARCH-6: no JJ internal fields rendered here
 */

'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { InvestmentTimelineEventDTO, TimelineViewMode } from '@/lib/lifecycle/timelineTypes'

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

const EUR = (n: number) =>
  new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(n)

/** Returns safe date label — uses dateDisplay (null when pending), never effectiveDate */
function formatDate(dateDisplay: string | null, lang: 'en' | 'he'): string {
  if (!dateDisplay) {
    return lang === 'he' ? 'תאריך ממתין לאימות' : 'Date pending verification'
  }
  try {
    return new Date(dateDisplay + 'T00:00:00Z').toLocaleDateString(
      lang === 'he' ? 'he-IL' : 'en-GB',
      { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' },
    )
  } catch {
    return dateDisplay
  }
}

// ---------------------------------------------------------------------------
// Status badge — 4 states, colour is the ONLY accent on the card
// ---------------------------------------------------------------------------

type BadgeStatus = 'verified' | 'pending_verification' | 'planned' | 'unknown'

/**
 * Resolves badge status from event DTO.
 * Uses dateStatus as the primary signal.
 * 'verified' = confirmed date and verified source.
 */
function resolveBadgeStatus(event: InvestmentTimelineEventDTO): BadgeStatus {
  if (event.dateStatus === 'confirmed')            return 'verified'
  if (event.dateStatus === 'pending_verification') return 'pending_verification'
  // 'unknown' dateStatus or any other value maps to unknown
  return 'unknown'
}

const BADGE_CLASSES: Record<BadgeStatus, string> = {
  verified:             'bg-emerald-900/60 text-emerald-300 border border-emerald-800/60',
  pending_verification: 'bg-amber-900/60   text-amber-300   border border-amber-800/60',
  planned:              'bg-blue-900/60    text-blue-300    border border-blue-800/60',
  unknown:              'bg-gray-800       text-gray-500    border border-gray-700',
}

const BADGE_TEXT: Record<BadgeStatus, { en: string; he: string }> = {
  verified:             { en: 'Verified',             he: 'מאומת'          },
  pending_verification: { en: 'Pending verification', he: 'ממתין לאימות'   },
  planned:              { en: 'Planned',              he: 'מתוכנן'         },
  unknown:              { en: 'Unknown',              he: 'לא ידוע'        },
}

interface BadgeProps { status: BadgeStatus; lang: 'en' | 'he' }

function StatusBadge({ status, lang }: BadgeProps) {
  return (
    <span
      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${BADGE_CLASSES[status]}`}
      data-testid="status-badge"
      data-status={status}
    >
      {BADGE_TEXT[status][lang]}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Event title map — human-readable, NO icons (icons are in the dot only)
// ---------------------------------------------------------------------------

const BASE_TITLE: Record<string, { en: string; he: string }> = {
  partner_entry:    { en: 'Partnership Agreement',  he: 'הסכם שותפות'      },
  capital_event:    { en: 'Capital Payment',        he: 'תשלום הון'        },
  ownership_period: { en: 'Ownership Established',  he: 'בעלות הוקמה'      },
}

const SUBTYPE_TITLE: Record<string, { en: string; he: string }> = {
  partner_entry_payment:           { en: 'Capital Payment',          he: 'תשלום הון'         },
  partner_acquisition_payment:     { en: 'Capital Payment',          he: 'תשלום הון'         },
  distribution_payment:            { en: 'Distribution',             he: 'חלוקה'             },
  additional_capital_contribution: { en: 'Additional Contribution',  he: 'הון נוסף'          },
  capital_refund:                  { en: 'Capital Refund',           he: 'החזר הון'          },
  capital_withdrawal:              { en: 'Withdrawal',               he: 'משיכת הון'         },
}

function resolveTitle(event: InvestmentTimelineEventDTO, lang: 'en' | 'he'): string {
  if (event.eventType === 'capital_event' && event.eventSubtype) {
    return SUBTYPE_TITLE[event.eventSubtype]?.[lang]
      ?? BASE_TITLE.capital_event[lang]
  }
  return BASE_TITLE[event.eventType]?.[lang]
    ?? (lang === 'he' ? 'אירוע השקעה' : 'Investment Event')
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface Props {
  event: InvestmentTimelineEventDTO
  lang?: 'en' | 'he'
  viewMode?: TimelineViewMode
  adminMode?: boolean
  /** 1-based position in the timeline; used for the "EVENT N" label */
  eventIndex: number
}

export function TimelineEventCard({
  event,
  lang = 'en',
  viewMode = 'partner',
  adminMode,
  eventIndex,
}: Props) {
  const [isOpen, setIsOpen] = useState(false)

  const badgeStatus  = resolveBadgeStatus(event)
  const title        = resolveTitle(event, lang)
  const isPendingDate = badgeStatus === 'pending_verification' || badgeStatus === 'unknown'

  /*
   * Description field selection (unchanged from PR #44 — P-ARCH-6):
   *   partner mode → partnerDescription (pre-sanitized, no forbidden keywords)
   *   admin mode   → adminDescription (raw notes) with partnerDescription as fallback
   *
   * We show the description ONLY in the expanded section, never in collapsed.
   */
  const displayDescription = viewMode === 'admin'
    ? (event.adminDescription ?? event.partnerDescription)
    : event.partnerDescription

  return (
    <div
      className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden"
      data-testid="timeline-event-card"
      data-event-type={event.eventType}
      data-event-index={eventIndex}
    >

      {/* Collapsed section (always visible) */}
      <div className="p-4">

        {/* Row 1: EVENT N label + status badge */}
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <span
            className="text-[10px] font-bold text-gray-600 tracking-[0.1em] uppercase"
            data-testid="event-label"
          >
            {lang === 'he' ? `נירוע ${eventIndex}` : `EVENT ${eventIndex}`}
          </span>
          {/* Badge always visible */}
          <StatusBadge status={badgeStatus} lang={lang} />
        </div>

        { /* Row 2: event title */}
        <p
          className="text-gray-400 text-xs font-medium mb-1.5 leading-none"
          data-testid="event-title"
        >
          {title}
        </p>

        {/* Row 3: amount — primary visual */}
        {event.amount !== null && (
          <p
            className="text-white text-[1.6rem] font-semibold leading-tight mb-1"
            data-testid="event-amount"
          >
            {EUR(event.amount)}
          </p>
        )}

        {event.amount === null && event.ownershipPctAfter !== null && (
          <p
            className="text-white text-[1.6rem] font-semibold leading-tight mb-1"
            data-testid="event-ownership-pct"
          >
            {event.ownershipPctAfter}%
          </p>
        )}

        {displayDescription && (
          <p
            className="text-gray-400 text-sm leading-snug"
            data-testid="event-subtitle"
          >
            {displayDescription}
          </p>
        )}

        {event.capitalPositionAfter !== null && (
          <p className="text-gray-600 text-[11px] mt-1.5">
            {lang === 'he'
              ? `הון מצצטבר: ${EUR(event.capitalPositionAfter)}`
              : `Running total: ${EUR(event.capitalPositionAfter)}`
            }
          </p>
        )}
      </div>

      <button
        className="w-full flex items-center justify-between px-4 py-2.5 border-t border-gray-800 text-gray-500 hover:text-gray-300 hover:bg-gray-800/40 transition-colors"
        onClick={() => setIsOpen(o => !o)}
        aria-expanded={isOpen}
        data-testid="expand-toggle"
      >
        <span className="text-xs">
          {lang === 'he'
            ? (isOpen ? 'הסתר פרטים' : 'פרטים')
            : (isOpen ? 'Hide details' : 'Details')
          }
        </span>
        <ChevronDown
          className={`w-4 h-4 transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      <div
        className="overflow-hidden"
        style={{
          maxHeight:  isOpen ? '800px' : '0',
          transition: 'max-height 200ms ease-in-out',
        }}
        data-testid="expanded-details"
        aria-hidden={!isOpen}
      >
        <div className="px-4 pb-5 pt-3 border-t border-gray-800">
          <div className="grid grid-cols-2 gap-x-8 gap-y-4">

            <div>
              <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-1">
                {lang === 'he' ? 'תאריך' : 'Date'}
              </p>
              <p className={`text-sm font-medium ${
                isPendingDate ? 'text-amber-400' : 'text-gray-200'
              }`}>
                {formatDate(event.dateDisplay, lang)}
              </p>
            </div>

            {event.sourceLabel && (
              <div>
                <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-1">
                  {lang === 'he' ? 'מקור' : 'Source'}
                </p>
                <p className="text-gray-200 text-sm font-medium">{event.sourceLabel}</p>
              </div>
            )}

            {event.ownershipPctAfter !== null && (
              <div>
                <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-1">
                  {lang === 'he' ? 'בעלות' : 'Ownership'}
                </p>
                <p className="text-gray-200 text-sm font-medium">{event.ownershipPctAfter}%</p>
              </div>
            )}

            {event.capitalPositionAfter !== null && (
              <div>
                <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-1">
                  {lang === 'he' ? 'הון מצטבר' : 'Capital position'}
                </p>
                <p className="text-gray-200 text-sm font-medium">
                  {EUR(event.capitalPositionAfter)}
                </p>
              </div>
            )}

          </div>

          {adminMode && !event.partnerVisible && (
            <div className="mt-3 pt-3 border-t border-gray-800">
              <span className="text-[9px] font-bold uppercase tracking-wide bg-red-900/50 text-red-300 px-2 py-0.5 rounded">
                {lang === 'he' ? 'פנימי' : 'Internal'}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
