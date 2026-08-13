/**
 * OwnerStrStatementPdf — printable STR Owner Statement (react-pdf). Owner-facing.
 *
 * PRESENTATION ONLY. Consumes the composed OwnerStrStatement DTO and renders it.
 * There are NO calculations, predicates, filters, or amount decisions in this file — every number,
 * total, and Needs-Review state is taken verbatim from the DTO produced by the statement composer.
 * Changing this file changes how the statement LOOKS, never what it MEANS.
 *
 * Design language (professional owner statement, not a system report):
 *   - Heebo font (Hebrew + Latin) so supplier/description text in either script renders correctly.
 *   - Clean header band, three metric cards, readable activity table, prominent closing summary.
 *   - Unknown values are shown as a muted em dash (fields) or a single "Needs Review" badge
 *     (Net Owner Payout / Statement Total) — NEVER as EUR 0, and never repeated across a whole row.
 *   - Reconciliation / internal accounting is intentionally NOT shown to the owner.
 */
import React from 'react'
import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer'
import { fmt, fmtSigned } from './formatters'
import type { OwnerStrStatement } from '@/lib/report/str/ownerStrStatement'

// Heebo (Hebrew + Latin, SIL OFL) — same proven registration used by OwnerSettlementPdf. Renders
// server-side (react-pdf fetches the TTF over HTTPS at render time). Fixes broken glyphs for Hebrew
// supplier/description rows that Helvetica cannot draw.
Font.register({
  family: 'Heebo',
  fonts: [
    { src: 'https://fonts.gstatic.com/s/heebo/v28/NGSpv5_NC0k9P_v6ZUCbLRAHxK1EiSycckOnz02SXQ.ttf' },
    { src: 'https://fonts.gstatic.com/s/heebo/v28/NGSpv5_NC0k9P_v6ZUCbLRAHxK1EbiucckOnz02SXQ.ttf', fontWeight: 'bold' },
  ],
})

const C = {
  navy: '#1e3a5f',
  text: '#1e293b',
  gray: '#64748b',
  grayMid: '#94a3b8',
  line: '#e2e8f0',
  lineSoft: '#f1f5f9',
  head: '#f8fafc',
  amber: '#92400e',
  amberBg: '#fef3c7',
  amberBorder: '#fcd34d',
  summaryBg: '#f8fafc',
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

  metricsWrap: { flexDirection: 'row', gap: 10 },
  metric: { flex: 1, borderWidth: 1, borderColor: C.line, borderRadius: 6, paddingVertical: 12, paddingHorizontal: 12, backgroundColor: C.head },
  metricLabel: { fontSize: 7, color: C.gray, textTransform: 'uppercase', letterSpacing: 0.4 },
  metricValue: { fontSize: 15, fontWeight: 'bold', color: C.navy, marginTop: 6 },

  th: { flexDirection: 'row', backgroundColor: C.head, paddingVertical: 5, paddingHorizontal: 2, borderTopWidth: 1, borderBottomWidth: 1, borderColor: C.line },
  thT: { fontSize: 6.5, fontWeight: 'bold', color: C.gray, textTransform: 'uppercase', letterSpacing: 0.3 },
  tr: { flexDirection: 'row', paddingVertical: 4, paddingHorizontal: 2, borderBottomWidth: 1, borderColor: C.lineSoft },
  cell: { fontSize: 7.5, color: C.text },
  cellMuted: { fontSize: 7.5, color: C.grayMid },
  right: { textAlign: 'right' },
  empty: { fontSize: 8, color: C.gray, paddingVertical: 8 },

  totalRow: { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 2, borderTopWidth: 1.5, borderColor: C.navy },
  totalT: { fontSize: 8, fontWeight: 'bold', color: C.navy },

  badgeWrap: { flexDirection: 'row' },
  badge: { backgroundColor: C.amberBg, borderWidth: 0.75, borderColor: C.amberBorder, borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1.5 },
  badgeText: { fontSize: 6, fontWeight: 'bold', color: C.amber, letterSpacing: 0.2 },
  badgeSm: { backgroundColor: C.amberBg, borderWidth: 0.75, borderColor: C.amberBorder, borderRadius: 7, paddingHorizontal: 3, paddingVertical: 1 },
  badgeSmText: { fontSize: 5.5, fontWeight: 'bold', color: C.amber },

  summary: { marginTop: 20, alignSelf: 'flex-end', width: '54%', borderWidth: 1, borderColor: C.line, borderRadius: 6, backgroundColor: C.summaryBg, paddingHorizontal: 16, paddingVertical: 14 },
  sumRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  sumLabel: { fontSize: 9, color: C.gray },
  sumValue: { fontSize: 10, color: C.text },
  sumDivider: { borderTopWidth: 1.5, borderColor: C.navy, marginTop: 8, paddingTop: 10 },
  sumTotalLabel: { fontSize: 11, fontWeight: 'bold', color: C.navy, textTransform: 'uppercase', letterSpacing: 0.4 },
  sumTotalValue: { fontSize: 17, fontWeight: 'bold', color: C.navy },

  overviewBox: { marginTop: 22, paddingTop: 12, borderTopWidth: 1, borderColor: C.line },
  overviewHead: { fontSize: 8, fontWeight: 'bold', color: C.navy, marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.5 },
  overviewT: { fontSize: 7.5, color: C.gray, lineHeight: 1.6, marginBottom: 2 },
  note: { fontSize: 6.5, color: C.grayMid, marginTop: 12, lineHeight: 1.4 },
})

