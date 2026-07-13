/**
 * @module lifecycle/partnerEntry
 * @description PartnerEntry — each partner's commercial entry into a property.
 *
 * CRITICAL RULES (from ADR Principle 2 and 6):
 *
 *  1. PartnerEntry is INDEPENDENT of PropertyAcquisition.
 *     No FK between them. They share only entityId (the property).
 *
 *  2. agreedEntryValuation has NO required relationship to purchasePrice.
 *     JJ bought in 2020 at €180K. Avi entered in 2022 at €240K.
 *     These are independent facts from independent agreements.
 *
 *  3. entryDate is the LEGAL effective date.
 *     It is NOT assumed to equal any payment date.
 *
 *  4. profitParticipationStartDate may differ from entryDate.
 *     Both must be explicitly recorded from the agreement.
 *
 *  5. requiredEntryCapital = agreedEntryValuation × entryOwnershipPct / 100
 *     This is the ONLY computation allowed in this module.
 *     All source values must come from the partnership agreement.
 *
 * @see ADR_M8_INVESTMENT_LIFECYCLE.md — Entity: partner_entry
 * @see validation.ts — INV-1 through INV-6 guards
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

export interface PartnerEntry extends LifecycleEventBase {
  readonly eventType: 'partner_entry'
  readonly eventNature: 'business_event'

  /** The partner's name. Must match exactly the name used in transactions. */
  partnerName: string

  /**
   * The LEGAL effective date of the partnership.
   * This is when the partner's ownership officially begins.
   *
   * NEVER assumed to equal any payment date.
   * Must come from the partnership agreement or notary document.
   *
   * INV-4: entryDate ≠ paymentDate
   * INV-5: effectiveOwnershipDate ≠ contractSignatureDate
   */
  entryDate: ISODate

  /**
   * The agreed property valuation at the time of this partner's entry.
   *
   * This is the number the partner and JJ agreed the property is worth
   * at the moment of entry — NOT JJ's cost, NOT the market price,
   * NOT derived from any previous transaction.
   *
   * Must come from the signed partnership agreement.
   *
   * INV-1: agreedEntryValuation ≠ purchasePrice
   */
  agreedEntryValuation: number

  /**
   * The partner's ownership percentage.
   * Must come from the signed partnership agreement.
   *
   * INV-3: entryOwnershipPct ≠ (capitalPaid / some price)
   */
  entryOwnershipPct: number

  /**
   * The total capital the partner is required to invest.
   * Computed: agreedEntryValuation × entryOwnershipPct / 100
   *
   * This is the ONLY computed value in this entity.
   * It follows directly from the two values above, both of which must
   * be sourced from the agreement.
   *
   * INV-2: requiredEntryCapital ≠ capitalPaid
   * (capitalPaid is tracked in CapitalEvent records, not here)
   */
  readonly requiredEntryCapital: number

  /**
   * The date from which this partner participates in profits and losses.
   *
   * May differ from entryDate. For example:
   *   - Legal entry: 2022-06-01 (ownership effective)
   *   - Profit participation: 2022-07-01 (first full month)
   *
   * Must be explicitly stated in the agreement.
   * NEVER assumed to equal entryDate.
   *
   * INV-6: profitParticipationStartDate ≠ (assumed from) ownershipEffectiveDate
   */
  profitParticipationStartDate: ISODate

  /** Reference to the signed partnership agreement */
  agreementRef?: string
}

// ---------------------------------------------------------------------------
// Factory Parameters
// ---------------------------------------------------------------------------

