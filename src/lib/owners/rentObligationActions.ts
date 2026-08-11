'use server'

/**
 * rentObligationActions — Server Actions for Rent Terms, Obligations, and FIFO Allocation.
 *
 * P1 LTR Operations — Rent Terms + Expected Rent + FIFO Allocator
 *
 * Security boundary:
 *   Browser → Server Action → authenticateStatementUser() → createServiceClient()
 *   → SECURITY DEFINER RPC (service_role only, require_jj_staff() inside)
 *
 * Three-authority separation:
 *   Service Engagement = what service JJ provides
 *   Rental Contract = who is renting, terms, period
 *   Rent Terms + Obligations = expected rent + payment tracking (THIS FILE writes)
 *   Tenant Payment = actual rent money (public.transactions — NOT touched)
 *
 * Constitutional:
 *   - P-ARCH-1: NULL = Unknown (no placeholders)
 *   - P-ARCH-2: Yossi ≠ Jacob ≠ JJ (payee identity preserved in settlement_evidence)
 *   - P-ARCH-4: no delete (reversal = negative evidence append)
 *   - P-ARCH-5: lifecycle schema isolation
 *   - P-LEDGER-1: Cash Reality preserved (payer, payee, amount, date)
 *
 * FORBIDDEN:
 *   - Writing to public.transactions
 *   - DELETE on rent_obligations or rent_terms
 *   - Normalizing payer/payee identity
 *   - Guessing tenant/contract when ambiguous
 */

import { authenticateStatementUser } from '@/lib/statements/statementAuthService'
import { createServiceClient } from '@/lib/supabase'
import { isValidUUID } from '@/lib/owners/validation'
import type {
  RentTermDTO,
  RentTermReason,
  RentAllocationResultDTO,
  RentAllocationEntry,
  RentObligationStatus,
} from './ownerWorkspaceTypes'

// ─── Constants ────────────────────────────────────────────────────────────────

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const MONTH_RE = /^\d{4}-\d{2}$/

const VALID_TERM_REASONS = new Set<RentTermReason>([
  'initial', 'annual_increase', 'renegotiation', 'correction', 'market_adjustment',
])

const VALID_PAYERS = new Set([
  'Yossi', 'Jacob', 'Anastasia', 'JJ', 'Client', 'Tenant', 'Owner', 'Airbnb',
])

const VALID_PAYEES = new Set([
  'Yossi', 'Jacob', 'Anastasia', 'JJ', 'Client', 'Tenant', 'Owner', 'Airbnb',
])

// ─── Create Rent Term ─────────────────────────────────────────────────────────

export async function createRentTermAction(
  rentalContractId: string,
  monthlyRentEur: number,
  effectiveFrom: string,
  reason: string,
  governingEvidence?: string,
): Promise<{ ok: true; term: RentTermDTO } | { ok: false; error: string }> {
  const auth = await authenticateStatementUser()
  if (!auth.ok) return { ok: false, error: 'You must be signed in' }

  // Validate inputs
  if (!rentalContractId || !isValidUUID(rentalContractId)) {
    return { ok: false, error: 'Invalid rental contract ID' }
  }
  if (monthlyRentEur == null || monthlyRentEur < 0) {
    return { ok: false, error: 'Monthly rent must be zero or positive' }
  }
  if (!effectiveFrom || !ISO_DATE_RE.test(effectiveFrom)) {
    return { ok: false, error: 'Effective from date is required (YYYY-MM-DD)' }
  }
  if (!reason || !VALID_TERM_REASONS.has(reason as RentTermReason)) {
    return { ok: false, error: `Invalid reason: ${reason}` }
  }
  if (governingEvidence && governingEvidence.length > 2000) {
    return { ok: false, error: 'Governing evidence too long (max 2000 characters)' }
  }

  const db = createServiceClient()

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (db as any)
      .schema('lifecycle')
      .rpc('create_rent_term', {
        p_rental_contract_id: rentalContractId,
        p_monthly_rent_eur: monthlyRentEur,
        p_effective_from: effectiveFrom,
        p_reason: reason,
        p_governing_evidence: governingEvidence ?? null,
      })

    if (error) {
      console.error('[rentObligationActions] createRentTerm RPC error:', error)
      return { ok: false, error: error.message ?? 'Database error' }
    }

    // RPC returns JSONB row
    const row = data as Record<string, unknown>
    const term: RentTermDTO = {
      id: String(row.id),
      rentalContractId: String(row.rental_contract_id),
      monthlyRentEur: Number(row.monthly_rent_eur),
      effectiveFrom: String(row.effective_from),
      effectiveTo: row.effective_to != null ? String(row.effective_to) : null,
      reason: row.reason as RentTermReason,
      governingEvidence: row.governing_evidence != null ? String(row.governing_evidence) : null,
    }

    return { ok: true, term }
  } catch (err) {
    console.error('[rentObligationActions] createRentTerm unexpected error:', err)
    return { ok: false, error: 'Unexpected error' }
  }
}

// ─── Generate Rent Obligations ────────────────────────────────────────────────

