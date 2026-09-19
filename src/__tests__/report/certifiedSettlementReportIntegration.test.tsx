jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), prefetch: jest.fn() }),
  usePathname: () => '/owners/test',
  useSearchParams: () => new URLSearchParams(),
}))

import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { CertifiedSettlementSection } from '@/components/report/CertifiedSettlementSection'
import { FinancialTab } from '@/components/owners/tabs/FinancialTab'
import { OwnerSettlementPdfV3 } from '@/lib/pdf/OwnerSettlementPdfV3'
import { toClientReport } from '@/lib/report/clientReportDto'
import type { RC3PropertyReport, RC3AccountSection } from '@/lib/report/types'
import { URIEL_SHAPED_CERTIFIED } from '@/lib/finance/__fixtures__/certifiedClientSettlement'
import { t, tFill, ownerReportDisplayName } from '@/lib/report/labels'
import fs from 'fs'
import path from 'path'
import type { OwnerFinancialDTO } from '@/lib/owners/ownerWorkspaceTypes'

function section(closing: number): RC3AccountSection {
  return {
    account_type: 'rental',
    account_label: 'Property Management',
    account_label_he: 'ניהול',
    balance_convention: 'owner_credit',
    opening_balance: 0,
    rows: [],
    contract_baseline: 0,
    total_income: 100,
    total_expenses: 40,
    total_bpo: 0,
    closing_balance: closing,
  }
}

function report(closing: number): RC3PropertyReport {
  return {
    reporting_name: 'Alpha',
    from_date: null,
    to_date: '2026-08-31',
    generated_at: '2026-09-18T00:00:00Z',
    accounts: [section(closing)],
    has_purchase: false,
    has_sale: false,
    has_renovation: false,
    has_rental: true,
    has_airbnb: false,
  }
}

const EMPTY_FINANCIAL: OwnerFinancialDTO = {
  position: {
    incomeEur: '100',
    expensesEur: '40',
    netEur: '60',
    paidToOwnerEur: '0',
    pendingEur: null,
    closingBalanceEur: '60',
  },
  overallNet: {
    departments: [],
    netEur: '60',
    label: 'due_to_you',
    displayAmountEur: '60',
  },
  sections: [],
  timeline: [],
}

describe('certified settlement consumers share DTO/sign rules', () => {
  test('HTML section renders Uriel-shaped opening, FIFO, exclusion, and closing', () => {
    const html = renderToStaticMarkup(
      <CertifiedSettlementSection dto={URIEL_SHAPED_CERTIFIED} lang="en" />,
    )
    expect(html).toContain('119,677.42')
    expect(html).toContain('55,000.00')
    expect(html).toContain('14,000.00')
    expect(html).toContain('13,900.00')
    expect(html).toContain('50,677.42')
    expect(html).toContain(t('certNoncash', 'en'))
    expect(html).toContain(t('certClosingDueToJj', 'en'))
    expect(html).toContain('data-fifo-cash="false"')
    expect(html).toContain('data-exclusion-effect="0"')
    expect(html).toContain('data-certified-closing="50677.42"')
  })

  test('Hebrew HTML uses the required labels', () => {
    const html = renderToStaticMarkup(
      <CertifiedSettlementSection dto={URIEL_SHAPED_CERTIFIED} lang="he" />,
    )
    expect(html).toContain('יתרת התחייבויות פתיחה מאושרת')
    expect(html).toContain('זיכוי יישוב ללא מזומן')
    expect(html).toContain('תשלום מזומן שנכלל ביישוב')
    expect(html).toContain('הוצא מההתחשבנות – ייצוג כפול')
    expect(html).toContain('יתרה סופית לתשלום')
    expect(html).toContain('לא מזומן')
  })

  test('Hebrew owner-facing direction uses the given name overlay', () => {
    expect(tFill('certOwnerOwesJj', 'he', { owner: ownerReportDisplayName('Uriel', 'he') })).toBe('אוריאל חייב ל-JJ')
    expect(tFill('certPayableToJjByOwner', 'he', { owner: ownerReportDisplayName('Uriel', 'he') })).toBe('לתשלום ל-JJ על ידי אוריאל')
    expect(t('certSupportingLedger', 'he')).toBe('פירוט פעילות תומך — אינו יתרת ההתחשבנות הסופית')
  })

  test('Owner Workspace uses certified closing as the hero and keeps RC3 net supporting', () => {
    const html = renderToStaticMarkup(
      <FinancialTab
        dto={{ ...EMPTY_FINANCIAL, certifiedSettlement: URIEL_SHAPED_CERTIFIED }}
        ownerSlug="alpha"
        fromDate={null}
        toDate="2026-08-31"
      />,
    )
    expect(html).toContain('50,677.42')
    expect(html).toContain('Certified closing')
    expect(html).toContain(t('certSectionTitle', 'en'))
  })

  test('uncertified Owner Workspace closing stays the legacy overall-net figure', () => {
    const html = renderToStaticMarkup(
      <FinancialTab dto={EMPTY_FINANCIAL} ownerSlug="alpha" fromDate={null} toDate={null} />,
    )
    expect(html).not.toContain(t('certSectionTitle', 'en'))
    expect(html).toContain('Closing Balance')
  })

  test('toClientReport omits certifiedSettlement so uncertified clients stay legacy-shaped', () => {
    const dto = toClientReport(report(60))
    expect(dto).not.toHaveProperty('certifiedSettlement')
    expect(dto.accounts[0].closing_balance).toBe(60)
  })

  test('RC3 totals are unchanged when certified overlay is attached', () => {
    const raw = report(60)
    const dto = toClientReport(raw)
    dto.certifiedSettlement = URIEL_SHAPED_CERTIFIED
    expect(dto.accounts[0].closing_balance).toBe(60)
    expect(dto.accounts[0].total_income).toBe(100)
    expect(dto.certifiedSettlement.closingDueToJj).toBe(50677.42)
    expect(dto.certifiedSettlement.closingDueToJj).not.toBe(60 + 119677.42)
  })

  test('PDF composes a certified cover plus supporting property page', () => {
    const doc: any = OwnerSettlementPdfV3({
      report: report(60),
      lang: 'en',
      certifiedSettlement: URIEL_SHAPED_CERTIFIED,
      ownerName: 'Alpha',
    })
    const pages = React.Children.toArray(doc.props.children) as any[]
    expect(pages.length).toBe(2)
    expect(pages[0].props.dto.closingDueToJj).toBe(50677.42)
    expect(pages[0].props.dto.fifoCreditsTotal).toBe(69000)
    expect(pages[0].props.ownerName).toBe('Alpha')
    expect(pages[1].props.supportingLedger).toBe(true)
    expect(pages[1].props.report.accounts[0].closing_balance).toBe(60)
  })
})

