'use client'

// ============================================================
// JJ PROPERTY 10 — Financial Breakdown Panel
// Panel 5: 6 financial sections, NEVER mixed.
//
// Section 1: Net Cash Position by Party (v_entity_net_cash_position)
// Section 2: Actual Cash Flow summary (same source)
// Section 3: Expected Ownership Allocation (v_entity_ownership_allocation)
// Section 4: Settlement Result (v_entity_settlement)
// Section 5: Anastasia Reimbursement (v_entity_anastasia_reimbursement)
// Section 6: External Partner Settlement (non-JJ from v_entity_settlement)
//
// CONTRACT EXCLUSION: Purchase Contract / Sale Contract always excluded
// from the underlying views — inherited automatically.
// ============================================================

import { useEffect, useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronUp, Info } from 'lucide-react'
import {
  getNetCashPosition, getOwnershipAllocation, getSettlement, getAnastasiaReimbursement,
  NetCashPosition, OwnershipAllocation, SettlementResult, AnastasiaReimbursement,
  EntityType, EUR,
} from '@/lib/entity-registry'

interface Props {
  entityId: string
  entityType: EntityType
  canonicalName: string
}

// ─── Shared ───────────────────────────────────────────────────────────────────

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="border-b border-gray-100 pb-2 mb-3">
      <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">{title}</h3>
      {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
    </div>
  )
}

function MetaNote({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 mt-3 p-2.5 bg-gray-50 rounded text-xs text-gray-500">
      <Info className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" /> {text}
    </div>
  )
}

// ─── Section 1 & 2: Net Cash Position ─────────────────────────────────────────

