'use server'

/**
 * managementFeeActions — Server Actions for Management Fee generation and offset.
 *
 * P2 LTR Operations — Management Fee Engine
 *
 * Security boundary:
 *   Browser → Server Action → authenticateStatementUser() → createServiceClient()
 *   → SECURITY DEFINER RPC (service_role only, require_jj_staff() inside)
 *
 * Three-authority separation:
 *   Service Engagement = what service JJ provides
 *   Management Fee Config = how the fee is structured (read-only here)
 *   Management Fee Obligation = periodic fee calculation (THIS FILE writes via RPC)
 *   Owner Fund Allocation = cross-obligation offset (THIS FILE writes via RPC)
 *
 * Constitutional:
 *   - P-ARCH-1: NULL = Unknown (no placeholders)
 *   - P-ARCH-2: Yossi ≠ Jacob ≠ JJ (payer identity preserved in settlement_evidence)
 *   - P-ARCH-4: no delete on owner_fund_allocations (append-only)
 *   - P-ARCH-5: lifecycle schema isolation
 *   - P-LEDGER-1: Cash Reality preserved (payer, payee, amount, date)
 *
 * FORBIDDEN:
 *   - Writing to public.transactions
 *   - DELETE on management_fee_obligations or owner_fund_allocations
 *   - Normalizing payer/payee identity
 *   - Creating fictional cash flows
 */

import { authenticateStatementUser } from '@/lib/statements/statementAuthService'
import { createServiceClient } from '@/lib/supabase'
import { isValidUUID } from '@/lib/owners/validation'
import type {
  ManagementFeeObligationDTO,
  ManagementFeeObligationStatus,
  ManagementFeeOffsetResultDTO,
  FeeProrationSegment,
} from './ownerWorkspaceTypes'

// ─── Constants ────────────────────────────────────────────────────────────────

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const VALID_PAYERS = new Set([
  'Yossi', 'Jacob', 'Anastasia', 'JJ', 'Client', 'Tenant', 'Owner', 'Airbnb',
])

const VALID_PAYEES = new Set([
  'Yossi', 'Jacob', 'Anastasia', 'JJ', 'Client', 'Tenant', 'Owner', 'Airbnb',
])

// ─── Generate Management Fee Obligation ─────────────────────────────────────

export async function generateManagementFeeAction(
  feeConfigId: string,
  periodStart: string,
  periodEnd: string,
): Promise<
  | { ok: true; obligation: ManagementFeeObligationDTO }
  | { ok: true; skipped: true; reason: string }
  | { ok: false; error: string }
> {
  const auth = await authenticateStatementUser()
  if (!auth.ok) return { ok: false, error: 'You must be signed in' }

  // Validate inputs
  if (!feeConfigId || !isValidUUID(feeConfigId)) {
    return { ok: false, error: 'Invalid fee config ID' }
  }
  if (!periodStart || !ISO_DATE_RE.test(periodStart)) {
    return { ok: false, error: 'Period start date is required (YYYY-MM-DD)' }
  }
  if (!periodEnd || !ISO_DATE_RE.test(periodEnd)) {
    return { ok: false, error: 'Period end date is required (YYYY-MM-DD)' }
  }
  if (periodStart >= periodEnd) {
    return { ok: false, error: 'Period start must be before period end' }
  }

  const db = createServiceClient()

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (db as any)
      .schema('lifecycle')
      .rpc('generate_management_fee_obligation', {
        p_fee_config_id: feeConfigId,
        p_period_start: periodStart,
        p_period_end: periodEnd,
      })

    if (error) {
      console.error('[managementFeeActions] generateManagementFee RPC error:', error)
      return { ok: false, error: error.message ?? 'Database error' }
    }

    // RPC returns NULL for no_fee type
    if (data === null) {
      return { ok: true, skipped: true, reason: 'Fee type is no_fee — no obligation generated' }
    }

    // RPC returns JSONB with obligation details
    const row = data as Record<string, unknown>

    // Check idempotency — already exists
    if (row.already_exists === true) {
      return { ok: true, skipped: true, reason: 'Obligation already exists for this period' }
    }

    // Parse proration details
    let prorationDetails: readonly FeeProrationSegment[] | null = null
    if (row.proration_details != null) {
      const details = row.proration_details as Record<string, unknown>[]
      if (Array.isArray(details) && details.length > 0) {
        prorationDetails = details.map(seg => ({
          tenantName: String(seg.tenant_name ?? ''),
          rentalContractId: String(seg.rental_contract_id ?? ''),
          rentTermId: seg.rent_term_id != null ? String(seg.rent_term_id) : null,
          segmentStart: String(seg.segment_start ?? ''),
          segmentEnd: String(seg.segment_end ?? ''),
          segmentDays: Number(seg.segment_days ?? 0),
          effectiveRentEur: Number(seg.effective_rent_eur ?? 0),
          segmentContributionEur: Number(seg.segment_contribution_eur ?? 0),
        }))
      }
    }

    const obligation: ManagementFeeObligationDTO = {
      id: String(row.id),
      feeConfigId: String(row.fee_config_id),
      propertyId: String(row.property_id),
      periodStart: String(row.period_start),
      periodEnd: String(row.period_end),
      periodLabel: String(row.period_label ?? ''),
      calculatedAmountEur: String(row.calculated_amount_eur ?? '0'),
      proratedAmountEur: String(row.prorated_amount_eur ?? '0'),
      prorationDetails,
      settledAmountEur: String(row.settled_amount_eur ?? '0'),
      status: (row.status as ManagementFeeObligationStatus) ?? 'pending',
      settlementEvidence: row.settlement_evidence ?? null,
    }

    return { ok: true, obligation }
  } catch (err) {
    console.error('[managementFeeActions] generateManagementFee unexpected error:', err)
    return { ok: false, error: 'Unexpected error' }
  }
}

