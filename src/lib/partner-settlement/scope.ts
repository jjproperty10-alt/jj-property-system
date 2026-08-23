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
