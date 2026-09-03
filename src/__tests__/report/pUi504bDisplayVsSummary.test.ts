/**
 * P-UI-504b/d — DISPLAY vs SUMMARY account partitioning for /client-report-rc3.
 *
 * Final rule: BOTH displayAccounts and summaryAccounts exclude internal Purchase
 * (account_type = 'purchase'). Purchase is JJ internal acquisition cost and must
 * never appear in any client-facing output. Sale remains present (client-facing
 * Property Purchase). filterOwnerFacingSections is defense-in-depth alongside the
 * DTO boundary in clientReportDto.ts.
 *
 * These are PURE-FUNCTION (node) proofs of the exact partitioning + net
 * composition the route uses. No DOM/RTL. They assert the deterministic inputs
 * that decide what the page renders — they are NOT a production certification.
 *
 * Scope: asserts the route's partitioning only. Does not modify RC3,
 * computeBalance, the PDF, transactions, or the DB.
 */
import { getOwnerClientReport } from '@/lib/report/ownerClientReport'
import {
  computeNetOwnerBalance,
  filterOwnerFacingSections,
} from '@/lib/report/executiveSummary'
import { filterSectionsByReportType } from '@/lib/report/reportTypes'
import { partitionReportAccounts } from '@/lib/report/reportAccountPartition'
import type {
  RC3PropertyReport,
  RC3AccountSection,
  RC3AccountType,
  BalanceConvention,
} from '@/lib/report/types'

function section(
  account_type: RC3AccountType,
  closing_balance: number,
  balance_convention: BalanceConvention,
): RC3AccountSection {
  return {
    account_type,
    account_label: account_type,
    account_label_he: account_type,
    balance_convention,
    opening_balance: 0,
    rows: [],
    contract_baseline: 0,
    total_income: 0,
    total_expenses: 0,
    total_bpo: 0,
    closing_balance,
  } as RC3AccountSection
}

function report(name: string, accounts: RC3AccountSection[]): RC3PropertyReport {
  return {
    reporting_name: name,
    from_date: null,
    to_date: null,
    generated_at: '2026-01-01T00:00:00Z',
    accounts,
    has_purchase: accounts.some(a => a.account_type === 'purchase'),
    has_sale: accounts.some(a => a.account_type === 'sale'),
    has_renovation: accounts.some(a => a.account_type === 'renovation'),
    has_rental: accounts.some(a => a.account_type === 'rental'),
    has_airbnb: accounts.some(a => a.account_type === 'airbnb'),
  }
}

// The OLD single expression the route used for BOTH list and summary.
function oldVisible(rep: RC3PropertyReport, reportType: 'full' | 'periodic') {
  return filterOwnerFacingSections(filterSectionsByReportType(rep.accounts, reportType))
}

describe('P-UI-504b/d — Purchase stays out of BOTH the client account list and the net', () => {
  // Purchase net component = Contract 180,000 − Deposit 10,000 − Purchase
  // Payment 44,000 = 126,000 (client_debt). Plus an owner-facing rental credit
  // of +500 so the display path and the summary net are numerically distinct.
  const purchaseNet = 180000 - 10000 - 44000 // = 126000
  const rep = report('P-UI-504b fixture', [
    section('purchase', purchaseNet, 'client_debt'),
    section('rental', 500, 'owner_credit'),
  ])

  test('1a. full: displayAccounts EXCLUDE Purchase and equal summaryAccounts', () => {
    expect(purchaseNet).toBe(126000)
    const { displayAccounts, summaryAccounts } = partitionReportAccounts(rep.accounts, 'full')
    expect(displayAccounts.some(a => a.account_type === 'purchase')).toBe(false)
    expect(displayAccounts.some(a => a.account_type === 'rental')).toBe(true)
    // Both client sets are the same owner-facing set now.
    expect(displayAccounts).toEqual(summaryAccounts)
    expect(summaryAccounts.some(a => a.account_type === 'purchase')).toBe(false)
    expect(summaryAccounts.some(a => a.account_type === 'rental')).toBe(true)
  })

  test('1b. periodic: report-type filtering preserved — displayAccounts EXCLUDE Purchase', () => {
    const { displayAccounts, summaryAccounts } = partitionReportAccounts(rep.accounts, 'periodic')
    // periodic keeps rental/airbnb only — Purchase excluded by report-type design.
    expect(displayAccounts.some(a => a.account_type === 'purchase')).toBe(false)
    expect(displayAccounts.some(a => a.account_type === 'rental')).toBe(true)
    expect(summaryAccounts.some(a => a.account_type === 'purchase')).toBe(false)
  })

  test('2. headline net excludes the €126,000 and equals the canonical overallNet', () => {
    const { summaryAccounts } = partitionReportAccounts(rep.accounts, 'full')
    // The €126,000 Purchase component does NOT enter the summary net (rental +500 only).
    expect(computeNetOwnerBalance(summaryAccounts)).toBeCloseTo(500, 5)
    // Identical to the canonical owner-facing net the PDF uses, for the same scope.
    expect(computeNetOwnerBalance(summaryAccounts)).toBe(getOwnerClientReport(rep).overallNet)
    // Guard: had Purchase leaked in, the net would be 500 − 126000 = −125500.
    expect(computeNetOwnerBalance(rep.accounts)).toBeCloseTo(-125500, 5)
  })

  test('3. FIXTURE proof (not a production certification): Tamir Kiti 2 = €1,651.17', () => {
    const tamirKiti2 = report('Tamir Kiti 2', [
      section('rental', 1651.17, 'owner_credit'),
    ])
    const { summaryAccounts } = partitionReportAccounts(tamirKiti2.accounts, 'full')
    expect(computeNetOwnerBalance(summaryAccounts)).toBeCloseTo(1651.17, 2)
    expect(getOwnerClientReport(tamirKiti2).overallNet).toBeCloseTo(1651.17, 2)
  })

  test('4. FinalSummary/PremiumSummary input unchanged: summaryAccounts === old visibleAccounts', () => {
    for (const rt of ['full', 'periodic'] as const) {
      const { summaryAccounts } = partitionReportAccounts(rep.accounts, rt)
      // Byte-identical to the previous single-filter expression that fed the summary.
      expect(summaryAccounts).toEqual(oldVisible(rep, rt))
    }
  })
})
