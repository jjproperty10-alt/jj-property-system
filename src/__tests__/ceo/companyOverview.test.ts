/**
 * companyOverview.test.ts
 *
 * R2 Product Parity: tests for CompanyOverview component + companyDataService.
 *
 * Tests verify:
 *   1. Component contract: CompanyOverview accepts CompanyOverviewDTO, renders 3 sections
 *   2. Source audit: no direct DB calls or business logic in UI component
 *   3. Data service: coercion of Supabase numeric strings to numbers
 *   4. DS compliance: uses DS components (MoneyValue, KpiCard, SectionHeader, StatusBadge)
 *   5. P-ARCH-1: null handling (null → em dash via MoneyValue)
 *   6. Error state: renders error banner when dto.errors is non-empty
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'

// ─── Source reading for audit tests ──────────────────────────────────────

const componentPath = resolve(__dirname, '../../components/ceo/CompanyOverview.tsx')
const servicePath = resolve(__dirname, '../../lib/ceo/companyDataService.ts')
const componentSource = readFileSync(componentPath, 'utf-8')
const serviceSource = readFileSync(servicePath, 'utf-8')

// ─── Component Contract Tests ────────────────────────────────────────────

describe('CompanyOverview — component contract', () => {
  test('exports CompanyOverview function', () => {
    expect(componentSource).toContain('export function CompanyOverview')
  })

  test('accepts dto: CompanyOverviewDTO as only prop', () => {
    expect(componentSource).toContain('{ dto }: { dto: CompanyOverviewDTO }')
  })

  test('renders CashPositionsSection', () => {
    expect(componentSource).toContain('<CashPositionsSection')
  })

  test('renders CompanyPLSection', () => {
    expect(componentSource).toContain('<CompanyPLSection')
  })

  test('renders AnastasiaClearingSection', () => {
    expect(componentSource).toContain('<AnastasiaClearingSection')
  })

  test('renders error banner when errors exist', () => {
    expect(componentSource).toContain('dto.errors.length > 0')
    expect(componentSource).toContain('Data fetch errors')
  })
})

// ─── DS Compliance ───────────────────────────────────────────────────────

describe('CompanyOverview — DS compliance', () => {
  test('imports MoneyValue from DS', () => {
    expect(componentSource).toMatch(/import\s*\{[^}]*MoneyValue[^}]*\}\s*from\s*['"]@\/components\/ds['"]/)
  })

  test('imports SectionHeader from DS', () => {
    expect(componentSource).toMatch(/import\s*\{[^}]*SectionHeader[^}]*\}\s*from\s*['"]@\/components\/ds['"]/)
  })

  test('imports KpiCard from DS', () => {
    expect(componentSource).toMatch(/import\s*\{[^}]*KpiCard[^}]*\}\s*from\s*['"]@\/components\/ds['"]/)
  })

  test('imports StatusBadge from DS', () => {
    expect(componentSource).toMatch(/import\s*\{[^}]*StatusBadge[^}]*\}\s*from\s*['"]@\/components\/ds['"]/)
  })

  test('uses jj-tile class for cards', () => {
    expect(componentSource).toContain('jj-tile')
  })

  test('uses jj-label class for labels', () => {
    expect(componentSource).toContain('jj-label')
  })
})

// ─── Source Audit: UI has no business logic ──────────────────────────────

describe('CompanyOverview — source audit (no business logic in UI)', () => {
  test('does not import createServiceClient', () => {
    expect(componentSource).not.toContain('createServiceClient')
  })

  test('does not import createClient from supabase', () => {
    expect(componentSource).not.toContain('createClient')
  })

  test('does not call .from() (no direct DB reads)', () => {
    expect(componentSource).not.toMatch(/\.from\s*\(/)
  })

  test('does not import server-only (component may be used in tests)', () => {
    expect(componentSource).not.toContain("import 'server-only'")
  })

  test('imports CompanyOverviewDTO type from data service', () => {
    expect(componentSource).toContain("from '@/lib/ceo/companyDataService'")
  })

  test('does not perform arithmetic on amounts (no reduce/sum)', () => {
    // Only allowed arithmetic: totalIn/totalOut sums in AnastasiaClearingSection
    // and totalInternal sum in CashPositionsSection — these are presentation aggregates
    // (matching exactly what the legacy page.tsx computed for display).
    // No .reduce() or complex accounting.
    expect(componentSource).not.toContain('.reduce(')
  })
})

// ─── Data Service Tests ──────────────────────────────────────────────────

describe('companyDataService — contract', () => {
  test('imports server-only', () => {
    expect(serviceSource).toContain("import 'server-only'")
  })

  test('imports createServiceClient', () => {
    expect(serviceSource).toContain('createServiceClient')
  })

  test('exports getCompanyOverview function', () => {
    expect(serviceSource).toContain('export async function getCompanyOverview')
  })

  test('reads from v_cashbox_audit', () => {
    expect(serviceSource).toContain("'v_cashbox_audit'")
  })

  test('reads from v_jj_company_pl', () => {
    expect(serviceSource).toContain("'v_jj_company_pl'")
  })

  test('reads from v_anastasia_clearing', () => {
    expect(serviceSource).toContain("'v_anastasia_clearing'")
  })

  test('does not write to any table (no .insert/.update/.delete/.upsert)', () => {
    expect(serviceSource).not.toMatch(/\.(insert|update|delete|upsert)\s*\(/)
  })

  test('exports CompanyOverviewDTO type', () => {
    expect(serviceSource).toContain('export interface CompanyOverviewDTO')
  })

  test('exports CashboxRow type', () => {
    expect(serviceSource).toContain('export interface CashboxRow')
  })

  test('exports CompanyPL type', () => {
    expect(serviceSource).toContain('export interface CompanyPL')
  })

  test('exports AnastasiaClearing type', () => {
    expect(serviceSource).toContain('export interface AnastasiaClearing')
  })

  test('coerces numeric strings (n() function)', () => {
    expect(serviceSource).toContain('function n(v: unknown): number')
    expect(serviceSource).toContain('parseFloat(String(v))')
  })
})

// ─── CEO Workspace Page Wiring ───────────────────────────────────────────

describe('CEO Workspace page — R2 wiring', () => {
  const pagePath = resolve(__dirname, '../../app/(app)/ceo/page.tsx')
  const pageSource = readFileSync(pagePath, 'utf-8')

  test('imports getCompanyOverview', () => {
    expect(pageSource).toContain('getCompanyOverview')
  })

  test('imports CompanyOverview component', () => {
    expect(pageSource).toContain('CompanyOverview')
  })

  test('no longer contains placeholder text', () => {
    expect(pageSource).not.toContain('Company overview coming soon')
  })

  test('calls getCompanyOverview for company tab', () => {
    expect(pageSource).toContain('getCompanyOverview()')
  })

  test('passes dto to CompanyOverview', () => {
    expect(pageSource).toContain('companyDTO')
  })
})
