'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Building2, Search, X } from 'lucide-react'
import {
  purchaseStatus, partnerStatus, renovationStatus,
  airbnbStatus, managementStatus, saleStatus,
  STATUS_COLORS, SectionStatus,
  computeHealth, computePriority,
  healthBarColor, healthTextClass,
  PRIORITY_BADGE, Priority, HealthScore,
} from '@/lib/propertyStatus'

const EUR = (n: number) =>
  new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)

const STATUS_BADGE: Record<string, string> = {
  'Airbnb':     'bg-pink-100 text-pink-700',
  'Rent':       'bg-blue-100 text-blue-700',
  'Sale':       'bg-green-100 text-green-700',
  'Sold':       'bg-emerald-100 text-emerald-700',
  'Rent&Sale':  'bg-purple-100 text-purple-700',
  'Renovation': 'bg-orange-100 text-orange-700',
  'Purchased':  'bg-indigo-100 text-indigo-700',
  'Other':      'bg-gray-100 text-gray-500',
}

type P = {
  id: string; name: string; nickname: string | null; status: string | null; transaction_count: number
  purchase_contract: number; purchase_paid: number
  purchase_paid_to_seller: number; purchase_expenses_only: number
  sale_contract: number; sale_received: number; third_party_payment: number; sale_costs: number
  renovation_contract: number; renovation_extras_charge: number; renovation_received: number
  renovation_costs: number; renovation_extras_cost: number; renovation_actual_cost: number
  management_income: number; management_expenses: number; management_fees: number; paid_to_owner: number
  airbnb_platform_income: number; airbnb_expenses: number; airbnb_management_fee: number; airbnb_paid_to_owner: number
  // P0-C: canonical SQL fields — do not recompute in TypeScript
  property_real_pl: number
  property_capital_position: number
}

// ── Status filters (radio: one at a time) ─────────────────────────────────────
const STATUS_FILTERS = [
  { key: 'all',        label: 'All' },
  { key: 'Airbnb',     label: 'Airbnb' },
  { key: 'Rent',       label: 'Rent' },
  { key: 'sale-s',     label: 'Sale / Rent&Sale' },
  { key: 'Sold',       label: 'Sold' },
  { key: 'Renovation', label: 'Renovation' },
  { key: 'purchase-s', label: 'Purchase' },
]

// ── Smart filters (toggle: AND logic, multiple can be active) ─────────────────
const SMART_FILTERS = [
  { key: 'purchase-open',  label: 'Purchase open' },
  { key: 'reno-loss',      label: 'Renovation loss' },
  { key: 'airbnb-loss',    label: 'Airbnb loss' },
  { key: 'mgmt-issue',     label: 'Management issue' },
  { key: 'sale-active',    label: 'Sale active' },
  { key: 'critical',       label: 'Critical' },
  { key: 'high-priority',  label: 'High priority' },
  { key: 'healthy',        label: 'Healthy' },
]

function n(v: unknown): number { return Number(v) || 0 }

function hasRenovation(p: P) {
  return n(p.renovation_contract) > 0 || n(p.renovation_costs) > 0 || n(p.renovation_received) > 0
}
function hasPurchase(p: P) {
  return n(p.purchase_contract) > 0 || n(p.purchase_paid_to_seller) > 0 || n(p.purchase_expenses_only) > 0
}

// Compute all 6 statuses for a property (owners not loaded → partnerStatus returns gray)
function getStatuses(p: P): SectionStatus[] {
  return [
    purchaseStatus(p),
    partnerStatus([]),   // always gray on list page — excluded from health/priority
    renovationStatus(p),
    airbnbStatus(p),
    managementStatus(p),
    saleStatus(p),
  ]
}

// ── Smart filter predicate ────────────────────────────────────────────────────
function matchesSmart(p: P, key: string): boolean {
  const sts = getStatuses(p)
  const [pSt, , rSt, aSt, mSt, salSt] = sts
  const priority = computePriority(sts)
  const health   = computeHealth(sts)

  switch (key) {
    case 'purchase-open':  return pSt.color !== 'green'  && pSt.color !== 'gray'
    case 'reno-loss':      return rSt.color === 'red'
    case 'airbnb-loss':    return aSt.color === 'red'
    case 'mgmt-issue':     return mSt.color === 'red'    || mSt.color === 'orange'
    case 'sale-active':    return salSt.color !== 'gray'
    case 'critical':       return priority === 'Critical'
    case 'high-priority':  return priority === 'Critical' || priority === 'High'
    case 'healthy':        return health.score >= 75
    default:               return false
  }
}

// ── Executive summary stats ───────────────────────────────────────────────────
function computeExecStats(props: P[]) {
  let healthy = 0, needAttention = 0, critical = 0
  let forSale = 0, airbnbActive = 0, renovActive = 0

  for (const p of props) {
    const sts    = getStatuses(p)
    const health = computeHealth(sts)

    if (health.score >= 75)      healthy++
    else if (health.score >= 50) needAttention++
    else                         critical++

    if (saleStatus(p).color !== 'gray')                                    forSale++
    if (airbnbStatus(p).color === 'green')                                 airbnbActive++
    const rSt = renovationStatus(p)
    if (rSt.color !== 'gray' && rSt.color !== 'green')                    renovActive++
  }

  return { healthy, needAttention, critical, forSale, airbnbActive, renovActive }
}

