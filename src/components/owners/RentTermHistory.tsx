'use client'

/**
 * RentTermHistory — Chronological table of rent term changes under a lease.
 *
 * P1 LTR Operations — Rent Terms + Expected Rent + FIFO Allocator
 *
 * Shows:
 *   - Each rent term with effective dates, monthly amount, reason
 *   - Governing evidence reference (if present)
 *   - Active term highlighted (no effective_to date)
 *
 * DS compliance:
 *   - MoneyValue for rent amounts
 *   - StatusBadge for active/historical indicator
 *   - P-ARCH-1: null effective_to → "Present" (not "Unknown")
 *   - EX-3: every number explains itself (reason column)
 */

import { MoneyValue, StatusBadge } from '@/components/ds'
import type { RentTermDTO, RentTermReason } from '@/lib/owners/ownerWorkspaceTypes'

// ─── Display mappings ───────────────────────────────────────────────────────

const REASON_LABELS: Record<RentTermReason, string> = {
  initial: 'Initial',
  annual_increase: 'Annual Increase',
  renegotiation: 'Renegotiation',
  correction: 'Correction',
  market_adjustment: 'Market Adjustment',
}

// ─── Props ──────────────────────────────────────────────────────────────────

export interface RentTermHistoryProps {
  terms: readonly RentTermDTO[]
}

// ─── Component ──────────────────────────────────────────────────────────────

export function RentTermHistory({ terms }: RentTermHistoryProps) {
  if (terms.length === 0) {
    return (
      <p className="text-xs text-gray-400 italic py-2">
        No rent terms configured. Add a rent term to start tracking expected rent.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider py-1.5 pr-3">
              From
            </th>
            <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider py-1.5 pr-3">
              To
            </th>
            <th className="text-right text-xs font-medium text-gray-400 uppercase tracking-wider py-1.5 pr-3">
              Monthly Rent
            </th>
            <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider py-1.5 pr-3">
              Reason
            </th>
            <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider py-1.5">
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {terms.map((term, idx) => {
            const isActive = term.effectiveTo === null
            const isLatest = idx === terms.length - 1

            // Show change delta from previous term
            const prevTerm = idx > 0 ? terms[idx - 1] : null
            const delta = prevTerm
              ? term.monthlyRentEur - prevTerm.monthlyRentEur
              : null

            return (
              <tr
                key={term.id}
                className={`border-b border-gray-50 ${isActive ? 'bg-emerald-50/30' : ''}`}
              >
                <td className="py-2 pr-3 text-gray-700" dir="ltr">
                  {formatDate(term.effectiveFrom)}
                </td>
                <td className="py-2 pr-3 text-gray-500" dir="ltr">
                  {term.effectiveTo ? formatDate(term.effectiveTo) : 'Present'}
                </td>
                <td className="py-2 pr-3 text-right">
                  <MoneyValue
                    amount={term.monthlyRentEur}
                    size="sm"
                    className={isActive ? 'font-semibold text-gray-900' : 'text-gray-700'}
                  />
                  {delta !== null && delta !== 0 && (
                    <span
                      className={`text-xs ml-1 ${delta > 0 ? 'text-emerald-600' : 'text-rose-600'}`}
                    >
                      {delta > 0 ? '+' : ''}€{Math.abs(delta).toLocaleString('en', { maximumFractionDigits: 0 })}
                    </span>
                  )}
                </td>
                <td className="py-2 pr-3">
                  <span className="text-xs text-gray-600">
                    {REASON_LABELS[term.reason] ?? term.reason}
                  </span>
                  {term.governingEvidence && (
                    <span
                      className="text-xs text-gray-400 block truncate max-w-[200px]"
                      title={term.governingEvidence}
                    >
                      {term.governingEvidence}
                    </span>
                  )}
                </td>
                <td className="py-2">
                  {isActive ? (
                    <StatusBadge status="active" label="Current" />
                  ) : isLatest ? (
                    <StatusBadge status="completed" label="Superseded" />
                  ) : (
                    <StatusBadge status="unknown" label="Historical" />
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

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
