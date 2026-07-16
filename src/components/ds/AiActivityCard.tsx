import type { AiActivityStatus } from '@/lib/ds/tokens'
import { AI_ACTIVITY_CLASSES } from '@/lib/ds/tokens'

interface AiActivityCardProps {
  /** What the AI did — short action description. */
  action: string
  /**
   * Completion status.
   *
   * CRITICAL design rule:
   *   'pending_approval' MUST be visually distinct from 'completed'.
   *   pending_approval = amber (waiting for human approval).
   *   completed        = emerald (done, no action needed).
   *   blocked          = rose (cannot proceed).
   *
   * Never use green/success color for pending_approval.
   */
  status: AiActivityStatus
  /** ISO timestamp or human-readable time string. */
  timestamp?: string
  /** Source of the action — e.g. "JHKA", "PMS Connector", "Migration 003". */
  source?: string
  /** Extended description or key findings. */
  details?: string
  /** Additional CSS classes for the wrapper. */
  className?: string
}

/**
 * AiActivityCard — Design System 2035 (stub — visual pattern only)
 *
 * Displays what an AI agent did, when it did it, and whether human approval
 * is required. This is a VISUAL STUB — no logic, no event handlers.
 * Business logic (approving, retrying, blocking) is application-layer concern.
 *
 * Visual distinction matrix:
 *   completed        → emerald badge  — "done, no action needed"
 *   pending_approval → amber badge    — "waiting for your decision"
 *   blocked          → rose badge     — "cannot proceed, needs intervention"
 *
 * Used in admin views to show JHKA activity, PMS sync events,
 * migration results, and verification task progress.
 */
export function AiActivityCard({
  action,
  status,
  timestamp,
  source,
  details,
  className = '',
}: AiActivityCardProps) {
  const { badge, dot, label } = AI_ACTIVITY_CLASSES[status]

  return (
    <div className={`jj-card px-4 py-4 ${className}`.trim()}>

      {/* Header row */}
      <div className="flex items-start justify-between gap-3">

        {/* Left: dot + action */}
        <div className="flex items-start gap-2.5 min-w-0">
          {/* Status dot */}
          <span
            className={`shrink-0 w-2 h-2 rounded-full mt-1.5 ${dot}`}
            aria-hidden="true"
          />
          {/* Action text */}
          <p className="text-sm font-semibold text-gray-800 leading-snug">{action}</p>
        </div>

        {/* Right: status badge */}
        <span className={`shrink-0 text-xs font-semibold px-2.5 py-0.5 rounded-full ${badge}`}>
          {label}
        </span>
      </div>

      {/* Meta row — source + timestamp */}
      {(source || timestamp) && (
        <div className="mt-2 ml-[1.375rem] flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-400">
          {source && <span>{source}</span>}
          {timestamp && (
            <span className="tabular-nums" dir="ltr">{timestamp}</span>
          )}
        </div>
      )}

      {/* Details */}
      {details && (
        <p className="mt-2.5 ml-[1.375rem] text-xs text-gray-500 leading-relaxed">
          {details}
        </p>
      )}

      {/* Pending approval — explicit call-to-action hint */}
      {status === 'pending_approval' && (
        <div className="mt-3 ml-[1.375rem] pt-2.5 border-t border-amber-100">
          <p className="text-xs font-medium text-amber-700">
            Human approval required before this action takes effect.
          </p>
        </div>
      )}

    </div>
  )
}
