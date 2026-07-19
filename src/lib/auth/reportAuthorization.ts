/**
 * JJ Property 10 — Report Authorization Foundation
 * PR A: Server-side authorization for report scope
 *
 * SECURITY:
 * - Server Action ('use server') — executes ONLY on the server, never in client bundles.
 * - Resolves authenticated user from session cookie via @supabase/ssr.
 * - Queries user_roles and property data using the AUTHENTICATED session client.
 *   All queried tables have RLS policies granting SELECT to authenticated users:
 *     user_roles:      superadmin_manage_roles (ALL, auth.role()='authenticated')
 *     property_owners: auth_all_property_owners (ALL, true) for authenticated role
 *     transactions:    auth_read_transactions (SELECT, auth.role()='authenticated')
 *   No service_role bypass is needed or used.
 * - Never trusts browser-submitted property names or owner identifiers.
 * - Fails closed: missing role, unknown role, unauthenticated → rejected.
 * - Error messages never reveal which properties belong to other owners.
 *
 * AUTHORIZATION POLICY (explicit):
 * - superadmin → all canonical reportable properties
 * - partner    → properties where property_owners.owner_name = user_roles.full_name
 * - All other roles (manager, employee, cleaner, viewer) → fail closed (not yet implemented)
 *
 * KNOWN LIMITATIONS:
 * - This is NOT a complete multi-user authorization model.
 * - Partner authorization relies on TEXT match (full_name ↔ owner_name) — fragile.
 * - Roles beyond superadmin/partner are not yet defined for report access.
 * - When external partners get accounts, this service must be extended.
 *
 * LEAST-PRIVILEGE REFACTOR (2026-07-19):
 * - Replaced createServiceClient() with authenticated session client.
 * - RLS investigation confirmed service_role was unnecessary:
 *   all queried tables allow authenticated SELECT.
 * - No SUPABASE_SERVICE_KEY dependency remains in this module.
 *
 * @see PR_B_GATE1_BLOCKER.md — investigation that led to this service
 */
'use server'

import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

// ── Types ────────────────────────────────────────────────────────────────────

export type AuthorizationResult =
  | { ok: true;  properties: string[]; role: string }
  | { ok: false; error: AuthorizationError }

export type AuthorizationError =
  | 'unauthenticated'        // No valid session
  | 'no_role'                // Authenticated but no user_roles record
  | 'role_inactive'          // user_roles.is_active = false
  | 'unknown_role'           // Role exists but has no report access policy
  | 'empty_property_set'     // Authorization resolved but no properties found

// Roles that have an explicit report access policy
const REPORT_ACCESS_ROLES = ['superadmin', 'partner'] as const
type ReportAccessRole = typeof REPORT_ACCESS_ROLES[number]

function isReportAccessRole(role: string): role is ReportAccessRole {
  return (REPORT_ACCESS_ROLES as readonly string[]).includes(role)
}

// ── RC3 Views (canonical reportable property source) ─────────────────────────

const RC3_VIEWS = [
  'v_rc3_purchase',
  'v_rc3_renovation',
  'v_rc3_rental',
  'v_rc3_airbnb',
  'v_rc3_sale',
] as const

// ── Internal: create authenticated server client ─────────────────────────────

/**
 * Create an authenticated Supabase client using the request's session cookie.
 * This client carries the user's JWT and is subject to RLS policies.
 * No service_role key is used — least-privilege principle.
 */
async function createAuthenticatedServerClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        // Server Actions are read-only for cookies in this context;
        // session refresh happens in middleware, not here.
        setAll() {},
      },
    },
  )
}

// ── Internal: resolve authenticated user ─────────────────────────────────────

async function resolveAuthenticatedUser(
  supabase: ReturnType<typeof createServerClient>,
): Promise<
  | { ok: true; userId: string }
  | { ok: false; error: 'unauthenticated' }
> {
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    return { ok: false, error: 'unauthenticated' }
  }

  return { ok: true, userId: user.id }
}

// ── Internal: resolve role from user_roles ───────────────────────────────────

interface UserRoleRecord {
  role: string
  full_name: string
  is_active: boolean
}

async function resolveUserRole(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
): Promise<
  | { ok: true; role: string; fullName: string }
  | { ok: false; error: AuthorizationError }
> {
  const { data, error } = await supabase
    .from('user_roles')
    .select('role, full_name, is_active')
    .eq('user_id', userId)
    .single()

  if (error || !data) {
    return { ok: false, error: 'no_role' }
  }

  const record = data as UserRoleRecord

  if (!record.is_active) {
    return { ok: false, error: 'role_inactive' }
  }

  if (!isReportAccessRole(record.role)) {
    return { ok: false, error: 'unknown_role' }
  }

  return { ok: true, role: record.role, fullName: record.full_name }
}

// ── Internal: load canonical reportable properties ───────────────────────────

