/**
 * @module lifecycle/acquisition
 * @description PropertyAcquisition — one per property, immutable, JJ-internal only.
 *
 * RULES:
 *  - One record per property.
 *  - JJ's purchase price NEVER appears in any partner-facing report.
 *  - This record is the starting point of the property's lifecycle.
 *  - It is never linked to any partner_entry record via FK.
 *    Both share entity_id (the property) and nothing else.
 *
 * @see ADR_M8_INVESTMENT_LIFECYCLE.md — Entity: property_acquisition
 */

import type {
  LifecycleEventBase,
  BusinessSource,
  ISODate,
  ValidationResult,
  ValidationError,
} from './types'
import {
  createLifecycleEventBase,
  validateLifecycleEventBase,
} from './lifecycleEvent'

// ---------------------------------------------------------------------------
// Type
// ---------------------------------------------------------------------------

export interface PropertyAcquisition extends LifecycleEventBase {
  readonly eventType: 'original_acquisition'
  readonly eventNature: 'business_event'

  /** The date JJ legally completed the purchase */
  acquisitionDate: ISODate

  /**
   * What JJ actually paid for the property.
   * CONFIDENTIAL — never shown to partners in any report.
   */
  purchasePrice: number

  /**
   * Legal fees, taxes, notary, registration.
   * Defaults to 0 if not documented.
   */
  closingCosts: number

  /**
   * JJ's total cost basis.
   * Computed: purchasePrice + closingCosts.
   * Used for JJ's own P&L and capital gain calculation.
   * CONFIDENTIAL — never shown to partners.
   */
  readonly totalJJCost: number

  /**
   * Free-text description of how this acquisition was funded.
   * e.g. "JJ company cash", "Yossi personal capital", "mixed Yossi+Jacob"
   */
  fundingNotes?: string

  /** Reference to the purchase agreement / notary deed document */
  documentRef?: string
}

// ---------------------------------------------------------------------------
// Factory Parameters
// ---------------------------------------------------------------------------

