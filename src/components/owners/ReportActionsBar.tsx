'use client'

/**
 * ReportActionsBar — Download PDF + Print buttons for the Owner Financial tab.
 *
 * Gap I+M — PR #166 Hard Gap Audit.
 *
 * Renders as a compact action bar. Download opens the PDF route in a new tab
 * (browser's native PDF viewer). Print fetches the PDF and prints via
 * the browser print dialog.
 *
 * Constitutional:
 *   - This component has no financial logic. It only links to the PDF route.
 *   - The PDF route (fetchRC3Report) is the canonical financial authority.
 */

import { useState } from 'react'
import { printBlob } from '@/lib/pdf/generate'

export interface ReportActionsBarProps {
  ownerSlug: string
  /** Report language: 'en' | 'he' */
  lang?: string
  /** Report type: 'full' | 'periodic' */
  reportType?: string
  /** Optional date range (ISO YYYY-MM-DD) */
  fromDate?: string | null
  toDate?: string | null
  /** Property name for multi-property owners (Blocker 5). Omit for single-property owners. */
  propertyName?: string | null
}

function buildPdfUrl(props: ReportActionsBarProps): string {
  const { ownerSlug, lang, reportType, fromDate, toDate, propertyName } = props
  const params = new URLSearchParams()
  if (lang && lang !== 'en') params.set('lang', lang)
  if (reportType && reportType !== 'full') params.set('type', reportType)
  if (fromDate) params.set('from', fromDate)
  if (toDate) params.set('to', toDate)
  if (propertyName) params.set('property', propertyName)
  const qs = params.toString()
  return `/owners/${ownerSlug}/report/pdf${qs ? `?${qs}` : ''}`
}

export function ReportActionsBar(props: ReportActionsBarProps) {
  const [printing, setPrinting] = useState(false)
  const pdfUrl = buildPdfUrl(props)

  async function handlePrint() {
    setPrinting(true)
    try {
      const res = await fetch(pdfUrl)
      if (!res.ok) {
        console.error('[ReportActionsBar] PDF fetch failed:', res.status)
        return
      }
      const blob = await res.blob()
      printBlob(blob)
    } catch (err) {
      console.error('[ReportActionsBar] Print error:', err)
    } finally {
      setPrinting(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <a
        href={pdfUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-neutral-700 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        Download PDF
      </a>

      <button
        onClick={handlePrint}
        disabled={printing}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-neutral-700 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
        </svg>
        {printing ? 'Preparing…' : 'Print'}
      </button>
    </div>
  )
}
