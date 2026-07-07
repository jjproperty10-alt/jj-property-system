'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { RefreshCw, TrendingUp, TrendingDown } from 'lucide-react'

const EUR = (n: number) =>
  new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)

type AirbnbRow = {
  property_id: string
  property_name: string
  platform_income: number
  electricity: number
  internet: number
  water: number
  hoa: number
  pool_service: number
  insurance: number
  consumables: number
  cleaning: number
  maintenance: number
  management_fee: number
  paid_to_owner: number
  other_expenses: number
  software: number
  owner_balance_due: number
  transaction_count: number
}

const n = (v: any) => Number(v) || 0

export default function AirbnbPage() {
  const [properties, setProperties] = useState<AirbnbRow[]>([])
  const [loading, setLoading]       = useState(true)
  const [selected, setSelected]     = useState<string | null>(null)

  useEffect(() => {
    supabase.from('v_airbnb_summary').select('*').order('platform_income', { ascending: false })
      .then(({ data }) => {
        setProperties((data ?? []) as AirbnbRow[])
        setLoading(false)
      })
  }, [])

  const totals = {
    income:   properties.reduce((s, p) => s + n(p.platform_income), 0),
    expenses: properties.reduce((s, p) => s + n(p.electricity) + n(p.internet) + n(p.water) + n(p.cleaning) + n(p.consumables) + n(p.maintenance) + n(p.other_expenses) + n(p.software), 0),
    mgmtFees: properties.reduce((s, p) => s + n(p.management_fee), 0),
    ownerDue: properties.reduce((s, p) => s + Math.max(0, n(p.owner_balance_due)), 0),
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Airbnb Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">{properties.length} Airbnb properties</p>
        </div>
        <button onClick={() => { setLoading(true); supabase.from('v_airbnb_summary').select('*').order('platform_income', { ascending: false }).then(({ data }) => { setProperties((data ?? []) as AirbnbRow[]); setLoading(false) }) }}
          disabled={loading} className="btn-secondary flex items-center gap-2 text-sm">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <SumCard label="Total Platform Income" value={EUR(totals.income)} color="text-green-600" />
        <SumCard label="Total Expenses" value={EUR(totals.expenses)} color="text-red-500" />
        <SumCard label="Management Fees" value={EUR(totals.mgmtFees)} color="text-gray-700" />
        <SumCard label="Due to Owners" value={EUR(totals.ownerDue)} color="text-orange-600" />
      </div>

      {/* Property list */}
      {loading && <div className="text-sm text-gray-400">Loading...</div>}
      <div className="space-y-4">
        {properties.map(p => {
          const totalExp = n(p.electricity) + n(p.internet) + n(p.water) + n(p.hoa)
            + n(p.pool_service) + n(p.insurance) + n(p.consumables) + n(p.cleaning)
            + n(p.maintenance) + n(p.other_expenses) + n(p.software)
          const netProfit = n(p.platform_income) - totalExp - n(p.management_fee)
          const isOpen = selected === p.property_id

          return (
            <div key={p.property_id} className="card overflow-hidden">
              {/* Header */}
              <button
                onClick={() => setSelected(isOpen ? null : p.property_id)}
                className="w-full px-5 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <span className="font-semibold text-gray-900">{p.property_name}</span>
                  <span className="badge bg-pink-100 text-pink-700">Airbnb</span>
                  <span className="text-xs text-gray-400">{p.transaction_count} transactions</span>
                </div>
                <div className="flex items-center gap-6 text-sm">
                  <div className="text-right">
                    <div className="text-xs text-gray-400">Income</div>
                    <div className="font-semibold text-green-600">{EUR(n(p.platform_income))}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-gray-400">Net Profit</div>
                    <div className={`font-bold flex items-center gap-1 ${netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {netProfit >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                      {EUR(netProfit)}
                    </div>
                  </div>
                  {n(p.owner_balance_due) > 0 && (
                    <div className="text-right">
                      <div className="text-xs text-gray-400">Due to Owner</div>
                      <div className="font-semibold text-orange-600">{EUR(n(p.owner_balance_due))}</div>
                    </div>
                  )}
                  <span className="text-gray-400 text-lg">{isOpen ? '▲' : '▼'}</span>
                </div>
              </button>

              {/* Expanded owner statement */}
              {isOpen && (
                <div className="border-t border-gray-100 px-5 py-4">
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Income</div>
                      <StatRow label="Platform Income" value={EUR(n(p.platform_income))} color="text-green-600" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Expenses</div>
                      {n(p.electricity) > 0 && <StatRow label="Electricity" value={EUR(n(p.electricity))} />}
                      {n(p.internet) > 0 && <StatRow label="Internet" value={EUR(n(p.internet))} />}
                      {n(p.water) > 0 && <StatRow label="Water" value={EUR(n(p.water))} />}
                      {n(p.hoa) > 0 && <StatRow label="HOA" value={EUR(n(p.hoa))} />}
                      {n(p.pool_service) > 0 && <StatRow label="Pool Service" value={EUR(n(p.pool_service))} />}
                      {n(p.cleaning) > 0 && <StatRow label="Cleaning" value={EUR(n(p.cleaning))} />}
                      {n(p.consumables) > 0 && <StatRow label="Guest Supplies" value={EUR(n(p.consumables))} />}
                      {n(p.maintenance) > 0 && <StatRow label="Maintenance" value={EUR(n(p.maintenance))} />}
                      {n(p.software) > 0 && <StatRow label="Software / Hostaway" value={EUR(n(p.software))} />}
                      {n(p.other_expenses) > 0 && <StatRow label="Other" value={EUR(n(p.other_expenses))} />}
                      <div className="border-t border-gray-200 pt-2 mt-2">
                        <StatRow label="Total Expenses" value={EUR(totalExp)} color="text-red-500" bold />
                      </div>
                    </div>
                  </div>

                  {/* Summary */}
                  <div className="mt-4 pt-4 border-t border-gray-200 grid grid-cols-4 gap-4 text-sm">
                    <SummaryItem label="Gross Income" value={EUR(n(p.platform_income))} />
                    <SummaryItem label="− Expenses" value={EUR(totalExp)} negative />
                    <SummaryItem label="− Mgmt Fee" value={EUR(n(p.management_fee))} negative />
                    <SummaryItem label="Net to Owner" value={EUR(n(p.platform_income) - totalExp - n(p.management_fee))}
                      highlight={n(p.platform_income) - totalExp - n(p.management_fee) >= 0} />
                  </div>

                  {n(p.paid_to_owner) > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between text-sm">
                      <span className="text-gray-500">Already paid to owner:</span>
                      <span className="font-semibold text-green-600">−{EUR(n(p.paid_to_owner))}</span>
                    </div>
                  )}
                  {n(p.owner_balance_due) !== 0 && (
                    <div className="mt-2 flex justify-between text-sm font-bold">
                      <span className="text-gray-700">Balance due to owner:</span>
                      <span className={n(p.owner_balance_due) > 0 ? 'text-orange-600' : 'text-green-600'}>
                        {EUR(n(p.owner_balance_due))}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SumCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-xl font-bold ${color}`}>{value}</div>
    </div>
  )
}

function StatRow({ label, value, color = 'text-gray-700', bold = false }: { label: string; value: string; color?: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between text-xs py-0.5 ${bold ? 'font-bold' : ''}`}>
      <span className="text-gray-500">{label}</span>
      <span className={color}>{value}</span>
    </div>
  )
}

function SummaryItem({ label, value, negative = false, highlight = false }: { label: string; value: string; negative?: boolean; highlight?: boolean }) {
  return (
    <div className="text-center">
      <div className="text-xs text-gray-400 mb-1">{label}</div>
      <div className={`font-bold ${highlight ? 'text-green-600' : negative ? 'text-red-500' : 'text-gray-800'}`}>{value}</div>
    </div>
  )
}
