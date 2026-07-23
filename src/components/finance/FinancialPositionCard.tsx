/**
 * @component FinancialPositionCard
 * @description Displays the partner's current financial position summary.
 *
 * Shows: balance, total received/paid, 3-axis position score.
 * Score is labeled DESCRIPTIVE to communicate KG-4 to any future reader.
 *
 * Rules:
 *   - Renders numbers only. No business logic.
 *   - score.total is displayed as an indicator, never as a gate label.
 *   - allowedDecisions/blockedDecisions come from the engine (position),
 *     never computed in this component.
 *
 * FR-001: This component is owned by PR #1.
 */

import type { FinancialPosition } from '@/lib/finance'

interface FinancialPositionCardProps {
  position: FinancialPosition
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  const color = value >= 80 ? 'bg-green-500' : value >= 50 ? 'bg-amber-400' : 'bg-red-400'
  return (
    <div className="flex items-center gap-3">
      <span className="w-28 text-sm text-gray-500 shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${color} transition-all`}
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
      <span className="w-8 text-right text-sm font-mono text-gray-700">{value}</span>
    </div>
  )
}

function EurAmount({ value, label }: { value: number | null; label: string }) {
  const display =
    value === null
      ? '—'
      : `€${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const isNegative = value !== null && value < 0

  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-gray-500 uppercase tracking-wide">{label}</span>
      <span
        className={`text-xl font-semibold tabular-nums ${isNegative ? 'text-red-600' : 'text-gray-900'}`}
      >
        {display}
      </span>
    </div>
  )
}

export function FinancialPositionCard({ position }: FinancialPositionCardProps) {
  const blockerCount = position.blockers.length

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Financial Position</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Computed {new Date(position.computedAt).toLocaleString('en-GB')}
          </p>
        </div>
        {blockerCount > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-600/20">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-500" />
            {blockerCount} blocker{blockerCount !== 1 ? 's' : ''}
          </span>
        )}
        {blockerCount === 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500" />
            All claims supported
          </span>
        )}
      </div>

      {/* Balance row */}
      <div className="px-6 py-5 grid grid-cols-3 gap-6 border-b border-gray-100">
        <EurAmount value={position.totalReceivedEur} label="Total received" />
        <EurAmount value={position.totalPaidEur} label="Total paid" />
        <EurAmount value={position.balanceEur} label="Balance" />
      </div>

      {/* Score axes — descriptive indicator only */}
      <div className="px-6 py-4">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">
          Position score (descriptive indicator)
        </p>
        <div className="flex flex-col gap-2">
          <ScoreBar label="Coverage" value={position.score.coverage} />
          <ScoreBar label="Consistency" value={position.score.consistency} />
          <ScoreBar label="Evidence" value={position.score.evidence} />
        </div>
        <p className="mt-3 text-right text-xs text-gray-400">
          Overall: <span className="font-semibold text-gray-600">{position.score.total}</span>/100
        </p>
      </div>

      {/* Period */}
      <div className="px-6 pb-4">
        <p className="text-xs text-gray-400">
          Period:{' '}
          <span className="text-gray-600 font-medium">
            {position.periodStart} → {position.periodEnd}
          </span>
        </p>
      </div>
    </div>
  )
}
