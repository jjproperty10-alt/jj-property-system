/**
 * Partner-sendable Avi external-partner report PDF (@react-pdf/renderer).
 * Full certified DTO presentation — same sections as the approved HTML print.
 * No settlement math. React-pdf only (no browser print path).
 */
import React from 'react'
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer'
import {
  AVI_REPORT_COPY,
  formatAviOwedCopy,
  formatAviStayNightLabel,
  type AviReportLang,
} from '@/components/finance/aviReportCopy'
import {
  aviPartnerDisplayName,
  aviPaymentPurpose,
  aviRenovationCategoryLabel,
} from '@/components/finance/aviReportPresentation'
import { AVI_REPORT_COLORS as C } from '@/components/finance/aviReportTokens'
import {
  rtlColumnOrder,
  rtlRowDirection,
} from '@/lib/pdf/rtlHelpers'
import {
  AccountBar,
  AVI_PDF_GENERATED_ISO,
  HeText,
  KpiTile,
  LtrText,
  LtrSettlementFormula,
  MixedRtlPhrase,
  PdfAviDate,
  money,
  moneySigned,
  shared,
} from '@/lib/pdf/aviPdfShared'
import { AVI_HOSTAWAY_LAST_CHECKOUT_DATE } from '@/lib/partner-settlement/external-partner/aviHostawayStays'
import type { ExternalPartnerAviReport } from '@/lib/partner-settlement/external-partner/externalPartnerAviReportTypes'

export type AviCertifiedReport = Extract<
  ExternalPartnerAviReport,
  { status: 'certified' }
>

const s = StyleSheet.create({
  page: {
    fontFamily: 'Heebo',
    fontSize: 8,
    color: C.grayDark,
    paddingTop: 26,
    paddingBottom: 34,
    paddingHorizontal: 28,
  },
  masthead: {
    backgroundColor: C.navy,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 10,
    borderRadius: 3,
  },
  brand: { fontSize: 8, letterSpacing: 1.1, color: '#93c5fd', marginBottom: 3 },
  title: { fontSize: 13, fontWeight: 'bold', color: C.white, marginBottom: 3 },
  meta: { fontSize: 7.5, color: '#bfdbfe', marginBottom: 2 },
  metaRow: { flexDirection: 'row', marginBottom: 2, alignItems: 'baseline' },
  note: {
    fontSize: 7,
    color: C.grayText,
    marginBottom: 8,
    lineHeight: 1.35,
    backgroundColor: C.grayBg,
    padding: 6,
    borderRadius: 3,
  },
  hero: {
    borderWidth: 1,
    borderColor: C.greenBorder,
    backgroundColor: C.greenBg,
    padding: 10,
    marginBottom: 10,
    borderRadius: 3,
  },
  heroKickerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  heroKicker: { fontSize: 7, fontWeight: 'bold', color: C.green, letterSpacing: 0.4 },
  heroBadge: { fontSize: 6.5, color: C.grayText },
  heroTitle: { fontSize: 11, fontWeight: 'bold', color: C.navy, marginBottom: 2 },
  heroSub: { fontSize: 8, color: C.grayText, marginBottom: 6 },
  heroOwed: { fontSize: 16, fontWeight: 'bold', color: C.green, marginBottom: 4 },
  heroOps: { flexDirection: 'row', marginTop: 6, marginBottom: 4 },
  heroOpCell: {
    flexGrow: 1,
    backgroundColor: C.white,
    borderWidth: 0.5,
    borderColor: C.grayBorder,
    padding: 5,
    marginHorizontal: 2,
    borderRadius: 2,
  },
  heroOpLabel: { fontSize: 6.5, color: C.grayText, marginBottom: 2 },
  heroOpValue: { fontSize: 9, fontWeight: 'bold', color: C.grayDark },
  formula: { fontSize: 7, color: C.grayDark, marginTop: 4, lineHeight: 1.35 },
  ownershipRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
    borderBottomWidth: 0.4,
    borderBottomColor: C.grayLine,
  },
  badgeOk: {
    fontSize: 6.5,
    color: C.green,
    backgroundColor: C.greenBg,
    paddingVertical: 2,
    paddingHorizontal: 5,
    borderRadius: 2,
  },
  badgePend: {
    fontSize: 6.5,
    color: C.amber,
    backgroundColor: C.amberBg,
    paddingVertical: 2,
    paddingHorizontal: 5,
    borderRadius: 2,
  },
  footer: {
    position: 'absolute',
    left: 28,
    right: 28,
    bottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 0.5,
    borderTopColor: C.grayBorder,
    paddingTop: 5,
  },
  footerText: { fontSize: 6.5, color: C.grayText },
  settleBox: {
    borderWidth: 1,
    borderColor: C.navyLight,
    borderRadius: 3,
    padding: 8,
    backgroundColor: '#f8fafc',
  },
  settleKicker: {
    fontSize: 7,
    fontWeight: 'bold',
    color: C.navyLight,
    marginBottom: 2,
    letterSpacing: 0.4,
  },
  settleTitle: { fontSize: 11, fontWeight: 'bold', color: C.navy, marginBottom: 6 },
  narrative: { fontSize: 8, color: C.grayDark, marginTop: 6, lineHeight: 1.4 },
})

