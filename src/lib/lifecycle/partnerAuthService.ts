/**
 * @module lifecycle/partnerAuthService
 * @description Partner Authorization Boundary — trusted server-side boundary.
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  SESSION BINDING — CORRECTIVE PR (post PR #47)                          ║
 * ║                                                                          ║
 * ║  The public entry point (loadStatementForCurrentPartner) resolves the   ║
 * ║  authenticated user identity INTERNALLY via auth.getUser(). It does NOT ║
 * ║  accept an identity parameter from the caller. This closes the session  ║
 * ║  binding gap identified in the PR #47 architecture review.              ║
 * ║                                                                          ║
 * ║  TWO-CLIENT PATTERN (mandatory):                                         ║
 * ║    sessionClient = createSupabaseServerClient()  ← cookie-aware, anon  ║
 * ║      Used exclusively for: auth.getUser()                               ║
 * ║    serviceClient = createServiceClient()         ← service-role, no RLS ║
 * ║      Used exclusively for: lifecycle schema data queries                ║
 * ║                                                                          ║
 * ║  These clients MUST NOT be substituted for each other.                  ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * AUTHORIZATION CHAIN (9 steps, enforced in order):
 *   Step 1:   Reject Admin mode requests (before any I/O — cheapest rejection)
 *   Step 2:   Resolve session via auth.getUser() [sessionClient — cookie-aware]
 *   Step 2a:  Fail if no user or auth error → NO_SESSION
 *   Step 3:   Resolve auth user → active investor_auth record [serviceClient — DB]
 *   Step 4:   Resolve entity_identity from the mapping [serviceClient — DB]
 *   Step 5:   Compare server-derived canonical slug with the URL route slug
 *   Step 6:   Reject SLUG_MISMATCH (cross-investor access attempt)
 *   Step 6.5: Validate requested property subset against server-derived scope
 *   Step 7:   Load partner statement data (only after steps 1–6.5 all pass)
 *   Step 8:   Return PartnerFacingStatementDTO (viewMode='partner' enforced)
 *
 * SECURITY INVARIANTS:
 * - User identity is derived from auth.getUser() INSIDE this module. Server
 *   Components cannot inject an arbitrary user ID via the public entry point.
 * - createServiceClient() is NEVER called before auth.getUser() succeeds.
 * - No lifecycle data is queried until steps 1–6.5 succeed.
 * - DB errors are treated as authorization failures (fail-closed). Error details
 *   do not reach the caller.
 * - A disabled mapping and an absent mapping are indistinguishable to the caller.
 *   Both surface as NO_MAPPING.
 * - Admin authorization is a completely separate flow. This module never returns
 *   AdminStatementDTO regardless of what the caller requests.
 *
 * EXPORTED FUNCTIONS:
 *   loadStatementForCurrentPartner()      ← PUBLIC. Use this from Server Components.
 *   resolveAuthorizedInvestorEntity()     ← @internal. Exported for unit testing only.
 *   resolveAndLoadForVerifiedUser()       ← @internal. Exported for unit testing only.
 *   loadStatementForAuthenticatedPartner()← @deprecated. Backward-compat alias.
 *
 * @see partnerAuthHelpers.ts      — pure synchronous helpers (verifySlugMatch, validatePropertyScope)
 * @see partnerAuthTypes.ts        — type definitions
 * @see src/lib/supabaseServer.ts  — createSupabaseServerClient()
 * @see partnerStatementService.ts — data loading (loadPartnerStatement, buildSlug)
 * @see m9_e_investor_auth.sql     — lifecycle.investor_auth table DDL
 * @see P-ARCH-1: Unknown = NULL. Never 0 or placeholder.
 * @see P-ARCH-5: lifecycle and public schema fetched independently.
 * @see P-ARCH-6: Partner route never exposes jj_* fields.
 */

import 'server-only'

