/**
 * Printable certified Avi External Partner report.
 * Visual fixture is compose(canonical 202-row evidence). No second report object.
 * Browser-native print (window.print + @media print). No second financial engine.
 */
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import * as fs from 'fs'
import * as path from 'path'
import { ExternalPartnerAviReportView } from '@/components/finance/ExternalPartnerAviReportView'
import { AviReportPrintButton } from '@/components/finance/AviReportPrintButton'
import { AVI_REPORT_PRINT_CSS } from '@/components/finance/aviReportPrintCss'
import {
  composeExternalPartnerAviReport,
  AVI_GARDENER_ID,
  AVI_MONTHLY_POOL_AVI_SHARE_EUR,
  AVI_MONTHLY_POOL_CHARGE_EUR,
  AVI_PENDING_POOL_MONTHS,
  AVI_POOL_EQUIPMENT_ID,
  pendingPoolInvoiceId,
} from '@/lib/partner-settlement/external-partner'
import { TX } from './aviGoldenFixture'
import { approvedComposeInputFromCanonicalEvidence } from './aviApprovedComposeInput'

const FUNDING_PAYMENT_IDS = [
  TX.aviPurchaseFunding,
  TX.aviPremium,
  TX.aviToJacob,
  TX.aviReno5000,
  TX.aviReno20000,
] as const

const PRINT_SRC_FILES = [
  'src/components/finance/ExternalPartnerAviReportView.tsx',
  'src/components/finance/AviReportPrintButton.tsx',
  'src/components/finance/aviReportPrintCss.ts',
  'src/components/finance/aviReportCopy.ts',
  'src/app/(app)/finance/external-partner/avi/page.tsx',
]

describe('Avi print view — certified DTO, no second formula', () => {
  it('print modules do not implement a second financial formula or PDF engine', () => {
    const forbidden = [
      'roundEur',
      'allocateAviShares',
      'composeExternalPartnerSettlement',
      'composeExternalPartnerAviReport',
      '@react-pdf',
      'renderToBuffer',
      '* 0.5',
      '/ 2',
      'ownershipPct / 100',
    ]
    for (const rel of PRINT_SRC_FILES) {
      const text = fs.readFileSync(path.join(process.cwd(), rel), 'utf8')
      for (const needle of forbidden) {
        expect(text).not.toContain(needle)
      }
    }
  })

  it('print button uses browser-native window.print and documents Chrome headers', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'src/components/finance/AviReportPrintButton.tsx'), 'utf8')
    expect(src).toContain('window.print()')
    expect(src).toContain('printButton')
    expect(src).toMatch(/Headers and footers/i)
    expect(src).toContain('downloadSendablePdf')
    const html = renderToStaticMarkup(
      <AviReportPrintButton sendablePdfHref="/preview/avi-certified-compose/pdf?lang=en" />,
    )
    expect(html).toContain('Print / Save PDF')
    expect(html).toContain('Download sendable A4 PDF')
    expect(html).toContain('data-testid="avi-print-button"')
    expect(html).toContain('data-testid="avi-download-sendable-pdf"')
    expect(html).toContain('data-testid="avi-print-chrome-headers-note"')
    expect(html).toMatch(/Headers and footers/i)
    expect(html).toContain('print:hidden')
  })
})

