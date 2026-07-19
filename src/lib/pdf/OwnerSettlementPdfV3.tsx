/**
 * JJ Property 10 — Owner Settlement Report V3
 * Phase B — 2026-07-09
 * Gate 2 — 2026-07-19: Certified STR, Settlement Position, Evidence Footer in PDF
 *
 * Gate 2 additions:
 *  - CertifiedSTRBlockPdf: mirrors CertifiedSTRCard from page.tsx
 *  - SettlementBlockPdf: mirrors SettlementSummaryCard from page.tsx
 *  - EvidenceFooterPdf: financial attribution policy
 *  - All consume the same RC3PropertyReport DTO — no separate queries
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
import type {
  RC3PropertyReport,
  RC3AccountSection,
  RC3AccountRow,
  CertifiedSTRSummary,
  CounterpartySettlement,
} from '../report/types'
import {
  buildRowLabel,
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
  teal:        '#0f766e',
  tealBg:      '#f0fdfa',
  tealBorder:  '#99f6e4',
  indigo:      '#4338ca',
  indigoBg:    '#eef2ff',
  indigoBorder: '#c7d2fe',
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

  // Owner Dashboard strip
  dashSection: { marginBottom: 14 },
  dashHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
    marginBottom: 5,
  },
  dashHeaderTitle: {
    fontSize: 7.5, fontWeight: 'bold', color: C.navy,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  dashHeaderSub: { fontSize: 7, color: C.grayText },
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
  dashCellValue: { fontSize: 13, fontWeight: 'bold', color: C.grayDark },
  dashCellSub: {
    fontSize: 6, color: C.grayText, marginTop: 2, textAlign: 'center',
  },

  // Cross-account summary
  summaryCard: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: C.grayBorder,
    borderRadius: 5,
    marginBottom: 18,
    overflow: 'hidden',
  },
  summaryCell: {
    flex: 1, padding: 10, alignItems: 'center',
    borderRightWidth: 1, borderRightColor: C.grayBorder,
  },
  summaryCellLast: { flex: 1, padding: 10, alignItems: 'center' },
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
    flex: 1, paddingVertical: 8, paddingHorizontal: 8,
    borderRightWidth: 1, borderRightColor: C.grayBorder, alignItems: 'center',
  },
  moduleMetricCellLast: {
    flex: 1, paddingVertical: 8, paddingHorizontal: 8, alignItems: 'center',
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
    fontSize: 7.5, fontWeight: 'bold', color: C.grayText,
    textTransform: 'uppercase', letterSpacing: 0.4,
    paddingTop: 8, paddingBottom: 4, paddingHorizontal: 4,
  },

  // Table
  tableHead: {
    flexDirection: 'row', backgroundColor: C.grayBg,
    paddingVertical: 3, paddingHorizontal: 6,
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: C.grayBorder,
  },
  tableRow: {
    flexDirection: 'row', paddingVertical: 3.5, paddingHorizontal: 6,
    borderBottomWidth: 1, borderBottomColor: C.grayLine,
  },
  tableRowAlt: { backgroundColor: '#fafafa' },
  tableTot: {
    flexDirection: 'row', paddingVertical: 3.5, paddingHorizontal: 6,
    borderTopWidth: 1, borderTopColor: C.grayBorder, backgroundColor: C.grayBg,
  },
  th:      { fontSize: 7, fontWeight: 'bold', color: C.grayText, textTransform: 'uppercase', letterSpacing: 0.2 },
  td:      { fontSize: 7.5, color: C.grayDark },
  tdMuted: { fontSize: 7.5, color: C.grayText },
  tdBold:  { fontSize: 7.5, fontWeight: 'bold', color: C.grayDark },
  tdInfo:  { fontSize: 7, color: C.grayMid },
  cDate:   { width: 54 },
  cDesc:   { flex: 1 },
  cAmt:    { width: 74, textAlign: 'right' },

  // Reference section
  refSection: {
    marginBottom: 6, borderWidth: 1, borderColor: C.grayBorder,
    borderRadius: 3, overflow: 'hidden',
  },
  refHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#f0f4f8', paddingVertical: 4, paddingHorizontal: 8,
    borderBottomWidth: 1, borderBottomColor: C.grayBorder,
  },
  refHeaderLabel: {
    fontSize: 7, fontWeight: 'bold', color: C.grayText,
    textTransform: 'uppercase', letterSpacing: 0.3,
  },
  refHeaderNote: { fontSize: 6.5, color: C.grayMid },
  refRow: {
    flexDirection: 'row', paddingVertical: 3.5, paddingHorizontal: 8,
    borderBottomWidth: 1, borderBottomColor: C.grayLine,
  },

  // Balance strip
  balStrip: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 6, paddingHorizontal: 12, marginTop: 4,
    borderTopWidth: 1.5, borderTopColor: C.grayBorder,
    backgroundColor: C.grayBg, borderRadius: 3,
  },
  balLabel: { fontSize: 8.5, fontWeight: 'bold', color: C.grayDark },
  balValue: { fontSize: 8.5, fontWeight: 'bold' },
  balSub:   { fontSize: 7, color: C.grayText, marginTop: 1 },

  // Final Summary
  finalSection: {
    marginTop: 16, backgroundColor: '#1e3a5f', borderRadius: 5, padding: 14,
  },
  finalTitle: {
    fontSize: 6.5, fontWeight: 'bold', color: '#93c5fd',
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8,
  },
  finalKpiRow: { flexDirection: 'row', marginBottom: 8 },
  finalKpiCell: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 4, padding: 8, marginRight: 5,
  },
  finalKpiCellLast: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 4, padding: 8,
  },
  finalKpiLabel: { fontSize: 5.5, color: '#93c5fd', marginBottom: 3 },
  finalKpiValue: { fontSize: 9, fontWeight: 'bold', color: '#ffffff' },
  finalBalRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 4,
    padding: 10, marginBottom: 10,
  },
  finalBalLabel: { fontSize: 8, fontWeight: 'bold', color: '#bfdbfe' },
  finalBalValue: { fontSize: 14, fontWeight: 'bold' },
  finalBalSub:   { fontSize: 6.5, marginTop: 1 },
  finalDiscBorder: {
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.2)', paddingTop: 8,
  },
  finalDiscTitle: {
    fontSize: 6, fontWeight: 'bold', color: '#60a5fa',
    textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 3,
  },
  finalDiscText: { fontSize: 6.5, color: '#bfdbfe', lineHeight: 1.5 },
  finalDiscGen:  { fontSize: 6, color: '#60a5fa', marginTop: 4 },

  // Footer
  footer: {
    position: 'absolute', bottom: 18, left: 46, right: 46,
    flexDirection: 'row', justifyContent: 'space-between',
    borderTopWidth: 1, borderTopColor: C.grayBorder, paddingTop: 4,
  },
  footerText: { fontSize: 6.5, color: C.grayText },

  // Disclosure
  disclosure: {
    marginTop: 16, padding: 8,
    backgroundColor: C.amberBg, borderWidth: 1,
    borderColor: C.amberBorder, borderRadius: 3,
  },
  disclosureText: { fontSize: 7, color: C.amber, lineHeight: 1.5 },

  // Gate 2: Certified STR block
  strBlock: {
    marginBottom: 16, borderWidth: 1, borderColor: C.tealBorder,
    borderRadius: 5, overflow: 'hidden',
  },
  strHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: C.tealBg, paddingVertical: 6, paddingHorizontal: 10,
    borderBottomWidth: 1, borderBottomColor: C.tealBorder,
  },
  strHeaderTitle: {
    fontSize: 8, fontWeight: 'bold', color: C.teal, letterSpacing: 0.3,
  },
  strHeaderSub: { fontSize: 6.5, color: C.teal, marginTop: 2 },
  strStatusBadge: {
    fontSize: 6.5, fontWeight: 'bold', paddingVertical: 2, paddingHorizontal: 6,
    borderRadius: 3, borderWidth: 1,
  },
  strRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 3, paddingHorizontal: 10,
    borderBottomWidth: 1, borderBottomColor: C.grayLine,
  },
  strRowHighlight: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 4, paddingHorizontal: 10,
    borderBottomWidth: 1, borderBottomColor: C.grayLine,
    backgroundColor: C.tealBg,
  },
  strLabel:     { fontSize: 7, color: C.grayDark },
  strLabelBold: { fontSize: 7.5, fontWeight: 'bold', color: C.teal },
  strValue:     { fontSize: 7, color: C.grayDark, textAlign: 'right' },
  strValueBold: { fontSize: 7.5, fontWeight: 'bold', color: C.teal, textAlign: 'right' },
  strWarning: {
    paddingVertical: 3, paddingHorizontal: 10,
    backgroundColor: C.amberBg,
  },
  strWarningText: { fontSize: 6, color: C.amber },

  // Gate 2: Settlement block
  settBlock: {
    marginBottom: 16, borderWidth: 1, borderColor: C.indigoBorder,
    borderRadius: 5, overflow: 'hidden',
  },
  settHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: C.indigoBg, paddingVertical: 6, paddingHorizontal: 10,
    borderBottomWidth: 1, borderBottomColor: C.indigoBorder,
  },
  settHeaderTitle: {
    fontSize: 8, fontWeight: 'bold', color: C.indigo, letterSpacing: 0.3,
  },
  settHeaderSub: { fontSize: 6.5, color: C.indigo, marginTop: 2 },
  settRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 3, paddingHorizontal: 10,
    borderBottomWidth: 1, borderBottomColor: C.grayLine,
  },
  settRowHighlight: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 4, paddingHorizontal: 10,
    backgroundColor: C.indigoBg,
  },
  settLabel:     { fontSize: 7, color: C.grayDark },
  settLabelBold: { fontSize: 7.5, fontWeight: 'bold', color: C.indigo },
  settValue:     { fontSize: 7, color: C.grayDark, textAlign: 'right' },
  settValueBold: { fontSize: 7.5, fontWeight: 'bold', color: C.indigo, textAlign: 'right' },
  settNotFinal:  { fontSize: 5.5, color: C.amber, marginTop: 1 },

  // Gate 2: Evidence footer
  evidenceBlock: {
    marginTop: 14, padding: 10,
    backgroundColor: C.grayBg, borderWidth: 1,
    borderColor: C.grayBorder, borderRadius: 4,
  },
  evidenceTitle: {
    fontSize: 6.5, fontWeight: 'bold', color: C.grayText,
    textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 5,
  },
  evidenceRow: {
    flexDirection: 'row', marginBottom: 2,
  },
  evidenceTag: {
    fontSize: 5.5, fontWeight: 'bold', width: 22,
    paddingVertical: 1, textAlign: 'center', borderRadius: 2,
    marginRight: 5,
  },
  evidenceText: { fontSize: 6.5, color: C.grayText, flex: 1, lineHeight: 1.4 },
  evidenceDisclaimer: {
    fontSize: 6, color: C.grayMid, marginTop: 5,
    paddingTop: 4, borderTopWidth: 1, borderTopColor: C.grayBorder,
    lineHeight: 1.4,
  },
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

function fmtMonth(iso: string): string {
  try {
    return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', {
      month: 'short', year: 'numeric',
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

function OwnerDashboardPdf({ report, lang }: { report: RC3PropertyReport; lang: Lang }) {
  const { totalIncome, totalExpenses, totalTransfers, netOwnerBalance } = computeDashboard(report.accounts)

  let balLabel: string; let balColor: string
  if (Math.abs(netOwnerBalance) < 0.005) {
    balLabel = t('balSettled', lang); balColor = C.grayText
  } else if (netOwnerBalance > 0) {
    balLabel = t('balPayableToYou', lang); balColor = C.green
  } else {
    balLabel = t('balPayableByYou', lang); balColor = C.red
  }

  const cells = [
    { label: t('dashIncome',    lang), value: totalIncome,               color: C.grayDark, sub: null     },
    { label: t('dashExpenses',  lang), value: totalExpenses,             color: C.grayDark, sub: null     },
    { label: t('dashTransfers', lang), value: totalTransfers,            color: C.grayDark, sub: null     },
    { label: t('dashBalance',   lang), value: Math.abs(netOwnerBalance), color: balColor,   sub: balLabel },
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
      { label: t('cardRenovContract', lang),  value: section.contract_baseline },
      { label: t('cardRenovExtras', lang),    value: section.total_income       },
      { label: t('cardRenovTotal', lang),     value: totalContract              },
      { label: t('cardRenovPayments', lang),  value: section.total_expenses     },
      { label: t('cardRenovBalance', lang),   value: Math.abs(section.closing_balance), highlight: true },
    ]
  } else if (section.account_type === 'rental') {
    metrics = [
      { label: t('cardRentalIncome', lang),    value: section.total_income    },
      { label: t('cardRentalExpenses', lang),  value: section.total_expenses   },
      { label: t('cardRentalBpo', lang),       value: section.total_bpo        },
      { label: t('cardRentalBalance', lang),   value: Math.abs(section.closing_balance), highlight: true },
    ]
  } else {
    metrics = [
      { label: t('cardAirbnbIncome', lang),    value: section.total_income    },
      { label: t('cardAirbnbExpenses', lang),  value: section.total_expenses   },
      { label: t('cardAirbnbBpo', lang),       value: section.total_bpo        },
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
  rows, groupLabel: label, isIncome, lang,
}: {
  rows: RC3AccountRow[]; groupLabel: string; isIncome: boolean; lang: Lang
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
        const desc = buildRowLabel(row, lang)
        return (
          <View key={row.id} style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]} wrap={false}>
            <Text style={[s.tdMuted, s.cDate]}>{fmtDate(row.date)}</Text>
            <View style={s.cDesc}><Text style={s.td}>{desc}</Text></View>
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

function RefSection({ rows, lang }: { rows: RC3AccountRow[]; lang: Lang }) {
  if (rows.length === 0) return null
  return (
    <View style={s.refSection}>
      <View style={s.refHeader}>
        <Text style={s.refHeaderLabel}>{t('contractInfo', lang)}</Text>
        <Text style={s.refHeaderNote}>{t('contractInfoNote', lang)}</Text>
      </View>
      {rows.map((row) => {
        const desc = buildRowLabel(row, lang)
        return (
          <View key={row.id} style={s.refRow} wrap={false}>
            <Text style={[s.tdMuted, s.cDate]}>{fmtDate(row.date)}</Text>
            <View style={s.cDesc}><Text style={s.tdInfo}>{desc}</Text></View>
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

  type AccountKey = 'sale' | 'renovation' | 'rental' | 'airbnb'
  const incomeLabelMap: Record<AccountKey, string> = {
    sale: t('incomeSale', lang), renovation: t('incomeRenov', lang),
    rental: t('incomeRental', lang), airbnb: t('incomeAirbnb', lang),
  }
  const expenseLabelMap: Record<AccountKey, string> = {
    sale: t('expensesSale', lang), renovation: t('expensesRenov', lang),
    rental: t('expensesRental', lang), airbnb: t('expensesAirbnb', lang),
  }

  const at = section.account_type as AccountKey

  return (
    <View style={s.accountSection} break={false}>
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

      <ModuleMetrics section={section} lang={lang} />
      <RefSection rows={referenceRows} lang={lang} />
      <TxGroupTable rows={incomeRows}  groupLabel={incomeLabelMap[at] ?? 'Income'}  isIncome={true}  lang={lang} />
      <TxGroupTable rows={expenseRows} groupLabel={expenseLabelMap[at] ?? 'Expenses'} isIncome={false} lang={lang} />
      {payoutRows.length > 0 ? (
        <TxGroupTable rows={payoutRows} groupLabel={t('bpoLabel', lang)} isIncome={false} lang={lang} />
      ) : null}

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

/* ─── Gate 2: Certified STR Block (PDF) ─────────────────────────────────────── */

