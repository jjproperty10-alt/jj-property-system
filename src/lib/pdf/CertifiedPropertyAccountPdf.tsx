/**
 * Owner property-account statement PDF.
 * Executive page, one account page per property, final control.
 * Renders a composed statement DTO only.
 */

import React from 'react'
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import { fmt, fmtSigned } from './formatters'
import { rtlRowDirection, rtlSentence, rtlTextStyle } from './rtlHelpers'
import { DirectionLine, JjLeadsDirectionLine } from './CertifiedSettlementPdf'
import type { CertifiedStrMonthRow } from '../finance/certifiedPropertyBridge'
import {
  propertyAccountDirection,
  type CertifiedPropertyAccountPage,
  type CertifiedPropertyAccountStatement,
  type ContractLayer,
  type ContractLayerStatus,
  type OperatingAccountRow,
  type PropertyOverallState,
} from '../finance/certifiedPropertyAccount'
import {
  ownerReportDisplayName,
  t,
  tFill,
  type Lang,
} from '../report/labels'
import { fifoCreditDisplayAmount } from '../finance/certifiedClientSettlementPresentation'

const C = {
  navy: '#1e3a5f',
  grayBorder: '#e2e8f0',
  grayText: '#64748b',
  grayDark: '#1e293b',
  white: '#ffffff',
  green: '#15803d',
  red: '#b91c1c',
  greenBg: '#f0fdf4',
  redBg: '#fef2f2',
  greenBorder: '#86efac',
  redBorder: '#fca5a5',
  navyBg: '#eff6ff',
}

const s = StyleSheet.create({
  page: {
    paddingHorizontal: 36,
    paddingTop: 22,
    paddingBottom: 40,
    fontFamily: 'Heebo',
    backgroundColor: C.white,
    color: C.grayDark,
    fontSize: 8,
  },
  header: {
    marginBottom: 8,
    paddingBottom: 6,
    borderBottomWidth: 2,
    borderBottomColor: C.navy,
  },
  company: { fontSize: 13, fontWeight: 'bold', color: C.navy },
  title: { fontSize: 11, fontWeight: 'bold', color: C.navy, marginTop: 3 },
  meta: { fontSize: 8, color: C.grayDark, marginTop: 2 },
  system: { fontSize: 7, color: C.grayText, marginTop: 1 },
  section: { fontSize: 8, fontWeight: 'bold', color: C.navy, marginTop: 7, marginBottom: 3 },
  row: { flexDirection: 'row', paddingVertical: 2, alignItems: 'center' },
  line: { borderBottomWidth: 0.4, borderBottomColor: C.grayBorder },
  muted: { fontSize: 7, color: C.grayText, marginTop: 2, lineHeight: 1.35 },
  tableHead: { fontSize: 6.5, fontWeight: 'bold', color: C.navy },
  hero: {
    backgroundColor: '#7f1d1d',
    borderRadius: 5,
    padding: 9,
    marginBottom: 6,
  },
  heroClient: { backgroundColor: '#14532d' },
  heroKicker: { fontSize: 7, color: 'rgba(255,255,255,0.8)' },
  heroAmount: { fontSize: 16, fontWeight: 'bold', color: '#fca5a5', marginTop: 2 },
  heroAmountClient: { color: '#86efac' },
  badge: {
    marginTop: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
    backgroundColor: '#fff7ed',
  },
  badgeText: { fontSize: 7, fontWeight: 'bold', color: '#9a3412' },
  footer: {
    position: 'absolute',
    bottom: 14,
    left: 36,
    right: 36,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: C.grayBorder,
    paddingTop: 3,
  },
  footerText: { fontSize: 6.5, color: C.grayText },
  explain: {
    marginTop: 6,
    padding: 7,
    backgroundColor: '#f8fafc',
    borderRadius: 4,
    borderWidth: 0.6,
    borderColor: C.grayBorder,
  },
})

