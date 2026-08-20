'use server'

/**
 * billingActions — Server Actions for billing + payment state management.
 *
 * PR #166 — Gaps C+D (Include/Exclude), E+F (FIFO Allocation + Integrity).
 *
 * Security boundary:
 *   Browser → Server Action → authenticateStatementUser() → createServiceClient()
 *   → SECURITY DEFINER RPC (service_role only, require_jj_staff() inside)
 *
 * Constitutional:
 *   - P-ARCH-1: NULL = Unknown (no placeholders)
 *   - Billing and Payment are two independent lifecycles
 *   - Include/Exclude modifies billing state only, never payment state
 *   - P-LEDGER-6: Owner-facing amounts = COALESCE(client_charge, amount_eur)
 *   - FIFO allocation: oldest charges first, partial allocation supported
 */

import { authenticateStatementUser } from '@/lib/statements/statementAuthService'
import { createServiceClient } from '@/lib/supabase'
import { isValidUUID } from '@/lib/owners/validation'
import type {
  FinancialCorrectionType,
  FinancialCorrectionStatus,
  CorrectionPriority,
} from '@/lib/owners/ownerWorkspaceTypes'
import {
  buildCorrectionInsertRows,
  CorrectionInsertError,
  type OriginalTxRow,
} from '@/lib/statements/correctionInsertRows'
import type { CorrectionPlan } from '@/lib/statements/correctionPlan'

// ─── Toggle Draft Line Inclusion ─────────────────────────────

export interface ToggleDraftLineInclusionInput {
  /** UUID of the statement_draft_lines row */
  lineId: string
  /** true = include in statement, false = exclude */
  includeInStatement: boolean
}

export async function toggleDraftLineInclusionAction(
  input: ToggleDraftLineInclusionInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await authenticateStatementUser()
  if (!auth.ok) return { ok: false, error: 'You must be signed in' }

  if (!input.lineId || !isValidUUID(input.lineId)) {
    return { ok: false, error: 'Invalid line ID' }
  }
  if (typeof input.includeInStatement !== 'boolean') {
    return { ok: false, error: 'includeInStatement must be a boolean' }
  }

  const db = createServiceClient()

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (db as any)
      .schema('statements')
      .rpc('toggle_draft_line_inclusion', {
        p_line_id: input.lineId,
        p_include_in_statement: input.includeInStatement,
      })

    if (error) {
      console.error('[billingActions] toggleDraftLineInclusion RPC error:', error)
      return { ok: false, error: error.message ?? 'Database error' }
    }

    return { ok: true }
  } catch (err) {
    console.error('[billingActions] toggleDraftLineInclusion unexpected error:', err)
    return { ok: false, error: 'Unexpected error' }
  }
}

// ─── Lookup Active Statement Series ─────────────────────────

/**
 * Resolve the active statement_series for an owner.
 * Returns the series_id if one exists, null otherwise.
 * This is the canonical way to get seriesId for billing state wiring.
 */
export async function resolveOwnerSeriesIdAction(
  ownerPartyId: string,
): Promise<{ ok: true; seriesId: string | null } | { ok: false; error: string }> {
  const auth = await authenticateStatementUser()
  if (!auth.ok) return { ok: false, error: 'You must be signed in' }

  if (!ownerPartyId || !isValidUUID(ownerPartyId)) {
    return { ok: false, error: 'Invalid owner party ID' }
  }

  const db = createServiceClient()

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (db as any)
      .schema('statements')
      .from('statement_series')
      .select('series_id')
      .eq('owner_party_id', ownerPartyId)
      .eq('series_status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)

    if (error) {
      console.error('[billingActions] resolveOwnerSeriesId error:', error)
      return { ok: false, error: error.message ?? 'Database error' }
    }

    const seriesId = data && data.length > 0 ? String(data[0].series_id) : null
    return { ok: true, seriesId }
  } catch (err) {
    console.error('[billingActions] resolveOwnerSeriesId unexpected error:', err)
    return { ok: false, error: 'Unexpected error' }
  }
}

// ─── Manual Payment Allocation ─────────────────────────────

