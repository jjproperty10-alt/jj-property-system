/**
 * @jest Stage 2 — Statement Route Source Audit Tests
 *
 * Tests the /owners/[slug]/statement page's structure and contracts.
 * Decision logic is tested behaviorally in statementRouteDecision.test.ts.
 *
 * Coverage:
 *   1. Route structure — auth, resolution, decision delegation, pipeline imports
 *   2. Scope isolation — management and investment never merge
 *   3. Component rendering contracts — FinancialTab and PartnerReport
 *   4. Dual context selector — inline UI
 *   5. Old pipeline preservation — partner route untouched
 *   6. Architectural constraints — server-only, no direct DB, no accounting
 *   7. Decision extraction — page delegates to resolveRouteDecision
 */

import * as fs from 'fs'
import * as path from 'path'

// ─── Source file locations ────────────────────────────────────────────────────

const PAGE_PATH = path.resolve(
  __dirname,
  '../../app/(app)/owners/[slug]/statement/page.tsx',
)

const DECISION_PATH = path.resolve(
  __dirname,
  '../../lib/statements/statementRouteDecision.ts',
)

// ─── Group 1: Route structure (source audit) ──────────────────────────────────

describe('Stage 2 — route structure (source audit)', () => {
  let source: string

  beforeAll(() => {
    if (!fs.existsSync(PAGE_PATH)) {
      throw new Error(`Statement page not found at: ${PAGE_PATH}`)
    }
    source = fs.readFileSync(PAGE_PATH, 'utf-8')
  })

  // ── Auth ──────────────────────────────────────────────────────────────────

  test('imports authenticateStatementUser for staff auth', () => {
    expect(source).toContain("import { authenticateStatementUser }")
    expect(source).toContain("from '@/lib/statements/statementAuthService'")
  })

  test('auth check happens before context resolution', () => {
    const authIdx = source.indexOf('authenticateStatementUser()')
    const resolveIdx = source.indexOf('resolveStatementContexts(slug)')
    expect(authIdx).toBeGreaterThan(-1)
    expect(resolveIdx).toBeGreaterThan(-1)
    expect(authIdx).toBeLessThan(resolveIdx)
  })

  test('NO_SESSION redirects to /login', () => {
    expect(source).toContain("redirect('/login')")
  })

  test('auth failure calls notFound()', () => {
    expect(source).toContain('notFound()')
  })

  // ── Context resolution ────────────────────────────────────────────────────

  test('imports resolveStatementContexts from Stage 0', () => {
    expect(source).toContain('resolveStatementContexts')
    expect(source).toContain("from '@/lib/statements/statementContextResolver'")
  })

  test('imports context types from Stage 0', () => {
    expect(source).toContain('ManagedOwnerStatementContext')
    expect(source).toContain('InvestmentStatementContext')
    expect(source).toContain('StatementContextResolution')
  })

  // ── Decision delegation ──────────────────────────────────────────────────

  test('imports resolveRouteDecision from extraction module', () => {
    expect(source).toContain('resolveRouteDecision')
    expect(source).toContain("from '@/lib/statements/statementRouteDecision'")
  })

  test('imports parseContextParam from extraction module', () => {
    expect(source).toContain('parseContextParam')
    expect(source).toContain("from '@/lib/statements/statementRouteDecision'")
  })

  test('calls resolveRouteDecision with resolution and requestedContext', () => {
    expect(source).toContain('resolveRouteDecision(resolution, requestedContext)')
  })

  test('acts on decision.action via switch statement', () => {
    expect(source).toContain('switch (decision.action)')
    expect(source).toContain("case 'not_found'")
    expect(source).toContain("case 'error'")
    expect(source).toContain("case 'unavailable'")
    expect(source).toContain("case 'retryable_error'")
    expect(source).toContain("case 'invalid_context'")
    expect(source).toContain("case 'render_management'")
    expect(source).toContain("case 'render_investment'")
    expect(source).toContain("case 'show_selector'")
  })

  // ── Pipeline imports ──────────────────────────────────────────────────────

  test('imports management pipeline (getFinancial)', () => {
    expect(source).toContain("import { getFinancial }")
    expect(source).toContain("from '@/lib/owners/ownerFinancialService'")
  })

  test('imports investment pipeline (loadPartnerStatementForEntity)', () => {
    expect(source).toContain("import { loadPartnerStatementForEntity }")
    expect(source).toContain("from '@/lib/lifecycle/partnerStatementService'")
  })

  // ── Component imports ─────────────────────────────────────────────────────

  test('imports FinancialTab for management rendering', () => {
    expect(source).toContain("import { FinancialTab }")
    expect(source).toContain("from '@/components/owners/tabs/FinancialTab'")
  })

  test('imports PartnerReport for investment rendering', () => {
    expect(source).toContain("import { PartnerReport }")
    expect(source).toContain("from '@/components/partner/PartnerReport'")
  })

  test('imports PartnerFacingStatementDTO type for narrowing', () => {
    expect(source).toContain('PartnerFacingStatementDTO')
  })

  // ── Query parameter ───────────────────────────────────────────────────────

  test('reads ?context= query parameter from searchParams', () => {
    expect(source).toContain('searchParams')
    expect(source).toContain('context')
  })
})

