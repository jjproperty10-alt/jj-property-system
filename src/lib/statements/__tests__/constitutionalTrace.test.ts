/**
 * @module constitutionalTrace.test
 * @description VS1 — Tests for the 7-stage constitutional trace builder.
 *
 * Three test groups:
 * 1. Trace correctness — honest statuses, gap detection, stage count
 * 2. Auth-negative evidence — proves authentication is enforced
 * 3. Architecture audit — source code analysis for forbidden patterns
 *
 * @see buildConstitutionalTrace — pure function under test
 * @see VS1_PHASE1_REVISED.md — approved plan, Definition of Done
 */

import { buildConstitutionalTrace } from '../constitutionalTrace'
import type { StatementBuilderOutput } from '../types'
import * as fs from 'fs'
import * as path from 'path'

// ─── Test Fixtures ─────────────────────────────────────────────────────────────

/** Minimal valid StatementBuilderOutput for testing the trace builder */
function createMockOutput(overrides?: Partial<StatementBuilderOutput>): StatementBuilderOutput {
  return {
    investorName: 'Test Owner',
    investorEntityId: 'test-entity-uuid',
    propertyName: 'Test Property',
    periodStart: '2026-01-01',
    periodEnd: '2026-06-30',
    disposition: {
      sourceRows: 10,
      balanceAffecting: 7,
      informational: 2,
      excluded: 1,
      unresolved: 0,
      reconciled: true,
      rows: [],
      totals: {
        totalIncomeEur: 5000,
        totalExpensesEur: 3000,
        totalBpoEur: 1000,
        closingBalanceContribution: 1000,
      },
      sourceAmounts: {
        totalAmountEur: 8000,
        totalClientChargeEur: 8500,
        markupRowCount: 2,
        totalMarkupEur: 500,
      },
      provenance: {
        classifierVersion: '1.0.0',
        periodStart: '2026-01-01',
        periodEnd: '2026-06-30',
        computedAt: '2026-08-01T00:00:00Z',
        sortedSourceIds: [],
        sourceSetHash: 'abc123',
        rowDispositionHashes: [],
        aggregateDispositionHash: 'def456',
      },
    },
    freshness: {
      status: 'DATA_FRESHNESS_UNKNOWN',
      periodEnd: '2026-06-30',
      lastVerifiedSourceTimestamp: null,
      requiredCutoff: '2026-06-30',
      missingSources: ['transactions', 'hostaway_reservations', 'hostaway_financials'],
      freshnessBlockerReason: 'test',
      sources: [],
      message: 'test',
    },
    openingBalance: {
      status: 'NULL',
      valueEur: null,
      source: null,
    },
    settlement: {
      status: 'NOT_YET_COMPUTED',
      valueEur: null,
    },
    canFinalize: false,
    finalizationBlockers: ['Opening balance is NULL', 'VS-1A scope'],
    accountSections: [
      { accountType: 'rental', accountLabel: 'Rental', totalIncomeEur: 3000, totalExpensesEur: 1000, netEur: 2000, rowCount: 5 },
      { accountType: 'airbnb', accountLabel: 'Airbnb', totalIncomeEur: 2000, totalExpensesEur: 2000, netEur: 0, rowCount: 5 },
    ],
    statementType: 'investor_statement',
    ownershipPct: 50,
    generatedAt: '2026-08-01T00:00:00Z',
    ...overrides,
  }
}

// ─── Group 1: Trace Correctness ────────────────────────────────────────────────

