/**
 * Certified settlement cover — presentation only.
 * Renders the live certified DTO. Does not recompute RC3 / cashbox / P&L.
 */

import React from 'react'
import { Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import { fmt, fmtSigned } from './formatters'
import { rtlRowDirection, rtlTextStyle } from './rtlHelpers'
import type { CertifiedClientSettlementAvailable } from '../finance/certifiedClientSettlementTypes'
import {
  fifoCreditDisplayAmount,
  fifoCreditLabelKey,
} from '../finance/certifiedClientSettlementPresentation'
import {
  ownerReportDisplayName,
  t,
  tFill,
  type Lang,
} from '../report/labels'

const C = {
  navy: '#1e3a5f',
  grayBorder: '#e2e8f0',
  grayText: '#64748b',
  grayMid: '#94a3b8',
  grayDark: '#1e293b',
  white: '#ffffff',
}

const s = StyleSheet.create({
  page: {
    paddingHorizontal: 46,
    paddingTop: 28,
    paddingBottom: 44,
    fontFamily: 'Heebo',
    backgroundColor: C.white,
    color: C.grayDark,
    fontSize: 9,
  },
  header: {
    marginBottom: 8,
    paddingBottom: 8,
    borderBottomWidth: 2,
    borderBottomColor: C.navy,
  },
  company: { fontSize: 16, fontWeight: 'bold', color: C.navy },
  coverTitle: { fontSize: 11, fontWeight: 'bold', color: C.navy, marginTop: 4 },
  meta: { fontSize: 9, color: C.grayDark, marginTop: 3 },
  status: { fontSize: 9, fontWeight: 'bold', color: C.navy, marginTop: 4 },
  note: { fontSize: 8, color: C.grayText, marginTop: 4 },
  hero: {
    backgroundColor: '#7f1d1d',
    borderRadius: 6,
    padding: 14,
    marginTop: 12,
    marginBottom: 14,
  },
  heroSettled: { backgroundColor: '#334155' },
  heroClient: { backgroundColor: '#14532d' },
  heroKicker: { fontSize: 8, color: 'rgba(255,255,255,0.7)', marginBottom: 4 },
  heroAmount: { fontSize: 22, fontWeight: 'bold' },
  heroDir: { fontSize: 9, color: '#fca5a5', marginTop: 4, fontWeight: 'bold' },
  sectionTitle: { fontSize: 9, fontWeight: 'bold', color: C.navy, marginBottom: 8, marginTop: 4 },
  row: { flexDirection: 'row', paddingVertical: 3, alignItems: 'center' },
  rowLine: { borderBottomWidth: 0.5, borderBottomColor: C.grayBorder },
  label: { width: '68%', fontSize: 8, color: C.grayDark },
  amount: { width: '32%', fontSize: 8, color: C.grayDark, textAlign: 'left' },
  muted: { color: C.grayText },
  totalRow: {
    flexDirection: 'row',
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: C.navy,
    alignItems: 'center',
  },
  totalLabel: { width: '68%', fontSize: 9, fontWeight: 'bold', color: C.navy },
  totalAmount: { width: '32%', fontSize: 9, fontWeight: 'bold', color: C.navy, textAlign: 'left' },
  method: { fontSize: 7, color: C.grayText, lineHeight: 1.35, marginBottom: 2 },
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
})

function fmtCutoffDot(iso: string): string {
  const day = iso.slice(0, 10)
  const [y, m, d] = day.split('-')
  if (!y || !m || !d) return iso
  return `${d}.${m}.${y}`
}

function fmtPropertyAmount(n: number): string {
  return n < 0 ? fmtSigned(n) : fmt(n)
}

function ownerNameForReport(ownerName: string | undefined, lang: Lang): string {
  return ownerReportDisplayName(ownerName?.trim() || t('certDefaultOwner', lang), lang)
}

function DirectionLine({
  prefix,
  suffix,
  lang,
  color,
}: {
  prefix: string
  suffix?: string
  lang: Lang
  color?: string
}) {
  return (
    <View style={[{ flexDirection: 'row-reverse', flexWrap: 'wrap', justifyContent: 'flex-start', marginTop: 4, alignItems: 'center' }]}>
      <Text style={[{ fontSize: 9, fontWeight: 'bold', color }, rtlTextStyle(lang)]}>{prefix}</Text>
      <Text style={{ fontSize: 9, fontWeight: 'bold', color }}>{'\u00A0JJ\u00A0'}</Text>
      {suffix ? <Text style={[{ fontSize: 9, fontWeight: 'bold', color }, rtlTextStyle(lang)]}>{suffix}</Text> : null}
    </View>
  )
}

function MoneyRow({
  label,
  amount,
  lang,
  muted = false,
  total = false,
}: {
  label: string
  amount: string
  lang: Lang
  muted?: boolean
  total?: boolean
}) {
  return (
    <View style={[total ? s.totalRow : s.row, !total ? s.rowLine : {}, rtlRowDirection(lang)]} wrap={false}>
      <Text style={[total ? s.totalLabel : s.label, muted ? s.muted : {}, rtlTextStyle(lang)]}>{label}</Text>
      <Text style={[total ? s.totalAmount : s.amount, muted ? s.muted : {}]}>{amount}</Text>
    </View>
  )
}

export function certifiedDirectionCopy(
  dto: CertifiedClientSettlementAvailable,
  lang: Lang,
  ownerName?: string,
): { heroPrefix: string; heroSuffix?: string; directionPrefix: string; directionSuffix?: string; totalLabel: string } {
  const owner = ownerNameForReport(ownerName, lang)
  if (dto.closingDirection === 'jj_owes_client') {
    return {
      heroPrefix: lang === 'he' ? 'לתשלום ל-' : 'Payable to ',
      heroSuffix: lang === 'he' ? ` על ידי ${owner}` : ` by ${owner}`,
      directionPrefix: lang === 'he' ? 'JJ owes ' : 'JJ owes ',
      directionSuffix: owner,
      totalLabel: tFill('certPayableToOwnerByJj', lang, { owner }),
    }
  }
  if (dto.closingDirection === 'settled') {
    return {
      heroPrefix: t('balSettled', lang),
      directionPrefix: t('balSettled', lang),
      totalLabel: t('balSettled', lang),
    }
  }
  return {
    heroPrefix: lang === 'he' ? 'לתשלום ל' : 'Payable to ',
    heroSuffix: lang === 'he' ? `על ידי ${owner}` : `by ${owner}`,
    directionPrefix: lang === 'he' ? `${owner} חייב ל` : `${owner} owes `,
    totalLabel: tFill('certPayableToJjByOwner', lang, { owner }),
  }
}

export function CertifiedCoverPage({
  dto,
  lang,
  ownerName,
}: {
  dto: CertifiedClientSettlementAvailable
  lang: Lang
  ownerName?: string
}) {
  const owner = ownerNameForReport(ownerName, lang)
  const copy = certifiedDirectionCopy(dto, lang, ownerName)
  const cutoff = fmtCutoffDot(dto.asOf)
  const heroStyle =
    dto.closingDirection === 'settled' ? s.heroSettled
      : dto.closingDirection === 'jj_owes_client' ? s.heroClient
        : s.hero
  const amountColor =
    dto.closingDirection === 'settled' ? '#ffffff'
      : dto.closingDirection === 'jj_owes_client' ? '#86efac'
        : '#fca5a5'

  return (
    <Page size="A4" style={s.page}>
      <View style={s.header}>
        <Text style={[s.company, rtlTextStyle(lang)]}>JJ Property 10</Text>
        <Text style={[s.coverTitle, rtlTextStyle(lang)]}>{t('certCoverTitle', lang)}</Text>
        <Text style={[s.meta, rtlTextStyle(lang)]}>{owner}</Text>
        <View style={[{ flexDirection: lang === 'he' ? 'row-reverse' : 'row', marginTop: 3, alignItems: 'center' }]}>
          <Text style={[s.meta, rtlTextStyle(lang)]}>{t('certCutoffLabel', lang)}</Text>
          <Text style={s.meta}>{` ${cutoff}`}</Text>
        </View>
        <Text style={[s.status, rtlTextStyle(lang)]}>
          {t('certStatusLabel', lang)}: {t('certSectionTitle', lang)}
        </Text>
        <Text style={[s.note, rtlTextStyle(lang)]}>{t('certCombinedNote', lang)}</Text>
      </View>

      <View style={[heroStyle, { padding: 10, marginTop: 6, marginBottom: 8 }]} wrap={false}>
        <Text style={[s.heroKicker, rtlTextStyle(lang)]}>{t('certSectionTitle', lang)}</Text>
        <Text style={[s.heroAmount, { color: amountColor, marginTop: 4 }]}>{fmt(Math.abs(dto.closingDueToJj))}</Text>
        <DirectionLine lang={lang} color={amountColor} prefix={copy.heroPrefix} suffix={copy.heroSuffix} />
        <DirectionLine lang={lang} color={amountColor} prefix={copy.directionPrefix} suffix={copy.directionSuffix} />
      </View>

      <Text style={[s.sectionTitle, rtlTextStyle(lang)]}>{t('certSectionTitle', lang)}</Text>
      <View wrap={false}>
        <MoneyRow lang={lang} label={t('certOpeningBalance', lang)} amount={fmt(dto.openingDueToJj)} />
        {dto.fifoCredits.map((credit, index) => (
          <MoneyRow
            key={`fifo-${index}-${credit.cash ? 'cash' : 'noncash'}-${credit.effectiveDate}`}
            lang={lang}
            label={`${t(fifoCreditLabelKey(credit), lang)}${!credit.cash ? ` · ${t('certNoncash', lang)}` : ''}`}
            amount={fmtSigned(fifoCreditDisplayAmount(credit))}
          />
        ))}
        <MoneyRow lang={lang} label={t('certFifoCreditsTotal', lang)} amount={fmtSigned(-Math.abs(dto.fifoCreditsTotal))} />
        <MoneyRow lang={lang} total label={t('certClosingShort', lang)} amount={fmt(Math.abs(dto.closingDueToJj))} />
      </View>

      {dto.exclusions.map((exclusion, index) => (
        <View key={`ex-${index}-${exclusion.effectiveDate}`} style={{ marginTop: 10 }} wrap={false}>
          <MoneyRow
            lang={lang}
            muted
            label={t('certExclusionDoubleCount', lang)}
            amount={fmt(exclusion.settlementAmount)}
          />
          <Text style={[s.method, rtlTextStyle(lang)]}>{t('certExclusionNote', lang)}</Text>
          <Text style={[s.method, rtlTextStyle(lang)]}>{t('certExclusionCustodyNote', lang)}</Text>
        </View>
      ))}

      <Text style={[s.sectionTitle, rtlTextStyle(lang), { marginTop: 6 }]}>{t('certPropertyLinesTitle', lang)}</Text>
      {dto.propertyLines.map((line) => (
        <MoneyRow
          key={`line-${line.lineOrder}-${line.propertyName}`}
          lang={lang}
          label={line.propertyName}
          amount={fmtPropertyAmount(line.amountDueToJj)}
        />
      ))}
      <MoneyRow lang={lang} total label={t('certOpeningTotal', lang)} amount={fmt(dto.openingDueToJj)} />

      <View style={{ marginTop: 6 }} wrap={false}>
        <Text style={[s.sectionTitle, rtlTextStyle(lang)]}>{t('certNotesTitle', lang)}</Text>
        <Text style={[s.method, rtlTextStyle(lang)]}>{t('certMethodCash', lang)}</Text>
        <Text style={[s.method, rtlTextStyle(lang)]}>{t('certMethodPnl', lang)}</Text>
        <Text style={[s.method, rtlTextStyle(lang)]}>{t('certMethodNoncash', lang)}</Text>
        <Text style={[s.method, rtlTextStyle(lang)]}>{`${t('certCutoffInclusive', lang)} ${cutoff}`}</Text>
      </View>

      <View style={s.footer} fixed>
        <Text style={s.footerText}>JJ Property 10 · {owner} · {cutoff} · {t('confidential', lang)}</Text>
        <Text
          style={s.footerText}
          render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
        />
      </View>
    </Page>
  )
}

export function CertifiedSupportingBanner({ lang }: { lang: Lang }) {
  return (
    <View
      style={{
        backgroundColor: '#fffbeb',
        borderWidth: 1,
        borderColor: '#fcd34d',
        borderRadius: 4,
        padding: 8,
        marginBottom: 12,
      }}
      wrap={false}
    >
      <Text style={[{ fontSize: 8, fontWeight: 'bold', color: '#92400e' }, rtlTextStyle(lang)]}>
        {t('certSupportingLedger', lang)}
      </Text>
    </View>
  )
}
