/**
 * @module partner-settlement/scope
 * @description Pure partner-scope resolution (no I/O, no server-only) so it is
 * cleanly unit-testable. QA fix #2: client-management-only properties are excluded.
 */

export interface PropertyRef {
  readonly reportingName: string
  readonly relationshipType: string | null
}

export interface PropertyDefRow {
  canonical_name: string | null
  reporting_name: string | null
  relationship_type: string | null
  /** approved alternative spellings for this property (Stage 2.2: honored before scope check) */
  aliases?: readonly string[] | null
}

/** relationship_type values that belong to the Yossi/Jacob partner scope. */
export const PARTNER_SCOPE_RELATIONSHIP_TYPES = new Set<string>([
  'partnership',
  'jj',
  'jj_company',
])

/**
 * relationship_type values that are genuinely OWNABLE (have partner/JJ ownership shares).
 * jj_company is partner-scope for transactions but is an internal account / cost-centre,
 * NOT ownable — so it must not demand ownership or emit OWNERSHIP_PENDING (Stage 2.2).
 */
export const OWNABLE_RELATIONSHIP_TYPES = new Set<string>(['partnership', 'jj'])

export function isOwnableRelationshipType(rel: string | null | undefined): boolean {
  return OWNABLE_RELATIONSHIP_TYPES.has((rel ?? '').toLowerCase())
}

/** Keep only partner-scope properties; excludes 'client' (and any non-partner type). */
export function filterPartnerScope(rows: readonly PropertyDefRow[]): PropertyRef[] {
  const out: PropertyRef[] = []
  const seen = new Set<string>()
  for (const r of rows) {
    const rel = (r.relationship_type ?? '').toLowerCase()
    if (!PARTNER_SCOPE_RELATIONSHIP_TYPES.has(rel)) continue // excludes client-management-only
    const name = r.reporting_name ?? r.canonical_name
    if (!name || seen.has(name)) continue
    seen.add(name)
    out.push({ reportingName: name, relationshipType: r.relationship_type })
  }
  return out.sort((a, b) => a.reportingName.localeCompare(b.reportingName))
}

// ─── Property scope enforcement on the ledger (QA #185-3) ─────────────────────────

export interface PropertyScopeSets {
  /** lower-cased partnership/jj/jj_company property names (reporting + canonical + aliases) */
  readonly partner: ReadonlySet<string>
  /** lower-cased client-management-only property names (+ aliases) */
  readonly client: ReadonlySet<string>
  /**
   * Stage 2.2: names eligible to become a definition conflict if they ALSO have an
   * external owner — i.e. jj / jj_company only. `partnership` is DELIBERATELY EXCLUDED:
   * a partnership legitimately has external co-owners (Villa Mazotos: Avi 50%; Villa
   * Mazotos 2: Oren 35%), so an external owner there is expected, NOT a conflict.
   */
  readonly conflictEligible?: ReadonlySet<string>
  /**
   * Stage 2.2: names that are conflict-eligible AND have an external owner — excluded
   * from all partner totals and surfaced as SCOPE_DEFINITION_CONFLICT (never silent).
   */
  readonly conflict?: ReadonlySet<string>
}

/** relationship_types eligible for the external-owner conflict guard (NOT partnership). */
export const CONFLICT_ELIGIBLE_RELATIONSHIP_TYPES = new Set<string>(['jj', 'jj_company'])

export type PropertyScopeResult =
  | 'GENERAL_NULL'      // no property → genuine general partner movement, allowed
  | 'IN_SCOPE'          // partnership/jj/jj_company → allowed
  | 'CLIENT_EXCLUDE'    // client-management-only → excluded from Partner Report entirely
  | 'CONFLICT_EXCLUDE'  // partner-tagged but has external owner → excluded + SCOPE_DEFINITION_CONFLICT
  | 'UNKNOWN'           // non-null, unrecognised → PROPERTY_SCOPE_UNRESOLVED (never silently included)

/** Classify a transaction's property_name against the approved partner scope. */
export function classifyPropertyScope(name: string | null | undefined, sets: PropertyScopeSets): PropertyScopeResult {
  if (name == null || name.trim() === '') return 'GENERAL_NULL'
  const key = name.trim().toLowerCase()
  // Conflict wins over everything: a partner-tagged property with an external owner must
  // never enter partner totals even though its relationship_type says partner-scope.
  if (sets.conflict?.has(key)) return 'CONFLICT_EXCLUDE'
  if (sets.client.has(key)) return 'CLIENT_EXCLUDE'
  if (sets.partner.has(key)) return 'IN_SCOPE'
  return 'UNKNOWN'
}

/** Build partner/client/conflict-eligible name sets from property_definitions. */
export function splitPropertyScopeSets(rows: readonly PropertyDefRow[]): PropertyScopeSets {
  const partner = new Set<string>()
  const client = new Set<string>()
  const conflictEligible = new Set<string>()
  for (const r of rows) {
    const rel = (r.relationship_type ?? '').toLowerCase()
    const names: (string | null | undefined)[] = [r.reporting_name, r.canonical_name, ...(r.aliases ?? [])]
    for (const nm of names) {
      if (!nm) continue
      const key = nm.trim().toLowerCase()
      if (key === '') continue
      if (PARTNER_SCOPE_RELATIONSHIP_TYPES.has(rel)) partner.add(key)
      else if (rel === 'client') client.add(key)
      if (CONFLICT_ELIGIBLE_RELATIONSHIP_TYPES.has(rel)) conflictEligible.add(key) // jj / jj_company only
    }
  }
  return { partner, client, conflictEligible }
}

/**
 * Stage 2.2 defensive guard: a definition conflict is a CONFLICT-ELIGIBLE property
 * (jj / jj_company — NOT partnership) that ALSO has an external owner in
 * contact_properties. Partnership co-owners (Avi, Oren) are legitimate and are never
 * flagged. Pure set intersection; `externalOwnerNames` must be lower-cased.
 */
export function computeScopeConflicts(
  conflictEligible: ReadonlySet<string>,
  externalOwnerNames: ReadonlySet<string>,
): Set<string> {
  const conflict = new Set<string>()
  conflictEligible.forEach(name => {
    if (externalOwnerNames.has(name)) conflict.add(name)
  })
  return conflict
}

/**
 * Resolve the scope guard, FAIL-CLOSED. If the external-owner source is unavailable
 * (null) we cannot verify which jj / jj_company properties are actually clients, so we
 * exclude EVERY conflict-eligible property (all jj + jj_company) from partner totals —
 * NOT an empty conflict set. Otherwise an owner-dependent property (e.g. Yogev) could
 * re-enter the subtotals with only a warning. Partnership is never conflict-eligible, so
 * partnership properties are unaffected. The caller also surfaces OWNER_SOURCE_UNAVAILABLE.
 */
export function buildConflictSet(
  conflictEligible: ReadonlySet<string>,
  externalOwnerNames: ReadonlySet<string> | null,
): { conflict: Set<string>; ownerSourceUnavailable: boolean } {
  if (externalOwnerNames == null) {
    const conflict = new Set<string>()
    conflictEligible.forEach(name => conflict.add(name)) // exclude ALL jj/jj_company (fail-closed)
    return { conflict, ownerSourceUnavailable: true }
  }
  return { conflict: computeScopeConflicts(conflictEligible, externalOwnerNames), ownerSourceUnavailable: false }
}
