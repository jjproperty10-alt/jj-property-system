/**
 * Commit 3A — ExternalPartnerAviReportView component tests.
 * Covers privacy serialization, fail-closed rendering, and certified display.
 * Uses renderToStaticMarkup (same pattern as view.render.test.tsx).
 */
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import * as fs from 'fs'
import * as path from 'path'
import { ExternalPartnerAviReportView } from '@/components/finance/ExternalPartnerAviReportView'
import type {
  ExternalPartnerAviReport,
  AviReportPartnerSummary,
  AviReportLayerBreakdown,
  AviReportPartnerPayment,
  AviReportPartnerExpense,
  AviReportSnapshotMeta,
  AviReportControlStatus,
} from '@/lib/partner-settlement/external-partner/externalPartnerAviReportTypes'
import { composeAviAirbnbCredits } from '@/lib/partner-settlement/external-partner'
import {
  composeAviAirbnbSection,
  composeAviFinalSummary,
  composeAviHostawayIncome,
  composeAviMonthly,
  composeAviPurchaseExpenses,
  composeAviRenovation,
} from '@/lib/partner-settlement/external-partner/aviReportSections'

function certifiedReport(): Extract<ExternalPartnerAviReport, { status: 'certified' }> {
  const controlStatus: AviReportControlStatus = {
    reconciliationPassed: true,
    settlementComputed: true,
    attributionOk: true,
    failures: [],
  }
  const snapshot: AviReportSnapshotMeta = {
    propertyName: 'Villa Mazotos',
    cutoffDate: '2026-08-29',
    approvedRowCount: 202,
    version: 'vm1-classification-202-v1',
    sha256: '0477bfc5f2285425d55af6793f9d09bf829ee62387fb5b2a42bc0958478baf97',
  }
  const partners: AviReportPartnerSummary[] = [
    {
      partner: 'Avi', ownershipPct: 50, isJjPrincipal: false, status: 'CERTIFIED',
      paidEur: 280600, creditsEur: 19744.44, obligationEur: 299603.50, netEur: 740.94,
      direction: 'to_refund', semanticNet: 'Avi is owed €740.94',
    },
    {
      partner: 'Yossi', ownershipPct: 25, isJjPrincipal: true, status: 'PROVISIONAL',
      paidEur: null, creditsEur: null, obligationEur: null, netEur: null,
      direction: null, semanticNet: null,
    },
    {
      partner: 'Jacob', ownershipPct: 25, isJjPrincipal: true, status: 'PROVISIONAL',
      paidEur: null, creditsEur: null, obligationEur: null, netEur: null,
      direction: null, semanticNet: null,
    },
  ]
  const layers: AviReportLayerBreakdown[] = [
    { key: 'acquisition', label: 'Acquisition', totalChargeEur: 500000, aviShareEur: 250000, aviFundingEur: null, semanticNet: null },
    { key: 'deal_expense', label: 'Acquisition / Deal expenses', totalChargeEur: 11900, aviShareEur: 5950, aviFundingEur: 5600, semanticNet: 'Avi owes €350.00' },
    { key: 'renovation', label: 'Renovation', totalChargeEur: 72214.14, aviShareEur: 36107.07, aviFundingEur: 25000, semanticNet: 'Avi owes €11,107.07' },
    { key: 'airbnb', label: 'Airbnb', totalChargeEur: 15092.86, aviShareEur: 7546.43, aviFundingEur: 19744.44, semanticNet: 'Avi is owed €12,198.01' },
    { key: 'management', label: 'Management', totalChargeEur: 0, aviShareEur: 0, aviFundingEur: null, semanticNet: 'Settled' },
  ]
  const partnerPayments: AviReportPartnerPayment[] = [
    { id: '1cc117ba-94c7-463b-8e72-f9d021613ac5', date: '2025-01-15', amountEur: 200000, label: 'Partner funding', payer: 'Avi' },
    { id: '372cf021-f659-480a-8647-98a84e718d67', date: '2025-01-16', amountEur: 50000, label: 'Partner funding', payer: 'Avi' },
    { id: 'b71e4098-39fb-4562-a0b4-1d8db9fbdfd1', date: '2025-01-16', amountEur: 5600, label: 'Partner funding', payer: 'Avi' },
    { id: 'c51df847-5275-47b2-b104-1a57aea0c293', date: '2025-02-20', amountEur: 5000, label: 'Partner funding', payer: 'Avi' },
    { id: '3afd3b3f-b6de-4e6e-8476-2b07bbd09ea7', date: '2025-03-10', amountEur: 20000, label: 'Partner funding', payer: 'Avi' },
  ]
  const partnerExpenses: AviReportPartnerExpense[] = [
    { id: 'a1', date: '2025-08-23', amountEur: 350, aviSharePct: 50, aviShareEur: 175, category: 'Airbnb', subcategory: 'Photography', layer: 'airbnb' },
    { id: 'm1', date: '2026-08-11', amountEur: 181.79, aviSharePct: 50, aviShareEur: 90.9, category: 'Airbnb', subcategory: 'Electricity', layer: 'airbnb' },
    { id: '9363b7c1-c536-4e35-b3ed-98bff7c3db40', date: '2025-01-20', amountEur: 1400, aviSharePct: 50, aviShareEur: 700, category: 'Purchase', subcategory: 'Purchase Expenses', layer: 'deal_expense' },
  ]
  return {
    status: 'certified',
    property: 'Villa Mazotos',
    snapshot,
    controlStatus,
    partners,
    acquisition: {
      agreedTransactionValueEur: 500000,
      aviOwnershipPct: 50,
      aviObligationEur: 250000,
      remainingEur: 0,
      presentationLine: 'Acquisition of 50% interest — agreed value €500,000.00 — Avi share €250,000.00',
    },
    layers,
    visibleExpenseTotals: {
      rowCount: 3,
      totalChargeEur: 101241.67,
      aviShareEur: 50620.84,
    },
    expenseCompleteness: {
      complete: false,
      departmentsMissingDetailRows: ['renovation'],
    },
    partnerPayments,
    partnerExpenses,
    airbnbCredits: composeAviAirbnbCredits(),
    purchaseExpenses: composeAviPurchaseExpenses(),
    renovation: composeAviRenovation({
      rows: [{ subcategory: 'Workers', amountEur: 2000 }],
      certifiedChargeEur: 72214.14,
      aviPaidEur: 25000,
      payments: [
        { date: '2024-11-16', amountEur: 5000 },
        { date: '2025-07-10', amountEur: 20000 },
      ],
    }),
    airbnb: composeAviAirbnbSection(),
    hostawayIncome: composeAviHostawayIncome(),
    monthly: composeAviMonthly(),
    finalSummary: composeAviFinalSummary({
      acquisitionObligationEur: 250000,
      acquisitionPaidEur: 250000,
      renovationObligationEur: 36107.07,
      renovationPaidEur: 25000,
      creditsEur: 19744.44,
    }),
  }
}

