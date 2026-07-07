'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { RefreshCw, TrendingUp, TrendingDown, Home, AlertCircle } from 'lucide-react'

const EUR = (n: number) =>
  new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
const n = (v: any) => Number(v) || 0

type MgmtRow = {
  property_name: string
  property_id: string | null
  total_received: number
  total_expenses: number
  management_fees: number
  paid_to_owner: number
  balance_due_to_owner: number
}

export default function ManagementPage() {
  const [rows, setRows] = useState<MgmtRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'outstanding' | 'settled'>('all')

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('v_owner_balances')
      .select('*')
      .order('balance_due_to_owner', { ascending: false })
    setRows((data ?? []) as MgmtRow[])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const filtered = rows.filter(r => {
    if (filter === 'outstanding') return n(r.balance_due_to_owner) > 0
    if (filter === 'settled')     return n(r.balance_due_to_owner) <= 0
    return true
  })

  const totalReceived  = rows.reduce((s, r) => s + n(r.total_received), 0)
  const totalExpenses  = rows.reduce((s, r) => s + n(r.total_expenses), 0)
  const totalFees      = rows.reduce((s, r) => s + n(r.management_fees), 0)
  const totalPaid      = rows.reduce((s, r) => s + n(r.paid_to_owner), 0)
  const totalOwed      = rows.filter(r => n(r.balance_due_to_owner) > 0).reduce((s, r) => s + n(r.balance_due_to_owner), 0)

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Management Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">{rows.length} managed properties</p>
        </div>
        <button onClick={load} disabled={loading} className="btn-secondary flex items-center gap-2 text-sm">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        {[
          { label: 'Total Received',   value: totalReceived,  color: 'text-green-600' },
          { label: 'Total Expenses',   value: totalExpenses,  color: 'text-red-500' },
          { label: 'Management Fees',  value: totalFees,      color: 'text-blue-600' },
          { label: 'Paid to Owners',   value: totalPaid,      color: 'text-gray-700' },
          { label: 'Due to Owners',    value: totalOwed,      color: totalOwed > 0 ? 'text-orange-600' : 'text-green-600' },
        ].map(c => (
          <div key={c.label} className="card p-4">
            <div className="text-xs text-gray-400 mb-1">{c.label}</div>
            <div className={`text-xl font-bold ${c.color}`}>{EUR(c.value)}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-5">
        {(['all','outstanding','settled'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium capitalize transition-colors ${
              filter === f ? 'bg-brand-500 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}>
            {f === 'outstanding' ? `Outstanding (${rows.filter(r => n(r.balance_due_to_owner) > 0).length})` : f === 'all' ? `All (${rows.length})` : `Settled (${rows.filter(r => n(r.balance_due_to_owner) <= 0).length})`}
          </button>
        ))}
      </div>

      {loading && <div className="text-sm text-gray-400">Loading...</div>}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Property</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Received</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Expenses</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Mgmt Fee</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Paid to Owner</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Balance Due</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.map(r => {
              const due = n(r.balance_due_to_owner)
              return (
                <tr key={r.property_name} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Home size={13} className="text-gray-400 shrink-0" />
                      <span className="font-medium text-gray-900">{r.property_name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-green-600 font-medium">{EUR(n(r.total_received))}</td>
                  <td className="px-4 py-3 text-right text-gray-500">{EUR(n(r.total_expenses))}</td>
                  <td className="px-4 py-3 text-right text-blue-600">{EUR(n(r.management_fees))}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{EUR(n(r.paid_to_owner))}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`font-bold ${due > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                      {due > 0 && <AlertCircle size={12} className="inline mr-1" />}
                      {EUR(due)}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
          {filtered.length === 0 && !loading && (
            <tbody><tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">No properties found.</td></tr></tbody>
          )}
        </table>
      </div>
    </div>
  )
}
