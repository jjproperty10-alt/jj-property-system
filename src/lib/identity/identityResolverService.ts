/**
 * Identity Resolver Service — Canonical Identity Resolution
 *
 * Constitutional basis: ADR-006 (R7 Identity Resolution)
 * Approved: Yossi 24 July 2026 — G1B scope
 * Identity switch: H.3 (Agent 3, 15 Aug 2026) — registry.parties is canonical WHO authority
 *
 * This is the ONLY authorized mechanism for resolving business identity
 * and property associations. After G1B, no component may:
 *   - Scan payer/payee to discover owners
 *   - Use hardcoded owner lists (KNOWN_OWNERS)
 *   - Construct identity from transaction data
 *
 * Identity authority model (post H.3 switch):
 *   - WHO: registry.parties (canonical party authority, via enrichIdentityWithParty)
 *   - WHAT: lifecycle.management_relationship (business-state: property associations)
 *   - CONTACT DATA: lifecycle.entity_identity (email, phone, language — fallback source)
 *
 * Query path:
 *   lifecycle.entity_identity (contact data + entity_id bridge)
 *   → enrichIdentityWithParty (resolve_party_id RPC → registry.parties)
 *   → lifecycle.management_relationship (property associations via entity_id)
 *
 * Every owner with an approved bridge emits source='registry.parties' + partyId.
 * Owners without a bridge emit source='lifecycle.entity_identity' (fail-closed, never dropped).
 *
 * Verification model:
 *   - Only 'verified' relationships appear in the Owner Room
 *   - 'pending_verification' relationships are returned separately
 *   - This service never promotes pending → verified (that's a Correction Package)
 *
 * Fail-closed:
 *   - Unknown slug → not_found (no fallback to scanning)
 *   - Duplicate slug → ambiguous (caller must resolve)
 *   - DB unavailable → source_unavailable (no silent empty result)
 *   - Party bridge missing → lifecycle identity preserved (never drop an owner)
 *
 * server-only: must never be imported into Client Components.
 */

import 'server-only'

import { createServiceClient } from '@/lib/supabase'
import { nameToSlug } from '../owners/ownerWorkspaceUtils'
import type {
  CanonicalEntityIdentityDTO,
  ManagementRelationshipDTO,
  ResolvedManagedIdentityDTO,
  IdentityResolutionResult,
} from './identityTypes'
import { resolveEntityKind } from './identityTypes'

// ─────────────────────────────────────────────────────────────
// Supabase client (server-side only)
// ─────────────────────────────────────────────────────────────

function getServiceClient() {
  return createServiceClient()
}

// ─────────────────────────────────────────────────────────────
// DB Row Types (internal — not exported)
// ─────────────────────────────────────────────────────────────

interface EntityRow {
  id: string
  canonical_name: string
  entity_type: string
  aliases: string[] | null
  status: string
  // P1 contact fields
  contact_email: string | null
  contact_phone: string | null
  preferred_language: string | null
  country: string | null
  entity_legal_name: string | null
  internal_notes: string | null
}

interface RelationshipRow {
  id: string
  entity_id: string
  property_name: string
  relationship_type: string
  valid_from: string | null
  valid_to: string | null
  verification_status: string
}

/** PR #4: jj_relationships row (draft entities from wizard) */
interface JJRelationshipRow {
  id: string
  entity_id: string
  relationship_type: string
  status: string
  effective_from: string | null
  effective_to: string | null
  verification_status: string
  notes: string | null
  created_by: string | null
}

// ─────────────────────────────────────────────────────────────
// Row → DTO mappers (pure)
// ─────────────────────────────────────────────────────────────

function mapEntity(row: EntityRow): CanonicalEntityIdentityDTO {
  // Map preferred_language with strict allowlist; invalid values → null
  const rawLang = row.preferred_language
  const validLanguage: 'he' | 'en' | 'ru' | null =
    rawLang === 'he' || rawLang === 'en' || rawLang === 'ru' ? rawLang : null

  return {
    entityId: row.id,
    displayName: row.canonical_name,
    canonicalSlug: nameToSlug(row.canonical_name),
    entityKind: resolveEntityKind(row.entity_type),
    aliases: Object.freeze(row.aliases ?? []),
    status: row.status === 'active' ? 'active' : 'inactive',
    source: 'lifecycle.entity_identity',
    contactEmail: row.contact_email ?? null,
    contactPhone: row.contact_phone ?? null,
    preferredLanguage: validLanguage,
    country: row.country ?? null,
    entityLegalName: row.entity_legal_name ?? null,
    internalNotes: row.internal_notes ?? null,
  }
}

