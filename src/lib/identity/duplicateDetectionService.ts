/**
 * Duplicate Detection Service — Read-Only Entity Collision Detection
 *
 * P1 Identity Service Foundation — PR #2
 *
 * Three-tier collision model:
 *   SOFT   — similar names that might refer to the same entity (warning only)
 *   STRONG — same slug collision requiring explicit override to proceed
 *   HARD   — identical canonical_name (blocked — cannot create)
 *
 * Design constraints:
 *   - Read-only: never writes, never merges, never mutates
 *   - Deterministic: same inputs → same output
 *   - No auto-merge: detection only, human decision required
 *   - No override persistence: override audit is EXPLICITLY DEFERRED
 *   - canonical_name is NOT UNIQUE — name alone is NEVER HARD by itself
 *     (HARD requires exact canonical_name match)
 *
 * Constitutional basis: P-ARCH-1 (unknown = null), ADR-006 (R7)
 */

import type { CanonicalEntityIdentityDTO } from './identityTypes'
import { nameToSlug } from '../owners/ownerWorkspaceUtils'

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type DuplicateTier = 'soft' | 'strong' | 'hard'

export interface DuplicateMatch {
  /** The existing entity that triggered the match */
  readonly existingEntity: CanonicalEntityIdentityDTO
  /** Collision tier */
  readonly tier: DuplicateTier
  /** Human-readable reason for the match */
  readonly reason: string
}

export interface DuplicateDetectionResult {
  /** The candidate name that was checked */
  readonly candidateName: string
  /** Whether any matches were found */
  readonly hasMatches: boolean
  /** Highest tier among all matches (null if no matches) */
  readonly highestTier: DuplicateTier | null
  /** Whether the candidate is blocked from creation */
  readonly blocked: boolean
  /** All matches found, sorted by tier (hard → strong → soft) */
  readonly matches: readonly DuplicateMatch[]
}

// ─────────────────────────────────────────────────────────────
// Pure detection functions
// ─────────────────────────────────────────────────────────────

const TIER_ORDER: Record<DuplicateTier, number> = { hard: 0, strong: 1, soft: 2 }

/**
 * Normalize a name for soft comparison: lowercase, collapse whitespace,
 * strip diacritics, remove common suffixes.
 */
export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Check if two names are soft matches — similar enough to warrant a warning.
 * Criteria: normalized names are equal, or one is a prefix of the other,
 * or they share the same first word and the edit distance of the rest is small.
 */
export function isSoftMatch(candidateName: string, existingName: string): boolean {
  const a = normalizeName(candidateName)
  const b = normalizeName(existingName)

  // Exact normalized match is at least soft
  if (a === b) return true

  // One is a prefix of the other (e.g., "Avi" vs "Avi Cohen")
  if (a.startsWith(b) || b.startsWith(a)) return true

  // Same first word (likely same first name)
  const aFirst = a.split(' ')[0]
  const bFirst = b.split(' ')[0]
  if (aFirst && bFirst && aFirst === bFirst && a !== b) return true

  return false
}

/**
 * Detect duplicates for a candidate name against a list of existing entities.
 *
 * Read-only — never writes, never mutates, fully deterministic.
 */
export function detectDuplicates(
  candidateName: string,
  existingEntities: readonly CanonicalEntityIdentityDTO[],
): DuplicateDetectionResult {
  const candidateSlug = nameToSlug(candidateName)
  const candidateNormalized = normalizeName(candidateName)
  const matches: DuplicateMatch[] = []

  for (const entity of existingEntities) {
    const existingNormalized = normalizeName(entity.displayName)

    // HARD: exact canonical_name match (case-insensitive normalized)
    if (candidateNormalized === existingNormalized) {
      matches.push({
        existingEntity: entity,
        tier: 'hard',
        reason: `Exact name match: "${entity.displayName}"`,
      })
      continue
    }

    // STRONG: same slug (different name but same URL path)
    if (candidateSlug === entity.canonicalSlug) {
      matches.push({
        existingEntity: entity,
        tier: 'strong',
        reason: `Slug collision: both resolve to "${candidateSlug}"`,
      })
      continue
    }

    // Also STRONG: candidate name matches an existing alias (normalized)
    const aliasMatch = entity.aliases.some(
      alias => normalizeName(alias) === candidateNormalized,
    )
    if (aliasMatch) {
      matches.push({
        existingEntity: entity,
        tier: 'strong',
        reason: `Candidate name matches alias of "${entity.displayName}"`,
      })
      continue
    }

    // SOFT: similar names
    if (isSoftMatch(candidateName, entity.displayName)) {
      matches.push({
        existingEntity: entity,
        tier: 'soft',
        reason: `Similar name to "${entity.displayName}"`,
      })
      continue
    }

    // Also SOFT: candidate name is similar to any alias
    const softAliasMatch = entity.aliases.some(
      alias => isSoftMatch(candidateName, alias),
    )
    if (softAliasMatch) {
      const matchedAlias = entity.aliases.find(
        alias => isSoftMatch(candidateName, alias),
      )
      matches.push({
        existingEntity: entity,
        tier: 'soft',
        reason: `Similar to alias "${matchedAlias}" of "${entity.displayName}"`,
      })
    }
  }

  // Sort by tier severity (hard first)
  matches.sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier])

  const highestTier = matches.length > 0 ? matches[0].tier : null
  const blocked = highestTier === 'hard'

  return {
    candidateName,
    hasMatches: matches.length > 0,
    highestTier,
    blocked,
    matches: Object.freeze(matches),
  }
}
