import type { ReactNode } from 'react'
import type { StatusToken } from '@/lib/ds/tokens'
import { STATUS_CLASSES } from '@/lib/ds/tokens'

interface StatusBadgeProps {
  /** Semantic status key. Each status maps to distinct colors and a default label. */
  status: StatusToken
  /** Human-readable label — REQUIRED. Design rule: NEVER color-only; always has text. */
  label: string
  /** Optional icon rendered before the label. */
  icon?: ReactNode
  /** Additional CSS classes for the outer pill. */
  className?: string
}

/**
 * StatusBadge — Design System 2035
 *
 * Semantic status pill. Accessibility rule: label text is ALWAYS visible.
 * Color is a secondary reinforcement, never the sole indicator.
 *
 * Statuses:
 *   active      — emerald (positive, operational)
 *   pending     — violet (waiting, not yet started)
 *   confirmed   — blue (validated, approved)
 *   attention   — amber (needs review, unconfirmed)
 *   critical    — rose (error, blocking issue)
 *   unknown     — gray (data not available)
 *   completed   — emerald (done, closed)
 */
export function StatusBadge({ status, label, icon, className = '' }: StatusBadgeProps) {
  const { bg, text, border, dot } = STATUS_CLASSES[status]

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${bg} ${text} ${border} ${className}`.trim()}
      role="status"
    >
      {icon ? (
        <span className="shrink-0" aria-hidden="true">{icon}</span>
      ) : (
        <span className={`shrink-0 w-1.5 h-1.5 rounded-full ${dot}`} aria-hidden="true" />
      )}
      {label}
    </span>
  )
}
