/**
 * @module partner-settlement/adapters/ownerScopeReader
 * @description READ-ONLY external-owner reader for the Stage 2.2 scope guard.
 *
 * Returns the set of property names that have an active external OWNER in
 * contact_properties. An external owner is a definition conflict ONLY for
 * conflict-eligible rows — jj / jj_company (an internal/JJ property that actually has an
 * external owner is really a client, e.g. Yogev Port). `partnership` is NOT a conflict:
 * a partnership legitimately has external co-owners (Villa Mazotos: Avi 50%; Villa
 * Mazotos 2: Oren 35%). The relationship-aware decision lives in scope.ts
 * (computeScopeConflicts over per-row groups); this adapter only supplies the owner set.
 *
 * READ-ONLY: only .select(). Returns null on source failure so the caller can fail
 * closed with an OWNER_SOURCE_UNAVAILABLE blocker.
 */

import 'server-only'
import { createServiceClient } from '@/lib/supabase'

export async function readExternalOwnerPropertyNames(): Promise<Set<string> | null> {
  const db = createServiceClient()
  const { data, error } = await db
    .from('contact_properties')
    .select('property_name, relationship_role, is_deleted')
  if (error || data == null) return null

  const out = new Set<string>()
  for (const r of (data as { property_name: string | null; relationship_role: string | null; is_deleted: boolean | null }[])) {
    if (r.is_deleted === true) continue
    if ((r.relationship_role ?? '').trim().toLowerCase() !== 'owner') continue
    const name = (r.property_name ?? '').trim().toLowerCase()
    if (name) out.add(name)
  }
  return out
}