function CertifiedSTRBlockPdf({ str, lang }: { str: CertifiedSTRSummary; lang: Lang }) {
  const isCertified = str.all_months_certified && str.all_controls_pass
  const statusColor = isCertified ? C.green : C.amber
  const statusBg    = isCertified ? C.greenBg : C.amberBg
  const statusBorder = isCertified ? C.greenBorder : C.amberBorder
  const statusText  = isCertified ? t('certifiedStrCertified', lang) : t('certifiedStrPending', lang)

  const firstMonth = str.months[0]?.reporting_month
  const lastMonth  = str.months[str.months.length - 1]?.reporting_month
  const periodLabel = firstMonth && lastMonth
    ? `${fmtMonth(firstMonth)} – ${fmtMonth(lastMonth)} (${str.months.length} ${t('certifiedStrMonths', lang)})`
    : ''

  const lines: { label: string; value: number; bold?: boolean; neg?: boolean }[] = [
    { label: t('certifiedStrRevenue', lang),      value: str.total_gross_rental_revenue },
    { label: t('certifiedStrCleaning', lang),      value: str.total_cleaning_income },
    { label: t('certifiedStrPlatformFees', lang),  value: -(str.total_platform_fees + str.total_payment_fees), neg: true },
    { label: t('certifiedStrTaxes', lang),         value: -str.total_taxes, neg: true },
    { label: t('certifiedStrMgmtFee', lang),       value: -str.total_management_fee, neg: true },
    { label: t('certifiedStrExpenses', lang),       value: -str.total_owner_chargeable_expenses, neg: true },
    { label: t('certifiedStrEntitlement', lang),   value: str.total_owner_entitlement, bold: true },
    { label: t('certifiedStrPayments', lang),      value: -str.total_owner_payments, neg: true },
    { label: t('certifiedStrBalance', lang),       value: str.total_period_balance, bold: true },
  ]

  return (
    <View style={s.strBlock}>
      <View style={s.strHeader}>
        <View>
          <Text style={s.strHeaderTitle}>{t('certifiedStrTitle', lang)}</Text>
          <Text style={s.strHeaderSub}>{t('certifiedStrSubtitle', lang)}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[s.strStatusBadge, {
            color: statusColor,
            backgroundColor: statusBg,
            borderColor: statusBorder,
          }]}>
            {statusText}
          </Text>
          <Text style={{ fontSize: 6, color: C.teal, marginTop: 2 }}>{periodLabel}</Text>
          <Text style={{ fontSize: 5.5, color: C.grayText, marginTop: 1 }}>
            {str.total_reservation_count} {t('certifiedStrReservations', lang)} · {str.total_booked_nights} {t('certifiedStrNights', lang)}
          </Text>
        </View>
      </View>

      {str.period_coverage === 'partial' && (
        <View style={s.strWarning}>
          <Text style={s.strWarningText}>{t('certifiedStrPartial', lang)}</Text>
        </View>
      )}

      {lines.map((line, i) => (
        <View key={i} style={line.bold ? s.strRowHighlight : s.strRow}>
          <Text style={line.bold ? s.strLabelBold : s.strLabel}>{line.label}</Text>
          <Text style={[
            line.bold ? s.strValueBold : s.strValue,
            line.bold ? {} : { color: line.neg ? C.red : C.green },
          ]}>
            {fmt(line.value)}
          </Text>
        </View>
      ))}

      {str.has_any_unresolved && (
        <View style={s.strWarning}>
          <Text style={s.strWarningText}>Some months have unresolved data items</Text>
        </View>
      )}
    </View>
  )
}

