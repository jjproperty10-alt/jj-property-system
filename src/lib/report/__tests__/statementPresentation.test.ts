/**
 * Regression tests for the owner-statement PRESENTATION helpers (PDF fix pass).
 *
 * Proves, with GENERIC fixtures (no Tamir data):
 *  - Tenant Payment stays rental income; Client Payment settlement is NOT rent.
 *  - Renovation headers are correct (payments vs approved charges).
 *  - The settlement summary components are separated (payments ≠ expenses ≠ settlements).
 *  - The canonical final balance is unaffected by the presentation helpers (cent-exact).
 */
import type { RC3AccountRow, RC3AccountSection, DisplayGroup } from '../types'
import {
  renovationGroupHeaders,
  splitOperatingIncome,
  splitOperatingIncomeTotals,
  computeStatementComponents,
} from '../statementPresentation'

// ---- generic fixture builders --------------------------------------------------
function mkRow(p: Partial<RC3AccountRow>): RC3AccountRow {
  return {
    id: p.id ?? Math.random().toString(36).slice(2),
    date: p.date ?? '2026-01-01',
    property_name: 'Example Property',
    reporting_name: 'Example Property',
    category: p.category ?? 'Management',
    subcategory: p.subcategory ?? null,
    description: null, payer: null, payee: null,
    amount_eur: p.amount_eur ?? p.client_amount ?? 0,
    client_charge: null,
    client_amount: p.client_amount ?? 0,
    notes: null, k_note: null,
    account_type: p.account_type ?? 'rental',
    is_contract_value: false,
    is_platform_tracking: false,
    is_bpo: p.is_bpo ?? false,
    review_status: 'active',
    balance_effect: p.balance_effect ?? 0,
    is_balance_affecting: p.is_balance_affecting ?? true,
    display_group: (p.display_group ?? 'income') as DisplayGroup,
    display_label: p.display_label ?? 'Row',
  }
}
function mkSection(p: Partial<RC3AccountSection>): RC3AccountSection {
  return {
    account_type: p.account_type ?? 'rental',
    account_label: p.account_label ?? 'Account',
    account_label_he: p.account_label_he ?? 'חשבון',
    balance_convention: p.balance_convention ?? 'owner_credit',
    opening_balance: p.opening_balance ?? 0,
    rows: p.rows ?? [],
    contract_baseline: p.contract_baseline ?? 0,
    total_income: p.total_income ?? 0,
    total_expenses: p.total_expenses ?? 0,
    total_bpo: p.total_bpo ?? 0,
    closing_balance: p.closing_balance ?? 0,
  }
}

// Generic report shaped like a renovation + rental statement.
const renovation = mkSection({
  account_type: 'renovation', balance_convention: 'client_debt',
  contract_baseline: 87000, closing_balance: -850,
  rows: [
    mkRow({ subcategory: 'Extras',        display_group: 'expense', balance_effect: 15442,   client_amount: 15442,  display_label: 'Extras (Additional Work)' }),
    mkRow({ subcategory: 'Client Payment', display_group: 'income',  balance_effect: -103292, client_amount: 103292, display_label: 'Payment Received' }),
  ],
})
const rental = mkSection({
  account_type: 'rental', balance_convention: 'owner_credit',
  closing_balance: 3695.69,
  rows: [
    mkRow({ subcategory: 'Tenant Payment', display_group: 'income',  balance_effect: 2400,    client_amount: 2400,    display_label: 'Rent Collected' }),
    mkRow({ subcategory: 'Client Payment', display_group: 'income',  balance_effect: 3565.69, client_amount: 3565.69, display_label: 'Client Payment' }),
    mkRow({ subcategory: 'Management Fee',  display_group: 'expense', balance_effect: -2270,   client_amount: 2270,    display_label: 'Management Fee' }),
  ],
})
const accounts = [renovation, rental]

// settlement-only operating account: all "income" is a cross-property Client Payment
// (mirrors Tamir Kiti, which has NO Tenant Payment rows).
const settlementOnly = mkSection({
  account_type: 'rental', balance_convention: 'owner_credit',
  total_income: 3565.69, total_expenses: 5346.08, closing_balance: -1780.39,
  rows: [
    mkRow({ subcategory: 'Client Payment',   display_group: 'income',  balance_effect: 3565.69,  client_amount: 3565.69, display_label: 'Client Payment' }),
    mkRow({ subcategory: 'Electricity bill', display_group: 'expense', balance_effect: -5346.08, client_amount: 5346.08, display_label: 'Electricity' }),
  ],
})

