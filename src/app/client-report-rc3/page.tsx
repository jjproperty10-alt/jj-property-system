/**
 * JJ Property 10 — Client Report RC3
 * Phase 3 — 2026-07-09
 *
 * Account-based owner settlement report using the RC3 view layer.
 * Parallel to /client-report (existing) — does not modify it.
 *
 * Routes: /client-report-rc3
 *
 * Architecture:
 *   fetchRC3Report() → RC3PropertyReport
 *   buildAccountSection() per account type → RC3AccountSection
 *   OwnerSettlementPdfV3 renders the PDF
 */

'use client'

import React, { useCallback, useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { fetchRC3Report, fetchRC3PropertyList } from '@/lib/report/fetchReport'
import type { RC3PropertyReport, RC3AccountSection, RC3AccountRow } from '@/lib/report/types'

/* ─── Dynamic PDF import (client-only) ──────────────────────────────────────── */

const PDFDownloadLink = dynamic(
  () => import('@react-pdf/renderer').then(m => m.PDFDownloadLink),
  { ssr: false, loading: () => <span>Preparing PDF…</span> },
)

// OwnerSettlementPdfV3 must use dynamic({ ssr: false }) so Next.js excludes
// @react-pdf/renderer from the server/SSR bundle (it uses browser-only APIs).
// A plain import() without ssr:false causes the Vercel build to fail.
//
// Runtime null-crash fix: PDFDownloadLink.document must never receive a null
// document (which happens when dynamic() hasn't loaded yet). We gate rendering
// on pdfModuleReady (set by useEffect) — both load the same webpack chunk, so
// once the useEffect import resolves, dynamic() is also ready.
const OwnerSettlementPdfV3 = dynamic(
  () => import('@/lib/pdf/OwnerSettlementPdfV3').then(m => ({
    default: m.OwnerSettlementPdfV3,
  })),
  { ssr: false },
)

/* ─── Format helpers ─────────────────────────────────────────────────────────── */

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

/* ─── Account type colours (Tailwind classes) ────────────────────────────────── */

const ACCOUNT_COLOURS: Record<string, { bg: string; border: string; text: string; badge: string }> = {
  sale:       { bg: 'bg-blue-50',   border: 'border-blue-200',  text: 'text-blue-900',  badge: 'bg-blue-700 text-white'   },
  renovation: { bg: 'bg-purple-50', border: 'border-purple-200',text: 'text-purple-900',badge: 'bg-purple-700 text-white' },
  rental:     { bg: 'bg-green-50',  border: 'border-green-200', text: 'text-green-900', badge: 'bg-green-700 text-white'  },
  airbnb:     { bg: 'bg-sky-50',    border: 'border-sky-200',   text: 'text-sky-900',   badge: 'bg-sky-700 text-white'   },
}

/* ─── Transaction row ────────────────────────────────────────────────────────── */

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
          {(row.description ?? '').trim() || row.display_label || '—'}
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

/* ─── Account section card ───────────────────────────────────────────────────── */

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

  // Section A: reference rows (contract values, balance_effect = 0)
  const referenceRows = section.rows.filter(r => r.display_group === 'reference')
  // Section B: balance-affecting rows
  const incomeRows    = section.rows.filter(r => r.display_group === 'income')
  const expenseRows   = section.rows.filter(r => r.display_group === 'expense')
  const payoutRows    = section.rows.filter(r => r.display_group === 'payment_out')
  // Section C: informational only (platform tracking, cost tracking, trust, needs review)
  const infoRows      = section.rows.filter(r => r.display_group === 'info')

  const allBalanceRows = [...incomeRows, ...expenseRows, ...payoutRows]

  // Convention-aware labels for the mini-summary.
  // client_debt (Sale/Renovation): positive balance_effect = amounts charged to client;
  //   negative balance_effect = payments received from client.
  // owner_credit (Rental/Airbnb): positive = income received; negative = expenses paid.
  const isClientDebt = section.balance_convention === 'client_debt'
  const incomeLabel   = isClientDebt ? 'charged to client'    : 'received'
  const expenseLabel  = isClientDebt ? 'received from client' : 'expenses'

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
          <span className="text-gray-400">{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div className="border-t border-gray-200 bg-white">

          {/* Section A — Reference (contract values, always visible) */}
          {referenceRows.length > 0 && (
            <div className="border-b border-gray-200 bg-slate-50 px-4 py-2">
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">
                Section A — Contract Reference (does not affect balance)
              </div>
              <table className="w-full text-xs">
                <tbody className="divide-y divide-gray-100">
                  {referenceRows.map((row, i) => (
                    <TxRow key={row.id} row={row} idx={i} />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Section B — Mini summary */}
          <div className="flex gap-6 px-4 py-2 border-b border-gray-100 bg-gray-50 text-xs">
            {section.total_income > 0 && (
              <span className={isClientDebt ? 'text-red-700' : 'text-green-700'}>
                {isClientDebt ? '+ ' : '+ '}{eur(section.total_income)} {incomeLabel}
              </span>
            )}
            {section.total_expenses > 0 && (
              <span className={isClientDebt ? 'text-green-700' : 'text-red-700'}>
                {isClientDebt ? '' : '− '}{eur(section.total_expenses)} {expenseLabel}
              </span>
            )}
            {section.total_bpo > 0 && (
              <span className="text-orange-700">
                − {eur(section.total_bpo)} paid to you
              </span>
            )}
          </div>

          {/* Section B — Transaction table */}
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
                    {section.account_label} — {balLabel}
                  </td>
                  <td className={`px-3 py-2 text-right text-sm font-bold font-mono ${balClass}`}>
                    {eur(Math.abs(b))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Section C — Informational rows toggle */}
          {infoRows.length > 0 && (
            <div className="border-t border-dashed border-gray-200 bg-gray-50 px-4 py-2">
              <button
                onClick={() => setShowInfo(!showInfo)}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                {showInfo ? '▲ Hide' : '▼ Show'} {infoRows.length} informational rows
                {!showInfo && (
                  <span className="ml-2 text-gray-400">
                    (platform tracking, cost tracking, trust account, needs review)
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

/* ─── Main page ─────────────────────────────────────────────────────────────── */

export default function ClientReportRC3Page() {
  const [properties,    setProperties]    = useState<string[]>([])
  const [selectedProp,  setSelectedProp]  = useState<string>('')
  const [fromDate,      setFromDate]      = useState<string>('')
  const [toDate,        setToDate]        = useState<string>('')
  const [report,        setReport]        = useState<RC3PropertyReport | null>(null)
  const [loading,       setLoading]       = useState(false)
  const [error,         setError]         = useState<string | null>(null)
  const [pdfReady,        setPdfReady]        = useState(false)
  // Pre-load the PDF module chunk so dynamic() is ready when PDFDownloadLink renders.
  // Gating on pdfModuleReady ensures document prop is never null — no @react-pdf crash.
  const [pdfModuleReady,  setPdfModuleReady]  = useState(false)

  useEffect(() => {
    import('@/lib/pdf/OwnerSettlementPdfV3').then(() => {
      setPdfModuleReady(true)
    })
  }, [])

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
    ? `RC3_Owner_Report_${report.reporting_name.replace(/\s+/g, '_')}_${report.from_date || 'all'}_to_${report.to_date || 'all'}.pdf`
    : 'report.pdf'

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Top bar */}
      <div className="bg-[#1e3a5f] text-white px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold tracking-wide">JJ Property 10</h1>
          <p className="text-blue-200 text-xs mt-0.5">Owner Settlement Report — RC3</p>
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
            {loading ? 'Loading…' : 'Load Report'}
          </button>

          {report && pdfReady && pdfModuleReady && (
            <PDFDownloadLink
              document={<OwnerSettlementPdfV3 report={report} />}
              fileName={pdfFilename}
              className="px-4 py-2 bg-green-700 text-white text-sm rounded hover:bg-green-800"
            >
              {({ loading: pdfLoading }: { loading: boolean }) =>
                pdfLoading ? 'Building PDF…' : '⬇ Download PDF'
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
            Loading report for <strong>{selectedProp}</strong>…
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
                  ? `${report.from_date ? fmtDate(report.from_date) : '—'} to ${report.to_date ? fmtDate(report.to_date) : '—'}`
                  : 'All dates'
                } · {report.accounts.length} account{report.accounts.length !== 1 ? 's' : ''}
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

            {/* Opening balance warning */}
            <div className="bg-red-50 border border-red-300 rounded p-3 mt-4 text-xs text-red-800">
              <span className="font-bold">⚠ Opening Balance Not Included.</span>{' '}
              Date-filtered reports may show incorrect closing balances because prior-period
              balances are not carried forward yet.{' '}
              <span className="font-bold">Use all-time (unfiltered) reports only</span> for
              financial review until opening balances are implemented.
            </div>
          </>
        )}
      </div>
    </div>
  )
}
