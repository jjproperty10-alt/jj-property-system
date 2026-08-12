/**
 * utilityAdapter — Read-only data consumer for Utility Meters & Obligations.
 *
 * P4 LTR Operations — Utilities / Sub-Meters
 *
 * Architecture: ownerWorkspaceService → utilityAdapter → lifecycle RPCs
 *
 * Responsibility:
 * - Calls lifecycle RPCs via Supabase (service_role only)
 * - Maps raw DB rows to UtilityMeterDTO / TenantUtilityObligationDTO / etc.
 * - Returns empty arrays cleanly when no data exists (normal state)
 *
 * Boundary:
 * - Read-only — zero writes
 * - No financial calculations
 * - No settlement logic
 * - Does NOT import: rentPositionAdapter, rentalContractAdapter,
 *   managementFeeAdapter, depositAdapter, ownerFinancialAdapter (G3-18)
 *
 * Constitutional:
 *   P-ARCH-1: NULL = Unknown (no placeholders)
 *   P-ARCH-5: lifecycle schema isolation
 *   P-LEDGER-5: Transfer ≠ economic event — utility obligations are real expenses
 *   Three-event separation: Provider Expense / Tenant Charge / Tenant Payment
 *
 * server-only: must never be imported into Client Components.
 */

import 'server-only'

import { createServiceClient } from '@/lib/supabase'
import type {
  UtilityMeterDTO,
  UtilityType,
  MeterStatus,
  MeterReadingDTO,
  TenantUtilityObligationDTO,
  ObligationStatus,
  UtilityRateDTO,
  RateScope,
  UtilityPositionDTO,
} from './ownerWorkspaceTypes'

// ─── Validated type guards ──────────────────────────────────────────────────

const VALID_UTILITY_TYPES = new Set<UtilityType>([
  'electricity', 'water', 'gas', 'internet', 'other',
])

const VALID_METER_STATUSES = new Set<MeterStatus>([
  'active', 'inactive',
])

const VALID_OBLIGATION_STATUSES = new Set<ObligationStatus>([
  'pending', 'billed', 'partial', 'settled', 'disputed', 'reversed',
])

const VALID_RATE_SCOPES = new Set<RateScope>([
  'central', 'property_specific',
])

// ─── Row → DTO mappers (pure) ───────────────────────────────────────────────