describe('certified settlement source / security audits', () => {
  const root = path.join(__dirname, '..', '..', '..')
  function read(rel: string): string {
    return fs.readFileSync(path.join(root, rel), 'utf8')
  }

  test('reader is the public service-role RPC only', () => {
    const adapter = read('src/lib/finance/certifiedClientSettlementAdapter.ts')
    expect(adapter).toContain('.rpc(CLIENT_SETTLEMENT_CERTIFICATION_RPC.read')
    expect(adapter).toContain('read_certified_client_settlement')
    expect(adapter).toContain("from '@/lib/supabase'")
    expect(adapter).toContain("import 'server-only'")
    expect(adapter).not.toContain("schema('finance')")
    expect(adapter).not.toContain('createSupabaseBrowserClient')
    expect(adapter).not.toContain('createSupabaseServerClient')
  })

  test('browser surfaces do not import the server adapter', () => {
    const files = [
      'src/app/client-report-rc3/page.tsx',
      'src/components/owners/tabs/FinancialTab.tsx',
      'src/components/owners/tabs/OverviewTab.tsx',
      'src/components/report/CertifiedSettlementSection.tsx',
      'src/app/(app)/owners/OwnersRoomClient.tsx',
    ]
    for (const file of files) {
      expect(read(file)).not.toContain('certifiedClientSettlementAdapter')
      expect(read(file)).not.toContain('createServiceClient')
      expect(read(file)).not.toContain('SUPABASE_SERVICE_KEY')
    }
  })

  test('application code does not hardcode the production certification identity or amounts', () => {
    const appFiles = [
      'src/lib/finance/certifiedClientSettlementAdapter.ts',
      'src/lib/finance/certifiedClientSettlementPresentation.ts',
      'src/lib/finance/certifiedClientSettlementTypes.ts',
      'src/lib/owners/ownerWorkspaceService.ts',
      'src/lib/report/getClientReportAction.tsx',
      'src/lib/pdf/OwnerSettlementPdfV3.tsx',
      'src/lib/pdf/CertifiedSettlementPdf.tsx',
    ]
    for (const file of appFiles) {
      const src = read(file)
      expect(src).not.toContain('2944e9ad-c298-4dbf-b666-26561d934b61')
      expect(src).not.toContain('66ddad63-d60c-49bf-a8a6-3fba71a6780f')
      expect(src).not.toContain('119677.42')
      expect(src).not.toContain('50677.42')
    }
  })
})