function fmtCutoffDot(iso: string): string {
  const day = iso.slice(0, 10)
  const [y, m, d] = day.split('-')
  if (!y || !m || !d) return iso
  return `${d}.${m}.${y}`
}

function fmtMonth(month: string): string {
  if (month.length === 7) return `${month.slice(5, 7)}.${month.slice(0, 4)}`
  return month
}

function ownerNameForReport(ownerName: string | undefined, lang: Lang): string {
  return ownerReportDisplayName(ownerName?.trim() || t('certDefaultOwner', lang), lang)
}

function amountColor(dueToJj: number): string {
  if (Math.abs(dueToJj) < 0.005) return C.grayDark
  return dueToJj > 0 ? C.red : C.green
}

function overallLabel(state: PropertyOverallState, lang: Lang): string {
  if (state === 'closed') return t('stmtStateClosed', lang)
  if (state === 'partially_closed') return t('stmtStatePartial', lang)
  return t('stmtStateOpen', lang)
}

function layerStatusLabel(status: ContractLayerStatus, lang: Lang): string {
  if (status === 'closed') return t('stmtLayerClosed', lang)
  if (status === 'partially_paid') return t('stmtLayerPartial', lang)
  return t('stmtLayerOpen', lang)
}

function layerName(layer: ContractLayer['layer'], lang: Lang): string {
  if (layer === 'purchase') return t('stmtLayerPurchase', lang)
  if (layer === 'sale') return t('stmtLayerSale', lang)
  return t('stmtLayerRenovation', lang)
}

function operatingCategoryLabel(row: OperatingAccountRow, lang: Lang): string {
  switch (row.category) {
    case 'setup':
      return t('stmtOpSetup', lang)
    case 'recurring':
      return t('stmtOpRecurring', lang)
    case 'repairs':
      return t('stmtOpRepairs', lang)
    case 'ltr':
      return t('stmtOpLtr', lang)
    case 'str':
      return t('stmtOpStr', lang)
  }
}

function Footer({
  owner,
  cutoff,
  lang,
}: {
  owner: string
  cutoff: string
  lang: Lang
}) {
  return (
    <View style={s.footer} fixed>
      <Text style={s.footerText}>JJ Property 10 · {owner} · {cutoff} · {t('confidential', lang)}</Text>
      <Text
        style={s.footerText}
        render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
      />
    </View>
  )
}

function MoneyRow({
  label,
  amount,
  lang,
  total = false,
  dueToJj,
}: {
  label: string
  amount: string
  lang: Lang
  total?: boolean
  dueToJj?: number
}) {
  const color = dueToJj == null ? (total ? C.navy : C.grayDark) : amountColor(dueToJj)
  return (
    <View style={[s.row, s.line, rtlRowDirection(lang)]}>
      <Text style={[{ width: '68%', fontSize: total ? 8 : 7.5, fontWeight: total ? 'bold' : 'normal', color: total ? C.navy : C.grayDark }, rtlTextStyle(lang)]}>
        {label}
      </Text>
      <Text style={{ width: '32%', fontSize: total ? 8 : 7.5, fontWeight: total ? 'bold' : 'normal', color }}>
        {amount}
      </Text>
    </View>
  )
}

function DirectionBlock({
  lang,
  owner,
  dueToJj,
  color,
}: {
  lang: Lang
  owner: string
  dueToJj: number
  color: string
}) {
  const direction = propertyAccountDirection(dueToJj)
  if (lang !== 'he') {
    return (
      <Text style={{ fontSize: 8, color, marginTop: 3, fontWeight: 'bold' }}>
        {direction === 'jj_owes_client'
          ? tFill('certJjOwesOwner', lang, { owner })
          : direction === 'settled'
            ? t('balSettled', lang)
            : tFill('certOwnerOwesJj', lang, { owner })}
      </Text>
    )
  }
  if (direction === 'settled') {
    return (
      <Text style={[{ fontSize: 8, color, marginTop: 3, fontWeight: 'bold' }, rtlTextStyle(lang)]}>
        {t('balSettled', lang)}
      </Text>
    )
  }
  if (direction === 'jj_owes_client') {
    return <JjLeadsDirectionLine lang={lang} color={color} fontSize={8} hebrew={`חייב ל${owner}`} />
  }
  return <DirectionLine lang={lang} color={color} prefix={`${owner} חייב ל`} />
}

