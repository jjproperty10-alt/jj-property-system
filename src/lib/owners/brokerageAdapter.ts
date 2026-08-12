/**
 * brokerageAdapter — Read-only data consumer for Brokerage Obligations.
 *
 * P6 LTR Operations — Brokerage Obligations
 *
 * Architecture: ownerWorkspaceService → brokerageAdapter → lifecycle RPCs
 *
 * Responsibility:
 * - Calls lifecycle RPCs via Supabase (service_role only)
 * - Maps raw DB rows to BrokerageObligationDTO
 * - Returns empty arrays cleanly when no data exists (normal state)
 *
 * Boundary:
 * - Read-only — zero writes (writes go through server actions)
 * - No financial calculations
 * - No settlement logic
 * - Does NOT import any other adapter (G3-18)
 *
 * Business rule:
 *   One brokerage per lease (idempotency_key = '{contract_id}:brokerage').
 *   No recurrence on renewal. No brokerage on rent change.
 *
 * Constitutional:
 *   P-ARCH-1: NULL = Unknown (no placeholders)
 *   P-ARCH-5: lifecycle schema isolation
 *
 * server-only: must never be imported into Client Components.
 */

import 'server-only'

import { createServiceClient } from '@/lib/supabase'
import type {
  BrokerageObligationDTO,
  BrokerageCalculationType,
  BrokerageStatus,
} from './ownerWorkspaceTypes'

// ─── Validated type guards ──────────────────────────────────────────────────

const VALID_CALCULATION_TYPES = new Set<BrokerageCalculationType>([
  'one_month_rent', 'fixed_amount', 'percentage',
])

const VALID_BROKERAGE_STATUSES = new Set<BrokerageStatus>([
  'pending', 'billed', 'settled', 'waived', 'reversed',
])

// ─── Row → DTO mapper (pure) ───────────────────────────────────────────────

function mapBrokerageRow(row: Record<string, unknown>): BrokerageObligationDTO | null {
  const calcType = String(row.calculation_type ?? '')
  const status = String(row.status ?? '')

  if (!VALID_CALCULATION_TYPES.has(calcType as BrokerageCalculationType)) {
    console.error(`[brokerageAdapter] Invalid calculation_type "${calcType}" for brokerage ${row.id}`)
    return null
  }
  if (!VALID_BROKERAGE_STATUSES.has(status as BrokerageStatus)) {
    console.error(`[brokerageAdapter] Invalid status "${status}" for brokerage ${row.id}`)
    return null
  }

  return {
    id: String(row.id),
    rentalContractId: String(row.rental_contract_id),
    propertyId: String(row.property_id),
    tenantName: String(row.tenant_name),
    brokerageApplicable: Boolean(row.brokerage_applicable),
    brokerName: row.broker_name != null ? String(row.broker_name) : null,
    calculationType: calcType as BrokerageCalculationType,
    percentageRate: row.percentage_rate != null ? Number(row.percentage_rate) : null,
    chargeAmountEur: Number(row.charge_amount_eur),
    chargeDate: String(row.charge_date),
    isNewTenant: Boolean(row.is_new_tenant),
    payer: String(row.payer),
    payee: String(row.payee),
    governingEvidence: row.governing_evidence != null ? String(row.governing_evidence) : null,
    settledAmountEur: Number(row.settled_amount_eur ?? 0),
    status: status as BrokerageStatus,
    settlementEvidence: row.settlement_evidence != null
      ? (row.settlement_evidence as Record<string, unknown>)
      : null,
    idempotencyKey: String(row.idempotency_key),
    notes: row.notes != null ? String(row.notes) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Fetch all brokerage obligations for a property.
 */
export async function fetchPropertyBrokerages(
  propertyId: string,
): Promise<readonly BrokerageObligationDTO[]> {
  try {
    const sb = createServiceClient()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb as any)
      .schema('lifecycle')
      .rpc('get_property_brokerages', {
        p_property_id: propertyId,
      })

    if (error) throw error
    if (!data || !Array.isArray(data)) return []

    return (data as Record<string, unknown>[])
      .map(mapBrokerageRow)
      .filter((dto): dto is BrokerageObligationDTO => dto !== null)
  } catch (err) {
    console.error('[brokerageAdapter] fetchPropertyBrokerages failed:', err)
    return []
  }
}

/**
 * Fetch brokerage for a specific rental contract (0 or 1 result).
 */
export async function fetchContractBrokerage(
  rentalContractId: string,
): Promise<BrokerageObligationDTO | null> {
  try {
    const sb = createServiceClient()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb as any)
      .schema('lifecycle')
      .rpc('get_contract_brokerage', {
        p_rental_contract_id: rentalContractId,
      })

    if (error) throw error
    if (!data || !Array.isArray(data) || data.length === 0) return null

    return mapBrokerageRow(data[0] as Record<string, unknown>)
  } catch (err) {
    console.error('[brokerageAdapter] fetchContractBrokerage failed:', err)
    return null
  }
}