export interface CreatePartnerEntryParams {
  id: string
  entityId: string
  partnerName: string
  entryDate: ISODate
  agreedEntryValuation: number
  entryOwnershipPct: number
  profitParticipationStartDate: ISODate
  agreementRef?: string
  recordedBy: string
  businessSource: BusinessSource
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a PartnerEntry record.
 * Computes requiredEntryCapital from agreedEntryValuation × entryOwnershipPct / 100.
 *
 * Note: capitalPaid is NOT tracked here. It is tracked in CapitalEvent records
 * (eventType: 'capital_payment') linked to this entry via linkedEventId.
 */
export function createPartnerEntry(
  params: CreatePartnerEntryParams
): PartnerEntry {
  const requiredEntryCapital = computeRequiredEntryCapital(
    params.agreedEntryValuation,
    params.entryOwnershipPct
  )

  const base = createLifecycleEventBase({
    id: params.id,
    entityId: params.entityId,
    eventType: 'partner_entry',
    eventNature: 'business_event',
    effectiveDate: params.entryDate,
    recordedBy: params.recordedBy,
    status: 'pending_verification',
    businessSource: params.businessSource,
  })

  return {
    ...base,
    eventType: 'partner_entry',
    eventNature: 'business_event',
    partnerName: params.partnerName,
    entryDate: params.entryDate,
    agreedEntryValuation: params.agreedEntryValuation,
    entryOwnershipPct: params.entryOwnershipPct,
    requiredEntryCapital,
    profitParticipationStartDate: params.profitParticipationStartDate,
    agreementRef: params.agreementRef,
  }
}

// ---------------------------------------------------------------------------
// Pure Functions
// ---------------------------------------------------------------------------

/**
 * Compute the total capital a partner is required to invest.
 * agreedEntryValuation × entryOwnershipPct / 100
 *
 * This is the ONLY computation that derives from agreement values.
 * Every other financial fact must come from an independent source.
 */
export function computeRequiredEntryCapital(
  agreedEntryValuation: number,
  entryOwnershipPct: number
): number {
  return Math.round((agreedEntryValuation * entryOwnershipPct / 100) * 100) / 100
}

/**
 * Compute how much a partner still owes from their required entry capital.
 * requiredEntryCapital - capitalPaid
 *
 * capitalPaid comes from CapitalEvent records, not from this entity.
 * If capitalRemaining < 0, the partner has overpaid (unusual — verify).
 * If capitalRemaining > 0, the partner still owes a balance.
 * If capitalRemaining === 0, the partner has paid in full.
 */
export function computeCapitalRemaining(
  requiredEntryCapital: number,
  capitalPaid: number
): number {
  return Math.round((requiredEntryCapital - capitalPaid) * 100) / 100
}

/**
 * True if the partner has paid their required entry capital in full.
 * A small tolerance (€0.01) is applied for rounding.
 */
export function isEntryFullyPaid(
  requiredEntryCapital: number,
  capitalPaid: number
): boolean {
  return computeCapitalRemaining(requiredEntryCapital, capitalPaid) <= 0.01
}

// ---------------------------------------------------------------------------
// Partner-facing safe subset
// ---------------------------------------------------------------------------

/**
 * The fields the partner is allowed to see from their entry record.
 * JJ's internal economics (acquisition cost, margin) are in PropertyAcquisition
 * and are never part of PartnerEntry — so all fields here are partner-visible.
 */
export interface PartnerEntryPartnerView {
  partnerName: string
  entryDate: ISODate
  agreedEntryValuation: number
  entryOwnershipPct: number
  requiredEntryCapital: number
  profitParticipationStartDate: ISODate
}

export function getPartnerView(entry: PartnerEntry): PartnerEntryPartnerView {
  return {
    partnerName: entry.partnerName,
    entryDate: entry.entryDate,
    agreedEntryValuation: entry.agreedEntryValuation,
    entryOwnershipPct: entry.entryOwnershipPct,
    requiredEntryCapital: entry.requiredEntryCapital,
    profitParticipationStartDate: entry.profitParticipationStartDate,
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate a PartnerEntry record.
 * Enforces: all required fields present, valid ranges, "Never Infer" base checks.
 *
 * For the full cross-entity "Never Infer" validation
 * (e.g., INV-1: entry valuation must not equal acquisition price without independent source),
 * see validation.ts :: validateNeverInferInvariants().
 */
export function validatePartnerEntry(
  entry: PartnerEntry
): ValidationResult<PartnerEntry> {
  const baseResult = validateLifecycleEventBase(entry)
  if (!baseResult.ok) return { ok: false, errors: baseResult.errors }

  const errors: ValidationError[] = []

  if (entry.eventType !== 'partner_entry') {
    errors.push({
      field: 'eventType',
      rule: 'must-be-partner-entry',
      message: 'PartnerEntry must have eventType = "partner_entry".',
    })
  }

  if (!entry.partnerName || entry.partnerName.trim().length === 0) {
    errors.push({
      field: 'partnerName',
      rule: 'required',
      message: 'partnerName is required.',
    })
  }

  if (!entry.entryDate || !/^\d{4}-\d{2}-\d{2}$/.test(entry.entryDate)) {
    errors.push({
      field: 'entryDate',
      rule: 'iso-date',
      message: 'entryDate must be a valid ISO date (YYYY-MM-DD).',
    })
  }

  if (typeof entry.agreedEntryValuation !== 'number' || entry.agreedEntryValuation <= 0) {
    errors.push({
      field: 'agreedEntryValuation',
      rule: 'positive-number',
      message: 'agreedEntryValuation must be a positive number.',
    })
  }

  if (
    typeof entry.entryOwnershipPct !== 'number' ||
    entry.entryOwnershipPct <= 0 ||
    entry.entryOwnershipPct > 100
  ) {
    errors.push({
      field: 'entryOwnershipPct',
      rule: 'range-0-100',
      message: 'entryOwnershipPct must be between 0 (exclusive) and 100 (inclusive).',
    })
  }

  const expectedRequired = computeRequiredEntryCapital(
    entry.agreedEntryValuation,
    entry.entryOwnershipPct
  )
  if (Math.abs(entry.requiredEntryCapital - expectedRequired) > 0.01) {
    errors.push({
      field: 'requiredEntryCapital',
      rule: 'must-equal-valuation-times-pct',
      message:
        `requiredEntryCapital (${entry.requiredEntryCapital}) must equal ` +
        `agreedEntryValuation (${entry.agreedEntryValuation}) × ` +
        `entryOwnershipPct (${entry.entryOwnershipPct}) / 100 = ${expectedRequired}.`,
    })
  }

  if (
    !entry.profitParticipationStartDate ||
    !/^\d{4}-\d{2}-\d{2}$/.test(entry.profitParticipationStartDate)
  ) {
    errors.push({
      field: 'profitParticipationStartDate',
      rule: 'iso-date',
      message:
        'profitParticipationStartDate must be a valid ISO date. ' +
        'This may equal entryDate but must be explicitly stated, not assumed.',
    })
  }

  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, value: entry }
}
