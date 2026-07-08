/**
 * JJ Property 10 — Owner Settlement Report (V2)
 * Client-facing PDF. Professional financial statement layout.
 * Font: Heebo (Hebrew + Latin, SIL OFL licence)
 * Place at: src/lib/pdf/OwnerSettlementPdf.tsx
 */
'use client'
import React from 'react'
import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer'
import { fmt } from './formatters'
import type { OwnerPdfData, PdfSection, BalanceDirection } from './types'

Font.register({
  family: 'Heebo',
  fonts: [
    { src: 'https://fonts.gstatic.com/s/heebo/v28/NGSpv5_NC0k9P_v6ZUCbLRAHxK1EiSycckOnz02SXQ.ttf' },
    { src: 'https://fonts.gstatic.com/s/heebo/v28/NGSpv5_NC0k9P_v6ZUCbLRAHxK1EbiucckOnz02SXQ.ttf', fontWeight: 'bold' },
  ],
})

const C = {
  navy: '#1e3a5f', green: '#15803d', greenBg: '#f0fdf4', greenBorder: '#86efac',
  red: '#b91c1c', redBg: '#fef2f2', redBorder: '#fca5a5',
  grayBg: '#f8fafc', grayBorder: '#e2e8f0', grayLine: '#f1f5f9',
  grayText: '#64748b', grayMid: '#94a3b8', grayDark: '#1e293b', white: '#ffffff',
}