function ExecutivePage({
  statement,
  lang,
  owner,
  cutoff,
}: {
  statement: CertifiedPropertyAccountStatement
  lang: Lang
  owner: string
  cutoff: string
}) {
  const { certified } = statement
  const dueToJj = certified.closingDueToJj
  const heroClient = dueToJj < 0
  return (
    <Page size="A4" style={s.page}>
      <View style={s.header}>
        <Text style={[s.company, rtlTextStyle(lang)]}>JJ Property 10</Text>
        <Text style={[s.title, rtlTextStyle(lang)]}>{t('stmtCoverTitle', lang)}</Text>
        <Text style={[s.meta, rtlTextStyle(lang)]}>{owner}</Text>
        <Text style={[s.meta, rtlTextStyle(lang)]}>{t('certCutoffLabel', lang)} {cutoff}</Text>
        <Text style={[s.muted, rtlTextStyle(lang)]}>{rtlSentence(t('certCombinedNote', lang), lang)}</Text>
      </View>

      <View style={[s.hero, heroClient ? s.heroClient : {}]} wrap={false}>
        <Text style={[s.heroKicker, rtlTextStyle(lang)]}>{t('stmtExecTitle', lang)}</Text>
        <Text style={[s.heroAmount, heroClient ? s.heroAmountClient : {}]}>{fmt(Math.abs(dueToJj))}</Text>
        <DirectionBlock lang={lang} owner={owner} dueToJj={dueToJj} color={heroClient ? '#86efac' : '#fecaca'} />
      </View>

      <Text style={[s.section, rtlTextStyle(lang)]}>{t('stmtExecTitle', lang)}</Text>
      <MoneyRow
        lang={lang}
        label={t('stmtOpenProperties', lang)}
        amount={fmt(certified.openingDueToJj)}
        dueToJj={certified.openingDueToJj}
      />
      {certified.fifoCredits.map((credit, index) => (
        <MoneyRow
          key={`credit-${index}`}
          lang={lang}
          label={credit.cash ? t('stmtGeneralCash', lang) : t('stmtSharonCredit', lang)}
          amount={fmtSigned(fifoCreditDisplayAmount(credit))}
          dueToJj={fifoCreditDisplayAmount(credit)}
        />
      ))}
      <MoneyRow
        lang={lang}
        total
        label={t('stmtFinalPayableJj', lang)}
        amount={fmt(Math.abs(certified.closingDueToJj))}
        dueToJj={certified.closingDueToJj}
      />

      {certified.exclusions.map((exclusion, index) => (
        <View key={`ex-${index}`} style={{ marginTop: 8 }} wrap={false}>
          <MoneyRow lang={lang} label={t('certExclusionDoubleCount', lang)} amount={fmt(exclusion.settlementAmount)} />
          <Text style={[s.muted, rtlTextStyle(lang)]}>{rtlSentence(t('certExclusionNote', lang), lang)}</Text>
          <Text style={[s.muted, rtlTextStyle(lang)]}>{rtlSentence(t('certExclusionEffectZero', lang), lang)}</Text>
        </View>
      ))}

      <Text style={[s.section, rtlTextStyle(lang)]}>{t('stmtPropertyList', lang)}</Text>
      {statement.properties.map((page) => (
        <MoneyRow
          key={page.propertyKey}
          lang={lang}
          label={lang === 'he' ? page.displayNameHe : page.propertyName}
          amount={fmtSigned(page.closingDueToJj)}
          dueToJj={page.closingDueToJj}
        />
      ))}

      <Footer owner={owner} cutoff={cutoff} lang={lang} />
    </Page>
  )
}

