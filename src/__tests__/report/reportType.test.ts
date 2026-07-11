/**
 * JJ Property 10 — Report Type Filter Tests
 * V3 M1 — Report Type Selector
 *
 * Tests for filterSectionsByReportType() — pure display-layer helper.
 * Zero accounting logic tested or changed here.
 * computeBalance.ts, classification rules, SQL, RLS, DB schema are untouched.
 */

import { filterSectionsByReportType } from '@/lib/report/reportTypes'
import type { RC3AccountSection } from '@/lib/report/types'

/* ── Test helper ──────────────────────────────────────────────────────────── */

function makeSection(
  account_type: string,
  overrides: Partial<RC3AccountSection> = {},
): RC3AccountSection {
  return {
    account_type: account_type as RC3AccountSection['account_type'],
    account_label: account_type,
    account_label_he: '',
    balance_convention: 'owner_credit',
    opening_balance: 0,
    contract_baseline: 0,
    total_income: 500,
    total_expenses: 200,
    total_bpo: 100,
    closing_balance: 200,
    rows: [],
    ...overrides,
  }
}

const ALL_SECTIONS: RC3AccountSection[] = [
  makeSection('sale'),
  makeSection('renovation'),
  makeSection('rental'),
  makeSection('airbnb'),
]

/* ── Full Report ──────────────────────────────────────────────────────────── */

describe('filterSectionsByReportType — Full Report', () => {
  it('returns all 4 account types', () => {
    const result = filterSectionsByReportType(ALL_SECTIONS, 'full')
    expect(result).toHaveLength(4)
    expect(result.map(s => s.account_type)).toEqual(['sale', 'renovation', 'rental', 'airbnb'])
  })

  it('returns the same array reference (no copy for full)', () => {
    const result = filterSectionsByReportType(ALL_SECTIONS, 'full')
    expect(result).toBe(ALL_SECTIONS)
  })

  it('handles empty input — no empty modules introduced', () => {
    expect(filterSectionsByReportType([], 'full')).toHaveLength(0)
  })

  it('does not modify section totals', () => {
    const result = filterSectionsByReportType(ALL_SECTIONS, 'full')
    const sale = result.find(s => s.account_type === 'sale')!
    expect(sale.total_income).toBe(500)
    expect(sale.total_expenses).toBe(200)
    expect(sale.closing_balance).toBe(200)
  })
})

/* ── Periodic Report ──────────────────────────────────────────────────────── */

describe('filterSectionsByReportType — Periodic Report', () => {
  it('keeps only rental and airbnb', () => {
    const result = filterSectionsByReportType(ALL_SECTIONS, 'periodic')
    expect(result).toHaveLength(2)
    expect(result.map(s => s.account_type)).toEqual(['rental', 'airbnb'])
  })

  it('removes sale', () => {
    const result = filterSectionsByReportType(ALL_SECTIONS, 'periodic')
    expect(result.find(s => s.account_type === 'sale')).toBeUndefined()
  })

  it('removes renovation', () => {
    const result = filterSectionsByReportType(ALL_SECTIONS, 'periodic')
    expect(result.find(s => s.account_type === 'renovation')).toBeUndefined()
  })

  it('handles empty input — no empty modules introduced', () => {
    expect(filterSectionsByReportType([], 'periodic')).toHaveLength(0)
  })

  it('does not mutate section totals', () => {
    const result = filterSectionsByReportType(ALL_SECTIONS, 'periodic')
    const rental = result.find(s => s.account_type === 'rental')!
    expect(rental.total_income).toBe(500)
    expect(rental.total_expenses).toBe(200)
    expect(rental.closing_balance).toBe(200)
  })

  it('keeps only rental when airbnb is absent', () => {
    const noAirbnb = ALL_SECTIONS.filter(s => s.account_type !== 'airbnb')
    const result = filterSectionsByReportType(noAirbnb, 'periodic')
    expect(result).toHaveLength(1)
    expect(result[0].account_type).toBe('rental')
  })

  it('returns empty when only sale and renovation present', () => {
    const noPeriodicTypes = ALL_SECTIONS.filter(
      s => s.account_type !== 'rental' && s.account_type !== 'airbnb'
    )
    const result = filterSectionsByReportType(noPeriodicTypes, 'periodic')
    expect(result).toHaveLength(0)
  })
})

/* ── Language-agnostic business rules ────────────────────────────────────── */

describe('filterSectionsByReportType — business rules', () => {
  it('filtering is language-agnostic (no lang parameter)', () => {
    // ReportType filtering must never depend on language
    const full = filterSectionsByReportType(ALL_SECTIONS, 'full')
    const periodic = filterSectionsByReportType(ALL_SECTIONS, 'periodic')
    expect(full).toHaveLength(4)
    expect(periodic).toHaveLength(2)
  })

  it('switching type does not change remaining section balances', () => {
    const full = filterSectionsByReportType(ALL_SECTIONS, 'full')
    const periodic = filterSectionsByReportType(ALL_SECTIONS, 'periodic')
    const rentalFull = full.find(s => s.account_type === 'rental')!
    const rentalPeriodic = periodic.find(s => s.account_type === 'rental')!
    expect(rentalFull.closing_balance).toBe(rentalPeriodic.closing_balance)
    expect(rentalFull.total_income).toBe(rentalPeriodic.total_income)
    expect(rentalFull.total_expenses).toBe(rentalPeriodic.total_expenses)
  })

  it('full report keeps all active account types (sale, renovation, rental, airbnb)', () => {
    const result = filterSectionsByReportType(ALL_SECTIONS, 'full')
    const types = result.map(s => s.account_type)
    expect(types).toContain('sale')
    expect(types).toContain('renovation')
    expect(types).toContain('rental')
    expect(types).toContain('airbnb')
  })

  it('periodic report keeps rental (Management/Rental account type)', () => {
    const result = filterSectionsByReportType(ALL_SECTIONS, 'periodic')
    expect(result.find(s => s.account_type === 'rental')).toBeDefined()
  })

  it('periodic report keeps airbnb (Short-Term Rental account type)', () => {
    const result = filterSectionsByReportType(ALL_SECTIONS, 'periodic')
    expect(result.find(s => s.account_type === 'airbnb')).toBeDefined()
  })
})
