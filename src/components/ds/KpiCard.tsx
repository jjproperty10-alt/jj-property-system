import type { ReactNode } from 'react'

interface KpiCardProps {
  /** Short uppercase label shown above the value (e.g. "Total Paid"). */
  label: string
  /** The primary value — any ReactNode (MoneyValue, string, number). */
  value: ReactNode
  /** Optional trend indicator rendered below the value. */
  trend?: ReactNode
  /** When true, renders a skeleton loading state. */
  loading?: boolean
  /** Additional CSS classes for the outer card. */
  className?: string
}

/**
 * KpiCard — Design System 2035
 *
 * Standard KPI display tile.
 *
 * Label: xs, uppercase, tracking-widest, secondary text.
 * Value: large, tabular, dir="ltr" (enforced by MoneyValue or consumer).
 * Trend: optional — free-form slot for up/down indicators.
 * Loading: renders skeleton placeholders.
 *
 * Pattern extracted from PartnerCapitalSection KpiTile (PR #52).
 * Generalised to accept any ReactNode as value (not just formatted strings).
 */
export function KpiCard({ label, value, trend, loading = false, className = '' }: KpiCardProps) {
  return (
    <div className={`jj-tile ${className}`.trim()}>
      {/* Label */}
      <div className="jj-label mb-1.5">{label}</div>

      {/* Value */}
      {loading ? (
        <div className="h-6 w-20 bg-gray-200 rounded animate-pulse" aria-busy="true" />
      ) : (
        <div className="text-xl font-bold text-gray-900 tabular-nums leading-tight">
          {value}
        </div>
      )}

      {/* Trend */}
      {trend && !loading && (
        <div className="mt-1 text-xs text-gray-500">
          {trend}
        </div>
      )}
    </div>
  )
}
