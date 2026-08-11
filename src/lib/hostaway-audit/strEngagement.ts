/**
 * strEngagement.ts — STR service-engagement resolution (P2, 2026-08-11).
 *
 * Resolves the canonical chain tail:
 *   canonical property_id -> owner/entity -> active airbnb_str service engagement.
 *
 * Identity is ALWAYS property_id (P1). This helper never uses jj_property_name.
 * Overlapping active engagements are flagged as ambiguous, never silently picked.
 */

export interface StrEngagementRow {
  /** canonical public.property_definitions UUID (identity) */
  readonly propertyId: string;
  /** owner/entity (lifecycle.entity_identity id) */
  readonly entityId: string;
  readonly serviceType: string;
  readonly status: string;
  readonly effectiveFrom: string | null; // ISO date
  readonly effectiveTo: string | null;   // ISO date | null (open-ended)
}

export type StrEngagementResolution =
  | { readonly resolved: true; readonly entityId: string; readonly effectiveFrom: string | null }
  | { readonly resolved: false; readonly reason: 'no_active_engagement' | 'ambiguous_overlap' };

function periodsOverlap(a: StrEngagementRow, b: StrEngagementRow): boolean {
  const aFrom = a.effectiveFrom ?? '0000-01-01';
  const aTo = a.effectiveTo ?? '9999-12-31';
  const bFrom = b.effectiveFrom ?? '0000-01-01';
  const bTo = b.effectiveTo ?? '9999-12-31';
  return aFrom <= bTo && bFrom <= aTo;
}

/**
 * Resolve the active airbnb_str engagement for a property, keyed strictly by property_id.
 */
export function resolveActiveStrEngagement(
  propertyId: string,
  rows: readonly StrEngagementRow[],
): StrEngagementResolution {
  const active = rows.filter(
    (r) => r.propertyId === propertyId && r.serviceType === 'airbnb_str' && r.status === 'active',
  );
  if (active.length === 0) return { resolved: false, reason: 'no_active_engagement' };
  if (active.length > 1) {
    for (let i = 0; i < active.length; i++) {
      for (let j = i + 1; j < active.length; j++) {
        if (periodsOverlap(active[i], active[j])) {
          return { resolved: false, reason: 'ambiguous_overlap' };
        }
      }
    }
  }
  const chosen = active
    .slice()
    .sort((a, b) => (a.effectiveFrom ?? '') < (b.effectiveFrom ?? '') ? -1 : 1)[0];
  return { resolved: true, entityId: chosen.entityId, effectiveFrom: chosen.effectiveFrom };
}