const s = StyleSheet.create({
  page: { paddingHorizontal: 48, paddingTop: 40, paddingBottom: 60, fontFamily: 'Heebo', backgroundColor: C.white, color: C.grayDark, fontSize: 9 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, paddingBottom: 14, borderBottomWidth: 2, borderBottomColor: C.navy },
  companyName: { fontSize: 18, fontWeight: 'bold', color: C.navy, letterSpacing: 0.5 },
  reportTitle: { fontSize: 9, color: C.grayText, marginTop: 3, letterSpacing: 0.3 },
  headerRight: { alignItems: 'flex-end' },
  headerDate: { fontSize: 8, color: C.grayText, marginBottom: 2 },
  headerLabel: { fontSize: 8, fontWeight: 'bold', color: C.navy, letterSpacing: 0.5 },
  metaBlock: { marginBottom: 18, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: C.grayBorder },
  metaRow: { flexDirection: 'row', marginBottom: 3 },
  metaLabel: { fontSize: 8, fontWeight: 'bold', color: C.grayText, width: 72, textTransform: 'uppercase', letterSpacing: 0.3 },
  metaValue: { fontSize: 9, color: C.grayDark, flex: 1, lineHeight: 1.4 },
  heroGreen: { backgroundColor: C.greenBg, borderWidth: 1, borderColor: C.greenBorder, borderRadius: 6, padding: 20, alignItems: 'center', marginBottom: 16 },
  heroRed:   { backgroundColor: C.redBg,   borderWidth: 1, borderColor: C.redBorder,   borderRadius: 6, padding: 20, alignItems: 'center', marginBottom: 16 },
  heroGray:  { backgroundColor: C.grayBg,  borderWidth: 1, borderColor: C.grayBorder,  borderRadius: 6, padding: 20, alignItems: 'center', marginBottom: 16 },
  heroLabel: { fontSize: 9, fontWeight: 'bold', color: C.grayText, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8 },
  heroAmtGreen: { fontSize: 34, fontWeight: 'bold', color: C.green, marginBottom: 4 },
  heroAmtRed:   { fontSize: 34, fontWeight: 'bold', color: C.red,   marginBottom: 4 },
  heroAmtGray:  { fontSize: 34, fontWeight: 'bold', color: C.grayText, marginBottom: 4 },
  heroSub: { fontSize: 8, color: C.grayText },
  execBlock: { marginBottom: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: C.grayBorder },
  execRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: C.grayLine },
  execRowFinal: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, marginTop: 2, borderTopWidth: 1.5, borderTopColor: C.navy },
  execLabel: { fontSize: 9, color: C.grayDark, flex: 1 },
  execLabelBold: { fontSize: 9, fontWeight: 'bold', color: C.grayDark, flex: 1 },
  execAmt: { fontSize: 9, textAlign: 'right', width: 100 },
  execAmtBold: { fontSize: 9, fontWeight: 'bold', textAlign: 'right', width: 100 },
  execGreen: { color: C.green }, execRed: { color: C.red }, execNavy: { color: C.navy },
  groupHeader: { marginTop: 22, marginBottom: 10, paddingBottom: 6, borderBottomWidth: 1.5, borderBottomColor: C.navy },
  groupTitle: { fontSize: 10, fontWeight: 'bold', color: C.navy, letterSpacing: 0.8, textTransform: 'uppercase' },
  subLabel: { fontSize: 8, fontWeight: 'bold', color: C.grayText, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 12, marginBottom: 4 },
  tableHeader: { flexDirection: 'row', backgroundColor: C.grayBg, paddingVertical: 4, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: C.grayBorder },
  tableRow: { flexDirection: 'row', paddingVertical: 4, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: C.grayLine },
  tableRowAlt: { backgroundColor: '#fafafa' },
  tableTotRow: { flexDirection: 'row', paddingVertical: 4, paddingHorizontal: 6, borderTopWidth: 1, borderTopColor: C.grayBorder, backgroundColor: C.grayBg },
  th: { fontSize: 7.5, fontWeight: 'bold', color: C.grayText, textTransform: 'uppercase', letterSpacing: 0.3 },
  td: { fontSize: 8, color: C.grayDark }, tdMuted: { fontSize: 8, color: C.grayText },
  tdBold: { fontSize: 8, fontWeight: 'bold', color: C.grayDark },
  tdSub: { fontSize: 7, color: C.grayMid, marginTop: 1 },
  cDate: { width: 58 }, cDesc: { flex: 1 }, cAmt: { width: 78, textAlign: 'right' },
  finalWrapper: { marginTop: 28 },
  finalBorder1: { borderTopWidth: 3, borderTopColor: C.navy, marginBottom: 2 },
  finalBorder2: { borderTopWidth: 1, borderTopColor: C.navy, marginBottom: 16 },
  finalTitle: { fontSize: 13, fontWeight: 'bold', color: C.navy, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 14 },
  fsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  fsRowIndent: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2, paddingLeft: 18 },
  fsLabel: { fontSize: 9, color: C.grayDark, flex: 1 },
  fsLabelBold: { fontSize: 9, fontWeight: 'bold', color: C.grayDark, flex: 1 },
  fsLabelIndent: { fontSize: 8, color: C.grayText, flex: 1 },
  fsAmt: { fontSize: 9, textAlign: 'right', width: 100 },
  fsAmtBold: { fontSize: 9, fontWeight: 'bold', textAlign: 'right', width: 100 },
  fsAmtIndent: { fontSize: 8, color: C.grayText, textAlign: 'right', width: 100 },
  fsGreen: { color: C.green }, fsRed: { color: C.red },
  fsSubDivider: { borderTopWidth: 1, borderTopColor: C.grayBorder, marginVertical: 7 },
  fsDoubleLine1: { borderTopWidth: 2, borderTopColor: C.navy, marginTop: 10, marginBottom: 2 },
  fsDoubleLine2: { borderTopWidth: 1, borderTopColor: C.navy, marginBottom: 10 },
  fsFinalLabel: { fontSize: 11, fontWeight: 'bold', color: C.navy, flex: 1, letterSpacing: 0.5 },
  fsFinalGreen: { fontSize: 11, fontWeight: 'bold', color: C.green, textAlign: 'right', width: 100 },
  fsFinalRed:   { fontSize: 11, fontWeight: 'bold', color: C.red,   textAlign: 'right', width: 100 },
  fsFinalGray:  { fontSize: 11, fontWeight: 'bold', color: C.grayText, textAlign: 'right', width: 100 },
  footer: { position: 'absolute', bottom: 20, left: 48, right: 48, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: C.grayBorder, paddingTop: 5 },
  footerText: { fontSize: 7, color: C.grayText },
  footerPage: { fontSize: 7, color: C.grayText },
})

