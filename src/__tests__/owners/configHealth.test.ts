/**
 * Configuration Health — computeConfigHealth + deduplicatePropertyNames
 *
 * PR #3 P1 Enhancement. Tests Yossi-approved 4-state rules:
 * 1. pending_verification present → Pending Verification
 * 2. missing name/contact/active association → Incomplete
 * 3. universal pass but P0 completeness unproven → Needs Review
 * 4. Complete only if all P0 requirements provable (unreachable in PR #3)
 */

import { computeConfigHealth, deduplicatePropertyNames } from '@/lib/owners/ownerWorkspaceUtils'
import type { CanonicalEntityIdentityDTO, ManagementRelationshipDTO } from '@/lib/identity/identityTypes'

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function makeIdentity(overrides: Partial<CanonicalEntityIdentityDTO> = {}): CanonicalEntityIdentityDTO {
  return {
    entityId: 'test-uuid',
    displayName: 'Avi Cohen',
    canonicalSlug: 'avi-cohen',
    entityKind: 'person',
    aliases: [],
    status: 'active',
    source: 'lifecycle.entity_identity',
    contactEmail: 'avi@example.com',
    contactPhone: null,
    preferredLanguage: 'he',
    country: 'IL',
    entityLegalName: null,
    internalNotes: null,
    ...overrides,
  }
}

function makeRelationship(overrides: Partial<ManagementRelationshipDTO> = {}): ManagementRelationshipDTO {
  return {
    relationshipId: 'rel-uuid',
    entityId: 'test-uuid',
    propertyName: 'Villa Mazotos',
    relationshipType: 'managed_owner',
    validFrom: '2024-01-01',
    validTo: null, // currently active
    verificationStatus: 'verified',
    ...overrides,
  }
}

// ─────────────────────────────────────────────────────────────
// computeConfigHealth
// ─────────────────────────────────────────────────────────────

