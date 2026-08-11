'use server'

/**
 * rentalContractActions — Server Actions for Rental Contract lifecycle.
 *
 * P2 LTR Operations — Rental Contract Foundation
 *
 * Security boundary:
 *   Browser → Server Action → authenticateStatementUser() → createServiceClient()
 *   → SECURITY DEFINER RPC (service_role only)
 *
 * Three-authority separation:
 *   Service Engagement = what service JJ provides (management_ltr)
 *   Rental Contract = who is renting, terms, period (THIS FILE)
 *   Tenant Payment = actual rent money (public.transactions — NOT touched)
 *
 * Constitutional:
 *   - P-ARCH-1: NULL = Unknown (no placeholders)
 *   - P-ARCH-4: no delete (status changes only)
 *   - P-ARCH-5: lifecycle schema isolation
 *   - P0 Architecture: LOCKED (2026-08-07)
 *
 * FORBIDDEN:
 *   - Writing to public.transactions
 *   - Any financial calculation
 *   - Tenant Payment matching or reassignment
 *   - Modifying property_id, service_engagement_id, created_by
 *   - Storing payment truth in the lease record
 */

import { authenticateStatementUser } from '@/lib/statements/statementAuthService'
import { createServiceClient } from '@/lib/supabase'
import { isValidUUID } from '@/lib/owners/validation'
import type {
  CreateRentalContractInput,
  UpdateRentalContractInput,
  RentalContractActionResult,
  RentalContractDTO,
  RentalContractStatus,
} from './ownerWorkspaceTypes'

// ─── Constants ──────────────────────────────────────────────────────────────────

const VALID_STATUSES = new Set<RentalContractStatus>([
  'draft', 'active', 'expired', 'terminated',
])

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// ─── Validation helpers ─────────────────────────────────────────────────────────

function validateCreateInput(input: CreateRentalContractInput): string | null {
  if (!input.propertyId || !isValidUUID(input.propertyId)) {
    return 'Invalid property ID'
  }
  if (input.serviceEngagementId && !isValidUUID(input.serviceEngagementId)) {
    return 'Invalid service engagement ID'
  }
  if (!input.tenantName || input.tenantName.trim().length === 0) {
    return 'Tenant name is required'
  }
  if (input.tenantName.length > 200) {
    return 'Tenant name too long (max 200 characters)'
  }
  if (input.tenantEntityId && !isValidUUID(input.tenantEntityId)) {
    return 'Invalid tenant entity ID'
  }
  if (!input.startDate || !ISO_DATE_RE.test(input.startDate)) {
    return 'Start date is required (YYYY-MM-DD)'
  }
  if (input.endDate && !ISO_DATE_RE.test(input.endDate)) {
    return 'Invalid end date format (YYYY-MM-DD)'
  }
  if (input.startDate && input.endDate && input.endDate < input.startDate) {
    return 'End date must be on or after start date'
  }
  if (input.monthlyRentEur == null || input.monthlyRentEur < 0) {
    return 'Monthly rent must be zero or positive'
  }
  if (input.depositEur != null && input.depositEur < 0) {
    return 'Deposit must be zero or positive'
  }
  if (input.paymentDay != null && (input.paymentDay < 1 || input.paymentDay > 28)) {
    return 'Payment day must be between 1 and 28'
  }
  if (input.status && !VALID_STATUSES.has(input.status)) {
    return `Invalid status: ${input.status}`
  }
  if (input.notes && input.notes.length > 2000) {
    return 'Notes too long (max 2000 characters)'
  }
  return null
}

function validateUpdateInput(input: UpdateRentalContractInput): string | null {
  if (!input.id || !isValidUUID(input.id)) {
    return 'Invalid contract ID'
  }
  if (input.tenantName !== undefined && input.tenantName !== null) {
    if (input.tenantName.trim().length === 0) return 'Tenant name cannot be empty'
    if (input.tenantName.length > 200) return 'Tenant name too long (max 200 characters)'
  }
  if (input.tenantEntityId && !isValidUUID(input.tenantEntityId)) {
    return 'Invalid tenant entity ID'
  }
  if (input.startDate && !ISO_DATE_RE.test(input.startDate)) {
    return 'Invalid start date format (YYYY-MM-DD)'
  }
  if (input.endDate && !ISO_DATE_RE.test(input.endDate)) {
    return 'Invalid end date format (YYYY-MM-DD)'
  }
  if (input.monthlyRentEur != null && input.monthlyRentEur < 0) {
    return 'Monthly rent must be zero or positive'
  }
  if (input.depositEur != null && input.depositEur < 0) {
    return 'Deposit must be zero or positive'
  }
  if (input.paymentDay != null && (input.paymentDay < 1 || input.paymentDay > 28)) {
    return 'Payment day must be between 1 and 28'
  }
  if (input.status !== undefined && input.status !== null && !VALID_STATUSES.has(input.status)) {
    return `Invalid status: ${input.status}`
  }
  if (input.notes && input.notes.length > 2000) {
    return 'Notes too long (max 2000 characters)'
  }
  return null
}

