'use client'

// ============================================================
// JJ PROPERTY 10 — Client / Owner Settlement Report v3
// File: src/app/client-report/page.tsx
// Route: /client-report
//
// UI:    Named-section owner statement (RC1 — 2026-07-01)
// Logic: classifyTx returns SectionCls (rich object, mirrors
//        client_report.html exactly)
//
// Sections (12):
//   Operating:  platform | client_payments | charges_billed
//               | renovation | expenses
//   Settlement: settlement
//   Info only:  platform_info | owner_paid_info | sale_info
//               | purchase_info | pending_review | other
//
// Balance (3-stage, matching client_report.html):
//   Stage 1: closingBalance  = openingBalance + Σ balEff (operating)
//   Stage 3: remainingBalance = closingBalance + totalBankPayments
//
// Data sources (read-only — no SQL changed):
//   contacts                  → contact selector
//   v_rpt_contact_properties  → property chips
//   v_rpt_client_transactions → transactions (client_amount, jj_margin)
// ============================================================

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import {
  RefreshCw, FileText, User, Building2, ArrowLeft,
  AlertTriangle, CheckCircle, Calendar, Download, Printer,
  MessageSquare, Mail, ChevronDown, ChevronRight,
  Copy, Check, Eye, EyeOff,
} from 'lucide-react'
import {
  generateOwnerSettlementPdf,
  downloadBlob,
  printBlob,
  shareBlob,
  buildPdfFilename,
} from '@/lib/pdf/generate'
import type { OwnerPdfData, PdfSection } from '@/lib/pdf/types'

/* ─────────────────────────── helpers ─────────────────────────── */

const n = (v: unknown): number => {
  const f = parseFloat(String(v ?? 0))
  return isNaN(f) ? 0 : f
}

const EUR = (v: unknown): string =>
  new Intl.NumberFormat('en-IE', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
  }).format(n(v))

const fmtDate = (d: string): string =>
  new Date(d + 'T00:00:00').toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  })

const todayStr     = (): string => new Date().toISOString().split('T')[0]
const yearStartStr = (): string => `${new Date().getFullYear()}-01-01`

/* ─────────────────────────── types ─────────────────────────── */

// Fields match v_rpt_contact_properties (no RLS — anon-safe)
type Contact = {
  contact_id:   string
  contact_name: string
  contact_type: string | null
}

type ContactProperty = {
  canonical_name: string
  relationship_role: string
  confirmation_status: string
  link_notes: string | null
  jj_relationship_type: string | null
}

type Tx = {
  id: string
  date: string
  canonical_property_name: string
  raw_property_name: string
  category: string
  subcategory: string
  description: string | null
  payer: string | null
  payee: string | null
  amount_eur: number | string
  client_charge: number | string | null
  client_amount: number | string
  jj_margin: number | string
  notes: string | null
  k_note: string | null
}

type SectionKey =
  | 'platform' | 'client_payments' | 'charges_billed'
  | 'renovation' | 'expenses' | 'settlement'
  | 'platform_info' | 'owner_paid_info' | 'sale_info'
  | 'purchase_info' | 'pending_review' | 'other'

// Rich classification object — mirrors client_report.html classifyTx return shape
type SectionCls = {
  section:  SectionKey
  label:    string
  credit:   number    // income credited to owner
  debit:    number    // expense/charge debited to owner
  balEff:   number    // net balance effect:
                      //   +ve → owner owes JJ more
                      //   −ve → JJ owes owner more
  infoOnly: boolean
}

type ClassifiedTx = Tx & { _cls: SectionCls }

type ViewMode = 'client' | 'internal'

type OpeningBalanceEntry = {
  balance_eur: number
  as_of_date:  string | null
  id:          string | null
  source:      'db' | 'default'
}

/* ─────────────────────────── section config ─────────────────────────── */

type SectionDir   = 'credit' | 'debit' | 'neutral'
type SectionBadge = 'credit' | 'debit' | 'neutral'

type SectionDef = {
  key:       SectionKey
  title:     string
  emoji:     string
  badge:     SectionBadge
  dir:       SectionDir
  operating: boolean   // true → contributes to closingBalance
}

const SECTION_DEFS: SectionDef[] = [
  // ── Operating (balance-affecting) ──────────────────────────
  { key: 'platform',        title: 'Platform Income & Rent',              emoji: '💳', badge: 'credit',  dir: 'credit',  operating: true  },
  { key: 'client_payments', title: 'Client Payments Received',            emoji: '✅', badge: 'credit',  dir: 'credit',  operating: true  },
  { key: 'charges_billed',  title: 'Charges',                             emoji: '📋', badge: 'debit',   dir: 'debit',   operating: true  },
  { key: 'renovation',      title: 'Renovation Costs',                    emoji: '🔨', badge: 'debit',   dir: 'debit',   operating: true  },
  { key: 'expenses',        title: 'Property Expenses Paid by JJ',        emoji: '🧾', badge: 'debit',   dir: 'debit',   operating: true  },
  // ── Settlement ─────────────────────────────────────────────
  { key: 'settlement',      title: 'Payments Sent to You',                emoji: '🏦', badge: 'debit',   dir: 'debit',   operating: false },
  // ── Informational only ──────────────────────────────────────
  { key: 'platform_info',   title: 'Platform Information',                emoji: '📊', badge: 'neutral', dir: 'neutral', operating: false },
  { key: 'owner_paid_info', title: 'Expenses You Paid Directly',          emoji: '👤', badge: 'neutral', dir: 'neutral', operating: false },
  { key: 'sale_info',       title: 'Sale & Purchase Information',         emoji: '📝', badge: 'neutral', dir: 'neutral', operating: false },
  { key: 'purchase_info',   title: 'Purchase Information',                emoji: '📝', badge: 'neutral', dir: 'neutral', operating: false },
  { key: 'pending_review',  title: 'Pending Review',                      emoji: '⏳', badge: 'neutral', dir: 'neutral', operating: false },
  { key: 'other',           title: 'Other',                               emoji: '⬜', badge: 'neutral', dir: 'neutral', operating: false },
]

const SECTION_KEY_ORDER: SectionKey[] = SECTION_DEFS.map(d => d.key)

type SectionTotals = Record<SectionKey, {
  credit: number
  debit:  number
  balEff: number
  rows:   ClassifiedTx[]
}>

/* ─────────────────── RC1 classification (rich-object, mirrors HTML) ─────────────────── */

const JJ_PAYERS         = new Set(['yossi', 'jacob', 'jj', 'anastasia'])
const CLIENT_PAYERS     = new Set(['client', 'owner', 'tenant'])
const PLATFORM_PAYERS   = new Set(['airbnb'])
const SKIP_EXPENSE_SUBS = new Set([
  'client payment', 'bank payment to owner', 'renovation contract',
  'sale contract', 'purchase contract', 'third-party payment',
  'deposit', 'deposit refund', 'transfer',
])
// All pending decisions resolved 2026-06-30 — set is empty
const PENDING_REVIEW_IDS = new Set<string>([])

