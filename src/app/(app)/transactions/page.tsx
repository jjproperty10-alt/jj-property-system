'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Category } from '@/types'
import { CATEGORIES, CATEGORY_COLORS } from '@/types'
import { format } from 'date-fns'
import Link from 'next/link'
import { Search, PlusCircle, ChevronLeft, ChevronRight } from 'lucide-react'
import {
  enrichTransactionRegisterMetaAction,
  loadTransactionForCorrectionAction,
  type RegisterRowMeta,
} from '@/lib/transactions/correctionWorkspaceActions'
import type { RegisterTxForCorrection } from '@/lib/transactions/buildM1CorrectionPreview'
import { RegisterStatusBadges, ReviewCorrectButton } from '@/components/transactions/RegisterStatusBadges'
import { CorrectionDialog } from '@/components/transactions/CorrectionDialog'

const EUR = (n: number) =>
  new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)

const PAGE_SIZE = 50

/** Register row — extends the base transaction shape with status columns used by M1. */
export interface RegisterTransaction {
  id: string
  date: string
  property_id: string | null
  property_name: string | null
  category: Category | string
  subcategory: string | null
  description: string | null
  payer: string | null
  payee: string | null
  amount_eur: number
  client_charge: number | null
  notes: string | null
  review_status?: string | null
  is_deleted?: boolean | null
}

function toCorrectionTx(tx: RegisterTransaction): RegisterTxForCorrection {
  return {
    id: tx.id,
    date: tx.date,
    property_id: tx.property_id,
    property_name: tx.property_name,
    category: String(tx.category),
    subcategory: tx.subcategory,
    description: tx.description,
    payer: tx.payer,
    payee: tx.payee,
    amount_eur: tx.amount_eur,
    client_charge: tx.client_charge,
    notes: tx.notes,
  }
}

