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
  connector: string   // "€2,500 {connector} Airbnb"
  columnSource: string
  columnAmount: string
  totalLabel: string
  tableCaption: string
}> = {
  en: {
    sectionLabel: 'Income',
    connector:    'via',
    columnSource: 'Source',
    columnAmount: 'Amount',
    totalLabel:   'Total',
    tableCaption: 'Income by source',
  },
  he: {
    sectionLabel: 'הכנסות',
    connector:    'דרך',
    columnSource: 'מקור',
    columnAmount: 'סכום',
    totalLabel:   'סה״כ',
    tableCaption: 'הכנסות לפי מקור',
  },
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface IncomeSource {
  label: string
  amount: number
}

// ─── Helper ───────────────────────────────────────────────────────────────────

/**
 * Returns one entry per account section that has income > 0.
 * Uses account_label_he when locale is 'he', with fallback to account_label.
 * account_label / account_label_he are set by the RC3 engine and are
 * already approved for partner-facing display.
 */
export function computeIncomeSources(
  sections: readonly RC3AccountSection[],
  locale: SupportedLocale = 'en',
): IncomeSource[] {
  return sections
    .filter((s) => s.total_income > 0)
    .map((s) => ({
      label:  locale === 'he' ? (s.account_label_he || s.account_label) : s.account_label,
      amount: s.total_income,
    }))
}

// ─── Component ────────────────────────────────────────────────────────────────

interface IncomeTableProps {
  sections: readonly RC3AccountSection[]
  /** Display locale. Defaults to 'en'. Controls labels and connector word. */
  locale?: SupportedLocale
  className?: string
}

/**
 * IncomeTable — Partner Report Story, Section 5
 *
 * Groups income by source (one entry per RC3 account type with income).
 * Single source → compact inline text e.g. "€2,500 via Airbnb" (locale-aware).
 * Multiple sources → DataTable with a bold Total row.
 * Zero income across all sections → renders nothing (silence > placeholder).
 *
 * Label safety: account_label / account_label_he are approved partner-facing
 * values set by the RC3 engine — never raw DB category names.
 */
export function IncomeTable({ sections, locale = 'en', className = '' }: IncomeTableProps) {
  const s = STRINGS[locale]
  const sources = computeIncomeSources(sections, locale)

  if (sources.length === 0) return null

  const totalIncome = sources.reduce((sum, src) => sum + src.amount, 0)

  const columns: DataTableColumn[] = [
    { key: 'source', label: s.columnSource, align: 'left' },
    { key: 'amount', label: s.columnAmount, align: 'right', dir: 'ltr' },
  ]

  // ── Single source: compact inline ─────────────────────────────────────────
  if (sources.length === 1) {
    return (
      <div className={`space-y-1 ${className}`.trim()} data-testid="income-table">
        <p className="jj-label text-xs uppercase tracking-widest text-gray-400">{s.sectionLabel}</p>
        <p className="text-sm text-gray-700" data-testid="income-single-source">
          <MoneyValue amount={totalIncome} /> {s.connector} {sources[0].label}
        </p>
      </div>
    )
  }

  // ── Multiple sources: table ────────────────────────────────────────────────
  const rows = [
    ...sources.map((src) => ({
      source: src.label,
      amount: <MoneyValue amount={src.amount} />,
    })),
    {
      source: <strong>{s.totalLabel}</strong>,
      amount: (
        <strong>
          <MoneyValue amount={totalIncome} />
        </strong>
      ),
    },
  ]

  return (
    <div className={`space-y-2 ${className}`.trim()} data-testid="income-table">
      <p className="jj-label text-xs uppercase tracking-widest text-gray-400">{s.sectionLabel}</p>
      <DataTable columns={columns} rows={rows} caption={s.tableCaption} />
    </div>
  )
}
