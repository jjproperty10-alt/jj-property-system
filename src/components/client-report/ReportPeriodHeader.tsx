/**
 * ReportPeriodHeader — presentation-only.
 *
 * Renders the report identity: property/scope name, reporting period, report
 * type, and generation timestamp. Receives already-resolved values via typed
 * props. Contains NO financial formulas, NO data fetching, NO hardcoded names.
 */
import React from 'react'

export type ReportTypeLite = 'full' | 'periodic'

export interface ReportPeriodHeaderProps {
  reportingName: string
  fromDate: string | null
  toDate: string | null
  generatedAt: string
  reportType: ReportTypeLite
  lang?: 'en' | 'he'
}

const LABELS = {
  en: { period: 'Reporting period', all: 'All dates', generated: 'Generated', full: 'Full report', periodic: 'Periodic report' },
  he: { period: 'תקופת הדוח', all: 'כל התאריכים', generated: 'הופק', full: 'דוח מלא', periodic: 'דוח תקופתי' },
} as const

function fmtDate(d: string | null): string {
  if (!d) return '—'
  try {
    return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return d
  }
}

export function ReportPeriodHeader({
  reportingName, fromDate, toDate, generatedAt, reportType, lang = 'en',
}: ReportPeriodHeaderProps) {
  const t = LABELS[lang] ?? LABELS.en
  const period = (fromDate || toDate) ? `${fmtDate(fromDate)} – ${fmtDate(toDate)}` : t.all
  const generated = fmtDate(generatedAt)

  return (
    <div
      data-testid="report-period-header"
      className="bg-white rounded-2xl border border-gray-200 px-6 py-4 mb-4 shadow-sm flex flex-wrap items-center justify-between gap-3"
      dir="ltr"
    >
      <div>
        <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-500 mb-0.5">
          {reportType === 'periodic' ? t.periodic : t.full}
        </div>
        <div data-testid="rph-name" className="text-xl font-bold text-gray-900 leading-tight">{reportingName}</div>
        <div data-testid="rph-period" className="text-sm text-gray-500 mt-0.5">{t.period}: {period}</div>
      </div>
      <div className="text-right text-[11px] text-gray-400 uppercase tracking-wide">
        {t.generated}: <span data-testid="rph-generated" className="font-mono">{generated}</span>
      </div>
    </div>
  )
}

export default ReportPeriodHeader
