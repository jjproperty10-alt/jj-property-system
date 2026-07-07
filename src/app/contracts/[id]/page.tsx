'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { RentalContract, Transaction } from '@/types'
import { format, parseISO, differenceInDays, startOfMonth, endOfMonth, eachMonthOfInterval } from 'date-fns'
import { ArrowLeft, CheckCircle, Clock, AlertTriangle, Edit2 } from 'lucide-react'

const EUR = (n: number) =>
  new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)

type MonthStatus = {
  month: Date
  label: string
  expected: number
  paid: number
  status: 'paid' | 'partial' | 'unpaid' | 'future'
}

export default function ContractDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [contract, setContract]     = useState<RentalContract | null>(null)
  const [property, setProperty]     = useState<any>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [months, setMonths]         = useState<MonthStatus[]>([])
  const [loading, setLoading]       = useState(true)

  useEffect(() => {
    async function load() {
      const [{ data: c }, { data: txs }] = await Promise.all([
        supabase.from('rental_contracts').select('*, properties(name, nickname, address)').eq('id', id).single(),
        supabase.from('transactions')
          .select('*')
          .eq('property_id', (await supabase.from('rental_contracts').select('property_id').eq('id', id).single()).data?.property_id)
          .in('subcategory', ['Tenant Payment', 'Tenant Bank Payment', 'Client Payment'])
          .order('date', { ascending: false }),
      ])
      if (!c) return
      setContract(c as any)
      setProperty((c as any).properties)
      setTransactions((txs ?? []) as Transaction[])

      // Build month-by-month payment status
      const start = parseISO(c.start_date)
      const end = c.end_date ? parseISO(c.end_date) : new Date()
      const allMonths = eachMonthOfInterval({ start, end })

      const monthData: MonthStatus[] = allMonths.map(month => {
        const ms = startOfMonth(month)
        const me = endOfMonth(month)
        const isFuture = ms > new Date()
        const paid = (txs ?? []).filter((t: any) => {
          const d = new Date(t.date)
          return d >= ms && d <= me
        }).reduce((s: number, t: any) => s + (t.amount_eur ?? 0), 0)
        const status = isFuture ? 'future'
          : paid >= (c.monthly_rent * 0.99) ? 'paid'
          : paid > 0 ? 'partial'
          : 'unpaid'
        return {
          month,
          label: format(month, 'MMM yyyy'),
          expected: c.monthly_rent,
          paid,
          status,
        }
      })
      setMonths(monthData.reverse()) // newest first
      setLoading(false)
    }
    load()
  }, [id])

  if (loading) return <div className="p-8 text-sm text-gray-400">Loading...</div>
  if (!contract) return <div className="p-8 text-sm text-gray-500">Contract not found.</div>

  const mgmtFee = contract.management_fee_type === 'percentage'
    ? (contract.monthly_rent * contract.management_fee_value) / 100
    : contract.management_fee_value
  const netToOwner = contract.monthly_rent - mgmtFee

  const totalCollected = months.filter(m => m.status !== 'future').reduce((s, m) => s + m.paid, 0)
  const totalExpected  = months.filter(m => m.status !== 'future').reduce((s, m) => s + m.expected, 0)
  const unpaidMonths   = months.filter(m => m.status === 'unpaid' || m.status === 'partial').length

  const daysLeft = contract.end_date ? differenceInDays(parseISO(contract.end_date), new Date()) : null

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => router.push('/contracts')} className="text-gray-400 hover:text-gray-700 transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">{property?.name ?? 'Contract'}</h1>
          <p className="text-sm text-gray-500">Tenant: {contract.tenant_name}</p>
        </div>
        {daysLeft !== null && daysLeft <= 60 && daysLeft > 0 && (
          <div className="flex items-center gap-2 bg-orange-50 border border-orange-200 text-orange-700 rounded-lg px-3 py-2 text-sm">
            <AlertTriangle size={15} />
            Expires in {daysLeft} days ({format(parseISO(contract.end_date!), 'dd/MM/yyyy')})
          </div>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <SummaryCard label="Monthly Rent" value={EUR(contract.monthly_rent)} sub="Gross" />
        <SummaryCard label="Management Fee" value={EUR(mgmtFee)}
          sub={contract.management_fee_type === 'percentage' ? `${contract.management_fee_value}%` : 'Fixed'} color="text-orange-600" />
        <SummaryCard label="Net to Owner" value={EUR(netToOwner)} sub="Per month" color="text-green-600" />
        <SummaryCard label="Deposit" value={EUR(contract.deposit)} sub="Held" color="text-blue-600" />
      </div>

      {/* Collection stats */}
      <div className="card p-5 mb-6">
        <div className="grid grid-cols-3 gap-6">
          <div>
            <div className="text-xs text-gray-500 mb-1">Total Collected</div>
            <div className="text-2xl font-bold text-green-600">{EUR(totalCollected)}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">Total Expected</div>
            <div className="text-2xl font-bold text-gray-900">{EUR(totalExpected)}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">Unpaid / Partial Months</div>
            <div className={`text-2xl font-bold ${unpaidMonths > 0 ? 'text-red-600' : 'text-gray-400'}`}>
              {unpaidMonths}
            </div>
          </div>
        </div>
        {/* Progress bar */}
        {totalExpected > 0 && (
          <div className="mt-4">
            <div className="flex justify-between text-xs text-gray-400 mb-1">
              <span>Collection rate</span>
              <span>{Math.round((totalCollected / totalExpected) * 100)}%</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 rounded-full"
                style={{ width: `${Math.min(100, (totalCollected / totalExpected) * 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Month-by-month */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Monthly Payment Tracker</h3>
        </div>
        <div className="divide-y divide-gray-50">
          {months.map(m => (
            <div key={m.label} className="px-5 py-3 flex items-center gap-4">
              <div className="w-24 text-sm font-medium text-gray-700 shrink-0">{m.label}</div>
              <div className="flex-1">
                {m.status === 'paid' && (
                  <div className="flex items-center gap-1.5 text-green-600 text-xs font-medium">
                    <CheckCircle size={13} /> Paid in full
                  </div>
                )}
                {m.status === 'partial' && (
                  <div className="flex items-center gap-1.5 text-orange-600 text-xs font-medium">
                    <Clock size={13} /> Partial — {EUR(m.paid)} of {EUR(m.expected)}
                  </div>
                )}
                {m.status === 'unpaid' && (
                  <div className="flex items-center gap-1.5 text-red-600 text-xs font-medium">
                    <AlertTriangle size={13} /> Unpaid
                  </div>
                )}
                {m.status === 'future' && (
                  <div className="text-xs text-gray-400">Upcoming</div>
                )}
              </div>
              <div className={`text-sm font-semibold shrink-0 ${
                m.status === 'paid' ? 'text-green-600' :
                m.status === 'partial' ? 'text-orange-600' :
                m.status === 'unpaid' ? 'text-red-600' : 'text-gray-300'
              }`}>
                {m.status === 'future' ? EUR(m.expected) : EUR(m.paid)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function SummaryCard({ label, value, sub, color = 'text-gray-900' }: {
  label: string; value: string; sub: string; color?: string
}) {
  return (
    <div className="card p-4">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-gray-400 mt-0.5">{sub}</div>
    </div>
  )
}
