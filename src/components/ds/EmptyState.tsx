import type { ReactNode } from 'react'

interface EmptyStateProps {
  /** Primary heading — e.g. "No transactions recorded yet." */
  title: string
  /** Optional supporting text. */
  description?: string
  /** Optional CTA or link rendered below the description. */
  action?: ReactNode
  /** Optional icon rendered above the title. */
  icon?: ReactNode
  /** Additional CSS classes for the wrapper. */
  className?: string
}

/**
 * EmptyState — Design System 2035
 *
 * Centered empty state pattern for zero-data views.
 *
 * Usage:
 *   <EmptyState
 *     title="No timeline events recorded yet."
 *     description="Events will appear here once the investment lifecycle begins."
 *   />
 *
 * Matches the inline empty-state messages already used in PartnerTimelineSection
 * but extracted as a reusable, accessible component with consistent styling.
 */
export function EmptyState({ title, description, action, icon, className = '' }: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center py-10 px-4 ${className}`.trim()}
      role="status"
    >
      {icon && (
        <div className="mb-3 text-gray-300" aria-hidden="true">
          {icon}
        </div>
      )}

      <p className="text-sm font-medium text-gray-600">{title}</p>

      {description && (
        <p className="mt-1 text-xs text-gray-400 max-w-xs leading-relaxed">{description}</p>
      )}

      {action && (
        <div className="mt-4">
          {action}
        </div>
      )}
    </div>
  )
}
