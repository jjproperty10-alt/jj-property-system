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
 * ⚠️ STAGE 2 SCAFFOLDING — NOT WIRED. As of Stage 1 this resolver is a pure,
 * unit-tested helper only; it is NOT invoked by the read path (transaction-level
 * attribution is Stage 2). Do not claim Stage 1 performs runtime payer/payee
 * identity resolution.
 */

import type { PartyRole } from './classifyPartnerTransaction'

export interface ResolvedParty {
  readonly role: PartyRole
  readonly canonical: 'Yossi' | 'Jacob' | 'JJ' | null
  readonly raw: string | null
  readonly confident: boolean
}

const YOSSI = new Set(['yossi'])
const JACOB = new Set(['jacob', 'yaacov', 'yaakov'])
const JJ = new Set(['jj', 'company'])

export function resolveParty(raw: string | null | undefined): ResolvedParty {
  if (raw == null || raw.trim() === '') {
    return { role: 'EXTERNAL', canonical: null, raw: raw ?? null, confident: false }
  }
  const key = raw.trim().toLowerCase()
  if (YOSSI.has(key)) return { role: 'PARTNER', canonical: 'Yossi', raw, confident: true }
  if (JACOB.has(key)) return { role: 'PARTNER', canonical: 'Jacob', raw, confident: true }
  if (JJ.has(key)) return { role: 'JJ', canonical: 'JJ', raw, confident: true }
  return { role: 'EXTERNAL', canonical: null, raw, confident: false }
}

export function isPartner(raw: string | null | undefined): boolean {
  return resolveParty(raw).role === 'PARTNER'
}
