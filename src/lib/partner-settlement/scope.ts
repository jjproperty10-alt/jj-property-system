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
}

/** relationship_type values that belong to the Yossi/Jacob partner scope. */
export const PARTNER_SCOPE_RELATIONSHIP_TYPES = new Set<string>([
  'partnership',
  'jj',
  'jj_company',
])

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
  /** lower-cased partnership/jj/jj_company property names (reporting + canonical) */
  readonly partner: ReadonlySet<string>
  /** lower-cased client-management-only property names */
  readonly client: ReadonlySet<string>
}

export type PropertyScopeResult =
  | 'GENERAL_NULL'   // no property → genuine general partner movement, allowed
  | 'IN_SCOPE'       // partnership/jj/jj_company → allowed
  | 'CLIENT_EXCLUDE' // client-management-only → excluded from Partner Report entirely
  | 'UNKNOWN'        // non-null, unrecognised → PROPERTY_SCOPE_UNRESOLVED (never silently included)

/** Classify a transaction's property_name against the approved partner scope. */
export function classifyPropertyScope(name: string | null | undefined, sets: PropertyScopeSets): PropertyScopeResult {
  if (name == null || name.trim() === '') return 'GENERAL_NULL'
  const key = name.trim().toLowerCase()
  if (sets.partner.has(key)) return 'IN_SCOPE'
  if (sets.client.has(key)) return 'CLIENT_EXCLUDE'
  return 'UNKNOWN'
}

/** Build partner/client name sets from property_definitions (reporting + canonical). */
export function splitPropertyScopeSets(rows: readonly PropertyDefRow[]): PropertyScopeSets {
  const partner = new Set<string>()
  const client = new Set<string>()
  for (const r of rows) {
    const rel = (r.relationship_type ?? '').toLowerCase()
    const names = [r.reporting_name, r.canonical_name]
    for (const nm of names) {
      if (!nm) continue
      const key = nm.trim().toLowerCase()
      if (key === '') continue
      if (PARTNER_SCOPE_RELATIONSHIP_TYPES.has(rel)) partner.add(key)
      else if (rel === 'client') client.add(key)
    }
  }
  return { partner, client }
}