/*
 * INTERNAL / AUDIT — full derivation (kept out of the owner-facing PDF, item 6):
 *   Gross, Platform Fees, Cleaning, Taxes  = Hostaway reservation evidence (source of truth).
 *   Platform Fees = Airbnb host fee, or Booking channel commission (channel-aware).
 *   Management Fee = 20% x (Total Payout - Cleaning - Taxes)  -- JJ report policy, not a bank charge.
 *   Net Owner Payout = Total Payout - Cleaning - Management Fee - Taxes.
 *   Expenses & Extras = JJ authoritative ledger; Cleaning & Management Fee are excluded there because
 *     they are already deducted in the per-reservation chain (prevents double-counting).
 *   Statement Total = Net Owner Payout + sum(Expenses & Extras).
 *   Unknown values are never coerced to zero -- they surface as Needs Review.
 */

// Activity columns: Check-in | Check-out | Guest | Listing | Channel | Gross | Platform | Cleaning | Mgmt | Taxes | Net
const W = ['8%', '8%', '13%', '13%', '7%', '9%', '9%', '8%', '8%', '7%', '12%'] as const

const money = (v: number | null) => (v == null ? '—' : fmt(v))

/** Single amber "Needs Review" indicator. `sm` variant fits inside the narrow Net Payout column. */
function ReviewBadge({ sm = false, label = 'Needs Review' }: { sm?: boolean; label?: string }) {
  return (
    <View style={S.badgeWrap}>
      <View style={sm ? S.badgeSm : S.badge}>
        <Text style={sm ? S.badgeSmText : S.badgeText}>{sm ? 'Review' : label}</Text>
      </View>
    </View>
  )
}

