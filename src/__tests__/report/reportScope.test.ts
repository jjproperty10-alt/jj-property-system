/**
 * @file reportScope.test.ts
 * @description Pure function tests for ReportScope helpers.
 * M9-B: Report Scope Selector
 *
 * No DOM, no network, no balance arithmetic.
 * All functions under test are imported from @/lib/report/reportScope.
 *
 * PR B: Browser-only authorization functions (filterAuthorizedProperties,
 * resolveAuthorizedScope) removed. All authorization now flows through
 * PR A's server-side exports in @/lib/auth/reportAuthorization.
 */

import {
  defaultScope,
  normalizePropertyNames,
  resolvePropertyNames,
  isScopeValid,
  describeScopeEN,
  describeScopeHE,
} from '@/lib/report/reportScope'
import type { ReportScope } from '@/lib/report/reportScope'

// ── defaultScope ───────────────────────────────────────────────────────────────

describe('defaultScope', () => {
  it('returns single_property when a name is provided', () => {
    const s = defaultScope('Villa Mazotos')
    expect(s.type).toBe('single_property')
    if (s.type === 'single_property') expect(s.propertyName).toBe('Villa Mazotos')
  })

  it('returns portfolio when no name is provided', () => {
    expect(defaultScope()).toEqual({ type: 'portfolio' })
  })

  it('returns portfolio when empty string provided (no trimming done here)', () => {
    const s = defaultScope('')
    // empty string is falsy → portfolio
    expect(s.type).toBe('portfolio')
  })
})

// ── normalizePropertyNames ────────────────────────────────────────────────────

describe('normalizePropertyNames', () => {
  it('removes empty strings', () => {
    expect(normalizePropertyNames(['A', '', 'B'])).toEqual(['A', 'B'])
  })

  it('trims whitespace', () => {
    expect(normalizePropertyNames([' A ', ' B'])).toEqual(['A', 'B'])
  })

  it('deduplicates and preserves first occurrence order', () => {
    expect(normalizePropertyNames(['A', 'B', 'A', 'C', 'B'])).toEqual(['A', 'B', 'C'])
  })

  it('returns empty array for empty input', () => {
    expect(normalizePropertyNames([])).toEqual([])
  })

  it('returns empty array when all entries are empty strings', () => {
    expect(normalizePropertyNames(['', ' ', '\t'])).toEqual([])
  })

  it('does not mutate the input array', () => {
    const input = ['A', 'B']
    normalizePropertyNames(input)
    expect(input).toEqual(['A', 'B'])
  })
})

// ── resolvePropertyNames ──────────────────────────────────────────────────────

describe('resolvePropertyNames', () => {
  it('returns null for portfolio scope', () => {
    expect(resolvePropertyNames({ type: 'portfolio' })).toBeNull()
  })

  it('returns normalized list for selected_properties', () => {
    const scope: ReportScope = { type: 'selected_properties', propertyNames: ['A', ' B ', 'A'] }
    expect(resolvePropertyNames(scope)).toEqual(['A', 'B'])
  })

  it('returns empty array for selected_properties with no names', () => {
    expect(resolvePropertyNames({ type: 'selected_properties', propertyNames: [] })).toEqual([])
  })

  it('returns [name] for single_property', () => {
    expect(resolvePropertyNames({ type: 'single_property', propertyName: 'Tamir Dekelia' }))
      .toEqual(['Tamir Dekelia'])
  })

  it('returns [] for single_property with empty name', () => {
    expect(resolvePropertyNames({ type: 'single_property', propertyName: '   ' })).toEqual([])
  })
})

// ── isScopeValid ──────────────────────────────────────────────────────────────

describe('isScopeValid', () => {
  it('portfolio is always valid', () => {
    expect(isScopeValid({ type: 'portfolio' })).toBe(true)
  })

  it('selected_properties with names is valid', () => {
    expect(isScopeValid({ type: 'selected_properties', propertyNames: ['A'] })).toBe(true)
  })

  it('selected_properties with only whitespace is invalid', () => {
    expect(isScopeValid({ type: 'selected_properties', propertyNames: [' '] })).toBe(false)
  })

  it('selected_properties empty array is invalid', () => {
    expect(isScopeValid({ type: 'selected_properties', propertyNames: [] })).toBe(false)
  })

  it('single_property with a name is valid', () => {
    expect(isScopeValid({ type: 'single_property', propertyName: 'Villa Mazotos' })).toBe(true)
  })

  it('single_property with empty name is invalid', () => {
    expect(isScopeValid({ type: 'single_property', propertyName: '' })).toBe(false)
  })

  it('single_property with whitespace-only name is invalid', () => {
    expect(isScopeValid({ type: 'single_property', propertyName: '   ' })).toBe(false)
  })
})

// ── describeScopeEN / describeScopeHE ────────────────────────────────────────

describe('describeScopeEN', () => {
  it('portfolio with count', () => {
    expect(describeScopeEN({ type: 'portfolio' }, 12)).toBe('Entire Portfolio (12 properties)')
  })

  it('portfolio without count', () => {
    expect(describeScopeEN({ type: 'portfolio' })).toBe('Entire Portfolio')
  })

  it('selected_properties single', () => {
    expect(describeScopeEN({ type: 'selected_properties', propertyNames: ['A'] }))
      .toBe('1 property selected')
  })

  it('selected_properties plural', () => {
    expect(describeScopeEN({ type: 'selected_properties', propertyNames: ['A', 'B', 'C'] }))
      .toBe('3 properties selected')
  })

  it('single_property returns name', () => {
    expect(describeScopeEN({ type: 'single_property', propertyName: 'Villa Mazotos' }))
      .toBe('Villa Mazotos')
  })

  it('single_property empty name returns fallback', () => {
    expect(describeScopeEN({ type: 'single_property', propertyName: '' }))
      .toBe('No property selected')
  })
})

describe('describeScopeHE', () => {
  it('portfolio with count', () => {
    expect(describeScopeHE({ type: 'portfolio' }, 5)).toBe('\u05db\u05dc \u05d4\u05ea\u05d9\u05e7 (5 \u05e0\u05db\u05e1\u05d9\u05dd)')
  })

  it('portfolio without count', () => {
    expect(describeScopeHE({ type: 'portfolio' })).toBe('\u05db\u05dc \u05d4\u05ea\u05d9\u05e7')
  })

  it('selected_properties plural', () => {
    expect(describeScopeHE({ type: 'selected_properties', propertyNames: ['A', 'B'] }))
      .toBe('2 \u05e0\u05db\u05e1\u05d9\u05dd \u05e0\u05d1\u05d7\u05e8\u05d5')
  })
})

// ── Architecture: no authorization functions in this module ───────────────────

describe('Architecture constraints \u2014 PR B', () => {
  it('reportScope.ts does not export filterAuthorizedProperties', () => {
    const mod = require('@/lib/report/reportScope')
    expect(mod.filterAuthorizedProperties).toBeUndefined()
  })

  it('reportScope.ts does not export resolveAuthorizedScope', () => {
    const mod = require('@/lib/report/reportScope')
    expect(mod.resolveAuthorizedScope).toBeUndefined()
  })
})
