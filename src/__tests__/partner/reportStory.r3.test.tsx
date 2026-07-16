/**
 * reportStory.r3.test.tsx
 * Partner Report Story — R3: Income + Expenses
 *
 * Tests: IncomeTable (13) + ExpenseTable (14) = 27 total
 */

import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { IncomeTable, computeIncomeSources } from '@/components/partner/IncomeTable'
import { ExpenseTable, computeExpenseCategories } from '@/components/partner/ExpenseTable'
import type { RC3AccountSection, RC3AccountRow } from '@/lib/report/types'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeSection(
  overrides: Partial<RC3AccountSection> & {
    account_label: string
    account_label_he?: string
    total_income: number
  },
): RC3AccountSection {
  return {
    account_type: 'airbnb',
    account_label: overrides.account_label,
    account_label_he: overrides.account_label_he ?? '',
    balance_convention: 'owner_credit',
    opening_balance: 0,
    rows: [],
    contract_baseline: 0,
    total_income: overrides.total_income,
    total_expenses: 0,
    total_bpo: 0,
    closing_balance: 0,
    ...overrides,
  }
}

function makeExpenseRow(label: string, amount: number): RC3AccountRow {
  return {
    id: `row-${label}-${amount}`,
    date: '2026-01-15',
    property_name: 'Test Property',
    reporting_name: 'Test Property',
    category: 'Management',
    subcategory: label,
    description: null,
    payer: 'JJ',
    payee: null,
    amount_eur: amount,
    client_charge: null,
    client_amount: amount,
    notes: null,
    k_note: null,
    account_type: 'airbnb',
    is_contract_value: false,
    is_platform_tracking: false,
    is_bpo: false,
    review_status: 'active',
    balance_effect: -amount,
    is_balance_affecting: true,
    display_group: 'expense',
    display_label: label,
  }
}

function makeInfoRow(label: string): RC3AccountRow {
  return {
    ...makeExpenseRow(label, 100),
    display_group: 'info',
    balance_effect: 0,
    is_balance_affecting: false,
  }
}

// ─── IncomeTable ──────────────────────────────────────────────────────────────

describe('IncomeTable', () => {
  it('returns null when all sections have total_income = 0', () => {
    const sections = [makeSection({ account_label: 'Airbnb', total_income: 0 })]
    const html = renderToStaticMarkup(<IncomeTable sections={sections} />)
    expect(html).toBe('')
  })

  it('renders inline text (not table) for a single income source', () => {
    const sections = [makeSection({ account_label: 'Airbnb', total_income: 2500 })]
    const html = renderToStaticMarkup(<IncomeTable sections={sections} />)
    expect(html).toContain('via')
    expect(html).toContain('data-testid="income-single-source"')
  })

  it('inline text includes the source account label', () => {
    const sections = [makeSection({ account_label: 'Property Rental', total_income: 1200 })]
    const html = renderToStaticMarkup(<IncomeTable sections={sections} />)
    expect(html).toContain('Property Rental')
  })

  it('renders table wrapper for multiple income sources', () => {
    const sections = [
      makeSection({ account_label: 'Airbnb', total_income: 2500 }),
      makeSection({ account_label: 'Booking', total_income: 620 }),
    ]
    const html = renderToStaticMarkup(<IncomeTable sections={sections} />)
    expect(html).toContain('data-testid="income-table"')
    expect(html).not.toContain('income-single-source')
  })

  it('multiple sources: all labels appear in output', () => {
    const sections = [
      makeSection({ account_label: 'Airbnb', total_income: 2500 }),
      makeSection({ account_label: 'Direct', total_income: 300 }),
    ]
    const html = renderToStaticMarkup(<IncomeTable sections={sections} />)
    expect(html).toContain('Airbnb')
    expect(html).toContain('Direct')
  })

  it('multiple sources: total row shows correct sum', () => {
    const sections = [
      makeSection({ account_label: 'Airbnb', total_income: 2500 }),
      makeSection({ account_label: 'Booking', total_income: 620 }),
    ]
    const html = renderToStaticMarkup(<IncomeTable sections={sections} />)
    expect(html).toContain('Total')
    // €3,120
    expect(html).toContain('3,120')
  })

  it('skips sections with zero total_income and still renders single-source shortcut', () => {
    const sections = [
      makeSection({ account_label: 'Airbnb', total_income: 2500 }),
      makeSection({ account_label: 'Renovation', total_income: 0 }),
    ]
    const html = renderToStaticMarkup(<IncomeTable sections={sections} />)
    expect(html).toContain('via')
    expect(html).toContain('Airbnb')
    expect(html).not.toContain('Renovation')
  })

  it('applies custom className to the wrapper', () => {
    const sections = [makeSection({ account_label: 'Airbnb', total_income: 2500 })]
    const html = renderToStaticMarkup(<IncomeTable sections={sections} className="mt-4" />)
    expect(html).toContain('mt-4')
  })

  it('shows locale-appropriate section label (English default)', () => {
    const sections = [makeSection({ account_label: 'Airbnb', total_income: 2500 })]
    const html = renderToStaticMarkup(<IncomeTable sections={sections} />)
    expect(html).toContain('Income')
  })

  it('total for two sources equals their combined amount', () => {
    const sections = [
      makeSection({ account_label: 'Airbnb', total_income: 1000 }),
      makeSection({ account_label: 'Direct', total_income: 500 }),
    ]
    const html = renderToStaticMarkup(<IncomeTable sections={sections} />)
    expect(html).toContain('1,500')
  })

  it('computeIncomeSources excludes zero-income sections', () => {
    const sections = [
      makeSection({ account_label: 'Airbnb', total_income: 800 }),
      makeSection({ account_label: 'Sale', total_income: 0 }),
      makeSection({ account_label: 'Rental', total_income: 400 }),
    ]
    const result = computeIncomeSources(sections)
    expect(result).toHaveLength(2)
    expect(result.map((s) => s.label)).toEqual(['Airbnb', 'Rental'])
  })

  it('Hebrew locale: connector becomes "דרך" and uses account_label_he', () => {
    const sections = [
      makeSection({
        account_label: 'Airbnb',
        account_label_he: 'אירבנב',
        total_income: 2500,
      }),
    ]
    const html = renderToStaticMarkup(<IncomeTable sections={sections} locale="he" />)
    expect(html).toContain('דרך')
    expect(html).toContain('אירבנב')
    expect(html).not.toContain('via')
  })

  it('Hebrew locale: falls back to account_label when account_label_he is empty', () => {
    const sections = [
      makeSection({ account_label: 'Airbnb', account_label_he: '', total_income: 2500 }),
    ]
    const html = renderToStaticMarkup(<IncomeTable sections={sections} locale="he" />)
    expect(html).toContain('Airbnb')
  })

  it('Hebrew locale multi-source: section label is "הכנסות"', () => {
    const sections = [
      makeSection({ account_label: 'Airbnb', account_label_he: 'אירבנב', total_income: 1000 }),
      makeSection({ account_label: 'Direct', account_label_he: 'ישיר',   total_income: 500  }),
    ]
    const html = renderToStaticMarkup(<IncomeTable sections={sections} locale="he" />)
    expect(html).toContain('הכנסות')
    expect(html).toContain('סה״כ')
  })
})

