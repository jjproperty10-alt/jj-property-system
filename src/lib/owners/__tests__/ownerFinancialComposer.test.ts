/**
 * Focused unit regression for the pure OwnerFinancial DTO composer.
 *
 * Guards the monetary-field contract fixed in ownerFinancialAdapter.ts:
 *   - openingBalanceEur is ALWAYS emitted (including "0"), never undefined.
 *   - actualCostEur / marginEur are null (never undefined) when a row has no margin.
 *
 * Pure functions only — no DB, no REST, no Test-38 helper, no acctMap. Runs under the
 * default (mocked) Jest env like every other unit suite.
 */
import { mapRowToDTO, mapSectionToDTO } from '../ownerFinancialAdapter'
import type { RC3AccountRow, RC3AccountSection } from '@/lib/report/types'

function makeRow(over: Partial<RC3AccountRow> = {}): RC3AccountRow {
  return {
    id: 'r1', date: '2025-03-15', property_name: 'Villa Mazotos', reporting_name: 'Villa Mazotos',
    category: 'Rent', subcategory: 'Rent Collected', description: null, payer: null, payee: null,
    amount_eur: 100, client_charge: null, client_amount: 100, notes: null, k_note: null,
    account_type: 'rental', is_contract_value: false, is_platform_tracking: false, is_bpo: false,
    review_status: 'active',
    balance_effect: 100, is_balance_affecting: true, display_group: 'income', display_label: 'Rent Collected',
    ...over,
  }
}
function makeSection(over: Partial<RC3AccountSection> = {}): RC3AccountSection {
  return {
    account_type: 'rental', account_label: 'Rental', account_label_he: 'שכירות',
    balance_convention: 'owner_credit', opening_balance: 0, rows: [],
    contract_baseline: 0, total_income: 0, total_expenses: 0, total_bpo: 0, closing_balance: 0,
    ...over,
  }
}

const MONETARY = new Set([
  'incomeEur','expensesEur','netEur','openingBalanceEur','closingBalanceEur','ownerDirectionAmountEur',
  'amountEur','actualCostEur','marginEur',
])
function undefinedMonetary(root: unknown): string[] {
  const out: string[] = []
  const walk = (v: unknown, path: string): void => {
    if (Array.isArray(v)) { v.forEach((x, i) => walk(x, `${path}[${i}]`)); return }
    if (v && typeof v === 'object') {
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        if (MONETARY.has(k) && val === undefined) out.push(`${path}.${k}`)
        walk(val, `${path}.${k}`)
      }
    }
  }
  walk(root, '$')
  return out
}

describe('OwnerFinancial DTO composer — monetary field contract', () => {
  test('a. opening_balance=0 -> openingBalanceEur === "0"', () => {
    const dto = mapSectionToDTO(makeSection({ opening_balance: 0 }), 'Villa Mazotos')
    expect(dto.openingBalanceEur).toBe('0')
  })

  test('b. no-margin row -> actualCostEur === null and marginEur === null', () => {
    const nullCharge = mapRowToDTO(makeRow({ client_charge: null, amount_eur: 100, client_amount: 100 }), 'Villa Mazotos', 'rental')
    expect(nullCharge.actualCostEur).toBeNull()
    expect(nullCharge.marginEur).toBeNull()
    const equalCharge = mapRowToDTO(makeRow({ client_charge: 100, amount_eur: 100, client_amount: 100 }), 'Villa Mazotos', 'rental')
    expect(equalCharge.actualCostEur).toBeNull()
    expect(equalCharge.marginEur).toBeNull()
  })

  test('c. margin row -> numeric EuroAmount strings', () => {
    const dto = mapRowToDTO(makeRow({ client_charge: 150, amount_eur: 100, client_amount: 150 }), 'Villa Mazotos', 'rental')
    expect(typeof dto.actualCostEur).toBe('string')
    expect(typeof dto.marginEur).toBe('string')
    expect(Number.isFinite(Number(dto.actualCostEur))).toBe(true)
    expect(Number.isFinite(Number(dto.marginEur))).toBe(true)
    expect(dto.actualCostEur).toBe('100')
    expect(dto.marginEur).toBe('50')
  })

  test('d. produced DTO has no undefined in enumerated monetary fields (recursive)', () => {
    const section = makeSection({
      opening_balance: 0,
      rows: [
        makeRow({ id: 'a', client_charge: null, amount_eur: 100, client_amount: 100 }),
        makeRow({ id: 'b', client_charge: 150, amount_eur: 100, client_amount: 150 }),
      ],
    })
    const dto = mapSectionToDTO(section, 'Villa Mazotos')
    expect(undefinedMonetary(dto)).toEqual([])
    expect(dto.openingBalanceEur).toBe('0')
    expect(dto.rows[0].actualCostEur).toBeNull()
    expect(dto.rows[1].marginEur).toBe('50')
  })
})