/* ─── Gate 2: Settlement Block (PDF) ─────────────────────────────────────────── */

function SettlementBlockPdf({ settlement, lang }: { settlement: CounterpartySettlement; lang: Lang }) {
  const isCertified = settlement.confidence_status === 'CERTIFIED'

  let posColor: string; let posLabel: string
  if (settlement.position_direction === 'jj_owes_counterparty') {
    posColor = C.green; posLabel = t('settlementJjOwes', lang)
  } else if (settlement.position_direction === 'counterparty_owes_jj') {
    posColor = C.red; posLabel = t('settlementCpOwes', lang)
  } else {
    posColor = C.grayText; posLabel = t('settlementSettled', lang)
  }

  const domains = [
    { label: t('settlementStrDomain', lang),  value: settlement.str_balance },
    { label: t('settlementMgmtDomain', lang), value: settlement.management_balance },
    { label: t('settlementRenoDomain', lang), value: settlement.renovation_balance },
    { label: t('settlementSaleDomain', lang), value: settlement.sale_balance },
  ]

  return (
    <View style={s.settBlock}>
      <View style={s.settHeader}>
        <View>
          <Text style={s.settHeaderTitle}>{t('settlementTitle', lang)}</Text>
          <Text style={s.settHeaderSub}>{t('settlementSubtitle', lang)}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ fontSize: 7, color: C.indigo }}>
            {t('settlementCounterparty', lang)}: {settlement.counterparty_name}
          </Text>
          <Text style={{ fontSize: 6, color: C.grayText, marginTop: 1 }}>
            {t('settlementAsOf', lang)} {fmtDate(settlement.as_of_date)}
          </Text>
        </View>
      </View>

      {settlement.has_unresolved_history && (
        <View style={s.strWarning}>
          <Text style={s.strWarningText}>{t('settlementWarning', lang)}</Text>
        </View>
      )}

      {domains.map((d, i) => (
        <View key={i} style={s.settRow}>
          <Text style={s.settLabel}>{d.label}</Text>
          <Text style={[s.settValue, { color: d.value > 0 ? C.green : d.value < 0 ? C.red : C.grayMid }]}>
            {fmt(d.value)}
          </Text>
        </View>
      ))}

      <View style={[s.settRow, { backgroundColor: C.grayBg }]}>
        <Text style={[s.settLabel, { fontWeight: 'bold' }]}>{t('settlementGross', lang)}</Text>
        <Text style={[s.settValue, { fontWeight: 'bold' }]}>{fmt(settlement.gross_counterparty_position)}</Text>
      </View>

      <View style={s.settRow}>
        <Text style={s.settLabel}>{t('settlementOwnerPayments', lang)}</Text>
        <Text style={[s.settValue, { color: C.red }]}>{fmt(-settlement.owner_payments)}</Text>
      </View>

      <View style={s.settRowHighlight}>
        <View>
          <Text style={s.settLabelBold}>{t('settlementFinal', lang)}</Text>
          {!isCertified && (
            <Text style={s.settNotFinal}>{t('settlementNotFinal', lang)}</Text>
          )}
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[s.settValueBold, { color: posColor, fontSize: 10 }]}>
            {fmt(Math.abs(settlement.final_counterparty_position))}
          </Text>
          <Text style={{ fontSize: 6, color: posColor, marginTop: 1 }}>{posLabel}</Text>
        </View>
      </View>
    </View>
  )
}

