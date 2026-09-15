/**
 * Presentation redesign guards for the certified Avi partner report.
 * No settlement math — HTML/print shape and locked identity only.
 */
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  ExternalPartnerAviReportView,
  AviCertifiedExpenseAppendix,
} from '@/components/finance/ExternalPartnerAviReportView'
import { AVI_REPORT_PRINT_CSS } from '@/components/finance/aviReportPrintCss'
import { AVI_REPORT_COLORS } from '@/components/finance/aviReportTokens'
import { AVI_PARTNER_FORBIDDEN_MARKERS } from '@/components/finance/aviReportPresentation'
import { composeAviCertifiedCanonicalFixtureReport } from '@/lib/partner-settlement/external-partner/aviCanonicalComposeFixture'
import {
  AVI_CERTIFIED_PAID_EUR,
  AVI_CERTIFIED_CREDITS_EUR,
  AVI_CERTIFIED_OBLIGATION_EUR,
  AVI_CERTIFIED_NET_EUR,
} from '@/lib/partner-settlement/external-partner/aviCertifiedIdentity'
import {
  AVI_AIRBNB_SETUP_TOTAL_EUR,
  AVI_AIRBNB_SETUP_AVI_EUR,
  AVI_AIRBNB_OPERATIONS_TOTAL_EUR,
  AVI_AIRBNB_OPERATIONS_AVI_EUR,
  AVI_AIRBNB_CHARGE_TOTAL_EUR,
  AVI_AIRBNB_CHARGE_AVI_EUR,
  AVI_INTERNET_SPLIT_ROW,
} from '@/lib/partner-settlement/external-partner/aviAirbnbDepartments'
import {
  AVI_HOSTAWAY_STAY_COUNT,
  AVI_HOSTAWAY_NIGHTS,
  AVI_HOSTAWAY_UNION_NTO_EUR,
  AVI_HOSTAWAY_LAST_CHECKOUT_DATE,
} from '@/lib/partner-settlement/external-partner/aviHostawayStays'
import type { ExternalPartnerAviReport } from '@/lib/partner-settlement/external-partner/externalPartnerAviReportTypes'

const report = composeAviCertifiedCanonicalFixtureReport()
if (report.status !== 'certified') {
  throw new Error('fixture must certify')
}
const html = renderToStaticMarkup(
  <ExternalPartnerAviReportView report={report} audience="partner" />,
)
const heHtml = renderToStaticMarkup(
  <ExternalPartnerAviReportView report={report} audience="partner" initialLang="he" />,
)

describe('Avi redesign — locked identity', () => {
  it('keeps Paid / Credits / Obligation / Net anchors', () => {
    expect(AVI_CERTIFIED_PAID_EUR).toBe(280600)
    expect(AVI_CERTIFIED_CREDITS_EUR).toBe(19744.44)
    expect(AVI_CERTIFIED_OBLIGATION_EUR).toBe(299603.5)
    expect(AVI_CERTIFIED_NET_EUR).toBe(740.94)
    const avi = report.partners.find((p) => p.partner === 'Avi')!
    expect(avi.paidEur).toBe(280600)
    expect(avi.creditsEur).toBe(19744.44)
    expect(avi.obligationEur).toBe(299603.5)
    expect(avi.netEur).toBe(740.94)
    expect(html).toContain('740.94')
    expect(html).toContain('Avi is owed')
    expect(
      Number((avi.paidEur! + avi.creditsEur! - avi.obligationEur!).toFixed(2)),
    ).toBe(740.94)
  })

  it('keeps Setup / Operations / Airbnb totals unchanged', () => {
    expect(AVI_AIRBNB_SETUP_TOTAL_EUR).toBe(5706.06)
    expect(AVI_AIRBNB_SETUP_AVI_EUR).toBe(2853.03)
    expect(AVI_AIRBNB_OPERATIONS_TOTAL_EUR).toBe(9386.8)
    expect(AVI_AIRBNB_OPERATIONS_AVI_EUR).toBe(4693.4)
    expect(AVI_AIRBNB_CHARGE_TOTAL_EUR).toBe(15092.86)
    expect(AVI_AIRBNB_CHARGE_AVI_EUR).toBe(7546.43)
    expect(report.airbnb.setup.totalEur).toBe(5706.06)
    expect(report.airbnb.operations.totalEur).toBe(9386.8)
    expect(
      Number(
        (report.airbnb.setup.totalEur + report.airbnb.operations.totalEur).toFixed(2),
      ),
    ).toBe(15092.86)
    expect(
      Number(
        (report.airbnb.setup.aviShareEur + report.airbnb.operations.aviShareEur).toFixed(2),
      ),
    ).toBe(7546.43)
  })

  it('keeps Hostaway aggregation 29 / 152 / €38,128.87', () => {
    expect(AVI_HOSTAWAY_STAY_COUNT).toBe(29)
    expect(AVI_HOSTAWAY_NIGHTS).toBe(152)
    expect(AVI_HOSTAWAY_UNION_NTO_EUR).toBe(38128.87)
    expect(report.hostawayIncome.stayCount).toBe(29)
    expect(report.hostawayIncome.nights).toBe(152)
    expect(report.hostawayIncome.printedNtoTotalEur).toBe(38128.87)
    expect(html).toContain('29')
    expect(html).toContain('152')
    expect(html).toContain('38,128.87')
    expect(AVI_HOSTAWAY_LAST_CHECKOUT_DATE).toBe('2026-09-06')
  })
})

