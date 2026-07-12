/**
 * JJ Property 10 — Owner Settlement Report V3
 * Phase B — 2026-07-09
 *
 * Phase B additions:
 *  - lang prop: all labels flow through t(key, lang) from labels.ts
 *  - Client-facing balance wording: Amount Payable to You / Amount Payable by You / Settled
 *  - Per-module summary table (key metrics for each account type)
 *  - Section labels in both EN / HE
 *
 * UX / presentation layer only. No accounting logic changed.
 *
 * Font: Heebo (Hebrew + Latin, SIL OFL). Served from /fonts/Heebo-*.ttf.
 */

'use client'

import React from 'react'
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from '@react-pdf/renderer'
import { fmt } from './formatters'
import { filterSectionsByReportType, type ReportType } from '../report/reportTypes'
import type { RC3PropertyReport, RC3AccountSection } from '../report/types'
import { toClientRow } from '../report/clientRow'
import type { ClientDisplayRow } from '../report/clientRow'
import {
  buildRowLabel,
  t, type Lang, type LabelKey,
} from '../report/labels'
import { groupExpenses } from '../report/expenseGroups'
import { computeOperationalKPIs, computeNetOwnerBalance } from '../report/executiveSummary'

/* ─── Font ──────────────────────────────────────────────────────────────────── */

Font.register({
  family: 'Heebo',
  fonts: [
    { src: '/fonts/Heebo-Regular.ttf' },
    { src: '/fonts/Heebo-Bold.ttf', fontWeight: 'bold' },
  ],
})

/* ─── Palette ───────────────────────────────────────────────────────────────── */

const C = {
  navy:        '#1e3a5f',
  navyLight:   '#2d5a9e',
  green:       '#15803d',
  greenBg:     '#f0fdf4',
  greenBorder: '#86efac',
  red:         '#b91c1c',
  redBg:       '#fef2f2',
  redBorder:   '#fca5a5',
  amber:       '#92400e',
  amberBg:     '#fffbeb',
  amberBorder: '#fcd34d',
  grayBg:      '#f8fafc',
  grayBorder:  '#e2e8f0',
  grayLine:    '#f1f5f9',
  grayText:    '#64748b',
  grayMid:     '#94a3b8',
  grayDark:    '#1e293b',
  white:       '#ffffff',
  purple:      '#6d28d9',
  purpleBg:    '#f5f3ff',
}

const ACCOUNT_COLOURS = {
  sale:       C.navy,
  renovation: C.purple,
  rental:     C.green,
  airbnb:     C.navyLight,
} as const

/* ─── Styles ────────────────────────────────────────────────────────────────── */

