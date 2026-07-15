/**
 * @module lifecycle/partnerAuthTypes
 * @description Types for the Partner Authorization Boundary.
 *
 * The authorization chain (corrective PR — session binding closed):
 *   Browser session cookie
 *     → auth.getUser() [cookie-aware server client, createSupabaseServerClient()]
 *       → lifecycle.investor_auth (explicit DB mapping, service client)
 *         → lifecycle.entity_identity.id
 *           → authorized property scope
 *
 * INVARIANTS:
 * - The authenticated user identity is ALWAYS resolved from auth.getUser() inside
 *   loadStatementForCurrentPartner(). It is NEVER accepted as a caller-provided
 *   parameter in the public entry point.
 * - A partner mapping never grants Admin mode.
 * - Slug mismatch between the URL route and the authorized entity → reject.
 * - Unauthorized properties → reject (not silently drop).
 *
 * @see loadStatementForCurrentPartner (partnerAuthService.ts) — public entry point
 * @see resolveAndLoadForVerifiedUser  (partnerAuthService.ts) — @internal, testing only
 * @see lifecycle.investor_auth migration (m9_e_investor_auth.sql)
 */

// ─── Authorization error codes ────────────────────────────────────────────────

/**
 * Exhaustive set of authorization failure reasons.
 *
 * NO_SESSION         — No authenticated session found. auth.getUser() returned
 *                      null user or an error. The browser must re-authenticate.
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
  | 'NO_SESSION'
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

// ─── Public entry point options ───────────────────────────────────────────────

/**
 * Options for loadStatementForCurrentPartner() — the ONLY public entry point.
 *
 * The identity of the current user is resolved INTERNALLY from the server session
 * (via auth.getUser()). It is NOT a parameter here. This is the primary defense
 * against session spoofing: no Server Component can supply an arbitrary user ID.
 *
 * Server Components serving /partner/[slug] MUST use this type.
 * Never call resolveAndLoadForVerifiedUser() directly from a route handler.
 */
export interface CurrentPartnerStatementOptions {
  /**
   * The partner slug from the URL route parameter (e.g. 'avi' from /partner/avi).
   * This is untrusted input. Authorization rejects if it does not match the entity
   * bound to the current authenticated user's session.
   */
  readonly requestedSlug: string

  /**
   * 'admin' is always rejected — the partner auth path never grants Admin mode.
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

// ─── Internal options (backward-compat, @internal) ───────────────────────────

/**
 * @internal — Used by resolveAndLoadForVerifiedUser() and its direct unit tests ONLY.
 *
 * Extends CurrentPartnerStatementOptions with authenticatedUserId, which must
 * have already been verified via auth.getUser() before this interface is used.
 *
 * This type is NOT part of the public API. Server Components using the partner
 * auth path must use CurrentPartnerStatementOptions with loadStatementForCurrentPartner().
 *
 * Exported only to support direct unit testing of the internal authorization chain.
 */
export interface AuthenticatedPartnerStatementOptions extends CurrentPartnerStatementOptions {
  /**
   * The authenticated user's ID, already verified via auth.getUser().
   * This must NEVER come from a request body, query parameter, or any
   * client-provided source. In production, it is populated only by
   * loadStatementForCurrentPartner() after a successful auth.getUser() call.
   */
  readonly authenticatedUserId: string
}

// ─── Authorization failure response ──────────────────────────────────────────

/**
 * Returned by loadStatementForCurrentPartner() when authorization fails at any step.
 *
 * The error code is for server-side logging and debugging only.
 * The Server Component MUST NOT forward the error code to the browser response.
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
