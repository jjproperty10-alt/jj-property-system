'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import {
  ArrowLeft, Building2, RefreshCw, TrendingUp, TrendingDown,
  Calendar, User, PieChart, Plus, Trash2, Save, X, Pencil,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import {
  purchaseStatus, partnerStatus, renovationStatus,
  airbnbStatus, managementStatus, saleStatus, STATUS_COLORS,
} from '@/lib/propertyStatus'

const EUR = (n: number) =>
  new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
const num = (v: unknown) => Number(v) || 0

const STATUS_BADGE: Record<string, string> = {
  'Airbnb': 'bg-pink-100 text-pink-700', 'Rent': 'bg-blue-100 text-blue-700',
  'Sale': 'bg-green-100 text-green-700', 'Sold': 'bg-emerald-100 text-emerald-700',
  'Rent&Sale': 'bg-purple-100 text-purple-700', 'Renovation': 'bg-orange-100 text-orange-700',
  'Purchased': 'bg-indigo-100 text-indigo-700',
}
const CAT_COLOR: Record<string, string> = {
  'Sale': 'bg-green-100 text-green-700', 'Purchase': 'bg-blue-100 text-blue-700',
  'Renovation': 'bg-orange-100 text-orange-700', 'Management': 'bg-indigo-100 text-indigo-700',
  'Airbnb': 'bg-pink-100 text-pink-700', 'Transfer': 'bg-gray-100 text-gray-600',
  'JJ': 'bg-yellow-100 text-yellow-700', 'General': 'bg-gray-100 text-gray-500',
}
const OWNER_TYPE_BADGE: Record<string, string> = {
  'partner':  'bg-brand-100 text-brand-700',
  'investor': 'bg-purple-100 text-purple-700',
  'jj':       'bg-yellow-100 text-yellow-700',
  'client':   'bg-gray-100 text-gray-600',
  'external': 'bg-slate-100 text-slate-600',
}
const OWNER_TYPE_LABEL: Record<string, string> = {
  'partner':  'Partner',
  'investor': 'Investor',
  'jj':       'JJ Entity',
  'client':   'Client (we sold)',
  'external': 'External Owner',
}

type Summary = {
  id: string; name: string; status: string | null; transaction_count: number
  purchase_contract: number; purchase_paid: number
  purchase_paid_to_seller: number; purchase_expenses_only: number
  sale_contract: number; sale_received: number; third_party_payment: number; sale_costs: number
  renovation_contract: number; renovation_extras_charge: number; renovation_extras_cost: number
  renovation_received: number; renovation_costs: number; renovation_actual_cost: number
  management_income: number; management_expenses: number; management_fees: number; paid_to_owner: number
  airbnb_platform_income: number; airbnb_expenses: number; airbnb_management_fee: number; airbnb_paid_to_owner: number
  airbnb_client_charge_total: number; airbnb_billing_only: number; airbnb_markup: number
  deposit_held: number
  partner_purchase_contributed: number | null
  // P0-C: canonical SQL fields — do not recompute in TypeScript
  property_real_pl: number
  property_capital_position: number
}

type Tx = {
  id: string; date: string; category: string; subcategory: string | null
  description: string | null; payer: string | null; payee: string | null
  amount_eur: number; client_charge: number | null; notes: string | null
}

type Owner = {
  id?: string
  property_name: string
  owner_name: string
  owner_type: string
  ownership_pct: number
  entry_valuation?: number | null
  isNew?: boolean
}