// RC1-validated priority chain (2026-06-30).
// Mirrors client_report.html classifyTx exactly.
// Returns SectionCls used by section aggregation + render layer.
function classifyTx(tx: Tx): SectionCls {
  const payer    = (tx.payer       ?? '').toLowerCase().trim()
  const cat      =  tx.category    ?? ''
  const sub      =  tx.subcategory ?? ''
  const subLo    = sub.toLowerCase().trim()
  const hasPayer = !!tx.payer
  const amt      = n(tx.amount_eur)
  const cc       = n(tx.client_charge)

  // 1. PENDING REVIEW
  if (PENDING_REVIEW_IDS.has(tx.id))
    return { section: 'pending_review', label: sub || 'Pending Review',
             credit: 0, debit: 0, balEff: 0, infoOnly: true }

  // 2. A4: Bank Payment to Owner → settlement (BEFORE A6)
  if (subLo === 'bank payment to owner' && JJ_PAYERS.has(payer))
    return { section: 'settlement', label: 'Bank Payment to Owner',
             credit: 0, debit: amt, balEff: 0, infoOnly: false }

  // 3. Non-cash contracts / Third-Party (BEFORE A5 & A6)
  if (subLo === 'sale contract')
    return { section: 'sale_info', label: 'Sale Contract Value',
             credit: 0, debit: amt, balEff: 0, infoOnly: true }
  if (subLo === 'purchase contract')
    return { section: 'purchase_info', label: 'Purchase Contract Value',
             credit: 0, debit: amt, balEff: 0, infoOnly: true }
  if (subLo === 'third-party payment')
    return { section: 'sale_info', label: 'Third-Party Payment',
             credit: amt, debit: 0, balEff: 0, infoOnly: true }

  // 4. Platform Income (BEFORE A6)
  if (subLo === 'platform income')
    return { section: 'platform', label: 'Platform Income',
             credit: amt, debit: 0, balEff: -amt, infoOnly: false }

  // 5. Tenant Payment (BEFORE A6)
  if (subLo === 'tenant payment' && payer === 'tenant')
    return { section: 'platform', label: 'Rent Collected',
             credit: amt, debit: 0, balEff: -amt, infoOnly: false }

  // 5b. Staff Accommodation Rent — C2 (confirmed 2026-06-30)
  if (cat === 'Management' && subLo === 'staff accommodation rent')
    return { section: 'platform', label: 'Staff Accommodation Rent',
             credit: amt, debit: 0, balEff: -amt, infoOnly: false }

  // 6. A1: Airbnb Mgmt Fee — already in NET Platform Income (BEFORE A6)
  if (cat === 'Airbnb' && subLo === 'management fee' &&
      (PLATFORM_PAYERS.has(payer) || payer === 'jj'))
    return { section: 'platform_info', label: 'Mgmt Fee (in Net Income)',
             credit: 0, debit: 0, balEff: 0, infoOnly: true }

  // 7. A2: Platform Cleaning — already in NET (BEFORE A6) — Rule 2.5
  //    Company-payer cleaning falls through to JJ catch-all → real expense
  if (cat === 'Airbnb' && subLo === 'cleaning' && PLATFORM_PAYERS.has(payer))
    return { section: 'platform_info', label: 'Cleaning (in Net Income)',
             credit: 0, debit: 0, balEff: 0, infoOnly: true }

  // 8. A6: client_charge > 0 → bill at client_charge (fires only for unprotected rows)
  if (cc > 0)
    return { section: 'charges_billed', label: sub || 'Charge Billed',
             credit: 0, debit: cc, balEff: +cc, infoOnly: false }

  // 9. A3: Owner-paid transactions — split by payee
  //    payee=JJ  → financial impact: credit (client settling) or debit (JJ billed owner)
  //    payee≠JJ  → owner paid a contractor directly — informational only
  if (payer === 'owner' && amt > 0) {
    const payeeStr = (tx.payee ?? '').toLowerCase().trim()
    if (payeeStr === 'jj') {
      // Owner paying JJ to settle a balance → credit
      const OWNER_CREDIT_SUBS = new Set(['client payment', 'bank payment to owner'])
      if (OWNER_CREDIT_SUBS.has(subLo))
        return { section: 'client_payments', label: sub || 'Client Payment',
                 credit: amt, debit: 0, balEff: -amt, infoOnly: false }
      // Owner billed by JJ for a service (management fee, hosting supplies, etc.) → debit
      return { section: 'expenses', label: sub || 'Expense (Owner Billed)',
               credit: 0, debit: amt, balEff: +amt, infoOnly: false }
    }
    // Owner paid a contractor directly — informational only, zero balance impact
    return { section: 'owner_paid_info', label: sub || 'Owner-Paid Expense',
             credit: 0, debit: 0, balEff: 0, infoOnly: true }
  }

  // 10. A5: Client cash payment
  if (payer === 'client' && amt > 0) {
    const FEE_SUBS = new Set([
      'design fee', 'management fee', 'photography',
      'setup cost', 'setup', 'photography fee',
    ])
    if (FEE_SUBS.has(subLo))
      return { section: 'charges_billed', label: sub + ' (Client Paid)',
               credit: 0, debit: amt, balEff: +amt, infoOnly: false }
    return { section: 'client_payments', label: sub || 'Client Payment',
             credit: amt, debit: 0, balEff: -amt, infoOnly: false }
  }

  // 11. Explicit Client Payment subcategory
  if (subLo === 'client payment' && CLIENT_PAYERS.has(payer))
    return { section: 'client_payments', label: 'Client Payment',
             credit: amt, debit: 0, balEff: -amt, infoOnly: false }

  // Deposits (non-JJ payer) — tracking only
  if ((subLo === 'deposit' || subLo === 'deposit refund') && !JJ_PAYERS.has(payer))
    return { section: 'other', label: sub,
             credit: 0, debit: 0, balEff: 0, infoOnly: true }

  // Renovation contract (no payer = contract record)
  if (subLo === 'renovation contract' && !hasPayer)
    return { section: 'renovation', label: 'Renovation Contract',
             credit: 0, debit: amt, balEff: +amt, infoOnly: false }

  // Renovation extras
  if (subLo === 'extras' && cat === 'Renovation') {
    if (JJ_PAYERS.has(payer))
      return { section: 'expenses', label: 'Extras (JJ Paid)',
               credit: 0, debit: amt, balEff: +amt, infoOnly: false }
    return { section: 'other', label: 'Extras (Pending)',
             credit: 0, debit: 0, balEff: 0, infoOnly: true }
  }

  // JJ catch-all — Rule 2.3
  if (JJ_PAYERS.has(payer) && !SKIP_EXPENSE_SUBS.has(subLo))
    return { section: 'expenses', label: sub || 'Expense',
             credit: 0, debit: amt, balEff: +amt, infoOnly: false }

  return { section: 'other', label: sub || 'Other',
           credit: 0, debit: 0, balEff: 0, infoOnly: true }
}

/* ─────────────────── aggregation ─────────────────── */

function emptySectionTotals(): SectionTotals {
  const out = {} as SectionTotals
  for (const k of SECTION_KEY_ORDER)
    out[k] = { credit: 0, debit: 0, balEff: 0, rows: [] }
  return out
}

function buildSectionTotals(txns: Tx[]): SectionTotals {
  const totals = emptySectionTotals()
  for (const tx of txns) {
    const cls = classifyTx(tx)
    const t   = totals[cls.section]
    t.credit += cls.credit
    t.debit  += cls.debit
    t.balEff += cls.balEff
    t.rows.push({ ...tx, _cls: cls })
  }
  return totals
}

/* ─────────────────── balance (3-stage) ─────────────────── */

type BalanceSummary = {
  totalPlatform:    number
  totalClientPmts:  number
  totalCharges:     number
  totalRenovation:  number
  totalExpenses:    number
  totalBankPayments: number
  closingBalance:   number   // Stage 1 result (before settlement)
  remainingBalance: number   // Stage 3 result (after bank payments)
}

function computeBalance(totals: SectionTotals, openingBalance: number): BalanceSummary {
  const operatingKeys: SectionKey[] = [
    'platform', 'client_payments', 'charges_billed', 'renovation', 'expenses',
  ]
  const totalBalEff    = operatingKeys.reduce((acc, k) => acc + totals[k].balEff, 0)
  const closingBalance = openingBalance + totalBalEff
  const totalBankPayments = totals['settlement'].rows.reduce(
    (s, r) => s + n(r.amount_eur), 0
  )
  const remainingBalance = closingBalance + totalBankPayments

  return {
    totalPlatform:    totals['platform'].credit,
    totalClientPmts:  totals['client_payments'].credit,
    totalCharges:     totals['charges_billed'].debit,
    totalRenovation:  totals['renovation'].debit,
    totalExpenses:    totals['expenses'].debit,
    totalBankPayments,
    closingBalance,
    remainingBalance,
  }
}

/* ─────────────────── section name helper ─────────────────── */

function sectionShortName(k: SectionKey): string {
  const map: Record<SectionKey, string> = {
    platform:        'Platform/Rent',
    client_payments: 'Client Pmts',
    charges_billed:  'Charges Billed',
    renovation:      'Renovation',
    expenses:        'JJ Expenses',
    settlement:      'Bank Payments',
    platform_info:   'Platform Info',
    owner_paid_info: 'Owner-Paid',
    sale_info:       'Sale Info',
    purchase_info:   'Purchase Info',
    pending_review:  'Pending',
    other:           'Other',
  }
  return map[k] ?? k
}

/* ─────────────────── opening balance fetch ─────────────────── */

async function fetchOpeningBalances(
  contactId:     string,
  propertyNames: string[],
  asOfDate:      string,
): Promise<Map<string, OpeningBalanceEntry>> {
  const result = new Map<string, OpeningBalanceEntry>()
  if (!contactId || propertyNames.length === 0) return result

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('contact_opening_balances')
    .select('id, property_name, balance_eur, as_of_date')
    .eq('contact_id', contactId)
    .in('property_name', propertyNames)
    .lte('as_of_date', asOfDate)
    .eq('is_voided', false)
    .order('as_of_date', { ascending: false })

  if (error) {
    console.error('[CR opening balance] fetch error:', error)
  }

  // For each property, take the most recent row (already ordered DESC)
  const seen = new Set<string>()
  for (const row of (data ?? [])) {
    if (!seen.has(row.property_name)) {
      seen.add(row.property_name)
      result.set(row.property_name, {
        balance_eur: parseFloat(row.balance_eur),
        as_of_date:  row.as_of_date,
        id:          row.id,
        source:      'db',
      })
    }
  }

  // Properties with no DB row → default to 0
  for (const p of propertyNames) {
    if (!result.has(p)) {
      result.set(p, { balance_eur: 0, as_of_date: null, id: null, source: 'default' })
    }
  }

  return result
}

/* ─────────────────────────────── sub-components ─────────────────────────────── */

// ── Transaction row inside a section panel ──────────────────────────────────────

