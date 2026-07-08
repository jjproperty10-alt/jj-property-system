/**
 * JJ Property 10 — PDF Document Engine
 * Owner Settlement Report — @react-pdf/renderer document.
 *
 * Place at: src/lib/pdf/OwnerSettlementPdf.tsx
 */

import React from 'react'
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from '@react-pdf/renderer'
import type { OwnerPdfData, PdfSection, BalanceDirection } from './types'
import { fmt, fmtSigned } from './formatters'

/* ─────────────────────────── palette ─────────────────────────── */

const C = {
  navy:        '#1e3a5f',
  blue:        '#2563eb',
  green:       '#15803d',
  greenBg:     '#f0fdf4',
  greenBorder: '#86efac',
  greenMuted:  '#dcfce7',
  red:         '#b91c1c',
  redBg:       '#fef2f2',
  redBorder:   '#fca5a5',
  grayBg:      '#f8fafc',
  grayBorder:  '#e2e8f0',
  grayLine:    '#f1f5f9',
  grayText:    '#64748b',
  grayDark:    '#1e293b',
  white:       '#ffffff',
  black:       '#000000',
}

/* ─────────────────────────── styles ─────────────────────────── */

const s = StyleSheet.create({
  // Page
  page: {
    paddingHorizontal: 48,
    paddingTop: 40,
    paddingBottom: 56,  // room for footer
    fontFamily: 'Helvetica',
    backgroundColor: C.white,
    color: C.grayDark,
    fontSize: 9,
  },

  // ── Header ──
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
    paddingBottom: 14,
    borderBottomWidth: 2,
    borderBottomColor: C.navy,
  },
  companyName: {
    fontSize: 20,
    fontFamily: 'Helvetica-Bold',
    color: C.navy,
    letterSpacing: 0.3,
  },
  reportSubtitle: {
    fontSize: 9,
    color: C.grayText,
    marginTop: 3,
    letterSpacing: 0.2,
  },
  headerRight: {
    alignItems: 'flex-end',
  },
  headerDate: {
    fontSize: 8,
    color: C.grayText,
    marginBottom: 2,
  },
  headerLabel: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: C.navy,
    letterSpacing: 0.5,
  },

  // ── Meta info ──
  metaBlock: {
    marginBottom: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.grayBorder,
  },
  metaRow: {
    flexDirection: 'row',
    marginBottom: 3,
  },
  metaLabel: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: C.grayText,
    width: 72,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  metaValue: {
    fontSize: 9,
    color: C.grayDark,
    flex: 1,
    lineHeight: 1.4,
  },

  // ── Hero balance ──
  heroGreen: {
    backgroundColor: C.greenBg,
    borderWidth: 1,
    borderColor: C.greenBorder,
    borderRadius: 6,
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
  },
  heroRed: {
    backgroundColor: C.redBg,
    borderWidth: 1,
    borderColor: C.redBorder,
    borderRadius: 6,
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
  },
  heroGray: {
    backgroundColor: C.grayBg,
    borderWidth: 1,
    borderColor: C.grayBorder,
    borderRadius: 6,
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
  },
  heroLabel: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: C.grayText,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  heroAmountGreen: {
    fontSize: 40,
    fontFamily: 'Helvetica-Bold',
    color: C.green,
    marginBottom: 6,
  },
  heroAmountRed: {
    fontSize: 40,
    fontFamily: 'Helvetica-Bold',
    color: C.red,
    marginBottom: 6,
  },
  heroAmountGray: {
    fontSize: 40,
    fontFamily: 'Helvetica-Bold',
    color: C.grayText,
    marginBottom: 6,
  },
  heroSub: {
    fontSize: 8,
    color: C.grayText,
  },

  // ── Section title ──
  sectionHeading: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: C.navy,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: 4,
  },

  // ── Summary table ──
  summaryBlock: {
    marginBottom: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.grayBorder,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: C.grayLine,
  },
  summaryRowTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    marginTop: 2,
    borderTopWidth: 1.5,
    borderTopColor: C.navy,
  },
  summaryLabel: {
    fontSize: 9,
    color: C.grayDark,
    flex: 1,
  },
  summaryLabelBold: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: C.grayDark,
    flex: 1,
  },
  summaryAmt: {
    fontSize: 9,
    textAlign: 'right',
    width: 90,
  },
  summaryAmtBold: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'right',
    width: 90,
  },
  summaryCredit: { color: C.green },
  summaryDebit:  { color: C.red   },
  summaryNavy:   { color: C.navy  },

  // ── Closing / settlement rows ──
  dividerRow: {
    borderTopWidth: 1,
    borderTopColor: C.grayBorder,
    marginVertical: 8,
  },

  // ── Transaction table ──
  txBlock: {
    marginBottom: 14,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: C.grayBg,
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: C.grayBorder,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: C.grayLine,
  },
  tableRowAlt: {
    backgroundColor: '#fafafa',
  },
  tableTotRow: {
    flexDirection: 'row',
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderTopWidth: 1,
    borderTopColor: C.grayBorder,
    backgroundColor: C.grayBg,
  },
  th: {
    fontSize: 7.5,
    fontFamily: 'Helvetica-Bold',
    color: C.grayText,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  td: {
    fontSize: 8,
    color: C.grayDark,
  },
  tdMuted: {
    fontSize: 8,
    color: C.grayText,
  },
  tdBold: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: C.grayDark,
  },
  // Column widths
  cDate:   { width: 55 },
  cType:   { width: 95 },
  cDesc:   { flex: 1   },
  cAmt:    { width: 65, textAlign: 'right' },
  cBalEff: { width: 65, textAlign: 'right' },

  // ── Info-only divider ──
  infoDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 12,
  },
  infoDividerLine: {
    flex: 1,
    borderTopWidth: 1,
    borderTopColor: C.grayBorder,
  },
  infoDividerLabel: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: C.grayText,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginHorizontal: 10,
  },

  // ── Footer ──
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 48,
    right: 48,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: C.grayBorder,
    paddingTop: 5,
  },
  footerText: {
    fontSize: 7,
    color: C.grayText,
  },
  footerPage: {
    fontSize: 7,
    color: C.grayText,
  },
})