// ─── Group 2: Decision extraction module exists ─────────────────────────────────

describe('Stage 2 — decision extraction module (source audit)', () => {
  let decisionSource: string

  beforeAll(() => {
    if (!fs.existsSync(DECISION_PATH)) {
      throw new Error(`Decision module not found at: ${DECISION_PATH}`)
    }
    decisionSource = fs.readFileSync(DECISION_PATH, 'utf-8')
  })

  test('exports resolveRouteDecision function', () => {
    expect(decisionSource).toContain('export function resolveRouteDecision')
  })

  test('exports parseContextParam function', () => {
    expect(decisionSource).toContain('export function parseContextParam')
  })

  test('exports RouteDecision type', () => {
    expect(decisionSource).toContain('export type RouteDecision')
  })

  test('handles all 6 resolution statuses', () => {
    expect(decisionSource).toContain("case 'entity_not_found'")
    expect(decisionSource).toContain("case 'ambiguous_slug'")
    expect(decisionSource).toContain("case 'entity_inactive'")
    expect(decisionSource).toContain("case 'no_contexts'")
    expect(decisionSource).toContain("case 'source_unavailable'")
    expect(decisionSource).toContain("case 'resolved'")
  })

  test('validates context params', () => {
    expect(decisionSource).toContain("'management'")
    expect(decisionSource).toContain("'investment'")
    expect(decisionSource).toContain('VALID_CONTEXT_PARAMS')
  })

  test('has zero React or Next.js imports', () => {
    expect(decisionSource).not.toContain("from 'react'")
    expect(decisionSource).not.toContain("from 'next")
    expect(decisionSource).not.toContain("import 'server-only'")
  })

  test('has zero DB or Supabase imports', () => {
    expect(decisionSource).not.toContain('supabase')
    expect(decisionSource).not.toContain('createServiceClient')
  })

  test('imports only types from statementContextResolver', () => {
    expect(decisionSource).toContain('import type')
    expect(decisionSource).toContain("from './statementContextResolver'")
  })
})

// ─── Group 3: Scope isolation ──────────────────────────────────────────────────

describe('Stage 2 — scope isolation (source audit)', () => {
  let source: string

  beforeAll(() => {
    source = fs.readFileSync(PAGE_PATH, 'utf-8')
  })

  test('management path uses managedProperties only', () => {
    // renderManagementStatement receives ManagedOwnerStatementContext
    // and passes ctx.managedProperties to getFinancial
    expect(source).toContain('ctx.managedProperties')
    // Must NOT contain investmentProperties in management path
    const mgmtFn = source.substring(
      source.indexOf('async function renderManagementStatement'),
      source.indexOf('async function renderInvestmentStatement'),
    )
    expect(mgmtFn).not.toContain('investmentProperties')
  })

  test('investment path uses investmentProperties only', () => {
    // renderInvestmentStatement receives InvestmentStatementContext
    // and passes ctx.investmentProperties to loadPartnerStatementForEntity
    expect(source).toContain('ctx.investmentProperties')
    const investFn = source.substring(
      source.indexOf('async function renderInvestmentStatement'),
      source.indexOf('// ─────────────────────────────────────────────────────────────\n// Page'),
    )
    expect(investFn).not.toContain('managedProperties')
  })

  test('no context merging or inheritance', () => {
    // Must not spread one context's properties into another
    expect(source).not.toContain('...managedCtx')
    expect(source).not.toContain('...investmentCtx')
    // Must not assign one to the other
    expect(source).not.toMatch(/managedProperties.*=.*investmentProperties/)
    expect(source).not.toMatch(/investmentProperties.*=.*managedProperties/)
  })
})

// ─── Group 4: Component rendering contracts ────────────────────────────────────

