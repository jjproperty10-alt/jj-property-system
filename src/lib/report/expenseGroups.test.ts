import { groupExpenses, EXPENSE_GROUP_ORDER } from './expenseGroups'
import type { GroupableRow } from './expenseGroups'

function makeRow(overrides: {
  id?: string
  date?: string
  subcategory?: string | null
  client_amount?: number
}): GroupableRow {
  return {
    id:            overrides.id            ?? 'id-1',
    date:          overrides.date          ?? '2025-01-01',
    subcategory:   overrides.subcategory   ?? null,
    client_amount: overrides.client_amount ?? 0,
    display_group: 'expense',
    display_label: '',
    account_type:  'rental',
  }
}

describe('groupExpenses', () => {
  it('returns empty array for empty input', () => {
    expect(groupExpenses([])).toEqual([])
  })

  it('groups Electricity into grpElectricity', () => {
    const rows = [makeRow({ subcategory: 'Electricity', client_amount: 100 })]
    const result = groupExpenses(rows)
    expect(result).toHaveLength(1)
    expect(result[0].key).toBe('grpElectricity')
    expect(result[0].total).toBe(100)
    expect(result[0].rows).toHaveLength(1)
  })

  it('groups "Electricity bill" into grpElectricity', () => {
    const rows = [makeRow({ subcategory: 'Electricity bill', client_amount: 80 })]
    expect(groupExpenses(rows)[0].key).toBe('grpElectricity')
  })

  it('groups Water into grpWater', () => {
    const rows = [makeRow({ subcategory: 'Water', client_amount: 50 })]
    expect(groupExpenses(rows)[0].key).toBe('grpWater')
  })

  it('groups Internet into grpInternet', () => {
    const rows = [makeRow({ subcategory: 'Internet', client_amount: 30 })]
    expect(groupExpenses(rows)[0].key).toBe('grpInternet')
  })

  it('Electricity, Water, Internet are in 3 separate groups', () => {
    const rows = [
      makeRow({ subcategory: 'Electricity', client_amount: 100 }),
      makeRow({ id: 'w', subcategory: 'Water',       client_amount: 50  }),
      makeRow({ id: 'i', subcategory: 'Internet',    client_amount: 30  }),
    ]
    const result = groupExpenses(rows)
    expect(result).toHaveLength(3)
    const keys = result.map(g => g.key)
    expect(keys).toContain('grpElectricity')
    expect(keys).toContain('grpWater')
    expect(keys).toContain('grpInternet')
  })

  it('groups Cleaning into expCleaning', () => {
    const rows = [makeRow({ subcategory: 'Cleaning', client_amount: 60 })]
    expect(groupExpenses(rows)[0].key).toBe('expCleaning')
  })

  it('unknown subcategory falls back to expOther', () => {
    const rows = [makeRow({ subcategory: 'Alien Expense', client_amount: 99 })]
    expect(groupExpenses(rows)[0].key).toBe('expOther')
  })

  it('null subcategory falls back to expOther', () => {
    const rows = [makeRow({ subcategory: null, client_amount: 10 })]
    expect(groupExpenses(rows)[0].key).toBe('expOther')
  })

  it('sums client_amount correctly within a group', () => {
    const rows = [
      makeRow({ id: 'e1', subcategory: 'Electricity',      client_amount: 100 }),
      makeRow({ id: 'e2', subcategory: 'Electricity bill', client_amount: 50  }),
    ]
    const result = groupExpenses(rows)
    expect(result).toHaveLength(1)
    expect(result[0].key).toBe('grpElectricity')
    expect(result[0].total).toBe(150)
  })

  it('follows EXPENSE_GROUP_ORDER ordering', () => {
    const rows = [
      makeRow({ id: 'i', subcategory: 'Internet',    client_amount: 30  }),
      makeRow({ id: 'c', subcategory: 'Cleaning',    client_amount: 60  }),
      makeRow({ id: 'e', subcategory: 'Electricity', client_amount: 100 }),
    ]
    const result = groupExpenses(rows)
    const keys = result.map(g => g.key)
    expect(keys.indexOf('grpElectricity')).toBeLessThan(keys.indexOf('grpInternet'))
    expect(keys.indexOf('grpInternet')).toBeLessThan(keys.indexOf('expCleaning'))
  })

  it('sorts rows within a group by date ascending', () => {
    const rows = [
      makeRow({ id: 'b', date: '2025-03-01', subcategory: 'Water', client_amount: 30 }),
      makeRow({ id: 'a', date: '2025-01-01', subcategory: 'Water', client_amount: 20 }),
    ]
    const result = groupExpenses(rows)
    expect(result[0].rows[0].id).toBe('a')
    expect(result[0].rows[1].id).toBe('b')
  })

  it('EXPENSE_GROUP_ORDER has 11 entries', () => {
    expect(EXPENSE_GROUP_ORDER).toHaveLength(11)
  })
})
