/**
 * Regression tests — computeFinancialAlerts margin consolidation (Closure G2).
 *
 * Section 8 (Owner/Client Financial Final Closure):
 *   - Margin / amount-mismatch alerts must collapse to ONE summary alert,
 *     never one-alert-per-row.
 *   - "Infinity%" must never appear (actual cost = 0 → no ratio rendered).
 *   - Margin analysis is JJ-internal — the alert points to the drill-down.
 */
import { computeFinancialAlerts } from '../ownerFinancialAdapter'
import type { RC3PropertyReport, RC3AccountRow } from '@/lib/report/types'

function row(partial: Partial<RC3AccountRow>): RC3AccountRow {
  return {
    id: Math.random().toString(36).slice(2),
    date: '2026-01-01',
    property_name: 'P',
    reporting_name: 'P',
    category: 'Management',
    subcategory: 'Repair',
    description: 'x',
    payer: null,
    payee: null,
    amount_eur: 100,
    client_charge: 100,
    client_amount: 100,
    notes: null,
    k_note: null,
    account_type: 'rental',
    is_contract_value: false,
    is_platform_tracking: false,
    is_bpo: false,
    review_status: 'active',
    balance_effect: 0,
    is_balance_affecting: true,
    display_group: 'expense',
    display_label: 'Repair',
    ...partial,
  } as RC3AccountRow
}

function report(rows: RC3AccountRow[]): RC3PropertyReport {
  return {
    reporting_name: 'P',
    from_date: null,
    to_date: null,
    generated_at: '2026-01-01T00:00:00Z',
    accounts: [
      {
        account_type: 'rental',
        account_label: 'Rental',
        account_label_he: 'שכירות',
        balance_convention: 'owner_credit',
        opening_balance: 0,
        rows,
        contract_baseline: 0,
        total_income: 0,
        total_expenses: 0,
        total_bpo: 0,
        closing_balance: 0,
      },
    ],
    has_purchase: false,
    has_sale: false,
    has_renovation: false,
    has_rental: true,
    has_airbnb: false,
  }
}

describe('computeFinancialAlerts — margin consolidation (G2)', () => {
  test('many margin rows collapse to exactly ONE amount_mismatch alert', () => {
    const rows = Array.from({ length: 22 }, (_, i) =>
      row({ amount_eur: 100, client_charge: 500, id: `m${i}` }),
    )
    const alerts = computeFinancialAlerts([report(rows)])
    const margin = alerts.filter(a => a.category === 'amount_mismatch')
    expect(margin).toHaveLength(1)
    expect(margin[0].message).toContain('22 transactions have margin differences')
  })

  test('never emits "Infinity" when actual cost is 0', () => {
    const rows = [
      row({ amount_eur: 0, client_charge: 1000, id: 'z1' }),
      row({ amount_eur: 0, client_charge: 250, id: 'z2' }),
    ]
    const alerts = computeFinancialAlerts([report(rows)])
    const margin = alerts.filter(a => a.category === 'amount_mismatch')
    expect(margin).toHaveLength(1)
    expect(margin[0].message).not.toMatch(/Infinity/)
    expect(margin[0].message).toContain('actual cost not recorded')
  })

  test('no margin alert when charges equal actual cost', () => {
    const rows = [row({ amount_eur: 100, client_charge: 100 })]
    const alerts = computeFinancialAlerts([report(rows)])
    expect(alerts.filter(a => a.category === 'amount_mismatch')).toHaveLength(0)
  })

  test('sub-threshold differences (<=20% and <=€100) are not flagged', () => {
    const rows = [row({ amount_eur: 1000, client_charge: 1050 })] // 5% / €50
    const alerts = computeFinancialAlerts([report(rows)])
    expect(alerts.filter(a => a.category === 'amount_mismatch')).toHaveLength(0)
  })
})
