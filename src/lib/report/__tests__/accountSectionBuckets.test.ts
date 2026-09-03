/**
 * Pure unit tests for buildAccountSection income/expense/BPO bucketing.
 *
 * Root cause under test (Test-38 v19.2 amount-correction): a signed correction
 * REVERSAL row keeps its semantic display_group (e.g. an 'Electricity' contra-row
 * stays display_group='expense') but carries a positive balance_effect. The old
 * sign-based bucketing (balance_effect > 0 => income) mis-counted such reversals
 * as income, inflating position.incomeEur. The fix buckets strictly by
 * display_group, so a reversal only ever reduces its OWN bucket.
 *
 * No DB, no cert2, no report engine — buildAccountSection is called directly on
 * hand-built RC3Row fixtures.
 *
 * DisplayGroup enumeration (src/lib/report/types.ts) is EXACTLY 5 values:
 *   income | expense | payment_out | info | reference
 * is_balance_affecting is true ONLY for income / expense / payment_out, so
 * balanceRows can only ever contain those three groups; 'expense' is the sole
 * non-income, non-bpo balance-affecting group. All five are exercised below.
 */
import { buildAccountSection } from '../computeBalance'
import type { RC3Row } from '../types'

let seq = 0
function mkRow(overrides: Partial<RC3Row>): RC3Row {
  seq += 1
  return {
    id:                   `row-${seq}`,
    date:                 '2025-03-15',
    property_name:        'Test Property',
    reporting_name:       'Test Property',
    category:             'Management',
    subcategory:          null,
    description:          null,
    payer:                null,
    payee:                null,
    amount_eur:           0,
    client_charge:        null,
    client_amount:        0,
    notes:                null,
    k_note:               null,
    account_type:         'rental',
    is_contract_value:    false,
    is_platform_tracking: false,
    is_bpo:               false,
    review_status:        null,
    ...overrides,
  }
}

const rentExpense = (amount: number, sub = 'Electricity') =>
  mkRow({ subcategory: sub, client_amount: amount })
const rentIncome = (amount: number, sub = 'Tenant Payment') =>
  mkRow({ subcategory: sub, client_amount: amount })
const rentBpo = (amount: number) =>
  mkRow({ subcategory: 'Payment to Owner', is_bpo: true, client_amount: amount })

