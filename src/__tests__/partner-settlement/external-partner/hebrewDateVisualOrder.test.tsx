/**
 * Hebrew date visual-order + partner PDF presentation guards.
 * Presentation only — no settlement math.
 */
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  AviReportDate,
  HEBREW_DATE_FORBIDDEN_SEQUENCES,
  HebrewCutoffSentence,
  HebrewFullDate,
  HebrewGeneratedSentence,
  formatHebrewCutoffSentenceText,
  formatHebrewFullDateText,
  formatHebrewGeneratedSentenceText,
} from '@/components/finance/HebrewDate'
import { ExternalPartnerAviReportView } from '@/components/finance/ExternalPartnerAviReportView'
import { AVI_REPORT_PRINT_CSS } from '@/components/finance/aviReportPrintCss'
import { AVI_REPORT_COPY, formatAviFullDate } from '@/components/finance/aviReportCopy'
import { composeAviCertifiedCanonicalFixtureReport } from '@/lib/partner-settlement/external-partner/aviCanonicalComposeFixture'
import {
  AVI_CERTIFIED_CREDITS_EUR,
  AVI_CERTIFIED_NET_EUR,
  AVI_CERTIFIED_OBLIGATION_EUR,
  AVI_CERTIFIED_PAID_EUR,
} from '@/lib/partner-settlement/external-partner/aviCertifiedIdentity'

const GENERATED_ISO = '2026-09-14'
const CUTOFF_ISO = '2026-08-29'

const PAYMENT_DATES = [
  '2024-06-16',
  '2024-10-10',
  '2024-11-16',
  '2025-07-10',
] as const

describe('HebrewDate — exact visual-order text', () => {
  it('formats generated / cutoff / payment dates exactly', () => {
    expect(formatHebrewGeneratedSentenceText(GENERATED_ISO)).toBe('הופק ב־14 בספטמבר 2026')
    expect(formatHebrewCutoffSentenceText(CUTOFF_ISO)).toBe('עסקאות בספר עד 29 באוגוסט 2026')
    expect(formatHebrewFullDateText('2024-06-16')).toBe('16 ביוני 2024')
    expect(formatHebrewFullDateText('2024-10-10')).toBe('10 באוקטובר 2024')
    expect(formatHebrewFullDateText('2024-11-16')).toBe('16 בנובמבר 2024')
    expect(formatHebrewFullDateText('2025-07-10')).toBe('10 ביולי 2025')
  })

  it('renders segmented DOM in day → month → year order', () => {
    const html = renderToStaticMarkup(<HebrewFullDate iso="2024-06-16" />)
    expect(html).toContain('data-avi-he-date="full"')
    expect(html).toContain('data-avi-he-date-text="16 ביוני 2024"')
    expect(html).toMatch(
      /data-avi-he-seg="day"[^>]*>16[\s\S]*data-avi-he-seg="month"[^>]*>ביוני[\s\S]*data-avi-he-seg="year"[^>]*>2024/,
    )
    expect(html).not.toContain('16 2024 ביוני')

    const generated = renderToStaticMarkup(<HebrewGeneratedSentence iso={GENERATED_ISO} />)
    expect(generated).toContain('data-avi-he-sentence="הופק ב־14 בספטמבר 2026"')
    expect(generated).toContain('הופק ב־')
    expect(generated).toMatch(
      /data-avi-he-prefix="generated"[\s\S]*data-avi-he-seg="day"[^>]*>14[\s\S]*data-avi-he-seg="month"[^>]*>בספטמבר[\s\S]*data-avi-he-seg="year"[^>]*>2026/,
    )

    const cutoff = renderToStaticMarkup(<HebrewCutoffSentence iso={CUTOFF_ISO} />)
    expect(cutoff).toContain('data-avi-he-sentence="עסקאות בספר עד 29 באוגוסט 2026"')
    expect(cutoff).toMatch(
      /data-avi-he-prefix="cutoff"[\s\S]*data-avi-he-seg="day"[^>]*>29[\s\S]*data-avi-he-seg="month"[^>]*>באוגוסט[\s\S]*data-avi-he-seg="year"[^>]*>2026/,
    )
  })

  it('never emits forbidden day-year-month sequences', () => {
    const samples = [
      renderToStaticMarkup(<HebrewGeneratedSentence iso={GENERATED_ISO} />),
      renderToStaticMarkup(<HebrewCutoffSentence iso={CUTOFF_ISO} />),
      ...PAYMENT_DATES.map((iso) => renderToStaticMarkup(<HebrewFullDate iso={iso} />)),
      ...PAYMENT_DATES.map((iso) =>
        renderToStaticMarkup(<AviReportDate iso={iso} lang="he" mode="full" />),
      ),
    ].join('\n')
    for (const bad of HEBREW_DATE_FORBIDDEN_SEQUENCES) {
      expect(samples).not.toContain(bad)
    }
  })
})

