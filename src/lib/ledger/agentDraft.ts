/**
 * Pure draft-admission helpers for Phase 0D. No I/O, no posting.
 * Unknown amounts stay NULL. Ambiguous/unresolved property → needs_review.
 * No fuzzy ILIKE matching.
 */

export const AGENT_DRAFT_STATUSES = [
  'draft',
  'needs_review',
  'ready_for_approval',
  'rejected',
  'posted',
] as const
export type AgentDraftStatus = (typeof AGENT_DRAFT_STATUSES)[number]

export const DRAFT_NOT_POSTED_MESSAGE = 'Draft saved — not posted to accounts.'
export const DRAFT_POSTED_MESSAGE = 'Draft posted to accounts.'
export const DRAFT_REJECTED_MESSAGE = 'Draft rejected — not posted to accounts.'

export function parseOptionalEur(raw: string | null | undefined): number | null {
  const text = (raw ?? '').trim()
  if (text === '') return null
  const n = Number(text)
  if (!Number.isFinite(n)) return null
  return n
}

export interface PropertyExactMatch {
  readonly id: string
  readonly name: string
}

/**
 * Exact name match only. 0 or >1 matches → unresolved (needs_review).
 */
export function resolveExactPropertyId(
  propertyNameInput: string,
  catalog: readonly PropertyExactMatch[],
): string | null {
  const wanted = propertyNameInput.trim()
  if (wanted === '') return null
  const hits = catalog.filter(p => p.name === wanted)
  if (hits.length !== 1) return null
  return hits[0].id
}

export function resolveDraftStatus(input: {
  readonly propertyId: string | null
  readonly propertyNameInput: string
}): AgentDraftStatus {
  if (input.propertyId == null) return 'needs_review'
  if (input.propertyNameInput.trim() === '') return 'needs_review'
  return 'draft'
}