describe('computeConfigHealth', () => {
  describe('Incomplete — missing universal requirements', () => {
    it('returns incomplete when name is missing', () => {
      const identity = makeIdentity({ displayName: '' })
      const result = computeConfigHealth(identity, [makeRelationship()])
      expect(result.state).toBe('incomplete')
      expect(result.missingCount).toBeGreaterThan(0)
    })

    it('returns incomplete when both email and phone are missing', () => {
      const identity = makeIdentity({ contactEmail: null, contactPhone: null })
      const result = computeConfigHealth(identity, [makeRelationship()])
      expect(result.state).toBe('incomplete')
      expect(result.label).toContain('missing')
    })

    it('returns incomplete when no active relationship exists', () => {
      const identity = makeIdentity()
      const expiredRel = makeRelationship({ validTo: '2025-01-01' })
      const result = computeConfigHealth(identity, [expiredRel])
      expect(result.state).toBe('incomplete')
    })

    it('returns incomplete when no relationships at all', () => {
      const identity = makeIdentity()
      const result = computeConfigHealth(identity, [])
      expect(result.state).toBe('incomplete')
    })

    it('counts multiple missing items', () => {
      const identity = makeIdentity({ displayName: '', contactEmail: null, contactPhone: null })
      const result = computeConfigHealth(identity, [])
      expect(result.state).toBe('incomplete')
      expect(result.missingCount).toBe(3) // name, contact, active relationship
    })
  })

  describe('Pending Verification — unverified relationships', () => {
    it('returns pending_verification when relationship has pending status', () => {
      const identity = makeIdentity()
      const rel = makeRelationship({ verificationStatus: 'pending_verification' })
      const result = computeConfigHealth(identity, [rel])
      expect(result.state).toBe('pending_verification')
      expect(result.missingCount).toBe(0)
    })

    it('returns pending_verification even with multiple relationships if one is pending', () => {
      const identity = makeIdentity()
      const rels = [
        makeRelationship({ propertyName: 'A', verificationStatus: 'verified' }),
        makeRelationship({ propertyName: 'B', verificationStatus: 'pending_verification' }),
      ]
      const result = computeConfigHealth(identity, rels)
      expect(result.state).toBe('pending_verification')
    })
  })

  describe('Needs Review — universal pass but full P0 unproven', () => {
    it('returns needs_review when all universal checks pass with email', () => {
      const identity = makeIdentity({ contactEmail: 'a@b.com', contactPhone: null })
      const result = computeConfigHealth(identity, [makeRelationship()])
      expect(result.state).toBe('needs_review')
      expect(result.missingCount).toBe(0)
      expect(result.label).toBe('Needs review')
    })

    it('returns needs_review when all universal checks pass with phone only', () => {
      const identity = makeIdentity({ contactEmail: null, contactPhone: '+35712345' })
      const result = computeConfigHealth(identity, [makeRelationship()])
      expect(result.state).toBe('needs_review')
    })

    it('returns needs_review when all universal checks pass with both contact methods', () => {
      const identity = makeIdentity({ contactEmail: 'a@b.com', contactPhone: '+35712345' })
      const result = computeConfigHealth(identity, [makeRelationship()])
      expect(result.state).toBe('needs_review')
    })
  })

  describe('Priority ordering — incomplete before pending_verification', () => {
    it('incomplete takes priority over pending_verification', () => {
      // Missing contact + pending verification — incomplete wins
      const identity = makeIdentity({ contactEmail: null, contactPhone: null })
      const rel = makeRelationship({ verificationStatus: 'pending_verification' })
      const result = computeConfigHealth(identity, [rel])
      expect(result.state).toBe('incomplete')
    })
  })

  describe('Edge cases', () => {
    it('treats whitespace-only name as missing', () => {
      const identity = makeIdentity({ displayName: '   ' })
      const result = computeConfigHealth(identity, [makeRelationship()])
      expect(result.state).toBe('incomplete')
    })

    it('treats whitespace-only email as missing', () => {
      const identity = makeIdentity({ contactEmail: '  ', contactPhone: null })
      const result = computeConfigHealth(identity, [makeRelationship()])
      expect(result.state).toBe('incomplete')
    })

    it('ignores expired relationships for active check', () => {
      const identity = makeIdentity()
      const rels = [
        makeRelationship({ validTo: '2020-01-01', verificationStatus: 'verified' }),
        makeRelationship({ validTo: '2021-01-01', verificationStatus: 'verified' }),
      ]
      const result = computeConfigHealth(identity, rels)
      expect(result.state).toBe('incomplete') // no active relationship
    })
  })
})

// ─────────────────────────────────────────────────────────────
// deduplicatePropertyNames
// ─────────────────────────────────────────────────────────────

describe('deduplicatePropertyNames', () => {
  it('returns unique property names', () => {
    const rels = [
      makeRelationship({ propertyName: 'Villa Mazotos' }),
      makeRelationship({ propertyName: 'Villa Mazotos' }),
      makeRelationship({ propertyName: 'Tamir Dekelia' }),
    ]
    const result = deduplicatePropertyNames(rels)
    expect(result).toEqual(['Villa Mazotos', 'Tamir Dekelia'])
  })

  it('deduplicates case-insensitively', () => {
    const rels = [
      makeRelationship({ propertyName: 'Villa Mazotos' }),
      makeRelationship({ propertyName: 'villa mazotos' }),
    ]
    const result = deduplicatePropertyNames(rels)
    expect(result).toHaveLength(1)
    expect(result[0]).toBe('Villa Mazotos') // preserves first occurrence
  })

  it('returns empty array for empty input', () => {
    expect(deduplicatePropertyNames([])).toEqual([])
  })

  it('handles single property', () => {
    const rels = [makeRelationship({ propertyName: 'Test' })]
    expect(deduplicatePropertyNames(rels)).toEqual(['Test'])
  })

  it('trims whitespace for dedup comparison', () => {
    const rels = [
      makeRelationship({ propertyName: 'Villa Mazotos' }),
      makeRelationship({ propertyName: ' Villa Mazotos ' }),
    ]
    const result = deduplicatePropertyNames(rels)
    expect(result).toHaveLength(1)
  })
})
