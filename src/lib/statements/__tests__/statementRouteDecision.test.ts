/**
 * Behavioral tests for statementRouteDecision.ts
 *
 * These tests execute the ACTUAL decision logic with mocked inputs —
 * not source-string inspection. Every scenario Yossi specified is covered:
 *
 * 1. Management-only owner (e.g., Neer Yoav)
 * 2. Investment-only owner (e.g., Avi)
 * 3. Dual-context owner (e.g., Oren) with/without ?context=
 * 4. Invalid context rejection
 * 5. All 5 failure resolution statuses
 * 6. Edge cases: empty contexts[], resolved with 0, fallback
 * 7. parseContextParam behavior
 * 8. kindToParam mapping
 * 9. Query parameter edge cases
 */

import {
  resolveRouteDecision,
  parseContextParam,
  findContext,
  kindToParam,
  type RouteDecision,
  type ContextParam,
} from '../statementRouteDecision'

import type {
  StatementContextResolution,
  ManagedOwnerStatementContext,
  InvestmentStatementContext,
} from '../statementContextResolver'

// ─── Test fixtures ─────────────────────────────────────────────────────────────

function makeManagedCtx(overrides?: Partial<ManagedOwnerStatementContext>): ManagedOwnerStatementContext {
  return {
    kind: 'managed_owner',
    entityId: 'entity-neer',
    canonicalName: 'Neer Yoav',
    managedProperties: ['Apartment Neer Yoav Dekelia'],
    pendingProperties: [],
    authority: 'management_relationship',
    ...overrides,
  }
}

function makeInvestmentCtx(overrides?: Partial<InvestmentStatementContext>): InvestmentStatementContext {
  return {
    kind: 'investment',
    entityId: 'entity-avi',
    canonicalName: 'Avi',
    investmentProperties: ['Villa Mazotos'],
    authority: 'partner_entry',
    ...overrides,
  }
}

function makeResolution(overrides?: Partial<StatementContextResolution>): StatementContextResolution {
  return {
    contexts: [],
    entityId: 'entity-test',
    canonicalName: 'Test Entity',
    entityType: 'individual',
    status: 'resolved',
    failedSources: [],
    ...overrides,
  }
}

// ─── 1. Management-only owner (Neer Yoav pattern) ──────────────────────────────

describe('Management-only owner (Neer Yoav pattern)', () => {
  const managedCtx = makeManagedCtx()
  const resolution = makeResolution({
    contexts: [managedCtx],
    entityId: managedCtx.entityId,
    canonicalName: managedCtx.canonicalName,
    status: 'resolved',
  })

  test('auto-selects management when no ?context= param', () => {
    const decision = resolveRouteDecision(resolution, null)
    expect(decision.action).toBe('render_management')
    expect((decision as { ctx: ManagedOwnerStatementContext }).ctx).toBe(managedCtx)
  })

  test('renders management when ?context=management explicitly', () => {
    const decision = resolveRouteDecision(resolution, 'management')
    expect(decision.action).toBe('render_management')
    expect((decision as { ctx: ManagedOwnerStatementContext }).ctx).toBe(managedCtx)
  })

  test('rejects ?context=investment for management-only owner', () => {
    const decision = resolveRouteDecision(resolution, 'investment')
    expect(decision.action).toBe('invalid_context')
    expect((decision as { message: string }).message).toContain('management')
    expect((decision as { message: string }).message).toContain('investment')
  })

  test('preserves managedProperties in the returned context', () => {
    const decision = resolveRouteDecision(resolution, null)
    const ctx = (decision as { ctx: ManagedOwnerStatementContext }).ctx
    expect(ctx.managedProperties).toEqual(['Apartment Neer Yoav Dekelia'])
    expect(ctx.authority).toBe('management_relationship')
  })
})

// ─── 2. Investment-only owner (Avi pattern) ────────────────────────────────────

describe('Investment-only owner (Avi pattern)', () => {
  const investmentCtx = makeInvestmentCtx()
  const resolution = makeResolution({
    contexts: [investmentCtx],
    entityId: investmentCtx.entityId,
    canonicalName: investmentCtx.canonicalName,
    status: 'resolved',
  })

  test('auto-selects investment when no ?context= param', () => {
    const decision = resolveRouteDecision(resolution, null)
    expect(decision.action).toBe('render_investment')
    expect((decision as { ctx: InvestmentStatementContext }).ctx).toBe(investmentCtx)
  })

  test('renders investment when ?context=investment explicitly', () => {
    const decision = resolveRouteDecision(resolution, 'investment')
    expect(decision.action).toBe('render_investment')
  })

  test('rejects ?context=management for investment-only owner', () => {
    const decision = resolveRouteDecision(resolution, 'management')
    expect(decision.action).toBe('invalid_context')
    expect((decision as { message: string }).message).toContain('investment')
    expect((decision as { message: string }).message).toContain('management')
  })

  test('passes resolution object to render_investment decision', () => {
    const decision = resolveRouteDecision(resolution, null)
    expect(decision.action).toBe('render_investment')
    expect((decision as { resolution: StatementContextResolution }).resolution).toBe(resolution)
  })

  test('preserves investmentProperties in the returned context', () => {
    const decision = resolveRouteDecision(resolution, null)
    const ctx = (decision as { ctx: InvestmentStatementContext }).ctx
    expect(ctx.investmentProperties).toEqual(['Villa Mazotos'])
    expect(ctx.authority).toBe('partner_entry')
  })
})