describe('Avi print view — canonical 202-row certified compose', () => {
  const composed = composeExternalPartnerAviReport(approvedComposeInputFromCanonicalEvidence())
  if (composed.status !== 'certified') {
    throw new Error(`canonical compose failed: ${composed.failures.join(', ')}`)
  }
  const report = composed
  const html = renderToStaticMarkup(<ExternalPartnerAviReportView report={report} />)

  it('keeps exact certified identity', () => {
    expect(report.partners.find((p) => p.partner === 'Avi')!.paidEur).toBe(280600)
    expect(report.partners.find((p) => p.partner === 'Avi')!.creditsEur).toBe(19744.44)
    expect(report.partners.find((p) => p.partner === 'Avi')!.obligationEur).toBe(299603.5)
    expect(report.partners.find((p) => p.partner === 'Avi')!.netEur).toBe(740.94)
    expect(report.partners.find((p) => p.partner === 'Avi')!.semanticNet).toBe('Avi is owed €740.94')
    expect(html).toContain('Avi is owed €740.94')
    expect(html).toContain('280,600.00')
    expect(html).toContain('19,744.44')
    expect(html).toContain('299,603.50')
    expect(html).toContain('Avi owes €11,107.07')
    expect(html).toContain('Avi is owed €12,198.01')
    expect(html).not.toContain('Avi owes €345.90')
    expect(html).toContain('Avi owes €350.00')
  })

  it('displays agreed acquisition, Avi obligation, and certified remaining €0.00', () => {
    expect(report.acquisition.agreedTransactionValueEur).toBe(500000)
    expect(report.acquisition.aviObligationEur).toBe(250000)
    expect(report.acquisition.remainingEur).toBe(0)
    expect(html).toContain('500,000.00')
    expect(html).toContain('250,000.00')
    expect(html).toContain('Acquisition of 50% interest')
    const remaining = html.split('data-testid="avi-acquisition-remaining"')[1] ?? ''
    expect(remaining).toContain('Remaining')
    expect(remaining).toContain('0.00')
  })

  it('renders private booking total and Avi credit from the certified DTO', () => {
    expect(report.airbnbCredits.privateBookingTotalEur).toBe(1360)
    expect(report.airbnbCredits.privateBookingAviEur).toBe(680)
    const total = html.split('data-testid="avi-private-booking-total"')[1] ?? ''
    const avi = html.split('data-testid="avi-private-booking-avi"')[1] ?? ''
    expect(total).toContain('1,360.00')
    expect(avi).toContain('680.00')
  })

  it('does not display €400,000 or Purchase Contract', () => {
    expect(html).not.toMatch(/400,000/)
    expect(html).not.toMatch(/\b400000\b/)
    expect(html).not.toContain('Purchase Contract')
    expect(html.toLowerCase()).not.toContain('premium')
  })

  it('shows the five Avi payments once in the payment table and totals €280,600', () => {
    expect(report.partnerPayments).toHaveLength(5)
    const paymentSection = html.split('data-testid="avi-payment-table"')[1] ?? ''
    expect(paymentSection).toContain('200,000.00')
    expect(paymentSection).toContain('50,000.00')
    expect(paymentSection).toContain('5,600.00')
    expect(paymentSection).toContain('5,000.00')
    expect(paymentSection).toContain('20,000.00')
    expect((paymentSection.match(/Purchase funding/g) || []).length).toBeGreaterThanOrEqual(2)
    expect((paymentSection.match(/Purchase-expense funding/g) || []).length).toBeGreaterThanOrEqual(1)
    expect((paymentSection.match(/Renovation funding/g) || []).length).toBeGreaterThanOrEqual(2)
    expect(paymentSection).not.toContain('Partner funding')
    expect(report.partnerPayments.reduce((s, p) => s + (p.amountEur ?? 0), 0)).toBe(280600)
  })

  it('payment privacy fields remain absent', () => {
    expect(html).not.toContain('rawPayer')
    expect(html).not.toContain('payee')
    expect(html).not.toMatch(/k_note/)
    expect(html).not.toMatch(/review_status/)
    expect(html).not.toMatch(/confirmed_duplicate/)
    expect(html).not.toMatch(/attributionSource/)
    const paymentSection = html.split('data-testid="avi-payment-table"')[1] ?? ''
    expect(paymentSection).not.toContain('Yossi')
    expect(paymentSection).not.toContain('Jacob')
    expect(paymentSection).not.toContain('Client')
    for (const id of FUNDING_PAYMENT_IDS) {
      expect(html).not.toContain(id)
    }
  })

  it('expenses remain exactly 180 rows and reconcile to €99,207.00 / €49,603.50', () => {
    expect(report.partnerExpenses).toHaveLength(180)
    expect(report.visibleExpenseTotals.rowCount).toBe(180)
    expect(report.visibleExpenseTotals.totalChargeEur).toBe(99207)
    expect(report.visibleExpenseTotals.aviShareEur).toBe(49603.5)
    expect(report.expenseCompleteness.complete).toBe(true)
    expect(html).not.toContain('data-testid="avi-expense-completeness"')
    expect(html).not.toContain('No certified expenses')
    expect(html).not.toContain('180 certified')
    expect(html).toContain('data-testid="avi-expense-appendix-link"')
    expect(html).not.toContain('data-testid="avi-expense-table"')
    expect(html).toContain('99,207.00')
    expect(html).toContain('49,603.50')
    const recon = html.split('data-testid="avi-print-expense-recon"')[1] ?? ''
    expect(recon).toContain('99,207.00')
    expect(recon).toContain('49,603.50')
  })

  it('does not list the five funding IDs in expenses', () => {
    const expenseIds = new Set(report.partnerExpenses.map((e) => e.id))
    for (const id of FUNDING_PAYMENT_IDS) {
      expect(expenseIds.has(id)).toBe(false)
    }
  })

  it('keeps Yossi and Jacob PROVISIONAL with null money', () => {
    for (const name of ['Yossi', 'Jacob']) {
      const p = report.partners.find((s) => s.partner === name)!
      expect(p.status).toBe('PROVISIONAL')
      expect(p.paidEur).toBeNull()
      expect(p.creditsEur).toBeNull()
      expect(p.obligationEur).toBeNull()
      expect(p.netEur).toBeNull()
      expect(html).toContain(name)
      expect(html).toContain('Provisional')
    }
  })

  it('orders departments Acquisition / Deal → Renovation → Airbnb and hides Management', () => {
    expect(report.layers.map((l) => l.key)).toEqual([
      'acquisition',
      'deal_expense',
      'renovation',
      'airbnb',
      'management',
    ])
    expect(report.layers.find((l) => l.key === 'deal_expense')!.label).toBe('Acquisition / Deal expenses')
    // Main partner report no longer dumps department expense tables.
    expect(html).not.toContain('data-testid="avi-expense-department-deal_expense"')
    expect(html).not.toContain('data-testid="avi-expense-department-renovation"')
    expect(html).not.toContain('data-testid="avi-expense-department-airbnb"')
    expect(html).not.toContain('data-testid="avi-expense-department-management"')
    expect(html).toContain('data-testid="avi-expense-appendix-link"')
  })

  it('renders Garden Maintenance, Internet, Electricity, Pool Equipment, and nine 2026 Pool Service months from the DTO', () => {
    const byId = new Map(report.partnerExpenses.map((e) => [e.id, e]))
    const garden = byId.get(AVI_GARDENER_ID)!
    expect(garden.subcategory).toBe('Garden Maintenance')
    expect(garden.amountEur).toBe(280)
    expect(garden.aviShareEur).toBe(140)
    const internet = byId.get(TX.mgmtInternet30)!
    expect(internet.subcategory).toBe('Internet')
    expect(internet.amountEur).toBe(30)
    expect(internet.aviShareEur).toBe(15)
    const electricity = byId.get(TX.mgmtElectricity181)!
    expect(electricity.subcategory).toBe('Electricity')
    expect(electricity.amountEur).toBe(181.79)
    expect(electricity.aviShareEur).toBe(90.89)
    const equipment = byId.get(AVI_POOL_EQUIPMENT_ID)!
    expect(equipment.subcategory).toBe('Pool Equipment')
    expect(equipment.amountEur).toBe(450)
    expect(equipment.aviShareEur).toBe(225)

    const overlayIds = AVI_PENDING_POOL_MONTHS.map((month) => pendingPoolInvoiceId(month))
    const overlayRows = overlayIds.map((id) => byId.get(id)!)
    expect(overlayRows).toHaveLength(9)
    expect(new Set(overlayRows.map((e) => e.id)).size).toBe(9)
    expect(overlayRows.every((e) => e.subcategory === 'Pool Service')).toBe(true)
    expect(overlayRows.every((e) => e.amountEur === AVI_MONTHLY_POOL_CHARGE_EUR)).toBe(true)
    expect(overlayRows.every((e) => e.aviShareEur === AVI_MONTHLY_POOL_AVI_SHARE_EUR)).toBe(true)

    // Line-level expense dump lives in the optional appendix, not the main PDF body.
    expect(html).not.toContain('data-testid="avi-expense-department-airbnb"')
    expect(html).toContain('data-testid="avi-expense-appendix-link"')
  })

  it('print CSS declares A4 portrait, repeating headers, and no clipped rows', () => {
    expect(AVI_REPORT_PRINT_CSS).toContain('@page')
    expect(AVI_REPORT_PRINT_CSS).toContain('A4 portrait')
    expect(AVI_REPORT_PRINT_CSS).toContain('.avi-print-hide')
    expect(AVI_REPORT_PRINT_CSS).toContain('nav[aria-label="Main navigation"]')
    expect(AVI_REPORT_PRINT_CSS).toContain('avi-print-hide')
    expect(AVI_REPORT_PRINT_CSS).not.toContain('button {')
    expect(AVI_REPORT_PRINT_CSS).toContain('display: table-header-group')
    expect(AVI_REPORT_PRINT_CSS).toContain('page-break-inside: avoid')
    expect(html).toContain('data-testid="avi-print-masthead"')
    expect(html).toContain('Ledger transactions through')
    expect(html).toContain('29 August 2026')
    expect(html).toContain('Hostaway income through')
    expect(html).toContain('6 September 2026')
    expect(html).toContain('Generated on')
    expect(html).not.toContain('As of:')
    expect(html).not.toContain('As of ')
    const sidebar = fs.readFileSync(path.join(process.cwd(), 'src/components/nav/Sidebar.tsx'), 'utf8')
    expect(sidebar).toContain('print:hidden')
    const page = fs.readFileSync(path.join(process.cwd(), 'src/app/(app)/finance/external-partner/avi/page.tsx'), 'utf8')
    expect(page).toContain('avi-print-hide')
    expect(page).toContain('print:hidden')
    expect(page).toContain('AviReportPrintButton')
    const button = fs.readFileSync(path.join(process.cwd(), 'src/components/finance/AviReportPrintButton.tsx'), 'utf8')
    expect(button).toMatch(/Headers and footers/i)
    expect(button).toContain('downloadSendablePdf')
  })

  it('print layout includes layers, expenses, and payments without private fields', () => {
    expect(html).toContain('data-testid="avi-print-layers"')
    expect(html).not.toContain('data-testid="avi-expense-table"')
    expect(html).toContain('data-testid="avi-expense-appendix-link"')
    expect(html).not.toContain('data-testid="avi-expense-department-management"')
    expect(html).toContain('data-testid="avi-payment-table"')
    expect(html).toContain('72,214.14')
    expect(html).toContain('36,107.07')
    expect(html).toContain('11,900.00')
    expect(html).toContain('Purchase expenses')
    expect(html).not.toContain('Purchase Contract')
    expect(html).not.toContain('data-testid="avi-expense-department-airbnb"')
    // Partner body shows aggregated Hostaway only — no per-stay NTO / reservation PII.
    expect(html).toContain('data-testid="avi-hostaway-aggregated-stays"')
    expect(html).toContain('38,128.87')
    expect(html).toContain('19,064.44')
    expect(html).not.toContain('46340130')
    expect(html).not.toContain('Tomer Niazof')
    expect(html).not.toContain('190.35')
    expect(html).not.toContain('380.70')
    if (process.env.WRITE_AVI_PRINT_HTML === '1') {
      const cssDir = path.join(process.cwd(), '.next/static/css')
      const cssName = fs.existsSync(cssDir)
        ? fs.readdirSync(cssDir).find((f) => f.endsWith('.css'))
        : undefined
      const builtCss = cssName ? fs.readFileSync(path.join(cssDir, cssName), 'utf8') : ''
      const wrapped = `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
<meta charset="utf-8"/>
<title>Avi External Partner Report — print</title>
<style>${builtCss}</style>
<style>${AVI_REPORT_PRINT_CSS}</style>
<style>
  body { margin: 0; background: #fff; font-family: Inter, system-ui, sans-serif; }
  .screen-toolbar { padding: 16px 24px; }
</style>
</head>
<body>
  <div data-avi-print-root>
    <div class="screen-toolbar avi-print-hide print:hidden" data-avi-print-hide>
      ${renderToStaticMarkup(<AviReportPrintButton />)}
    </div>
    ${html}
  </div>
</body>
</html>`
      fs.writeFileSync('/tmp/avi-print.html', wrapped)
    }
  })
})

