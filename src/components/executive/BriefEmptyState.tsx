import React from 'react'
import type { EvidenceCoverage } from '@/lib/executive/executiveBriefTypes'

interface BriefEmptyStateProps {
  evidenceCoverage: EvidenceCoverage
  hasInsufficientEvidence: boolean
}

/**
 * BriefEmptyState — rendered when no evidence-backed items exist.
 *
 * CRITICAL DISTINCTION:
 * - Full coverage + no items = "No evidence-backed items require attention."
 * - Partial coverage = "Some sources were unavailable. Cannot confirm all clear."
 *
 * "An empty state must communicate certainty. Do not imply 'Everything is fine'
 *  unless the system possesses enough evidence to support that conclusion."
 */
export function BriefEmptyState({
  evidenceCoverage,
  hasInsufficientEvidence,
}: BriefEmptyStateProps) {
  if (hasInsufficientEvidence) {
    return (
      <div
        className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-5"
        role="status"
        data-testid="brief-empty-insufficient"
      >
        <p className="text-sm font-semibold text-amber-800">
          No items to display — but evidence is incomplete
        </p>
        <p className="mt-1 text-sm text-amber-700">
          {evidenceCoverage.unavailableSources > 0
            ? `${evidenceCoverage.unavailableSources} of ${evidenceCoverage.totalSources} data sources could not be reached.`
            : `${evidenceCoverage.staleSources} of ${evidenceCoverage.totalSources} data sources returned stale data.`}
          {' '}This brief cannot confirm that everything is fine.
        </p>
      </div>
    )
  }

  return (
    <div
      className="rounded-xl border border-green-200 bg-green-50 px-6 py-5"
      role="status"
      data-testid="brief-empty-all-clear"
    >
      <p className="text-sm font-semibold text-green-800">
        No evidence-backed items currently require executive attention.
      </p>
      <p className="mt-1 text-sm text-green-700">
        All {evidenceCoverage.totalSources} data sources were queried successfully.
      </p>
    </div>
  )
}