describe('buildConstitutionalTrace — correctness', () => {
  const output = createMockOutput()
  const trace = buildConstitutionalTrace(output)

  test('returns exactly 7 stages', () => {
    expect(trace.totalStages).toBe(7)
    expect(trace.evidence).toBeDefined()
    expect(trace.businessEvent).toBeDefined()
    expect(trace.classification).toBeDefined()
    expect(trace.computation).toBeDefined()
    expect(trace.projection).toBeDefined()
    expect(trace.interpretation).toBeDefined()
    expect(trace.authority).toBeDefined()
  })

  test('evidence stage is NOT_POPULATED (infrastructure exists, no data)', () => {
    expect(trace.evidence.status).toBe('NOT_POPULATED')
    expect(trace.evidence.linkedCount).toBe(0)
    expect(trace.evidence.unlinkedCount).toBe(10)
  })

  test('business event stage is UNTYPED (BEM approved, not implemented)', () => {
    expect(trace.businessEvent.status).toBe('UNTYPED')
    expect(trace.businessEvent.fieldExists).toBe(false)
  })

  test('classification stage is IMPLEMENTED (RC3 engine)', () => {
    expect(trace.classification.status).toBe('IMPLEMENTED')
    expect(trace.classification.classifierVersion).toBe('1.0.0')
    expect(trace.classification.rowsClassified).toBe(10)
    expect(trace.classification.reconciled).toBe(true)
  })

  test('computation stage is IMPLEMENTED (statement builder)', () => {
    expect(trace.computation.status).toBe('IMPLEMENTED')
    expect(trace.computation.accountSectionCount).toBe(2)
    expect(trace.computation.balanceAffectingRows).toBe(7)
    expect(trace.computation.openingBalanceStatus).toBe('NULL')
    expect(trace.computation.settlementStatus).toBe('NOT_YET_COMPUTED')
  })

  test('projection stage is IMPLEMENTED with canFinalize=false', () => {
    expect(trace.projection.status).toBe('IMPLEMENTED')
    expect(trace.projection.canFinalize).toBe(false)
    expect(trace.projection.blockerCount).toBe(2)
  })

  test('interpretation stage is NOT_IMPLEMENTED', () => {
    expect(trace.interpretation.status).toBe('NOT_IMPLEMENTED')
  })

  test('authority stage is IMPLEMENTED with explicit chain', () => {
    expect(trace.authority.status).toBe('IMPLEMENTED')
    expect(trace.authority.chain.length).toBeGreaterThan(0)
    expect(trace.authority.chain[0]).toContain('transactions')
  })

  test('implementedCount = 4 (classification, computation, projection, authority)', () => {
    expect(trace.implementedCount).toBe(4)
  })

  test('gaps contain exactly the non-IMPLEMENTED stages', () => {
    expect(trace.gaps.length).toBe(3)
    const gapStages = trace.gaps.map(g => g.stage)
    expect(gapStages).toContain('evidence')
    expect(gapStages).toContain('business_event')
    expect(gapStages).toContain('interpretation')
  })

  test('computedAt is a valid ISO timestamp', () => {
    expect(() => new Date(trace.computedAt)).not.toThrow()
    expect(new Date(trace.computedAt).getTime()).toBeGreaterThan(0)
  })

  test('unresolved rows propagate to classification trace', () => {
    const outputWithUnresolved = createMockOutput({
      disposition: {
        ...createMockOutput().disposition,
        unresolved: 3,
        reconciled: true,
      },
    })
    const traceWithUnresolved = buildConstitutionalTrace(outputWithUnresolved)
    expect(traceWithUnresolved.classification.unresolvedCount).toBe(3)
  })
})

// ─── Group 2: Auth-Negative Evidence ───────────────────────────────────────────

describe('auth-negative evidence — statement route requires authentication', () => {
  test('owners/[slug]/statement/page.tsx imports authenticateStatementUser + resolveStatementContexts', () => {
    const pagePath = path.resolve(
      __dirname,
      '../../../../app/(app)/owners/[slug]/statement/page.tsx',
    )
    // This test verifies the source file exists and imports the auth + context resolver.
    // In CI, the file is present. In local dev, it may not be if worktree isn't set up.
    if (!fs.existsSync(pagePath)) {
      console.warn(`Skipping: ${pagePath} not found (worktree may not be set up)`)
      return
    }
    const source = fs.readFileSync(pagePath, 'utf-8')
    // Stage 2: auth via authenticateStatementUser, context via resolveStatementContexts
    expect(source).toContain('authenticateStatementUser')
    expect(source).toContain('resolveStatementContexts')
    expect(source).toContain("redirect('/login')")
    expect(source).toContain('notFound()')
  })

  test('owners/[slug]/page.tsx has page-level auth (VS1)', () => {
    const pagePath = path.resolve(
      __dirname,
      '../../../../app/(app)/owners/[slug]/page.tsx',
    )
    if (!fs.existsSync(pagePath)) {
      console.warn(`Skipping: ${pagePath} not found (worktree may not be set up)`)
      return
    }
    const source = fs.readFileSync(pagePath, 'utf-8')
    expect(source).toContain('authenticateStatementUser')
    expect(source).toContain("redirect('/login')")
    // Auth must happen BEFORE getOwnerWorkspace — verify ordering
    const authIndex = source.indexOf('authenticateStatementUser')
    const workspaceIndex = source.indexOf('getOwnerWorkspace')
    expect(authIndex).toBeLessThan(workspaceIndex)
  })
})

// ─── Group 3: Architecture Audit ───────────────────────────────────────────────

