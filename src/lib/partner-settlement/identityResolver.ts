/**
 * @module partner-settlement/identityResolver
 * @description Read-time canonical identity mapping for partner-report attribution.
 *
 * The canonical authority is registry.parties (via partyResolverService). But the
 * transactions ledger stores free-text payer/payee ('yossi','jacob'/'yaacov','jj',
 * 'company', ...), matched case-insensitively — a SEPARATE identity system (see 11k
 * blocker 5). This module provides a deterministic read-time resolution WITHOUT
 * normalizing storage (P-ARCH-2). Names it cannot confidently map resolve to
 * EXTERNAL/other and are surfaced as unresolved where material.
 *
 * STAGE 2 — WIRED, CANONICAL-FIRST (QA #185-2). Attribution reuses the canonical
 * party authority (registry.parties via partyResolverService) read-only: an
 * IdentityDirectory built from that source is injected into the read path
 * (transactionsReader → normalizer → engine). The hard-coded aliases here are only an
 * EXPLICIT FALLBACK for repository conventions the registry does not carry (the JJ
 * company aliases 'jj'/'company', and the Jacob spelling variants), applied only when
 * the canonical directory has no entry. A non-empty name that is neither canonical nor
 * an approved alias stays EXTERNAL/ambiguous (confident=false) so the engine surfaces
 * IDENTITY_UNRESOLVED — it is never silently reclassified. Cash custodians (Anastasia)
 * are EXTERNAL-with-custodian so their movements are uncertified custody, not loans.
 */

import type { PartyRole } from './classifyPartnerTransaction'

export interface ResolvedParty {
  readonly role: PartyRole
  readonly canonical: 'Yossi' | 'Jacob' | 'JJ' | null
  readonly raw: string | null
  readonly confident: boolean
  /** true when the party is a recognised cash custodian (not a partner, not JJ) */
  readonly custodian: boolean
  /** true when the identity source flagged the name as ambiguous (multiple candidates) */
  readonly ambiguous: boolean
}

/** One canonical directory entry (built read-only from registry.parties). */
export interface DirectoryEntry {
  readonly role: PartyRole
  readonly canonical: 'Yossi' | 'Jacob' | 'JJ' | null
  readonly custodian: boolean
  readonly ambiguous?: boolean
}
/** Lower-cased raw payer/payee string → canonical resolution. */
export type IdentityDirectory = ReadonlyMap<string, DirectoryEntry>

// Approved-alias FALLBACK only (repository conventions the registry does not carry).
const YOSSI = new Set(['yossi'])
const JACOB = new Set(['jacob', 'yaacov', 'yaakov'])
const JJ = new Set(['jj', 'company'])
/** Recognised cash custodians — EXTERNAL, but movements are uncertified custody. */
export const KNOWN_CUSTODIANS = new Set(['anastasia'])

const EXTERNAL_BLANK = (raw: string | null): ResolvedParty =>
  ({ role: 'EXTERNAL', canonical: null, raw, confident: false, custodian: false, ambiguous: false })

/** Approved-alias fallback resolution (used when the canonical directory has no entry). */
export function resolveParty(raw: string | null | undefined): ResolvedParty {
  if (raw == null || raw.trim() === '') return EXTERNAL_BLANK(raw ?? null)
  const key = raw.trim().toLowerCase()
  if (YOSSI.has(key)) return { role: 'PARTNER', canonical: 'Yossi', raw, confident: true, custodian: false, ambiguous: false }
  if (JACOB.has(key)) return { role: 'PARTNER', canonical: 'Jacob', raw, confident: true, custodian: false, ambiguous: false }
  if (JJ.has(key)) return { role: 'JJ', canonical: 'JJ', raw, confident: true, custodian: false, ambiguous: false }
  if (KNOWN_CUSTODIANS.has(key)) return { role: 'EXTERNAL', canonical: null, raw, confident: true, custodian: true, ambiguous: false }
  // non-empty but unrecognised → ambiguous for partner-sensitive contexts (never dropped silently)
  return { role: 'EXTERNAL', canonical: null, raw, confident: false, custodian: false, ambiguous: true }
}

/**
 * Canonical-first resolution: consult the injected directory (registry.parties) first,
 * then fall back to approved aliases. This is the production path.
 */
export function resolvePartyWith(directory: IdentityDirectory | undefined, raw: string | null | undefined): ResolvedParty {
  if (raw == null || raw.trim() === '') return EXTERNAL_BLANK(raw ?? null)
  const key = raw.trim().toLowerCase()
  const hit = directory?.get(key)
  if (hit) {
    return {
      role: hit.role, canonical: hit.canonical, raw,
      confident: hit.ambiguous ? false : true,
      custodian: hit.custodian, ambiguous: hit.ambiguous ?? false,
    }
  }
  return resolveParty(raw)
}

export function isPartner(raw: string | null | undefined): boolean {
  return resolveParty(raw).role === 'PARTNER'
}

export function isCustodian(raw: string | null | undefined): boolean {
  return resolveParty(raw).custodian
}
