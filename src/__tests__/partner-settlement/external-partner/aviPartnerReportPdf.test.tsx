/**
 * AviPartnerReportPdf — full-report contract: certified DTO ↔ PDF bindings.
 * Numeric identity locks (not string-only). No Chromium.
 */
import * as fs from 'fs'
import * as path from 'path'
import { composeAviCertifiedCanonicalFixtureReport } from '@/lib/partner-settlement/external-partner/aviCanonicalComposeFixture'
import {
  AVI_CERTIFIED_NET_EUR,
  AVI_CERTIFIED_PAID_EUR,
  AVI_CERTIFIED_CREDITS_EUR,
  AVI_CERTIFIED_OBLIGATION_EUR,
} from '@/lib/partner-settlement/external-partner/aviCertifiedIdentity'
import { AVI_REPORT_COPY } from '@/components/finance/aviReportCopy'
import { money, moneySigned } from '@/lib/pdf/aviPdfShared'
import { roundEur } from '@/lib/partner-settlement/external-partner/roundEur'

describe('AviPartnerReportPdf certified fixture contract', () => {
  const report = composeAviCertifiedCanonicalFixtureReport()

  it('A/B — same certified DTO identity for HTML and PDF consumers', () => {
    expect(report.status).toBe('certified')
    if (report.status !== 'certified') return

    const avi = report.partners.find((p) => p.partner === 'Avi')
    expect(avi?.netEur).toBe(AVI_CERTIFIED_NET_EUR)
    expect(avi?.paidEur).toBe(AVI_CERTIFIED_PAID_EUR)
    expect(avi?.creditsEur).toBe(AVI_CERTIFIED_CREDITS_EUR)
    expect(avi?.obligationEur).toBe(AVI_CERTIFIED_OBLIGATION_EUR)
    expect(report.finalSummary.netEur).toBe(AVI_CERTIFIED_NET_EUR)
    expect(report.finalSummary.paidTotalEur).toBe(AVI_CERTIFIED_PAID_EUR)
    expect(report.finalSummary.creditsTotalEur).toBe(AVI_CERTIFIED_CREDITS_EUR)
    expect(report.finalSummary.obligationTotalEur).toBe(AVI_CERTIFIED_OBLIGATION_EUR)
  })

  it('C–M — locked figures (numeric)', () => {
    expect(report.status).toBe('certified')
    if (report.status !== 'certified') return

    expect(report.acquisition.agreedTransactionValueEur).toBe(500_000)
    expect(report.acquisition.aviObligationEur).toBe(250_000)
    expect(report.acquisition.remainingEur).toBe(0)

    expect(report.purchaseExpenses.totalEur).toBe(11_900)
    expect(report.purchaseExpenses.aviShareEur).toBe(5_950)
    expect(report.purchaseExpenses.aviPaidEur).toBe(5_600)
    expect(report.purchaseExpenses.aviRemainingEur).toBe(350)
    expect(report.purchaseExpenses.lines).toHaveLength(4)

    expect(report.renovation.certifiedChargeEur).toBe(72_214.14)
    expect(report.renovation.aviShareEur).toBe(36_107.07)
    expect(report.renovation.aviPaidEur).toBe(25_000)
    expect(report.renovation.aviRemainingEur).toBe(11_107.07)
    expect(report.renovation.groups.length).toBeGreaterThan(0)

    expect(report.airbnb.setup.totalEur).toBe(5_706.06)
    expect(report.airbnb.setup.aviShareEur).toBe(2_853.03)
    expect(report.airbnb.setup.lines.length).toBeGreaterThan(10)
    expect(report.airbnb.operations.totalEur).toBe(9_181.8)
    expect(report.airbnb.operations.aviShareEur).toBe(4_590.9)
    expect(report.airbnb.operations.lines.length).toBeGreaterThan(20)
    expect(report.airbnb.totalEur).toBe(14_887.86)
    expect(report.airbnb.aviShareEur).toBe(7_443.93)

    expect(report.airbnbCredits.privateBookingTotalEur).toBe(1_360)
    expect(report.airbnbCredits.privateBookingAviEur).toBe(680)
    expect(report.hostawayIncome.printedNtoTotalEur).toBe(37_630.5)
    expect(report.hostawayIncome.aviShareEur).toBe(18_815.25)
    expect(report.hostawayIncome.stayCount).toBe(28)
    expect(report.hostawayIncome.nights).toBe(149)
    expect(
      roundEur(
        report.airbnbCredits.hostawayAviEur + report.airbnbCredits.privateBookingAviEur,
      ),
    ).toBe(19_495.25)
    expect(report.airbnbCredits.totalAviEur).toBe(19_495.25)

    expect(report.partnerPayments.reduce((s, p) => s + (p.amountEur ?? 0), 0)).toBe(280_600)
    expect(report.finalSummary.obligationTotalEur).toBe(299_501)
    expect(report.finalSummary.netEur).toBe(594.25)
    expect(
      report.finalSummary.paidTotalEur +
        report.finalSummary.creditsTotalEur -
        report.finalSummary.obligationTotalEur,
    ).toBeCloseTo(594.25, 2)

    expect(report.monthly.totals.incomeEur).toBe(38_990.5)
    expect(report.monthly.totals.aviIncomeShareEur).toBe(19_495.25)
    expect(report.monthly.incomeShareRoundingAdjustmentEur).toBeCloseTo(-0.03, 2)

    expect(report.snapshot.cutoffDate).toBe('2026-08-29')
    expect(report.visibleExpenseTotals.rowCount).toBe(179)
  })

  it('F/G — cutoff Aug 2026; no September 2026 activity months', () => {
    expect(report.status).toBe('certified')
    if (report.status !== 'certified') return
    expect(report.snapshot.cutoffDate).toBe('2026-08-29')
    expect(report.monthly.rows.some((r) => r.month === '2026-09')).toBe(false)
    expect(report.airbnb.operations.lines.some((l) => l.month === '2026-09')).toBe(false)
    expect(report.airbnb.setup.lines.some((l) => l.month === '2026-09')).toBe(false)
    expect(report.hostawayIncome.stays.some((s) => s.checkIn.startsWith('2026-09'))).toBe(
      false,
    )
  })

  it('final settlement rows expose obligation/paid/credits (not remaining-only)', () => {
    expect(report.status).toBe('certified')
    if (report.status !== 'certified') return
    const byKey = Object.fromEntries(report.finalSummary.rows.map((r) => [r.key, r]))
    expect(byKey.acquisition).toMatchObject({
      obligationEur: 250_000,
      paidEur: 250_000,
      remainingEur: 0,
    })
    expect(byKey.purchase_expenses).toMatchObject({
      obligationEur: 5_950,
      paidEur: 5_600,
      remainingEur: 350,
    })
    expect(byKey.renovation).toMatchObject({
      obligationEur: 36_107.07,
      paidEur: 25_000,
      remainingEur: 11_107.07,
    })
    expect(byKey.airbnb_setup).toMatchObject({
      obligationEur: 2_853.03,
      remainingEur: 2_853.03,
    })
    expect(byKey.airbnb_operations).toMatchObject({
      obligationEur: 4_590.9,
      remainingEur: 4_590.9,
    })
    expect(byKey.income_credits?.creditEur).toBe(19_495.25)
    expect(byKey.income_credits?.obligationEur).toBeNull()
  })

  it('D/E/U — forbidden amounts and privacy markers absent from PDF source + DTO surface', () => {
    expect(report.status).toBe('certified')
    if (report.status !== 'certified') return
    const pdfSrc = fs.readFileSync(
      path.join(process.cwd(), 'src/lib/pdf/AviPartnerReportPdf.tsx'),
      'utf8',
    )
    const sharedSrc = fs.readFileSync(
      path.join(process.cwd(), 'src/lib/pdf/aviPdfShared.tsx'),
      'utf8',
    )
    const blob = JSON.stringify(report) + pdfSrc + sharedSrc
    expect(blob).not.toMatch(/400[, ]?000|€400,000|400000/)
    expect(blob).not.toContain('740.94')
    expect(blob).not.toContain('654.25')
    expect(pdfSrc).not.toMatch(/guestName|confirmationCode|payer|payee/)
    expect(pdfSrc).not.toMatch(/localhost|vercel\.app|fixture|Preview/)
  })

  it('N/P/Q — PDF source is full-detail react-pdf (not 2-page summary) with JJ footer', () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), 'src/lib/pdf/AviPartnerReportPdf.tsx'),
      'utf8',
    )
    const sharedSrc = fs.readFileSync(
      path.join(process.cwd(), 'src/lib/pdf/aviPdfShared.tsx'),
      'utf8',
    )
    expect(src).toContain('@react-pdf/renderer')
    expect(src).toContain('purchaseExpenses.lines')
    expect(src).toContain('renovation.groups')
    expect(src).toContain('airbnb.setup.lines')
    expect(src).toContain('airbnb.operations.lines')
    expect(src).toContain('monthly.rows')
    expect(src).toContain('finalSummary.rows')
    expect(src).toContain('obligationEur')
    expect(src).toContain('creditEur')
    expect(src).toContain('visibleExpenseTotals.rowCount')
    expect(src).toContain('pageNumber')
    expect(src).toContain('totalPages')
    expect(src).toContain('footerConfidential')
    expect(src).toContain(AVI_REPORT_COPY.en.pageOf)
    expect(sharedSrc).toContain('PdfGap')
    expect(sharedSrc).toContain('LtrSettlementFormula')
    expect(sharedSrc).toContain('minWidth')
    expect(sharedSrc).not.toMatch(/\$\{p\.day\}\\u00a0/)
    expect(src).not.toMatch(/\bpuppeteer\b|\bchromium\b|setContent|page\.goto|\bwindow\.print\b/)
  })

  it('O — HE/EN copy share locked formula and net', () => {
    expect(AVI_REPORT_COPY.en.closingNarrative).toContain('€594.25')
    expect(AVI_REPORT_COPY.he.closingNarrative).toContain('€594.25')
    expect(AVI_REPORT_COPY.en.formula).toContain('Paid')
    expect(AVI_REPORT_COPY.he.formula).toContain('שולם')
  })

  it('V — rounding adjustment keeps its sign so it reconciles to the total', () => {
    expect(report.status).toBe('certified')
    if (report.status !== 'certified') return

    const adjustment = report.monthly.incomeShareRoundingAdjustmentEur
    const rowsSum = report.monthly.rows.reduce((s, r) => s + r.aviIncomeShareEur, 0)
    expect(roundEur(rowsSum + adjustment)).toBe(report.monthly.totals.aviIncomeShareEur)
    expect(adjustment).toBeLessThan(0)

    // `money` drops the sign by design; a signed value must not use it.
    expect(money(adjustment)).toBe('€0.03')
    expect(moneySigned(adjustment)).toBe('-€0.03')

    const src = fs.readFileSync(
      path.join(process.cwd(), 'src/lib/pdf/AviPartnerReportPdf.tsx'),
      'utf8',
    )
    expect(src).toContain('moneySigned(report.monthly.incomeShareRoundingAdjustmentEur)')
    expect(src).not.toContain('money(report.monthly.incomeShareRoundingAdjustmentEur)')
  })
})