const s = StyleSheet.create({
  page: {
    paddingHorizontal: 46,
    paddingTop: 38,
    paddingBottom: 58,
    fontFamily: 'Heebo',
    backgroundColor: C.white,
    color: C.grayDark,
    fontSize: 9,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 18,
    paddingBottom: 12,
    borderBottomWidth: 2,
    borderBottomColor: C.navy,
  },
  companyName:  { fontSize: 17, fontWeight: 'bold', color: C.navy, letterSpacing: 0.4 },
  reportTitle:  { fontSize: 8.5, color: C.grayText, marginTop: 3 },
  headerRight:  { alignItems: 'flex-end' },
  headerDate:   { fontSize: 7.5, color: C.grayText, marginBottom: 2 },
  headerLabel:  { fontSize: 7.5, fontWeight: 'bold', color: C.navy, letterSpacing: 0.5 },

  // Meta
  metaBlock: {
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.grayBorder,
  },
  metaRow:   { flexDirection: 'row', marginBottom: 3 },
  metaLabel: {
    fontSize: 7.5, fontWeight: 'bold', color: C.grayText,
    width: 72, textTransform: 'uppercase', letterSpacing: 0.3,
  },
  metaValue: { fontSize: 8.5, color: C.grayDark, flex: 1, lineHeight: 1.4 },

  // Owner Dashboard strip (aggregate KPIs — very top of report body)
  dashSection: {
    marginBottom: 14,
  },
  dashHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 0,
    marginBottom: 5,
  },
  dashHeaderTitle: {
    fontSize: 7.5, fontWeight: 'bold', color: C.navy,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  dashHeaderSub: {
    fontSize: 7, color: C.grayText,
  },
  dashStrip: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: C.grayBorder,
    borderRadius: 5,
    overflow: 'hidden',
    backgroundColor: C.white,
  },
  dashCell: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRightWidth: 1,
    borderRightColor: C.grayBorder,
    alignItems: 'center',
  },
  dashCellLast: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  dashCellLabel: {
    fontSize: 6.5, fontWeight: 'bold', color: C.grayText,
    textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 4,
    textAlign: 'center',
  },
  dashCellValue: {
    fontSize: 13, fontWeight: 'bold', color: C.grayDark,
  },
  dashCellSub: {
    fontSize: 6, color: C.grayText, marginTop: 2, textAlign: 'center',
  },

  // Cross-account summary card (at top of document)
  summaryCard: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: C.grayBorder,
    borderRadius: 5,
    marginBottom: 18,
    overflow: 'hidden',
  },
  summaryCell: {
    flex: 1,
    padding: 10,
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: C.grayBorder,
  },
  summaryCellLast: {
    flex: 1,
    padding: 10,
    alignItems: 'center',
  },
  summaryCellLabel: {
    fontSize: 7, fontWeight: 'bold', color: C.grayText,
    textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 4,
  },
  summaryCellValue: { fontSize: 13, fontWeight: 'bold' },
  summaryCellSub:   { fontSize: 7, color: C.grayText, marginTop: 2 },

  // Per-module metrics strip
  moduleMetrics: {
    flexDirection: 'row',
    backgroundColor: C.grayBg,
    borderWidth: 1,
    borderColor: C.grayBorder,
    borderRadius: 4,
    marginBottom: 8,
    overflow: 'hidden',
  },
  moduleMetricCell: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRightWidth: 1,
    borderRightColor: C.grayBorder,
    alignItems: 'center',
  },
  moduleMetricCellLast: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  moduleMetricLabel: {
    fontSize: 6.5, fontWeight: 'bold', color: C.grayText,
    textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 3,
    textAlign: 'center',
  },
  moduleMetricValue: { fontSize: 9, fontWeight: 'bold', color: C.grayDark },
  moduleMetricSub:   { fontSize: 6, color: C.grayText, marginTop: 1, textAlign: 'center' },

  // Account section
  accountSection: { marginBottom: 22 },
  accountHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 6,
    borderRadius: 4,
  },
  accountHeaderLeft:  { flexDirection: 'column' },
  accountHeaderRight: { alignItems: 'flex-end' },
  accountTitle:    { fontSize: 10, fontWeight: 'bold', color: C.white, letterSpacing: 0.6 },
  accountTitleHe:  { fontSize: 8, color: C.white, opacity: 0.8, marginTop: 1 },
  accountBalance:  { fontSize: 11, fontWeight: 'bold', color: C.white },
  accountBalLabel: { fontSize: 7, color: C.white, opacity: 0.85, marginTop: 1 },

  // Sub-group header
  groupLabel: {
    fontSize: 7.5,
    fontWeight: 'bold',
    color: C.grayText,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    paddingTop: 8,
    paddingBottom: 4,
    paddingHorizontal: 4,
  },

  // Table
  tableHead: {
    flexDirection: 'row',
    backgroundColor: C.grayBg,
    paddingVertical: 3,
    paddingHorizontal: 6,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: C.grayBorder,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 3.5,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: C.grayLine,
  },
  tableRowAlt: { backgroundColor: '#fafafa' },
  tableTot: {
    flexDirection: 'row',
    paddingVertical: 3.5,
    paddingHorizontal: 6,
    borderTopWidth: 1,
    borderTopColor: C.grayBorder,
    backgroundColor: C.grayBg,
  },
  th:      { fontSize: 7, fontWeight: 'bold', color: C.grayText, textTransform: 'uppercase', letterSpacing: 0.2 },
  td:      { fontSize: 7.5, color: C.grayDark },
  tdMuted: { fontSize: 7.5, color: C.grayText },
  tdBold:  { fontSize: 7.5, fontWeight: 'bold', color: C.grayDark },
  tdInfo:  { fontSize: 7, color: C.grayMid },
  cDate:   { width: 54 },
  cDesc:   { flex: 1 },
  cAmt:    { width: 74, textAlign: 'right' },

  // Reference section (Section A)
  refSection: {
    marginBottom: 6,
    borderWidth: 1,
    borderColor: C.grayBorder,
    borderRadius: 3,
    overflow: 'hidden',
  },
  refHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f0f4f8',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.grayBorder,
  },
  refHeaderLabel: {
    fontSize: 7, fontWeight: 'bold', color: C.grayText,
    textTransform: 'uppercase', letterSpacing: 0.3,
  },
  refHeaderNote: { fontSize: 6.5, color: C.grayMid },
  refRow: {
    flexDirection: 'row',
    paddingVertical: 3.5,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.grayLine,
  },

  // Balance strip
  balStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginTop: 4,
    borderTopWidth: 1.5,
    borderTopColor: C.grayBorder,
    backgroundColor: C.grayBg,
    borderRadius: 3,
  },
  balLabel: { fontSize: 8.5, fontWeight: 'bold', color: C.grayDark },
  balValue: { fontSize: 8.5, fontWeight: 'bold' },
  balSub:   { fontSize: 7, color: C.grayText, marginTop: 1 },

  // Final Summary block
  finalSection: {
    marginTop: 16,
    backgroundColor: '#1e3a5f',
    borderRadius: 5,
    padding: 14,
  },
  finalTitle: {
    fontSize: 6.5, fontWeight: 'bold', color: '#93c5fd',
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8,
  },
  finalKpiRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  finalKpiCell: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 4,
    padding: 8,
    marginRight: 5,
  },
  finalKpiCellLast: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 4,
    padding: 8,
  },
  finalKpiLabel: { fontSize: 5.5, color: '#93c5fd', marginBottom: 3 },
  finalKpiValue: { fontSize: 9, fontWeight: 'bold', color: '#ffffff' },
  finalBalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 4,
    padding: 10,
    marginBottom: 10,
  },
  finalBalLabel: { fontSize: 8, fontWeight: 'bold', color: '#bfdbfe' },
  finalBalValue: { fontSize: 14, fontWeight: 'bold' },
  finalBalSub:   { fontSize: 6.5, marginTop: 1 },
  finalDiscBorder: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.2)',
    paddingTop: 8,
  },
  finalDiscTitle: {
    fontSize: 6, fontWeight: 'bold', color: '#60a5fa',
    textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 3,
  },
  finalDiscText: { fontSize: 6.5, color: '#bfdbfe', lineHeight: 1.5 },
  finalDiscGen:  { fontSize: 6, color: '#60a5fa', marginTop: 4 },

  // Footer
  footer: {
    position: 'absolute',
    bottom: 18,
    left: 46,
    right: 46,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: C.grayBorder,
    paddingTop: 4,
  },
  footerText: { fontSize: 6.5, color: C.grayText },

  // Disclosure
  disclosure: {
    marginTop: 16,
    padding: 8,
    backgroundColor: C.amberBg,
    borderWidth: 1,
    borderColor: C.amberBorder,
    borderRadius: 3,
  },
  disclosureText: { fontSize: 7, color: C.amber, lineHeight: 1.5 },
})

