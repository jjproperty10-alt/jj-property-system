import React from 'react'
import type { DataFreshness, EvidenceCoverage } from '@/lib/executive/executiveBriefTypes'

// ─── Props ────────────────────────────────────────────────────────────────

interface BriefHeaderProps {
  generatedAt: string
  dataFreshness: DataFreshness
  evidenceCoverage: EvidenceCoverage
  totalItems: number
  criticalCount: number
  decisionsRequired: number
  hasInsufficientEvidence: boolean
}

// ─── Freshness display ────────────────────────────────────────────────────

const FRESHNESS_DISPLAY: Record<DataFreshness, { label: string; color: string }> = {
  live: { label: 'Live', color: 'text-green-600' },
  recent: { label: 'Recent', color: 'text-blue-600' },
  stale: { label: 'Stale', color: 'text-amber-600' },
  unavailable: { label: 'Partial', color: 'text-red-600' },
}

// ─── Component ────────────────────────────────────────────────────────────

/**
 * BriefHeader — metadata bar at the top of the Executive Brief.
 *
 * Shows: generation time, data freshness, evidence coverage.
 * When evidence is insufficient, displays an honest caveat.
 *
 * "Missing evidence must never become 'all clear'."
 */
export function BriefHeader({
  generatedAt,
  dataFreshness,
  evidenceCoverage,
  totalItems,
  criticalCount,
  decisionsRequired,
  hasInsufficientEvidence,
}: BriefHeaderProps) {
  const freshness = FRESHNESS_DISPLAY[dataFreshness]
  const time = new Date(generatedAt).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <div data-testid="brief-header">
      {/* Title row */}
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Executive Brief</h2>
        <span className="text-xs text-gray-400">{time}</span>
      </div>

      {/* Summary chips */}
      <div className="mt-2 flex flex-wrap gap-2">
        {/* Data freshness */}
        <span
          className={`inline-flex items-center gap-1 rounded-full bg-gray-50 px-2.5 py-0.5 text-xs font-medium ${freshness.color}`}
          data-testid="freshness-badge"
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              dataFreshness === 'live'
                ? 'bg-green-500'
                : dataFreshness === 'recent'
                  ? 'bg-blue-500'
                  : dataFreshness === 'stale'
                    ? 'bg-amber-500'
                    : 'bg-red-500'
            }`}
          />
          {freshness.label}
        </span>

        {/* Coverage */}
        <span className="inline-flex items-center rounded-full bg-gray-50 px-2.5 py-0.5 text-xs text-gray-500">
          {evidenceCoverage.availableSources}/{evidenceCoverage.totalSources} sources
        </span>

        {/* Critical count — only when > 0 */}
        {criticalCount > 0 && (
          <span className="inline-flex items-center rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700">
            {criticalCount} critical
          </span>
        )}

        {/* Decisions required — only when > 0 */}
        {decisionsRequired > 0 && (
          <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
            {decisionsRequired} decision{decisionsRequired !== 1 ? 's' : ''} needed
          </span>
        )}
      </div>

      {/* Insufficient evidence caveat */}
      {hasInsufficientEvidence && (
        <p
          className="mt-2 text-xs text-amber-600"
          data-testid="insufficient-evidence-caveat"
        >
          Some data sources were unavailable or stale. This brief may not reflect the
          complete picture.
        </p>
      )}
    </div>
  )
}
