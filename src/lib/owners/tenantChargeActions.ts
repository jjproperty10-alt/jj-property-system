'use server'

/**
 * tenantChargeActions — Server Actions for Tenant Charges
 * & Statement Presentation Overrides.
 *
 * P5 LTR Operations — Tenant Charges + Billing Presentation Metadata
 *
 * Security boundary:
 *   Browser → Server Action → authenticateStatementUser() → createServiceClient()
 *   → SECURITY DEFINER RPC (service_role only, require_jj_staff() inside)
 *
 * Three-event separation:
 *   Owner Expense   = public.transactions (NEVER written by this module)
 *   Tenant Charge   = lifecycle.tenant_charge_obligations (THIS module writes)
 *   Tenant Payment  = public.transactions (NEVER written by this module)
 *
 * Presentation invariant:
 *   statement_presentation_overrides changes ONLY display timing.
 *   It NEVER changes: financial balances, original economic dates,
 *   transaction amounts, payer/payee, category/subcategory.
 *
 * FORBIDDEN:
 *   - Writing to public.transactions
 *   - Modifying deposit lifecycle (P3 authoritative)
 *   - Creating utility obligations (P4 authoritative)
 *   - Bypassing idempotency key
 */

import { authenticateStatementUser } from '@/lib/statements/statementAuthService'
import { createServiceClient } from '@/lib/supabase'
import { isValidUUID } from '@/lib/owners/validation'
import type {
  TenantChargeType,
  TenantChargeStatus,
  PresentationStatus,
} from './ownerWorkspaceTypes'

// ─── Constants ────────────────────────────────────────────────────────────────

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const VALID_CHARGE_TYPES = new Set<TenantChargeType>([
  'damage', 'penalty', 'cleaning', 'key_replacement', 'utility_arrears', 'other',
])

const VALID_CHARGE_STATUSES = new Set<TenantChargeStatus>([
  'pending', 'billed', 'partial', 'settled', 'disputed', 'waived', 'reversed',
])

const VALID_PRESENTATION_STATUSES = new Set<PresentationStatus>([
  'include_now', 'next_statement', 'defer_until_date', 'internal_only',
])

// ─── Create Tenant Charge ─────────────────────────────────────────────────────

export interface CreateTenantChargeInput {
  rentalContractId: string
  propertyId: string
  tenantName: string
  chargeType: TenantChargeType
  description: string
  actualCostEur: number | null   // NULL = unknown (P-ARCH-1)
  chargeAmountEur: number
  sourceEvidence: string | null
  economicDate: string
  deductibleFromDeposit: boolean
  idempotencyKey: string
  notes?: string | null
}

export async function createTenantChargeAction(
  input: CreateTenantChargeInput,
): Promise<
  | { ok: true; result: { id: string; status: string } }
  | { ok: false; error: string }
> {
  const auth = await authenticateStatementUser()
  if (!auth.ok) return { ok: false, error: 'You must be signed in' }

  // ── Validate ──────────────────────────────────────────────────────────────

  if (!input.rentalContractId || !isValidUUID(input.rentalContractId)) {
    return { ok: false, error: 'Invalid rental contract ID' }
  }
  if (!input.propertyId || !isValidUUID(input.propertyId)) {
    return { ok: false, error: 'Invalid property ID' }
  }
  if (!input.tenantName?.trim()) {
    return { ok: false, error: 'Tenant name is required' }
  }
  if (!VALID_CHARGE_TYPES.has(input.chargeType)) {
    return { ok: false, error: `Invalid charge type: ${input.chargeType}` }
  }
  if (!input.description?.trim()) {
    return { ok: false, error: 'Description is required' }
  }
  if (input.chargeAmountEur == null || input.chargeAmountEur < 0) {
    return { ok: false, error: 'Charge amount must be non-negative' }
  }
  if (!input.economicDate || !ISO_DATE_RE.test(input.economicDate)) {
    return { ok: false, error: 'Economic date is required (YYYY-MM-DD)' }
  }
  if (!input.idempotencyKey?.trim()) {
    return { ok: false, error: 'Idempotency key is required' }
  }
  // Negative margin allowed: actualCostEur > chargeAmountEur is valid business scenario

  // ── RPC call ──────────────────────────────────────────────────────────────

  const db = createServiceClient()

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (db as any)
      .schema('lifecycle')
      .rpc('create_tenant_charge_obligation', {
        p_rental_contract_id: input.rentalContractId,
        p_property_id: input.propertyId,
        p_tenant_name: input.tenantName.trim(),
        p_charge_type: input.chargeType,
        p_description: input.description.trim(),
        p_actual_cost_eur: input.actualCostEur,
        p_charge_amount_eur: input.chargeAmountEur,
        p_source_evidence: input.sourceEvidence,
        p_economic_date: input.economicDate,
        p_deductible: input.deductibleFromDeposit,
        p_idempotency_key: input.idempotencyKey.trim(),
        p_notes: input.notes ?? null,
      })

    if (error) {
      console.error('[tenantChargeActions] createTenantCharge RPC error:', error)
      return { ok: false, error: error.message ?? 'Database error' }
    }

    const raw = data as Record<string, unknown>
    return {
      ok: true,
      result: {
        id: String(raw.id),
        status: String(raw.status),
      },
    }
  } catch (err) {
    console.error('[tenantChargeActions] createTenantCharge unexpected error:', err)
    return { ok: false, error: 'Unexpected error' }
  }
}

