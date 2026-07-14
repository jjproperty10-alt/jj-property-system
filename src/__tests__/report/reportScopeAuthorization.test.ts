/**
 * @file reportScopeAuthorization.test.ts
 * @description Tests for server-side scope validation.
 * M9-B: Report Scope Selector
 *
 * Covers: all error codes, silent rejection, authorized resolution,
 *         empty authorized set, error messages EN/HE.
 */

import {
  validateScope,
  validationErrorMessageEN,
  validationErrorMessageHE,
} from '@/lib/report/reportScopeValidation'
import type { ScopeValidationError } from '@/lib/report/reportScopeValidation'
import type { ReportScope } from '@/lib/report/reportScope'

const AUTHORIZED = ['Villa Mazotos', 'Tamir Dekelia', 'Oshrit Deklia', 'Liron Alon']

// ── portfolio ─────────────────────────────────────────────────────────────────

describe('validateScope — portfolio', () => {
  it('ok: returns all authorized properties', () => {
    const r = validateScope({ type: 'portfolio' }, AUTHORIZED)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.resolvedProperties).toEqual(AUTHORIZED)
  })

  it('error: empty_portfolio when owner has no authorized properties', () => {
    const r = validateScope({ type: 'portfolio' }, [])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('empty_portfolio')
  })

  it('ok: portfolio with single authorized property', () => {
    const r = validateScope({ type: 'portfolio' }, ['Villa Mazotos'])
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.resolvedProperties).toEqual(['Villa Mazotos'])
  })
})

// ── selected_properties ───────────────────────────────────────────────────────

describe('validateScope — selected_properties', () => {
  it('ok: returns intersection of submitted and authorized names', () => {
    const scope: ReportScope = {
      type: 'selected_properties',
      propertyNames: ['Villa Mazotos', 'Tamir Dekelia'],
    }
    const r = validateScope(scope, AUTHORIZED)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.resolvedProperties).toEqual(['Villa Mazotos', 'Tamir Dekelia'])
  })

  it('error: empty_selection when propertyNames is empty', () => {
    const scope: ReportScope = { type: 'selected_properties', propertyNames: [] }
    const r = validateScope(scope, AUTHORIZED)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('empty_selection')
  })

  it('error: no_authorized_properties when all submitted names are unauthorized', () => {
    const scope: ReportScope = {
      type: 'selected_properties',
      propertyNames: ['Injected Property A', 'Injected Property B'],
    }
    const r = validateScope(scope, AUTHORIZED)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('no_authorized_properties')
  })

  it('silently rejects unauthorized names in a mixed list', () => {
    const scope: ReportScope = {
      type: 'selected_properties',
      propertyNames: ['Villa Mazotos', 'Injected Property'],
    }
    const r = validateScope(scope, AUTHORIZED)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.resolvedProperties).toEqual(['Villa Mazotos'])
      expect(r.resolvedProperties).not.toContain('Injected Property')
    }
  })

  it('case-sensitive: lowercase variant is rejected', () => {
    const scope: ReportScope = {
      type: 'selected_properties',
      propertyNames: ['villa mazotos'],   // wrong case
    }
    const r = validateScope(scope, AUTHORIZED)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('no_authorized_properties')
  })

  it('deduplicates submitted names before validation', () => {
    const scope: ReportScope = {
      type: 'selected_properties',
      propertyNames: ['Villa Mazotos', 'Villa Mazotos'],
    }
    const r = validateScope(scope, AUTHORIZED)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.resolvedProperties).toEqual(['Villa Mazotos'])
  })
})

// ── single_property ───────────────────────────────────────────────────────────

describe('validateScope — single_property', () => {
  it('ok: authorized property returns [name]', () => {
    const r = validateScope({ type: 'single_property', propertyName: 'Tamir Dekelia' }, AUTHORIZED)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.resolvedProperties).toEqual(['Tamir Dekelia'])
  })

  it('error: missing_property when propertyName is empty', () => {
    const r = validateScope({ type: 'single_property', propertyName: '' }, AUTHORIZED)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('missing_property')
  })

  it('error: missing_property when propertyName is whitespace', () => {
    const r = validateScope({ type: 'single_property', propertyName: '   ' }, AUTHORIZED)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('missing_property')
  })

  it('error: no_authorized_properties when name is not in authorized set', () => {
    const r = validateScope({ type: 'single_property', propertyName: 'Not My Property' }, AUTHORIZED)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('no_authorized_properties')
  })

  it('does not reveal authorized names in error response', () => {
    const r = validateScope({ type: 'single_property', propertyName: 'Injected' }, AUTHORIZED)
    expect(r.ok).toBe(false)
    // error must be 'no_authorized_properties', not a list of authorized names
    if (!r.ok) expect(r.error).toBe('no_authorized_properties')
  })
})

// ── Error messages ────────────────────────────────────────────────────────────

describe('validationErrorMessageEN', () => {
  const ERRORS: ScopeValidationError[] = [
    'empty_selection',
    'missing_property',
    'no_authorized_properties',
    'empty_portfolio',
  ]

  it('all error codes have non-empty EN messages', () => {
    for (const err of ERRORS) {
      const msg = validationErrorMessageEN(err)
      expect(msg.length).toBeGreaterThan(0)
    }
  })

  it('empty_selection message guides user', () => {
    expect(validationErrorMessageEN('empty_selection')).toContain('select')
  })

  it('missing_property message guides user', () => {
    expect(validationErrorMessageEN('missing_property')).toContain('select')
  })
})

describe('validationErrorMessageHE', () => {
  it('all error codes have non-empty HE messages', () => {
    const ERRORS: ScopeValidationError[] = [
      'empty_selection',
      'missing_property',
      'no_authorized_properties',
      'empty_portfolio',
    ]
    for (const err of ERRORS) {
      const msg = validationErrorMessageHE(err)
      expect(msg.length).toBeGreaterThan(0)
    }
  })
})
