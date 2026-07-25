/**
 * Identity — Barrel Exports
 *
 * Constitutional basis: ADR-006 (R7 Identity Resolution)
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

// Service (server-only — re-exported for convenience,
// but importing module will pull 'server-only' guard)
export {
  getAllVerifiedOwners,
  resolveBySlug,
} from './identityResolverService'