function SectionTxRow({ tx, viewMode }: { tx: ClassifiedTx; viewMode: ViewMode }) {
  const cls   = tx._cls
  const amt   = n(tx.amount_eur)
  const cc    = n(tx.client_charge)
  const hasCC = tx.client_charge != null && cc !== 0

  const amtColor =
    cls.credit > 0 ? 'text-green-700' :
    cls.debit  > 0 ? 'text-red-600'   : 'text-gray-400'

  if (viewMode === 'internal') {
    return (
      <tr className="text-xs border-b border-gray-50 hover:bg-gray-50">
        <td className="py-1.5 px-3 text-gray-400 whitespace-nowrap">{fmtDate(tx.date)}</td>
        <td className="py-1.5 px-3 text-gray-500 max-w-[100px] truncate"
            title={tx.canonical_property_name}>{tx.canonical_property_name}</td>
        <td className="py-1.5 px-3 text-gray-600">{tx.subcategory}</td>
        <td className="py-1.5 px-3 text-gray-600 max-w-[150px] truncate"
            title={tx.description ?? ''}>
          {tx.description}
          {tx.notes && <span className="block text-[10px] text-gray-400">{tx.notes}</span>}
        </td>
        <td className="py-1.5 px-3 text-gray-400">{tx.payer ?? '—'}</td>
        <td className="py-1.5 px-3 text-gray-400">{tx.payee ?? '—'}</td>
        <td className={`py-1.5 px-3 text-right font-mono ${amtColor}`}>{EUR(amt)}</td>
        <td className={`py-1.5 px-3 text-right font-mono ${hasCC ? amtColor : 'text-gray-300'}`}>
          {hasCC ? EUR(cc) : '—'}
        </td>
      </tr>
    )
  }

  // Client view — show billed amount (cc if present, else amount_eur)
  const displayAmt = hasCC ? cc : amt
  return (
    <tr className="text-xs border-b border-gray-50 hover:bg-gray-50">
      <td className="py-1.5 px-3 text-gray-400 whitespace-nowrap">{fmtDate(tx.date)}</td>
      <td className="py-1.5 px-3 text-gray-500 max-w-[110px] truncate"
          title={tx.canonical_property_name}>{tx.canonical_property_name}</td>
      <td className="py-1.5 px-3 text-gray-600">{tx.subcategory}</td>
      <td className="py-1.5 px-3 text-gray-600 max-w-[200px] truncate"
          title={tx.description ?? ''}>
        {tx.description}
        {tx.notes && <span className="block text-[10px] text-gray-400">{tx.notes}</span>}
      </td>
      <td className={`py-1.5 px-3 text-right font-mono font-medium ${amtColor}`}>
        {EUR(displayAmt)}
      </td>
    </tr>
  )
}

// ── Collapsible section panel ───────────────────────────────────────────────────

