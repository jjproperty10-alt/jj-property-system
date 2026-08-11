'use server'

/**
 * depositActions â Server Actions for Deposit Lifecycle event recording.
 *
 * P3 LTR Operations â Deposit Lifecycle (Event-Sourced)
 *
 * Security boundary:
 *   Browser â Server Action â authenticateStatementUser() â createServiceClient()
 *   â SECURITY DEFINER RPC (service_role only, require_jj_staff() inside)
 *
 * Constitutional:
 *   - P-ARCH-1: NULL = Unknown (no placeholders)
 *   - P-ARCH-2: Yossi â  Jacob â  JJ (custodian identity preserved)
 *   - P-ARCH-4: Append-only (no UPDATE/DELETE on deposit_events)
 *   - P-ARCH-5: lifecycle schema isolation
 *   - P-LEDGER-1: Cash Reality â  Economic Allocation â  Settlement Counterparty
 *   - Deposit is NEVER income â custodial/settlement lifecycle only
 *
 * FORBIDDEN:
 *   - Writing to public.transactions
 *   - UPDATE/DELETE on deposit_events
 *   - Treating deposit as income/expense
 *   - Normalizing custodian identity
 *   - Creating fictional cash movements for inherited custody
 */

import { authenticateStatementUser } from '@/lib/statements/statementAuthService'
import { createServiceClient } from '@/lib/supabase'
import { isValidUUID } from '@/lib/owners/validation'
import type {
  DepositEventType,
  DepositCustodian,
  RecordDepositEventResultDTO,
} from './ownerWorkspaceTypes'

// âââ Constants ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const VALID_EVENT_TYPES = new Set<DepositEventType>([
  'received', 'refunded', 'partially_withheld',
  'forfeited_to_owner', 'transferred_custody', 'adjustment',
])

const VALID_CUSTODIANS = new Set<DepositCustodian>([
  'Owner', 'JJ', 'Yossi', 'Jacob', 'Anastasia', 'Tenant',
])

// âââ Record Deposit Event âââââââââââââââââââââââââââââââââââââââââââââââââââââ

export interface RecordDepositEventInput {
  rentalContractId: string
  propertyId: string
  eventType: DepositEventType
  amountEur: number
  custodian: DepositCustodian
  tenantName: string
  effectiveDate: string
  withheldAmountEur?: number | null
  withheldReason?: string | null
  previousCustodian?: string | null
  governingEvidence?: string | null
  notes?: string | null
}

export async function recordDepositEventAction(
  input: RecordDepositEventInput,
): Promise<
  | { ok: true; result: RecordDepositEventResultDTO }
  | { ok: false; error: string }
> {
  const auth = await authenticateStatementUser()
  if (!auth.ok) return { ok: false, error: 'You must be signed in' }

  // ââ Validate required fields âââââââââââââââââââââââââââââââââââââââââââââââ

  if (!input.rentalContractId || !isValidUUID(input.rentalContractId)) {
    return { ok: false, error: 'Invalid rental contract ID' }
  }
  if (!input.propertyId || !isValidUUID(input.propertyId)) {
    return { ok: false, error: 'Invalid property ID' }
  }
  if (!input.eventType || !VALID_EVENT_TYPES.has(input.eventType)) {
    return { ok: false, error: `Invalid event type: ${input.eventType}` }
  }
  if (!input.custodian || !VALID_CUSTODIANS.has(input.custodian)) {
    return { ok: false, error: `Invalid custodian: ${input.custodian}` }
  }
  if (!input.tenantName || input.tenantName.trim() === '') {
    return { ok: false, error: 'Tenant name is required' }
  }
  if (!input.effectiveDate || !ISO_DATE_RE.test(input.effectiveDate)) {
    return { ok: false, error: 'Effective date is required (YYYY-MM-DD)' }
  }

  // ââ Event-type-specific validation (mirrors RPC) âââââââââââââââââââââââââââ

  if (input.eventType === 'received' || input.eventType === 'refunded') {
    if (input.amountEur == null || input.amountEur <= 0) {
      return { ok: false, error: `${input.eventType} event requires positive amount` }
    }
  }

  if (input.eventType === 'partially_withheld') {
    if (input.withheldAmountEur == null || input.withheldAmountEur <= 0) {
      return { ok: false, error: 'partially_withheld requires positive withheld amount' }
    }
    if (!input.withheldReason || input.withheldReason.trim() === '') {
      return { ok: false, error: 'partially_withheld requires withheld reason' }
    }
  }

  if (input.eventType === 'forfeited_to_owner') {
    if (input.withheldAmountEur == null || input.withheldAmountEur <= 0) {
      return { ok: false, error: 'forfeited_to_owner requires positive withheld amount' }
    }
  }

  if (input.eventType === 'transferred_custody') {
    if (!input.previousCustodian || input.previousCustodian.trim() === '') {
      return { ok: false, error: 'transferred_custody requires previous custodian' }
    }
    if (input.previousCustodian === input.custodian) {
      return { ok: false, error: 'transferred_custody: previous custodian must differ from custodian' }
    }
  }

  if (input.eventType === 'adjustment') {
    if (!input.notes || input.notes.trim() === '') {
      return { ok: false, error: 'adjustment event requires notes explaining the reason' }
    }
  }

  // ââ RPC call âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

  const db = createServiceClient()

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (db as any)
      .schema('lifecycle')
      .rpc('record_deposit_event', {
        p_rental_contract_id: input.rentalContractId,
        p_property_id: input.propertyId,
        p_event_type: input.eventType,
        p_amount_eur: input.amountEur,
        p_custodian: input.custodian,
        p_tenant_name: input.tenantName,
        p_effective_date: input.effectiveDate,
        p_withheld_amount_eur: input.withheldAmountEur ?? null,
        p_withheld_reason: input.withheldReason ?? null,
        p_previous_custodian: input.previousCustodian ?? null,
        p_governing_evidence: input.governingEvidence ?? null,
        p_notes: input.notes ?? null,
      })

    if (error) {
      console.error('[depositActions] recordDepositEvent RPC error:', error)
      return { ok: false, error: error.message ?? 'Database error' }
    }

    const raw = data as Record<string, unknown>

    const result: RecordDepositEventResultDTO = {
      eventId: String(raw.event_id),
      eventType: input.eventType,
      amountEur: Number(raw.amount_eur ?? input.amountEur),
      custodian: input.custodian,
      effectiveDate: String(raw.effective_date ?? input.effectiveDate),
    }

    return { ok: true, result }
  } catch (err) {
    console.error('[depositActions] recordDepositEvent unexpected error:', err)
    return { ok: false, error: 'Unexpected error' }
  }
}
