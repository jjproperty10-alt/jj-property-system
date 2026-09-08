/**
 * OwnerStrRangeStatementPdf — printable MULTI-MONTH owner STR statement (react-pdf). Owner-facing.
 *
 * PRESENTATION ONLY. Consumes the composed OwnerStrRangeStatement DTO. No calculations here — every
 * financial number (overall + per-month) is read verbatim from the DTO. The Check-ins, Nights,
 * By-Apartment and Reservation-Details views are pure presentation derivations (counts/sums of the
 * DTO's already-included activity rows) — they add NO financial logic and change NO total. Unknown
 * values render as a "Needs Review" badge, never €0. Heebo font (Hebrew + Latin).
 */
import React from 'react'
import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer'
import { fmt, fmtSigned } from './formatters'
import type { OwnerStrRangeStatement } from '@/lib/report/str/ownerStrRangeStatement'
import { monthOccupancy, perPropertyRollup, reservationDetails } from '@/lib/report/str/strStatementDerivations'

Font.register({
  family: 'Heebo',
  fonts: [
    { src: 'https://fonts.gstatic.com/s/heebo/v28/NGSpv5_NC0k9P_v6ZUCbLRAHxK1EiSycckOnz02SXQ.ttf' },
    { src: 'https://fonts.gstatic.com/s/heebo/v28/NGSpv5_NC0k9P_v6ZUCbLRAHxK1EbiucckOnz02SXQ.ttf', fontWeight: 'bold' },
  ],
})

const C = {
  navy: '#1e3a5f', text: '#1e293b', gray: '#64748b', grayMid: '#94a3b8',
  line: '#e2e8f0', lineSoft: '#f1f5f9', head: '#f8fafc',
  amber: '#92400e', amberBg: '#fef3c7', amberBorder: '#fcd34d', summaryBg: '#f8fafc',
}

const S = StyleSheet.create({
  page: { paddingHorizontal: 40, paddingTop: 36, paddingBottom: 48, fontSize: 8.5, color: C.text, fontFamily: 'Heebo' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: 14, marginBottom: 18, borderBottomWidth: 2, borderBottomColor: C.navy },
  company: { fontSize: 17, fontWeight: 'bold', color: C.navy, letterSpacing: 0.4 },
  tagline: { fontSize: 8, color: C.gray, marginTop: 3, letterSpacing: 0.3 },
  contact: { fontSize: 7, color: C.grayMid, marginTop: 6, lineHeight: 1.4 },
  headerRight: { alignItems: 'flex-end', maxWidth: '46%' },
  metaLabel: { fontSize: 6.5, fontWeight: 'bold', color: C.grayMid, letterSpacing: 0.6, textTransform: 'uppercase' },
  metaValue: { fontSize: 9, color: C.text, marginBottom: 5, textAlign: 'right' },
  metaValueLg: { fontSize: 10, fontWeight: 'bold', color: C.navy, marginBottom: 5, textAlign: 'right' },
  section: { fontSize: 9, fontWeight: 'bold', color: C.navy, marginTop: 16, marginBottom: 7, textTransform: 'uppercase', letterSpacing: 0.5 },

  // Overall summary card
  summary: { borderWidth: 1, borderColor: C.line, borderRadius: 6, backgroundColor: C.summaryBg, paddingHorizontal: 16, paddingVertical: 14 },
  sumRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 3 },
  sumLabel: { fontSize: 9, color: C.gray },
  sumValue: { fontSize: 10, color: C.text },
  sumDivider: { borderTopWidth: 1.5, borderColor: C.navy, marginTop: 8, paddingTop: 10 },
  sumTotalLabel: { fontSize: 11, fontWeight: 'bold', color: C.navy, textTransform: 'uppercase', letterSpacing: 0.4 },
  sumTotalValue: { fontSize: 17, fontWeight: 'bold', color: C.navy },

  // Tables
  th: { flexDirection: 'row', backgroundColor: C.head, paddingVertical: 5, paddingHorizontal: 2, borderTopWidth: 1, borderBottomWidth: 1, borderColor: C.line },
  thT: { fontSize: 6, fontWeight: 'bold', color: C.gray, textTransform: 'uppercase', letterSpacing: 0.2 },
  tr: { flexDirection: 'row', paddingVertical: 4, paddingHorizontal: 2, borderBottomWidth: 1, borderColor: C.lineSoft },
  cell: { fontSize: 7, color: C.text },
  cellMuted: { fontSize: 7, color: C.grayMid },
  center: { textAlign: 'center' },
  left: { textAlign: 'left' },
  totalRow: { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 2, borderTopWidth: 1.5, borderColor: C.navy },
  totalT: { fontSize: 7.5, fontWeight: 'bold', color: C.navy },

  badgeWrap: { flexDirection: 'row', justifyContent: 'center' },
  badge: { backgroundColor: C.amberBg, borderWidth: 0.75, borderColor: C.amberBorder, borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1.5 },
  badgeText: { fontSize: 6, fontWeight: 'bold', color: C.amber, letterSpacing: 0.2 },
  badgeSm: { backgroundColor: C.amberBg, borderWidth: 0.75, borderColor: C.amberBorder, borderRadius: 7, paddingHorizontal: 3, paddingVertical: 1 },
  badgeSmText: { fontSize: 5.5, fontWeight: 'bold', color: C.amber },
  empty: { fontSize: 7.5, color: C.grayMid, paddingVertical: 6 },

  overviewBox: { marginTop: 22, paddingTop: 12, borderTopWidth: 1, borderColor: C.line },
  overviewHead: { fontSize: 8, fontWeight: 'bold', color: C.navy, marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.5 },
  overviewT: { fontSize: 7.5, color: C.gray, lineHeight: 1.6, marginBottom: 2 },
  note: { fontSize: 6.5, color: C.grayMid, marginTop: 12, lineHeight: 1.4 },
})