// ─── Row → DTO mapper ───────────────────────────────────────────────────────────

interface RentalContractRow {
  id: string
  property_id: string
  service_engagement_id: string | null
  tenant_name: string
  tenant_entity_id: string | null
  start_date: string
  end_date: string | null
  monthly_rent_eur: number
  deposit_eur: number | null
  payment_day: number
  currency: string
  status: string
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

function mapRowToDTO(row: RentalContractRow): RentalContractDTO {
  return {
    id: row.id,
    propertyId: row.property_id,
    serviceEngagementId: row.service_engagement_id ?? null,
    tenantName: row.tenant_name,
    tenantEntityId: row.tenant_entity_id ?? null,
    startDate: row.start_date,
    endDate: row.end_date ?? null,
    monthlyRentEur: Number(row.monthly_rent_eur),
    depositEur: row.deposit_eur != null ? Number(row.deposit_eur) : null,
    paymentDay: row.payment_day,
    currency: row.currency,
    status: row.status as RentalContractStatus,
    notes: row.notes ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// ─── Create action ──────────────────────────────────────────────────────────────

export async function createRentalContractAction(
  input: CreateRentalContractInput,
): Promise<RentalContractActionResult> {
  const auth = await authenticateStatementUser()
  if (!auth.ok) {
    return { ok: false, error: 'unauthenticated', message: 'You must be signed in' }
  }

  const validationError = validateCreateInput(input)
  if (validationError) {
    return { ok: false, error: 'validation', message: validationError }
  }

  const db = createServiceClient()

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (db as any)
      .schema('lifecycle')
      .rpc('create_rental_contract', {
        p_property_id: input.propertyId,
        p_service_engagement_id: input.serviceEngagementId ?? null,
        p_tenant_name: input.tenantName.trim(),
        p_tenant_entity_id: input.tenantEntityId ?? null,
        p_start_date: input.startDate,
        p_end_date: input.endDate ?? null,
        p_monthly_rent_eur: input.monthlyRentEur,
        p_deposit_eur: input.depositEur ?? null,
        p_payment_day: input.paymentDay ?? 1,
        p_currency: input.currency ?? 'EUR',
        p_status: input.status ?? 'draft',
        p_notes: input.notes ?? null,
        p_created_by: auth.userId,
      })

    if (error) {
      console.error('[rentalContractActions] create RPC error:', error)
      return { ok: false, error: 'db_error', message: error.message ?? 'Database error' }
    }

    // RPC returns JSONB — parse into DTO
    const row = data as RentalContractRow
    return { ok: true, contract: mapRowToDTO(row) }
  } catch (err) {
    console.error('[rentalContractActions] create unexpected error:', err)
    return { ok: false, error: 'db_error', message: 'Unexpected error' }
  }
}

// ─── Update action ──────────────────────────────────────────────────────────────

export async function updateRentalContractAction(
  input: UpdateRentalContractInput,
): Promise<RentalContractActionResult> {
  const auth = await authenticateStatementUser()
  if (!auth.ok) {
    return { ok: false, error: 'unauthenticated', message: 'You must be signed in' }
  }

  const validationError = validateUpdateInput(input)
  if (validationError) {
    return { ok: false, error: 'validation', message: validationError }
  }

  const db = createServiceClient()

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (db as any)
      .schema('lifecycle')
      .rpc('update_rental_contract', {
        p_id: input.id,
        p_tenant_name: input.tenantName ?? null,
        p_tenant_entity_id: input.tenantEntityId ?? null,
        p_start_date: input.startDate ?? null,
        p_end_date: input.endDate ?? null,
        p_monthly_rent_eur: input.monthlyRentEur ?? null,
        p_deposit_eur: input.depositEur ?? null,
        p_payment_day: input.paymentDay ?? null,
        p_status: input.status ?? null,
        p_notes: input.notes ?? null,
        p_clear_end_date: input.clearEndDate ?? false,
        p_clear_deposit: input.clearDeposit ?? false,
        p_clear_notes: input.clearNotes ?? false,
        p_clear_tenant_entity_id: input.clearTenantEntityId ?? false,
      })

    if (error) {
      console.error('[rentalContractActions] update RPC error:', error)
      return { ok: false, error: 'db_error', message: error.message ?? 'Database error' }
    }

    const row = data as RentalContractRow
    return { ok: true, contract: mapRowToDTO(row) }
  } catch (err) {
    console.error('[rentalContractActions] update unexpected error:', err)
    return { ok: false, error: 'db_error', message: 'Unexpected error' }
  }
}