function TransactionsRegisterInner() {
  const searchParams = useSearchParams()
  const focusId = searchParams.get('tx') || searchParams.get('correct') || ''

  const [transactions, setTransactions] = useState<RegisterTransaction[]>([])
  const [meta, setMeta] = useState<Record<string, RegisterRowMeta>>({})
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState<Category | ''>('')
  const [filterProperty, setFilterProperty] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const [dialogTx, setDialogTx] = useState<RegisterTransaction | null>(null)
  const [focusError, setFocusError] = useState<string | null>(null)
  const [refreshToken, setRefreshToken] = useState(0)

  const fetchRows = useCallback(async () => {
    setLoading(true)

    let q = supabase
      .from('transactions')
      .select('*', { count: 'exact' })
      .order('date', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    if (filterCategory) q = q.eq('category', filterCategory)
    if (filterProperty) q = q.ilike('property_name', `%${filterProperty}%`)
    if (dateFrom) q = q.gte('date', dateFrom)
    if (dateTo) q = q.lte('date', dateTo)
    if (search) {
      q = q.or(
        `description.ilike.%${search}%,notes.ilike.%${search}%,payer.ilike.%${search}%,payee.ilike.%${search}%`,
      )
    }

    const { data, count } = await q
    const rows = (data ?? []) as RegisterTransaction[]
    setTransactions(rows)
    setTotal(count ?? 0)

    const ids = rows.map((r) => r.id)
    if (ids.length > 0) {
      const enriched = await enrichTransactionRegisterMetaAction(ids)
      if (enriched.ok) setMeta(enriched.meta)
      else setMeta({})
    } else {
      setMeta({})
    }

    setLoading(false)
  }, [page, filterCategory, filterProperty, dateFrom, dateTo, search, refreshToken])

  useEffect(() => {
    void fetchRows()
  }, [fetchRows])

  useEffect(() => {
    setPage(0)
  }, [filterCategory, filterProperty, dateFrom, dateTo, search])

  // Deep-link from /validation?tx=<id> — open correction dialog for that row.
  // Never mutates on page load. Missing/inaccessible shows a clear error.
  useEffect(() => {
    if (!focusId) {
      setFocusError(null)
      return
    }
    let cancelled = false
    void (async () => {
      const res = await loadTransactionForCorrectionAction(focusId)
      if (cancelled) return
      if (!res.ok) {
        setFocusError(res.error)
        setDialogTx(null)
        return
      }
      setFocusError(null)
      setDialogTx(res.transaction as RegisterTransaction)
    })()
    return () => {
      cancelled = true
    }
  }, [focusId])

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const totalAmount = transactions.reduce((s, t) => s + Number(t.amount_eur || 0), 0)

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Transactions / עסקאות</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {total.toLocaleString()} total records · controlled manual correction workspace
          </p>
        </div>
        <Link href="/transactions/new" className="btn-primary flex items-center gap-2 text-sm">
          <PlusCircle size={15} />
          New Transaction
        </Link>
      </div>

      {focusError && (
        <div
          className="mb-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          data-testid="tx-focus-error"
          role="alert"
        >
          Cannot open transaction for correction: {focusError}
        </div>
      )}

      <div className="card p-4 mb-5" data-testid="register-filters">
        <div className="grid grid-cols-5 gap-3">
          <div className="col-span-2 relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search description, payer, payee..."
              className="input pl-9"
              data-testid="filter-search"
            />
          </div>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value as Category | '')}
            className="input"
            data-testid="filter-category"
          >
            <option value="">All Categories</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={filterProperty}
            onChange={(e) => setFilterProperty(e.target.value)}
            placeholder="Filter by property..."
            className="input"
            data-testid="filter-property"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="input text-xs"
              data-testid="filter-date-from"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="input text-xs"
              data-testid="filter-date-to"
            />
          </div>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="transactions-register-table">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-24">
                  Date
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Property
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Category
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Subcategory
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Description
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Payer
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Payee
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Amount
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Client Charge
                </th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Review
                </th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Deleted
                </th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Exclusion
                </th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Correction
                </th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading && (
                <tr>
                  <td colSpan={14} className="px-4 py-8 text-center text-sm text-gray-400">
                    Loading...
                  </td>
                </tr>
              )}
              {!loading && transactions.length === 0 && (
                <tr>
                  <td colSpan={14} className="px-4 py-8 text-center text-sm text-gray-400">
                    No transactions found
                  </td>
                </tr>
              )}
              {transactions.map((tx) => {
                const rowMeta = meta[tx.id] ?? {
                  hasActiveExclusion: false,
                  hasCorrectionCase: false,
                  correctionCaseCount: 0,
                }
                return (
                  <tr key={tx.id} className="hover:bg-gray-50 transition-colors" data-testid={`tx-row-${tx.id}`}>
                    <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">
                      {format(new Date(tx.date), 'dd/MM/yy')}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-700 max-w-[120px] truncate">
                      {tx.property_name || <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span
                        className={`badge text-xs ${CATEGORY_COLORS[tx.category as Category] ?? 'bg-gray-100 text-gray-700'}`}
                      >
                        {tx.category}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-600 max-w-[120px] truncate">
                      {tx.subcategory || <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-2.5 max-w-[180px]">
                      <div className="text-xs font-medium text-gray-800 truncate">{tx.description || '—'}</div>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-600">{tx.payer || '—'}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-600">{tx.payee || '—'}</td>
                    <td className="px-4 py-2.5 text-sm font-semibold text-gray-900 text-right whitespace-nowrap">
                      {EUR(Number(tx.amount_eur))}
                    </td>
                    <td className="px-4 py-2.5 text-sm text-right whitespace-nowrap">
                      {tx.client_charge != null ? (
                        <span className="text-blue-600 font-medium">{EUR(Number(tx.client_charge))}</span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <RegisterStatusBadges
                      reviewStatus={tx.review_status}
                      isDeleted={tx.is_deleted}
                      hasActiveExclusion={rowMeta.hasActiveExclusion}
                      hasCorrectionCase={rowMeta.hasCorrectionCase}
                      correctionCaseCount={rowMeta.correctionCaseCount}
                    />
                    <td className="px-3 py-2.5">
                      <ReviewCorrectButton onClick={() => setDialogTx(tx)} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
            {transactions.length > 0 && (
              <tfoot>
                <tr className="bg-gray-50 border-t-2 border-gray-200">
                  <td
                    colSpan={7}
                    className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide"
                  >
                    Page total ({transactions.length} rows)
                  </td>
                  <td className="px-4 py-3 text-sm font-bold text-gray-900 text-right">{EUR(totalAmount)}</td>
                  <td colSpan={6} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {totalPages > 1 && (
          <div
            className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50"
            data-testid="register-pagination"
          >
            <span className="text-xs text-gray-500">
              Page {page + 1} of {totalPages} · {total.toLocaleString()} records
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="btn-secondary p-1.5 disabled:opacity-40"
                data-testid="page-prev"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="btn-secondary p-1.5 disabled:opacity-40"
                data-testid="page-next"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {dialogTx && (
        <CorrectionDialog
          open={!!dialogTx}
          transaction={toCorrectionTx(dialogTx)}
          onClose={() => setDialogTx(null)}
          onApplied={() => {
            setRefreshToken((n) => n + 1)
          }}
        />
      )}
    </div>
  )
}

export default function TransactionsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-gray-400">Loading transactions…</div>}>
      <TransactionsRegisterInner />
    </Suspense>
  )
}
