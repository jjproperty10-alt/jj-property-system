/**
 * JJ Property 10 — Report Authorization Foundation
 * PR A: Server-side authorization for report scope
 *
 * SECURITY:
 * - Server Action ('use server') — executes ONLY on the server, never in client bundles.
 * - Resolves authenticated user from session cookie via @supabase/ssr.
 * - Queries user_roles with createServiceClient() (service_role) — bypasses RLS.
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
 * @see PR_B_GATE1_BLOCKER.md — investigation that led to this service
 */
'use server'

import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createServiceClient } from '@/lib/supabase'

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

// ── Internal: resolve authenticated user ─────────────────────────────────────

async function resolveAuthenticatedUser(): Promise<
  | { ok: true; userId: string }
  | { ok: false; error: 'unauthenticated' }
> {
  const cookieStore = await cookies()

  const supabase = createServerClient(
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
  userId: string,
): Promise<
  | { ok: true; role: string; fullName: string }
  | { ok: false; error: AuthorizationError }
> {
  const db = createServiceClient()

  const { data, error } = await db
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

async function loadAllReportableProperties(): Promise<string[]> {
  const db = createServiceClient()
  const nameSet = new Set<string>()

  await Promise.all(
    RC3_VIEWS.map(async (view) => {
      const { data } = await db.from(view).select('reporting_name')
      if (data) {
        for (const row of data as Array<{ reporting_name: string | null }>) {
          if (row.reporting_name) nameSet.add(row.reporting_name)
        }
      }
    }),
  )

  return Array.from(nameSet).sort((a, b) => a.localeCompare(b))
}

async function loadPartnerProperties(ownerName: string): Promise<string[]> {
  const db = createServiceClient()

  // Get properties owned by this partner
  const { data: owned } = await db
    .from('property_owners')
    .select('property_name')
    .eq('owner_name', ownerName)
    .order('property_name')

  if (!owned || owned.length === 0) return []

  const ownedNames = new Set(
    (owned as Array<{ property_name: string }>).map(r => r.property_name),
  )

  // Intersect with canonical reportable properties (only properties with RC3 data)
  const allReportable = await loadAllReportableProperties()
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
 * Fails closed at every step.
 */
export async function getAuthorizedReportProperties(): Promise<AuthorizationResult> {
  // Step 1: Resolve authenticated user from session
  const authResult = await resolveAuthenticatedUser()
  if (!authResult.ok) return authResult

  // Step 2: Resolve role from user_roles
  const roleResult = await resolveUserRole(authResult.userId)
  if (!roleResult.ok) return roleResult

  // Step 3: Apply authorization policy
  let properties: string[]

  switch (roleResult.role as ReportAccessRole) {
    case 'superadmin': {
      // Explicit policy: superadmin is authorized for all canonical reportable properties.
      // This is an explicit admin authorization policy, not an owner-specific mapping.
      properties = await loadAllReportableProperties()
      break
    }
    case 'partner': {
      // Partner: authorized only for properties where property_owners.owner_name matches
      properties = await loadPartnerProperties(roleResult.fullName)
      break
    }
  }

  if (properties.length === 0) {
    return { ok: false, error: 'empty_property_set' }
  }

  return { ok: true, properties, role: roleResult.role }
}

// ── Public API: validateAuthorizedReportScope ─────────────────────────────────

/**
 * Scope types — re-exported here so consumers don't need to import reportScope.ts
 * (which may not exist until PR B). Structurally identical to reportScope.ReportScope.
 */
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
  // Step 1-3: Get authorized properties (full auth chain)
  const authResult = await getAuthorizedReportProperties()
  if (!authResult.ok) return authResult

  const authorized = authResult.properties

  // Step 4: Validate scope against authorized set
  switch (scope.type) {
    case 'portfolio': {
      // Portfolio = all authorized properties
      return { ok: true, resolvedProperties: authorized, role: authResult.role }
    }

    case 'selected_properties': {
      // Normalize: trim, dedup, preserve order
      const normalized = dedup(scope.propertyNames.map(n => n.trim()).filter(Boolean))
      if (normalized.length === 0) {
        return { ok: false, error: 'empty_selection' }
      }
      // Filter to authorized set only — silently drop unauthorized
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
        // Do not reveal whether the property exists for another owner
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
