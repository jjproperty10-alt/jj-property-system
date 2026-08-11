/**
 * ownerPortfolioAdapter — Hostaway Audit consumer for Owner Portfolio view.
 *
 * G3-B: Owner Workspace Portfolio Hostaway Alignment (2026-07-25).
 * Architecture: Owner Workspace → OwnerPortfolioAdapter → Hostaway Audit
 *
 * Responsibility:
 * - Creates PropertyAuditService via createServiceClient()
 * - Calls listAuditableProperties() to enumerate all JJ-Hostaway approved mappings
 * - Maps AuditableProperty[] → HostawayPortfolioSummaryDTO
 *
 * Constraints:
 * - Never reads pms.* schemas directly (G3-2)
 * - Never performs local payout/revenue arithmetic (G3-5)
 * - Never fabricates financial values — all financial aggregates are null until
 *   a full per-property audit is run (RC2 scope) (G3-9, G3-10)
 * - Does not import from ownerReservationAdapter / ownerFinancialAdapter (G3-18)
 *
 * Financial fields:
 * - All financial aggregates (platformIncomeEur, ownerDueEur, etc.) are null in V1.
 *   Full per-property audit runs required to populate them — RC2 scope.
 * - This is honest: the adapter reports what it knows, not what it guesses.
 */

import 'server-only'

import { createServiceClient } from '@/lib/supabase'
import { PropertyAuditService } from '@/lib/hostaway-audit'
import type {
  IPropertyAuditService,
  AuditableProperty,
} from '@/lib/hostaway-audit'
import type { HostawayPortfolioSummaryDTO, HostawayPropertySummaryDTO } from './ownerWorkspaceTypes'

// ─── Adapter input ────────────────────────────────────────────────────────────

export interface OwnerPortfolioAdapterInput {
  readonly startDate: string  // ISO date
  readonly endDate: string    // ISO date
}

// ─── Mapping ──────────────────────────────────────────────────────────────────

function mapAuditableProperty(
  p: AuditableProperty,
): HostawayPropertySummaryDTO {
  return {
    propertyName:              p.jjPropertyName,
    propertyId:                p.propertyId,
    canonicalName:             p.hostawayName || null,
    mappingStatus:             'mapped',    // listAuditableProperties() returns only approved mappings
    reservations:              0,           // period-filtered count requires audit run — RC2 scope
    platformIncomeEur:         null,        // requires full audit run — RC2 scope
    platformFeesEur:           null,
    cleaningIncomeEur:         null,
    cleaningExpenseEur:        null,
    operationalExpensesEur:    null,
    managementFeeEur:          null,
    ownerDueEur:               null,
    reconciliationStatus:      'missing_jj', // conservative placeholder — determined by audit run
  }
}

// ─── Empty fallback ──────────────────────────────────────────────────────────

function emptyPortfolioSummary(
  startDate: string,
  endDate: string,
): HostawayPortfolioSummaryDTO {
  return {
    period:     { startDate, endDate },
    sourceMode: 'hostaway',
    properties: [],
    totals: {
      reservations: 0,
      revenueEur:   null,
      feesEur:      null,
      cleaningEur:  null,
      ownerDueEur:  null,
    },
    reconciliation: {
      matchedCount:        0,
      missingInJJ:         0,
      missingInHostaway:   0,
      amountDifferenceEur: null,
      hasDifferences:      false,
    },
    propertiesNeedingAttention: [],
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch portfolio summary from Hostaway Audit mapping registry.
 *
 * Lists all JJ properties with approved Hostaway mappings.
 * Financial aggregates are null in V1 — per-property audit runs required (RC2 scope).
 *
 * Unmapped properties (no approved mapping) do not appear in this view.
 * This is intentional: the portfolio view covers only Hostaway-verifiable properties.
 */
export async function getPortfolio(
  input: OwnerPortfolioAdapterInput,
): Promise<HostawayPortfolioSummaryDTO> {
  const { startDate, endDate } = input

  const sb = createServiceClient()
  const auditService: IPropertyAuditService = new PropertyAuditService(sb)

  let auditableProperties: readonly AuditableProperty[] = []
  try {
    auditableProperties = await auditService.listAuditableProperties()
  } catch (err) {
    console.error(
      '[ownerPortfolioAdapter] getPortfolio: listAuditableProperties failed',
      err instanceof Error ? err.message : String(err),
    )
    auditableProperties = []
  }

  if (auditableProperties.length === 0) {
    return emptyPortfolioSummary(startDate, endDate)
  }

  const properties = auditableProperties.map(mapAuditableProperty)

  return {
    period:     { startDate, endDate },
    sourceMode: 'hostaway',
    properties,
    totals: {
      reservations: 0,           // period-filtered count requires audit runs
      revenueEur:   null,        // requires audit runs — RC2 scope
      feesEur:      null,
      cleaningEur:  null,
      ownerDueEur:  null,
    },
    reconciliation: {
      matchedCount:        0,    // requires audit runs
      missingInJJ:         0,
      missingInHostaway:   0,
      amountDifferenceEur: null,
      hasDifferences:      false,
    },
    propertiesNeedingAttention: [],
  }
}
