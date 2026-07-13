/**
 * @module lifecycle/projections
 * @description Investment Lifecycle projections — the view each investor sees of their journey.
 *
 * This module computes InvestmentLifecycleSummary per partner per property.
 * It is the integration point between:
 *   - The new lifecycle layer (PartnerEntry, CapitalEvent)
 *   - The existing Settlement Engine (ownerAdjustedBalance from PropertySettlementDTO)
 *
 * The Settlement Engine is NOT changed. It continues to compute ownerAdjustedBalance
 * as it always has. This module accepts that value as input and combines it with
 * the partner entry and capital payment data.
 *
 * TWO REPORT TYPES:
 *   - PartnerInvestmentReport   → what the partner sees (no JJ margin)
 *   - JJInternalInvestmentReport → full picture including JJ acquisition economics
 *
 * @see ADR_M8_INVESTMENT_LIFECYCLE.md — M8 Component 6: Investment Summary
 */

import type { ISODate } from './types'
import type { PropertyAcquisition } from './acquisition'
import type { PartnerEntry } from './partnerEntry'
import type { CapitalEvent } from './capitalEvent'
import type { OwnershipPeriod } from './ownershipPeriod'
import {
  sumCapitalPaid,
  sumCapitalContributions,
  sumDistributionsPaid,
} from './capitalEvent'
import {
  computeCapitalRemaining,
  isEntryFullyPaid,
} from './partnerEntry'
import {
  computeJJMarginFromEntry,
  computeJJNetCapitalAtRisk,
} from './acquisition'
import { getCurrentOwnership } from './ownershipPeriod'

// ---------------------------------------------------------------------------
// Input from the existing Settlement Engine
// ---------------------------------------------------------------------------

/**
 * What the existing Settlement Engine provides for one partner on one property.
 * The lifecycle module consumes this — it does NOT compute it.
 *
 * Compatible with existing PropertySettlementDTO.ownerAdjustedBalance.
 */
export interface OperationsInput {
  entityId: string
  partnerName: string
  /**
   * The partner's net balance from operations (Renovation, Airbnb, Management).
   * Positive = JJ owes partner.
   * Negative = partner owes JJ.
   * Computed by the existing Settlement Engine.
   */
  ownerAdjustedBalance: number
  /** The period covered by this operations balance */
  periodFrom: ISODate
  periodTo: ISODate
}

// ---------------------------------------------------------------------------
// Investment Lifecycle Summary — partner view
// ---------------------------------------------------------------------------

/**
 * A complete summary of one partner's investment in one property.
 * This is the Investment Lifecycle distilled to a single readable snapshot.
 */
export interface InvestmentLifecycleSummary {
  entityId: string
  partnerName: string

  // ── Entry ──────────────────────────────────────────────────────────────
  /** When the partner's ownership legally began */
  entryDate: ISODate
  /** When the partner started participating in profits/losses */
  profitParticipationStartDate: ISODate
  /** The agreed property value when the partner entered */
  agreedEntryValuation: number
  /** The partner's ownership percentage */
  entryOwnershipPct: number
  /** The total capital the partner agreed to invest */
  requiredEntryCapital: number

  // ── Capital Status ─────────────────────────────────────────────────────
  /** Total capital payments received from this partner */
  capitalPaid: number
  /** How much the partner still owes toward their required capital */
  capitalRemaining: number
  /** Whether the partner has paid their required entry capital in full */
  isEntryFullyPaid: boolean
  /** Any additional capital contributions beyond required entry capital */
  additionalContributions: number
  /** Total distributions paid to the partner */
  totalDistributions: number

  // ── Operations ─────────────────────────────────────────────────────────
  /**
   * The partner's operations balance from the Settlement Engine.
   * null means not yet computed (Settlement Engine hasn't been run).
   */
  ownerAdjustedBalance: number | null
  /** Period covered by ownerAdjustedBalance */
  operationsPeriodFrom: ISODate | null
  operationsPeriodTo: ISODate | null

