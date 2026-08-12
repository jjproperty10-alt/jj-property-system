'use server'

/**
 * brokerageActions — Server Actions for Brokerage Obligations.
 *
 * P6 LTR Operations — Brokerage Obligations
 *
 * Security boundary:
 *   Browser → Server Action → authenticateStatementUser() → createServiceClient()
 *   → SECURITY DEFINER RPC (service_role only, require_jj_staff() inside)
 *
 * Business rule:
 *   One brokerage per NEW tenant placement.
 *   No recurrence on renewal. No brokerage on rent change.
 *   Idempotency key '{contract_id}:brokerage' is built inside the RPC —
 *   the caller does NOT provide it.
 *
 * FORBIDDEN:
 *   - Writing to public.transactions
 *   - Modifying deposit lifecycle (P3 authoritative)
 *   - Creating tenant charges (P5 authoritative)
 *   - Creating utility obligations (P4 authoritative)
 */

import { authenticateStatementUser } from '@/lib/statements/statementAuthService'
import { createServiceClient } from '@/lib/supabase'
import { isValidUUID } from '@/lib/owners/validation'
import type {
  BrokerageCalculationType,
  BrokerageStatus,
} from './ownerWorkspaceTypes'

// ─── Constants ────────────────────────────────────────────────────────────────

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const VALID_CALCULATION_TYPES = new Set<BrokerageCalculationType>([
  'one_month_rent', 'fixed_amount', 'percentage',
])

const VALID_BROKERAGE_STATUSES = new Set<BrokerageStatus>([
  'pending', 'billed', 'settled', 'waived', 'reversed',
])

const VALID_PAYERS = new Set(['Owner', 'Tenant', 'JJ'])
const VALID_PAYEES = new Set(['JJ', 'Broker', 'Yossi', 'Jacob'])

// ─── Create Brokerage Obligation ────────────────────────────────────────────

export interface CreateBrokerageInput {
  rentalContractId: string
  propertyId: string
  tenantName: string
  brokerageApplicable: boolean
  brokerName: string | null
  calculationType: BrokerageCalculationType
  percentageRate: number | null   // required when calculationType = 'percentage'
  chargeAmountEur: number
  chargeDate: string              // YYYY-MM-DD
  isNewTenant: boolean
  payer: string
  payee: string
  governingEvidence?: string | null
  notes?: string | null
}

export async function createBrokerageAction(
  input: CreateBrokerageInput,
): Promise<
  | { ok: true; result: { id: string; status: string; idempotencyKey: string } }
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
  if (!VALID_CALCULATION_TYPES.has(input.calculationType)) {
    return { ok: false, error: `Invalid calculation type: ${input.calculationType}` }
  }
  if (input.calculationType === 'percentage') {
    if (input.percentageRate == null || input.percentageRate <= 0 || input.percentageRate > 100) {
      return { ok: false, error: 'percentage_rate must be > 0 and <= 100 when calculation_type = percentage' }
    }
  }
  if (input.chargeAmountEur == null || input.chargeAmountEur < 0) {
    return { ok: false, error: 'Charge amount must be non-negative' }
  }
  if (!input.chargeDate || !ISO_DATE_RE.test(input.chargeDate)) {
    return { ok: false, error: 'Charge date is required (YYYY-MM-DD)' }
  }
  if (!VALID_PAYERS.has(input.payer)) {
    return { ok: false, error: `Invalid payer: ${input.payer}` }
  }
  if (!VALID_PAYEES.has(input.payee)) {
    return { ok: false, error: `Invalid payee: ${input.payee}` }
  }

  // ── RPC call ──────────────────────────────────────────────────────────────

  const db = createServiceClient()

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (db as any)
      .schema('lifecycle')
      .rpc('create_brokerage_obligation', {
        p_rental_contract_id: input.rentalContractId,
        p_property_id: input.propertyId,
        p_tenant_name: input.tenantName.trim(),
        p_brokerage_applicable: input.brokerageApplicable,
        p_broker_name: input.brokerName,
        p_calculation_type: input.calculationType,
        p_percentage_rate: input.percentageRate,
        p_charge_amount_eur: input.chargeAmountEur,
        p_charge_date: input.chargeDate,
        p_is_new_tenant: input.isNewTenant,
        p_payer: input.payer,
        p_payee: input.payee,
        p_governing_evidence: input.governingEvidence ?? null,
        p_notes: input.notes ?? null,
      })

    if (error) {
      console.error('[brokerageActions] createBrokerage RPC error:', error)
      return { ok: false, error: error.message ?? 'Database error' }
    }

    const raw = data as Record<string, unknown>
    return {
      ok: true,
      result: {
        id: String(raw.id),
        status: String(raw.status),
        idempotencyKey: String(raw.idempotency_key),
      },
    }
  } catch (err) {
    console.error('[brokerageActions] createBrokerage unexpected error:', err)
    return { ok: false, error: 'Unexpected error' }
  }
}

// ─── Update Brokerage Status ────────────────────────────────────────────────

export interface UpdateBrokerageStatusInput {
  brokerageId: string
  newStatus: BrokerageStatus
  settledAmount?: number | null
  settlementEvidence?: Record<string, unknown> | null
}

export async function updateBrokerageStatusAction(
  input: UpdateBrokerageStatusInput,
): Promise<
  | { ok: true; result: { id: string; previousStatus: string; newStatus: string } }
  | { ok: false; error: string }
> {
  const auth = await authenticateStatementUser()
  if (!auth.ok) return { ok: false, error: 'You must be signed in' }

  if (!input.brokerageId || !isValidUUID(input.brokerageId)) {
    return { ok: false, error: 'Invalid brokerage ID' }
  }
  if (!VALID_BROKERAGE_STATUSES.has(input.newStatus)) {
    return { ok: false, error: `Invalid status: ${input.newStatus}` }
  }

  const db = createServiceClient()

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (db as any)
      .schema('lifecycle')
      .rpc('update_brokerage_status', {
        p_brokerage_id: input.brokerageId,
        p_new_status: input.newStatus,
        p_settled_amount: input.settledAmount ?? null,
        p_settlement_evidence: input.settlementEvidence ?? null,
      })

    if (error) {
      console.error('[brokerageActions] updateStatus RPC error:', error)
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
    console.error('[brokerageActions] updateStatus unexpected error:', err)
    return { ok: false, error: 'Unexpected error' }
  }
}
