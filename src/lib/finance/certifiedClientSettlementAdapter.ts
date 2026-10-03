/**
 * Server-only adapter for public.read_certified_client_settlement.
 * Service-role path only. Never imported by Client Components.
 * Fail-closed: missing/ambiguous identity or reader failure → unavailable, never a fake €0.
 * Does not read finance tables or call a finance-schema RPC.
 */

import 'server-only'

import { createServiceClient } from '@/lib/supabase'
import { isValidUUID } from '@/lib/owners/validation'
import { resolveProperty } from '@/lib/identity'
import { CLIENT_SETTLEMENT_CERTIFICATION_RPC } from './clientSettlementCertificationTypes'
import {
  asText,
  normalizeCertifiedAsOf,
  parseCertifiedReaderPayload,
  unavailable,
} from './certifiedClientSettlementParse'
import type { CertifiedClientSettlementDto } from './certifiedClientSettlementTypes'

export { normalizeCertifiedAsOf, parseCertifiedReaderPayload }


export async function readCertifiedClientSettlement(
  entityId: string,
  asOf: string,
): Promise<CertifiedClientSettlementDto> {
  const day = normalizeCertifiedAsOf(asOf)
  if (!isValidUUID(entityId)) return unavailable('missing_entity', null, day)
  if (!day) return unavailable('missing_as_of', entityId, asOf ?? null)

  try {
    const sb = createServiceClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb as any).rpc(CLIENT_SETTLEMENT_CERTIFICATION_RPC.read, {
      p_entity_id: entityId,
      p_as_of: day,
    })
    if (error) {
      console.error(
        '[certifiedClientSettlementAdapter] reader failed:',
        error instanceof Error ? error.message : String(error),
      )
      return unavailable('reader_failed', entityId, day)
    }
    return parseCertifiedReaderPayload(data, entityId, day)
  } catch (err) {
    console.error(
      '[certifiedClientSettlementAdapter] reader exception:',
      err instanceof Error ? err.message : String(err),
    )
    return unavailable('reader_failed', entityId, day)
  }
}

export type CertifiedEntityResolution =
  | { readonly status: 'resolved'; readonly entityId: string }
  | { readonly status: 'missing' }
  | { readonly status: 'ambiguous' }
  | { readonly status: 'unavailable' }

function uniqueIds(values: readonly unknown[]): string[] {
  const ids: string[] = []
  const seen: Record<string, true> = {}
  for (const value of values) {
    const id = asText(value)
    if (id && isValidUUID(id) && !seen[id]) {
      seen[id] = true
      ids.push(id)
    }
  }
  return ids
}

/**
 * Resolve the settlement entity from the existing owner/client identity graph.
 * Property name → canonical property_definitions → EPA (active) ∪ management_relationship (open).
 * Fail closed on missing or ambiguous entity identity.
 */
export async function resolveCertifiedSettlementEntityFromProperty(
  propertyName: string,
): Promise<CertifiedEntityResolution> {
  const input = propertyName.trim()
  if (!input) return { status: 'missing' }

  const property = await resolveProperty(input)
  if (property.status === 'source_unavailable') return { status: 'unavailable' }
  if (property.status === 'ambiguous') return { status: 'ambiguous' }
  if (property.status !== 'resolved') return { status: 'missing' }

  try {
    const sb = createServiceClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const financeDb = sb as any
    const [epaResult, mrResult] = await Promise.all([
      financeDb
        .schema('lifecycle')
        .from('entity_property_associations')
        .select('entity_id')
        .eq('property_id', property.canonicalPropertyId)
        .eq('status', 'active'),
      financeDb
        .schema('lifecycle')
        .from('management_relationship')
        .select('entity_id')
        .eq('property_name', property.canonicalName)
        .is('valid_to', null),
    ])

    if (epaResult.error || mrResult.error) return { status: 'unavailable' }

    const ids = uniqueIds([
      ...((epaResult.data ?? []) as { entity_id: string }[]).map((r) => r.entity_id),
      ...((mrResult.data ?? []) as { entity_id: string }[]).map((r) => r.entity_id),
    ])
    if (ids.length === 0) return { status: 'missing' }
    if (ids.length > 1) return { status: 'ambiguous' }
    return { status: 'resolved', entityId: ids[0] }
  } catch {
    return { status: 'unavailable' }
  }
}

export async function loadCertifiedSettlementForEntity(
  entityId: string | null | undefined,
  asOf: string | null | undefined,
): Promise<CertifiedClientSettlementDto> {
  const day = normalizeCertifiedAsOf(asOf)
  if (!entityId || !isValidUUID(entityId)) return unavailable('missing_entity', entityId ?? null, day)
  if (!day) return unavailable('missing_as_of', entityId, asOf ?? null)
  return readCertifiedClientSettlement(entityId, day)
}

export async function loadCertifiedSettlementForProperty(
  propertyName: string,
  asOf: string | null | undefined,
): Promise<CertifiedClientSettlementDto> {
  const day = normalizeCertifiedAsOf(asOf)
  if (!day) return unavailable('missing_as_of', null, asOf ?? null)

  const resolved = await resolveCertifiedSettlementEntityFromProperty(propertyName)
  if (resolved.status === 'missing') return unavailable('missing_entity', null, day)
  if (resolved.status === 'ambiguous') return unavailable('ambiguous_entity', null, day)
  if (resolved.status === 'unavailable') return unavailable('reader_failed', null, day)
  return readCertifiedClientSettlement(resolved.entityId, day)
}