function failedReport(): Extract<ExternalPartnerAviReport, { status: 'failed' }> {
  return {
    status: 'failed',
    property: 'Villa Mazotos',
    controlStatus: {
      reconciliationPassed: false,
      settlementComputed: false,
      attributionOk: false,
      failures: ['evidence_mismatch', 'attribution_failed'],
    },
    failures: ['evidence_mismatch', 'attribution_failed'],
  }
}

describe('ExternalPartnerAviReportView — certified', () => {
  const html = renderToStaticMarkup(<ExternalPartnerAviReportView report={certifiedReport()} />)

  it('renders the certified report header', () => {
    expect(html).toContain('External Partner Report')
    expect(html).toContain('Avi')
    expect(html).toContain('Villa Mazotos')
    expect(html).toContain('Certified')
    expect(html).toContain('JJ Internal Staff Report')
  })

  it('displays Avi semantic net', () => {
    expect(html).toContain('Avi is owed')
    expect(html).toContain('740.94')
    expect(html).not.toContain('18,900.84')
    expect(html).not.toContain('380.50')
  })

  it('marks data-testid for certified', () => {
    expect(html).toContain('data-testid="avi-report-certified"')
  })

  it('shows operating layers and hides empty Management', () => {
    expect(html).toContain('Renovation')
    expect(html).toContain('Airbnb')
    expect(html).toContain('Acquisition / Deal expenses')
    expect(html).not.toContain('data-testid="avi-expense-department-management"')
  })

  it('shows Avi as Certified and Yossi/Jacob as Provisional (localized labels)', () => {
    expect(html).toContain('Certified')
    expect(html).toContain('Provisional')
    expect(html).not.toContain('>CERTIFIED<')
    expect(html).not.toContain('>PROVISIONAL<')
  })

  it('shows all five payments with partner-facing purpose labels', () => {
    expect(html).toContain('Purchase funding')
    expect(html).toContain('Purchase-expense funding')
    expect(html).toContain('Renovation funding')
    expect((html.match(/Purchase funding/g) || []).length).toBeGreaterThanOrEqual(2)
    expect(html).not.toContain('Partner funding')
  })

  it('links the certified expense appendix instead of dumping lines', () => {
    expect(html).toContain('data-testid="avi-expense-appendix-link"')
    expect(html).not.toContain('Certified Expenses')
    expect(html).not.toContain('data-testid="avi-expense-table"')
  })

  it('keeps expense line dump out of the main certified view', () => {
    expect(html).not.toContain('data-testid="avi-expense-department-deal_expense"')
    expect(html).not.toContain('data-testid="avi-expense-department-airbnb"')
    expect(html).not.toContain('data-testid="avi-expense-department-management"')
    expect(html).not.toContain('data-testid="avi-expense-completeness"')
    expect(html).toContain('data-testid="avi-expense-appendix-link"')
  })

  it('renders certified private-booking total and Avi credit from the DTO', () => {
    const total = html.split('data-testid="avi-private-booking-total"')[1] ?? ''
    const avi = html.split('data-testid="avi-private-booking-avi"')[1] ?? ''
    expect(total).toContain('1,360.00')
    expect(avi).toContain('680.00')
  })

  it('renders certified acquisition remaining from the DTO', () => {
    const remaining = html.split('data-testid="avi-acquisition-remaining"')[1] ?? ''
    expect(remaining).toContain('Remaining')
    expect(remaining).toContain('0.00')
  })

  it('shows printed Hostaway NTO credit without tax lines or guest/reservation PII', () => {
    expect(html).toContain('data-testid="avi-airbnb-credits"')
    expect(html).toContain('Private booking income')
    expect(html).toContain('Hostaway rental income')
    expect(html).toContain('data-testid="avi-hostaway-aggregated-stays"')
    expect(html).toContain('38,128.87')
    expect(html).toContain('19,064.44')
    // Partner body must not expose guest name or reservation id
    expect(html).not.toContain('46340130')
    expect(html).not.toContain('Tomer Niazof')
    expect(html).not.toContain('190.35')
    expect(html).not.toContain('380.70')
  })

  it('renders the audit warning', () => {
    expect(html).toContain('JJ Internal — Certified snapshot report')
    expect(html).toContain('approved certified snapshot')
  })

  it('renders control status all green', () => {
    expect(html).toContain('All passed')
  })

  it('renders acquisition agreed value and Avi share without the historical contract', () => {
    expect(html).toContain('500,000.00')
    expect(html).toContain('250,000.00')
    expect(html).toContain('Acquisition of 50% interest')
    expect(html).not.toMatch(/400,000/)
    expect(html).not.toMatch(/\b400000\b/)
    expect(html.toLowerCase()).not.toContain('premium')
  })
})