describe('Avi Hebrew partner HTML — presentation QA', () => {
  const report = composeAviCertifiedCanonicalFixtureReport()
  if (report.status !== 'certified') throw new Error('fixture must certify')

  const enHtml = renderToStaticMarkup(
    <ExternalPartnerAviReportView report={report} audience="partner" />,
  )
  const heHtml = renderToStaticMarkup(
    <ExternalPartnerAviReportView report={report} audience="partner" initialLang="he" />,
  )

  it('keeps certified identity €740.94', () => {
    expect(AVI_CERTIFIED_PAID_EUR).toBe(280600)
    expect(AVI_CERTIFIED_CREDITS_EUR).toBe(19744.44)
    expect(AVI_CERTIFIED_OBLIGATION_EUR).toBe(299603.5)
    expect(AVI_CERTIFIED_NET_EUR).toBe(740.94)
    const avi = report.partners.find((p) => p.partner === 'Avi')!
    expect(avi.netEur).toBe(740.94)
    expect(enHtml).toContain('740.94')
    expect(heHtml).toContain('740.94')
    expect(heHtml).toContain('280,600.00')
    expect(heHtml).toContain('19,744.44')
    expect(heHtml).toContain('299,603.50')
  })

  it('includes print footer and page numbering hooks', () => {
    expect(heHtml).toContain('data-testid="avi-print-footer"')
    expect(heHtml).toContain('data-testid="avi-print-page-num"')
    expect(heHtml).toContain('avi-page-number')
    expect(heHtml).toContain('avi-page-count')
    expect(AVI_REPORT_PRINT_CSS).toContain('avi-print-footer')
    expect(heHtml).toContain('data-avi-footer-copy')
  })

  it('omits forbidden chrome / PII markers from partner HTML', () => {
    for (const html of [enHtml, heHtml]) {
      expect(html).not.toMatch(/\b1 error\b/i)
      expect(html.toLowerCase()).not.toContain('localhost')
      expect(html).not.toContain('127.0.0.1')
      expect(html).not.toContain('Tomer Niazof')
      expect(html).not.toContain('46340130')
      expect(html).not.toMatch(/\bPreview\b/)
      expect(html.toLowerCase()).not.toContain('fixture')
    }
  })

  it('drops payer column from payments (Date | Purpose | Amount only)', () => {
    const enPay = enHtml.split('data-testid="avi-payment-table"')[1] ?? ''
    const hePay = heHtml.split('data-testid="avi-payment-table"')[1] ?? ''
    expect(enPay).toContain('>Date<')
    expect(enPay).toContain('>Purpose<')
    expect(enPay).toContain('>Amount<')
    expect(enPay).not.toContain('>Payer<')
    expect(hePay).toContain('>תאריך<')
    expect(hePay).toContain('>ייעוד<')
    expect(hePay).toContain('>סכום<')
    expect(hePay).not.toContain('>משלם<')
    expect(hePay).not.toContain('>Payer<')
  })

  it('uses required Hebrew copy phrases in HE HTML', () => {
    expect(heHtml).toContain('הכנסות Airbnb')
    expect(heHtml).toContain('הכנסות Hostaway')
    expect(heHtml).toContain('תשלום נטו לבעלים (Net Owner Payout)')
    expect(heHtml).toContain('חלק אבי בהוצאות')
    expect(heHtml).toContain('הוצאות מאושרות לאחר רכישת חלקו')
    expect(heHtml).toContain('יתרות לאחר הרכישה')
    expect(heHtml).toContain('תפעול Airbnb — המשך')
    expect(heHtml).toContain('עסקאות בספר עד')
    expect(heHtml).toContain('data-avi-he-sentence="עסקאות בספר עד 29 באוגוסט 2026"')
    expect(AVI_REPORT_COPY.en.operationsContinued).toBe('Airbnb operations — continued')
    // Ownership display names (IDs unchanged)
    expect(heHtml).toContain('אבי')
    expect(heHtml).toContain('יוסי')
    expect(heHtml).toContain('יעקב')
    expect(heHtml).toContain('חודש כניסה לנכס')
    expect(heHtml).toContain('עלות לנכס')
    expect(heHtml).toContain('סיכום התחשבנות')
    expect(heHtml).toContain('לא מאושר בדוח זה')
    expect(heHtml).not.toContain('צ׳ק-אין')
    expect(heHtml).not.toContain('שכבות התחשבנות')
  })

  it('HE HTML rejects forbidden date sequences and uses payment date segments', () => {
    for (const bad of HEBREW_DATE_FORBIDDEN_SEQUENCES) {
      expect(heHtml).not.toContain(bad)
    }
    expect(heHtml).toContain('data-avi-he-date-text="16 ביוני 2024"')
    expect(heHtml).toContain('data-avi-he-date-text="10 באוקטובר 2024"')
    expect(heHtml).toContain('data-avi-he-date-text="16 בנובמבר 2024"')
    expect(heHtml).toContain('data-avi-he-date-text="10 ביולי 2025"')
    expect(formatAviFullDate(GENERATED_ISO, 'he')).toBe('14 בספטמבר 2026')
    expect(formatAviFullDate(CUTOFF_ISO, 'he')).toBe('29 באוגוסט 2026')
  })

  it('certified payment dates match required HE strings', () => {
    const dates = report.partnerPayments.map((p) => p.date).sort()
    expect(dates).toEqual(
      ['2024-06-16', '2024-10-10', '2024-11-16', '2024-11-16', '2025-07-10'].sort(),
    )
    for (const p of report.partnerPayments) {
      const text = formatHebrewFullDateText(p.date)
      expect(text).toMatch(/^\d{1,2} ב\S+ \d{4}$/)
      expect(text).not.toMatch(/\d{1,2} \d{4} ב/)
    }
  })
})