function ContractTable({
  contracts,
  lang,
}: {
  contracts: readonly ContractLayer[]
  lang: Lang
}) {
  const w = ['28%', '24%', '24%', '24%']
  return (
    <View>
      <Text style={[s.section, rtlTextStyle(lang)]}>{t('stmtContractsTitle', lang)}</Text>
      <View style={[s.row, s.line, rtlRowDirection(lang)]}>
        <Text style={[{ width: w[0] }, s.tableHead, rtlTextStyle(lang)]}>{t('stmtLayer', lang)}</Text>
        <Text style={[{ width: w[1] }, s.tableHead]}>{t('stmtAgreed', lang)}</Text>
        <Text style={[{ width: w[2] }, s.tableHead]}>{t('stmtPaidCredited', lang)}</Text>
        <Text style={[{ width: w[3] }, s.tableHead]}>{t('stmtRemaining', lang)}</Text>
      </View>
      {contracts.map((layer) => (
        <View key={layer.layer} wrap={false}>
          <View style={[s.row, s.line, rtlRowDirection(lang)]}>
            <View style={{ width: w[0] }}>
              <Text style={[{ fontSize: 7.5 }, rtlTextStyle(lang)]}>{layerName(layer.layer, lang)}</Text>
              <Text style={[{ fontSize: 6.5, fontWeight: 'bold', color: C.navy }, rtlTextStyle(lang)]}>
                {layerStatusLabel(layer.status, lang)}
              </Text>
            </View>
            <Text style={{ width: w[1], fontSize: 7.5 }}>{fmt(layer.agreedAmount)}</Text>
            <Text style={{ width: w[2], fontSize: 7.5 }}>{fmt(layer.paidCredited)}</Text>
            <Text style={{ width: w[3], fontSize: 7.5, color: amountColor(layer.remainingDueToJj) }}>
              {fmt(layer.remainingDueToJj)}
            </Text>
          </View>
          {lang === 'he' && layer.noteHe ? (
            <Text style={[s.muted, rtlTextStyle(lang)]}>{rtlSentence(layer.noteHe, lang)}</Text>
          ) : null}
          {lang !== 'he' && layer.noteEn ? (
            <Text style={s.muted}>{layer.noteEn}</Text>
          ) : null}
        </View>
      ))}
    </View>
  )
}

function OperatingTable({
  rows,
  lang,
}: {
  rows: readonly OperatingAccountRow[]
  lang: Lang
}) {
  const w = ['28%', '24%', '24%', '24%']
  return (
    <View>
      <Text style={[s.section, rtlTextStyle(lang)]}>{t('stmtOperatingTitle', lang)}</Text>
      <View style={[s.row, s.line, rtlRowDirection(lang)]}>
        <Text style={[{ width: w[0] }, s.tableHead, rtlTextStyle(lang)]}>{t('stmtOpCategory', lang)}</Text>
        <Text style={[{ width: w[1] }, s.tableHead]}>{t('stmtOpCharges', lang)}</Text>
        <Text style={[{ width: w[2] }, s.tableHead]}>{t('stmtOpCredits', lang)}</Text>
        <Text style={[{ width: w[3] }, s.tableHead]}>{t('stmtOpNet', lang)}</Text>
      </View>
      {rows.map((row, index) => (
        <View key={`${row.category}-${index}`} style={[s.row, s.line, rtlRowDirection(lang)]} wrap={false}>
          <View style={{ width: w[0] }}>
            <Text style={[{ fontSize: 7.5 }, rtlTextStyle(lang)]}>{operatingCategoryLabel(row, lang)}</Text>
            <Text style={[{ fontSize: 6.5, color: C.grayText }, rtlTextStyle(lang)]}>
              {lang === 'he' ? row.labelHe : row.labelEn}
            </Text>
          </View>
          <Text style={{ width: w[1], fontSize: 7.5 }}>{row.chargesToOwner ? fmt(row.chargesToOwner) : '—'}</Text>
          <Text style={{ width: w[2], fontSize: 7.5, color: row.ownerCredits ? C.green : C.grayDark }}>
            {row.ownerCredits ? fmt(row.ownerCredits) : '—'}
          </Text>
          <Text style={{ width: w[3], fontSize: 7.5, color: amountColor(row.netEffectDueToJj) }}>
            {fmtSigned(row.netEffectDueToJj)}
          </Text>
        </View>
      ))}
    </View>
  )
}