describe('buildAccountSection — semantic bucketing (display_group, not sign)', () => {
  // ── Invariant 1: normal income unchanged ────────────────────────────────────
  it('normal income: contributes to total_income only', () => {
    const s = buildAccountSection('rental', [rentIncome(500)])
    expect(s.total_income).toBe(500)
    expect(s.total_expenses).toBe(0)
    expect(s.total_bpo).toBe(0)
    expect(s.closing_balance).toBe(500)
  })

  // ── Invariant 2: normal expense unchanged ───────────────────────────────────
  it('normal expense: contributes to total_expenses only (positive cost)', () => {
    const s = buildAccountSection('rental', [rentExpense(181.79)])
    expect(s.total_income).toBe(0)
    expect(s.total_expenses).toBeCloseTo(181.79, 10)
    expect(s.total_bpo).toBe(0)
    expect(s.closing_balance).toBeCloseTo(-181.79, 10)
  })

  // ── Normal income + expense together ────────────────────────────────────────
  it('normal income + expense: buckets stay separated', () => {
    const s = buildAccountSection('rental', [rentIncome(500), rentExpense(100)])
    expect(s.total_income).toBe(500)
    expect(s.total_expenses).toBe(100)
    expect(s.closing_balance).toBe(400) // 500 - 100
  })

  // ── Invariant 4 + 6 + 7: reversed EXPENSE (original + reversal + forward) ────
  it('expense original + reversal + forward: reduces expenses, NEVER creates income', () => {
    const rows = [
      rentExpense(181.79),   // original  balance_effect -181.79
      rentExpense(-181.79),  // reversal  balance_effect +181.79 (still display_group=expense)
      rentExpense(200.00),   // forward   balance_effect -200.00
    ]
    const s = buildAccountSection('rental', rows)
    expect(s.total_income).toBe(0)                     // <-- the fix: reversal is NOT income
    expect(s.total_expenses).toBeCloseTo(200.00, 10)   // 181.79 - 181.79 + 200
    expect(s.total_bpo).toBe(0)
    expect(s.closing_balance).toBeCloseTo(-200.00, 10) // Σ balance_effect
  })

  // ── Invariant 3 + 6 + 7: reversed INCOME (original + reversal + forward) ─────
  it('income original + reversal + forward: reduces income, NEVER creates expense', () => {
    const rows = [
      rentIncome(500),   // original  balance_effect +500
      rentIncome(-500),  // reversal  balance_effect -500 (still display_group=income)
      rentIncome(600),   // forward   balance_effect +600
    ]
    const s = buildAccountSection('rental', rows)
    expect(s.total_income).toBe(600)   // 500 - 500 + 600
    expect(s.total_expenses).toBe(0)   // <-- reversed income never leaks into expenses
    expect(s.total_bpo).toBe(0)
    expect(s.closing_balance).toBe(600)
  })

  // ── Invariant 5: original + reversal cancel within the SAME bucket ──────────
  it('expense original + reversal exactly cancel (both buckets zero)', () => {
    const s = buildAccountSection('rental', [rentExpense(181.79), rentExpense(-181.79)])
    expect(s.total_income).toBe(0)
    expect(s.total_expenses).toBeCloseTo(0, 10)
    expect(s.closing_balance).toBeCloseTo(0, 10)
  })
  it('income original + reversal exactly cancel (both buckets zero)', () => {
    const s = buildAccountSection('rental', [rentIncome(500), rentIncome(-500)])
    expect(s.total_income).toBe(0)
    expect(s.total_expenses).toBe(0)
    expect(s.closing_balance).toBe(0)
  })

  // ── payment_out (BPO) retains dedicated behavior ────────────────────────────
  it('BPO: contributes to total_bpo only, never income/expense', () => {
    const s = buildAccountSection('rental', [rentBpo(300)])
    expect(s.total_income).toBe(0)
    expect(s.total_expenses).toBe(0)
    expect(s.total_bpo).toBe(300)
    expect(s.closing_balance).toBe(-300) // balance_effect = -client_amount
  })

  // ── info (trust) is non-balance-affecting: no bucket, no closing effect ──────
  it("info (Deposit / trust): excluded from all buckets and closing_balance", () => {
    const s = buildAccountSection('rental', [mkRow({ subcategory: 'Deposit', client_amount: 1000 })])
    expect(s.rows).toHaveLength(1)
    expect(s.rows[0].display_group).toBe('info')
    expect(s.rows[0].is_balance_affecting).toBe(false)
    expect(s.total_income).toBe(0)
    expect(s.total_expenses).toBe(0)
    expect(s.total_bpo).toBe(0)
    expect(s.closing_balance).toBe(0)
  })

  // ── reference (contract value) is non-balance-affecting for rental ──────────
  it('reference (contract value): non-balance-affecting, no bucket effect (rental baseline 0)', () => {
    const s = buildAccountSection('rental', [mkRow({ is_contract_value: true, subcategory: 'Rental Contract', client_amount: 5000 })])
    expect(s.rows[0].display_group).toBe('reference')
    expect(s.rows[0].is_balance_affecting).toBe(false)
    expect(s.total_income).toBe(0)
    expect(s.total_expenses).toBe(0)
    expect(s.contract_baseline).toBe(0)
    expect(s.closing_balance).toBe(0)
  })

  // ── Byte-equivalence of closing_balance / net / total_bpo across the fix ─────
  // The reversal scenario: closing_balance and total_bpo must equal the sign-based
  // computation exactly (only income/expense partition changed).
  it('closing_balance = Σ balance_effect and net = income - expenses hold under reversal', () => {
    const rows = [rentExpense(181.79), rentExpense(-181.79), rentExpense(200.00), rentIncome(50)]
    const s = buildAccountSection('rental', rows)
    const sigmaEffect = s.rows.filter(r => r.is_balance_affecting).reduce((a, r) => a + r.balance_effect, 0)
    expect(s.closing_balance).toBeCloseTo(sigmaEffect, 10)
    expect(s.total_income - s.total_expenses).toBeCloseTo(s.closing_balance, 10) // 50 - 200 = -150
    expect(s.total_income).toBe(50)
    expect(s.total_expenses).toBeCloseTo(200, 10)
  })
})
