'use client'

// ============================================================
// JJ PROPERTY 10 — Transaction Preview Panel
// Panel 6: Last N transactions for this entity via v_entity_resolved.
// Read-only. Transactions are NEVER modified.
// ============================================================

import { useEffect, useState } from 'react'
import { RefreshCw, AlertTriangle, FileText } from 'lucide-react'
import { getEntityTransactions, getEntityTransactionCount, EntityTransaction, EUR } from '@/lib/entity-registry'

const PAGE_SIZE = 50

const CATEGORY_COLORS: Record<string, string> = {
  Renovation: 'bg-orange-100 text-orange-700',
  Airbnb:     'bg-blue-100 text-blue-700',
  Management: 'bg-teal-100 text-teal-700',
  JJ:         'bg-indigo-100 text-indigo-700',
  Sale:       'bg-purple-100 text-purple-700',
  Purchase:   'bg-rose-100 text-rose-700',
  Transfer:   'bg-gray-100 text-gray-600',
  General:    'bg-yellow-100 text-yellow-700',
}

function CategoryBadge({ category }: { category: string }) {
  const cls = CATEGORY_COLORS[category] ?? 'bg-gray-100 text-gray-600'
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${cls}`}>
      {category}
    </span>
  )
}

interface Props {
  entityId: string
  canonicalName: string
}

export default function TransactionPreviewPanel({ entityId, canonicalName }: Props) {
  const [rows,     setRows]     = useState<EntityTransaction[]>([])
  const [total,    setTotal]    = useState<number | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)
  const [limit,    setLimit]    = useState(PAGE_SIZE)
  const [expanding, setExpanding] = useState(false)

  async function load(l: number) {
    setLoading(true); setError(null)
    try {
      const [txs, cnt] = await Promise.all([
        getEntityTransactions(entityId, l),
        getEntityTransactionCount(entityId),
      ])
      setRows(txs)
      setTotal(cnt)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false); setExpanding(false)
    }
  }

  useEffect(() => { load(limit) }, [entityId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleLoadMore() {
    const next = limit + PAGE_SIZE
    setExpanding(true)
    setLimit(next)
    await load(next)
  }

  const hasMore = total !== null && rows.length < total

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <div>
          <h2 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
            <FileText className="h-4 w-4 text-gray-400" />
            Transactions
          </h2>
          {total !== null && (
            <p className="text-xs text-gray-400 mt-0.5">
              Showing {rows.length} of {total} transaction{total !== 1 ? 's' : ''} for{' '}
              <span className="font-mono">{canonicalName}</span>
            </p>
          )}
        </div>
        <button
          onClick={() => load(limit)}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      <div className="px-5 py-4">
        {loading && !expanding && (
          <p className="text-sm text-gray-400 py-4 text-center">Loading transactions…</p>
        )}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded text-xs text-red-700 flex items-start gap-2 mb-3">
            <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" /> {error}
          </div>
        )}

        {!loading && !error && rows.length === 0 && (
          <p className="text-sm text-gray-400 py-2">No transactions found for this entity.</p>
        )}

        {rows.length > 0 && (
          <>
            <div className="overflow-x-auto -mx-5">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50">
                  <tr className="text-xs text-gray-400 border-b border-gray-200">
                    <th className="px-5 py-2 text-left font-medium">Date</th>
                    <th className="px-3 py-2 text-left font-medium">Category</th>
                    <th className="px-3 py-2 text-left font-medium">Subcategory</th>
                    <th className="px-3 py-2 text-left font-medium">Description</th>
                    <th className="px-3 py-2 text-left font-medium">Payer</th>
                    <th className="px-3 py-2 text-left font-medium">Payee</th>
                    <th className="px-3 py-2 text-right font-medium">Amount (€)</th>
                    <th className="px-5 py-2 text-left font-medium">Property (raw)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {rows.map(tx => {
                    const isContract = ['Purchase Contract', 'Sale Contract'].includes(tx.subcategory)
                    return (
                      <tr
                        key={tx.transaction_id}
                        className={`hover:bg-blue-50 ${isContract ? 'opacity-50' : ''}`}
                        title={isContract ? 'Contract value — not a cash movement' : undefined}
                      >
                        <td className="px-5 py-2 text-gray-500 whitespace-nowrap text-xs">{tx.date}</td>
                        <td className="px-3 py-2">
                          <CategoryBadge category={tx.category} />
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">
                          {tx.subcategory}
                          {isContract && <span className="ml-1 text-gray-400">(≠ cash)</span>}
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-700 max-w-xs truncate" title={tx.description ?? ''}>
                          {tx.description ?? '—'}
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-600 whitespace-nowrap">{tx.payer}</td>
                        <td className="px-3 py-2 text-xs text-gray-600 whitespace-nowrap">{tx.payee}</td>
                        <td className={`px-3 py-2 text-right font-mono text-xs font-medium whitespace-nowrap ${
                          isContract ? 'text-gray-400' : tx.amount_eur < 0 ? 'text-red-700' : 'text-gray-800'
                        }`}>
                          {EUR(tx.amount_eur)}
                        </td>
                        <td className="px-5 py-2 text-xs text-gray-400 font-mono whitespace-nowrap">
                          {tx.raw_property_name !== tx.canonical_name ? (
                            <span title={`Resolved from "${tx.raw_property_name}"`}>{tx.raw_property_name} →</span>
                          ) : (
                            <span className="text-gray-300">exact match</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {hasMore && (
              <div className="mt-4 text-center">
                <button
                  onClick={handleLoadMore}
                  disabled={expanding}
                  className="px-4 py-2 text-sm text-blue-600 hover:text-blue-800 border border-blue-200 rounded-lg disabled:opacity-50"
                >
                  {expanding ? 'Loading…' : `Load next ${PAGE_SIZE} (${total! - rows.length} remaining)`}
                </button>
              </div>
            )}

            <p className="mt-3 text-xs text-gray-400">
              Transactions are read-only. The raw property name column shows how this entity was resolved from the original transaction data.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
