/**
 * Identity — Barrel Exports
 *
 * Constitutional basis: ADR-006 (R7 Identity Resolution); Canonical Integration V1 (H.1–H.5, 2026-08-15)
 *
 * Types are client-safe. Service functions are server-only.
 * Import types from here in any context.
 * Import service functions only in server components / route handlers.
 */

// Types (client-safe)
export type {
  CanonicalEntityIdentityDTO,
  ManagementRelationshipDTO,
  ResolvedManagedIdentityDTO,
  IdentityResolutionResult,
} from './identityTypes'

export { resolveEntityKind } from './identityTypes'

// Pure input helpers (client-safe, no DB)
export { isUuidLike, isBlankInput, normalizeIdentityName } from './identityInput'

// Canonical Owner-Room resolver (server-only) — H.3 switch COMPLETE: registry.parties is WHO authority
export type { DraftOwnerDTO } from './identityResolverService'
export {
  getAllVerifiedOwners,
  resolveBySlug,
} from './identityResolverService'

// Canonical property resolver (server-only) — H.1/H.4/H.5
export type { PropertyResolution } from './propertyResolverService'
export { resolveProperty } from './propertyResolverService'

// Canonical party resolver + Owner-Room migration adapter (server-only) — H.3
export type { PartyResolution, EntityPartyResolution } from './partyResolverService'
export { resolveParty, resolvePartyForEntity } from './partyResolverService'

// Duplicate detection (client-safe — pure functions, no DB access)
export type {
  DuplicateTier,
  DuplicateMatch,
  DuplicateDetectionResult,
} from './duplicateDetectionService'

export {
  detectDuplicates,
  normalizeName,
  isSoftMatch,
} from './duplicateDetectionService'
