/**
 * @module lifecycle/partnerAuthTypes
 * @description Types for the Partner Authorization Boundary (PR #47).
 *
 * The authorization chain:
 *   auth.users.id
 *     → lifecycle.investor_auth (explicit DB mapping)
 *       → lifecycle.entity_identity.id
 *         → authorized property scope
 *
 * INVARIANTS:
 * - auth_user_id is ALWAYS resolved from a verified server session, never from
 *   a client-provided value.
 * - A partner mapping never grants Admin mode.
 * - Slug mismatch between the URL route and the authorized entity → reject.
 * - Unauthorized properties → reject (not silently drop).
 *
 * @see loadStatementForAuthenticatedPartner (partnerAuthService.ts)
 * @see lifecycle.investor_auth migration (m9_e_investor_auth.sql)
 */

// ─── Authorization error codes ────────────────────────────────────────────────

/**
 * Exhaustive set of authorization failure reasons.
 *
 * NO_MAPPING         — No active investor_auth record for this auth user.
 *                      (Either never provisioned, or status='disabled'.)
 * MAPPING_DISABLED   — Record exists but status='disabled'.
 * ENTITY_NOT_FOUND   — investor_auth.entity_id references a non-existent entity.
 *                      Should be impossible if FK is healthy, but defensive.
 * SLUG_MISMATCH      — Route slug does not match the entity authorized for this user.
 *                      Cross-investor access attempt or misconfiguration.
 * PROPERTY_UNAUTHORIZED — One or more requested properties are outside the
 *                      server-derived authorized scope.
 * ADMIN_MODE_DENIED  — viewMode='admin' was requested via the partner auth path.
 *                      Admin mode requires separate Admin authorization flow.
 */
export type AuthorizationError =
  | 'NO_MAPPING'
  | 'MAPPING_DISABLED'
  | 'ENTITY_NOT_FOUND'
  | 'SLUG_MISMATCH'
  | 'PROPERTY_UNAUTHORIZED'
  | 'ADMIN_MODE_DENIED'

// ─── Resolver result types ────────────────────────────────────────────────────

/**
 * Successful resolution: auth user → entity.
 *
 * Returned by resolveAuthorizedInvestorEntity() when:
 * - Exactly one active investor_auth record exists for the auth user
 * - The mapped entity_identity record exists and is readable
 */
export interface ResolvedInvestorEntity {
  readonly entityId: string
  readonly canonicalName: string
  readonly canonicalSlug: string
}

/**
 * Failed resolution.
 *
 * MAPPING_DISABLED is distinguished from NO_MAPPING so that an admin audit log
 * can record why access was denied, without leaking this distinction to the caller.
 */
export interface ResolvedEntityFailure {
  readonly ok: false
  readonly error: 'NO_MAPPING' | 'MAPPING_DISABLED' | 'ENTITY_NOT_FOUND'
}

export type ResolverOutcome =
  | ({ ok: true } & ResolvedInvestorEntity)
  | ResolvedEntityFailure

// ─── Main entry point options ─────────────────────────────────────────────────

/**
 * Options for loadStatementForAuthenticatedPartner().
 *
 * authenticatedUserId MUST come from the server session (auth.getUser() or
 * getServerSession()). Never accept this from a request body or query param.
 */
export interface AuthenticatedPartnerStatementOptions {
  /**
   * The authenticated user's ID, resolved from the server session.
   * NEVER from a client-provided value.
   */
  readonly authenticatedUserId: string

  /**
   * The partner slug from the URL route parameter (e.g. 'avi' from /partner/avi).
   * Authorization rejects if this does not match the entity bound to authenticatedUserId.
   */
  readonly requestedSlug: string

  /**
   * 'admin' is rejected — the partner auth path never grants Admin mode.
   * 'partner' is the only accepted value. Default: 'partner'.
   */
  readonly viewMode?: 'partner' | 'admin'

  /**
   * If provided, only these property names will be included in the response.
   * Authorization validates that ALL requested properties are within the
   * server-derived authorized scope. Any unauthorized property → PROPERTY_UNAUTHORIZED.
   * If absent, the full authorized scope is returned.
   */
  readonly requestedProperties?: readonly string[]

  readonly lang?: 'en' | 'he'
  readonly fromDate?: string
  readonly toDate?: string
}

// ─── Authorization failure response ──────────────────────────────────────────

/**
 * Returned by loadStatementForAuthenticatedPartner() when authorization fails.
 *
 * The error code is for server-side logging only.
 * The Server Component must NOT forward the error code to the browser.
 */
export interface AuthorizationFailure {
  readonly ok: false
  readonly error: AuthorizationError
}

// ─── Slug validation result ───────────────────────────────────────────────────

export interface SlugMatchResult {
  readonly match: boolean
  readonly authorizedSlug: string
  readonly requestedSlug: string
}

// ─── Property scope validation result ────────────────────────────────────────

export interface PropertyScopeResult {
  readonly valid: true
  readonly authorizedProperties: readonly string[]
}

export interface PropertyScopeFailure {
  readonly valid: false
  readonly unauthorizedProperties: readonly string[]
  readonly authorizedProperties: readonly string[]
}

export type PropertyScopeOutcome = PropertyScopeResult | PropertyScopeFailure