export async function generateRentObligationsAction(
  rentalContractId: string,
  throughMonth: string,
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const auth = await authenticateStatementUser()
  if (!auth.ok) return { ok: false, error: 'You must be signed in' }

  if (!rentalContractId || !isValidUUID(rentalContractId)) {
    return { ok: false, error: 'Invalid rental contract ID' }
  }
  if (!throughMonth || !MONTH_RE.test(throughMonth)) {
    return { ok: false, error: 'Through month must be YYYY-MM format' }
  }

  // Convert YYYY-MM to a full date (last day of month) for the RPC
  const [year, month] = throughMonth.split('-').map(Number)
  const throughDate = new Date(year, month, 0) // last day of month
  const throughDateStr = throughDate.toISOString().split('T')[0]

  const db = createServiceClient()

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (db as any)
      .schema('lifecycle')
      .rpc('generate_rent_obligations', {
        p_rental_contract_id: rentalContractId,
        p_through_month: throughDateStr,
      })

    if (error) {
      console.error('[rentObligationActions] generateRentObligations RPC error:', error)
      return { ok: false, error: error.message ?? 'Database error' }
    }

    // RPC returns integer count
    const count = typeof data === 'number' ? data : Number(data ?? 0)
    return { ok: true, count }
  } catch (err) {
    console.error('[rentObligationActions] generateRentObligations unexpected error:', err)
    return { ok: false, error: 'Unexpected error' }
  }
}

// ─── Allocate Rent Payment (FIFO) ────────────────────────────────────────────

export async function allocateRentPaymentAction(
  propertyId: string,
  sourceTransactionId: string,
  payer: string,
  payee: string,
  totalAmount: number,
  paymentDate: string,
  rentalContractId?: string,
): Promise<{ ok: true; result: RentAllocationResultDTO } | { ok: false; error: string }> {
  const auth = await authenticateStatementUser()
  if (!auth.ok) return { ok: false, error: 'You must be signed in' }

  // Validate inputs
  if (!propertyId || !isValidUUID(propertyId)) {
    return { ok: false, error: 'Invalid property ID' }
  }
  if (!sourceTransactionId || !isValidUUID(sourceTransactionId)) {
    return { ok: false, error: 'Invalid source transaction ID' }
  }
  if (!payer || !VALID_PAYERS.has(payer)) {
    return { ok: false, error: `Invalid payer: ${payer}` }
  }
  if (!payee || !VALID_PAYEES.has(payee)) {
    return { ok: false, error: `Invalid payee: ${payee}` }
  }
  if (totalAmount == null || totalAmount <= 0) {
    return { ok: false, error: 'Total amount must be positive' }
  }
  if (!paymentDate || !ISO_DATE_RE.test(paymentDate)) {
    return { ok: false, error: 'Payment date is required (YYYY-MM-DD)' }
  }
  if (rentalContractId && !isValidUUID(rentalContractId)) {
    return { ok: false, error: 'Invalid rental contract ID' }
  }

  const db = createServiceClient()

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (db as any)
      .schema('lifecycle')
      .rpc('allocate_rent_payment', {
        p_property_id: propertyId,
        p_source_tx_id: sourceTransactionId,
        p_payer: payer,
        p_payee: payee,
        p_total_amount: totalAmount,
        p_payment_date: paymentDate,
        p_rental_contract_id: rentalContractId ?? null,
      })

    if (error) {
      console.error('[rentObligationActions] allocateRentPayment RPC error:', error)
      return { ok: false, error: error.message ?? 'Database error' }
    }

    // RPC returns JSONB allocation summary
    const raw = data as Record<string, unknown>
    const allocations = Array.isArray(raw.allocations)
      ? (raw.allocations as Record<string, unknown>[]).map((a): RentAllocationEntry => ({
          obligationId: String(a.obligation_id ?? ''),
          obligationMonth: String(a.obligation_month ?? ''),
          allocated: Number(a.allocated ?? 0),
          newStatus: String(a.new_status ?? 'partial') as RentObligationStatus,
        }))
      : []

    const result: RentAllocationResultDTO = {
      allocations,
      totalAllocated: Number(raw.total_allocated ?? 0),
      unappliedCredit: Number(raw.unapplied_credit ?? 0),
      sourceTransactionId: String(raw.source_transaction_id ?? sourceTransactionId),
      needsReview: Boolean(raw.needs_review),
      reviewReason: raw.review_reason != null ? String(raw.review_reason) : null,
    }

    return { ok: true, result }
  } catch (err) {
    console.error('[rentObligationActions] allocateRentPayment unexpected error:', err)
    return { ok: false, error: 'Unexpected error' }
  }
}

// ─── Reverse Rent Allocation ──────────────────────────────────────────────────

export async function reverseRentAllocationAction(
  sourceTransactionId: string,
  propertyId: string,
  reason: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await authenticateStatementUser()
  if (!auth.ok) return { ok: false, error: 'You must be signed in' }

  if (!sourceTransactionId || !isValidUUID(sourceTransactionId)) {
    return { ok: false, error: 'Invalid source transaction ID' }
  }
  if (!propertyId || !isValidUUID(propertyId)) {
    return { ok: false, error: 'Invalid property ID' }
  }
  if (!reason || reason.trim().length === 0) {
    return { ok: false, error: 'Reason is required for reversal' }
  }
  if (reason.length > 2000) {
    return { ok: false, error: 'Reason too long (max 2000 characters)' }
  }

  const db = createServiceClient()

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (db as any)
      .schema('lifecycle')
      .rpc('reverse_rent_allocation', {
        p_source_tx_id: sourceTransactionId,
        p_property_id: propertyId,
        p_reason: reason.trim(),
        p_created_by: auth.userId,
      })

    if (error) {
      console.error('[rentObligationActions] reverseRentAllocation RPC error:', error)
      return { ok: false, error: error.message ?? 'Database error' }
    }

    // RPC returns JSONB reversal summary — we just report success
    void data
    return { ok: true }
  } catch (err) {
    console.error('[rentObligationActions] reverseRentAllocation unexpected error:', err)
    return { ok: false, error: 'Unexpected error' }
  }
}
