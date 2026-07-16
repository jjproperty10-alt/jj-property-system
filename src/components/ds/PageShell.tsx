import type { ReactNode } from 'react'
import type { PageMaxWidth } from '@/lib/ds/tokens'
import { PAGE_MAX_WIDTH } from '@/lib/ds/tokens'

interface PageShellProps {
  /** Page content. */
  children: ReactNode
  /** Maximum width constraint. Defaults to 'lg' (max-w-4xl = 896px). */
  maxWidth?: PageMaxWidth
  /** Additional CSS classes for the inner content wrapper. */
  className?: string
}

/**
 * PageShell — Design System 2035
 *
 * Standard responsive page layout wrapper.
 *
 * - Applies consistent horizontal + vertical padding
 * - Centres content with a configurable max-width
 * - Responsive: px-4 on mobile → px-6 on sm+ screens
 *
 * Use as the outermost wrapper in page components.
 * Does NOT render a background — page background is set at the html/body level.
 *
 * maxWidth options:
 *   md   — max-w-2xl  (672px)  — narrow forms, focused views
 *   lg   — max-w-4xl  (896px)  — partner reports, standard pages [default]
 *   xl   — max-w-6xl  (1152px) — admin dashboards, wide tables
 *   full — max-w-full           — edge-to-edge layouts
 */
export function PageShell({ children, maxWidth = 'lg', className = '' }: PageShellProps) {
  const maxWidthClass = PAGE_MAX_WIDTH[maxWidth]

  return (
    <div className={`w-full ${maxWidthClass} mx-auto px-4 sm:px-6 py-6 sm:py-8 ${className}`.trim()}>
      {children}
    </div>
  )
}
