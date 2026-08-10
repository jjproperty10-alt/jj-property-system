/**
 * duplicateDetection.test.ts — P1 Duplicate Detection Service
 *
 * Tests the three-tier collision model (SOFT / STRONG / HARD)
 * and language/country precedence logic.
 *
 * All tests are pure — no DB access, no side effects.
 *
 * Coverage:
 *   1. STRONG — exact name match (case-insensitive). Name alone is never HARD.
 *   2. STRONG — slug collision (different name, same slug)
 *   3. STRONG — candidate matches existing alias
 *   4. SOFT — similar names (prefix, shared first name)
 *   5. SOFT — candidate similar to alias
 *   6. No match — completely different name
 *   7. Multiple matches — sorted by tier severity
 *   8. Empty entity list → no matches
 *   9. normalizeName — diacritics, whitespace, case
 *  10. isSoftMatch — prefix detection
 *  11. blocked is NEVER true (HARD requires entity_id — not available in this API)
 *  12. Language precedence — canonical overrides heuristic
 *  13. Language precedence — null canonical falls back to heuristic
 *  14. Language precedence — invalid DB value treated as null
 *  15. Country precedence — canonical country overrides heuristic flag
 *  16. Unknown country code → neutral flag (never heuristic)
 *
 * Constitutional basis: P-ARCH-1, ADR-006 (R7)
 */

import {
  detectDuplicates,
  normalizeName,
  isSoftMatch,
} from '@/lib/identity/duplicateDetectionService'
import type { CanonicalEntityIdentityDTO } from '@/lib/identity/identityTypes'
import { buildOwnerIdentity, detectOwnerLanguage, countryToFlag } from '@/lib/owners/ownerWorkspaceUtils'

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
    contactEmail: null,
    contactPhone: null,
    preferredLanguage: null,
    country: null,
    entityLegalName: null,
    internalNotes: null,
    ...overrides,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe('normalizeName', () => {
  it('lowercases and trims', () => {
    expect(normalizeName('  Tamir  ')).toBe('tamir')
  })

  it('collapses whitespace', () => {
    expect(normalizeName('Liron   &   Alon')).toBe('liron & alon')
  })

  it('strips diacritics', () => {
    expect(normalizeName('José García')).toBe('jose garcia')
  })

  it('handles empty string', () => {
    expect(normalizeName('')).toBe('')
  })
})

describe('isSoftMatch', () => {
  it('exact normalized match → true', () => {
    expect(isSoftMatch('Tamir', 'tamir')).toBe(true)
  })

  it('prefix match → true', () => {
    expect(isSoftMatch('Avi', 'Avi Cohen')).toBe(true)
    expect(isSoftMatch('Avi Cohen', 'Avi')).toBe(true)
  })

  it('same first name, different last → true', () => {
    expect(isSoftMatch('Avi Cohen', 'Avi Levi')).toBe(true)
  })

  it('completely different names → false', () => {
    expect(isSoftMatch('Tamir', 'Oren')).toBe(false)
  })

  it('partial overlap not at start → false', () => {
    expect(isSoftMatch('Dekelia', 'Tamir Dekelia')).toBe(false)
  })
})

describe('detectDuplicates — exact name match → STRONG (never HARD)', () => {
  it('exact name match (case-insensitive) → STRONG, not blocked', () => {
    const existing = [makeEntity({ displayName: 'Tamir' })]
    const result = detectDuplicates('tamir', existing)

    expect(result.hasMatches).toBe(true)
    expect(result.highestTier).toBe('strong')
    expect(result.blocked).toBe(false)
    expect(result.matches).toHaveLength(1)
    expect(result.matches[0].tier).toBe('strong')
  })

  it('name with different casing and whitespace → STRONG, not blocked', () => {
    const existing = [makeEntity({ displayName: 'Liron & Alon' })]
    const result = detectDuplicates('liron & alon', existing)

    expect(result.highestTier).toBe('strong')
    expect(result.blocked).toBe(false)
  })

  it('name-only detection can NEVER produce blocked=true', () => {
    // HARD requires entity_id or verified legal identifier — not available in this API.
    // This test proves the constitutional rule: no name input can block creation.
    const existing = [
      makeEntity({ displayName: 'Tamir' }),
      makeEntity({ entityId: 'e-002', displayName: 'Avi', canonicalSlug: 'avi', aliases: ['Avi Cohen'] }),
    ]
    const result = detectDuplicates('Tamir', existing)
    expect(result.blocked).toBe(false)

    const result2 = detectDuplicates('Avi Cohen', existing)
    expect(result2.blocked).toBe(false)

    const result3 = detectDuplicates('Completely New', existing)
    expect(result3.blocked).toBe(false)
  })
})