// ── Count helpers ─────────────────────────────────────────────────────────────
function countStatus(props: P[], key: string): number {
  if (key === 'all')       return props.length
  if (key === 'sale-s')    return props.filter(p => p.status === 'Sale' || p.status === 'Rent&Sale').length
  if (key === 'Renovation') return props.filter(hasRenovation).length
  if (key === 'purchase-s') return props.filter(hasPurchase).length
  return props.filter(p => p.status === key).length
}

function countSmart(props: P[], key: string): number {
  return props.filter(p => matchesSmart(p, key)).length
}

// ─────────────────────────────────────────────────────────────────────────────
export default function PropertiesPage() {
  const [properties, setProperties] = useState<P[]>([])
  const [loading, setLoading]       = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [smartFilters, setSmartFilters] = useState<Set<string>>(new Set())
  const [search, setSearch]         = useState('')
  const router = useRouter()

  useEffect(() => {
    supabase.from('v_property_summary').select('*').order('name').then(({ data }) => {
      // Filter out rows with null/empty name (transactions with no property_name in DB)
      setProperties(((data ?? []) as P[]).filter(p => p.name != null && p.name !== ''))
      setLoading(false)
    })
  }, [])

  // Executive summary — computed once from all properties
  const execStats = useMemo(() => computeExecStats(properties), [properties])

  // Toggle smart filter (AND logic)
  function toggleSmart(key: string) {
    setSmartFilters(prev => {
      const next = new Set(prev)
      if (next.has(key)) { next.delete(key) } else { next.add(key) }
      return next
    })
  }

  function clearAllFilters() {
    setStatusFilter('all')
    setSmartFilters(new Set())
    setSearch('')
  }

  // Final filtered list
  const filtered = useMemo(() => {
    return properties.filter(p => {
      // Status filter
      let ok = false
      if (statusFilter === 'all')        ok = true
      else if (statusFilter === 'sale-s')    ok = p.status === 'Sale' || p.status === 'Rent&Sale'
      else if (statusFilter === 'Renovation') ok = hasRenovation(p)
      else if (statusFilter === 'purchase-s') ok = hasPurchase(p)
      else ok = p.status === statusFilter

      // Search
      if (ok && search) {
        const q = String(search ?? '').toLowerCase()
        ok = String(p.name ?? '').toLowerCase().includes(q)
          || String(p.nickname ?? '').toLowerCase().includes(q)
      }

      // Smart filters — AND
      if (ok && smartFilters.size > 0) {
        ok = Array.from(smartFilters).every(f => matchesSmart(p, f))
      }

      return ok
    })
  }, [properties, statusFilter, smartFilters, search])

  const hasActiveFilters = statusFilter !== 'all' || smartFilters.size > 0 || search

  return (
    <div className="p-8">

      {/* ── Executive Summary ─────────────────────────────────────────── */}
      {!loading && properties.length > 0 && (
        <div className="mb-6">
          <div className="grid grid-cols-4 gap-3 mb-3">
            <ExecStat label="Total properties" value={properties.length} />
            <ExecStat label="Healthy" value={execStats.healthy} color="text-green-600" />
            <ExecStat label="Need attention" value={execStats.needAttention} color="text-amber-600" />
            <ExecStat label="Critical" value={execStats.critical} color="text-red-600" />
          </div>
          <div className="grid grid-cols-4 gap-3">
            <ExecStat label="For sale" value={execStats.forSale} color="text-blue-600" />
            <ExecStat label="Airbnb active" value={execStats.airbnbActive} color="text-pink-600" />
            <ExecStat label="Renovations active" value={execStats.renovActive} color="text-orange-600" />
            <ExecStat label="Partner deals" value="—" color="text-gray-400" note="requires ownership data" />
          </div>
        </div>
      )}

      {/* Page header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Properties</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {filtered.length !== properties.length
              ? `${filtered.length} of ${properties.length} properties`
              : `${properties.length} properties`}
            &nbsp;&middot; click any card for details
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search..." className="input pl-8 w-48" />
          </div>
          {hasActiveFilters && (
            <button onClick={clearAllFilters}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800">
              <X size={12} /> Clear
            </button>
          )}
        </div>
      </div>

      {/* ── Status filters ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        {STATUS_FILTERS.map(f => {
          const count = countStatus(properties, f.key)
          if (count === 0 && f.key !== 'all') return null
          return (
            <button key={f.key} onClick={() => setStatusFilter(f.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                statusFilter === f.key
                  ? 'bg-brand-500 text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}>
              {f.label} <span className="opacity-60">({count})</span>
            </button>
          )
        })}
      </div>

      {/* ── Smart filters ───────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <span className="text-xs text-gray-400 font-medium">Smart:</span>
        {SMART_FILTERS.map(f => {
          const count = countSmart(properties, f.key)
          const isActive = smartFilters.has(f.key)
          return (
            <button key={f.key} onClick={() => toggleSmart(f.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
                isActive
                  ? 'bg-gray-800 text-white border-gray-800'
                  : 'bg-white border-dashed border-gray-300 text-gray-500 hover:border-gray-400 hover:text-gray-700'
              }`}>
              {f.label} <span className="opacity-60">({count})</span>
            </button>
          )
        })}
      </div>

      {loading && <div className="text-sm text-gray-400">Loading...</div>}

      {/* ── Property grid ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4">
        {filtered.map(p => (
          <PropertyCard key={p.id} p={p}
            onClick={() => p.name && router.push(`/properties/${encodeURIComponent(p.name)}`)} />
        ))}
      </div>

      {!loading && filtered.length === 0 && (
        <div className="text-center py-16 text-sm text-gray-400">
          No properties match the current filters.
          <button onClick={clearAllFilters} className="ml-2 text-brand-500 hover:underline">Clear filters</button>
        </div>
      )}
    </div>
  )
}

// ── Executive Stat Card ───────────────────────────────────────────────────────
function ExecStat({ label, value, color, note }: {
  label: string; value: number | string; color?: string; note?: string
}) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl px-4 py-3">
      <div className="text-xs text-gray-400 mb-1">{label}</div>
      <div className={`text-2xl font-semibold leading-none ${color ?? 'text-gray-900'}`}>{value}</div>
      {note && <div className="text-[10px] text-gray-300 mt-1">{note}</div>}
    </div>
  )
}

// ── Property Card ─────────────────────────────────────────────────────────────
function PropertyCard({ p, onClick }: { p: P; onClick: () => void }) {
  // Status computation
  const pSt   = purchaseStatus(p)
  const ptSt  = partnerStatus([])   // always gray — excluded from health/priority
  const rSt   = renovationStatus(p)
  const aSt   = airbnbStatus(p)
  const mSt   = managementStatus(p)
  const salSt = saleStatus(p)

  const allStatuses: SectionStatus[] = [pSt, ptSt, rSt, aSt, mSt, salSt]
  const health:   HealthScore = computeHealth(allStatuses)
  const priority: Priority    = computePriority(allStatuses)

  // P0-C: read canonical operating P&L from SQL view — no local arithmetic
  const realPL = n(p.property_real_pl)

  // Layer rows: Purchase → Partner → Renovation → Airbnb → Management → Sale
  const layers: [string, SectionStatus][] = [
    ['Purchase',   pSt],
    ['Partner',    ptSt],
    ['Renovation', rSt],
    ['Airbnb',     aSt],
    ['Management', mSt],
    ['Sale',       salSt],
  ]

  return (
    <div onClick={onClick}
      className="bg-white border border-gray-100 rounded-xl p-4 hover:border-brand-300 hover:shadow-sm transition-all cursor-pointer group">

      {/* 1 · Property name + Priority badge */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Building2 size={14} className="text-gray-300 shrink-0 group-hover:text-brand-400 transition-colors" />
          <span className="font-semibold text-gray-900 text-sm truncate group-hover:text-brand-700 transition-colors">
            {p.name}
          </span>
        </div>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${PRIORITY_BADGE[priority]}`}>
          {priority}
        </span>
      </div>

      {/* 2 · Property type badge */}
      <div className="mb-3 ml-5">
        {p.status
          ? <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${STATUS_BADGE[p.status] ?? 'bg-gray-100 text-gray-500'}`}>{p.status}</span>
          : <span className="text-[10px] text-gray-300">No status</span>
        }
      </div>

      {/* 3 · Health bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">Health</span>
          <span className={`text-[10px] font-semibold ${healthTextClass(health.score)}`}>
            {health.score} — {health.tier}
          </span>
        </div>
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all"
            style={{ width: `${health.score}%`, backgroundColor: healthBarColor(health.score) }} />
        </div>
      </div>

      {/* 4 · Layer rows: dot · name · status label */}
      <div className="space-y-1.5 mb-3">
        {layers.map(([label, st]) => (
          <div key={label} className="flex items-center gap-2">
            <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_COLORS[st.color].dot}`} />
            <span className="text-[11px] text-gray-400 w-[68px] shrink-0">{label}</span>
            <span className={`text-[11px] font-medium ${STATUS_COLORS[st.color].text}`}>{st.label}</span>
          </div>
        ))}
      </div>

      {/* 5 · Real P&L (operating only — no capital) + transaction count */}
      <div className="pt-3 border-t border-gray-50 flex items-end justify-between">
        <div>
          <div className="text-[10px] text-gray-400 uppercase tracking-wide font-medium mb-0.5">
            Real P&amp;L
          </div>
          <div className={`text-base font-bold ${realPL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {EUR(realPL)}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-gray-300">{p.transaction_count} tx</div>
          <div className="text-[10px] text-brand-400 opacity-0 group-hover:opacity-100 transition-opacity mt-0.5">
            Details →
          </div>
        </div>
      </div>
    </div>
  )
}
