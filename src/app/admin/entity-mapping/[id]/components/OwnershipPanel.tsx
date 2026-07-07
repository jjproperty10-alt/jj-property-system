'use client'

// ============================================================
// JJ PROPERTY 10 — Ownership Panel
// Panel 3: Shows ownership split + per-partner capital tracker.
// Only rendered for entity_type = 'partnership_property'.
//
// Capital tracker rule:
//   partner_required_capital = partner_entry_valuation × ownership_pct / 100
//   NOT calculated from JJ original acquisition cost.
// ============================================================

import { useState, useEffect, useCallback } from 'react'
import { AlertTriangle, Info, ChevronDown, ChevronUp, Save, Pencil, X } from 'lucide-react'
import {
  PartnershipOwnership,
  PartnershipCapital,
  closeOwnershipRow,
  getPartnershipCapital,
  upsertPartnershipCapital,
  EUR,
} from '@/lib/entity-registry'

interface Props {
  entityId: string
  canonicalName: string
  ownershipRows: PartnershipOwnership[]
  onChanged: () => void
}

function pct(v: number | null | undefined): string {
  if (v == null) return '—'
  return `${Number(v).toFixed(1)}%`
}

function eurOrDash(v: number | null | undefined): string {
  if (v == null) return '—'
  return EUR(v)
}

// ── Capital draft state per partner ───────────────────────────────────────────
interface CapitalDraft {
  entry_date: string
  jj_original_acquisition_cost: string
  partner_entry_valuation: string
  amount_paid_by_partner: string
  notes: string
}

function toStr(v: number | null | undefined): string {
  return v != null ? String(v) : ''
}

function extractError(e: unknown): string {
  if (e == null) return 'Unknown error'
  if (typeof e === 'string') return e
  if (e instanceof Error) return e.message
  if (typeof e === 'object') {
    const obj = e as Record<string, unknown>
    if (typeof obj.message === 'string') return obj.message
    if (typeof obj.error_description === 'string') return obj.error_description
    if (typeof obj.details === 'string') return obj.details
    if (typeof obj.hint === 'string') return obj.hint
    return JSON.stringify(e)
  }
  return String(e)
}

function toNumOrNull(s: string): number | null {
  const t = s.trim().replace(/[€,\s]/g, '')
  if (t === '') return null
  const n = parseFloat(t)
  return isNaN(n) ? null : n
}

function computeRequired(entryVal: string, ownershipPct: number): number | null {
  const v = toNumOrNull(entryVal)
  if (v == null) return null
  return Math.round(v * ownershipPct / 100 * 100) / 100
}

function computeSpread(entryVal: string, jjCost: string): number | null {
  const e = toNumOrNull(entryVal)
  const c = toNumOrNull(jjCost)
  if (e == null || c == null) return null
  return Math.round((e - c) * 100) / 100
}

