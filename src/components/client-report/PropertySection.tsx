/**
 * PropertySection — presentation-only container for one account/property section.
 *
 * Receives already-computed totals via typed props and renders them. Contains
 * NO financial formulas (no summing, no netting), NO data fetching, NO hardcoded
 * property names, NO offset/STR logic. Row content is provided via children so
 * this component never touches raw transaction data.
 */
import React from 'react'
import { formatEur } from './formatEur'

export type BalanceConventionLite = 'owner_credit' | 'client_debt'

export interface PropertySectionTotals {
  income: number
  expenses: number
  bpo: number
}

export interface PropertySectionProps {
  label: string
  labelHe?: string
  convention: BalanceConventionLite
  totals: PropertySectionTotals
  closingBalance: number
  lang?: 'en' | 'he'
  children?: React.ReactNode
}

const LABELS = {
  en: { income: 'Income', expenses: 'Expenses', transfers: 'Paid to owner', closing: 'Closing balance' },
  he: { income: 'הכנסות', expenses: 'הוצאות', transfers: 'שולם לבעלים', closing: 'יתרת סגירה' },
} as const

export function PropertySection({
  label, labelHe, convention, totals, closingBalance, lang = 'en', children,
}: PropertySectionProps) {
  const t = LABELS[lang] ?? LABELS.en
  const heading = lang === 'he' && labelHe ? labelHe : label

  const kpis: Array<{ key: string; label: string; value: number }> = [
    { key: 'income', label: t.income, value: totals.income },
    { key: 'expenses', label: t.expenses, value: totals.expenses },
    { key: 'transfers', label: t.transfers, value: totals.bpo },
  ]

  return (
    <div data-testid="property-section" data-convention={convention} className="bg-white rounded-2xl border border-gray-200 mb-4 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
        <div data-testid="ps-label" className="text-base font-bold text-gray-900">{heading}</div>
        <div className="text-right">
          <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{t.closing}</div>
          <div data-testid="ps-closing" className="text-lg font-bold font-mono text-gray-900">{formatEur(closingBalance)}</div>
        </div>
      </div>
      <div className="px-6 py-3 grid grid-cols-3 gap-3 border-b border-gray-50">
        {kpis.map(k => (
          <div key={k.key} className="rounded-lg bg-gray-50 px-3 py-2">
            <div className="text-[9px] font-bold uppercase tracking-wide text-gray-400 mb-1">{k.label}</div>
            <div data-testid={`ps-${k.key}`} className="text-sm font-bold font-mono text-gray-800">{formatEur(k.value)}</div>
          </div>
        ))}
      </div>
      {children != null && <div className="px-2 py-2">{children}</div>}
    </div>
  )
}

export default PropertySection
