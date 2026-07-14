/**
 * @file reportScope.test.ts
 * @description Pure function tests for ReportScope helpers.
 * M9-B: Report Scope Selector
 *
 * No DOM, no network, no balance arithmetic.
 * All functions under test are imported from @/lib/report/reportScope.
 */

import {
  defaultScope,
  normalizePropertyNames,
  resolvePropertyNames,
  isScopeValid,
  filterAuthorizedProperties,
  resolveAuthorizedScope,
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
    expect(normalizePropertyNames(['  A  ', ' B'])).toEqual(['A', 'B'])
  })

  it('deduplicates and preserves first occurrence order', () => {
    expect(normalizePropertyNames(['A', 'B', 'A', 'C', 'B'])).toEqual(['A', 'B', 'C'])
  })

  it('returns empty array for empty input', () => {
    expect(normalizePropertyNames([])).toEqual([])
  })

  it('returns empty array when all entries are empty strings', () => {
    expect(normalizePropertyNames(['', '  ', '\t'])).toEqual([])
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
    expect(resolvePropertyNames({ type: 'single_property', propertyName: '  ' })).toEqual([])
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
    expect(isScopeValid({ type: 'selected_properties', propertyNames: ['  '] })).toBe(false)
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

// ── filterAuthorizedProperties ────────────────────────────────────────────────

describe('filterAuthorizedProperties', () => {
  const authorized = ['Villa Mazotos', 'Tamir Dekelia', 'Oshrit Deklia']

  it('returns only names in the authorized set', () => {
    expect(filterAuthorizedProperties(['Villa Mazotos', 'Unknown Property'], authorized))
      .toEqual(['Villa Mazotos'])
  })

  it('is case-sensitive — unauthorized name with different casing is rejected', () => {
    expect(filterAuthorizedProperties(['villa mazotos'], authorized)).toEqual([])
  })

  it('returns empty array when no overlap', () => {
    expect(filterAuthorizedProperties(['X', 'Y'], authorized)).toEqual([])
  })

  it('deduplicates before filtering', () => {
    expect(filterAuthorizedProperties(['Villa Mazotos', 'Villa Mazotos'], authorized))
      .toEqual(['Villa Mazotos'])
  })

  it('returns all matching names', () => {
    expect(filterAuthorizedProperties(['Villa Mazotos', 'Tamir Dekelia'], authorized))
      .toEqual(['Villa Mazotos', 'Tamir Dekelia'])
  })
})

// ── resolveAuthorizedScope ────────────────────────────────────────────────────

describe('resolveAuthorizedScope', () => {
  const authorized = ['Villa Mazotos', 'Tamir Dekelia', 'Oshrit Deklia']

  it('portfolio returns all authorized properties', () => {
    expect(resolveAuthorizedScope({ type: 'portfolio' }, authorized))
      .toEqual(['Villa Mazotos', 'Tamir Dekelia', 'Oshrit Deklia'])
  })

  it('portfolio does not mutate authorized array', () => {
    const copy = [...authorized]
    resolveAuthorizedScope({ type: 'portfolio' }, authorized)
    expect(authorized).toEqual(copy)
  })

  it('selected_properties returns authorized intersection', () => {
    const scope: ReportScope = {
      type: 'selected_properties',
      propertyNames: ['Villa Mazotos', 'Injected Property'],
    }
    expect(resolveAuthorizedScope(scope, authorized)).toEqual(['Villa Mazotos'])
  })

  it('selected_properties with no overlap returns empty array', () => {
    const scope: ReportScope = { type: 'selected_properties', propertyNames: ['X', 'Y'] }
    expect(resolveAuthorizedScope(scope, authorized)).toEqual([])
  })

  it('single_property returns [name] when authorized', () => {
    expect(resolveAuthorizedScope({ type: 'single_property', propertyName: 'Villa Mazotos' }, authorized))
      .toEqual(['Villa Mazotos'])
  })

  it('single_property returns [] when not authorized', () => {
    expect(resolveAuthorizedScope({ type: 'single_property', propertyName: 'Injected' }, authorized))
      .toEqual([])
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
    expect(describeScopeHE({ type: 'portfolio' }, 5)).toBe('כל התיק (5 נכסים)')
  })

  it('portfolio without count', () => {
    expect(describeScopeHE({ type: 'portfolio' })).toBe('כל התיק')
  })

  it('selected_properties plural', () => {
    expect(describeScopeHE({ type: 'selected_properties', propertyNames: ['A', 'B'] }))
      .toBe('2 נכסים נבחרו')
  })
})

// ── Architecture: UI must never calculate portfolio totals ────────────────────

describe('Architecture constraints', () => {
  it('resolveAuthorizedScope returns names only — no amounts', () => {
    const result = resolveAuthorizedScope(
      { type: 'portfolio' },
      ['Villa Mazotos', 'Tamir Dekelia'],
    )
    // Result must be string[] only — no numeric fields
    result.forEach(item => expect(typeof item).toBe('string'))
  })

  it('filterAuthorizedProperties returns names only — no amounts', () => {
    const result = filterAuthorizedProperties(['Villa Mazotos'], ['Villa Mazotos'])
    result.forEach(item => expect(typeof item).toBe('string'))
  })
})
