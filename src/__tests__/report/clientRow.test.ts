/**
 * JJ Property 10 -- toClientRow() unit tests
 * ADR-001 Stage 4B -- M1
 *
 * Verifies:
 * 1. toClientRow() copies all required display fields
 * 2. toClientRow() NEVER copies forbidden fields (description, notes, k_note, etc.)
 * 3. ClientDisplayRow has no key that matches any forbidden field name
 * 4. subcategory null coalescing works correctly
 */

import { toClientRow } from '@/lib/report/clientRow'
import type { ClientDisplayRow } from '@/lib/report/clientRow'
import type { RC3AccountRow } from '@/lib/report/types'

/* -- Test helper ------------------------------------------------------------ */

function makeFullRow(overrides: Partial<RC3AccountRow> = {}): RC3AccountRow {
  return {
    id: 'row-uuid-1',
    date: '2026-01-15',
    property_name: 'Tamir Dekelia',
    reporting_name: 'Tamir Dekelia',
    category: 'Management',
    subcategory: 'Rent Collected',
    // Sentinel values -- toClientRow must NEVER copy these to ClientDisplayRow
    description: '__SENTINEL_DESCRIPTION__',
    notes: '__SENTINEL_NOTES__',
    k_note: '__SENTINEL_K_NOTE__',
    payer: '__SENTINEL_PAYER__',
    payee: '__SENTINEL_PAYEE__',
    amount_eur: 999999,
    client_charge: 888888,
    client_amount: 1200,
    account_type: 'rental',
    is_contract_value: false,
    is_platform_tracking: false,
    is_bpo: false,
    review_status: 'active',
    balance_effect: 1200,
    is_balance_affecting: true,
    display_group: 'income',
    display_label: 'Rent Collected',
    ...overrides,
  }
}

/* -- Required fields -------------------------------------------------------- */

describe('toClientRow -- required fields are copied correctly', () => {
  it('copies id', () => {
    expect(toClientRow(makeFullRow()).id).toBe('row-uuid-1')
  })

  it('copies date', () => {
    expect(toClientRow(makeFullRow()).date).toBe('2026-01-15')
  })

  it('copies client_amount (not amount_eur)', () => {
    const row = makeFullRow({ amount_eur: 999999, client_amount: 1200 })
    expect(toClientRow(row).client_amount).toBe(1200)
    expect(toClientRow(row).client_amount).not.toBe(999999)
  })

  it('copies display_group', () => {
    expect(toClientRow(makeFullRow()).display_group).toBe('income')
  })

  it('copies display_label', () => {
    expect(toClientRow(makeFullRow()).display_label).toBe('Rent Collected')
  })

  it('copies account_type', () => {
    expect(toClientRow(makeFullRow()).account_type).toBe('rental')
  })

  it('copies subcategory when present', () => {
    expect(toClientRow(makeFullRow({ subcategory: 'Electricity' })).subcategory).toBe('Electricity')
  })

  it('coerces subcategory null to null (not undefined)', () => {
    const result = toClientRow(makeFullRow({ subcategory: null }))
    expect(result.subcategory).toBeNull()
  })
})

/* -- Forbidden fields must never appear ------------------------------------- */

const FORBIDDEN_FIELDS = [
  'description', 'notes', 'k_note', 'memo',
  'payer', 'payee',
  'amount_eur', 'client_charge',
  'property_name', 'reporting_name',
  'is_contract_value', 'is_platform_tracking', 'is_bpo',
  'balance_effect', 'is_balance_affecting',
  'review_status', 'created_at', 'updated_at',
  'category',
] as const

describe('toClientRow -- forbidden fields are structurally absent', () => {
  it('result object has exactly the allowed keys', () => {
    const result = toClientRow(makeFullRow())
    const keys = Object.keys(result).sort()
    expect(keys).toEqual([
      'account_type',
      'client_amount',
      'date',
      'display_group',
      'display_label',
      'id',
      'subcategory',
    ])
  })

  for (const field of FORBIDDEN_FIELDS) {
    it(`result does not contain key "${field}"`, () => {
      const result = toClientRow(makeFullRow()) as Record<string, unknown>
      expect(Object.prototype.hasOwnProperty.call(result, field)).toBe(false)
    })
  }

  it('sentinel values never appear in result', () => {
    const result = toClientRow(makeFullRow()) as Record<string, unknown>
    const values = Object.values(result)
    expect(values).not.toContain('__SENTINEL_DESCRIPTION__')
    expect(values).not.toContain('__SENTINEL_NOTES__')
    expect(values).not.toContain('__SENTINEL_K_NOTE__')
    expect(values).not.toContain('__SENTINEL_PAYER__')
    expect(values).not.toContain('__SENTINEL_PAYEE__')
  })
})

/* -- Type safety ------------------------------------------------------------ */

describe('toClientRow -- type safety', () => {
  it('result is assignable to ClientDisplayRow', () => {
    const row = makeFullRow()
    const dto: ClientDisplayRow = toClientRow(row)
    expect(dto).toBeDefined()
  })

  it('handles all display_group values', () => {
    const groups = ['income', 'expense', 'payment_out', 'info', 'reference'] as const
    for (const grp of groups) {
      const result = toClientRow(makeFullRow({ display_group: grp }))
      expect(result.display_group).toBe(grp)
    }
  })

  it('handles all account_type values', () => {
    const types = ['sale', 'renovation', 'rental', 'airbnb'] as const
    for (const at of types) {
      const result = toClientRow(makeFullRow({ account_type: at }))
      expect(result.account_type).toBe(at)
    }
  })
})
