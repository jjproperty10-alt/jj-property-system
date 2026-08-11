/**
 * managementFeeAdapter — Read-only data consumer for Management Fee Configs + Obligations.
 *
 * P2 LTR Operations — Management Fee Engine
 *
 * Architecture: ownerWorkspaceService → managementFeeAdapter → lifecycle RPCs
 *
 * Responsibility:
 * - Calls lifecycle RPCs via Supabase (service_role only)
 * - Maps raw DB rows to ManagementFeeConfigDTO / ManagementFeeObligationDTO
 * - Returns empty arrays cleanly when no data exists (normal state)
 *
 * Boundary:
 * - Read-only — zero writes
 * - No financial calculations
 * - No settlement logic
 * - Does NOT import: rentPositionAdapter, rentalContractAdapter, ownerFinancialAdapter (G3-18)
 *
 * Three-authority separation:
 *   Service Engagement = what service JJ provides
 *   Management Fee Config = how the fee is structured (THIS ADAPTER reads)
 *   Management Fee Obligation = periodic fee amounts + settlement status (THIS ADAPTER reads)
 *   Owner Fund Allocation = cross-obligation offset records (NOT read here — write-side only)
 *
 * server-only: must never be imported into Client Components.
 */

import 'server-only'

import { createServiceClient } from '@/lib/supabase'
import type {
  ManagementFeeConfigDTO,
  ManagementFeeConfigStatus,
  ManagementFeeObligationDTO,
  ManagementFeeObligationStatus,
  ManagementFeePositionDTO,
  ManagementFeeType,
  ObligationFrequency,
  FeeProrationSegment,
} from './ownerWorkspaceTypes'

// ─── Validated type guards ──────────────────────────────────────────────────

const VALID_FEE_TYPES = new Set<ManagementFeeType>([
  'one_month_rent', 'percentage', 'fixed_amount', 'no_fee',
])

const VALID_CONFIG_STATUSES = new Set<ManagementFeeConfigStatus>([
  'active', 'suspended', 'closed',
])

const VALID_OBL_STATUSES = new Set<ManagementFeeObligationStatus>([
  'pending', 'billed', 'partial', 'settled', 'waived', 'reversed',
])

const VALID_FREQUENCIES = new Set<ObligationFrequency>([
  'annual', 'semi_annual', 'quarterly',
])

// ─── Row → DTO mappers (pure) ───────────────────────────────────────────────

function mapConfigRow(row: Record<string, unknown>): ManagementFeeConfigDTO | null {
  const feeType = String(row.fee_type ?? '')
  const status = String(row.status ?? '')
  const frequency = String(row.obligation_frequency ?? '')

  if (!VALID_FEE_TYPES.has(feeType as ManagementFeeType)) {
    console.error(`[managementFeeAdapter] Invalid fee_type "${feeType}" for config ${row.id}`)
    return null
  }
  if (!VALID_CONFIG_STATUSES.has(status as ManagementFeeConfigStatus)) {
    console.error(`[managementFeeAdapter] Invalid status "${status}" for config ${row.id}`)
    return null
  }
  if (!VALID_FREQUENCIES.has(frequency as ObligationFrequency)) {
    console.error(`[managementFeeAdapter] Invalid frequency "${frequency}" for config ${row.id}`)
    return null
  }

  return {
    id: String(row.id),
    serviceEngagementId: String(row.service_engagement_id),
    propertyId: String(row.property_id),
    feeType: feeType as ManagementFeeType,
    feeValue: row.fee_value != null ? Number(row.fee_value) : null,
    cycleAnchorDate: String(row.cycle_anchor_date),
    obligationFrequency: frequency as ObligationFrequency,
    effectiveFrom: String(row.effective_from),
    effectiveTo: row.effective_to != null ? String(row.effective_to) : null,
    status: status as ManagementFeeConfigStatus,
    governingEvidence: row.governing_evidence != null ? String(row.governing_evidence) : null,
    notes: row.notes != null ? String(row.notes) : null,
  }
}

function mapObligationRow(row: Record<string, unknown>): ManagementFeeObligationDTO | null {
  const status = String(row.status ?? '')

  if (!VALID_OBL_STATUSES.has(status as ManagementFeeObligationStatus)) {
    console.error(`[managementFeeAdapter] Invalid obligation status "${status}" for obligation ${row.id}`)
    return null
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

  return {
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
    status: status as ManagementFeeObligationStatus,
    settlementEvidence: row.settlement_evidence ?? null,
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Fetch management fee position for a property: configs + obligations.
 * Returns empty arrays when no fee configuration exists (normal state).
 */
export async function fetchPropertyManagementFees(
  propertyId: string,
): Promise<ManagementFeePositionDTO> {
  try {
    const sb = createServiceClient()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb as any)
      .schema('lifecycle')
      .rpc('get_property_management_fees', {
        p_property_id: propertyId,
      })

    if (error) throw error
    if (!data) return { configs: [], obligations: [] }

    const raw = data as Record<string, unknown>
    const rawConfigs = Array.isArray(raw.configs) ? raw.configs : []
    const rawObligs = Array.isArray(raw.obligations) ? raw.obligations : []

    const configs = (rawConfigs as Record<string, unknown>[])
      .map(mapConfigRow)
      .filter((dto): dto is ManagementFeeConfigDTO => dto !== null)

    const obligations = (rawObligs as Record<string, unknown>[])
      .map(mapObligationRow)
      .filter((dto): dto is ManagementFeeObligationDTO => dto !== null)

    return { configs, obligations }
  } catch (err) {
    console.error('[managementFeeAdapter] fetchPropertyManagementFees failed:', err)
    return { configs: [], obligations: [] }
  }
}
