/**
 * tenantChargeAdapter — Read-only data consumer for Tenant Charges
 * & Statement Presentation Overrides.
 *
 * P5 LTR Operations — Tenant Charges + Billing Presentation Metadata
 *
 * Architecture: ownerWorkspaceService → tenantChargeAdapter → lifecycle RPCs
 *
 * Responsibility:
 * - Calls lifecycle RPCs via Supabase (service_role only)
 * - Maps raw DB rows to TenantChargeObligationDTO / StatementPresentationOverrideDTO
 * - Returns empty arrays cleanly when no data exists (normal state)
 *
 * Boundary:
 * - Read-only — zero writes (writes go through server actions)
 * - No financial calculations
 * - No settlement logic
 * - No deposit lifecycle logic (P3 authoritative)
 * - Does NOT import any other adapter (G3-18)
 *
 * Three-event separation:
 *   Owner Expense   = public.transactions (existing authority)
 *   Tenant Charge   = lifecycle.tenant_charge_obligations (THIS adapter reads)
 *   Tenant Payment  = public.transactions (existing authority)
 *   A tenant charge is NOT an owner expense.
 *
 * Presentation invariant:
 *   statement_presentation_overrides NEVER change financial balances,
 *   original economic dates, or transaction amounts.
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
  TenantChargeObligationDTO,
  TenantChargeType,
  TenantChargeStatus,
  StatementPresentationOverrideDTO,
  PresentationStatus,
  PresentationResolutionDTO,
} from './ownerWorkspaceTypes'

// ─── Validated type guards ──────────────────────────────────────────────────

const VALID_CHARGE_TYPES = new Set<TenantChargeType>([
  'damage', 'penalty', 'cleaning', 'key_replacement', 'utility_arrears', 'other',
])

const VALID_CHARGE_STATUSES = new Set<TenantChargeStatus>([
  'pending', 'billed', 'partial', 'settled', 'disputed', 'waived', 'reversed',
])

const VALID_PRESENTATION_STATUSES = new Set<PresentationStatus>([
  'include_now', 'next_statement', 'defer_until_date', 'internal_only',
])

// ─── Row → DTO mappers (pure) ───────────────────────────────────────────────

function mapChargeRow(row: Record<string, unknown>): TenantChargeObligationDTO | null {
  const chargeType = String(row.charge_type ?? '')
  const status = String(row.status ?? '')

  if (!VALID_CHARGE_TYPES.has(chargeType as TenantChargeType)) {
    console.error(`[tenantChargeAdapter] Invalid charge_type "${chargeType}" for charge ${row.id}`)
    return null
  }
  if (!VALID_CHARGE_STATUSES.has(status as TenantChargeStatus)) {
    console.error(`[tenantChargeAdapter] Invalid status "${status}" for charge ${row.id}`)
    return null
  }

  const actualCost = row.actual_cost_eur != null ? Number(row.actual_cost_eur) : null
  const chargeAmount = Number(row.charge_amount_eur)

  return {
    id: String(row.id),
    rentalContractId: String(row.rental_contract_id),
    propertyId: String(row.property_id),
    tenantName: String(row.tenant_name),
    chargeType: chargeType as TenantChargeType,
    description: String(row.description),
    actualCostEur: actualCost,
    chargeAmountEur: chargeAmount,
    marginEur: actualCost != null ? chargeAmount - actualCost : null,
    sourceEvidence: row.source_evidence != null ? String(row.source_evidence) : null,
    economicDate: String(row.economic_date),
    deductibleFromDeposit: Boolean(row.deductible_from_deposit),
    settledAmountEur: Number(row.settled_amount_eur ?? 0),
    status: status as TenantChargeStatus,
    settlementEvidence: row.settlement_evidence != null
      ? (row.settlement_evidence as Record<string, unknown>)
      : null,
    idempotencyKey: String(row.idempotency_key),
    notes: row.notes != null ? String(row.notes) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

function mapOverrideRow(row: Record<string, unknown>): StatementPresentationOverrideDTO | null {
  const presStatus = String(row.presentation_status ?? '')

  if (!VALID_PRESENTATION_STATUSES.has(presStatus as PresentationStatus)) {
    console.error(`[tenantChargeAdapter] Invalid presentation_status "${presStatus}" for override ${row.id}`)
    return null
  }

  return {
    id: String(row.id),
    sourceTransactionId: String(row.source_transaction_id),
    propertyId: String(row.property_id),
    presentationStatus: presStatus as PresentationStatus,
    deferUntilDate: row.defer_until_date != null ? String(row.defer_until_date) : null,
    economicDate: String(row.economic_date),
    overrideReason: row.override_reason != null ? String(row.override_reason) : null,
    createdBy: row.created_by != null ? String(row.created_by) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

// ─── Public API — Tenant Charges ──────────────────────────────────────────

/**
 * Fetch all tenant charges for a rental contract.
 */
