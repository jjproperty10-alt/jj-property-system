/**
 * Tests for executiveSummary.ts — M2 pure business logic
 * Tests: operational KPI filtering, balance direction, full/periodic modules
 */
import {
  computeOperationalKPIs,
  computeNetOwnerBalance,
  OPERATIONAL_ACCOUNT_TYPES,
} from '../../lib/report/executiveSummary'
import type { RC3AccountSection } from '../../lib/report/types'

// ── Fixtures ────────────────────────────────────────────────────────────────
function makeSection(
  account_type: string,
  overrides: Partial<RC3AccountSection> = {},
): RC3AccountSection {
  return {
    account_type,
    account_label:       account_type,
    balance_convention:  'owner_credit',
    opening_balance:     0,
    closing_balance:     0,
    total_income:        0,
    total_expenses:      0,
    total_bpo:           0,
    contract_baseline:   0,
    rows:                [],
    balance_equation:    '',
    ...overrides,
  } as RC3AccountSection
}

const SALE   = makeSection('sale',       { total_income: 500,  total_expenses: 200, closing_balance: 300,  balance_convention: 'client_debt'  })
const RENOV  = makeSection('renovation', { total_income: 800,  total_expenses: 600, closing_balance: 200,  balance_convention: 'client_debt'  })
const RENTAL = makeSection('rental',     { total_income: 1200, total_expenses: 300, total_bpo: 500, closing_balance: 400, balance_convention: 'owner_credit' })
const AIRBNB = makeSection('airbnb',     { total_income: 900,  total_expenses: 200, total_bpo: 400, closing_balance: 300, balance_convention: 'owner_credit' })

// ── OPERATIONAL_ACCOUNT_TYPES ────────────────────────────────────────────────
describe('OPERATIONAL_ACCOUNT_TYPES', () => {
  it('contains rental and airbnb', () => {
    expect(OPERATIONAL_ACCOUNT_TYPES.has('rental')).toBe(true)
    expect(OPERATIONAL_ACCOUNT_TYPES.has('airbnb')).toBe(true)
  })
  it('does not contain sale or renovation', () => {
    expect(OPERATIONAL_ACCOUNT_TYPES.has('sale')).toBe(false)
    expect(OPERATIONAL_ACCOUNT_TYPES.has('renovation')).toBe(false)
  })
})

// ── computeOperationalKPIs ──────────────────────────────────────────────────
describe('computeOperationalKPIs', () => {
  it('excludes sale and renovation from operational totals', () => {
    const kpis = computeOperationalKPIs([SALE, RENOV, RENTAL, AIRBNB])
    expect(kpis.income).toBe(1200 + 900)    // only rental + airbnb
    expect(kpis.expenses).toBe(300 + 200)
    expect(kpis.transfers).toBe(500 + 400)
  })
  it('returns hasOperational=true when rental or airbnb present', () => {
    expect(computeOperationalKPIs([RENTAL]).hasOperational).toBe(true)
    expect(computeOperationalKPIs([AIRBNB]).hasOperational).toBe(true)
  })
  it('returns hasOperational=false when only sale/renovation', () => {
    expect(computeOperationalKPIs([SALE, RENOV]).hasOperational).toBe(false)
  })
  it('returns all zeros with hasOperational=false for empty array', () => {
    const kpis = computeOperationalKPIs([])
    expect(kpis.income).toBe(0)
    expect(kpis.expenses).toBe(0)
    expect(kpis.transfers).toBe(0)
    expect(kpis.hasOperational).toBe(false)
  })
  it('Full report: income is rental+airbnb income only', () => {
    const kpis = computeOperationalKPIs([SALE, RENOV, RENTAL, AIRBNB])
    expect(kpis.income).toBe(2100)   // 1200+900
  })
  it('Periodic (no sale): income still excludes renovation', () => {
    const kpis = computeOperationalKPIs([RENOV, RENTAL, AIRBNB])
    expect(kpis.income).toBe(2100)
  })
  it('client_debt convention flips balance contribution', () => {
    // SALE has client_debt convention, closing_balance=300 → should subtract
    const kpis = computeOperationalKPIs([SALE])
    // SALE is not operational, so result is zero
    expect(kpis.netBalance).toBe(0)
  })
  it('netBalance: owner_credit adds, client_debt subtracts', () => {
    const creditAcc = makeSection('rental', { closing_balance: 100, balance_convention: 'owner_credit', total_income: 100 })
    const debtAcc   = makeSection('airbnb', { closing_balance: 60,  balance_convention: 'client_debt',  total_income: 60  })
    const kpis = computeOperationalKPIs([creditAcc, debtAcc])
    expect(kpis.netBalance).toBe(100 - 60)  // +100 - 60 = +40
  })
})

// ── computeNetOwnerBalance ──────────────────────────────────────────────────
describe('computeNetOwnerBalance', () => {
  it('owner_credit adds balance', () => {
    const acc = makeSection('rental', { closing_balance: 500, balance_convention: 'owner_credit' })
    expect(computeNetOwnerBalance([acc])).toBe(500)
  })
  it('client_debt subtracts balance', () => {
    const acc = makeSection('sale', { closing_balance: 300, balance_convention: 'client_debt' })
    expect(computeNetOwnerBalance([acc])).toBe(-300)
  })
  it('full report: net = owner_credit sum - client_debt sum', () => {
    // RENTAL=+400, AIRBNB=+300, SALE=-300, RENOV=-200 → net=200
    expect(computeNetOwnerBalance([SALE, RENOV, RENTAL, AIRBNB])).toBe(200)
  })
  it('HE/EN switch does not affect totals', () => {
    // computeNetOwnerBalance is lang-agnostic; same result regardless
    const net = computeNetOwnerBalance([SALE, RENOV, RENTAL, AIRBNB])
    expect(net).toBe(200)
  })
  it('returns 0 for empty array', () => {
    expect(computeNetOwnerBalance([])).toBe(0)
  })
  it('returns 0 when credits exactly offset debts', () => {
    const credit = makeSection('rental', { closing_balance: 500, balance_convention: 'owner_credit' })
    const debt   = makeSection('sale',   { closing_balance: 500, balance_convention: 'client_debt'  })
    expect(computeNetOwnerBalance([credit, debt])).toBe(0)
  })
  it('balance_convention accounting totals unchanged by language', () => {
    const net1 = computeNetOwnerBalance([RENTAL, AIRBNB])
    expect(net1).toBe(700)  // 400+300
  })
})