function StrOwnerNetTable({ rows, lang }: { rows: readonly CertifiedStrMonthRow[]; lang: Lang }) {
  const detail = rows.some((row) =>
    row.bookings != null || row.nights != null || row.gross != null
      || row.platformFees != null || row.cleaning != null || row.tax != null || row.management != null,
  )
  if (!detail) {
    return (
      <View style={{ marginTop: 6 }}>
        <Text style={[s.section, rtlTextStyle(lang)]}>{t('certStrTitle', lang)}</Text>
        <View style={[s.row, s.line, rtlRowDirection(lang)]}>
          <Text style={[{ width: '50%' }, s.tableHead, rtlTextStyle(lang)]}>{t('certStrMonth', lang)}</Text>
          <Text style={[{ width: '50%' }, s.tableHead]}>{t('certStrOwnerNet', lang)}</Text>
        </View>
        {rows.map((row) => (
          <View key={row.month} style={[s.row, s.line, rtlRowDirection(lang)]} wrap={false}>
            <Text style={{ width: '50%', fontSize: 7.5 }}>{fmtMonth(row.month)}</Text>
            <Text style={{ width: '50%', fontSize: 7.5, color: C.green }}>{fmt(row.ownerNet)}</Text>
          </View>
        ))}
      </View>
    )
  }
  const heads = [
    t('certStrMonth', lang),
    t('certStrBookings', lang),
    t('certStrNights', lang),
    t('certStrGross', lang),
    t('certStrPlatform', lang),
    t('certStrCleaning', lang),
    t('certStrTax', lang),
    t('certStrMgmt', lang),
    t('certStrOwnerNet', lang),
  ]
  const w = '11.11%'
  const dash = (n: number | null) => (n == null ? '—' : fmt(n))
  return (
    <View style={{ marginTop: 6 }}>
      <Text style={[s.section, rtlTextStyle(lang)]}>{t('certStrTitle', lang)}</Text>
      <View style={[s.row, s.line, rtlRowDirection(lang)]}>
        {heads.map((h) => (
          <Text key={h} style={[{ width: w }, s.tableHead, rtlTextStyle(lang)]}>{h}</Text>
        ))}
      </View>
      {rows.map((row) => (
        <View key={row.month} style={[s.row, s.line, rtlRowDirection(lang)]} wrap={false}>
          <Text style={{ width: w, fontSize: 6.5 }}>{fmtMonth(row.month)}</Text>
          <Text style={{ width: w, fontSize: 6.5 }}>{row.bookings == null ? '—' : String(row.bookings)}</Text>
          <Text style={{ width: w, fontSize: 6.5 }}>{row.nights == null ? '—' : String(row.nights)}</Text>
          <Text style={{ width: w, fontSize: 6.5 }}>{dash(row.gross)}</Text>
          <Text style={{ width: w, fontSize: 6.5 }}>{dash(row.platformFees)}</Text>
          <Text style={{ width: w, fontSize: 6.5 }}>{dash(row.cleaning)}</Text>
          <Text style={{ width: w, fontSize: 6.5 }}>{dash(row.tax)}</Text>
          <Text style={{ width: w, fontSize: 6.5 }}>{dash(row.management)}</Text>
          <Text style={{ width: w, fontSize: 6.5, color: C.green }}>{fmt(row.ownerNet)}</Text>
        </View>
      ))}
    </View>
  )
}

