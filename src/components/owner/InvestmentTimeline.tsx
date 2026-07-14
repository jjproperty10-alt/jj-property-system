/**
 * InvestmentTimeline -- the full Investment Timeline view.
 *
 * Composes: InvestmentSummary -> EvidenceStatus -> timeline event list.
 *
 * This is a Client Component to support lang toggle and RTL switching.
 * All data arrives via props - no DB calls from the client.
 *
 * P-ARCH-1: passes null values through unchanged - InvestmentSummary renders them as "Unknown".
 * P-ARCH-6: dto.events contains only partner-visible events (filtered in timelineService).
 *
 * Visibility model:
 * - dto.viewMode is resolved server-side by timelineService.
 * - This component uses dto.viewMode to determine which description field to pass
 *   to TimelineEventCard ('partner' -> partnerDescription, 'admin' -> adminDescription).
 * - The UI does NOT make visibility decisions - it only renders pre-sanitized fields.
 */

'use client'

import { useState } from 'react'
import type { InvestmentTimelineDTO } from '@/lib/lifecycle/timelineTypes'
import { InvestmentSummary } from './InvestmentSummary'
import { EvidenceStatus } from './EvidenceStatus'
import { TimelineEventCard } from './TimelineEventCard'

interface Props {
  dto: InvestmentTimelineDTO
  /** JJ admin mode: shows all events including internal ones (future use) */
  adminMode?: boolean
}

export function InvestmentTimeline({ dto, adminMode }: Props) {
  const [lang, setLang] = useState<'en' | 'he'>('en')
  const isRTL = lang === 'he'

  const noEvents = dto.events.length === 0
  // Effective admin mode: explicit prop OR dto.viewMode === 'admin'
  const isAdminMode = adminMode || dto.viewMode === 'admin'

  return (
    <div className="min-h-screen bg-gray-950 text-white" dir={isRTL ? 'rtl' : 'ltr'}>

      {/* Header */}
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

      <div className="max-w-3xl mx-auto px-4 py-6">

        {/* Summary bar */}
        <InvestmentSummary summary={dto.summary} lang={lang} />

        {/* Evidence panel (admin only) */}
        {isAdminMode && (
          <EvidenceStatus evidence={dto.evidence} lang={lang} />
        )}

        {/* Event list */}
        {noEvents ? (
          <div className="text-center py-16 text-gray-500">
            {lang === 'he'
              ? 'לא נמצאו אירועים עבור נכס זה.'
              : 'No investment events recorded for this property yet.'
            }
          </div>
        ) : (
          <div className="space-y-3">
            {dto.events.map(event => (
              <TimelineEventCard
                key={event.canonicalEventId}
                event={event}
                lang={lang}
                viewMode={dto.viewMode}
                adminMode={isAdminMode}
              />
            ))}
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
