/**
 * @module lifecycle/disposition
 * @description PropertyDisposition — the closing event of a property's lifecycle.
 *
 * A disposition triggers final settlement across all open Investment Lifecycles.
 * Each partner's final position is computed from:
 *   - Their ownership % at disposition date
 *   - Net proceeds from the sale
 *   - Their required entry capital (from PartnerEntry)
 *
 * @see ADR_M8_INVESTMENT_LIFECYCLE.md — Entity: property_disposition
 */

import type {
  LifecycleEventBase,
  BusinessSource,
  ISODate,
  DispositionType,
  ValidationResult,
  ValidationError,
} from './types'
import {
  createLifecycleEventBase,
  validateLifecycleEventBase,
} from './lifecycleEvent'
import type { OwnershipPeriod } from './ownershipPeriod'
import type { PartnerEntry } from './partnerEntry'
import { getOwnershipAtDate } from './ownershipPeriod'

// ---------------------------------------------------------------------------
// Type
// ---------------------------------------------------------------------------

export interface PropertyDisposition extends LifecycleEventBase {
  readonly eventType: 'disposition'
  readonly eventNature: 'business_event'

  /** Date the property was legally transferred / sold */
  dispositionDate: ISODate

  /** Whether this is a full sale, partial sale, or transfer */
  dispositionType: DispositionType

  /** The agreed sale price */
  salePrice: number

  /** Total costs to sell (agent commission, legal, taxes) */
  sellingCosts: number

  /**
   * Net amount available to distribute.
   * Computed: salePrice - sellingCosts.
   */
  readonly netProceeds: number

  /** Buyer name (if applicable) */
  buyerName?: string

  /** Reference to the sale agreement / notary deed */
  documentRef?: string
}

// ---------------------------------------------------------------------------
// Factory Parameters
// ---------------------------------------------------------------------------

export interface CreateDispositionParams {
  id: string
  entityId: string
  dispositionDate: ISODate
  dispositionType: DispositionType
  salePrice: number
  sellingCosts?: number
  buyerName?: string
  documentRef?: string
  recordedBy: string
  businessSource: BusinessSource
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createDisposition(
  params: CreateDispositionParams
): PropertyDisposition {
  const sellingCosts = params.sellingCosts ?? 0
  const netProceeds = params.salePrice - sellingCosts

  const base = createLifecycleEventBase({
    id: params.id,
    entityId: params.entityId,
    eventType: 'disposition',
    eventNature: 'business_event',
    effectiveDate: params.dispositionDate,
    recordedBy: params.recordedBy,
    status: 'pending_verification',
    businessSource: params.businessSource,
  })

  return {
    ...base,
    eventType: 'disposition',
    eventNature: 'business_event',
    dispositionDate: params.dispositionDate,
    dispositionType: params.dispositionType,
    salePrice: params.salePrice,
    sellingCosts,
    netProceeds,
    buyerName: params.buyerName,
    documentRef: params.documentRef,
  }
}

// ---------------------------------------------------------------------------
// Disposition Allocation — per-partner settlement at sale
// ---------------------------------------------------------------------------

/**
 * How the disposition's net proceeds and gain/loss are allocated to one partner.
 */
export interface DispositionAllocation {
  /** Partner receiving this allocation */
  partnerName: string

  /** Their ownership % at the date of disposition */
  ownershipPctAtDisposition: number

  /** Their share of the net proceeds: netProceeds × ownershipPctAtDisposition / 100 */
  partnerNetProceeds: number

  /**
   * The total capital they agreed to invest when they entered.
   * From PartnerEntry.requiredEntryCapital.
   */
  partnerEntryCapital: number

  /**
   * How much they actually paid toward their entry capital.
   * From sumCapitalPaid() over CapitalEvent records.
   * May differ from partnerEntryCapital (outstanding balance or overpayment).
   */
  capitalPaid: number

  /**
   * Gain or loss from the disposition, relative to their entry capital paid.
   * partnerNetProceeds - capitalPaid
   *
   * Positive: partner made money on the exit.
   * Negative: partner lost money (unusual, but possible in distressed sales).
   */
  partnerGainLoss: number

  /**
   * Any outstanding entry capital balance (requiredEntryCapital - capitalPaid).
   * If > 0: partner still owed JJ this amount — it should be settled at disposition.
   * Included here for the closing settlement computation.
   */
  outstandingEntryBalance: number

