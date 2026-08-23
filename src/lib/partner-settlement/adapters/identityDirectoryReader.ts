/**
 * @module partner-settlement/adapters/identityDirectoryReader
 * @description READ-ONLY canonical identity directory (QA #185-2).
 *
 * Builds an IdentityDirectory by resolving each distinct payer/payee string through the
 * canonical party authority (registry.parties via partyResolverService.resolveParty →
 * resolve_party_canonical). Read-only, fail-closed: if the canonical source is
 * unavailable for any name, `sourceUnavailable` is set so the service can surface an
 * IDENTITY_SOURCE_UNAVAILABLE blocker rather than silently degrading to aliases.
 *
 * Not-found names are intentionally omitted from the directory — the pure resolver's
 * approved-alias fallback (JJ company aliases, Jacob spelling variants) then applies,
 * and anything still unrecognised stays ambiguous → IDENTITY_UNRESOLVED downstream.
 */

import 'server-only'
import { resolveParty as canonicalResolveParty } from '@/lib/identity/partyResolverService'
import { KNOWN_CUSTODIANS, type DirectoryEntry } from '../identityResolver'

export interface IdentityDirectoryResult {
  readonly directory: Map<string, DirectoryEntry>
  readonly sourceUnavailable: boolean
}

export async function buildIdentityDirectory(distinctNames: readonly string[]): Promise<IdentityDirectoryResult> {
  const directory = new Map<string, DirectoryEntry>()
  let sourceUnavailable = false

  const resolutions = await Promise.all(
    distinctNames.map(async name => ({ name, res: await canonicalResolveParty(name) })),
  )

  for (const { name, res } of resolutions) {
    const key = name.trim().toLowerCase()
    if (res.status === 'source_unavailable') { sourceUnavailable = true; continue }
    if (res.status === 'ambiguous') {
      directory.set(key, { role: 'EXTERNAL', canonical: null, custodian: false, ambiguous: true })
      continue
    }
    if (res.status === 'resolved') {
      if (res.partyType === 'partner' && (res.canonicalName === 'Yossi' || res.canonicalName === 'Jacob')) {
        directory.set(key, { role: 'PARTNER', canonical: res.canonicalName, custodian: false })
      } else {
        directory.set(key, { role: 'EXTERNAL', canonical: null, custodian: KNOWN_CUSTODIANS.has(key) })
      }
      continue
    }
    // not_found → omit; approved-alias fallback applies in the pure resolver
  }

  return { directory, sourceUnavailable }
}