// ─── ExpenseTable ─────────────────────────────────────────────────────────────

describe('ExpenseTable', () => {
  it('renders empty state when no expense rows exist', () => {
    const sections = [makeSection({ account_label: 'Airbnb', total_income: 0, rows: [] })]
    const html = renderToStaticMarkup(<ExpenseTable sections={sections} />)
    expect(html).toContain('data-testid="expense-empty-state"')
  })

  it('empty state uses period-neutral message (not "this month")', () => {
    const sections = [makeSection({ account_label: 'Airbnb', total_income: 0, rows: [] })]
    const html = renderToStaticMarkup(<ExpenseTable sections={sections} />)
    expect(html).toContain('No expenses recorded for this period.')
    expect(html).not.toContain('this month')
  })

  it('Hebrew locale empty state shows correct Hebrew message', () => {
    const sections = [makeSection({ account_label: 'Airbnb', total_income: 0, rows: [] })]
    const html = renderToStaticMarkup(<ExpenseTable sections={sections} locale="he" />)
    expect(html).toContain('לא נרשמו הוצאות בתקופה זו.')
  })

  it('renders table (not empty state) when expense rows exist', () => {
    const sections = [
      makeSection({
        account_label: 'Airbnb',
        total_income: 0,
        rows: [makeExpenseRow('Cleaning', 200)],
      }),
    ]
    const html = renderToStaticMarkup(<ExpenseTable sections={sections} />)
    expect(html).toContain('data-testid="expense-table"')
    expect(html).not.toContain('expense-empty-state')
  })

  it('groups expense rows by display_label and shows each category', () => {
    const sections = [
      makeSection({
        account_label: 'Airbnb',
        total_income: 0,
        rows: [makeExpenseRow('Cleaning', 200), makeExpenseRow('Utilities', 85)],
      }),
    ]
    const html = renderToStaticMarkup(<ExpenseTable sections={sections} />)
    expect(html).toContain('Cleaning')
    expect(html).toContain('Utilities')
  })

  it('shows a Total row with summed amount', () => {
    const sections = [
      makeSection({
        account_label: 'Airbnb',
        total_income: 0,
        rows: [makeExpenseRow('Cleaning', 200), makeExpenseRow('Utilities', 85)],
      }),
    ]
    const html = renderToStaticMarkup(<ExpenseTable sections={sections} />)
    expect(html).toContain('Total')
    expect(html).toContain('285')
  })

  it('limits to 6 visible categories and adds an Other row for the rest', () => {
    const rows = [
      makeExpenseRow('Cat1', 100),
      makeExpenseRow('Cat2', 90),
      makeExpenseRow('Cat3', 80),
      makeExpenseRow('Cat4', 70),
      makeExpenseRow('Cat5', 60),
      makeExpenseRow('Cat6', 50),
      makeExpenseRow('Cat7', 40),
    ]
    const sections = [makeSection({ account_label: 'Airbnb', total_income: 0, rows })]
    const html = renderToStaticMarkup(<ExpenseTable sections={sections} />)
    expect(html).toContain('Other')
    expect(html).not.toContain('Cat7')
  })

  it('Other row amount equals sum of excess categories', () => {
    const rows = [
      makeExpenseRow('Cat1', 100),
      makeExpenseRow('Cat2', 90),
      makeExpenseRow('Cat3', 80),
      makeExpenseRow('Cat4', 70),
      makeExpenseRow('Cat5', 60),
      makeExpenseRow('Cat6', 50),
      makeExpenseRow('Cat7', 40),
      makeExpenseRow('Cat8', 30),
    ]
    const sections = [makeSection({ account_label: 'Airbnb', total_income: 0, rows })]
    const html = renderToStaticMarkup(<ExpenseTable sections={sections} />)
    // Other = Cat7 (40) + Cat8 (30) = 70
    expect(html).toContain('Other')
    expect(html).toContain('70')
  })

  it('exactly 6 categories produces no Other row', () => {
    const rows = [
      makeExpenseRow('Cat1', 100),
      makeExpenseRow('Cat2', 90),
      makeExpenseRow('Cat3', 80),
      makeExpenseRow('Cat4', 70),
      makeExpenseRow('Cat5', 60),
      makeExpenseRow('Cat6', 50),
    ]
    const sections = [makeSection({ account_label: 'Airbnb', total_income: 0, rows })]
    const html = renderToStaticMarkup(<ExpenseTable sections={sections} />)
    expect(html).not.toContain('Other')
  })

  it('applies custom className to the wrapper', () => {
    const sections = [makeSection({ account_label: 'Airbnb', total_income: 0, rows: [] })]
    const html = renderToStaticMarkup(<ExpenseTable sections={sections} className="mb-8" />)
    expect(html).toContain('mb-8')
  })

  it('combines expense rows from multiple account sections', () => {
    const sections = [
      makeSection({
        account_label: 'Airbnb',
        total_income: 0,
        rows: [makeExpenseRow('Cleaning', 200)],
      }),
      makeSection({
        account_label: 'Renovation',
        total_income: 0,
        rows: [makeExpenseRow('Labour', 500)],
      }),
    ]
    const html = renderToStaticMarkup(<ExpenseTable sections={sections} />)
    expect(html).toContain('Cleaning')
    expect(html).toContain('Labour')
  })

  it('excludes info / reference / income / payment_out rows', () => {
    const sections = [
      makeSection({
        account_label: 'Airbnb',
        total_income: 0,
        rows: [
          makeInfoRow('Platform Fee'),
          makeExpenseRow('Cleaning', 200),
        ],
      }),
    ]
    const html = renderToStaticMarkup(<ExpenseTable sections={sections} />)
    expect(html).toContain('Cleaning')
    // Total must be 200 (info row excluded), not 300
    expect(html).toContain('200')
    expect(html).not.toContain('Platform Fee')
  })

  it('sorting is deterministic: ties broken alphabetically by label', () => {
    // Two rows with same amount — order must be stable across runs
    const cats = computeExpenseCategories(
      [
        makeSection({
          account_label: 'Test',
          total_income: 0,
          rows: [makeExpenseRow('Zebra', 100), makeExpenseRow('Alpha', 100)],
        }),
      ],
    )
    expect(cats[0].label).toBe('Alpha')
    expect(cats[1].label).toBe('Zebra')
  })

  it('Hebrew locale: "Other" bucket is "אחר"', () => {
    const rows = [
      makeExpenseRow('Cat1', 100),
      makeExpenseRow('Cat2', 90),
      makeExpenseRow('Cat3', 80),
      makeExpenseRow('Cat4', 70),
      makeExpenseRow('Cat5', 60),
      makeExpenseRow('Cat6', 50),
      makeExpenseRow('Cat7', 40),
    ]
    const sections = [makeSection({ account_label: 'Airbnb', total_income: 0, rows })]
    const html = renderToStaticMarkup(<ExpenseTable sections={sections} locale="he" />)
    expect(html).toContain('אחר')
    expect(html).not.toContain('Other')
  })
})
