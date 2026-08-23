/**
 * TransactionDrilldown — presentation-only, client-safe.
 *
 * Renders a collapsible list of transaction lines. Accepts ONLY the client-safe
 * `ClientDisplayRow` DTO (the authorized boundary from lib/report/clientRow),
 * which structurally excludes description/notes/payer/payee/internal amounts.
 * Performs NO arithmetic (no subtotals derived here), NO data fetching.
 */
import React from 'react'
import type { ClientDisplayRow } from '@/lib/report/clientRow'
import { formatEur } from './formatEur'

export interface TransactionDrilldownProps {
  rows: ClientDisplayRow[]
  title?: string
  defaultOpen?: boolean
  lang?: 'en' | 'he'
}

const LABELS = {
  en: { title: 'Transaction detail', empty: 'No transactions in this section', date: 'Date', item: 'Item', amount: 'Amount' },
  he: { title: 'פירוט תנועות', empty: 'אין תנועות בסעיף זה', date: 'תאריך', item: 'פריט', amount: 'סכום' },
} as const

function fmtDate(d: string): string {
  try { return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) }
  catch { return d }
}

export function TransactionDrilldown({ rows, title, defaultOpen = false, lang = 'en' }: TransactionDrilldownProps) {
  const t = LABELS[lang] ?? LABELS.en
  return (
    <details data-testid="transaction-drilldown" open={defaultOpen} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <summary className="cursor-pointer select-none px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-gray-600 bg-gray-50">
        {title ?? t.title} <span data-testid="td-count" className="text-gray-400">({rows.length})</span>
      </summary>
      {rows.length === 0 ? (
        <div data-testid="td-empty" className="px-4 py-4 text-sm text-gray-400">{t.empty}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide text-gray-400 bg-gray-50/60">
                <th className="text-left px-4 py-2 font-semibold">{t.date}</th>
                <th className="text-left px-4 py-2 font-semibold">{t.item}</th>
                <th className="text-right px-4 py-2 font-semibold">{t.amount}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} data-testid="td-row" className="border-t border-gray-100">
                  <td className="px-4 py-2 font-mono text-gray-500 whitespace-nowrap">{fmtDate(r.date)}</td>
                  <td className="px-4 py-2 text-gray-800">{r.display_label}</td>
                  <td className="px-4 py-2 text-right font-mono text-gray-800">{formatEur(r.client_amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </details>
  )
}

export default TransactionDrilldown