export interface CreateAcquisitionParams {
  id: string
  entityId: string
  acquisitionDate: ISODate
  purchasePrice: number
  closingCosts?: number
  fundingNotes?: string
  documentRef?: string
  recordedBy: string
  businessSource: BusinessSource
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a PropertyAcquisition record.
 * Computes totalJJCost from purchasePrice + closingCosts.
 *
 * Set status to 'confirmed' only when the business source is verified.
 * Use 'pending_verification' while awaiting notary deed confirmation.
 */
export function createAcquisition(
  params: CreateAcquisitionParams
): PropertyAcquisition {
  const closingCosts = params.closingCosts ?? 0
  const totalJJCost = params.purchasePrice + closingCosts

  const base = createLifecycleEventBase({
    id: params.id,
    entityId: params.entityId,
    eventType: 'original_acquisition',
    eventNature: 'business_event',
    effectiveDate: params.acquisitionDate,
    recordedBy: params.recordedBy,
    status: 'pending_verification',
    businessSource: params.businessSource,
  })

  return {
    ...base,
    eventType: 'original_acquisition',
    eventNature: 'business_event',
    acquisitionDate: params.acquisitionDate,
    purchasePrice: params.purchasePrice,
    closingCosts,
    totalJJCost,
    fundingNotes: params.fundingNotes,
    documentRef: params.documentRef,
  }
}

// ---------------------------------------------------------------------------
// Pure Functions
// ---------------------------------------------------------------------------

/**
 * Compute JJ's total cost basis.
 * purchasePrice + closingCosts.
 */
export function computeTotalJJCost(acquisition: PropertyAcquisition): number {
  return acquisition.purchasePrice + acquisition.closingCosts
}

/**
 * Compute JJ's deal margin from a specific partner entry.
 * This is INTERNAL ONLY — never shown to the partner.
 *
 * Formula: partnerEntryAmount - (totalJJCost × partnerOwnershipPct / 100)
 *
 * Example: Avi pays €120K for 50% → JJ cost basis is €187K
 *   JJ portion of cost = €187K × 50% = €93.5K
 *   JJ margin = €120K - €93.5K = €26.5K
 *
 * @param partnerEntryAmount   How much the partner invested (entry_valuation × pct / 100)
 * @param partnerOwnershipPct  The partner's ownership percentage
 * @param totalJJCost          JJ's total cost (purchasePrice + closingCosts)
 */
export function computeJJMarginFromEntry(
  partnerEntryAmount: number,
  partnerOwnershipPct: number,
  totalJJCost: number
): number {
  const jjCostPortion = totalJJCost * (partnerOwnershipPct / 100)
  return partnerEntryAmount - jjCostPortion
}

/**
 * Compute JJ's remaining capital at risk after a partner has entered.
 * This is how much of its own capital JJ still has deployed in the property.
 *
 * Formula: totalJJCost - partnerEntryAmount
 *
 * If positive: JJ has more money in than it recovered from the partner.
 * If negative: JJ has recovered more than it spent (unusual but possible in multi-partner deals).
 */
export function computeJJNetCapitalAtRisk(
  totalJJCost: number,
  partnerEntryAmount: number
): number {
  return totalJJCost - partnerEntryAmount
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate a PropertyAcquisition record.
 * Enforces: purchase price > 0, valid date, business source present.
 */
export function validateAcquisition(
  acq: PropertyAcquisition
): ValidationResult<PropertyAcquisition> {
  const baseResult = validateLifecycleEventBase(acq)
  if (!baseResult.ok) return { ok: false, errors: baseResult.errors }

  const errors: ValidationError[] = []

  if (acq.eventType !== 'original_acquisition') {
    errors.push({
      field: 'eventType',
      rule: 'must-be-original-acquisition',
      message: 'PropertyAcquisition must have eventType = "original_acquisition".',
    })
  }

  if (typeof acq.purchasePrice !== 'number' || acq.purchasePrice <= 0) {
    errors.push({
      field: 'purchasePrice',
      rule: 'positive-number',
      message: 'purchasePrice must be a positive number.',
    })
  }

  if (typeof acq.closingCosts !== 'number' || acq.closingCosts < 0) {
    errors.push({
      field: 'closingCosts',
      rule: 'non-negative-number',
      message: 'closingCosts must be zero or a positive number.',
    })
  }

  if (
    Math.abs(acq.totalJJCost - (acq.purchasePrice + acq.closingCosts)) > 0.001
  ) {
    errors.push({
      field: 'totalJJCost',
      rule: 'must-equal-price-plus-costs',
      message:
        `totalJJCost (${acq.totalJJCost}) must equal ` +
        `purchasePrice (${acq.purchasePrice}) + closingCosts (${acq.closingCosts}) = ` +
        `${acq.purchasePrice + acq.closingCosts}.`,
    })
  }

  if (!acq.acquisitionDate || !/^\d{4}-\d{2}-\d{2}$/.test(acq.acquisitionDate)) {
    errors.push({
      field: 'acquisitionDate',
      rule: 'iso-date',
      message: 'acquisitionDate must be a valid ISO date (YYYY-MM-DD).',
    })
  }

  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, value: acq }
}

// ---------------------------------------------------------------------------
// Partner-facing guard
// ---------------------------------------------------------------------------

/**
 * Returns a safe partner-facing subset — everything that IS NOT confidential.
 * Acquisition records have NO partner-facing fields.
 * This function exists to make the rule explicit and lint-checkable.
 *
 * Call this when building partner-facing reports to confirm nothing is leaked.
 */
export function getPartnerFacingFields(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _acquisition: PropertyAcquisition
): Record<string, never> {
  // PropertyAcquisition has zero partner-facing fields.
  // Purchase price, closing costs, totalJJCost — all confidential.
  return {}
}
