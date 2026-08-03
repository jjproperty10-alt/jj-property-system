/**
 * @module statements/statementContextResolver
 * @description Stage 0 — Context-aware statement resolver.
 *
 * Resolves all available statement contexts for a given entity slug.
 * Uses G1 identityResolverService for entity resolution (ADR-006 R7).
 * Queries management_relationship and partner_entry INDEPENDENTLY.
 * Returns 0, 1, or 2 StatementContexts — never merges them.
 *
 * Constitutional basis:
 *   - ADR-006 R7: G1 canonical identity authority
 *   - P-ARCH-1: Unknown = NULL, never guessed
 *   - Yossi 7 rules (Statement 404 Architecture Package, 2 Aug 2026)
 *
 * 8 Required invariants:
 *   1. Use G1 identityResolverService.resolveBySlug() as canonical identity authority
 *   2. Never flatten both contexts into one property array
 *   3. Never let one context authorize properties from the other
 *   4. No fabricated partner_entry records
 *   5. No fallback that silently changes business meaning
 *   6. Zero valid scopes returns empty array, not guessed authority
 *   7. Deduplication only within the same context
 *   8. Preserve source evidence for each context
 *
 * Verification model:
 *   - management_relationship: only 'verified' relationships qualify for
 *     active report contexts. 'pending_verification' relationships are
 *     returned separately and marked as such — they do not silently
 *     grant statement authority.
 *   - partner_entry: only statuses in INVESTMENT_AUTHORIZED_STATUSES
 *     allowlist qualify (currently: 'confirmed' only).
 *
 * server-only: must never be imported into Client Components.
 */

import 'server-only'

import { createServiceClient } from '@/lib/supabase'
import { nameToSlug } from '@/lib/owners/ownerWorkspaceUtils'

// ─── Types ──────────────────────────────────────────────────────────────────────

/**
 * Discriminated union: two separate statement experiences.
 *
 * RULE: These two contexts are NEVER merged, NEVER flattened,
 * NEVER allowed to inherit authority from each other.
 */
export type StatementContext =
  | ManagedOwnerStatementContext
  | InvestmentStatementContext

export interface ManagedOwnerStatementContext {
  readonly kind: 'managed_owner'
  /** From lifecycle.entity_identity via G1 */
  readonly entityId: string
  readonly canonicalName: string
  /** From management_relationship — verified properties JJ manages for this owner */
  readonly managedProperties: readonly string[]
  /** Pending-verification properties — returned for observability, NOT granted statement authority */
  readonly pendingProperties: readonly string[]
  /** Source authority */
  readonly authority: 'management_relationship'
}

export interface InvestmentStatementContext {
  readonly kind: 'investment'
  /** From lifecycle.entity_identity */
  readonly entityId: string
  readonly canonicalName: string
  /** From partner_entry — properties this investor has capital in */
  readonly investmentProperties: readonly string[]
  /** Source authority */
  readonly authority: 'partner_entry'
}

/**
 * Authority source identifiers — the two independent data sources
 * that grant statement contexts.
 */
export type StatementSource =
  | 'management_relationship'
  | 'partner_entry'

/**
 * A source query that failed — preserves the fact that the source
 * could not be inspected (distinct from an empty valid result).
 *
 * Evidence First: query error ≠ empty source.
 */
export interface SourceFailure {
  readonly source: StatementSource
  readonly code: string
}

/**
 * Resolution result with evidence trail.
 */
export interface StatementContextResolution {
  /** The resolved contexts — 0, 1, or 2 */
  readonly contexts: readonly StatementContext[]
  /** Entity identity evidence */
  readonly entityId: string | null
  readonly canonicalName: string | null
  readonly entityType: string | null
  /** Resolution status */
  readonly status: StatementContextResolutionStatus
  /**
   * Sources that could not be inspected.
   * Present only when status = 'source_unavailable'.
   * Empty array when all sources were successfully queried.
   *
   * Evidence First: a failed query is NOT equivalent to an empty valid query.
   * The resolver must never return 'resolved' or 'no_contexts' when a
   * required authority source could not be inspected.
   */
  readonly failedSources: readonly SourceFailure[]
}

