/**
 * ReportScopeSummary — presentation-only.
 *
 * Describes what the report covers (single property / selected set / portfolio)
 * and the period, using the existing canonical scope describers. No financial
 * formulas, no data fetching, no hardcoded property names.
 */
import React from 'react'
import type { ReportScope } from '@/lib/report/reportScope'
import { describeScopeEN, describeScopeHE } from '@/lib/report/reportScope'

export interface ReportScopeSummaryProps {
  scope: ReportScope
  totalProperties?: number
  fromDate: string | null
  toDate: string | null
  lang?: 'en' | 'he'
}

const LABELS = {
  en: { scope: 'Scope', period: 'Period', all: 'All dates' },
  he: { scope: 'היקף', period: 'תקופה', all: 'כל התאריכים' },
} as const

function fmtDate(d: string | null): string {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) }
  catch { return d }
}

export function ReportScopeSummary({ scope, totalProperties, fromDate, toDate, lang = 'en' }: ReportScopeSummaryProps) {
  const t = LABELS[lang] ?? LABELS.en
  const describe = lang === 'he' ? describeScopeHE : describeScopeEN
  const scopeText = describe(scope, totalProperties)
  const period = (fromDate || toDate) ? `${fmtDate(fromDate)} – ${fmtDate(toDate)}` : t.all

  return (
    <div data-testid="report-scope-summary" className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-500 mb-4 px-1">
      <span><span className="font-semibold text-gray-600">{t.scope}:</span> <span data-testid="rss-scope">{scopeText}</span></span>
      <span><span className="font-semibold text-gray-600">{t.period}:</span> <span data-testid="rss-period">{period}</span></span>
    </div>
  )
}

export default ReportScopeSummary
