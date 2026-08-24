/**
 * JJ Property 10 — Client Report RC3
 * Phase B — 2026-07-09
 * M6 — 2026-07-12 — Visual Polish / Design System
 * PR B — 2026-07-16 — Report Scope Selector (server-validated authorization)
 *
 * M6 changes (presentation only — no accounting logic touched):
 * - Module colour system: Purchase=slate, Renovation=purple, Management=blue, Airbnb=orange
 * - Lucide icons per module + expense group
 * - Monolingual labels (no mixed EN/HE in badge/footer)
 * - KPI card values text-lg (+12%), row padding py-2.5
 * - Expense group count badge
 * - V3 badge
 * - Removed stale placeholder banners (multiPropertyComing, rentalAllocationNote)
 *
 * PR B changes (authorization wiring — no accounting logic touched):
 * - Properties loaded via getAuthorizedReportProperties() (PR A Server Action)
 * - Scope validated via validateAuthorizedReportScope() (PR A Server Action)
 * - Removed browser-only authorization paths (legacy client-side scope + property resolution)
 * - Authorization errors surfaced in UI
 */

'use client'

import React, { useCallback, useEffect, useState, Suspense } from 'react'
import {
  Building2, Hammer, Key, Plane,
  Zap, Droplets, Wifi, Brush, Wrench, Sofa, Monitor, Package, Shield,
} from 'lucide-react'
import type { ClientReport, ClientReportSection } from '@/lib/report/clientReportDto'
import { toClientRow } from '@/lib/report/clientRow'
import type { ClientDisplayRow } from '@/lib/report/clientRow'
import { filterSectionsByReportType, type ReportType } from '@/lib/report/reportTypes'
import {
  buildRowLabel,
  t, type Lang, type LabelKey,
} from '@/lib/report/labels'
import { groupExpenses } from '@/lib/report/expenseGroups'
import { computeOperationalKPIs, computeNetOwnerBalance, filterOwnerFacingSections } from '@/lib/report/executiveSummary'
import { splitOperatingIncome, splitOperatingIncomeTotals, computeStatementComponents } from '@/lib/report/statementPresentation'
import { ReportScopeSelector } from '@/components/report/ReportScopeSelector'
import type { ReportScope } from '@/lib/report/reportScope'
import { isScopeValid, defaultScope } from '@/lib/report/reportScope'
import { ReportPeriodHeader, ReportScopeSummary } from '@/components/client-report'
import { getAuthorizedReportProperties } from '@/lib/auth/reportAuthorization'
import { generateClientReport, type ClientReportErrorCode } from '@/lib/report/getClientReportAction'

/* ─── Server-generated PDF download link ────────────────────────────────────────
 * The PDF is rendered on the SERVER by the auth-gated route GET /client-report-rc3/pdf,
 * which re-runs the same authorization chain. No client-side react-pdf, no raw
 * report in the browser — the browser only receives the finished PDF bytes.
 */
function pdfHref(opts: { property: string; reportType: ReportType; lang: Lang; fromDate?: string; toDate?: string }): string {
  const p = new URLSearchParams({ property: opts.property, type: opts.reportType, lang: opts.lang })
  if (opts.fromDate) p.set('from', opts.fromDate)
  if (opts.toDate) p.set('to', opts.toDate)
  return `/client-report-rc3/pdf?${p.toString()}`
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
    return b > 0
      ? { label: t('balPayableToYou', lang), colorClass: 'text-green-700' }
      : { label: t('balPayableByYou', lang), colorClass: 'text-red-700' }
  } else {
    return b > 0
      ? { label: t('balPayableByYou', lang), colorClass: 'text-red-700' }
      : { label: t('balPayableToYou', lang), colorClass: 'text-green-700' }
  }
}

/* ─── M6 Design System ───────────────────────────────────────────────────────── */

/* Module colour system — M6: Purchase=slate, Renovation=purple, Management=blue, Airbnb=orange */
const ACCOUNT_COLOURS: Record<string, {
  bg: string; border: string; text: string; badge: string;
  cardBg: string; headerBg: string;
}> = {
  sale: {
    bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-900',
    badge: 'bg-slate-800 text-white',
    cardBg: 'bg-slate-50', headerBg: 'bg-slate-800',
  },
  renovation: {
    bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-900',
    badge: 'bg-purple-700 text-white',
    cardBg: 'bg-purple-50', headerBg: 'bg-purple-700',
  },
  rental: {
    bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-900',
    badge: 'bg-blue-700 text-white',
    cardBg: 'bg-blue-50', headerBg: 'bg-blue-700',
  },
  airbnb: {
    bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-900',
    badge: 'bg-orange-600 text-white',
    cardBg: 'bg-orange-50', headerBg: 'bg-orange-600',
  },
}