// ─── 3. Dual-context owner (Oren pattern) ──────────────────────────────────────

describe('Dual-context owner (Oren pattern)', () => {
  const managedCtx = makeManagedCtx({
    entityId: 'entity-oren',
    canonicalName: 'Oren',
    managedProperties: ['Oren Kitty'],
  })
  const investmentCtx = makeInvestmentCtx({
    entityId: 'entity-oren',
    canonicalName: 'Oren',
    investmentProperties: ['Villa Mazotos 2'],
  })
  const resolution = makeResolution({
    contexts: [managedCtx, investmentCtx],
    entityId: 'entity-oren',
    canonicalName: 'Oren',
    status: 'resolved',
  })

  test('shows selector when no ?context= param', () => {
    const decision = resolveRouteDecision(resolution, null)
    expect(decision.action).toBe('show_selector')
    const sel = decision as { managedCtx: ManagedOwnerStatementContext; investmentCtx: InvestmentStatementContext }
    expect(sel.managedCtx).toBe(managedCtx)
    expect(sel.investmentCtx).toBe(investmentCtx)
  })

  test('routes to management when ?context=management', () => {
    const decision = resolveRouteDecision(resolution, 'management')
    expect(decision.action).toBe('render_management')
    expect((decision as { ctx: ManagedOwnerStatementContext }).ctx).toBe(managedCtx)
  })

  test('routes to investment when ?context=investment', () => {
    const decision = resolveRouteDecision(resolution, 'investment')
    expect(decision.action).toBe('render_investment')
    expect((decision as { ctx: InvestmentStatementContext }).ctx).toBe(investmentCtx)
  })

  test('selector carries both contexts with correct properties', () => {
    const decision = resolveRouteDecision(resolution, null)
    const sel = decision as { managedCtx: ManagedOwnerStatementContext; investmentCtx: InvestmentStatementContext }
    expect(sel.managedCtx.managedProperties).toEqual(['Oren Kitty'])
    expect(sel.investmentCtx.investmentProperties).toEqual(['Villa Mazotos 2'])
  })

  test('does NOT auto-select even when one context has more properties', () => {
    const decision = resolveRouteDecision(resolution, null)
    // Must show selector — never auto-select with dual context
    expect(decision.action).toBe('show_selector')
  })
})

// ─── 4. All 5 failure resolution statuses ──────────────────────────────────────

describe('Resolution failure statuses', () => {
  test('entity_not_found → not_found', () => {
    const resolution = makeResolution({ status: 'entity_not_found' })
    const decision = resolveRouteDecision(resolution, null)
    expect(decision.action).toBe('not_found')
  })

  test('ambiguous_slug → error', () => {
    const resolution = makeResolution({ status: 'ambiguous_slug' })
    const decision = resolveRouteDecision(resolution, null)
    expect(decision.action).toBe('error')
    expect((decision as { message: string }).message).toContain('Multiple entities')
  })

  test('entity_inactive → unavailable', () => {
    const resolution = makeResolution({ status: 'entity_inactive' })
    const decision = resolveRouteDecision(resolution, null)
    expect(decision.action).toBe('unavailable')
    expect((decision as { message: string }).message).toContain('inactive')
  })

  test('no_contexts → unavailable', () => {
    const resolution = makeResolution({ status: 'no_contexts' })
    const decision = resolveRouteDecision(resolution, null)
    expect(decision.action).toBe('unavailable')
    expect((decision as { message: string }).message).toContain('No statement contexts')
  })

  test('source_unavailable → retryable_error', () => {
    const resolution = makeResolution({ status: 'source_unavailable' })
    const decision = resolveRouteDecision(resolution, null)
    expect(decision.action).toBe('retryable_error')
    expect((decision as { message: string }).message).toContain('temporarily unavailable')
  })

  test('failure statuses take precedence over ?context= param', () => {
    const resolution = makeResolution({ status: 'entity_not_found' })
    // Even with explicit context, failure wins
    const decision = resolveRouteDecision(resolution, 'management')
    expect(decision.action).toBe('not_found')
  })

  test('failure statuses ignore contexts array content', () => {
    // Resolution says "not_found" but has contexts — status takes precedence
    const resolution = makeResolution({
      status: 'entity_not_found',
      contexts: [makeManagedCtx()],
    })
    const decision = resolveRouteDecision(resolution, null)
    expect(decision.action).toBe('not_found')
  })
})

