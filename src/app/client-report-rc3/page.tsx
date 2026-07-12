/**
 * JJ Property 10 — Client Report RC3
 * Phase B — 2026-07-09
 *
 * UX / presentation layer only. No accounting logic, SQL, RLS, or security changes.
 *
 * Phase B additions:
 *  - Language selector (EN / HE) with full RTL support
 *  - Client-facing balance wording (Amount Payable to You / Amount Payable by You / Settled)
 *  - Module Summary Cards per account type
 *  - Executive Summary at top of report
 *  - Expense grouping (Rental / Airbnb) with expand/collapse
 *  - Multi-property placeholder (client selector stub — single-property still default)
 *  - Rental month allocation placeholder note
 *  - Modern design: larger cards, more whitespace, cleaner typography
 */

'use client'

import React, { useCallback, useEffect, useState, Suspense } from 'react'
import nextDynamic from 'next/dynamic'
import { fetchRC3Report, fetchRC3PropertyList } from '@/lib/report/fetchReport'
import type { RC3PropertyReport, RC3AccountSection, RC3AccountRow } from '@/lib/report/types'
import {
  buildRowLabel,
  t, type Lang, type LabelKey,
  getExpenseGroupKey,
} from '@/lib/report/labels'

/* ─── Dynamic PDF import (client-only) ──────────────────────────────────────── */

const PDFDownloadLink = nextDynamic(
  () => import('@react-pdf/renderer').then(m => m.PDFDownloadLink),
  { ssr: false, loading: () => <span>Preparing PDF…</span> },
)

// NOTE: OwnerSettlementPdfV3 is loaded via raw import() in useEffect (not nextDynamic).
// react-pdf's custom reconciler cannot handle Next.js's dynamic() wrapper.

/* ─── PDF Error Boundary ─────────────────────────────────────────────────────── */

class PDFErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }
  static getDerivedStateFromError() { return { hasError: true } }
  render() {
    if (this.state.hasError) {
      return (
        <span className="text-xs text-red-400 px-3 py-1 border border-red-200 rounded">
          PDF unavailable — refresh to retry
        </span>
      )
    }
    return this.props.children
  }
}

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

/* ─── Balance wording (client-facing) ──────────────────────────────────────── */

function getBalanceLabel(
  closingBalance: number,
  convention: 'owner_credit' | 'client_debt',
  lang: Lang
): { label: string; colorClass: string } {
  const b = closingBalance
  if (Math.abs(b) < 0.005) {
    return { label: t('balSettled', lang), colorClass: 'text-gray-500' }
  }
  if (convention === 'owner_credit') {
    // Positive = JJ owes owner → payable TO owner
    return b > 0
      ? { label: t('balPayableToYou', lang), colorClass: 'text-green-700' }
      : { label: t('balPayableByYou', lang), colorClass: 'text-red-700' }
  } else {
    // client_debt: Positive = client owes JJ → payable BY client
    return b > 0
      ? { label: t('balPayableByYou', lang), colorClass: 'text-red-700' }
      : { label: t('balPayableToYou', lang), colorClass: 'text-green-700' }
  }
}

/* ─── Account type colours (Tailwind classes) ────────────────────────────────── */

const ACCOUNT_COLOURS: Record<string, {
  bg: string; border: string; text: string; badge: string;
  cardBg: string; headerBg: string;
}> = {
  sale:       {
    bg: 'bg-blue-50',   border: 'border-blue-200',   text: 'text-blue-900',
    badge: 'bg-blue-700 text-white',
    cardBg: 'bg-blue-25', headerBg: 'bg-blue-700',
  },
  renovation: {
    bg: 'bg-purple-50', border: 'border-purple-200',  text: 'text-purple-900',
    badge: 'bg-purple-700 text-white',
    cardBg: 'bg-purple-25', headerBg: 'bg-purple-700',
  },
  rental:     {
    bg: 'bg-green-50',  border: 'border-green-200',   text: 'text-green-900',
    badge: 'bg-green-700 text-white',
    cardBg: 'bg-green-25', headerBg: 'bg-green-700',
  },
  airbnb:     {
    bg: 'bg-sky-50',    border: 'border-sky-200',     text: 'text-sky-900',
    badge: 'bg-sky-700 text-white',
    cardBg: 'bg-sky-25', headerBg: 'bg-sky-700',
  },
}

const DEFAULT_COLOURS = {
  bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-900',
  badge: 'bg-gray-700 text-white', cardBg: 'bg-gray-50', headerBg: 'bg-gray-700',
}

/* ─── Transaction row ─────────────────────────────────────────────────────────── */