export interface AllocatePaymentInput {
  seriesId: string
  paymentTransactionId: string
  chargeTransactionId: string
  amountEur: number
  method?: 'manual' | 'fifo'
  notes?: string
}

/**
 * Allocate a specific amount from a payment transaction to a charge transaction.
 * Integrity-enforced: validates both transactions exist + active,
 * prevents over-allocation of both charge and payment.
 */
export async function allocatePaymentAction(
  input: AllocatePaymentInput,
): Promise<{ ok: true; allocationId: string } | { ok: false; error: string }> {
  const auth = await authenticateStatementUser()
  if (!auth.ok) return { ok: false, error: 'You must be signed in' }

  if (!input.seriesId || !isValidUUID(input.seriesId)) {
    return { ok: false, error: 'Invalid series ID' }
  }
  if (!input.paymentTransactionId || !isValidUUID(input.paymentTransactionId)) {
    return { ok: false, error: 'Invalid payment transaction ID' }
  }
  if (!input.chargeTransactionId || !isValidUUID(input.chargeTransactionId)) {
    return { ok: false, error: 'Invalid charge transaction ID' }
  }
  if (typeof input.amountEur !== 'number' || input.amountEur <= 0) {
    return { ok: false, error: 'Amount must be a positive number' }
  }

  const db = createServiceClient()

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (db as any)
      .schema('statements')
      .rpc('allocate_payment', {
        p_series_id: input.seriesId,
        p_payment_transaction_id: input.paymentTransactionId,
        p_charge_transaction_id: input.chargeTransactionId,
        p_amount_eur: input.amountEur,
        p_method: input.method ?? 'manual',
        p_notes: input.notes ?? null,
      })

    if (error) {
      console.error('[billingActions] allocatePayment RPC error:', error)
      return { ok: false, error: error.message ?? 'Database error' }
    }

    return { ok: true, allocationId: String(data) }
  } catch (err) {
    console.error('[billingActions] allocatePayment unexpected error:', err)
    return { ok: false, error: 'Unexpected error' }
  }
}

// ─── FIFO Automatic Allocation ─────────────────────────────

export interface FifoAllocatePaymentInput {
  seriesId: string
  paymentTransactionId: string
}

/**
 * Auto-allocate a payment to the oldest unpaid charges in the series (FIFO).
 * Returns the number of charge allocations created.
 *
 * Algorithm (executed in DB):
 *   1. Get all included charge draft lines for this series, ordered by date ASC
 *   2. For each charge: remaining = charge_amount - sum(existing allocations)
 *   3. Allocate min(remaining_payment, charge_remaining) to each
 *   4. Stop when payment is fully allocated or no more charges
 */
export async function fifoAllocatePaymentAction(
  input: FifoAllocatePaymentInput,
): Promise<{ ok: true; allocationsCreated: number } | { ok: false; error: string }> {
  const auth = await authenticateStatementUser()
  if (!auth.ok) return { ok: false, error: 'You must be signed in' }

  if (!input.seriesId || !isValidUUID(input.seriesId)) {
    return { ok: false, error: 'Invalid series ID' }
  }
  if (!input.paymentTransactionId || !isValidUUID(input.paymentTransactionId)) {
    return { ok: false, error: 'Invalid payment transaction ID' }
  }

  const db = createServiceClient()

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (db as any)
      .schema('statements')
      .rpc('fifo_allocate_payment', {
        p_series_id: input.seriesId,
        p_payment_transaction_id: input.paymentTransactionId,
      })

    if (error) {
      console.error('[billingActions] fifoAllocatePayment RPC error:', error)
      return { ok: false, error: error.message ?? 'Database error' }
    }

    return { ok: true, allocationsCreated: Number(data) ?? 0 }
  } catch (err) {
    console.error('[billingActions] fifoAllocatePayment unexpected error:', err)
    return { ok: false, error: 'Unexpected error' }
  }
}

// ─── Correction Cases ──────────────────────────────────────

