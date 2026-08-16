/**
 * Property Resolver Service — Agent 3 Canonical Property Resolution
 *
 * Constitutional basis: JJ Canonical Integration Audit V1 — Decisions H.1, H.4, H.5 (Yossi 2026-08-15)
 * Canonical property authority: public.property_definitions.property_id
 *
 * Thin typed wrapper over the DB-side fail-closed resolver. The SQL is the single
 * source of truth: registry.resolve_property(), reached through the public bridge
 * public.resolve_property_canonical() (registry schema is not exposed to PostgREST,
 * same reason public.resolve_party_id exists).
 *
 * Inputs: canonical property_id | legacy public.properties.id | legacy entity_registry.id
 *         | raw property name / approved alias.
 * Fail-closed: resolved | ambiguous | not_found | source_unavailable. No fuzzy matching.
 * Honours H.4 (Liora 201 → not_found), H.5 (Tamir Redisson → Tamir Radisson), H.6 (never
 * reads/writes transactions.property_id). Hostaway identity stays owned by pms (Agent 1).
 *
 * server-only.
 */

import 'server-only'

import { createServiceClient } from '@/lib/supabase'
import { isBlankInput } from './identityInput'

export type PropertyResolution =
  | { readonly status: 'resolved'; readonly canonicalPropertyId: string; readonly canonicalName: string }
  | { readonly status: 'not_found'; readonly input: string }
  | { readonly status: 'ambiguous'; readonly input: string; readonly candidates: readonly string[] }
  | { readonly status: 'source_unavailable'; readonly error: string }

interface ResolveRow {
  status: 'resolved' | 'not_found' | 'ambiguous'
  canonical_property_id: string | null
  canonical_name: string | null
  candidates: string[] | null
}

/**
 * Resolve any property representation to the canonical property_definitions.property_id.
 */
export async function resolveProperty(input: string): Promise<PropertyResolution> {
  if (isBlankInput(input)) {
    return { status: 'not_found', input: input ?? '' }
  }

  let sb: ReturnType<typeof createServiceClient>
  try {
    sb = createServiceClient()
  } catch (err) {
    return { status: 'source_unavailable', error: `createServiceClient failed: ${String(err)}` }
  }

  let row: ResolveRow | undefined
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb as any).rpc('resolve_property_canonical', { p_input: input })
    if (error) throw error
    row = (Array.isArray(data) ? data[0] : data) as ResolveRow | undefined
  } catch (err) {
    return { status: 'source_unavailable', error: `resolve_property_canonical failed: ${String(err)}` }
  }

  if (!row || row.status === 'not_found') {
    return { status: 'not_found', input }
  }
  if (row.status === 'ambiguous') {
    return { status: 'ambiguous', input, candidates: Object.freeze(row.candidates ?? []) }
  }
  return {
    status: 'resolved',
    canonicalPropertyId: row.canonical_property_id as string,
    canonicalName: row.canonical_name as string,
  }
}