function PropertyAccountPage({
  page,
  lang,
  owner,
  cutoff,
}: {
  page: CertifiedPropertyAccountPage
  lang: Lang
  owner: string
  cutoff: string
}) {
  const direction = propertyAccountDirection(page.closingDueToJj)
  const displayName = lang === 'he' ? page.displayNameHe : page.propertyName
  const heroStyle = direction === 'jj_owes_client' ? [s.hero, s.heroClient] : s.hero
  const amountStyle = direction === 'jj_owes_client' ? [s.heroAmount, s.heroAmountClient] : s.heroAmount
  const dirColor = direction === 'jj_owes_client' ? '#86efac' : '#fecaca'
  return (
    <Page size="A4" style={s.page}>
      <View style={s.header}>
        <Text style={[s.company, rtlTextStyle(lang)]}>JJ Property 10</Text>
        <Text style={[s.title, rtlTextStyle(lang)]}>{displayName}</Text>
        {lang === 'he' && page.displayNameHe !== page.propertyName ? (
          <Text style={[s.system, rtlTextStyle(lang)]}>{t('certSystemName', lang)}: {page.propertyName}</Text>
        ) : null}
        <Text style={[s.meta, rtlTextStyle(lang)]}>{t('certCutoffLabel', lang)} {cutoff}</Text>
      </View>

      <View style={heroStyle} wrap={false}>
        <Text style={[s.heroKicker, rtlTextStyle(lang)]}>{t('stmtStatusCard', lang)}</Text>
        <Text style={amountStyle}>{fmt(Math.abs(page.closingDueToJj))}</Text>
        <DirectionBlock lang={lang} owner={owner} dueToJj={page.closingDueToJj} color={dirColor} />
        <View style={s.badge}>
          <Text style={[s.badgeText, rtlTextStyle(lang)]}>{overallLabel(page.overallState, lang)}</Text>
        </View>
      </View>

      {page.contracts.length > 0 ? <ContractTable contracts={page.contracts} lang={lang} /> : null}
      {page.operating.length > 0 ? <OperatingTable rows={page.operating} lang={lang} /> : null}

      <Text style={[s.section, rtlTextStyle(lang)]}>{t('stmtClosingBridge', lang)}</Text>
      {page.closingBridge.map((line, index) => {
        const name = lang === 'he' ? line.labelHe : line.labelEn
        const prefix = line.op === 'add' ? '+ ' : line.op === 'subtract' ? '− ' : line.op === 'equals' ? '= ' : ''
        const signed = line.op === 'subtract' ? -line.amountDueToJj : line.amountDueToJj
        const shown = line.op === 'equals' ? line.amountDueToJj : signed
        return (
          <View key={`b-${index}`} style={[s.row, s.line, rtlRowDirection(lang)]}>
            <Text style={[{ width: '68%', fontSize: line.op === 'equals' ? 8 : 7.5, fontWeight: line.op === 'equals' ? 'bold' : 'normal' }, rtlTextStyle(lang)]}>
              {`${prefix}${name}`}
            </Text>
            <Text style={{ width: '32%', fontSize: line.op === 'equals' ? 8 : 7.5, fontWeight: line.op === 'equals' ? 'bold' : 'normal', color: amountColor(shown) }}>
              {line.op === 'start' && shown >= 0 ? fmt(shown) : fmtSigned(shown)}
            </Text>
          </View>
        )
      })}

      {page.strMonths.length > 0 ? <StrOwnerNetTable rows={page.strMonths} lang={lang} /> : null}

      <View style={s.explain} wrap={false}>
        <Text style={[s.section, { marginTop: 0 }, rtlTextStyle(lang)]}>{t('stmtExplainTitle', lang)}</Text>
        <Text style={[{ fontSize: 7.5, lineHeight: 1.4 }, rtlTextStyle(lang)]}>
          {rtlSentence(lang === 'he' ? page.explanationHe : page.explanationEn, lang)}
        </Text>
      </View>

      <Footer owner={owner} cutoff={cutoff} lang={lang} />
    </Page>
  )
}