describe('detectDuplicates — STRONG tier', () => {
  it('different name but same slug → STRONG', () => {
    // "Avi-Cohen" and "Avi Cohen" produce same slug "avi-cohen"
    const existing = [makeEntity({
      displayName: 'Avi Cohen',
      canonicalSlug: 'avi-cohen',
    })]
    const result = detectDuplicates('Avi-Cohen', existing)

    // The slug from nameToSlug('Avi-Cohen') = 'avi-cohen' matches
    expect(result.hasMatches).toBe(true)
    expect(result.highestTier).toBe('strong')
    expect(result.blocked).toBe(false)
  })

  it('candidate matches existing alias → STRONG', () => {
    const existing = [makeEntity({
      displayName: 'Oren Kitty',
      aliases: ['Oren K', 'OK'],
    })]
    const result = detectDuplicates('Oren K', existing)

    expect(result.hasMatches).toBe(true)
    // Exact normalized match on alias = hard? No — the alias check is STRONG
    // because the candidate matches a known alias, not the canonical name
    expect(result.matches.some(m => m.tier === 'strong')).toBe(true)
  })
})

describe('detectDuplicates — SOFT tier', () => {
  it('prefix name → SOFT', () => {
    const existing = [makeEntity({ displayName: 'Avi Cohen' })]
    const result = detectDuplicates('Avi', existing)

    expect(result.hasMatches).toBe(true)
    expect(result.highestTier).toBe('soft')
    expect(result.blocked).toBe(false)
  })

  it('same first name, different last → SOFT', () => {
    const existing = [makeEntity({ displayName: 'Avi Cohen' })]
    const result = detectDuplicates('Avi Levi', existing)

    expect(result.hasMatches).toBe(true)
    expect(result.highestTier).toBe('soft')
  })

  it('candidate similar to alias → SOFT', () => {
    const existing = [makeEntity({
      displayName: 'Oren Kitty',
      aliases: ['Oren Cyprus'],
    })]
    const result = detectDuplicates('Oren Israel', existing)

    expect(result.hasMatches).toBe(true)
    expect(result.highestTier).toBe('soft')
  })
})

describe('detectDuplicates — no match', () => {
  it('completely different name → no match', () => {
    const existing = [makeEntity({ displayName: 'Tamir' })]
    const result = detectDuplicates('Oren Kitty', existing)

    expect(result.hasMatches).toBe(false)
    expect(result.highestTier).toBeNull()
    expect(result.blocked).toBe(false)
    expect(result.matches).toHaveLength(0)
  })

  it('empty entity list → no match', () => {
    const result = detectDuplicates('Anyone', [])

    expect(result.hasMatches).toBe(false)
    expect(result.highestTier).toBeNull()
    expect(result.blocked).toBe(false)
  })
})

describe('detectDuplicates — multiple matches + sorting', () => {
  it('matches sorted by tier: hard → strong → soft', () => {
    const existing = [
      makeEntity({ entityId: 'e-soft', displayName: 'Avi Cohen', canonicalSlug: 'avi-cohen' }),
      makeEntity({ entityId: 'e-hard', displayName: 'Avi', canonicalSlug: 'avi' }),
    ]
    const result = detectDuplicates('Avi', existing)

    expect(result.matches.length).toBeGreaterThanOrEqual(1)
    // First match should be highest severity
    const tiers = result.matches.map(m => m.tier)
    const tierOrder = { hard: 0, strong: 1, soft: 2 }
    for (let i = 1; i < tiers.length; i++) {
      expect(tierOrder[tiers[i]]).toBeGreaterThanOrEqual(tierOrder[tiers[i - 1]])
    }
  })
})