function fmtDate(iso: string): string {
  try { return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) }
  catch { return iso }
}
function heroStyle(dir: BalanceDirection) {
  return dir === 'owed_to_owner' ? s.heroGreen : dir === 'owed_to_jj' ? s.heroRed : s.heroGray
}
function heroAmtStyle(dir: BalanceDirection) {
  return dir === 'owed_to_owner' ? s.heroAmtGreen : dir === 'owed_to_jj' ? s.heroAmtRed : s.heroAmtGray
}
function heroLabelText(dir: BalanceDirection): string {
  return dir === 'owed_to_owner' ? 'Amount Due to You' : dir === 'owed_to_jj' ? 'Amount Due to JJ' : 'No Balance Outstanding'
}
const SECTION_CLIENT_LABELS: Record<string, string> = {
  platform: 'Platform Income & Rent', client_payments: 'Client Payments',
  renovation: 'Renovation Costs', expenses: 'Property Expenses',
  charges_billed: 'Charges & Fees', owner_paid_info: 'Expenses Paid Directly By You',
  settlement: 'Payments Sent to You',
}

function Footer({ contactName, period }: { contactName: string; period: string }) {
  return (
    <View style={s.footer} fixed>
      <Text style={s.footerText}>JJ Property 10 · {contactName} · {period} · Confidential</Text>
      <Text style={s.footerPage} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
    </View>
  )
}
function MetaBlock({ data }: { data: OwnerPdfData }) {
  const period = `${fmtDate(data.fromDate)} – ${fmtDate(data.toDate)}`
  const propText = data.properties.join(' · ')
  return (
    <View style={s.metaBlock}>
      <View style={s.metaRow}><Text style={s.metaLabel}>Owner</Text><Text style={s.metaValue}>{data.contactName}</Text></View>
      <View style={s.metaRow}><Text style={s.metaLabel}>Period</Text><Text style={s.metaValue}>{period}</Text></View>
      <View style={s.metaRow}><Text style={s.metaLabel}>Properties</Text><Text style={s.metaValue}>{propText}</Text></View>
      <View style={s.metaRow}><Text style={s.metaLabel}>Generated</Text><Text style={s.metaValue}>{data.generatedAt}</Text></View>
    </View>
  )
}
function HeroBalance({ data }: { data: OwnerPdfData }) {
  return (
    <View style={heroStyle(data.direction)}>
      <Text style={s.heroLabel}>{heroLabelText(data.direction)}</Text>
      <Text style={heroAmtStyle(data.direction)}>{fmt(Math.abs(data.remainingBalance))}</Text>
      <Text style={s.heroSub}>After all settlements</Text>
    </View>
  )
}
function ExecutiveSummary({ data }: { data: OwnerPdfData }) {
  const totalReceived = data.totalPlatform + data.totalClientPmts
  const totalExpenses = data.totalCharges + data.totalExpenses + data.totalRenovation
  const totalPaidToYou = Math.abs(data.totalBankPayments)
  const balance = data.remainingBalance
  const dir = data.direction
  const balColor = dir === 'owed_to_owner' ? s.execGreen : dir === 'owed_to_jj' ? s.execRed : s.execNavy
  const balLabel = dir === 'owed_to_owner' ? 'Amount Due to You' : dir === 'owed_to_jj' ? 'Amount Due to JJ' : 'No Balance Outstanding'
  return (
    <View style={s.execBlock}>
      <View style={s.execRow}><Text style={s.execLabel}>Total Money Received</Text><Text style={[s.execAmt, s.execGreen]}>+{fmt(totalReceived)}</Text></View>
      <View style={s.execRow}><Text style={s.execLabel}>Total Expenses Paid on Your Behalf</Text><Text style={[s.execAmt, s.execRed]}>-{fmt(totalExpenses)}</Text></View>
      {totalPaidToYou > 0.005 && (<View style={s.execRow}><Text style={s.execLabel}>Total Paid to You</Text><Text style={[s.execAmt, s.execRed]}>-{fmt(totalPaidToYou)}</Text></View>)}
      <View style={s.execRowFinal}><Text style={s.execLabelBold}>{balLabel}</Text><Text style={[s.execAmtBold, balColor]}>{fmt(Math.abs(balance))}</Text></View>
    </View>
  )
}
function TxTable({ section, multiProperty }: { section: PdfSection; multiProperty: boolean }) {
  const label = SECTION_CLIENT_LABELS[section.key] ?? section.title
  const isCredit = section.key === 'platform' || section.key === 'client_payments'
  const total = isCredit ? section.totalCredit : section.totalDebit
  const totColor = isCredit ? s.execGreen : {}
  return (
    <View>
      <Text style={s.subLabel}>{label}</Text>
      <View style={s.tableHeader}>
        <Text style={[s.th, s.cDate]}>Date</Text>
        <Text style={[s.th, s.cDesc]}>Description</Text>
        <Text style={[s.th, s.cAmt]}>Amount</Text>
      </View>
      {section.rows.map((row, i) => {
        const desc = (row.description ?? '').trim() || row.type || '—'
        return (
          <View key={i} style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]} wrap={false}>
            <Text style={[s.tdMuted, s.cDate]}>{fmtDate(row.date)}</Text>
            <View style={s.cDesc}>
              <Text style={s.td}>{desc}</Text>
              {multiProperty && row.property && (<Text style={s.tdSub}>{row.property}</Text>)}
            </View>
            <Text style={[s.cAmt, s.td, isCredit ? { color: C.green } : {}]}>{fmt(row.clientAmount)}</Text>
          </View>
        )
      })}
      <View style={s.tableTotRow}>
        <Text style={[s.tdBold, s.cDate]} />
        <Text style={[s.tdBold, s.cDesc]}>Total</Text>
        <Text style={[s.tdBold, s.cAmt, totColor]}>{fmt(total)}</Text>
      </View>
    </View>
  )
}
function FinalSettlement({ data }: { data: OwnerPdfData }) {
  const totalReceived = data.totalPlatform + data.totalClientPmts
  const totalExpenses = data.totalCharges + data.totalExpenses + data.totalRenovation
  const totalPaidToYou = Math.abs(data.totalBankPayments)
  const remaining = data.remainingBalance
  const dir = data.direction
  const finalAmtStyle = dir === 'owed_to_owner' ? s.fsFinalGreen : dir === 'owed_to_jj' ? s.fsFinalRed : s.fsFinalGray
  const finalLabel = dir === 'owed_to_owner' ? 'AMOUNT DUE TO YOU' : dir === 'owed_to_jj' ? 'AMOUNT DUE TO JJ' : 'NO BALANCE OUTSTANDING'
  const closingColor = data.closingBalance < -0.005 ? s.fsGreen : data.closingBalance > 0.005 ? s.fsRed : {}
  const obLabel = data.openingBalanceAsOf
    ? ('Opening Balance (as of ' + fmtDate(data.openingBalanceAsOf) + ')')
    : 'Opening Balance'
  return (
    <View style={s.finalWrapper} break>
      <View style={s.finalBorder1} /><View style={s.finalBorder2} />
      <Text style={s.finalTitle}>Final Settlement</Text>
      <View style={s.fsRow}><Text style={s.fsLabel}>{obLabel}</Text><Text style={s.fsAmt}>{fmt(Math.abs(data.openingBalance))}</Text></View>
      <View style={s.fsRow}><Text style={s.fsLabelBold}>+ Money Received For You</Text><Text style={[s.fsAmtBold, s.fsGreen]}>+{fmt(totalReceived)}</Text></View>
      {data.totalPlatform > 0.005 && (<View style={s.fsRowIndent}><Text style={s.fsLabelIndent}>Platform Income &amp; Rent</Text><Text style={s.fsAmtIndent}>{fmt(data.totalPlatform)}</Text></View>)}
      {data.totalClientPmts > 0.005 && (<View style={s.fsRowIndent}><Text style={s.fsLabelIndent}>Client Payments</Text><Text style={s.fsAmtIndent}>{fmt(data.totalClientPmts)}</Text></View>)}
      {totalExpenses > 0.005 && (
        <>
          <View style={s.fsRow}><Text style={s.fsLabelBold}>- Money Paid On Your Behalf</Text><Text style={[s.fsAmtBold, s.fsRed]}>-{fmt(totalExpenses)}</Text></View>
          {data.totalRenovation > 0.005 && (<View style={s.fsRowIndent}><Text style={s.fsLabelIndent}>Renovation Costs</Text><Text style={s.fsAmtIndent}>{fmt(data.totalRenovation)}</Text></View>)}
          {data.totalExpenses > 0.005 && (<View style={s.fsRowIndent}><Text style={s.fsLabelIndent}>Property Expenses</Text><Text style={s.fsAmtIndent}>{fmt(data.totalExpenses)}</Text></View>)}
          {data.totalCharges > 0.005 && (<View style={s.fsRowIndent}><Text style={s.fsLabelIndent}>Charges &amp; Fees</Text><Text style={s.fsAmtIndent}>{fmt(data.totalCharges)}</Text></View>)}
        </>
      )}
      <View style={s.fsSubDivider} />
      <View style={s.fsRow}><Text style={s.fsLabelBold}>Sub-total (Before Payments)</Text><Text style={[s.fsAmtBold, closingColor]}>{fmt(Math.abs(data.closingBalance))}</Text></View>
      {totalPaidToYou > 0.005 && (<View style={s.fsRow}><Text style={s.fsLabel}>- Payments Sent to You</Text><Text style={[s.fsAmt, s.fsRed]}>-{fmt(totalPaidToYou)}</Text></View>)}
      <View style={s.fsDoubleLine1} /><View style={s.fsDoubleLine2} />
      <View style={s.fsRow}><Text style={s.fsFinalLabel}>{finalLabel}</Text><Text style={finalAmtStyle}>{fmt(Math.abs(remaining))}</Text></View>
    </View>
  )
}

