/**
 * G3 — client Financial Timeline categorization tests.
 * LOCKED: Sale/Renovation/Management-LTR/Airbnb-STR categories; Settlement/Transfer
 * distinct movement; Purchase excluded; STR and LTR separated; no internal fields.
 */
import {
  resolveTimelineCategory,
  resolveDirection,
  toClientTimelineRow,
  TIMELINE_CATEGORIES,
} from '@/lib/report/timelineCategory'
import type { ClientDisplayRow } from '@/lib/report/clientRow'

function row(p: Partial<ClientDisplayRow>): ClientDisplayRow {
  return {
    id: 'x', date: '2026-01-01', client_amount: 100,
    display_group: 'income', display_label: 'Rent Collected',
    account_type: 'rental', subcategory: 'rent', ...p,
  } as ClientDisplayRow
}

describe('G3 — timeline categorization', () => {
  test('account types map to the four client categories', () => {
    expect(resolveTimelineCategory(row({ account_type: 'sale' }))).toBe('Sale')
    expect(resolveTimelineCategory(row({ account_type: 'renovation' }))).toBe('Renovation')
    expect(resolveTimelineCategory(row({ account_type: 'rental' }))).toBe('Management/LTR')
    expect(resolveTimelineCategory(row({ account_type: 'airbnb' }))).toBe('Airbnb/STR')
  })

  test('STR (airbnb) and LTR (rental) are separate categories', () => {
    expect(resolveTimelineCategory(row({ account_type: 'airbnb' })))
      .not.toBe(resolveTimelineCategory(row({ account_type: 'rental' })))
  })

  test('Purchase is excluded from the client timeline', () => {
    expect(resolveTimelineCategory(row({ account_type: 'purchase' }))).toBeNull()
    expect(toClientTimelineRow(row({ account_type: 'purchase', display_group: 'expense' }))).toBeNull()
  })

  test('payment_out is a distinct Settlement/Transfer movement, not an operating category', () => {
    const r = row({ account_type: 'rental', display_group: 'payment_out', display_label: 'Payment to Owner' })
    expect(resolveTimelineCategory(r)).toBe('Settlement/Transfer')
    expect(resolveDirection(r)).toBe('settlement')
  })

  test('direction maps income->in, expense->out', () => {
    expect(resolveDirection(row({ display_group: 'income' }))).toBe('in')
    expect(resolveDirection(row({ display_group: 'expense' }))).toBe('out')
  })

  test('info / reference rows are not timeline movements', () => {
    expect(toClientTimelineRow(row({ display_group: 'info' }))).toBeNull()
    expect(toClientTimelineRow(row({ display_group: 'reference' }))).toBeNull()
  })

  test('toClientTimelineRow emits only client-safe fields', () => {
    const t = toClientTimelineRow(row({ account_type: 'rental', display_group: 'income', display_label: 'Rent Collected', client_amount: 1200 }))
    expect(t).toEqual({
      id: 'x', date: '2026-01-01', category: 'Management/LTR',
      subcategory: 'Rent Collected', description: 'Rent Collected', amount: 1200, direction: 'in',
    })
    // structurally cannot contain payer/payee/actual cost/margin (not in ClientDisplayRow)
  })

  test('TIMELINE_CATEGORIES lists the five client filters', () => {
    expect(TIMELINE_CATEGORIES).toEqual(['Sale','Renovation','Management/LTR','Airbnb/STR','Settlement/Transfer'])
  })
})

describe('G3 — buildClientTimeline (multi-property, sorted, Purchase excluded)', () => {
  const { buildClientTimeline } = require('@/lib/report/timelineCategory')
  function rrow(o: any) { return { id: o.id, date: o.date, client_amount: o.amt, display_group: o.dg || 'income',
    display_label: o.label || 'X', account_type: o.at, subcategory: null,
    // extra RC3AccountRow fields required by toClientRow input typing (unused here)
    property_name: null, reporting_name: null, category: '', description: '', payer: null, payee: null,
    amount_eur: o.amt, client_charge: null, notes: null, k_note: null, is_contract_value: false,
    is_platform_tracking: false, is_bpo: false, review_status: 'active', balance_effect: 0,
    is_balance_affecting: true } }
  function sect(at: string, rows: any[]) { return { account_type: at, account_label: at, account_label_he: at,
    balance_convention: 'owner_credit', opening_balance: 0, rows, contract_baseline: 0, total_income: 0,
    total_expenses: 0, total_bpo: 0, closing_balance: 0 } }
  function rep(name: string, accounts: any[]) { return { reporting_name: name, from_date: null, to_date: null,
    generated_at: '2026-01-01T00:00:00Z', accounts, has_purchase: false, has_sale: false, has_renovation: false,
    has_rental: true, has_airbnb: false } }

  const reports = [
    rep('Villa A', [
      sect('purchase', [rrow({ id: 'p1', date: '2026-01-05', amt: 90000, dg: 'expense', at: 'purchase' })]),
      sect('rental', [rrow({ id: 'r1', date: '2026-01-03', amt: 1000, dg: 'income', at: 'rental', label: 'Rent' })]),
    ]),
    rep('Flat B', [
      sect('airbnb', [rrow({ id: 'a1', date: '2026-01-01', amt: 400, dg: 'income', at: 'airbnb', label: 'STR' })]),
    ]),
  ]

  test('excludes Purchase, carries Property, categorizes, sorts by date', () => {
    const tl = buildClientTimeline(reports)
    expect(tl.map((r: any) => r.id)).toEqual(['a1', 'r1']) // p1 (purchase) excluded; sorted by date
    expect(tl.find((r: any) => r.id === 'r1').property).toBe('Villa A')
    expect(tl.find((r: any) => r.id === 'r1').category).toBe('Management/LTR')
    expect(tl.find((r: any) => r.id === 'a1').category).toBe('Airbnb/STR')
    expect(tl.some((r: any) => r.category === undefined)).toBe(false)
  })
})
