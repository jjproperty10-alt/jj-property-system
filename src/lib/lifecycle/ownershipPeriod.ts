/**
 * @module lifecycle/ownershipPeriod
 * @description OwnershipPeriod — derived from lifecycle events, never edited directly.
 *
 * This is the bridge between the Investment Lifecycle layer (above)
 * and the existing Ownership Engine (below). The Ownership Engine reads
 * ownership records that match this shape exactly — it requires no changes.
 *
 * KEY PRINCIPLE: ownership_period rows are created by lifecycle events.
 * They are never entered manually. The source of truth is the event log.
 *
 * @see ADR_M8_INVESTMENT_LIFECYCLE.md — Entity: ownership_period
 */

import type {
  CapitalEventType,
  BusinessFactStatus,
  ISODate,
  ValidationResult,
  ValidationError,
} from './types'
import type { PartnerEntry } from './partnerEntry'
import type { PropertyAcquisition } from './acquisition'
import { sortByEffectiveDate } from './lifecycleEvent'

// ---------------------------------------------------------------------------
// Type
// ---------------------------------------------------------------------------

/**
 * One row in the ownership timeline for a given property + partner.
 *
 * Compatible with the existing `partnership_ownership` table structure.
 * The Ownership Engine reads records matching this shape without changes.
 */
export interface OwnershipPeriod {
  /** UUID of the property in entity_registry */
  entityId: string

  /** Partner name — must match payer/payee values in transactions */
  partnerName: string

  /** Ownership percentage during this period */
  ownershipPct: number

  /** When this ownership period begins (inclusive) */
  effectiveFrom: ISODate

  /**
   * When this ownership period ends (exclusive).
   * null means "currently active with no end date."
   */
  effectiveTo: ISODate | null

  /**
   * What type of lifecycle event created this period.
   * Provides audit trail for why this ownership period exists.
   */
  sourceEventType: CapitalEventType

  /**
   * The ID of the specific lifecycle event that created this period.
   * e.g., the PartnerEntry's id, or the PropertyAcquisition's id.
   */
  sourceEventId: string

  /** Verification status of this ownership record */
  status: BusinessFactStatus
}

// ---------------------------------------------------------------------------
// Derivation from events
// ---------------------------------------------------------------------------

/**
 * Derive the ownership period for JJ's 100% ownership from acquisition to first partner entry.
 *
 * When JJ acquires a property with no partners, they own 100% from the acquisition date.
 * This period closes when the first partner enters.
 */
export function deriveJJSolePeriod(
  acquisition: PropertyAcquisition,
  firstPartnerEntryDate: ISODate | null
): OwnershipPeriod {
  return {
    entityId: acquisition.entityId,
    partnerName: 'JJ',
    ownershipPct: 100,
    effectiveFrom: acquisition.acquisitionDate,
    effectiveTo: firstPartnerEntryDate,
    sourceEventType: 'original_acquisition',
    sourceEventId: acquisition.id,
    status: acquisition.status,
  }
}

/**
 * Derive ownership periods from a list of partner entries.
 *
 * Each partner entry creates:
 *   (a) A new period for the entering partner
 *   (b) Closes the previous periods for all existing owners
 *   (c) Creates new periods for all existing owners with adjusted percentages
 *
 * NOTE: This function requires that percentage allocations across all owners at each
 * point in time sum to 100%. If they don't, the ownershipPeriods are inconsistent —
 * validateNoGapsOrOverlaps() will catch this.
 *
 * In practice, Yossi manages these percentages via the Business Decision Worksheet.
 * This function does NOT compute percentages — it only structures what was agreed.
 *
 * @param entries   List of PartnerEntry events, sorted by entryDate ascending.
 *                  Each entry must include the FULL set of ownership percentages
 *                  as of that entry date (JJ's % + all existing partners' new %s).
 * @param snapshotsByDate  Map from date → { partnerName → ownershipPct }
 *                         This captures the complete ownership state after each entry.
 */
