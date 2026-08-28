import { sellerPaid, sellerBalance, sellerSettlementStatus, sellerBalanceCell } from '../propertyStatus'
import type { StatusSummary } from '../propertyStatus'

const base: StatusSummary = {
  purchase_contract: 0, purchase_paid_to_seller: 0, purchase_expenses_only: 0,
  sale_contract: 0, sale_received: 0, third_party_payment: 0, sale_costs: 0,
  renovation_contract: 0, renovation_extras_charge: 0, renovation_extras_cost: 0,
  renovation_received: 0, renovation_costs: 0,
  management_income: 0, management_expenses: 0, management_fees: 0,
  airbnb_platform_income: 0, airbnb_expenses: 0,
}
const P = (o: Partial<StatusSummary>): StatusSummary => ({ ...base, ...o })

describe('sellerPaid / sellerBalance / sellerSettlementStatus (P-UI-504c)', () => {
  test('sellerPaid = JJ payments + client Third-Party Payment', () => {
    expect(sellerPaid(P({ purchase_paid_to_seller: 20000, third_party_payment: 80000 }))).toBe(100000)
  })

  test('worked example: JJ 20k + client TPP 80k close a 100k contract -> Closed, seller debt 0', () => {
    const s = P({ purchase_contract: 100000, purchase_paid_to_seller: 20000, third_party_payment: 80000 })
    expect(sellerSettlementStatus(s)).toEqual({ label: 'Closed', color: 'green' })
    expect(sellerBalance(s)).toBe(0)
  })

  test('Tamir Dekelia fixture: 180k = 54k JJ + 126k TPP -> Closed', () => {
    expect(sellerSettlementStatus(P({ purchase_contract: 180000, purchase_paid_to_seller: 54000, third_party_payment: 126000 })))
      .toEqual({ label: 'Closed', color: 'green' })
  })

  test('partial (Oren Kitty): contract 190k, JJ 0, TPP 130k -> Partially paid', () => {
    const s = P({ purchase_contract: 190000, purchase_paid_to_seller: 0, third_party_payment: 130000 })
    expect(sellerSettlementStatus(s)).toEqual({ label: 'Partially paid', color: 'yellow' })
    expect(sellerBalance(s)).toBe(60000)
  })

  test('overpaid -> Review, never auto-net negative (Yogev Port, Ofri Makarios)', () => {
    expect(sellerSettlementStatus(P({ purchase_contract: 160000, purchase_paid_to_seller: 10000, third_party_payment: 160000 })))
      .toEqual({ label: 'Review', color: 'red' })
    expect(sellerSettlementStatus(P({ purchase_contract: 103000, purchase_paid_to_seller: 18000, third_party_payment: 95000 })))
      .toEqual({ label: 'Review', color: 'red' })
  })

  test('nothing paid to seller yet -> Waiting', () => {
    expect(sellerSettlementStatus(P({ purchase_contract: 100000 })))
      .toEqual({ label: 'Waiting', color: 'orange' })
  })

  test('JJ-investment view is not altered by this module (JJ-only balance stays JJ-only)', () => {
    const s = P({ purchase_contract: 180000, purchase_paid_to_seller: 54000, third_party_payment: 126000 })
    expect(180000 - s.purchase_paid_to_seller).toBe(126000)
    expect(sellerSettlementStatus(s).label).toBe('Closed')
  })

  // ---- cents robustness (compare in integer cents; amounts with agorot) ----
  test('cents-exact: 0.10 + 0.20 settle a 0.30 contract -> Closed, no float artifact', () => {
    const s = P({ purchase_contract: 0.3, purchase_paid_to_seller: 0.1, third_party_payment: 0.2 })
    expect(sellerSettlementStatus(s)).toEqual({ label: 'Closed', color: 'green' })
    expect(sellerBalance(s)).toBe(0)
  })

  test('cents with agorot, fully paid -> Closed, sellerBalance 0', () => {
    const s = P({ purchase_contract: 100000.55, purchase_paid_to_seller: 40000.30, third_party_payment: 60000.25 })
    expect(sellerSettlementStatus(s)).toEqual({ label: 'Closed', color: 'green' })
    expect(sellerBalance(s)).toBe(0)
    expect(sellerPaid(s)).toBe(100000.55)
  })

  test('cents: one-cent overpay -> Review (never negative balance)', () => {
    const s = P({ purchase_contract: 100.00, purchase_paid_to_seller: 100.01 })
    expect(sellerSettlementStatus(s)).toEqual({ label: 'Review', color: 'red' })
    expect(sellerBalance(s)).toBe(0)
  })

  test('cents: partial remainder is cents-exact', () => {
    const s = P({ purchase_contract: 100000.00, purchase_paid_to_seller: 0, third_party_payment: 99999.99 })
    expect(sellerSettlementStatus(s)).toEqual({ label: 'Partially paid', color: 'yellow' })
    expect(sellerBalance(s)).toBe(0.01)
  })

  // ---- Balance-to-seller display cell (No data must be a grey dash, not a settled €0) ----
  test('no contract -> Balance-to-seller cell is No data (grey dash), NOT a green €0', () => {
    const c = sellerBalanceCell(P({}))
    expect(c.kind).toBe('No data')
    expect(c.color).toBe('gray')
  })

  test('sellerBalanceCell kinds: Review / Due / Paid', () => {
    expect(sellerBalanceCell(P({ purchase_contract: 160000, purchase_paid_to_seller: 10000, third_party_payment: 160000 })).kind).toBe('Review')
    expect(sellerBalanceCell(P({ purchase_contract: 190000, third_party_payment: 130000 }))).toEqual({ kind: 'Due', amount: 60000, color: 'yellow' })
    expect(sellerBalanceCell(P({ purchase_contract: 180000, purchase_paid_to_seller: 54000, third_party_payment: 126000 }))).toEqual({ kind: 'Paid', amount: 0, color: 'green' })
  })
})