function labelFor(lang: AviReportLang, en: string, he: string): string {
  return lang === 'he' ? he : en
}

function DocFooter({
  lang,
  generatedLabel,
}: {
  lang: AviReportLang
  generatedLabel: React.ReactNode
}) {
  const copy = AVI_REPORT_COPY[lang]
  return (
    <View style={[s.footer, rtlRowDirection(lang)]} fixed>
      <View style={[{ flexDirection: 'row', alignItems: 'baseline', flexGrow: 1 }, rtlRowDirection(lang)]}>
        <HeText lang={lang} style={s.footerText}>
          {copy.footerConfidential} · {copy.propertyName} · {copy.footerPartnerReport} ·
        </HeText>
        <Text style={s.footerText}>{'\u00a0'}</Text>
        {generatedLabel}
      </View>
      <Text
        style={s.footerText}
        render={({ pageNumber, totalPages }) =>
          `${copy.pageLabel} ${pageNumber} ${copy.pageOf} ${totalPages}`
        }
      />
    </View>
  )
}

function MetaLine({
  lang,
  label,
  iso,
  mode = 'full',
}: {
  lang: AviReportLang
  label: string
  iso: string
  mode?: 'full' | 'month'
}) {
  return (
    <View style={[s.metaRow, rtlRowDirection(lang)]}>
      <HeText lang={lang} style={s.meta}>
        {label}
      </HeText>
      <Text style={s.meta}>{'\u00a0'}</Text>
      <PdfAviDate iso={iso} lang={lang} mode={mode} style={{ color: '#bfdbfe', fontSize: 7.5 }} />
    </View>
  )
}

/**
 * Certified Avi partner report as A4 PDF. Same DTO as the screen — no recomputation.
 */
