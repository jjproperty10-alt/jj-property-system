/**
 * @module partner-settlement/adapters/ownershipReader
 * @description READ-ONLY per-partner ownership adapter (11k blocker 1).
 *
 * lifecycle.ownership_period currently holds only pending_verification rows with null
 * effective dates. Stage 1 reads them for display but marks every non-confirmed share
 * as pending; property-level Layer B stays PENDING. NO hard-coded percentages.
 */

import 'server-only'
import { createServiceClient } from '@/lib/supabase'
import type { OwnershipShare, OwnershipConfidence } from '../partnerReportBTypes'

interface OwnershipRow {
  property_name: string
  ownership_pct: number | null
  status: string | null
  effective_from: string | null
  effective_to: string | null
  entity_id: string
}
interface EntityRow { id: string; canonical_name: string }

export interface PropertyOwnership {
  readonly propertyName: string
  readonly shares: readonly OwnershipShare[]
  /** true when any share is unconfirmed or effective dates are missing */
  readonly pending: boolean
}

function confidenceOf(status: string | null, effectiveFrom: string | null): OwnershipConfidence {
  if (status === 'confirmed' && effectiveFrom) return 'confirmed'
  if (status === 'estimated') return 'estimated'
  return 'pending_verification'
}

export async function readOwnership(): Promise<Map<string, PropertyOwnership>> {
  const db = createServiceClient()
  const out = new Map<string, PropertyOwnership>()

  const { data: rows } = await db
    .schema('lifecycle')
    .from('ownership_period')
    .select('property_name, ownership_pct, status, effective_from, effective_to, entity_id')
    .neq('status', 'void')
    .is('effective_to', null)

  const orows = (rows as OwnershipRow[]) ?? []
  if (orows.length === 0) return out

  const ids = Array.from(new Set(orows.map(r => r.entity_id)))
  const { data: ents } = await db
    .schema('lifecycle')
    .from('entity_identity')
    .select('id, canonical_name')
    .in('id', ids)
  const nameById = new Map<string, string>(((ents as EntityRow[]) ?? []).map(e => [e.id, e.canonical_name]))

  const byProp = new Map<string, OwnershipRow[]>()
  for (const r of orows) {
    const list = byProp.get(r.property_name) ?? []
    list.push(r)
    byProp.set(r.property_name, list)
  }

  for (const [propertyName, list] of Array.from(byProp.entries())) {
    const shares: OwnershipShare[] = list.map(r => ({
      party: nameById.get(r.entity_id) ?? 'Unknown',
      pct: r.ownership_pct,
      confidence: confidenceOf(r.status, r.effective_from),
    }))
    const pending = shares.some(s => s.confidence !== 'confirmed')
    out.set(propertyName, { propertyName, shares, pending })
  }

  return out
}