describe('ExternalPartnerAviReportView — partner audience', () => {
  const html = renderToStaticMarkup(
    <ExternalPartnerAviReportView report={certifiedReport()} audience="partner" />,
  )

  it('hides JJ internal chrome and keeps certified totals', () => {
    expect(html).toContain('data-avi-audience="partner"')
    expect(html).not.toContain('JJ Internal Staff Report')
    expect(html).not.toContain('JJ Internal — Certified snapshot report')
    expect(html).not.toContain('Control Status')
    expect(html).toContain('Avi is owed')
    expect(html).toContain('740.94')
    expect(html).toContain('500,000.00')
    expect(html).not.toMatch(/400,000/)
  })

  it('does not dump department expense tables for the partner audience', () => {
    expect(html).not.toContain('data-testid="avi-expense-table"')
    expect(html).toContain('data-testid="avi-expense-appendix-link"')
    expect(html).not.toContain('Management expenses')
  })
})

describe('ExternalPartnerAviReportView — privacy', () => {
  const html = renderToStaticMarkup(<ExternalPartnerAviReportView report={certifiedReport()} />)

  it('does not expose forbidden internal fields', () => {
    expect(html).not.toContain('Client')
    expect(html).not.toContain('rawPayer')
    expect(html).not.toContain('payee')
    expect(html).not.toMatch(/k_note/)
    expect(html).not.toMatch(/review_status/)
    expect(html).not.toMatch(/confirmed_duplicate/)
    expect(html).not.toMatch(/attributionSource/)
    expect(html).not.toContain('אבי נתן ליעקוב')
    expect(html).not.toContain('internal conduit note')
    expect(html).not.toMatch(/400,000/)
    expect(html.toLowerCase()).not.toContain('premium')
  })

  it('does not display Yossi or Jacob monetary values', () => {
    const report = certifiedReport()
    for (const p of report.partners.filter((pp) => pp.partner !== 'Avi')) {
      expect(p.paidEur).toBeNull()
      expect(p.creditsEur).toBeNull()
      expect(p.obligationEur).toBeNull()
      expect(p.netEur).toBeNull()
    }
  })
})

