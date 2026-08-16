/**
 * Unit tests for pure identity-input helpers (Jest / ts-jest, node env).
 * No DB access — these validate input classification/normalization only.
 *
 * The full canonical resolution regression (Yogev / Tamir H.5 / Liora H.4 /
 * Uriel & Villa Mazotos negatives / party resolution) is proven at the DB layer
 * (registry.resolve_property / registry.resolve_party) and documented in
 * docs/JJ_Canonical_Integration_OwnerRoom_Migration_Package.md. It is not a unit
 * test because it requires a live service-role connection.
 */

import { isUuidLike, isBlankInput, normalizeIdentityName } from '../identityInput'

describe('isUuidLike', () => {
  it('accepts a canonical uuid', () => {
    expect(isUuidLike('270f0339-88d8-47bd-b62a-6019d4be2d9e')).toBe(true)
  })
  it('accepts an uppercase uuid and trims surrounding space', () => {
    expect(isUuidLike('  4B5F6044-1B32-4D8A-99A3-12F5C32AE341  ')).toBe(true)
  })
  it('rejects a property/party name', () => {
    expect(isUuidLike('Yogev Port')).toBe(false)
    expect(isUuidLike('Tamir Redisson')).toBe(false)
  })
  it('rejects malformed uuids and nullish', () => {
    expect(isUuidLike('270f0339-88d8-47bd-b62a')).toBe(false)
    expect(isUuidLike('')).toBe(false)
    expect(isUuidLike(null)).toBe(false)
    expect(isUuidLike(undefined)).toBe(false)
  })
})

describe('isBlankInput', () => {
  it('flags null/undefined/empty/whitespace', () => {
    expect(isBlankInput(null)).toBe(true)
    expect(isBlankInput(undefined)).toBe(true)
    expect(isBlankInput('')).toBe(true)
    expect(isBlankInput('   ')).toBe(true)
  })
  it('passes real input', () => {
    expect(isBlankInput('Yogev Port')).toBe(false)
  })
})

describe('normalizeIdentityName', () => {
  it('trims and lowercases (case-only variants collapse)', () => {
    expect(normalizeIdentityName('  Yogev Port ')).toBe('yogev port')
    expect(normalizeIdentityName('YOGEV PORT')).toBe(normalizeIdentityName('yogev port'))
  })
  it('is safe on nullish', () => {
    expect(normalizeIdentityName(null)).toBe('')
    expect(normalizeIdentityName(undefined)).toBe('')
  })
})
