/**
 * Party Resolver Service — Agent 3 Canonical Party Resolution
 *
 * Constitutional basis: JJ Canonical Integration Audit V1 — Decision H.3 (Yossi 2026-08-15)
 * Canonical party authority: registry.parties (bridged via registry.external_identities).
 *
 * Thin typed wrappers over DB-side fail-closed resolvers (SQL = source of truth):
 *   - resolveParty()          → public.resolve_party_canonical() → registry.resolve_party()
 *   - resolvePartyForEntity()  → public.resolve_party_id()  (REUSE of the existing PR#89 bridge)
 *
 * resolvePartyForEntity is the Owner-Room migration adapter: it maps a
 * lifecycle.entity_identity id → canonical registry party, WITHOUT changing the
 * Owner-Room resolver. Activation of the Owner-Room source switch is a separate,
 * approval-gated step (CROSS-AGENT DEPENDENCY with Agent 2). Identity answers WHO;
 * lifecycle keeps business-state relationships (kept separate — not merged here).
 *
 * Fail-closed. No fuzzy matching. server-only.
 */

import 'server-only'

import { createServiceClient } from '@/lib/supabase'
import { isBlankInput } from './identityInput'

export type PartyResolution =
  | { readonly status: 'resolved'; readonly partyId: string; readonly canonicalName: string; readonly partyType: string }
  | { readonly status: 'not_found'; readonly input: string }
  | { readonly status: 'ambiguous'; readonly input: string; readonly candidates: readonly string[] }
  | { readonly status: 'source_unavailable'; readonly error: string }

/** Result of mapping a single lifecycle entity_identity id → canonical party. */
export type EntityPartyResolution =
  | { readonly status: 'resolved'; readonly partyId: string }
  | { readonly status: 'not_found'; readonly entityId: string }
  | { readonly status: 'source_unavailable'; readonly error: string }

interface ResolvePartyRow {
  status: 'resolved' | 'not_found' | 'ambiguous'
  party_id: string | null
  canonical_name: string | null
  party_type: string | null
  candidates: string[] | null
}

interface ResolvePartyIdRow {
  canonical_id: string | null
  mapping_status: string | null
}

/**
 * Resolve a party by identity value, optionally scoped to a known source system
 * (e.g. 'app.entities', 'app.contacts', 'lifecycle.entity_identity', 'ledger.property_owners').
 */
export async function resolveParty(input: string, sourceSystem?: string): Promise<PartyResolution> {
  if (isBlankInput(input)) {
    return { status: 'not_found', input: input ?? '' }
  }

  let sb: ReturnType<typeof createServiceClient>
  try {
    sb = createServiceClient()
  } catch (err) {
    return { status: 'source_unavailable', error: `createServiceClient failed: ${String(err)}` }
  }

  let row: ResolvePartyRow | undefined
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb as any).rpc('resolve_party_canonical', {
      p_input: input,
      p_source_system: sourceSystem ?? null,
    })
    if (error) throw error
    row = (Array.isArray(data) ? data[0] : data) as ResolvePartyRow | undefined
  } catch (err) {
    return { status: 'source_unavailable', error: `resolve_party_canonical failed: ${String(err)}` }
  }

  if (!row || row.status === 'not_found') {
    return { status: 'not_found', input }
  }
  if (row.status === 'ambiguous') {
    return { status: 'ambiguous', input, candidates: Object.freeze(row.candidates ?? []) }
  }
  return {
    status: 'resolved',
    partyId: row.party_id as string,
    canonicalName: row.canonical_name as string,
    partyType: row.party_type as string,
  }
}

/**
 * Owner-Room migration adapter (REUSE of public.resolve_party_id).
 * Maps a lifecycle.entity_identity id → canonical registry party id.
 * Fail-closed: only 'approved' bridge rows resolve. Does NOT switch the Owner Room.
 */
export async function resolvePartyForEntity(entityIdentityId: string): Promise<EntityPartyResolution> {
  if (isBlankInput(entityIdentityId)) {
    return { status: 'not_found', entityId: entityIdentityId ?? '' }
  }

  let sb: ReturnType<typeof createServiceClient>
  try {
    sb = createServiceClient()
  } catch (err) {
    return { status: 'source_unavailable', error: `createServiceClient failed: ${String(err)}` }
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb as any).rpc('resolve_party_id', { p_entity_identity_id: entityIdentityId })
    if (error) throw error
    const row = (Array.isArray(data) ? data[0] : data) as ResolvePartyIdRow | undefined
    if (!row || row.mapping_status !== 'approved' || !row.canonical_id) {
      return { status: 'not_found', entityId: entityIdentityId }
    }
    return { status: 'resolved', partyId: row.canonical_id }
  } catch (err) {
    return { status: 'source_unavailable', error: `resolve_party_id failed: ${String(err)}` }
  }
}
