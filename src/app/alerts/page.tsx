'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { format, differenceInDays, parseISO, isPast } from 'date-fns'
import {
  AlertTriangle, CheckCircle, Clock, Bell, RefreshCw,
  FileText, Wallet, TrendingDown, Copy,
} from 'lucide-react'

const EUR = (n: number) =>
  new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)

type Alert = {
  id: string
  type: string
  severity: 'high' | 'medium' | 'low'
  title: string
  description: string
  property?: string
  amount?: number
  date?: string
  action?: string
  actionHref?: string
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState(new Date())
  const [filter, setFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all')

  async function generateAlerts() {
    setLoading(true)
    const generated: Alert[] = []

    // ── 1. Contracts expiring soon ──
    const { data: contracts } = await supabase
      .from('rental_contracts')
      .select('*, properties(name)')
      .eq('status', 'active')

    for (const c of contracts ?? []) {
      if (!c.end_date) continue
      const days = differenceInDays(parseISO(c.end_date), new Date())
      const propName = (c as any).properties?.name ?? 'Unknown'
      if (days < 0) {
        generated.push({
          id: `contract-expired-${c.id}`,
          type: 'contract_expired',
          severity: 'high',
          title: `Contract Expired — ${propName}`,
          description: `Tenant: ${c.tenant_name} · Expired ${Math.abs(days)} days ago (${format(parseISO(c.end_date), 'dd/MM/yyyy')})`,
          property: propName,
          action: 'View Contract',
          actionHref: `/contracts/${c.id}`,
        })
      } else if (days <= 30) {
        generated.push({
          id: `contract-30d-${c.id}`,
          type: 'contract_ending',
          severity: 'high',
          title: `Contract Ending in ${days} days — ${propName}`,
          description: `Tenant: ${c.tenant_name} · Ends ${format(parseISO(c.end_date), 'dd/MM/yyyy')} · Rent: ${EUR(c.monthly_rent)}/mo`,
          property: propName,
          action: 'View Contract',
          actionHref: `/contracts/${c.id}`,
        })
      } else if (days <= 60) {
        generated.push({
          id: `contract-60d-${c.id}`,
          type: 'contract_ending',
          severity: 'medium',
          title: `Contract Ending in ${days} days — ${propName}`,
          description: `Tenant: ${c.tenant_name} · Ends ${format(parseISO(c.end_date), 'dd/MM/yyyy')} · Rent: ${EUR(c.monthly_rent)}/mo`,
          property: propName,
          action: 'View Contract',
          actionHref: `/contracts/${c.id}`,
        })
      }
    }

    // ── 2. Owner balances due ──
    const { data: balances } = await supabase
      .from('v_owner_balances')
      .select('*')

    for (const b of balances ?? []) {
      if ((b.balance_due_to_owner ?? 0) > 100) {
        generated.push({
          id: `owner-balance-${b.property_name}`,
          type: 'owner_payment_due',
          severity: (b.balance_due_to_owner ?? 0) > 1000 ? 'high' : 'medium',
          title: `Owner Payment Due — ${b.property_name}`,
          description: `Balance due to owner: ${EUR(b.balance_due_to_owner ?? 0)}`,
          property: b.property_name ?? '',
          amount: b.balance_due_to_owner ?? 0,
        })
      }
    }

    // ── 3. Duplicate transactions ──
    const { data: dupes } = await supabase
      .from('v_possible_duplicates')
      .select('*')
      .limit(10)

    if ((dupes ?? []).length > 0) {
      generated.push({
        id: 'duplicates',
        type: 'duplicate',
        severity: 'medium',
        title: `${dupes!.length} Possible Duplicate Transaction(s)`,
        description: `Found ${dupes!.length} transactions with same date, amount, and description. Review recommended.`,
        action: 'View Transactions',
        actionHref: '/transactions',
      })
    }

    // ── 4. Negative property P&L ──
    const { data: props } = await supabase
      .from('v_property_summary')
      .select('*')

    for (const p of props ?? []) {
      const net = (p.renovation_revenue ?? 0) - (p.renovation_costs ?? 0)
        + (p.management_income ?? 0) - (p.management_expenses ?? 0) - (p.management_fees ?? 0)
        + (p.airbnb_revenue ?? 0) - (p.airbnb_expenses ?? 0)
        + (p.total_sale_received ?? 0) - (p.total_purchased ?? 0)
      if (net < -50000 && (p.transaction_count ?? 0) > 5) {
        generated.push({
          id: `negative-pl-${p.id}`,
          type: 'negative_profit',
          severity: net < -200000 ? 'high' : 'medium',
          title: `High Negative P&L — ${p.name}`,
          description: `Net P&L: ${EUR(net)} · ${p.transaction_count} transactions`,
          property: p.name,
          amount: net,
        })
      }
    }

    // Sort: high first
    generated.sort((a, b) => {
      const order = { high: 0, medium: 1, low: 2 }
      return order[a.severity] - order[b.severity]
    })

    setAlerts(generated)
    setLastRefresh(new Date())
    setLoading(false)
  }

  useEffect(() => { generateAlerts() }, [])

  const filtered = filter === 'all' ? alerts : alerts.filter(a => a.severity === filter)
  const highCount   = alerts.filter(a => a.severity === 'high').length
  const mediumCount = alerts.filter(a => a.severity === 'medium').length

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Alerts</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {highCount > 0 && <span className="text-red-600 font-medium">{highCount} high · </span>}
            {mediumCount > 0 && <span className="text-orange-500 font-medium">{mediumCount} medium · </span>}
            Last updated {format(lastRefresh, 'HH:mm')}
          </p>
        </div>
        <button
          onClick={generateAlerts}
          disabled={loading}
          className="btn-secondary flex items-center gap-2 text-sm"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Filter */}
      <div className="flex gap-2 mb-5">
        {(['all','high','medium','low'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium capitalize transition-colors ${
              filter === f
                ? f === 'high' ? 'bg-red-500 text-white'
                : f === 'medium' ? 'bg-orange-500 text-white'
                : 'bg-brand-500 text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {f}
            {f !== 'all' && (
              <span className="ml-1 opacity-70">
                ({alerts.filter(a => a.severity === f).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {loading && <div className="text-sm text-gray-400">Scanning for alerts...</div>}

      {!loading && filtered.length === 0 && (
        <div className="card p-12 text-center">
          <CheckCircle size={40} className="text-green-400 mx-auto mb-3" />
          <div className="text-lg font-semibold text-gray-700">All clear!</div>
          <div className="text-sm text-gray-400 mt-1">No alerts in this category.</div>
        </div>
      )}

      <div className="space-y-3">
        {filtered.map(alert => (
          <AlertCard key={alert.id} alert={alert} />
        ))}
      </div>
    </div>
  )
}

function AlertCard({ alert }: { alert: Alert }) {
  const Icon = alert.type === 'contract_ending' || alert.type === 'contract_expired' ? FileText
    : alert.type === 'owner_payment_due' ? Wallet
    : alert.type === 'duplicate' ? Copy
    : alert.type === 'negative_profit' ? TrendingDown
    : Bell

  const colors = {
    high:   { bg: 'bg-red-50',    border: 'border-red-200',    icon: 'text-red-500',    badge: 'bg-red-100 text-red-700' },
    medium: { bg: 'bg-orange-50', border: 'border-orange-200', icon: 'text-orange-500', badge: 'bg-orange-100 text-orange-700' },
    low:    { bg: 'bg-blue-50',   border: 'border-blue-200',   icon: 'text-blue-500',   badge: 'bg-blue-100 text-blue-700' },
  }[alert.severity]

  return (
    <div className={`card p-4 flex items-start gap-4 border ${colors.border} ${colors.bg}`}>
      <div className={`mt-0.5 shrink-0 ${colors.icon}`}>
        <Icon size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-sm text-gray-900">{alert.title}</span>
          <span className={`badge text-xs ${colors.badge}`}>{alert.severity}</span>
        </div>
        <div className="text-xs text-gray-500 mt-0.5">{alert.description}</div>
        {alert.amount != null && (
          <div className={`text-sm font-bold mt-1 ${alert.amount < 0 ? 'text-red-600' : 'text-orange-600'}`}>
            {EUR(alert.amount)}
          </div>
        )}
      </div>
      {alert.action && alert.actionHref && (
        <a href={alert.actionHref}
          className="btn-secondary text-xs shrink-0 px-3 py-1.5">
          {alert.action}
        </a>
      )}
    </div>
  )
}