describe('Avi redesign — bilingual final wording', () => {
  it('English contains Avi is owed €740.94', () => {
    expect(html).toContain('Avi is owed €740.94')
    expect(html).not.toContain('מגיע לאבי')
  })

  it('Hebrew final semantic contains מגיע לאבי and not Avi is owed', () => {
    expect(heHtml).toContain('מגיע לאבי')
    expect(heHtml).not.toContain('Avi is owed')
  })

  it('localizes the print control', () => {
    expect(html).toContain('Print / Save PDF')
    expect(heHtml).toContain('הדפסה / שמירה כ־PDF')
  })
})

describe('Avi redesign — dates', () => {
  it('shows full payment dates', () => {
    expect(html).toMatch(/\d{1,2} \w+ \d{4}/)
    expect(heHtml).toContain('data-avi-he-date="full"')
  })

  it('uses month/year only for expense and monthly rows', () => {
    expect(html).toContain('data-avi-month-label')
    expect(heHtml).toContain('data-avi-he-date="month-year"')
    for (const row of report.monthly.rows) {
      expect(row.month).toMatch(/^\d{4}-\d{2}$/)
    }
  })

  it('renders an income-month label for every month that has income or stays', () => {
    const incomeMonths = report.monthly.rows.filter((row) => row.incomeEur !== 0 || row.stayCount > 0)
    const monthLabelCount = (html.match(/data-avi-month-label/g) ?? []).length
    expect(monthLabelCount).toBe(incomeMonths.length)
    expect(incomeMonths.some((row) => row.month === '2026-09')).toBe(true)
  })

  it('shows ledger cutoff 29 August and Hostaway income through 6 September', () => {
    expect(html).toContain('data-testid="avi-print-cutoff"')
    expect(html).toContain('Ledger transactions through')
    expect(html).toContain('29 August 2026')
    expect(html).toContain('data-testid="avi-hostaway-period"')
    expect(html).toContain('Hostaway income through')
    expect(html).toContain('6 September 2026')
    expect(heHtml).toContain('data-avi-he-sentence="עסקאות בספר עד 29 באוגוסט 2026"')
    expect(heHtml).toContain('הכנסות Hostaway עד')
    expect(heHtml).toContain('data-avi-he-date-text="6 בספטמבר 2026"')
  })
})

describe('Avi redesign — monthly rounding bridge', () => {
  it('keeps the engine net-of-expense halves and −€0.05 bridge for identity, but the income table shows 50% of income', () => {
    const rowSum = Math.round(
      report.monthly.rows.reduce((s, r) => s + r.aviResultEur, 0) * 100,
    ) / 100
    expect(rowSum).toBe(12198.06)
    expect(report.monthly.roundingAdjustmentEur).toBe(-0.05)
    expect(report.monthly.totals.aviResultEur).toBe(12198.01)
    expect(Math.round((rowSum + report.monthly.roundingAdjustmentEur) * 100) / 100).toBe(12198.01)
    expect(report.monthly.totals.aviIncomeShareEur).toBe(19744.44)
    const incomeShareSum = Math.round(
      report.monthly.rows.reduce((s, r) => s + r.aviIncomeShareEur, 0) * 100,
    ) / 100
    expect(
      Math.round((incomeShareSum + report.monthly.incomeShareRoundingAdjustmentEur) * 100) / 100,
    ).toBe(19744.44)
  })

  it('pluralizes stay and night labels', () => {
    expect(html).toContain('1 stay · 1 night')
    expect(html).toContain('1 stay · 3 nights')
    expect(html).not.toContain('1 stays · 1 nights')
    expect(heHtml).toContain('שהייה אחת · לילה אחד')
    expect(heHtml).toContain('שהייה אחת · 3 לילות')
    expect(heHtml).not.toContain('1 שהיות · 1 לילות')
  })
})

