/**
 * JJ Property 10 — Report Scope Type & Pure Helpers
 * M9-B: Report Scope Selector
 *
 * ReportScope defines what properties are included in a report.
 * Pure data model — no network, no arithmetic, no balance calculations.
 *
 * Architecture rule: the UI sets scope; the server validates and resolves
 * authorized properties; engines do all arithmetic. This file touches neither.
 */

export type ReportScope =
  | { type: 'portfolio' }
  | { type: 'selected_properties'; propertyNames: string[] }
  | { type: 'single_property';     propertyName: string }

// ── Defaults ──────────────────────────────────────────────────────────────────

/** Default scope — single-property mode, preserving current UX. */
export function defaultScope(firstProperty?: string): ReportScope {
  if (firstProperty) return { type: 'single_property', propertyName: firstProperty }
  return { type: 'portfolio' }
}

// ── Normalization ──────────────────────────────────────────────────────────────

/**
 * Normalize a property name list:
 * - trim whitespace
 * - remove empty strings
 * - deduplicate (preserve first occurrence order)
 */
export function normalizePropertyNames(names: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const name of names) {
    const trimmed = name.trim()
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed)
      result.push(trimmed)
    }
  }
  return result
}

// ── Resolution ─────────────────────────────────────────────────────────────────

/**
 * Resolve the explicit property name list from a scope.
 * Returns null for portfolio mode (caller must supply the authorized list).
 */
export function resolvePropertyNames(scope: ReportScope): string[] | null {
  switch (scope.type) {
    case 'portfolio':
      return null
    case 'selected_properties':
      return normalizePropertyNames(scope.propertyNames)
    case 'single_property':
      return scope.propertyName.trim() ? [scope.propertyName.trim()] : []
  }
}

// ── Validation ─────────────────────────────────────────────────────────────────

/** Returns true if the scope represents a non-empty, actionable selection. */
export function isScopeValid(scope: ReportScope): boolean {
  switch (scope.type) {
    case 'portfolio':
      return true
    case 'selected_properties':
      return normalizePropertyNames(scope.propertyNames).length > 0
    case 'single_property':
      return scope.propertyName.trim().length > 0
  }
}

// ── Authorization filter ───────────────────────────────────────────────────────

/**
 * Filter submitted property names to only those in the authorized set.
 * Case-sensitive exact match — canonical names from fetchRC3PropertyList are authoritative.
 * Server must re-validate; this is a client-side pre-flight only.
 */
export function filterAuthorizedProperties(
  submitted: string[],
  authorizedSet: string[],
): string[] {
  const authorized = new Set(authorizedSet)
  return normalizePropertyNames(submitted).filter(name => authorized.has(name))
}

/**
 * Resolve the final authorized property list for a given scope.
 * Returns the intersection of the scope selection and the authorized set.
 *
 * - portfolio  → all authorized properties
 * - selected   → submitted names ∩ authorized set
 * - single     → [name] if authorized, [] if not
 */
export function resolveAuthorizedScope(
  scope: ReportScope,
  authorizedProperties: string[],
): string[] {
  switch (scope.type) {
    case 'portfolio':
      return [...authorizedProperties]
    case 'selected_properties':
      return filterAuthorizedProperties(scope.propertyNames, authorizedProperties)
    case 'single_property': {
      const name = scope.propertyName.trim()
      return authorizedProperties.includes(name) ? [name] : []
    }
  }
}

// ── Human-readable descriptions ────────────────────────────────────────────────

/** English description of the current scope (for display, not storage). */
export function describeScopeEN(scope: ReportScope, totalProperties?: number): string {
  switch (scope.type) {
    case 'portfolio':
      return totalProperties != null
        ? `Entire Portfolio (${totalProperties} properties)`
        : 'Entire Portfolio'
    case 'selected_properties': {
      const count = normalizePropertyNames(scope.propertyNames).length
      return count === 1 ? '1 property selected' : `${count} properties selected`
    }
    case 'single_property':
      return scope.propertyName.trim() || 'No property selected'
  }
}

/** Hebrew description of the current scope (for display, not storage). */
export function describeScopeHE(scope: ReportScope, totalProperties?: number): string {
  switch (scope.type) {
    case 'portfolio':
      return totalProperties != null
        ? `כל התיק (${totalProperties} נכסים)`
        : 'כל התיק'
    case 'selected_properties': {
      const count = normalizePropertyNames(scope.propertyNames).length
      return count === 1 ? 'נכס 1 נבחר' : `${count} נכסים נבחרו`
    }
    case 'single_property':
      return scope.propertyName.trim() || 'לא נבחר נכס'
  }
}
