/**
 * @module dal/resolvePrincipal
 * @description DAL v0.1 — Principal resolution from authenticated session.
 *
 * Resolves the requesting user's identity and business scope.
 * Follows the two-client pattern established by partnerAuthService:
 *   1. sessionClient (cookie-aware, anon key) → auth.getUser()
 *   2. serviceClient (service-role) → user_roles query
 *
 * Server-only — imports 'server-only' and 'next/headers'.
 *
 * Fail-closed:
 *   - No session → NO_SESSION
 *   - No user_roles record → NO_ROLE
 *   - Inactive role → ROLE_INACTIVE
 *
 * @see partnerAuthService.ts — established the two-client pattern
 * @see reportAuthorization.ts — established the user_roles query pattern
 * @see ADR-003_DECISION_ACCESS_LAYER.md — DAL v0.1 scope
 */

import 'server-only'

import { createSupabaseServerClient } from '@/lib/supabaseServer'
import { createServiceClient } from '@/lib/supabase'
import type { PrincipalContext, PrincipalResolutionResult } from './types'
import { JJ_COMPANY_ID } from './policies'

// ─── Internal types ───────────────────────────────────────────────────────

interface UserRoleRow {
  role: string
  full_name: string
  is_active: boolean
}

// ─── Principal resolver ───────────────────────────────────────────────────

/**
 * Resolve the current authenticated user to a PrincipalContext.
 *
 * Authorization chain:
 *   1. Read session cookie via createSupabaseServerClient()
 *   2. Verify session via auth.getUser() (server-side token validation)
 *   3. Query user_roles via createServiceClient() (service-role, bypasses RLS)
 *   4. Build PrincipalContext from verified data
 *
 * SECURITY:
 * - createServiceClient() is NEVER called before auth.getUser() succeeds.
 * - User identity is derived from the cookie-bound session, never from caller input.
 * - Fail-closed on every path — DB errors are treated as resolution failures.
 *
 * v0.1 limitations:
 * - Entity-level scope is NOT resolved here (would require lifecycle schema queries).
 *   For M0, all decisions are company-wide (no entity scope needed).
 * - Only user_roles is queried — investor_auth is not consulted.
 *   DAL v0.1 + M0 does not serve partner-facing decisions.
 */
export async function resolvePrincipal(): Promise<PrincipalResolutionResult> {
  // ── Step 1: Resolve session via cookie-aware client ───────────────────
  const sessionClient = createSupabaseServerClient()
  const {
    data: { user },
    error: authError,
  } = await sessionClient.auth.getUser()

  if (authError || !user) {
    return { ok: false, error: 'NO_SESSION' }
  }

  // ── Step 2: Query user_roles (service-role — ONLY after auth succeeds) ─
  const db = createServiceClient()

  const { data, error: roleError } = await db
    .from('user_roles')
    .select('role, full_name, is_active')
    .eq('user_id', user.id)
    .maybeSingle()

  if (roleError || !data) {
    return { ok: false, error: 'NO_ROLE' }
  }

  const roleRecord = data as UserRoleRow

  if (!roleRecord.is_active) {
    return { ok: false, error: 'ROLE_INACTIVE' }
  }

  // ── Step 3: Build PrincipalContext ────────────────────────────────────
  // v0.1: Single company, no entity scope resolution.
  // Entity scopes would be populated from lifecycle.investor_auth + partner_entry
  // in a future version when DAL evaluates entity-scoped decisions.
  const principal: PrincipalContext = {
    userId: user.id,
    companyIds: [JJ_COMPANY_ID],
    roles: [roleRecord.role],
    entityScopes: [],
  }

  return { ok: true, principal }
}
