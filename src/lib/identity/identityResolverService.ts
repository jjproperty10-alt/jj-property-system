/**
 * Identity Resolver Service — G1B Canonical Identity Resolution
 *
 * Constitutional basis: ADR-006 (R7 Identity Resolution)
 * Approved: Yossi 24 July 2026 — G1B scope
 *
 * This is the ONLY authorized mechanism for resolving business identity
 * and property associations. After G1B, no component may:
 *   - Scan payer/payee to discover owners
 *   - Use hardcoded owner lists (KNOWN_OWNERS)
 *   - Construct identity from transaction data
 *
 * Data sources:
 *   - lifecycle.entity_identity (WHO)
 *   - lifecycle.management_relationship (WHAT JJ manages for them)
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
// DB Row Types (internal — not exported)
// ─────────────────────────────────────────────────────────────

interface EntityRow {
  id: string
  canonical_name: string
  entity_type: string
  aliases: string[] | null
  status: string
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

// ─────────────────────────────────────────────────────────────
// Row → DTO mappers (pure)
// ─────────────────────────────────────────────────────────────

function mapEntity(row: EntityRow): CanonicalEntityIdentityDTO {
  return {
    entityId: row.id,
    displayName: row.canonical_name,
    canonicalSlug: nameToSlug(row.canonical_name),
    entityKind: resolveEntityKind(row.entity_type),
    aliases: Object.freeze(row.aliases ?? []),
    status: row.status === 'active' ? 'active' : 'inactive',
    source: 'lifecycle.entity_identity',
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
 * Get all entities with at least one VERIFIED management relationship.
 * This is the canonical source for the Owners Room listing.
 *
 * Returns: verified owners + separate list of pending relationships.
 * Never returns entities whose only relationships are pending.
 */
export async function getAllVerifiedOwners(): Promise<{
  owners: readonly ResolvedManagedIdentityDTO[]
  pendingRelationships: readonly ManagementRelationshipDTO[]
  counts: {
    verifiedRelationships: number
    distinctVerifiedEntities: number
    distinctVerifiedProperties: number
    pendingRelationships: number
  }
}> {
  const emptyResult = { owners: [], pendingRelationships: [], counts: { verifiedRelationships: 0, distinctVerifiedEntities: 0, distinctVerifiedProperties: 0, pendingRelationships: 0 } }

  // SSR resilience: createServiceClient can throw if env vars are missing
  let sb
  try {
    sb = createServiceClient()
  } catch (err) {
    console.error('[identityResolver] createServiceClient failed:', err instanceof Error ? err.message : String(err))
    return emptyResult
  }

  // Fetch all active entities
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let entityRows: EntityRow[] = []
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb as any)
      .schema('lifecycle')
      .from('entity_identity')
      .select('id, canonical_name, entity_type, aliases, status')
      .eq('status', 'active')
    if (error) throw error
    entityRows = (data ?? []) as EntityRow[]
  } catch (err) {
    // Source unavailable — return empty (fail-closed: no fallback to scanning)
    console.error('[identityResolver] entity_identity query failed:', err)
    return emptyResult
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
    return emptyResult
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

  return {
    owners: Object.freeze(owners),
    pendingRelationships: Object.freeze(pending),
    counts: {
      verifiedRelationships: verified.length,
      distinctVerifiedEntities: owners.length,
      distinctVerifiedProperties: verifiedProperties.size,
      pendingRelationships: pending.length,
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

  // SSR resilience: createServiceClient can throw if env vars are missing
  let sb
  try {
    sb = createServiceClient()
  } catch (err) {
    return {
      status: 'source_unavailable',
      error: `createServiceClient failed: ${err instanceof Error ? err.message : String(err)}`,
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
      .select('id, canonical_name, entity_type, aliases, status')
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
  return {
    status: 'resolved',
    data: buildResolved(entity, relationships),
  }
}