// Month table: Month | Check-ins | Nights | Gross | Platform | Cleaning | Mgmt Fee | Taxes | Net Payout
const W = ['17%', '10%', '8%', '12%', '12%', '11%', '11%', '8%', '11%'] as const
// By Apartment: Apartment | Check-ins | Nights | Gross | Net Owner
const WA = ['34%', '15%', '13%', '19%', '19%'] as const
// Reservation Details: Check-in | Check-out | Nights | Property | Channel | Guest | Gross | Net
const WR = ['11%', '11%', '7%', '20%', '13%', '16%', '11%', '11%'] as const
const money = (v: number | null) => (v == null ? '—' : fmt(v))
const Review = ({ sm = false }: { sm?: boolean }) => (
  <View style={S.badgeWrap}><View style={sm ? S.badgeSm : S.badge}><Text style={sm ? S.badgeSmText : S.badgeText}>{sm ? 'Review' : 'Needs Review'}</Text></View></View>
)

export function OwnerStrRangeStatementPdf({ data }: { data: OwnerStrRangeStatement }) {
  const h = data.header
  const o = data.overall
  const rollup = perPropertyRollup(data.months)
  const details = reservationDetails(data.months)
  const totalCheckIns = details.length
  const totalNights = data.months.reduce((acc, m) => acc + monthOccupancy(m).nights, 0)
  return (
    <Document>
      <Page size="A4" style={S.page} wrap>
        {/* Header */}
        <View style={S.header}>
          <View>
            <Text style={S.company}>{h.company}</Text>
            <Text style={S.tagline}>Property Management · Multi-Month Owner Statement</Text>
            <Text style={S.contact}>Archiepiskopou Kyprianou, 4{'\n'}jjproperty10@gmail.com</Text>
          </View>
          <View style={S.headerRight}>
            <Text style={S.metaLabel}>Owner</Text>
            <Text style={S.metaValueLg}>{h.ownerName}</Text>
            <Text style={S.metaLabel}>Property</Text>
            <Text style={S.metaValue}>{h.properties.join(', ') || '—'}</Text>
            <Text style={S.metaLabel}>Statement Range</Text>
            <Text style={S.metaValue}>{h.rangeLabel} ({h.monthCount} {h.monthCount === 1 ? 'month' : 'months'})</Text>
            <Text style={S.metaLabel}>Issued</Text>
            <Text style={S.metaValue}>{h.issuedDate}</Text>
          </View>
        </View>

        {/* Overall summary */}
        <Text style={S.section}>Overall Summary</Text>
        <View style={S.summary}>
          <View style={S.sumRow}><Text style={S.sumLabel}>Gross Rental Revenue</Text><Text style={S.sumValue}>{fmt(o.grossEur)}</Text></View>
          <View style={S.sumRow}><Text style={S.sumLabel}>Platform Fees</Text>{o.platformFeesEur == null ? <Review /> : <Text style={S.sumValue}>{fmt(o.platformFeesEur)}</Text>}</View>
          <View style={S.sumRow}><Text style={S.sumLabel}>Cleaning</Text>{o.cleaningEur == null ? <Review /> : <Text style={S.sumValue}>{fmt(o.cleaningEur)}</Text>}</View>
          <View style={S.sumRow}><Text style={S.sumLabel}>Management Fee</Text>{o.managementFeeEur == null ? <Review /> : <Text style={S.sumValue}>{fmt(o.managementFeeEur)}</Text>}</View>
          <View style={S.sumRow}><Text style={S.sumLabel}>Taxes</Text>{o.taxesEur == null ? <Review /> : <Text style={S.sumValue}>{fmt(o.taxesEur)}</Text>}</View>
          <View style={S.sumRow}><Text style={S.sumLabel}>Net Owner Payout</Text>{o.netOwnerPayoutEur == null ? <Review /> : <Text style={S.sumValue}>{fmt(o.netOwnerPayoutEur)}</Text>}</View>
          <View style={S.sumRow}><Text style={S.sumLabel}>Expenses & Extras</Text><Text style={S.sumValue}>{fmtSigned(o.expensesExtrasTotalEur)}</Text></View>
          {o.ownerPaymentsTotalEur !== 0 ? (
            <View style={S.sumRow}><Text style={S.sumLabel}>Payments received</Text><Text style={S.sumValue}>{fmtSigned(o.ownerPaymentsTotalEur)}</Text></View>
          ) : null}
          <View style={[S.sumRow, S.sumDivider]}>
            <Text style={S.sumTotalLabel}>Statement Total</Text>
            {o.statementTotalEur == null ? <Review /> : (
              <Text style={S.sumTotalValue}>
                {o.statementTotalEur < 0 ? `-${fmt(o.statementTotalEur)}` : fmt(o.statementTotalEur)}
              </Text>
            )}
          </View>
        </View>
        {o.needsReviewMonths > 0 ? (
          <Text style={S.note}>{o.needsReviewMonths} of {h.monthCount} months still contain a reservation awaiting evidence, so the affected overall totals show Needs Review rather than a partial sum.</Text>
        ) : null}

        {/* Month-by-month breakdown */}
        <Text style={S.section}>Month-by-Month Breakdown</Text>
        <View style={S.th}>
          {['Month', 'Check-ins', 'Nights', 'Gross', 'Platform', 'Cleaning', 'Mgmt Fee', 'Taxes', 'Net Payout'].map((hd, i) => (
            <Text key={hd} style={[S.thT, { width: W[i] }, i === 0 ? S.left : S.center]}>{hd}</Text>
          ))}
        </View>
        {data.months.map((m, i) => {
          const t = m.totals
          const occ = monthOccupancy(m)
          return (
            <View key={i} style={S.tr} wrap={false}>
              <Text style={[S.cell, { width: W[0] }, S.left]}>{m.header.periodLabel}</Text>
              <Text style={[S.cell, { width: W[1] }, S.center]}>{occ.checkIns}</Text>
              <Text style={[S.cell, { width: W[2] }, S.center]}>{occ.nights}</Text>
              <Text style={[S.cell, { width: W[3] }, S.center]}>{fmt(t.grossEur)}</Text>
              <Text style={[t.platformFeesEur == null ? S.cellMuted : S.cell, { width: W[4] }, S.center]}>{money(t.platformFeesEur)}</Text>
              <Text style={[t.cleaningEur == null ? S.cellMuted : S.cell, { width: W[5] }, S.center]}>{money(t.cleaningEur)}</Text>
              <Text style={[t.managementFeeEur == null ? S.cellMuted : S.cell, { width: W[6] }, S.center]}>{money(t.managementFeeEur)}</Text>
              <Text style={[t.taxesEur == null ? S.cellMuted : S.cell, { width: W[7] }, S.center]}>{money(t.taxesEur)}</Text>
              {t.netOwnerPayoutEur == null
                ? <View style={{ width: W[8] }}><Review sm /></View>
                : <Text style={[S.cell, { width: W[8] }, S.center]}>{fmt(t.netOwnerPayoutEur)}</Text>}
            </View>
          )
        })}
        <View style={S.totalRow}>
          <Text style={[S.totalT, { width: W[0] }, S.left]}>Total ({h.monthCount})</Text>
          <Text style={[S.totalT, { width: W[1] }, S.center]}>{totalCheckIns}</Text>
          <Text style={[S.totalT, { width: W[2] }, S.center]}>{totalNights}</Text>
          <Text style={[S.totalT, { width: W[3] }, S.center]}>{fmt(o.grossEur)}</Text>
          <Text style={[o.platformFeesEur == null ? S.cellMuted : S.totalT, { width: W[4] }, S.center]}>{money(o.platformFeesEur)}</Text>
          <Text style={[o.cleaningEur == null ? S.cellMuted : S.totalT, { width: W[5] }, S.center]}>{money(o.cleaningEur)}</Text>
          <Text style={[o.managementFeeEur == null ? S.cellMuted : S.totalT, { width: W[6] }, S.center]}>{money(o.managementFeeEur)}</Text>
          <Text style={[o.taxesEur == null ? S.cellMuted : S.totalT, { width: W[7] }, S.center]}>{money(o.taxesEur)}</Text>
          {o.netOwnerPayoutEur == null
            ? <View style={{ width: W[8] }}><Review sm /></View>
            : <Text style={[S.totalT, { width: W[8] }, S.center]}>{fmt(o.netOwnerPayoutEur)}</Text>}
        </View>

        {/* By Apartment */}
        <Text style={S.section}>By Apartment</Text>
        <View style={S.th}>
          {['Apartment', 'Check-ins', 'Nights', 'Gross', 'Net Owner'].map((hd, i) => (
            <Text key={hd} style={[S.thT, { width: WA[i] }, i === 0 ? S.left : S.center]}>{hd}</Text>
          ))}
        </View>
        {rollup.length === 0 ? (
          <Text style={S.empty}>No reservations in this period.</Text>
        ) : rollup.map((p) => (
          <View key={p.propertyName} style={S.tr} wrap={false}>
            <Text style={[S.cell, { width: WA[0] }, S.left]}>{p.propertyName}</Text>
            <Text style={[S.cell, { width: WA[1] }, S.center]}>{p.checkIns}</Text>
            <Text style={[S.cell, { width: WA[2] }, S.center]}>{p.nights}</Text>
            <Text style={[p.grossEur == null ? S.cellMuted : S.cell, { width: WA[3] }, S.center]}>{money(p.grossEur)}</Text>
            {p.netOwnerPayoutEur == null
              ? <View style={{ width: WA[4] }}><Review sm /></View>
              : <Text style={[S.cell, { width: WA[4] }, S.center]}>{fmt(p.netOwnerPayoutEur)}</Text>}
          </View>
        ))}

        {/* Reservation Details */}
        <Text style={S.section}>Reservation Details</Text>
        <View style={S.th}>
          {['Check-in', 'Check-out', 'Nights', 'Property', 'Channel', 'Guest', 'Gross', 'Net'].map((hd, i) => (
            <Text key={hd} style={[S.thT, { width: WR[i] }, i === 3 || i === 4 || i === 5 ? S.left : S.center]}>{hd}</Text>
          ))}
        </View>
        {details.length === 0 ? (
          <Text style={S.empty}>No reservations in this period.</Text>
        ) : details.map((r) => (
          <View key={r.reservationId} style={S.tr} wrap={false}>
            <Text style={[S.cell, { width: WR[0] }, S.center]}>{r.checkIn}</Text>
            <Text style={[S.cell, { width: WR[1] }, S.center]}>{r.checkOut}</Text>
            <Text style={[S.cell, { width: WR[2] }, S.center]}>{r.nights}</Text>
            <Text style={[S.cell, { width: WR[3] }, S.left]}>{r.propertyName}</Text>
            <Text style={[S.cell, { width: WR[4] }, S.left]}>{r.channel}</Text>
            <Text style={[S.cell, { width: WR[5] }, S.left]}>{r.guestName ?? '—'}</Text>
            <Text style={[r.grossValue == null ? S.cellMuted : S.cell, { width: WR[6] }, S.center]}>{money(r.grossValue)}</Text>
            {r.needsReview || r.netValue == null
              ? <View style={{ width: WR[7] }}><Review sm /></View>
              : <Text style={[S.cell, { width: WR[7] }, S.center]}>{fmt(r.netValue)}</Text>}
          </View>
        ))}

        {(() => {
          const extras = data.months.flatMap(m => m.expensesExtras)
          if (extras.length === 0) return null
          return (
            <>
              <Text style={S.section}>Expenses & Extras</Text>
              <View style={S.th}>
                <Text style={[S.thT, { width: '24%' }]}>Name</Text>
                <Text style={[S.thT, { width: '12%' }]}>Date</Text>
                <Text style={[S.thT, { width: '20%' }]}>Category</Text>
                <Text style={[S.thT, { width: '20%' }]}>Listing</Text>
                <Text style={[S.thT, { width: '12%' }]}></Text>
                <Text style={[S.thT, { width: '12%' }, S.center]}>Amount</Text>
              </View>
              {extras.map((e, i) => (
                <View key={i} style={S.tr} wrap={false}>
                  <Text style={[S.cell, { width: '24%' }]}>{e.name}</Text>
                  <Text style={[S.cell, { width: '12%' }]}>{e.date}</Text>
                  <Text style={[S.cell, { width: '20%' }]}>{e.subcategory}</Text>
                  <Text style={[S.cell, { width: '20%' }]}>{e.propertyName}</Text>
                  <Text style={[S.cellMuted, { width: '12%' }]}>—</Text>
                  <Text style={[S.cell, { width: '12%' }, S.center]}>{fmtSigned(e.amountEur)}</Text>
                </View>
              ))}
              <View style={S.totalRow}>
                <Text style={[S.totalT, { width: '88%' }]}>Total Expenses & Extras</Text>
                <Text style={[S.totalT, { width: '12%' }, S.center]}>{fmtSigned(o.expensesExtrasTotalEur)}</Text>
              </View>
            </>
          )
        })()}

        {(() => {
          const payments = data.months.flatMap(m => m.ownerPayments)
          if (payments.length === 0) return null
          return (
            <>
              <Text style={S.section}>Payments received</Text>
              <View style={S.th}>
                <Text style={[S.thT, { width: '24%' }]}>Name</Text>
                <Text style={[S.thT, { width: '12%' }]}>Date</Text>
                <Text style={[S.thT, { width: '20%' }]}>Category</Text>
                <Text style={[S.thT, { width: '20%' }]}>Listing</Text>
                <Text style={[S.thT, { width: '12%' }]}></Text>
                <Text style={[S.thT, { width: '12%' }, S.center]}>Amount</Text>
              </View>
              {payments.map((e, i) => (
                <View key={i} style={S.tr} wrap={false}>
                  <Text style={[S.cell, { width: '24%' }]}>{e.name}</Text>
                  <Text style={[S.cell, { width: '12%' }]}>{e.date}</Text>
                  <Text style={[S.cell, { width: '20%' }]}>{e.subcategory}</Text>
                  <Text style={[S.cell, { width: '20%' }]}>{e.propertyName}</Text>
                  <Text style={[S.cellMuted, { width: '12%' }]}>—</Text>
                  <Text style={[S.cell, { width: '12%' }, S.center]}>{fmtSigned(e.amountEur)}</Text>
                </View>
              ))}
              <View style={S.totalRow}>
                <Text style={[S.totalT, { width: '88%' }]}>Total payments received</Text>
                <Text style={[S.totalT, { width: '12%' }, S.center]}>{fmtSigned(o.ownerPaymentsTotalEur)}</Text>
              </View>
            </>
          )
        })()}

        {/* Friendly overview */}
        <View style={S.overviewBox}>
          <Text style={S.overviewHead}>How this statement is calculated</Text>
          <Text style={S.overviewT}>Each month is your single-month Owner Statement: rental figures come from the booking platform, a 20% management fee applies to the net rental after platform fees, and Net Owner Payout is what remains after platform fees, cleaning, management fee and taxes.</Text>
          <Text style={S.overviewT}>Reservations are attributed to a month by their check-in date, and the same rule drives the Nights and Check-ins shown. Overall totals are the sum of the months.</Text>
          <Text style={S.overviewT}>{'Any amount we cannot yet confirm is marked "Needs Review" — it is never assumed to be zero.'}</Text>
        </View>
        <Text style={S.note}>{data.provenanceNote}</Text>
      </Page>
    </Document>
  )
}
