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
import type { RC3PropertyReport, RC3AccountSection } from '@/lib/report/types'
import { toClientRow } from '@/lib/report/clientRow'
import type { ClientDisplayRow } from '@/lib/report/clientRow'
import { filterSectionsByReportType, type ReportType } from '@/lib/report/reportTypes'
import {
  buildRowLabel,
  t, type Lang, type LabelKey,
  getExpenseGroupKey,
} from '@/lib/report/labels'
import { computeOperationalKPIs, computeNetOwnerBalance } from '@/lib/report/executiveSummary'

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

function TxRow({ row, idx, lang }: { row: ClientDisplayRow; idx: number; lang: Lang }) {
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
        {fmtDate(row.date)}
      </td>
      <td className="px-4 py-2">
        <div className={`text-xs ${isInfo ? 'text-gray-400 italic' : 'text-gray-800'}`}>
          {primaryText}
        </div>
      </td>
      <td className={`px-4 py-2 text-xs text-right font-mono ${amtClass}`}>
        {eur(row.client_amount)}
      </td>
    </tr>
  )
}

/* ─── Expense group block (Rental + Airbnb) ──────────────────────────────────── */

function ExpenseGroupBlock({ rows, lang }: { rows: ClientDisplayRow[]; lang: Lang }) {
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set())

  // Group rows by expense category
  const groups = new Map<LabelKey, ClientDisplayRow[]>()
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

/* ─── M2 Executive Summary ────────────────────────────────────────── */

const M2_MODULE_COLORS: Record<string, string> = {
  sale:       'bg-slate-800',
  renovation: 'bg-emerald-700',
  rental:     'bg-blue-700',
  airbnb:     'bg-orange-600',
}

