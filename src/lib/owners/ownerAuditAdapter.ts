/**
 * ownerAuditAdapter — Identity-resolved audit data access for Owner Workspace.
 *
 * Architecture: slug → identityResolverService → entity_identity.id
 *               → resolve_party_id RPC → party_id → scoped queries
 *
 * Resolution chain:
 *   1. Resolve slug → entity_identity via identityResolverService (G1 canonical)
 *   2. Look up entity_identity.id in external_identities (bridge)
 *   3. Use party_id for owner-scoped snapshot queries
 *   4. Evidence: NOT queried — evidence_links.entity_id is freeform text, unsafe for authorization
 *
 * Fail-closed: every failure mode returns a named AuditResolutionResult status.
 * Empty arrays are valid ONLY when status='resolved'.
 *
 * Gate A–E investigation (2 Aug 2026):
 *   - Bug #1 fixed: no longer passes slug as entity_id
 *   - Bug #2 fixed: snapshots filtered by owner_party_id
 *   - Bug #3 fixed: errors are explicit, never caught → empty
 *
 * G3 boundary rules:
 *   - G3-17: this adapter is NOT imported by ownerWorkspaceService directly
 *            (ownerWorkspaceService calls resolveOwnerAudit which delegates here)
 *   - G3-18: no adapter-to-adapter imports
 *
 * server-only: must never be imported into Client Components.
 */

import 'server-only'

import { createServiceClient } from '@/lib/supabase'
import { resolveBySlug } from '@/lib/identity/identityResolverService'
import type {
  AuditResolutionResult,
  OwnerAuditDTO,
  StatementVersionDTO,
} from './ownerWorkspaceTypes'

// ─── Constants ────────────────────────────────────────────────────────────────

const JJ_COMPANY_ID = '10f6e9b3-c5b9-4d95-a318-48f20f89477f'

// ─── Bridge query types ──────────────────────────────────────────────────────

interface ExternalIdentityRow {
  canonical_id: string
  mapping_status: string
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Resolve audit data for an owner slug.
 *
 * Returns AuditResolutionResult — a discriminated union. The caller MUST
 * switch on .status before accessing .data.
 */
export async function resolveOwnerAudit(slug: string): Promise<AuditResolutionResult> {
  // ── Step 1: Resolve identity (reuse G1 canonical service) ────────────────
  const identity = await resolveBySlug(slug)

  if (identity.status === 'not_found') {
    return { status: 'entity_not_found', slug }
  }
  if (identity.status === 'ambiguous') {
    return {
      status: 'ambiguous_identity',
      slug,
      candidates: identity.candidates,
    }
  }
  if (identity.status === 'source_unavailable') {
    return {
      status: 'source_unavailable',
      error: identity.error,
      failedSource: 'identity_resolver',
    }
  }
  if (identity.status === 'relationship_missing') {
    // Entity exists but has no management relationship — still valid for audit
    // We need entity_identity.id, which we can get from the identity result
    // relationship_missing means the entity exists, so we proceed with bridge lookup
    // But we don't have the data field. We need to resolve directly.
    // Fall through: the identity resolver returns relationship_missing when
    // entity exists but has no management_relationship. For audit purposes
    // we still need the entity_identity row to bridge to party.
    // Re-query entity_identity directly for this case.
  }

  // For 'resolved' and 'relationship_missing', we need the entity_identity.id
  let entityIdentityId: string
  let canonicalName: string

  if (identity.status === 'resolved') {
    entityIdentityId = identity.data.identity.entityId
    canonicalName = identity.data.identity.displayName
  } else {
    // relationship_missing — re-resolve entity_identity directly
    entityIdentityId = identity.entityId
    canonicalName = identity.displayName
  }

  // ── Step 2: Bridge to registry.parties via RPC ──────────────────────────
  // Uses public.resolve_party_id() — SECURITY DEFINER RPC that reads
  // registry.external_identities internally. Avoids exposing the registry
  // schema to PostgREST. Grants: postgres + service_role only.
  let sb
  try {
    sb = createServiceClient()
  } catch (err) {
    return {
      status: 'source_unavailable',
      error: `createServiceClient failed: ${err instanceof Error ? err.message : String(err)}`,
      failedSource: 'party_bridge',
    }
  }

  let bridgeRows: ExternalIdentityRow[]
  try {
    const { data, error } = await sb.rpc('resolve_party_id', {
      p_entity_identity_id: entityIdentityId,
      p_company_id: JJ_COMPANY_ID,
    })

    if (error) throw error
    bridgeRows = (data ?? []) as ExternalIdentityRow[]
  } catch (err) {
    return {
      status: 'source_unavailable',
      error: `resolve_party_id RPC failed: ${err instanceof Error ? err.message : String(err)}`,
      failedSource: 'party_bridge',
    }
  }

  if (bridgeRows.length === 0) {
    return {
      status: 'party_bridge_missing',
      entityIdentityId,
      canonicalName,
    }
  }

  if (bridgeRows.length > 1) {
    return {
      status: 'ambiguous_party_mapping',
      entityIdentityId,
      canonicalName,
      candidatePartyIds: Object.freeze(bridgeRows.map(r => r.canonical_id)),
    }
  }

  const partyId = bridgeRows[0].canonical_id

  // ── Step 3: Query audit data with proper scoping ─────────────────────────

  // 3a. Evidence links — NOT QUERIED in this PR.
  // Gate C proved: evidence_links.entity_id stores freeform names ('Jacob'), not UUIDs.
  // Querying by canonical_name would use name as an authorization key — not approved.
  // Evidence source contract is 'unsupported' until a UUID-based entity_id column exists.
  // The evidenceItems array is empty with explicit 'unsupported' marker in resolution,
  // distinguishing this from "queried and found nothing" (P-ARCH-1).

  // 3b. Statement snapshots — scoped by owner_party_id (fixes Bug #2)
  let statementVersions: StatementVersionDTO[] = []
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb as any)
      .schema('statements')
      .from('sent_statement_snapshots')
      .select('*')
      .eq('owner_party_id', partyId)
      .order('version', { ascending: false })
      .limit(20)

    if (error) throw error

    statementVersions = ((data ?? []) as Record<string, unknown>[]).map(s => ({
      id: String(s.id),
      version: Number(s.version ?? 1),
      period: String(s.period_label ?? ''),
      sentAt: s.sent_at ? String(s.sent_at) : null,
      status: 'sent' as const,
      channel: s.delivery_channel ? String(s.delivery_channel) : null,
      replacedBy: null,
      replacedFrom: null,
    }))
  } catch (err) {
    return {
      status: 'source_unavailable',
      error: `sent_statement_snapshots query failed: ${err instanceof Error ? err.message : String(err)}`,
      failedSource: 'statements_schema',
    }
  }

  // ── Step 4: Return resolved result ───────────────────────────────────────

  const dto: OwnerAuditDTO = {
    evidenceItems: [],  // Empty — evidence source contract unsupported (see resolution marker)
    statementVersions,
    correctionCases: [],
    decisionHistory: [],
    verificationHistory: [],
  }

  return {
    status: 'resolved',
    data: dto,
    resolution: {
      entityIdentityId,
      partyId,
      snapshotOwnerId: partyId,
      evidenceSourceContract: 'unsupported',
    },
  }
}
