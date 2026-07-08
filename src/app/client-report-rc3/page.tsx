/**
 * JJ Property 10 â Client Report RC3
 * Phase 3 â 2026-07-09
 *
 * Account-based owner settlement report using the RC3 view layer.
 * Parallel to /client-report (existing) â does not modify it.
 *
 * Routes: /client-report-rc3
 *
 * Architecture:
 *   fetchRC3Report() â RC3PropertyReport
 *   buildAccountSection() per account type â RC3AccountSection
 *   OwnerSettlementPdfV3 renders the PDF
 */

'use client'

import React, { useCallback, useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { fetchRC3Report, fetchRC3PropertyList } from '@/lib/report/fetchReport'
import type { RC3PropertyReport, RC3AccountSection, RC3AccountRow } from '@/lib/report/types'

/* âââ Dynamic PDF import (client-only) ââââââââââââââââââââââââââââââââââââââââ */

const PDFDownloadLink = dynamic(
  () => import('@react-pdf/renderer').then(m => m.PDFDownloadLink),
  { ssr: false, loading: () => <span>Preparing PDFâ¦</span> },
)
const OwnerSettlementPdfV3 = dynamic(
  () =>
    import('@/lib/pdf/OwnerSettlementPdfV3').then(m => ({
      default: m.OwnerSettlementPdfV3,
    })),
  { ssr: false },
)

/* âââ Format helpers âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ */

function eur(n: number): string {
  return new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  }).format(n)
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
    })
  } catch {
    return iso
  }
}

/* âââ Account type colours (Tailwind classes) ââââââââââââââââââââââââââââââââââ */

const ACCOUNT_COLOURS: Record<string, { bg: string; border: string; text: string; badge: string }> = {
  sale:       { bg: 'bg-blue-50',   border: 'border-blue-200',  text: 'text-blue-900',  badge: 'bg-blue-700 text-white'   },
  renovation: { bg: 'bg-purple-50', border: 'border-purple-200',text: 'text-purple-900',badge: 'bg-purple-700 text-white' },
  rental:     { bg: 'bg-green-50',  border: 'border-green-200', text: 'text-green-900', badge: 'bg-green-700 text-white'  },
  airbnb:     { bg: 'bg-sky-50',    border: 'border-sky-200',   text: 'text-sky-900',   badge: 'bg-sky-700 text-white'   },
}

/* âââ Transaction row ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ */

function TxRow({ row, idx }: { row: RC3AccountRow; idx: number }) {
  const isInfo = row.display_group === 'info' || row.display_group === 'reference'
  const isIncome = row.display_group === 'income'

  const amtClass = isInfo
    ? 'text-gray-400 text-xs'
    : isIncome
      ? 'text-green-700 font-medium'
      : 'text-gray-800'

  return (
    <tr className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
      <td className="px-3 py-1.5 text-xs text-gray-500 whitespace-nowrap w-24">
        {fmtDate(row.date)}
      </td>
      <td className="px-3 py-1.5">
        <div className={`text-xs ${isInfo ? 'text-gray-400 italic' : 'text-gray-800'}`}>
          {(row.description ?? '').trim() || row.display_label || 'â'}
        </div>
        {row.display_label && !isInfo && (
          <div className="text-[10px] text-gray-400 mt-0.5">{row.display_label}</div>
        )}
        {isInfo && (
          <div className="text-[10px] text-gray-400">{row.display_label}</div>
        )}
      </td>
      <td className={`px-3 py-1.5 text-xs text-right font-mono ${amtClass}`}>
        {eur(row.client_amount)}
      </td>
    </tr>
  )
}

/* âââ Account section card âââââââââââââââââââââââââââââââââââââââââââââââââââââ */

