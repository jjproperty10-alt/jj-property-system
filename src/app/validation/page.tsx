'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { RefreshCw, AlertTriangle, CheckCircle, XCircle, AlertCircle } from 'lucide-react'
import { format, parseISO } from 'date-fns'

const EUR = (n: number) =>
  new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
const num = (v: any) => Number(v) || 0

type Issue = {
  id: string
  date: string
  amount_eur: number
  category: string
  subcategory: string | null
  description: string | null
  payer: string | null
  payee: string | null
  issue_type: string
  issue_description: string
  severity: string
}

const ISSUE_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  missing_property:    { label: 'Missing Property',    color: 'bg-yellow-100 text-yellow-700',  icon: AlertCircle },
  missing_payer:       { label: 'Missing Payer',       color: 'bg-orange-100 text-orange-700',  icon: AlertCircle },
  missing_payee:       { label: 'Missing Payee',       color: 'bg-orange-100 text-orange-700',  icon: AlertCircle },
  missing_subcategory: { label: 'Missing Subcategory', color: 'bg-gray-100 text-gray-600',      icon: AlertCircle },
  large_amount:        { label: 'Large Amount',        color: 'bg-red-100 text-red-700',        icon: AlertTriangle },
  zero_amount:         { label: 'Zero/Negative',       color: 'bg-red-100 text-red-700',        icon: XCircle },
  duplicate:           { label: 'Possible Duplicate',  color: 'bg-purple-100 text-purple-700',  icon: AlertTriangle },
}

const SEVERITY_COLOR: Record<string, string> = {
  high:   'text-red-600 bg-red-50 border-red-200',
  medium: 'text-orange-600 bg-orange-50 border-orange-200',
  low:    'text-gray-500 bg-gray-50 border-gray-200',
}

export default function ValidationPage() {
  const [issues, setIssues]     = useState<Issue[]>([])
  const [loading, setLoading]   = useState(true)
  const [txCount, setTxCount]   = useState(0)
  const [filter, setFilter]     = useState('all')

  async function load() {
    setLoading(true)
    const [issuesRes, countRes] = await Promise.all([
      supabase.from('v_transaction_issues').select('*').order('severity').order('date', { ascending: false }),
      supabase.from('transactions').select('id', { count: 'exact', head: true }),
    ])
    setIssues((issuesRes.data ?? []) as Issue[])
    setTxCount(countRes.count ?? 0)
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const issueTypes = Array.from(new Set(issues.map(i => i.issue_type)))
  const filtered = filter === 'all' ? issues
    : issueTypes.includes(filter) ? issues.filter(i => i.issue_type === filter)
    : issues.filter(i => i.severity === filter)

  const highCount   = issues.filter(i => i.severity === 'high').length
  const mediumCount = issues.filter(i => i.severity === 'medium').length
  const score       = txCount > 0 ? Math.round((1 - issues.length / txCount) * 100) : 100

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Transaction Validation</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {txCount.toLocaleString()} total transactions · {issues.length} issues found
          </p>
        </div>
        <button onClick={load} disabled={loading} className="btn-secondary flex items-center gap-2 text-sm">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* Data Quality Score */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className={`card p-5 ${score >= 95 ? 'bg-green-50 border-green-100' : score >= 80 ? 'bg-yellow-50 border-yellow-100' : 'bg-red-50 border-red-100'}`}>
          <div className="text-xs text-gray-500 mb-1">Data Quality Score</div>
          <div className={`text-3xl font-bold ${score >= 95 ? 'text-green-600' : score >= 80 ? 'text-yellow-600' : 'text-red-600'}`}>
            {score}%
          </div>
          <div className="text-xs text-gray-400 mt-1">{txCount - issues.length} clean / {txCount} total</div>
        </div>
        <div className="card p-5 bg-red-50 border-red-100">
          <div className="text-xs text-gray-500 mb-1">High Severity</div>
          <div className="text-3xl font-bold text-red-600">{highCount}</div>
        </div>
        <div className="card p-5 bg-orange-50 border-orange-100">
          <div className="text-xs text-gray-500 mb-1">Medium Severity</div>
          <div className="text-3xl font-bold text-orange-600">{mediumCount}</div>
        </div>
        <div className="card p-5">
          <div className="text-xs text-gray-500 mb-1">Low Severity</div>
          <div className="text-3xl font-bold text-gray-600">{issues.filter(i => i.severity === 'low').length}</div>
        </div>
      </div>

      {/* Issue type breakdown */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {issueTypes.map(t => {
          const cfg = ISSUE_CONFIG[t] ?? { label: t, color: 'bg-gray-100 text-gray-600', icon: AlertCircle }
          const count = issues.filter(i => i.issue_type === t).length
          return (
            <button key={t} onClick={() => setFilter(filter === t ? 'all' : t)}
              className={`card p-3 text-left hover:shadow-md transition-all ${filter === t ? 'ring-2 ring-brand-500' : ''}`}>
              <div className={`badge text-xs mb-2 ${cfg.color}`}>{cfg.label}</div>
              <div className="text-2xl font-bold text-gray-900">{count}</div>
            </button>
          )
        })}
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-5">
        {['all','high','medium','low'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium capitalize transition-colors ${
              filter === f ? 'bg-brand-500 text-white' : 'bg-white border border-gray-200 text-gray-600'
            }`}>
            {f === 'all' ? `All (${issues.length})` : `${f} (${issues.filter(i => i.severity === f).length})`}
          </button>
        ))}
      </div>

      {loading && <div className="text-sm text-gray-400">Scanning transactions...</div>}

      {!loading && issues.length === 0 && (
        <div className="card p-12 text-center">
          <CheckCircle size={40} className="text-green-400 mx-auto mb-3" />
          <div className="text-lg font-semibold text-gray-700">Perfect data quality!</div>
          <div className="text-sm text-gray-400 mt-1">No issues found in {txCount.toLocaleString()} transactions.</div>
        </div>
      )}

      <div className="card overflow-hidden">
        {filtered.length > 0 && (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Issue</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Category</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Description</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Amount</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">From → To</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((issue, i) => {
                const cfg = ISSUE_CONFIG[issue.issue_type] ?? { label: issue.issue_type, color: 'bg-gray-100 text-gray-600', icon: AlertCircle }
                const IssueIcon = cfg.icon
                return (
                  <tr key={`${issue.id}-${issue.issue_type}`} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <IssueIcon size={13} className={issue.severity === 'high' ? 'text-red-500' : issue.severity === 'medium' ? 'text-orange-500' : 'text-gray-400'} />
                        <span className={`badge text-xs ${cfg.color}`}>{cfg.label}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                      {issue.date ? format(parseISO(issue.date), 'dd/MM/yy') : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-gray-700">{issue.category}</div>
                      {issue.subcategory && <div className="text-xs text-gray-400">{issue.subcategory}</div>}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs max-w-48 truncate">
                      {issue.description ?? issue.issue_description}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      <span className={num(issue.amount_eur) > 500000 || num(issue.amount_eur) <= 0 ? 'text-red-600' : 'text-gray-900'}>
                        {EUR(num(issue.amount_eur))}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      <span className={!issue.payer ? 'text-red-400' : ''}>{issue.payer ?? '⚠ missing'}</span>
                      <span className="text-gray-300 mx-1">→</span>
                      <span className={!issue.payee ? 'text-red-400' : ''}>{issue.payee ?? '⚠ missing'}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
