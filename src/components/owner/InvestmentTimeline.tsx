/**
 * InvestmentTimeline — M9-B premium timeline redesign.
 *
 * Design spec:
 *   - Vertical line on the LEFT in LTR (English), RIGHT in RTL (Hebrew)
 *   - One circular dot per event, containing a single lucide-react icon
 *   - No duplicate icon inside the event card itself
 *   - EVENT N label, status badge, large amount, payee subtitle
 *   - Expand/collapse per card (state managed in TimelineEventCard)
 *
 * Visibility rules (unchanged from M9-A / PR #44):
 *   - dto.viewMode is resolved server-side; this component reads it, never sets it
 *   - All data arrives via props — zero DB calls from the client
 *   - P-ARCH-1: null values pass through unchanged (rendered as "Unknown")
 *   - P-ARCH-6: dto.events contains only partner-visible events
 */

'use client'

import { useState } from 'react'
import {
  Handshake,
  Banknote,
  Home,
  Coins,
  HelpCircle,
  TrendingDown,
} from 'lucide-react'
import type { InvestmentTimelineDTO, InvestmentTimelineEventDTO } from '@/lib/lifecycle/timelineTypes'
import { InvestmentSummary } from './InvestmentSummary'
import { EvidenceStatus } from './EvidenceStatus'
import { TimelineEventCard } from './TimelineEventCard'

// ---------------------------------------------------------------------------
// Dot icon — one icon per event type, rendered ONLY in the dot
// ---------------------------------------------------------------------------

function DotIcon({ event }: { event: InvestmentTimelineEventDTO }) {
  const cls = 'w-3.5 h-3.5'

  if (event.eventType === 'partner_entry') {
    return <Handshake className={cls} aria-hidden="true" />
  }
  if (event.eventType === 'ownership_period') {
    return <Home className={cls} aria-hidden="true" />
  }
  if (event.eventType === 'capital_event') {
    if (event.eventSubtype === 'distribution_payment') {
      return <Coins className={cls} aria-hidden="true" />
    }
    if (event.eventSubtype === 'capital_refund' || event.eventSubtype === 'capital_withdrawal') {
      return <TrendingDown className={cls} aria-hidden="true" />
    }
    return <Banknote className={cls} aria-hidden="true" />
  }
  return <HelpCircle className={cls} aria-hidden="true" />
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface Props {
  dto: InvestmentTimelineDTO
  /** JJ admin mode: shows internal events and adminDescription */
  adminMode?: boolean
}

export function InvestmentTimeline({ dto, adminMode }: Props) {
  const [lang, setLang] = useState<'en' | 'he'>('en')
  const isRTL = lang === 'he'

  const noEvents = dto.events.length === 0
  const isAdminMode = adminMode || dto.viewMode === 'admin'

  return (
    <div className="min-h-screen bg-gray-950 text-white" dir={isRTL ? 'rtl' : 'ltr'}>

      {/* ── Header ── */}
      <div className="bg-[#0f172a] border-b border-gray-800 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-lg font-bold tracking-wide">
              {lang === 'he' ? 'ציר זמן השקעה' : 'Investment Timeline'}
            </h1>
            <p className="text-gray-400 text-sm mt-0.5">
              {dto.investor.name} &middot; {dto.property.propertyName}
            </p>
          </div>

          {/* Language toggle */}
          <div className="flex items-center gap-1 bg-gray-900 rounded-lg p-1">
            <button
              onClick={() => setLang('en')}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                lang === 'en' ? 'bg-blue-700 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              EN
            </button>
            <button
              onClick={() => setLang('he')}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                lang === 'he' ? 'bg-blue-700 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              {'עב'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="max-w-3xl mx-auto px-4 py-6">

        {/* Summary bar */}
        <InvestmentSummary summary={dto.summary} lang={lang} />

        {/* Evidence panel — admin only */}
        {isAdminMode && <EvidenceStatus evidence={dto.evidence} lang={lang} />}

        {/* ── Timeline track ── */}
        {noEvents ? (
          <div className="text-center py-16 text-gray-500">
            {lang === 'he'
              ? 'לא נמצאו אירועים עבור נכס זה.'
              : 'No investment events recorded for this property yet.'
            }
          </div>
        ) : (
          /*
           * Track layout:
           *   LTR: line at left-4, cards indented pl-10
           *   RTL: line at right-4, cards indented pr-10
           *
           * data-testid attributes enable automated RTL direction checks.
           */
          <div
            className={`relative ${isRTL ? 'pr-10' : 'pl-10'}`}
            data-testid="timeline-track"
          >
            {/* Vertical line */}
            <div
              className={`
                absolute top-4 bottom-4 w-px bg-gray-700
                ${isRTL ? 'right-[18px]' : 'left-[18px]'}
              `}
              aria-hidden="true"
              data-testid="timeline-line"
              data-line-side={isRTL ? 'right' : 'left'}
            />

            <div className="space-y-3">
              {dto.events.map((event, index) => (
                <div key={event.canonicalEventId} className="relative">

                  {/* ── Dot — icon lives HERE only, never repeated inside the card ── */}
                  <div
                    className={`
                      absolute top-4 z-10
                      w-9 h-9 -mt-1.5 flex items-center justify-center
                      rounded-full bg-gray-800 border border-gray-700 text-gray-300
                      ${isRTL ? '-right-[46px]' : '-left-[46px]'}
                    `}
                    aria-hidden="true"
                    data-testid="timeline-dot"
                    data-event-type={event.eventType}
                  >
                    <DotIcon event={event} />
                  </div>

                  {/* Card — receives eventIndex, NO icon prop */}
                  <TimelineEventCard
                    event={event}
                    lang={lang}
                    viewMode={dto.viewMode}
                    adminMode={isAdminMode}
                    eventIndex={index + 1}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 pt-4 border-t border-gray-800 text-gray-600 text-[11px]">
          {lang === 'he'
            ? `נוצר: ${new Date(dto.generatedAt).toLocaleString('he-IL')}`
            : `Generated: ${new Date(dto.generatedAt).toLocaleString('en-GB')}`
          }
          {' · '}
          {lang === 'he' ? 'קריאה בלבד' : 'Read-only view'}
        </div>
      </div>
    </div>
  )
}
