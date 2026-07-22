import React from 'react'
import type { ExecutiveBriefItem as BriefItemType } from '@/lib/executive/executiveBriefTypes'
import { EXECUTIVE_LABELS } from '@/lib/executive/executiveBriefTypes'

// ─── Priority styling ─────────────────────────────────────────────────────

const PRIORITY_STYLES = {
  critical: {
    border: 'border-red-200',
    bg: 'bg-red-50',
    badge: 'bg-red-100 text-red-800',
    label: 'Critical',
  },
  high: {
    border: 'border-amber-200',
    bg: 'bg-amber-50',
    badge: 'bg-amber-100 text-amber-800',
    label: 'High',
  },
  normal: {
    border: 'border-gray-200',
    bg: 'bg-white',
    badge: 'bg-gray-100 text-gray-700',
    label: 'Normal',
  },
  monitor: {
    border: 'border-gray-100',
    bg: 'bg-gray-50',
    badge: 'bg-gray-100 text-gray-500',
    label: 'Monitor',
  },
} as const

// ─── Component ────────────────────────────────────────────────────────────

interface BriefItemProps {
  item: BriefItemType
}

/**
 * BriefItem — renders a single Executive Brief item.
 *
 * Answers the 4 questions:
 *   1. What happened? → title
 *   2. Why does it matter? → explanation + impact
 *   3. What should I do? → recommendedAction
 *   4. Why should I trust this? → evidence + confidence
 *
 * React renders only. All values are pre-computed server-side.
 */
export function BriefItem({ item }: BriefItemProps) {
  const style = PRIORITY_STYLES[item.priority]
  const executiveLabel = EXECUTIVE_LABELS[item.executiveOwner]

  return (
    <div
      className={`rounded-lg border ${style.border} ${style.bg} px-5 py-4`}
      data-testid="brief-item"
      data-priority={item.priority}
      data-executive={item.executiveOwner}
    >
      {/* Row 1: Title + priority badge */}
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-gray-900">{item.title}</p>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${style.badge}`}
          data-testid="priority-badge"
        >
          {style.label}
        </span>
      </div>

      {/* Row 2: Explanation */}
      <p className="mt-1.5 text-sm text-gray-600">{item.explanation}</p>

      {/* Row 3: Impact (if present) */}
      {item.impact && (
        <p className="mt-1.5 text-xs text-gray-500">
          <span className="font-medium">Impact:</span> {item.impact}
        </p>
      )}

      {/* Row 4: Recommended action */}
      {item.recommendedAction && (
        <p className="mt-2 text-sm text-gray-800">
          <span className="font-medium">Action:</span> {item.recommendedAction}
        </p>
      )}

      {/* Row 5: Metadata — executive owner, confidence, decision flag */}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-400">
        <span>{executiveLabel}</span>
        <span className="text-gray-300">|</span>
        <span>Confidence: {item.confidence}</span>
        {item.decisionRequired && (
          <>
            <span className="text-gray-300">|</span>
            <span className="font-medium text-amber-600">Decision required</span>
          </>
        )}
        {item.evidence.length > 0 && (
          <>
            <span className="text-gray-300">|</span>
            <span>
              {item.evidence.length} source{item.evidence.length !== 1 ? 's' : ''}
            </span>
          </>
        )}
      </div>
    </div>
  )
}
