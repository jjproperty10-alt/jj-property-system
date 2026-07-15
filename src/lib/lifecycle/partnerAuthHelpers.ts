/**
 * @module lifecycle/partnerAuthHelpers
 * @description Pure synchronous helpers for the Partner Authorization Boundary.
 *
 * These functions contain no I/O, no Supabase, no framework imports.
 * They may be imported in both server and (if ever needed) client contexts.
 * They are tested directly in partnerAuth.test.ts without any module mocks.
 *
 * Intentionally separated from partnerAuthService.ts so that the service
 * module can apply its server boundary without restricting these helpers.
 *
 * @see partnerAuthService.ts — imports these helpers
 * @see partnerAuthTypes.ts  — type definitions shared by both modules
 */

import type { SlugMatchResult, PropertyScopeOutcome } from './partnerAuthTypes'

// ─── Slug normalization ───────────────────────────────────────────────────────

/**
 * Compare the authorized entity slug against the slug from the URL route.
 *
 * Both values are normalised to lowercase before comparison to match the
 * `buildSlug()` output used at entity creation time.
 *
 * The URL route parameter is untrusted input. This function only compares
 * it against the server-derived authorized slug — it does not validate or
 * sanitize the URL parameter itself.
 *
 * Pure function — no DB, no network, no side effects.
 *
 * @param authorizedSlug  Server-derived canonical slug for the authorized entity
 * @param requestedSlug   URL route parameter (untrusted — compare only, never trust)
 */
export function verifySlugMatch(
  authorizedSlug: string,
  requestedSlug: string,
): SlugMatchResult {
  const normalizedAuthorized = authorizedSlug.toLowerCase()
  const normalizedRequested = requestedSlug.toLowerCase()
  return {
    match: normalizedAuthorized === normalizedRequested,
    authorizedSlug: normalizedAuthorized,
    requestedSlug: normalizedRequested,
  }
}

// ─── Property scope validation ────────────────────────────────────────────────

/**
 * Validate that every requested property name is within the server-derived
 * authorized scope.
 *
 * Authorization model:
 * - The authorized scope is derived server-side from lifecycle.partner_entry.
 * - If requestedProperties is empty or undefined, the full scope is valid
 *   (no filter requested — all authorized properties will be loaded).
 * - If the caller passes specific properties, ALL must be in scope.
 *   Any single unauthorized property → failure. Partial intersection rejected.
 *
 * Pure function — no DB, no network, no side effects.
 *
 * @param requestedProperties  Property names requested by the caller (may be empty/undefined)
 * @param authorizedProperties Server-derived authorized property names for this entity
 */
export function validatePropertyScope(
  requestedProperties: readonly string[] | undefined,
  authorizedProperties: readonly string[],
): PropertyScopeOutcome {
  // Empty or absent request → full authorized scope is valid
  if (!requestedProperties || requestedProperties.length === 0) {
    return { valid: true, authorizedProperties }
  }

  const authorizedSet = new Set(authorizedProperties)
  const unauthorized = requestedProperties.filter(p => !authorizedSet.has(p))

  if (unauthorized.length > 0) {
    return {
      valid: false,
      unauthorizedProperties: unauthorized,
      authorizedProperties,
    }
  }

  return { valid: true, authorizedProperties: requestedProperties }
}