export default function PropertyDetailPage() {
  const { name } = useParams<{ name: string }>()
  const router = useRouter()
  const propertyName = decodeURIComponent(name)

  const [summary, setSummary]           = useState<Summary | null>(null)
  const [transactions, setTransactions] = useState<Tx[]>([])
  const [loading, setLoading]           = useState(true)
  const [tab, setTab]                   = useState('all')

  // Ownership state
  const [owners, setOwners]             = useState<Owner[]>([])
  const [editOwnership, setEditOwnership] = useState(false)
  const [draftOwners, setDraftOwners]   = useState<Owner[]>([])
  const [ownerSaving, setOwnerSaving]   = useState(false)
  const [ownerError, setOwnerError]     = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const [sumRes, txRes, ownRes] = await Promise.all([
      supabase.from('v_property_summary').select('*').eq('name', propertyName).single(),
      supabase.from('transactions').select('*')
        .eq('property_name', propertyName)
        .eq('is_deleted', false)
        .order('date', { ascending: false }),
      supabase.from('property_ownership').select('*')
        .ilike('property_name', propertyName)
        .order('owner_name'),
    ])
    setSummary(sumRes.data as Summary)
    setTransactions((txRes.data ?? []) as Tx[])
    setOwners((ownRes.data ?? []) as Owner[])
    setLoading(false)
  }, [propertyName])

  useEffect(() => { load() }, [load])

  // ── Ownership editing ──────────────────────────────────────────
  function startEdit() {
    setDraftOwners(owners.map(o => ({ ...o })))
    setOwnerError('')
    setEditOwnership(true)
  }
  function cancelEdit() { setEditOwnership(false); setOwnerError('') }

  function addOwner() {
    setDraftOwners(prev => [...prev, {
      property_name: propertyName, owner_name: '', owner_type: 'partner', ownership_pct: 0, isNew: true
    }])
  }

  function updateDraft(idx: number, field: keyof Owner, value: string | number) {
    setDraftOwners(prev => prev.map((o, i) => i === idx ? { ...o, [field]: value } : o))
  }

  function removeDraft(idx: number) {
    setDraftOwners(prev => prev.filter((_, i) => i !== idx))
  }

  async function saveOwnership() {
    // Validate
    if (draftOwners.some(o => !o.owner_name.trim())) {
      setOwnerError('All owners must have a name.')
      return
    }
    const total = draftOwners.reduce((s, o) => s + num(o.ownership_pct), 0)
    if (Math.abs(total - 100) > 0.01 && draftOwners.length > 0) {
      setOwnerError(`Percentages must total 100%. Current total: ${total.toFixed(1)}%`)
      return
    }
    setOwnerSaving(true)
    setOwnerError('')

    // Delete all existing rows for this property, then insert fresh
    const { error: delErr } = await supabase
      .from('property_ownership')
      .delete()
      .ilike('property_name', propertyName)

    if (delErr) { setOwnerError(delErr.message); setOwnerSaving(false); return }

    if (draftOwners.length > 0) {
      const rows = draftOwners.map(({ owner_name, owner_type, ownership_pct }) => ({
        property_name: propertyName, owner_name, owner_type,
        ownership_pct: num(ownership_pct),
      }))
      const { error: insErr } = await supabase.from('property_ownership').insert(rows)
      if (insErr) { setOwnerError(insErr.message); setOwnerSaving(false); return }
    }

    setOwnerSaving(false)
    setEditOwnership(false)
    await load()
  }

  // ── Transactions ──────────────────────────────────────────────
  const categories = ['all', ...Array.from(new Set(transactions.map(t => t.category))).sort()]
  const filtered = tab === 'all' ? transactions : transactions.filter(t => t.category === tab)

  const s = summary
  // P0-C: read canonical fields from SQL view — no local arithmetic
  const realPL          = num(s?.property_real_pl)
  const capitalPosition = num(s?.property_capital_position)

  const totalPct = draftOwners.reduce((s, o) => s + num(o.ownership_pct), 0)

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => router.back()}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 transition-colors">
          <ArrowLeft size={16} /> Back
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <Building2 size={22} className="text-brand-500" />
            <h1 className="text-2xl font-bold text-gray-900">{propertyName}</h1>
            {s?.status && <span className={`badge ${STATUS_BADGE[s.status] ?? 'bg-gray-100 text-gray-600'}`}>{s.status}</span>}
          </div>
          <p className="text-sm text-gray-500 mt-0.5 ml-8">{transactions.length} transactions</p>
        </div>
        <button onClick={load} disabled={loading}
          className="btn-secondary flex items-center gap-2 text-sm">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* ── Financial Layers ──────────────────────────────────── */}
      {s && (() => {
        // pre-computed values (unchanged — do not modify)
        const invested      = num(s.purchase_paid_to_seller) + num(s.purchase_expenses_only)
        const purchaseBal   = num(s.purchase_contract) - num(s.purchase_paid_to_seller)
        const extrasMarkup  = num(s.renovation_extras_charge) - num(s.renovation_extras_cost)
        const renovProfit   = num(s.renovation_received) - num(s.renovation_actual_cost)  // P0-B
        const airbnbResult  = num(s.airbnb_platform_income) - num(s.airbnb_expenses)
        const mgmtProfit    = num(s.management_income) - num(s.management_expenses) - num(s.management_fees)
        const totalReceived = num(s.sale_received) + num(s.third_party_payment)
        const saleBal       = num(s.sale_contract) > 0 ? num(s.sale_contract) - totalReceived : 0
        const saleResult    = totalReceived - num(s.sale_costs)
        const entryOwners   = owners.filter(o =>
          ['investor','external','client'].includes(o.owner_type) && num(o.entry_valuation) > 0
        )
        const billableOwners = owners.filter(o =>
          ['investor','external','client'].includes(o.owner_type)
        )
        const totalPremium = entryOwners.reduce((sum, o) => {
          const p = (num(o.entry_valuation) - num(s.purchase_paid_to_seller)) * num(o.ownership_pct) / 100
          return sum + Math.max(0, p)
        }, 0)

        // section statuses — shared functions, one source of truth
        const pSt   = purchaseStatus(s)
        const ptSt  = partnerStatus(owners)
        const rSt   = renovationStatus(s)
        const aSt   = airbnbStatus(s)
        const mSt   = managementStatus(s)
        const salSt = saleStatus(s)

        // value color map
        const vc: Record<string, string> = {
          green: 'text-green-600', red: 'text-red-600', blue: 'text-blue-600',
          orange: 'text-orange-600', yellow: 'text-amber-600',
          muted: 'text-gray-400', neutral: 'text-gray-900',
        }

        // badge color map — pulled from shared STATUS_COLORS
        const bc = (color: string) =>
          STATUS_COLORS[color as keyof typeof STATUS_COLORS]?.badge ?? 'bg-gray-100 text-gray-500'

        // inline helpers — plain functions, not React components
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fv = (value: any, color = 'neutral') => (
          <div className={`text-sm font-semibold ${vc[color] ?? vc.neutral}`}>{value}</div>
        )
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cell = (label: string, value: any, color = 'neutral', span = 0) => (
          <div className={`px-5 py-3${span > 0 ? ` col-span-${span}` : ''}`}>
            <div className="text-xs text-gray-400 mb-0.5">{label}</div>
            {fv(value, color)}
          </div>
        )
        const badge = (color: string, label: string) => (
          <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${bc(color)}`}>{label}</span>
        )
        // Section header: icon + title + business question + status badge
        const secHead = (icon: JSX.Element, title: string, subtitle: string, bdg: JSX.Element) => (
          <div className="flex items-start justify-between px-5 py-3 border-b border-gray-100">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">{icon}{title}</div>
              <div className="text-xs text-gray-400 mt-0.5 ml-5">{subtitle}</div>
            </div>
            {bdg}
          </div>
        )
        // Hero row: the one number that answers the business question
        const heroRow = (number: string, label: string, color = 'neutral') => (
          <div className="flex items-baseline gap-3 px-5 py-4 border-b border-gray-50 bg-gray-50/40">
            <span className={`text-2xl font-bold ${vc[color] ?? vc.neutral}`}>{number}</span>
            <span className="text-xs text-gray-400 uppercase tracking-wide font-medium">{label}</span>
          </div>
        )
        const dash = <span className="text-gray-300">—</span>

        return (
          <div className="space-y-4 mb-6">

            {/* 1 · Purchase */}
            <div className="card overflow-hidden">
              {secHead(
                <Building2 size={14} className="text-gray-400" />,
                'Purchase',
                'Has JJ fully invested capital to close the purchase?',
                badge(pSt.color, pSt.label)
              )}
              {heroRow(invested > 0 ? EUR(invested) : '—', 'Total Invested', invested > 0 ? 'red' : 'muted')}
              <div className="grid grid-cols-3 divide-x divide-y divide-gray-50">
                {cell('Contract value',    num(s.purchase_contract) > 0 ? EUR(num(s.purchase_contract)) : dash, 'blue')}
                {cell('Paid to seller',    EUR(num(s.purchase_paid_to_seller)), num(s.purchase_paid_to_seller) > 0 ? 'neutral' : 'muted')}
                {cell('Purchase expenses', EUR(num(s.purchase_expenses_only)), num(s.purchase_expenses_only) > 0 ? 'neutral' : 'muted')}
                {cell('Total invested',    EUR(invested), invested > 0 ? 'red' : 'muted')}
                {cell('Balance due',       purchaseBal > 0 ? EUR(purchaseBal) : '€0', purchaseBal > 0 ? 'yellow' : 'green')}
                {cell('Status',            purchaseBal <= 0 ? 'Fully paid' : `${EUR(purchaseBal)} outstanding`, purchaseBal <= 0 ? 'green' : 'yellow')}
              </div>
            </div>

            {/* 2 · Partner Entry */}
            <div className="card overflow-hidden">
              {secHead(
                <PieChart size={14} className="text-gray-400" />,
                'Partner Entry',
                'Has the partner brought their required capital in?',
                badge(ptSt.color, ptSt.label)
              )}
              {heroRow(totalPremium > 0 ? EUR(totalPremium) : 'Pending', 'JJ Deal Premium', totalPremium > 0 ? 'green' : 'muted')}
              {entryOwners.length === 0 ? (
                <div className="px-5 py-4 text-sm text-gray-400">No partner entry configured.</div>
              ) : entryOwners.map(o => {
                const ev  = num(o.entry_valuation)
                const pct = num(o.ownership_pct)
                const prem = (ev - num(s.purchase_paid_to_seller)) * pct / 100
                return (
                  <div key={o.owner_name} className="grid grid-cols-3 divide-x divide-y divide-gray-50">
                    {cell('Entry valuation',           EUR(ev), 'blue')}
                    {cell(`${o.owner_name} ownership`, `${pct.toFixed(0)}%`, 'blue')}
                    {cell('JJ deal premium',           prem > 0 ? EUR(prem) : '€0', 'green')}
                    {cell('Required capital',          EUR(ev * pct / 100))}
                    {cell('Paid by partner',           'Pending / Not connected', 'yellow')}
                    {cell('Outstanding',               'Pending / Not connected', 'yellow')}
                  </div>
                )
              })}
            </div>

            {/* 3 · Renovation */}
            <div className="card overflow-hidden">
              {secHead(
                <TrendingDown size={14} className="text-gray-400" />,
                'Renovation',
                'Did JJ earn from this renovation?',
                badge(rSt.color, rSt.label)
              )}
              {heroRow(EUR(renovProfit), 'Operating Result', renovProfit > 0 ? 'green' : renovProfit < 0 ? 'red' : 'muted')}
              <div className="grid grid-cols-3 divide-x divide-y divide-gray-50">
                {/* Cost breakdown */}
                {cell('Base cost',          num(s.renovation_costs) > 0 ? EUR(num(s.renovation_costs)) : '€0',         num(s.renovation_costs) > 0 ? 'red' : 'muted')}
                {cell('Extras cost',        num(s.renovation_extras_cost) > 0 ? EUR(num(s.renovation_extras_cost)) : '€0', num(s.renovation_extras_cost) > 0 ? 'red' : 'muted')}
                {cell('Actual cost total',  EUR(num(s.renovation_actual_cost)),                                          num(s.renovation_actual_cost) > 0 ? 'red' : 'muted')}
                {/* Billing breakdown */}
                {cell('Extras billed to client', num(s.renovation_extras_charge) > 0 ? EUR(num(s.renovation_extras_charge)) : '€0', num(s.renovation_extras_charge) > 0 ? 'blue' : 'muted')}
                {cell('Extras markup',      extrasMarkup > 0 ? EUR(extrasMarkup) : '€0',                                extrasMarkup > 0 ? 'green' : 'muted')}
                {cell('Client paid',        num(s.renovation_received) > 0 ? EUR(num(s.renovation_received)) : '€0',   num(s.renovation_received) > 0 ? 'green' : 'muted')}
                {/* Result */}
                {cell('Real profit',        EUR(renovProfit),                                                            renovProfit >= 0 ? 'green' : 'red')}
                {cell('Status',             num(s.renovation_actual_cost) === 0 ? 'No renovation' : renovProfit >= 0 ? 'Profitable' : 'In progress',
                                            num(s.renovation_actual_cost) === 0 ? 'muted' : renovProfit >= 0 ? 'green' : 'yellow')}
                {cell('Contract value',     num(s.renovation_contract) > 0 ? EUR(num(s.renovation_contract)) : dash,   num(s.renovation_contract) > 0 ? 'blue' : 'muted')}
              </div>
            </div>

            {/* 4 · Airbnb */}
            <div className="card overflow-hidden">
              {secHead(
                <TrendingUp size={14} className="text-gray-400" />,
                'Airbnb',
                'Is the Airbnb generating positive operating margin for JJ?',
                badge(aSt.color, aSt.label)
              )}
              {heroRow(EUR(airbnbResult), 'Operating Result', airbnbResult > 0 ? 'green' : airbnbResult < 0 ? 'red' : 'muted')}
              <div className="grid grid-cols-3 divide-x divide-y divide-gray-50">
                {cell('Actual cost (JJ)',       num(s.airbnb_expenses) > 0 ? EUR(num(s.airbnb_expenses)) : '€0', num(s.airbnb_expenses) > 0 ? 'red' : 'muted')}
                {cell('Platform income',        num(s.airbnb_platform_income) > 0 ? EUR(num(s.airbnb_platform_income)) : '€0', num(s.airbnb_platform_income) > 0 ? 'green' : 'muted')}
                {cell('Operating result',       EUR(airbnbResult), airbnbResult >= 0 ? 'green' : 'red')}
                {cell('Explicit client charge', num(s.airbnb_client_charge_total) > 0 ? EUR(num(s.airbnb_client_charge_total)) : '€0', num(s.airbnb_client_charge_total) > 0 ? 'blue' : 'muted')}
                {cell('Billing-only',           num(s.airbnb_billing_only) > 0 ? EUR(num(s.airbnb_billing_only)) : '€0', num(s.airbnb_billing_only) > 0 ? 'blue' : 'muted')}
                {cell('Markup',                 num(s.airbnb_markup) > 0 ? EUR(num(s.airbnb_markup)) : '€0', num(s.airbnb_markup) > 0 ? 'green' : 'muted')}
                {billableOwners.length > 0 && num(s.airbnb_client_charge_total) > 0
                  ? billableOwners.map(o => (
                      <div key={o.owner_name} className="px-5 py-3">
                        <div className="text-xs text-gray-400 mb-0.5">{o.owner_name} {num(o.ownership_pct).toFixed(0)}% obligation</div>
                        {fv(EUR(num(s.airbnb_client_charge_total) * num(o.ownership_pct) / 100), 'yellow')}
                      </div>
                    ))
                  : cell('Partner obligation', dash, 'muted')
                }
                {cell('Status', 'Ongoing', 'yellow')}
              </div>
            </div>

            {/* 5 · Management */}
            <div className="card overflow-hidden">
              {secHead(
                <Building2 size={14} className="text-gray-400" />,
                'Management',
                'Is JJ collecting rent and keeping money from management?',
                badge(mSt.color, mSt.label)
              )}
              {heroRow(EUR(mgmtProfit), 'Net Profit', mgmtProfit > 0 ? 'green' : mgmtProfit < 0 ? 'red' : 'muted')}
              <div className="grid grid-cols-3 divide-x divide-y divide-gray-50">
                {cell('Income',         num(s.management_income) > 0 ? EUR(num(s.management_income)) : '€0', num(s.management_income) > 0 ? 'green' : 'muted')}
                {cell('Expenses',       num(s.management_expenses) > 0 ? EUR(num(s.management_expenses)) : '€0', num(s.management_expenses) > 0 ? 'red' : 'muted')}
                {cell('Management fee', num(s.management_fees) > 0 ? EUR(num(s.management_fees)) : '€0', num(s.management_fees) > 0 ? 'neutral' : 'muted')}
                {cell('Due to owner',   num(s.paid_to_owner) > 0 ? EUR(num(s.paid_to_owner)) : '€0', num(s.paid_to_owner) > 0 ? 'neutral' : 'muted')}
                {cell('Real profit',    EUR(mgmtProfit), mgmtProfit > 0 ? 'green' : mgmtProfit < 0 ? 'red' : 'muted')}
                {cell('Status',         num(s.management_income) === 0 ? 'No activity' : mgmtProfit >= 0 ? 'Profitable' : 'Running',
                                        num(s.management_income) === 0 ? 'muted' : mgmtProfit >= 0 ? 'green' : 'yellow')}
              </div>
            </div>

            {/* 6 · Sale */}
            <div className="card overflow-hidden">
              {secHead(
                <TrendingUp size={14} className="text-gray-400" />,
                'Sale',
                'What is the total return from selling this property?',
                badge(salSt.color, salSt.label)
              )}
              {heroRow(
                num(s.sale_contract) > 0 ? EUR(saleResult - invested) : '—',
                'Net Profit',
                num(s.sale_contract) === 0 ? 'muted' : (saleResult - invested) >= 0 ? 'green' : 'red'
              )}
              <div className="grid grid-cols-3 divide-x divide-y divide-gray-50">
                {cell('Sale contract',  num(s.sale_contract) > 0 ? EUR(num(s.sale_contract)) : dash, num(s.sale_contract) > 0 ? 'blue' : 'muted')}
                {cell('Client paid',    num(s.sale_received) > 0 ? EUR(num(s.sale_received)) : dash, num(s.sale_received) > 0 ? 'green' : 'muted')}
                {cell('Third party',    num(s.third_party_payment) > 0 ? EUR(num(s.third_party_payment)) : dash, num(s.third_party_payment) > 0 ? 'green' : 'muted')}
                {cell('Sale costs',     num(s.sale_costs) > 0 ? EUR(num(s.sale_costs)) : dash, num(s.sale_costs) > 0 ? 'red' : 'muted')}
                {cell('Total received', totalReceived > 0 ? EUR(totalReceived) : dash, totalReceived > 0 ? 'green' : 'muted')}
                {cell('Balance due',    num(s.sale_contract) > 0 ? (saleBal > 0 ? EUR(saleBal) : '€0') : dash,
                                        num(s.sale_contract) === 0 ? 'muted' : saleBal > 0 ? 'yellow' : 'green')}
                {cell('Real profit',    num(s.sale_contract) > 0 ? EUR(saleResult - invested) : dash,
                                        num(s.sale_contract) === 0 ? 'muted' : (saleResult - invested) >= 0 ? 'green' : 'red')}
                {cell('Status',         num(s.sale_contract) === 0 ? 'Not for sale' : saleBal <= 0 ? 'Sale closed' : `${EUR(saleBal)} outstanding`,
                                        num(s.sale_contract) === 0 ? 'muted' : saleBal <= 0 ? 'green' : 'yellow', 2)}
              </div>
            </div>

            {/* 7 · Property Position Summary — P0-C: two canonical segments */}
            <div className="card overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100 text-sm font-semibold text-gray-900">
                <PieChart size={14} className="text-gray-400" /> Property Position Summary
              </div>

              {/* ── Operating segment → sums to property_real_pl ── */}
              <div className="px-5 py-2 bg-gray-50/60 border-b border-gray-100">
                <span className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">Operating</span>
              </div>
              <div className="divide-y divide-gray-50">
                {([
                  ['Renovation',  renovProfit,  false],
                  ['Management',  mgmtProfit,   false],
                  ['Airbnb',      airbnbResult, false],
                ] as [string, number, boolean][]).map(([label, val, isDash]) => (
                  <div key={label} className="flex items-center justify-between px-5 py-3">
                    <span className="text-sm text-gray-600">{label}</span>
                    <span className={`text-sm font-semibold ${
                      isDash ? 'text-gray-300' : val > 0 ? 'text-green-600' : val < 0 ? 'text-red-600' : 'text-gray-400'
                    }`}>{isDash ? '—' : EUR(val)}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between px-5 py-3 bg-blue-50/40 border-t border-blue-100">
                  <span className="text-sm font-semibold text-gray-900">Operating / Real P&amp;L</span>
                  <span className={`text-base font-bold ${realPL >= 0 ? 'text-green-600' : 'text-red-600'}`}>{EUR(realPL)}</span>
                </div>
              </div>

              {/* ── Capital segment → sums to property_capital_position ── */}
              <div className="px-5 py-2 bg-gray-50/60 border-y border-gray-100 mt-1">
                <span className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">Capital</span>
              </div>
              <div className="divide-y divide-gray-50">
                <div className="flex items-center justify-between px-5 py-3">
                  <span className="text-sm text-gray-600">JJ Investment</span>
                  <span className={`text-sm font-semibold ${invested > 0 ? 'text-red-600' : 'text-gray-400'}`}>{EUR(-invested)}</span>
                </div>
                {num(s.partner_purchase_contributed) > 0 && (
                  <div className="flex items-center justify-between px-5 py-3">
                    <span className="text-sm text-gray-600">Partner Capital</span>
                    <span className="text-sm font-semibold text-red-600">{EUR(-num(s.partner_purchase_contributed))}</span>
                  </div>
                )}
                {num(s.sale_contract) > 0 && (
                  <div className="flex items-center justify-between px-5 py-3">
                    <span className="text-sm text-gray-600">Sale / Capital Return</span>
                    <span className={`text-sm font-semibold ${saleResult >= 0 ? 'text-green-600' : 'text-red-600'}`}>{EUR(saleResult)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between px-5 py-3.5 bg-gray-50">
                  <span className="text-sm font-semibold text-gray-900">Capital Position</span>
                  <span className={`text-base font-bold ${capitalPosition >= 0 ? 'text-green-600' : 'text-red-600'}`}>{EUR(capitalPosition)}</span>
                </div>
              </div>
            </div>

          </div>
        )
      })()}

      {/* Ownership Section */}
      <div className="card p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <PieChart size={16} className="text-brand-500" />
            <h2 className="font-semibold text-gray-900 text-sm">Ownership</h2>
            {owners.length > 0 && (
              <span className="text-xs text-gray-400">
                ({owners.reduce((s, o) => s + num(o.ownership_pct), 0).toFixed(0)}% assigned)
              </span>
            )}
          </div>
          {!editOwnership ? (
            <button onClick={startEdit}
              className="flex items-center gap-1.5 text-xs text-brand-600 hover:text-brand-800 font-medium">
              <Pencil size={12} /> Edit
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button onClick={cancelEdit} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700">
                <X size={12} /> Cancel
              </button>
              <button onClick={saveOwnership} disabled={ownerSaving}
                className="flex items-center gap-1.5 text-xs bg-brand-500 text-white px-3 py-1.5 rounded-lg hover:bg-brand-600 disabled:opacity-50">
                <Save size={12} /> {ownerSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          )}
        </div>

        {/* View mode */}
        {!editOwnership && (
          owners.length === 0 ? (
            <div className="text-sm text-gray-400 py-2">
              No ownership configured. Click Edit to add owners.
            </div>
          ) : (
            <div className="space-y-2">
              {owners.map(o => (
                <div key={o.id ?? o.owner_name} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-sm text-gray-900">{o.owner_name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${OWNER_TYPE_BADGE[o.owner_type] ?? 'bg-gray-100 text-gray-600'}`}>
                      {OWNER_TYPE_LABEL[o.owner_type] ?? o.owner_type}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-24 bg-gray-100 rounded-full h-1.5">
                      <div className="bg-brand-500 h-1.5 rounded-full" style={{ width: `${Math.min(100, num(o.ownership_pct))}%` }} />
                    </div>
                    <span className="text-sm font-bold text-gray-900 w-12 text-right">{num(o.ownership_pct).toFixed(0)}%</span>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {/* Edit mode */}
        {editOwnership && (
          <div>
            {ownerError && (
              <div className="mb-3 p-2 bg-red-50 border border-red-100 rounded text-xs text-red-600">{ownerError}</div>
            )}
            <div className="space-y-2 mb-3">
              {draftOwners.map((o, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Owner name"
                    value={o.owner_name}
                    onChange={e => updateDraft(idx, 'owner_name', e.target.value)}
                    className="input flex-1 text-sm py-1.5"
                  />
                  <select
                    value={o.owner_type}
                    onChange={e => updateDraft(idx, 'owner_type', e.target.value)}
                    className="input text-sm py-1.5 w-36"
                  >
                    <option value="partner">Partner</option>
                    <option value="investor">Investor</option>
                    <option value="jj">JJ Entity</option>
                    <option value="client">Client (sold)</option>
                    <option value="external">External Owner</option>
                  </select>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.5"
                      value={o.ownership_pct}
                      onChange={e => updateDraft(idx, 'ownership_pct', parseFloat(e.target.value) || 0)}
                      className="input text-sm py-1.5 w-20 text-right"
                    />
                    <span className="text-sm text-gray-500">%</span>
                  </div>
                  <button onClick={() => removeDraft(idx)} className="text-red-400 hover:text-red-600 p-1">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between">
              <button onClick={addOwner}
                className="flex items-center gap-1.5 text-xs text-brand-600 hover:text-brand-800 font-medium">
                <Plus size={13} /> Add Owner
              </button>
              <span className={`text-xs font-semibold ${Math.abs(totalPct - 100) < 0.01 || draftOwners.length === 0 ? 'text-green-600' : 'text-orange-500'}`}>
                Total: {totalPct.toFixed(1)}%
                {draftOwners.length > 0 && Math.abs(totalPct - 100) > 0.01 && ` (need ${(100 - totalPct).toFixed(1)}% more)`}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Category tabs */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {categories.map(cat => {
          const count = cat === 'all' ? transactions.length : transactions.filter(t => t.category === cat).length
          return (
            <button key={cat} onClick={() => setTab(cat)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium capitalize transition-colors ${
                tab === cat ? 'bg-brand-500 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}>
              {cat === 'all' ? 'All' : cat} ({count})
            </button>
          )
        })}
      </div>

      {/* Transactions Table */}
      <div className="card overflow-hidden">
        {loading && <div className="p-8 text-center text-sm text-gray-400">Loading transactions...</div>}
        {!loading && filtered.length === 0 && (
          <div className="p-8 text-center text-sm text-gray-400">No transactions in this category.</div>
        )}
        {!loading && filtered.length > 0 && (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase w-24">
                  <span className="flex items-center gap-1"><Calendar size={11} /> Date</span>
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Category</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Description</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                  <span className="flex items-center gap-1"><User size={11} /> From &rarr; To</span>
                </th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Amount</th>
                {filtered.some(t => t.client_charge && num(t.client_charge) > 0) && (
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Charge</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(tx => {
                const hasCharge = filtered.some(t => t.client_charge && num(t.client_charge) > 0)
                return (
                  <tr key={tx.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">
                      {tx.date ? format(parseISO(tx.date), 'dd/MM/yy') : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`badge text-xs ${CAT_COLOR[tx.category] ?? 'bg-gray-100 text-gray-600'}`}>
                        {tx.category}
                      </span>
                      {tx.subcategory && <div className="text-xs text-gray-400 mt-0.5">{tx.subcategory}</div>}
                    </td>
                    <td className="px-4 py-3 text-gray-700 max-w-xs">
                      <div className="truncate">{tx.description ?? '—'}</div>
                      {tx.notes && <div className="text-xs text-gray-400 truncate">{tx.notes}</div>}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                      <span className="text-gray-700">{tx.payer ?? '—'}</span>
                      <span className="text-gray-300 mx-1">&rarr;</span>
                      <span className="text-gray-700">{tx.payee ?? '—'}</span>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">{EUR(num(tx.amount_eur))}</td>
                    {hasCharge && (
                      <td className="px-4 py-3 text-right text-gray-500">
                        {tx.client_charge && num(tx.client_charge) > 0 ? EUR(num(tx.client_charge)) : '—'}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
            <tfoot className="bg-gray-50 border-t border-gray-200">
              <tr>
                <td colSpan={4} className="px-4 py-3 text-xs text-gray-500 font-medium">
                  {filtered.length} transactions
                </td>
                <td className="px-4 py-3 text-right font-bold text-gray-900">
                  {EUR(filtered.reduce((s, t) => s + num(t.amount_eur), 0))}
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  )
}