// ─── Offset Management Fee from Rent (Atomic — Blocker 11) ──────────────────

export async function offsetManagementFeeAction(
  rentObligationId: string,
  offsetAmount: number,
  feeObligationId: string,
  payee: string,
  paymentDate: string,
  paidBy?: string,
): Promise<{ ok: true; result: ManagementFeeOffsetResultDTO } | { ok: false; error: string }> {
  const auth = await authenticateStatementUser()
  if (!auth.ok) return { ok: false, error: 'You must be signed in' }

  // Validate inputs
  if (!rentObligationId || !isValidUUID(rentObligationId)) {
    return { ok: false, error: 'Invalid rent obligation ID' }
  }
  if (offsetAmount == null || offsetAmount <= 0) {
    return { ok: false, error: 'Offset amount must be positive' }
  }
  if (!feeObligationId || !isValidUUID(feeObligationId)) {
    return { ok: false, error: 'Invalid fee obligation ID' }
  }
  if (!payee || !VALID_PAYEES.has(payee)) {
    return { ok: false, error: `Invalid payee: ${payee}` }
  }
  if (!paymentDate || !ISO_DATE_RE.test(paymentDate)) {
    return { ok: false, error: 'Payment date is required (YYYY-MM-DD)' }
  }
  if (paidBy && !VALID_PAYERS.has(paidBy)) {
    return { ok: false, error: `Invalid payer: ${paidBy}` }
  }

  const db = createServiceClient()

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (db as any)
      .schema('lifecycle')
      .rpc('offset_management_fee_from_rent', {
        p_rent_obligation_id: rentObligationId,
        p_offset_amount: offsetAmount,
        p_fee_obligation_id: feeObligationId,
        p_payee: payee,
        p_payment_date: paymentDate,
        p_paid_by: paidBy ?? null,
      })

    if (error) {
      console.error('[managementFeeActions] offsetManagementFee RPC error:', error)
      return { ok: false, error: error.message ?? 'Database error' }
    }

    // RPC returns JSONB offset result
    const raw = data as Record<string, unknown>

    const result: ManagementFeeOffsetResultDTO = {
      allocationId: String(raw.allocation_id ?? ''),
      sourceObligationId: String(raw.source_obligation_id ?? rentObligationId),
      targetObligationId: String(raw.target_obligation_id ?? feeObligationId),
      offsetAmount: Number(raw.offset_amount ?? offsetAmount),
      newFeeStatus: (raw.new_fee_status as ManagementFeeObligationStatus) ?? 'partial',
      settlementEvidence: raw.settlement_evidence ?? null,
    }

    return { ok: true, result }
  } catch (err) {
    console.error('[managementFeeActions] offsetManagementFee unexpected error:', err)
    return { ok: false, error: 'Unexpected error' }
  }
}