  // ── Net Position ───────────────────────────────────────────────────────
  /**
   * The partner's complete net position.
   * = ownerAdjustedBalance - capitalRemaining + totalDistributions
   *
   * Positive = JJ owes partner this amount.
   * Negative = partner owes JJ this amount.
   *
   * null if ownerAdjustedBalance is null.
   */
  netPosition: number | null

  // ── Current Ownership ──────────────────────────────────────────────────
  /** The partner's current ownership %, or at the report end date */
  currentOwnershipPct: number
}

// ---------------------------------------------------------------------------
// JJ Internal fields (NOT in partner view)
// ---------------------------------------------------------------------------

export interface JJInternalFields {
  /** JJ's total cost to acquire the property */
  jjTotalAcquisitionCost: number
  /**
   * JJ's margin earned from this partner's entry.
   * = partnerEntryAmount - (jjTotalCost × partnerOwnershipPct / 100)
   */
  jjMarginFromEntry: number
  /**
   * JJ's net capital at risk after this partner entered.
   * = jjTotalCost - partnerEntryAmount
   */
  jjNetCapitalAtRisk: number
}

/** Full JJ-internal investment report */
export interface JJInternalInvestmentReport extends InvestmentLifecycleSummary {
  jjInternal: JJInternalFields
}

/** Partner-facing report — omits all JJ internal fields */
export type PartnerInvestmentReport = InvestmentLifecycleSummary

// ---------------------------------------------------------------------------
// Core computation
// ---------------------------------------------------------------------------

/**
 * Compute the InvestmentLifecycleSummary for one partner on one property.
 *
 * @param entry           The partner's entry record
 * @param capitalEvents   All capital events for this property (will be filtered by partner)
 * @param ownershipPeriods  All ownership periods for this property
 * @param operationsInput   The Settlement Engine output (or null if not yet run)
 */
export function computeInvestmentSummary(
  entry: PartnerEntry,
  capitalEvents: CapitalEvent[],
  ownershipPeriods: OwnershipPeriod[],
  operationsInput: OperationsInput | null
): InvestmentLifecycleSummary {
  const capitalPaid = sumCapitalPaid(capitalEvents, entry.partnerName)
  const additionalContributions = sumCapitalContributions(capitalEvents, entry.partnerName)
  const totalDistributions = sumDistributionsPaid(capitalEvents, entry.partnerName)
  const capitalRemaining = computeCapitalRemaining(entry.requiredEntryCapital, capitalPaid)
  const entryFullyPaid = isEntryFullyPaid(entry.requiredEntryCapital, capitalPaid)
  const currentOwnershipPct = getCurrentOwnership(ownershipPeriods, entry.partnerName)

  let ownerAdjustedBalance: number | null = null
  let netPosition: number | null = null
  let operationsPeriodFrom: ISODate | null = null
  let operationsPeriodTo: ISODate | null = null

  if (operationsInput !== null) {
    ownerAdjustedBalance = operationsInput.ownerAdjustedBalance
    operationsPeriodFrom = operationsInput.periodFrom
    operationsPeriodTo = operationsInput.periodTo
    // Net = operations balance + distributions received - outstanding entry balance
    netPosition = round2(
      ownerAdjustedBalance + totalDistributions - capitalRemaining
    )
  }

  return {
    entityId: entry.entityId,
    partnerName: entry.partnerName,
    entryDate: entry.entryDate,
    profitParticipationStartDate: entry.profitParticipationStartDate,
    agreedEntryValuation: entry.agreedEntryValuation,
    entryOwnershipPct: entry.entryOwnershipPct,
    requiredEntryCapital: entry.requiredEntryCapital,
    capitalPaid: round2(capitalPaid),
    capitalRemaining: round2(capitalRemaining),
    isEntryFullyPaid: entryFullyPaid,
    additionalContributions: round2(additionalContributions),
    totalDistributions: round2(totalDistributions),
    ownerAdjustedBalance,
    operationsPeriodFrom,
    operationsPeriodTo,
    netPosition,
    currentOwnershipPct,
  }
}

// ---------------------------------------------------------------------------
// Report builders
// ---------------------------------------------------------------------------

/**
 * Build the partner-facing Investment Report.
 * Contains no JJ internal fields.
 */
