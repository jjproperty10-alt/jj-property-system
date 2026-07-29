/**
 * @module statements/statementAuthService
 * @description VS-1A — Dual-client authentication + orchestration for statement operations.
 *
 * Two clients, two purposes:
 *
 *   1. Cookie-based server client (createSupabaseServerClient from @/lib/supabaseServer)
 *      - Preserves auth.uid() from the authenticated session
 *      - Required for P1-1 mutation RPCs (require_jj_staff() calls auth.uid())
 *      - NOT USED IN VS-1A (no mutations authorized)
 *
 *   2. Service-role client (createServiceClient from @/lib/supabase)
 *      - Bypasses RLS for reading lifecycle + RC3 data
 *      - auth.uid() returns NULL — cannot call require_jj_staff()
 *      - Used for: lifecycle reads, RC3 reads, statement preview
 *
 * HB5: orchestrateStatementRequest() enforces auth ordering:
 *   authenticate → resolve target → validate property → build preview
 *   Each step depends on the prior step succeeding. Order is non-negotiable.
 *
 * HB6: Uses canonical createSupabaseServerClient from @/lib/supabaseServer.
 *   No custom cookie client factory. Same pattern as resolvePrincipal.ts (DAL v0.1).
 *
 * @see P1-0 Gate — require_jj_staff() proven with auth.uid() = Yossi UUID
 * @see resolvePrincipal.ts — canonical two-client pattern
 * @see VS-1A STOP condition: no production mutation RPCs authorized
 */

import 'server-only'

import { createSupabaseServerClient } from '@/lib/supabaseServer'
import { createServiceClient } from '@/lib/supabase'

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface StatementAuthResult {
  readonly ok: true
  readonly userId: string
  readonly staffRole: string
  readonly isActive: boolean
}

export interface StatementAuthFailure {
  readonly ok: false
  readonly error: 'NO_SESSION' | 'NOT_STAFF' | 'STAFF_INACTIVE' | 'AUTH_ERROR'
}

// ─── Staff authentication ───────────────────────────────────────────────────────

/**
 * Authenticate the current user and verify they are active JJ staff.
 *
 * HB6: Uses canonical createSupabaseServerClient (same as resolvePrincipal.ts).
 *
 * Two clients:
 *   1. Cookie client (createSupabaseServerClient) → auth.getUser()
 *   2. Service client (createServiceClient) → jj_staff_config lookup (RLS-bypassed)
 *
 * @returns StatementAuthResult on success, StatementAuthFailure on failure
 */
export async function authenticateStatementUser(): Promise<
  StatementAuthResult | StatementAuthFailure
> {
  try {
    // Step 1: Get authenticated user from session (HB6: canonical helper)
    const sessionClient = createSupabaseServerClient()
    const { data: { user }, error: authError } = await sessionClient.auth.getUser()

    if (authError || !user) {
      return { ok: false, error: 'NO_SESSION' }
    }

    // Step 2: Verify JJ staff status (service-role for RLS bypass)
    const db = createServiceClient()
    const { data: staffRecord, error: staffError } = await db
      .from('jj_staff_config')
      .select('staff_role, is_active')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    if (staffError || !staffRecord) {
      return { ok: false, error: 'NOT_STAFF' }
    }

    const record = staffRecord as { staff_role: string; is_active: boolean }

    if (!record.is_active) {
      return { ok: false, error: 'STAFF_INACTIVE' }
    }

    return {
      ok: true,
      userId: user.id,
      staffRole: record.staff_role,
      isActive: true,
    }
  } catch {
    return { ok: false, error: 'AUTH_ERROR' }
  }
}

// ─── Investor entity resolver for statements ────────────────────────────────────

export interface ResolvedStatementTarget {
  readonly entityId: string
  readonly canonicalName: string
  readonly propertyNames: readonly string[]
}

/**
 * Resolve an investor slug to their entity + authorized properties.
 * Uses service-role client (lifecycle is RLS deny-all).
 *
 * @param investorSlug  URL slug e.g. 'avi'
 * @returns             Resolved target or null if not found
 */
