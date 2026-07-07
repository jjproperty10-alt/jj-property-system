'use client'

// ============================================================
// JJ PROPERTY 10 — Partnership Allocation Panel
// File: src/app/admin/entity-mapping/[id]/components/PartnershipAllocationPanel.tsx
//
// READ-ONLY preview panel. Four sections:
//   A. Partner Capital Allocation  (v_partnership_partner_capital_allocation)
//   B. Expense Markup Allocation   (v_partnership_expense_markup_allocation)
//   C. JJ Internal Settlement      (v_jj_internal_partnership_settlement)  Rule 2
//   D. JJ Net Position             (v_jj_property_net_position)            Rules 3+5
//
// SAFETY: No writes. No modifications to transactions, settlements,
// receivables, or any production financial data.
// Preview only — not used in any cash balance or P&L calculation.
// ============================================================

import { useEffect, useState } from 'react'
import { TrendingUp, ChevronDown, ChevronRight, AlertTriangle, Layers, Scale, BarChart3 } from 'lucide-react'
import {
  getPartnerCapitalAllocation,
  getPartnershipExpenseMarkup,
  getJJInternalSettlement,
  getJJPropertyNetPosition,
  PartnerCapitalAllocation,
  PartnershipExpenseMarkup,
  JJInternalSettlement,
  JJPropertyNetPosition,
} from '@/lib/entity-registry'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function eur(n: number): string {
  return '€' + n.toLocaleString('en-IE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function pct(n: number): string {
  return n.toFixed(1) + '%'
}

function StatusBadge({ value, zero = 'good' }: { value: number; zero?: 'good' | 'neutral' }) {
  if (value === 0) {
    const cls = zero === 'good'
      ? 'bg-green-50 text-green-700 border border-green-200'
      : 'bg-gray-50 text-gray-500 border border-gray-200'
    return <span className={`inline-block text-xs font-medium px-1.5 py-0.5 rounded ${cls}`}>
      {eur(0)}
    </span>
  }
  if (value > 0) {
    return <span className="inline-block text-xs font-medium px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
      {eur(value)}
    </span>
  }
  return <span className="inline-block text-xs font-medium px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
    {eur(value)}
  </span>
}

// ─── Section A: Capital Allocation ───────────────────────────────────────────

function CapitalAllocationSection({ canonicalName }: { canonicalName: string }) {
  const [rows, setRows]       = useState<PartnerCapitalAllocation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [open, setOpen]       = useState(true)

  useEffect(() => {
    setLoading(true); setError(null)
    getPartnerCapitalAllocation(canonicalName)
      .then(setRows)
      .catch(e => setError(e?.message ?? String(e)))
      .finally(() => setLoading(false))
  }, [canonicalName])

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      {/* Header */}
      <button
        className="w-full flex items-center justify-between px-5 py-3.5 bg-gray-50 hover:bg-gray-100 transition-colors"
        onClick={() => setOpen(v => !v)}
      >
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-indigo-500" />
          <span className="text-sm font-semibold text-gray-700">
            Partner Capital Allocation
          </span>
          <span className="text-xs text-gray-400 font-normal ml-1">
            (v_partnership_partner_capital_allocation — preview only)
          </span>
        </div>
        {open ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
      </button>

      {open && (
        <div className="p-5">
          {loading && <p className="text-sm text-gray-400">Loading…</p>}
          {error   && (
            <div className="flex items-center gap-2 text-red-600 text-sm">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              {error}
            </div>
          )}
          {!loading && !error && rows.length === 0 && (
            <p className="text-sm text-gray-400 italic">No capital records found. Add data in the Capital Tracker above.</p>
          )}
          {!loading && !error && rows.length > 0 && rows.map(row => (
            <div key={row.partner_name} className="mb-6 last:mb-0">
              <div className="flex items-baseline gap-2 mb-3">
                <span className="text-sm font-semibold text-gray-800">{row.partner_name}</span>
                <span className="text-xs text-gray-400">{pct(row.ownership_percent)} ownership</span>
              </div>

              {/* Payment allocation grid */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-3">
                <div className="bg-white border border-gray-100 rounded-lg p-3">
                  <p className="text-xs text-gray-500 mb-1">Original Cost Share</p>
                  <p className="text-sm font-semibold text-gray-800">{eur(row.original_cost_share)}</p>
                  <p className="text-xs text-gray-400 mt-0.5">JJ cost × {pct(row.ownership_percent)}</p>
                </div>
                <div className="bg-white border border-gray-100 rounded-lg p-3">
                  <p className="text-xs text-gray-500 mb-1">Entry Premium to JJ</p>
                  <p className="text-sm font-semibold text-indigo-700">{eur(row.partner_premium_to_jj)}</p>
                  <p className="text-xs text-gray-400 mt-0.5">Entry val surplus × {pct(row.ownership_percent)}</p>
                </div>
                <div className="bg-white border border-gray-100 rounded-lg p-3">
                  <p className="text-xs text-gray-500 mb-1">Total Required</p>
                  <p className="text-sm font-semibold text-gray-800">{eur(row.total_required_from_partner)}</p>
                  <p className="text-xs text-gray-400 mt-0.5">Entry val × {pct(row.ownership_percent)}</p>
                </div>
              </div>

              {/* Payment status bar */}
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Actual Payments</p>
                    <p className="text-sm font-semibold text-gray-800">{eur(row.actual_partner_payments)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Capital Covered</p>
                    <p className="text-sm font-semibold text-gray-700">{eur(row.capital_covered)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Premium Covered</p>
                    <p className="text-sm font-semibold text-gray-700">{eur(row.premium_covered)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Overpaid Credit</p>
                    <StatusBadge value={row.overpaid_credit} zero="neutral" />
                  </div>
                </div>

                {/* Outstanding */}
                {row.total_remaining_due > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-200 flex items-center gap-4">
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5">Remaining Capital Due</p>
                      <StatusBadge value={row.remaining_capital_due} />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5">Remaining Premium Due</p>
                      <StatusBadge value={row.remaining_premium_due} />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5">Total Outstanding</p>
                      <StatusBadge value={row.total_remaining_due} />
                    </div>
                  </div>
                )}
                {row.total_remaining_due === 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded">
                      ✓ Fully paid — no outstanding balance
                    </span>
                  </div>
                )}
              </div>

              {row.notes && (
                <p className="text-xs text-gray-400 mt-2 italic">{row.notes}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Section B: Expense Markup Allocation ────────────────────────────────────

function ExpenseMarkupSection({ canonicalName }: { canonicalName: string }) {
  const [rows, setRows]       = useState<PartnershipExpenseMarkup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [open, setOpen]       = useState(false)   // collapsed by default (can be many rows)

  useEffect(() => {
    setLoading(true); setError(null)
    getPartnershipExpenseMarkup(canonicalName, 50)
      .then(setRows)
      .catch(e => setError(e?.message ?? String(e)))
      .finally(() => setLoading(false))
  }, [canonicalName])

  // Summary totals
  const totals = rows.reduce(
    (acc, r) => ({
      real: acc.real + r.real_amount,
      market: acc.market + r.client_charge_market_price,
      partnerCharge: acc.partnerCharge + r.external_partner_charge,
      jjCost: acc.jjCost + r.jj_actual_cost_balance,
      jjMarkup: acc.jjMarkup + r.jj_markup_profit_component,
    }),
    { real: 0, market: 0, partnerCharge: 0, jjCost: 0, jjMarkup: 0 }
  )

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      {/* Header */}
      <button
        className="w-full flex items-center justify-between px-5 py-3.5 bg-gray-50 hover:bg-gray-100 transition-colors"
        onClick={() => setOpen(v => !v)}
      >
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-violet-500" />
          <span className="text-sm font-semibold text-gray-700">
            Expense Markup Allocation
          </span>
          <span className="text-xs text-gray-400 font-normal ml-1">
            (v_partnership_expense_markup_allocation — preview only)
          </span>
          {!loading && rows.length > 0 && (
            <span className="text-xs bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded font-medium">
              {rows.length} rows
            </span>
          )}
        </div>
        {open ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
      </button>

      {open && (
        <div className="p-5">
          {loading && <p className="text-sm text-gray-400">Loading…</p>}
          {error   && (
            <div className="flex items-center gap-2 text-red-600 text-sm">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              {error}
            </div>
          )}
          {!loading && !error && rows.length === 0 && (
            <p className="text-sm text-gray-400 italic">
              No expense markup rows found for this property.
              Rows appear when transactions have client_charge &gt; 0 and this property has capital records.
            </p>
          )}
          {!loading && !error && rows.length > 0 && (
            <>
              {/* Summary totals */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
                <div className="bg-white border border-gray-100 rounded-lg p-3">
                  <p className="text-xs text-gray-500 mb-1">JJ Real Cost</p>
                  <p className="text-sm font-semibold text-gray-800">{eur(totals.real)}</p>
                </div>
                <div className="bg-white border border-gray-100 rounded-lg p-3">
                  <p className="text-xs text-gray-500 mb-1">Market / Client Price</p>
                  <p className="text-sm font-semibold text-gray-800">{eur(totals.market)}</p>
                </div>
                <div className="bg-white border border-gray-100 rounded-lg p-3">
                  <p className="text-xs text-gray-500 mb-1">Partner Charge</p>
                  <p className="text-sm font-semibold text-gray-800">{eur(totals.partnerCharge)}</p>
                </div>
                <div className="bg-white border border-gray-100 rounded-lg p-3">
                  <p className="text-xs text-gray-500 mb-1">JJ Net Cost</p>
                  <p className="text-sm font-semibold text-gray-800">{eur(totals.jjCost)}</p>
                </div>
                <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
                  <p className="text-xs text-indigo-600 mb-1">JJ Markup Profit</p>
                  <p className="text-sm font-semibold text-indigo-700">{eur(totals.jjMarkup)}</p>
                </div>
              </div>

              {/* Transaction table */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-200 text-gray-500">
                      <th className="text-left pb-2 pr-3 font-medium">Date</th>
                      <th className="text-left pb-2 pr-3 font-medium">Partner</th>
                      <th className="text-left pb-2 pr-3 font-medium">Category</th>
                      <th className="text-left pb-2 pr-3 font-medium">Description</th>
                      <th className="text-right pb-2 pr-3 font-medium">Real Cost</th>
                      <th className="text-right pb-2 pr-3 font-medium">Market</th>
                      <th className="text-right pb-2 pr-3 font-medium">Partner %</th>
                      <th className="text-right pb-2 pr-3 font-medium">Partner Charge</th>
                      <th className="text-right pb-2 pr-3 font-medium">JJ Cost</th>
                      <th className="text-right pb-2 font-medium text-indigo-600">JJ Markup</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {rows.map((r, i) => (
                      <tr key={`${r.transaction_id}-${r.partner_name}-${i}`} className="hover:bg-gray-50">
                        <td className="py-1.5 pr-3 text-gray-500 whitespace-nowrap">{r.date}</td>
                        <td className="py-1.5 pr-3 text-gray-700 font-medium">{r.partner_name}</td>
                        <td className="py-1.5 pr-3 text-gray-500">{r.subcategory || r.category}</td>
                        <td className="py-1.5 pr-3 text-gray-600 max-w-xs truncate">{r.description ?? '—'}</td>
                        <td className="py-1.5 pr-3 text-right text-gray-700">{eur(r.real_amount)}</td>
                        <td className="py-1.5 pr-3 text-right text-gray-700">{eur(r.client_charge_market_price)}</td>
                        <td className="py-1.5 pr-3 text-right text-gray-500">{pct(r.partner_ownership_percent)}</td>
                        <td className="py-1.5 pr-3 text-right text-gray-700">{eur(r.external_partner_charge)}</td>
                        <td className="py-1.5 pr-3 text-right text-gray-700">{eur(r.jj_actual_cost_balance)}</td>
                        <td className={`py-1.5 text-right font-medium ${r.jj_markup_profit_component >= 0 ? 'text-indigo-700' : 'text-red-600'}`}>
                          {eur(r.jj_markup_profit_component)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.length === 50 && (
                <p className="text-xs text-gray-400 mt-2">Showing most recent 50 rows.</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Section C: JJ Internal Settlement (Rule 2) ──────────────────────────────

function JJInternalSettlementSection({ canonicalName }: { canonicalName: string }) {
  const [row, setRow]         = useState<JJInternalSettlement | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [open, setOpen]       = useState(true)

  useEffect(() => {
    setLoading(true); setError(null)
    getJJInternalSettlement(canonicalName)
      .then(setRow)
      .catch(e => setError(e?.message ?? String(e)))
      .finally(() => setLoading(false))
  }, [canonicalName])

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-5 py-3.5 bg-gray-50 hover:bg-gray-100 transition-colors"
        onClick={() => setOpen(v => !v)}
      >
        <div className="flex items-center gap-2">
          <Scale className="h-4 w-4 text-amber-500" />
          <span className="text-sm font-semibold text-gray-700">JJ Internal Settlement</span>
          <span className="text-xs text-gray-400 font-normal ml-1">
            (v_jj_internal_partnership_settlement — Yossi / Jacob 50/50)
          </span>
        </div>
        {open ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
      </button>

      {open && (
        <div className="p-5">
          {loading && <p className="text-sm text-gray-400">Loading…</p>}
          {error   && (
            <div className="flex items-center gap-2 text-red-600 text-sm">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />{error}
            </div>
          )}
          {!loading && !error && !row && (
            <p className="text-sm text-gray-400 italic">No JJ-side payment transactions found for this property.</p>
          )}
          {!loading && !error && row && (
            <>
              {/* JJ total as single unit (Rule 1) */}
              <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-100">
                <p className="text-xs text-gray-500 mb-1 font-medium">JJ Total Invested (external view — single economic unit)</p>
                <p className="text-lg font-bold text-gray-800">{eur(row.total_jj_invested)}</p>
                <p className="text-xs text-gray-400 mt-0.5">Expected per partner (50/50): {eur(row.expected_per_partner)}</p>
              </div>

              {/* Individual breakdown (Rule 2) */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-white border border-gray-100 rounded-lg p-3">
                  <p className="text-xs text-gray-500 mb-1">Yossi Paid Directly</p>
                  <p className="text-sm font-semibold text-gray-800">{eur(row.yossi_paid)}</p>
                </div>
                <div className="bg-white border border-gray-100 rounded-lg p-3">
                  <p className="text-xs text-gray-500 mb-1">Jacob Paid Directly</p>
                  <p className="text-sm font-semibold text-gray-800">{eur(row.jacob_paid)}</p>
                </div>
                <div className="bg-white border border-gray-100 rounded-lg p-3">
                  <p className="text-xs text-gray-500 mb-1">JJ Company Paid</p>
                  <p className="text-sm font-semibold text-gray-800">{eur(row.jj_company_paid)}</p>
                  <p className="text-xs text-gray-400 mt-0.5">Split 50/50 internally</p>
                </div>
              </div>

              {/* Effective positions */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className={`rounded-lg p-3 border ${row.yossi_balance >= 0 ? 'bg-blue-50 border-blue-200' : 'bg-amber-50 border-amber-200'}`}>
                  <p className="text-xs text-gray-600 mb-1 font-medium">Yossi Effective</p>
                  <p className="text-sm font-bold text-gray-800">{eur(row.yossi_effective)}</p>
                  <p className={`text-xs mt-1 font-medium ${row.yossi_balance >= 0 ? 'text-blue-700' : 'text-amber-700'}`}>
                    {row.yossi_balance >= 0
                      ? `Overpaid ${eur(row.yossi_balance)}`
                      : `Underpaid ${eur(Math.abs(row.yossi_balance))}`}
                  </p>
                </div>
                <div className={`rounded-lg p-3 border ${row.jacob_balance >= 0 ? 'bg-blue-50 border-blue-200' : 'bg-amber-50 border-amber-200'}`}>
                  <p className="text-xs text-gray-600 mb-1 font-medium">Jacob Effective</p>
                  <p className="text-sm font-bold text-gray-800">{eur(row.jacob_effective)}</p>
                  <p className={`text-xs mt-1 font-medium ${row.jacob_balance >= 0 ? 'text-blue-700' : 'text-amber-700'}`}>
                    {row.jacob_balance >= 0
                      ? `Overpaid ${eur(row.jacob_balance)}`
                      : `Underpaid ${eur(Math.abs(row.jacob_balance))}`}
                  </p>
                </div>
              </div>

              {/* Settlement verdict */}
              <div className={`rounded-lg px-4 py-3 border flex items-center justify-between
                ${row.settlement_direction === 'Settled'
                  ? 'bg-green-50 border-green-200'
                  : 'bg-amber-50 border-amber-200'}`}>
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">Internal Settlement</p>
                  <p className={`text-sm font-bold ${row.settlement_direction === 'Settled' ? 'text-green-700' : 'text-amber-800'}`}>
                    {row.settlement_direction}
                  </p>
                </div>
                {row.settlement_direction !== 'Settled' && (
                  <p className="text-lg font-bold text-amber-800">{eur(row.settlement_amount)}</p>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Section D: JJ Net Position (Rules 3 + 5) ────────────────────────────────

function JJNetPositionSection({ canonicalName }: { canonicalName: string }) {
  const [row, setRow]         = useState<JJPropertyNetPosition | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [open, setOpen]       = useState(true)

  useEffect(() => {
    setLoading(true); setError(null)
    getJJPropertyNetPosition(canonicalName)
      .then(setRow)
      .catch(e => setError(e?.message ?? String(e)))
      .finally(() => setLoading(false))
  }, [canonicalName])

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-5 py-3.5 bg-gray-50 hover:bg-gray-100 transition-colors"
        onClick={() => setOpen(v => !v)}
      >
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-emerald-500" />
          <span className="text-sm font-semibold text-gray-700">JJ Net Position</span>
          <span className="text-xs text-gray-400 font-normal ml-1">
            (v_jj_property_net_position — Capital − Premium − Credits − Markups)
          </span>
        </div>
        {open ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
      </button>

      {open && (
        <div className="p-5">
          {loading && <p className="text-sm text-gray-400">Loading…</p>}
          {error   && (
            <div className="flex items-center gap-2 text-red-600 text-sm">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />{error}
            </div>
          )}
          {!loading && !error && !row && (
            <p className="text-sm text-gray-400 italic">No data found. Ensure Capital Tracker is populated for this property.</p>
          )}
          {!loading && !error && row && (
            <>
              {/* Formula waterfall */}
              <div className="space-y-2 mb-4">
                {/* Capital invested */}
                <div className="flex items-center justify-between bg-white border border-gray-100 rounded-lg px-4 py-2.5">
                  <div>
                    <p className="text-xs text-gray-500">JJ Capital Invested</p>
                    <p className="text-xs text-gray-400">Yossi {eur(row.yossi_paid)} + Jacob {eur(row.jacob_paid)} + JJ {eur(row.jj_company_paid)}</p>
                  </div>
                  <p className="text-sm font-semibold text-gray-800">+ {eur(row.total_jj_invested)}</p>
                </div>

                {/* Partner premium */}
                <div className="flex items-center justify-between bg-indigo-50 border border-indigo-100 rounded-lg px-4 py-2.5">
                  <div>
                    <p className="text-xs text-indigo-700">Partner Premium To JJ</p>
                    <p className="text-xs text-indigo-400">Entry val surplus × ownership% — real JJ profit</p>
                  </div>
                  <p className="text-sm font-semibold text-indigo-700">− {eur(row.total_partner_premium_to_jj)}</p>
                </div>

                {/* Partner overpaid credits */}
                <div className="flex items-center justify-between bg-white border border-gray-100 rounded-lg px-4 py-2.5">
                  <div>
                    <p className="text-xs text-gray-500">Partner Overpaid Credits</p>
                    <p className="text-xs text-gray-400">Amount paid beyond required — JJ holds on behalf of partner</p>
                  </div>
                  <p className={`text-sm font-semibold ${row.total_partner_overpaid_credits > 0 ? 'text-gray-700' : 'text-gray-400'}`}>
                    − {eur(row.total_partner_overpaid_credits)}
                  </p>
                </div>

                {/* Markup charges — shown as total deduction, split below */}
                <div className="flex items-center justify-between bg-violet-50 border border-violet-100 rounded-lg px-4 py-2.5">
                  <div>
                    <p className="text-xs text-violet-700">Partner Share of Charged Markups</p>
                    <p className="text-xs text-violet-400">client_charge × ownership% — full amount billed to partner</p>
                  </div>
                  <p className="text-sm font-semibold text-violet-700">− {eur(row.total_partner_charged_markups)}</p>
                </div>

                {/* Cost recovery / markup profit split (reporting only) */}
                {row.total_partner_charged_markups > 0 && (
                  <div className="ml-4 grid grid-cols-2 gap-2">
                    <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                      <div>
                        <p className="text-xs text-gray-600 font-medium">↳ Partner Cost Recovery</p>
                        <p className="text-xs text-gray-400">amount_eur × ownership%</p>
                      </div>
                      <p className="text-xs font-semibold text-gray-700">{eur(row.total_partner_cost_recovery)}</p>
                    </div>
                    <div className="flex items-center justify-between bg-violet-50 border border-violet-200 rounded-lg px-3 py-2">
                      <div>
                        <p className="text-xs text-violet-700 font-medium">↳ Partner Markup Profit</p>
                        <p className="text-xs text-violet-400">(client_charge − cost) × ownership%</p>
                      </div>
                      <p className="text-xs font-semibold text-violet-700">{eur(row.total_jj_markup_profit)}</p>
                    </div>
                  </div>
                )}

                {/* Divider */}
                <div className="border-t border-gray-200 pt-2">
                  <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
                    <div>
                      <p className="text-xs text-emerald-700 font-semibold uppercase tracking-wide">JJ Net Position</p>
                      <p className="text-xs text-emerald-500">Capital − Premium − Credits − Markups</p>
                    </div>
                    <p className="text-xl font-bold text-emerald-700">{eur(row.jj_net_position)}</p>
                  </div>
                </div>
              </div>

              {/* Supporting details */}
              <div className="grid grid-cols-3 gap-3 mt-3">
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500 mb-1">Partner Payments Received</p>
                  <p className="text-sm font-semibold text-gray-700">{eur(row.total_partner_payments_received)}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500 mb-1">Partner Cost Recovery</p>
                  <p className="text-sm font-semibold text-gray-700">{eur(row.total_partner_cost_recovery)}</p>
                  <p className="text-xs text-gray-400 mt-0.5">JJ real costs passed through</p>
                </div>
                <div className="bg-violet-50 rounded-lg p-3">
                  <p className="text-xs text-violet-600 mb-1">Partner Markup Profit</p>
                  <p className="text-sm font-semibold text-violet-700">{eur(row.total_jj_markup_profit)}</p>
                  <p className="text-xs text-violet-400 mt-0.5">True profit on markups</p>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

interface PartnershipAllocationPanelProps {
  canonicalName: string
}

export default function PartnershipAllocationPanel({ canonicalName }: PartnershipAllocationPanelProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      {/* Panel header */}
      <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-indigo-500" />
        <h2 className="text-sm font-semibold text-gray-800">Partnership Allocation Preview</h2>
        <span className="text-xs text-gray-400 font-normal">— read-only reporting view</span>
      </div>

      <div className="p-5 space-y-4">
        <CapitalAllocationSection       canonicalName={canonicalName} />
        <ExpenseMarkupSection           canonicalName={canonicalName} />
        <JJInternalSettlementSection    canonicalName={canonicalName} />
        <JJNetPositionSection           canonicalName={canonicalName} />
      </div>
    </div>
  )
}
