/**
 * Fail-closed bound series resolution for M1 corrections.
 *
 * Chain (existing authorities only — no invented joins):
 *   transactions.property_name
 *     → lifecycle.management_relationship (verified, valid_to IS NULL)
 *     → exactly one entity_id
 *     → resolvePartyForEntity (approved bridge)
 *     → statements.statement_series (active) for that owner_party_id
 *     → exactly one active series (or latest if unique party has one)
 *
 * If any hop is missing or ambiguous → Apply blocked (Preview still allowed).
 * Never accepts a client-supplied cross-owner series.
 */
import 'server-only'

import { createServiceClient } from '@/lib/supabase'
import { resolvePartyForEntity } from '@/lib/identity/partyResolverService'

export type BoundSeriesResult =
  | {
      readonly status: 'bound'
      readonly seriesId: string
      readonly ownerPartyId: string
      readonly entityId: string
      readonly propertyName: string
    }
  | {
      readonly status: 'unbound'
      readonly reason: string
    }

export async function resolveBoundCorrectionSeries(args: {
  readonly propertyName: string | null
  readonly propertyId: string | null
}): Promise<BoundSeriesResult> {
  const propertyName = (args.propertyName ?? '').trim()
  if (!propertyName) {
    return {
      status: 'unbound',
      reason:
        'No property_name on the transaction — cannot bind a statement series without inventing ownership. Apply is blocked.',
    }
  }

  const db = createServiceClient()

  // Reverse lookup: property → verified active management relationships.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rels, error: relErr } = await (db as any)
    .schema('lifecycle')
    .from('management_relationship')
    .select('entity_id, property_name, verification_status, valid_to')
    .eq('property_name', propertyName)
    .eq('verification_status', 'verified')
    .is('valid_to', null)

  if (relErr) {
    return {
      status: 'unbound',
      reason: `management_relationship lookup failed: ${relErr.message}. Apply is blocked (fail closed).`,
    }
  }

  const rows = (rels ?? []) as Array<{ entity_id: string }>
  const entityIds = Array.from(new Set(rows.map((r) => String(r.entity_id)).filter(Boolean)))

  if (entityIds.length === 0) {
    return {
      status: 'unbound',
      reason: `No verified managed-owner relationship for property "${propertyName}". Apply is blocked.`,
    }
  }
  if (entityIds.length > 1) {
    return {
      status: 'unbound',
      reason: `Ambiguous managed owners for property "${propertyName}" (${entityIds.length}). Apply is blocked — do not guess.`,
    }
  }

  const entityId = entityIds[0]
  const party = await resolvePartyForEntity(entityId)
  if (party.status !== 'resolved') {
    return {
      status: 'unbound',
      reason: `No approved registry party bridge for managed entity of "${propertyName}". Apply is blocked.`,
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: seriesRows, error: seriesErr } = await (db as any)
    .schema('statements')
    .from('statement_series')
    .select('series_id, owner_party_id, series_status, created_at')
    .eq('owner_party_id', party.partyId)
    .eq('series_status', 'active')
    .order('created_at', { ascending: false })

  if (seriesErr) {
    return {
      status: 'unbound',
      reason: `statement_series lookup failed: ${seriesErr.message}. Apply is blocked.`,
    }
  }

  const series = (seriesRows ?? []) as Array<{ series_id: string; owner_party_id: string }>
  if (series.length === 0) {
    return {
      status: 'unbound',
      reason: `No active statement series for the bound owner of "${propertyName}". Preview is allowed; Apply is blocked.`,
    }
  }
  if (series.length > 1) {
    // Multiple active series for one owner is ambiguous — do not pick arbitrarily.
    return {
      status: 'unbound',
      reason: `Owner of "${propertyName}" has ${series.length} active statement series — ambiguous. Apply is blocked.`,
    }
  }

  return {
    status: 'bound',
    seriesId: String(series[0].series_id),
    ownerPartyId: party.partyId,
    entityId,
    propertyName,
  }
}

/** Server-side verify: submitted seriesId must equal the freshly bound series. */
export function assertSeriesMatchesBound(
  submittedSeriesId: string | null | undefined,
  bound: BoundSeriesResult,
): { ok: true; seriesId: string } | { ok: false; error: string } {
  if (bound.status !== 'bound') {
    return { ok: false, error: bound.reason }
  }
  if (!submittedSeriesId || submittedSeriesId !== bound.seriesId) {
    return {
      ok: false,
      error:
        'Rejected seriesId — must equal the server-bound series for this transaction’s property/owner. Arbitrary or cross-owner series are not allowed.',
    }
  }
  return { ok: true, seriesId: bound.seriesId }
}
