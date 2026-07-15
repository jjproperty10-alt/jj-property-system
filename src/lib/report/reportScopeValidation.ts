/**
 * JJ Property 10 — Report Scope Server-Side Validation
 * M9-B: Report Scope Selector
 *
 * @deprecated PR B — This module is superseded by PR A's centralized authorization.
 * Use `validateAuthorizedReportScope()` from `@/lib/auth/reportAuthorization` instead.
 * That function performs the full authorization chain (session \u2192 user_roles \u2192 policy \u2192 scope)
 * in a single server-side call. This file is retained for backward compatibility with
 * existing unit tests but is no longer imported by production code.
 *
 * Validates a submitted ReportScope against the authorized property list.
 * Must be called server-side (API route) — never trust browser-submitted names.
 *
 * Authorization strategy:
 * 1. Load authorized properties via fetchRC3PropertyList() (already RLS-filtered)
 * 2. Normalize submitted names
 * 3. Silently reject any name not in the authorized set (no cross-owner leakage)
 * 4. Return ValidationResult
 */

import type { ReportScope } from './reportScope'
import {
  normalizePropertyNames,
} from './reportScope'

export type ValidationResult =
  | { ok: true; resolvedProperties: string[] }
  | { ok: false; error: ScopeValidationError }

export type ScopeValidationError =
  | 'empty_selection'      // selected_properties with nothing checked
  | 'missing_property'     // single_property with empty name
  | 'no_authorized_properties'  // all submitted names were rejected by authorization
  | 'empty_portfolio'      // portfolio mode but owner has no authorized properties

/**
 * Validate a scope against the authorized property set.
 *
 * @deprecated Use `validateAuthorizedReportScope()` from `@/lib/auth/reportAuthorization`.
 * @param scope - The scope submitted by the client
 * @param authorizedProperties - Complete list from fetchRC3PropertyList() for this owner
 */
export function validateScope(
  scope: ReportScope,
  authorizedProperties: string[],
): ValidationResult {
  const authorized = normalizePropertyNames(authorizedProperties)

  switch (scope.type) {
    case 'portfolio': {
      if (authorized.length === 0) {
        return { ok: false, error: 'empty_portfolio' }
      }
      return { ok: true, resolvedProperties: authorized }
    }

    case 'selected_properties': {
      const normalized = normalizePropertyNames(scope.propertyNames)
      if (normalized.length === 0) {
        return { ok: false, error: 'empty_selection' }
      }
      const authorizedSet = new Set(authorized)
      const resolved = normalized.filter(n => authorizedSet.has(n))
      if (resolved.length === 0) {
        return { ok: false, error: 'no_authorized_properties' }
      }
      return { ok: true, resolvedProperties: resolved }
    }

    case 'single_property': {
      const name = scope.propertyName.trim()
      if (!name) {
        return { ok: false, error: 'missing_property' }
      }
      // Reject silently — do not reveal which names are valid to unauthorized callers
      if (!authorized.includes(name)) {
        return { ok: false, error: 'no_authorized_properties' }
      }
      return { ok: true, resolvedProperties: [name] }
    }
  }
}

// ── User-facing error messages ─────────────────────────────────────────────────

export function validationErrorMessageEN(error: ScopeValidationError): string {
  switch (error) {
    case 'empty_selection': return 'Please select at least one property.'
    case 'missing_property': return 'Please select a property.'
    case 'no_authorized_properties': return 'The selected property is not available.'
    case 'empty_portfolio': return 'No properties are available for this owner.'
  }
}

export function validationErrorMessageHE(error: ScopeValidationError): string {
  switch (error) {
    case 'empty_selection': return '\u05d0\u05e0\u05d0 \u05d1\u05d7\u05e8 \u05dc\u05e4\u05d7\u05d5\u05ea \u05e0\u05db\u05e1 \u05d0\u05d7\u05d3.'
    case 'missing_property': return '\u05d0\u05e0\u05d0 \u05d1\u05d7\u05e8 \u05e0\u05db\u05e1.'
    case 'no_authorized_properties': return '\u05d4\u05e0\u05db\u05e1 \u05d4\u05e0\u05d1\u05d7\u05e8 \u05d0\u05d9\u05e0\u05d5 \u05d6\u05de\u05d9\u05df.'
    case 'empty_portfolio': return '\u05d0\u05d9\u05df \u05e0\u05db\u05e1\u05d9\u05dd \u05d6\u05de\u05d9\u05e0\u05d9\u05dd \u05e2\u05d1\u05d5\u05e8 \u05d1\u05e2\u05dc\u05d9\u05dd \u05d6\u05d4.'
  }
}
