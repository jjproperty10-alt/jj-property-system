'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { RefreshCw, AlertCircle, Clock, TrendingDown, User, Home } from 'lucide-react'

const EUR = (n: number) =>
  new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
const n = (v: any) => Number(v) || 0

type Balance = {
  balance_type: string
  category: string
  property_name: string | null
  description: string
  open_amount: number
  total_amount: number
  paid_amount: number
  priority: string
}

const TYPE_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  sale_receivable:       { label: 'Sale Receivable',   color: 'bg-green-100 text-green-700',  icon: Home },
  renovation_receivable: { label: 'Reno Receivable',   color: 'bg-orange-100 text-orange-700', icon: Home },
  owner_balance:         { label: 'Due to Owner',      color: 'bg-blue-100 text-blue-700',    icon: User },
  airbnb_owner_balance:  { label: 'Airbnb to Owner',   color: 'bg-pink-100 text-pink-700',    icon: Home },
  employee_reimbursement:{ label: 'Employee Reimb.',   color: 'bg-purple-100 text-purple-700', icon: User },
}

export default function OpenBalancesPage() {
  const [balances, setBalances] = useState<Balance[]>([])
  const [loading, setLoading]   = useState(true)
  const [filter, setFilter]     = useState('all')

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('v_open_balances')
      .select('*')
      .order('open_amount', { ascending: false })
    setBalances((data ?? []) as Balance[])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const types = Array.from(new Set(balances.map(b => b.balance_type)))
  const filtered = filter === 'all' ? balances : balances.filter(b => b.balance_type === filter)

  const totalOpen = balances.reduce((s, b) => s + n(b.open_amount), 0)
  const highCount = balances.filter(b => b.priority === 'high').length

  // Group by type for summary
  const summary = types.map(t => ({
    type: t,
    count: balances.filter(b => b.balance_type === t).length,
    total: balances.filter(b => b.balance_type === t).reduce((s, b) => s + n(b.open_amount), 0),
  }))

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Open Balances</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {balances.length} open items
            {highCount > 0 && <span className="text-red-500 font-medium ml-2">· {highCount} high priority</span>}
          </p>
        </div>
        <button onClick={load} disabled={loading} className="btn-secondary flex items-center gap-2 text-sm">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* Total */}
      <div className="card p-5 mb-6 bg-orange-50 border border-orange-100">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-orange-600 font-medium">Total Open Amount</div>
            <div className="text-3xl font-bold text-orange-700 mt-1">{EUR(totalOpen)}</div>
          </div>
          <AlertCircle size={40} className="text-orange-300" />
        </div>
      </div>

      {/* Summary by type */}
      <div className="grid grid-cols-5 gap-3 mb-6">
        {summary.map(s => {
          const cfg = TYPE_CONFIG[s.type] ?? { label: s.type, color: 'bg-gray-100 text-gray-600', icon: Clock }
          return (
            <button key={s.type}
              onClick={() => setFilter(filter === s.type ? 'all' : s.type)}
              className={`card p-4 text-left hover:shadow-md transition-all ${filter === s.type ? 'ring-2 ring-brand-500' : ''}`}>
              <div className={`badge text-xs mb-2 ${cfg.color}`}>{cfg.label}</div>
              <div className="text-xl font-bold text-gray-900">{EUR(s.total)}</div>
              <div className="text-xs text-gray-400 mt-1">{s.count} item{s.count !== 1 ? 's' : ''}</div>
            </button>
          )
        })}
      </div>

      {/* Filter pills */}
      <div className="flex gap-2 mb-5">
        <button onClick={() => setFilter('all')}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${filter === 'all' ? 'bg-brand-500 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>
          All ({balances.length})
        </button>
        {[
          { val: 'high',   label: 'High Priority' },
          { val: 'medium', label: 'Medium Priority' },
        ].map(f => (
          <button key={f.val} onClick={() => setFilter(f.val)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              filter === f.val
                ? f.val === 'high' ? 'bg-red-500 text-white' : 'bg-orange-500 text-white'
                : 'bg-white border border-gray-200 text-gray-600'
            }`}>
            {f.label} ({balances.filter(b => b.priority === f.val).length})
          </button>
        ))}
      </div>

      {loading && <div className="text-sm text-gray-400">Loading...</div>}

      <div className="space-y-3">
        {(filter === 'high' || filter === 'medium'
          ? balances.filter(b => b.priority === filter)
          : filtered
        ).map((b, i) => {
          const cfg = TYPE_CONFIG[b.balance_type] ?? { label: b.balance_type, color: 'bg-gray-100 text-gray-600', icon: Clock }
          const pctPaid = n(b.total_amount) > 0 ? Math.round(n(b.paid_amount) / n(b.total_amount) * 100) : 0
          return (
            <div key={i} className={`card p-5 border-l-4 ${b.priority === 'high' ? 'border-l-red-400' : 'border-l-orange-300'}`}>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`badge text-xs ${cfg.color}`}>{cfg.label}</span>
                    {b.priority === 'high' && <span className="badge bg-red-100 text-red-600 text-xs">High Priority</span>}
                  </div>
                  {b.property_name && (
                    <div className="font-semibold text-gray-900">{b.property_name}</div>
                  )}
                  <div className="text-sm text-gray-500 mt-0.5">{b.description}</div>
                  {n(b.total_amount) > 0 && (
                    <div className="mt-2">
                      <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                        <span>Paid: {EUR(n(b.paid_amount))}</span>
                        <span>Total: {EUR(n(b.total_amount))}</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-green-400 rounded-full" style={{ width: `${Math.min(pctPaid, 100)}%` }} />
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">{pctPaid}% paid</div>
                    </div>
                  )}
                </div>
                <div className="text-right ml-6">
                  <div className="text-xs text-gray-400">Outstanding</div>
                  <div className={`text-2xl font-bold ${b.priority === 'high' ? 'text-red-600' : 'text-orange-600'}`}>
                    {EUR(n(b.open_amount))}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {!loading && filtered.length === 0 && (
        <div className="card p-12 text-center">
          <div className="text-4xl mb-3">✅</div>
          <div className="text-gray-500 font-medium">No open balances in this category</div>
        </div>
      )}
    </div>
  )
}
