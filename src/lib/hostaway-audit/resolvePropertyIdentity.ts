/**
 * resolvePropertyIdentity — canonical property identity resolution (P1, 2026-08-11).
 *
 * P1 rule: pms.property_mappings.property_id (the canonical public.property_definitions
 * UUID) is the AUTHORITATIVE Hostaway -> JJ property machine identity.
 *
 * For an approved mapping:
 *   - property_id present -> resolved (the UUID is the identity)
 *   - property_id NULL    -> UNRESOLVED / needs review. NEVER silently fall back to
 *                            jj_property_name as an identity authority.
 *
 * jj_property_name remains for display, evidence, and the downstream ledger name hop
 * (public.transactions.property_id is currently unpopulated) — but it is not an identity.
 */

export interface MappingIdentityInput {
  /** 'approved' | 'proposed' | 'rejected' */
  readonly status: string;
  /** canonical public.property_definitions UUID, or null when unmapped */
  readonly propertyId: string | null;
  /** display / legacy only */
  readonly jjPropertyName: string;
}

export type PropertyIdentityResolution =
  | { readonly resolved: true; readonly propertyId: string }
  | { readonly resolved: false; readonly reason: string };

export function resolvePropertyIdentity(
  mapping: MappingIdentityInput,
): PropertyIdentityResolution {
  if (mapping.propertyId !== null && mapping.propertyId.trim() !== '') {
    return { resolved: true, propertyId: mapping.propertyId };
  }
  const base = `Unresolved property identity for "${mapping.jjPropertyName}": no canonical property_id`;
  if (mapping.status === 'approved') {
    return {
      resolved: false,
      reason: `${base}. Approved mappings must carry a canonical UUID; jj_property_name is not an identity authority.`,
    };
  }
  return { resolved: false, reason: `${base} (status='${mapping.status}').` };
}
