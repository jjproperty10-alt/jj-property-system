/**
 * EvidenceStatus — evidence panel for the Investment Timeline.
 *
 * Shows the count of open verification tasks and whether any events
 * have pending date confirmation. JJ-admin visibility only — hidden
 * from partner-facing routes.
 *
 * This is an informational read-only panel. It never creates tasks.
 */

import type { InvestmentTimelineDTO } from '@/lib/lifecycle/timelineTypes'

interface Props {
  evidence: InvestmentTimelineDTO['evidence']
  lang?: 'en' | 'he'
}

export function EvidenceStatus({ evidence, lang = 'en' }: Props) {
  const { openVerificationTasks, hasPendingDates } = evidence
  const isRTL = lang === 'he'

  if (openVerificationTasks === 0 && !hasPendingDates) return null

  return (
    <div
      className="rounded-xl border border-amber-700/50 bg-amber-950/30 p-4 mb-6"
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-amber-400 text-sm">⚠</span>
        <span className="text-amber-300 text-xs font-bold uppercase tracking-wide">
          {lang === 'he' ? 'מסמכי מקור ממתינים לאימות' : 'Source Documents Pending'}
        </span>
      </div>

      <ul className="space-y-1">
        {openVerificationTasks > 0 && (
          <li className="text-amber-200 text-sm">
            {lang === 'he'
              ? `${openVerificationTasks} משימות אימות פתוחות`
              : `${openVerificationTasks} open verification task${openVerificationTasks === 1 ? '' : 's'}`
            }
          </li>
        )}
        {hasPendingDates && (
          <li className="text-amber-200 text-sm">
            {lang === 'he'
              ? 'חלק מהאירועים ממתינים לאימות תאריך'
              : 'Some events are pending date confirmation from source documents'
            }
          </li>
        )}
      </ul>
    </div>
  )
}
