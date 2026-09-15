/**
 * Partner-sendable Avi external-partner report PDF (@react-pdf/renderer).
 * Presentation only — renders a certified ExternalPartnerAviReport DTO as-is.
 * No settlement math. No Chromium.
 */
import React from 'react'
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer'
import {
  AVI_REPORT_COPY,
  formatAviFullDate,
  formatAviOwedCopy,
  type AviReportLang,
} from '@/components/finance/aviReportCopy'
import { AVI_REPORT_COLORS as C } from '@/components/finance/aviReportTokens'
import {
  rtlAlignEnd,
  rtlColumnOrder,
  rtlRowDirection,
  rtlTextStyle,
} from '@/lib/pdf/rtlHelpers'
import { fmt } from '@/lib/pdf/formatters'
import type { ExternalPartnerAviReport } from '@/lib/partner-settlement/external-partner/externalPartnerAviReportTypes'

export type AviCertifiedReport = Extract<
  ExternalPartnerAviReport,
  { status: 'certified' }
>

const s = StyleSheet.create({
  page: {
    fontFamily: 'Heebo',
    fontSize: 9,
    color: C.grayDark,
    paddingTop: 28,
    paddingBottom: 36,
    paddingHorizontal: 32,
  },
  masthead: {
    backgroundColor: C.navy,
    color: C.white,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  brand: { fontSize: 8, letterSpacing: 1.2, color: C.grayMid, marginBottom: 4 },
  title: { fontSize: 14, fontWeight: 'bold', color: C.white, marginBottom: 4 },
  meta: { fontSize: 8, color: C.grayMid },
  hero: {
    borderWidth: 1,
    borderColor: C.greenBorder,
    backgroundColor: C.greenBg,
    padding: 12,
    marginBottom: 14,
  },
  heroLabel: { fontSize: 8, color: C.green, marginBottom: 4 },
  heroValue: { fontSize: 18, fontWeight: 'bold', color: C.green },
  section: { marginBottom: 12 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    color: C.navy,
    marginBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: C.grayBorder,
    paddingBottom: 3,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: C.grayLine,
  },
  label: { flexGrow: 1, flexShrink: 1, paddingRight: 8 },
  amount: { width: 90 },
  muted: { fontSize: 8, color: C.grayText, marginTop: 4 },
  narrative: {
    fontSize: 9,
    color: C.grayDark,
    marginTop: 6,
    lineHeight: 1.4,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: C.grayBg,
    paddingVertical: 4,
    paddingHorizontal: 4,
    marginTop: 4,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 3,
    paddingHorizontal: 4,
    borderBottomWidth: 0.4,
    borderBottomColor: C.grayLine,
  },
  colDate: { width: 72 },
  colFlex: { flexGrow: 1, flexShrink: 1, paddingHorizontal: 4 },
  colAmt: { width: 78 },
  footer: {
    position: 'absolute',
    left: 32,
    right: 32,
    bottom: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 0.5,
    borderTopColor: C.grayBorder,
    paddingTop: 6,
  },
  footerText: { fontSize: 7, color: C.grayText },
})

function money(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—'
  return fmt(n)
}

function labelFor(lang: AviReportLang, en: string, he: string): string {
  return lang === 'he' ? he : en
}

function SectionTitle({
  children,
  lang,
}: {
  children: string
  lang: AviReportLang
}) {
  return (
    <Text style={[s.sectionTitle, rtlTextStyle(lang)]}>{children}</Text>
  )
}

function KvRow({
  label,
  value,
  lang,
}: {
  label: string
  value: string
  lang: AviReportLang
}) {
  return (
    <View style={[s.row, rtlRowDirection(lang)]}>
      <Text style={[s.label, rtlTextStyle(lang)]}>{label}</Text>
      <Text style={[s.amount, rtlColumnOrder(lang)]}>{value}</Text>
    </View>
  )
}

function DocFooter({
  lang,
  generatedLabel,
}: {
  lang: AviReportLang
  generatedLabel: string
}) {
  const copy = AVI_REPORT_COPY[lang]
  return (
    <View style={[s.footer, rtlRowDirection(lang)]} fixed>
      <Text style={[s.footerText, rtlTextStyle(lang)]}>
        {copy.footerConfidential} · {copy.propertyName} · {copy.footerPartnerReport} ·{' '}
        {generatedLabel}
      </Text>
      <Text
        style={s.footerText}
        render={({ pageNumber, totalPages }) =>
          `${copy.pageLabel} ${pageNumber} ${copy.pageOf} ${totalPages}`
        }
      />
    </View>
  )
}

/**
 * Certified Avi partner report as A4 PDF. Same DTO as the screen — no recomputation.
 */
export function AviPartnerReportPdf({
  report,
  lang,
}: {
  readonly report: AviCertifiedReport
  readonly lang: AviReportLang
}) {
  const copy = AVI_REPORT_COPY[lang]
  const avi =
    report.partners.find((p) => p.partner === 'Avi') ?? report.partners[0]
  const hero = formatAviOwedCopy(
    lang,
    avi?.semanticNet ?? null,
    avi?.direction ?? null,
  )
  const generatedLabel = formatAviFullDate(
    new Date().toISOString().slice(0, 10),
    lang,
  )
  const cutoffLabel = formatAviFullDate(report.snapshot.cutoffDate, lang)

  return (
    <Document
      title={copy.reportTitle}
      author="JJ Property 10"
      subject={`${copy.propertyName} — ${copy.footerPartnerReport}`}
    >
      <Page size="A4" style={s.page} wrap>
        <View style={[s.masthead, rtlRowDirection(lang)]}>
          <View style={{ flexGrow: 1 }}>
            <Text style={[s.brand, rtlTextStyle(lang)]}>{copy.brand}</Text>
            <Text style={[s.title, rtlTextStyle(lang)]}>{copy.reportTitle}</Text>
            <Text style={[s.meta, rtlTextStyle(lang)]}>
              {copy.propertyName} · {copy.transactionsThrough} {cutoffLabel}
            </Text>
          </View>
          <View style={rtlAlignEnd(lang)}>
            <Text style={[s.meta, rtlTextStyle(lang)]}>
              {copy.generatedLabel}: {generatedLabel}
            </Text>
            <Text style={[s.meta, rtlTextStyle(lang)]}>
              {copy.confidentiality}
            </Text>
          </View>
        </View>

        <View style={s.hero}>
          <Text style={[s.heroLabel, rtlTextStyle(lang)]}>{copy.summary}</Text>
          <Text style={[s.heroValue, rtlTextStyle(lang)]}>{hero ?? copy.summary}</Text>
          <Text style={[s.muted, rtlTextStyle(lang)]}>{copy.formula}</Text>
          <Text style={[s.narrative, rtlTextStyle(lang)]}>
            {copy.closingNarrative}
          </Text>
        </View>

        <View style={s.section}>
          <SectionTitle lang={lang}>{copy.ownership}</SectionTitle>
          <KvRow
            lang={lang}
            label={copy.ownership}
            value={`${avi?.ownershipPct ?? 50}%`}
          />
        </View>

        <View style={s.section}>
          <SectionTitle lang={lang}>{copy.acquisition}</SectionTitle>
          <Text style={[s.muted, rtlTextStyle(lang)]}>{copy.acquisitionSubtitle}</Text>
          <KvRow
            lang={lang}
            label={copy.agreedValue}
            value={money(report.acquisition.agreedTransactionValueEur)}
          />
          <KvRow
            lang={lang}
            label={copy.aviObligation}
            value={money(report.acquisition.aviObligationEur)}
          />
          <KvRow
            lang={lang}
            label={copy.remaining}
            value={money(report.acquisition.remainingEur)}
          />
        </View>

        <View style={s.section}>
          <SectionTitle lang={lang}>{copy.finalSettlement}</SectionTitle>
          {report.finalSummary.rows.map((row) => (
            <KvRow
              key={row.key}
              lang={lang}
              label={labelFor(lang, row.labelEn, row.labelHe)}
              value={money(row.remainingEur)}
            />
          ))}
          <KvRow
            lang={lang}
            label={labelFor(lang, 'Paid total', 'סה״כ שולם')}
            value={money(report.finalSummary.paidTotalEur)}
          />
          <KvRow
            lang={lang}
            label={labelFor(lang, 'Credits total', 'סה״כ זיכויים')}
            value={money(report.finalSummary.creditsTotalEur)}
          />
          <KvRow
            lang={lang}
            label={labelFor(lang, 'Obligation total', 'סה״כ התחייבות')}
            value={money(report.finalSummary.obligationTotalEur)}
          />
          <KvRow
            lang={lang}
            label={hero || copy.summary}
            value={money(report.finalSummary.netEur)}
          />
        </View>

        <View style={s.section}>
          <SectionTitle lang={lang}>{copy.purchaseExpenses}</SectionTitle>
          <KvRow
            lang={lang}
            label={labelFor(lang, 'Total', 'סה״כ')}
            value={money(report.purchaseExpenses.totalEur)}
          />
          <KvRow
            lang={lang}
            label={labelFor(lang, 'Avi share', 'חלק אבי')}
            value={money(report.purchaseExpenses.aviShareEur)}
          />
        </View>

        <View style={s.section}>
          <SectionTitle lang={lang}>{copy.renovation}</SectionTitle>
          <KvRow
            lang={lang}
            label={labelFor(lang, 'Certified charge', 'חיוב מאושר')}
            value={money(report.renovation.certifiedChargeEur)}
          />
          <KvRow
            lang={lang}
            label={labelFor(lang, 'Avi share', 'חלק אבי')}
            value={money(report.renovation.aviShareEur)}
          />
          <KvRow
            lang={lang}
            label={labelFor(lang, 'Avi paid', 'שולם ע״י אבי')}
            value={money(report.renovation.aviPaidEur)}
          />
        </View>

        <View style={s.section}>
          <SectionTitle lang={lang}>{copy.airbnbIncome}</SectionTitle>
          <KvRow
            lang={lang}
            label={copy.privateIncome}
            value={money(report.airbnbCredits.privateBookingAviEur)}
          />
          <KvRow
            lang={lang}
            label={copy.hostawayIncome}
            value={money(report.hostawayIncome.aviShareEur)}
          />
          <KvRow
            lang={lang}
            label={labelFor(lang, 'Hostaway stays / nights', 'שהיות / לילות Hostaway')}
            value={`${report.hostawayIncome.stayCount} / ${report.hostawayIncome.nights}`}
          />
          <KvRow
            lang={lang}
            label={labelFor(lang, 'Hostaway NTO total', 'סה״כ NTO Hostaway')}
            value={money(report.hostawayIncome.printedNtoTotalEur)}
          />
        </View>

        <View style={s.section}>
          <SectionTitle lang={lang}>
            {labelFor(lang, report.airbnb.setup.labelEn, report.airbnb.setup.labelHe)}
          </SectionTitle>
          <KvRow
            lang={lang}
            label={labelFor(lang, 'Total', 'סה״כ')}
            value={money(report.airbnb.setup.totalEur)}
          />
          <KvRow
            lang={lang}
            label={labelFor(lang, 'Avi share', 'חלק אבי')}
            value={money(report.airbnb.setup.aviShareEur)}
          />
        </View>

        <View style={s.section}>
          <SectionTitle lang={lang}>
            {labelFor(
              lang,
              report.airbnb.operations.labelEn,
              report.airbnb.operations.labelHe,
            )}
          </SectionTitle>
          <KvRow
            lang={lang}
            label={labelFor(lang, 'Total', 'סה״כ')}
            value={money(report.airbnb.operations.totalEur)}
          />
          <KvRow
            lang={lang}
            label={labelFor(lang, 'Avi share', 'חלק אבי')}
            value={money(report.airbnb.operations.aviShareEur)}
          />
          <Text style={[s.muted, rtlTextStyle(lang)]}>{copy.internetSplitNote}</Text>
        </View>

        <View style={s.section} wrap>
          <SectionTitle lang={lang}>{copy.payments}</SectionTitle>
          <View style={[s.tableHeader, rtlRowDirection(lang)]} fixed>
            <Text style={[s.colDate, rtlTextStyle(lang)]}>
              {labelFor(lang, 'Date', 'תאריך')}
            </Text>
            <Text style={[s.colFlex, rtlTextStyle(lang)]}>
              {labelFor(lang, 'Purpose', 'מטרה')}
            </Text>
            <Text style={[s.colAmt, rtlColumnOrder(lang)]}>
              {labelFor(lang, 'Amount', 'סכום')}
            </Text>
          </View>
          {report.partnerPayments.map((p) => (
            <View key={p.id} style={[s.tableRow, rtlRowDirection(lang)]} wrap={false}>
              <Text style={s.colDate}>{formatAviFullDate(p.date, lang)}</Text>
              <Text style={[s.colFlex, rtlTextStyle(lang)]}>{p.label}</Text>
              <Text style={[s.colAmt, rtlColumnOrder(lang)]}>
                {money(p.amountEur)}
              </Text>
            </View>
          ))}
        </View>

        <DocFooter lang={lang} generatedLabel={generatedLabel} />
      </Page>
    </Document>
  )
}
