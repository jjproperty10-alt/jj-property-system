'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createSupabaseBrowserClient } from '@/lib/supabase'
import { enrichTransactionRegisterMetaAction } from '@/lib/transactions/correctionWorkspaceActions'
import {
  computeValidationQuality,
  isBillingOnlyZero,
  validationActionAllowsCorrect,
  validationActionKind,
  type ValidationTxEnrichment,
} from '@/lib/transactions/validationTruth'
import { RefreshCw, AlertTriangle, CheckCircle, XCircle, AlertCircle, Copy, ChevronDown, ChevronRight } from 'lucide-react'
import { format, parseISO } from 'date-fns'

const EUR = (n: number) =>
  new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
const num = (v: unknown) => Number(v) || 0

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

const ISSUE_CONFIG: Record<string, { label: string; color: string; icon: typeof AlertCircle }> = {
  missing_property:    { label: 'Missing Property',    color: 'bg-yellow-100 text-yellow-700',  icon: AlertCircle },
  missing_payer:       { label: 'Missing Payer',       color: 'bg-orange-100 text-orange-700',  icon: AlertCircle },
  missing_payee:       { label: 'Missing Payee',       color: 'bg-orange-100 text-orange-700',  icon: AlertCircle },
  missing_subcategory: { label: 'Missing Subcategory', color: 'bg-gray-100 text-gray-600',      icon: AlertCircle },
  large_amount:        { label: 'Large Amount',        color: 'bg-red-100 text-red-700',        icon: AlertTriangle },
  zero_amount:         { label: 'Zero/Negative',       color: 'bg-red-100 text-red-700',        icon: XCircle },
  duplicate:           { label: 'Possible Duplicate',  color: 'bg-purple-100 text-purple-700',  icon: AlertTriangle },
}

function ActionCell({ issueType, transactionId }: { issueType: string; transactionId: string }) {
  const kind = validationActionKind(issueType)
  if (validationActionAllowsCorrect(kind)) {
    return (
      <Link
        href={`/transactions?tx=${encodeURIComponent(transactionId)}`}
        className="text-xs font-medium text-brand-600 hover:text-brand-800"
        data-testid={`validation-correct-link-${transactionId}`}
      >
        Review / Correct
        <span className="block text-[10px] font-normal text-gray-500">בדיקה / תיקון</span>
      </Link>
    )
  }
  if (kind === 'unsupported_property') {
    return (
      <span className="text-xs text-amber-800" data-testid="validation-unsupported-property">
        Property correction not supported yet
        <span className="block text-[10px] text-amber-700">תיקון נכס עדיין לא נתמך</span>
      </span>
    )
  }
  if (kind === 'unsupported_party') {
    return (
      <span className="text-xs text-amber-800" data-testid="validation-unsupported-party">
        Party correction not supported yet
        <span className="block text-[10px] text-amber-700">תיקון צד לעסקה עדיין לא נתמך</span>
      </span>
    )
  }
  return (
    <span className="text-xs text-gray-600" data-testid="validation-review-only">
      Review only / בדיקה בלבד
      <span className="block text-[10px] text-gray-500">Never auto-suppress duplicates</span>
    </span>
  )
}