function mapRelationship(row: RelationshipRow): ManagementRelationshipDTO {
  return {
    relationshipId: row.id,
    entityId: row.entity_id,
    propertyName: row.property_name,
    relationshipType: 'managed_owner',
    validFrom: row.valid_from ?? null,
    validTo: row.valid_to ?? null,
    verificationStatus:
      row.verification_status === 'verified' ? 'verified' : 'pending_verification',
  }
}

/**
 * H.3 canonical party enrichment.
 * Re-sources WHO to the canonical registry party using the existing bridge
 * public.resolve_party_id (lifecycle entity_identity → registry.parties). Reused, not duplicated.
 *
 * Fail-closed: if the party is not resolved/approved, the lifecycle identity is returned
 * unchanged — an owner is NEVER dropped. displayName/canonicalSlug are preserved (party
 * canonical_name == lifecycle canonical_name for all current owners, verified 2026-08-15),
 * so existing Owner Room URLs stay byte-stable. Relationships remain lifecycle-sourced.
 */
async function enrichIdentityWithParty(
  sb: ReturnType<typeof createServiceClient>,
  identity: CanonicalEntityIdentityDTO,
): Promise<CanonicalEntityIdentityDTO> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb as any).rpc('resolve_party_id', {
      p_entity_identity_id: identity.entityId,
    })
    if (error) throw error
    const row = (Array.isArray(data) ? data[0] : data) as
      | { canonical_id: string | null; mapping_status: string | null }
      | undefined
    if (!row || row.mapping_status !== 'approved' || !row.canonical_id) {
      return identity // fail-closed: keep lifecycle identity, never drop an owner
    }
    return {
      ...identity,
      source: 'registry.parties',
      partyId: row.canonical_id,
      legacySource: 'lifecycle.entity_identity',
    }
  } catch (err) {
    console.error('[identityResolver] resolve_party_id enrichment failed:', err)
    return identity // fail-closed
  }
}