function M2ModuleCard({ section, lang }: { section: RC3AccountSection; lang: Lang }) {
  const colorClass = M2_MODULE_COLORS[section.account_type] ?? 'bg-slate-700'
  const { label: balLabel } = getBalanceLabel(section.closing_balance, section.balance_convention, lang)
  const absBalance = Math.abs(section.closing_balance)
  const metrics: { label: string; value: number }[] = (() => {
    if (section.account_type === 'sale') return [
      { label: t('cardSaleContract', lang), value: section.contract_baseline },
      { label: t('cardSaleExpenses', lang), value: section.total_income },
      { label: t('cardSalePayments', lang), value: section.total_expenses },
    ]
    if (section.account_type === 'renovation') return [
      { label: t('cardRenovContract', lang), value: section.contract_baseline },
      { label: t('cardRenovExtras', lang),   value: section.total_income },
      { label: t('cardRenovPayments', lang), value: section.total_expenses },
    ]
    if (section.account_type === 'rental') return [
      { label: t('cardRentalIncome', lang),   value: section.total_income },
      { label: t('cardRentalExpenses', lang), value: section.total_expenses },
      { label: t('cardRentalBpo', lang),      value: section.total_bpo },
    ]
    return [
      { label: t('cardAirbnbIncome', lang),   value: section.total_income },
      { label: t('cardAirbnbExpenses', lang), value: section.total_expenses },
      { label: t('cardAirbnbBpo', lang),      value: section.total_bpo },
    ]
  })()
  const accountLabelKeys: Partial<Record<string, LabelKey>> = {
    sale: 'accountSale', renovation: 'accountRenovation', rental: 'accountRental', airbnb: 'accountAirbnb',
  }
  const lk = accountLabelKeys[section.account_type]
  return (
    <div className="flex-1 min-w-[180px] rounded-xl overflow-hidden border border-white/10">
      <div className={`${colorClass} px-4 py-3`}>
        <div className="text-[9px] font-bold text-white/70 uppercase tracking-wider mb-1">
          {lk ? t(lk, lang) : section.account_label}
        </div>
        <div className="text-2xl font-bold text-white font-mono">{eur(absBalance)}</div>
        <div className="text-[10px] text-white/75 mt-1">{balLabel}</div>
      </div>
      <div className="bg-white/5 px-4 py-2 space-y-1.5">
        {metrics.map(m => (
          <div key={m.label} className="flex justify-between items-center">
            <span className="text-[10px] text-blue-200/70">{m.label}</span>
            <span className="text-[10px] font-mono text-white/85">{eur(m.value)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function PremiumSummary({ report, lang }: { report: RC3PropertyReport; lang: Lang }) {
  const netOwnerBalance = computeNetOwnerBalance(report.accounts)
  const { income: opIncome, expenses: opExpenses, transfers: opTransfers, hasOperational } =
    computeOperationalKPIs(report.accounts)
  const absNet = Math.abs(netOwnerBalance)
  let heroLabel: string, heroBg: string, heroAmountClass: string
  if (absNet < 0.005) {
    heroLabel = t('balSettled', lang); heroBg = 'bg-slate-600'; heroAmountClass = 'text-white'
  } else if (netOwnerBalance > 0) {
    heroLabel = t('balPayableToYou', lang); heroBg = 'bg-green-800'; heroAmountClass = 'text-green-300'
  } else {
    heroLabel = t('balPayableByYou', lang); heroBg = 'bg-red-900'; heroAmountClass = 'text-red-300'
  }
  const period = report.from_date || report.to_date
    ? `${report.from_date ? fmtDate(report.from_date) : '—'} – ${report.to_date ? fmtDate(report.to_date) : '—'}`
    : t('execAllDates', lang)
  return (
    <div className="bg-gradient-to-br from-[#1a3354] to-[#0d1f36] rounded-2xl p-6 mb-6 text-white shadow-2xl" dir="ltr">
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-400 mb-1">{t('execTitle', lang)}</div>
          <div className="text-2xl font-bold">{report.reporting_name}</div>
          <div className="text-blue-300 text-sm mt-1">{period}</div>
        </div>
        <div className="text-[10px] text-blue-400 uppercase tracking-widest">{t('confidential', lang)}</div>
      </div>
      <div className={`${heroBg} rounded-xl px-6 py-5 mb-6 flex items-center justify-between`}>
        <div className="text-[10px] font-bold text-white/50 uppercase tracking-widest">{t('dashBalance', lang)}</div>
        <div className="text-right">
          <div className={`text-4xl font-bold font-mono ${heroAmountClass}`}>{eur(absNet)}</div>
          <div className={`text-xs font-semibold mt-1 ${heroAmountClass}`}>{heroLabel}</div>
        </div>
      </div>
      {hasOperational && (
        <div className="mb-6">
          <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-blue-400 mb-3">{t('opSummaryTitle', lang)}</div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: t('opIncomeLabel', lang),  value: opIncome   },
              { label: t('opExpensesLabel', lang), value: opExpenses },
              { label: t('dashTransfers', lang),  value: opTransfers },
            ].map(kpi => (
              <div key={kpi.label} className="bg-white/5 border border-white/10 rounded-lg px-4 py-3">
                <div className="text-[9px] font-bold text-blue-300/80 uppercase tracking-wide mb-2">{kpi.label}</div>
                <div className="text-base font-bold font-mono text-white/90">{eur(kpi.value)}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-3">
        {report.accounts.map(acc => (
          <M2ModuleCard key={acc.account_type} section={acc} lang={lang} />
        ))}
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
        <div className="text-right">
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

/* ── Report Type Selector ───────────────────────────────────────────────── */

function ReportTypeSelector({
  reportType,
  setReportType,
  lang,
}: {
  reportType: ReportType
  setReportType: (rt: ReportType) => void
  lang: Lang
}) {
  return (
    <div>
      <label className="block text-xs font-bold text-gray-600 mb-1 uppercase tracking-wide">
        {t('reportTypeLabel', lang)}
      </label>
      <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
        {(['full', 'periodic'] as ReportType[]).map(rt => (
          <button
            key={rt}
            onClick={() => setReportType(rt)}
            className={`flex-1 px-3 py-2 rounded-md text-xs font-semibold transition-colors ${
              reportType === rt
                ? 'bg-[#1e3a5f] text-white shadow-sm'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200'
            }`}
          >
            {rt === 'full' ? t('reportTypeFull', lang) : t('reportTypePeriodic', lang)}
          </button>
        ))}
      </div>
    </div>
  )
}

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
  const referenceRows = section.rows.filter(r => r.display_group === 'reference').map(toClientRow)
  // Section B: balance-affecting rows
  const incomeRows    = section.rows.filter(r => r.display_group === 'income').map(toClientRow)
  const expenseRows   = section.rows.filter(r => r.display_group === 'expense').map(toClientRow)
  const payoutRows    = section.rows.filter(r => r.display_group === 'payment_out').map(toClientRow)
  // Section C: informational only
  const infoRows      = section.rows.filter(r => r.display_group === 'info').map(toClientRow)

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
    <div className={`rounded-2xl border ${colours.border} ${colours.bg} mb-5 overflow-hidden shadow-sm`}>

      {/* ── Account header ─────────────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-white/20 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <span className={`px-3 py-1 rounded-lg text-xs font-bold ${colours.badge}`}>
            {section.account_label}
          </span>
          {lang === 'he' && (
            <span className="text-xs text-gray-500 font-medium">{section.account_label_he}</span>
          )}
          <span className="text-xs text-gray-400">
            {section.rows.length} {t('rows', lang)}
          </span>
        </div>
        <div className="flex items-center gap-5">
          <div className="text-right">
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
                      <th className="px-4 py-2 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wide w-28">
                        {t('thDate', lang)}
                      </th>
                      <th className="px-4 py-2 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wide">
                        {t('thDescription', lang)}
                      </th>
                      <th className="px-4 py-2 text-right text-[10px] font-bold text-gray-500 uppercase tracking-wide">
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
                        <th className="px-4 py-2 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wide w-28">
                          {t('thDate', lang)}
                        </th>
                        <th className="px-4 py-2 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wide">
                          {t('thDescription', lang)}
                        </th>
                        <th className="px-4 py-2 text-right text-[10px] font-bold text-gray-500 uppercase tracking-wide">
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
              {section.account_label}
            </span>
            <div className="text-right">
              <div className={`text-lg font-bold font-mono ${balClass}`}>
                {eur(Math.abs(section.closing_balance))}
              </div>
              <div className={`text-[10px] font-medium ${balClass}`}>{balLabel}</div>
            </div>
          </div>

          {/* Rental / Airbnb: month allocation placeholder */}
          {(section.account_type === 'rental' || section.account_type === 'airbnb') && (
            <div className="px-5 py-2 bg-blue-50 border-t border-blue-100">
              <span className="text-[10px] text-blue-500 italic">
                ℹ {t('rentalAllocationNote', lang)}
              </span>
            </div>
          )}

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
    report: RC3PropertyReport; lang: Lang; reportType: ReportType
  }> | null>(null)

  useEffect(() => {
    import('@/lib/pdf/OwnerSettlementPdfV3').then(m => {
      setPdfDoc(() => m.OwnerSettlementPdfV3 as React.ComponentType<{
        report: RC3PropertyReport; lang: Lang; reportType: ReportType
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

  const [reportType, setReportType] = useState<ReportType>('full')

  const reportTypeSlug = reportType === 'full' ? 'Full_Owner_Report' : 'Periodic_Owner_Report'
  const pdfFilename = report
    ? `JJ_${reportTypeSlug}_${report.reporting_name.replace(/\s+/g, '_')}_${report.from_date || 'all'}_to_${report.to_date || 'all'}.pdf`
    : 'report.pdf'

  // Filter sections by report type — pure display layer, no accounting changes
  const visibleAccounts = report ? filterSectionsByReportType(report.accounts, reportType) : []
  const filteredReport = report ? { ...report, accounts: visibleAccounts } : null

  const isRTL = lang === 'he'

  return (
    <div className="min-h-screen bg-gray-100" dir={isRTL ? 'rtl' : 'ltr'}>

      {/* ── Top bar ──────────────────────────────────────────────────────────── */}
      <div className="bg-[#1e3a5f] text-white px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold tracking-wide">JJ Property 10</h1>
          <p className="text-blue-200 text-xs mt-0.5">{t('reportTitle', lang)}</p>
        </div>
        <div className="flex items-center gap-3">
          <LangToggle lang={lang} setLang={setLang} />
          <span className="text-xs bg-blue-800 text-blue-100 px-2 py-1 rounded">V2</span>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6">

        {/* ── Controls ─────────────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-5 shadow-sm">
          {/* Multi-property placeholder */}
          <div className="mb-4 px-3 py-2 bg-blue-50 border border-blue-100 rounded-lg">
            <span className="text-xs text-blue-500 italic">
              👤 {t('multiPropertyComing', lang)}
            </span>
          </div>

          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex-none">
              <ReportTypeSelector reportType={reportType} setReportType={setReportType} lang={lang} />
            </div>
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

            {report && pdfReady && PdfDoc && (
              <PDFErrorBoundary>
                <PDFDownloadLink
                  document={<PdfDoc report={filteredReport!} lang={lang} reportType={reportType} />}
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
            {/* M2: Premium Executive Summary */}
            <PremiumSummary report={filteredReport!} lang={lang} />

            {/* Account cards */}
            {visibleAccounts.length === 0 ? (
              <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm rounded-xl p-5">
                {t('noTransactions', lang)}
              </div>
            ) : (
              visibleAccounts.map(acc => (
                <AccountCard key={acc.account_type} section={acc} lang={lang} />
              ))
            )}

            {/* Final Summary — accounting summary + disclaimer */}
            <FinalSummary report={filteredReport!} lang={lang} />
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
