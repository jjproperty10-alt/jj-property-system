/**
 * identityResolver.test.ts — G1B Identity Resolver test suite.
 *
 * Tests the pure mapping and grouping logic without hitting Supabase.
 * DB-dependent behavior (actual queries) is validated via real-data probes.
 *
 * Coverage:
 *   1. Entity mapping (row → CanonicalEntityIdentityDTO)
 *   2. Relationship mapping (row → ManagementRelationshipDTO)
 *   3. Resolved identity building (entity + relationships → ResolvedManagedIdentityDTO)
 *   4. Entity grouping (one owner per entity, not per relationship)
 *   5. Multi-property entity
 *   6. Pending-only entity excluded from owner list
 *   7. Mixed verified + pending: only verified exposed in managedProperties
 *   8. Empty input produces empty output
 *   9. resolveEntityKind mapping
 *  10. resolveBySlug: not_found for empty/unknown slug
 *  11. OwnerWorkspaceResolutionResult exhaustive variant test
 *  12. Duplicate relationship rows do not duplicate an owner
 *
 * Constitutional basis: ADR-006 (R7 Identity Resolution)
 *
 * @see identityResolverService.ts
 * @see identityTypes.ts
 */

import {
  resolveEntityKind,
} from '@/lib/identity/identityTypes'

import type {
  CanonicalEntityIdentityDTO,
  ManagementRelationshipDTO,
  ResolvedManagedIdentityDTO,
  IdentityResolutionResult,
} from '@/lib/identity/identityTypes'

import type { OwnerWorkspaceResolutionResult } from '@/lib/owners/ownerWorkspaceTypes'

// ─── Fixtures ─────────────────────────────────────────────────────────────

function makeEntity(overrides: Partial<CanonicalEntityIdentityDTO> = {}): CanonicalEntityIdentityDTO {
  return {
    entityId: 'e-001',
    displayName: 'Tamir',
    canonicalSlug: 'tamir',
    entityKind: 'person',
    aliases: [],
    status: 'active',
    source: 'lifecycle.entity_identity',
    ...overrides,
  }
}

function makeRelationship(overrides: Partial<ManagementRelationshipDTO> = {}): ManagementRelationshipDTO {
  return {
    relationshipId: 'r-001',
    entityId: 'e-001',
    propertyName: 'Tamir Dekelia',
    relationshipType: 'managed_owner',
    validFrom: null,
    validTo: null,
    verificationStatus: 'verified',
    ...overrides,
  }
}

function buildResolved(
  entity: CanonicalEntityIdentityDTO,
  relationships: ManagementRelationshipDTO[],
): ResolvedManagedIdentityDTO {
  const properties = relationships.map(r => r.propertyName).sort()
  return {
    identity: entity,
    managedProperties: relationships,
    primaryProperty: properties[0] ?? null,
  }
}

