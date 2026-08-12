/**
 * strEngagement.ts — STR service-engagement resolution (P2, 2026-08-11; QA fix 2026-08-12).
 *
 * Resolves the canonical chain tail:
 *   canonical property_id -> owner/entity -> the airbnb_str engagement effective on a given date.
 *
 * Identity is ALWAYS property_id (P1). This helper never uses jj_property_name.
 *
 * "Active" is effective-period aware, not just the status flag: an engagement whose
 * effective period has ended must NOT be returned as the current engagement even if its
 * `status` column is still 'active'. Resolution is deterministic via an explicit `asOfDate`
 * (no hidden `new Date()`).
 *
 * Boundary convention (verified against lifecycle schema — CHECK effective_to >= effective_from,
 * NULL = ongoing): both boundaries are INCLUSIVE.
 */

export interface StrEngagementRow {
  /** canonical public.property_definitions UUID (identity) */
  readonly propertyId: string;
  /** engagement id (lifecycle.service_engagements.id) */
  readonly id?: string;
  /** owner/entity (lifecycle.entity_identity id) */
  readonly entityId: string;
  readonly serviceType: string;
  readonly status: string;
  readonly effectiveFrom: string | null; // ISO date 'YYYY-MM-DD'
  readonly effectiveTo: string | null;   // ISO date | null (open-ended / ongoing)
}

export type StrEngagementResolution =
  | { readonly resolved: true; readonly engagementId: string | null; readonly entityId: string; readonly effectiveFrom: string | null }
  | { readonly resolved: false; readonly reason: 'no_active_engagement' | 'ambiguous_overlap' };

/**
 * Resolve the airbnb_str engagement effective on `asOfDate`, keyed strictly by property_id.
 *
 * @param asOfDate ISO date 'YYYY-MM-DD' the resolution is evaluated against.
 */
export function resolveActiveStrEngagement(
  propertyId: string,
  rows: readonly StrEngagementRow[],
  asOfDate: string,
): StrEngagementResolution {
  const effective = rows.filter(
    (r) =>
      r.propertyId === propertyId &&
      r.serviceType === 'airbnb_str' &&
      r.status === 'active' &&
      (r.effectiveFrom === null || r.effectiveFrom <= asOfDate) &&   // started on/before asOfDate
      (r.effectiveTo === null || r.effectiveTo >= asOfDate),          // not yet ended (inclusive)
  );
  if (effective.length === 0) return { resolved: false, reason: 'no_active_engagement' };
  if (effective.length > 1) return { resolved: false, reason: 'ambiguous_overlap' };
  const chosen = effective[0];
  return { resolved: true, engagementId: chosen.id ?? null, entityId: chosen.entityId, effectiveFrom: chosen.effectiveFrom };
}