import { createServiceClient } from '@/lib/supabase'
import { createSupabaseServerClient } from '@/lib/supabaseServer'
import { buildSlug, loadPartnerStatement } from './partnerStatementService'
import { verifySlugMatch, validatePropertyScope } from './partnerAuthHelpers'
import type { PartnerFacingStatementDTO } from './partnerStatementTypes'
import type {
  CurrentPartnerStatementOptions,
  AuthenticatedPartnerStatementOptions,
  AuthorizationFailure,
  ResolverOutcome,
} from './partnerAuthTypes'

// ─── Identity resolver ─────────────────────────────────────────────────────────

/**
 * Resolve the authorized investor entity for a verified auth user.
 *
 * Performs two sequential DB queries using the service-role client
 * (both against lifecycle schema, RLS deny-all):
 *   1. lifecycle.investor_auth WHERE auth_user_id = $1 AND status = 'active'
 *   2. lifecycle.entity_identity WHERE id = <entity_id from step 1>
 *
 * Returns a failure on: missing mapping, disabled mapping, DB errors,
 * or missing entity. Always fail-closed.
 *
 * @internal — Exported for unit testing only. In production, this is called
 *             by resolveAndLoadForVerifiedUser() only.
 *
 * @param authUserId  Supabase auth.users.id from a VERIFIED server session.
 *                    Must originate from auth.getUser(), never from caller input.
 */
export async function resolveAuthorizedInvestorEntity(
  authUserId: string,
): Promise<ResolverOutcome> {
  const db = createServiceClient()

  // ── Step 3: look up investor_auth mapping ─────────────────────────────────
  const { data: authRecord, error: authErr } = await db
    .schema('lifecycle')
    .from('investor_auth')
    .select('entity_id, status')
    .eq('auth_user_id', authUserId)
    .maybeSingle()

  if (authErr) {
    // DB error → fail-closed. Do not leak error details.
    return { ok: false, error: 'NO_MAPPING' }
  }

  if (!authRecord) {
    return { ok: false, error: 'NO_MAPPING' }
  }

  // ── Step 3a: check mapping status ─────────────────────────────────────────
  if ((authRecord as { entity_id: string; status: string }).status !== 'active') {
    // Return MAPPING_DISABLED internally so tests and audit logs can distinguish
    // it from a missing record — but callers surface it as NO_MAPPING to avoid
    // leaking account state to the route handler.
    return { ok: false, error: 'MAPPING_DISABLED' }
  }

  const entityId = (authRecord as { entity_id: string; status: string }).entity_id

  // ── Step 4: load entity_identity (confirm entity exists + get canonical name) ─
  const { data: entity, error: entityErr } = await db
    .schema('lifecycle')
    .from('entity_identity')
    .select('id, canonical_name')
    .eq('id', entityId)
    .maybeSingle()

  if (entityErr || !entity) {
    // Entity referenced by auth mapping does not exist.
    // Should not happen if FK is healthy, but guards against data anomalies.
    return { ok: false, error: 'ENTITY_NOT_FOUND' }
  }

  const canonicalName = (entity as { id: string; canonical_name: string }).canonical_name

  return {
    ok: true,
    entityId,
    canonicalName,
    canonicalSlug: buildSlug(canonicalName),
  }
}

// ─── Internal authorization chain (steps 2b–8) ───────────────────────────────

/**
 * Execute the authorization chain (steps 3–8) for a user whose identity has
 * already been verified via auth.getUser().
 *
 * Step 1 (admin mode rejection) and Step 2 (session verification) are performed
 * by loadStatementForCurrentPartner() BEFORE calling this function.
 *
 * @internal — Exported for unit testing of the authorization chain only.
 *             Server Components MUST NOT call this function directly.
 *             Use loadStatementForCurrentPartner() which verifies the session first.
 *
 * @param authenticatedUserId  Verified Supabase auth.users.id from auth.getUser().
 * @param opts                 Request options (requestedSlug, scope, lang, dates).
 */
