'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { RentalContract } from '@/types'
import Link from 'next/link'
import { format, differenceInDays, isPast, parseISO } from 'date-fns'
import { PlusCircle, AlertTriangle, CheckCircle, Clock, XCircle, FileText } from 'lucide-react'

const EUR = (n: number) =>
  new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)

function StatusBadge({ contract }: { contract: RentalContract }) {
  if (contract.status === 'terminated') {
    return <span className="badge bg-red-100 text-red-700 flex items-center gap-1"><XCircle size={11} />Terminated</span>
  }
  if (contract.status === 'expired' || (contract.end_date && isPast(parseISO(contract.end_date)))) {
    return <span className="badge bg-gray-100 text-gray-600 flex items-center gap-1"><Clock size={11} />Expired</span>
  }
  if (contract.end_date) {
    const days = differenceInDays(parseISO(contract.end_date), new Date())
    if (days <= 30) return <span className="badge bg-red-100 text-red-700 flex items-center gap-1"><AlertTriangle size={11} />Expires in {days}d</span>
    if (days <= 60) return <span className="badge bg-orange-100 text-orange-700 flex items-center gap-1"><AlertTriangle size={11} />Expires in {days}d</span>
  }
  return <span className="badge bg-green-100 text-green-700 flex items-center gap-1"><CheckCircle size={11} />Active</span>
}

export default function ContractsPage() {
  const [contracts, setContracts] = useState<RentalContract[]>([])
  const [loading, setLoading]     = useState(true)
  const [filter, setFilter]       = useState<'all' | 'active' | 'expiring' | 'expired'>('all')

  useEffect(() => {
    supabase
      .from('rental_contracts')
      .select(`*, properties(name, nickname)`)
      .order('end_date', { ascending: true })
      .then(({ data }) => {
        setContracts((data ?? []) as any)
        setLoading(false)
      })
  }, [])

  const filtered = contracts.filter(c => {
    if (filter === 'active') return c.status === 'active' && (!c.end_date || !isPast(parseISO(c.end_date)))
    if (filter === 'expiring') {
      if (!c.end_date || c.status !== 'active') return false
      return differenceInDays(parseISO(c.end_date), new Date()) <= 60
    }
    if (filter === 'expired') return c.status === 'expired' || (c.end_date ? isPast(parseISO(c.end_date)) : false)
    return true
  })

  const totalMonthlyRent = filtered
    .filter(c => c.status === 'active')
    .reduce((s, c) => s + c.monthly_rent, 0)

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Rental Contracts</h1>
          <p className="text-sm text-gray-500 mt-0.5">{contracts.length} contracts · Active income: {EUR(totalMonthlyRent)}/month</p>
        </div>
        <Link href="/contracts/new" className="btn-primary flex items-center gap-2 text-sm">
          <PlusCircle size={15} />
          New Contract
        </Link>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-5">
        {(['all','active','expiring','expired'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium capitalize transition-colors ${
              filter === f ? 'bg-brand-500 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {f === 'expiring' ? 'Expiring (60d)' : f}
          </button>
        ))}
      </div>

      {/* Contracts list */}
      {loading && <div className="text-sm text-gray-400">Loading...</div>}

      <div className="space-y-3">
        {filtered.length === 0 && !loading && (
          <div className="card p-8 text-center text-sm text-gray-400">
            No contracts found.{' '}
            <Link href="/contracts/new" className="text-brand-500 hover:underline">Add the first one →</Link>
          </div>
        )}

        {filtered.map(c => {
          const prop = (c as any).properties
          const daysLeft = c.end_date ? differenceInDays(parseISO(c.end_date), new Date()) : null
          const mgmtFee = c.management_fee_type === 'percentage'
            ? (c.monthly_rent * c.management_fee_value) / 100
            : c.management_fee_value
          const netToOwner = c.monthly_rent - mgmtFee

          return (
            <Link key={c.id} href={`/contracts/${c.id}`} className="card p-5 flex items-center gap-6 hover:shadow-md transition-shadow block">
              <div className="w-8 h-8 rounded-lg bg-brand-100 flex items-center justify-center shrink-0">
                <FileText size={16} className="text-brand-600" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-900 text-sm">
                    {prop?.name ?? 'Unknown Property'}
                  </span>
                  {prop?.nickname && <span className="text-xs text-gray-400">({prop.nickname})</span>}
                  <StatusBadge contract={c} />
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  Tenant: <span className="font-medium text-gray-700">{c.tenant_name}</span>
                  {c.start_date && ` · From ${format(parseISO(c.start_date), 'dd/MM/yyyy')}`}
                  {c.end_date && ` → ${format(parseISO(c.end_date), 'dd/MM/yyyy')}`}
                  {daysLeft !== null && daysLeft > 0 && ` (${daysLeft} days left)`}
                </div>
              </div>

              <div className="text-right shrink-0">
                <div className="text-lg font-bold text-gray-900">{EUR(c.monthly_rent)}<span className="text-xs font-normal text-gray-400">/mo</span></div>
                <div className="text-xs text-gray-400 mt-0.5">
                  Fee: {EUR(mgmtFee)} · Owner: {EUR(netToOwner)}
                </div>
              </div>

              {c.deposit > 0 && (
                <div className="text-right shrink-0">
                  <div className="text-xs text-gray-500">Deposit</div>
                  <div className="text-sm font-semibold text-gray-700">{EUR(c.deposit)}</div>
                </div>
              )}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
