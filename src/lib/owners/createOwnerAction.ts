'use server'

/**
 * createOwnerAction — Server Action for Add Client Wizard (PR #4)
 *
 * Constitutional basis:
 *   - P-ARCH-1: NULL = Unknown (no placeholders)
 *   - P-ARCH-5: lifecycle schema isolation
 *   - P0 Architecture: LOCKED (2026-08-07)
 *   - B1: canonical_name NOT unique (duplicate detection handles collisions)
 *   - B2: draftOwners path — NEVER contaminates verified owners
 *
 * Write target: lifecycle.create_owner_draft() RPC (SECURITY DEFINER)
 * Auth: cookie session → user_roles check (same pattern as reportAuthorization.ts)
 *
 * FORBIDDEN:
 *   - Writing to management_relationship
 *   - Sequential partial writes (all-or-nothing via RPC)
 *   - Legacy bridge writes
 */

import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createServiceClient } from '@/lib/supabase'
import { detectDuplicates } from '@/lib/identity/duplicateDetectionService'
import { getAllVerifiedOwners } from '@/lib/identity/identityResolverService'

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface CreateOwnerInput {
  // Step 1 — Identity
  canonicalName: string
  entityType?: string // default: 'external'
  contactEmail?: string | null
  contactPhone?: string | null
  preferredLanguage?: 'he' | 'en' | 'ru' | null
  country?: string | null
  entityLegalName?: string | null
  internalNotes?: string | null
  // Step 2 — JJ Relationship
  relationshipType: string // 'managed_client' | 'investor' | etc.
  effectiveFrom?: string | null // ISO date
  relationshipNotes?: string | null
  // Step 3 — Property Associations
  propertyIds?: string[] // UUID strings
  // Override
  duplicateOverrideReason?: string | null
}

export type CreateOwnerResult =
  | { ok: true; entityId: string; slug: string }
  | { ok: false; error: 'unauthenticated' | 'unauthorized' | 'validation' | 'duplicate_blocked' | 'db_error'; message: string }

// ─────────────────────────────────────────────────────────────
// Auth helpers (same pattern as reportAuthorization.ts)
// ─────────────────────────────────────────────────────────────

async function resolveAuthenticatedUser(): Promise<
  | { ok: true; userId: string; email: string }
  | { ok: false }
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
        setAll() {},
      },
    },
  )

  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    return { ok: false }
  }

  return { ok: true, userId: user.id, email: user.email ?? 'unknown' }
}

async function isActiveStaff(userId: string): Promise<boolean> {
  const db = createServiceClient()
  const { data, error } = await db
    .from('user_roles')
    .select('role, is_active')
    .eq('user_id', userId)
    .single()

  if (error || !data) return false
  return data.is_active === true
}

// ─────────────────────────────────────────────────────────────
// Name → slug (reuse ownerWorkspaceUtils pattern)
// ─────────────────────────────────────────────────────────────

function nameToSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// ─────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────

const VALID_RELATIONSHIP_TYPES = new Set([
  'managed_client',
  'investor',
  'deal_partner',
  'internal_partner',
  'private_client',
])

const VALID_ENTITY_TYPES = new Set([
  'partner',
  'investor',
  'jj_company',
  'external',
])

function validate(input: CreateOwnerInput): string | null {
  if (!input.canonicalName || input.canonicalName.trim().length === 0) {
    return 'Name is required'
  }
  if (input.canonicalName.trim().length > 200) {
    return 'Name is too long (max 200 characters)'
  }
  if (input.entityType && !VALID_ENTITY_TYPES.has(input.entityType)) {
    return `Invalid entity type: ${input.entityType}`
  }
  if (!VALID_RELATIONSHIP_TYPES.has(input.relationshipType)) {
    return `Invalid relationship type: ${input.relationshipType}`
  }
  if (input.preferredLanguage && !['he', 'en', 'ru'].includes(input.preferredLanguage)) {
    return `Invalid language: ${input.preferredLanguage}`
  }
  return null
}

// ─────────────────────────────────────────────────────────────
// Main server action
// ─────────────────────────────────────────────────────────────

export async function createOwnerAction(input: CreateOwnerInput): Promise<CreateOwnerResult> {
  // 1. Authenticate
  const auth = await resolveAuthenticatedUser()
  if (!auth.ok) {
    return { ok: false, error: 'unauthenticated', message: 'You must be signed in' }
  }

  // 2. Authorize — must be active staff
  const staffOk = await isActiveStaff(auth.userId)
  if (!staffOk) {
    return { ok: false, error: 'unauthorized', message: 'Staff access required' }
  }

  // 3. Validate
  const validationError = validate(input)
  if (validationError) {
    return { ok: false, error: 'validation', message: validationError }
  }

  // 4. Duplicate detection
  const { owners, draftOwners } = await getAllVerifiedOwners()

  // Combine all entities for duplicate check
  const allEntities = [
    ...owners.map(o => o.identity),
    ...draftOwners.map(d => d.identity),
  ]

  const dupResult = detectDuplicates(input.canonicalName.trim(), allEntities)

  if (dupResult.blocked) {
    // HARD tier (future) — creation prevented
    return {
      ok: false,
      error: 'duplicate_blocked',
      message: 'An identical entity already exists and cannot be overridden',
    }
  }

  // STRONG match without override reason → reject
  const strongMatches = dupResult.matches.filter(m => m.tier === 'STRONG')
  if (strongMatches.length > 0 && !input.duplicateOverrideReason?.trim()) {
    return {
      ok: false,
      error: 'duplicate_blocked',
      message: `Strong match found: "${strongMatches[0].matchedName}". Provide an override reason to proceed.`,
    }
  }

  // 5. Call RPC — atomic 3-table insert
  const db = createServiceClient()

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (db as any)
      .schema('lifecycle')
      .rpc('create_owner_draft', {
        p_canonical_name: input.canonicalName.trim(),
        p_entity_type: input.entityType ?? 'external',
        p_contact_email: input.contactEmail ?? null,
        p_contact_phone: input.contactPhone ?? null,
        p_preferred_language: input.preferredLanguage ?? null,
        p_country: input.country ?? null,
        p_entity_legal_name: input.entityLegalName ?? null,
        p_internal_notes: input.internalNotes ?? null,
        p_relationship_type: input.relationshipType,
        p_effective_from: input.effectiveFrom ?? null,
        p_relationship_notes: input.relationshipNotes ?? null,
        p_property_ids: input.propertyIds ?? [],
        p_created_by: auth.email,
      })

    if (error) {
      console.error('[createOwnerAction] RPC error:', error)
      return { ok: false, error: 'db_error', message: error.message ?? 'Database error' }
    }

    const entityId = data as string
    const slug = nameToSlug(input.canonicalName.trim())

    return { ok: true, entityId, slug }
  } catch (err) {
    console.error('[createOwnerAction] unexpected error:', err)
    return { ok: false, error: 'db_error', message: 'Unexpected error creating owner' }
  }
}
