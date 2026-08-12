/**
 * ownerReservationService — permanent public boundary for Owner Reservations data.
 *
 * G3-B: Owner Workspace Reservations Hostaway Alignment (2026-07-25).
 * Architecture: Owner Workspace → OwnerReservationService → OwnerReservationAdapter → Hostaway Audit
 *
 * This service is the permanent public boundary between Owner Workspace
 * and the Hostaway Audit engine. The adapter (ownerReservationAdapter.ts) is
 * an internal implementation detail and may be replaced without touching
 * Owner Workspace or any consumer of this service.
 *
 * G3-17: Owner Workspace imports only from this service — never from the adapter
 *        or from PropertyAuditService / IPropertyAuditService directly.
 * G3-18: This service does NOT import from ownerFinancialService or ownerMaintenanceService.
 */

import 'server-only'

import { fetchOwnerReservations, fetchReservationActivity } from './ownerReservationAdapter'
import type { OwnerReservationAdapterInput, ReservationActivityDTO } from './ownerReservationAdapter'
import type { OwnerReservationSummaryDTO } from './ownerWorkspaceTypes'

export type { OwnerReservationAdapterInput, ReservationActivityDTO }

function emptyReservationSummary(
  startDate: string,
  endDate: string,
): OwnerReservationSummaryDTO {
  return {
    period: { startDate, endDate },
    portfolio: {
      totalReservations: 0,
      occupancyPct:      null,
      revenueEur:        null,
      adr:               null,
      revPar:            null,
      cancellations:     0,
    },
    channelMix:   [],
    reservations: [],
  }
}

/**
 * Get reservation summary for an owner's properties.
 *
 * Returns OwnerReservationSummaryDTO with portfolio summary and per-reservation rows.
 * Returns empty DTO (null financials, empty lists) on any adapter failure.
 * Never throws — all errors are absorbed and logged.
 */
export async function getReservations(
  input: OwnerReservationAdapterInput,
): Promise<OwnerReservationSummaryDTO> {
  try {
    return await fetchOwnerReservations(input)
  } catch (err) {
    console.error(
      '[ownerReservationService] getReservations: adapter failed',
      err instanceof Error ? err.message : String(err),
    )
    return emptyReservationSummary(input.startDate, input.endDate)
  }
}

/**
 * Get reservation activity (active months + latest active month) for an owner.
 * Never throws — returns empty activity on any adapter failure.
 */
export async function getReservationActivity(
  input: OwnerReservationAdapterInput,
): Promise<ReservationActivityDTO> {
  try {
    return await fetchReservationActivity(input)
  } catch (err) {
    console.error(
      '[ownerReservationService] getReservationActivity: adapter failed',
      err instanceof Error ? err.message : String(err),
    )
    return { activeMonths: [], latestActiveMonth: null }
  }
}