/* ─────────────────────────── helpers ─────────────────────────── */

function fmtDate(iso: string): string {
  try {
    return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
    })
  } catch {
    return iso
  }
}

function heroStyle(dir: BalanceDirection) {
  if (dir === 'owed_to_owner') return s.heroGreen
  if (dir === 'owed_to_jj')   return s.heroRed
  return s.heroGray
}

function heroAmtStyle(dir: BalanceDirection) {
  if (dir === 'owed_to_owner') return s.heroAmountGreen
  if (dir === 'owed_to_jj')   return s.heroAmountRed
  return s.heroAmountGray
}

function heroLabelText(dir: BalanceDirection): string {
  if (dir === 'owed_to_owner') return 'Amount Due to You'
  if (dir === 'owed_to_jj')   return 'Amount Due to JJ'
  return 'No Balance Outstanding'
}

/* ─────────────────────────── sub-components ─────────────────── */

function Footer({ contactName, period }: { contactName: string; period: string }) {
  return (
    <View style={s.footer} fixed>
      <Text style={s.footerText}>
        JJ Property 10 · {contactName} · {period} · Confidential
      </Text>
      <Text
        style={s.footerPage}
        render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
      />
    </View>
  )
}

function MetaBlock({ data }: { data: OwnerPdfData }) {
  const period = `${fmtDate(data.fromDate)} – ${fmtDate(data.toDate)}`
  const propText = data.properties.join(' · ')

  return (
    <View style={s.metaBlock}>
      <View style={s.metaRow}>
        <Text style={s.metaLabel}>Owner</Text>
        <Text style={s.metaValue}>{data.contactName}</Text>
      </View>
      <View style={s.metaRow}>
        <Text style={s.metaLabel}>Period</Text>
        <Text style={s.metaValue}>{period}</Text>
      </View>
      <View style={s.metaRow}>
        <Text style={s.metaLabel}>Properties</Text>
        <Text style={s.metaValue}>{propText}</Text>
      </View>
      <View style={s.metaRow}>
        <Text style={s.metaLabel}>Generated</Text>
        <Text style={s.metaValue}>{data.generatedAt}</Text>
      </View>
    </View>
  )
}

function HeroBalance({ data }: { data: OwnerPdfData }) {
  const dir = data.direction
  return (
    <View style={heroStyle(dir)}>
      <Text style={s.heroLabel}>{heroLabelText(dir)}</Text>
      <Text style={heroAmtStyle(dir)}>
        {fmt(Math.abs(data.remainingBalance))}
      </Text>
      <Text style={s.heroSub}>After all settlements</Text>
    </View>
  )
}

