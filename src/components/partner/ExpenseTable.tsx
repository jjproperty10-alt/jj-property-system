import React from 'react'
import { DataTable, MoneyValue } from '@/components/ds'
import type { DataTableColumn } from '@/components/ds'
import type { RC3AccountSection } from '@/lib/report/types'

// ─── Locale strings ───────────────────────────────────────────────────────────
// Centralised so all partner-facing text in this component is translatable.
// When a proper i18n system is introduced, replace this object.

type SupportedLocale = 'en' | 'he'

const STRINGS: Record<SupportedLocale, {
  sectionLabel: string
  columnCategory: string
  columnAmount: string
  totalLabel: string
  otherLabel: string
  emptyState: string
  tableCaption: string
}> = {
  en: {
    sectionLabel:   'Expenses',
    columnCategory: 'Category',
    columnAmount:   'Amount',
    totalLabel:     'Total',
    otherLabel:     'Other',
    emptyState:     'No expenses recorded for this period.',
    tableCaption:   'Expenses by category',
  },
  he: {
    sectionLabel:   'הוצאות',
    columnCategory: 'קטגוריה',
    columnAmount:   'סכום',
    totalLabel:     'סה״כ',
    otherLabel:     'אחר',
    emptyState:     'לא נרשמו הוצאות בתקופה זו.',
    tableCaption:   'הוצאות לפי קטגוריה',
  },
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ExpenseCategory {
  label: string
  amount: number
}

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Maximum number of named expense categories shown.
 * Categories beyond this limit are merged into the "Other" bucket.
 * Sorted by amount descending; alphabetical label as a stable tie-breaker.
 */
const MAX_CATEGORIES = 6

// ─── Helper ───────────────────────────────────────────────────────────────────

/**
 * Aggregates expense rows across all account sections by display_label.
 *
 * Label safety: display_label is the "client-facing subcategory label"
 * (see RC3AccountRow type). It is set by the RC3 engine and is already
 * approved for partner-facing display — never a raw DB category name.
 *
 * Excluded row types: info, reference, income, payment_out (balance_effect = 0
 * for info rows, so the abs === 0 guard also catches platform tracking rows).
 *
 * Ordering: amount descending, then label ascending as deterministic tie-breaker.
 * If more than MAX_CATEGORIES remain, the excess is merged into one "Other" bucket.
 * The "Other" amount is the exact sum of all excluded categories.
 *
 * Note: this function performs presentation aggregation only.
 * It does NOT recompute accounting totals — section.total_expenses is authoritative.
 */
export function computeExpenseCategories(
  sections: readonly RC3AccountSection[],
  otherLabel = 'Other',
): ExpenseCategory[] {
  const map = new Map<string, number>()

  for (const section of sections) {
    for (const row of section.rows) {
      if (row.display_group !== 'expense') continue
      const abs = Math.abs(row.balance_effect)
      if (abs === 0) continue
      map.set(row.display_label, (map.get(row.display_label) ?? 0) + abs)
    }
  }

  // Sort by amount desc, then label asc (stable tie-breaker)
  const sorted = Array.from(map.entries())
    .map(([label, amount]) => ({ label, amount }))
    .sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label))

  if (sorted.length <= MAX_CATEGORIES) return sorted

  const top = sorted.slice(0, MAX_CATEGORIES)
  const otherAmount = sorted
    .slice(MAX_CATEGORIES)
    .reduce((sum, c) => sum + c.amount, 0)

  return [...top, { label: otherLabel, amount: otherAmount }]
}

// ─── Component ────────────────────────────────────────────────────────────────

interface ExpenseTableProps {
  sections: readonly RC3AccountSection[]
  /** Display locale. Defaults to 'en'. Controls labels and empty-state text. */
  locale?: SupportedLocale
  className?: string
}

/**
 * ExpenseTable — Partner Report Story, Section 6
 *
 * Aggregates expense rows by category label across all account sections.
 * Max 6 categories visible (sorted by amount desc); remainder rolled into "Other".
 * Zero total expenses → period-neutral empty-state message.
 * Section header always visible — never hides.
 *
 * Label safety: display_label is an RC3 engine value already approved for
 * partner-facing display. No internal JJ category names are exposed.
 */
export function ExpenseTable({ sections, locale = 'en', className = '' }: ExpenseTableProps) {
  const s = STRINGS[locale]
  const categories = computeExpenseCategories(sections, s.otherLabel)
  const totalExpenses = categories.reduce((sum, c) => sum + c.amount, 0)

  const columns: DataTableColumn[] = [
    { key: 'category', label: s.columnCategory, align: 'left' },
    { key: 'amount',   label: s.columnAmount,   align: 'right', dir: 'ltr' },
  ]

  // ── Empty state ───────────────────────────────────────────────────────────
  if (totalExpenses === 0) {
    return (
      <div className={`space-y-1 ${className}`.trim()} data-testid="expense-table">
        <p className="jj-label text-xs uppercase tracking-widest text-gray-400">{s.sectionLabel}</p>
        <p
          className="text-sm text-gray-400 italic"
          data-testid="expense-empty-state"
        >
          {s.emptyState}
        </p>
      </div>
    )
  }

  // ── Expense table ─────────────────────────────────────────────────────────
  const rows = [
    ...categories.map((c) => ({
      category: c.label,
      amount:   <MoneyValue amount={c.amount} />,
    })),
    {
      category: <strong>{s.totalLabel}</strong>,
      amount: (
        <strong>
          <MoneyValue amount={totalExpenses} />
        </strong>
      ),
    },
  ]

  return (
    <div className={`space-y-2 ${className}`.trim()} data-testid="expense-table">
      <p className="jj-label text-xs uppercase tracking-widest text-gray-400">{s.sectionLabel}</p>
      <DataTable columns={columns} rows={rows} caption={s.tableCaption} />
    </div>
  )
}