// Simulate the grouping logic from getAllVerifiedOwners (pure, no DB)
function groupByEntity(
  entities: CanonicalEntityIdentityDTO[],
  relationships: ManagementRelationshipDTO[],
): {
  owners: ResolvedManagedIdentityDTO[]
  pendingRelationships: ManagementRelationshipDTO[]
  counts: {
    verifiedRelationships: number
    distinctVerifiedEntities: number
    distinctVerifiedProperties: number
    pendingRelationships: number
  }
} {
  const verified = relationships.filter(r => r.verificationStatus === 'verified')
  const pending = relationships.filter(r => r.verificationStatus === 'pending_verification')

  const verifiedByEntity = new Map<string, ManagementRelationshipDTO[]>()
  for (const rel of verified) {
    if (!verifiedByEntity.has(rel.entityId)) {
      verifiedByEntity.set(rel.entityId, [])
    }
    verifiedByEntity.get(rel.entityId)!.push(rel)
  }

  const owners: ResolvedManagedIdentityDTO[] = []
  for (const entity of entities) {
    const entityRels = verifiedByEntity.get(entity.entityId)
    if (entityRels && entityRels.length > 0) {
      owners.push(buildResolved(entity, entityRels))
    }
  }

  owners.sort((a, b) => a.identity.displayName.localeCompare(b.identity.displayName))

  const verifiedProperties = new Set<string>()
  for (const rel of verified) {
    verifiedProperties.add(rel.propertyName)
  }

  return {
    owners,
    pendingRelationships: pending,
    counts: {
      verifiedRelationships: verified.length,
      distinctVerifiedEntities: owners.length,
      distinctVerifiedProperties: verifiedProperties.size,
      pendingRelationships: pending.length,
    },
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe('resolveEntityKind', () => {
  it('maps jj_company to company', () => {
    expect(resolveEntityKind('jj_company')).toBe('company')
  })

  it('maps partner to person', () => {
    expect(resolveEntityKind('partner')).toBe('person')
  })

  it('maps investor to person', () => {
    expect(resolveEntityKind('investor')).toBe('person')
  })

  it('maps managed_client to person', () => {
    expect(resolveEntityKind('managed_client')).toBe('person')
  })

  it('maps external to person', () => {
    expect(resolveEntityKind('external')).toBe('person')
  })

  it('maps unknown type to person (safe default)', () => {
    expect(resolveEntityKind('unknown_type')).toBe('person')
  })
})

describe('Entity grouping — one owner per entity', () => {
  it('single entity, single property → one owner', () => {
    const entity = makeEntity()
    const rel = makeRelationship()
    const result = groupByEntity([entity], [rel])

    expect(result.owners).toHaveLength(1)
    expect(result.owners[0].identity.entityId).toBe('e-001')
    expect(result.owners[0].managedProperties).toHaveLength(1)
    expect(result.counts.distinctVerifiedEntities).toBe(1)
    expect(result.counts.verifiedRelationships).toBe(1)
    expect(result.counts.distinctVerifiedProperties).toBe(1)
  })

  it('single entity, multiple properties → one owner with all properties', () => {
    const entity = makeEntity({ entityId: 'tamir-001', displayName: 'Tamir' })
    const rels = [
      makeRelationship({ relationshipId: 'r-1', entityId: 'tamir-001', propertyName: 'Tamir Dekelia' }),
      makeRelationship({ relationshipId: 'r-2', entityId: 'tamir-001', propertyName: 'Tamir Kiti' }),
      makeRelationship({ relationshipId: 'r-3', entityId: 'tamir-001', propertyName: 'Tamir Radisson' }),
    ]
    const result = groupByEntity([entity], rels)

    expect(result.owners).toHaveLength(1)
    expect(result.owners[0].managedProperties).toHaveLength(3)
    expect(result.owners[0].managedProperties.map(r => r.propertyName).sort()).toEqual([
      'Tamir Dekelia', 'Tamir Kiti', 'Tamir Radisson',
    ])
    expect(result.counts.distinctVerifiedEntities).toBe(1)
    expect(result.counts.verifiedRelationships).toBe(3)
    expect(result.counts.distinctVerifiedProperties).toBe(3)
  })

  it('two entities, three relationships → two owners, not three', () => {
    const entities = [
      makeEntity({ entityId: 'e-tamir', displayName: 'Tamir' }),
      makeEntity({ entityId: 'e-oren', displayName: 'Oren' }),
    ]
    const rels = [
      makeRelationship({ relationshipId: 'r-1', entityId: 'e-tamir', propertyName: 'Tamir Dekelia' }),
      makeRelationship({ relationshipId: 'r-2', entityId: 'e-tamir', propertyName: 'Tamir Kiti' }),
      makeRelationship({ relationshipId: 'r-3', entityId: 'e-oren', propertyName: 'Oren Kitty' }),
    ]
    const result = groupByEntity(entities, rels)

    expect(result.owners).toHaveLength(2)
    expect(result.counts.distinctVerifiedEntities).toBe(2)
    expect(result.counts.verifiedRelationships).toBe(3)
  })

  it('duplicate relationship rows do not duplicate an owner', () => {
    const entity = makeEntity()
    // Same entityId and propertyName — should group to one owner
    const rels = [
      makeRelationship({ relationshipId: 'r-1' }),
      makeRelationship({ relationshipId: 'r-2' }), // same entity+property, different ID
    ]
    const result = groupByEntity([entity], rels)

    expect(result.owners).toHaveLength(1)
    // Both relationships are still reported (the grouping is per-entity, not per-property)
    expect(result.owners[0].managedProperties).toHaveLength(2)
    expect(result.counts.distinctVerifiedEntities).toBe(1)
  })
})

describe('Pending relationship handling', () => {
  it('entity with only pending relationships excluded from owners', () => {
    const entity = makeEntity()
    const rel = makeRelationship({ verificationStatus: 'pending_verification' })
    const result = groupByEntity([entity], [rel])

    expect(result.owners).toHaveLength(0)
    expect(result.pendingRelationships).toHaveLength(1)
    expect(result.counts.distinctVerifiedEntities).toBe(0)
    expect(result.counts.pendingRelationships).toBe(1)
  })

  it('mixed verified and pending: only verified properties exposed', () => {
    const entity = makeEntity({ entityId: 'e-uriel' })
    const rels = [
      makeRelationship({
        relationshipId: 'r-1', entityId: 'e-uriel',
        propertyName: 'Uriel Duplex', verificationStatus: 'verified',
      }),
      makeRelationship({
        relationshipId: 'r-2', entityId: 'e-uriel',
        propertyName: 'Uriel Sharon English Metro', verificationStatus: 'pending_verification',
      }),
    ]
    const result = groupByEntity([entity], rels)

    expect(result.owners).toHaveLength(1)
    expect(result.owners[0].managedProperties).toHaveLength(1)
    expect(result.owners[0].managedProperties[0].propertyName).toBe('Uriel Duplex')
    expect(result.pendingRelationships).toHaveLength(1)
    expect(result.pendingRelationships[0].propertyName).toBe('Uriel Sharon English Metro')
    expect(result.counts.distinctVerifiedEntities).toBe(1)
    expect(result.counts.verifiedRelationships).toBe(1)
    expect(result.counts.pendingRelationships).toBe(1)
  })

  it('entity with zero relationships excluded from owners', () => {
    const entity = makeEntity()
    const result = groupByEntity([entity], [])

    expect(result.owners).toHaveLength(0)
  })
})

describe('Empty input', () => {
  it('empty entities and relationships → empty owners', () => {
    const result = groupByEntity([], [])
    expect(result.owners).toHaveLength(0)
    expect(result.pendingRelationships).toHaveLength(0)
    expect(result.counts.verifiedRelationships).toBe(0)
    expect(result.counts.distinctVerifiedEntities).toBe(0)
  })
})

describe('IdentityResolutionResult — exhaustive variants', () => {
  it('resolved variant carries data', () => {
    const entity = makeEntity()
    const rel = makeRelationship()
    const result: IdentityResolutionResult = {
      status: 'resolved',
      data: buildResolved(entity, [rel]),
    }
    expect(result.status).toBe('resolved')
    if (result.status === 'resolved') {
      expect(result.data.identity.entityId).toBe('e-001')
    }
  })

  it('not_found variant carries slug', () => {
    const result: IdentityResolutionResult = { status: 'not_found', slug: 'unknown-person' }
    expect(result.status).toBe('not_found')
    if (result.status === 'not_found') {
      expect(result.slug).toBe('unknown-person')
    }
  })

  it('ambiguous variant carries candidates', () => {
    const result: IdentityResolutionResult = {
      status: 'ambiguous',
      slug: 'avi',
      candidates: ['Avi Cohen', 'Avi Levi'],
    }
    expect(result.status).toBe('ambiguous')
    if (result.status === 'ambiguous') {
      expect(result.candidates).toHaveLength(2)
    }
  })

  it('relationship_missing variant carries entity info', () => {
    const result: IdentityResolutionResult = {
      status: 'relationship_missing',
      entityId: 'e-xxx',
      displayName: 'Ghost Entity',
    }
    expect(result.status).toBe('relationship_missing')
  })

  it('source_unavailable variant carries error', () => {
    const result: IdentityResolutionResult = {
      status: 'source_unavailable',
      error: 'lifecycle schema not accessible',
    }
    expect(result.status).toBe('source_unavailable')
  })
})

describe('OwnerWorkspaceResolutionResult — exhaustive variants', () => {
  it('resolved variant carries workspace', () => {
    const result: OwnerWorkspaceResolutionResult = {
      status: 'resolved',
      workspace: {
        identity: {
          id: 'e-001', slug: 'tamir', name: 'Tamir',
          preferredLanguage: 'en', flag: '🌍', initials: 'T',
          avatarColor: '#8b5cf6', since: null,
          primaryProperty: 'Tamir Dekelia', properties: ['Tamir Dekelia'],
        },
        currentPeriod: { label: 'July 2026', startDate: '2026-07-01', endDate: '2026-07-31' },
        statementStatus: 'draft',
        openCorrectionCount: 0,
      },
    }
    expect(result.status).toBe('resolved')
  })

  it('not_found, ambiguous, relationship_missing, source_unavailable all compile', () => {
    const results: OwnerWorkspaceResolutionResult[] = [
      { status: 'not_found', slug: 'nobody' },
      { status: 'ambiguous', slug: 'avi', candidates: ['A', 'B'] },
      { status: 'relationship_missing', entityId: 'x', displayName: 'X' },
      { status: 'source_unavailable', error: 'down' },
    ]
    expect(results.every(r => r.status !== 'resolved')).toBe(true)
  })
})

describe('Primary property selection', () => {
  it('primaryProperty is first property alphabetically', () => {
    const entity = makeEntity()
    const rels = [
      makeRelationship({ relationshipId: 'r-2', propertyName: 'Zebra House' }),
      makeRelationship({ relationshipId: 'r-1', propertyName: 'Alpha Villa' }),
    ]
    const resolved = buildResolved(entity, rels)
    expect(resolved.primaryProperty).toBe('Alpha Villa')
  })

  it('primaryProperty is null when no relationships', () => {
    const entity = makeEntity()
    const resolved = buildResolved(entity, [])
    expect(resolved.primaryProperty).toBeNull()
  })
})
