/**
 * OwnerStrStatementPdf — printable STR Owner Statement (react-pdf). Owner-facing.
 *
 * Consumes the composed OwnerStrStatement DTO. No calculations here — display only.
 * Reuses the JJ PDF stack (react-pdf, fmt). Unknown values render as "Needs Review", never €0.
 * Reconciliation/internal accounting is intentionally NOT shown to the owner.
 */
import React from 'react'
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import { fmt, fmtSigned } from './formatters'
import type { OwnerStrStatement } from '@/lib/report/str/ownerStrStatement'

const C = { navy: '#1e3a5f', gray: '#6b7280', line: '#e5e7eb', head: '#f3f4f6', red: '#b91c1c', text: '#111827' }
const S = StyleSheet.create({
  page: { padding: 32, fontSize: 8.5, color: C.text, fontFamily: 'Helvetica' },
  hRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
  company: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: C.navy },
  sub: { fontSize: 8, color: C.gray },
  meta: { fontSize: 8, color: C.text, textAlign: 'right' },
  section: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.navy, marginTop: 14, marginBottom: 5, textTransform: 'uppercase' },
  metricsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metric: { width: '31%', borderWidth: 1, borderColor: C.line, borderRadius: 4, padding: 6 },
  metricLabel: { fontSize: 7, color: C.gray },
  metricValue: { fontSize: 11, fontFamily: 'Helvetica-Bold', marginTop: 2 },
  tr: { flexDirection: 'row', borderBottomWidth: 1, borderColor: C.line, paddingVertical: 3 },
  th: { flexDirection: 'row', backgroundColor: C.head, paddingVertical: 4, borderBottomWidth: 1, borderColor: C.line },
  thT: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: C.gray },
  cell: { fontSize: 7.5 },
  right: { textAlign: 'right' },
  totalRow: { flexDirection: 'row', paddingVertical: 4, borderTopWidth: 1.5, borderColor: C.navy, marginTop: 1 },
  totalT: { fontSize: 8, fontFamily: 'Helvetica-Bold' },
  review: { color: C.red, fontFamily: 'Helvetica-Bold' },
  finalWrap: { marginTop: 14, alignSelf: 'flex-end', width: '48%' },
  finalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  finalTotal: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, borderTopWidth: 1.5, borderColor: C.navy, marginTop: 2 },
  note: { fontSize: 6.5, color: C.gray, marginTop: 12, lineHeight: 1.4 },
  calcBox: { marginTop: 18, padding: 8, backgroundColor: '#F5F7FA', borderRadius: 3 },
  calcHead: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: C.navy, marginBottom: 4, textTransform: 'uppercase' },
  calcT: { fontSize: 6.8, color: C.gray, lineHeight: 1.5 },
})

// Activity columns: Check-in | Check-out | Guest | Listing | Channel | Gross | Platform | Cleaning | Mgmt | Taxes | Net
const W = ['9%', '9%', '15%', '15%', '8%', '9%', '9%', '7%', '8%', '6%', '10%'] as const
const money = (v: number | null) => (v == null ? 'Needs Review' : fmt(v))