export interface OpenCorrectionCaseInput {
  seriesId: string
  originalTransactionId: string
  /** DB-aligned vocabulary (statements.correction_cases CHECK); reuses FinancialCorrectionType. */
  correctionType: FinancialCorrectionType
  description: string
  /** DB-aligned vocabulary: 'low' | 'normal' | 'high' | 'urgent'. */
  priority?: CorrectionPriority
  originalAmountEur?: number
  correctedAmountEur?: number
  /** Optional JSONB snapshots stored on the case (original/corrected field values). */
  originalFields?: Record<string, unknown> | null
  correctedFields?: Record<string, unknown> | null
}

/**
 * Open a new correction case for a transaction.
 * Immutable event ledger: the open event is appended to correction_events.
 */
export async function openCorrectionCaseAction(
  input: OpenCorrectionCaseInput,
): Promise<{ ok: true; caseId: string } | { ok: false; error: string }> {
  const auth = await authenticateStatementUser()
  if (!auth.ok) return { ok: false, error: 'You must be signed in' }

  if (!input.seriesId || !isValidUUID(input.seriesId)) {
    return { ok: false, error: 'Invalid series ID' }
  }
  if (!input.originalTransactionId || !isValidUUID(input.originalTransactionId)) {
    return { ok: false, error: 'Invalid transaction ID' }
  }
  if (!input.description || input.description.trim().length === 0) {
    return { ok: false, error: 'Description is required' }
  }

  const db = createServiceClient()

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (db as any)
      .schema('statements')
      .rpc('open_correction_case', {
        // Param names match the deployed statements.open_correction_case signature.
        p_series_id: input.seriesId,
        p_original_tx_id: input.originalTransactionId,
        p_correction_type: input.correctionType,
        p_description: input.description.trim(),
        p_original_amount: input.originalAmountEur ?? null,
        p_corrected_amount: input.correctedAmountEur ?? null,
        p_priority: input.priority ?? 'normal',
        p_original_fields: input.originalFields ?? null,
        p_corrected_fields: input.correctedFields ?? null,
      })

    if (error) {
      console.error('[billingActions] openCorrectionCase RPC error:', error)
      return { ok: false, error: error.message ?? 'Database error' }
    }

    return { ok: true, caseId: String(data) }
  } catch (err) {
    console.error('[billingActions] openCorrectionCase unexpected error:', err)
    return { ok: false, error: 'Unexpected error' }
  }
}

export interface TransitionCorrectionCaseInput {
  caseId: string
  /** DB-aligned lifecycle vocabulary (statements.correction_cases status CHECK). */
  newStatus: FinancialCorrectionStatus
  notes?: string
  /** The corrected transaction id to record when transitioning to 'applied'. */
  appliedTransactionId?: string
}

/**
 * Transition a correction case to a new status.
 * Each transition is recorded as an immutable event.
 */
export async function transitionCorrectionCaseAction(
  input: TransitionCorrectionCaseInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await authenticateStatementUser()
  if (!auth.ok) return { ok: false, error: 'You must be signed in' }

  if (!input.caseId || !isValidUUID(input.caseId)) {
    return { ok: false, error: 'Invalid case ID' }
  }

  const db = createServiceClient()

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (db as any)
      .schema('statements')
      .rpc('transition_correction_case', {
        p_case_id: input.caseId,
        p_new_status: input.newStatus,
        p_notes: input.notes ?? null,
        p_applied_tx_id: input.appliedTransactionId ?? null,
      })

    if (error) {
      console.error('[billingActions] transitionCorrectionCase RPC error:', error)
      return { ok: false, error: error.message ?? 'Database error' }
    }

    return { ok: true }
  } catch (err) {
    console.error('[billingActions] transitionCorrectionCase unexpected error:', err)
    return { ok: false, error: 'Unexpected error' }
  }
}

// ─── Apply a correction by INSERT (append-only model) (Item 1) ─────────────
//
// Append-only correction path: from a G7 CorrectionPlan + the original row, build
// the complete correcting public.transactions rows and hand them to the new atomic
// RPC statements.apply_correction_case, which INSERTs them (NEVER updates/deletes
// the original), records applied_transaction_id, appends a correction event, and
// marks the case 'applied'. History stays immutable; the audit trail is the case +
// event log + the append-only transactions themselves. The prior in-place RPC
// (public.apply_transaction_correction) is deprecated by this package's migration.

