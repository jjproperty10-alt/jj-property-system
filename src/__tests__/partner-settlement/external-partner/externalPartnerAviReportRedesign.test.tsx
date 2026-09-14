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
import { AVI_PARTNER_FORBIDDEN_MARKERS } from '@/components/finance/aviReportPresentation'
import { composeAviCertifiedCanonicalFixtureReport } from '@/lib/partner-settlement/external-partner/aviCanonicalComposeFixture'
import {
  AVI_CERTIFIED_PAID_EUR,
  AVI_CERTIFIED_CREDITS_EUR,
  AVI_CERTIFIED_OBLIGATION_EUR,
  AVI_CERTIFIED_NET_EUR,
} from '@/lib/partner-settlement/external-partner/aviCertifiedIdentity'

const report = composeAviCertifiedCanonicalFixtureReport()
if (report.status !== 'certified') {
  throw new Error('fixture must certify')
}
const html = renderToStaticMarkup(
  <ExternalPartnerAviReportView report={report} audience="partner" />,
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

  it('appendix still renders certified expense rows when opened', () => {
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
    }
    expect(html).not.toContain('47817104')
    expect(html.toLowerCase()).not.toContain('localhost')
  })
})

describe('Avi redesign — Hebrew final wording', () => {
  it('keeps English default free of Hebrew owed phrase', () => {
    expect(html).not.toContain('מגיע לאבי')
    expect(html).toContain('Avi is owed')
  })
})