export async function resolveStatementTarget(
  investorSlug: string,
): Promise<ResolvedStatementTarget | null> {
  const db = createServiceClient()

  // Load all investor-type entities
  const { data: entities } = await db
    .schema('lifecycle')
    .from('entity_identity')
    .select('id, canonical_name, entity_type')
    .in('entity_type', ['partner', 'investor'])

  if (!entities || entities.length === 0) return null

  type EntityRow = { id: string; canonical_name: string; entity_type: string }
  const matched = (entities as EntityRow[]).find(
    e => e.canonical_name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') === investorSlug.toLowerCase(),
  )

  if (!matched) return null

  // Load authorized properties
  const { data: entries } = await db
    .schema('lifecycle')
    .from('partner_entry')
    .select('property_name')
    .eq('entity_id', matched.id)
    .neq('status', 'void')

  if (!entries || entries.length === 0) return null

  const propertyNames = Array.from(
    new Set((entries as Array<{ property_name: string }>).map(e => e.property_name)),
  )

  return {
    entityId: matched.id,
    canonicalName: matched.canonical_name,
    propertyNames,
  }
}

// ─── Orchestration (HB5: enforced auth ordering) ─────────────────────────────────

/**
 * Errors returned by orchestrateStatementRequest when a step fails.
 */
export type OrchestrationError =
  | { step: 'authenticate'; error: StatementAuthFailure['error'] }
  | { step: 'resolve_target'; reason: 'NOT_FOUND' }
  | { step: 'validate_property'; reason: 'NO_PROPERTIES' | 'PROPERTY_NOT_AUTHORIZED'; requestedProperty?: string }

export interface OrchestrationSuccess {
  readonly ok: true
  readonly auth: StatementAuthResult
  readonly target: ResolvedStatementTarget
  /** The validated property name to use for the statement */
  readonly propertyName: string
}

export interface OrchestrationFailure {
  readonly ok: false
  readonly error: OrchestrationError
}

/**
 * Orchestrate the full authentication + resolution chain for a statement request.
 *
 * HB5: Enforces strict ordering — each step depends on the prior step succeeding.
 * The caller MUST use this function instead of calling authenticateStatementUser()
 * and resolveStatementTarget() independently.
 *
 * HB7: Explicit property selection. If requestedProperty is provided, it must
 * exist in the target's authorized property list. If not provided and the target
 * has exactly one property, it is used. Otherwise fails with NO_PROPERTIES or
 * PROPERTY_NOT_AUTHORIZED.
 *
 * @param investorSlug       URL slug (e.g. 'avi')
 * @param requestedProperty  Explicit property name, or undefined for single-property targets
 * @returns                  OrchestrationSuccess or OrchestrationFailure
 */
export async function orchestrateStatementRequest(
  investorSlug: string,
  requestedProperty?: string,
): Promise<OrchestrationSuccess | OrchestrationFailure> {
  // ── Step 1: Authenticate (must succeed before any data access) ──────────
  const auth = await authenticateStatementUser()
  if (!auth.ok) {
    return { ok: false, error: { step: 'authenticate', error: auth.error } }
  }

  // ── Step 2: Resolve investor target (requires authenticated context) ────
  const target = await resolveStatementTarget(investorSlug)
  if (!target) {
    return { ok: false, error: { step: 'resolve_target', reason: 'NOT_FOUND' } }
  }

  // ── Step 3: Validate property selection (HB7) ──────────────────────────
  if (target.propertyNames.length === 0) {
    return { ok: false, error: { step: 'validate_property', reason: 'NO_PROPERTIES' } }
  }

  let propertyName: string

  if (requestedProperty) {
    // Explicit property — must be in authorized list
    if (!target.propertyNames.includes(requestedProperty)) {
      return {
        ok: false,
        error: {
          step: 'validate_property',
          reason: 'PROPERTY_NOT_AUTHORIZED',
          requestedProperty,
        },
      }
    }
    propertyName = requestedProperty
  } else {
    // No explicit property — only allowed when target has exactly one
    if (target.propertyNames.length !== 1) {
      return {
        ok: false,
        error: {
          step: 'validate_property',
          reason: 'NO_PROPERTIES',  // ambiguous — multiple properties, none selected
        },
      }
    }
    propertyName = target.propertyNames[0]
  }

  return { ok: true, auth, target, propertyName }
}
