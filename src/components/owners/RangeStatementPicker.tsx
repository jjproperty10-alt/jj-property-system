'use client'

import React, { useState } from 'react'

/**
 * RangeStatementPicker — owner-facing control to generate a MULTI-MONTH STR Owner Statement PDF.
 *
 * Presentation only: picks a from→to month range and opens the certified range PDF route
 * (/owners/[slug]/statement/range/pdf?from=&to=). No financial logic here; the PDF is composed
 * server-side from the certified single-month statements. Defaults to a 3-month range ending at the
 * currently-selected month.
 */
export function RangeStatementPicker({ slug, defaultMonth }: { slug: string; defaultMonth: string }) {
  const monthMinus = (ym: string, n: number): string => {
    const [y, m] = ym.split('-').map(Number)
    const d = new Date(Date.UTC(y, m - 1 - n, 1))
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
  }
  const [from, setFrom] = useState(monthMinus(defaultMonth, 2)) // default: 3-month range ending at selected
  const [to, setTo] = useState(defaultMonth)

  const valid = /^\d{4}-\d{2}$/.test(from) && /^\d{4}-\d{2}$/.test(to) && from <= to
  const href = `/owners/${slug}/statement/range/pdf?from=${from}&to=${to}`

  return (
    <div className="rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-gray-900">Multi-Month Statement</div>
          <div className="text-xs text-gray-500">Overall summary + month-by-month breakdown for a date range.</div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <label className="text-xs text-gray-600">
              From{' '}
              <input
                type="month"
                value={from}
                max={to}
                onChange={e => setFrom(e.target.value)}
                data-testid="range-from"
                className="ml-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm"
              />
            </label>
            <label className="text-xs text-gray-600">
              To{' '}
              <input
                type="month"
                value={to}
                min={from}
                onChange={e => setTo(e.target.value)}
                data-testid="range-to"
                className="ml-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm"
              />
            </label>
          </div>
        </div>
        {valid ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="range-statement-link"
            className="shrink-0 inline-flex items-center gap-1 text-sm font-semibold px-4 py-2 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm"
          >
            Generate Range Statement
          </a>
        ) : (
          <span data-testid="range-invalid" className="shrink-0 text-xs font-medium text-red-600">
            Range start must be on or before range end.
          </span>
        )}
      </div>
    </div>
  )
}
