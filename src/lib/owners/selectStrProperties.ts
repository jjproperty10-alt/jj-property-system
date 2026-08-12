/**
 * selectStrProperties — canonical properties that should render an STR reconciliation panel.
 *
 * A property qualifies iff it has an `airbnb_str` service engagement (any status). This excludes
 * legacy/duplicate managed-property names that are NOT STR properties (e.g. the "Tamir Kiti"
 * variants that have no Hostaway mapping and no engagement), so the Reservations tab never
 * renders empty "no engagement" panels for them. Deduped by canonical property_id.
 */
import type { OwnerServiceEngagementsDTO } from './ownerWorkspaceTypes'

export interface StrPropertyRef {
  readonly id: string
  readonly name: string
}

export function selectStrProperties(services: OwnerServiceEngagementsDTO): StrPropertyRef[] {
  const seen = new Set<string>()
  const out: StrPropertyRef[] = []
  for (const p of services.properties) {
    if (!p.propertyName) continue
    if (!p.engagements.some(e => e.serviceType === 'airbnb_str')) continue
    if (seen.has(p.propertyId)) continue
    seen.add(p.propertyId)
    out.push({ id: p.propertyId, name: p.propertyName })
  }
  return out
}
