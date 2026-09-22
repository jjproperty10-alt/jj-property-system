/**
 * Certified owner statement PDF — cover, one property bridge per property, cross-check.
 * Renders a composed statement DTO only. Does not infer competing ledger balances.
 */

import React from 'react'
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import { fmt, fmtSigned } from './formatters'
import { rtlRowDirection, rtlSentence, rtlTextStyle } from './rtlHelpers'
import { CertifiedCoverPage, DirectionLine, JjLeadsDirectionLine } from './CertifiedSettlementPdf'
import type {
  CertifiedBridgeComponent,
  CertifiedOwnerStatement,
  CertifiedPropertyBridgePage,
  CertifiedStrMonthRow,
} from '../finance/certifiedPropertyBridge'
import { propertyBalanceDirection } from '../finance/certifiedPropertyBridge'
import {
  ownerReportDisplayName,
  t,
  tFill,
  type Lang,
} from '../report/labels'
import {
  fifoCreditDisplayAmount,
} from '../finance/certifiedClientSettlementPresentation'

const C = {
  navy: '#1e3a5f',
  grayBorder: '#e2e8f0',
  grayText: '#64748b',
  grayDark: '#1e293b',
  white: '#ffffff',
}

const s = StyleSheet.create({
  page: {
    paddingHorizontal: 40,
    paddingTop: 24,
    paddingBottom: 42,
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
  company: { fontSize: 14, fontWeight: 'bold', color: C.navy },
  title: { fontSize: 11, fontWeight: 'bold', color: C.navy, marginTop: 3 },
  meta: { fontSize: 8, color: C.grayDark, marginTop: 2 },
  system: { fontSize: 7, color: C.grayText, marginTop: 1 },
  hero: {
    backgroundColor: '#7f1d1d',
    borderRadius: 5,
    padding: 10,
    marginBottom: 8,
  },
  heroClient: { backgroundColor: '#14532d' },
  heroKicker: { fontSize: 7, color: 'rgba(255,255,255,0.75)' },
  heroAmount: { fontSize: 16, fontWeight: 'bold', color: '#fca5a5', marginTop: 3 },
  heroAmountClient: { color: '#86efac' },
  section: { fontSize: 8, fontWeight: 'bold', color: C.navy, marginTop: 6, marginBottom: 4 },
  row: { flexDirection: 'row', paddingVertical: 2, alignItems: 'center' },
  line: { borderBottomWidth: 0.4, borderBottomColor: C.grayBorder },
  formulaRow: { flexDirection: 'row', paddingVertical: 1.5, alignItems: 'center' },
  muted: { fontSize: 7, color: C.grayText, marginTop: 2, lineHeight: 1.3 },
  tableHead: { fontSize: 6.5, fontWeight: 'bold', color: C.navy },
  footer: {
    position: 'absolute',
    bottom: 16,
    left: 40,
    right: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: C.grayBorder,
    paddingTop: 3,
  },
  footerText: { fontSize: 6.5, color: C.grayText },
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

function dashOr(n: number | null): string {
  return n == null ? '—' : fmt(n)
}

function sourceLabel(status: CertifiedBridgeComponent['sourceStatus'], lang: Lang): string {
  return status === 'approved_adjustment' ? t('certSourceApproved', lang) : t('certSourceVerified', lang)
}

const BRIDGE_CATEGORY_ORDER: readonly CertifiedBridgeComponent['category'][] = [
  'purchase',
  'renovation',
  'setup',
  'recurring',
  'repairs',
  'rental',
  'str',
  'owner_payment',
  'adjustment',
]

function categoryLabel(category: CertifiedBridgeComponent['category'], lang: Lang): string {
  switch (category) {
    case 'purchase':
      return t('certCatPurchase', lang)
    case 'renovation':
      return t('certCatRenovation', lang)
    case 'setup':
      return t('certCatSetup', lang)
    case 'recurring':
      return t('certCatRecurring', lang)
    case 'repairs':
      return t('certCatRepairs', lang)
    case 'rental':
      return t('certCatRental', lang)
    case 'str':
      return t('certCatStr', lang)
    case 'owner_payment':
      return t('certCatOwnerPayment', lang)
    case 'adjustment':
      return t('certCatAdjustment', lang)
  }
}

function groupedComponents(components: readonly CertifiedBridgeComponent[]) {
  return BRIDGE_CATEGORY_ORDER
    .map((category) => ({
      category,
      rows: components.filter((row) => row.category === category),
    }))
    .filter((group) => group.rows.length > 0)
}

function ownerNameForReport(ownerName: string | undefined, lang: Lang): string {
  return ownerReportDisplayName(ownerName?.trim() || t('certDefaultOwner', lang), lang)
}

function Money({
  label,
  amount,
  lang,
  total = false,
}: {
  label: string
  amount: string
  lang: Lang
  total?: boolean
}) {
  return (
    <View style={[s.row, s.line, rtlRowDirection(lang)]}>
      <Text style={[{ width: '68%', fontSize: total ? 8 : 7.5, fontWeight: total ? 'bold' : 'normal', color: total ? C.navy : C.grayDark }, rtlTextStyle(lang)]}>
        {label}
      </Text>
      <Text style={{ width: '32%', fontSize: total ? 8 : 7.5, fontWeight: total ? 'bold' : 'normal', color: total ? C.navy : C.grayDark }}>
        {amount}
      </Text>
    </View>
  )
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

function formulaLabel(step: { op: string; labelEn: string; labelHe: string }, lang: Lang): string {
  const name = lang === 'he' ? step.labelHe : step.labelEn
  if (step.op === 'add') return `+ ${name}`
  if (step.op === 'subtract') return `− ${name}`
  if (step.op === 'equals') return `= ${name}`
  return name
}

function PropertyBridgePage({
  page,
  lang,
  owner,
  cutoff,
}: {
  page: CertifiedPropertyBridgePage
  lang: Lang
  owner: string
  cutoff: string
}) {
  const direction = propertyBalanceDirection(page.certifiedBalanceDueToJj)
  const displayName = lang === 'he' ? page.displayNameHe : page.propertyName
  const heroStyle = direction === 'jj_owes_client' ? s.heroClient : s.hero
  const amountStyle = direction === 'jj_owes_client' ? [s.heroAmount, s.heroAmountClient] : s.heroAmount
  const dirColor = direction === 'jj_owes_client' ? '#86efac' : '#fecaca'
  const colW = ['40%', '20%', '20%', '20%']

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
        <Text style={[s.heroKicker, rtlTextStyle(lang)]}>{t('certPropertyBalance', lang)}</Text>
        <Text style={amountStyle}>{fmt(Math.abs(page.certifiedBalanceDueToJj))}</Text>
        {lang !== 'he' ? (
          <Text style={[{ fontSize: 8, color: dirColor, marginTop: 3, fontWeight: 'bold' }]}>
            {direction === 'jj_owes_client'
              ? tFill('certJjOwesOwner', lang, { owner })
              : direction === 'settled'
                ? t('balSettled', lang)
                : tFill('certOwnerOwesJj', lang, { owner })}
          </Text>
        ) : direction === 'settled' ? (
          <Text style={[{ fontSize: 8, color: dirColor, marginTop: 3, fontWeight: 'bold' }, rtlTextStyle(lang)]}>
            {t('balSettled', lang)}
          </Text>
        ) : direction === 'jj_owes_client' ? (
          <JjLeadsDirectionLine lang={lang} color={dirColor} fontSize={8} hebrew={`חייב ל${owner}`} />
        ) : (
          <DirectionLine lang={lang} color={dirColor} prefix={`${owner} חייב ל`} />
        )}
      </View>

      <Text style={[s.section, rtlTextStyle(lang)]}>{t('certFormulaTitle', lang)}</Text>
      {page.formula.map((step, index) => (
        <View key={`f-${index}`} style={[s.formulaRow, rtlRowDirection(lang)]}>
          <Text style={[{ width: '70%', fontSize: 7.5 }, rtlTextStyle(lang)]}>{formulaLabel(step, lang)}</Text>
          <Text style={{ width: '30%', fontSize: 7.5 }}>{fmt(step.amount)}</Text>
        </View>
      ))}

      <Text style={[s.section, rtlTextStyle(lang)]}>{t('certBridgeTitle', lang)}</Text>
      <View style={[s.row, s.line, rtlRowDirection(lang)]}>
        <Text style={[{ width: colW[0] }, s.tableHead, rtlTextStyle(lang)]}>{t('certBridgeComponent', lang)}</Text>
        <Text style={[{ width: colW[1] }, s.tableHead]}>{t('certBridgeCharges', lang)}</Text>
        <Text style={[{ width: colW[2] }, s.tableHead]}>{t('certBridgeCredits', lang)}</Text>
        <Text style={[{ width: colW[3] }, s.tableHead]}>{t('certBridgeEffect', lang)}</Text>
      </View>
      {groupedComponents(page.components).map((group) => (
        <View key={group.category}>
          <Text style={[{ fontSize: 7, fontWeight: 'bold', color: C.navy, marginTop: 3, marginBottom: 1 }, rtlTextStyle(lang)]}>
            {categoryLabel(group.category, lang)}
          </Text>
          {group.rows.map((row, index) => (
            <View key={`${group.category}-${index}`} wrap={false}>
              <View style={[s.row, s.line, rtlRowDirection(lang)]}>
                <View style={{ width: colW[0] }}>
                  <Text style={[{ fontSize: 7 }, rtlTextStyle(lang)]}>{lang === 'he' ? row.labelHe : row.labelEn}</Text>
                  <Text style={[{ fontSize: 6, color: C.grayText }, rtlTextStyle(lang)]}>{sourceLabel(row.sourceStatus, lang)}</Text>
                </View>
                <Text style={{ width: colW[1], fontSize: 7 }}>{row.chargesDueToJj ? fmt(row.chargesDueToJj) : '—'}</Text>
                <Text style={{ width: colW[2], fontSize: 7 }}>{row.creditsDueToClient ? fmt(row.creditsDueToClient) : '—'}</Text>
                <Text style={{ width: colW[3], fontSize: 7 }}>{fmtSigned(row.effectDueToJj)}</Text>
              </View>
              {row.detailHe || row.detailEn ? (
                <Text style={[s.muted, { width: '100%' }, rtlTextStyle(lang)]}>
                  {rtlSentence(lang === 'he' ? (row.detailHe ?? '') : (row.detailEn ?? ''), lang)}
                </Text>
              ) : null}
            </View>
          ))}
        </View>
      ))}
      <Money
        lang={lang}
        total
        label={t('certPropertyBalance', lang)}
        amount={fmtSigned(page.certifiedBalanceDueToJj)}
      />

      {page.strMonths.length > 0 ? <StrTable rows={page.strMonths} lang={lang} /> : null}

      {(lang === 'he' ? page.notesHe : page.notesEn).map((note, index) => (
        <Text key={`n-${index}`} style={[s.muted, rtlTextStyle(lang)]}>{rtlSentence(note, lang)}</Text>
      ))}

      <Footer owner={owner} cutoff={cutoff} lang={lang} />
    </Page>
  )
}

function StrTable({ rows, lang }: { rows: readonly CertifiedStrMonthRow[]; lang: Lang }) {
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
  return (
    <View style={{ marginTop: 8 }}>
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
          <Text style={{ width: w, fontSize: 6.5 }}>{dashOr(row.gross)}</Text>
          <Text style={{ width: w, fontSize: 6.5 }}>{dashOr(row.platformFees)}</Text>
          <Text style={{ width: w, fontSize: 6.5 }}>{dashOr(row.cleaning)}</Text>
          <Text style={{ width: w, fontSize: 6.5 }}>{dashOr(row.tax)}</Text>
          <Text style={{ width: w, fontSize: 6.5 }}>{dashOr(row.management)}</Text>
          <Text style={{ width: w, fontSize: 6.5 }}>{fmt(row.ownerNet)}</Text>
        </View>
      ))}
    </View>
  )
}

