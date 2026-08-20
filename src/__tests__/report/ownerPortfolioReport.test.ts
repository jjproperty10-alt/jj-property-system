/**
 * G1 — Owner Portfolio (Full Owner Report) composition tests.
 * Proves: portfolio overall net == sum of per-property owner-facing nets;
 * single-property parity; Purchase excluded across every property.
 */
import { getOwnerPortfolioReport } from '@/lib/report/ownerPortfolioReport'
import { getOwnerClientReport } from '@/lib/report/ownerClientReport'
import type { RC3PropertyReport, RC3AccountSection, RC3AccountType, BalanceConvention } from '@/lib/report/types'

function section(t: RC3AccountType, bal: number, conv: BalanceConvention): RC3AccountSection {
  return { account_type: t, account_label: t, account_label_he: t, balance_convention: conv,
    opening_balance: 0, rows: [], contract_baseline: 0, total_income: 0, total_expenses: 0,
    total_bpo: 0, closing_balance: bal } as RC3AccountSection
}
function report(name: string, accounts: RC3AccountSection[]): RC3PropertyReport {
  return { reporting_name: name, from_date: null, to_date: null, generated_at: '2026-01-01T00:00:00Z', accounts,
    has_purchase: accounts.some(a => a.account_type === 'purchase'), has_sale: false,
    has_renovation: false, has_rental: accounts.some(a => a.account_type === 'rental'), has_airbnb: false }
}

describe('G1 — owner portfolio (full owner report) composition', () => {
  const a = report('Villa A', [section('purchase', 90000, 'client_debt'), section('rental', 1000, 'owner_credit')]) // net 1000
  const b = report('Flat B',  [section('rental', 300, 'owner_credit'), section('sale', 200, 'client_debt')])       // net 100

  test('overall net = sum of per-property owner-facing nets (Purchase excluded)', () => {
    const p = getOwnerPortfolioReport([a, b])
    expect(p.properties.map(x => x.reporting_name)).toEqual(['Villa A', 'Flat B'])
    expect(p.properties[0].overallNet).toBeCloseTo(1000, 5) // purchase excluded
    expect(p.properties[1].overallNet).toBeCloseTo(100, 5)
    expect(p.overallNet).toBeCloseTo(1100, 5)
  })

  test('single-property parity with getOwnerClientReport', () => {
    const p = getOwnerPortfolioReport([a])
    expect(p.overallNet).toBe(getOwnerClientReport(a).overallNet)
    expect(p.propertyCount).toBe(1)
  })

  test('Purchase never contributes to any property net', () => {
    const p = getOwnerPortfolioReport([a, b])
    for (const v of p.properties) {
      expect(v.ownerFacingAccounts.some(s => s.account_type === 'purchase')).toBe(false)
    }
  })
})