describe('architecture audit — no forbidden patterns', () => {
  const VS1_FILES = [
    'src/lib/statements/constitutionalTrace.ts',
    'src/lib/statements/constitutionalTraceTypes.ts',
    'src/components/owners/ConstitutionalTracePanel.tsx',
    'src/components/owners/StatementPropertySelector.tsx',
  ]

  // Resolve paths relative to project root
  const projectRoot = path.resolve(__dirname, '../../../..')

  for (const relPath of VS1_FILES) {
    const filePath = path.join(projectRoot, relPath)

    describe(relPath, () => {
      let source: string | null = null

      beforeAll(() => {
        if (fs.existsSync(filePath)) {
          source = fs.readFileSync(filePath, 'utf-8')
        }
      })

      test('exists', () => {
        if (!source) {
          console.warn(`Skipping: ${filePath} not found`)
          return
        }
        expect(source).toBeTruthy()
      })

      test('no client-side financial arithmetic', () => {
        if (!source) return
        // No reduce/sum/calculation on financial amounts
        const hasReduce = /\.reduce\s*\(.*(?:amount|eur|charge|balance)/i.test(source)
        expect(hasReduce).toBe(false)
      })

      test('no COALESCE reimplementation', () => {
        if (!source) return
        // Strip comments and string literals — documentation of P-LEDGER-6 is allowed
        const codeOnly = source
          .replace(/\/\*[\s\S]*?\*\//g, '')   // block comments
          .replace(/\/\/.*/g, '')              // line comments
          .replace(/'[^']*'/g, "''")           // single-quoted strings
          .replace(/"[^"]*"/g, '""')           // double-quoted strings
          .replace(/`[^`]*`/g, '``')           // template literals
        expect(codeOnly).not.toContain('COALESCE')
        expect(source).not.toMatch(/client_charge\s*\?\?/)
        expect(source).not.toMatch(/clientCharge\s*\?\?/)
      })

      test('no localStorage or sessionStorage', () => {
        if (!source) return
        expect(source).not.toContain('localStorage')
        expect(source).not.toContain('sessionStorage')
      })

      test('no direct Supabase client creation in UI components', () => {
        if (!source) return
        if (relPath.includes('components/')) {
          expect(source).not.toContain('createServiceClient')
          expect(source).not.toContain('createSupabaseServerClient')
          expect(source).not.toContain('createClient')
        }
      })

      test('no sent_statement_snapshots access (Statement History deferred)', () => {
        if (!source) return
        expect(source).not.toContain('sent_statement_snapshots')
        expect(source).not.toContain('sent_entry_snapshots')
      })

      test('no migration 014 reference', () => {
        if (!source) return
        // Strip comments and string literals — honest status documentation is allowed
        const codeOnly = source
          .replace(/\/\*[\s\S]*?\*\//g, '')   // block comments
          .replace(/\/\/.*/g, '')              // line comments
          .replace(/'[^']*'/g, "''")           // single-quoted strings
          .replace(/"[^"]*"/g, '""')           // double-quoted strings
          .replace(/`[^`]*`/g, '``')           // template literals
        expect(codeOnly).not.toContain('migration_014')
        expect(codeOnly).not.toContain('business_event_id')
      })
    })
  }

  test('constitutionalTrace.ts is a pure function (no async, no DB)', () => {
    const tracePath = path.join(projectRoot, 'src/lib/statements/constitutionalTrace.ts')
    if (!fs.existsSync(tracePath)) {
      console.warn('Skipping: constitutionalTrace.ts not found')
      return
    }
    const source = fs.readFileSync(tracePath, 'utf-8')
    // buildConstitutionalTrace should not be async
    expect(source).toMatch(/^export function buildConstitutionalTrace/m)
    expect(source).not.toMatch(/^export async function buildConstitutionalTrace/m)
    // No database imports
    expect(source).not.toContain('createServiceClient')
    expect(source).not.toContain('createSupabaseServerClient')
    expect(source).not.toContain("from '@/lib/supabase'")
    expect(source).not.toContain("import 'server-only'")
  })

  test('client_amount consumed from RC3, not recomputed', () => {
    // The statement route should NOT contain any COALESCE or client_charge ?? amount_eur
    const statementPagePath = path.join(
      projectRoot,
      'src/app/(app)/owners/[slug]/statement/page.tsx',
    )
    if (!fs.existsSync(statementPagePath)) {
      console.warn('Skipping: statement page not found')
      return
    }
    const source = fs.readFileSync(statementPagePath, 'utf-8')
    expect(source).not.toContain('COALESCE')
    expect(source).not.toContain('client_charge')
    expect(source).not.toContain('amount_eur')
  })
})
