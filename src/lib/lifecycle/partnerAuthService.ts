/**
 * @module lifecycle/partnerAuthService
 * @description Partner Authorization Boundary — trusted server-side boundary (PR #47).
 *
 * This module is server-only. It is the ONLY authorized entry point for loading
 * partner-facing statements. Never import this module on the client side.
 *
 * AUTHORIZATION CHAIN (8 steps, enforced in order):
 *   Step 1:   Reject Admin mode requests (partner path never returns AdminStatementDTO)
 *   Step 2:   Validate authenticatedUserId is present and non-empty
 *   Step 3:   Resolve auth user → active investor_auth record (DB-backed, fail-closed)
 *   Step 4:   Resolve entity_identity from the mapping (confirm entity exists)
 *   Step 5:   Compare server-derived canonical slug with the URL route slug
 *   Step 6:   Reject SLUG_MISMATCH (cross-investor access attempt)
 *   Step 6.5: Validate requested property subset against server-derived scope (if provided)
 *   Step 7:   Load partner statement data (only after steps 1–6.5 all pass)
 *   Step 8:   Return PartnerFacingStatementDTO (viewMode='partner' enforced)
 *
 * SECURITY INVARIANTS:
 * - authenticatedUserId MUST be resolved from a verified server session before
 *   calling this module. Never accept it from a request body or query parameter.
 * - No lifecycle data, ownership data, or statement data is queried until
 *   steps 1–6.5 succeed.
 * - DB errors are treated as authorization failures (fail-closed). They do not
 *   leak error details to the caller.
 * - A disabled mapping and an absent mapping are indistinguishable to the caller.
 *   Both return NO_MAPPING to prevent leaking account state.
 * - Admin authorization is a completely separate flow. This module never returns
 *   AdminStatementDTO regardless of what the caller requests.
 *
 * @see partnerAuthHelpers.ts  — pure synchronous helpers (verifySlugMatch, validatePropertyScope)
 * @see partnerAuthTypes.ts    — type definitions
 * @see partnerStatementService.ts — data loading (loadPartnerStatement, buildSlug)
 * @see m9_e_investor_auth.sql — lifecycle.investor_auth table DDL
 * @see P-ARCH-1: Unknown = NULL. Never 0 or placeholder.
 * @see P-ARCH-5: lifecycle and public schema fetched independently.
 * @see P-ARCH-6: Partner route never exposes jj_* fields.
 */

import 'server-only'

import { createServiceClient } from '@/lib/supabase'
import { buildSlug, loadPartnerStatement } from './partnerStatementService'
import { verifySlugMatch, validatePropertyScope } from './partnerAuthHelpers'
import type { PartnerFacingStatementDTO } from './partnerStatementTypes'
import type {
  AuthenticatedPartnerStatementOptions,
  AuthorizationFailure,
  ResolverOutcome,
} from './partnerAuthTypes'

// ─── Identity resolver ─────────────────────────────────────────────────────────

/**
 * Resolve the authorized investor entity for an authenticated user.
 *
 * Performs two sequential DB queries (both against lifecycle schema, RLS deny-all,
 * service_role only):
 *   1. lifecycle.investor_auth WHERE auth_user_id = $1 AND status = 'active'
 *   2. lifecycle.entity_identity WHERE id = <entity_id from step 1>
 *
 * Returns null-equivalent failure on: missing mapping, disabled mapping,
 * DB errors, or missing entity.
 *
 * IMPORTANT: authUserId must come from a verified server session.
 * This function does not verify the session itself — the caller (the authorized
 * entry point below) must ensure the userId is session-derived.
 *
 * @param authUserId  Supabase auth.users.id from a verified server session
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
    // it from a missing record — but the caller (entry point) maps it to NO_MAPPING
    // before returning to the route handler, to avoid leaking account state.
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

// ─── Authorized entry point ───────────────────────────────────────────────────

/**
 * Load PartnerFacingStatementDTO for an authenticated investor.
 *
 * This is the ONLY authorized entry point for Server Components serving
 * the /partner/[slug] route. Calling `loadPartnerStatement()` directly
 * from a Server Component bypasses the authorization boundary.
 *
 * See module-level docblock for the 8-step authorization chain.
 *
 * @param opts.authenticatedUserId  From verified server session ONLY.
 *                                  Call `supabase.auth.getUser()` on the server
 *                                  and pass `data.user.id` here.
 *                                  NEVER accept this from a request body, query
 *                                  parameter, or any client-provided source.
 * @param opts.requestedSlug        URL route parameter (e.g. 'avi' from /partner/avi).
 *                                  Untrusted. Compared against server-derived slug only.
 * @param opts.viewMode             'partner' (default) or absent. 'admin' → reject.
 * @param opts.requestedProperties  Optional subset filter. Validated against server scope.
 *
 * @returns PartnerFacingStatementDTO on success, AuthorizationFailure on any failure.
 *          Callers MUST check whether the result has `ok === false` before use.
 */
export async function loadStatementForAuthenticatedPartner(
  opts: AuthenticatedPartnerStatementOptions,
): Promise<PartnerFacingStatementDTO | AuthorizationFailure> {

  // ── Step 1: Reject Admin mode ──────────────────────────────────────────────
  // This check runs BEFORE any DB call.
  // Admin authorization is a completely separate flow and is never granted here.
  if (opts.viewMode === 'admin') {
    return { ok: false, error: 'ADMIN_MODE_DENIED' }
  }

  // ── Step 2: Require authenticatedUserId ────────────────────────────────────
  // Guard against an accidental call with an empty string (which would cause
  // a DB query for auth_user_id = '' and return NO_MAPPING — correct but wasteful).
  // Fail early before touching the DB.
  if (!opts.authenticatedUserId || opts.authenticatedUserId.trim() === '') {
    return { ok: false, error: 'NO_MAPPING' }
  }

  // ── Steps 3–4: Resolve identity (DB call 1 + DB call 2) ───────────────────
  const resolved = await resolveAuthorizedInvestorEntity(opts.authenticatedUserId)

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
  // P-ARCH-6: verification block is absent from PartnerFacingStatementDTO by design.
  return dto as PartnerFacingStatementDTO
}