// ── Main component ────────────────────────────────────────────────────────────
export default function OwnershipPanel({ entityId, canonicalName, ownershipRows, onChanged }: Props) {
  const [closing,    setClosing]    = useState<string | null>(null)
  const [ownerErr,   setOwnerErr]   = useState<string | null>(null)
  const [showClosed, setShowClosed] = useState(false)

  // Capital state
  const [capital,        setCapital]        = useState<PartnershipCapital[]>([])
  const [capitalLoading, setCapitalLoading] = useState(true)
  const [capitalErr,     setCapitalErr]     = useState<string | null>(null)
  const [editing,        setEditing]        = useState<string | null>(null)   // partner_name being edited
  const [draft,          setDraft]          = useState<CapitalDraft | null>(null)
  const [saving,         setSaving]         = useState(false)
  const [savedPartner,   setSavedPartner]   = useState<string | null>(null)  // flash on save

  const openRows   = ownershipRows.filter(r => r.effective_to === null)
  const closedRows = ownershipRows.filter(r => r.effective_to !== null)
  const totalPct   = openRows.reduce((acc, r) => acc + Number(r.ownership_pct ?? 0), 0)
  const pctOk      = Math.abs(totalPct - 100) < 0.01

  // ── Load capital data ────────────────────────────────────────────────────────
  const loadCapital = useCallback(async () => {
    setCapitalLoading(true); setCapitalErr(null)
    try {
      setCapital(await getPartnershipCapital(canonicalName))
    } catch (e) {
      setCapitalErr(extractError(e))
    } finally {
      setCapitalLoading(false)
    }
  }, [canonicalName])

  useEffect(() => { loadCapital() }, [loadCapital])

  // ── Ownership: close row ──────────────────────────────────────────────────────
  async function handleClose(id: string) {
    if (!confirm('Close this ownership row? This records its end date as today.')) return
    setClosing(id); setOwnerErr(null)
    try {
      await closeOwnershipRow(id)
      onChanged()
    } catch (e) {
      setOwnerErr(extractError(e))
    } finally {
      setClosing(null)
    }
  }

  // ── Capital: start edit ────────────────────────────────────────────────────
  function startEdit(partnerName: string, ownershipPct: number) {
    const existing = capital.find(c => c.partner_name === partnerName)
    setDraft({
      entry_date:                    existing?.entry_date ?? '',
      jj_original_acquisition_cost:  toStr(existing?.jj_original_acquisition_cost),
      partner_entry_valuation:       toStr(existing?.partner_entry_valuation),
      amount_paid_by_partner:        toStr(existing?.amount_paid_by_partner ?? 0),
      notes:                         existing?.notes ?? '',
    })
    setEditing(partnerName)
    setSavedPartner(null)
  }

  function cancelEdit() {
    setEditing(null); setDraft(null)
  }

  // ── Capital: save ─────────────────────────────────────────────────────────
  async function handleSave(partnerName: string, ownershipPct: number) {
    if (!draft) return
    setSaving(true); setCapitalErr(null)
    try {
      await upsertPartnershipCapital({
        property_name:                canonicalName,
        partner_name:                 partnerName,
        ownership_percent:            ownershipPct,
        entry_date:                   draft.entry_date || null,
        jj_original_acquisition_cost: toNumOrNull(draft.jj_original_acquisition_cost),
        partner_entry_valuation:      toNumOrNull(draft.partner_entry_valuation),
        amount_paid_by_partner:       toNumOrNull(draft.amount_paid_by_partner) ?? 0,
        notes:                        draft.notes || null,
      })
      await loadCapital()
      setEditing(null); setDraft(null)
      setSavedPartner(partnerName)
      setTimeout(() => setSavedPartner(null), 3000)
    } catch (e) {
      setCapitalErr(extractError(e))
    } finally {
      setSaving(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">

      {/* ── Ownership Split panel ──────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-sm font-semibold text-gray-800">Ownership Split</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {openRows.length} active partner{openRows.length !== 1 ? 's' : ''}
              {' '}· total {pct(totalPct)}
              {!pctOk && openRows.length > 0 && (
                <span className="ml-1 text-red-500">⚠ does not sum to 100%</span>
              )}
            </p>
          </div>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className="flex items-start gap-2 p-3 bg-blue-50 rounded text-xs text-blue-700">
            <Info className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
            Ownership % is static configuration for expected allocation calculations.
            Actual settlement is computed from real transaction data — it may differ.
          </div>

          {ownerErr && (
            <div className="p-3 bg-red-50 border border-red-200 rounded text-xs text-red-700 flex items-start gap-2">
              <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" /> {ownerErr}
            </div>
          )}

          {openRows.length === 0 ? (
            <p className="text-sm text-gray-400">No active ownership rows.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 border-b border-gray-100">
                  <th className="pb-2 text-left font-medium">Partner</th>
                  <th className="pb-2 text-right font-medium">Ownership %</th>
                  <th className="pb-2 text-right font-medium">Capital</th>
                  <th className="pb-2 text-right font-medium">Profit %</th>
                  <th className="pb-2 text-left font-medium">Status</th>
                  <th className="pb-2 text-left font-medium">From</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {openRows.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="py-2 font-medium text-gray-800">{r.partner_name}</td>
                    <td className="py-2 text-right font-mono text-gray-700">{pct(r.ownership_pct)}</td>
                    <td className="py-2 text-right text-gray-500">
                      {r.capital_contribution_eur != null ? EUR(r.capital_contribution_eur) : '—'}
                    </td>
                    <td className="py-2 text-right text-gray-500">
                      {r.profit_share_pct != null ? pct(r.profit_share_pct) : '—'}
                    </td>
                    <td className="py-2 text-xs text-gray-500 capitalize">
                      {r.confirmation_status?.replace('_', ' ') ?? '—'}
                    </td>
                    <td className="py-2 text-xs text-gray-400">{r.effective_from ?? '—'}</td>
                    <td className="py-2 text-right">
                      <button
                        onClick={() => handleClose(r.id)}
                        disabled={closing === r.id}
                        className="text-xs text-gray-400 hover:text-red-500 disabled:opacity-40 px-2 py-0.5 border border-gray-200 rounded"
                      >
                        {closing === r.id ? 'Closing…' : 'Close'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {openRows.length > 0 && (
            <div className={`text-xs font-medium flex justify-end ${pctOk ? 'text-green-600' : 'text-red-600'}`}>
              Total: {pct(totalPct)} {pctOk ? '✓' : '— must equal 100%'}
            </div>
          )}

          {openRows.some(r => r.notes || r.settlement_notes) && (
            <div className="space-y-1">
              {openRows.filter(r => r.notes || r.settlement_notes).map(r => (
                <div key={r.id + '_notes'} className="text-xs text-gray-400 bg-gray-50 rounded px-3 py-1.5">
                  <span className="font-medium text-gray-600">{r.partner_name}:</span>{' '}
                  {r.notes ?? r.settlement_notes}
                </div>
              ))}
            </div>
          )}

          {closedRows.length > 0 && (
            <div>
              <button
                onClick={() => setShowClosed(v => !v)}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600"
              >
                {showClosed ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                {showClosed ? 'Hide' : 'Show'} {closedRows.length} historical row{closedRows.length !== 1 ? 's' : ''}
              </button>
              {showClosed && (
                <table className="w-full text-sm mt-2 opacity-50">
                  <tbody className="divide-y divide-gray-50">
                    {closedRows.map(r => (
                      <tr key={r.id}>
                        <td className="py-1.5 text-gray-500">{r.partner_name}</td>
                        <td className="py-1.5 text-right font-mono text-gray-400">{pct(r.ownership_pct)}</td>
                        <td className="py-1.5 text-xs text-gray-400 pl-4">
                          {r.effective_from} → {r.effective_to}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          <p className="text-xs text-gray-400">
            To change the ownership split: close the existing row, then contact your database admin
            to insert the updated row with the new percentages and effective date.
          </p>
        </div>
      </div>

      {/* ── Capital Tracker panel ─────────────────────────────────────────── */}
      {openRows.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-800">Capital Tracker</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Per-partner entry valuations and capital contributions.
              Partner required capital is calculated from the <span className="font-medium">partner entry valuation</span>,
              not from JJ's original acquisition cost.
            </p>
          </div>

          <div className="px-5 py-4 space-y-4">

            {/* Formula explanation */}
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-100 rounded text-xs text-amber-800">
              <Info className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p><span className="font-semibold">Formula:</span> partner_required_capital = partner_entry_valuation × ownership_percent / 100</p>
                <p><span className="font-semibold">JJ deal spread:</span> partner_entry_valuation − jj_original_acquisition_cost (JJ's premium for finding the deal)</p>
                <p className="text-amber-700">These are configuration values. They are never inferred automatically from transactions.</p>
              </div>
            </div>

            {capitalErr && (
              <div className="p-3 bg-red-50 border border-red-200 rounded text-xs text-red-700 flex items-start gap-2">
                <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" /> {capitalErr}
              </div>
            )}

            {capitalLoading ? (
              <p className="text-sm text-gray-400">Loading capital data…</p>
            ) : (
              <div className="space-y-4">
                {openRows.map(row => {
                  const cap      = capital.find(c => c.partner_name === row.partner_name)
                  const isEditing = editing === row.partner_name
                  const wasSaved  = savedPartner === row.partner_name

                  // Live computed values while editing
                  const liveRequired = isEditing && draft
                    ? computeRequired(draft.partner_entry_valuation, Number(row.ownership_pct))
                    : cap?.partner_required_capital ?? null

                  const livePaid = isEditing && draft
                    ? (toNumOrNull(draft.amount_paid_by_partner) ?? 0)
                    : cap?.amount_paid_by_partner ?? 0

                  const liveRemaining = liveRequired != null
                    ? Math.round((liveRequired - livePaid) * 100) / 100
                    : null

                  const liveSpread = isEditing && draft
                    ? computeSpread(draft.partner_entry_valuation, draft.jj_original_acquisition_cost)
                    : cap?.jj_deal_spread ?? null

                  const livePremium = liveSpread != null
                    ? Math.round(liveSpread * Number(row.ownership_pct) / 100 * 100) / 100
                    : null

                  return (
                    <div
                      key={row.id}
                      className={`border rounded-lg ${isEditing ? 'border-blue-300 bg-blue-50' : 'border-gray-200'}`}
                    >
                      {/* Partner header */}
                      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-gray-800">{row.partner_name}</span>
                          <span className="text-xs text-gray-400 font-mono">{pct(row.ownership_pct)}</span>
                          {wasSaved && (
                            <span className="text-xs text-green-600 font-medium">✓ Saved</span>
                          )}
                        </div>
                        {!isEditing ? (
                          <button
                            onClick={() => startEdit(row.partner_name, Number(row.ownership_pct))}
                            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
                          >
                            <Pencil className="h-3 w-3" />
                            {cap ? 'Edit' : 'Add capital data'}
                          </button>
                        ) : (
                          <button
                            onClick={cancelEdit}
                            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
                          >
                            <X className="h-3.5 w-3.5" /> Cancel
                          </button>
                        )}
                      </div>

                      {/* Fields */}
                      <div className="px-4 py-3">
                        {isEditing && draft ? (
                          /* ── Edit form ── */
                          <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                              {/* Entry date */}
                              <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">
                                  Entry Date
                                </label>
                                <input
                                  type="date"
                                  value={draft.entry_date}
                                  onChange={e => setDraft(d => d && ({ ...d, entry_date: e.target.value }))}
                                  className="w-full border border-gray-200 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                              </div>

                              {/* JJ original cost */}
                              <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">
                                  JJ Original Acquisition Cost (€)
                                </label>
                                <input
                                  type="number"
                                  step="1"
                                  placeholder="e.g. 400000"
                                  value={draft.jj_original_acquisition_cost}
                                  onChange={e => setDraft(d => d && ({ ...d, jj_original_acquisition_cost: e.target.value }))}
                                  className="w-full border border-gray-200 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                                <p className="text-xs text-gray-400 mt-0.5">What JJ paid to acquire/control the property</p>
                              </div>

                              {/* Partner entry valuation */}
                              <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">
                                  Partner Entry Valuation (€) <span className="text-amber-600">*</span>
                                </label>
                                <input
                                  type="number"
                                  step="1"
                                  placeholder="e.g. 520000"
                                  value={draft.partner_entry_valuation}
                                  onChange={e => setDraft(d => d && ({ ...d, partner_entry_valuation: e.target.value }))}
                                  className="w-full border border-gray-200 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                                <p className="text-xs text-gray-400 mt-0.5">Agreed property value when partner joined</p>
                              </div>

                              {/* Amount paid */}
                              <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">
                                  Amount Paid by Partner (€)
                                </label>
                                <input
                                  type="number"
                                  step="1"
                                  placeholder="0"
                                  value={draft.amount_paid_by_partner}
                                  onChange={e => setDraft(d => d && ({ ...d, amount_paid_by_partner: e.target.value }))}
                                  className="w-full border border-gray-200 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                              </div>
                            </div>

                            {/* Notes */}
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                              <input
                                type="text"
                                value={draft.notes}
                                onChange={e => setDraft(d => d && ({ ...d, notes: e.target.value }))}
                                placeholder="Optional notes about this capital arrangement"
                                className="w-full border border-gray-200 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </div>

                            {/* Live computed preview */}
                            <div className="grid grid-cols-2 gap-3 mt-2 p-3 bg-white border border-gray-100 rounded">
                              <div>
                                <p className="text-xs text-gray-400 mb-0.5">Partner Required Capital</p>
                                <p className={`text-sm font-semibold ${liveRequired != null ? 'text-gray-800' : 'text-gray-300'}`}>
                                  {liveRequired != null ? EUR(liveRequired) : '—'}
                                </p>
                                <p className="text-xs text-gray-400">= entry val × {pct(row.ownership_pct)}</p>
                              </div>
                              <div>
                                <p className="text-xs text-gray-400 mb-0.5">Remaining Due</p>
                                <p className={`text-sm font-semibold ${
                                  liveRemaining == null ? 'text-gray-300'
                                  : liveRemaining > 0   ? 'text-red-600'
                                  : liveRemaining < 0   ? 'text-orange-600'
                                  : 'text-green-600'
                                }`}>
                                  {liveRemaining != null ? EUR(liveRemaining) : '—'}
                                </p>
                                {liveRemaining != null && liveRemaining < 0 && (
                                  <p className="text-xs text-orange-500">Overpaid</p>
                                )}
                              </div>
                              <div>
                                <p className="text-xs text-gray-400 mb-0.5">Total Deal Spread (property)</p>
                                <p className={`text-sm font-semibold ${liveSpread != null ? 'text-green-700' : 'text-gray-300'}`}>
                                  {liveSpread != null ? EUR(liveSpread) : '—'}
                                </p>
                                <p className="text-xs text-gray-400">entry val − JJ cost</p>
                              </div>
                              <div>
                                <p className="text-xs text-gray-400 mb-0.5">Partner Premium To JJ</p>
                                <p className={`text-sm font-semibold ${livePremium != null ? 'text-green-700' : 'text-gray-300'}`}>
                                  {livePremium != null ? EUR(livePremium) : '—'}
                                </p>
                                <p className="text-xs text-gray-400">spread × {pct(row.ownership_pct)}</p>
                              </div>
                            </div>

                            <div className="flex gap-2 pt-1">
                              <button
                                onClick={() => handleSave(row.partner_name, Number(row.ownership_pct))}
                                disabled={saving}
                                className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs rounded font-medium"
                              >
                                <Save className="h-3.5 w-3.5" />
                                {saving ? 'Saving…' : 'Save Capital Data'}
                              </button>
                              <button
                                onClick={cancelEdit}
                                className="px-3 py-1.5 border border-gray-200 text-gray-600 text-xs rounded"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          /* ── Read-only display ── */
                          cap ? (
                            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                              {/* Row 1 */}
                              <div>
                                <span className="text-xs text-gray-400">Entry Date</span>
                                <p className="font-medium text-gray-700">{cap.entry_date ?? '—'}</p>
                              </div>
                              <div>
                                <span className="text-xs text-gray-400">JJ Original Acquisition Cost</span>
                                <p className="font-medium text-gray-700">{eurOrDash(cap.jj_original_acquisition_cost)}</p>
                              </div>
                              {/* Row 2 */}
                              <div>
                                <span className="text-xs text-gray-400">Partner Entry Valuation</span>
                                <p className="font-semibold text-gray-800">{eurOrDash(cap.partner_entry_valuation)}</p>
                              </div>
                              <div>
                                <span className="text-xs text-gray-400">Partner Required Capital</span>
                                <p className="font-semibold text-gray-800">
                                  {eurOrDash(cap.partner_required_capital)}
                                  {cap.partner_required_capital != null && (
                                    <span className="text-xs text-gray-400 font-normal ml-1">
                                      = {eurOrDash(cap.partner_entry_valuation)} × {pct(row.ownership_pct)}
                                    </span>
                                  )}
                                </p>
                              </div>
                              {/* Row 3 */}
                              <div>
                                <span className="text-xs text-gray-400">Amount Paid by Partner</span>
                                <p className="font-medium text-gray-700">{EUR(cap.amount_paid_by_partner)}</p>
                              </div>
                              <div>
                                <span className="text-xs text-gray-400">Remaining Capital Due</span>
                                <p className={`font-semibold ${
                                  cap.remaining_capital_due == null ? 'text-gray-300'
                                  : cap.remaining_capital_due > 0   ? 'text-red-600'
                                  : cap.remaining_capital_due < 0   ? 'text-orange-600'
                                  : 'text-green-600'
                                }`}>
                                  {eurOrDash(cap.remaining_capital_due)}
                                  {cap.remaining_capital_due === 0 && ' ✓'}
                                  {(cap.remaining_capital_due ?? 0) < 0 && ' (overpaid)'}
                                </p>
                              </div>
                              {/* Row 4: Deal spread — two columns */}
                              <div>
                                <span className="text-xs text-gray-400">Total Deal Spread (property)</span>
                                <p className={`font-semibold ${cap.jj_deal_spread != null ? 'text-green-700' : 'text-gray-300'}`}>
                                  {eurOrDash(cap.jj_deal_spread)}
                                  {cap.jj_deal_spread != null && (
                                    <span className="text-xs text-gray-400 font-normal ml-1">
                                      = {eurOrDash(cap.partner_entry_valuation)} − {eurOrDash(cap.jj_original_acquisition_cost)}
                                    </span>
                                  )}
                                </p>
                              </div>
                              <div>
                                <span className="text-xs text-gray-400">Partner Premium To JJ</span>
                                <p className={`font-semibold ${cap.partner_premium_to_jj != null ? 'text-green-700' : 'text-gray-300'}`}>
                                  {eurOrDash(cap.partner_premium_to_jj)}
                                  {cap.partner_premium_to_jj != null && (
                                    <span className="text-xs text-gray-400 font-normal ml-1">
                                      = {eurOrDash(cap.jj_deal_spread)} × {pct(row.ownership_pct)}
                                    </span>
                                  )}
                                </p>
                                <p className="text-xs text-gray-400 mt-0.5">
                                  Entry premium this partner paid to JJ. Configuration only — not a transaction.
                                </p>
                              </div>
                              {/* Notes */}
                              {cap.notes && (
                                <div className="col-span-2">
                                  <span className="text-xs text-gray-400">Notes</span>
                                  <p className="text-sm text-gray-600">{cap.notes}</p>
                                </div>
                              )}
                            </div>
                          ) : (
                            <p className="text-sm text-gray-400 italic">
                              No capital data entered yet. Click "Add capital data" to configure.
                            </p>
                          )
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