describe('Avi redesign — monthly grand total once', () => {
  it('shows €39,488.87 once as the monthly grand total and not as Final result', () => {
    const incomeTotal = report.monthly.totals.incomeEur
    expect(incomeTotal).toBe(39488.87)
    expect(
      Number(
        (report.airbnbCredits.hostawayPrintedNtoTotalEur +
          report.airbnbCredits.privateBookingTotalEur).toFixed(2),
      ),
    ).toBe(39488.87)
    const occurrences = (html.match(/39,488\.87/g) ?? []).length
    expect(occurrences).toBeGreaterThanOrEqual(1)
    expect(html).toContain('data-testid="avi-monthly-totals"')
    expect(html).toContain('Grand total')
    const monthlyBlock = html.slice(
      html.indexOf('data-testid="avi-monthly"'),
      html.indexOf('data-testid="avi-expense-appendix-link"'),
    )
    expect(monthlyBlock).not.toContain('>Final result<')
    expect(monthlyBlock).not.toContain('>Airbnb operations<')
    expect(monthlyBlock).not.toContain('>Airbnb setup<')
    expect(monthlyBlock).toContain('>Income<')
    expect(monthlyBlock).toContain('>Avi income share (50%)<')
    expect(monthlyBlock).toContain('19,744.44')
  })
})

describe('Avi redesign — settlement boxes', () => {
  it('puts amount above Obligation / Paid / Summary under the accounts table', () => {
    const block = html.slice(
      html.indexOf('data-testid="avi-final-summary"'),
      html.indexOf('data-testid="avi-expense-appendix-link"') > html.indexOf('data-testid="avi-final-summary"')
        ? html.indexOf('data-testid="avi-expense-appendix-link"')
        : html.length,
    )
    const ops = block.slice(block.indexOf('class="avi-fin-ops"'))
    expect(ops.indexOf('avi-fin-ops-value')).toBeGreaterThan(-1)
    expect(ops.indexOf('avi-fin-ops-value')).toBeLessThan(ops.indexOf('avi-fin-ops-label'))
    expect(block).toContain('>Obligation<')
    expect(block).toContain('>Paid<')
    expect(block).toContain('>Summary<')
    expect(block).toContain('>Item<')
    expect(block).toContain('Settlement summary')
    expect(block).toContain('299,603.50')
    expect(block).toContain('280,600.00')
    expect(block).toContain('740.94')
    expect(heHtml).toContain('>התחייבות<')
    expect(heHtml).toContain('>שולם<')
    expect(heHtml).toContain('>סיכום<')
    expect(heHtml).toContain('>סעיף<')
    expect(heHtml).toContain('סיכום התחשבנות')
  })
})

describe('Avi redesign — month column print-safe', () => {
  it('renders month labels outside buttons', () => {
    expect(html).toContain('data-avi-month-label')
    expect(AVI_REPORT_PRINT_CSS).toContain('avi-print-hide')
    expect(AVI_REPORT_PRINT_CSS).not.toContain('button {')
  })
})

describe('Avi redesign — appendix split', () => {
  it('keeps the 180-row dump out of the main report', () => {
    expect(html).not.toContain('data-testid="avi-expense-table"')
    expect(html).toContain('data-testid="avi-expense-appendix-link"')
    expect(html).not.toContain('180 certified')
  })

  it('appendix remains separate and still renders certified expense rows', () => {
    const appendix = renderToStaticMarkup(
      <AviCertifiedExpenseAppendix
        expenses={report.partnerExpenses}
        totals={report.visibleExpenseTotals}
        layers={report.layers}
        completeness={report.expenseCompleteness}
        lang="en"
      />,
    )
    expect(appendix).toContain('data-testid="avi-expense-table"')
    expect(report.partnerExpenses).toHaveLength(180)
  })
})