export interface ApplyCorrectionCaseInput {
  caseId: string
  plan: CorrectionPlan
  /** The original transaction row (metadata inheritance); null only for a standalone append. */
  original: OriginalTxRow | null
}

export async function applyCorrectionCaseAction(
  input: ApplyCorrectionCaseInput,
): Promise<{ ok: true; appliedTransactionId: string } | { ok: false; error: string }> {
  const auth = await authenticateStatementUser()
  if (!auth.ok) return { ok: false, error: 'You must be signed in' }
  if (!input || !input.caseId || !isValidUUID(input.caseId)) {
    return { ok: false, error: 'Invalid case ID' }
  }

  // Build the complete INSERT rows (append-only), failing fast on an incoherent plan.
  let rows
  try {
    rows = buildCorrectionInsertRows(input.plan, input.original)
  } catch (e) {
    if (e instanceof CorrectionInsertError) return { ok: false, error: e.message }
    return { ok: false, error: 'Invalid correction plan' }
  }

  const db = createServiceClient()
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (db as any).schema('statements')
      .rpc('apply_correction_case', { p_case_id: input.caseId, p_rows: rows })
    if (error) {
      console.error('[billingActions] applyCorrectionCase RPC error:', error)
      return { ok: false, error: error.message ?? 'Database error' }
    }
    return { ok: true, appliedTransactionId: String(data) }
  } catch (err) {
    console.error('[billingActions] applyCorrectionCase unexpected error:', err)
    return { ok: false, error: 'Unexpected error' }
  }
}

// ─── Report Preferences (Language + Presentation) ──────────

export interface ReportPreferences {
  language?: string
  isRtl?: boolean
  titleOverride?: string | null
  headerText?: string | null
  footerText?: string | null
  showInternalMargin?: boolean
  showPaymentAllocations?: boolean
  showBillingState?: boolean
  dateFormat?: string
  currencyFormat?: string
}

/**
 * Get persisted report preferences for a statement series.
 * Returns empty object if none set — caller merges with defaults.
 */
export async function getReportPreferencesAction(
  seriesId: string,
): Promise<{ ok: true; preferences: ReportPreferences } | { ok: false; error: string }> {
  const auth = await authenticateStatementUser()
  if (!auth.ok) return { ok: false, error: 'You must be signed in' }

  if (!seriesId || !isValidUUID(seriesId)) {
    return { ok: false, error: 'Invalid series ID' }
  }

  const db = createServiceClient()

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (db as any)
      .schema('statements')
      .rpc('get_report_preferences', { p_series_id: seriesId })

    if (error) {
      console.error('[billingActions] getReportPreferences RPC error:', error)
      return { ok: false, error: error.message ?? 'Database error' }
    }

    return { ok: true, preferences: (data as ReportPreferences) ?? {} }
  } catch (err) {
    console.error('[billingActions] getReportPreferences unexpected error:', err)
    return { ok: false, error: 'Unexpected error' }
  }
}

/**
 * Save report preferences for a statement series.
 * Partial update: only provided fields are changed.
 */
export async function setReportPreferencesAction(
  seriesId: string,
  preferences: ReportPreferences,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await authenticateStatementUser()
  if (!auth.ok) return { ok: false, error: 'You must be signed in' }

  if (!seriesId || !isValidUUID(seriesId)) {
    return { ok: false, error: 'Invalid series ID' }
  }

  const db = createServiceClient()

  try {
    // Get current preferences first for merge
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: current } = await (db as any)
      .schema('statements')
      .rpc('get_report_preferences', { p_series_id: seriesId })

    const merged = { ...(current as ReportPreferences ?? {}), ...preferences }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (db as any)
      .schema('statements')
      .rpc('set_report_preferences', {
        p_series_id: seriesId,
        p_preferences: merged,
      })

    if (error) {
      console.error('[billingActions] setReportPreferences RPC error:', error)
      return { ok: false, error: error.message ?? 'Database error' }
    }

    return { ok: true }
  } catch (err) {
    console.error('[billingActions] setReportPreferences unexpected error:', err)
    return { ok: false, error: 'Unexpected error' }
  }
}