function SummaryBlock({ data }: { data: OwnerPdfData }) {
  const expenses = data.totalCharges + data.totalExpenses + data.totalRenovation
  const totalIn  = data.totalPlatform + data.totalClientPmts
  const closing  = data.closingBalance
  const remaining = data.remainingBalance

  return (
    <View style={s.summaryBlock}>
      <Text style={s.sectionHeading}>Financial Summary</Text>

      {/* Income lines */}
      {data.totalPlatform !== 0 && (
        <View style={s.summaryRow}>
          <Text style={s.summaryLabel}>Platform Income &amp; Rent</Text>
          <Text style={[s.summaryAmt, s.summaryCredit]}>+{fmt(data.totalPlatform)}</Text>
        </View>
      )}
      {data.totalClientPmts !== 0 && (
        <View style={s.summaryRow}>
          <Text style={s.summaryLabel}>Client Payments Received</Text>
          <Text style={[s.summaryAmt, s.summaryCredit]}>+{fmt(data.totalClientPmts)}</Text>
        </View>
      )}

      {/* Expense lines */}
      {expenses !== 0 && (
        <View style={s.summaryRow}>
          <Text style={s.summaryLabel}>Expenses Paid on Behalf</Text>
          <Text style={[s.summaryAmt, s.summaryDebit]}>{fmtSigned(expenses)}</Text>
        </View>
      )}

      {/* Balance equation */}
      <View style={{ backgroundColor: C.grayBg, borderRadius: 3, paddingHorizontal: 8, paddingVertical: 5, marginBottom: 6 }}>
        <Text style={{ fontSize: 7.5, color: C.grayText, textAlign: 'center' }}>
          {`Opening ${fmt(Math.abs(data.openingBalance))} + Income ${fmt((data.totalPlatform ?? 0) + (data.totalClientPmts ?? 0))} − Expenses ${fmt((data.totalCharges ?? 0) + (data.totalExpenses ?? 0) + (data.totalRenovation ?? 0))} = Closing ${fmt(Math.abs(closing))}`}
        </Text>
      </View>

      {/* Closing */}
      <View style={s.dividerRow} />
      <View style={s.summaryRow}>
        <Text style={s.summaryLabel}>
          {`Opening Balance${data.openingBalanceAsOf ? ` (as of ${fmtDate(data.openingBalanceAsOf)})` : ''}`}
        </Text>
        <Text style={s.summaryAmt}>{fmt(Math.abs(data.openingBalance))}</Text>
      </View>
      <View style={s.summaryRow}>
        <Text style={s.summaryLabelBold}>Closing Balance</Text>
        <Text style={[s.summaryAmtBold, closing < -0.005 ? s.summaryCredit : closing > 0.005 ? s.summaryDebit : {}]}>
          {fmt(Math.abs(closing))}
        </Text>
      </View>

      {/* Settlement */}
      {data.totalBankPayments !== 0 && (
        <View style={s.summaryRow}>
          <Text style={s.summaryLabel}>Less: Payments Sent to You</Text>
          <Text style={[s.summaryAmt, s.summaryDebit]}>{fmtSigned(data.totalBankPayments)}</Text>
        </View>
      )}

      {/* Remaining */}
      <View style={s.summaryRowTotal}>
        <Text style={s.summaryLabelBold}>
          {remaining < -0.005 ? 'Amount Due to You' :
           remaining > 0.005  ? 'Amount Due to JJ'  : 'No Balance Outstanding'}
        </Text>
        <Text style={[s.summaryAmtBold, s.summaryNavy]}>
          {fmt(Math.abs(remaining))}
        </Text>
      </View>
    </View>
  )
}