export async function resolveAndLoadForVerifiedUser(
  authenticatedUserId: string,
  opts: CurrentPartnerStatementOptions,
): Promise<PartnerFacingStatementDTO | AuthorizationFailure> {

  // ── Guard: require non-empty authenticatedUserId ───────────────────────────
  // Catches edge case where auth.getUser() returned a user with an empty id string.
  // Fails before touching the DB.
  if (!authenticatedUserId || authenticatedUserId.trim() === '') {
    return { ok: false, error: 'NO_MAPPING' }
  }

  // ── Steps 3–4: Resolve identity (DB call 1 + DB call 2) ───────────────────
  const resolved = await resolveAuthorizedInvestorEntity(authenticatedUserId)

  if (!resolved.ok) {
    // Map MAPPING_DISABLED → NO_MAPPING before returning to the route handler.
    // The route handler must not know whether a disabled record exists.
    // ENTITY_NOT_FOUND → also NO_MAPPING (should not occur in production).
    return { ok: false, error: 'NO_MAPPING' }
  }

  // ── Steps 5–6: Validate slug match ────────────────────────────────────────
  // Cross-investor access check: if Avi (auth_user_id=X) maps to entity slug='avi',
  // and the URL contains /partner/oren, this rejects before any data is loaded.
  const slugCheck = verifySlugMatch(resolved.canonicalSlug, opts.requestedSlug)

  if (!slugCheck.match) {
    return { ok: false, error: 'SLUG_MISMATCH' }
  }

  // ── Step 6.5: Validate requested property scope ───────────────────────────
  // Only runs when the caller requests a specific subset of properties.
  // Derives the authorized scope from lifecycle.partner_entry (DB call 3).
  // Any unauthorized property → PROPERTY_UNAUTHORIZED before any data load.
  if (opts.requestedProperties && opts.requestedProperties.length > 0) {
    const db = createServiceClient()
    const { data: entries } = await db
      .schema('lifecycle')
      .from('partner_entry')
      .select('property_name')
      .eq('entity_id', resolved.entityId)
      .neq('status', 'void')

    const authorizedNames = Array.from(
      new Set(
        ((entries ?? []) as Array<{ property_name: string }>).map(e => e.property_name),
      ),
    )

    const scopeCheck = validatePropertyScope(opts.requestedProperties, authorizedNames)
    if (!scopeCheck.valid) {
      return { ok: false, error: 'PROPERTY_UNAUTHORIZED' }
    }
  }

  // ── Step 7: Load data (ONLY after all authorization steps pass) ────────────
  // Pass the server-derived canonical slug — NOT opts.requestedSlug.
  // Both are equal at this point (slug check passed), but using the server-derived
  // value ensures we never forward an unsanitized URL parameter to the data layer.
  const dto = await loadPartnerStatement(resolved.canonicalSlug, {
    viewMode: 'partner',
    lang: opts.lang ?? 'en',
    fromDate: opts.fromDate,
    toDate: opts.toDate,
  })

  if (!dto) {
    // Entity exists and auth mapping is valid, but no active partner_entry rows.
    // May indicate incomplete data provisioning for this investor.
    return { ok: false, error: 'NO_MAPPING' }
  }

  // ── Step 8: Return partner-facing DTO ─────────────────────────────────────
  // loadPartnerStatement with viewMode='partner' always returns PartnerFacingStatementDTO.
  // The discriminated union in partnerStatementTypes.ts enforces this at the type level.
  // P-ARCH-6: jj_* fields are absent from PartnerFacingStatementDTO by design.
  return dto as PartnerFacingStatementDTO
}

// ─── PUBLIC ENTRY POINT ───────────────────────────────────────────────────────

