/**
 * JJ Property 10 -- Expense Groups (M3)
 * Pure grouping logic for Management and Airbnb expense rows.
 * Presentation-only -- does NOT affect accounting totals.
 */

import { getExpenseGroupKey } from './labels'
import type { LabelKey } from './labels'

/**
 * Minimal row interface for grouping.
 * Structurally compatible with ClientDisplayRow -- TypeScript structural typing
 * means any object with these fields is accepted.
 */
export interface GroupableRow {
  id:            string
  date:          string
  subcategory:   string | null
  client_amount: number
  display_group: string
  display_label: string
  account_type:  string
}

export interface ExpenseGroup {
  key:   LabelKey
  rows:  GroupableRow[]
  total: number
}

/** Canonical display order for expense groups */
export const EXPENSE_GROUP_ORDER: LabelKey[] = [
  'grpElectricity',
  'grpWater',
  'grpInternet',
  'expCleaning',
  'expMaintenance',
  'expBuildingHoa',
  'expInsurance',
  'expFurniture',
  'expSoftware',
  'expGuestSupplies',
  'expOther',
]

/**
 * Group expense rows by subcategory -> expense group key.
 * Returns groups in EXPENSE_GROUP_ORDER, then any extra keys appended.
 * Each group's rows are sorted by date ascending.
 */
export function groupExpenses(rows: GroupableRow[]): ExpenseGroup[] {
  const map = new Map<LabelKey, GroupableRow[]>()
  for (const row of rows) {
    const key = getExpenseGroupKey(row.subcategory)
    const existing = map.get(key)
    if (existing) {
      existing.push(row)
    } else {
      map.set(key, [row])
    }
  }

  if (map.size === 0) return []

  const sortByDate = (a: GroupableRow, b: GroupableRow) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0

  const orderedSet = new Set<LabelKey>(EXPENSE_GROUP_ORDER)

  const ordered: ExpenseGroup[] = EXPENSE_GROUP_ORDER
    .filter(key => map.has(key))
    .map(key => {
      const groupRows = [...(map.get(key) ?? [])].sort(sortByDate)
      return {
        key,
        rows:  groupRows,
        total: groupRows.reduce((s, r) => s + r.client_amount, 0),
      }
    })

  // Keys not in EXPENSE_GROUP_ORDER appended at end (future-proof)
  for (const [key, groupRows] of map.entries()) {
    if (!orderedSet.has(key)) {
      const sorted = [...groupRows].sort(sortByDate)
      ordered.push({
        key,
        rows:  sorted,
        total: sorted.reduce((s, r) => s + r.client_amount, 0),
      })
    }
  }

  return ordered
}