export function OwnerStrStatementPdf({ data }: { data: OwnerStrStatement }) {
  const t = data.totals
  return (
    <Document>
      <Page size="A4" style={S.page} wrap>
        {/* Header */}
        <View style={S.hRow}>
          <View>
            <Text style={S.company}>{data.header.company}</Text>
            <Text style={S.sub}>Archiepiskopou Kyprianou, 4</Text>
            <Text style={S.sub}>jjproperty10@gmail.com</Text>
          </View>
          <View>
            <Text style={S.meta}>Owner: {data.header.ownerName}</Text>
            <Text style={S.meta}>Property: {data.header.properties.join(', ') || '—'}</Text>
            <Text style={S.meta}>Statement period: {data.header.periodStart} – {data.header.periodEnd}</Text>
            <Text style={S.meta}>Issued date: {data.header.issuedDate}</Text>
          </View>
        </View>

        {/* Metrics */}
        <Text style={S.section}>Metrics</Text>
        <View style={S.metricsWrap}>
          <View style={S.metric}><Text style={S.metricLabel}>Gross Rental Revenue</Text><Text style={S.metricValue}>{fmt(data.metrics.grossEur)}</Text></View>
          <View style={S.metric}><Text style={S.metricLabel}>Net Owner Payout</Text><Text style={[S.metricValue, data.metrics.netOwnerPayoutEur == null ? S.review : {}]}>{money(data.metrics.netOwnerPayoutEur)}</Text></View>
          <View style={S.metric}><Text style={S.metricLabel}>Property Management Revenue</Text><Text style={[S.metricValue, data.metrics.propertyManagementRevenueEur == null ? S.review : {}]}>{money(data.metrics.propertyManagementRevenueEur)}</Text></View>
        </View>

        {/* Rental activity */}
        <Text style={S.section}>Rental Activity</Text>
        <View style={S.th}>
          {['Check-in', 'Check-out', 'Guest', 'Listing', 'Channel', 'Gross', 'Platform', 'Cleaning', 'Mgmt Fee', 'Taxes', 'Net Payout'].map((h, i) => (
            <Text key={h} style={[S.thT, { width: W[i] }, i >= 5 ? S.right : {}]}>{h}</Text>
          ))}
        </View>
        {data.activity.length === 0 ? (
          <Text style={[S.cell, { paddingVertical: 6, color: C.gray }]}>No reservations in this period.</Text>
        ) : data.activity.map((r) => (
          <View key={r.reservationId} style={S.tr} wrap={false}>
            <Text style={[S.cell, { width: W[0] }]}>{r.checkIn}</Text>
            <Text style={[S.cell, { width: W[1] }]}>{r.checkOut}</Text>
            <Text style={[S.cell, { width: W[2] }]}>{r.guestName ?? '—'}</Text>
            <Text style={[S.cell, { width: W[3] }]}>{r.propertyName}</Text>
            <Text style={[S.cell, { width: W[4] }]}>{r.channel}</Text>
            <Text style={[S.cell, { width: W[5] }, S.right]}>{money(r.line.gross.value)}</Text>
            <Text style={[S.cell, { width: W[6] }, S.right]}>{money(r.line.platformFees.value)}</Text>
            <Text style={[S.cell, { width: W[7] }, S.right]}>{money(r.line.cleaning.value)}</Text>
            <Text style={[S.cell, { width: W[8] }, S.right, r.line.managementFee.value == null ? S.review : {}]}>{money(r.line.managementFee.value)}</Text>
            <Text style={[S.cell, { width: W[9] }, S.right, r.line.taxes.value == null ? S.review : {}]}>{r.line.taxes.value == null ? 'Review' : fmt(r.line.taxes.value)}</Text>
            <Text style={[S.cell, { width: W[10] }, S.right, r.line.netOwnerPayout.value == null ? S.review : {}]}>{money(r.line.netOwnerPayout.value)}</Text>
          </View>
        ))}
        {data.activity.length > 0 && (
          <View style={S.totalRow}>
            <Text style={[S.totalT, { width: W[0] }]}>Totals</Text>
            <Text style={[S.totalT, { width: W[1] }]}></Text>
            <Text style={[S.totalT, { width: W[2] }]}></Text>
            <Text style={[S.totalT, { width: W[3] }]}></Text>
            <Text style={[S.totalT, { width: W[4] }]}></Text>
            <Text style={[S.totalT, { width: W[5] }, S.right]}>{fmt(t.grossEur)}</Text>
            <Text style={[S.totalT, { width: W[6] }, S.right]}>{money(t.platformFeesEur)}</Text>
            <Text style={[S.totalT, { width: W[7] }, S.right]}>{money(t.cleaningEur)}</Text>
            <Text style={[S.totalT, { width: W[8] }, S.right, t.managementFeeEur == null ? S.review : {}]}>{money(t.managementFeeEur)}</Text>
            <Text style={[S.totalT, { width: W[9] }, S.right, t.taxesEur == null ? S.review : {}]}>{t.taxesEur == null ? 'Review' : fmt(t.taxesEur)}</Text>
            <Text style={[S.totalT, { width: W[10] }, S.right, t.netOwnerPayoutEur == null ? S.review : {}]}>{money(t.netOwnerPayoutEur)}</Text>
          </View>
        )}

        {/* Expenses & extras */}
        {data.expensesExtras.length > 0 && (
          <>
            <Text style={S.section}>Expenses & Extras</Text>
            <View style={S.th}>
              <Text style={[S.thT, { width: '20%' }]}>Name</Text>
              <Text style={[S.thT, { width: '12%' }]}>Date</Text>
              <Text style={[S.thT, { width: '20%' }]}>Category</Text>
              <Text style={[S.thT, { width: '20%' }]}>Listing</Text>
              <Text style={[S.thT, { width: '13%' }]}>Reservation</Text>
              <Text style={[S.thT, { width: '15%' }, S.right]}>Amount</Text>
            </View>
            {data.expensesExtras.map((e, i) => (
              <View key={i} style={S.tr} wrap={false}>
                <Text style={[S.cell, { width: '20%' }]}>{e.name}</Text>
                <Text style={[S.cell, { width: '12%' }]}>{e.date}</Text>
                <Text style={[S.cell, { width: '20%' }]}>{e.subcategory}</Text>
                <Text style={[S.cell, { width: '20%' }]}>{e.propertyName}</Text>
                {/* Reservation linkage: JJ ledger extras carry no reservation id — shown as em dash, never fabricated. */}
                <Text style={[S.cell, { width: '13%' }]}>{e.reservationId ?? '\u2014'}</Text>
                <Text style={[S.cell, { width: '15%' }, S.right]}>{fmtSigned(e.amountEur)}</Text>
              </View>
            ))}
            <View style={S.totalRow}>
              <Text style={[S.totalT, { width: '85%' }]}>Totals</Text>
              <Text style={[S.totalT, { width: '15%' }, S.right]}>{fmtSigned(data.expensesExtrasTotalEur)}</Text>
            </View>
          </>
        )}

        {/* Final */}
        <View style={S.finalWrap}>
          <View style={S.finalRow}><Text>Owner Payout</Text><Text style={data.metrics.netOwnerPayoutEur == null ? S.review : {}}>{money(data.metrics.netOwnerPayoutEur)}</Text></View>
          <View style={S.finalRow}><Text>Expenses and extras</Text><Text>{fmtSigned(data.expensesExtrasTotalEur)}</Text></View>
          <View style={S.finalTotal}><Text style={S.totalT}>Statement total</Text><Text style={[S.totalT, data.statementTotalEur == null ? S.review : {}]}>{money(data.statementTotalEur)}</Text></View>
        </View>

        {/* Revenue Calculation Overview — explicit per-line formula chain (report transparency). */}
        <View style={S.calcBox}>
          <Text style={S.calcHead}>Revenue Calculation Overview</Text>
          <Text style={S.calcT}>Gross · Platform Fees · Cleaning · Taxes are Hostaway reservation evidence (source of truth).</Text>
          <Text style={S.calcT}>Platform Fees = Airbnb host fee, or Booking channel commission (channel-aware).</Text>
          <Text style={S.calcT}>Management Fee = 20% x (Total Payout - Cleaning - Taxes) — JJ report policy, not a bank charge.</Text>
          <Text style={S.calcT}>Net Owner Payout = Total Payout - Cleaning - Management Fee - Taxes.</Text>
          <Text style={S.calcT}>Expenses & Extras = JJ ledger only; Cleaning & Management Fee are excluded here (already in the line above) to avoid double-counting.</Text>
          <Text style={S.calcT}>Statement Total = Net Owner Payout - Expenses & Extras. Unknown values show Needs Review, never zero.</Text>
        </View>
        <Text style={S.note}>{data.provenanceNote}</Text>
      </Page>
    </Document>
  )
}
