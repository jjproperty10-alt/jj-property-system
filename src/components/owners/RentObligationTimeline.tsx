'use client'

/**
 * RentObligationTimeline — Month-by-month obligation list with status chips
 * and FIFO allocation detail.
 *
 * P1 LTR Operations — Rent Terms + Expected Rent + FIFO Allocator
 *
 * Shows:
 *   - Each obligation month with expected vs received amounts
 *   - Status chip per obligation (expected/due/partial/received/overdue/waived/reversed)
 *   - Expandable FIFO allocation detail (settlement_evidence entries)
 *   - Mid-cycle prorata segments (when rent changed mid-month)
 *
 * DS compliance:
 *   - MoneyValue for all monetary amounts
 *   - StatusBadge for obligation status
 *   - P-ARCH-1: null → em dash (MoneyValue handles)
 *   - P-ARCH-2: settlement evidence preserves payer/payee identity
 *   - P-LEDGER-1: Cash Reality shown in evidence (payer, payee, amount, date, mechanism)
 */

import { useState, useCallback } from 'react'
import { MoneyValue, StatusBadge } from '@/components/ds'
import type {
  RentObligationRowDTO,
  RentObligationStatus,
  SettlementEvidenceEntry,
  RentProrataSegment,
} from '@/lib/owners/ownerWorkspaceTypes'
import type { StatusToken } from '@/lib/ds/tokens'

// ─── Display mappings ───────────────────────────────────────────────────────

const OBLIGATION_STATUS_MAP: Record<RentObligationStatus, { token: StatusToken; label: string }> = {
  expected: { token: 'pending', label: 'Expected' },
  due: { token: 'attention', label: 'Due' },
  partial: { token: 'attention', label: 'Partial' },
  received: { token: 'completed', label: 'Received' },
  overdue: { token: 'critical', label: 'Overdue' },
  waived: { token: 'unknown', label: 'Waived' },
  reversed: { token: 'unknown', label: 'Reversed' },
}

// ─── Props ──────────────────────────────────────────────────────────────────

export interface RentObligationTimelineProps {
  obligations: readonly RentObligationRowDTO[]
}

// ─── Component ──────────────────────────────────────────────────────────────