function AccountCard({ section }: { section: RC3AccountSection }) {
  const [expanded, setExpanded] = useState(true)
  const [showInfo, setShowInfo] = useState(false)

  const colours = ACCOUNT_COLOURS[section.account_type] ?? {
    bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-900', badge: 'bg-gray-700 text-white',
  }

  const b    = section.closing_balance
  const conv = section.balance_convention
  const isSettled = Math.abs(b) < 0.005

  let balLabel: string
  let balClass: string
  if (isSettled) {
    balLabel = 'Settled'
    balClass = 'text-gray-500'
  } else if (conv === 'owner_credit') {
    balLabel = b > 0 ? 'Due to You' : 'Due to JJ'
    balClass = b > 0 ? 'text-green-700' : 'text-red-700'
  } else {
    balLabel = b > 0 ? 'Due to JJ' : 'Credit'
    balClass = b > 0 ? 'text-red-700' : 'text-green-700'
  }

  const incomeRows  = section.rows.filter(r => r.display_group === 'income')
  const expenseRows = section.rows.filter(r => r.display_group === 'expense')
  const payoutRows  = section.rows.filter(r => r.display_group === 'payment_out')
  const infoRows    = section.rows.filter(r => r.display_group === 'info' || r.display_group === 'reference')

  const allBalanceRows = [...incomeRows, ...expenseRows, ...payoutRows]

  return (
    <div className={`rounded-lg border ${colours.border} ${colours.bg} mb-4 overflow-hidden`}>
      {/* Account header */}
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <span className={`px-2.5 py-0.5 rounded text-xs font-bold ${colours.badge}`}>
            {section.account_label}
          </span>
          <span className="text-xs text-gray-500">{section.account_label_he}</span>
          <span className="text-xs text-gray-400">
            {section.rows.length} rows
          </span>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className={`text-base font-bold font-mono ${balClass}`}>
              {eur(Math.abs(b))}
            </div>
            <div className={`text-[11px] ${balClass}`}>{balLabel}</div>
          </div>
          <span className="text-gray-400">{expanded ? 'â²' : 'â¼'}</span>
        </div>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div className="border-t border-gray-200 bg-white">
          {/* Mini summary */}
          <div className="flex gap-6 px-4 py-2 border-b border-gray-100 bg-gray-50 text-xs">
            {section.total_income > 0 && (
              <span className="text-green-700">
                + {eur(section.total_income)} received
              </span>
            )}
            {section.total_expenses > 0 && (
              <span className="text-red-700">
                â {eur(section.total_expenses)} expenses
              </span>
            )}
            {section.total_bpo > 0 && (
              <span className="text-orange-700">
                â {eur(section.total_bpo)} paid to you
              </span>
            )}
          </div>

          {/* Transaction table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-100">
                  <th className="px-3 py-1.5 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wide w-24">Date</th>
                  <th className="px-3 py-1.5 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wide">Description</th>
                  <th className="px-3 py-1.5 text-right text-[10px] font-bold text-gray-500 uppercase tracking-wide">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {allBalanceRows.map((row, i) => (
                  <TxRow key={row.id} row={row} idx={i} />
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-100 border-t border-gray-300">
                  <td className="px-3 py-2" />
                  <td className="px-3 py-2 text-xs font-bold text-gray-700">
                    {section.account_label} â {balLabel}
                  </td>
                  <td className={`px-3 py-2 text-right text-sm font-bold font-mono ${balClass}`}>
                    {eur(Math.abs(b))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Informational rows toggle */}
          {infoRows.length > 0 && (
            <div className="border-t border-dashed border-gray-200 bg-gray-50 px-4 py-2">
              <button
                onClick={() => setShowInfo(!showInfo)}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                {showInfo ? 'â² Hide' : 'â¼ Show'} {infoRows.length} informational rows
                {!showInfo && (
                  <span className="ml-2 text-gray-400">
                    (platform tracking, internal cost records)
                  </span>
                )}
              </button>
              {showInfo && (
                <table className="w-full mt-2 text-xs">
                  <tbody className="divide-y divide-gray-100">
                    {infoRows.map((row, i) => (
                      <TxRow key={row.id} row={row} idx={i} />
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* âââ Main page âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ */

export default function ClientReportRC3Page() {
  const [properties,    setProperties]    = useState<string[]>([])
  const [selectedProp,  setSelectedProp]  = useState<string>('')
  const [fromDate,      setFromDate]      = useState<string>('')
  const [toDate,        setToDate]        = useState<string>('')
  const [report,        setReport]        = useState<RC3PropertyReport | null>(null)
  const [loading,       setLoading]       = useState(false)
  const [error,         setError]         = useState<string | null>(null)
  const [pdfReady,      setPdfReady]      = useState(false)

  // Load property list on mount
  useEffect(() => {
    fetchRC3PropertyList()
      .then(list => {
        setProperties(list)
        if (list.length > 0) setSelectedProp(list[0])
      })
      .catch(err => setError(err.message))
  }, [])

  const loadReport = useCallback(async () => {
    if (!selectedProp) return
    setLoading(true)
    setError(null)
    setPdfReady(false)
    setReport(null)
    try {
      const r = await fetchRC3Report({
        reportingName: selectedProp,
        fromDate: fromDate || undefined,
        toDate:   toDate   || undefined,
      })
      setReport(r)
      setTimeout(() => setPdfReady(true), 600) // small delay for PDF renderer init
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load report')
    } finally {
      setLoading(false)
    }
  }, [selectedProp, fromDate, toDate])

  // Auto-load when property changes
  useEffect(() => {
    if (selectedProp) loadReport()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProp])

  const pdfFilename = report
    ? `${report.reporting_name.replace(/\s+/g, '_')}_RC3_${new Date().toISOString().slice(0, 10)}.pdf`
    : 'report.pdf'

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Top bar */}
      <div className="bg-[#1e3a5f] text-white px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold tracking-wide">JJ Property 10</h1>
          <p className="text-blue-200 text-xs mt-0.5">Owner Settlement Report â RC3</p>
        </div>
        <span className="text-xs bg-blue-800 text-blue-100 px-2 py-1 rounded">
          Phase 3 Preview
        </span>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* Controls */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-5 flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-48">
            <label className="block text-xs font-bold text-gray-600 mb-1 uppercase tracking-wide">
              Property
            </label>
            <select
              value={selectedProp}
              onChange={e => setSelectedProp(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm bg-white"
            >
              {properties.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1 uppercase tracking-wide">
              From Date
            </label>
            <input
              type="date"
              value={fromDate}
              onChange={e => setFromDate(e.target.value)}
              className="border border-gray-300 rounded px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1 uppercase tracking-wide">
              To Date
            </label>
            <input
              type="date"
              value={toDate}
              onChange={e => setToDate(e.target.value)}
              className="border border-gray-300 rounded px-3 py-2 text-sm"
            />
          </div>

          <button
            onClick={loadReport}
            disabled={loading || !selectedProp}
            className="px-4 py-2 bg-[#1e3a5f] text-white text-sm rounded hover:bg-[#2d5a9e] disabled:opacity-50"
          >
            {loading ? 'Loadingâ¦' : 'Load Report'}
          </button>

          {report && pdfReady && (
            <PDFDownloadLink
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              document={<OwnerSettlementPdfV3 report={report} />}
              fileName={pdfFilename}
              className="px-4 py-2 bg-green-700 text-white text-sm rounded hover:bg-green-800"
            >
              {({ loading: pdfLoading }: { loading: boolean }) =>
                pdfLoading ? 'Building PDFâ¦' : 'â¬ Download PDF'
              }
            </PDFDownloadLink>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded p-3 mb-4">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="text-center py-12 text-gray-500 text-sm">
            Loading report for <strong>{selectedProp}</strong>â¦
          </div>
        )}

        {/* Report */}
        {report && !loading && (
          <>
            {/* Header */}
            <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
              <h2 className="text-base font-bold text-gray-900">{report.reporting_name}</h2>
              <div className="text-xs text-gray-500 mt-1">
                {report.from_date || report.to_date
                  ? `${report.from_date ? fmtDate(report.from_date) : 'â'} to ${report.to_date ? fmtDate(report.to_date) : 'â'}`
                  : 'All dates'
                } Â· {report.accounts.length} account{report.accounts.length !== 1 ? 's' : ''}
              </div>
            </div>

            {/* Account cards */}
            {report.accounts.length === 0 ? (
              <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm rounded p-4">
                No transactions found for <strong>{selectedProp}</strong> in the selected date range.
              </div>
            ) : (
              report.accounts.map(acc => (
                <AccountCard key={acc.account_type} section={acc} />
              ))
            )}

            {/* Disclosure */}
            <div className="bg-amber-50 border border-amber-200 rounded p-3 mt-4 text-xs text-amber-800">
              This report is generated from accounting records and is pending final review.
              Opening balances are not yet included. Some transactions may be subject to reclassification.
            </div>
          </>
        )}
      </div>
    </div>
  )
}