export function deriveOwnershipPeriodsFromSnapshots(
  entityId: string,
  snapshotsByDate: Array<{
    effectiveFrom: ISODate
    ownership: Array<{ partnerName: string; ownershipPct: number }>
    sourceEventType: CapitalEventType
    sourceEventId: string
    status: BusinessFactStatus
  }>
): OwnershipPeriod[] {
  const sorted = [...snapshotsByDate].sort((a, b) =>
    a.effectiveFrom.localeCompare(b.effectiveFrom)
  )

  const periods: OwnershipPeriod[] = []

  sorted.forEach((snapshot, index) => {
    const nextSnapshot = sorted[index + 1]

    snapshot.ownership.forEach(({ partnerName, ownershipPct }) => {
      periods.push({
        entityId,
        partnerName,
        ownershipPct,
        effectiveFrom: snapshot.effectiveFrom,
        effectiveTo: nextSnapshot ? nextSnapshot.effectiveFrom : null,
        sourceEventType: snapshot.sourceEventType,
        sourceEventId: snapshot.sourceEventId,
        status: snapshot.status,
      })
    })
  })

  return periods
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Get the ownership percentage for a specific partner on a specific date.
 * Returns 0 if the partner has no period covering the date.
 */
export function getOwnershipAtDate(
  periods: OwnershipPeriod[],
  partnerName: string,
  asOfDate: ISODate
): number {
  const period = periods.find(
    p =>
      p.partnerName === partnerName &&
      p.effectiveFrom <= asOfDate &&
      (p.effectiveTo === null || p.effectiveTo > asOfDate)
  )
  return period?.ownershipPct ?? 0
}

/**
 * Get the current (most recent, open-ended) ownership for a partner.
 * Returns 0 if the partner has no current open period.
 */
export function getCurrentOwnership(
  periods: OwnershipPeriod[],
  partnerName: string
): number {
  const period = periods.find(
    p => p.partnerName === partnerName && p.effectiveTo === null
  )
  return period?.ownershipPct ?? 0
}

/**
 * Get all partners who had any ownership during the given date range.
 */
export function getPartnersInPeriod(
  periods: OwnershipPeriod[],
  fromDate: ISODate,
  toDate: ISODate
): string[] {
  const names = new Set<string>()
  periods.forEach(p => {
    const startsBeforeEnd = p.effectiveFrom < toDate
    const endsAfterStart =
      p.effectiveTo === null || p.effectiveTo > fromDate
    if (startsBeforeEnd && endsAfterStart) {
      names.add(p.partnerName)
    }
  })
  return Array.from(names)
}

/**
 * Get the complete ownership snapshot as of a specific date.
 * Returns a map of { partnerName → ownershipPct } summing to 100.
 */
export function getOwnershipSnapshot(
  periods: OwnershipPeriod[],
  asOfDate: ISODate
): Map<string, number> {
  const snapshot = new Map<string, number>()
  periods.forEach(p => {
    if (
      p.effectiveFrom <= asOfDate &&
      (p.effectiveTo === null || p.effectiveTo > asOfDate)
    ) {
      snapshot.set(p.partnerName, p.ownershipPct)
    }
  })
  return snapshot
}

/**
 * Close an ownership period (set effectiveTo) for a given partner.
 * Returns a new period — does NOT mutate.
 * Used when a partner exits or adjusts their ownership.
 */
export function closeOwnershipPeriod(
  period: OwnershipPeriod,
  effectiveTo: ISODate
): OwnershipPeriod {
  if (period.effectiveTo !== null && period.effectiveTo <= effectiveTo) {
    throw new Error(
      `Cannot close ownership period for ${period.partnerName}: ` +
      `effectiveTo (${effectiveTo}) must be after current effectiveTo (${period.effectiveTo}).`
    )
  }
  return { ...period, effectiveTo }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate that at every point in time, the ownership percentages sum to 100.
 * And that there are no gaps (unmapped periods) for any partner.
 *
 * Collects all unique dates from all periods and checks the sum at each transition.
 */
export function validateNoGapsOrOverlaps(
  entityId: string,
  periods: OwnershipPeriod[]
): ValidationResult<OwnershipPeriod[]> {
  const errors: ValidationError[] = []

  // Collect all unique effective dates
  const allDates = new Set<string>()
  periods.forEach(p => {
    allDates.add(p.effectiveFrom)
    if (p.effectiveTo) allDates.add(p.effectiveTo)
  })

  const sortedDates = Array.from(allDates).sort()

  for (const date of sortedDates) {
    const snapshot = getOwnershipSnapshot(periods, date)
    const total = Array.from(snapshot.values()).reduce((sum, pct) => sum + pct, 0)

    // Allow rounding tolerance of 0.01%
    if (Math.abs(total - 100) > 0.01 && total > 0) {
      errors.push({
        field: `ownershipPct@${date}`,
        rule: 'must-sum-to-100',
        message:
          `Ownership percentages for entity ${entityId} on ${date} sum to ${total.toFixed(2)}%, ` +
          `not 100%. Partners: ${JSON.stringify(Object.fromEntries(snapshot))}`,
      })
    }
  }

  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, value: periods }
}

/**
 * Validate a single ownership period record.
 */
export function validateOwnershipPeriod(
  period: OwnershipPeriod
): ValidationResult<OwnershipPeriod> {
  const errors: ValidationError[] = []

  if (!period.entityId) {
    errors.push({ field: 'entityId', rule: 'required', message: 'entityId is required.' })
  }
  if (!period.partnerName) {
    errors.push({ field: 'partnerName', rule: 'required', message: 'partnerName is required.' })
  }
  if (
    typeof period.ownershipPct !== 'number' ||
    period.ownershipPct < 0 ||
    period.ownershipPct > 100
  ) {
    errors.push({
      field: 'ownershipPct',
      rule: 'range-0-100',
      message: 'ownershipPct must be between 0 and 100.',
    })
  }
  if (!period.effectiveFrom || !/^\d{4}-\d{2}-\d{2}$/.test(period.effectiveFrom)) {
    errors.push({
      field: 'effectiveFrom',
      rule: 'iso-date',
      message: 'effectiveFrom must be a valid ISO date (YYYY-MM-DD).',
    })
  }
  if (
    period.effectiveTo !== null &&
    period.effectiveTo !== undefined &&
    !/^\d{4}-\d{2}-\d{2}$/.test(period.effectiveTo)
  ) {
    errors.push({
      field: 'effectiveTo',
      rule: 'iso-date-or-null',
      message: 'effectiveTo must be a valid ISO date or null.',
    })
  }
  if (
    period.effectiveTo !== null &&
    period.effectiveTo !== undefined &&
    period.effectiveTo <= period.effectiveFrom
  ) {
    errors.push({
      field: 'effectiveTo',
      rule: 'must-be-after-effectiveFrom',
      message: `effectiveTo (${period.effectiveTo}) must be after effectiveFrom (${period.effectiveFrom}).`,
    })
  }
  if (!period.sourceEventId) {
    errors.push({
      field: 'sourceEventId',
      rule: 'required',
      message:
        'sourceEventId is required. Ownership periods must be traceable to a lifecycle event.',
    })
  }

  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, value: period }
}
