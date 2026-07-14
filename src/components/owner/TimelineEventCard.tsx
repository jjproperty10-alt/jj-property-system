/**
 * TimelineEventCard — renders a single investment timeline event.
 *
 * Visual design:
 *   - Left border coloured by event type
 *   - Date (or "pending verification") prominently displayed
 *   - Title + optional description
 *   - Amount / ownership change where relevant
 *   - Running capital position badge
 *   - Date confidence indicator
 *
 * P-ARCH-1: null dates shown as "Date pending verification" — never as 01/01.
 * P-ARCH-6: no JJ internal fields rendered here.
 */

import type { InvestmentTimelineEventDTO } from '@/lib/lifecycle/timelineTypes'

const EUR = (n: number) =>
  new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(n)

function formatDate(iso: string | null, lang: 'en' | 'he'): string {
  if (!iso) return lang === 'he' ? 'תאריך ממתין לאימות' : 'Date pending verification'
  try {
    return new Date(iso + 'T00:00:00Z').toLocaleDateString(
      lang === 'he' ? 'he-IL' : 'en-GB',
      { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' },
    )
  } catch {
    return iso
  }
}

const BORDER_COLOUR: Record<string, string> = {
  partner_entry:    'border-blue-500',
  capital_event:    'border-emerald-500',
  ownership_period: 'border-purple-500',
  default:          'border-gray-600',
}

const EVENT_ICON: Record<string, string> = {
  partner_entry:    '🤝',
  ownership_period: '📋',
  capital_event:    '💶',
  default:          '•',
}

function eventIcon(eventType: string, eventSubtype: string | null): string {
  if (eventType === 'capital_event' && eventSubtype === 'distribution_payment') return '🏦'
  return EVENT_ICON[eventType] ?? EVENT_ICON.default
}

function capitalSubtypeLabel(subtype: string | null, lang: 'en' | 'he'): string | null {
  if (!subtype) return null
  const map: Record<string, { en: string; he: string }> = {
    partner_entry_payment:           { en: 'Capital Payment',          he: 'תשלום הון'            },
    partner_acquisition_payment:     { en: 'Payment to Seller',        he: 'תשלום למוכר'          },
    distribution_payment:            { en: 'Distribution',             he: 'חלוקה'                },
    additional_capital_contribution: { en: 'Additional Contribution',  he: 'הון נוסף'             },
    capital_refund:                  { en: 'Capital Refund',           he: 'החזר הון'             },
    capital_withdrawal:              { en: 'Withdrawal',               he: 'משיכת הון'            },
    ownership_increase:              { en: 'Ownership Increase',       he: 'עלייה באחזקה'         },
    ownership_decrease:              { en: 'Ownership Decrease',       he: 'ירידה באחזקה'         },
  }
  return map[subtype]?.[lang] ?? null
}

interface Props {
  event: InvestmentTimelineEventDTO
  lang?: 'en' | 'he'
  /** Show this card in admin mode (shows all events, not just partner-visible) */
  adminMode?: boolean
}

export function TimelineEventCard({ event, lang = 'en', adminMode }: Props) {
  const isRTL = lang === 'he'
  const border = BORDER_COLOUR[event.eventType] ?? BORDER_COLOUR.default
  const icon = eventIcon(event.eventType, event.eventSubtype)
  const isPendingDate = event.effectiveDate === null
  const isEstimated = event.effectiveDateConfidence === 'estimated'
  const subtypeLabel = event.eventType === 'capital_event'
    ? capitalSubtypeLabel(event.eventSubtype, lang)
    : null

  return (
    <div
      className={`relative rounded-xl border border-l-4 ${border} border-gray-800 bg-gray-950 p-4 flex gap-3`}
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      {/* Icon */}
      <span className="text-xl leading-none mt-0.5 flex-shrink-0">{icon}</span>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Title row */}
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <span className="text-white text-sm font-semibold leading-snug">
            {event.title}
          </span>
          {adminMode && !event.partnerVisible && (
            <span className="text-[9px] font-bold uppercase tracking-wide bg-red-900/60 text-red-300 px-1.5 py-0.5 rounded">
              {lang === 'he' ? 'פנימי' : 'Internal'}
            </span>
          )}
        </div>

        {/* Subtype badge */}
        {subtypeLabel && (
          <span className="text-[10px] text-emerald-400 font-medium mt-0.5 block">
            {subtypeLabel}
          </span>
        )}

        {/* Description */}
        {event.description && (
          <p className="text-gray-400 text-xs mt-1 leading-relaxed">{event.description}</p>
        )}

        {/* Amount */}
        {event.amount !== null && (
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <span className="text-white font-semibold text-base">
              {EUR(event.amount)}
            </span>
            {event.capitalPositionAfter !== null && (
              <span className="text-[11px] text-blue-300 bg-blue-900/40 px-2 py-0.5 rounded-full">
                {lang === 'he'
                  ? `הון מצטבר: ${EUR(event.capitalPositionAfter)}`
                  : `Running total: ${EUR(event.capitalPositionAfter)}`
                }
              </span>
            )}
          </div>
        )}

        {/* Ownership change */}
        {event.ownershipPctAfter !== null && (
          <div className="mt-2 flex items-center gap-2 text-sm">
            {event.ownershipPctBefore !== null && (
              <span className="text-gray-500">{event.ownershipPctBefore}%</span>
            )}
            {event.ownershipPctBefore !== null && (
              <span className="text-gray-600">→</span>
            )}
            <span className="text-purple-300 font-semibold">{event.ownershipPctAfter}%</span>
          </div>
        )}

        {/* Source label */}
        {event.sourceLabel && (
          <p className="text-[10px] text-gray-600 mt-2">
            {lang === 'he' ? 'מקור: ' : 'Source: '}{event.sourceLabel}
          </p>
        )}
      </div>

      {/* Date — right column */}
      <div className={`text-right flex-shrink-0 ${isRTL ? 'text-left' : 'text-right'}`}>
        <span className={`text-xs font-medium block ${
          isPendingDate ? 'text-amber-400 italic' : 'text-gray-300'
        }`}>
          {formatDate(event.effectiveDate, lang)}
        </span>
        {isEstimated && !isPendingDate && (
          <span className="text-[9px] text-yellow-600 block mt-0.5">
            {lang === 'he' ? 'מוערך' : 'Estimated'}
          </span>
        )}
      </div>
    </div>
  )
}