/* ─── Gate 2: Evidence Footer (PDF) ──────────────────────────────────────────── */

function EvidenceFooterPdf({ report, lang }: { report: RC3PropertyReport; lang: Lang }) {
  const hasStr = report.certifiedSTR !== null
  const hasSettlement = report.settlement !== null
  if (!hasStr && !hasSettlement) return null

  return (
    <View style={s.evidenceBlock}>
      <Text style={s.evidenceTitle}>{t('evidenceTitle', lang)}</Text>

      {hasStr && (
        <View style={s.evidenceRow}>
          <Text style={[s.evidenceTag, { color: C.teal, backgroundColor: C.tealBg }]}>STR</Text>
          <Text style={s.evidenceText}>{t('evidenceStrSource', lang)}</Text>
        </View>
      )}
      <View style={s.evidenceRow}>
        <Text style={[s.evidenceTag, { color: C.navy, backgroundColor: '#eff6ff' }]}>TXN</Text>
        <Text style={s.evidenceText}>{t('evidenceMgmtSource', lang)}</Text>
      </View>
      {hasSettlement && (
        <View style={s.evidenceRow}>
          <Text style={[s.evidenceTag, { color: C.indigo, backgroundColor: C.indigoBg }]}>SET</Text>
          <Text style={s.evidenceText}>{t('evidenceSettlementSource', lang)}</Text>
        </View>
      )}

      <Text style={s.evidenceDisclaimer}>{t('evidenceDisclaimer', lang)}</Text>
    </View>
  )
}

