'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Transaction, Category } from '@/types'
import { CATEGORIES, CATEGORY_COLORS } from '@/types'
import { format } from 'date-fns'
import Link from 'next/link'
import { Search, Filter, Download, PlusCircle, ChevronLeft, ChevronRight } from 'lucide-react'

const EUR = (n: number) =>
  new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)

const PAGE_SIZE = 50

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [total, setTotal]               = useState(0)
  const [page, setPage]                 = useState(0)
  const [loading, setLoading]           = useState(true)

  // Filters
  const [search, setSearch]             = useState('')
  const [filterCategory, setFilterCategory] = useState<Category | ''>('')
  const [filterProperty, setFilterProperty] = useState('')
  const [dateFrom, setDateFrom]         = useState('')
  const [dateTo, setDateTo]             = useState('')

  const fetch = useCallback(async () => {
    setLoading(true)

    let q = supabase
      .from('transactions')
      .select('*', { count: 'exact' })
      .order('date', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    if (filterCategory) q = q.eq('category', filterCategory)
    if (filterProperty) q = q.ilike('property_name', `%${filterProperty}%`)
    if (dateFrom)       q = q.gte('date', dateFrom)
    if (dateTo)         q = q.lte('date', dateTo)
    if (search)         q = q.or(`description.ilike.%${search}%,notes.ilike.%${search}%,payer.ilike.%${search}%,payee.ilike.%${search}%`)

    const { data, count } = await q
    setTransactions((data ?? []) as Transaction[])
    setTotal(count ?? 0)
    setLoading(false)
  }, [page, filterCategory, filterProperty, dateFrom, dateTo, search])

  useEffect(() => { fetch() }, [fetch])
  useEffect(() => { setPage(0) }, [filterCategory, filterProperty, dateFrom, dateTo, search])

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const totalAmount = transactions.reduce((s, t) => s + t.amount_eur, 0)

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Transactions</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total.toLocaleString()} total records</p>
        </div>
        <Link href="/transactions/new" className="btn-primary flex items-center gap-2 text-sm">
          <PlusCircle size={15} />
          New Transaction
        </Link>
      </div>

      {/* Filters */}
      <div className="card p-4 mb-5">
        <div className="grid grid-cols-5 gap-3">
          <div className="col-span-2 relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search description, payer, payee..."
              className="input pl-9"
            />
          </div>
          <select
            value={filterCategory}
            onChange={e => setFilterCategory(e.target.value as Category | '')}
            className="input"
          >
            <option value="">All Categories</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <input
            type="text"
            value={filterProperty}
            onChange={e => setFilterProperty(e.target.value)}
            placeholder="Filter by property..."
            className="input"
          />
          <div className="grid grid-cols-2 gap-2">
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="input text-xs" />
            <input type="date" value={dateTo}   onChange={e => setDateTo(e.target.value)}   className="input text-xs" />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-24">Date</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Property</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Category</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Description</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Payer</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Payee</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Amount</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Client Charge</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-400">Loading...</td></tr>
              )}
              {!loading && transactions.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-400">No transactions found</td></tr>
              )}
              {transactions.map(tx => (
                <tr key={tx.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">
                    {format(new Date(tx.date), 'dd/MM/yy')}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-700 max-w-[120px] truncate">
                    {tx.property_name || <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <span className={`badge text-xs ${CATEGORY_COLORS[tx.category as Category] ?? 'bg-gray-100 text-gray-700'}`}>
                      {tx.category}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 max-w-[180px]">
                    <div className="text-xs font-medium text-gray-800 truncate">{tx.description || '—'}</div>
                    <div className="text-xs text-gray-400 truncate">{tx.subcategory}</div>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-600">{tx.payer || '—'}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-600">{tx.payee || '—'}</td>
                  <td className="px-4 py-2.5 text-sm font-semibold text-gray-900 text-right whitespace-nowrap">
                    {EUR(tx.amount_eur)}
                  </td>
                  <td className="px-4 py-2.5 text-sm text-right whitespace-nowrap">
                    {tx.client_charge != null
                      ? <span className="text-blue-600 font-medium">{EUR(tx.client_charge)}</span>
                      : <span className="text-gray-300">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
            {transactions.length > 0 && (
              <tfoot>
                <tr className="bg-gray-50 border-t-2 border-gray-200">
                  <td colSpan={6} className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Page total ({transactions.length} rows)
                  </td>
                  <td className="px-4 py-3 text-sm font-bold text-gray-900 text-right">
                    {EUR(totalAmount)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50">
            <span className="text-xs text-gray-500">
              Page {page + 1} of {totalPages} · {total.toLocaleString()} records
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="btn-secondary p-1.5 disabled:opacity-40"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="btn-secondary p-1.5 disabled:opacity-40"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
