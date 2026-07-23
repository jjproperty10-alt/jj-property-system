/**
 * @component ClaimBreakdown
 * @description Lists all ClaimEvaluations with status, confidence, and strength.
 *
 * Renders: status badge, statement, confidence bar, blocker gap (if any).
 * Click on a claim opens EvidenceChainDrawer (via callback).
 *
 * Rules:
 *   - Receives pre-computed claims from the engine. No computation here.
 *   - Unsupported required claims appear first (mirror of buildEvidenceChain ordering).
 *   - EvidenceChainDrawer trigger is a callback prop — not embedded here.
 *
 * FR-001: This component is owned by PR #1.
 */

'use client'

import { useState } from 'react'
import type { ClaimEvaluation } from '@/lib/finance'
import { EvidenceChainDrawer } from './EvidenceChainDrawer'

const STATUS_STYLES: Record<string, string> = {
  supported:   'bg-green-50 text-green-700 ring-green-600/20',
  unsupported: 'bg-red-50 text-red-700 ring-red-600/20',
  pending:     'bg-amber-50 text-amber-700 ring-amber-600/20',
}

const STATUS_LABELS: Record<string, string> = {
  supported:   '✓ Supported',
  unsupported: '✗ Unsupported',
  pending:     '⋯ Pending',
}

interface ClaimRowProps {
  claim: ClaimEvaluation
  onShowEvidence: (claim: ClaimEvaluation) => void
}

function ClaimRow({ claim, onShowEvidence }: ClaimRowProps) {
  const styleClass = STATUS_STYLES[claim.status] ?? STATUS_STYLES.pending

  return (
    <div
      className={`rounded-xl border px-4 py-3 ${claim.status === 'unsupported' && claim.required ? 'border-red-200 bg-red-50/30' : 'border-gray-100 bg-white'}`}
    >
      <div className="flex items-start justify-between gap-3">
        {/* Left: required badge + statement */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${styleClass}`}
            >
              {STATUS_LABELS[claim.status]}
            </span>
            {claim.required && (
              <span className="text-xs text-gray-400 font-medium">Required</span>
            )}
          </div>
          <p className="text-sm text-gray-800 leading-snug">{claim.statement}</p>

          {/* Gap description */}
          {claim.gap && (
            <p className="mt-1.5 text-xs text-red-600 leading-snug">{claim.gap.description}</p>
          )}
        </div>

        {/* Right: confidence + evidence link */}
        <div className="flex flex-col items-end gap-2 shrink-0">
          <span className="text-xs font-mono text-gray-500">{claim.confidence}%</span>
          <button
            type="button"
            onClick={() => onShowEvidence(claim)}
            className="text-xs text-blue-600 hover:text-blue-800 font-medium underline-offset-2 hover:underline transition-colors"
          >
            Evidence →
          </button>
        </div>
      </div>

      {/* Confidence bar */}
      <div className="mt-2.5 h-1 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            claim.confidence >= 80
              ? 'bg-green-500'
              : claim.confidence >= 50
              ? 'bg-amber-400'
              : 'bg-red-400'
          }`}
          style={{ width: `${Math.min(claim.confidence, 100)}%` }}
        />
      </div>
    </div>
  )
}

interface ClaimBreakdownProps {
  claims: ClaimEvaluation[]
}

export function ClaimBreakdown({ claims }: ClaimBreakdownProps) {
  const [activeChainClaim, setActiveChainClaim] = useState<ClaimEvaluation | null>(null)

  // Mirror engine ordering: unsupported required first, then pending, then supported
  const sorted = [...claims].sort((a, b) => {
    const priority = (c: ClaimEvaluation) => {
      if (c.required && c.status === 'unsupported') return 0
      if (c.status === 'pending') return 1
      return 2
    }
    return priority(a) - priority(b)
  })

  return (
    <>
      <div className="rounded-2xl border border-gray-200 bg-gray-50 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 bg-white">
          <h2 className="text-base font-semibold text-gray-900">Claims</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {claims.length} claim{claims.length !== 1 ? 's' : ''} evaluated
          </p>
        </div>
        <div className="p-4 flex flex-col gap-3">
          {sorted.map((claim) => (
            <ClaimRow
              key={claim.templateId}
              claim={claim}
              onShowEvidence={setActiveChainClaim}
            />
          ))}
        </div>
      </div>

      {/* Evidence chain drawer — mounted at this level so it sits above the card */}
      {activeChainClaim && (
        <EvidenceChainDrawer
          claim={activeChainClaim}
          onClose={() => setActiveChainClaim(null)}
        />
      )}
    </>
  )
}