export function OwnerStrStatementPdf({ data }: { data: OwnerStrStatement }) {
  const t = data.totals
  const m = data.metrics
  const h = data.header
  const period = h.periodLabel || `${h.periodStart} – ${h.periodEnd}`

  return (
    <Document>
      <Page size="A4" style={S.page} wrap>
        {/* 1 -- HEADER */}
        <View style={S.header}>
          <View>
            <Text style={S.company}>{h.company}</Text>
            <Text style={S.tagline}>Property Management · Owner Statement</Text>
            <Text style={S.contact}>Archiepiskopou Kyprianou, 4{'\n'}jjproperty10@gmail.com</Text>
          </View>
          <View style={S.headerRight}>
            <Text style={S.metaLabel}>Owner</Text>
            <Text style={S.metaValueLg}>{h.ownerName}</Text>
            <Text style={S.metaLabel}>Property</Text>
            <Text style={S.metaValue}>{h.properties.join(', ') || '—'}</Text>
            <Text style={S.metaLabel}>Statement Period</Text>
            <Text style={S.metaValue}>{period}</Text>
            <Text style={S.metaLabel}>Issued</Text>
            <Text style={S.metaValue}>{h.issuedDate}</Text>
          </View>
        </View>

        {/* 2 -- METRICS */}
        <View style={S.metricsWrap}>
          <View style={S.metric}>
            <Text style={S.metricLabel}>Gross Rental Revenue</Text>
            <Text style={S.metricValue}>{fmt(m.grossEur)}</Text>
          </View>
          <View style={S.metric}>
            <Text style={S.metricLabel}>Net Owner Payout</Text>
            {m.netOwnerPayoutEur == null
              ? <View style={{ marginTop: 6 }}><ReviewBadge /></View>
              : <Text style={S.metricValue}>{fmt(m.netOwnerPayoutEur)}</Text>}
          </View>
          <View style={S.metric}>
            <Text style={S.metricLabel}>Property Management Revenue</Text>
            {m.propertyManagementRevenueEur == null
              ? <View style={{ marginTop: 6 }}><ReviewBadge /></View>
              : <Text style={S.metricValue}>{fmt(m.propertyManagementRevenueEur)}</Text>}
          </View>
        </View>

        {/* 3 -- RENTAL ACTIVITY */}
        <Text style={S.section}>Rental Activity</Text>
        <View style={S.th}>
          {['Check-in', 'Check-out', 'Guest', 'Listing', 'Channel', 'Gross', 'Platform', 'Cleaning', 'Mgmt Fee', 'Taxes', 'Net Payout'].map((hd, i) => (
            <Text key={hd} style={[S.thT, { width: W[i] }, i >= 5 ? S.right : {}]}>{hd}</Text>
          ))}
        </View>
        {data.activity.length === 0 ? (
          <Text style={S.empty}>No reservations in this period.</Text>
        ) : data.activity.map((r) => {
          const mgmt = r.line.managementFee.value
          const tax = r.line.taxes.value
          const net = r.line.netOwnerPayout.value
          return (
            <View key={r.reservationId} style={S.tr} wrap={false}>
              <Text style={[S.cell, { width: W[0] }]}>{r.checkIn}</Text>
              <Text style={[S.cell, { width: W[1] }]}>{r.checkOut}</Text>
              <Text style={[S.cell, { width: W[2] }]}>{r.guestName ?? '—'}</Text>
              <Text style={[S.cell, { width: W[3] }]}>{r.propertyName}</Text>
              <Text style={[S.cell, { width: W[4] }]}>{r.channel}</Text>
              <Text style={[S.cell, { width: W[5] }, S.right]}>{money(r.line.gross.value)}</Text>
              <Text style={[S.cell, { width: W[6] }, S.right]}>{money(r.line.platformFees.value)}</Text>
              <Text style={[S.cell, { width: W[7] }, S.right]}>{money(r.line.cleaning.value)}</Text>
              {/* Unknown Mgmt/Tax -> muted em dash (never EUR 0, never a repeated badge). */}
              <Text style={[mgmt == null ? S.cellMuted : S.cell, { width: W[8] }, S.right]}>{money(mgmt)}</Text>
              <Text style={[tax == null ? S.cellMuted : S.cell, { width: W[9] }, S.right]}>{money(tax)}</Text>
              {/* The single unresolved indicator for the row lives here, in Net Payout. */}
              {net == null
                ? <View style={[{ width: W[10], alignItems: 'flex-end' }]}><ReviewBadge sm /></View>
                : <Text style={[S.cell, { width: W[10] }, S.right]}>{fmt(net)}</Text>}
            </View>
          )
        })}
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
            <Text style={[t.managementFeeEur == null ? S.cellMuted : S.totalT, { width: W[8] }, S.right]}>{money(t.managementFeeEur)}</Text>
            <Text style={[t.taxesEur == null ? S.cellMuted : S.totalT, { width: W[9] }, S.right]}>{money(t.taxesEur)}</Text>
            {t.netOwnerPayoutEur == null
              ? <View style={[{ width: W[10], alignItems: 'flex-end' }]}><ReviewBadge sm /></View>
              : <Text style={[S.totalT, { width: W[10] }, S.right]}>{fmt(t.netOwnerPayoutEur)}</Text>}
          </View>
        )}

        {/* 4 -- EXPENSES & EXTRAS */}
        {data.expensesExtras.length > 0 && (
          <>
            <Text style={S.section}>Expenses & Extras</Text>
            <View style={S.th}>
              <Text style={[S.thT, { width: '24%' }]}>Name</Text>
              <Text style={[S.thT, { width: '12%' }]}>Date</Text>
              <Text style={[S.thT, { width: '20%' }]}>Category</Text>
              <Text style={[S.thT, { width: '20%' }]}>Listing</Text>
              <Text style={[S.thT, { width: '12%' }]}>Reservation</Text>
              <Text style={[S.thT, { width: '12%' }, S.right]}>Amount</Text>
            </View>
            {data.expensesExtras.map((e, i) => (
              <View key={i} style={S.tr} wrap={false}>
                <Text style={[S.cell, { width: '24%' }]}>{e.name}</Text>
                <Text style={[S.cell, { width: '12%' }]}>{e.date}</Text>
                <Text style={[S.cell, { width: '20%' }]}>{e.subcategory}</Text>
                <Text style={[S.cell, { width: '20%' }]}>{e.propertyName}</Text>
                {/* Reservation reference only when the ledger row genuinely carries one; em dash otherwise. */}
                <Text style={[e.reservationId ? S.cell : S.cellMuted, { width: '12%' }]}>{e.reservationId ?? '—'}</Text>
                <Text style={[S.cell, { width: '12%' }, S.right]}>{fmtSigned(e.amountEur)}</Text>
              </View>
            ))}
            <View style={S.totalRow}>
              <Text style={[S.totalT, { width: '88%' }]}>Total Expenses & Extras</Text>
              <Text style={[S.totalT, { width: '12%' }, S.right]}>{fmtSigned(data.expensesExtrasTotalEur)}</Text>
            </View>
          </>
        )}

        {/* 5 -- CLOSING STATEMENT SUMMARY (most prominent block on the page) */}
        <View style={S.summary}>
          <View style={S.sumRow}>
            <Text style={S.sumLabel}>Owner Payout</Text>
            {m.netOwnerPayoutEur == null ? <ReviewBadge /> : <Text style={S.sumValue}>{fmt(m.netOwnerPayoutEur)}</Text>}
          </View>
          <View style={S.sumRow}>
            <Text style={S.sumLabel}>Expenses & Extras</Text>
            <Text style={S.sumValue}>{fmtSigned(data.expensesExtrasTotalEur)}</Text>
          </View>
          <View style={[S.sumRow, S.sumDivider]}>
            <Text style={S.sumTotalLabel}>Statement Total</Text>
            {data.statementTotalEur == null ? <ReviewBadge /> : <Text style={S.sumTotalValue}>{fmt(data.statementTotalEur)}</Text>}
          </View>
        </View>

        {/* 6 -- FRIENDLY OVERVIEW (owner-facing; full technical derivation kept in the comment above) */}
        <View style={S.overviewBox}>
          <Text style={S.overviewHead}>How this statement is calculated</Text>
          <Text style={S.overviewT}>Rental figures -- gross, platform fees, cleaning and taxes -- come directly from the booking platform.</Text>
          <Text style={S.overviewT}>A management fee of 20% applies to the net rental after platform fees; your Net Owner Payout is what remains after platform fees, cleaning, management fee and taxes.</Text>
          <Text style={S.overviewT}>Expenses & Extras are billed separately from JJ's records and are shown apart from the rental figures.</Text>
          <Text style={S.overviewT}>Any amount we cannot yet confirm is marked "Needs Review" -- it is never assumed to be zero.</Text>
        </View>
        <Text style={S.note}>{data.provenanceNote}</Text>
      </Page>
    </Document>
  )
}