export default function ValidationPage() {
  const [issues, setIssues]     = useState<Issue[]>([])
  const [enrichment, setEnrichment] = useState<Record<string, ValidationTxEnrichment>>({})
  const [loading, setLoading]   = useState(true)
  const [txCount, setTxCount]   = useState(0)
  const [filter, setFilter]     = useState('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [copyFlash, setCopyFlash] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const supabase = createSupabaseBrowserClient()
    const [issuesRes, countRes] = await Promise.all([
      supabase.from('v_transaction_issues').select('*').order('severity').order('date', { ascending: false }),
      supabase.from('transactions').select('id', { count: 'exact', head: true }),
    ])
    const rows = (issuesRes.data ?? []) as Issue[]
    setIssues(rows)
    setTxCount(countRes.count ?? 0)

    // Option B: keep issue view contract; enrich from canonical transactions + exclusion meta.
    const ids = Array.from(new Set(rows.map((r) => r.id)))
    const next: Record<string, ValidationTxEnrichment> = {}
    for (const id of ids) {
      next[id] = {
        property_id: null,
        property_name: null,
        client_charge: null,
        review_status: null,
        is_deleted: null,
        hasActiveExclusion: false,
      }
    }

    if (ids.length > 0) {
      const { data: txRows } = await supabase
        .from('transactions')
        .select('id, property_id, property_name, client_charge, review_status, is_deleted')
        .in('id', ids)

      if (Array.isArray(txRows)) {
        for (const row of txRows as Array<{
          id: string
          property_id: string | null
          property_name: string | null
          client_charge: number | null
          review_status: string | null
          is_deleted: boolean | null
        }>) {
          next[row.id] = {
            ...next[row.id],
            property_id: row.property_id,
            property_name: row.property_name,
            client_charge: row.client_charge,
            review_status: row.review_status,
            is_deleted: row.is_deleted,
          }
        }
      }

      const meta = await enrichTransactionRegisterMetaAction(ids)
      if (meta.ok) {
        for (const id of ids) {
          next[id] = {
            ...next[id],
            hasActiveExclusion: meta.meta[id]?.hasActiveExclusion ?? false,
          }
        }
      }
    }

    setEnrichment(next)
    setLoading(false)
  }
  useEffect(() => { void load() }, [])

  const issueTypes = Array.from(new Set(issues.map(i => i.issue_type)))
  const filtered = filter === 'all' ? issues
    : issueTypes.includes(filter) ? issues.filter(i => i.issue_type === filter)
    : issues.filter(i => i.severity === filter)

  const quality = useMemo(
    () => computeValidationQuality(txCount, issues.map((i) => i.id)),
    [txCount, issues],
  )

  async function copyId(id: string) {
    try {
      await navigator.clipboard.writeText(id)
      setCopyFlash(id)
      setTimeout(() => setCopyFlash(null), 1200)
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Validation / בדיקות</h1>
          <p className="text-sm text-gray-500 mt-0.5" data-testid="validation-summary-line">
            {txCount.toLocaleString()} total transactions · {quality.issueRowCount} issue rows ·{' '}
            {quality.distinctDirtyCount} distinct transactions with issues · {quality.cleanCount.toLocaleString()} clean
          </p>
        </div>
        <button onClick={() => void load()} disabled={loading} className="btn-secondary flex items-center gap-2 text-sm">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <div
          className={`card p-5 ${quality.scorePercent >= 95 ? 'bg-green-50 border-green-100' : quality.scorePercent >= 80 ? 'bg-yellow-50 border-yellow-100' : 'bg-red-50 border-red-100'}`}
          data-testid="validation-quality-score"
        >
          <div className="text-xs text-gray-500 mb-1">Data Quality Score</div>
          <div className={`text-3xl font-bold ${quality.scorePercent >= 95 ? 'text-green-600' : quality.scorePercent >= 80 ? 'text-yellow-600' : 'text-red-600'}`}>
            {quality.scorePercent}%
          </div>
          <div className="text-xs text-gray-400 mt-1">
            {quality.cleanCount} clean / {txCount} total (distinct)
          </div>
        </div>
        <div className="card p-5 bg-red-50 border-red-100">
          <div className="text-xs text-gray-500 mb-1">High Severity</div>
          <div className="text-3xl font-bold text-red-600">{issues.filter(i => i.severity === 'high').length}</div>
        </div>
        <div className="card p-5 bg-orange-50 border-orange-100">
          <div className="text-xs text-gray-500 mb-1">Medium Severity</div>
          <div className="text-3xl font-bold text-orange-600">{issues.filter(i => i.severity === 'medium').length}</div>
        </div>
        <div className="card p-5">
          <div className="text-xs text-gray-500 mb-1">Low Severity</div>
          <div className="text-3xl font-bold text-gray-600">{issues.filter(i => i.severity === 'low').length}</div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3 mb-6">
        {issueTypes.map(t => {
          const cfg = ISSUE_CONFIG[t] ?? { label: t, color: 'bg-gray-100 text-gray-600', icon: AlertCircle }
          const count = issues.filter(i => i.issue_type === t).length
          return (
            <button key={t} onClick={() => setFilter(filter === t ? 'all' : t)}
              className={`card p-3 text-left hover:shadow-md transition-all ${filter === t ? 'ring-2 ring-brand-500' : ''}`}
              data-testid={`validation-filter-card-${t}`}>
              <div className={`badge text-xs mb-2 ${cfg.color}`}>{cfg.label}</div>
              <div className="text-2xl font-bold text-gray-900">{count}</div>
            </button>
          )
        })}
      </div>

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
          <table className="w-full text-sm" data-testid="validation-issues-table">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-3 py-3 text-xs font-medium text-gray-500 uppercase w-8" />
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Issue</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Property</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Category</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Description</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Amount</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Client Charge</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">From → To</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((issue) => {
                const cfg = ISSUE_CONFIG[issue.issue_type] ?? { label: issue.issue_type, color: 'bg-gray-100 text-gray-600', icon: AlertCircle }
                const IssueIcon = cfg.icon
                const enr = enrichment[issue.id]
                const clientCharge = enr?.client_charge ?? null
                const billingOnly = isBillingOnlyZero(issue.amount_eur, clientCharge)
                const rowKey = `${issue.id}-${issue.issue_type}`
                const open = expandedId === rowKey
                return (
                  <Fragment key={rowKey}>
                    <tr className="hover:bg-gray-50" data-testid={`validation-row-${issue.issue_type}`}>
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          className="text-gray-400 hover:text-gray-700"
                          aria-label="Toggle details"
                          onClick={() => setExpandedId(open ? null : `${issue.id}-${issue.issue_type}`)}
                        >
                          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <IssueIcon size={13} className={issue.severity === 'high' ? 'text-red-500' : issue.severity === 'medium' ? 'text-orange-500' : 'text-gray-400'} />
                          <span className={`badge text-xs ${cfg.color}`}>{cfg.label}</span>
                          {billingOnly && (
                            <span className="badge text-xs bg-sky-100 text-sky-800" data-testid="billing-only-badge">
                              Billing only / חיוב לקוח בלבד
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                        {issue.date ? format(parseISO(issue.date), 'dd/MM/yy') : '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-700 max-w-[10rem] truncate">
                        {enr?.property_name || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-gray-700">{issue.category}</div>
                        {issue.subcategory && <div className="text-xs text-gray-400">{issue.subcategory}</div>}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs max-w-40 truncate">
                        {issue.description ?? issue.issue_description}
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        <span className={num(issue.amount_eur) > 500000 || (num(issue.amount_eur) < 0) ? 'text-red-600' : 'text-gray-900'}>
                          {EUR(num(issue.amount_eur))}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900" data-testid="validation-client-charge">
                        {clientCharge == null ? '—' : EUR(num(clientCharge))}
                      </td>
                      <td className="px-4 py-3 text-[10px] text-gray-600 space-y-0.5">
                        <div>review: {enr?.review_status ?? '—'}</div>
                        <div>deleted: {enr?.is_deleted ? 'yes' : 'no'}</div>
                        <div>excl: {enr?.hasActiveExclusion ? 'active' : '—'}</div>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        <span className={!issue.payer ? 'text-red-400' : ''}>{issue.payer ?? '⚠ missing'}</span>
                        <span className="text-gray-300 mx-1">→</span>
                        <span className={!issue.payee ? 'text-red-400' : ''}>{issue.payee ?? '⚠ missing'}</span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <ActionCell issueType={issue.issue_type} transactionId={issue.id} />
                      </td>
                    </tr>
                    {open && (
                      <tr className="bg-gray-50">
                        <td colSpan={11} className="px-6 py-3 text-xs text-gray-700">
                          <div className="flex flex-wrap items-center gap-3">
                            <span className="font-medium text-gray-500">Transaction UUID</span>
                            <code className="font-mono text-gray-900" data-testid="validation-tx-uuid">{issue.id}</code>
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 text-brand-600 hover:text-brand-800"
                              onClick={() => void copyId(issue.id)}
                              data-testid="validation-copy-uuid"
                            >
                              <Copy size={12} /> {copyFlash === issue.id ? 'Copied' : 'Copy'}
                            </button>
                            {enr?.property_id && (
                              <span className="text-gray-500">property_id: <code className="font-mono">{enr.property_id}</code></span>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