function buildResolved(
  entity: CanonicalEntityIdentityDTO,
  relationships: readonly ManagementRelationshipDTO[],
): ResolvedManagedIdentityDTO {
  const properties = relationships
    .map(r => r.propertyName)
    .sort()
  return {
    identity: entity,
    managedProperties: relationships,
    primaryProperty: properties[0] ?? null,
  }
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

/**
 * PR #4: Draft owner — entity created via wizard but not yet verified.
 * Reads from jj_relationships (NOT management_relationship).
 * Separate from verified owners — never contaminates verified semantics.
 */
export interface DraftOwnerDTO {
  readonly identity: CanonicalEntityIdentityDTO
  readonly relationshipType: string
  readonly relationshipStatus: string
  readonly effectiveFrom: string | null
  readonly createdBy: string | null
}

/**
 * Get all entities with at least one VERIFIED management relationship,
 * plus draft entities from jj_relationships (PR #4 wizard).
 *
 * Returns: verified owners + pending relationships + draft owners.
 * Draft owners are NEVER mixed into verified owners.
 */
export async function getAllVerifiedOwners(): Promise<{
  owners: readonly ResolvedManagedIdentityDTO[]
  pendingRelationships: readonly ManagementRelationshipDTO[]
  draftOwners: readonly DraftOwnerDTO[]
  counts: {
    verifiedRelationships: number
    distinctVerifiedEntities: number
    distinctVerifiedProperties: number
    pendingRelationships: number
    draftOwners: number
  }
}> {
  // Fail-closed: if client creation throws, return empty — never propagate exception
  let sb: ReturnType<typeof createServiceClient>
  try {
    sb = getServiceClient()
  } catch (err) {
    console.error('[identityResolver] createServiceClient failed:', err)
    return { owners: [], pendingRelationships: [], draftOwners: [], counts: { verifiedRelationships: 0, distinctVerifiedEntities: 0, distinctVerifiedProperties: 0, pendingRelationships: 0, draftOwners: 0 } }
  }

  // Fetch all active entities
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let entityRows: EntityRow[] = []
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb as any)
      .schema('lifecycle')
      .from('entity_identity')
      .select('id, canonical_name, entity_type, aliases, status, contact_email, contact_phone, preferred_language, country, entity_legal_name, internal_notes')
      .eq('status', 'active')
    if (error) throw error
    entityRows = (data ?? []) as EntityRow[]
  } catch (err) {
    // Source unavailable — return empty (fail-closed: no fallback to scanning)
    console.error('[identityResolver] entity_identity query failed:', err)
    return { owners: [], pendingRelationships: [], draftOwners: [], counts: { verifiedRelationships: 0, distinctVerifiedEntities: 0, distinctVerifiedProperties: 0, pendingRelationships: 0, draftOwners: 0 } }
  }

  // Fetch all active management relationships
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let relRows: RelationshipRow[] = []
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb as any)
      .schema('lifecycle')
      .from('management_relationship')
      .select('id, entity_id, property_name, relationship_type, valid_from, valid_to, verification_status')
      .is('valid_to', null) // only active (ongoing) relationships
    if (error) throw error
    relRows = (data ?? []) as RelationshipRow[]
  } catch (err) {
    console.error('[identityResolver] management_relationship query failed:', err)
    return { owners: [], pendingRelationships: [], draftOwners: [], counts: { verifiedRelationships: 0, distinctVerifiedEntities: 0, distinctVerifiedProperties: 0, pendingRelationships: 0, draftOwners: 0 } }
  }

  // Map rows to DTOs
  const entities = entityRows.map(mapEntity)
  const relationships = relRows.map(mapRelationship)

  // Partition relationships by verification status
  const verified = relationships.filter(r => r.verificationStatus === 'verified')
  const pending = relationships.filter(r => r.verificationStatus === 'pending_verification')

  // Group verified relationships by entity
  const verifiedByEntity = new Map<string, ManagementRelationshipDTO[]>()
  for (const rel of verified) {
    if (!verifiedByEntity.has(rel.entityId)) {
      verifiedByEntity.set(rel.entityId, [])
    }
    verifiedByEntity.get(rel.entityId)!.push(rel)
  }

  // Build resolved owners — only those with at least one verified relationship
  const owners: ResolvedManagedIdentityDTO[] = []
  for (const entity of entities) {
    const entityRels = verifiedByEntity.get(entity.entityId)
    if (entityRels && entityRels.length > 0) {
      owners.push(buildResolved(entity, entityRels))
    }
  }

  // Sort owners alphabetically by display name
  owners.sort((a, b) => a.identity.displayName.localeCompare(b.identity.displayName))

  // Compute distinct verified properties
  const verifiedProperties = new Set<string>()
  for (const rel of verified) {
    verifiedProperties.add(rel.propertyName)
  }

  // ── PR #4: Draft owners from jj_relationships ──
  // Separate query path — NEVER contaminates verified owners.
  // Only entities that have a jj_relationships row but are NOT already
  // in the verified owners list are included as drafts.
  const verifiedEntityIds = new Set(owners.map(o => o.identity.entityId))
  let draftOwners: DraftOwnerDTO[] = []

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: jjRelData, error: jjRelError } = await (sb as any)
      .schema('lifecycle')
      .from('jj_relationships')
      .select('id, entity_id, relationship_type, status, effective_from, effective_to, verification_status, notes, created_by')
      .in('status', ['draft', 'active'])
    if (jjRelError) throw jjRelError

    const jjRelRows = (jjRelData ?? []) as JJRelationshipRow[]

    // Group by entity_id, pick the first relationship per entity
    const draftEntityMap = new Map<string, JJRelationshipRow>()
    for (const row of jjRelRows) {
      if (!verifiedEntityIds.has(row.entity_id) && !draftEntityMap.has(row.entity_id)) {
        draftEntityMap.set(row.entity_id, row)
      }
    }

    // Map to DraftOwnerDTO
    for (const [entityId, rel] of Array.from(draftEntityMap.entries())) {
      const entity = entities.find(e => e.entityId === entityId)
      if (entity) {
        draftOwners.push({
          identity: entity,
          relationshipType: rel.relationship_type,
          relationshipStatus: rel.status,
          effectiveFrom: rel.effective_from ?? null,
          createdBy: rel.created_by ?? null,
        })
      }
    }

    draftOwners.sort((a, b) => a.identity.displayName.localeCompare(b.identity.displayName))
  } catch (err) {
    // Non-fatal: draft owners are optional — verified owners still work
    console.error('[identityResolver] jj_relationships query failed:', err)
    draftOwners = []
  }

  // H.3: enrich WHO with canonical registry party (relationships preserved, fail-closed).
  // Preserves owner set/order/slug — only adds partyId + source='registry.parties'.
  const enrichedOwners = await Promise.all(
    owners.map(async (o) => ({ ...o, identity: await enrichIdentityWithParty(sb, o.identity) })),
  )

  return {
    owners: Object.freeze(enrichedOwners),
    pendingRelationships: Object.freeze(pending),
    draftOwners: Object.freeze(draftOwners),
    counts: {
      verifiedRelationships: verified.length,
      distinctVerifiedEntities: owners.length,
      distinctVerifiedProperties: verifiedProperties.size,
      pendingRelationships: pending.length,
      draftOwners: draftOwners.length,
    },
  }
}