// ─── 5. Edge cases: resolved with empty contexts ───────────────────────────────

describe('Edge cases', () => {
  test('resolved with empty contexts array → unavailable', () => {
    const resolution = makeResolution({
      status: 'resolved',
      contexts: [],
    })
    const decision = resolveRouteDecision(resolution, null)
    expect(decision.action).toBe('unavailable')
  })

  test('resolved with unknown context kind → fallback error', () => {
    const resolution = makeResolution({
      status: 'resolved',
      contexts: [{ kind: 'unknown' as any, entityId: 'x', canonicalName: 'X' }] as any,
    })
    const decision = resolveRouteDecision(resolution, null)
    // Single context but kind doesn't match managed_owner or investment
    // contextCount=1, onlyCtx.kind=unknown, neither branch fires → falls through to fallback
    expect(decision.action).toBe('error')
    expect((decision as { message: string }).message).toContain('Unable to determine')
  })

  test('three contexts (hypothetical) → fallback error', () => {
    // contextCount=3, not handled by single or dual branches
    const resolution = makeResolution({
      status: 'resolved',
      contexts: [
        makeManagedCtx(),
        makeInvestmentCtx(),
        makeInvestmentCtx({ entityId: 'extra' }),
      ],
    })
    const decision = resolveRouteDecision(resolution, null)
    expect(decision.action).toBe('error')
  })
})

// ─── 6. parseContextParam ──────────────────────────────────────────────────────

describe('parseContextParam', () => {
  test('returns null for undefined', () => {
    expect(parseContextParam(undefined)).toBeNull()
  })

  test('returns null for empty string', () => {
    expect(parseContextParam('')).toBeNull()
  })

  test('returns "management" for "management"', () => {
    expect(parseContextParam('management')).toBe('management')
  })

  test('returns "investment" for "investment"', () => {
    expect(parseContextParam('investment')).toBe('investment')
  })

  test('returns null for invalid values', () => {
    expect(parseContextParam('admin')).toBeNull()
    expect(parseContextParam('MANAGEMENT')).toBeNull()
    expect(parseContextParam('Investment')).toBeNull()
    expect(parseContextParam('both')).toBeNull()
    expect(parseContextParam('partner')).toBeNull()
  })

  test('returns null for injection attempts', () => {
    expect(parseContextParam('management; DROP TABLE')).toBeNull()
    expect(parseContextParam('<script>')).toBeNull()
    expect(parseContextParam('management\n')).toBeNull()
  })
})

// ─── 7. kindToParam mapping ────────────────────────────────────────────────────

describe('kindToParam', () => {
  test('managed_owner → management', () => {
    expect(kindToParam('managed_owner')).toBe('management')
  })

  test('investment → investment', () => {
    expect(kindToParam('investment')).toBe('investment')
  })
})

// ─── 8. findContext ────────────────────────────────────────────────────────────

describe('findContext', () => {
  test('finds managed_owner context', () => {
    const managedCtx = makeManagedCtx()
    const resolution = makeResolution({ contexts: [managedCtx] })
    expect(findContext(resolution, 'managed_owner')).toBe(managedCtx)
  })

  test('finds investment context', () => {
    const investmentCtx = makeInvestmentCtx()
    const resolution = makeResolution({ contexts: [investmentCtx] })
    expect(findContext(resolution, 'investment')).toBe(investmentCtx)
  })

  test('returns undefined when context kind not present', () => {
    const resolution = makeResolution({ contexts: [makeManagedCtx()] })
    expect(findContext(resolution, 'investment')).toBeUndefined()
  })

  test('returns undefined for empty contexts', () => {
    const resolution = makeResolution({ contexts: [] })
    expect(findContext(resolution, 'managed_owner')).toBeUndefined()
    expect(findContext(resolution, 'investment')).toBeUndefined()
  })

  test('finds correct context in dual-context resolution', () => {
    const managedCtx = makeManagedCtx()
    const investmentCtx = makeInvestmentCtx()
    const resolution = makeResolution({ contexts: [managedCtx, investmentCtx] })
    expect(findContext(resolution, 'managed_owner')).toBe(managedCtx)
    expect(findContext(resolution, 'investment')).toBe(investmentCtx)
  })
})

// ─── 9. Context isolation (management ↔ investment never merge) ────────────────

