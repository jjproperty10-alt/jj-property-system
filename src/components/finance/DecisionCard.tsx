/**
 * @component DecisionCard
 * @description Shows the Decision outcome: Allowed or Blocked, with blockers listed.
 *
 * State rendered:
 *   - Allowed: green card, "Execute" form action (Server Action)
 *   - Blocked: red card, blockers listed, BlockerResolutionLink for each
 *
 * Rules:
 *   - allPass comes from DecisionEvaluation.allPass (engine output).
 *   - Never computes allPass independently — receives it as a prop.
 *   - Execute button POSTs to a Server Action (passed as prop).
 *   - Override is NOT available in PR #1. Override requires dual approval
 *     (two distinct staff members with DAL.Approve). Implemented in RC2.
 *
 * FR-001: This component is owned by PR #1.
 */

'use client'

import { useState } from 'react'
import type { DecisionEvaluation } from '@/lib/finance'
import { BlockerResolutionLink } from './BlockerResolutionLink'

interface DecisionCardProps {
  decision: DecisionEvaluation
  entityLabel: string             // e.g. "Jacob"
  period: string                  // e.g. "July 2026"
  /** Server Action — called when user confirms execution */
  onExecute?: (params: { override: boolean; overrideReason?: string }) => Promise<void>
}

export function DecisionCard({ decision, entityLabel, period, onExecute }: DecisionCardProps) {
  const [isExecuting, setIsExecuting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleExecute = async () => {
    if (!onExecute) return
    setIsExecuting(true)
    setError(null)
    try {
      await onExecute({ override: false })
      setSuccess(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Execution failed.')
    } finally {
      setIsExecuting(false)
    }
  }

  // ── Success state ────────────────────────────────────────────────────────────
  if (success) {
    return (
      <div className="rounded-2xl border border-green-300 bg-green-50 px-6 py-5 shadow-sm">
        <p className="text-green-800 font-semibold text-sm">
          ✓ Decision logged. This withdrawal is now part of the audit trail.
        </p>
      </div>
    )
  }

  // ── Allowed ──────────────────────────────────────────────────────────────────
  if (decision.allPass) {
    return (
      <div className="rounded-2xl border border-green-200 bg-green-50 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-green-100">
          <div className="flex items-center gap-3">
            <span className="text-2xl">✓</span>
            <div>
              <h2 className="text-base font-semibold text-green-900">
                {decision.decisionType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())} — Allowed
              </h2>
              <p className="text-xs text-green-600 mt-0.5">
                {entityLabel} · {period}
              </p>
            </div>
          </div>
        </div>

        <div className="px-6 py-5">
          <p className="text-sm text-green-800 mb-4">
            All required claims are supported. This decision is authorized.
          </p>

          {error && (
            <p className="mb-3 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          {onExecute && (
            <button
              type="button"
              disabled={isExecuting}
              onClick={() => handleExecute()}
              className="rounded-xl bg-green-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-green-800 disabled:opacity-50 transition-colors"
            >
              {isExecuting ? 'Logging decision…' : 'Execute & Log Decision'}
            </button>
          )}
        </div>
      </div>
    )
  }

  // ── Blocked ──────────────────────────────────────────────────────────────────
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-red-100">
        <div className="flex items-center gap-3">
          <span className="text-2xl">✗</span>
          <div>
            <h2 className="text-base font-semibold text-red-900">
              {decision.decisionType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())} — Blocked
            </h2>
            <p className="text-xs text-red-600 mt-0.5">
              {entityLabel} · {period} · {decision.blockedBy.length} blocker
              {decision.blockedBy.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
      </div>

      {/* Blocker list */}
      <div className="px-6 py-4 flex flex-col gap-3">
        {decision.blockedBy.map((claim) => (
          <div
            key={claim.templateId}
            className="rounded-xl border border-red-200 bg-white px-4 py-3"
          >
            <p className="text-sm font-medium text-red-800">{claim.statement}</p>
            {claim.gap && (
              <p className="mt-1 text-xs text-red-600">{claim.gap.description}</p>
            )}
            <div className="mt-2">
              <BlockerResolutionLink claim={claim} />
            </div>
          </div>
        ))}
      </div>

      {/* Override — not available in PR #1 */}
      <div className="px-6 pb-5">
        <p className="text-xs text-gray-400 italic">
          Override requires dual approval — not available in PR #1.
        </p>
      </div>
    </div>
  )
}