describe('Avi redesign — privacy and forbidden markers', () => {
  it('omits internal markers from partner HTML', () => {
    for (const marker of AVI_PARTNER_FORBIDDEN_MARKERS) {
      if (marker === 'Preview' || marker === 'fixture') continue
      expect(html).not.toContain(marker)
      expect(heHtml).not.toContain(marker)
    }
    expect(html).not.toContain('47817104')
    expect(html.toLowerCase()).not.toContain('localhost')
    expect(html).not.toContain('Tomer Niazof')
  })

  it('omits fixture/localhost/Preview/dev error text from printable content', () => {
    expect(AVI_REPORT_PRINT_CSS).toContain('avi-print-hide')
    expect(html).not.toContain('1 error')
    expect(html.toLowerCase()).not.toContain('localhost')
  })
})

describe('Avi redesign — internet split presentation', () => {
  it('keeps €325 = €295 Setup + €30 Operations without duplication', () => {
    expect(AVI_INTERNET_SPLIT_ROW.ledgerAmountEur).toBe(325)
    expect(AVI_INTERNET_SPLIT_ROW.installationEur).toBe(295)
    expect(AVI_INTERNET_SPLIT_ROW.firstMonthEur).toBe(30)
    expect(html).toContain('data-testid="avi-internet-split-note"')
    expect(html).toContain('295.00')
    expect(html).toContain('30.00')
    expect(report.airbnb.setup.lines.some((l) => l.amountEur === 325)).toBe(false)
    expect(report.airbnb.operations.lines.some((l) => l.amountEur === 325)).toBe(false)
  })
})

describe('Avi redesign — client-report visual family', () => {
  it('reuses RC3 navy palette and Heebo print faces', () => {
    expect(AVI_REPORT_COLORS.navy).toBe('#1e3a5f')
    expect(AVI_REPORT_COLORS.orange).toBe('#c2410c')
    expect(AVI_REPORT_COLORS.purple).toBe('#6d28d9')
    expect(AVI_REPORT_COLORS.blue).toBe('#1d4ed8')
    expect(AVI_REPORT_PRINT_CSS).toContain("font-family: 'Heebo'")
    expect(AVI_REPORT_PRINT_CSS).toContain(AVI_REPORT_COLORS.navy)
    expect(AVI_REPORT_PRINT_CSS).toContain('avi-fin-summary')
    expect(AVI_REPORT_PRINT_CSS).toContain('avi-account-bar')
    expect(AVI_REPORT_PRINT_CSS).toContain('avi-kpi-strip')
    expect(AVI_REPORT_PRINT_CSS).toContain('avi-settlement-box')
    expect(html).toContain('avi-final-hero')
    expect(html).toContain('avi-doc-masthead')
    expect(html).toContain('avi-fin-summary')
    expect(html).toContain('avi-account-bar')
    expect(html).toContain('avi-kpi-strip')
    expect(html).toContain('avi-settlement-box')
    expect(html).toContain('avi-section')
    expect(html).toContain('data-tone="orange"')
    expect(html).toContain('data-tone="purple"')
    expect(html).toContain('data-tone="blue"')
  })
})

describe('Avi redesign — fail-closed', () => {
  it('failed report does not render certified content', () => {
    const failed: Extract<ExternalPartnerAviReport, { status: 'failed' }> = {
      status: 'failed',
      property: 'Villa Mazotos',
      controlStatus: {
        reconciliationPassed: false,
        settlementComputed: false,
        attributionOk: false,
        failures: ['evidence_mismatch'],
      },
      failures: ['evidence_mismatch'],
    }
    const failedHtml = renderToStaticMarkup(
      <ExternalPartnerAviReportView report={failed} audience="partner" />,
    )
    expect(failedHtml).not.toContain('Avi is owed')
    expect(failedHtml).not.toContain('740.94')
    expect(failedHtml).not.toContain('280,600')
    expect(failedHtml).not.toContain('data-testid="avi-final-hero"')
    expect(failedHtml).not.toContain('data-testid="avi-payment-table"')
    expect(failedHtml).toContain('Report Failed')
  })
})