function CrossCheckPage({
  statement,
  lang,
  owner,
  cutoff,
}: {
  statement: CertifiedOwnerStatement
  lang: Lang
  owner: string
  cutoff: string
}) {
  const { certified } = statement
  return (
    <Page size="A4" style={s.page}>
      <View style={s.header}>
        <Text style={[s.company, rtlTextStyle(lang)]}>JJ Property 10</Text>
        <Text style={[s.title, rtlTextStyle(lang)]}>{t('certCrossCheckTitle', lang)}</Text>
        <Text style={[s.meta, rtlTextStyle(lang)]}>{owner}</Text>
      </View>
      {statement.properties.map((page) => (
        <Money
          key={page.propertyKey}
          lang={lang}
          label={lang === 'he' ? page.displayNameHe : page.propertyName}
          amount={fmtSigned(page.certifiedBalanceDueToJj)}
        />
      ))}
      <Money lang={lang} total label={t('certOpeningTotal', lang)} amount={fmt(certified.openingDueToJj)} />
      {certified.fifoCredits.map((credit, index) => (
        <Money
          key={`fifo-${index}`}
          lang={lang}
          label={`${credit.cash ? t('certLessCash', lang) : t('certLessSharon', lang)} · ${fmtCutoffDot(credit.effectiveDate)}`}
          amount={fmtSigned(fifoCreditDisplayAmount(credit))}
        />
      ))}
      <Money lang={lang} total label={t('certClosingShort', lang)} amount={fmt(Math.abs(certified.closingDueToJj))} />
      {lang === 'he' ? (
        <DirectionLine lang={lang} color="#7f1d1d" prefix={`${owner} חייב ל`} />
      ) : (
        <Text style={{ fontSize: 8, fontWeight: 'bold', color: '#7f1d1d', marginTop: 6 }}>
          {tFill('certOwnerOwesJj', lang, { owner })}
        </Text>
      )}
      {certified.exclusions.map((exclusion, index) => (
        <View key={`ex-${index}`} style={{ marginTop: 10 }} wrap={false}>
          <Money lang={lang} label={t('certExclusionDoubleCount', lang)} amount={fmt(exclusion.settlementAmount)} />
          <Text style={[s.muted, rtlTextStyle(lang)]}>{rtlSentence(t('certExclusionNote', lang), lang)}</Text>
          <Text style={[s.muted, rtlTextStyle(lang)]}>{rtlSentence(t('certExclusionEffectZero', lang), lang)}</Text>
        </View>
      ))}
      <Footer owner={owner} cutoff={cutoff} lang={lang} />
    </Page>
  )
}

export function CertifiedOwnerStatementPdf({
  statement,
  lang,
  ownerName,
}: {
  statement: CertifiedOwnerStatement
  lang: Lang
  ownerName?: string
}) {
  const owner = ownerNameForReport(ownerName, lang)
  const cutoff = fmtCutoffDot(statement.certified.asOf)
  return (
    <Document
      title={`JJ ${t('certSectionTitle', lang)} — ${owner}`}
      author="JJ Property 10"
      creator="JJ Property 10"
    >
      <CertifiedCoverPage dto={statement.certified} lang={lang} ownerName={ownerName} />
      {statement.properties.map((page) => (
        <PropertyBridgePage
          key={page.propertyKey}
          page={page}
          lang={lang}
          owner={owner}
          cutoff={cutoff}
        />
      ))}
      <CrossCheckPage statement={statement} lang={lang} owner={owner} cutoff={cutoff} />
    </Document>
  )
}