const DEFAULT_COLOURS = {
  bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-900',
  badge: 'bg-gray-700 text-white', cardBg: 'bg-gray-50', headerBg: 'bg-gray-700',
}

/* Module icons — subtle 14px professional icons */
type LucideIcon = React.ElementType

const ACCOUNT_ICONS: Record<string, LucideIcon> = {
  sale: Building2,
  renovation: Hammer,
  rental: Key,
  airbnb: Plane,
}

/* Expense group icons */
const EXPENSE_GROUP_ICONS: Partial<Record<LabelKey, LucideIcon>> = {
  grpElectricity: Zap,
  grpWater: Droplets,
  grpInternet: Wifi,
  expCleaning: Brush,
  expMaintenance: Wrench,
  expFurniture: Sofa,
  expSoftware: Monitor,
  expGuestSupplies: Package,
  expBuildingHoa: Shield,
  expManagement: Key,
  expOther: Package,
}

/* Account label keys — monolingual via t() */
const ACCOUNT_LABEL_KEYS: Record<string, LabelKey> = {
  sale: 'accountSale', renovation: 'accountRenovation',
  rental: 'accountRental', airbnb: 'accountAirbnb',
}

/* ─── Transaction row ─────────────────────────────────────────────────────────── */

function TxRow({ row, idx, lang }: { row: ClientDisplayRow; idx: number; lang: Lang }) {
  const isInfo = row.display_group === 'info' || row.display_group === 'reference'
  const isIncome = row.display_group === 'income'

  const amtClass = isInfo
    ? 'text-gray-400 text-xs'
    : isIncome
      ? 'text-green-700 font-medium'
      : 'text-gray-800'

  const primaryText = buildRowLabel(row, lang)

  return (
    <tr className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
      <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap w-28">
        <span dir="ltr">{fmtDate(row.date)}</span>
      </td>
      <td className="px-4 py-2.5">
        <div className={`text-xs ${isInfo ? 'text-gray-400 italic' : 'text-gray-800'}`}>
          {primaryText}
        </div>
      </td>
      <td className={`px-4 py-2.5 text-xs text-end font-mono ${amtClass}`}>
        {eur(row.client_amount)}
      </td>
    </tr>
  )
}

/* ─── Expense group block (Rental + Airbnb) ──────────────────────────────────── */