function TxRow({ row, idx, lang }: { row: RC3AccountRow; idx: number; lang: Lang }) {
  const isInfo   = row.display_group === 'info' || row.display_group === 'reference'
  const isIncome = row.display_group === 'income'

  const amtClass = isInfo
    ? 'text-gray-400 text-xs'
    : isIncome
      ? 'text-green-700 font-medium'
      : 'text-gray-800'

  // Client report: use buildRowLabel for all rows — never expose raw internal notes
  const primaryText = buildRowLabel(row, lang)

  return (
    <tr className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
      <td className="px-4 py-2 text-xs text-gray-500 whitespace-nowrap w-28">
        {/* dir="ltr" prevents bidirectional algorithm from scrambling date strings in RTL mode */}
        <span dir="ltr">{fmtDate(row.date)}</span>
      </td>
      <td className="px-4 py-2">
        <div className={`text-xs ${isInfo ? 'text-gray-400 italic' : 'text-gray-800'}`}>
          {primaryText}
        </div>
      </td>
      <td className={`px-4 py-2 text-xs text-end font-mono ${amtClass}`}>
        {eur(row.client_amount)}
      </td>
    </tr>
  )
}

/* ─── Expense group block (Rental + Airbnb) ──────────────────────────────────── */

function ExpenseGroupBlock({ rows, lang }: { rows: RC3AccountRow[]; lang: Lang }) {
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set())

  // Group rows by expense category
  const groups = new Map<LabelKey, RC3AccountRow[]>()
  for (const row of rows) {
    const key = getExpenseGroupKey(row.subcategory)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(row)
  }

  const toggleGroup = (key: LabelKey) => {
    setOpenGroups(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  if (groups.size === 0) return null

  return (
    <div className="divide-y divide-gray-100">
      {Array.from(groups.entries()).map(([groupKey, groupRows]) => {
        const groupTotal = groupRows.reduce((sum, r) => sum + r.client_amount, 0)
        const isOpen = openGroups.has(groupKey)
        return (
          <div key={groupKey}>
            <button
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors text-sm"
              onClick={() => toggleGroup(groupKey)}
            >
              <span className="font-medium text-gray-700">{t(groupKey, lang)}</span>
              <div className="flex items-center gap-3">
                <span className="font-mono text-gray-800 text-sm font-semibold">{eur(groupTotal)}</span>
                <span className="text-gray-400 text-xs w-3">{isOpen ? '▲' : '▼'}</span>
              </div>
            </button>
            {isOpen && (
              <div className="bg-gray-50 border-t border-gray-100">
                <table className="w-full text-xs">
                  <tbody className="divide-y divide-gray-100">
                    {groupRows.map((row, i) => (
                      <TxRow key={row.id} row={row} idx={i} lang={lang} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ─── Module summary card strip ──────────────────────────────────────────────── */

interface MetricCardProps {
  label: string
  value: number
  highlight?: boolean
  highlightColor?: string
  small?: boolean
}

function MetricCard({ label, value, highlight = false, highlightColor = 'text-gray-900', small = false }: MetricCardProps) {
  return (
    <div className="flex-1 min-w-0 bg-white rounded-xl border border-gray-200 px-4 py-3 shadow-sm">
      <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">
        {label}
      </div>
      <div className={`font-bold font-mono ${highlight ? highlightColor : 'text-gray-900'} ${small ? 'text-sm' : 'text-base'}`}>
        {eur(value)}
      </div>
    </div>
  )
}

function ModuleSummaryCards({ section, lang }: { section: RC3AccountSection; lang: Lang }) {
  const { label: balLabel, colorClass: balColor } = getBalanceLabel(
    section.closing_balance,
    section.balance_convention,
    lang
  )

  if (section.account_type === 'sale') {
    return (
      <div className="flex gap-3 px-4 py-3 flex-wrap">
        <MetricCard label={t('cardSaleContract', lang)}  value={section.contract_baseline} />
        <MetricCard label={t('cardSaleExpenses', lang)}  value={section.total_income} />
        <MetricCard label={t('cardSalePayments', lang)}  value={section.total_expenses} />
        <div className="flex-1 min-w-0 bg-white rounded-xl border-2 border-gray-300 px-4 py-3 shadow-sm">
          <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">
            {t('cardSaleBalance', lang)}
          </div>
          <div className={`text-base font-bold font-mono ${balColor}`}>
            {eur(Math.abs(section.closing_balance))}
          </div>
          <div className={`text-[10px] mt-0.5 ${balColor}`}>{balLabel}</div>
        </div>
      </div>
    )
  }

  if (section.account_type === 'renovation') {
    const totalContract = section.contract_baseline + section.total_income
    return (
      <div className="flex gap-3 px-4 py-3 flex-wrap">
        <MetricCard label={t('cardRenovContract', lang)} value={section.contract_baseline} small />
        <MetricCard label={t('cardRenovExtras', lang)}   value={section.total_income} small />
        <MetricCard label={t('cardRenovTotal', lang)}    value={totalContract} small />
        <MetricCard label={t('cardRenovPayments', lang)} value={section.total_expenses} small />
        <div className="flex-1 min-w-0 bg-white rounded-xl border-2 border-gray-300 px-4 py-3 shadow-sm">
          <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">
            {t('cardRenovBalance', lang)}
          </div>
          <div className={`text-sm font-bold font-mono ${balColor}`}>
            {eur(Math.abs(section.closing_balance))}
          </div>
          <div className={`text-[10px] mt-0.5 ${balColor}`}>{balLabel}</div>
        </div>
      </div>
    )
  }

  if (section.account_type === 'rental') {
    return (
      <div className="flex gap-3 px-4 py-3 flex-wrap">
        <MetricCard label={t('cardRentalIncome', lang)}    value={section.total_income} />
        <MetricCard label={t('cardRentalExpenses', lang)}  value={section.total_expenses} />
        <MetricCard label={t('cardRentalBpo', lang)}       value={section.total_bpo} />
        <div className="flex-1 min-w-0 bg-white rounded-xl border-2 border-gray-300 px-4 py-3 shadow-sm">
          <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">
            {t('cardRentalBalance', lang)}
          </div>
          <div className={`text-base font-bold font-mono ${balColor}`}>
            {eur(Math.abs(section.closing_balance))}
          </div>
          <div className={`text-[10px] mt-0.5 ${balColor}`}>{balLabel}</div>
        </div>
      </div>
    )
  }

  // airbnb
  return (
    <div className="flex gap-3 px-4 py-3 flex-wrap">
      <MetricCard label={t('cardAirbnbIncome', lang)}    value={section.total_income} />
      <MetricCard label={t('cardAirbnbExpenses', lang)}  value={section.total_expenses} />
      <MetricCard label={t('cardAirbnbBpo', lang)}       value={section.total_bpo} />
      <div className="flex-1 min-w-0 bg-white rounded-xl border-2 border-gray-300 px-4 py-3 shadow-sm">
        <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">
          {t('cardAirbnbBalance', lang)}
        </div>
        <div className={`text-base font-bold font-mono ${balColor}`}>
          {eur(Math.abs(section.closing_balance))}
        </div>
        <div className={`text-[10px] mt-0.5 ${balColor}`}>{balLabel}</div>
      </div>
    </div>
  )
}

/* ─── Owner Dashboard ────────────────────────────────────────────────────────── */

/**
 * Aggregate KPIs across all active account sections.
 * netOwnerBalance: positive = JJ owes owner, negative = owner owes JJ.
 * Converts each account to "owner perspective" before summing:
 *   owner_credit  →  closing_balance as-is
 *   client_debt   → -closing_balance (flip sign for owner view)
 *
 * Does NOT touch accounting logic — reads computed aggregates only.
 */
function computeDashboard(accounts: RC3AccountSection[]) {
  let totalIncome    = 0
  let totalExpenses  = 0
  let totalTransfers = 0
  let netOwnerBalance = 0

  for (const acc of accounts) {
    totalIncome    += acc.total_income
    totalExpenses  += acc.total_expenses
    totalTransfers += acc.total_bpo
    if (acc.balance_convention === 'owner_credit') {
      netOwnerBalance += acc.closing_balance
    } else {
      netOwnerBalance -= acc.closing_balance
    }
  }

  return { totalIncome, totalExpenses, totalTransfers, netOwnerBalance }
}

function OwnerDashboard({ report, lang }: { report: RC3PropertyReport; lang: Lang }) {
  const { totalIncome, totalExpenses, totalTransfers, netOwnerBalance } = computeDashboard(report.accounts)

  let balLabel: string
  let balColorClass: string
  let statusBg: string
  let statusBorder: string
  if (Math.abs(netOwnerBalance) < 0.005) {
    balLabel      = t('balSettled', lang)
    balColorClass = 'text-gray-600'
    statusBg      = 'bg-gray-50'
    statusBorder  = 'border-gray-200'
  } else if (netOwnerBalance > 0) {
    balLabel      = t('balPayableToYou', lang)
    balColorClass = 'text-green-700'
    statusBg      = 'bg-green-50'
    statusBorder  = 'border-green-200'
  } else {
    balLabel      = t('balPayableByYou', lang)
    balColorClass = 'text-red-700'
    statusBg      = 'bg-red-50'
    statusBorder  = 'border-red-200'
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm mb-5 overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-5 pb-4 border-b border-gray-100">
        <div className="text-[11px] font-bold text-[#1e3a5f] uppercase tracking-widest">
          {t('dashTitle', lang)}
        </div>
        <div className="text-xs text-gray-400 mt-0.5">{t('dashSubtitle', lang)}</div>
      </div>

      {/* Status card — large balance, colored */}
      <div className={`mx-5 mt-5 mb-4 rounded-xl border ${statusBorder} ${statusBg} px-6 py-5 flex items-center justify-between`}>
        <div className="text-xs font-bold text-gray-500 uppercase tracking-widest">
          {t('dashBalance', lang)}
        </div>
        {/* text-end: in LTR=right, in RTL=left — keeps amount at the outer edge in both directions */}
        <div className="text-end">
          <div className={`text-4xl font-bold font-mono ${balColorClass} leading-none`}>
            {eur(Math.abs(netOwnerBalance))}
          </div>
          <div className={`text-xs font-semibold mt-1.5 ${balColorClass}`}>{balLabel}</div>
        </div>
      </div>

      {/* 3 KPI cells */}
      <div className="grid grid-cols-3 gap-3 px-5 pb-5">
        {[
          { label: t('dashIncome',    lang), value: totalIncome    },
          { label: t('dashExpenses',  lang), value: totalExpenses  },
          { label: t('dashTransfers', lang), value: totalTransfers },
        ].map(kpi => (
          <div key={kpi.label} className="bg-gray-50 rounded-xl px-4 py-3">
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
              {kpi.label}
            </div>
            <div className="text-base font-bold font-mono text-gray-900">{eur(kpi.value)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ─── Executive summary ───────────────────────────────────────────────────────── */

const ACCOUNT_LABEL_KEYS: Record<string, LabelKey> = {
  sale: 'accountSale', renovation: 'accountRenovation',
  rental: 'accountRental', airbnb: 'accountAirbnb',
}

function ExecutiveSummary({ report, lang }: { report: RC3PropertyReport; lang: Lang }) {
  const period = report.from_date || report.to_date
    ? `${report.from_date ? fmtDate(report.from_date) : '—'} – ${report.to_date ? fmtDate(report.to_date) : '—'}`
    : t('execAllDates', lang)

  return (
    <div className="bg-[#1e3a5f] rounded-2xl p-6 mb-5 text-white shadow-lg">
      {/* Header row */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <div className="text-xs font-bold uppercase tracking-widest text-blue-300 mb-1">
            {t('execTitle', lang)}
          </div>
          <div className="text-2xl font-bold">{report.reporting_name}</div>
          <div className="text-blue-200 text-sm mt-1">{period}</div>
        </div>
        {/* text-end: keeps confidential label at outer edge in both LTR and RTL */}
        <div className="text-end">
          <div className="text-xs text-blue-400">{t('confidential', lang)}</div>
          <div className="text-xs text-blue-400 mt-1">
            {report.accounts.length} {t('accounts', lang)}
          </div>
        </div>
      </div>

      {/* Module balance cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {report.accounts.map(acc => {
          const b = acc.closing_balance
          const { label: balLabel, colorClass } = getBalanceLabel(b, acc.balance_convention, lang)
          // Map colorClass (Tailwind dark-bg text) to light variant for the dark card
          const lightColor = colorClass.includes('green') ? 'text-green-300' :
                             colorClass.includes('red')   ? 'text-red-300'   : 'text-gray-300'
          const labelKey = ACCOUNT_LABEL_KEYS[acc.account_type]
          return (
            <div key={acc.account_type} className="bg-white/10 rounded-xl p-4 backdrop-blur-sm">
              <div className="text-xs text-blue-200 mb-2 font-medium">
                {labelKey ? t(labelKey, lang) : acc.account_label}
              </div>
              <div className={`text-xl font-bold font-mono ${lightColor}`}>
                {eur(Math.abs(b))}
              </div>
              <div className={`text-[10px] mt-1 ${lightColor} leading-tight`}>
                {balLabel}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ─── Final Summary ───────────────────────────────────────────────────────────── */

function FinalSummary({ report, lang }: { report: RC3PropertyReport; lang: Lang }) {
  const { totalIncome, totalExpenses, totalTransfers, netOwnerBalance } = computeDashboard(report.accounts)

  let balLabel: string
  let balColor: string
  if (Math.abs(netOwnerBalance) < 0.005) {
    balLabel = t('balSettled', lang); balColor = 'text-gray-300'
  } else if (netOwnerBalance > 0) {
    balLabel = t('balPayableToYou', lang); balColor = 'text-green-300'
  } else {
    balLabel = t('balPayableByYou', lang); balColor = 'text-red-300'
  }

  const kpis = [
    { label: t('finalTotalIncome',    lang), value: totalIncome    },
    { label: t('finalTotalExpenses',  lang), value: totalExpenses  },
    { label: t('finalTotalTransfers', lang), value: totalTransfers },
  ]

  const genDate = (() => {
    try {
      return new Date(report.generated_at).toLocaleDateString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    } catch { return '' }
  })()

  return (
    <div className="bg-[#1e3a5f] rounded-2xl p-6 mt-5 text-white shadow-lg">
      <div className="text-[10px] font-bold uppercase tracking-widest text-blue-300 mb-4">
        {t('finalTitle', lang)}
      </div>

      {/* 3 KPI cards */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        {kpis.map(k => (
          <div key={k.label} className="bg-white/10 rounded-xl px-4 py-3">
            <div className="text-[10px] text-blue-300 mb-1.5 font-medium">{k.label}</div>
            <div className="text-base font-bold font-mono text-white">{eur(k.value)}</div>
          </div>
        ))}
      </div>

      {/* Net balance highlight */}
      <div className="bg-white/10 rounded-xl px-5 py-4 mb-5 flex items-center justify-between">
        <div className="text-sm font-bold text-blue-200">{t('finalCurrentBalance', lang)}</div>
        {/* text-end: keeps amount at outer edge in both LTR and RTL */}
        <div className="text-end">
          <div className={`text-2xl font-bold font-mono ${balColor}`}>
            {eur(Math.abs(netOwnerBalance))}
          </div>
          <div className={`text-[11px] mt-0.5 font-medium ${balColor}`}>{balLabel}</div>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="border-t border-white/20 pt-4">
        <div className="text-[10px] font-bold uppercase tracking-widest text-blue-400 mb-1.5">
          {t('finalNoteTitle', lang)}
        </div>
        <p className="text-[11px] text-blue-200 leading-relaxed">
          {t('finalDisclaimer', lang)}
        </p>
        <p className="text-[10px] text-blue-400 mt-2">
          {t('finalGenerated', lang)}: {genDate}
        </p>
      </div>
    </div>
  )
}

/* ─── Account section card ────────────────────────────────────────────────────── */

function AccountCard({ section, lang }: { section: RC3AccountSection; lang: Lang }) {
  const [expanded, setExpanded] = useState(true)
  const [showInfo, setShowInfo] = useState(false)

  const colours = ACCOUNT_COLOURS[section.account_type] ?? DEFAULT_COLOURS

  const { label: balLabel, colorClass: balClass } = getBalanceLabel(
    section.closing_balance,
    section.balance_convention,
    lang
  )

  // Section A: reference rows
  const referenceRows = section.rows.filter(r => r.display_group === 'reference')
  // Section B: balance-affecting rows
  const incomeRows    = section.rows.filter(r => r.display_group === 'income')
  const expenseRows   = section.rows.filter(r => r.display_group === 'expense')
  const payoutRows    = section.rows.filter(r => r.display_group === 'payment_out')
  // Section C: informational only
  const infoRows      = section.rows.filter(r => r.display_group === 'info')

  const allBalanceRows = [...incomeRows, ...expenseRows, ...payoutRows]

  // Determine income/expense group labels by account type
  const incomeLabelKey: LabelKey  = section.account_type === 'sale'      ? 'incomeSale'
                                   : section.account_type === 'renovation' ? 'incomeRenov'
                                   : section.account_type === 'rental'     ? 'incomeRental'
                                   : 'incomeAirbnb'
  const expenseLabelKey: LabelKey = section.account_type === 'sale'      ? 'expensesSale'
                                   : section.account_type === 'renovation' ? 'expensesRenov'
                                   : section.account_type === 'rental'     ? 'expensesRental'
                                   : 'expensesAirbnb'

  const useExpenseGrouping = section.account_type === 'rental' || section.account_type === 'airbnb'

  return (
    <div className={`rounded-2xl border ${colours.border} ${colours.bg} mb-5 overflow-hidden shadow-sm print-card`}>

      {/* ── Account header ─────────────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-white/20 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          {/* Badge label: translated so Hebrew mode shows Hebrew directly in the badge */}
          <span className={`px-3 py-1 rounded-lg text-xs font-bold ${colours.badge}`}>
            {ACCOUNT_LABEL_KEYS[section.account_type]
              ? t(ACCOUNT_LABEL_KEYS[section.account_type], lang)
              : section.account_label}
          </span>
          <span className="text-xs text-gray-400">
            {section.rows.length} {t('rows', lang)}
          </span>
        </div>
        <div className="flex items-center gap-5">
          {/* text-end: outer edge in LTR (right) and RTL (left) */}
          <div className="text-end">
            <div className={`text-xl font-bold font-mono ${balClass}`}>
              {eur(Math.abs(section.closing_balance))}
            </div>
            <div className={`text-[11px] font-medium ${balClass} leading-tight mt-0.5`}>
              {balLabel}
            </div>
          </div>
          <span className="text-gray-400 text-sm">{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {/* ── Expanded body ──────────────────────────────────────────────────── */}
      {expanded && (
        <div className="border-t border-gray-200 bg-white">

          {/* Module Summary Cards */}
          <div className="border-b border-gray-100 bg-gray-50">
            <ModuleSummaryCards section={section} lang={lang} />
          </div>

          {/* Section A — Reference (contract values, always visible) */}
          {referenceRows.length > 0 && (
            <div className="border-b border-gray-200 bg-slate-50 px-5 py-3">
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-0.5">
                {t('contractInfo', lang)}
              </div>
              <div className="text-[9px] text-gray-400 mb-2 italic">
                {t('contractInfoNote', lang)}
              </div>
              <table className="w-full text-xs">
                <tbody className="divide-y divide-gray-100">
                  {referenceRows.map((row, i) => (
                    <TxRow key={row.id} row={row} idx={i} lang={lang} />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Section B — Mini summary strip */}
          <div className="flex flex-wrap gap-6 px-5 py-3 border-b border-gray-100 bg-gray-50 text-xs">
            {incomeRows.length > 0 && (
              <span className={section.balance_convention === 'client_debt' ? 'text-red-700 font-medium' : 'text-green-700 font-medium'}>
                {t(incomeLabelKey, lang)}: {eur(section.total_income)}
              </span>
            )}
            {expenseRows.length > 0 && (
              <span className={section.balance_convention === 'client_debt' ? 'text-green-700 font-medium' : 'text-red-700 font-medium'}>
                {t(expenseLabelKey, lang)}: {eur(section.total_expenses)}
              </span>
            )}
            {section.total_bpo > 0 && (
              <span className="text-orange-700 font-medium">
                {t('bpoLabel', lang)}: {eur(section.total_bpo)}
              </span>
            )}
          </div>

          {/* Section B — Income rows */}
          {incomeRows.length > 0 && (
            <div className="border-b border-gray-100">
              <div className="px-5 pt-3 pb-1">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">
                  {t(incomeLabelKey, lang)}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-4 py-2 text-start text-[10px] font-bold text-gray-500 uppercase tracking-wide w-28">
                        {t('thDate', lang)}
                      </th>
                      <th className="px-4 py-2 text-start text-[10px] font-bold text-gray-500 uppercase tracking-wide">
                        {t('thDescription', lang)}
                      </th>
                      <th className="px-4 py-2 text-end text-[10px] font-bold text-gray-500 uppercase tracking-wide">
                        {t('thAmount', lang)}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {incomeRows.map((row, i) => (
                      <TxRow key={row.id} row={row} idx={i} lang={lang} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Section B — Expense rows (grouped for Rental/Airbnb, flat for others) */}
          {expenseRows.length > 0 && (
            <div className="border-b border-gray-100">
              <div className="px-5 pt-3 pb-1">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">
                  {t(expenseLabelKey, lang)}
                </span>
              </div>
              {useExpenseGrouping ? (
                <ExpenseGroupBlock rows={expenseRows} lang={lang} />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="px-4 py-2 text-start text-[10px] font-bold text-gray-500 uppercase tracking-wide w-28">
                          {t('thDate', lang)}
                        </th>
                        <th className="px-4 py-2 text-start text-[10px] font-bold text-gray-500 uppercase tracking-wide">
                          {t('thDescription', lang)}
                        </th>
                        <th className="px-4 py-2 text-end text-[10px] font-bold text-gray-500 uppercase tracking-wide">
                          {t('thAmount', lang)}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {expenseRows.map((row, i) => (
                        <TxRow key={row.id} row={row} idx={i} lang={lang} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Section B — Payout rows (BPO) */}
          {payoutRows.length > 0 && (
            <div className="border-b border-gray-100">
              <div className="px-5 pt-3 pb-1">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">
                  {t('bpoLabel', lang)}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <tbody className="divide-y divide-gray-100">
                    {payoutRows.map((row, i) => (
                      <TxRow key={row.id} row={row} idx={i} lang={lang} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Balance footer */}
          <div className="flex items-center justify-between px-5 py-3 bg-gray-100 border-t border-gray-300">
            <span className="text-sm font-bold text-gray-700">
              {ACCOUNT_LABEL_KEYS[section.account_type]
                ? t(ACCOUNT_LABEL_KEYS[section.account_type], lang)
                : section.account_label}
            </span>
            {/* text-end: outer edge in LTR (right) and RTL (left) */}
            <div className="text-end">
              <div className={`text-lg font-bold font-mono ${balClass}`}>
                {eur(Math.abs(section.closing_balance))}
              </div>
              <div className={`text-[10px] font-medium ${balClass}`}>{balLabel}</div>
            </div>
          </div>

          {/* Section C — Informational rows (hidden for renovation) */}
          {infoRows.length > 0 && section.account_type !== 'renovation' && (
            <div className="border-t border-dashed border-gray-200 bg-gray-50 px-5 py-3">
              <button
                onClick={() => setShowInfo(!showInfo)}
                className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
              >
                {showInfo ? t('hideInfoRows', lang) : t('showInfoRows', lang)}
                {!showInfo && (
                  <span className="ml-1 text-gray-400">
                    ({infoRows.length} · {t('platformTracking', lang)})
                  </span>
                )}
              </button>
              {showInfo && (
                <table className="w-full mt-2 text-xs">
                  <tbody className="divide-y divide-gray-100">
                    {infoRows.map((row, i) => (
                      <TxRow key={row.id} row={row} idx={i} lang={lang} />
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

/* ─── Print styles injected at runtime ──────────────────────────────────────────
 * Uses dangerouslySetInnerHTML so print CSS is available even when Tailwind's
 * purge removes @media print variants.  Forces color-accurate output so module
 * background colors (navy / green / blue / orange) survive the browser's
 * "background graphics" stripping.
 * ─────────────────────────────────────────────────────────────────────────────── */

function PrintStyles({ isRTL }: { isRTL: boolean }) {
  const css = `
@media print {
  /* Force background colours in Chrome/Safari print */
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }

  /* A4 portrait with compact margins */
  @page { size: A4 portrait; margin: 12mm 10mm; }

  /* Hide interactive chrome */
  .print-hide { display: none !important; }

  /* Prevent orphaned card headers */
  .print-card { break-inside: avoid; page-break-inside: avoid; }

  /* Keep table rows together when possible */
  tr { break-inside: avoid; page-break-inside: avoid; }

  /* Hide browser scrollbars / decorations */
  body { background: white !important; }

  /* RTL direction preserved explicitly for print engines */
  ${isRTL ? '[dir="rtl"] { direction: rtl; unicode-bidi: embed; }' : ''}

  /* Ensure date spans never break across lines in print */
  span[dir="ltr"] { display: inline-block; white-space: nowrap; }
}
`
  // eslint-disable-next-line react/no-danger
  return <style dangerouslySetInnerHTML={{ __html: css }} />
}

/* ─── Language toggle ─────────────────────────────────────────────────────────── */

function LangToggle({ lang, setLang }: { lang: Lang; setLang: (l: Lang) => void }) {
  return (
    <div className="flex items-center gap-1 bg-blue-900/40 rounded-lg p-0.5">
      {(['en', 'he'] as Lang[]).map(l => (
        <button
          key={l}
          onClick={() => setLang(l)}
          className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
            lang === l
              ? 'bg-white text-[#1e3a5f]'
              : 'text-blue-200 hover:text-white'
          }`}
        >
          {l === 'en' ? 'EN' : 'עב'}
        </button>
      ))}
    </div>
  )
}

/* ─── Main page content ──────────────────────────────────────────────────────── */

function ClientReportRC3Content() {
  const [lang,          setLang]          = useState<Lang>('en')
  const [properties,    setProperties]    = useState<string[]>([])
  const [selectedProp,  setSelectedProp]  = useState<string>('')
  const [fromDate,      setFromDate]      = useState<string>('')
  const [toDate,        setToDate]        = useState<string>('')
  const [report,        setReport]        = useState<RC3PropertyReport | null>(null)
  const [loading,       setLoading]       = useState(false)
  const [error,         setError]         = useState<string | null>(null)
  const [pdfReady,      setPdfReady]      = useState(false)
  const [PdfDoc, setPdfDoc] = useState<React.ComponentType<{
    report: RC3PropertyReport; lang: Lang
  }> | null>(null)

  useEffect(() => {
    import('@/lib/pdf/OwnerSettlementPdfV3').then(m => {
      setPdfDoc(() => m.OwnerSettlementPdfV3 as React.ComponentType<{
        report: RC3PropertyReport; lang: Lang
      }>)
    })
  }, [])

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
      setTimeout(() => setPdfReady(true), 600)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load report')
    } finally {
      setLoading(false)
    }
  }, [selectedProp, fromDate, toDate])

  useEffect(() => {
    if (selectedProp) loadReport()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProp])

  const pdfFilename = report
    ? `RC3_Report_${report.reporting_name.replace(/\s+/g, '_')}_${report.from_date || 'all'}_to_${report.to_date || 'all'}.pdf`
    : 'report.pdf'

  const isRTL = lang === 'he'

  return (
    <div className="min-h-screen bg-gray-100" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Print-specific CSS — injected at runtime so @media print rules are always present */}
      <PrintStyles isRTL={isRTL} />

      {/* ── Top bar ──────────────────────────────────────────────────────────── */}
      <div className="bg-[#1e3a5f] text-white px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold tracking-wide">JJ Property 10</h1>
          <p className="text-blue-200 text-xs mt-0.5">{t('reportTitle', lang)}</p>
        </div>
        {/* print-hide: language toggle + version badge disappear in print output */}
        <div className="flex items-center gap-3 print-hide">
          <LangToggle lang={lang} setLang={setLang} />
          <span className="text-xs bg-blue-800 text-blue-100 px-2 py-1 rounded">V2</span>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6">

        {/* ── Controls — hidden in print mode ──────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-5 shadow-sm print-hide">
          {/* Multi-property placeholder */}
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-48">
              <label className="block text-xs font-bold text-gray-600 mb-1 uppercase tracking-wide">
                {t('property', lang)}
              </label>
              <select
                value={selectedProp}
                onChange={e => setSelectedProp(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {properties.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1 uppercase tracking-wide">
                {t('fromDate', lang)}
              </label>
              <input
                type="date"
                value={fromDate}
                onChange={e => setFromDate(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1 uppercase tracking-wide">
                {t('toDate', lang)}
              </label>
              <input
                type="date"
                value={toDate}
                onChange={e => setToDate(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <button
              onClick={loadReport}
              disabled={loading || !selectedProp}
              className="px-5 py-2.5 bg-[#1e3a5f] text-white text-sm rounded-lg hover:bg-[#2d5a9e] disabled:opacity-50 font-medium transition-colors"
            >
              {loading ? t('loading', lang) : t('loadReport', lang)}
            </button>

            {/* English PDF: react-pdf renderer — layout is LTR-correct and shippable.
                Hebrew PDF: hidden until react-pdf RTL sprint is complete (M4 decision).
                window.print() was evaluated and rejected — confusing UX for clients.
                See docs/adr/PLAYWRIGHT_PDF_SPIKE.md for the architectural decision. */}
            {report && pdfReady && PdfDoc && (
              <PDFErrorBoundary>
                <PDFDownloadLink
                  document={<PdfDoc report={report} lang={lang} />}
                  fileName={pdfFilename}
                  className="px-5 py-2.5 bg-green-700 text-white text-sm rounded-lg hover:bg-green-800 font-medium transition-colors"
                >
                  {({ loading: pdfLoading }: { loading: boolean }) =>
                    pdfLoading ? t('buildingPdf', lang) : `⬇ ${t('downloadPdf', lang)}`
                  }
                </PDFDownloadLink>
              </PDFErrorBoundary>
            )}
          </div>
        </div>

        {/* ── Error ────────────────────────────────────────────────────────── */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-xl p-4 mb-4">
            {error}
          </div>
        )}

        {/* ── Loading ───────────────────────────────────────────────────────── */}
        {loading && (
          <div className="text-center py-16 text-gray-500 text-sm">
            {t('loading', lang)} <strong>{selectedProp}</strong>
          </div>
        )}

        {/* ── Report ───────────────────────────────────────────────────────── */}
        {report && !loading && (
          <>
            {/* Owner Dashboard — aggregate KPIs (top of report) */}
            <OwnerDashboard report={report} lang={lang} />

            {/* Executive Summary — per-module breakdown */}
            <ExecutiveSummary report={report} lang={lang} />

            {/* Account cards */}
            {report.accounts.length === 0 ? (
              <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm rounded-xl p-5">
                {t('noTransactions', lang)}
              </div>
            ) : (
              report.accounts.map(acc => (
                <AccountCard key={acc.account_type} section={acc} lang={lang} />
              ))
            )}

            {/* Final Summary — accounting summary + disclaimer */}
            <FinalSummary report={report} lang={lang} />
          </>
        )}
      </div>
    </div>
  )
}

/* ─── Suspense shell (fixes shared-chunk SearchParams null crash on hydration) ─ */

export default function ClientReportRC3Page() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-100 flex items-center justify-center">
          <p className="text-sm text-gray-500">Loading report…</p>
        </div>
      }
    >
      <ClientReportRC3Content />
    </Suspense>
  )
}