const RECEIVED_KEYS  = ['platform', 'client_payments']
const PAID_KEYS      = ['renovation', 'expenses', 'charges_billed']
const OWNER_PAID_KEY = 'owner_paid_info'
const SETTLEMENT_KEY = 'settlement'

export function OwnerSettlementPdf({ data }: { data: OwnerPdfData }) {
  const period    = fmtDate(data.fromDate) + ' – ' + fmtDate(data.toDate)
  const multiProp = data.properties.length > 1
  const byKey = Object.fromEntries(data.sections.map(sec => [sec.key, sec]))
  const receivedSections  = RECEIVED_KEYS.filter(k => byKey[k])
  const paidSections      = PAID_KEYS    .filter(k => byKey[k])
  const ownerPaidSection  = byKey[OWNER_PAID_KEY] as PdfSection | undefined
  const settlementSection = byKey[SETTLEMENT_KEY]  as PdfSection | undefined
  return (
    <Document title={data.contactName + ' — Owner Settlement Report'} author="JJ Property 10" creator="JJ Property 10 Platform">
      <Page size="A4" style={s.page}>
        <View style={s.header} fixed>
          <View>
            <Text style={s.companyName}>JJ Property 10</Text>
            <Text style={s.reportTitle}>Owner Settlement Report</Text>
          </View>
          <View style={s.headerRight}>
            <Text style={s.headerDate}>{data.generatedAt}</Text>
            <Text style={s.headerLabel}>Confidential</Text>
          </View>
        </View>
        <MetaBlock data={data} />
        <HeroBalance data={data} />
        <ExecutiveSummary data={data} />
        {receivedSections.length > 0 && (
          <View>
            <View style={s.groupHeader}><Text style={s.groupTitle}>Money Received For You</Text></View>
            {receivedSections.map(k => (<TxTable key={k} section={byKey[k]} multiProperty={multiProp} />))}
          </View>
        )}
        {paidSections.length > 0 && (
          <View>
            <View style={s.groupHeader}><Text style={s.groupTitle}>Money Paid On Your Behalf</Text></View>
            {paidSections.map(k => (<TxTable key={k} section={byKey[k]} multiProperty={multiProp} />))}
          </View>
        )}
        {ownerPaidSection && (
          <View>
            <View style={s.groupHeader}><Text style={s.groupTitle}>Expenses Paid Directly By You</Text></View>
            <TxTable section={ownerPaidSection} multiProperty={multiProp} />
          </View>
        )}
        {settlementSection && (
          <View>
            <View style={s.groupHeader}><Text style={s.groupTitle}>Payments Sent to You</Text></View>
            <TxTable section={settlementSection} multiProperty={multiProp} />
          </View>
        )}
        <FinalSettlement data={data} />
        <Footer contactName={data.contactName} period={period} />
      </Page>
    </Document>
  )
}