describe('detectDuplicates — result shape', () => {
  it('candidateName preserved in result', () => {
    const result = detectDuplicates('Test Name', [])
    expect(result.candidateName).toBe('Test Name')
  })

  it('matches are frozen (immutable)', () => {
    const result = detectDuplicates('Test', [])
    expect(Object.isFrozen(result.matches)).toBe(true)
  })
})

// ─── Language precedence tests ───────────────────────────────────────────

describe('Language/country precedence', () => {
  it('canonical language from DB overrides heuristic', () => {
    // Hebrew name → heuristic would say 'he'
    // But canonical says 'en' → 'en' wins
    const identity = buildOwnerIdentity('id-1', 'אבי כהן', ['Prop A'], 'en')
    expect(identity.preferredLanguage).toBe('en')
  })

  it('null canonical → heuristic fallback', () => {
    const identity = buildOwnerIdentity('id-1', 'אבי כהן', ['Prop A'], null)
    expect(identity.preferredLanguage).toBe('he') // heuristic detects Hebrew
  })

  it('undefined canonical → heuristic fallback', () => {
    // Backward compatibility — callers not passing the param
    const identity = buildOwnerIdentity('id-1', 'Avi Cohen', ['Prop A'])
    expect(identity.preferredLanguage).toBe('en')
  })

  it('canonical ru overrides heuristic for English name', () => {
    const identity = buildOwnerIdentity('id-1', 'Avi Cohen', ['Prop A'], 'ru')
    expect(identity.preferredLanguage).toBe('ru')
  })

  it('heuristic detects Hebrew characters', () => {
    expect(detectOwnerLanguage('אבי')).toBe('he')
  })

  it('heuristic detects Cyrillic characters', () => {
    expect(detectOwnerLanguage('Дмитрий')).toBe('ru')
  })

  it('heuristic defaults to en for Latin characters', () => {
    expect(detectOwnerLanguage('Avi Cohen')).toBe('en')
  })
})

// ─── Country / flag precedence tests ────────────────────────────────────

describe('Country / flag precedence', () => {
  it('canonical country CY → 🇨🇾 overrides name heuristic', () => {
    // Hebrew name → heuristic would say 🇮🇱
    // But canonical country says CY → 🇨🇾 wins
    const identity = buildOwnerIdentity('id-1', 'אבי כהן', ['Prop A'], null, 'CY')
    expect(identity.flag).toBe('🇨🇾')
  })

  it('canonical country IL → 🇮🇱', () => {
    const identity = buildOwnerIdentity('id-1', 'Avi Cohen', ['Prop A'], null, 'IL')
    expect(identity.flag).toBe('🇮🇱')
  })

  it('canonical country UA → 🇺🇦', () => {
    const identity = buildOwnerIdentity('id-1', 'Avi Cohen', ['Prop A'], null, 'UA')
    expect(identity.flag).toBe('🇺🇦')
  })

  it('null country → heuristic fallback (Hebrew → 🇮🇱)', () => {
    const identity = buildOwnerIdentity('id-1', 'אבי כהן', ['Prop A'], null, null)
    expect(identity.flag).toBe('🇮🇱')
  })

  it('undefined country → heuristic fallback', () => {
    const identity = buildOwnerIdentity('id-1', 'Avi Cohen', ['Prop A'], null)
    expect(identity.flag).toBe('🌍') // Latin → globe
  })

  it('unknown country code → neutral flag (not heuristic)', () => {
    const identity = buildOwnerIdentity('id-1', 'אבי כהן', ['Prop A'], null, 'XX')
    expect(identity.flag).toBe('🏳️') // canonical country present but unmapped → neutral
  })

  it('ZZ country code → neutral flag (not Hebrew heuristic)', () => {
    const identity = buildOwnerIdentity('id-1', 'אבי כהן', ['Prop A'], null, 'ZZ')
    expect(identity.flag).not.toBe('🇮🇱')
    expect(identity.flag).toBe('🏳️')
  })

  it('countryToFlag returns null for unknown codes', () => {
    expect(countryToFlag(null)).toBeNull()
    expect(countryToFlag(undefined)).toBeNull()
    expect(countryToFlag('ZZ')).toBeNull()
  })

  it('countryToFlag is case-insensitive', () => {
    expect(countryToFlag('cy')).toBe('🇨🇾')
    expect(countryToFlag('Cy')).toBe('🇨🇾')
  })
})