export type StatementContextResolutionStatus =
  | 'resolved'             // at least one context found, ALL sources inspected
  | 'no_contexts'          // entity found, ALL sources inspected, no qualifying relationships
  | 'entity_not_found'     // slug does not match any entity
  | 'entity_inactive'      // entity exists but status !== 'active'
  | 'ambiguous_slug'       // multiple entities match slug
  | 'source_unavailable'   // one or more authority sources could not be inspected

// ─── Internal DB row types ──────────────────────────────────────────────────────

interface EntityRow {
  id: string
  canonical_name: string
  entity_type: string
  status: string
}

interface MgmtRelRow {
  property_name: string
  verification_status: string
  valid_to: string | null
  status: string
}

interface PartnerEntryRow {
  property_name: string
  status: string
}

// ─── Investment Authorization ─────────────────────────────────────────────────

/**
 * Explicit allowlist of partner_entry statuses that grant investment
 * statement authority.
 *
 * Correction 2 (Yossi, 2 Aug 2026): the original filter `.neq('status', 'void')`
 * granted authority to every value other than 'void', including unknown, draft,
 * pending, null, or future statuses. This is too permissive.
 *
 * Production evidence currently proves only 'confirmed' records.
 * Do not expand without binding lifecycle policy and production evidence.
 *
 * The DB query fetches all rows (not pre-filtered by status) to keep the
 * database layer simple. Authorization filtering happens here, in application
 * logic, using this explicit allowlist.
 */
export const INVESTMENT_AUTHORIZED_STATUSES: ReadonlySet<string> = new Set(['confirmed'])

// ─── Public API ─────────────────────────────────────────────────────────────────

/**
 * Resolve all statement contexts available for a given slug.
 *
 * Reuses G1 identity resolution pattern (slug → entity via nameToSlug matching).
 * Queries management_relationship and partner_entry independently.
 * Returns 0, 1, or 2 contexts — never merges them.
 *
 * @param slug  URL slug (e.g., 'avi', 'oren', 'neer')
 * @returns     StatementContextResolution with evidence trail
 */
