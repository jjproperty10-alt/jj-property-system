/**
 * @component BlockerResolutionLink
 * @description Inline resolution link for a blocked Claim.
 *
 * Shows the first resolution step with estimated effort.
 * Clicking expands all resolution steps.
 *
 * Rules:
 *   - Purely informational. No actions, no DB writes.
 *   - Data comes from ClaimEvaluation.gap.resolutionSteps.
 *   - If gap is null (shouldn't happen on a blocker), renders nothing.
 *
 * FR-001: This component is owned by PR #1.
 */

'use client'

import { useState } from 'react'
import type { ClaimEvaluation } from '@/lib/finance'

interface BlockerResolutionLinkProps {
  claim: ClaimEvaluation
}

export function BlockerResolutionLink({ claim }: BlockerResolutionLinkProps) {
  const [expanded, setExpanded] = useState(false)
  const gap = claim.gap

  if (!gap || gap.resolutionSteps.length === 0) return null

  const totalMinutes = gap.resolutionSteps.reduce(
    (sum, s) => sum + s.estimatedEffortMinutes,
    0,
  )

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="text-xs text-red-600 hover:text-red-800 font-medium transition-colors"
      >
        {expanded ? '▲ Hide resolution steps' : `▶ How to resolve (~${totalMinutes} min)`}
      </button>

      {expanded && (
        <ol className="mt-2 flex flex-col gap-1.5 pl-1">
          {gap.resolutionSteps.map((step, i) => (
            <li key={step.action} className="flex gap-2 text-xs text-red-700">
              <span className="shrink-0 font-semibold">{i + 1}.</span>
              <div>
                <span>{step.description}</span>
                <span className="ml-1.5 text-red-400">(~{step.estimatedEffortMinutes} min)</span>
              </div>
            </li>
          ))}
          <li className="mt-1 text-xs text-green-700 font-medium">
            After resolution → confidence: {gap.confidenceAfter}%
          </li>
        </ol>
      )}
    </div>
  )
}
