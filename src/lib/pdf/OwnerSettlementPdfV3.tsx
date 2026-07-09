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
import type { RC3PropertyReport, RC3AccountSection, RC3AccountRow } from '../report/types'
import {
  overrideDisplayLabel,
  t, type Lang,
} from '../report/labels'

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

function DocHeader({ report, lang }: { report: RC3PropertyReport; lang: Lang }) {
  return (
    <View style={s.header} fixed>
      <View>
        <Text style={s.companyName}>JJ Property 10</Text>
        <Text style={s.reportTitle}>
          {t('reportTitle', lang)} — {report.reporting_name}
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

/** Owner Dashboard — 4 aggregate KPI cells, appears at top of PDF body. */
function OwnerDashboardPdf({ report, lang }: { report: RC3PropertyReport; lang: Lang }) {
  const { totalIncome, totalExpenses, totalTransfers, netOwnerBalance } = computeDashboard(report.accounts)

  let balLabel: string
  let balColor: string
  if (Math.abs(netOwnerBalance) < 0.005) {
    balLabel = t('balSettled', lang); balColor = C.grayText
  } else if (netOwnerBalance > 0) {
    balLabel = t('balPayableToYou', lang); balColor = C.green
  } else {
    balLabel = t('balPayableByYou', lang); balColor = C.red
  }

  const cells = [
    { label: t('dashIncome',    lang), value: totalIncome,               color: C.grayDark, sub: null        },
    { label: t('dashExpenses',  lang), value: totalExpenses,             color: C.grayDark, sub: null        },
    { label: t('dashTransfers', lang), value: totalTransfers,            color: C.grayDark, sub: null        },
    { label: t('dashBalance',   lang), value: Math.abs(netOwnerBalance), color: balColor,   sub: balLabel    },
  ]

  return (
    <View style={s.dashSection}>
      <View style={s.dashHeader}>
        <Text style={s.dashHeaderTitle}>{t('dashTitle', lang)}</Text>
        <Text style={s.dashHeaderSub}>{report.reporting_name}</Text>
      </View>
      <View style={s.dashStrip}>
        {cells.map((cell, i) => {
          const isLast = i === cells.length - 1
          return (
            <View key={i} style={isLast ? s.dashCellLast : s.dashCell}>
              <Text style={s.dashCellLabel}>{cell.label}</Text>
              <Text style={[s.dashCellValue, { color: cell.color }]}>{fmt(cell.value)}</Text>
              {cell.sub ? (
                <Text style={[s.dashCellSub, { color: cell.color }]}>{cell.sub}</Text>
              ) : null}
            </View>
          )
        })}
      </View>
    </View>
  )
}

/** Cross-account summary strip — one column per active account */
function CrossAccountSummary({ report, lang }: { report: RC3PropertyReport; lang: Lang }) {
  if (report.accounts.length <= 1) return null
  return (
    <View style={s.summaryCard}>
      {report.accounts.map((acc, i) => {
        const b     = acc.closing_balance
        const color = getBalColor(acc)
        const label = getBalLabel(acc, lang)
        const isLast = i === report.accounts.length - 1
        return (
          <View key={acc.account_type} style={isLast ? s.summaryCellLast : s.summaryCell}>
            <Text style={s.summaryCellLabel}>{acc.account_label}</Text>
            <Text style={[s.summaryCellValue, { color }]}>{fmt(Math.abs(b))}</Text>
            <Text style={[s.summaryCellSub, { color }]}>{label}</Text>
          </View>
        )
      })}
    </View>
  )
}

/** Per-module metrics strip — key figures for this account type */
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
}: {
  rows:       RC3AccountRow[]
  groupLabel: string
  isIncome:   boolean
}) {
  if (rows.length === 0) return null
  const total = rows.reduce((s, r) => s + r.client_amount, 0)
  return (
    <View>
      <Text style={s.groupLabel}>{label}</Text>
      <View style={s.tableHead}>
        <Text style={[s.th, s.cDate]}>Date</Text>
        <Text style={[s.th, s.cDesc]}>Description</Text>
        <Text style={[s.th, s.cAmt]}>Amount</Text>
      </View>
      {rows.map((row, i) => {
        const overriddenLabel = overrideDisplayLabel(row.display_label ?? '')
        // Client report: always show clean display_label — never expose raw internal notes
        const desc = overriddenLabel || '—'
        return (
          <View
            key={row.id}
            style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]}
            wrap={false}
          >
            <Text style={[s.tdMuted, s.cDate]}>{fmtDate(row.date)}</Text>
            <View style={s.cDesc}>
              <Text style={s.td}>{desc}</Text>
              {overriddenLabel && overriddenLabel !== desc ? (
                <Text style={s.tdInfo}>{overriddenLabel}</Text>
              ) : null}
            </View>
            <Text style={[s.cAmt, s.td, { color: isIncome ? C.green : C.grayDark }]}>
              {fmt(row.client_amount)}
            </Text>
          </View>
        )
      })}
      <View style={s.tableTot}>
        <Text style={[s.tdBold, s.cDate]} />
        <Text style={[s.tdBold, s.cDesc]}>Total</Text>
        <Text style={[s.tdBold, s.cAmt, { color: isIncome ? C.green : C.grayDark }]}>
          {fmt(total)}
        </Text>
      </View>
    </View>
  )
}

