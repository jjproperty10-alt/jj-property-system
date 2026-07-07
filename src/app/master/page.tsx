'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import {
  RefreshCw, TrendingUp, TrendingDown, AlertTriangle, CheckCircle,
  ArrowRightLeft,
} from 'lucide-react'

const n = (v: unknown): number => { const f = parseFloat(String(v ?? 0)); return isNaN(f) ? 0 : f }
const EUR = (v: unknown): string =>
  new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n(v))

export default function MasterDashboard() {
  const [data, setData]       = useState<any>({})
  const [loading, setLoading] = useState(true)
  const [ts, setTs]           = useState('')

  async function load() {
    setLoading(true)
    const [
      cashRes, ceoRes, openRes, issuesRes,
      anastasiaRes, settlRes, dupeRes, contractRes,
    ] = await Promise.all([
      supabase.from('v_cashbox_audit').select('*'),
      supabase.from('v_ceo_summary').select(
        'client_cash_position_profit,jj_own_cash_profit,partnership_jj_cash_profit,' +
        'company_cash_profit,total_cash_position_profit,total_contract_profit,' +
        'cash_contract_gap,total_receivables,due_to_owners,' +
        'anastasia_owes_jj,jj_owes_anastasia'
      ).single(),
      supabase.from('v_open_balances').select('open_amount, priority, balance_type'),
      supabase.from('v_transaction_issues').select('severity', { count: 'exact', head: false }),
      supabase.from('v_anastasia_clearing').select('*').single(),
      supabase.from('v_settlement_verification').select('*').single(),
      supabase.from('v_possible_duplicates').select('id', { count: 'exact', head: true }),
      supabase.from('rental_contracts').select('status, end_date').eq('status', 'active'),
    ])
    setData({
      cash:       cashRes.data      ?? [],
      ceo:        ceoRes.data       ?? {},
      open:       openRes.data      ?? [],
      issues:     issuesRes.data    ?? [],
      anastasia:  anastasiaRes.data ?? {},
      settlement: settlRes.data     ?? {},
      dupeCount:  dupeRes.count     ?? 0,
      contracts:  contractRes.data  ?? [],
    })
    setTs(new Date().toLocaleTimeString('he-IL'))
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  // totalCash = Yossi + Jacob + JJ (v_cashbox_audit) + Anastasia cash_on_hand (v_anastasia_clearing)
  // matches CEO Dashboard "Total Internal Cash" definition
  const totalCash     = (data.cash ?? []).reduce((s: number, c: any) => s + n(c.balance), 0)
                        + n(data.anastasia?.cash_on_hand)
  const issueHigh     = (data.issues ?? []).filter((i: any) => i.severity === 'high').length
  const totalOpenAmt  = (data.open ?? []).reduce((s: number, o: any) => s + n(o.open_amount), 0)
  const anastasiaOwes = n(data.anastasia?.anastasia_owes_jj)
  const settlAmt      = n(data.settlement?.settlement_amount)
  // DB returns 'Jacob pays Yossi' (Title Case, spaces). Normalize to snake_case before comparing.
  // 'Jacob pays Yossi' → .toLowerCase() → 'jacob pays yossi' → .replace(/\s+/g,'_') → 'jacob_pays_yossi'
  const _normDir      = String(data.settlement?.transfer_direction ?? '')
                          .toLowerCase().replace(/\s+/g, '_').trim()
  const settlDir      = _normDir === 'jacob_pays_yossi' ? 'jacob_pays_yossi'
                      : _normDir === 'yossi_pays_jacob'  ? 'yossi_pays_jacob'
                      : settlAmt === 0                   ? 'balanced'
                      : n(data.settlement?.yossi_net_position) < n(data.settlement?.jacob_net_position)
                        ? 'jacob_pays_yossi'
                        : 'yossi_pays_jacob'
  const ceo           = data.ceo ?? {}
  // Due to owners — authoritative source: v_ceo_summary.due_to_owners (correct formula, all categories)
  // NOT v_owner_balances (uses banned COALESCE(client_charge, amount_eur) formula)
  const ownerDueTotal = n(ceo.due_to_owners)

  const today = new Date()
  const expiringContracts = (data.contracts ?? []).filter((c: any) => {
    if (!c.end_date) return false
    const diff = (new Date(c.end_date).getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    return diff >= 0 && diff <= 60
  }).length

  const alerts = [
    issueHigh > 0         && { severity: 'high',   msg: `${issueHigh} data issues (high severity)`,                 href: '/validation'   },
    data.dupeCount > 0    && { severity: 'medium', msg: `${data.dupeCount} possible duplicate transactions`,         href: '/transactions'  },
    ownerDueTotal > 5000  && { severity: 'medium', msg: `${EUR(ownerDueTotal)} due to property owners`,              href: '/management'   },
    anastasiaOwes > 1000  && { severity: 'medium', msg: `Anastasia: ${EUR(anastasiaOwes)} cash on hand to transfer`, href: '/settlement'   },
    expiringContracts > 0 && { severity: 'low',    msg: `${expiringContracts} contract(s) expiring in 60 days`,      href: '/contracts'    },
  ].filter(Boolean) as { severity: string; msg: string; href: string }[]

  const CASH_COLORS: Record<string, string> = {
    Yossi:     'border-blue-400',
    Jacob:     'border-green-400',
    JJ:        'border-purple-400',
    Anastasia: 'border-amber-400',
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Master Control</h1>
          <p className="text-sm text-gray-500 mt-0.5">{ts ? `Last updated: ${ts}` : 'Loading...'}</p>
        </div>
        <button onClick={load} disabled={loading} className="btn-primary flex items-center gap-2 text-sm">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh All
        </button>
      </div>

      {/* ── ALERTS ── */}
      {alerts.length > 0 && (
        <div className="mb-6 space-y-2">
          {alerts.map((a, i) => (
            <Link key={i} href={a.href}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-lg border text-sm hover:opacity-90 transition-opacity ${
                a.severity === 'high'
                  ? 'bg-red-50 border-red-200 text-red-700'
                  : a.severity === 'medium'
                  ? 'bg-orange-50 border-orange-200 text-orange-700'
                  : 'bg-yellow-50 border-yellow-200 text-yellow-700'
              }`}>
              <AlertTriangle size={14} />
              <span>{a.msg}</span>
              <span className="ml-auto opacity-60">→ View</span>
            </Link>
          ))}
        </div>
      )}
      {!loading && alerts.length === 0 && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm mb-6">
          <CheckCircle size={14} /> All systems healthy — no alerts
        </div>
      )}

      {/* ── CASH POSITIONS ── */}
      <section className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">💰 Cash Positions</h2>
          <Link href="/settlement" className="text-xs text-brand-500 hover:underline">Settlement →</Link>
        </div>
        <div className="grid grid-cols-5 gap-3">
          {(data.cash ?? []).map((c: any) => (
            <div key={c.cash_box_name} className={`card p-4 border-l-4 ${CASH_COLORS[c.cash_box_name] ?? 'border-gray-300'}`}>
              <div className="text-xs text-gray-400 mb-1">{c.cash_box_name}</div>
              <div className={`text-xl font-bold ${n(c.balance) >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
                {EUR(c.balance)}
              </div>
              <div className="text-xs text-gray-400 mt-1">In: {EUR(c.total_received)}</div>
            </div>
          ))}
          <div className="card p-4 bg-gray-900 text-white border-l-4 border-gray-600">
            <div className="text-xs text-gray-400 mb-1">Total Internal Cash</div>
            <div className={`text-xl font-bold ${totalCash >= 0 ? 'text-white' : 'text-red-400'}`}>{EUR(totalCash)}</div>
            <div className="text-xs text-gray-400 mt-1">Yossi + Jacob + JJ + Anastasia</div>
          </div>
        </div>
      </section>

      {/* ── PARTNER SETTLEMENT ── */}
      {settlAmt > 0 && (
        <section className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">🤝 Partner Settlement</h2>
            <Link href="/settlement" className="text-xs text-brand-500 hover:underline">Full View →</Link>
          </div>
          <div className="card p-4 flex items-center gap-6">
            <ArrowRightLeft size={20} className="text-brand-500 shrink-0" />
            <div className="flex-1">
              <div className="text-sm font-medium text-gray-900">
                {settlDir === 'yossi_pays_jacob'
                  ? 'Yossi should pay Jacob'
                  : settlDir === 'jacob_pays_yossi'
                  ? 'Jacob should pay Yossi'
                  : 'Partners are balanced'}
              </div>
              <div className="text-xs text-gray-500 mt-0.5">
                Yossi net: {EUR(data.settlement?.yossi_net_position)} ·
                Jacob net: {EUR(data.settlement?.jacob_net_position)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-gray-400">Settlement Amount</div>
              <div className="text-2xl font-bold text-brand-600">{EUR(settlAmt)}</div>
            </div>
          </div>
        </section>
      )}

      {/* ── REAL PROFIT (v1.0 columns) ── */}
      <section className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">📊 Real Profit (Cash)</h2>
          <Link href="/" className="text-xs text-brand-500 hover:underline">CEO Dashboard →</Link>
        </div>
        <div className="grid grid-cols-5 gap-3">
          {[
            { label: 'Client Props',  val: n(ceo.client_cash_position_profit)    },
            { label: 'JJ Properties', val: n(ceo.jj_own_cash_profit)             },
            { label: 'Partnership',   val: n(ceo.partnership_jj_cash_profit)     },
            { label: 'JJ Company',    val: n(ceo.company_cash_profit)            },
            { label: 'Total',         val: n(ceo.total_cash_position_profit), bold: true },
          ].map(item => (
            <div key={item.label} className={`card p-4 ${(item as any).bold ? 'bg-gray-50' : ''}`}>
              <div className="text-xs text-gray-400 mb-1">{item.label}</div>
              <div className={`text-lg font-bold ${item.val >= 0 ? 'text-green-600' : 'text-red-600'} ${(item as any).bold ? 'text-xl' : ''}`}>
                {item.val >= 0
                  ? <TrendingUp size={13} className="inline mr-1" />
                  : <TrendingDown size={13} className="inline mr-1" />}
                {EUR(item.val)}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── OPEN BALANCES + ANASTASIA ── */}
      <div className="grid grid-cols-2 gap-6 mb-6">
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">⏳ Open Balances</h2>
            <Link href="/open-balances" className="text-xs text-brand-500 hover:underline">View All →</Link>
          </div>
          <div className="card p-5">
            <div className="text-3xl font-bold text-orange-600 mb-2">{EUR(totalOpenAmt)}</div>
            <div className="text-xs text-gray-400 mb-3">{(data.open ?? []).length} open items</div>
            <div className="space-y-2">
              {[
                { type: 'sale_receivable',       label: 'Client Owes — Sale' },
                { type: 'renovation_receivable',  label: 'Client Owes — Reno' },
                { type: 'owner_balance',          label: 'Due to Owners' },
              ].map(row => {
                const amt = (data.open ?? [])
                  .filter((o: any) => o.balance_type === row.type)
                  .reduce((s: number, o: any) => s + n(o.open_amount), 0)
                if (amt === 0) return null
                return (
                  <div key={row.type} className="flex justify-between text-sm">
                    <span className="text-gray-500">{row.label}</span>
                    <span className="font-medium text-orange-600">{EUR(amt)}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        {/* ── ANASTASIA ── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">👤 Anastasia</h2>
            <Link href="/settlement" className="text-xs text-brand-500 hover:underline">Settlement →</Link>
          </div>
          <div className="card p-5 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Cash collected</span>
              <span className="font-medium text-green-600">{EUR(data.anastasia?.cash_collected)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Expenses paid</span>
              <span className="font-medium text-red-600">{EUR(data.anastasia?.expenses_paid)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Salary received</span>
              <span className="font-medium text-blue-600">{EUR(data.anastasia?.salary_received)}</span>
            </div>
            <div className="border-t border-gray-100 pt-3 mt-1 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Cash on hand</span>
                <span className={`font-bold ${n(data.anastasia?.cash_on_hand) > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                  {EUR(data.anastasia?.cash_on_hand)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Anastasia owes JJ</span>
                <span className={`font-bold ${anastasiaOwes > 0 ? 'text-orange-600' : 'text-gray-400'}`}>
                  {anastasiaOwes > 0 ? EUR(anastasiaOwes) : '—'}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">JJ owes Anastasia</span>
                <span className={`font-bold ${n(data.anastasia?.jj_owes_anastasia) > 0 ? 'text-blue-600' : 'text-gray-400'}`}>
                  {n(data.anastasia?.jj_owes_anastasia) > 0 ? EUR(data.anastasia?.jj_owes_anastasia) : '—'}
                </span>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* ── KEY METRICS (v1.0 columns) ── */}
      <section className="mb-6">
        <h2 className="font-semibold text-gray-700 text-sm uppercase tracking-wide mb-3">📈 Key Metrics</h2>
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Total Receivables', val: n(ceo.total_receivables),     href: '/open-balances', color: 'text-orange-600' },
            { label: 'Contract Profit',   val: n(ceo.total_contract_profit), href: '/properties',    color: 'text-blue-600'   },
            { label: 'Due to Owners',     val: n(ceo.due_to_owners),         href: '/management',    color: 'text-purple-600' },
            { label: 'Cash/Contract Gap', val: n(ceo.cash_contract_gap),     href: '/properties',    color: 'text-gray-700'   },
          ].map(m => (
            <Link key={m.label} href={m.href} className="card p-4 hover:shadow-md transition-shadow">
              <div className="text-xs text-gray-400 mb-1">{m.label}</div>
              <div className={`text-xl font-bold ${m.color}`}>{EUR(m.val)}</div>
            </Link>
          ))}
        </div>
      </section>

      {/* ── DATA STATUS ── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">🔍 Data Status</h2>
          <Link href="/validation" className="text-xs text-brand-500 hover:underline">Validation →</Link>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className={`card p-4 ${issueHigh > 0 ? 'bg-red-50 border-red-100' : 'bg-green-50 border-green-100'}`}>
            <div className="flex items-center gap-2">
              {issueHigh > 0
                ? <AlertTriangle size={15} className="text-red-500" />
                : <CheckCircle  size={15} className="text-green-500" />}
              <div className="text-xs text-gray-500">High Issues</div>
            </div>
            <div className={`text-2xl font-bold mt-1 ${issueHigh > 0 ? 'text-red-600' : 'text-green-600'}`}>{issueHigh}</div>
          </div>
          <div className={`card p-4 ${data.dupeCount > 0 ? 'bg-yellow-50 border-yellow-100' : 'bg-green-50 border-green-100'}`}>
            <div className="flex items-center gap-2">
              {data.dupeCount > 0
                ? <AlertTriangle size={15} className="text-yellow-500" />
                : <CheckCircle  size={15} className="text-green-500" />}
              <div className="text-xs text-gray-500">Duplicates</div>
            </div>
            <div className={`text-2xl font-bold mt-1 ${data.dupeCount > 0 ? 'text-yellow-600' : 'text-green-600'}`}>{data.dupeCount}</div>
          </div>
          <div className={`card p-4 ${expiringContracts > 0 ? 'bg-orange-50 border-orange-100' : 'bg-green-50 border-green-100'}`}>
            <div className="flex items-center gap-2">
              {expiringContracts > 0
                ? <AlertTriangle size={15} className="text-orange-500" />
                : <CheckCircle  size={15} className="text-green-500" />}
              <div className="text-xs text-gray-500">Contracts Expiring</div>
            </div>
            <div className={`text-2xl font-bold mt-1 ${expiringContracts > 0 ? 'text-orange-600' : 'text-green-600'}`}>{expiringContracts}</div>
          </div>
        </div>
      </section>
    </div>
  )
}