export function RentObligationTimeline({ obligations }: RentObligationTimelineProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const toggleExpand = useCallback((id: string) => {
    setExpandedId(prev => prev === id ? null : id)
  }, [])

  if (obligations.length === 0) {
    return (
      <p className="text-xs text-gray-400 italic py-2">
        No rent obligations generated. Generate obligations to start tracking payments.
      </p>
    )
  }

  return (
    <div className="space-y-1">
      {obligations.map(obl => {
        const statusInfo = OBLIGATION_STATUS_MAP[obl.status] ?? {
          token: 'unknown' as StatusToken,
          label: obl.status,
        }
        const expected = parseFloat(obl.expectedAmountEur)
        const received = parseFloat(obl.receivedAmountEur)
        const unapplied = parseFloat(obl.unappliedCreditEur)
        const isExpanded = expandedId === obl.id
        const hasDetail = (obl.settlementEvidence && obl.settlementEvidence.length > 0)
          || (obl.prorataDetails && obl.prorataDetails.length > 0)

        return (
          <div
            key={obl.id}
            className={`border rounded-md transition-colors ${
              obl.status === 'overdue'
                ? 'border-rose-200 bg-rose-50/30'
                : obl.status === 'received'
                  ? 'border-emerald-100 bg-emerald-50/20'
                  : 'border-gray-100 bg-white'
            }`}
          >
            {/* Main row */}
            <button
              type="button"
              onClick={() => hasDetail && toggleExpand(obl.id)}
              disabled={!hasDetail}
              className={`w-full text-left px-3 py-2 flex items-center gap-3 ${
                hasDetail ? 'cursor-pointer hover:bg-gray-50/50' : 'cursor-default'
              }`}
              aria-expanded={isExpanded}
            >
              {/* Month */}
              <span className="text-sm font-medium text-gray-800 w-20 shrink-0" dir="ltr">
                {formatMonth(obl.obligationMonth)}
              </span>

              {/* Status */}
              <StatusBadge status={statusInfo.token} label={statusInfo.label} />

              {/* Expected / Received */}
              <div className="flex-1 flex items-center gap-4 justify-end">
                <div className="text-right">
                  <span className="text-xs text-gray-400 block">Expected</span>
                  <MoneyValue amount={expected} size="sm" className="text-gray-700" />
                </div>
                <div className="text-right">
                  <span className="text-xs text-gray-400 block">Received</span>
                  <MoneyValue
                    amount={received}
                    size="sm"
                    className={received >= expected ? 'text-emerald-700 font-medium' : 'text-gray-700'}
                  />
                </div>
                {unapplied > 0 && (
                  <div className="text-right">
                    <span className="text-xs text-gray-400 block">Credit</span>
                    <MoneyValue amount={unapplied} size="sm" className="text-blue-600" />
                  </div>
                )}
              </div>

              {/* Expand indicator */}
              {hasDetail && (
                <span className="text-gray-300 text-xs shrink-0" aria-hidden>
                  {isExpanded ? '▾' : '▸'}
                </span>
              )}
            </button>

            {/* Expanded detail */}
            {isExpanded && hasDetail && (
              <div className="px-3 pb-3 pt-1 space-y-2 border-t border-gray-50">
                {/* Prorata segments */}
                {obl.prorataDetails && obl.prorataDetails.length > 0 && (
                  <ProrataDetail segments={obl.prorataDetails} />
                )}

                {/* Settlement evidence (FIFO allocations) */}
                {obl.settlementEvidence && obl.settlementEvidence.length > 0 && (
                  <SettlementDetail entries={obl.settlementEvidence} />
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Prorata Detail ─────────────────────────────────────────────────────────

function ProrataDetail({ segments }: { segments: readonly RentProrataSegment[] }) {
  return (
    <div>
      <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
        Mid-cycle proration
      </span>
      <div className="mt-1 space-y-0.5">
        {segments.map((seg, i) => (
          <div key={i} className="flex items-center gap-2 text-xs text-gray-600">
            <span dir="ltr">
              {formatDate(seg.segmentStart)} — {formatDate(seg.segmentEnd)}
            </span>
            <span className="text-gray-400">
              ({seg.segmentDays}d @ €{seg.monthlyRentEur.toLocaleString('en', { maximumFractionDigits: 0 })}/mo)
            </span>
            <span className="font-medium">
              = <MoneyValue amount={seg.segmentAmountEur} size="sm" className="inline" />
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Settlement Evidence ────────────────────────────────────────────────────

function SettlementDetail({ entries }: { entries: readonly SettlementEvidenceEntry[] }) {
  return (
    <div>
      <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
        Payment allocations (FIFO)
      </span>
      <table className="w-full text-xs mt-1">
        <thead>
          <tr className="text-gray-400">
            <th className="text-left font-medium py-0.5 pr-2">#</th>
            <th className="text-left font-medium py-0.5 pr-2">Date</th>
            <th className="text-left font-medium py-0.5 pr-2">Payer</th>
            <th className="text-left font-medium py-0.5 pr-2">Payee</th>
            <th className="text-right font-medium py-0.5 pr-2">Amount</th>
            <th className="text-left font-medium py-0.5">Method</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry, i) => (
            <tr key={i} className="border-t border-gray-50 text-gray-600">
              <td className="py-1 pr-2 text-gray-400">{entry.allocation_order}</td>
              <td className="py-1 pr-2" dir="ltr">{formatDate(entry.date)}</td>
              <td className="py-1 pr-2 font-medium">{entry.payer}</td>
              <td className="py-1 pr-2 font-medium">{entry.payee}</td>
              <td className="py-1 pr-2 text-right">
                <MoneyValue amount={entry.amount} size="sm" className="text-gray-800" />
              </td>
              <td className="py-1 text-gray-400">{entry.mechanism}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatMonth(isoDate: string): string {
  try {
    const d = new Date(isoDate)
    return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
  } catch {
    return isoDate
  }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}