describe('Stage 2 — component rendering contracts (source audit)', () => {
  let source: string

  beforeAll(() => {
    source = fs.readFileSync(PAGE_PATH, 'utf-8')
  })

  test('FinancialTab receives dto prop (ownerSlug unnecessary on statement page)', () => {
    expect(source).toContain('<FinancialTab dto={dto} />')
  })

  test('PartnerReport receives narrowed PartnerFacingStatementDTO', () => {
    expect(source).toContain('<PartnerReport dto={partnerDto} />')
    // Narrowing must happen before rendering
    expect(source).toContain("dto.meta.viewMode !== 'partner'")
    expect(source).toContain('as PartnerFacingStatementDTO')
  })

  test('investment path passes entityId from context', () => {
    expect(source).toContain('entityId: ctx.entityId')
  })

  test('investment path passes canonicalName from context', () => {
    expect(source).toContain('canonicalName: ctx.canonicalName')
  })

  test('investment path passes slug from route params', () => {
    const investFn = source.substring(
      source.indexOf('async function renderInvestmentStatement'),
      source.indexOf('// ─────────────────────────────────────────────────────────────\n// Page'),
    )
    expect(investFn).toContain('slug,')
    expect(investFn).toContain('slug: string')
  })

  test('investment path passes entityType from resolution', () => {
    expect(source).toContain('entityType: resolution.entityType')
  })
})

// ─── Group 5: Dual context selector ───────────────────────────────────────────

describe('Stage 2 — dual context selector (source audit)', () => {
  let source: string

  beforeAll(() => {
    source = fs.readFileSync(PAGE_PATH, 'utf-8')
  })

  test('selector shows both context options as links', () => {
    expect(source).toContain('?context=management')
    expect(source).toContain('?context=investment')
  })

  test('selector displays correct labels', () => {
    expect(source).toContain('Owner Management Statement')
    expect(source).toContain('Investment Statement')
  })

  test('selector shows property names for each context', () => {
    expect(source).toContain('managedCtx.managedProperties.map')
    expect(source).toContain('investmentCtx.investmentProperties.map')
  })

  test('ContextSelector component exists in page', () => {
    expect(source).toContain('function ContextSelector')
    expect(source).toContain('<ContextSelector')
  })
})

// ─── Group 6: Old pipeline preservation ───────────────────────────────────────

describe('Stage 2 — old pipeline preservation', () => {
  test('old pipeline files still exist (consumed by /partner/[slug]/statement)', () => {
    const projectRoot = path.resolve(__dirname, '../..')
    const requiredFiles = [
      'lib/statements/statementAuthService.ts',
      'lib/statements/statementBuilderService.ts',
      'components/partner/StatementPreview.tsx',
      'components/owners/ConstitutionalTracePanel.tsx',
    ]
    for (const relPath of requiredFiles) {
      const fullPath = path.join(projectRoot, relPath)
      expect(fs.existsSync(fullPath)).toBe(true)
    }
  })

  test('partner route still uses orchestrateStatementRequest', () => {
    const partnerPage = path.resolve(
      __dirname,
      '../../app/partner/[slug]/statement/page.tsx',
    )
    if (fs.existsSync(partnerPage)) {
      const source = fs.readFileSync(partnerPage, 'utf-8')
      expect(source).toContain('orchestrateStatementRequest')
    }
  })

  test('owners statement page does NOT import old pipeline functions', () => {
    const source = fs.readFileSync(PAGE_PATH, 'utf-8')
    expect(source).not.toContain('orchestrateStatementRequest')
    expect(source).not.toContain('buildStatementPreview')
    expect(source).not.toContain('buildConstitutionalTrace')
    // Check import lines, not comments
    const importLines = source.split('\n').filter(l => l.startsWith('import'))
    const hasOldImport = importLines.some(l =>
      l.includes('StatementPreview') ||
      l.includes('ConstitutionalTracePanel') ||
      l.includes('StatementPropertySelector')
    )
    expect(hasOldImport).toBe(false)
  })
})

// ─── Group 7: Architectural constraints ───────────────────────────────────────

describe('Stage 2 — architectural constraints (source audit)', () => {
  let source: string

  beforeAll(() => {
    source = fs.readFileSync(PAGE_PATH, 'utf-8')
  })

  test('is a server component (server-only import)', () => {
    expect(source).toContain("import 'server-only'")
  })

  test('uses force-dynamic', () => {
    expect(source).toContain("export const dynamic = 'force-dynamic'")
  })

  test('no use client directive', () => {
    expect(source).not.toContain("'use client'")
  })

  test('no direct Supabase imports', () => {
    expect(source).not.toContain("from '@/lib/supabase'")
    expect(source).not.toContain('createServiceClient')
    expect(source).not.toContain('createSupabaseBrowserClient')
  })

  test('no direct transaction table access', () => {
    expect(source).not.toContain('.from(')
    expect(source).not.toContain('.select(')
  })

  test('no accounting logic in page', () => {
    expect(source).not.toContain('.reduce(')
    expect(source).not.toContain('Math.')
    expect(source).not.toContain('parseFloat')
    expect(source).not.toContain('parseInt')
  })

  test('back link goes to /owners/[slug]?tab=financial', () => {
    const backLinks = source.match(/\/owners\/\$\{slug\}\?tab=financial/g)
    expect(backLinks).not.toBeNull()
    expect(backLinks!.length).toBeGreaterThanOrEqual(3)
  })
})