function RefSection({ rows, lang }: { rows: RC3AccountRow[]; lang: Lang }) {
  if (rows.length === 0) return null
  return (
    <View style={s.refSection}>
      <View style={s.refHeader}>
        <Text style={s.refHeaderLabel}>{t('contractInfo', lang)}</Text>
        <Text style={s.refHeaderNote}>{t('contractInfoNote', lang)}</Text>
      </View>
      {rows.map((row) => {
        const overriddenLabel = overrideDisplayLabel(row.display_label ?? '')
        // Client report: always show clean display_label — never expose raw internal notes
        const desc = overriddenLabel || '—'
        return (
          <View key={row.id} style={s.refRow} wrap={false}>
            <Text style={[s.tdMuted, s.cDate]}>{fmtDate(row.date)}</Text>
            <View style={s.cDesc}>
              <Text style={s.tdInfo}>{desc}</Text>
              {overriddenLabel && overriddenLabel !== desc ? (
                <Text style={s.tdInfo}>{overriddenLabel}</Text>
              ) : null}
            </View>
            <Text style={[s.cAmt, s.tdInfo]}>{fmt(row.client_amount)}</Text>
          </View>
        )
      })}
    </View>
  )
}

function AccountBlock({ section, lang }: { section: RC3AccountSection; lang: Lang }) {
  const acColor  = ACCOUNT_COLOURS[section.account_type] ?? C.navy
  const balColor = getBalColor(section)
  const balText  = getBalLabel(section, lang)

  const referenceRows = section.rows.filter(r => r.display_group === 'reference')
  const incomeRows    = section.rows.filter(r => r.display_group === 'income')
  const expenseRows   = section.rows.filter(r => r.display_group === 'expense')
  const payoutRows    = section.rows.filter(r => r.display_group === 'payment_out')
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
      <TxGroupTable rows={incomeRows}  groupLabel={incomeLabel}  isIncome={true}  />
      <TxGroupTable rows={expenseRows} groupLabel={expenseLabel} isIncome={false} />
      {payoutRows.length > 0 ? (
        <TxGroupTable rows={payoutRows} groupLabel={t('bpoLabel', lang)} isIncome={false} />
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
}

export function OwnerSettlementPdfV3({ report, lang = 'en' }: OwnerSettlementPdfV3Props) {
  return (
    <Document
      title={`Owner Settlement Report — ${report.reporting_name}`}
      author="JJ Property 10"
      creator="JJ Property 10 Platform (RC3 V2)"
    >
      <Page size="A4" style={s.page}>
        <DocHeader report={report} lang={lang} />
        <MetaBlock  report={report} lang={lang} />

        {/* Owner Dashboard — aggregate KPIs (always shown, top of report body) */}
        <OwnerDashboardPdf report={report} lang={lang} />

        {/* Cross-account summary (shown when >1 account) */}
        <CrossAccountSummary report={report} lang={lang} />

        {/* One section per account */}
        {report.accounts.map(acc => (
          <AccountBlock key={acc.account_type} section={acc} lang={lang} />
        ))}

        <Disclosure lang={lang} />
        <DocFooter  report={report} lang={lang} />
      </Page>
    </Document>
  )
}
