/**
 * depositAdapter â Read-only data consumer for Deposit Lifecycle events.
 *
 * P3 LTR Operations â Deposit Lifecycle (Event-Sourced)
 *
 * Architecture: ownerWorkspaceService â depositAdapter â lifecycle RPCs
 *
 * Responsibility:
 * - Calls lifecycle RPCs via Supabase (service_role only)
 * - Maps raw DB rows to DepositEventDTO / DepositCurrentStateDTO
 * - Returns null cleanly when no deposit data exists (normal state)
 *
 * Boundary:
 * - Read-only â zero writes
 * - No financial calculations
 * - No settlement logic
 * - Does NOT import: rentPositionAdapter, rentalContractAdapter,
 *   managementFeeAdapter, ownerFinancialAdapter (G3-18)
 *
 * Constitutional:
 *   P-ARCH-1: NULL = Unknown (no placeholders)
 *   P-ARCH-2: Custodian identity preserved (Owner â  JJ â  Yossi â  Jacob)
 *   P-ARCH-4: Append-only â this adapter never triggers UPDATE/DELETE
 *   P-ARCH-5: lifecycle schema isolation
 *   Deposit is NEVER income â custodial/settlement lifecycle only
 *
 * server-only: must never be imported into Client Components.
 */

import 'server-only'

import { createServiceClient } from '@/lib/supabase'
import type {
  DepositEventDTO,
  DepositEventType,
  DepositCustodian,
  DepositCurrentStateDTO,
  DepositHistoryDTO,
  DepositLifecycleStatus,
} from './ownerWorkspaceTypes'

// âââ Validated type guards ââââââââââââââââââââââââââââââââââââââââââââââââââ

const VALID_EVENT_TYPES = new Set<DepositEventType>([
  'received', 'refunded', 'partially_withheld',
  'forfeited_to_owner', 'transferred_custody', 'adjustment',
])

const VALID_CUSTODIANS = new Set<DepositCustodian>([
  'Owner', 'JJ', 'Yossi', 'Jacob', 'Anastasia', 'Tenant',
])

const VALID_LIFECYCLE_STATUSES = new Set<DepositLifecycleStatus>([
  'no_deposit', 'held', 'partially_settled', 'fully_closed',
])

// âââ Row â DTO mappers (pure) âââââââââââââââââââââââââââââââââââââââââââââââ

function mapEventRow(row: Record<string, unknown>): DepositEventDTO | null {
  const eventType = String(row.event_type ?? '')
  const custodian = String(row.custodian ?? '')

  if (!VALID_EVENT_TYPES.has(eventType as DepositEventType)) {
    console.error(`[depositAdapter] Invalid event_type "${eventType}" for event ${row.id}`)
    return null
  }
  if (!VALID_CUSTODIANS.has(custodian as DepositCustodian)) {
    console.error(`[depositAdapter] Invalid custodian "${custodian}" for event ${row.id}`)
    return null
  }

  return {
    id: String(row.id),
    rentalContractId: String(row.rental_contract_id),
    propertyId: String(row.property_id),
    eventType: eventType as DepositEventType,
    amountEur: Number(row.amount_eur ?? 0),
    withheldAmountEur: row.withheld_amount_eur != null ? Number(row.withheld_amount_eur) : null,
    withheldReason: row.withheld_reason != null ? String(row.withheld_reason) : null,
    custodian: custodian as DepositCustodian,
    previousCustodian: row.previous_custodian != null ? String(row.previous_custodian) : null,
    tenantName: String(row.tenant_name),
    effectiveDate: String(row.effective_date),
    governingEvidence: row.governing_evidence != null ? String(row.governing_evidence) : null,
    notes: row.notes != null ? String(row.notes) : null,
    createdAt: String(row.created_at),
  }
}

function mapCurrentStateRow(row: Record<string, unknown>): DepositCurrentStateDTO | null {
  const custodian = String(row.current_custodian ?? '')
  const lifecycleStatus = String(row.lifecycle_status ?? '')
  const latestEventType = String(row.latest_event_type ?? '')

  if (!VALID_CUSTODIANS.has(custodian as DepositCustodian)) {
    console.error(`[depositAdapter] Invalid custodian "${custodian}" in current state`)
    return null
  }
  if (!VALID_LIFECYCLE_STATUSES.has(lifecycleStatus as DepositLifecycleStatus)) {
    console.error(`[depositAdapter] Invalid lifecycle_status "${lifecycleStatus}" in current state`)
    return null
  }
  if (!VALID_EVENT_TYPES.has(latestEventType as DepositEventType)) {
    console.error(`[depositAdapter] Invalid latest_event_type "${latestEventType}" in current state`)
    return null
  }

  return {
    rentalContractId: String(row.rental_contract_id),
    propertyId: String(row.property_id),
    tenantName: String(row.tenant_name),
    originalAmountEur: Number(row.original_amount_eur ?? 0),
    currentHeldEur: Number(row.current_held_eur ?? 0),
    totalRefundedEur: Number(row.total_refunded_eur ?? 0),
    totalWithheldEur: Number(row.total_withheld_eur ?? 0),
    currentCustodian: custodian as DepositCustodian,
    latestEventType: latestEventType as DepositEventType,
    latestEventDate: String(row.latest_event_date),
    latestWithheldReason: row.latest_withheld_reason != null ? String(row.latest_withheld_reason) : null,
    eventCount: Number(row.event_count ?? 0),
    lifecycleStatus: lifecycleStatus as DepositLifecycleStatus,
    isFullyClosed: Boolean(row.is_fully_closed),
  }
}

// âââ Public API âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

/**
 * Fetch deposit history for a rental contract: events + current state.
 * Returns null current_state when no deposit events exist (normal state).
 */
export async function fetchDepositHistory(
  rentalContractId: string,
): Promise<DepositHistoryDTO> {
  try {
    const sb = createServiceClient()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb as any)
      .schema('lifecycle')
      .rpc('get_deposit_history', {
        p_rental_contract_id: rentalContractId,
      })

    if (error) throw error
    if (!data) return { events: [], currentState: null }

    const raw = data as Record<string, unknown>
    const rawEvents = Array.isArray(raw.events) ? raw.events : []

    const events = (rawEvents as Record<string, unknown>[])
      .map(mapEventRow)
      .filter((dto): dto is DepositEventDTO => dto !== null)

    let currentState: DepositCurrentStateDTO | null = null
    if (raw.current_state != null && raw.current_state !== 'null') {
      const csRaw = raw.current_state as Record<string, unknown>
      currentState = mapCurrentStateRow(csRaw)
    }

    return { events, currentState }
  } catch (err) {
    console.error('[depositAdapter] fetchDepositHistory failed:', err)
    return { events: [], currentState: null }
  }
}
