'use server'

/**
 * serviceEngagementActions — Server Actions for Service Engagement lifecycle.
 *
 * P2 PR #4: Service Engagement Write/Edit Lifecycle
 *
 * Security boundary:
 *   Browser → Server Action → authenticateStatementUser() → createServiceClient()
 *   → SECURITY DEFINER RPC (service_role only)
 *
 * Constitutional:
 *   - P-ARCH-1: NULL = Unknown (no placeholders)
 *   - P-ARCH-4: no delete (status changes only)
 *   - P-ARCH-5: lifecycle schema isolation
 *   - P0 Architecture: LOCKED (2026-08-07)
 *
 * Auth: authenticateStatementUser() from statementAuthService (canonical, uses jj_staff_config).
 *
 * FORBIDDEN:
 *   - Writing to public.transactions
 *   - Any financial calculation
 *   - Auto-close of existing engagements
 *   - Modifying entity_id, property_id, service_type, created_by
 */

import { authenticateStatementUser } from '@/lib/statements/statementAuthService'
import { createServiceClient } from '@/lib/supabase'
import { isValidUUID } from '@/lib/owners/validation'
import type {
  CreateServiceEngagementInput,
  UpdateServiceEngagementInput,
  ServiceEngagementActionResult,
  ServiceEngagementDTO,
  ServiceType,
  ServiceEngagementStatus,
} from './ownerWorkspaceTypes'

// ─── Constants ──────────────────────────────────────────────────────────────────

const VALID_SERVICE_TYPES = new Set<ServiceType>([
  'renovation', 'sale', 'management_ltr', 'airbnb_str',
])

const VALID_STATUSES = new Set<ServiceEngagementStatus>([
  'draft', 'active', 'suspended', 'closed',
])

// ISO date regex (YYYY-MM-DD)
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// ─── Validation helpers ─────────────────────────────────────────────────────────

function validateCreateInput(input: CreateServiceEngagementInput): string | null {
  if (!input.entityId || !isValidUUID(input.entityId)) {
    return 'Invalid entity ID'
  }
  if (!input.propertyId || !isValidUUID(input.propertyId)) {
    return 'Invalid property ID'
  }
  if (!VALID_SERVICE_TYPES.has(input.serviceType)) {
    return `Invalid service type: ${input.serviceType}`
  }
  if (input.status && !VALID_STATUSES.has(input.status)) {
    return `Invalid status: ${input.status}`
  }
  if (input.effectiveFrom && !ISO_DATE_RE.test(input.effectiveFrom)) {
    return 'Invalid effective_from date format (expected YYYY-MM-DD)'
  }
  if (input.effectiveTo && !ISO_DATE_RE.test(input.effectiveTo)) {
    return 'Invalid effective_to date format (expected YYYY-MM-DD)'
  }
  if (input.effectiveFrom && input.effectiveTo && input.effectiveTo < input.effectiveFrom) {
    return 'End date must be on or after start date'
  }
  if (input.notes && input.notes.length > 2000) {
    return 'Notes too long (max 2000 characters)'
  }
  return null
}

function validateUpdateInput(input: UpdateServiceEngagementInput): string | null {
  if (!input.id || !isValidUUID(input.id)) {
    return 'Invalid engagement ID'
  }
  if (input.status !== undefined && input.status !== null && !VALID_STATUSES.has(input.status)) {
    return `Invalid status: ${input.status}`
  }
  if (input.setEffectiveFrom && input.effectiveFrom && !ISO_DATE_RE.test(input.effectiveFrom)) {
    return 'Invalid effective_from date format (expected YYYY-MM-DD)'
  }
  if (input.setEffectiveTo && input.effectiveTo && !ISO_DATE_RE.test(input.effectiveTo)) {
    return 'Invalid effective_to date format (expected YYYY-MM-DD)'
  }
  if (input.setNotes && input.notes && input.notes.length > 2000) {
    return 'Notes too long (max 2000 characters)'
  }
  return null
}

// ─── Row → DTO mapper ───────────────────────────────────────────────────────────

interface ServiceEngagementRow {
  id: string
  entity_id: string
  property_id: string
  service_type: string
  status: string
  effective_from: string | null
  effective_to: string | null
  notes: string | null
  created_by: string
  created_at: string
  updated_at: string
}