export function buildPartnerFacingReport(
  summary: InvestmentLifecycleSummary
): PartnerInvestmentReport {
  // The summary itself IS the partner report — JJInternalFields are only
  // added in buildJJInternalReport(). This function validates the contract explicitly.
  return { ...summary }
}

/**
 * Build the JJ-internal Investment Report.
 * Adds acquisition economics that are NEVER shown to partners.
 *
 * @param summary     The investment summary (from computeInvestmentSummary)
 * @param acquisition The PropertyAcquisition for this property
 */
export function buildJJInternalReport(
  summary: InvestmentLifecycleSummary,
  acquisition: PropertyAcquisition
): JJInternalInvestmentReport {
  const jjMarginFromEntry = computeJJMarginFromEntry(
    summary.requiredEntryCapital,
    summary.entryOwnershipPct,
    acquisition.totalJJCost
  )

  const jjNetCapitalAtRisk = computeJJNetCapitalAtRisk(
    acquisition.totalJJCost,
    summary.requiredEntryCapital
  )

  return {
    ...summary,
    jjInternal: {
      jjTotalAcquisitionCost: acquisition.totalJJCost,
      jjMarginFromEntry: round2(jjMarginFromEntry),
      jjNetCapitalAtRisk: round2(jjNetCapitalAtRisk),
    },
  }
}

// ---------------------------------------------------------------------------
// Portfolio view — multiple properties per partner
// ---------------------------------------------------------------------------

/**
 * A partner's investment position across multiple properties.
 * The "portfolio view" for a partner who holds stakes in several properties.
 */
export interface PartnerPortfolioSummary {
  partnerName: string
  properties: InvestmentLifecycleSummary[]
  totals: {
    totalRequiredCapital: number
    totalCapitalPaid: number
    totalCapitalRemaining: number
    totalAdditionalContributions: number
    totalDistributions: number
    totalOwnerAdjustedBalance: number | null   // null if any property has no ops balance
    totalNetPosition: number | null             // null if any property has no ops balance
  }
}

/**
 * Aggregate multiple property summaries into a partner portfolio view.
 * Used for the "all my investments" partner dashboard.
 */
export function computePartnerPortfolio(
  partnerName: string,
  summaries: InvestmentLifecycleSummary[]
): PartnerPortfolioSummary {
  const partnerSummaries = summaries.filter(s => s.partnerName === partnerName)

  const totalRequiredCapital = round2(
    partnerSummaries.reduce((sum, s) => sum + s.requiredEntryCapital, 0)
  )
  const totalCapitalPaid = round2(
    partnerSummaries.reduce((sum, s) => sum + s.capitalPaid, 0)
  )
  const totalCapitalRemaining = round2(
    partnerSummaries.reduce((sum, s) => sum + s.capitalRemaining, 0)
  )
  const totalAdditionalContributions = round2(
    partnerSummaries.reduce((sum, s) => sum + s.additionalContributions, 0)
  )
  const totalDistributions = round2(
    partnerSummaries.reduce((sum, s) => sum + s.totalDistributions, 0)
  )

  const hasAllOpsBalances = partnerSummaries.every(
    s => s.ownerAdjustedBalance !== null
  )

  const totalOwnerAdjustedBalance = hasAllOpsBalances
    ? round2(partnerSummaries.reduce((sum, s) => sum + (s.ownerAdjustedBalance ?? 0), 0))
    : null

  const totalNetPosition =
    hasAllOpsBalances && partnerSummaries.every(s => s.netPosition !== null)
      ? round2(partnerSummaries.reduce((sum, s) => sum + (s.netPosition ?? 0), 0))
      : null

  return {
    partnerName,
    properties: partnerSummaries,
    totals: {
      totalRequiredCapital,
      totalCapitalPaid,
      totalCapitalRemaining,
      totalAdditionalContributions,
      totalDistributions,
      totalOwnerAdjustedBalance,
      totalNetPosition,
    },
  }
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

/** Round to 2 decimal places — applied once per computation, no double-rounding */
function round2(n: number): number {
  return Math.round(n * 100) / 100
}