/* ─── Balance helpers ───────────────────────────────────────────────────────── */

function getBalLabel(section: RC3AccountSection, lang: Lang): string {
  const b    = section.closing_balance
  const conv = section.balance_convention
  if (Math.abs(b) < 0.005) return t('balSettled', lang)
  if (conv === 'owner_credit') {
    return b > 0 ? t('balPayableToYou', lang) : t('balPayableByYou', lang)
  } else {
    return b > 0 ? t('balPayableByYou', lang) : t('balPayableToYou', lang)
  }
}

function getBalColor(section: RC3AccountSection): string {
  const b    = section.closing_balance
  const conv = section.balance_convention
  if (Math.abs(b) < 0.005) return C.grayText
  if (conv === 'owner_credit') return b > 0 ? C.green : C.red
  else                         return b > 0 ? C.red   : C.green
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
    })
  } catch { return iso }
}

function fmtPeriod(report: RC3PropertyReport, lang: Lang): string {
  if (!report.from_date && !report.to_date) return t('execAllDates', lang)
  if (!report.from_date) return `Up to ${fmtDate(report.to_date!)}`
  if (!report.to_date)   return `From ${fmtDate(report.from_date)}`
  return `${fmtDate(report.from_date)} – ${fmtDate(report.to_date)}`
}

function fmtGenerated(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch { return iso }
}

/* ─── Sub-components ────────────────────────────────────────────────────────── */

function DocHeader({ report, lang, reportTypeLabel }: { report: RC3PropertyReport; lang: Lang; reportTypeLabel: string }) {
  return (
    <View style={s.header} fixed>
      <View>
        <Text style={s.companyName}>JJ Property 10</Text>
        <Text style={s.reportTitle}>
          {reportTypeLabel} — {report.reporting_name}
        </Text>
      </View>
      <View style={s.headerRight}>
        <Text style={s.headerDate}>{fmtGenerated(report.generated_at)}</Text>
        <Text style={s.headerLabel}>{t('confidential', lang)}</Text>
      </View>
    </View>
  )
}