export async function resolveStatementContexts(
  slug: string,
): Promise<StatementContextResolution> {
  const empty = (
    status: StatementContextResolutionStatus,
    failedSources: readonly SourceFailure[] = [],
  ): StatementContextResolution => ({
    contexts: [],
    entityId: null,
    canonicalName: null,
    entityType: null,
    status,
    failedSources,
  })

  if (!slug || slug.trim().length === 0) {
    return empty('entity_not_found')
  }

  // ── Step 1: Resolve entity identity (G1 pattern) ──────────────────────────
  let sb
  try {
    sb = createServiceClient()
  } catch {
    return empty('source_unavailable')
  }

  let entityRows: EntityRow[]
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb as any)
      .schema('lifecycle')
      .from('entity_identity')
      .select('id, canonical_name, entity_type, status')
    if (error) throw error
    entityRows = (data ?? []) as EntityRow[]
  } catch {
    return empty('source_unavailable')
  }

  // Match slug — same logic as G1 identityResolverService.resolveBySlug()
  const candidates = entityRows.filter(e => nameToSlug(e.canonical_name) === slug)

  if (candidates.length === 0) {
    return empty('entity_not_found')
  }

  if (candidates.length > 1) {
    return {
      contexts: [],
      entityId: null,
      canonicalName: null,
      entityType: null,
      status: 'ambiguous_slug',
      failedSources: [],
    }
  }

  const entity = candidates[0]

  // Check entity is active
  if (entity.status !== 'active') {
    return {
      contexts: [],
      entityId: entity.id,
      canonicalName: entity.canonical_name,
      entityType: entity.entity_type,
      status: 'entity_inactive',
      failedSources: [],
    }
  }

  // ── Step 2: Query management_relationship (independent) ───────────────────
  //
  // Evidence First: a failed query is NOT equivalent to an empty valid query.
  // If this source cannot be inspected, the failure is recorded explicitly
  // and the resolver returns source_unavailable — never 'resolved' or 'no_contexts'.
  let mgmtRows: MgmtRelRow[] | null = null  // null = query failed
  let mgmtFailure: SourceFailure | null = null
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb as any)
      .schema('lifecycle')
      .from('management_relationship')
      .select('property_name, verification_status, valid_to, status')
      .eq('entity_id', entity.id)
      .is('valid_to', null)  // active (ongoing) relationships only
    if (error) throw error
    mgmtRows = (data ?? []) as MgmtRelRow[]
  } catch (e) {
    mgmtFailure = {
      source: 'management_relationship',
      code: e instanceof Error ? e.message : 'unknown_error',
    }
  }

  // ── Step 3: Query partner_entry (independent) ─────────────────────────────
  //
  // Fetches all non-void rows. Final authorization filtering is applied
  // in Step 4 using INVESTMENT_AUTHORIZED_STATUSES (explicit allowlist).
  let partnerRows: PartnerEntryRow[] | null = null  // null = query failed
  let partnerFailure: SourceFailure | null = null
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb as any)
      .schema('lifecycle')
      .from('partner_entry')
      .select('property_name, status')
      .eq('entity_id', entity.id)
    if (error) throw error
    partnerRows = (data ?? []) as PartnerEntryRow[]
  } catch (e) {
    partnerFailure = {
      source: 'partner_entry',
      code: e instanceof Error ? e.message : 'unknown_error',
    }
  }

  // ── Step 3.5: Fail-closed on source unavailability ───────────────────────
  //
  // If either authority source could not be inspected, the resolver
  // must NOT return 'resolved' or 'no_contexts'. A failed source query
  // does not prove the absence of a context — it proves we don't know.
  const failedSources: SourceFailure[] = []
  if (mgmtFailure) failedSources.push(mgmtFailure)
  if (partnerFailure) failedSources.push(partnerFailure)

  if (failedSources.length > 0) {
    return {
      contexts: [],
      entityId: entity.id,
      canonicalName: entity.canonical_name,
      entityType: entity.entity_type,
      status: 'source_unavailable',
      failedSources: Object.freeze(failedSources),
    }
  }

  // ── Step 4: Build contexts ────────────────────────────────────────────────
  //
  // At this point both source queries succeeded (failedSources check passed).
  // mgmtRows and partnerRows are guaranteed non-null.
  const validMgmtRows = mgmtRows as MgmtRelRow[]
  const validPartnerRows = partnerRows as PartnerEntryRow[]

  const contexts: StatementContext[] = []

  // Management context — only verified relationships grant statement authority
  const verifiedMgmt = validMgmtRows.filter(r => r.verification_status === 'verified')
  const pendingMgmt = validMgmtRows.filter(r => r.verification_status !== 'verified')

  // Deduplicate within management context only (invariant 7)
  const verifiedProperties = dedup(verifiedMgmt.map(r => r.property_name))
  const pendingProperties = dedup(pendingMgmt.map(r => r.property_name))

  if (verifiedProperties.length > 0) {
    contexts.push({
      kind: 'managed_owner',
      entityId: entity.id,
      canonicalName: entity.canonical_name,
      managedProperties: Object.freeze(verifiedProperties),
      pendingProperties: Object.freeze(pendingProperties),
      authority: 'management_relationship',
    })
  }

  // Investment context — explicit allowlist authorization
  //
  // Correction 2: Only statuses in INVESTMENT_AUTHORIZED_STATUSES grant
  // investment statement authority. Unknown/draft/pending/null/future statuses
  // are excluded. The DB query fetches broadly; authorization is enforced here.
  const authorizedEntries = validPartnerRows.filter(
    r => r.status != null && INVESTMENT_AUTHORIZED_STATUSES.has(r.status),
  )
  // Deduplicate within investment context only (invariant 7)
  const investmentProperties = dedup(authorizedEntries.map(r => r.property_name))

  if (investmentProperties.length > 0) {
    contexts.push({
      kind: 'investment',
      entityId: entity.id,
      canonicalName: entity.canonical_name,
      investmentProperties: Object.freeze(investmentProperties),
      authority: 'partner_entry',
    })
  }

  return {
    contexts: Object.freeze(contexts),
    entityId: entity.id,
    canonicalName: entity.canonical_name,
    entityType: entity.entity_type,
    status: contexts.length > 0 ? 'resolved' : 'no_contexts',
    failedSources: Object.freeze([]),
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

/** Deduplicate string array, preserving first occurrence order. */
function dedup(arr: string[]): string[] {
  return Array.from(new Set(arr))
}