// rental-only operating account: all income is genuine Tenant Payment rent
const rentalOnly = mkSection({
  account_type: 'rental', balance_convention: 'owner_credit',
  total_income: 2400, total_expenses: 0, closing_balance: 2400,
  rows: [
    mkRow({ subcategory: 'Tenant Payment', display_group: 'income', balance_effect: 2400, client_amount: 2400, display_label: 'Rent Collected' }),
  ],
})

// canonical net exactly as the PDF computes it (owner_credit +, client_debt −)
function canonicalNet(secs: RC3AccountSection[]): number {
  let net = 0
  for (const a of secs) net += a.balance_convention === 'owner_credit' ? a.closing_balance : -a.closing_balance
  return net
}

describe('splitOperatingIncome (#1)', () => {
  // The template calls splitOperatingIncome on the income-group rows only.
  const incomeGroupRows = rental.rows.filter(r => r.display_group === 'income')
  it('keeps Tenant Payment as income and moves Client Payment to settlements', () => {
    const { income, settlements } = splitOperatingIncome(incomeGroupRows)
    expect(income.map(r => r.subcategory)).toEqual(['Tenant Payment'])
    expect(settlements.map(r => r.subcategory)).toEqual(['Client Payment'])
  })
  it('a Tenant Payment is never classified as a settlement', () => {
    const { settlements } = splitOperatingIncome(incomeGroupRows)
    expect(settlements.some(r => r.subcategory === 'Tenant Payment')).toBe(false)
  })
})

describe('splitOperatingIncomeTotals (#1 — KPI/summary surface)', () => {
  it('mixed account: separates genuine rent from cross-property settlement', () => {
    const s = splitOperatingIncomeTotals(rental)
    expect(s.rentalIncome).toBeCloseTo(2400, 2)
    expect(s.crossPropertySettlements).toBeCloseTo(3565.69, 2)
  })
  it('settlement-only account: zero rental income, full settlement, reconciles to total_income', () => {
    const s = splitOperatingIncomeTotals(settlementOnly)
    expect(s.rentalIncome).toBe(0)
    expect(s.crossPropertySettlements).toBeCloseTo(3565.69, 2)
    expect(s.rentalIncome + s.crossPropertySettlements).toBeCloseTo(settlementOnly.total_income, 2)
  })
  it('rental-only account: full rental income, zero settlement, reconciles to total_income', () => {
    const s = splitOperatingIncomeTotals(rentalOnly)
    expect(s.rentalIncome).toBeCloseTo(2400, 2)
    expect(s.crossPropertySettlements).toBe(0)
    expect(s.rentalIncome + s.crossPropertySettlements).toBeCloseTo(rentalOnly.total_income, 2)
  })
  it('never reports a settlement as rental income', () => {
    const s = splitOperatingIncomeTotals(rental)
    expect(s.rentalIncome).not.toBe(s.crossPropertySettlements)
    expect(s.rentalIncome).not.toBe(3565.69)
  })
  it('is presentation only — does not change the canonical net', () => {
    const before = canonicalNet([settlementOnly])
    void splitOperatingIncomeTotals(settlementOnly)
    expect(canonicalNet([settlementOnly])).toBeCloseTo(before, 2)
  })
})

describe('renovationGroupHeaders (#2)', () => {
  it('labels the income group Payments Received and expense group Additional Approved Charges', () => {
    const h = renovationGroupHeaders('en')
    expect(h.income).toBe('Payments Received')
    expect(h.expense).toBe('Additional Approved Charges')
  })
})

describe('computeStatementComponents (#3)', () => {
  const c = computeStatementComponents(accounts)
  it('separates the five components without mixing payments, settlements, and expenses', () => {
    expect(c.renovationContract).toBe(87000)
    expect(c.approvedExtras).toBe(15442)
    expect(c.paymentsReceived).toBe(103292)          // renovation client payments
    expect(c.crossPropertySettlements).toBeCloseTo(3565.69, 2) // rental Client Payment, NOT rent
    expect(c.propertyExpenses).toBe(2270)            // rental expenses only
  })
  it('does not fold cross-property settlements into rental income or into expenses', () => {
    // settlement value must not equal rent (2400) and must not appear in expenses
    expect(c.crossPropertySettlements).not.toBe(2400)
    expect(c.propertyExpenses).not.toBe(c.crossPropertySettlements)
  })
})

describe('canonical final balance is unaffected by presentation (#3 guardrail)', () => {
  it('net stays cent-exact whether or not the components are computed', () => {
    const before = canonicalNet(accounts)
    // running the presentation helpers must not mutate accounts or the net
    void computeStatementComponents(accounts)
    void splitOperatingIncome(rental.rows)
    const after = canonicalNet(accounts)
    expect(after).toBeCloseTo(before, 2)
    expect(after).toBeCloseTo(4545.69, 2) // fixture's net; components never feed this
  })
})