describe('Avi print view — staff authorization unchanged', () => {
  it('page still uses authenticateStatementUser with fail-closed staff guard', () => {
    const page = fs.readFileSync(
      path.join(process.cwd(), 'src/app/(app)/finance/external-partner/avi/page.tsx'),
      'utf8',
    )
    expect(page).toContain("import { authenticateStatementUser } from '@/lib/statements/statementAuthService'")
    expect(page).toContain('authenticateStatementUser()')
    expect(page).toContain("auth.error === 'NO_SESSION'")
    expect(page).toContain("redirect('/login')")
    expect(page).toContain('notFound()')
    expect(page).toContain("sendablePdfPath={")
    expect(page).toContain("'/finance/external-partner/avi/pdf'")
  })

  it('staff PDF and print routes exist and stay staff-gated', () => {
    const pdfRoute = fs.readFileSync(
      path.join(process.cwd(), 'src/app/(app)/finance/external-partner/avi/pdf/route.ts'),
      'utf8',
    )
    const printPage = fs.readFileSync(
      path.join(process.cwd(), 'src/app/(app)/finance/external-partner/avi/print/page.tsx'),
      'utf8',
    )
    expect(pdfRoute).toContain('authenticateStatementUser')
    expect(pdfRoute).toContain('/finance/external-partner/avi/print?lang=')
    expect(pdfRoute).toContain('cookieHeader')
    expect(printPage).toContain('authenticateStatementUser')
    expect(printPage).toContain('searchParams')
    expect(printPage).toContain('initialLang={lang}')
  })
})
