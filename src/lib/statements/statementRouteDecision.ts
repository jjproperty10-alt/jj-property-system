/**
 * @module statements/statementRouteDecision
 * @description Pure decision logic for the /owners/[slug]/statement route.
 *
 * Extracted from page.tsx for testability. This module contains ZERO
 * rendering, ZERO DB access, ZERO imports of React or Next.js.
 *
 * The page component calls resolveRouteDecision() and acts on the result.
 * Tests call resolveRouteDecision() directly with mocked inputs.
 *
 * Stage 2: Context-aware statement routing.
 */

import type {
  StatementContextResolution,
  ManagedOwnerStatementContext,
  InvestmentStatementContext,
} from './statementContextResolver'

// ─── Types ──────────────────────────────────────────────────────────────────────

export type ContextParam = 'management' | 'investment'

const VALID_CONTEXT_PARAMS = new Set<ContextParam>(['management', 'investment'])

/**
 * Route decision — what the page should do given auth, resolution, and query param.
 */
export type RouteDecision =
  | { action: 'render_management'; ctx: ManagedOwnerStatementContext }
  | { action: 'render_investment'; ctx: InvestmentStatementContext; resolution: StatementContextResolution }
  | { action: 'show_selector'; managedCtx: ManagedOwnerStatementContext; investmentCtx: InvestmentStatementContext }
  | { action: 'not_found' }
  | { action: 'error'; message: string }
  | { action: 'unavailable'; message: string }
  | { action: 'retryable_error'; message: string }
  | { action: 'invalid_context'; message: string }

// ─── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Parse and validate ?context= query parameter.
 * Returns null if absent or invalid (invalid = treated as absent).
 */
export function parseContextParam(raw: string | undefined): ContextParam | null {
  if (!raw) return null
  return VALID_CONTEXT_PARAMS.has(raw as ContextParam) ? (raw as ContextParam) : null
}

/**
 * Find a context by kind from the resolution.
 */
export function findContext<K extends 'managed_owner' | 'investment'>(
  resolution: StatementContextResolution,
  kind: K,
): K extends 'managed_owner' ? ManagedOwnerStatementContext | undefined : InvestmentStatementContext | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return resolution.contexts.find(c => c.kind === kind) as any
}

/**
 * Map context kind to query param value.
 */
export function kindToParam(kind: 'managed_owner' | 'investment'): ContextParam {
  return kind === 'managed_owner' ? 'management' : 'investment'
}

// ─── Decision function ──────────────────────────────────────────────────────────

/**
 * Pure decision function. No side effects, no rendering, no DB access.
 *
 * Given a resolution result and an optional context query parameter,
 * returns the action the page should take.
 */
export function resolveRouteDecision(
  resolution: StatementContextResolution,
  requestedContext: ContextParam | null,
): RouteDecision {
  // ── Handle resolution failures ────────────────────────────────────────────
  switch (resolution.status) {
    case 'entity_not_found':
      return { action: 'not_found' }
    case 'ambiguous_slug':
      return { action: 'error', message: 'Multiple entities match this identifier. Please contact support.' }
    case 'entity_inactive':
      return { action: 'unavailable', message: 'This entity is currently inactive. Statements are not available.' }
    case 'no_contexts':
      return { action: 'unavailable', message: 'No statement contexts are available for this entity. This owner may not have any managed properties or investment positions.' }
    case 'source_unavailable':
      return { action: 'retryable_error', message: 'One or more data sources are temporarily unavailable.' }
    case 'resolved':
      break
  }

  // ── Context routing ───────────────────────────────────────────────────────
  const managedCtx = findContext(resolution, 'managed_owner')
  const investmentCtx = findContext(resolution, 'investment')
  const contextCount = resolution.contexts.length

  // Safety: resolved status should always have at least one context
  if (contextCount === 0) {
    return { action: 'unavailable', message: 'No statement contexts available.' }
  }

  // ── Single context: auto-select ───────────────────────────────────────────
  if (contextCount === 1) {
    const onlyCtx = resolution.contexts[0]

    // Reject explicitly requested wrong context
    if (requestedContext !== null && requestedContext !== kindToParam(onlyCtx.kind)) {
      return {
        action: 'invalid_context',
        message: `This owner has only a ${onlyCtx.kind === 'managed_owner' ? 'management' : 'investment'} relationship. The requested "${requestedContext}" context is not available.`,
      }
    }

    if (onlyCtx.kind === 'managed_owner' && managedCtx) {
      return { action: 'render_management', ctx: managedCtx }
    }
    if (onlyCtx.kind === 'investment' && investmentCtx) {
      return { action: 'render_investment', ctx: investmentCtx, resolution }
    }
  }

  // ── Dual context: require explicit selection ──────────────────────────────
  if (contextCount === 2 && managedCtx && investmentCtx) {
    if (requestedContext === null) {
      return { action: 'show_selector', managedCtx, investmentCtx }
    }
    if (requestedContext === 'management') {
      return { action: 'render_management', ctx: managedCtx }
    }
    if (requestedContext === 'investment') {
      return { action: 'render_investment', ctx: investmentCtx, resolution }
    }
  }

  // Fallback (should not reach here with valid data)
  return { action: 'error', message: 'Unable to determine statement context. Please try again.' }
}
