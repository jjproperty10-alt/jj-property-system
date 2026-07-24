/**
 * Identity Types — Canonical Contracts for G1B
 *
 * Constitutional basis: ADR-006 (R7 Identity Resolution)
 * Source: g1a_identity_contracts.ts (approved Yossi 23 July 2026)
 *
 * These types define the ONLY way to express business identity
 * and property management associations in the JJ system.
 *
 * After G1B, no component may resolve identity by scanning
 * payer/payee or using hardcoded lists.
 */

// ─────────────────────────────────────────────────────────────
// Entity Identity — WHO is this business entity?
// ─────────────────────────────────────────────────────────────

export interface CanonicalEntityIdentityDTO {
  readonly entityId: string
  readonly displayName: string
  readonly canonicalSlug: string
  readonly entityKind: 'person' | 'company'
  readonly aliases: readonly string[]
  readonly status: 'active' | 'inactive'
  readonly source: 'lifecycle.entity_identity'
}

// ─────────────────────────────────────────────────────────────
// Management Relationship — WHAT does JJ manage for this entity?
// ─────────────────────────────────────────────────────────────

export interface ManagementRelationshipDTO {
  readonly relationshipId: string
  readonly entityId: string
  readonly propertyName: string
  readonly relationshipType: 'managed_owner'
  readonly validFrom: string | null
  readonly validTo: string | null
  readonly verificationStatus: 'verified' | 'pending_verification'
}

// ─────────────────────────────────────────────────────────────
// Resolved Identity — the combined view for a workspace
// ─────────────────────────────────────────────────────────────

export interface ResolvedManagedIdentityDTO {
  readonly identity: CanonicalEntityIdentityDTO
  readonly managedProperties: readonly ManagementRelationshipDTO[]
  readonly primaryProperty: string | null
}

// ─────────────────────────────────────────────────────────────
// Identity Resolution Results — fail-closed
// ─────────────────────────────────────────────────────────────

export type IdentityResolutionResult =
  | { readonly status: 'resolved'; readonly data: ResolvedManagedIdentityDTO }
  | { readonly status: 'not_found'; readonly slug: string }
  | { readonly status: 'ambiguous'; readonly slug: string; readonly candidates: readonly string[] }
  | { readonly status: 'relationship_missing'; readonly entityId: string; readonly displayName: string }
  | { readonly status: 'source_unavailable'; readonly error: string }

// ─────────────────────────────────────────────────────────────
// Entity Kind Mapping (temporary bridge)
// ─────────────────────────────────────────────────────────────

export function resolveEntityKind(entityType: string): 'person' | 'company' {
  switch (entityType) {
    case 'jj_company':
      return 'company'
    default:
      return 'person'
  }
}
