/**
 * P-UI-504 — Client Report UI headline net alignment.
 *
 * Proves the /client-report-rc3 headline ("Balance" hero) net now uses the SAME
 * canonical owner-facing composition the PDF uses:
 *
 *     getOwnerClientReport(report).overallNet
 *       === computeNetOwnerBalance(filterOwnerFacingSections(report.accounts))
 *
 * Purchase (JJ-internal acquisition) stays VISIBLE in report.accounts (account
 * list / drill-down) but is EXCLUDED from the headline settlement net.
 *
 * Scope: this file only asserts the composition the page uses. It does not
 * modify RC3, computeBalance, the PDF, transactions, or the DB.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { getOwnerClientReport } from '@/lib/report/ownerClientReport'
import {
  computeNetOwnerBalance,
  filterOwnerFacingSections,
} from '@/lib/report/executiveSummary'
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

/**
 * Exact expression the page headline now computes (src/app/client-report-rc3/page.tsx,
 * PremiumSummary): the owner-facing net with Purchase filtered out.
 */
function headlineNet(rep: RC3PropertyReport): number {
  return computeNetOwnerBalance(filterOwnerFacingSections(rep.accounts))
}

describe('P-UI-504 — headline net excludes Purchase and matches the PDF composition', () => {
  // Tamir Dekelia golden: Purchase net = Contract 180,000 − Deposit 10,000 −
  // Purchase Payment 44,000 = 126,000 (client_debt). Plus an owner-facing rental
  // credit of +500 so the two paths are numerically distinguishable.
  const tamirDekelia = report('Tamir Dekelia', [
    section('purchase', 126000, 'client_debt'),
    section('rental', 500, 'owner_credit'),
  ])

  test('headline net === getOwnerClientReport(report).overallNet (canonical, Purchase-excluded)', () => {
    expect(headlineNet(tamirDekelia)).toBe(getOwnerClientReport(tamirDekelia).overallNet)
  })

  test('the €126,000 Purchase component does NOT enter the headline', () => {
    // owner-facing only = rental +500
    expect(headlineNet(tamirDekelia)).toBeCloseTo(500, 5)
    // overallNet is the SAME quantity the PDF uses
    expect(getOwnerClientReport(tamirDekelia).overallNet).toBeCloseTo(500, 5)
  })

  test('the OLD unfiltered path WOULD have leaked the €126,000 Purchase into the net', () => {
    // Pre-change behavior: computeNetOwnerBalance(report.accounts) over the raw set.
    // purchase is client_debt => net -= 126000 ; rental owner_credit => net += 500 => -125500
    const oldUnfiltered = computeNetOwnerBalance(tamirDekelia.accounts)
    expect(oldUnfiltered).toBeCloseTo(-125500, 5)
    // The divergence between old and new is exactly the Purchase contribution (126,000).
    expect(headlineNet(tamirDekelia) - oldUnfiltered).toBeCloseTo(126000, 5)
  })

  test('Purchase remains VISIBLE in report.accounts (account list / drill-down) — filter does not mutate source', () => {
    headlineNet(tamirDekelia)
    getOwnerClientReport(tamirDekelia)
    expect(tamirDekelia.accounts.some(a => a.account_type === 'purchase')).toBe(true)
    expect(tamirDekelia.has_purchase).toBe(true)
  })

  test('Tamir Kiti 2 stays €1,651.17 (no Purchase to exclude — headline unchanged)', () => {
    const tamirKiti2 = report('Tamir Kiti 2', [
      section('rental', 1651.17, 'owner_credit'),
    ])
    expect(headlineNet(tamirKiti2)).toBeCloseTo(1651.17, 2)
    expect(getOwnerClientReport(tamirKiti2).overallNet).toBeCloseTo(1651.17, 2)
  })

  // Source guard: bind this test to the actual page so the headline can't silently
  // regress to the unfiltered expression.
  test('page.tsx headline uses the Purchase-excluded expression', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/app/client-report-rc3/page.tsx'),
      'utf-8',
    )
    expect(src).toContain(
      'const netOwnerBalance = computeNetOwnerBalance(filterOwnerFacingSections(report.accounts))',
    )
    // The old unfiltered headline assignment must be gone.
    expect(src).not.toContain('const netOwnerBalance = computeNetOwnerBalance(report.accounts)')
  })
})