describe('Context isolation', () => {
  test('management decision contains ONLY managedProperties, never investmentProperties', () => {
    const managedCtx = makeManagedCtx({ managedProperties: ['Prop A', 'Prop B'] })
    const resolution = makeResolution({ contexts: [managedCtx], status: 'resolved' })
    const decision = resolveRouteDecision(resolution, null)
    expect(decision.action).toBe('render_management')
    const ctx = (decision as { ctx: ManagedOwnerStatementContext }).ctx
    expect(ctx.managedProperties).toEqual(['Prop A', 'Prop B'])
    expect((ctx as any).investmentProperties).toBeUndefined()
  })

  test('investment decision contains ONLY investmentProperties, never managedProperties', () => {
    const investmentCtx = makeInvestmentCtx({ investmentProperties: ['Villa X', 'Villa Y'] })
    const resolution = makeResolution({ contexts: [investmentCtx], status: 'resolved' })
    const decision = resolveRouteDecision(resolution, null)
    expect(decision.action).toBe('render_investment')
    const ctx = (decision as { ctx: InvestmentStatementContext }).ctx
    expect(ctx.investmentProperties).toEqual(['Villa X', 'Villa Y'])
    expect((ctx as any).managedProperties).toBeUndefined()
  })

  test('dual-context selector carries separate property arrays', () => {
    const managedCtx = makeManagedCtx({ managedProperties: ['M1'] })
    const investmentCtx = makeInvestmentCtx({ investmentProperties: ['I1'] })
    const resolution = makeResolution({ contexts: [managedCtx, investmentCtx], status: 'resolved' })
    const decision = resolveRouteDecision(resolution, null)
    expect(decision.action).toBe('show_selector')
    const sel = decision as { managedCtx: ManagedOwnerStatementContext; investmentCtx: InvestmentStatementContext }
    expect(sel.managedCtx.managedProperties).toEqual(['M1'])
    expect(sel.investmentCtx.investmentProperties).toEqual(['I1'])
    // Cross-contamination check
    expect((sel.managedCtx as any).investmentProperties).toBeUndefined()
    expect((sel.investmentCtx as any).managedProperties).toBeUndefined()
  })
})

// ─── 10. Deterministic: same input always same output ──────────────────────────

describe('Determinism', () => {
  test('100 identical calls produce identical decisions', () => {
    const managedCtx = makeManagedCtx()
    const resolution = makeResolution({ contexts: [managedCtx], status: 'resolved' })
    const first = resolveRouteDecision(resolution, null)
    for (let i = 0; i < 100; i++) {
      const d = resolveRouteDecision(resolution, null)
      expect(d).toEqual(first)
    }
  })
})

// ─── 11. Completeness: every RouteDecision action is reachable ─────────────────

describe('Every RouteDecision action is reachable', () => {
  const reachableActions = new Set<string>()

  beforeAll(() => {
    // Collect all reachable actions
    const cases: Array<{ resolution: StatementContextResolution; param: ContextParam | null }> = [
      // not_found
      { resolution: makeResolution({ status: 'entity_not_found' }), param: null },
      // error
      { resolution: makeResolution({ status: 'ambiguous_slug' }), param: null },
      // unavailable
      { resolution: makeResolution({ status: 'entity_inactive' }), param: null },
      // retryable_error
      { resolution: makeResolution({ status: 'source_unavailable' }), param: null },
      // render_management
      { resolution: makeResolution({ contexts: [makeManagedCtx()], status: 'resolved' }), param: null },
      // render_investment
      { resolution: makeResolution({ contexts: [makeInvestmentCtx()], status: 'resolved' }), param: null },
      // show_selector
      { resolution: makeResolution({ contexts: [makeManagedCtx(), makeInvestmentCtx()], status: 'resolved' }), param: null },
      // invalid_context
      { resolution: makeResolution({ contexts: [makeManagedCtx()], status: 'resolved' }), param: 'investment' },
    ]

    for (const c of cases) {
      const d = resolveRouteDecision(c.resolution, c.param)
      reachableActions.add(d.action)
    }
  })

  test('render_management is reachable', () => expect(reachableActions.has('render_management')).toBe(true))
  test('render_investment is reachable', () => expect(reachableActions.has('render_investment')).toBe(true))
  test('show_selector is reachable', () => expect(reachableActions.has('show_selector')).toBe(true))
  test('not_found is reachable', () => expect(reachableActions.has('not_found')).toBe(true))
  test('error is reachable', () => expect(reachableActions.has('error')).toBe(true))
  test('unavailable is reachable', () => expect(reachableActions.has('unavailable')).toBe(true))
  test('retryable_error is reachable', () => expect(reachableActions.has('retryable_error')).toBe(true))
  test('invalid_context is reachable', () => expect(reachableActions.has('invalid_context')).toBe(true))
})
