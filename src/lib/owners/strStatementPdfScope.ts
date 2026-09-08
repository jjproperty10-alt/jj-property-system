/**
 * STR statement PDF scope — presentation routing only.
 *
 * Owner-level PDF: all eligible STR properties for the slug.
 * Property-level PDF: same engine, filtered to one canonical property_id.
 * Historical-only PDF: slug matches a recovered historical property when Owner Room
 * has no entity_identity (Yogev Port). No totals, no ledger, no Hostaway mapping invented.
 */
import { isUuidLike } from '@/lib/identity/identityInput'
import { nameToSlug } from '@/lib/owners/ownerWorkspaceUtils'
import type { StrPropertyRef } from '@/lib/owners/selectStrProperties'

export function ownerNameFromHistoricalProperty(propertyName: string): string {
  const token = propertyName.trim().split(/\s+/)[0]
  return token || propertyName
}

export function historicalPropertyMatchesSlug(propertyName: string, slug: string): boolean {
  if (!slug) return false
  return nameToSlug(propertyName) === slug
    || nameToSlug(ownerNameFromHistoricalProperty(propertyName)) === slug
}

export function matchHistoricalPropertiesToSlug(
  defs: readonly StrPropertyRef[],
  slug: string,
): StrPropertyRef[] {
  return defs.filter(d => historicalPropertyMatchesSlug(d.name, slug))
}

export type PropertyFilterResult =
  | { readonly ok: true; readonly properties: StrPropertyRef[] }
  | { readonly ok: false; readonly status: 400 | 404; readonly message: string }

/**
 * Optional `?property=<canonical uuid>` filter. Omitted/blank = all eligible (owner report).
 * Unknown or out-of-scope ids fail closed — never silently drop back to the combined report.
 */
export function filterEligibleProperties(
  eligible: readonly StrPropertyRef[],
  propertyId: string | null | undefined,
): PropertyFilterResult {
  const raw = (propertyId ?? '').trim()
  if (!raw) {
    if (!eligible.length) return { ok: false, status: 404, message: 'No STR properties in statement scope' }
    return { ok: true, properties: [...eligible] }
  }
  if (!isUuidLike(raw)) {
    return { ok: false, status: 400, message: 'Invalid property (expected canonical UUID)' }
  }
  const id = raw.toLowerCase()
  const hit = eligible.filter(p => p.id.toLowerCase() === id)
  if (hit.length !== 1) {
    return { ok: false, status: 404, message: 'Property is not in this owner\'s STR statement scope' }
  }
  return { ok: true, properties: hit }
}

export function rangeStatementHref(
  slug: string,
  from: string,
  to: string,
  propertyId?: string,
): string {
  const qs = new URLSearchParams({ from, to })
  if (propertyId) qs.set('property', propertyId)
  return `/owners/${slug}/statement/range/pdf?${qs.toString()}`
}