function SectionPanel({
  def, totals, viewMode, expanded, onToggle,
}: {
  def:      SectionDef
  totals:   SectionTotals
  viewMode: ViewMode
  expanded: boolean
  onToggle: () => void
}) {
  const st   = totals[def.key]
  const rows = st.rows
  if (rows.length === 0) return null

  const displayTotal = def.dir === 'credit' ? st.credit
                     : def.dir === 'debit'  ? st.debit
                     : null

  const totalColor = def.dir === 'credit' ? 'text-green-700'
                   : def.dir === 'debit'  ? 'text-red-600'
                   : 'text-gray-500'

  const badgeCls = def.badge === 'credit'  ? 'bg-green-50 text-green-700 border border-green-100'
                 : def.badge === 'debit'   ? 'bg-red-50 text-red-700 border border-red-100'
                 : 'bg-gray-100 text-gray-500'

  // column counts for footer colspan
  const dataCols  = viewMode === 'internal' ? 2 : 2   // Amount + (Billed)
  const labelCols = viewMode === 'internal' ? 6 : 4   // Date+Prop+Sub+Desc+[Payer+Payee]

  return (
    <div id={`section-${def.key}`} className="card mb-3 overflow-hidden">

      {/* Header */}
      <button
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors text-left"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3">
          {expanded
            ? <ChevronDown  size={14} className="text-gray-400 shrink-0" />
            : <ChevronRight size={14} className="text-gray-400 shrink-0" />}
          <span className="text-sm">{def.emoji}</span>
          <span className="text-sm font-semibold text-gray-800">{def.title}</span>
          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${badgeCls}`}>
            {rows.length} row{rows.length !== 1 ? 's' : ''}
          </span>
          {def.dir === 'neutral' && (
            <span className="text-[10px] text-gray-400 italic">informational — not in balance</span>
          )}
        </div>
        {displayTotal != null && displayTotal > 0 && (
          <span className={`text-sm font-semibold font-mono ${totalColor}`}>
            {EUR(displayTotal)}
          </span>
        )}
      </button>

      {/* Transaction table */}
      {expanded && (
        <div className="border-t border-gray-100 overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-[10px] text-gray-400 uppercase tracking-wider bg-gray-50 border-b border-gray-100">
                <th className="py-2 px-3 text-left font-medium">Date</th>
                <th className="py-2 px-3 text-left font-medium">Property</th>
                <th className="py-2 px-3 text-left font-medium">{viewMode === 'client' ? 'Type' : 'Subcategory'}</th>
                <th className="py-2 px-3 text-left font-medium">Description</th>
                {viewMode === 'internal' ? (
                  <>
                    <th className="py-2 px-3 text-left font-medium">Payer</th>
                    <th className="py-2 px-3 text-left font-medium">Payee</th>
                    <th className="py-2 px-3 text-right font-medium">Amount €</th>
                    <th className="py-2 px-3 text-right font-medium">Billed €</th>
                  </>
                ) : (
                  <th className="py-2 px-3 text-right font-medium">Amount</th>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map(tx => (
                <SectionTxRow key={tx.id} tx={tx} viewMode={viewMode} />
              ))}
            </tbody>
            <tfoot>
              <tr className="text-xs font-semibold bg-gray-50 border-t-2 border-gray-200">
                <td className="py-2 px-3" colSpan={labelCols}>Total</td>
                <td className={`py-2 px-3 text-right font-mono ${totalColor}`}>
                  {EUR(rows.reduce((s, r) => s + n(r.amount_eur), 0))}
                </td>
                {viewMode === 'internal' && (
                  <td className={`py-2 px-3 text-right font-mono ${totalColor}`}>
                    {EUR(rows.reduce((s, r) =>
                      s + (r.client_charge != null ? n(r.client_charge) : n(r.amount_eur)), 0
                    ))}
                  </td>
                )}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}

// ── 3-stage Settlement Summary ──────────────────────────────────────────────────

function SettlementSummary({
  openingBalance,
  openingBalanceSource,
  viewMode,
  totals,
  onOpeningBalanceChange,
  onOpeningBalanceEdit,
}: {
  openingBalance:          number
  openingBalanceSource:    'db' | 'mixed' | 'default' | 'manual'
  viewMode:                ViewMode
  totals:                  SectionTotals
  onOpeningBalanceChange:  (v: number) => void
  onOpeningBalanceEdit:    () => void
}) {
  const b = computeBalance(totals, openingBalance)

  const closingLabel   = b.closingBalance > 0.005
    ? (viewMode === 'client' ? 'Closing: Amount Due to JJ'  : 'Closing: Client owes JJ')
    : b.closingBalance < -0.005
    ? (viewMode === 'client' ? 'Closing: Amount Due to You' : 'Closing: JJ owes Client')
    : (viewMode === 'client' ? 'Closing: No Balance Outstanding' : 'Closing: Balanced')
  const closingColor   = b.closingBalance > 0.005   ? 'text-red-600'
                       : b.closingBalance < -0.005  ? 'text-green-700'
                       : 'text-gray-500'

  const remainLabel    = b.remainingBalance > 0.005
    ? (viewMode === 'client' ? 'Remaining: Amount Due to JJ'  : 'Remaining: Client owes JJ')
    : b.remainingBalance < -0.005
    ? (viewMode === 'client' ? 'Remaining: Amount Due to You' : 'Remaining: JJ owes Client')
    : (viewMode === 'client' ? 'No Balance Outstanding'       : 'Fully Settled')
  const remainColor    = b.remainingBalance > 0.005  ? 'text-red-600'
                       : b.remainingBalance < -0.005 ? 'text-green-700'
                       : 'text-gray-500'

  const obLabel =
    openingBalanceSource === 'db'     ? 'Opening Balance (from records)'    :
    openingBalanceSource === 'mixed'  ? 'Opening Balance (partial records)' :
    openingBalanceSource === 'manual' ? 'Opening Balance (manually adjusted)' :
                                        'Opening Balance'

  const isEditable = openingBalanceSource === 'default' || openingBalanceSource === 'manual'
  const isDbLocked = openingBalanceSource === 'db' || openingBalanceSource === 'mixed'

  return (
    <div className="card mb-4 overflow-hidden">

      {/* Panel header */}
      <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-800">📊 Settlement Summary</h3>
        {viewMode === 'internal' && (
          <div className="flex items-center gap-2 no-print">
            {isEditable ? (
              <>
                <span className="text-xs text-gray-400">{obLabel} €</span>
                <input
                  type="number"
                  step="0.01"
                  value={openingBalance}
                  onChange={e => onOpeningBalanceChange(parseFloat(e.target.value) || 0)}
                  className="w-24 border border-gray-200 rounded px-2 py-1 text-xs text-right font-mono
                             focus:outline-none focus:ring-1 focus:ring-brand-400"
                />
                <span className="text-[10px] text-gray-400">+ve = client owes JJ</span>
              </>
            ) : isDbLocked ? (
              <>
                <span className="text-xs text-gray-400">{obLabel}</span>
                <span className={`text-sm font-mono font-medium ${openingBalance >= 0 ? 'text-red-600' : 'text-green-700'}`}>
                  {openingBalance >= 0 ? `+${EUR(openingBalance)}` : EUR(openingBalance)}
                </span>
                <button
                  onClick={onOpeningBalanceEdit}
                  className="text-xs text-brand-600 hover:underline ml-1"
                >
                  Edit
                </button>
              </>
            ) : null}
          </div>
        )}
      </div>

      {/* Stage 1 — Operating Ledger */}
      <div className="px-5 py-4 border-b border-gray-100">
        <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold mb-3">
          {viewMode === 'client' ? 'Activity During This Period' : 'Stage 1 — Operating Ledger'}
        </p>
        <table className="w-full text-sm">
          <tbody>
            <tr>
              <td className="py-1 text-gray-600">
                Opening Balance
                {viewMode === 'internal' && openingBalanceSource !== 'default' && (
                  <span className="ml-1.5 text-[10px] text-gray-400 font-normal">
                    ({openingBalanceSource === 'db'     ? 'from records' :
                       openingBalanceSource === 'mixed' ? 'partial records' :
                       'manual'})
                  </span>
                )}
              </td>
              <td className={`py-1 text-right font-mono font-medium
                             ${openingBalance >= 0 ? 'text-red-600' : 'text-green-700'}`}>
                {openingBalance >= 0 ? `+${EUR(openingBalance)}` : EUR(openingBalance)}
              </td>
            </tr>
            {b.totalPlatform > 0 && (
              <tr>
                <td className="py-0.5 pl-6 text-gray-400 text-xs">
                  − Platform Income / Rent Collected
                </td>
                <td className="py-0.5 text-right font-mono text-green-700 text-xs">
                  {EUR(b.totalPlatform)}
                </td>
              </tr>
            )}
            {b.totalClientPmts > 0 && (
              <tr>
                <td className="py-0.5 pl-6 text-gray-400 text-xs">
                  − Client Payments Received
                </td>
                <td className="py-0.5 text-right font-mono text-green-700 text-xs">
                  {EUR(b.totalClientPmts)}
                </td>
              </tr>
            )}
            {b.totalCharges > 0 && (
              <tr>
                <td className="py-0.5 pl-6 text-gray-400 text-xs">
                  + Charges Billed to Client
                </td>
                <td className="py-0.5 text-right font-mono text-red-600 text-xs">
                  {EUR(b.totalCharges)}
                </td>
              </tr>
            )}
            {b.totalRenovation > 0 && (
              <tr>
                <td className="py-0.5 pl-6 text-gray-400 text-xs">
                  + Renovation Billed
                </td>
                <td className="py-0.5 text-right font-mono text-red-600 text-xs">
                  {EUR(b.totalRenovation)}
                </td>
              </tr>
            )}
            {b.totalExpenses > 0 && (
              <tr>
                <td className="py-0.5 pl-6 text-gray-400 text-xs">
                  + Expenses Paid by JJ
                </td>
                <td className="py-0.5 text-right font-mono text-red-600 text-xs">
                  {EUR(b.totalExpenses)}
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-200">
              <td className="pt-2.5 font-semibold text-gray-800">{closingLabel}</td>
              <td className={`pt-2.5 text-right font-mono font-semibold ${closingColor}`}>
                {EUR(Math.abs(b.closingBalance))}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Stage 3 — Settlement (only if bank payments exist) */}
      {b.totalBankPayments > 0 && (
        <div className="px-5 py-4">
          <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold mb-3">
            {viewMode === 'client' ? 'Payments & Balance' : 'Stage 3 — Settlement'}
          </p>
          <table className="w-full text-sm">
            <tbody>
              <tr>
                <td className="py-1 text-gray-600">Closing Balance Carried Forward</td>
                <td className={`py-1 text-right font-mono font-medium ${closingColor}`}>
                  {EUR(Math.abs(b.closingBalance))}
                </td>
              </tr>
              <tr>
                <td className="py-0.5 pl-6 text-gray-400 text-xs">
                  − Bank Payment(s) Sent to Owner
                </td>
                <td className="py-0.5 text-right font-mono text-green-700 text-xs">
                  {EUR(b.totalBankPayments)}
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-200">
                <td className="pt-2.5 font-semibold text-gray-800">{remainLabel}</td>
                <td className={`pt-2.5 text-right font-mono font-semibold ${remainColor}`}>
                  {EUR(Math.abs(b.remainingBalance))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}

// ── All Transactions drill-down ─────────────────────────────────────────────────

function AllTxDrilldown({ txns, viewMode }: { txns: ClassifiedTx[]; viewMode: ViewMode }) {
  const [expanded,     setExpanded]     = useState(false)
  const [activeFilter, setActiveFilter] = useState<SectionKey | 'all'>('all')

  const presentSections = Array.from(new Set(txns.map(t => t._cls.section)))
  const filtered        = activeFilter === 'all'
    ? txns
    : txns.filter(t => t._cls.section === activeFilter)

  return (
    <div className="card mb-4 overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors text-left"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center gap-3">
          {expanded
            ? <ChevronDown  size={14} className="text-gray-400" />
            : <ChevronRight size={14} className="text-gray-400" />}
          <span className="text-sm">🔍</span>
          <span className="text-sm font-semibold text-gray-800">All Transactions</span>
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
            {txns.length} total
          </span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-100">
          {/* Section filter chips */}
          <div className="flex flex-wrap gap-1.5 px-5 py-3 border-b border-gray-100">
            <button
              onClick={() => setActiveFilter('all')}
              className={`px-2.5 py-1 rounded-full text-[11px] border transition-all
                         ${activeFilter === 'all'
                           ? 'bg-brand-600 border-brand-600 text-white'
                           : 'bg-white border-gray-200 text-gray-500 hover:border-brand-300'}`}
            >
              All ({txns.length})
            </button>
            {presentSections.map(sk => {
              const count = txns.filter(t => t._cls.section === sk).length
              return (
                <button key={sk}
                  onClick={() => setActiveFilter(sk)}
                  className={`px-2.5 py-1 rounded-full text-[11px] border transition-all
                             ${activeFilter === sk
                               ? 'bg-brand-600 border-brand-600 text-white'
                               : 'bg-white border-gray-200 text-gray-500 hover:border-brand-300'}`}
                >
                  {sectionShortName(sk)} ({count})
                </button>
              )
            })}
          </div>

          {/* Full transaction table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-[10px] text-gray-400 uppercase tracking-wider bg-gray-50 border-b border-gray-100">
                  <th className="py-2 px-3 text-left font-medium">Date</th>
                  <th className="py-2 px-3 text-left font-medium">Property</th>
                  <th className="py-2 px-3 text-left font-medium">Category</th>
                  <th className="py-2 px-3 text-left font-medium">Subcategory</th>
                  <th className="py-2 px-3 text-left font-medium">Description</th>
                  <th className="py-2 px-3 text-left font-medium">Payer</th>
                  <th className="py-2 px-3 text-left font-medium">Payee</th>
                  <th className="py-2 px-3 text-right font-medium">Amount €</th>
                  <th className="py-2 px-3 text-right font-medium">Billed €</th>
                  <th className="py-2 px-3 text-left font-medium">Section</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(tx => {
                  const cls    = tx._cls
                  const hasCC  = tx.client_charge != null && n(tx.client_charge) !== 0
                  const amtClr = cls.credit > 0 ? 'text-green-700'
                               : cls.debit  > 0 ? 'text-red-600'
                               : 'text-gray-400'
                  const def    = SECTION_DEFS.find(d => d.key === cls.section)
                  const badgeCls = def?.badge === 'credit' ? 'bg-green-50 text-green-700'
                                 : def?.badge === 'debit'  ? 'bg-red-50 text-red-700'
                                 : 'bg-gray-100 text-gray-500'
                  return (
                    <tr key={tx.id} className="text-xs border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-1.5 px-3 text-gray-400 whitespace-nowrap">
                        {fmtDate(tx.date)}
                      </td>
                      <td className="py-1.5 px-3 text-gray-500 max-w-[90px] truncate"
                          title={tx.canonical_property_name}>
                        {tx.canonical_property_name}
                      </td>
                      <td className="py-1.5 px-3 text-gray-400">{tx.category}</td>
                      <td className="py-1.5 px-3 text-gray-600">{tx.subcategory}</td>
                      <td className="py-1.5 px-3 text-gray-600 max-w-[140px] truncate"
                          title={tx.description ?? ''}>
                        {tx.description}
                      </td>
                      <td className="py-1.5 px-3 text-gray-400">{tx.payer ?? '—'}</td>
                      <td className="py-1.5 px-3 text-gray-400">{tx.payee ?? '—'}</td>
                      <td className={`py-1.5 px-3 text-right font-mono ${amtClr}`}>
                        {EUR(n(tx.amount_eur))}
                      </td>
                      <td className={`py-1.5 px-3 text-right font-mono
                                     ${hasCC ? amtClr : 'text-gray-300'}`}>
                        {hasCC ? EUR(n(tx.client_charge)) : '—'}
                      </td>
                      <td className="py-1.5 px-3">
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${badgeCls}`}>
                          {sectionShortName(cls.section)}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════ */
export default function ClientReportPage() {

  /* ── contacts ── */
  const [contacts,        setContacts]        = useState<Contact[]>([])
  const [contactsLoading, setContactsLoading] = useState(true)
  const [selectedId,      setSelectedId]      = useState<string>('')

  /* ── properties ── */
  const [properties,     setProperties]    = useState<ContactProperty[]>([])  // contact-linked (for warnings)
  const [allClientProps, setAllClientProps] = useState<string[]>([])           // all client props for search
  const [propsLoading,   setPropsLoading]  = useState(false)
  const [propSearch,     setPropSearch]    = useState<string>('')
  const [selectedProps,  setSelectedProps] = useState<string[]>([])

  /* ── category / subcategory filters ── */
  const ALL_CATEGORIES = ['Airbnb', 'Management', 'Renovation', 'Sale', 'Purchase', 'JJ', 'Transfer', 'General']
  const [selectedCategories,  setSelectedCategories]  = useState<string[]>([])   // empty = all
  const [subcategorySearch,   setSubcategorySearch]   = useState<string>('')

  /* ── date range + opening balance ── */
  const [fromDate,             setFromDate]             = useState<string>('2023-01-01')
  const [toDate,               setToDate]               = useState<string>(todayStr())
  const [openingBalance,       setOpeningBalance]       = useState<number>(0)
  const [openingBalanceSource, setOpeningBalanceSource] = useState<'db' | 'mixed' | 'default' | 'manual'>('default')
  const [openingBalanceMap,    setOpeningBalanceMap]    = useState<Map<string, OpeningBalanceEntry>>(new Map())

  /* ── report state ── */
  const [transactions,  setTransactions]  = useState<Tx[]>([])
  const [sectionTotals, setSectionTotals] = useState<SectionTotals | null>(null)
  const [reportReady,   setReportReady]   = useState(false)
  const [generating,    setGenerating]    = useState(false)
  const [generatedAt,   setGeneratedAt]   = useState<string>('')

  /* ── UI controls ── */
  const [viewMode,          setViewMode]          = useState<ViewMode>('client')
  const [expandedSections,  setExpandedSections]  = useState<Set<SectionKey>>(new Set())

  /* ── filter panel collapse ── */
  const [filtersExpanded, setFiltersExpanded] = useState(true)

  /* ── export UI ── */
  const [copied, setCopied] = useState(false)

  /* ── PDF engine ── */
  const [pdfGenerating, setPdfGenerating] = useState(false)
  const [showPdfMenu,   setShowPdfMenu]   = useState(false)
  const [pdfError,      setPdfError]      = useState<string | null>(null)

  /* ── Load contacts on mount ──
   *  Use v_rpt_contact_properties (relrowsecurity=false) instead of
   *  the `contacts` table (RLS: auth.role()='authenticated' blocks anon).
   *  Deduplicate by contact_id so each owner appears once.
   */
  useEffect(() => {
    setContactsLoading(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(supabase as any)
      .from('v_rpt_contact_properties')
      .select('contact_id, contact_name, contact_type')
      .order('contact_name')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then(({ data, error }: any) => {
        console.log('[CR contacts] data:', data, 'error:', error)
        if (error) {
          console.error('[CR contacts] Supabase error:', error)
          setContactsLoading(false)
          return
        }
        // Deduplicate: one entry per contact_id
        const seen  = new Set<string>()
        const dedup = (data ?? []).filter((c: Contact) => {
          if (seen.has(c.contact_id)) return false
          seen.add(c.contact_id)
          return true
        })
        setContacts(dedup)
        setContactsLoading(false)
      })
      .catch((err: unknown) => {
        console.error('[CR contacts] Promise rejected:', err)
        setContactsLoading(false)
      })
  }, [])

  /* ── Load all client properties on mount (for direct property search) ── */
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(supabase as any)
      .from('property_definitions')
      .select('property_name')
      .eq('relationship_type', 'client')
      .order('property_name')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then(({ data, error }: any) => {
        console.log('[CR props] data:', data, 'error:', error)
        if (error) {
          console.error('[CR props] Supabase error:', error)
          return
        }
        setAllClientProps((data ?? []).map((p: { property_name: string }) => p.property_name))
      })
      .catch((err: unknown) => {
        console.error('[CR props] Promise rejected:', err)
      })
  }, [])

  /* ── Load properties when contact changes ── */
  useEffect(() => {
    if (!selectedId) {
      setProperties([])
      setSelectedProps([])
      setReportReady(false)
      setOpeningBalance(0)
      setOpeningBalanceSource('default')
      setOpeningBalanceMap(new Map())
      return
    }
    setPropsLoading(true)
    setReportReady(false)
    supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from('v_rpt_contact_properties' as any)
      .select('canonical_name, relationship_role, confirmation_status, link_notes, jj_relationship_type')
      .eq('contact_id', selectedId)
      .order('canonical_name')
      .then(({ data }) => {
        const props = (data ?? []) as ContactProperty[]
        setProperties(props)
        setSelectedProps(props.map(p => p.canonical_name))
        setPropsLoading(false)
      })
  }, [selectedId])

  /* ── Generate report ── */
  async function generate() {
    if (selectedProps.length === 0) return
    setGenerating(true)
    setReportReady(false)
    setExpandedSections(new Set())

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q = (supabase as any)
      .from('v_rpt_client_transactions')
      .select('*')
      .in('canonical_property_name', selectedProps)
      .gte('date', fromDate)
      .lte('date', toDate)
      .order('date')

    // Server-side category filter (reduces payload)
    if (selectedCategories.length > 0)
      q = q.in('category', selectedCategories)

    const { data } = await q

    let txns: Tx[] = data ?? []

    // Client-side subcategory search (fast, no extra round-trip)
    if (subcategorySearch.trim()) {
      const needle = subcategorySearch.trim().toLowerCase()
      txns = txns.filter(t =>
        (t.subcategory ?? '').toLowerCase().includes(needle) ||
        (t.description ?? '').toLowerCase().includes(needle)
      )
    }

    // Fetch opening balances from DB (per selected contact + properties + fromDate)
    if (selectedId) {
      const obMap     = await fetchOpeningBalances(selectedId, selectedProps, fromDate)
      const obValues  = Array.from(obMap.values())
      const totalOB   = obValues.reduce((s, e) => s + e.balance_eur, 0)
      const hasAnyDb  = obValues.some(e => e.source === 'db')
      const hasAnyDef = obValues.some(e => e.source === 'default')
      const src: 'db' | 'mixed' | 'default' =
        hasAnyDb && hasAnyDef ? 'mixed' : hasAnyDb ? 'db' : 'default'
      setOpeningBalance(totalOB)
      setOpeningBalanceSource(src)
      setOpeningBalanceMap(obMap)
    } else {
      setOpeningBalance(0)
      setOpeningBalanceSource('default')
      setOpeningBalanceMap(new Map())
    }

    setTransactions(txns)
    setSectionTotals(buildSectionTotals(txns))
    setGeneratedAt(new Date().toLocaleString('en-GB'))
    setReportReady(true)
    setFiltersExpanded(false)
    setGenerating(false)
  }

  /* ── Drill-down: expand section(s) and scroll to the first ── */
  function drillToSection(keys: SectionKey[]) {
    setExpandedSections(prev => {
      const s = new Set(prev)
      for (const k of keys) s.add(k)
      return s
    })
    setTimeout(() => {
      document.getElementById(`section-${keys[0]}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 50)
  }

  /* ── Toggle helpers ── */
  function toggleProp(name: string) {
    setSelectedProps(prev =>
      prev.includes(name) ? prev.filter(p => p !== name) : [...prev, name]
    )
    setReportReady(false)
  }

  function toggleSection(key: SectionKey) {
    setExpandedSections(prev => {
      const s = new Set(prev)
      s.has(key) ? s.delete(key) : s.add(key)
      return s
    })
  }

  function expandAll()   { setExpandedSections(new Set(SECTION_KEY_ORDER)) }
  function collapseAll() { setExpandedSections(new Set()) }

  /* ── PDF engine ── */
  function buildPdfData(): OwnerPdfData {
    if (!bal || !sectionTotals) throw new Error('No report data')
    // Derive opening balance as-of date (earliest DB-sourced date across properties)
    const obDates = Array.from(openingBalanceMap.values())
      .filter(e => e.source === 'db' && e.as_of_date)
      .map(e => e.as_of_date as string)
    const openingBalanceAsOf = obDates.length > 0 ? obDates.sort()[0] : null

    // Count pending_review rows (excluded from balance)
    const pendingReviewCount = sectionTotals['pending_review']?.rows.length ?? 0

        const dir =
      bal.remainingBalance < -0.005 ? 'owed_to_owner' as const :
      bal.remainingBalance >  0.005 ? 'owed_to_jj'   as const : 'settled' as const

    const sections: PdfSection[] = SECTION_DEFS
      .filter(d => (sectionTotals[d.key]?.rows.length ?? 0) > 0)
      .map(d => {
        const st = sectionTotals[d.key]
        return {
          key:          d.key,
          title:        d.title,
          operating:    d.operating,
          isSettlement: d.key === 'settlement',
          totalCredit:  st.credit,
          totalDebit:   st.debit,
          rows: st.rows.map(r => ({
            date:        r.date,
            type:        r.subcategory ?? '',
            description: r.description ?? '',
            amount:      n(r.amount_eur),
            balEff:      r._cls.balEff,
            payer:       r.payer ?? undefined,
            payee:       r.payee ?? undefined,
          })),
        }
      })

    return {
      contactName:       selectedContact?.contact_name ?? '',
      properties:        selectedProps,
      fromDate,
      toDate,
      generatedAt,
      openingBalanceAsOf,
      pendingReviewCount,
      openingBalance,
      totalPlatform:     bal.totalPlatform,
      totalClientPmts:   bal.totalClientPmts,
      totalCharges:      bal.totalCharges,
      totalExpenses:     bal.totalExpenses,
      totalRenovation:   bal.totalRenovation,
      totalBankPayments: bal.totalBankPayments,
      closingBalance:    bal.closingBalance,
      remainingBalance:  bal.remainingBalance,
      direction:         dir,
      sections,
    }
  }

  async function handlePdf(action: 'download' | 'print' | 'whatsapp' | 'email') {
    setShowPdfMenu(false)
    setPdfError(null)
    if (!bal || !sectionTotals) return

    setPdfGenerating(true)
    try {
      const data     = buildPdfData()
      const filename = buildPdfFilename(
        selectedContact?.contact_name ?? 'Report',
        fromDate,
        toDate,
      )
      const blob = await generateOwnerSettlementPdf(data)

      if (action === 'download') {
        downloadBlob(blob, filename)
      } else if (action === 'print') {
        printBlob(blob)
      } else if (action === 'whatsapp') {
        // Download PDF first; user attaches it in WhatsApp
        downloadBlob(blob, filename)
        window.open('https://wa.me/', '_blank')
      } else if (action === 'email') {
        // Download PDF first; user attaches it in their email client
        downloadBlob(blob, filename)
        const subject = encodeURIComponent(
          `${selectedContact?.contact_name ?? ''} — Owner Statement`,
        )
        window.location.href = `mailto:?subject=${subject}`
      }
    } catch (err) {
      console.error('PDF generation error:', err)
      setPdfError('PDF generation failed — please try again.')
    } finally {
      setPdfGenerating(false)
    }
  }

  /* ── Computed values ── */
  const selectedContact = contacts.find(c => c.contact_id === selectedId)
  const needsConfirm    = properties.filter(p => p.confirmation_status === 'needs_confirmation')
  const classifiedTxns  = sectionTotals
    ? SECTION_DEFS.flatMap(d => sectionTotals[d.key].rows)
    : []
  const bal = sectionTotals ? computeBalance(sectionTotals, openingBalance) : null

  /* ── Export helpers ── */
  function buildSummaryText(): string {
    if (!bal || !selectedContact) return ''
    const name     = selectedContact.contact_name
    const propList = selectedProps.join(', ')
    return [
      `*${name} — Owner Statement*`,
      `${fmtDate(fromDate)} – ${fmtDate(toDate)}`,
      `Properties: ${propList}`,
      ``,
      `Platform / Rent:              ${EUR(bal.totalPlatform)}`,
      `Client Payments:              ${EUR(bal.totalClientPmts)}`,
      `Expenses Paid on Your Behalf: ${EUR(bal.totalCharges + bal.totalExpenses + bal.totalRenovation)}`,
      `Payments Sent to You:         ${EUR(bal.totalBankPayments)}`,
      ``,
      bal.remainingBalance > 0.005
        ? `Amount Due to JJ:   ${EUR(bal.remainingBalance)}`
        : bal.remainingBalance < -0.005
        ? `Amount Due to You:  ${EUR(Math.abs(bal.remainingBalance))}`
        : `Status: No Balance Outstanding`,
    ].join('\n')
  }

  async function copyToClipboard(text: string) {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const CSV_SECTION_NAMES: Record<SectionKey, string> = {
    platform:        'Platform / Rent',
    client_payments: 'Client Payments',
    charges_billed:  'Charges',
    renovation:      'Renovation Costs',
    expenses:        'Property Expenses',
    settlement:      'Payments Sent to You',
    platform_info:   'Platform Information',
    owner_paid_info: 'Owner-Paid Expenses',
    sale_info:       'Sale & Purchase Information',
    purchase_info:   'Purchase Information',
    pending_review:  'Pending Review',
    other:           'Other',
  }
  const CSV_HIDDEN = new Set<SectionKey>(['platform_info', 'pending_review'])

  function exportCSV() {
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const headers = [
      'Date','Property','Category','Subcategory','Description',
      'Payer','Payee','Amount EUR','Billed EUR',
      'Section','Balance Effect',
    ]
    const rows = classifiedTxns
      .filter(tx => !CSV_HIDDEN.has(tx._cls.section))
      .map(tx => [
        tx.date, tx.canonical_property_name, tx.category, tx.subcategory,
        tx.description, tx.payer, tx.payee,
        n(tx.amount_eur).toFixed(2),
        (tx.client_charge != null ? n(tx.client_charge) : n(tx.amount_eur)).toFixed(2),
        CSV_SECTION_NAMES[tx._cls.section] ?? tx._cls.section,
        tx._cls.balEff.toFixed(2),
      ].map(esc).join(','))

    const csv  = [headers.join(','), ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `${(selectedContact?.contact_name ?? 'report').replace(/\s+/g,'_')}_${fromDate}_${toDate}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  /* ════════════════════════════════ RENDER ════════════════════════════════ */
  return (
    <div className="p-8 max-w-6xl mx-auto print:p-4 print:max-w-none">

      <style>{`
        @media print {
          .no-print { display: none !important; }
          .card { box-shadow: none !important; border: 1px solid #e5e7eb !important; }
          .print-title-bar { display: none !important; }
          body { font-size: 11pt !important; color: #111 !important; }
          @page { margin: 1.8cm; size: A4 portrait; }
          h1, h2 { page-break-after: avoid; }
          .card { page-break-inside: avoid; }
          a { color: inherit !important; text-decoration: none !important; }
          button { display: none !important; }
        }
      `}</style>

      {/* ── Screen header ── */}
      <div className="flex items-start justify-between mb-6 no-print">
        <div>
          <Link href="/"
            className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 mb-1 w-fit">
            <ArrowLeft size={12} /> Dashboard
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">
            Owner Settlement Report
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Settlement Statement for the Selected Period
          </p>
        </div>
      </div>

      {/* ── Print-only header ── */}
      <div className="hidden print:block mb-6 border-b border-gray-300 pb-4">
        <h1 className="text-xl font-bold text-gray-900">
          Owner Settlement Report — {selectedContact?.contact_name ?? '—'}
        </h1>
        <p className="text-sm text-gray-600 mt-1">
          Period: {fmtDate(fromDate)} – {fmtDate(toDate)}
        </p>
        {selectedProps.length > 0 && (
          <p className="text-sm text-gray-600">
            Properties: {selectedProps.join(' · ')}
          </p>
        )}
        <p className="text-xs text-gray-400 mt-1">Generated {generatedAt}</p>
      </div>

      {/* ══ FILTER PANEL / COMPACT SUMMARY ══ */}
      {reportReady && !filtersExpanded ? (
        <div className="card px-5 py-3 mb-4 no-print flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-sm flex-wrap min-w-0">
            <span className="font-semibold text-gray-800 truncate">
              {selectedContact?.contact_name ?? `${selectedProps.length} ${selectedProps.length === 1 ? 'property' : 'properties'}`}
            </span>
            <span className="text-gray-300 shrink-0">·</span>
            <span className="text-gray-500 shrink-0">
              {selectedProps.length} {selectedProps.length === 1 ? 'property' : 'properties'}
            </span>
            <span className="text-gray-300 shrink-0">·</span>
            <span className="text-gray-500 shrink-0">
              {fmtDate(fromDate)} – {fmtDate(toDate)}
            </span>
            {selectedCategories.length > 0 && (
              <>
                <span className="text-gray-300 shrink-0">·</span>
                <span className="text-blue-500 text-xs shrink-0">{selectedCategories.join(', ')}</span>
              </>
            )}
          </div>
          <button
            onClick={() => setFiltersExpanded(true)}
            className="text-xs text-brand-600 hover:text-brand-800 hover:underline flex items-center gap-1 shrink-0 font-medium"
          >
            <RefreshCw size={11} /> Edit Filters
          </button>
        </div>
      ) : (
      <div className="card p-6 mb-4 no-print">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-5 flex items-center gap-2">
          <User size={12} /> Report Parameters
        </h2>

        <div className="grid grid-cols-2 gap-6">

          {/* Contact */}
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Contact / Owner</label>
            {contactsLoading ? (
              <div className="flex items-center gap-2 text-xs text-gray-400 h-9">
                <RefreshCw size={12} className="animate-spin" /> Loading contacts…
              </div>
            ) : (
              <select
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white
                           focus:outline-none focus:ring-2 focus:ring-brand-400"
                value={selectedId}
                onChange={e => { setSelectedId(e.target.value); setReportReady(false) }}
              >
                <option value="">— Select contact —</option>
                {contacts.map(c => (
                  <option key={c.contact_id} value={c.contact_id}>
                    {c.contact_name}{c.contact_type ? ` (${c.contact_type})` : ''}
                  </option>
                ))}
              </select>
            )}
            {contacts.length === 0 && !contactsLoading && (
              <p className="text-xs text-amber-600 mt-1">No contacts found.</p>
            )}
          </div>

          {/* Date range */}
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Date Range</label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Calendar size={12} className="absolute left-2.5 top-2.5 text-gray-400 pointer-events-none" />
                <input type="date" value={fromDate}
                  onChange={e => { setFromDate(e.target.value); setReportReady(false) }}
                  className="w-full border border-gray-200 rounded-lg pl-7 pr-2 py-2 text-sm bg-white
                             focus:outline-none focus:ring-2 focus:ring-brand-400"
                />
              </div>
              <span className="text-xs text-gray-400">to</span>
              <div className="relative flex-1">
                <Calendar size={12} className="absolute left-2.5 top-2.5 text-gray-400 pointer-events-none" />
                <input type="date" value={toDate}
                  onChange={e => { setToDate(e.target.value); setReportReady(false) }}
                  className="w-full border border-gray-200 rounded-lg pl-7 pr-2 py-2 text-sm bg-white
                             focus:outline-none focus:ring-2 focus:ring-brand-400"
                />
              </div>
            </div>
          </div>
        </div>

        {/* ── Property selection (always visible) ── */}
        <div className="mt-5">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs text-gray-500 flex items-center gap-1">
              <Building2 size={12} /> Properties
              <span className="text-gray-400 font-normal ml-1">
                ({selectedProps.length} selected
                {allClientProps.length > 0 ? ` of ${allClientProps.length}` : ''})
              </span>
            </label>
            <div className="flex gap-2 items-center">
              {propsLoading && (
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  <RefreshCw size={10} className="animate-spin" /> Loading…
                </span>
              )}
              {selectedId && properties.length > 0 && (
                <button className="text-xs text-brand-600 hover:underline"
                  onClick={() => {
                    setSelectedProps(properties.map(p => p.canonical_name))
                    setReportReady(false)
                  }}>
                  Select owner&apos;s properties
                </button>
              )}
              {allClientProps.length > 0 && (
                <>
                  <span className="text-gray-300">·</span>
                  <button className="text-xs text-brand-600 hover:underline"
                    onClick={() => {
                      const visible = propSearch
                        ? allClientProps.filter(p => p.toLowerCase().includes(propSearch.toLowerCase()))
                        : allClientProps
                      setSelectedProps(visible)
                      setReportReady(false)
                    }}>
                    Select all visible
                  </button>
                  <span className="text-gray-300">·</span>
                  <button className="text-xs text-gray-400 hover:underline"
                    onClick={() => { setSelectedProps([]); setReportReady(false) }}>
                    Clear
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Property search input */}
          <div className="relative mb-3">
            <Building2 size={12} className="absolute left-2.5 top-2.5 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={propSearch}
              onChange={e => setPropSearch(e.target.value)}
              placeholder="Search properties… (e.g. Tamir, Dekelia, Villa)"
              className="w-full border border-gray-200 rounded-lg pl-7 pr-3 py-2 text-sm bg-white
                         focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
          </div>

          {/* Confirmation warning */}
          {needsConfirm.length > 0 && (
            <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50
                            rounded-lg px-3 py-2 mb-2">
              <AlertTriangle size={12} className="text-amber-500 shrink-0 mt-0.5" />
              <span>
                {needsConfirm.length} property link{needsConfirm.length > 1 ? 's' : ''} flagged as
                &ldquo;needs confirmation&rdquo; — verify before sharing.
              </span>
            </div>
          )}

          {/* Property chips */}
          <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto">
            {(propSearch
              ? allClientProps.filter(p => p.toLowerCase().includes(propSearch.toLowerCase()))
              : (selectedId && properties.length > 0)
                ? allClientProps  // show all when contact selected, so user can add more
                : allClientProps  // show all always
            ).map(propName => {
              const active   = selectedProps.includes(propName)
              const linked   = properties.find(p => p.canonical_name === propName)
              const warning  = linked?.confirmation_status === 'needs_confirmation'
              const isLinked = !!linked
              return (
                <button key={propName}
                  onClick={() => toggleProp(propName)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-full border text-xs transition-all ${
                    active
                      ? warning
                        ? 'bg-amber-50 border-amber-300 text-amber-700'
                        : isLinked
                          ? 'bg-brand-50 border-brand-300 text-brand-700'
                          : 'bg-gray-100 border-gray-300 text-gray-700'
                      : 'bg-white border-gray-200 text-gray-400 hover:border-gray-300'
                  }`}
                >
                  {warning  && <AlertTriangle size={9}  className="text-amber-500 shrink-0" />}
                  {active && !warning && <CheckCircle size={9} className={isLinked ? 'text-brand-500' : 'text-gray-500'} />}
                  {propName}
                </button>
              )
            })}
            {allClientProps.length === 0 && (
              <span className="text-xs text-gray-400 italic">Loading properties…</span>
            )}
          </div>
          {propSearch && allClientProps.filter(p =>
            p.toLowerCase().includes(propSearch.toLowerCase())
          ).length === 0 && (
            <p className="text-xs text-gray-400 mt-2">No properties match &ldquo;{propSearch}&rdquo;</p>
          )}
        </div>

        {/* ── Category filter ── */}
        <div className="mt-5">
          <label className="block text-xs text-gray-500 mb-2">
            Category Filter <span className="text-gray-400">(none selected = all included)</span>
          </label>
          <div className="flex flex-wrap gap-1.5">
            {ALL_CATEGORIES.map(cat => {
              const active = selectedCategories.includes(cat)
              const color: Record<string, string> = {
                Airbnb:     active ? 'bg-blue-600 border-blue-600 text-white'   : 'bg-white border-gray-200 text-gray-500 hover:border-blue-300',
                Management: active ? 'bg-teal-600 border-teal-600 text-white'  : 'bg-white border-gray-200 text-gray-500 hover:border-teal-300',
                Renovation: active ? 'bg-orange-500 border-orange-500 text-white' : 'bg-white border-gray-200 text-gray-500 hover:border-orange-300',
                Sale:       active ? 'bg-green-600 border-green-600 text-white' : 'bg-white border-gray-200 text-gray-500 hover:border-green-300',
                Purchase:   active ? 'bg-purple-600 border-purple-600 text-white' : 'bg-white border-gray-200 text-gray-500 hover:border-purple-300',
                JJ:         active ? 'bg-gray-700 border-gray-700 text-white'  : 'bg-white border-gray-200 text-gray-500 hover:border-gray-400',
                Transfer:   active ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-gray-200 text-gray-500 hover:border-indigo-300',
                General:    active ? 'bg-gray-500 border-gray-500 text-white'  : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300',
              }
              return (
                <button key={cat}
                  onClick={() => {
                    setSelectedCategories(prev =>
                      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
                    )
                    setReportReady(false)
                  }}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${color[cat]}`}
                >
                  {cat}
                </button>
              )
            })}
            {selectedCategories.length > 0 && (
              <button
                onClick={() => { setSelectedCategories([]); setReportReady(false) }}
                className="px-3 py-1 rounded-full text-xs border border-gray-200 text-gray-400 hover:border-red-300 hover:text-red-500 transition-all"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* ── Subcategory / description search ── */}
        <div className="mt-4">
          <label className="block text-xs text-gray-500 mb-1.5">
            Subcategory / Description Search <span className="text-gray-400">(e.g. "Cleaning", "Management Fee")</span>
          </label>
          <input
            type="text"
            value={subcategorySearch}
            onChange={e => { setSubcategorySearch(e.target.value); setReportReady(false) }}
            placeholder="Filter rows by subcategory or description…"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white
                       focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
        </div>

        {/* Generate */}
        <div className="mt-5 flex items-center gap-3">
          <button
            onClick={generate}
            disabled={generating || selectedProps.length === 0}
            className="flex items-center gap-2 px-5 py-2 bg-brand-600 hover:bg-brand-700
                       disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {generating
              ? <RefreshCw size={14} className="animate-spin" />
              : <FileText size={14} />}
            {generating ? 'Generating…' : 'Generate Report'}
          </button>
          {reportReady && (
            <span className="text-xs text-gray-400">
              Generated {generatedAt} · {transactions.length} transactions
            </span>
          )}
        </div>
      </div>
      )} {/* end filter panel / compact summary conditional */}

      {/* ══ REPORT ══ */}
      {reportReady && sectionTotals && bal && (
        <>
          {/* Title bar + export buttons */}
          <div className="flex items-center justify-between mb-3 print-title-bar">
            <div>
              <h2 className="text-base font-semibold text-gray-800">
                {selectedContact?.contact_name
                  ? `${selectedContact.contact_name} — Owner Statement`
                  : `${selectedProps.length} ${selectedProps.length === 1 ? 'Property' : 'Properties'} — Statement`}
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {fmtDate(fromDate)} – {fmtDate(toDate)}
                {' · '}{selectedProps.length} {selectedProps.length === 1 ? 'property' : 'properties'}
                {' · '}{transactions.length} transactions
                {selectedCategories.length > 0 && (
                  <span className="ml-1 text-blue-500">· {selectedCategories.join(', ')}</span>
                )}
                {subcategorySearch && (
                  <span className="ml-1 text-purple-500">· "{subcategorySearch}"</span>
                )}
              </p>
            </div>

            <div className="flex items-center gap-2 no-print">
              {/* Client / Internal toggle */}
              <div className="flex border border-gray-200 rounded-lg overflow-hidden">
                <button onClick={() => setViewMode('client')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs transition-colors ${
                    viewMode === 'client'
                      ? 'bg-brand-600 text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}>
                  <Eye size={11} /> Client
                </button>
                <button onClick={() => setViewMode('internal')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs border-l
                              border-gray-200 transition-colors ${
                    viewMode === 'internal'
                      ? 'bg-brand-600 text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}>
                  <EyeOff size={11} /> Internal
                </button>
              </div>

              <span className="w-px h-5 bg-gray-200 mx-1" />

              <button onClick={expandAll}
                className="text-xs text-gray-400 hover:text-gray-600 px-2">
                Expand all
              </button>
              <button onClick={collapseAll}
                className="text-xs text-gray-400 hover:text-gray-600 px-2">
                Collapse all
              </button>

              <span className="w-px h-5 bg-gray-200 mx-1" />

              {/* PDF dropdown */}
              <div className="relative">
                <button
                  onClick={() => { setShowPdfMenu(v => !v); setPdfError(null) }}
                  disabled={pdfGenerating}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-700
                             disabled:opacity-50 text-white text-xs font-medium rounded-lg
                             transition-colors select-none"
                >
                  {pdfGenerating
                    ? <><RefreshCw size={11} className="animate-spin" /> Generating…</>
                    : <><FileText size={11} /> PDF <ChevronDown size={10} /></>}
                </button>

                {showPdfMenu && !pdfGenerating && (
                  <>
                    {/* Backdrop to close on outside click */}
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setShowPdfMenu(false)}
                    />
                    <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200
                                    rounded-lg shadow-xl z-50 w-44 py-1 text-xs">
                      <button
                        onClick={() => handlePdf('download')}
                        className="w-full flex items-center gap-2 px-3 py-2 text-gray-700
                                   hover:bg-gray-50 transition-colors text-left">
                        <Download size={11} /> Download PDF
                      </button>
                      <button
                        onClick={() => handlePdf('print')}
                        className="w-full flex items-center gap-2 px-3 py-2 text-gray-700
                                   hover:bg-gray-50 transition-colors text-left">
                        <Printer size={11} /> Print
                      </button>
                      <div className="border-t border-gray-100 my-1" />
                      <button
                        onClick={() => handlePdf('whatsapp')}
                        className="w-full flex items-center gap-2 px-3 py-2 text-gray-700
                                   hover:bg-gray-50 transition-colors text-left">
                        <MessageSquare size={11} /> Download for WhatsApp
                      </button>
                      <button
                        onClick={() => handlePdf('email')}
                        className="w-full flex items-center gap-2 px-3 py-2 text-gray-700
                                   hover:bg-gray-50 transition-colors text-left">
                        <Mail size={11} /> Download + Open Email
                      </button>
                    </div>
                  </>
                )}
              </div>

              <button onClick={exportCSV}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200
                           rounded-lg text-xs text-gray-600 hover:bg-gray-50 transition-colors">
                <Download size={12} /> CSV
              </button>

              {/* PDF error inline */}
              {pdfError && (
                <span className="text-xs text-red-500 ml-1">{pdfError}</span>
              )}
            </div>
          </div>

          {/* ═══ HERO BALANCE ═══ */}
          <div className={`card mb-4 py-8 px-6 text-center ${
            bal.remainingBalance < -0.005
              ? 'bg-green-50 border-2 border-green-200 shadow-md'
              : bal.remainingBalance > 0.005
              ? 'bg-red-50 border-2 border-red-200 shadow-md'
              : 'bg-gray-50 border-2 border-gray-200 shadow-sm'
          }`}>
            <p className={`text-xs uppercase tracking-widest font-semibold mb-2 ${
              bal.remainingBalance < -0.005 ? 'text-green-600' :
              bal.remainingBalance > 0.005  ? 'text-red-600'   : 'text-gray-400'
            }`}>
              {bal.remainingBalance < -0.005
                ? (viewMode === 'client' ? 'Amount Due to You'      : 'JJ Owes Client')
                : bal.remainingBalance > 0.005
                ? (viewMode === 'client' ? 'Amount Due to JJ'       : 'Client Owes JJ')
                : (viewMode === 'client' ? 'No Balance Outstanding' : 'Settled')}
            </p>
            <p className={`text-5xl font-black mb-2 tabular-nums ${
              bal.remainingBalance < -0.005 ? 'text-green-700' :
              bal.remainingBalance > 0.005  ? 'text-red-700'   : 'text-gray-500'
            }`}>
              {EUR(Math.abs(bal.remainingBalance))}
            </p>
            <p className="text-xs text-gray-400">after all settlements</p>
          </div>

          {/* ═══ SUMMARY CARDS (4) ═══ */}
          <div className="grid grid-cols-4 gap-3 mb-4">
            <button className="card p-4 text-left hover:ring-2 hover:ring-brand-200 transition-all"
              onClick={() => drillToSection(['platform'])}>
              <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Platform / Rent</p>
              <p className="text-xl font-semibold text-green-700">{EUR(bal.totalPlatform)}</p>
              <p className="text-[10px] text-gray-400 mt-1">income to owner</p>
            </button>
            <button className="card p-4 text-left hover:ring-2 hover:ring-brand-200 transition-all"
              onClick={() => drillToSection(['client_payments'])}>
              <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Client Payments</p>
              <p className="text-xl font-semibold text-green-700">{EUR(bal.totalClientPmts)}</p>
              <p className="text-[10px] text-gray-400 mt-1">payments received</p>
            </button>
            <button className="card p-4 text-left hover:ring-2 hover:ring-brand-200 transition-all"
              onClick={() => drillToSection(['charges_billed', 'renovation', 'expenses'])}>
              <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Expenses Paid on Your Behalf</p>
              <p className="text-xl font-semibold text-red-600">
                {EUR(bal.totalCharges + bal.totalExpenses + bal.totalRenovation)}
              </p>
              <p className="text-[10px] text-gray-400 mt-1">paid by JJ</p>
            </button>
            <button className="card p-4 text-left hover:ring-2 hover:ring-brand-200 transition-all"
              onClick={() => drillToSection(['settlement'])}>
              <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Payments Sent to You</p>
              <p className="text-xl font-semibold text-blue-600">{EUR(bal.totalBankPayments)}</p>
              <p className="text-[10px] text-gray-400 mt-1">already transferred</p>
            </button>
          </div>

          {/* ═══ SETTLEMENT SUMMARY ═══ */}
          <SettlementSummary
            openingBalance={openingBalance}
            openingBalanceSource={openingBalanceSource}
            viewMode={viewMode}
            totals={sectionTotals}
            onOpeningBalanceChange={v => { setOpeningBalance(v) }}
            onOpeningBalanceEdit={() => setOpeningBalanceSource('manual')}
          />

          {/* ═══ OPERATING LEDGER SECTIONS ═══ */}
          <div className="mb-3">
            <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold px-1">
              Operating Ledger
            </p>
          </div>

          {SECTION_DEFS.filter(d => d.operating).map(def => (
            <SectionPanel
              key={def.key}
              def={def}
              totals={sectionTotals}
              viewMode={viewMode}
              expanded={expandedSections.has(def.key)}
              onToggle={() => toggleSection(def.key)}
            />
          ))}

          {/* ═══ SETTLEMENT SECTION ═══ */}
          <div className="mb-3 mt-5">
            <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold px-1">
              Payments & Settlement
            </p>
          </div>

          {SECTION_DEFS.filter(d => d.key === 'settlement').map(def => (
            <SectionPanel
              key={def.key}
              def={def}
              totals={sectionTotals}
              viewMode={viewMode}
              expanded={expandedSections.has(def.key)}
              onToggle={() => toggleSection(def.key)}
            />
          ))}

          {/* ═══ INFORMATIONAL / REFERENCE DIVIDER ═══ */}
          <div className="my-5 flex items-center gap-3">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold whitespace-nowrap px-1">
              For Reference · No impact on your balance
            </span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          {SECTION_DEFS.filter(d => !d.operating && d.key !== 'settlement').map(def => (
            <SectionPanel
              key={def.key}
              def={def}
              totals={sectionTotals}
              viewMode={viewMode}
              expanded={expandedSections.has(def.key)}
              onToggle={() => toggleSection(def.key)}
            />
          ))}

          {/* ═══ ALL TRANSACTIONS DRILL-DOWN ═══ */}
          <AllTxDrilldown txns={classifiedTxns} viewMode={viewMode} />

        </>
      )}
    </div>
  )
}
