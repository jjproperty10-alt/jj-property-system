/**
 * Truth Closure tests — F-1 (Staff Accommodation Rent) + F-3 (Purchase labels).
 * Wave 2 Pre-Settlement corrections, approved 2026-08-03.
 */
import { enrichRows, buildAccountSection } from '@/lib/report/computeBalance'
import { t } from '@/lib/report/labels'
import type { RC3Row } from '@/lib/report/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRentalRow(overrides: Partial<RC3Row> = {}): RC3Row {
  return {
    id:                   'r-1',
    date:                 '2025-06-01',
    property_name:        'Uriel Duplex',
    reporting_name:       'Uriel Duplex',
    category:             'Management',
    subcategory:          'Tenant Payment',
    description:          null,
    payer:                'Tenant',
    payee:                'JJ',
    amount_eur:           1000,
    client_charge:        1000,
    client_amount:        1000,
    notes:                null,
    k_note:               null,
    account_type:         'rental',
    is_contract_value:    false,
    is_platform_tracking: false,
    is_bpo:               false,
    review_status:        'active',
    ...overrides,
  }
}

function makePurchaseRow(overrides: Partial<RC3Row> = {}): RC3Row {
  return {
    id:                   'p-1',
    date:                 '2025-01-01',
    property_name:        'Test Property',
    reporting_name:       'Test Property',
    category:             'Purchase',
    subcategory:          'Purchase Contract',
    description:          null,
    payer:                'JJ',
    payee:                'Seller',
    amount_eur:           200000,
    client_charge:        null,
    client_amount:        200000,
    notes:                null,
    k_note:               null,
    account_type:         'purchase',
    is_contract_value:    true,
    is_platform_tracking: false,
    is_bpo:               false,
    review_status:        'active',
    ...overrides,
  }
}

// ─── F-1: Staff Accommodation Rent = income (DS-009B) ────────────────────────

describe('F-1: classifyRentalRow — Staff Accommodation Rent', () => {
  it('classifies as income with positive balance_effect', () => {
    const rows = enrichRows([
      makeRentalRow({
        subcategory: 'Staff Accommodation Rent',
        payer: 'JJ',
        payee: 'JJ',
        client_amount: 1000,
      }),
    ], 'rental')

    expect(rows[0].display_group).toBe('income')
    expect(rows[0].display_label).toBe('Staff Accommodation Rent')
    expect(rows[0].balance_effect).toBe(1000)
    expect(rows[0].is_balance_affecting).toBe(true)
  })

  it('is NOT in the expense set (regression guard)', () => {
    const rows = enrichRows([
      makeRentalRow({
        subcategory: 'Staff Accommodation Rent',
        client_amount: 500,
      }),
    ], 'rental')

    expect(rows[0].display_group).not.toBe('expense')
    expect(rows[0].balance_effect).toBeGreaterThan(0)
  })
})

describe('F-1: Uriel scenario — closing balance with Staff Accommodation Rent', () => {
  it('closing = OB(0) + 5×Tenant(€1,200) + 1×StaffAccomm(€1,000) = €7,000 (before expenses/BPO)', () => {
    const rows = [
      // 5 Tenant Payments at €1,200 each = €6,000
      ...Array.from({ length: 5 }, (_, i) =>
        makeRentalRow({ id: `tp-${i}`, subcategory: 'Tenant Payment', client_amount: 1200 })
      ),
      // 1 Staff Accommodation Rent at €1,000
      makeRentalRow({
        id: 'sar-1',
        subcategory: 'Staff Accommodation Rent',
        payer: 'JJ',
        payee: 'JJ',
        client_amount: 1000,
      }),
    ]

    const section = buildAccountSection('rental', rows, 0)
    // 5×1200 + 1×1000 = 7000
    expect(section.closing_balance).toBe(7000)
  })

  it('Staff Accommodation Rent contributes +€1,000 vs without it', () => {
    const baseRows = Array.from({ length: 5 }, (_, i) =>
      makeRentalRow({ id: `tp-${i}`, subcategory: 'Tenant Payment', client_amount: 1000 })
    )
    const withoutSAR = buildAccountSection('rental', baseRows, 0)

    const withSAR = buildAccountSection('rental', [
      ...baseRows,
      makeRentalRow({
        id: 'sar-1',
        subcategory: 'Staff Accommodation Rent',
        client_amount: 1000,
      }),
    ], 0)

    expect(withSAR.closing_balance - withoutSAR.closing_balance).toBe(1000)
  })
})