function mapRowToDTO(row: ServiceEngagementRow): ServiceEngagementDTO {
  return {
    id: row.id,
    entityId: row.entity_id,
    propertyId: row.property_id,
    serviceType: row.service_type as ServiceType,
    status: row.status as ServiceEngagementStatus,
    effectiveFrom: row.effective_from ?? null,
    effectiveTo: row.effective_to ?? null,
    notes: row.notes ?? null,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// ─── Create action ──────────────────────────────────────────────────────────────

export async function createServiceEngagementAction(
  input: CreateServiceEngagementInput,
): Promise<ServiceEngagementActionResult> {
  // 1. Authenticate
  const auth = await authenticateStatementUser()
  if (!auth.ok) {
    return { ok: false, error: 'unauthenticated', message: 'You must be signed in' }
  }

  // 2. Validate
  const validationError = validateCreateInput(input)
  if (validationError) {
    return { ok: false, error: 'validation', message: validationError }
  }

  // 3. Call RPC
  const db = createServiceClient()

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (db as any)
      .schema('lifecycle')
      .rpc('create_service_engagement', {
        p_entity_id: input.entityId,
        p_property_id: input.propertyId,
        p_service_type: input.serviceType,
        p_status: input.status ?? 'draft',
        p_effective_from: input.effectiveFrom ?? null,
        p_effective_to: input.effectiveTo ?? null,
        p_notes: input.notes ?? null,
        p_created_by: auth.userId,
      })

    if (error) {
      console.error('[serviceEngagementActions] create RPC error:', error)
      return { ok: false, error: 'db_error', message: error.message ?? 'Database error' }
    }

    // create_service_engagement returns UUID. Fetch the full row for the DTO.
    const id = data as string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rows, error: fetchErr } = await (db as any)
      .schema('lifecycle')
      .from('service_engagements')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchErr || !rows) {
      // Creation succeeded but fetch failed — return minimal DTO
      return {
        ok: true,
        engagement: {
          id,
          entityId: input.entityId,
          propertyId: input.propertyId,
          serviceType: input.serviceType,
          status: (input.status ?? 'draft') as ServiceEngagementStatus,
          effectiveFrom: input.effectiveFrom ?? null,
          effectiveTo: input.effectiveTo ?? null,
          notes: input.notes ?? null,
          createdBy: auth.userId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      }
    }

    return { ok: true, engagement: mapRowToDTO(rows as ServiceEngagementRow) }
  } catch (err) {
    console.error('[serviceEngagementActions] create unexpected error:', err)
    return { ok: false, error: 'db_error', message: 'Unexpected error creating service engagement' }
  }
}

// ─── Update action ──────────────────────────────────────────────────────────────

export async function updateServiceEngagementAction(
  input: UpdateServiceEngagementInput,
): Promise<ServiceEngagementActionResult> {
  // 1. Authenticate
  const auth = await authenticateStatementUser()
  if (!auth.ok) {
    return { ok: false, error: 'unauthenticated', message: 'You must be signed in' }
  }

  // 2. Validate
  const validationError = validateUpdateInput(input)
  if (validationError) {
    return { ok: false, error: 'validation', message: validationError }
  }

  // 3. Call RPC
  const db = createServiceClient()

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (db as any)
      .schema('lifecycle')
      .rpc('update_service_engagement', {
        p_id: input.id,
        p_status: input.status ?? null,
        p_set_effective_from: input.setEffectiveFrom ?? false,
        p_effective_from: input.effectiveFrom ?? null,
        p_set_effective_to: input.setEffectiveTo ?? false,
        p_effective_to: input.effectiveTo ?? null,
        p_set_notes: input.setNotes ?? false,
        p_notes: input.notes ?? null,
      })

    if (error) {
      console.error('[serviceEngagementActions] update RPC error:', error)
      return { ok: false, error: 'db_error', message: error.message ?? 'Database error' }
    }

    // update_service_engagement returns the updated row
    const row = data as ServiceEngagementRow
    if (!row || !row.id) {
      return { ok: false, error: 'db_error', message: 'Update returned no data' }
    }

    return { ok: true, engagement: mapRowToDTO(row) }
  } catch (err) {
    console.error('[serviceEngagementActions] update unexpected error:', err)
    return { ok: false, error: 'db_error', message: 'Unexpected error updating service engagement' }
  }
}
