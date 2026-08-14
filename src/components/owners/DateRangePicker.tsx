'use client'

/**
 * DateRangePicker — URL-driven date range selector for the Financial tab.
 *
 * Three modes:
 *   - All History (default — no from/to params)
 *   - Current Month (?period=month)
 *   - Custom Range (?from=YYYY-MM-DD&to=YYYY-MM-DD)
 *
 * Navigation is URL-based (server component compatible).
 */

import { useRouter } from 'next/navigation'
import { useState } from 'react'

interface DateRangePickerProps {
  ownerSlug: string
  fromDate: string | null
  toDate: string | null
  periodLabel: string
}

export function DateRangePicker({ ownerSlug, fromDate, toDate, periodLabel }: DateRangePickerProps) {
  const router = useRouter()
  const isAllHistory = !fromDate && !toDate
  const isCustom = !!fromDate && !!toDate

  const [from, setFrom] = useState(fromDate ?? '')
  const [to, setTo] = useState(toDate ?? '')

  function goAllHistory() {
    router.push(`/owners/${ownerSlug}?tab=financial`)
  }

  function goCurrentMonth() {
    router.push(`/owners/${ownerSlug}?tab=financial&period=month`)
  }

  function goCustomRange() {
    if (!from || !to) return
    router.push(`/owners/${ownerSlug}?tab=financial&from=${from}&to=${to}`)
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider mr-1">Period</span>

      {/* Quick buttons */}
      <button
        onClick={goAllHistory}
        className={`text-xs px-3 py-1.5 rounded-md border font-medium transition-colors ${
          isAllHistory
            ? 'bg-blue-600 text-white border-blue-600'
            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'
        }`}
      >
        All History
      </button>
      <button
        onClick={goCurrentMonth}
        className={`text-xs px-3 py-1.5 rounded-md border font-medium transition-colors ${
          !isAllHistory && !isCustom
            ? 'bg-blue-600 text-white border-blue-600'
            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'
        }`}
      >
        Current Month
      </button>

      {/* Separator */}
      <span className="text-gray-300 mx-1">|</span>

      {/* Custom range inputs */}
      <div className="flex items-center gap-1.5">
        <label className="text-xs text-gray-500">From</label>
        <input
          type="date"
          value={from}
          onChange={e => setFrom(e.target.value)}
          className="text-xs border border-gray-300 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <label className="text-xs text-gray-500">To</label>
        <input
          type="date"
          value={to}
          onChange={e => setTo(e.target.value)}
          className="text-xs border border-gray-300 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <button
          onClick={goCustomRange}
          disabled={!from || !to}
          className="text-xs px-3 py-1.5 rounded-md border font-medium bg-white text-gray-700 border-gray-300 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Apply
        </button>
      </div>

      {/* Active label */}
      {isCustom && (
        <span className="text-xs text-blue-700 font-medium ml-1">
          {periodLabel}
        </span>
      )}
    </div>
  )
}