describe('F-1: existing rental rules unchanged (regression)', () => {
  it('Tenant Payment is still income', () => {
    const rows = enrichRows([makeRentalRow({ subcategory: 'Tenant Payment', client_amount: 2000 })], 'rental')
    expect(rows[0].display_group).toBe('income')
    expect(rows[0].balance_effect).toBe(2000)
  })

  it('Management Fee is still expense', () => {
    const rows = enrichRows([makeRentalRow({ subcategory: 'Management Fee', client_amount: 500 })], 'rental')
    expect(rows[0].display_group).toBe('expense')
    expect(rows[0].balance_effect).toBe(-500)
  })

  it('BPO is still payment_out', () => {
    const rows = enrichRows([makeRentalRow({ subcategory: 'BPO', is_bpo: true, client_amount: 3000 })], 'rental')
    expect(rows[0].display_group).toBe('payment_out')
    expect(rows[0].balance_effect).toBe(-3000)
  })

  it('Unknown subcategory is still info with balance_effect=0', () => {
    const rows = enrichRows([makeRentalRow({ subcategory: 'SomethingNew', client_amount: 999 })], 'rental')
    expect(rows[0].display_group).toBe('info')
    expect(rows[0].balance_effect).toBe(0)
  })
})

// ─── F-3: Purchase labels ────────────────────────────────────────────────────

describe('F-3: Purchase translation keys exist', () => {
  it('cardPurchaseContract exists in en and he', () => {
    expect(t('cardPurchaseContract', 'en')).toBe('Purchase Price')
    expect(t('cardPurchaseContract', 'he')).toBe('מחיר רכישה')
  })

  it('cardPurchaseExpenses exists in en and he', () => {
    expect(t('cardPurchaseExpenses', 'en')).toBe('Purchase Expenses')
    expect(t('cardPurchaseExpenses', 'he')).toBe('הוצאות רכישה')
  })

  it('cardPurchasePayments exists in en and he', () => {
    expect(t('cardPurchasePayments', 'en')).toBe('Payments Made')
    expect(t('cardPurchasePayments', 'he')).toBe('תשלומים שבוצעו')
  })

  it('cardPurchaseBalance exists in en and he', () => {
    expect(t('cardPurchaseBalance', 'en')).toBe('Current Balance')
    expect(t('cardPurchaseBalance', 'he')).toBe('יתרה נוכחית')
  })
})

describe('F-3: Purchase account_type gets correct section metadata', () => {
  it('purchase section label is Property Purchase', () => {
    const section = buildAccountSection('purchase', [
      makePurchaseRow({ id: 'c1', subcategory: 'Purchase Contract', is_contract_value: true, client_amount: 200000 }),
    ], 0)
    expect(section.account_type).toBe('purchase')
    expect(section.account_label).toBe('Property Purchase')
    expect(section.balance_convention).toBe('client_debt')
  })

  it('sale section label is NOT Property Purchase (regression)', () => {
    const section = buildAccountSection('sale', [
      makePurchaseRow({
        id: 's1', subcategory: 'Sale Contract', is_contract_value: true,
        client_amount: 100000, account_type: 'sale', category: 'Sale',
      }),
    ], 0)
    expect(section.account_label).toBe('Property Sale')
    expect(section.account_label).not.toBe('Property Purchase')
  })
})
