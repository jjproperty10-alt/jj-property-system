/**
 * ownerMaintenanceService — permanent public boundary for Owner Maintenance data.
 *
 * G3-A: Owner Workspace Maintenance RC3 Alignment (2026-07-25).
 * Architecture: Owner Workspace → OwnerMaintenanceService → OwnerMaintenanceAdapter → RC3
 *
 * This service is the permanent public boundary between Owner Workspace
 * and the RC3 maintenance engine. The adapter (ownerMaintenanceAdapter.ts) is
 * an internal implementation detail and may be replaced without touching
 * Owner Workspace or any consumer of this service.
 *
 * Amendment #1 (approved): Owner Workspace imports only from this service.
 * G3-17: No component may import fetchRC3Report directly into Owner Workspace.
 * G3-18: This service does NOT import from ownerFinancialService.
 */

import 'server-only'

import { fetchOwnerMaintenance } from './ownerMaintenanceAdapter'
import type { OwnerMaintenanceAdapterInput } from './ownerMaintenanceAdapter'
import type { OwnerMaintenanceItemDTO } from './ownerWorkspaceTypes'

export type { OwnerMaintenanceAdapterInput }

/**
 * Get maintenance items for an owner's properties.
 *
 * Returns renovation rows mapped to OwnerMaintenanceItemDTO[], sorted by date desc.
 * Returns empty array on any adapter failure.
 * Never throws — all errors are absorbed and logged.
 */
export async function getMaintenanceItems(
  input: OwnerMaintenanceAdapterInput,
): Promise<OwnerMaintenanceItemDTO[]> {
  try {
    return await fetchOwnerMaintenance(input)
  } catch (err) {
    console.error(
      '[ownerMaintenanceService] getMaintenanceItems: adapter failed',
      err instanceof Error ? err.message : String(err),
    )
    return []
  }
}
