/**
 * rentalContractAdapter — Read-only data consumer for Rental Contracts.
 *
 * P2 LTR Operations — Rental Contract Foundation
 *
 * Architecture: ownerWorkspaceService → rentalContractAdapter → lifecycle RPC
 *
 * Responsibility:
 * - Calls lifecycle RPCs via Supabase (service_role only)
 * - Maps raw DB rows to RentalContractDTO
 * - Returns empty arrays cleanly when no contracts exist (normal state)
 *
 * Boundary:
 * - Read-only — zero writes
 * - No financial calculations
 * - No tenant payment matching
 * - No settlement, ownership, or P&L logic
 *
 * Three-authority separation:
 *   Service Engagement = what service JJ provides
 *   Rental Contract = who is renting, terms, period (THIS ADAPTER)
 *   Tenant Payment = actual rent money (public.transactions — NOT touched)
 *
 * server-only: must never be imported into Client Components.
 */

import 'server-only'

import { createServiceClient } from '@/lib/supabase'
import type {
  RentalContractDTO,
  RentalContractStatus,
} from './ownerWorkspaceTypes'

// ─── DB Row Type (internal — not exported) ───────────────────────────────────

interface RentalContractRow {
  id: string
  property_id: string
  service_engagement_id: string | null
  tenant_name: string
  tenant_entity_id: string | null
  start_date: string
  end_date: string | null
  monthly_rent_eur: number
  deposit_eur: number | null
  payment_day: number
  currency: string
  status: string
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

// ─── Validated type guards ───────────────────────────────────────────────────

const VALID_STATUSES = new Set<RentalContractStatus>([
  'draft', 'active', 'expired', 'terminated',
])

function isValidStatus(value: string): value is RentalContractStatus {
  return VALID_STATUSES.has(value as RentalContractStatus)
}

// ─── Row → DTO mapper (pure) ────────────────────────────────────────────────

function mapRow(row: RentalContractRow): RentalContractDTO | null {
  if (!isValidStatus(row.status)) {
    console.error(
      `[rentalContractAdapter] Invalid status "${row.status}" for contract ${row.id}`,
    )
    return null
  }

  return {
    id: row.id,
    propertyId: row.property_id,
    serviceEngagementId: row.service_engagement_id ?? null,
    tenantName: row.tenant_name,
    tenantEntityId: row.tenant_entity_id ?? null,
    startDate: row.start_date,
    endDate: row.end_date ?? null,
    monthlyRentEur: Number(row.monthly_rent_eur),
    depositEur: row.deposit_eur != null ? Number(row.deposit_eur) : null,
    paymentDay: row.payment_day,
    currency: row.currency,
    status: row.status,
    notes: row.notes ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Fetch all rental contracts for a service engagement.
 * Returns empty array when no contracts exist (normal state).
 */
export async function fetchEngagementRentalContracts(
  serviceEngagementId: string,
): Promise<readonly RentalContractDTO[]> {
  try {
    const sb = createServiceClient()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb as any)
      .schema('lifecycle')
      .rpc('get_engagement_rental_contracts', {
        p_service_engagement_id: serviceEngagementId,
      })

    if (error) throw error
    if (!data) return []

    return (data as RentalContractRow[])
      .map(mapRow)
      .filter((dto): dto is RentalContractDTO => dto !== null)
  } catch (err) {
    console.error('[rentalContractAdapter] fetchEngagementRentalContracts failed:', err)
    return []
  }
}

/**
 * Fetch all rental contracts for a property.
 * Returns empty array when no contracts exist (normal state).
 */
export async function fetchPropertyRentalContracts(
  propertyId: string,
): Promise<readonly RentalContractDTO[]> {
  try {
    const sb = createServiceClient()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb as any)
      .schema('lifecycle')
      .rpc('get_property_rental_contracts', {
        p_property_id: propertyId,
      })

    if (error) throw error
    if (!data) return []

    return (data as RentalContractRow[])
      .map(mapRow)
      .filter((dto): dto is RentalContractDTO => dto !== null)
  } catch (err) {
    console.error('[rentalContractAdapter] fetchPropertyRentalContracts failed:', err)
    return []
  }
}
