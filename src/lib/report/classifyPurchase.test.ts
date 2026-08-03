/**
 * Purchase classifier + section tests for RC3 engine.
 * Covers all 7 known subcategories, unknown fallback, section-level aggregates,
 * OB propagation, and sale label regression.
 */
import { enrichRows, buildAccountSection } from './computeBalance'
import type { RC3Row } from './types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRow(overrides: Partial<RC3Row> = {}): RC3Row {
  return {
    id:                   'row-1',
    date:                 '2025-06-01',
    property_name:        'Test Property',
    reporting_name:       'Test Property',
    category:             'Purchase',
    subcategory:          null,
    description:          null,
    payer:                'JJ',
    payee:                'Seller',
    amount_eur:           10000,
    client_charge:        null,
    client_amount:        10000,
    notes:                null,
    k_note:               null,
    account_type:         'purchase',
    is_contract_value:    false,
    is_platform_tracking: false,
    is_bpo:               false,
    review_status:        'active',
    ...overrides,
  }
}

// ─── Subcategory classifier tests (7 known + 1 unknown) ───────────────────────

describe('classifyPurchaseRow', () => {
  it('Purchase Contract → reference, balance_effect=0', () => {
    const rows = enrichRows([makeRow({ subcategory: 'Purchase Contract', is_contract_value: true, client_amount: 200000 })], 'purchase')
    expect(rows[0].display_group).toBe('reference')
    expect(rows[0].display_label).toBe('Purchase Contract (Reference)')
    expect(rows[0].balance_effect).toBe(0)
    expect(rows[0].is_balance_affecting).toBe(false)
  })

  it('Deposit → income, negative balance_effect (settles debt)', () => {
    const rows = enrichRows([makeRow({ subcategory: 'Deposit', client_amount: 5000 })], 'purchase')
    expect(rows[0].display_group).toBe('income')
    expect(rows[0].display_label).toBe('Deposit')
    expect(rows[0].balance_effect).toBe(-5000)
    expect(rows[0].is_balance_affecting).toBe(true)
  })

  it('Purchase Payment → income, negative balance_effect (settles debt)', () => {
    const rows = enrichRows([makeRow({ subcategory: 'Purchase Payment', client_amount: 20000 })], 'purchase')
    expect(rows[0].display_group).toBe('income')
    expect(rows[0].display_label).toBe('Purchase Payment')
    expect(rows[0].balance_effect).toBe(-20000)
    expect(rows[0].is_balance_affecting).toBe(true)
  })

  it('Purchase Expenses → expense, positive balance_effect (increases debt)', () => {
    const rows = enrichRows([makeRow({ subcategory: 'Purchase Expenses', client_amount: 1500 })], 'purchase')
    expect(rows[0].display_group).toBe('expense')
    expect(rows[0].display_label).toBe('Purchase Expenses')
    expect(rows[0].balance_effect).toBe(1500)
    expect(rows[0].is_balance_affecting).toBe(true)
  })

  it('Purchase Tax → expense, positive balance_effect', () => {
    const rows = enrichRows([makeRow({ subcategory: 'Purchase Tax', client_amount: 3000 })], 'purchase')
    expect(rows[0].display_group).toBe('expense')
    expect(rows[0].balance_effect).toBe(3000)
  })

  it('Purchase Lawyer → expense, positive balance_effect', () => {
    const rows = enrichRows([makeRow({ subcategory: 'Purchase Lawyer', client_amount: 2000 })], 'purchase')
    expect(rows[0].display_group).toBe('expense')
    expect(rows[0].balance_effect).toBe(2000)
  })

  it('Brokerage → expense, positive balance_effect', () => {
    const rows = enrichRows([makeRow({ subcategory: 'Brokerage', client_amount: 4000 })], 'purchase')
    expect(rows[0].display_group).toBe('expense')
    expect(rows[0].balance_effect).toBe(4000)
  })

  it('Unknown subcategory → info, balance_effect=0, labeled Needs Review', () => {
    const rows = enrichRows([makeRow({ subcategory: 'SomethingNew', client_amount: 999 })], 'purchase')
    expect(rows[0].display_group).toBe('info')
    expect(rows[0].display_label).toBe('SomethingNew (Needs Review)')
    expect(rows[0].balance_effect).toBe(0)
    expect(rows[0].is_balance_affecting).toBe(false)
  })
})

// ─── Section-level tests ──────────────────────────────────────────────────────

describe('buildAccountSection — purchase', () => {
  it('contract_baseline = sum of contract rows client_amount', () => {
    const rows = [
      makeRow({ id: 'c1', subcategory: 'Purchase Contract', is_contract_value: true, client_amount: 200000 }),
      makeRow({ id: 'd1', subcategory: 'Deposit', client_amount: 5000 }),
      makeRow({ id: 'p1', subcategory: 'Purchase Payment', client_amount: 20000 }),
    ]
    const section = buildAccountSection('purchase', rows, 0)
    expect(section.contract_baseline).toBe(200000)
    expect(section.closing_balance).toBe(200000 - 5000 - 20000)
    expect(section.balance_convention).toBe('client_debt')
    expect(section.account_label).toBe('Property Purchase')
  })

  it('opening balance propagates into closing', () => {
    const rows = [
      makeRow({ id: 'd1', subcategory: 'Deposit', client_amount: 5000 }),
    ]
    const section = buildAccountSection('purchase', rows, 10000)
    // OB 10000 + contract 0 + balance_effect (-5000) = 5000
    expect(section.opening_balance).toBe(10000)
    expect(section.closing_balance).toBe(5000)
  })
})

// ─── Sale label regression ────────────────────────────────────────────────────

describe('ACCOUNT_META regression', () => {
  it('sale label is Property Sale (not Property Purchase)', () => {
    const section = buildAccountSection('sale', [
      makeRow({ id: 's1', subcategory: 'Sale Contract', is_contract_value: true, client_amount: 100000, account_type: 'sale', category: 'Sale' }),
    ], 0)
    expect(section.account_label).toBe('Property Sale')
  })
})