// ─── Update Tenant Charge Status ──────────────────────────────────────────────

export interface UpdateTenantChargeStatusInput {
  chargeId: string
  newStatus: TenantChargeStatus
  settledAmount?: number | null
  settlementEvidence?: Record<string, unknown> | null
}

export async function updateTenantChargeStatusAction(
  input: UpdateTenantChargeStatusInput,
): Promise<
  | { ok: true; result: { id: string; previousStatus: string; newStatus: string } }
  | { ok: false; error: string }
> {
  const auth = await authenticateStatementUser()
  if (!auth.ok) return { ok: false, error: 'You must be signed in' }

  if (!input.chargeId || !isValidUUID(input.chargeId)) {
    return { ok: false, error: 'Invalid charge ID' }
  }
  if (!VALID_CHARGE_STATUSES.has(input.newStatus)) {
    return { ok: false, error: `Invalid status: ${input.newStatus}` }
  }

  const db = createServiceClient()

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (db as any)
      .schema('lifecycle')
      .rpc('update_tenant_charge_status', {
        p_charge_id: input.chargeId,
        p_new_status: input.newStatus,
        p_settled_amount: input.settledAmount ?? null,
        p_settlement_evidence: input.settlementEvidence ?? null,
      })

    if (error) {
      console.error('[tenantChargeActions] updateStatus RPC error:', error)
      return { ok: false, error: error.message ?? 'Database error' }
    }

    const raw = data as Record<string, unknown>
    return {
      ok: true,
      result: {
        id: String(raw.id),
        previousStatus: String(raw.previous_status),
        newStatus: String(raw.new_status),
      },
    }
  } catch (err) {
    console.error('[tenantChargeActions] updateStatus unexpected error:', err)
    return { ok: false, error: 'Unexpected error' }
  }
}

// ─── Set Statement Presentation Override ──────────────────────────────────────

export interface SetPresentationOverrideInput {
  sourceTransactionId: string
  propertyId: string
  presentationStatus: PresentationStatus
  deferUntilDate?: string | null
  economicDate?: string | null
  overrideReason?: string | null
}

export async function setPresentationOverrideAction(
  input: SetPresentationOverrideInput,
): Promise<
  | { ok: true; result: { id: string; action: string; economicDate: string } }
  | { ok: false; error: string }
> {
  const auth = await authenticateStatementUser()
  if (!auth.ok) return { ok: false, error: 'You must be signed in' }

  if (!input.sourceTransactionId || !isValidUUID(input.sourceTransactionId)) {
    return { ok: false, error: 'Invalid source transaction ID' }
  }
  if (!input.propertyId || !isValidUUID(input.propertyId)) {
    return { ok: false, error: 'Invalid property ID' }
  }
  if (!VALID_PRESENTATION_STATUSES.has(input.presentationStatus)) {
    return { ok: false, error: `Invalid presentation status: ${input.presentationStatus}` }
  }
  if (input.presentationStatus === 'defer_until_date') {
    if (!input.deferUntilDate || !ISO_DATE_RE.test(input.deferUntilDate)) {
      return { ok: false, error: 'defer_until_date required when status = defer_until_date' }
    }
  }

  const db = createServiceClient()

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (db as any)
      .schema('lifecycle')
      .rpc('set_statement_presentation_override', {
        p_source_transaction_id: input.sourceTransactionId,
        p_property_id: input.propertyId,
        p_presentation_status: input.presentationStatus,
        p_defer_until_date: input.deferUntilDate ?? null,
        p_economic_date: input.economicDate ?? null,
        p_override_reason: input.overrideReason ?? null,
        p_created_by: null,  // system-assigned from auth context
      })

    if (error) {
      console.error('[tenantChargeActions] setPresentationOverride RPC error:', error)
      return { ok: false, error: error.message ?? 'Database error' }
    }

    const raw = data as Record<string, unknown>
    return {
      ok: true,
      result: {
        id: String(raw.id),
        action: String(raw.action),
        economicDate: String(raw.economic_date),
      },
    }
  } catch (err) {
    console.error('[tenantChargeActions] setPresentationOverride unexpected error:', err)
    return { ok: false, error: 'Unexpected error' }
  }
}