export function AviPartnerReportPdf({
  report,
  lang,
  generatedIso = AVI_PDF_GENERATED_ISO,
}: {
  readonly report: AviCertifiedReport
  readonly lang: AviReportLang
  readonly generatedIso?: string
}) {
  const copy = AVI_REPORT_COPY[lang]
  const avi =
    report.partners.find((p) => p.partner === 'Avi') ?? report.partners[0]
  const hero =
    formatAviOwedCopy(lang, avi?.semanticNet ?? null, avi?.direction ?? null) ??
    copy.summary
  const heroAmount = money(report.finalSummary.netEur)
  const heroLeading =
    lang === 'he'
      ? hero.replace(heroAmount, '').replace(/€[\d,]+\.\d{2}/, '').trim() || 'מגיע לאבי'
      : hero.replace(heroAmount, '').trim() || 'Avi is owed'

  const payments = [...report.partnerPayments].sort(
    (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
  )
  const paymentsTotal = payments.reduce((sum, p) => sum + (p.amountEur ?? 0), 0)
  const monthlyRows = report.monthly.rows.filter(
    (row) => row.incomeEur !== 0 || row.stayCount > 0,
  )
  const setupTitle = labelFor(lang, report.airbnb.setup.labelEn, report.airbnb.setup.labelHe)
  const opsTitle = labelFor(
    lang,
    report.airbnb.operations.labelEn,
    report.airbnb.operations.labelHe,
  )

  const generatedFooter =
    lang === 'he' ? (
      <PdfAviDate iso={generatedIso} lang={lang} style={{ fontSize: 7, color: C.grayText }} />
    ) : (
      <LtrText style={s.footerText}>
        {new Intl.DateTimeFormat('en-GB', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        }).format(
          new Date(
            Number(generatedIso.slice(0, 4)),
            Number(generatedIso.slice(5, 7)) - 1,
            Number(generatedIso.slice(8, 10)),
          ),
        )}
      </LtrText>
    )

  return (
    <Document
      title={copy.reportTitle}
      author="JJ Property 10"
      creator="JJ Property 10"
      producer="JJ @react-pdf/renderer"
      subject={`${copy.propertyName} — ${copy.footerPartnerReport}`}
    >
      <Page size="A4" style={s.page} wrap>
        {/* 1. Masthead */}
        <View style={s.masthead} wrap={false}>
          <HeText lang={lang} style={s.brand}>
            {copy.brand}
          </HeText>
          <HeText lang={lang} style={s.title}>
            {copy.reportTitle}
          </HeText>
          <HeText lang={lang} style={s.meta}>
            {lang === 'he' ? 'אבי' : 'Avi'} · {copy.propertyName}
          </HeText>
          <MetaLine lang={lang} label={copy.generatedOn} iso={generatedIso} />
          <HeText lang={lang} style={s.meta}>
            {copy.confidentiality}
          </HeText>
          <MetaLine
            lang={lang}
            label={copy.transactionsThrough}
            iso={report.snapshot.cutoffDate}
          />
          <MetaLine
            lang={lang}
            label={copy.hostawayIncomeThrough}
            iso={AVI_HOSTAWAY_LAST_CHECKOUT_DATE}
          />
        </View>

        {/* 2. Financial summary */}
        <View style={s.hero} wrap={false}>
          <View style={[s.heroKickerRow, rtlRowDirection(lang)]}>
            <HeText lang={lang} style={s.heroKicker}>
              {lang === 'he' ? 'סיכום פיננסי' : 'Financial Summary'}
            </HeText>
            <HeText lang={lang} style={s.heroBadge}>
              {copy.confidentiality.split('—')[0]?.trim() || 'Confidential'}
            </HeText>
          </View>
          <HeText lang={lang} style={s.heroTitle}>
            {lang === 'he' ? 'אבי' : 'Avi'}
          </HeText>
          <HeText lang={lang} style={s.heroSub}>
            {copy.propertyName}
          </HeText>
          <HeText lang={lang} style={{ fontSize: 7, color: C.grayText, marginBottom: 2 }}>
            {copy.finalNet}
          </HeText>
          <MixedRtlPhrase
            lang={lang}
            leading={heroLeading}
            trailingLtr={heroAmount}
            style={s.heroOwed}
          />
          <View style={[s.heroOps, rtlRowDirection(lang)]}>
            <View style={s.heroOpCell}>
              <HeText lang={lang} style={s.heroOpLabel}>
                {copy.paid}
              </HeText>
              <LtrText style={s.heroOpValue}>{money(avi?.paidEur)}</LtrText>
            </View>
            <View style={s.heroOpCell}>
              <HeText lang={lang} style={s.heroOpLabel}>
                {copy.credits}
              </HeText>
              <LtrText style={s.heroOpValue}>{money(avi?.creditsEur)}</LtrText>
            </View>
            <View style={s.heroOpCell}>
              <HeText lang={lang} style={s.heroOpLabel}>
                {copy.obligation}
              </HeText>
              <LtrText style={s.heroOpValue}>{money(avi?.obligationEur)}</LtrText>
            </View>
          </View>
          <HeText lang={lang} style={s.formula}>
            {copy.formula}
          </HeText>
          <LtrSettlementFormula
            paidEur={avi?.paidEur}
            creditsEur={avi?.creditsEur}
            obligationEur={avi?.obligationEur}
            netEur={avi?.netEur}
            style={s.formula}
          />
        </View>

        {/* 3. Ownership */}
        <View style={shared.section} wrap={false} minPresenceAhead={60}>
          <AccountBar lang={lang} tone="navy" title={copy.ownership} />
          {report.partners.map((p) => (
            <View key={p.partner} style={[s.ownershipRow, rtlRowDirection(lang)]}>
              <View style={[{ flexDirection: 'row', alignItems: 'center' }, rtlRowDirection(lang)]}>
                <HeText lang={lang} style={{ fontSize: 8, fontWeight: 'bold' }}>
                  {aviPartnerDisplayName(p.partner, lang)}
                </HeText>
                <LtrText style={{ fontSize: 8, color: C.grayText, marginHorizontal: 6 }}>
                  {p.ownershipPct}%
                </LtrText>
              </View>
              <HeText
                lang={lang}
                style={p.status === 'CERTIFIED' ? s.badgeOk : s.badgePend}
              >
                {p.status === 'CERTIFIED' ? copy.certified : copy.provisional}
              </HeText>
            </View>
          ))}
        </View>

        {/* 4. Acquisition */}
        <View style={shared.section} wrap={false} minPresenceAhead={80}>
          <AccountBar
            lang={lang}
            tone="navy"
            title={copy.acquisition}
            amount={money(report.acquisition.aviObligationEur)}
            amountHint={copy.aviObligation}
          />
          <View style={[shared.kpiStrip, rtlRowDirection(lang)]}>
            <KpiTile
              lang={lang}
              label={copy.agreedValue}
              value={money(report.acquisition.agreedTransactionValueEur)}
            />
            <KpiTile
              lang={lang}
              label={copy.aviObligation}
              value={money(report.acquisition.aviObligationEur)}
            />
            <KpiTile
              lang={lang}
              label={copy.remaining}
              value={money(report.acquisition.remainingEur)}
            />
          </View>
        </View>

        {/* 5. Purchase expenses */}
        <View style={shared.section} minPresenceAhead={100}>
          <AccountBar
            lang={lang}
            tone="navy"
            title={copy.purchaseExpenses}
            amount={money(report.purchaseExpenses.aviRemainingEur)}
            amountHint={copy.aviRemaining}
          />
          <View style={[shared.kpiStrip, rtlRowDirection(lang)]} wrap={false}>
            <KpiTile
              lang={lang}
              label={copy.propertyTotal}
              value={money(report.purchaseExpenses.totalEur)}
            />
            <KpiTile
              lang={lang}
              label={copy.aviShare}
              value={money(report.purchaseExpenses.aviShareEur)}
            />
            <KpiTile
              lang={lang}
              label={copy.aviPaid}
              value={money(report.purchaseExpenses.aviPaidEur)}
            />
            <KpiTile
              lang={lang}
              label={copy.aviRemaining}
              value={money(report.purchaseExpenses.aviRemainingEur)}
            />
          </View>
          <HeText lang={lang} style={shared.groupLabel}>
            {copy.purchaseExpenses}
          </HeText>
          <View style={[shared.tableHeader, rtlRowDirection(lang)]} wrap={false}>
            <HeText lang={lang} style={[shared.th, { width: 78 }]}>
              {copy.month}
            </HeText>
            <HeText lang={lang} style={[shared.th, { flexGrow: 1 }]}>
              {copy.purchaseExpenses}
            </HeText>
            <HeText lang={lang} style={[shared.th, { width: 72 }, rtlColumnOrder(lang)]}>
              {copy.propertyTotal}
            </HeText>
            <HeText lang={lang} style={[shared.th, { width: 72 }, rtlColumnOrder(lang)]}>
              {copy.aviShare}
            </HeText>
          </View>
          {report.purchaseExpenses.lines.map((line, i) => (
            <View
              key={`pe-${line.month}-${i}`}
              style={[shared.tableRow, rtlRowDirection(lang)]}
              wrap={false}
            >
              <View style={{ width: 78 }}>
                <PdfAviDate iso={line.month} lang={lang} mode="month" />
              </View>
              <HeText lang={lang} style={[shared.td, { flexGrow: 1 }]}>
                {labelFor(lang, line.labelEn, line.labelHe)}
              </HeText>
              <LtrText style={[shared.td, { width: 72 }, rtlColumnOrder(lang)]}>
                {money(line.amountEur)}
              </LtrText>
              <LtrText style={[shared.td, { width: 72 }, rtlColumnOrder(lang)]}>
                {money(line.aviShareEur)}
              </LtrText>
            </View>
          ))}
          <View style={[shared.tableTotal, rtlRowDirection(lang)]} wrap={false}>
            <HeText lang={lang} style={[shared.tdBold, { flexGrow: 1 }]}>
              {lang === 'he' ? 'סה״כ' : 'Total'}
            </HeText>
            <LtrText style={[shared.tdBold, { width: 72 }, rtlColumnOrder(lang)]}>
              {money(report.purchaseExpenses.totalEur)}
            </LtrText>
            <LtrText style={[shared.tdBold, { width: 72 }, rtlColumnOrder(lang)]}>
              {money(report.purchaseExpenses.aviShareEur)}
            </LtrText>
          </View>
        </View>

        {/* 6. Renovation */}
        <View style={shared.section} minPresenceAhead={100}>
          <AccountBar
            lang={lang}
            tone="purple"
            title={copy.renovation}
            amount={money(report.renovation.aviRemainingEur)}
            amountHint={copy.aviRemaining}
          />
          <View style={[shared.kpiStrip, rtlRowDirection(lang)]} wrap={false}>
            <KpiTile
              lang={lang}
              label={copy.propertyTotal}
              value={money(report.renovation.certifiedChargeEur)}
            />
            <KpiTile
              lang={lang}
              label={copy.aviShare}
              value={money(report.renovation.aviShareEur)}
            />
            <KpiTile
              lang={lang}
              label={copy.aviPaid}
              value={money(report.renovation.aviPaidEur)}
            />
            <KpiTile
              lang={lang}
              label={copy.aviRemaining}
              value={money(report.renovation.aviRemainingEur)}
            />
          </View>
          {report.renovation.groups.length > 0 ? (
            <>
              <HeText lang={lang} style={shared.groupLabel}>
                {copy.renovation}
              </HeText>
              <View style={[shared.tableHeader, rtlRowDirection(lang)]} wrap={false}>
                <HeText lang={lang} style={[shared.th, { flexGrow: 1 }]}>
                  {copy.renovation}
                </HeText>
                <HeText lang={lang} style={[shared.th, { width: 40 }, rtlColumnOrder(lang)]}>
                  {copy.rows}
                </HeText>
                <HeText lang={lang} style={[shared.th, { width: 72 }, rtlColumnOrder(lang)]}>
                  {copy.propertyTotal}
                </HeText>
                <HeText lang={lang} style={[shared.th, { width: 72 }, rtlColumnOrder(lang)]}>
                  {copy.aviShare}
                </HeText>
              </View>
              {report.renovation.groups.map((g) => (
                <View
                  key={g.subcategory}
                  style={[shared.tableRow, rtlRowDirection(lang)]}
                  wrap={false}
                >
                  <HeText lang={lang} style={[shared.td, { flexGrow: 1 }]}>
                    {aviRenovationCategoryLabel(g.subcategory, lang)}
                  </HeText>
                  <LtrText style={[shared.td, { width: 40 }, rtlColumnOrder(lang)]}>
                    {g.rowCount}
                  </LtrText>
                  <LtrText style={[shared.td, { width: 72 }, rtlColumnOrder(lang)]}>
                    {money(g.totalEur)}
                  </LtrText>
                  <LtrText style={[shared.td, { width: 72 }, rtlColumnOrder(lang)]}>
                    {money(g.aviShareEur)}
                  </LtrText>
                </View>
              ))}
              <View style={[shared.tableTotal, rtlRowDirection(lang)]} wrap={false}>
                <HeText lang={lang} style={[shared.tdBold, { flexGrow: 1 }]}>
                  {lang === 'he' ? 'סה״כ' : 'Total'}
                </HeText>
                <LtrText style={[shared.tdBold, { width: 72 }, rtlColumnOrder(lang)]}>
                  {money(report.renovation.certifiedChargeEur)}
                </LtrText>
                <LtrText style={[shared.tdBold, { width: 72 }, rtlColumnOrder(lang)]}>
                  {money(report.renovation.aviShareEur)}
                </LtrText>
              </View>
            </>
          ) : null}
        </View>

        {/* 7. Post-acquisition total only — detail lives in final settlement */}
        <View style={shared.section} wrap={false} minPresenceAhead={70}>
          <AccountBar lang={lang} tone="navy" title={copy.postAcquisitionLayers} />
          <View style={[s.settleBox, { marginTop: 2 }]} wrap={false}>
            <View style={[shared.kpiStrip, rtlRowDirection(lang)]}>
              <KpiTile
                lang={lang}
                label={copy.paid}
                value={money(avi?.paidEur)}
              />
              <KpiTile
                lang={lang}
                label={copy.credits}
                value={money(avi?.creditsEur)}
              />
              <KpiTile
                lang={lang}
                label={copy.obligation}
                value={money(avi?.obligationEur)}
              />
            </View>
            <View
              style={[
                {
                  marginTop: 6,
                  flexDirection: 'row',
                  alignItems: 'baseline',
                  flexWrap: 'wrap',
                  justifyContent: 'space-between',
                },
                rtlRowDirection(lang),
              ]}
            >
              <HeText lang={lang} style={{ fontSize: 9, fontWeight: 'bold', color: C.navy }}>
                {copy.postAcquisitionTotal}
              </HeText>
              <MixedRtlPhrase
                lang={lang}
                leading={heroLeading}
                trailingLtr={heroAmount}
                style={{ fontSize: 12, fontWeight: 'bold', color: C.green }}
              />
            </View>
          </View>
        </View>

        {/* 8. Certified expenses after share purchase */}
        <View style={shared.section} wrap={false} minPresenceAhead={80}>
          <AccountBar
            lang={lang}
            tone="blue"
            title={copy.expenseReconciliation}
            amount={money(report.visibleExpenseTotals.aviShareEur)}
            amountHint={copy.aviExpenseShare}
          />
          <View style={[shared.kpiStrip, rtlRowDirection(lang)]}>
            <KpiTile
              lang={lang}
              label={copy.certifiedExpenseRows}
              value={String(report.visibleExpenseTotals.rowCount)}
            />
            <KpiTile
              lang={lang}
              label={copy.totalCharges}
              value={money(report.visibleExpenseTotals.totalChargeEur)}
            />
            <KpiTile
              lang={lang}
              label={copy.aviExpenseShare}
              value={money(report.visibleExpenseTotals.aviShareEur)}
            />
          </View>
        </View>

        {/* 9. Short-term rental income credits (Hostaway NTO + private — one income domain) */}
        <View style={shared.section} minPresenceAhead={110}>
          <AccountBar
            lang={lang}
            tone="green"
            title={copy.airbnbIncome}
            amount={money(report.airbnbCredits.totalAviEur)}
            amountHint={copy.aviShareCredit}
          />
          <View style={[shared.kpiStrip, rtlRowDirection(lang)]} wrap={false}>
            <KpiTile
              lang={lang}
              label={copy.stays}
              value={String(report.hostawayIncome.stayCount)}
            />
            <KpiTile
              lang={lang}
              label={copy.nights}
              value={String(report.hostawayIncome.nights)}
            />
            <KpiTile
              lang={lang}
              label={copy.hostawayIncome}
              value={money(report.airbnbCredits.hostawayPrintedNtoTotalEur)}
              hint={`${copy.aviShare}: ${money(report.airbnbCredits.hostawayAviEur)}`}
            />
            <KpiTile
              lang={lang}
              label={copy.privateIncome}
              value={money(report.airbnbCredits.privateBookingTotalEur)}
              hint={`${copy.aviShareCredit}: ${money(report.airbnbCredits.privateBookingAviEur)}`}
            />
          </View>
          <View style={[shared.tableHeader, rtlRowDirection(lang)]} wrap={false}>
            <HeText lang={lang} style={[shared.th, { flexGrow: 1 }]}>
              {copy.incomeSource}
            </HeText>
            <HeText lang={lang} style={[shared.th, { width: 80 }, rtlColumnOrder(lang)]}>
              {copy.printedNto}
            </HeText>
            <HeText lang={lang} style={[shared.th, { width: 80 }, rtlColumnOrder(lang)]}>
              {copy.aviShare}
            </HeText>
          </View>
          <View style={[shared.tableRow, rtlRowDirection(lang)]} wrap={false}>
            <View style={{ flexGrow: 1 }}>
              <HeText lang={lang} style={shared.td}>
                {copy.completedHostawayStays}
              </HeText>
              <LtrText style={{ fontSize: 6.5, color: C.grayText }}>
                {formatAviStayNightLabel(
                  lang,
                  report.airbnbCredits.completedStayCount,
                  report.airbnbCredits.completedNights,
                )}
              </LtrText>
            </View>
            <LtrText style={[shared.td, { width: 80 }, rtlColumnOrder(lang)]}>
              {money(report.airbnbCredits.hostawayPrintedNtoTotalEur)}
            </LtrText>
            <LtrText style={[shared.td, { width: 80 }, rtlColumnOrder(lang)]}>
              {money(report.airbnbCredits.hostawayAviEur)}
            </LtrText>
          </View>
          <View style={[shared.tableRow, rtlRowDirection(lang)]} wrap={false}>
            <HeText lang={lang} style={[shared.td, { flexGrow: 1 }]}>
              {copy.privateIncome}
            </HeText>
            <LtrText style={[shared.td, { width: 80 }, rtlColumnOrder(lang)]}>
              {money(report.airbnbCredits.privateBookingTotalEur)}
            </LtrText>
            <LtrText style={[shared.td, { width: 80 }, rtlColumnOrder(lang)]}>
              {money(report.airbnbCredits.privateBookingAviEur)}
            </LtrText>
          </View>
          <View style={[shared.tableTotal, rtlRowDirection(lang)]} wrap={false}>
            <HeText lang={lang} style={[shared.tdBold, { flexGrow: 1 }]}>
              {copy.airbnbCreditsTotal}
            </HeText>
            <LtrText style={[shared.tdBold, { width: 80 }, rtlColumnOrder(lang)]}>
              {money(report.airbnbCredits.totalAviEur)}
            </LtrText>
          </View>
        </View>

        {/* 10. Airbnb setup — expense domain (orange; not income) */}
        <View style={shared.section} minPresenceAhead={90}>
          <AccountBar
            lang={lang}
            tone="orange"
            title={setupTitle}
            amount={money(report.airbnb.setup.totalEur)}
            amountHint={copy.propertyTotal}
          />
          <View style={[shared.kpiStrip, rtlRowDirection(lang)]} wrap={false}>
            <KpiTile
              lang={lang}
              label={copy.propertyTotal}
              value={money(report.airbnb.setup.totalEur)}
            />
            <KpiTile
              lang={lang}
              label={copy.aviShare}
              value={money(report.airbnb.setup.aviShareEur)}
            />
          </View>
          <View style={[shared.tableHeader, rtlRowDirection(lang)]} wrap={false}>
            <HeText lang={lang} style={[shared.th, { width: 78 }]}>
              {copy.month}
            </HeText>
            <HeText lang={lang} style={[shared.th, { flexGrow: 1 }]}>
              {setupTitle}
            </HeText>
            <HeText lang={lang} style={[shared.th, { width: 72 }, rtlColumnOrder(lang)]}>
              {copy.propertyTotal}
            </HeText>
          </View>
          {report.airbnb.setup.lines.map((line, i) => (
            <View
              key={`setup-${line.month}-${i}`}
              style={[shared.tableRow, rtlRowDirection(lang)]}
              wrap={false}
            >
              <View style={{ width: 78 }}>
                <PdfAviDate iso={line.month} lang={lang} mode="month" />
              </View>
              <HeText lang={lang} style={[shared.td, { flexGrow: 1 }]}>
                {labelFor(lang, line.labelEn, line.labelHe)}
              </HeText>
              <LtrText style={[shared.td, { width: 72 }, rtlColumnOrder(lang)]}>
                {money(line.amountEur)}
              </LtrText>
            </View>
          ))}
          <View style={[shared.tableTotal, rtlRowDirection(lang)]} wrap={false}>
            <HeText lang={lang} style={[shared.tdBold, { flexGrow: 1 }]}>
              {lang === 'he' ? 'סה״כ' : 'Total'}
            </HeText>
            <LtrText style={[shared.tdBold, { width: 72 }, rtlColumnOrder(lang)]}>
              {money(report.airbnb.setup.totalEur)}
            </LtrText>
          </View>
        </View>

        {/* 11. Airbnb operations — expense domain (orange) */}
        <View style={shared.section} minPresenceAhead={90}>
          <AccountBar
            lang={lang}
            tone="orange"
            title={opsTitle}
            amount={money(report.airbnb.operations.totalEur)}
            amountHint={copy.propertyTotal}
          />
          <View style={[shared.kpiStrip, rtlRowDirection(lang)]} wrap={false}>
            <KpiTile
              lang={lang}
              label={copy.propertyTotal}
              value={money(report.airbnb.operations.totalEur)}
            />
            <KpiTile
              lang={lang}
              label={copy.aviShare}
              value={money(report.airbnb.operations.aviShareEur)}
            />
          </View>
          <View style={[shared.tableHeader, rtlRowDirection(lang)]} wrap={false}>
            <HeText lang={lang} style={[shared.th, { width: 78 }]}>
              {copy.month}
            </HeText>
            <HeText lang={lang} style={[shared.th, { flexGrow: 1 }]}>
              {opsTitle}
            </HeText>
            <HeText lang={lang} style={[shared.th, { width: 72 }, rtlColumnOrder(lang)]}>
              {copy.propertyTotal}
            </HeText>
          </View>
          {report.airbnb.operations.lines.map((line, i) => (
            <View
              key={`ops-${line.month}-${i}`}
              style={[shared.tableRow, rtlRowDirection(lang)]}
              wrap={false}
            >
              <View style={{ width: 78 }}>
                <PdfAviDate iso={line.month} lang={lang} mode="month" />
              </View>
              <HeText lang={lang} style={[shared.td, { flexGrow: 1 }]}>
                {labelFor(lang, line.labelEn, line.labelHe)}
              </HeText>
              <LtrText style={[shared.td, { width: 72 }, rtlColumnOrder(lang)]}>
                {money(line.amountEur)}
              </LtrText>
            </View>
          ))}
          <View style={[shared.tableTotal, rtlRowDirection(lang)]} wrap={false}>
            <HeText lang={lang} style={[shared.tdBold, { flexGrow: 1 }]}>
              {lang === 'he' ? 'סה״כ' : 'Total'}
            </HeText>
            <LtrText style={[shared.tdBold, { width: 72 }, rtlColumnOrder(lang)]}>
              {money(report.airbnb.operations.totalEur)}
            </LtrText>
          </View>
        </View>

        {/* 12. Month by month — income domain (green) */}
        <View style={shared.section} minPresenceAhead={100}>
          <AccountBar
            lang={lang}
            tone="green"
            title={copy.monthly}
            amount={money(report.monthly.totals.incomeEur)}
            amountHint={copy.monthlyGrandTotal}
          />
          <View style={[shared.tableHeader, rtlRowDirection(lang)]} wrap={false}>
            <HeText lang={lang} style={[shared.th, { width: 78, flexGrow: 1 }]}>
              {copy.month}
            </HeText>
            <HeText lang={lang} style={[shared.th, { width: 40 }, rtlColumnOrder(lang)]}>
              {copy.staysColumn}
            </HeText>
            <HeText lang={lang} style={[shared.th, { width: 40 }, rtlColumnOrder(lang)]}>
              {copy.bookings}
            </HeText>
            <HeText lang={lang} style={[shared.th, { width: 80 }, rtlColumnOrder(lang)]}>
              {copy.income}
            </HeText>
            <HeText lang={lang} style={[shared.th, { width: 80 }, rtlColumnOrder(lang)]}>
              {copy.aviIncomeShare}
            </HeText>
          </View>
          {monthlyRows.map((row) => (
            <View
              key={row.month}
              style={[shared.tableRow, rtlRowDirection(lang)]}
              wrap={false}
            >
              <View style={{ width: 78, flexGrow: 1 }}>
                <PdfAviDate iso={row.month} lang={lang} mode="month" />
              </View>
              <LtrText style={[shared.td, { width: 40 }, rtlColumnOrder(lang)]}>
                {row.stayCount}
              </LtrText>
              <LtrText style={[shared.td, { width: 40 }, rtlColumnOrder(lang)]}>
                {row.nights}
              </LtrText>
              <LtrText style={[shared.td, { width: 80 }, rtlColumnOrder(lang)]}>
                {money(row.incomeEur)}
              </LtrText>
              <LtrText style={[shared.td, { width: 80 }, rtlColumnOrder(lang)]}>
                {money(row.aviIncomeShareEur)}
              </LtrText>
            </View>
          ))}
          {report.monthly.incomeShareRoundingAdjustmentEur !== 0 ? (
            <View style={[shared.tableRow, rtlRowDirection(lang)]} wrap={false}>
              <HeText lang={lang} style={[shared.td, { flexGrow: 1 }]}>
                {copy.roundingAdjustment}
              </HeText>
              <LtrText style={[shared.td, { width: 80 }, rtlColumnOrder(lang)]}>
                {moneySigned(report.monthly.incomeShareRoundingAdjustmentEur)}
              </LtrText>
            </View>
          ) : null}
          <View style={[shared.tableTotal, rtlRowDirection(lang)]} wrap={false}>
            <HeText lang={lang} style={[shared.tdBold, { width: 78, flexGrow: 1 }]}>
              {copy.monthlyGrandTotal}
            </HeText>
            <LtrText style={[shared.tdBold, { width: 40 }, rtlColumnOrder(lang)]}>
              {report.monthly.totals.stayCount}
            </LtrText>
            <LtrText style={[shared.tdBold, { width: 40 }, rtlColumnOrder(lang)]}>
              {report.monthly.totals.nights}
            </LtrText>
            <LtrText style={[shared.tdBold, { width: 80 }, rtlColumnOrder(lang)]}>
              {money(report.monthly.totals.incomeEur)}
            </LtrText>
            <LtrText style={[shared.tdBold, { width: 80 }, rtlColumnOrder(lang)]}>
              {money(report.monthly.totals.aviIncomeShareEur)}
            </LtrText>
          </View>
        </View>

        {/* 13. Avi payments */}
        <View style={shared.section} wrap={false} minPresenceAhead={120}>
          <AccountBar
            lang={lang}
            tone="navy"
            title={copy.payments}
            amount={money(paymentsTotal)}
            amountHint={copy.paid}
          />
          <View style={[shared.tableHeader, rtlRowDirection(lang)]}>
            <HeText lang={lang} style={[shared.th, { width: 100 }]}>
              {copy.date}
            </HeText>
            <HeText lang={lang} style={[shared.th, { flexGrow: 1 }]}>
              {copy.label}
            </HeText>
            <HeText lang={lang} style={[shared.th, { width: 80 }, rtlColumnOrder(lang)]}>
              {copy.amount}
            </HeText>
          </View>
          {payments.map((p) => (
            <View key={p.id} style={[shared.tableRow, rtlRowDirection(lang)]} wrap={false}>
              <View style={{ width: 100 }}>
                <PdfAviDate iso={p.date} lang={lang} mode="full" />
              </View>
              <HeText lang={lang} style={[shared.td, { flexGrow: 1 }]}>
                {aviPaymentPurpose(p.id, lang, p.label)}
              </HeText>
              <LtrText style={[shared.td, { width: 80 }, rtlColumnOrder(lang)]}>
                {money(p.amountEur)}
              </LtrText>
            </View>
          ))}
        </View>

        {/* 14. Final settlement — full columns */}
        <View style={[shared.section, s.settleBox]} wrap={false} minPresenceAhead={160}>
          <HeText lang={lang} style={s.settleKicker}>
            {copy.settlementKicker}
          </HeText>
          <HeText lang={lang} style={s.settleTitle}>
            {copy.finalSettlement}
          </HeText>
          <View style={[shared.tableHeader, rtlRowDirection(lang)]}>
            <HeText lang={lang} style={[shared.th, { flexGrow: 1.2 }]}>
              {copy.settlementItem}
            </HeText>
            <HeText lang={lang} style={[shared.th, { width: 62 }, rtlColumnOrder(lang)]}>
              {copy.obligation}
            </HeText>
            <HeText lang={lang} style={[shared.th, { width: 62 }, rtlColumnOrder(lang)]}>
              {copy.paid}
            </HeText>
            <HeText lang={lang} style={[shared.th, { width: 62 }, rtlColumnOrder(lang)]}>
              {copy.credits}
            </HeText>
            <HeText lang={lang} style={[shared.th, { width: 62 }, rtlColumnOrder(lang)]}>
              {copy.remaining}
            </HeText>
          </View>
          {report.finalSummary.rows.map((row) => (
            <View key={row.key} style={[shared.tableRow, rtlRowDirection(lang)]} wrap={false}>
              <HeText lang={lang} style={[shared.td, { flexGrow: 1.2 }]}>
                {labelFor(lang, row.labelEn, row.labelHe)}
              </HeText>
              <LtrText style={[shared.td, { width: 62 }, rtlColumnOrder(lang)]}>
                {money(row.obligationEur)}
              </LtrText>
              <LtrText style={[shared.td, { width: 62 }, rtlColumnOrder(lang)]}>
                {money(row.paidEur)}
              </LtrText>
              <LtrText style={[shared.td, { width: 62 }, rtlColumnOrder(lang)]}>
                {money(row.creditEur)}
              </LtrText>
              <LtrText style={[shared.td, { width: 62 }, rtlColumnOrder(lang)]}>
                {money(row.remainingEur)}
              </LtrText>
            </View>
          ))}
          <View style={[shared.tableTotal, rtlRowDirection(lang)]} wrap={false}>
            <HeText lang={lang} style={[shared.tdBold, { flexGrow: 1.2 }]}>
              {lang === 'he' ? 'סה״כ' : 'Totals'}
            </HeText>
            <LtrText style={[shared.tdBold, { width: 62 }, rtlColumnOrder(lang)]}>
              {money(report.finalSummary.obligationTotalEur)}
            </LtrText>
            <LtrText style={[shared.tdBold, { width: 62 }, rtlColumnOrder(lang)]}>
              {money(report.finalSummary.paidTotalEur)}
            </LtrText>
            <LtrText style={[shared.tdBold, { width: 62 }, rtlColumnOrder(lang)]}>
              {money(report.finalSummary.creditsTotalEur)}
            </LtrText>
            <View style={{ width: 62 }} />
          </View>
          <View style={{ marginTop: 8 }} wrap={false}>
            <MixedRtlPhrase
              lang={lang}
              leading={heroLeading}
              trailingLtr={heroAmount}
              style={{ fontSize: 12, fontWeight: 'bold', color: C.green }}
            />
            <HeText lang={lang} style={s.formula}>
              {copy.formula}
            </HeText>
            <LtrSettlementFormula
              paidEur={report.finalSummary.paidTotalEur}
              creditsEur={report.finalSummary.creditsTotalEur}
              obligationEur={report.finalSummary.obligationTotalEur}
              netEur={report.finalSummary.netEur}
              style={s.formula}
            />
            <HeText lang={lang} style={s.narrative}>
              {copy.closingNarrative}
            </HeText>
          </View>
        </View>

        <DocFooter lang={lang} generatedLabel={generatedFooter} />
      </Page>
    </Document>
  )
}

/** Spec alias — same document component. */
export const AviExternalPartnerReportPdf = AviPartnerReportPdf
