/**
 * @module nav/resolveFrameUser
 * @description NAV-1 — Server-side user resolution for the Operating Frame.
 *
 * Resolves the authenticated user to a FrameUser for the Operating Frame.
 * Uses the same two-client pattern established by partnerAuthService and resolvePrincipal:
 *   1. sessionClient (cookie-aware, anon key) → auth.getUser()
 *   2. serviceClient (service-role) → user_roles query
 *
 * Server-only — imports 'server-only'.
 *
 * Fail-closed:
 *   - No session → null (login page renders without frame)
 *   - No user_roles record → null
 *   - Any error → null
 *
 * This function is called in layout.tsx on every request.
 * It MUST NOT throw, MUST NOT log errors for unauthenticated users,
 * and MUST return quickly when there is no session.
 *
 * NEEDS_CEO_ROLE_CONTRACT: 'superadmin' is mapped to 'ceo' as a temporary proxy.
 * When jj_staff_config is the production role source, this mapping will be updated.
 *
 * @see resolvePrincipal.ts — established the two-client pattern
 * @see NAV-1_PHASE3_COMPONENT_CONTRACTS.md — OperatingFrame inputs
 */

import 'server-only'

import { createSupabaseServerClient } from '@/lib/supabaseServer'
import { createServiceClient } from '@/lib/supabase'
import type { FrameUser } from './types'

// ─── Role Mapping ───────────────────────────────────────────────────────

/**
 * Maps DB role values to Contract D role values.
 * NEEDS_CEO_ROLE_CONTRACT: 'superadmin' → 'ceo' is a temporary proxy.
 */
const ROLE_MAP: Record<string, FrameUser['role']> = {
  ceo: 'ceo',
  superadmin: 'ceo', // temporary proxy — NEEDS_CEO_ROLE_CONTRACT
  finance: 'finance',
  operations: 'operations',
  staff: 'staff',
}

// ─── Resolver ───────────────────────────────────────────────────────────

/**
 * Resolve the authenticated user for the Operating Frame.
 *
 * Returns null when:
 *   - No authenticated session (unauthenticated user → login page)
 *   - No user_roles record (user exists but has no role)
 *   - Any error during resolution (fail-closed)
 *
 * The Frame renders without sidebar when this returns null.
 */
export async function resolveFrameUser(): Promise<FrameUser | null> {
  try {
    // Step 1: Resolve session via cookie-aware client
    const sessionClient = createSupabaseServerClient()
    const {
      data: { user },
      error: authError,
    } = await sessionClient.auth.getUser()

    if (authError || !user) return null

    // Step 2: Query user_roles (service-role — ONLY after auth succeeds)
    const db = createServiceClient()
    const { data, error: roleError } = await db
      .from('user_roles')
      .select('role, full_name')
      .eq('user_id', user.id)
      .maybeSingle()

    if (roleError || !data) return null

    // Step 3: Build FrameUser
    const role = ROLE_MAP[data.role] ?? 'staff'
    const name = data.full_name || user.email?.split('@')[0] || 'User'

    return {
      id: user.id,
      name,
      email: user.email || '',
      role,
    }
  } catch {
    // Fail-closed: any unexpected error → no frame user
    return null
  }
}