/* ─── Final Summary ─────────────────────────────────────────────────────────── */

function FinalSummaryPdf({ report, lang }: { report: RC3PropertyReport; lang: Lang }) {
  const { totalIncome, totalExpenses, totalTransfers, netOwnerBalance } = computeDashboard(report.accounts)

  let balLabel: string; let balColor: string
  if (Math.abs(netOwnerBalance) < 0.005) {
    balLabel = t('balSettled', lang); balColor = C.grayText
  } else if (netOwnerBalance > 0) {
    balLabel = t('balPayableToYou', lang); balColor = '#86efac'
  } else {
    balLabel = t('balPayableByYou', lang); balColor = '#fca5a5'
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

      <View style={s.finalKpiRow}>
        {kpis.map((k, i) => (
          <View key={i} style={i < kpis.length - 1 ? s.finalKpiCell : s.finalKpiCellLast}>
            <Text style={s.finalKpiLabel}>{k.label}</Text>
            <Text style={s.finalKpiValue}>{fmt(k.value)}</Text>
          </View>
        ))}
      </View>

      <View style={s.finalBalRow}>
        <Text style={s.finalBalLabel}>{t('finalCurrentBalance', lang)}</Text>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[s.finalBalValue, { color: balColor }]}>
            {fmt(Math.abs(netOwnerBalance))}
          </Text>
          <Text style={[s.finalBalSub, { color: balColor }]}>{balLabel}</Text>
        </View>
      </View>

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
      creator="JJ Property 10 Platform (RC3 V2 + Gate 2)"
    >
      <Page size="A4" style={s.page}>
        <DocHeader report={report} lang={lang} />
        <MetaBlock  report={report} lang={lang} />

        {/* Owner Dashboard */}
        <OwnerDashboardPdf report={report} lang={lang} />

        {/* Cross-account summary (when >1 account) */}
        <CrossAccountSummary report={report} lang={lang} />

        {/* Gate 2: Certified STR Settlement (before domain accounts) */}
        {report.certifiedSTR && (
          <CertifiedSTRBlockPdf str={report.certifiedSTR} lang={lang} />
        )}

        {/* Domain account sections */}
        {report.accounts.map(acc => (
          <AccountBlock key={acc.account_type} section={acc} lang={lang} />
        ))}

        {/* Gate 2: Counterparty Settlement Position (after domain accounts) */}
        {report.settlement && (
          <SettlementBlockPdf settlement={report.settlement} lang={lang} />
        )}

        <FinalSummaryPdf report={report} lang={lang} />

        {/* Gate 2: Financial Evidence Footer */}
        <EvidenceFooterPdf report={report} lang={lang} />

        <DocFooter report={report} lang={lang} />
      </Page>
    </Document>
  )
}
