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
 * STAGE 2 — WIRED. This resolver is invoked by the read path (transactionsReader →
 * partnerLedgerEngine) to attribute payer/payee. Names it cannot confidently map
 * resolve to EXTERNAL and, where material, surface as IDENTITY_UNRESOLVED. Cash
 * custodians (e.g. Anastasia) are recognised as EXTERNAL-with-custodian so the engine
 * treats their movements as uncertified custody, never as partner loans (12b).
 */

import type { PartyRole } from './classifyPartnerTransaction'

export interface ResolvedParty {
  readonly role: PartyRole
  readonly canonical: 'Yossi' | 'Jacob' | 'JJ' | null
  readonly raw: string | null
  readonly confident: boolean
  /** true when the party is a recognised cash custodian (not a partner, not JJ) */
  readonly custodian: boolean
}

const YOSSI = new Set(['yossi'])
const JACOB = new Set(['jacob', 'yaacov', 'yaakov'])
const JJ = new Set(['jj', 'company'])
/** Recognised cash custodians — EXTERNAL, but movements are uncertified custody. */
const CUSTODIANS = new Set(['anastasia'])

export function resolveParty(raw: string | null | undefined): ResolvedParty {
  if (raw == null || raw.trim() === '') {
    return { role: 'EXTERNAL', canonical: null, raw: raw ?? null, confident: false, custodian: false }
  }
  const key = raw.trim().toLowerCase()
  if (YOSSI.has(key)) return { role: 'PARTNER', canonical: 'Yossi', raw, confident: true, custodian: false }
  if (JACOB.has(key)) return { role: 'PARTNER', canonical: 'Jacob', raw, confident: true, custodian: false }
  if (JJ.has(key)) return { role: 'JJ', canonical: 'JJ', raw, confident: true, custodian: false }
  if (CUSTODIANS.has(key)) return { role: 'EXTERNAL', canonical: null, raw, confident: true, custodian: true }
  return { role: 'EXTERNAL', canonical: null, raw, confident: false, custodian: false }
}

export function isPartner(raw: string | null | undefined): boolean {
  return resolveParty(raw).role === 'PARTNER'
}

export function isCustodian(raw: string | null | undefined): boolean {
  return resolveParty(raw).custodian
}
