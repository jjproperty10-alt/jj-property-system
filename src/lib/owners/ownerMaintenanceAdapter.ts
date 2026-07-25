/**
 * ownerMaintenanceAdapter — RC3 data consumer for Owner Maintenance tab.
 *
 * G3-A: Owner Workspace Maintenance RC3 Alignment (2026-07-25).
 * Architecture: OwnerMaintenanceService → OwnerMaintenanceAdapter → RC3 (fetchRC3Report)
 *
 * Responsibility:
 * - Calls fetchRC3Report once per property for renovation account data
 * - Maps renovation rows to OwnerMaintenanceItemDTO
 * - Platform tracking rows excluded (is_platform_tracking === true)
 * - 'reference' and 'info' display groups excluded (internal/tracking only)
 * - Status is always 'unknown' — lifecycle status requires RC2 scope work
 * - statusReason explicitly declares the source limitation
 *
 * G3-17: Owner Workspace never imports fetchRC3Report directly — only via services.
 * G3-18: This adapter does NOT import from ownerFinancialAdapter (no adapter-to-adapter).
 *
 * Adapters are replaceable; the Service contract is permanent.
 */

import 'server-only'

import { fetchRC3Report } from '@/lib/report/fetchReport'
import type { RC3AccountRow, RC3PropertyReport } from '@/lib/report/types'
import type { OwnerMaintenanceItemDTO } from './ownerWorkspaceTypes'

// ─── Adapter input ────────────────────────────────────────────────────────────

export interface OwnerMaintenanceAdapterInput {
  /** Verified property names from identity resolver (management_relationship) */
  readonly properties: readonly string[]
  readonly fromDate?: string
  readonly toDate?: string
}

// ─── Mapping ──────────────────────────────────────────────────────────────────

function mapRowToItem(
  row: RC3AccountRow,
  propertyName: string,
): OwnerMaintenanceItemDTO {
  return {
    id:           row.id,
    propertyName,
    date:         row.date,
    // description → title: preserved for test assertion compatibility
    title:        row.description || row.display_label || row.subcategory || 'Maintenance item',
    subcategory:  row.subcategory ?? null,
    status:       'unknown',
    statusReason: 'rc3_has_no_lifecycle_status',
    // client_amount = COALESCE(client_charge, amount_eur) from RC3 view
    amountEur:    String(row.client_amount),
    source:       'rc3',
  }
}

/**
 * Extract maintenance items from a single property's RC3 report.
 * Only renovation account rows that are balance-affecting (expense/income)
 * are surfaced — platform tracking and reference rows are excluded.
 */
function extractRenovationItems(report: RC3PropertyReport): OwnerMaintenanceItemDTO[] {
  const renovationSection = report.accounts.find(a => a.account_type === 'renovation')
  if (!renovationSection) return []

  return renovationSection.rows
    .filter(r =>
      !r.is_platform_tracking &&
      r.display_group !== 'reference' &&
      r.display_group !== 'info',
    )
    .map(row => mapRowToItem(row as RC3AccountRow, report.reporting_name))
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch maintenance items for an owner's properties from the RC3 renovation account.
 *
 * Calls fetchRC3Report once per property in parallel (Promise.allSettled).
 * Failed properties are skipped — partial data preferred over total failure.
 * Results are sorted by date descending (most recent first).
 */
export async function fetchOwnerMaintenance(
  input: OwnerMaintenanceAdapterInput,
): Promise<OwnerMaintenanceItemDTO[]> {
  const { properties, fromDate, toDate } = input

  if (properties.length === 0) return []

  const settled = await Promise.allSettled(
    properties.map(reportingName =>
      fetchRC3Report({ reportingName, fromDate, toDate }),
    ),
  )

  const reports: RC3PropertyReport[] = settled
    .filter((r): r is PromiseFulfilledResult<RC3PropertyReport> => r.status === 'fulfilled')
    .map(r => r.value)

  const items = reports.flatMap(extractRenovationItems)

  // Sort by date descending — most recent maintenance first
  return items.sort((a, b) => b.date.localeCompare(a.date))
}
