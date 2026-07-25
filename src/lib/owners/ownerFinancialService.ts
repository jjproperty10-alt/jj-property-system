/**
 * ownerFinancialService — permanent public boundary for Owner Financial data.
 *
 * G3-A: Owner Workspace Financial RC3 Alignment (2026-07-25).
 * Architecture: Owner Workspace → OwnerFinancialService → OwnerFinancialAdapter → RC3
 *
 * This service is the permanent public boundary between Owner Workspace
 * and the RC3 financial engine. The adapter (ownerFinancialAdapter.ts) is
 * an internal implementation detail and may be replaced without touching
 * Owner Workspace or any consumer of this service.
 *
 * Amendment #1 (approved): Owner Workspace imports only from this service.
 * G3-17: No component may import fetchRC3Report directly into Owner Workspace.
 * G3-18: This service does NOT import from ownerMaintenanceService.
 */

import 'server-only'

import { fetchOwnerFinancial } from './ownerFinancialAdapter'
import type { OwnerFinancialAdapterInput } from './ownerFinancialAdapter'
import type { OwnerFinancialDTO } from './ownerWorkspaceTypes'

export type { OwnerFinancialAdapterInput }

/**
 * Get financial summary for an owner's properties.
 *
 * Returns an OwnerFinancialDTO with engine-composed position and section breakdown.
 * Returns empty DTO (null position fields, empty sections) on any adapter failure.
 * Never throws — all errors are absorbed and logged.
 */
export async function getFinancial(
  input: OwnerFinancialAdapterInput,
): Promise<OwnerFinancialDTO> {
  try {
    return await fetchOwnerFinancial(input)
  } catch (err) {
    console.error(
      '[ownerFinancialService] getFinancial: adapter failed',
      err instanceof Error ? err.message : String(err),
    )
    return {
      position: {
        incomeEur:         null,
        expensesEur:       null,
        netEur:            null,
        paidToOwnerEur:    null,
        pendingEur:        null,
        closingBalanceEur: null,
      },
      sections:  [],
      timeline:  [],
    }
  }
}
