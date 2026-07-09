/**
 * JJ Property 10 — Owner Settlement Report V3
 * Phase 3 — 2026-07-09
 *
 * Account-based PDF report. Renders one section per account type
 * in the canonical order: Property Purchase → Renovation → Rental → Airbnb.
 *
 * Balance conventions:
 *   Rental / Airbnb : positive closing balance = JJ owes owner (shown in green)
 *   Sale / Renovation : positive closing balance = client owes JJ (shown in red)
 *
 * Font: Heebo (Hebrew + Latin, SIL OFL). Served from /fonts/Heebo-*.ttf.
 *
 * Place at: src/lib/pdf/OwnerSettlementPdfV3.tsx
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

/* ─── Account colours ───────────────────────────────────────────────────────── */

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

  // Header (fixed)
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
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.grayBorder,
  },
  metaRow:   { flexDirection: 'row', marginBottom: 3 },
  metaLabel: {
    fontSize: 7.5, fontWeight: 'bold', color: C.grayText,
    width: 68, textTransform: 'uppercase', letterSpacing: 0.3,
  },
  metaValue: { fontSize: 8.5, color: C.grayDark, flex: 1, lineHeight: 1.4 },

  // Summary card
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

  // Account section
  accountSection: { marginBottom: 20 },
  accountHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 10,
    marginBottom: 8,
    borderRadius: 3,
  },
  accountTitle:   { fontSize: 10, fontWeight: 'bold', color: C.white, letterSpacing: 0.6 },
  accountBalance: { fontSize: 10, fontWeight: 'bold', color: C.white },

  // Sub-group header (income / expense / payment / info)
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

  // Balance strip
  balStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
    paddingHorizontal: 10,
    marginTop: 4,
    borderTopWidth: 1.5,
    borderTopColor: C.grayBorder,
  },
  balLabel: { fontSize: 8.5, fontWeight: 'bold', color: C.grayDark },
  balValue: { fontSize: 8.5, fontWeight: 'bold' },

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

/* ─── Helpers ───────────────────────────────────────────────────────────────── */

function fmtDate(iso: string): string {
  try {
    return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
    })
  } catch {
    return iso
  }
}

function fmtPeriod(report: RC3PropertyReport): string {
  if (!report.from_date && !report.to_date) return 'All Dates'
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
  } catch {
    return iso
  }
}

function balanceLabel(section: RC3AccountSection): string {
  const b = section.closing_balance
  const conv = section.balance_convention
  if (Math.abs(b) < 0.005) return 'Settled'
  if (conv === 'owner_credit') {
    return b > 0 ? 'Due to You' : 'Due to JJ'
  } else {
    return b > 0 ? 'Due to JJ' : 'Credit Balance'
  }
}

function balanceColor(section: RC3AccountSection): string {
  const b = section.closing_balance
  const conv = section.balance_convention
  if (Math.abs(b) < 0.005) return C.grayText
  if (conv === 'owner_credit') return b > 0 ? C.green : C.red
  else                         return b > 0 ? C.red   : C.green
}

/* ─── Sub-components ────────────────────────────────────────────────────────── */

function DocHeader({ report }: { report: RC3PropertyReport }) {
  return (
    <View style={s.header} fixed>
      <View>
        <Text style={s.companyName}>JJ Property 10</Text>
        <Text style={s.reportTitle}>Owner Settlement Report — {report.reporting_name}</Text>
      </View>
      <View style={s.headerRight}>
        <Text style={s.headerDate}>{fmtGenerated(report.generated_at)}</Text>
        <Text style={s.headerLabel}>Confidential</Text>
      </View>
    </View>
  )
}

function MetaBlock({ report }: { report: RC3PropertyReport }) {
  return (
    <View style={s.metaBlock}>
      <View style={s.metaRow}>
        <Text style={s.metaLabel}>Property</Text>
        <Text style={s.metaValue}>{report.reporting_name}</Text>
      </View>
      <View style={s.metaRow}>
        <Text style={s.metaLabel}>Period</Text>
        <Text style={s.metaValue}>{fmtPeriod(report)}</Text>
      </View>
      <View style={s.metaRow}>
        <Text style={s.metaLabel}>Generated</Text>
        <Text style={s.metaValue}>{fmtGenerated(report.generated_at)}</Text>
      </View>
    </View>
  )
}