function CashPositionSection({ rows }: { rows: NetCashPosition[] }) {
  if (rows.length === 0) {
    return (
      <div>
        <SectionHeader
          title="1. Net Cash Position by Party"
          subtitle="Who physically moved money to/from this property"
        />
        <p className="text-sm text-gray-400">No cash transactions found.</p>
      </div>
    )
  }

  const totalPaid     = rows.reduce((a, r) => a + r.total_paid, 0)
  const totalReceived = rows.reduce((a, r) => a + r.total_received, 0)
  const netTotal      = totalReceived - totalPaid

  return (
    <div>
      <SectionHeader
        title="1. Net Cash Position by Party"
        subtitle="Who physically moved money to/from this property"
      />
      <table className="w-full text-sm mb-2">
        <thead>
          <tr className="text-xs text-gray-400 border-b border-gray-100">
            <th className="pb-1 text-left font-medium">Party</th>
            <th className="pb-1 text-right font-medium">Paid Out</th>
            <th className="pb-1 text-right font-medium">Received</th>
            <th className="pb-1 text-right font-medium">Net</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {rows.map(r => (
            <tr key={r.party} className="hover:bg-gray-50">
              <td className="py-1.5 font-medium text-gray-800">{r.party}</td>
              <td className="py-1.5 text-right text-gray-600">{EUR(r.total_paid)}</td>
              <td className="py-1.5 text-right text-gray-600">{EUR(r.total_received)}</td>
              <td className={`py-1.5 text-right font-medium ${r.net_position >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                {r.net_position >= 0 ? '+' : ''}{EUR(r.net_position)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t-2 border-gray-200">
          <tr>
            <td className="pt-1.5 text-xs font-semibold text-gray-600">Total</td>
            <td className="pt-1.5 text-right text-xs font-semibold text-gray-700">{EUR(totalPaid)}</td>
            <td className="pt-1.5 text-right text-xs font-semibold text-gray-700">{EUR(totalReceived)}</td>
            <td className={`pt-1.5 text-right text-xs font-bold ${netTotal >= 0 ? 'text-green-700' : 'text-red-700'}`}>
              {netTotal >= 0 ? '+' : ''}{EUR(netTotal)}
            </td>
          </tr>
        </tfoot>
      </table>
      <MetaNote text="Yossi and Jacob appear as individual payers because transactions record who physically moved the money. This is NOT the same as ownership stake." />

      {/* Section 2: Cash flow direction */}
      <div className="mt-5">
        <SectionHeader
          title="2. Actual Cash Flow"
          subtitle="Net into/out of property across all parties"
        />
        <div className="flex gap-4">
          <div className="flex-1 rounded-lg border border-red-100 bg-red-50 px-4 py-3">
            <p className="text-xs text-red-500 mb-0.5">Total Cost (paid out)</p>
            <p className="text-lg font-bold text-red-700">{EUR(totalPaid)}</p>
          </div>
          <div className="flex-1 rounded-lg border border-green-100 bg-green-50 px-4 py-3">
            <p className="text-xs text-green-600 mb-0.5">Total Income (received)</p>
            <p className="text-lg font-bold text-green-700">{EUR(totalReceived)}</p>
          </div>
          <div className={`flex-1 rounded-lg border px-4 py-3 ${
            netTotal >= 0 ? 'border-green-200 bg-green-50' : 'border-red-100 bg-red-50'
          }`}>
            <p className={`text-xs mb-0.5 ${netTotal >= 0 ? 'text-green-600' : 'text-red-500'}`}>Net P&L</p>
            <p className={`text-lg font-bold ${netTotal >= 0 ? 'text-green-700' : 'text-red-700'}`}>
              {netTotal >= 0 ? '+' : ''}{EUR(netTotal)}
            </p>
          </div>
        </div>
        <MetaNote text="Excludes Purchase Contract and Sale Contract rows — those are transaction values, not cash movements." />
      </div>
    </div>
  )
}

// ─── Section 3: Expected Ownership Allocation ──────────────────────────────────

function OwnershipAllocationSection({ rows, entityType }: { rows: OwnershipAllocation[]; entityType: EntityType }) {
  if (['person', 'transfer_account', 'special_case'].includes(entityType)) {
    return null
  }

  if (rows.length === 0) {
    return (
      <div>
        <SectionHeader
          title="3. Expected Ownership Allocation"
          subtitle="What each partner's share should be based on ownership %"
        />
        <p className="text-sm text-gray-400">No ownership allocation data.</p>
        {entityType !== 'partnership_property' && (
          <MetaNote text="JJ-owned and client properties allocate 100% to JJ as a single entity." />
        )}
      </div>
    )
  }

  return (
    <div>
      <SectionHeader
        title="3. Expected Ownership Allocation"
        subtitle="What each partner's share should be based on ownership %"
      />
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-gray-400 border-b border-gray-100">
            <th className="pb-1 text-left font-medium">Partner</th>
            <th className="pb-1 text-right font-medium">Ownership %</th>
            <th className="pb-1 text-right font-medium">Expected Cost</th>
            <th className="pb-1 text-right font-medium">Expected Income</th>
            <th className="pb-1 text-right font-medium">Expected Net</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {rows.map(r => (
            <tr key={r.partner_name} className="hover:bg-gray-50">
              <td className="py-1.5 font-medium text-gray-800">{r.partner_name}</td>
              <td className="py-1.5 text-right text-gray-600">{Number(r.ownership_pct).toFixed(1)}%</td>
              <td className="py-1.5 text-right text-gray-600">{EUR(r.expected_cost_share)}</td>
              <td className="py-1.5 text-right text-gray-600">{EUR(r.expected_income_share)}</td>
              <td className={`py-1.5 text-right font-medium ${r.expected_net_share >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                {r.expected_net_share >= 0 ? '+' : ''}{EUR(r.expected_net_share)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Section 4 & 6: Settlement ────────────────────────────────────────────────

const SETTLEMENT_STATUS_STYLE: Record<string, string> = {
  settled:   'text-green-700 bg-green-50 border border-green-200',
  overpaid:  'text-amber-700 bg-amber-50 border border-amber-200',
  underpaid: 'text-red-700 bg-red-50 border border-red-200',
}

function SettlementRow({ r }: { r: SettlementResult }) {
  return (
    <tr className="hover:bg-gray-50">
      <td className="py-1.5 font-medium text-gray-800">{r.partner_name}</td>
      <td className="py-1.5 text-right text-gray-600">{Number(r.ownership_pct).toFixed(1)}%</td>
      <td className="py-1.5 text-right text-gray-600">{EUR(r.actual_net)}</td>
      <td className="py-1.5 text-right text-gray-600">{EUR(r.expected_net_share)}</td>
      <td className={`py-1.5 text-right font-medium ${r.variance_eur >= 0 ? 'text-green-700' : 'text-red-700'}`}>
        {r.variance_eur >= 0 ? '+' : ''}{EUR(r.variance_eur)}
      </td>
      <td className="py-1.5 pl-2">
        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${SETTLEMENT_STATUS_STYLE[r.settlement_status] ?? 'text-gray-500'}`}>
          {r.settlement_status}
        </span>
      </td>
    </tr>
  )
}

function SettlementSection({ rows }: { rows: SettlementResult[] }) {
  if (rows.length === 0) return null

  const jjRows      = rows.filter(r => r.partner_name === 'JJ')
  const allSettled  = rows.every(r => r.settlement_status === 'settled')

  return (
    <div>
      <SectionHeader
        title="4. Settlement Result"
        subtitle="Actual vs expected — who paid more or less than their ownership share"
      />
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-gray-400 border-b border-gray-100">
            <th className="pb-1 text-left font-medium">Partner</th>
            <th className="pb-1 text-right font-medium">Ownership %</th>
            <th className="pb-1 text-right font-medium">Actual Net</th>
            <th className="pb-1 text-right font-medium">Expected Net</th>
            <th className="pb-1 text-right font-medium">Variance</th>
            <th className="pb-1 pl-2 text-left font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {rows.map(r => <SettlementRow key={r.partner_name} r={r} />)}
        </tbody>
      </table>
      <div className={`mt-3 p-2.5 rounded text-xs font-medium ${
        allSettled
          ? 'bg-green-50 text-green-700 border border-green-200'
          : 'bg-amber-50 text-amber-700 border border-amber-200'
      }`}>
        {allSettled
          ? '✓ All partners are within settlement tolerance.'
          : 'Settlement imbalance detected. Variance = actual paid minus expected share. Negative means underpaid relative to ownership stake.'}
      </div>
      {jjRows.length > 0 && (
        <MetaNote text="JJ represents Yossi + Jacob combined. Individual Yossi/Jacob split is tracked in v_cashbox_audit, not here." />
      )}
    </div>
  )
}

// Section 6: External Partner Settlement (non-JJ only)
function ExternalPartnerSection({ rows, entityType }: { rows: SettlementResult[]; entityType: EntityType }) {
  if (entityType !== 'partnership_property') return null
  const externalRows = rows.filter(r => r.partner_name !== 'JJ')
  if (externalRows.length === 0) return null

  return (
    <div>
      <SectionHeader
        title="6. External Partner Settlement"
        subtitle="Non-JJ partners only — amounts owed to/from outside parties"
      />
      <div className="space-y-2">
        {externalRows.map(r => {
          const owes = r.variance_eur < 0 ? Math.abs(r.variance_eur) : 0
          const owed = r.variance_eur > 0 ? r.variance_eur : 0
          return (
            <div key={r.partner_name} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100">
              <div>
                <p className="text-sm font-semibold text-gray-800">{r.partner_name}</p>
                <p className="text-xs text-gray-400">{Number(r.ownership_pct).toFixed(1)}% ownership</p>
              </div>
              <div className="text-right">
                {r.settlement_status === 'settled' && (
                  <p className="text-sm font-medium text-green-600">Settled ✓</p>
                )}
                {owes > 0 && (
                  <div>
                    <p className="text-xs text-red-500">Owes JJ</p>
                    <p className="text-base font-bold text-red-700">{EUR(owes)}</p>
                  </div>
                )}
                {owed > 0 && (
                  <div>
                    <p className="text-xs text-green-600">JJ owes partner</p>
                    <p className="text-base font-bold text-green-700">{EUR(owed)}</p>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Section 5: Anastasia Reimbursement ───────────────────────────────────────

function AnastasiaSection({ data }: { data: AnastasiaReimbursement | null }) {
  const [expanded, setExpanded] = useState(false)

  if (!data || data.total_paid_by_anastasia === 0) {
    return (
      <div>
        <SectionHeader title="5. Anastasia Reimbursement" />
        <p className="text-sm text-gray-400">No Anastasia payments recorded for this property.</p>
      </div>
    )
  }

  return (
    <div>
      <SectionHeader
        title="5. Anastasia Reimbursement"
        subtitle="Amounts Anastasia paid on behalf of the company"
      />
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full text-left p-3 bg-gray-50 border border-gray-100 rounded-lg flex items-center justify-between hover:bg-gray-100"
      >
        <div>
          <span className="text-sm font-medium text-gray-800">
            Net owed to Anastasia:
          </span>
          <span className={`ml-2 text-sm font-bold ${data.net_owed_to_anastasia > 0 ? 'text-amber-700' : 'text-green-700'}`}>
            {data.net_owed_to_anastasia > 0 ? '+' : ''}{EUR(data.net_owed_to_anastasia)}
          </span>
        </div>
        {expanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
      </button>
      {expanded && (
        <table className="w-full text-sm mt-2">
          <tbody className="divide-y divide-gray-50">
            <tr>
              <td className="py-1.5 text-gray-600">Total paid by Anastasia</td>
              <td className="py-1.5 text-right text-gray-800 font-medium">{EUR(data.total_paid_by_anastasia)}</td>
            </tr>
            <tr>
              <td className="py-1.5 text-gray-600">Identified reimbursements</td>
              <td className="py-1.5 text-right text-gray-800 font-medium">−{EUR(data.identified_reimbursements)}</td>
            </tr>
            <tr>
              <td className="py-1.5 font-semibold text-gray-700">Net owed</td>
              <td className={`py-1.5 text-right font-bold ${data.net_owed_to_anastasia > 0 ? 'text-amber-700' : 'text-green-700'}`}>
                {data.net_owed_to_anastasia > 0 ? '+' : ''}{EUR(data.net_owed_to_anastasia)}
              </td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  )
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

export default function FinancialBreakdownPanel({ entityId, entityType, canonicalName: _canonicalName }: Props) {
  const [cashRows,      setCashRows]      = useState<NetCashPosition[]>([])
  const [allocRows,     setAllocRows]     = useState<OwnershipAllocation[]>([])
  const [settlRows,     setSettlRows]     = useState<SettlementResult[]>([])
  const [anastasiaData, setAnastasiaData] = useState<AnastasiaReimbursement | null>(null)
  const [loading,       setLoading]       = useState(true)
  const [error,         setError]         = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true); setError(null)
    Promise.all([
      getNetCashPosition(entityId),
      getOwnershipAllocation(entityId),
      getSettlement(entityId),
      getAnastasiaReimbursement(entityId),
    ]).then(([cash, alloc, settl, anastasia]) => {
      if (cancelled) return
      setCashRows(cash)
      setAllocRows(alloc)
      setSettlRows(settl)
      setAnastasiaData(anastasia)
    }).catch(e => {
      if (!cancelled) setError(String(e))
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [entityId])

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-800">Financial Breakdown</h2>
        <p className="text-xs text-gray-400 mt-0.5">6 sections — each measures a distinct financial dimension</p>
      </div>

      <div className="px-5 py-4">
        {loading && <p className="text-sm text-gray-400 py-4 text-center">Loading financial data…</p>}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded text-xs text-red-700 flex items-start gap-2 mb-4">
            <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" /> {error}
          </div>
        )}
        {!loading && !error && (
          <div className="space-y-8 divide-y divide-gray-100">
            <CashPositionSection rows={cashRows} />
            <div className="pt-6">
              <OwnershipAllocationSection rows={allocRows} entityType={entityType} />
            </div>
            <div className="pt-6">
              <SettlementSection rows={settlRows} />
            </div>
            <div className="pt-6">
              <AnastasiaSection data={anastasiaData} />
            </div>
            <div className="pt-6">
              <ExternalPartnerSection rows={settlRows} entityType={entityType} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