async function loadAllReportableProperties(
  supabase: ReturnType<typeof createServerClient>,
): Promise<string[]> {
  const nameSet = new Set<string>()

  await Promise.all(
    RC3_VIEWS.map(async (view) => {
      const { data } = await supabase.from(view).select('reporting_name')
      if (data) {
        for (const row of data as Array<{ reporting_name: string | null }>) {
          if (row.reporting_name) nameSet.add(row.reporting_name)
        }
      }
    }),
  )

  return Array.from(nameSet).sort((a, b) => a.localeCompare(b))
}

async function loadPartnerProperties(
  supabase: ReturnType<typeof createServerClient>,
  ownerName: string,
): Promise<string[]> {
  // Get properties owned by this partner
  const { data: owned } = await supabase
    .from('property_owners')
    .select('property_name')
    .eq('owner_name', ownerName)
    .order('property_name')

  if (!owned || owned.length === 0) return []

  const ownedNames = new Set(
    (owned as Array<{ property_name: string }>).map(r => r.property_name),
  )

  // Intersect with canonical reportable properties (only properties with RC3 data)
  const allReportable = await loadAllReportableProperties(supabase)
  return allReportable.filter(name => ownedNames.has(name))
}

// ── Public API: getAuthorizedReportProperties ────────────────────────────────

/**
 * Server Action: resolve the authorized canonical reportable property set
 * for the currently authenticated user.
 *
 * Authorization chain:
 *   session cookie → auth.uid → user_roles → policy → property set
 *
 * Uses authenticated session client throughout — no service_role.
 * Fails closed at every step.
 */
export async function getAuthorizedReportProperties(): Promise<AuthorizationResult> {
  // Create authenticated client from session cookie
  const supabase = await createAuthenticatedServerClient()

  // Step 1: Resolve authenticated user from session
  const authResult = await resolveAuthenticatedUser(supabase)
  if (!authResult.ok) return authResult

  // Step 2: Resolve role from user_roles
  const roleResult = await resolveUserRole(supabase, authResult.userId)
  if (!roleResult.ok) return roleResult

  // Step 3: Apply authorization policy
  let properties: string[]

  switch (roleResult.role as ReportAccessRole) {
    case 'superadmin': {
      properties = await loadAllReportableProperties(supabase)
      break
    }
    case 'partner': {
      properties = await loadPartnerProperties(supabase, roleResult.fullName)
      break
    }
  }

  if (properties.length === 0) {
    return { ok: false, error: 'empty_property_set' }
  }

  return { ok: true, properties, role: roleResult.role }
}

// ── Public API: validateAuthorizedReportScope ─────────────────────────────────

export type ReportScope =
  | { type: 'portfolio' }
  | { type: 'selected_properties'; propertyNames: string[] }
  | { type: 'single_property';     propertyName: string }

export type ScopeValidationResult =
  | { ok: true;  resolvedProperties: string[]; role: string }
  | { ok: false; error: AuthorizationError | ScopeValidationError }

export type ScopeValidationError =
  | 'empty_selection'
  | 'missing_property'
  | 'no_authorized_properties'

/**
 * Server Action: validate a browser-submitted ReportScope against the
 * server-resolved authorized property set.
 *
 * Full chain:
 *   session → auth.uid → user_roles → policy → authorized set → validate scope → result
 *
 * Browser-submitted property names are NEVER authoritative.
 * They are checked against the server-resolved authorized set.
 * Unauthorized names are silently dropped (no ownership leakage).
 */
export async function validateAuthorizedReportScope(
  scope: ReportScope,
): Promise<ScopeValidationResult> {
  const authResult = await getAuthorizedReportProperties()
  if (!authResult.ok) return authResult

  const authorized = authResult.properties

  switch (scope.type) {
    case 'portfolio': {
      return { ok: true, resolvedProperties: authorized, role: authResult.role }
    }

    case 'selected_properties': {
      const normalized = dedup(scope.propertyNames.map(n => n.trim()).filter(Boolean))
      if (normalized.length === 0) {
        return { ok: false, error: 'empty_selection' }
      }
      const authorizedSet = new Set(authorized)
      const resolved = normalized.filter(n => authorizedSet.has(n))
      if (resolved.length === 0) {
        return { ok: false, error: 'no_authorized_properties' }
      }
      return { ok: true, resolvedProperties: resolved, role: authResult.role }
    }

    case 'single_property': {
      const name = scope.propertyName.trim()
      if (!name) {
        return { ok: false, error: 'missing_property' }
      }
      if (!authorized.includes(name)) {
        return { ok: false, error: 'no_authorized_properties' }
      }
      return { ok: true, resolvedProperties: [name], role: authResult.role }
    }
  }
}

// ── Utility ──────────────────────────────────────────────────────────────────

function dedup(arr: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const item of arr) {
    if (!seen.has(item)) {
      seen.add(item)
      result.push(item)
    }
  }
  return result
}