function SummaryCard({ report }: { report: RC3PropertyReport }) {
  return (
    <View style={s.summaryCard}>
      {report.accounts.map((acc, i) => {
        const b     = acc.closing_balance
        const color = balanceColor(acc)
        const label = balanceLabel(acc)
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
        const desc = (row.description ?? '').trim() || row.display_label || '—'
        return (
          <View
            key={row.id}
            style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]}
            wrap={false}
          >
            <Text style={[s.tdMuted, s.cDate]}>{fmtDate(row.date)}</Text>
            <View style={s.cDesc}>
              <Text style={s.td}>{desc}</Text>
              {row.display_label !== desc && (
                <Text style={s.tdInfo}>{row.display_label}</Text>
              )}
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

function InfoRows({ rows }: { rows: RC3AccountRow[] }) {
  if (rows.length === 0) return null
  return (
    <View>
      <Text style={s.groupLabel}>For Reference (Informational)</Text>
      <View style={s.tableHead}>
        <Text style={[s.th, s.cDate]}>Date</Text>
        <Text style={[s.th, s.cDesc]}>Description</Text>
        <Text style={[s.th, s.cAmt]}>Amount</Text>
      </View>
      {rows.map((row, i) => (
        <View
          key={row.id}
          style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]}
          wrap={false}
        >
          <Text style={[s.tdMuted, s.cDate]}>{fmtDate(row.date)}</Text>
          <View style={s.cDesc}>
            <Text style={s.tdInfo}>{(row.description ?? '').trim() || row.display_label || '—'}</Text>
            <Text style={s.tdInfo}>{row.display_label}</Text>
          </View>
          <Text style={[s.cAmt, s.tdInfo]}>{fmt(row.client_amount)}</Text>
        </View>
      ))}
    </View>
  )
}

function AccountBlock({ section }: { section: RC3AccountSection }) {
  const acColor  = ACCOUNT_COLOURS[section.account_type]
  const balColor = balanceColor(section)
  const balText  = balanceLabel(section)

  const incomeRows   = section.rows.filter(r => r.display_group === 'income')
  const expenseRows  = section.rows.filter(r => r.display_group === 'expense')
  const payoutRows   = section.rows.filter(r => r.display_group === 'payment_out')
  const infoRows     = section.rows.filter(r => r.display_group === 'info')
  // reference rows (contracts, internals) are omitted from client PDF

  const incomeLabel  = section.balance_convention === 'owner_credit'
    ? 'Money Received For You'
    : 'Payments Received'

  const expenseLabel = section.balance_convention === 'owner_credit'
    ? 'Expenses Paid on Your Behalf'
    : 'Amounts Billed to Client'

  return (
    <View style={s.accountSection} break={false}>
      {/* Account header bar */}
      <View style={[s.accountHeader, { backgroundColor: acColor }]}>
        <View>
          <Text style={s.accountTitle}>{section.account_label}</Text>
          <Text style={[s.accountTitle, { fontSize: 8, fontWeight: 'normal', opacity: 0.8 }]}>
            {section.account_label_he}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[s.accountBalance, { color: C.white }]}>
            {fmt(Math.abs(section.closing_balance))}
          </Text>
          <Text style={[s.accountBalance, { fontSize: 7.5, fontWeight: 'normal', color: C.white, opacity: 0.85 }]}>
            {balText}
          </Text>
        </View>
      </View>

      {/* Transaction groups */}
      <TxGroupTable rows={incomeRows}  groupLabel={incomeLabel}  isIncome={true}  />
      <TxGroupTable rows={expenseRows} groupLabel={expenseLabel} isIncome={false} />
      {payoutRows.length > 0 && (
        <TxGroupTable rows={payoutRows} groupLabel="Payments Sent to You" isIncome={false} />
      )}
      <InfoRows rows={infoRows} />

      {/* Balance strip */}
      <View style={s.balStrip}>
        <Text style={s.balLabel}>
          {section.account_label} — {balText}
        </Text>
        <Text style={[s.balValue, { color: balColor }]}>
          {fmt(Math.abs(section.closing_balance))}
        </Text>
      </View>
    </View>
  )
}

function DocFooter({ report }: { report: RC3PropertyReport }) {
  const period = fmtPeriod(report)
  return (
    <View style={s.footer} fixed>
      <Text style={s.footerText}>
        JJ Property 10 · {report.reporting_name} · {period} · Confidential
      </Text>
      <Text
        style={s.footerText}
        render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`}
      />
    </View>
  )
}

function Disclosure() {
  return (
    <View style={s.disclosure}>
      <Text style={[s.disclosureText, { fontWeight: 'bold' }]}>
        ⚠ Opening Balance Not Included:
      </Text>
      <Text style={s.disclosureText}>
        Opening balances from prior periods are not yet carried forward. Date-filtered reports may
        show incorrect closing balances. Use all-time (unfiltered) reports only for financial review
        until opening balances are implemented.
      </Text>
      <Text style={[s.disclosureText, { marginTop: 4 }]}>
        This report is generated from accounting records and is pending final review.
        Some transactions may be subject to reclassification. Rows marked "Needs Review" require
        manual verification before financial use. This document is confidential and intended
        solely for the named property owner.
      </Text>
    </View>
  )
}

/* ─── Main document ─────────────────────────────────────────────────────────── */

export interface OwnerSettlementPdfV3Props {
  report: RC3PropertyReport
}

export function OwnerSettlementPdfV3({ report }: OwnerSettlementPdfV3Props) {
  return (
    <Document
      title={`RC3 Owner Settlement Report — ${report.reporting_name}`}
      author="JJ Property 10"
      creator="JJ Property 10 Platform (RC3)"
    >
      <Page size="A4" style={s.page}>
        <DocHeader report={report} />
        <MetaBlock report={report} />

        {/* Account-level summary strip */}
        {report.accounts.length > 1 && <SummaryCard report={report} />}

        {/* One section per account — in canonical order */}
        {report.accounts.map(acc => (
          <AccountBlock key={acc.account_type} section={acc} />
        ))}

        <Disclosure />
        <DocFooter report={report} />
      </Page>
    </Document>
  )
}

/* ─── PDF generation helper (for server-side PDF blob) ──────────────────────── */

export async function generateRC3Pdf(report: RC3PropertyReport): Promise<Blob> {
  const { pdf } = await import('@react-pdf/renderer')
  return await pdf(<OwnerSettlementPdfV3 report={report} />).toBlob()
}