  /**
   * The partner's net settlement at disposition.
   * = partnerNetProceeds - outstandingEntryBalance
   * (JJ retains the outstanding entry balance before distributing to partner)
   */
  netSettlement: number
}

/**
 * Compute disposition allocations for all partners.
 *
 * This gives JJ the full picture at disposition:
 * - Who gets what from the sale proceeds
 * - How much each partner is owed (or owes)
 * - The final gain/loss per partner
 *
 * @param disposition       The disposition event
 * @param ownershipPeriods  All ownership periods for this property
 * @param partnerEntries    All partner entry records for this property
 * @param capitalPaidByPartner  Map of { partnerName → total capital paid } from CapitalEvent records
 */
export function computeDispositionAllocations(
  disposition: PropertyDisposition,
  ownershipPeriods: OwnershipPeriod[],
  partnerEntries: PartnerEntry[],
  capitalPaidByPartner: Map<string, number>
): DispositionAllocation[] {
  // Get the ownership snapshot at disposition date
  const snapshot = new Map<string, number>()
  ownershipPeriods.forEach(period => {
    const pct = getOwnershipAtDate(
      ownershipPeriods,
      period.partnerName,
      disposition.dispositionDate
    )
    if (pct > 0) {
      snapshot.set(period.partnerName, pct)
    }
  })

  const allocations: DispositionAllocation[] = []

  snapshot.forEach((ownershipPct, partnerName) => {
    const partnerEntry = partnerEntries.find(e => e.partnerName === partnerName)
    const partnerEntryCapital = partnerEntry?.requiredEntryCapital ?? 0
    const capitalPaid = capitalPaidByPartner.get(partnerName) ?? 0
    const outstandingEntryBalance = Math.max(0, partnerEntryCapital - capitalPaid)

    const partnerNetProceeds =
      Math.round((disposition.netProceeds * ownershipPct / 100) * 100) / 100

    const partnerGainLoss =
      Math.round((partnerNetProceeds - capitalPaid) * 100) / 100

    const netSettlement =
      Math.round((partnerNetProceeds - outstandingEntryBalance) * 100) / 100

    allocations.push({
      partnerName,
      ownershipPctAtDisposition: ownershipPct,
      partnerNetProceeds,
      partnerEntryCapital,
      capitalPaid,
      partnerGainLoss,
      outstandingEntryBalance,
      netSettlement,
    })
  })

  return allocations
}

/**
 * Verify that the total of all partner allocations equals the net proceeds.
 * Should sum to netProceeds within rounding tolerance (€0.01).
 */
export function verifyAllocationTotal(
  disposition: PropertyDisposition,
  allocations: DispositionAllocation[]
): boolean {
  const total = allocations.reduce((sum, a) => sum + a.partnerNetProceeds, 0)
  return Math.abs(total - disposition.netProceeds) <= 0.01
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export function validateDisposition(
  disposition: PropertyDisposition
): ValidationResult<PropertyDisposition> {
  const baseResult = validateLifecycleEventBase(disposition)
  if (!baseResult.ok) return { ok: false, errors: baseResult.errors }

  const errors: ValidationError[] = []

  if (disposition.eventType !== 'disposition') {
    errors.push({
      field: 'eventType',
      rule: 'must-be-disposition',
      message: 'PropertyDisposition must have eventType = "disposition".',
    })
  }

  if (typeof disposition.salePrice !== 'number' || disposition.salePrice <= 0) {
    errors.push({
      field: 'salePrice',
      rule: 'positive-number',
      message: 'salePrice must be a positive number.',
    })
  }

  if (typeof disposition.sellingCosts !== 'number' || disposition.sellingCosts < 0) {
    errors.push({
      field: 'sellingCosts',
      rule: 'non-negative-number',
      message: 'sellingCosts must be zero or positive.',
    })
  }

  const expectedNet = disposition.salePrice - disposition.sellingCosts
  if (Math.abs(disposition.netProceeds - expectedNet) > 0.01) {
    errors.push({
      field: 'netProceeds',
      rule: 'must-equal-price-minus-costs',
      message:
        `netProceeds (${disposition.netProceeds}) must equal ` +
        `salePrice (${disposition.salePrice}) - sellingCosts (${disposition.sellingCosts}) = ${expectedNet}.`,
    })
  }

  if (!['sale', 'partial_sale', 'transfer'].includes(disposition.dispositionType)) {
    errors.push({
      field: 'dispositionType',
      rule: 'must-be-valid-type',
      message: 'dispositionType must be "sale", "partial_sale", or "transfer".',
    })
  }

  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, value: disposition }
}