function mapMeterRow(row: Record<string, unknown>): UtilityMeterDTO | null {
  const utilityType = String(row.utility_type ?? '')
  const status = String(row.status ?? '')

  if (!VALID_UTILITY_TYPES.has(utilityType as UtilityType)) {
    console.error(`[utilityAdapter] Invalid utility_type "${utilityType}" for meter ${row.id}`)
    return null
  }
  if (!VALID_METER_STATUSES.has(status as MeterStatus)) {
    console.error(`[utilityAdapter] Invalid status "${status}" for meter ${row.id}`)
    return null
  }

  return {
    id: String(row.id),
    propertyId: String(row.property_id),
    utilityType: utilityType as UtilityType,
    meterIdentifier: row.meter_identifier != null ? String(row.meter_identifier) : null,
    unitOfMeasure: String(row.unit_of_measure ?? 'kWh'),
    status: status as MeterStatus,
    readingIntervalMonths: Number(row.reading_interval_months ?? 1),
    lastReadingDate: row.last_reading_date != null ? String(row.last_reading_date) : null,
    nextReadingDue: row.next_reading_due != null ? String(row.next_reading_due) : null,
    notes: row.notes != null ? String(row.notes) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

function mapReadingRow(row: Record<string, unknown>): MeterReadingDTO | null {
  if (!row.id) return null

  return {
    id: String(row.id),
    meterId: String(row.meter_id),
    readingDate: String(row.reading_date),
    readingValue: Number(row.reading_value),
    previousValue: row.previous_value != null ? Number(row.previous_value) : null,
    consumption: row.consumption != null ? Number(row.consumption) : null,
    photoEvidence: row.photo_evidence != null ? String(row.photo_evidence) : null,
    recordedBy: row.recorded_by != null ? String(row.recorded_by) : null,
    createdAt: String(row.created_at),
  }
}

function mapObligationRow(row: Record<string, unknown>): TenantUtilityObligationDTO | null {
  const utilityType = String(row.utility_type ?? '')
  const status = String(row.status ?? '')

  if (!VALID_UTILITY_TYPES.has(utilityType as UtilityType)) {
    console.error(`[utilityAdapter] Invalid utility_type "${utilityType}" for obligation ${row.id}`)
    return null
  }
  if (!VALID_OBLIGATION_STATUSES.has(status as ObligationStatus)) {
    console.error(`[utilityAdapter] Invalid status "${status}" for obligation ${row.id}`)
    return null
  }

  return {
    id: String(row.id),
    rentalContractId: String(row.rental_contract_id),
    propertyId: String(row.property_id),
    meterId: String(row.meter_id),
    readingId: String(row.reading_id),
    rateId: String(row.rate_id),
    utilityType: utilityType as UtilityType,
    periodStart: String(row.period_start),
    periodEnd: String(row.period_end),
    consumption: Number(row.consumption),
    ratePerUnitEur: Number(row.rate_per_unit_eur),
    obligationAmountEur: Number(row.obligation_amount_eur),
    tenantName: String(row.tenant_name),
    settledAmountEur: Number(row.settled_amount_eur ?? 0),
    status: status as ObligationStatus,
    settlementEvidence: row.settlement_evidence != null
      ? (row.settlement_evidence as Record<string, unknown>)
      : null,
    idempotencyKey: String(row.idempotency_key),
    notes: row.notes != null ? String(row.notes) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

function mapRateRow(row: Record<string, unknown>): UtilityRateDTO | null {
  const utilityType = String(row.utility_type ?? '')
  const scope = String(row.scope ?? '')

  if (!VALID_UTILITY_TYPES.has(utilityType as UtilityType)) {
    console.error(`[utilityAdapter] Invalid utility_type "${utilityType}" for rate ${row.id}`)
    return null
  }
  if (!VALID_RATE_SCOPES.has(scope as RateScope)) {
    console.error(`[utilityAdapter] Invalid scope "${scope}" for rate ${row.id}`)
    return null
  }

  return {
    id: String(row.id),
    utilityType: utilityType as UtilityType,
    ratePerUnitEur: Number(row.rate_per_unit_eur),
    effectiveFrom: String(row.effective_from),
    effectiveTo: row.effective_to != null ? String(row.effective_to) : null,
    source: row.source != null ? String(row.source) : null,
    scope: scope as RateScope,
    propertyId: row.property_id != null ? String(row.property_id) : null,
    notes: row.notes != null ? String(row.notes) : null,
    createdAt: String(row.created_at),
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Fetch all utility meters for a property.
 */
export async function fetchPropertyUtilityMeters(
  propertyId: string,
): Promise<readonly UtilityMeterDTO[]> {
  try {
    const sb = createServiceClient()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb as any)
      .schema('lifecycle')
      .rpc('get_property_utility_meters', {
        p_property_id: propertyId,
      })

    if (error) throw error
    if (!data || !Array.isArray(data)) return []

    return (data as Record<string, unknown>[])
      .map(mapMeterRow)
      .filter((dto): dto is UtilityMeterDTO => dto !== null)
  } catch (err) {
    console.error('[utilityAdapter] fetchPropertyUtilityMeters failed:', err)
    return []
  }
}

/**
 * Fetch readings for a specific meter.
 */
export async function fetchMeterReadings(
  meterId: string,
  limit = 50,
): Promise<readonly MeterReadingDTO[]> {
  try {
    const sb = createServiceClient()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb as any)
      .schema('lifecycle')
      .rpc('get_meter_readings', {
        p_meter_id: meterId,
        p_limit: limit,
      })

    if (error) throw error
    if (!data || !Array.isArray(data)) return []

    return (data as Record<string, unknown>[])
      .map(mapReadingRow)
      .filter((dto): dto is MeterReadingDTO => dto !== null)
  } catch (err) {
    console.error('[utilityAdapter] fetchMeterReadings failed:', err)
    return []
  }
}

/**
 * Fetch all tenant utility obligations for a property.
 */
export async function fetchTenantUtilityObligations(
  propertyId: string,
): Promise<readonly TenantUtilityObligationDTO[]> {
  try {
    const sb = createServiceClient()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb as any)
      .schema('lifecycle')
      .rpc('get_tenant_utility_obligations', {
        p_property_id: propertyId,
      })

    if (error) throw error
    if (!data || !Array.isArray(data)) return []

    return (data as Record<string, unknown>[])
      .map(mapObligationRow)
      .filter((dto): dto is TenantUtilityObligationDTO => dto !== null)
  } catch (err) {
    console.error('[utilityAdapter] fetchTenantUtilityObligations failed:', err)
    return []
  }
}

/**
 * Fetch applicable utility rates for a given utility type.
 */
export async function fetchApplicableUtilityRates(
  utilityType: string,
  propertyId?: string,
  asOfDate?: string,
): Promise<readonly UtilityRateDTO[]> {
  try {
    const sb = createServiceClient()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb as any)
      .schema('lifecycle')
      .rpc('get_applicable_utility_rates', {
        p_utility_type: utilityType,
        p_property_id: propertyId ?? null,
        p_as_of_date: asOfDate ?? null,
      })

    if (error) throw error
    if (!data || !Array.isArray(data)) return []

    return (data as Record<string, unknown>[])
      .map(mapRateRow)
      .filter((dto): dto is UtilityRateDTO => dto !== null)
  } catch (err) {
    console.error('[utilityAdapter] fetchApplicableUtilityRates failed:', err)
    return []
  }
}

/**
 * Fetch full utility position for a property — meters + obligations.
 */
export async function fetchUtilityPosition(
  propertyId: string,
): Promise<UtilityPositionDTO> {
  const [meters, obligations] = await Promise.all([
    fetchPropertyUtilityMeters(propertyId),
    fetchTenantUtilityObligations(propertyId),
  ])

  return { meters, obligations }
}
