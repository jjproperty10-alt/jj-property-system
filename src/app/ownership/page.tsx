'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { RefreshCw, Users, TrendingUp, TrendingDown, PieChart } from 'lucide-react'

const EUR = (n: number) =>
  new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
const n = (v: any) => Number(v) || 0

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

type OwnerSummary = {
  owner: string
  type: string
  totalInvested: number
  totalSaleReceived: number
  totalRenovationProfit: number
  totalManagementProfit: number
  totalAirbnbProfit: number
  totalProfit: number
  propertyCount: number
}

export default function OwnershipPage() {
  const [rows, setRows] = useState<OwnershipRow[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'by-owner' | 'by-property'>('by-owner')
  const [selectedOwner, setSelectedOwner] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('v_ownership_summary').select('*').order('owner_name')
    setRows((data ?? []) as OwnershipRow[])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  // Build owner summaries
  const owners = Array.from(new Set(rows.map(r => r.owner_name)))
  const ownerSummaries: OwnerSummary[] = owners.map(owner => {
    const ownerRows = rows.filter(r => r.owner_name === owner)
    const totalReno = ownerRows.reduce((s, r) => s + n(r.renovation_profit_share), 0)
    const totalMgmt = ownerRows.reduce((s, r) => s + n(r.management_profit_share), 0)
    const totalAirbnb = ownerRows.reduce((s, r) => s + n(r.airbnb_profit_share), 0)
    return {
      owner,
      type: ownerRows[0]?.owner_type ?? 'partner',
      totalInvested: ownerRows.reduce((s, r) => s + n(r.investment_share), 0),
      totalSaleReceived: ownerRows.reduce((s, r) => s + n(r.sale_share), 0),
      totalRenovationProfit: totalReno,
      totalManagementProfit: totalMgmt,
      totalAirbnbProfit: totalAirbnb,
      totalProfit: totalReno + totalMgmt + totalAirbnb,
      propertyCount: new Set(ownerRows.map(r => r.property_name)).size,
    }
  })

  const filteredRows = selectedOwner ? rows.filter(r => r.owner_name === selectedOwner) : rows
  const properties = Array.from(new Set(filteredRows.map(r => r.property_name))).sort()

  const TYPE_COLORS: Record<string, string> = {
    partner:  'bg-blue-100 text-blue-700',
    investor: 'bg-purple-100 text-purple-700',
    jj:       'bg-green-100 text-green-700',
    external: 'bg-orange-100 text-orange-700',
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Ownership Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Profit share by ownership percentage
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            {(['by-owner', 'by-property'] as const).map(v => (
              <button key={v} onClick={() => setView(v)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${view === v ? 'bg-brand-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                {v === 'by-owner' ? 'By Owner' : 'By Property'}
              </button>
            ))}
          </div>
          <button onClick={load} disabled={loading}
            className="btn-secondary flex items-center gap-2 text-sm">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* Owner Summary Cards */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {ownerSummaries.map(o => (
          <button key={o.owner}
            onClick={() => setSelectedOwner(selectedOwner === o.owner ? null : o.owner)}
            className={`card p-5 text-left transition-all hover:shadow-md ${selectedOwner === o.owner ? 'ring-2 ring-brand-500' : ''}`}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="font-bold text-gray-900">{o.owner}</div>
                <span className={`badge text-xs mt-1 ${TYPE_COLORS[o.type] ?? 'bg-gray-100 text-gray-600'}`}>
                  {o.type}
                </span>
              </div>
              <Users size={18} className="text-gray-400" />
            </div>
            <div className="text-xs text-gray-500 mb-1">{o.propertyCount} properties</div>
            <div className="text-xs space-y-1 mt-2 border-t border-gray-100 pt-2">
              <div className="flex justify-between">
                <span className="text-gray-500">Invested</span>
                <span className="font-medium">{EUR(o.totalInvested)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Sale Received</span>
                <span className="font-medium text-green-600">{EUR(o.totalSaleReceived)}</span>
              </div>
              <div className="flex justify-between border-t border-gray-100 pt-1 mt-1">
                <span className="text-gray-700 font-medium">Operating Profit</span>
                <span className={`font-bold ${o.totalProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {EUR(o.totalProfit)}
                </span>
              </div>
            </div>
          </button>
        ))}
      </div>

      {selectedOwner && (
        <div className="mb-4 flex items-center gap-2">
          <span className="text-sm text-gray-500">Filtered by:</span>
          <span className="badge bg-brand-100 text-brand-700">{selectedOwner}</span>
          <button onClick={() => setSelectedOwner(null)} className="text-xs text-gray-400 hover:text-gray-600">✕ Clear</button>
        </div>
      )}

      {/* Property breakdown */}
      {view === 'by-property' && (
        <div className="space-y-3">
          {properties.map(prop => {
            const propRows = filteredRows.filter(r => r.property_name === prop)
            const totalOwnership = propRows.reduce((s, r) => s + n(r.ownership_pct), 0)
            return (
              <div key={prop} className="card p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="font-semibold text-gray-900">{prop}</div>
                  <div className="flex items-center gap-2">
                    {propRows[0]?.property_status && (
                      <span className="badge bg-gray-100 text-gray-600">{propRows[0].property_status}</span>
                    )}
                    <span className="text-xs text-gray-400">{propRows[0]?.transaction_count} tx</span>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-3">
                  {propRows.map(r => (
                    <div key={r.owner_name} className="bg-gray-50 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-sm text-gray-900">{r.owner_name}</span>
                        <span className={`badge text-xs ${TYPE_COLORS[r.owner_type] ?? ''}`}>{r.ownership_pct}%</span>
                      </div>
                      <div className="text-xs space-y-0.5">
                        {n(r.investment_share) > 0 && <div className="flex justify-between"><span className="text-gray-500">Invested</span><span>{EUR(n(r.investment_share))}</span></div>}
                        {n(r.sale_share) > 0 && <div className="flex justify-between"><span className="text-gray-500">Sale</span><span className="text-green-600">{EUR(n(r.sale_share))}</span></div>}
                        {n(r.renovation_profit_share) !== 0 && <div className="flex justify-between"><span className="text-gray-500">Reno</span><span className={n(r.renovation_profit_share) >= 0 ? 'text-green-600' : 'text-red-500'}>{EUR(n(r.renovation_profit_share))}</span></div>}
                        {n(r.management_profit_share) !== 0 && <div className="flex justify-between"><span className="text-gray-500">Mgmt</span><span className={n(r.management_profit_share) >= 0 ? 'text-green-600' : 'text-red-500'}>{EUR(n(r.management_profit_share))}</span></div>}
                        {n(r.airbnb_profit_share) !== 0 && <div className="flex justify-between"><span className="text-gray-500">Airbnb</span><span className={n(r.airbnb_profit_share) >= 0 ? 'text-green-600' : 'text-red-500'}>{EUR(n(r.airbnb_profit_share))}</span></div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* By Owner view */}
      {view === 'by-owner' && (
        <div className="space-y-6">
          {ownerSummaries.filter(o => !selectedOwner || o.owner === selectedOwner).map(o => {
            const ownerRows = rows.filter(r => r.owner_name === o.owner)
            return (
              <div key={o.owner} className="card overflow-hidden">
                <div className="px-5 py-4 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-gray-900">{o.owner}</span>
                    <span className={`badge text-xs ${TYPE_COLORS[o.type] ?? ''}`}>{o.type}</span>
                  </div>
                  <div className="flex items-center gap-6 text-sm">
                    <div className="text-right">
                      <div className="text-xs text-gray-400">Total Invested</div>
                      <div className="font-semibold">{EUR(o.totalInvested)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-gray-400">Operating Profit</div>
                      <div className={`font-bold ${o.totalProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {EUR(o.totalProfit)}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="divide-y divide-gray-50">
                  {ownerRows.filter(r => n(r.investment_share) > 0 || n(r.renovation_profit_share) !== 0 || n(r.management_profit_share) !== 0 || n(r.airbnb_profit_share) !== 0).map(r => {
                    const profit = n(r.renovation_profit_share) + n(r.management_profit_share) + n(r.airbnb_profit_share)
                    return (
                      <div key={r.property_name} className="px-5 py-3 flex items-center gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-900 truncate">{r.property_name}</div>
                          {r.property_status && <span className="text-xs text-gray-400">{r.property_status}</span>}
                        </div>
                        <div className="text-xs text-gray-400 w-12 text-right">{n(r.ownership_pct)}%</div>
                        {n(r.investment_share) > 0 && <div className="text-right w-24"><div className="text-xs text-gray-400">Invested</div><div className="text-sm font-medium">{EUR(n(r.investment_share))}</div></div>}
                        <div className="text-right w-24">
                          <div className="text-xs text-gray-400">Profit</div>
                          <div className={`text-sm font-bold ${profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{EUR(profit)}</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
