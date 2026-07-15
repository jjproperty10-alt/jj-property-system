/**
 * @file scopeServerIntegration.test.ts
 * @description Integration tests proving that only server-validated scope
 * reaches the reporting pipeline.
 *
 * PR B: Report Scope Selector
 *
 * These tests verify the architectural wiring \u2014 that the client-report-rc3
 * page imports and uses PR A's server-side authorization exports, and that
 * no browser-only authorization path remains.
 *
 * Test categories:
 * 1\u20133: Static analysis \u2014 page.tsx imports the right modules
 * 4\u20136: Static analysis \u2014 dead authorization paths removed
 * 7:   Scope type preservation \u2014 selected_properties with 1 item stays selected_properties
 * 8:   Architecture \u2014 reportScope.ts exports no authorization functions
 * 9:   Architecture \u2014 reportScopeValidation.ts is deprecated (not imported by page)
 */

import * as fs from 'fs'
import * as path from 'path'

const PAGE_PATH = path.resolve(__dirname, '../../app/client-report-rc3/page.tsx')
const REPORT_SCOPE_PATH = path.resolve(__dirname, '../../lib/report/reportScope.ts')
const REPORT_SCOPE_VALIDATION_PATH = path.resolve(__dirname, '../../lib/report/reportScopeValidation.ts')

let pageContent: string
let reportScopeContent: string

beforeAll(() => {
  pageContent = fs.readFileSync(PAGE_PATH, 'utf-8')
  reportScopeContent = fs.readFileSync(REPORT_SCOPE_PATH, 'utf-8')
})

// ── 1\u20133: Page imports PR A server-side authorization ─────────────────────────

describe('PR A authorization wiring', () => {
  it('1. page.tsx imports getAuthorizedReportProperties from PR A', () => {
    expect(pageContent).toContain('getAuthorizedReportProperties')
    expect(pageContent).toContain("from '@/lib/auth/reportAuthorization'")
  })

  it('2. page.tsx imports validateAuthorizedReportScope from PR A', () => {
    expect(pageContent).toContain('validateAuthorizedReportScope')
  })

  it('3. page.tsx calls getAuthorizedReportProperties() to load properties', () => {
    // Must call the server action, not fetchRC3PropertyList
    expect(pageContent).toContain('getAuthorizedReportProperties()')
  })
})

// ── 4\u20136: Dead browser-only authorization paths removed ───────────────────────

describe('Dead authorization paths removed', () => {
  it('4. page.tsx does not import fetchRC3PropertyList', () => {
    // fetchRC3PropertyList was the browser-side property loader.
    // It must not be imported by the page \u2014 all property loading goes through PR A.
    expect(pageContent).not.toContain('fetchRC3PropertyList')
  })

  it('5. page.tsx does not call resolveAuthorizedScope', () => {
    // resolveAuthorizedScope was the browser-side scope resolver.
    // All scope resolution now goes through validateAuthorizedReportScope.
    expect(pageContent).not.toContain('resolveAuthorizedScope')
  })

  it('6. page.tsx does not import filterAuthorizedProperties', () => {
    expect(pageContent).not.toContain('filterAuthorizedProperties')
  })
})

// ── 7: Scope type preservation ───────────────────────────────────────────────

describe('Scope type preservation', () => {
  it('7. selected_properties with one property must remain selected_properties', () => {
    // This test verifies that the page does NOT convert a selected_properties
    // scope containing one item into a single_property scope.
    // The rendering path for multi-property vs single-property is determined
    // by the original scope.type, not the number of resolved properties.
    //
    // Evidence: the page must not contain logic like:
    //   if (resolvedProperties.length === 1) \u2192 single_property conversion
    // Instead, it should use scope.type to decide the rendering path.
    expect(pageContent).not.toMatch(/scope\.type\s*===?\s*['"]selected_properties['"].*single_property/s)

    // Positive check: the page should handle single_property separately from
    // selected_properties/portfolio based on the original scope.type
    expect(pageContent).toContain("scope.type === 'single_property'")
  })
})

// ── 8\u20139: Architecture constraints ────────────────────────────────────────────

describe('Architecture constraints', () => {
  it('8. reportScope.ts does not export any authorization functions', () => {
    // These functions were removed in PR B \u2014 all authorization is in PR A
    expect(reportScopeContent).not.toContain('export function filterAuthorizedProperties')
    expect(reportScopeContent).not.toContain('export function resolveAuthorizedScope')
  })

  it('9. reportScopeValidation.ts is marked deprecated', () => {
    const validationContent = fs.readFileSync(REPORT_SCOPE_VALIDATION_PATH, 'utf-8')
    expect(validationContent).toContain('@deprecated')
    // And the page does not import from it
    expect(pageContent).not.toContain('reportScopeValidation')
  })
})