export async function fetchContractTenantCharges(
  rentalContractId: string,
): Promise<readonly TenantChargeObligationDTO[]> {
  try {
    const sb = createServiceClient()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb as any)
      .schema('lifecycle')
      .rpc('get_contract_tenant_charges', {
        p_rental_contract_id: rentalContractId,
      })

    if (error) throw error
    if (!data || !Array.isArray(data)) return []

    return (data as Record<string, unknown>[])
      .map(mapChargeRow)
      .filter((dto): dto is TenantChargeObligationDTO => dto !== null)
  } catch (err) {
    console.error('[tenantChargeAdapter] fetchContractTenantCharges failed:', err)
    return []
  }
}

/**
 * Fetch all tenant charges for a property.
 */
export async function fetchPropertyTenantCharges(
  propertyId: string,
): Promise<readonly TenantChargeObligationDTO[]> {
  try {
    const sb = createServiceClient()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb as any)
      .schema('lifecycle')
      .rpc('get_property_tenant_charges', {
        p_property_id: propertyId,
      })

    if (error) throw error
    if (!data || !Array.isArray(data)) return []

    return (data as Record<string, unknown>[])
      .map(mapChargeRow)
      .filter((dto): dto is TenantChargeObligationDTO => dto !== null)
  } catch (err) {
    console.error('[tenantChargeAdapter] fetchPropertyTenantCharges failed:', err)
    return []
  }
}

/**
 * Fetch outstanding (open) tenant charges for a property.
 * Excludes: settled, waived, reversed.
 */
export async function fetchOutstandingTenantCharges(
  propertyId: string,
): Promise<readonly TenantChargeObligationDTO[]> {
  try {
    const sb = createServiceClient()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb as any)
      .schema('lifecycle')
      .rpc('get_outstanding_tenant_charges', {
        p_property_id: propertyId,
      })

    if (error) throw error
    if (!data || !Array.isArray(data)) return []

    return (data as Record<string, unknown>[])
      .map(mapChargeRow)
      .filter((dto): dto is TenantChargeObligationDTO => dto !== null)
  } catch (err) {
    console.error('[tenantChargeAdapter] fetchOutstandingTenantCharges failed:', err)
    return []
  }
}

// ─── Public API — Presentation Overrides ──────────────────────────────────

/**
 * Resolve presentation status for a given source transaction + property + date.
 * Returns visibility decision without changing any financial data.
 */
export async function resolvePresentation(
  sourceTransactionId: string,
  propertyId: string,
  statementDate: string,
): Promise<PresentationResolutionDTO> {
  const fallback: PresentationResolutionDTO = {
    hasOverride: false,
    presentationStatus: 'include_now',
    visible: true,
    deferUntilDate: null,
    economicDate: null,
    overrideReason: null,
  }

  try {
    const sb = createServiceClient()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb as any)
      .schema('lifecycle')
      .rpc('resolve_statement_presentation', {
        p_source_transaction_id: sourceTransactionId,
        p_property_id: propertyId,
        p_statement_date: statementDate,
      })

    if (error) throw error
    if (!data) return fallback

    const result = data as Record<string, unknown>
    const presStatus = String(result.presentation_status ?? 'include_now')

    return {
      hasOverride: Boolean(result.has_override),
      presentationStatus: VALID_PRESENTATION_STATUSES.has(presStatus as PresentationStatus)
        ? (presStatus as PresentationStatus)
        : 'include_now',
      visible: Boolean(result.visible),
      deferUntilDate: result.defer_until_date != null ? String(result.defer_until_date) : null,
      economicDate: result.economic_date != null ? String(result.economic_date) : null,
      overrideReason: result.override_reason != null ? String(result.override_reason) : null,
    }
  } catch (err) {
    console.error('[tenantChargeAdapter] resolvePresentation failed:', err)
    return fallback
  }
}
