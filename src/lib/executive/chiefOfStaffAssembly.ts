/**
 * @module executive/chiefOfStaffAssembly
 * @description Chief of Staff Assembly — prioritization, grouping, deduplication.
 *
 * Takes raw candidates from multiple Digital Executive providers and produces
 * the final ExecutiveBriefDTO.
 *
 * Prioritization model:
 *   rawPriority (0–100) from each provider → mapped to BriefItemPriority label
 *   Items sorted by rawPriority DESC within each section
 *   Same issue is never duplicated across sections (dedup by providerId + title)
 *
 * DIP Law: "The Chief of Staff does not reduce information.
 *           The Chief of Staff reduces uncertainty."
 *
 * @see JJ_DIP_CHAPTER_8_CHIEF_OF_STAFF.md — Recommendation Validation
 */

import type {
  ExecutiveBriefDTO,
  ExecutiveBriefSection,
  ExecutiveBriefItem,
  ExecutiveBriefCandidate,
  ProviderResult,
  BriefItemPriority,
  BriefSectionCategory,
  DataFreshness,
  EvidenceCoverage,
} from './executiveBriefTypes'

import { SECTION_LABELS, SECTION_ORDER } from './executiveBriefTypes'

// ─── Priority mapping ──────────────────────────────────────────────────────

/**
 * Map numeric rawPriority (0–100) to deterministic label.
 * Thresholds are explicit, testable, and documented.
 *
 * ≥ 75 → critical
 * ≥ 50 → high
 * ≥ 25 → normal
 * < 25 → monitor
 */
export function mapPriority(rawPriority: number): BriefItemPriority {
  if (rawPriority >= 75) return 'critical'
  if (rawPriority >= 50) return 'high'
  if (rawPriority >= 25) return 'normal'
  return 'monitor'
}

// ─── Deduplication ─────────────────────────────────────────────────────────

/**
 * Deduplicate candidates by providerId + title.
 * When duplicates exist, keep the one with higher rawPriority.
 */
function deduplicateCandidates(
  candidates: readonly ExecutiveBriefCandidate[],
): ExecutiveBriefCandidate[] {
  const seen = new Map<string, ExecutiveBriefCandidate>()

  for (const c of candidates) {
    const key = `${c.providerId}::${c.title}`
    const existing = seen.get(key)
    if (!existing || c.rawPriority > existing.rawPriority) {
      seen.set(key, c)
    }
  }

  return Array.from(seen.values())
}

// ─── Candidate → Item ──────────────────────────────────────────────────────

let itemCounter = 0

function candidateToItem(c: ExecutiveBriefCandidate): ExecutiveBriefItem {
  itemCounter++
  return {
    id: `brief-${itemCounter}-${c.providerId}`,
    executiveOwner: c.executiveOwner,
    strategicAsset: c.strategicAsset,
    category: c.category,
    title: c.title,
    explanation: c.explanation,
    priority: mapPriority(c.rawPriority),
    status: c.status,
    recommendedAction: c.recommendedAction,
    decisionRequired: c.decisionRequired,
    dueAt: c.dueAt,
    confidence: c.confidence,
    impact: c.impact,
    evidence: c.evidence,
    sourceFreshness: c.sourceFreshness,
    route: c.route,
  }
}

// ─── Freshness aggregation ─────────────────────────────────────────────────

/**
 * Aggregate freshness across all providers.
 * Any 'unavailable' → overall 'unavailable'
 * Any 'stale' → overall 'stale'
 * Otherwise 'live'
 */
export function aggregateFreshness(results: readonly ProviderResult[]): DataFreshness {
  if (results.some(r => r.freshness === 'unavailable')) return 'unavailable'
  if (results.some(r => r.freshness === 'stale')) return 'stale'
  if (results.some(r => r.freshness === 'recent')) return 'recent'
  return 'live'
}

// ─── Evidence coverage ─────────────────────────────────────────────────────

export function buildEvidenceCoverage(results: readonly ProviderResult[]): EvidenceCoverage {
  return {
    totalSources: results.length,
    availableSources: results.filter(r => r.freshness !== 'unavailable').length,
    staleSources: results.filter(r => r.freshness === 'stale').length,
    unavailableSources: results.filter(r => r.freshness === 'unavailable').length,
  }
}

// ─── Section assembly ──────────────────────────────────────────────────────

function groupBySection(
  items: readonly ExecutiveBriefItem[],
): ExecutiveBriefSection[] {
  const groups = new Map<BriefSectionCategory, ExecutiveBriefItem[]>()

  for (const item of items) {
    const existing = groups.get(item.category) ?? []
    existing.push(item)
    groups.set(item.category, existing)
  }

  // Return sections in defined order, omitting empty sections
  return SECTION_ORDER
    .filter(cat => groups.has(cat))
    .map(cat => ({
      category: cat,
      label: SECTION_LABELS[cat],
      items: groups.get(cat)!.sort((a, b) => {
        // Critical items first within each section
        const priorityOrder: Record<BriefItemPriority, number> = {
          critical: 0,
          high: 1,
          normal: 2,
          monitor: 3,
        }
        return priorityOrder[a.priority] - priorityOrder[b.priority]
      }),
    }))
}

// ─── Assembly (public API) ─────────────────────────────────────────────────

/**
 * Assemble the Executive Brief from provider results.
 *
 * Steps:
 * 1. Collect all candidates from all providers
 * 2. Deduplicate (same issue not in multiple sections)
 * 3. Map to ExecutiveBriefItems (assign priority labels)
 * 4. Group into sections
 * 5. Compute summary and evidence coverage
 * 6. Return ExecutiveBriefDTO
 *
 * Deterministic: same inputs → same output → reproducible in tests.
 */
export function assembleExecutiveBrief(
  results: readonly ProviderResult[],
): ExecutiveBriefDTO {
  // Reset counter for deterministic IDs in tests
  itemCounter = 0

  // 1. Collect all candidates
  const allCandidates = results.flatMap(r => r.candidates)

  // 2. Deduplicate
  const unique = deduplicateCandidates(allCandidates)

  // 3. Map to items
  const items = unique.map(candidateToItem)

  // 4. Group into sections
  const sections = groupBySection(items)

  // 5. Summary
  const coverage = buildEvidenceCoverage(results)
  const freshness = aggregateFreshness(results)

  const criticalCount = items.filter(i => i.priority === 'critical').length
  const decisionsRequired = items.filter(i => i.decisionRequired).length
  const hasInsufficientEvidence =
    coverage.unavailableSources > 0 || coverage.staleSources > 0

  return {
    meta: {
      schemaVersion: 'ExecutiveBriefDTO/1.0',
      generatedAt: new Date().toISOString(),
    },
    dataFreshness: freshness,
    evidenceCoverage: coverage,
    summary: {
      totalItems: items.length,
      criticalCount,
      decisionsRequired,
      hasInsufficientEvidence,
    },
    sections,
  }
}