function MetaBlock({ report, lang }: { report: RC3PropertyReport; lang: Lang }) {
  return (
    <View style={s.metaBlock}>
      <View style={s.metaRow}>
        <Text style={s.metaLabel}>{t('execProperty', lang)}</Text>
        <Text style={s.metaValue}>{report.reporting_name}</Text>
      </View>
      <View style={s.metaRow}>
        <Text style={s.metaLabel}>{t('execPeriod', lang)}</Text>
        <Text style={s.metaValue}>{fmtPeriod(report, lang)}</Text>
      </View>
      <View style={s.metaRow}>
        <Text style={s.metaLabel}>Generated</Text>
        <Text style={s.metaValue}>{fmtGenerated(report.generated_at)}</Text>
      </View>
    </View>
  )
}

/** Compute aggregate KPIs from account sections (presentation-only, no accounting logic). */
function computeDashboard(accounts: RC3AccountSection[]) {
  let totalIncome     = 0
  let totalExpenses   = 0
  let totalTransfers  = 0
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

const M2_PDF_COLORS: Record<string, string> = {
  sale: '#1e293b', renovation: '#065f46', rental: '#1d4ed8', airbnb: '#c2410c',
}

function PremiumSummaryPdf({ report, lang }: { report: RC3PropertyReport; lang: Lang }) {
  const net = computeNetOwnerBalance(report.accounts)
  const { income: opIncome, expenses: opExpenses, transfers: opTransfers, hasOperational } =
    computeOperationalKPIs(report.accounts)
  const absNet = Math.abs(net)
  const heroBg    = absNet < 0.005 ? '#334155' : net > 0 ? '#14532d' : '#7f1d1d'
  const heroColor = absNet < 0.005 ? '#ffffff' : net > 0 ? '#86efac' : '#fca5a5'
  const heroLabel = absNet < 0.005 ? t('balSettled', lang) : net > 0 ? t('balPayableToYou', lang) : t('balPayableByYou', lang)
  const period = report.from_date || report.to_date
    ? `${report.from_date ? fmtDate(report.from_date) : '—'} – ${report.to_date ? fmtDate(report.to_date) : '—'}`
    : t('execAllDates', lang)
  const accLabelKeys: Record<string, LabelKey> = {
    sale: 'accountSale', renovation: 'accountRenovation', rental: 'accountRental', airbnb: 'accountAirbnb',
  }
  return (
    <View style={{ backgroundColor: '#0d1f36', borderRadius: 8, padding: 20, marginBottom: 16 }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
        <View>
          <Text style={{ fontSize: 7, color: '#60a5fa', marginBottom: 3 }}>{t('execTitle', lang).toUpperCase()}</Text>
          <Text style={{ fontSize: 14, color: '#ffffff', fontWeight: 'bold' }}>{report.reporting_name}</Text>
          <Text style={{ fontSize: 9, color: '#93c5fd', marginTop: 3 }}>{period}</Text>
        </View>
        <Text style={{ fontSize: 7, color: '#60a5fa' }}>{t('confidential', lang).toUpperCase()}</Text>
      </View>
      {/* Hero balance */}
      <View style={{ backgroundColor: heroBg, borderRadius: 6, padding: 14, marginBottom: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontSize: 7, color: 'rgba(255,255,255,0.5)' }}>{t('dashBalance', lang).toUpperCase()}</Text>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ fontSize: 22, color: heroColor, fontWeight: 'bold' }}>{fmt(absNet)}</Text>
          <Text style={{ fontSize: 8, color: heroColor, marginTop: 2 }}>{heroLabel}</Text>
        </View>
      </View>
      {/* Operational KPIs */}
      {hasOperational && (
        <View style={{ marginBottom: 14 }}>
          <Text style={{ fontSize: 7, color: '#60a5fa', marginBottom: 6 }}>{t('opSummaryTitle', lang).toUpperCase()}</Text>
          <View style={{ flexDirection: 'row' }}>
            {([
              { label: t('opIncomeLabel', lang),  value: opIncome   },
              { label: t('opExpensesLabel', lang), value: opExpenses },
              { label: t('dashTransfers', lang),  value: opTransfers },
            ] as { label: string; value: number }[]).map((kpi, i) => (
              <View key={kpi.label} style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 4, padding: 8, borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.1)', marginLeft: i > 0 ? 6 : 0 }}>
                <Text style={{ fontSize: 7, color: '#93c5fd', marginBottom: 4 }}>{kpi.label}</Text>
                <Text style={{ fontSize: 10, color: '#ffffff', fontWeight: 'bold' }}>{fmt(kpi.value)}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
      {/* Module cards */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {report.accounts.map((acc, i) => {
          const accColor = M2_PDF_COLORS[acc.account_type] ?? '#334155'
          const balLabel = getBalLabel(acc, lang)
          const absBalance = Math.abs(acc.closing_balance)
          const lkKey = accLabelKeys[acc.account_type]
          const metrics: { label: string; value: number }[] = (() => {
            if (acc.account_type === 'sale') return [
              { label: t('cardSaleContract', lang), value: acc.contract_baseline },
              { label: t('cardSaleExpenses', lang), value: acc.total_income },
              { label: t('cardSalePayments', lang), value: acc.total_expenses },
            ]
            if (acc.account_type === 'renovation') return [
              { label: t('cardRenovContract', lang), value: acc.contract_baseline },
              { label: t('cardRenovExtras', lang),   value: acc.total_income },
              { label: t('cardRenovPayments', lang), value: acc.total_expenses },
            ]
            if (acc.account_type === 'rental') return [
              { label: t('cardRentalIncome', lang),   value: acc.total_income },
              { label: t('cardRentalExpenses', lang), value: acc.total_expenses },
              { label: t('cardRentalBpo', lang),      value: acc.total_bpo },
            ]
            return [
              { label: t('cardAirbnbIncome', lang),   value: acc.total_income },
              { label: t('cardAirbnbExpenses', lang), value: acc.total_expenses },
              { label: t('cardAirbnbBpo', lang),      value: acc.total_bpo },
            ]
          })()
          return (
            <View key={acc.account_type} style={{ flex: 1, minWidth: 90, borderRadius: 6, borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.1)', marginLeft: i > 0 ? 6 : 0, marginTop: 0 }}>
              <View style={{ backgroundColor: accColor, padding: 10 }}>
                <Text style={{ fontSize: 7, color: 'rgba(255,255,255,0.7)', marginBottom: 3 }}>
                  {lkKey ? t(lkKey, lang) : acc.account_label}
                </Text>
                <Text style={{ fontSize: 14, color: '#ffffff', fontWeight: 'bold' }}>{fmt(absBalance)}</Text>
                <Text style={{ fontSize: 7, color: 'rgba(255,255,255,0.75)', marginTop: 2 }}>{balLabel}</Text>
              </View>
              <View style={{ backgroundColor: 'rgba(255,255,255,0.05)', padding: 8 }}>
                {metrics.map(m => (
                  <View key={m.label} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                    <Text style={{ fontSize: 7, color: '#93c5fd' }}>{m.label}</Text>
                    <Text style={{ fontSize: 7, color: 'rgba(255,255,255,0.85)' }}>{fmt(m.value)}</Text>
                  </View>
                ))}
              </View>
            </View>
          )
        })}
      </View>
    </View>
  )
}

function ModuleMetrics({ section, lang }: { section: RC3AccountSection; lang: Lang }) {
  type MetricItem = { label: string; value: number; highlight?: boolean }
  let metrics: MetricItem[]

  if (section.account_type === 'sale') {
    metrics = [
      { label: t('cardSaleContract', lang),  value: section.contract_baseline },
      { label: t('cardSaleExpenses', lang),  value: section.total_income      },
      { label: t('cardSalePayments', lang),  value: section.total_expenses     },
      { label: t('cardSaleBalance', lang),   value: Math.abs(section.closing_balance), highlight: true },
    ]
  } else if (section.account_type === 'renovation') {
    const totalContract = section.contract_baseline + section.total_income
    metrics = [
      { label: t('cardRenovContract', lang),  value: section.contract_baseline    },
      { label: t('cardRenovExtras', lang),    value: section.total_income          },
      { label: t('cardRenovTotal', lang),     value: totalContract                 },
      { label: t('cardRenovPayments', lang),  value: section.total_expenses        },
      { label: t('cardRenovBalance', lang),   value: Math.abs(section.closing_balance), highlight: true },
    ]
  } else if (section.account_type === 'rental') {
    metrics = [
      { label: t('cardRentalIncome', lang),    value: section.total_income                   },
      { label: t('cardRentalExpenses', lang),  value: section.total_expenses                  },
      { label: t('cardRentalBpo', lang),       value: section.total_bpo                       },
      { label: t('cardRentalBalance', lang),   value: Math.abs(section.closing_balance), highlight: true },
    ]
  } else {
    metrics = [
      { label: t('cardAirbnbIncome', lang),    value: section.total_income                   },
      { label: t('cardAirbnbExpenses', lang),  value: section.total_expenses                  },
      { label: t('cardAirbnbBpo', lang),       value: section.total_bpo                       },
      { label: t('cardAirbnbBalance', lang),   value: Math.abs(section.closing_balance), highlight: true },
    ]
  }

  const balColor = getBalColor(section)

  return (
    <View style={s.moduleMetrics}>
      {metrics.map((m, i) => {
        const isLast = i === metrics.length - 1
        return (
          <View key={i} style={isLast ? s.moduleMetricCellLast : s.moduleMetricCell}>
            <Text style={s.moduleMetricLabel}>{m.label}</Text>
            <Text style={[s.moduleMetricValue, m.highlight ? { color: balColor } : {}]}>
              {fmt(m.value)}
            </Text>
            {m.highlight && (
              <Text style={[s.moduleMetricSub, { color: balColor }]}>
                {getBalLabel(section, lang)}
              </Text>
            )}
          </View>
        )
      })}
    </View>
  )
}

function TxGroupTable({
  rows,
  groupLabel: label,
  isIncome,
  lang,
}: {
  rows:       ClientDisplayRow[]
  groupLabel: string
  isIncome:   boolean
  lang:       Lang
}) {
  if (rows.length === 0) return null
  const total = rows.reduce((s, r) => s + r.client_amount, 0)
  return (
    <View>
      <Text style={s.groupLabel}>{label}</Text>
      <View style={s.tableHead}>
        <Text style={[s.th, s.cDate]}>{t('thDate', lang)}</Text>
        <Text style={[s.th, s.cDesc]}>{t('thDescription', lang)}</Text>
        <Text style={[s.th, s.cAmt]}>{t('thAmount', lang)}</Text>
      </View>
      {rows.map((row, i) => {
        // Client report: use buildRowLabel — never expose raw internal notes
        const desc = buildRowLabel(row, lang)
        return (
          <View
            key={row.id}
            style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]}
            wrap={false}
          >
            <Text style={[s.tdMuted, s.cDate]}>{fmtDate(row.date)}</Text>
            <View style={s.cDesc}>
              <Text style={s.td}>{desc}</Text>
            </View>
            <Text style={[s.cAmt, s.td, { color: isIncome ? C.green : C.grayDark }]}>
              {fmt(row.client_amount)}
            </Text>
          </View>
        )
      })}
      <View style={s.tableTot}>
        <Text style={[s.tdBold, s.cDate]} />
        <Text style={[s.tdBold, s.cDesc]}>{t('total', lang)}</Text>
        <Text style={[s.tdBold, s.cAmt, { color: isIncome ? C.green : C.grayDark }]}>
          {fmt(total)}
        </Text>
      </View>
    </View>
  )
}

function RefSection({ rows, lang }: { rows: ClientDisplayRow[]; lang: Lang }) {
  if (rows.length === 0) return null
  return (
    <View style={s.refSection}>
      <View style={s.refHeader}>
        <Text style={s.refHeaderLabel}>{t('contractInfo', lang)}</Text>
        <Text style={s.refHeaderNote}>{t('contractInfoNote', lang)}</Text>
      </View>
      {rows.map((row) => {
        // Client report: use buildRowLabel — never expose raw internal notes
        const desc = buildRowLabel(row, lang)
        return (
          <View key={row.id} style={s.refRow} wrap={false}>
            <Text style={[s.tdMuted, s.cDate]}>{fmtDate(row.date)}</Text>
            <View style={s.cDesc}>
              <Text style={s.tdInfo}>{desc}</Text>
            </View>
            <Text style={[s.cAmt, s.tdInfo]}>{fmt(row.client_amount)}</Text>
          </View>
        )
      })}
    </View>
  )
}

function GroupedExpensesPdf({
  rows,
  sectionLabel,
  lang,
}: {
  rows:         ClientDisplayRow[]
  sectionLabel: string
  lang:         Lang
}) {
  if (rows.length === 0) return null
  const groups = groupExpenses(rows)
  if (groups.length === 0) return null
  return (
    <View>
      <Text style={s.groupLabel}>{sectionLabel}</Text>
      {groups.map(({ key: groupKey, rows: groupRows, total: groupTotal }) => (
        <View key={groupKey}>
          <View style={[s.tableHead, { paddingLeft: 10 }]}>
            <Text style={[s.th, s.cDesc, { color: '#1e3a5f' }]}>{t(groupKey, lang)}</Text>
            <Text style={[s.th, { width: 22, textAlign: 'center', color: '#94a3b8' }]}>({groupRows.length})</Text>
            <Text style={[s.th, s.cAmt, { color: '#1e3a5f' }]}>{fmt(groupTotal)}</Text>
          </View>
          {groupRows.map((row, i) => (
            <View key={row.id} style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}, { paddingLeft: 18 }]} wrap={false}>
              <Text style={[s.tdMuted, s.cDate]}>{fmtDate(row.date)}</Text>
              <View style={s.cDesc}><Text style={s.tdMuted}>{buildRowLabel(row, lang)}</Text></View>
              <Text style={[s.cAmt, s.tdMuted]}>{fmt(row.client_amount)}</Text>
            </View>
          ))}
        </View>
      ))}
      <View style={s.tableTot}>
        <Text style={[s.tdBold, s.cDate]} />
        <Text style={[s.tdBold, s.cDesc]}>{t('total', lang)}</Text>
        <Text style={[s.tdBold, s.cAmt]}>{fmt(rows.reduce((sum, r) => sum + r.client_amount, 0))}</Text>
      </View>
    </View>
  )
}

function AccountBlock({ section, lang }: { section: RC3AccountSection; lang: Lang }) {
  const acColor  = ACCOUNT_COLOURS[section.account_type] ?? C.navy
  const balColor = getBalColor(section)
  const balText  = getBalLabel(section, lang)

  const referenceRows = section.rows.filter(r => r.display_group === 'reference').map(toClientRow)
  const incomeRows    = section.rows.filter(r => r.display_group === 'income').map(toClientRow)
  const expenseRows   = section.rows.filter(r => r.display_group === 'expense').map(toClientRow)
  const payoutRows    = section.rows.filter(r => r.display_group === 'payment_out').map(toClientRow)
  // Section C (info rows): suppressed from client-facing PDF.

  type AccountKey = 'sale' | 'renovation' | 'rental' | 'airbnb'
  const incomeLabelMap: Record<AccountKey, string> = {
    sale:       t('incomeSale',   lang),
    renovation: t('incomeRenov',  lang),
    rental:     t('incomeRental', lang),
    airbnb:     t('incomeAirbnb', lang),
  }
  const expenseLabelMap: Record<AccountKey, string> = {
    sale:       t('expensesSale',   lang),
    renovation: t('expensesRenov',  lang),
    rental:     t('expensesRental', lang),
    airbnb:     t('expensesAirbnb', lang),
  }

  const at = section.account_type as AccountKey
  const incomeLabel  = incomeLabelMap[at]  ?? 'Income'
  const expenseLabel = expenseLabelMap[at] ?? 'Expenses'

  return (
    <View style={s.accountSection} break={false}>
      {/* Account header bar */}
      <View style={[s.accountHeader, { backgroundColor: acColor }]}>
        <View style={s.accountHeaderLeft}>
          <Text style={s.accountTitle}>{section.account_label}</Text>
          {section.account_label_he ? (
            <Text style={s.accountTitleHe}>{section.account_label_he}</Text>
          ) : null}
        </View>
        <View style={s.accountHeaderRight}>
          <Text style={[s.accountBalance, { color: C.white }]}>
            {fmt(Math.abs(section.closing_balance))}
          </Text>
          <Text style={s.accountBalLabel}>{balText}</Text>
        </View>
      </View>

      {/* Per-module metrics strip */}
      <ModuleMetrics section={section} lang={lang} />

      {/* Section A — Reference rows */}
      <RefSection rows={referenceRows} lang={lang} />

      {/* Section B — Balance-affecting transactions */}
      <TxGroupTable rows={incomeRows}  groupLabel={incomeLabel}  isIncome={true}  lang={lang} />
      {(section.account_type === 'rental' || section.account_type === 'airbnb')
        ? <GroupedExpensesPdf rows={expenseRows} sectionLabel={expenseLabel} lang={lang} />
        : <TxGroupTable rows={expenseRows} groupLabel={expenseLabel} isIncome={false} lang={lang} />
      }
      {payoutRows.length > 0 ? (
        <TxGroupTable rows={payoutRows} groupLabel={t('bpoLabel', lang)} isIncome={false} lang={lang} />
      ) : null}

      {/* Section C — suppressed from client PDF */}

      {/* Balance strip */}
      <View style={s.balStrip}>
        <View>
          <Text style={s.balLabel}>{section.account_label}</Text>
          <Text style={s.balSub}>{balText}</Text>
        </View>
        <Text style={[s.balValue, { color: balColor }]}>
          {fmt(Math.abs(section.closing_balance))}
        </Text>
      </View>
    </View>
  )
}

/** Final settlement summary + disclaimer (dark navy block at end of PDF) */
function FinalSummaryPdf({ report, lang }: { report: RC3PropertyReport; lang: Lang }) {
  const { totalIncome, totalExpenses, totalTransfers, netOwnerBalance } = computeDashboard(report.accounts)

  let balLabel: string; let balColor: string
  if (Math.abs(netOwnerBalance) < 0.005) {
    balLabel = t('balSettled', lang); balColor = C.grayText
  } else if (netOwnerBalance > 0) {
    balLabel = t('balPayableToYou', lang); balColor = '#86efac'  // green-300
  } else {
    balLabel = t('balPayableByYou', lang); balColor = '#fca5a5'  // red-300
  }

  const genDate = (() => {
    try {
      return new Date(report.generated_at).toLocaleDateString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
      })
    } catch { return '' }
  })()

  const kpis = [
    { label: t('finalTotalIncome',    lang), value: totalIncome    },
    { label: t('finalTotalExpenses',  lang), value: totalExpenses  },
    { label: t('finalTotalTransfers', lang), value: totalTransfers },
  ]

  return (
    <View style={s.finalSection}>
      <Text style={s.finalTitle}>{t('finalTitle', lang)}</Text>

      {/* 3 KPI cells */}
      <View style={s.finalKpiRow}>
        {kpis.map((k, i) => (
          <View key={i} style={i < kpis.length - 1 ? s.finalKpiCell : s.finalKpiCellLast}>
            <Text style={s.finalKpiLabel}>{k.label}</Text>
            <Text style={s.finalKpiValue}>{fmt(k.value)}</Text>
          </View>
        ))}
      </View>

      {/* Net balance */}
      <View style={s.finalBalRow}>
        <Text style={s.finalBalLabel}>{t('finalCurrentBalance', lang)}</Text>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[s.finalBalValue, { color: balColor }]}>
            {fmt(Math.abs(netOwnerBalance))}
          </Text>
          <Text style={[s.finalBalSub, { color: balColor }]}>{balLabel}</Text>
        </View>
      </View>

      {/* Disclaimer */}
      <View style={s.finalDiscBorder}>
        <Text style={s.finalDiscTitle}>{t('finalNoteTitle', lang)}</Text>
        <Text style={s.finalDiscText}>{t('finalDisclaimer', lang)}</Text>
        <Text style={s.finalDiscGen}>{t('finalGenerated', lang)}: {genDate}</Text>
      </View>
    </View>
  )
}

