import React from 'react'
import type { ExecutiveBriefDTO } from '@/lib/executive/executiveBriefTypes'
import { BriefHeader } from './BriefHeader'
import { BriefItem } from './BriefItem'
import { BriefEmptyState } from './BriefEmptyState'

// ─── Props ────────────────────────────────────────────────────────────────

interface ExecutiveBriefProps {
  dto: ExecutiveBriefDTO
}

// ─── Component ────────────────────────────────────────────────────────────

/**
 * ExecutiveBrief — the CEO's primary operating interface.
 *
 * Renders the complete Executive Brief from an ExecutiveBriefDTO.
 * This component ONLY renders. Every value arrives pre-computed.
 * No business logic. No reduce(). No calculations.
 *
 * "UI only renders. Business Logic lives in the engine."
 *
 * Structure:
 *   1. BriefHeader — metadata, freshness, coverage
 *   2. Sections — grouped by category, in defined order
 *   3. BriefEmptyState — when no items exist (with honest caveat)
 *
 * @see JJ_EXPERIENCE_PRINCIPLES.md — every screen answers 4 questions
 * @see executiveBriefTypes.ts — DTO contract
 */
export function ExecutiveBrief({ dto }: ExecutiveBriefProps) {
  const hasItems = dto.sections.some(s => s.items.length > 0)

  return (
    <div
      className="space-y-5"
      data-testid="executive-brief"
      data-schema-version={dto.meta.schemaVersion}
    >
      {/* Header — always shown */}
      <BriefHeader
        generatedAt={dto.meta.generatedAt}
        dataFreshness={dto.dataFreshness}
        evidenceCoverage={dto.evidenceCoverage}
        totalItems={dto.summary.totalItems}
        criticalCount={dto.summary.criticalCount}
        decisionsRequired={dto.summary.decisionsRequired}
        hasInsufficientEvidence={dto.summary.hasInsufficientEvidence}
      />

      {/* Sections or empty state */}
      {hasItems ? (
        dto.sections.map(section => (
          <div key={section.category} data-testid="brief-section">
            {/* Section label */}
            <p className="jj-label mb-2 text-xs uppercase tracking-widest text-gray-400">
              {section.label}
            </p>

            {/* Items */}
            <div className="space-y-3">
              {section.items.map(item => (
                <BriefItem key={item.id} item={item} />
              ))}
            </div>
          </div>
        ))
      ) : (
        <BriefEmptyState
          evidenceCoverage={dto.evidenceCoverage}
          hasInsufficientEvidence={dto.summary.hasInsufficientEvidence}
        />
      )}
    </div>
  )
}
