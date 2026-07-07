'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { RefreshCw, ArrowRight, CheckCircle, ChevronDown, ChevronUp } from 'lucide-react'

const n = (v: unknown): number => { const f = parseFloat(String(v ?? 0)); return isNaN(f) ? 0 : f }
const EUR = (v: unknown): string =>
  new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n(v))

type SettlementVerification = {
  yossi_cashbox_balance:       number | string
  jacob_cashbox_balance:       number | string
  jj_cashbox_total:            number | string
  jj_cashbox_per_partner:      number | string
  yossi_net_position:          number | string
  jacob_net_position:          number | string
  settlement_amount:           number | string
  transfer_direction:          string
  anastasia_pending_jj_asset:  number | string
  anastasia_asset_per_partner: number | string
  due_to_owners_total:         number | string
  total_receivables:           number | string
}

type AnastasiaClearing = {
  cash_collected:       number | string
  cash_transfers_in:    number | string
  cash_transferred_out: number | string
  expenses_paid:        number | string
  fabi_salary_paid:     number | string
  salary_received:      number | string
  cash_on_hand:         number | string
  anastasia_owes_jj:    number | string
  jj_owes_anastasia:    number | string
  tx_as_payer:          number | string
  tx_as_payee:          number | string
}

export default function SettlementPage() {
  const [s, setS]               = useState<SettlementVerification | null>(null)
  const [a, setA]               = useState<AnastasiaClearing | null>(null)
  const [loading, setLoading]   = useState(true)
  const [showCalc, setShowCalc] = useState(false)

  async function load() {
    setLoading(true)
    const [sr, ar] = await Promise.all([
      supabase.from('v_settlement_verification').select('*').single(),
      supabase.from('v_anastasia_clearing').select('*').single(),
    ])
    if (sr.data) setS(sr.data as SettlementVerification)
    if (ar.data) setA(ar.data as AnastasiaClearing)
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const amount    = n(s?.settlement_amount)
  // DB returns 'Jacob pays Yossi' (Title Case, spaces). Normalize to snake_case before comparing.
  // 'Jacob pays Yossi' → .toLowerCase() → 'jacob pays yossi' → .replace(/\s+/g,'_') → 'jacob_pays_yossi'
  const _normDir  = String(s?.transfer_direction ?? '').toLowerCase().replace(/\s+/g, '_').trim()
  const dir       = _normDir === 'jacob_pays_yossi' ? 'jacob_pays_yossi'
                  : _normDir === 'yossi_pays_jacob'  ? 'yossi_pays_jacob'
                  : amount === 0                      ? 'balanced'
                  : n(s?.yossi_net_position) < n(s?.jacob_net_position)
                    ? 'jacob_pays_yossi'
                    : 'yossi_pays_jacob'
  const yossiPos  = n(s?.yossi_net_position)
  const jacobPos  = n(s?.jacob_net_position)
  const diff      = Math.abs(yossiPos - jacobPos)

  const totalIn       = n(a?.cash_collected) + n(a?.cash_transfers_in)
  const totalOut      = n(a?.cash_transferred_out) + n(a?.expenses_paid)
  const anastasiaOwes = n(a?.anastasia_owes_jj)
  const jjOwes        = n(a?.jj_owes_anastasia)

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Settlement Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">Full partner accounting — based on all real transactions</p>
        </div>
        <button onClick={load} disabled={loading} className="btn-secondary flex items-center gap-2 text-sm">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* ── SETTLEMENT RESULT ── */}
      <div className="card p-6 mb-6">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-4">Settlement Recommendation</div>

        {dir === 'balanced' ? (
          <div className="flex items-center gap-2 text-green-600">
            <CheckCircle size={18} />
            <span className="font-semibold">Partners are balanced — no transfer needed</span>
          </div>
        ) : (
          <div className="flex items-center gap-6 p-5 bg-orange-50 border border-orange-200 rounded-xl">
            <div className="flex items-center gap-3 flex-1">
              <span className="text-xl font-bold text-gray-900">
                {dir === 'jacob_pays_yossi' ? 'Jacob' : 'Yossi'}
              </span>
              <ArrowRight size={22} className="text-orange-500" />
              <span className="text-xl font-bold text-gray-900">
                {dir === 'jacob_pays_yossi' ? 'Yossi' : 'Jacob'}
              </span>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold text-orange-600">{EUR(amount)}</div>
              <div className="text-xs text-gray-500 mt-0.5">to equalize total positions</div>
            </div>
          </div>
        )}

        <div className="mt-4 pt-4 border-t border-gray-100">
          <button
            onClick={() => setShowCalc(!showCalc)}
            className="flex items-center gap-2 text-sm text-brand-500 hover:underline"
          >
            {showCalc ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {showCalc ? 'Hide calculation' : 'View calculation'}
          </button>
        </div>
      </div>

      {/* ── CALCULATION BREAKDOWN ── */}
      {showCalc && (
        <div className="card p-6 mb-6 bg-gray-50">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-4">How This Was Calculated</div>

          <div className="grid grid-cols-3 gap-6">
            {/* Yossi */}
            <div>
              <div className="text-sm font-bold text-blue-700 mb-3 pb-1 border-b border-blue-200">Yossi</div>
              <CalcRow label="Cashbox balance" value={EUR(s?.yossi_cashbox_balance)} plus={n(s?.yossi_cashbox_balance) >= 0} />
              <CalcRow label="+ 50% of JJ"     value={EUR(s?.jj_cashbox_per_partner)} plus />
              <div className="border-t border-gray-300 mt-2 pt-2">
                <CalcRow label="= Net position" value={EUR(yossiPos)} bold plus={yossiPos >= 0} />
              </div>
            </div>

            {/* Jacob */}
            <div>
              <div className="text-sm font-bold text-green-700 mb-3 pb-1 border-b border-green-200">Jacob</div>
              <CalcRow label="Cashbox balance" value={EUR(s?.jacob_cashbox_balance)} plus={n(s?.jacob_cashbox_balance) >= 0} />
              <CalcRow label="+ 50% of JJ"     value={EUR(s?.jj_cashbox_per_partner)} plus />
              <div className="border-t border-gray-300 mt-2 pt-2">
                <CalcRow label="= Net position" value={EUR(jacobPos)} bold plus={jacobPos >= 0} />
              </div>
            </div>

            {/* JJ Company */}
            <div>
              <div className="text-sm font-bold text-purple-700 mb-3 pb-1 border-b border-purple-200">JJ Company</div>
              <CalcRow label="JJ cash balance"  value={EUR(s?.jj_cashbox_total)} plus={n(s?.jj_cashbox_total) >= 0} />
              <CalcRow label="÷ 2 each partner" value={EUR(s?.jj_cashbox_per_partner)} plus />
              <div className="mt-3 text-xs text-gray-400">Owned 50/50 by Yossi &amp; Jacob</div>
            </div>
          </div>

          <div className="mt-5 pt-4 border-t border-gray-200 text-sm text-gray-600">
            <div className="flex gap-4 flex-wrap">
              <span>Yossi position: <strong>{EUR(yossiPos)}</strong></span>
              <span>Jacob position: <strong>{EUR(jacobPos)}</strong></span>
              <span>Difference: <strong>{EUR(diff)}</strong></span>
              <span>Settlement (÷2): <strong className="text-orange-600">{EUR(amount)}</strong></span>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Settlement = half the difference between net positions.
              After transfer, both partners will be at {EUR((yossiPos + jacobPos) / 2)} each.
            </p>
          </div>
        </div>
      )}

      {/* ── ANASTASIA CLEARING ── */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <div className="font-semibold text-gray-900">Anastasia Clearing</div>
          <div className="text-xs text-gray-400 mt-0.5">
            {n(a?.tx_as_payer)} transactions paid &middot; {n(a?.tx_as_payee)} transactions received
          </div>
        </div>

        <div className="grid grid-cols-2 divide-x divide-gray-100">
          {/* Cash In */}
          <div className="p-5">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Cash In</div>
            <div className="space-y-2">
              <FlowRow label="Cash collected (clients / tenants)" value={EUR(a?.cash_collected)}    color="text-green-600" />
              <FlowRow label="Transfers in from JJ"               value={EUR(a?.cash_transfers_in)} color="text-green-600" />
              <FlowRow label="Salary received"                    value={EUR(a?.salary_received)}   color="text-blue-600" />
              <div className="border-t border-gray-200 pt-2 mt-2">
                <FlowRow label="Total In" value={EUR(totalIn)} color="text-gray-900" bold />
              </div>
            </div>
          </div>

          {/* Cash Out */}
          <div className="p-5">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Cash Out</div>
            <div className="space-y-2">
              <FlowRow label="Expenses paid"          value={EUR(a?.expenses_paid)}        color="text-red-600" />
              <FlowRow label="Transferred out to JJ"  value={EUR(a?.cash_transferred_out)} color="text-red-600" />
              <FlowRow label="Fabi salary paid"       value={EUR(a?.fabi_salary_paid)}      color="text-orange-600" />
              <div className="border-t border-gray-200 pt-2 mt-2">
                <FlowRow label="Total Out" value={EUR(totalOut)} color="text-gray-900" bold />
              </div>
            </div>
          </div>
        </div>

        {/* Balance row */}
        <div className="border-t border-gray-100 p-5">
          <div className="grid grid-cols-3 gap-4">
            {/* Cash on Hand */}
            <div className={`p-4 rounded-lg border ${n(a?.cash_on_hand) > 0 ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'}`}>
              <div className="text-xs text-gray-500 mb-1">Cash on Hand</div>
              <div className={`text-2xl font-bold ${n(a?.cash_on_hand) > 0 ? 'text-amber-700' : 'text-green-700'}`}>
                {EUR(a?.cash_on_hand)}
              </div>
              <div className="text-xs text-gray-400 mt-1">Collected · not yet transferred</div>
            </div>

            {/* Anastasia Owes JJ */}
            <div className={`p-4 rounded-lg border ${anastasiaOwes > 0 ? 'bg-orange-50 border-orange-200' : 'bg-gray-50 border-gray-200'}`}>
              <div className="text-xs text-gray-500 mb-1">Anastasia Owes JJ</div>
              <div className={`text-2xl font-bold ${anastasiaOwes > 0 ? 'text-orange-600' : 'text-gray-400'}`}>
                {anastasiaOwes > 0 ? EUR(anastasiaOwes) : '—'}
              </div>
              <div className="text-xs text-gray-400 mt-1">Cash on hand to transfer</div>
            </div>

            {/* JJ Owes Anastasia */}
            <div className={`p-4 rounded-lg border ${jjOwes > 0 ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'}`}>
              <div className="text-xs text-gray-500 mb-1">JJ Owes Anastasia</div>
              <div className={`text-2xl font-bold ${jjOwes > 0 ? 'text-blue-600' : 'text-gray-400'}`}>
                {jjOwes > 0 ? EUR(jjOwes) : '—'}
              </div>
              <div className="text-xs text-gray-400 mt-1">Reimbursement outstanding</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function CalcRow({ label, value, plus, bold }: { label: string; value: string; plus: boolean; bold?: boolean }) {
  return (
    <div className={`flex justify-between text-xs py-0.5 ${bold ? 'font-bold text-sm' : ''}`}>
      <span className="text-gray-500">{label}</span>
      <span className={plus ? 'text-gray-800' : 'text-red-600'}>{value}</span>
    </div>
  )
}

function FlowRow({ label, value, color, bold }: { label: string; value: string; color: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between text-sm ${bold ? 'font-semibold' : ''}`}>
      <span className="text-gray-500">{label}</span>
      <span className={color}>{value}</span>
    </div>
  )
}