function DocFooter({ report, lang }: { report: RC3PropertyReport; lang: Lang }) {
  const period = fmtPeriod(report, lang)
  return (
    <View style={s.footer} fixed>
      <Text style={s.footerText}>
        JJ Property 10 · {report.reporting_name} · {period} · {t('confidential', lang)}
      </Text>
      <Text
        style={s.footerText}
        render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`}
      />
    </View>
  )
}

function Disclosure({ lang }: { lang: Lang }) {
  return (
    <View style={s.disclosure}>
      <Text style={[s.disclosureText, { fontWeight: 'bold' }]}>
        ⚠ {t('openingBalTitle', lang)}
      </Text>
      <Text style={s.disclosureText}>
        {t('openingBalDetail', lang)}
      </Text>
      <Text style={[s.disclosureText, { marginTop: 4 }]}>
        This report is generated from accounting records and is pending final review.
        Some transactions may be subject to reclassification. This document is confidential
        and intended solely for the named property owner.
      </Text>
    </View>
  )
}

/* ─── Main document ─────────────────────────────────────────────────────────── */

export interface OwnerSettlementPdfV3Props {
  report: RC3PropertyReport
  lang?:  Lang
  reportType?: ReportType
}

export function OwnerSettlementPdfV3({ report, lang = 'en', reportType = 'full' }: OwnerSettlementPdfV3Props) {
  const filteredReport = { ...report, accounts: filterSectionsByReportType(report.accounts, reportType) }
  const reportTypeLabel = reportType === 'periodic' ? t('reportTypePeriodic', lang) : t('reportTypeFull', lang)

  return (
    <Document
      title={`JJ ${reportTypeLabel} — ${report.reporting_name}`}
      author="JJ Property 10"
      creator="JJ Property 10 Platform (RC3 V2)"
    >
      <Page size="A4" style={s.page}>
        <DocHeader report={filteredReport} lang={lang} reportTypeLabel={reportTypeLabel} />
        <MetaBlock  report={filteredReport} lang={lang} />

        {/* M2: Premium Executive Summary */}
        <PremiumSummaryPdf report={filteredReport} lang={lang} />

        {/* One section per account */}
        {filteredReport.accounts.map(acc => (
          <AccountBlock key={acc.account_type} section={acc} lang={lang} />
        ))}

        <FinalSummaryPdf report={filteredReport} lang={lang} />
        <DocFooter       report={filteredReport} lang={lang} />
      </Page>
    </Document>
  )
}