function ControlPage({
  statement,
  lang,
  owner,
  cutoff,
}: {
  statement: CertifiedPropertyAccountStatement
  lang: Lang
  owner: string
  cutoff: string
}) {
  const { certified } = statement
  return (
    <Page size="A4" style={s.page}>
      <View style={s.header}>
        <Text style={[s.company, rtlTextStyle(lang)]}>JJ Property 10</Text>
        <Text style={[s.title, rtlTextStyle(lang)]}>{t('stmtControlTitle', lang)}</Text>
        <Text style={[s.meta, rtlTextStyle(lang)]}>{owner}</Text>
      </View>
      {statement.properties.map((page) => (
        <MoneyRow
          key={page.propertyKey}
          lang={lang}
          label={lang === 'he' ? page.displayNameHe : page.propertyName}
          amount={fmtSigned(page.closingDueToJj)}
          dueToJj={page.closingDueToJj}
        />
      ))}
      <MoneyRow
        lang={lang}
        total
        label={t('stmtOpenProperties', lang)}
        amount={fmt(certified.openingDueToJj)}
        dueToJj={certified.openingDueToJj}
      />
      {certified.fifoCredits.map((credit, index) => (
        <MoneyRow
          key={`c-${index}`}
          lang={lang}
          label={credit.cash ? t('stmtGeneralCash', lang) : t('stmtSharonCredit', lang)}
          amount={fmtSigned(fifoCreditDisplayAmount(credit))}
          dueToJj={fifoCreditDisplayAmount(credit)}
        />
      ))}
      <MoneyRow
        lang={lang}
        total
        label={t('stmtFinalPayableJj', lang)}
        amount={fmt(Math.abs(certified.closingDueToJj))}
        dueToJj={certified.closingDueToJj}
      />
      <DirectionBlock lang={lang} owner={owner} dueToJj={certified.closingDueToJj} color="#7f1d1d" />
      {certified.exclusions.map((exclusion, index) => (
        <View key={`ex-${index}`} style={{ marginTop: 10 }} wrap={false}>
          <MoneyRow lang={lang} label={t('certExclusionDoubleCount', lang)} amount={fmt(exclusion.settlementAmount)} />
          <Text style={[s.muted, rtlTextStyle(lang)]}>{rtlSentence(t('certExclusionNote', lang), lang)}</Text>
          <Text style={[s.muted, rtlTextStyle(lang)]}>{rtlSentence(t('certExclusionEffectZero', lang), lang)}</Text>
        </View>
      ))}
      <Footer owner={owner} cutoff={cutoff} lang={lang} />
    </Page>
  )
}

export function CertifiedPropertyAccountPdf({
  statement,
  lang,
  ownerName,
}: {
  statement: CertifiedPropertyAccountStatement
  lang: Lang
  ownerName?: string
}) {
  const owner = ownerNameForReport(ownerName, lang)
  const cutoff = fmtCutoffDot(statement.certified.asOf)
  return (
    <Document
      title={`JJ ${t('stmtCoverTitle', lang)} — ${owner}`}
      author="JJ Property 10"
      creator="JJ Property 10"
    >
      <ExecutivePage statement={statement} lang={lang} owner={owner} cutoff={cutoff} />
      {statement.properties.map((page) => (
        <PropertyAccountPage
          key={page.propertyKey}
          page={page}
          lang={lang}
          owner={owner}
          cutoff={cutoff}
        />
      ))}
      <ControlPage statement={statement} lang={lang} owner={owner} cutoff={cutoff} />
    </Document>
  )
}
