'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { RefreshCw, TrendingUp, TrendingDown, DollarSign, Percent } from 'lucide-react'

const EUR = (n: number) =>
  new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
const PCT = (n: number) =>
  new Intl.NumberFormat('en-IE', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n / 100)
const num = (v: any) => Number(v) || 0

type OwnershipRow = {
  property_name: string
  owner_name: string
  owner_type: string
  ownership_pct: number
  investment_share: number
  sale_share: number
  renovation_profit_share: number
  management_profit_share: number
  airbnb_profit_share: number
  property_status: string | null
  transaction_count: number
}

export default function InvestorPage() {
  const [rows, setRows]     = useState<OwnershipRow[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('v_ownership_summary')
      .select('*')
      .in('owner_type', ['investor', 'external'])
      .order('owner_name')
    setRows((data ?? []) as OwnershipRow[])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const investors = Array.from(new Set(rows.map(r => r.owner_name)))

  function getInvestorStats(investor: string) {
    const investorRows = rows.filter(r => r.owner_name === investor)
    const totalInvested = investorRows.reduce((s, r) => s + num(r.investment_share), 0)
    const totalSale     = investorRows.reduce((s, r) => s + num(r.sale_share), 0)
    const totalReno     = investorRows.reduce((s, r) => s + num(r.renovation_profit_share), 0)
    const totalMgmt     = investorRows.reduce((s, r) => s + num(r.management_profit_share), 0)
    const totalAirbnb   = investorRows.reduce((s, r) => s + num(r.airbnb_profit_share), 0)
    const operatingProfit = totalReno + totalMgmt + totalAirbnb
    const dealProfit    = totalSale - totalInvested
    const totalProfit   = operatingProfit + dealProfit
    const roi           = totalInvested > 0 ? (totalProfit / totalInvested) * 100 : 0
    const avgOwnership  = investorRows.length > 0 ? investorRows.reduce((s, r) => s + num(r.ownership_pct), 0) / investorRows.length : 0
    return { totalInvested, totalSale, operatingProfit, dealProfit, totalProfit, roi, avgOwnership, rows: investorRows }
  }

  if (!loading && investors.length === 0) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Investor Dashboard</h1>
        <div className="card p-12 text-center">
          <DollarSign size={40} className="text-gray-300 mx-auto mb-3" />
          <div className="text-gray-500 font-medium">No external investors found</div>
          <div className="text-sm text-gray-400 mt-2">
            Add investors in the Ownership table with type = 'investor'.<br />
            Currently only JJ partners (Yossi + Jacob) are configured.
          </div>
          <div className="mt-4 p-3 bg-blue-50 rounded-lg text-left text-xs text-blue-700 inline-block">
            <strong>Example:</strong> Villa Mazotos — Avi has 50% ownership and would appear here.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Investor Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">{investors.length} investor{investors.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={load} disabled={loading} className="btn-secondary flex items-center gap-2 text-sm">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* Investor summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {investors.map(inv => {
          const s = getInvestorStats(inv)
          return (
            <button key={inv}
              onClick={() => setSelected(selected === inv ? null : inv)}
              className={`card p-5 text-left hover:shadow-md transition-all ${selected === inv ? 'ring-2 ring-brand-500' : ''}`}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="text-xl font-bold text-gray-900">{inv}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{s.rows.length} properties · avg {s.avgOwnership.toFixed(0)}%</div>
                </div>
                <div className={`text-sm font-bold px-2 py-1 rounded ${s.roi >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  ROI {s.roi >= 0 ? '+' : ''}{s.roi.toFixed(1)}%
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <div className="text-gray-400">Invested</div>
                  <div className="font-semibold text-gray-900">{EUR(s.totalInvested)}</div>
                </div>
                <div>
                  <div className="text-gray-400">Sale Received</div>
                  <div className="font-semibold text-green-600">{EUR(s.totalSale)}</div>
                </div>
                <div>
                  <div className="text-gray-400">Operating Profit</div>
                  <div className={`font-semibold ${s.operatingProfit >= 0 ? 'text-green-600' : 'text-red-500'}`}>{EUR(s.operatingProfit)}</div>
                </div>
                <div>
                  <div className="text-gray-400">Total Profit</div>
                  <div className={`font-bold ${s.totalProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{EUR(s.totalProfit)}</div>
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Property breakdown */}
      {investors.filter(inv => !selected || inv === selected).map(inv => {
        const s = getInvestorStats(inv)
        return (
          <div key={inv} className="card overflow-hidden mb-6">
            <div className="px-5 py-4 bg-gray-50 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <div className="font-bold text-gray-900 text-lg">{inv} — Property Breakdown</div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-gray-500">Total Invested: <strong>{EUR(s.totalInvested)}</strong></span>
                  <span className={`font-bold ${s.totalProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {s.totalProfit >= 0 ? <TrendingUp size={14} className="inline mr-1" /> : <TrendingDown size={14} className="inline mr-1" />}
                    Profit: {EUR(s.totalProfit)}
                  </span>
                </div>
              </div>
            </div>
            <table className="w-full text-sm">
              <thead className="border-b border-gray-100">
                <tr className="text-xs text-gray-500 uppercase">
                  <th className="text-left px-5 py-3">Property</th>
                  <th className="text-center px-4 py-3">Ownership</th>
                  <th className="text-right px-4 py-3">Invested</th>
                  <th className="text-right px-4 py-3">Sale Rec.</th>
                  <th className="text-right px-4 py-3">Reno Profit</th>
                  <th className="text-right px-4 py-3">Mgmt Profit</th>
                  <th className="text-right px-4 py-3">Airbnb Profit</th>
                  <th className="text-right px-4 py-3">Total Profit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {s.rows.map(r => {
                  const profit = num(r.renovation_profit_share) + num(r.management_profit_share) + num(r.airbnb_profit_share)
                  return (
                    <tr key={r.property_name} className="hover:bg-gray-50">
                      <td className="px-5 py-3">
                        <div className="font-medium text-gray-900">{r.property_name}</div>
                        {r.property_status && <div className="text-xs text-gray-400">{r.property_status}</div>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="badge bg-purple-100 text-purple-700">{num(r.ownership_pct)}%</span>
                      </td>
                      <td className="px-4 py-3 text-right">{EUR(num(r.investment_share))}</td>
                      <td className="px-4 py-3 text-right text-green-600">{num(r.sale_share) > 0 ? EUR(num(r.sale_share)) : '—'}</td>
                      <td className={`px-4 py-3 text-right ${num(r.renovation_profit_share) >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                        {num(r.renovation_profit_share) !== 0 ? EUR(num(r.renovation_profit_share)) : '—'}
                      </td>
                      <td className={`px-4 py-3 text-right ${num(r.management_profit_share) >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                        {num(r.management_profit_share) !== 0 ? EUR(num(r.management_profit_share)) : '—'}
                      </td>
                      <td className={`px-4 py-3 text-right ${num(r.airbnb_profit_share) >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                        {num(r.airbnb_profit_share) !== 0 ? EUR(num(r.airbnb_profit_share)) : '—'}
                      </td>
                      <td className={`px-4 py-3 text-right font-bold ${profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {EUR(profit)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot className="bg-gray-50 border-t border-gray-200">
                <tr className="font-bold">
                  <td colSpan={2} className="px-5 py-3 text-gray-700">Total</td>
                  <td className="px-4 py-3 text-right">{EUR(s.totalInvested)}</td>
                  <td className="px-4 py-3 text-right text-green-600">{EUR(s.totalSale)}</td>
                  <td className={`px-4 py-3 text-right ${s.rows.reduce((a, r) => a + num(r.renovation_profit_share), 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {EUR(s.rows.reduce((a, r) => a + num(r.renovation_profit_share), 0))}
                  </td>
                  <td className={`px-4 py-3 text-right ${s.operatingProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{EUR(s.operatingProfit)}</td>
                  <td className="px-4 py-3 text-right">—</td>
                  <td className={`px-4 py-3 text-right text-lg ${s.totalProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{EUR(s.totalProfit)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )
      })}
    </div>
  )
}