function TxTable({ section }: { section: PdfSection }) {
  return (
    <View style={s.txBlock}>
      <Text style={s.sectionHeading}>{section.title}</Text>

      {/* Table header */}
      <View style={s.tableHeader}>
        <Text style={[s.th, s.cDate]}>Date</Text>
        <Text style={[s.th, s.cType]}>Type</Text>
        <Text style={[s.th, s.cDesc]}>Description</Text>
        <Text style={[s.th, s.cAmt]}>Amount</Text>
        <Text style={[s.th, s.cBalEff]}>Balance Effect</Text>
      </View>

      {/* Rows */}
      {section.rows.map((row, i) => (
        <View
          key={i}
          style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]}
          wrap={false}
        >
          <Text style={[s.tdMuted, s.cDate]}>{fmtDate(row.date)}</Text>
          <Text style={[s.td, s.cType]}>{row.type}</Text>
          <Text style={[s.tdMuted, s.cDesc]}>
            {row.description || '—'}
          </Text>
          <Text style={[s.td, s.cAmt]}>{fmt(Math.abs(row.amount))}</Text>
          <Text style={[
            s.cBalEff,
            ...(row.balEff < -0.005 ? [s.td, s.summaryCredit] :
                row.balEff > 0.005  ? [s.td, s.summaryDebit]  : [s.tdMuted]),
          ]}>
            {Math.abs(row.balEff) < 0.005 ? '—' : fmtSigned(row.balEff)}
          </Text>
        </View>
      ))}

      {/* Section total */}
      <View style={s.tableTotRow}>
        <Text style={[s.tdBold, s.cDate]} />
        <Text style={[s.tdBold, s.cType]} />
        <Text style={[s.tdBold, s.cDesc]}>Section Total</Text>
        <Text style={[s.tdBold, s.cAmt]}>
          {section.totalCredit !== 0
            ? fmt(section.totalCredit)
            : fmt(section.totalDebit)}
        </Text>
        <Text style={s.cBalEff} />
      </View>
    </View>
  )
}

/* ─────────────────────────── Document ───────────────────────── */

export function OwnerSettlementPdf({ data }: { data: OwnerPdfData }) {
  const period = `${fmtDate(data.fromDate)} – ${fmtDate(data.toDate)}`
  const operatingSections  = data.sections.filter(s => s.operating)
  const settlementSection  = data.sections.filter(s => s.isSettlement)
  const infoSections       = data.sections.filter(s => !s.operating && !s.isSettlement)

  return (
    <Document
      title={`${data.contactName} — Owner Settlement Report`}
      author="JJ Property 10"
      creator="JJ Property 10 Platform"
    >
      <Page size="A4" style={s.page}>

        {/* ── Header ── */}
        <View style={s.header} fixed>
          <View>
            <Text style={s.companyName}>JJ Property 10</Text>
            <Text style={s.reportSubtitle}>Owner Settlement Report</Text>
          </View>
          <View style={s.headerRight}>
            <Text style={s.headerDate}>{data.generatedAt}</Text>
            <Text style={s.headerLabel}>Confidential</Text>
          </View>
        </View>

        {/* ── Meta ── */}
        <MetaBlock data={data} />

        {/* ── Hero balance ── */}
        <HeroBalance data={data} />

        {/* ── Summary ── */}
        <SummaryBlock data={data} />

        {/* ── Pending review disclosure ── */}
        {(data.pendingReviewCount ?? 0) > 0 && (
          <View style={{ marginBottom: 14, padding: 8, backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fbbf24', borderRadius: 4 }}>
            <Text style={{ fontSize: 8, color: '#92400e' }}>
              {`Note: ${data.pendingReviewCount} transaction${data.pendingReviewCount === 1 ? '' : 's'} are pending review and not included in the balance calculation above.`}
            </Text>
          </View>
        )}

        {/* ── Operating sections ── */}
        {operatingSections.length > 0 && (
          <Text style={s.sectionHeading}>Transaction Detail</Text>
        )}
        {operatingSections.map(section => (
          <TxTable key={section.key} section={section} />
        ))}

        {/* ── Settlement section ── */}
        {settlementSection.length > 0 && (
          <>
            <Text style={s.sectionHeading}>Payments &amp; Settlement</Text>
            {settlementSection.map(section => (
              <TxTable key={section.key} section={section} />
            ))}
          </>
        )}

        {/* ── Info-only sections ── */}
        {infoSections.length > 0 && (
          <View style={s.infoDivider}>
            <View style={s.infoDividerLine} />
            <Text style={s.infoDividerLabel}>For Reference · No Impact on Balance</Text>
            <View style={s.infoDividerLine} />
          </View>
        )}
        {infoSections.map(section => (
          <TxTable key={section.key} section={section} />
        ))}

        {/* ── Footer ── */}
        <Footer contactName={data.contactName} period={period} />

      </Page>
    </Document>
  )
}