describe('ExternalPartnerAviReportView — fail-closed rendering', () => {
  const html = renderToStaticMarkup(<ExternalPartnerAviReportView report={failedReport()} />)

  it('renders failed state with no financial amounts', () => {
    expect(html).toContain('Report Failed')
    expect(html).toContain('cannot be certified')
    expect(html).not.toContain('280600')
    expect(html).not.toContain('18900')
    expect(html).not.toContain('300180')
    expect(html).not.toContain('data-testid="avi-report-certified"')
  })

  it('shows failure reasons', () => {
    expect(html).toContain('evidence_mismatch')
    expect(html).toContain('attribution_failed')
  })

  it('does not render partner summary, layers, payments, or expenses', () => {
    expect(html).not.toContain('Partner Summary')
    expect(html).not.toContain('Layer Breakdown')
    expect(html).not.toContain('Certified Expenses')
    expect(html).not.toContain('Avi Funding Payments')
  })
})

describe('ExternalPartnerAviReportView — source isolation', () => {
  const SRC_FILES = [
    'src/components/finance/ExternalPartnerAviReportView.tsx',
    'src/components/finance/AviReportPrintButton.tsx',
    'src/components/finance/aviReportPrintCss.ts',
    'src/components/finance/AviShareLinkButton.tsx',
    'src/components/finance/aviReportCopy.ts',
  ]

  it('does not import Partner B, RC3, lifecycle, PDF, or Supabase', () => {
    const forbidden = [
      'readPartnerLedger',
      'partnerStatementService',
      "from '@/lib/lifecycle",
      "from '@/lib/report/",
      'v_rc3_classified',
      'apply_correction_case',
      '@react-pdf',
      'createServiceClient',
      'createSupabaseServerClient',
    ]
    for (const rel of SRC_FILES) {
      const text = fs.readFileSync(path.join(process.cwd(), rel), 'utf8')
      for (const needle of forbidden) {
        expect(text).not.toContain(needle)
      }
    }
  })

  it('does not contain hardcoded golden amounts', () => {
    for (const rel of SRC_FILES) {
      const text = fs.readFileSync(path.join(process.cwd(), rel), 'utf8')
      expect(text).not.toMatch(/\b280600\b/)
      expect(text).not.toMatch(/\b300180/)
      expect(text).not.toMatch(/\b18900/)
      expect(text).not.toMatch(/\b72214/)
      expect(text).not.toMatch(/\b400000\b/)
      expect(text).not.toMatch(/\b500000\b/)
      expect(text).not.toMatch(/\b1360\b/)
    }
  })

  it('page source does not import test fixtures', () => {
    const pageFiles = [
      'src/app/(app)/finance/external-partner/avi/page.tsx',
      'src/lib/partner-settlement/external-partner/buildAviExternalPartnerReport.ts',
      'src/lib/partner-settlement/external-partner/externalPartnerAviVisible.ts',
      'src/lib/partner-settlement/external-partner/externalPartnerAviConfig.ts',
      'src/components/finance/AviReportPrintButton.tsx',
      'src/components/finance/aviReportPrintCss.ts',
      'src/components/finance/AviShareLinkButton.tsx',
    ]
    for (const rel of pageFiles) {
      const text = fs.readFileSync(path.join(process.cwd(), rel), 'utf8')
      expect(text).not.toContain('aviGoldenFixture')
      expect(text).not.toContain('goldenInput')
      expect(text).not.toContain('__tests__')
    }
  })
})
