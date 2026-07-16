import type { ReactNode } from 'react'

interface SectionHeaderProps {
  /** Section title — rendered as xs uppercase tracking-widest label. */
  title: string
  /** Optional subtitle rendered below the title in smaller gray text. */
  subtitle?: string
  /** Optional element rendered on the right side (e.g. date range, count). */
  action?: ReactNode
  /** Optional badge rendered to the right of the title (e.g. StatusBadge). */
  badge?: ReactNode
  /** Additional CSS classes for the wrapper. */
  className?: string
}

/**
 * SectionHeader — Design System 2035
 *
 * Standard section header pattern.
 *
 * Label style:   xs, uppercase, tracking-widest, bold, secondary text.
 * Right slot:    action OR badge — use for metadata, dates, or status pills.
 * Subtitle:      optional supporting text below the title.
 *
 * Pattern extracted from PartnerCapitalSection / PartnerFinancialSection
 * h3 headers (PR #52). Consistent spacing and typography across all sections.
 */
export function SectionHeader({ title, subtitle, action, badge, className = '' }: SectionHeaderProps) {
  return (
    <div className={`flex items-start justify-between gap-3 ${className}`.trim()}>
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="jj-label">{title}</h3>
          {badge && <div>{badge}</div>}
        </div>
        {subtitle && (
          <p className="mt-0.5 text-xs text-gray-500 leading-relaxed">{subtitle}</p>
        )}
      </div>
      {action && (
        <div className="shrink-0 text-xs text-gray-500">
          {action}
        </div>
      )}
    </div>
  )
}