/**
 * Load PartnerFacingStatementDTO for the CURRENTLY AUTHENTICATED investor.
 *
 * This is the ONLY authorized entry point for Server Components serving the
 * /partner/[slug] route. Using resolveAndLoadForVerifiedUser() or
 * loadPartnerStatement() directly from a Server Component bypasses the
 * session binding and authorization boundary — do not do this.
 *
 * FULL 9-STEP AUTHORIZATION CHAIN:
 *   Step 1:   Admin mode rejected before any I/O
 *   Step 2:   auth.getUser() called on cookie-aware sessionClient
 *   Step 2a:  No user / auth error → NO_SESSION (redirect to login)
 *   Steps 3–8: Delegated to resolveAndLoadForVerifiedUser()
 *
 * TWO-CLIENT PATTERN:
 *   sessionClient = createSupabaseServerClient() → auth.getUser() ONLY
 *   serviceClient = createServiceClient()        → lifecycle DB queries ONLY
 *
 * @param opts.requestedSlug        URL route parameter (e.g. 'avi' from /partner/avi).
 *                                  Untrusted input. Compared against server-derived
 *                                  slug only.
 * @param opts.viewMode             'partner' (default). 'admin' → rejected at step 1.
 * @param opts.requestedProperties  Optional subset filter. Validated against server scope.
 *
 * @returns PartnerFacingStatementDTO on success.
 *          AuthorizationFailure (ok: false) on any failure — always check ok first.
 */
export async function loadStatementForCurrentPartner(
  opts: CurrentPartnerStatementOptions,
): Promise<PartnerFacingStatementDTO | AuthorizationFailure> {

  // ── Step 1: Reject Admin mode ──────────────────────────────────────────────
  // Runs BEFORE auth.getUser() — no session overhead for the cheapest rejection.
  // Admin authorization is a completely separate flow. This module never grants it.
  if (opts.viewMode === 'admin') {
    return { ok: false, error: 'ADMIN_MODE_DENIED' }
  }

  // ── Step 2: Resolve session via cookie-aware client ───────────────────────
  // createSupabaseServerClient() reads the request's cookie store via next/headers.
  // auth.getUser() validates the session token server-side against Supabase Auth.
  // This is NOT a passive JWT decode — it actively verifies the token is current.
  //
  // CRITICAL: We call createSupabaseServerClient() here, NOT createServiceClient().
  // A service-role client has no concept of browser sessions — its getUser()
  // does not represent the authenticated browser user.
  const sessionClient = createSupabaseServerClient()
  const { data: { user }, error: authError } = await sessionClient.auth.getUser()

  // ── Step 2a: Reject if no active session ──────────────────────────────────
  if (authError || !user) {
    return { ok: false, error: 'NO_SESSION' }
  }

  // ── Steps 3–8: Delegate to internal chain with verified user ID ───────────
  // user.id is now session-derived and server-verified.
  // No caller can influence it — it came from the cookie-bound Supabase session.
  return resolveAndLoadForVerifiedUser(user.id, opts)
}

// ─── Backward-compat alias ────────────────────────────────────────────────────

/**
 * @deprecated — Use loadStatementForCurrentPartner() instead.
 *
 * This alias remains exported to avoid breaking any route handlers that were
 * built against PR #47 before the corrective PR (session binding) was merged.
 *
 * SECURITY NOTE: This function does NOT call auth.getUser() internally.
 * The caller must supply authenticatedUserId from a verified server session.
 * It is the session binding gap that loadStatementForCurrentPartner() closes.
 *
 * All new route handlers must use loadStatementForCurrentPartner().
 * This alias will be removed in a future cleanup PR.
 */
export async function loadStatementForAuthenticatedPartner(
  opts: AuthenticatedPartnerStatementOptions,
): Promise<PartnerFacingStatementDTO | AuthorizationFailure> {

  if (opts.viewMode === 'admin') {
    return { ok: false, error: 'ADMIN_MODE_DENIED' }
  }

  return resolveAndLoadForVerifiedUser(opts.authenticatedUserId, opts)
}