/**
 * Resolve a single owner by URL slug.
 * Fail-closed: returns typed result, never falls back to scanning.
 *
 * Resolution includes both verified AND pending relationships
 * (the workspace should show all managed properties, marking pending ones).
 */
export async function resolveBySlug(slug: string): Promise<IdentityResolutionResult> {
  if (!slug || slug.trim().length === 0) {
    return { status: 'not_found', slug: slug ?? '' }
  }

  // Fail-closed: if client creation throws, return source_unavailable — never propagate exception
  let sb: ReturnType<typeof createServiceClient>
  try {
    sb = getServiceClient()
  } catch (err) {
    return {
      status: 'source_unavailable',
      error: `createServiceClient failed: ${String(err)}`,
    }
  }

  // Fetch all active entities
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let entityRows: EntityRow[] = []
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb as any)
      .schema('lifecycle')
      .from('entity_identity')
      .select('id, canonical_name, entity_type, aliases, status, contact_email, contact_phone, preferred_language, country, entity_legal_name, internal_notes')
      .eq('status', 'active')
    if (error) throw error
    entityRows = (data ?? []) as EntityRow[]
  } catch (err) {
    return {
      status: 'source_unavailable',
      error: `lifecycle.entity_identity query failed: ${String(err)}`,
    }
  }

  // Find entity(ies) matching this slug
  const candidates = entityRows.filter(e => nameToSlug(e.canonical_name) === slug)

  if (candidates.length === 0) {
    return { status: 'not_found', slug }
  }

  if (candidates.length > 1) {
    return {
      status: 'ambiguous',
      slug,
      candidates: Object.freeze(candidates.map(c => c.canonical_name)),
    }
  }

  const entityRow = candidates[0]
  const entity = mapEntity(entityRow)

  // Fetch relationships for this entity
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let relRows: RelationshipRow[] = []
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb as any)
      .schema('lifecycle')
      .from('management_relationship')
      .select('id, entity_id, property_name, relationship_type, valid_from, valid_to, verification_status')
      .eq('entity_id', entityRow.id)
      .is('valid_to', null) // active only
    if (error) throw error
    relRows = (data ?? []) as RelationshipRow[]
  } catch (err) {
    return {
      status: 'source_unavailable',
      error: `management_relationship query failed: ${String(err)}`,
    }
  }

  if (relRows.length === 0) {
    return {
      status: 'relationship_missing',
      entityId: entity.entityId,
      displayName: entity.displayName,
    }
  }

  const relationships = relRows.map(mapRelationship)
  // H.3: enrich WHO with canonical registry party (fail-closed; slug/displayName preserved).
  const enrichedEntity = await enrichIdentityWithParty(sb, entity)
  return {
    status: 'resolved',
    data: buildResolved(enrichedEntity, relationships),
  }
}
