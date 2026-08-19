/**
 * G6 — Owner/Client report composition reconciliation tests.
 *
 * Proves that the canonical composition contract (getOwnerClientReport) is the
 * single owner-facing net authority, and that the PDF hero net (which now calls
 * it) reconciles EXACTLY with the Owner Workspace net authority
 * (computeOwnerFacingNet / computeNetOwnerBalance over filterOwnerFacingSections).
 *
 * Also pins the pre-G6 divergence: the OLD PDF path
 * `computeNetOwnerBalance(report.accounts)` (unfiltered) leaked JJ-internal
 * Purchase into the owner-facing net.
 */
import { getOwnerClientReport, getPortfolioOwnerNet } from '@/lib/report/ownerClientReport'
import {
  computeOwnerFacingNet,
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

describe('G6 — owner/client report composition contract', () => {
  // purchase (JJ-internal, client_debt +50000) MUST be excluded from owner-facing net.
  // rental owner_credit +1200 => +1200 ; sale client_debt +300 => -300 ; net = 900
  const rep = report('Villa X', [
    section('purchase', 50000, 'client_debt'),
    section('rental', 1200, 'owner_credit'),
    section('sale', 300, 'client_debt'),
  ])

  test('ownerFacingAccounts excludes Purchase', () => {
    const v = getOwnerClientReport(rep)
    expect(v.ownerFacingAccounts.some(a => a.account_type === 'purchase')).toBe(false)
    expect(v.ownerFacingAccounts.map(a => a.account_type).sort()).toEqual(['rental', 'sale'])
  })

  test('overallNet equals the workspace net authority and excludes Purchase', () => {
    const v = getOwnerClientReport(rep)
    expect(v.overallNet).toBe(computeOwnerFacingNet(rep.accounts))
    expect(v.overallNet).toBeCloseTo(900, 5)
  })

  test('reconciliation: contract net (PDF) == workspace net; unfiltered leaks Purchase', () => {
    const contractNet = getOwnerClientReport(rep).overallNet // PDF hero net now uses this
    const workspaceNet = computeNetOwnerBalance(filterOwnerFacingSections(rep.accounts))
    const unfilteredNet = computeNetOwnerBalance(rep.accounts) // the pre-G6 buggy PDF path
    expect(contractNet).toBe(workspaceNet)
    expect(unfilteredNet).not.toBe(contractNet)
    // purchase client_debt +50000 contributed -50000 to the unfiltered net
    expect(contractNet - unfilteredNet).toBeCloseTo(50000, 5)
  })

  test('portfolio net sums per-property owner-facing nets', () => {
    const r2 = report('Flat Y', [section('rental', 500, 'owner_credit')])
    expect(getPortfolioOwnerNet([rep, r2])).toBeCloseTo(900 + 500, 5)
  })

  test('no Purchase present => contract net equals raw net (no behavior change)', () => {
    const r = report('No Purchase', [
      section('rental', 700, 'owner_credit'),
      section('renovation', 200, 'client_debt'),
    ])
    expect(getOwnerClientReport(r).overallNet).toBe(computeNetOwnerBalance(r.accounts))
  })
})