function ExpenseGroupBlock({ rows, lang }: { rows: ClientDisplayRow[]; lang: Lang }) {
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set())

  // Use expenseGroups.ts grouping (consistent with PDF)
  const groupedData = groupExpenses(rows)

  const toggleGroup = (key: LabelKey) => {
    setOpenGroups(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  if (groupedData.length === 0) return null

  return (
    <div className="divide-y divide-gray-100">
      {groupedData.map(({ key: groupKey, rows: groupRows, total: groupTotal }) => {
        const isOpen = openGroups.has(groupKey)
        const GroupIcon = EXPENSE_GROUP_ICONS[groupKey]
        return (
          <div key={groupKey}>
            <button
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
              onClick={() => toggleGroup(groupKey)}
            >
              <div className="flex items-center gap-2">
                {GroupIcon && <GroupIcon size={13} strokeWidth={2} className="text-gray-400 shrink-0" />}
                <span className="text-sm font-medium text-gray-700">{t(groupKey, lang)}</span>
                {/* M6: transaction count badge */}
                <span className="text-[10px] font-medium text-gray-400 bg-gray-100 rounded-full px-1.5 py-0.5 leading-none">
                  {groupRows.length}
                </span>
              </div>
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
      {/* M6: text-lg (~12% larger than text-base) */}
      <div className={`font-bold font-mono ${highlight ? highlightColor : 'text-gray-900'} ${small ? 'text-base' : 'text-lg'}`}>
        {eur(value)}
      </div>
    </div>
  )
}

function ModuleSummaryCards({ section, lang }: { section: ClientReportSection; lang: Lang }) {
  const { label: balLabel, colorClass: balColor } = getBalanceLabel(
    section.closing_balance,
    section.balance_convention,
    lang
  )

  if (section.account_type === 'purchase') {
    return (
      <div className="flex gap-3 px-4 py-3 flex-wrap">
        <MetricCard label={t('cardPurchaseContract', lang)} value={section.contract_baseline} />
        <MetricCard label={t('cardPurchaseExpenses', lang)} value={section.total_income} />
        <MetricCard label={t('cardPurchasePayments', lang)} value={section.total_expenses} />
        <div className="flex-1 min-w-0 bg-white rounded-xl border-2 border-gray-300 px-4 py-3 shadow-sm">
          <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">
            {t('cardPurchaseBalance', lang)}
          </div>
          <div className={`text-lg font-bold font-mono ${balColor}`}>
            {eur(Math.abs(section.closing_balance))}
          </div>
          <div className={`text-[10px] mt-0.5 ${balColor}`}>{balLabel}</div>
        </div>
      </div>
    )
  }

  if (section.account_type === 'sale') {
    return (
      <div className="flex gap-3 px-4 py-3 flex-wrap">
        <MetricCard label={t('cardSaleContract', lang)} value={section.contract_baseline} />
        <MetricCard label={t('cardSaleExpenses', lang)} value={section.total_income} />
        <MetricCard label={t('cardSalePayments', lang)} value={section.total_expenses} />
        <div className="flex-1 min-w-0 bg-white rounded-xl border-2 border-gray-300 px-4 py-3 shadow-sm">
          <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">
            {t('cardSaleBalance', lang)}
          </div>
          <div className={`text-lg font-bold font-mono ${balColor}`}>
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
        <MetricCard label={t('cardRenovExtras', lang)} value={section.total_income} small />
        <MetricCard label={t('cardRenovTotal', lang)} value={totalContract} small />
        <MetricCard label={t('cardRenovPayments', lang)} value={section.total_expenses} small />
        <div className="flex-1 min-w-0 bg-white rounded-xl border-2 border-gray-300 px-4 py-3 shadow-sm">
          <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">
            {t('cardRenovBalance', lang)}
          </div>
          <div className={`text-base font-bold font-mono ${balColor}`}>
            {eur(Math.abs(section.closing_balance))}
          </div>
          <div className={`text-[10px] mt-0.5 ${balColor}`}>{balLabel}</div>
        </div>
      </div>
    )
  }

  if (section.account_type === 'rental') {
    // #1 — a rental "Client Payment" is a cross-property settlement, not rental
    // income. Same rule as the approved PDF (splitOperatingIncomeTotals). Balance unchanged.
    const opSplit = splitOperatingIncomeTotals(section)
    const hasSettlement = Math.abs(opSplit.crossPropertySettlements) >= 0.005
    return (
      <div className="flex gap-3 px-4 py-3 flex-wrap">
        <MetricCard label={t('cardRentalIncome', lang)} value={opSplit.rentalIncome} />
        {hasSettlement && <MetricCard label={t('sumCrossProperty', lang)} value={opSplit.crossPropertySettlements} />}
        <MetricCard label={t('cardRentalExpenses', lang)} value={section.total_expenses} />
        <MetricCard label={t('cardRentalBpo', lang)} value={section.total_bpo} />
        <div className="flex-1 min-w-0 bg-white rounded-xl border-2 border-gray-300 px-4 py-3 shadow-sm">
          <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">
            {t('cardRentalBalance', lang)}
          </div>
          <div className={`text-lg font-bold font-mono ${balColor}`}>
            {eur(Math.abs(section.closing_balance))}
          </div>
          <div className={`text-[10px] mt-0.5 ${balColor}`}>{balLabel}</div>
        </div>
      </div>
    )
  }

  // airbnb
  const opSplitAirbnb = splitOperatingIncomeTotals(section)
  const hasSettlementAirbnb = Math.abs(opSplitAirbnb.crossPropertySettlements) >= 0.005
  return (
    <div className="flex gap-3 px-4 py-3 flex-wrap">
      <MetricCard label={t('cardAirbnbIncome', lang)} value={opSplitAirbnb.rentalIncome} />
      {hasSettlementAirbnb && <MetricCard label={t('sumCrossProperty', lang)} value={opSplitAirbnb.crossPropertySettlements} />}
      <MetricCard label={t('cardAirbnbExpenses', lang)} value={section.total_expenses} />
      <MetricCard label={t('cardAirbnbBpo', lang)} value={section.total_bpo} />
      <div className="flex-1 min-w-0 bg-white rounded-xl border-2 border-gray-300 px-4 py-3 shadow-sm">
        <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">
          {t('cardAirbnbBalance', lang)}
        </div>
        <div className={`text-lg font-bold font-mono ${balColor}`}>
          {eur(Math.abs(section.closing_balance))}
        </div>
        <div className={`text-[10px] mt-0.5 ${balColor}`}>{balLabel}</div>
      </div>
    </div>
  )
}

/* ─── M2 Executive Summary ────────────────────────────────────────────────────── */

/**
 * Aggregate KPIs across all active account sections.
 * Does NOT touch accounting logic — reads computed aggregates only.
 */
function computeDashboard(accounts: ClientReportSection[]) {
  let totalIncome = 0
  let totalExpenses = 0
  let totalTransfers = 0
  let netOwnerBalance = 0

  for (const acc of accounts) {
    totalIncome += acc.total_income
    totalExpenses += acc.total_expenses
    totalTransfers += acc.total_bpo
    if (acc.balance_convention === 'owner_credit') {
      netOwnerBalance += acc.closing_balance
    } else {
      netOwnerBalance -= acc.closing_balance
    }
  }

  return { totalIncome, totalExpenses, totalTransfers, netOwnerBalance }
}

/* M6: module colours aligned with ACCOUNT_COLOURS */
const M2_MODULE_COLORS: Record<string, string> = {
  purchase: 'bg-slate-800',
  sale: 'bg-slate-800',
  renovation: 'bg-purple-700',
  rental: 'bg-blue-700',
  airbnb: 'bg-orange-600',
}

function M2ModuleCard({ section, lang }: { section: ClientReportSection; lang: Lang }) {
  const colorClass = M2_MODULE_COLORS[section.account_type] ?? 'bg-slate-700'
  const { label: balLabel } = getBalanceLabel(section.closing_balance, section.balance_convention, lang)
  const absBalance = Math.abs(section.closing_balance)
  const ModIcon = ACCOUNT_ICONS[section.account_type]
  const metrics: { label: string; value: number }[] = (() => {
    if (section.account_type === 'purchase') return [
      { label: t('cardPurchaseContract', lang), value: section.contract_baseline },
      { label: t('cardPurchaseExpenses', lang), value: section.total_income },
      { label: t('cardPurchasePayments', lang), value: section.total_expenses },
    ]
    if (section.account_type === 'sale') return [
      { label: t('cardSaleContract', lang), value: section.contract_baseline },
      { label: t('cardSaleExpenses', lang), value: section.total_income },
      { label: t('cardSalePayments', lang), value: section.total_expenses },
    ]
    if (section.account_type === 'renovation') return [
      { label: t('cardRenovContract', lang), value: section.contract_baseline },
      { label: t('cardRenovExtras', lang), value: section.total_income },
      { label: t('cardRenovPayments', lang), value: section.total_expenses },
    ]
    if (section.account_type === 'rental') {
      // #1 — split cross-property settlements out of rental income (approved PDF rule)
      const s = splitOperatingIncomeTotals(section)
      return [
        { label: t('cardRentalIncome', lang), value: s.rentalIncome },
        ...(Math.abs(s.crossPropertySettlements) >= 0.005
          ? [{ label: t('sumCrossProperty', lang), value: s.crossPropertySettlements }] : []),
        { label: t('cardRentalExpenses', lang), value: section.total_expenses },
        { label: t('cardRentalBpo', lang), value: section.total_bpo },
      ]
    }
    const s = splitOperatingIncomeTotals(section)
    return [
      { label: t('cardAirbnbIncome', lang), value: s.rentalIncome },
      ...(Math.abs(s.crossPropertySettlements) >= 0.005
        ? [{ label: t('sumCrossProperty', lang), value: s.crossPropertySettlements }] : []),
      { label: t('cardAirbnbExpenses', lang), value: section.total_expenses },
      { label: t('cardAirbnbBpo', lang), value: section.total_bpo },
    ]
  })()
  const lk = ACCOUNT_LABEL_KEYS[section.account_type]
  return (
    <div className="flex-1 min-w-[180px] rounded-xl overflow-hidden border border-white/10">
      <div className={`${colorClass} px-4 py-3`}>
        <div className="flex items-center gap-1.5 mb-1">
          {ModIcon && <ModIcon size={11} strokeWidth={2.5} className="text-white/60" />}
          <div className="text-[9px] font-bold text-white/70 uppercase tracking-wider">
            {lk ? t(lk, lang) : section.account_label}
          </div>
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

function PremiumSummary({ report, lang }: { report: ClientReport; lang: Lang }) {
  const netOwnerBalance = computeNetOwnerBalance(report.accounts)
  const { income: opIncomeRaw, expenses: opExpenses, transfers: opTransfers, hasOperational } =
    computeOperationalKPIs(report.accounts)
  // #1 — a rental/airbnb "Client Payment" is a cross-property settlement, not
  // operating income. Separate it here (same rule as the approved PDF), so the
  // Operational Income KPI shows genuine income and settlements get their own KPI.
  // Presentation only — the canonical net is unchanged.
  const opSettlements = report.accounts
    .filter(a => a.account_type === 'rental' || a.account_type === 'airbnb')
    .reduce((sum, a) => sum + splitOperatingIncomeTotals(a).crossPropertySettlements, 0)
  const opIncome = opIncomeRaw - opSettlements
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
          <div className="flex flex-wrap gap-3">
            {[
              { label: t('opIncomeLabel', lang), value: opIncome },
              // #1 — cross-property settlements shown separately, never folded into Operational Income
              ...(Math.abs(opSettlements) >= 0.005 ? [{ label: t('sumCrossProperty', lang), value: opSettlements }] : []),
              { label: t('opExpensesLabel', lang), value: opExpenses },
              { label: t('dashTransfers', lang), value: opTransfers },
            ].map(kpi => (
              <div key={kpi.label} className="flex-1 min-w-[120px] bg-white/5 border border-white/10 rounded-lg px-4 py-3">
                <div className="text-[9px] font-bold text-blue-300/80 uppercase tracking-wide mb-2">{kpi.label}</div>
                {/* M6: text-lg for KPI values */}
                <div className="text-lg font-bold font-mono text-white/90">{eur(kpi.value)}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* Module cards — Purchase excluded (JJ internal acquisition, Global Owner/Client Perspective Rule) */}
      <div className="flex flex-wrap gap-3">
        {filterOwnerFacingSections(report.accounts).map(acc => (
          <M2ModuleCard key={acc.account_type} section={acc} lang={lang} />
        ))}
      </div>
    </div>
  )
}

/* ─── Final Summary ───────────────────────────────────────────────────────────── */

function FinalSummary({ report, lang }: { report: ClientReport; lang: Lang }) {
  // Canonical net — unchanged (do NOT recompute the balance here).
  const { netOwnerBalance } = computeDashboard(report.accounts)

  let balLabel: string
  let balColor: string
  if (Math.abs(netOwnerBalance) < 0.005) {
    balLabel = t('balSettled', lang); balColor = 'text-gray-300'
  } else if (netOwnerBalance > 0) {
    balLabel = t('balPayableToYou', lang); balColor = 'text-green-300'
  } else {
    balLabel = t('balPayableByYou', lang); balColor = 'text-red-300'
  }

  // #1 — Statement components, each type identified separately (matches the approved
  // PDF Settlement Summary). A cross-property settlement is NEVER folded into an
  // "Income" total. Genuine operating income and settlements come from the SAME
  // approved helper (splitOperatingIncomeTotals); the remaining components from
  // computeStatementComponents. Presentation only — the canonical net is untouched.
  const operating = report.accounts.filter(a => a.account_type === 'rental' || a.account_type === 'airbnb')
  const operationalIncome = operating.reduce((s, a) => s + splitOperatingIncomeTotals(a).rentalIncome, 0)
  const crossPropertySettlements = operating.reduce((s, a) => s + splitOperatingIncomeTotals(a).crossPropertySettlements, 0)
  const comp = computeStatementComponents(report.accounts)
  const componentLines = [
    { label: t('opIncomeLabel', lang), value: operationalIncome },
    { label: t('sumRenovationContract', lang), value: comp.renovationContract },
    { label: t('sumApprovedExtras', lang), value: comp.approvedExtras },
    { label: t('sumPaymentsReceived', lang), value: comp.paymentsReceived },
    { label: t('sumCrossProperty', lang), value: crossPropertySettlements },
    { label: t('sumPropertyExpenses', lang), value: comp.propertyExpenses },
  ].filter(l => Math.abs(l.value) >= 0.005)

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

      {/* Statement components — each type identified separately (no "Total Income") */}
      <div className="flex flex-wrap gap-3 mb-4">
        {componentLines.map(k => (
          <div key={k.label} className="flex-1 min-w-[150px] bg-white/10 rounded-xl px-4 py-3">
            <div className="text-[10px] text-blue-300 mb-1.5 font-medium">{k.label}</div>
            {/* M6: text-lg */}
            <div className="text-lg font-bold font-mono text-white">{eur(k.value)}</div>
          </div>
        ))}
      </div>

      {/* Net balance highlight */}
      <div className="bg-white/10 rounded-xl px-5 py-4 mb-5 flex items-center justify-between">
        <div className="text-sm font-bold text-blue-200">{t('finalCurrentBalance', lang)}</div>
        {/* text-end: outer edge in LTR (right) and RTL (left) */}
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
        {/* M6: closing statement */}
        <p className="text-[9px] text-blue-500/60 mt-3 border-t border-white/10 pt-3 text-end">
          {t('finalEndStatement', lang)}
        </p>
      </div>
    </div>
  )
}

/* ─── Report Type Selector ────────────────────────────────────────────────────── */

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

/* ─── Account section card ────────────────────────────────────────────────────── */

function AccountCard({ section, lang }: { section: ClientReportSection; lang: Lang }) {
  const [expanded, setExpanded] = useState(true)
  const [showInfo, setShowInfo] = useState(false)

  const colours = ACCOUNT_COLOURS[section.account_type] ?? DEFAULT_COLOURS
  const ModIcon = ACCOUNT_ICONS[section.account_type]
  const lk = ACCOUNT_LABEL_KEYS[section.account_type]
  // M6: monolingual label — always t(key, lang), never raw account_label
  const modLabel = lk ? t(lk, lang) : section.account_label

  const { label: balLabel, colorClass: balClass } = getBalanceLabel(
    section.closing_balance,
    section.balance_convention,
    lang
  )

  // Section A: reference rows
  const referenceRows = section.rows.filter(r => r.display_group === 'reference').map(toClientRow)
  // Section B: balance-affecting rows
  const incomeRows = section.rows.filter(r => r.display_group === 'income').map(toClientRow)
  const expenseRows = section.rows.filter(r => r.display_group === 'expense').map(toClientRow)
  const payoutRows = section.rows.filter(r => r.display_group === 'payment_out').map(toClientRow)
  // Section C: informational only
  const infoRows = section.rows.filter(r => r.display_group === 'info').map(toClientRow)

  // Determine income/expense group labels by account type
  const incomeLabelKey: LabelKey = section.account_type === 'sale' ? 'incomeSale'
    : section.account_type === 'renovation' ? 'incomeRenov'
    : section.account_type === 'rental' ? 'incomeRental'
    : 'incomeAirbnb'
  const expenseLabelKey: LabelKey = section.account_type === 'sale' ? 'expensesSale'
    : section.account_type === 'renovation' ? 'expensesRenov'
    : section.account_type === 'rental' ? 'expensesRental'
    : 'expensesAirbnb'

  const useExpenseGrouping = section.account_type === 'rental' || section.account_type === 'airbnb'

  // #1 — operating accounts: a "Client Payment" income row is a cross-property
  // settlement, not rental income. Split it out under its own heading (same rule
  // as the approved PDF). Tenant/genuine income stays under the income heading.
  const isOperating = section.account_type === 'rental' || section.account_type === 'airbnb'
  const { income: primaryIncomeRows, settlements: settlementRows } =
    isOperating ? splitOperatingIncome(incomeRows) : { income: incomeRows, settlements: [] as typeof incomeRows }
  const opTotals = isOperating ? splitOperatingIncomeTotals(section) : null
  const hasSettlement = !!opTotals && Math.abs(opTotals.crossPropertySettlements) >= 0.005

  return (
    <div className={`rounded-2xl border ${colours.border} ${colours.bg} mb-5 overflow-hidden shadow-sm print-card`}>

      {/* ── Account header ─────────────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-white/20 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          {/* M6: badge with icon, monolingual */}
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold ${colours.badge}`}>
            {ModIcon && <ModIcon size={12} strokeWidth={2.5} />}
            {modLabel}
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
                {t(incomeLabelKey, lang)}: {eur(isOperating && opTotals ? opTotals.rentalIncome : section.total_income)}
              </span>
            )}
            {hasSettlement && opTotals && (
              <span className="text-blue-700 font-medium">
                {t('sumCrossProperty', lang)}: {eur(opTotals.crossPropertySettlements)}
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

          {/* Section B — Income rows (genuine operating/other income) */}
          {primaryIncomeRows.length > 0 && (
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
                    {primaryIncomeRows.map((row, i) => (
                      <TxRow key={row.id} row={row} idx={i} lang={lang} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Section B — Cross-property settlements: a "Client Payment" credit used
              to settle another account. Never rental income (approved PDF rule). */}
          {settlementRows.length > 0 && (
            <div className="border-b border-gray-100">
              <div className="px-5 pt-3 pb-1">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">
                  {t('sumCrossProperty', lang)}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <tbody className="divide-y divide-gray-100">
                    {settlementRows.map((row, i) => (
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

          {/* M6: Balance footer — monolingual module name */}
          <div className="flex items-center justify-between px-5 py-3 bg-gray-100 border-t border-gray-300">
            <div className="flex items-center gap-1.5">
              {ModIcon && <ModIcon size={13} strokeWidth={2} className="text-gray-500" />}
              <span className="text-sm font-bold text-gray-700">{modLabel}</span>
            </div>
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
                  <span className="ms-1 text-gray-400">
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
 * Forces color-accurate output so module background colors survive the browser's
 * "background graphics" stripping.
 * ─────────────────────────────────────────────────────────────────────────────── */

function PrintStyles({ isRTL }: { isRTL: boolean }) {
  const css = `
    @media print {
      * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      @page { size: A4 portrait; margin: 12mm 10mm; }
      .print-hide { display: none !important; }
      .print-card { break-inside: avoid; page-break-inside: avoid; }
      tr { break-inside: avoid; page-break-inside: avoid; }
      body { background: white !important; }
      ${isRTL ? '[dir="rtl"] { direction: rtl; unicode-bidi: embed; }' : ''}
      span[dir="ltr"] { display: inline-block; white-space: nowrap; }
    }
  `
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

/* ─── Authorization error messages ────────────────────────────────────────────── */

function authErrorMessage(error: string, lang: Lang): string {
  const messages: Record<string, { en: string; he: string }> = {
    unauthenticated: { en: 'Please log in to view reports.', he: 'יש להתחבר כדי לצפות בדוחות.' },
    no_role: { en: 'No report access configured for your account.', he: 'לא הוגדרה גישה לדוחות עבור חשבונך.' },
    role_inactive: { en: 'Your account is inactive.', he: 'החשבון שלך אינו פעיל.' },
    unknown_role: { en: 'Your role does not have report access.', he: 'התפקיד שלך אינו כולל גישה לדוחות.' },
    empty_property_set: { en: 'No properties available.', he: 'אין נכסים זמינים.' },
    empty_selection: { en: 'Please select at least one property.', he: 'אנא בחר לפחות נכס אחד.' },
    missing_property: { en: 'Please select a property.', he: 'אנא בחר נכס.' },
    no_authorized_properties: { en: 'The selected property is not available.', he: 'הנכס הנבחר אינו זמין.' },
  }
  return messages[error]?.[lang] ?? messages[error]?.en ?? 'Authorization failed.'
}

/* ─── Server-action error messages (generic; no internal detail leaked) ───────── */

function actionErrorMessage(error: ClientReportErrorCode, lang: Lang): string {
  const messages: Record<ClientReportErrorCode, { en: string; he: string }> = {
    invalid_input: { en: 'Invalid report request.', he: 'בקשת דוח לא תקינה.' },
    access_denied: { en: 'You are not authorized to view this report.', he: 'אינך מורשה לצפות בדוח זה.' },
    not_found: { en: 'No report data available.', he: 'אין נתוני דוח זמינים.' },
    server_error: { en: 'Could not generate the report. Please try again.', he: 'לא ניתן להפיק את הדוח. נסה שוב.' },
  }
  return messages[error]?.[lang] ?? messages[error]?.en ?? 'Could not generate the report.'
}

/* ─── Main page content ──────────────────────────────────────────────────────── */

function ClientReportRC3Content() {
  const [lang, setLang] = useState<Lang>('en')
  const [properties, setProperties] = useState<string[]>([])
  const [scope, setScope] = useState<ReportScope>({ type: 'single_property', propertyName: '' })
  const [multiReports, setMultiReports] = useState<ClientReport[]>([])
  const [fromDate, setFromDate] = useState<string>('')
  const [toDate, setToDate] = useState<string>('')
  const [report, setReport] = useState<ClientReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pdfReady, setPdfReady] = useState(false)
  // Hoisted above loadReport so the server action receives the selected report type.
  const [reportType, setReportType] = useState<ReportType>('full')

  /**
   * PR B: Load authorized properties via PR A Server Action.
   *
   * Authorization chain:
   *   session cookie → auth.getUser() → auth.uid → user_roles
   *   → explicit server-side role policy → canonical reportable property set
   *
   * Replaces the previous browser-side property list loading call.
   */
  useEffect(() => {
    getAuthorizedReportProperties()
      .then(result => {
        if (!result.ok) {
          setError(authErrorMessage(result.error, lang))
          return
        }
        setProperties(result.properties)
        if (result.properties.length > 0) setScope(defaultScope(result.properties[0]))
      })
      .catch(err => setError(err.message))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * PR B: Load report with server-validated scope.
   *
   * Full authorization chain:
   *   session → auth.uid → user_roles → policy → authorized set
   *   → validate scope → resolved properties → fetch reports
   *
   * Replaces the previous browser-side scope resolution call.
   * Browser-submitted property names are NEVER authoritative.
   */
  const loadReport = useCallback(async () => {
    if (!isScopeValid(scope)) return
    setLoading(true)
    setError(null)
    setPdfReady(false)
    setReport(null)
    setMultiReports([])
    try {
      // ONE atomic server action: it validates input, authenticates the session,
      // authorizes the scope, fetches RC3 server-side, and returns ONLY the
      // client-safe DTO. The raw report and the service-role client never reach
      // the browser. The PDF is produced separately by the auth-gated route
      // GET /client-report-rc3/pdf (see pdfHref), which re-runs the same
      // authorization chain server-side.
      const result = await generateClientReport({
        scope,
        reportType,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        lang,
      })
      if (!result.ok) {
        setError(actionErrorMessage(result.error, lang))
        return
      }

      if (scope.type === 'single_property') {
        setReport(result.reports[0] ?? null)
      } else {
        setMultiReports(result.reports)
      }
      setPdfReady(true) // report data ready; PDF served on-demand by the route handler
    } catch {
      setError(actionErrorMessage('server_error', lang))
    } finally {
      setLoading(false)
    }
  }, [scope, fromDate, toDate, lang, reportType])

  // Auto-load when the user selects a different property in single-property mode.
  // Portfolio / selected_properties require an explicit "View Report" click.
  const _singlePropTrigger =
    scope.type === 'single_property' ? scope.propertyName : ''
  useEffect(() => {
    if (_singlePropTrigger) loadReport()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [_singlePropTrigger])

  // Filter sections by report type + exclude Purchase (JJ internal, Global Owner/Client Perspective Rule)
  const visibleAccounts = report ? filterOwnerFacingSections(filterSectionsByReportType(report.accounts, reportType)) : []
  const filteredReport = report ? { ...report, accounts: visibleAccounts } : null

  const isRTL = lang === 'he'

  return (
    <div className="min-h-screen bg-gray-100" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Print-specific CSS */}
      <PrintStyles isRTL={isRTL} />

      {/* ── Top bar ──────────────────────────────────────────────────────────── */}
      <div className="bg-[#1e3a5f] text-white px-6 py-4 flex items-center justify-between">
        <div>
          {/* M6: Hierarchy — Brand / Report Type / (property loaded below) */}
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-400 mb-0.5">
            JJ Property 10
          </div>
          <h1 className="text-lg font-bold tracking-wide leading-tight">
            {t('reportTitle', lang)}
          </h1>
        </div>
        {/* print-hide: controls disappear in print output */}
        <div className="flex items-center gap-3 print-hide">
          <LangToggle lang={lang} setLang={setLang} />
          {/* M6: V3 badge */}
          <span className="text-xs bg-blue-800 text-blue-100 px-2 py-1 rounded">V3</span>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6">

        {/* ── Controls — hidden in print mode ──────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-5 shadow-sm print-hide">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex-none">
              <ReportTypeSelector reportType={reportType} setReportType={setReportType} lang={lang} />
            </div>
            <div className="flex-1 min-w-56">
              <ReportScopeSelector
                scope={scope}
                onChange={setScope}
                properties={properties}
                lang={lang}
              />
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
              disabled={loading || !isScopeValid(scope)}
              className="px-5 py-2.5 bg-[#1e3a5f] text-white text-sm rounded-lg hover:bg-[#2d5a9e] disabled:opacity-50 font-medium transition-colors"
            >
              {loading ? t('loading', lang) : t('viewReport', lang)}
            </button>

            {report && pdfReady && (
              <a
                href={pdfHref({
                  property: report.reporting_name,
                  reportType,
                  lang,
                  fromDate: fromDate || undefined,
                  toDate: toDate || undefined,
                })}
                target="_blank"
                rel="noopener noreferrer"
                className="px-5 py-2.5 bg-green-700 text-white text-sm rounded-lg hover:bg-green-800 font-medium transition-colors"
              >
                {`⬇ ${t('downloadPdf', lang)}`}
              </a>
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
            {t('loading', lang)}
          </div>
        )}

        {/* ── Report ───────────────────────────────────────────────────────── */}
        {report && !loading && (
          <>
            {/* Presentation shell — additive header + scope (real DTO values; no total changes) */}
            <ReportScopeSummary scope={scope} totalProperties={properties.length} fromDate={report.from_date} toDate={report.to_date} lang={lang} />
            <ReportPeriodHeader reportingName={report.reporting_name} fromDate={report.from_date} toDate={report.to_date} generatedAt={report.generated_at} reportType={reportType} lang={lang} />

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

        {/* ── Multi-property report (portfolio / selected_properties) ─────── */}
        {multiReports.length > 0 && !loading && (
          <div className="space-y-6">
            {multiReports.map(mr => {
              const mrAccounts = filterOwnerFacingSections(filterSectionsByReportType(mr.accounts, reportType))
              const mrFiltered = { ...mr, accounts: mrAccounts }
              return (
                <div key={mr.reporting_name}>
                  <PremiumSummary report={mrFiltered} lang={lang} />
                  {mrAccounts.length === 0 ? (
                    <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm rounded-xl p-5 mb-4">
                      {t('noTransactions', lang)}
                    </div>
                  ) : (
                    mrAccounts.map(acc => (
                      <AccountCard key={acc.account_type} section={acc} lang={lang} />
                    ))
                  )}
                  <FinalSummary report={mrFiltered} lang={lang} />

                  {/* Per-property PDF download link.
                      One link per property — each is served on-demand by the
                      auth-gated route handler. Unified scope PDF (single document,
                      all properties) is future work. */}
                  {pdfReady && (
                    <div className="flex justify-end mt-2 mb-4">
                      <a
                        href={pdfHref({
                          property: mr.reporting_name,
                          reportType,
                          lang,
                          fromDate: fromDate || undefined,
                          toDate: toDate || undefined,
                        })}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-4 py-2 bg-green-700 text-white text-sm rounded-lg hover:bg-green-800 font-medium transition-colors"
                      >
                        {`⬇ ${t('downloadPdf', lang)} — ${mr.reporting_name}`}
                      </a>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── Suspense shell ─────────────────────────────────────────────────────────── */

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
