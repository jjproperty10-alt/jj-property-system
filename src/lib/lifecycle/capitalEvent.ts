/**
 * @module lifecycle/capitalEvent
 * @description Immutable Capital Ledger — all capital movements across a property's lifecycle.
 *
 * LEDGER RULES (from ADR Principle 4):
 *  - Capital events cannot be edited or deleted silently.
 *  - Corrections use: void original → create replacement (supersedesEventId).
 *  - All reports read from getActiveLedger() (voided = false).
 *  - businessSource is mandatory for every confirmed entry.
 *
 * NEVER INFER (from ADR Principle 2):
 *  - Capital Paid ≠ Required Entry Capital
 *  - Track what actually moved (capital_payment events), separately from what was agreed (PartnerEntry).
 *
 * @see ADR_M8_INVESTMENT_LIFECYCLE.md — Immutable Capital Ledger
 */

import type {
  LifecycleEventBase,
  CapitalEventType,
  CapitalDirection,
  BusinessSource,
  ISODate,
  ISODateTime,
  ValidationResult,
  ValidationError,
  BusinessFactStatus,
} from './types'
import {
  createLifecycleEventBase,
  validateLifecycleEventBase,
} from './lifecycleEvent'

// ---------------------------------------------------------------------------
// Type
// ---------------------------------------------------------------------------

export interface CapitalEvent extends LifecycleEventBase {
  /** Amount in EUR */
  amountEur: number

  /** 'in' = capital entering JJ/property; 'out' = capital exiting */
  direction: CapitalDirection

  /** The counterparty to this transaction (partner name, buyer, bank, etc.) */
  counterparty: string

  /**
   * Optional link to the business event this capital event fulfills.
   * For a capital_payment: links to the PartnerEntry's id.
   * For a capital_contribution: links to a capital_call event id.
   */
  linkedEventId?: string

  /**
   * Whether this event has been voided.
   * Voided events are excluded from all reports but remain in the DB as audit trail.
   */
  readonly isVoided: boolean
}

// ---------------------------------------------------------------------------
// Factory Parameters
// ---------------------------------------------------------------------------

export interface CreateCapitalEventParams {
  id: string
  entityId: string
  eventType: CapitalEventType
  effectiveDate: ISODate
  amountEur: number
  direction: CapitalDirection
  counterparty: string
  linkedEventId?: string
  recordedBy: string
  businessSource: BusinessSource
  status?: BusinessFactStatus
  /** Link this event to the event it supersedes (set automatically by createReplacementCapitalEvent). */
  supersedesEventId?: string
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createCapitalEvent(
  params: CreateCapitalEventParams
): CapitalEvent {
  const base = createLifecycleEventBase({
    id: params.id,
    entityId: params.entityId,
    eventType: params.eventType,
    eventNature: 'accounting_event',
    effectiveDate: params.effectiveDate,
    recordedBy: params.recordedBy,
    status: params.status ?? 'pending_verification',
    businessSource: params.businessSource,
    supersedesEventId: params.supersedesEventId,
  })

  return {
    ...base,
    amountEur: params.amountEur,
    direction: params.direction,
    counterparty: params.counterparty,
    linkedEventId: params.linkedEventId,
    isVoided: false,
  }
}

// ---------------------------------------------------------------------------
// Immutable Ledger Operations
// ---------------------------------------------------------------------------

/**
 * Void a capital event. Returns a new voided copy — does NOT mutate.
 *
 * After voiding, create a replacement event using createCapitalEvent()
 * with { supersedesEventId: original.id } to complete the correction.
 */
export function voidCapitalEvent(
  event: CapitalEvent,
  reason: string,
  voidedBy: string
): CapitalEvent {
  if (event.isVoided) {
    throw new Error(
      `Cannot void an already-voided capital event: ${event.id}. ` +
      `Original void reason: ${event.voidReason}`
    )
  }
  return {
    ...event,
    status: 'void' as BusinessFactStatus,
    isVoided: true,
    voidReason: reason,
    voidedAt: new Date().toISOString() as ISODateTime,
    voidedBy,
  }
}

/**
 * Create a replacement capital event that supersedes a voided one.
 * Links the new event to the voided event via supersedesEventId.
 *
 * The replacement can change any field — typically amount, date, or businessSource.
 */
export function createReplacementCapitalEvent(
  voidedEvent: CapitalEvent,
  correctedParams: Omit<CreateCapitalEventParams, 'id'> & { id: string }
): CapitalEvent {
  if (!voidedEvent.isVoided) {
    throw new Error(
      `Cannot create replacement for non-voided event: ${voidedEvent.id}. ` +
      `Void the original first, then create the replacement.`
    )
  }
  return createCapitalEvent({
    ...correctedParams,
    id: correctedParams.id,
    supersedesEventId: voidedEvent.id,  // Auto-link replacement to its voided predecessor
  })
}

// ---------------------------------------------------------------------------
// Ledger Queries
// ---------------------------------------------------------------------------

/**
 * Returns only active (non-voided) capital events.
 * This is the "active ledger" that all reports must read.
 */
export function getActiveLedger(events: CapitalEvent[]): CapitalEvent[] {
  return events.filter(e => !e.isVoided)
}

/**
 * Sum all capital payments for a specific partner (direction: 'in').
 * Used to compute capitalPaid for a PartnerEntry.
 *
 * Only counts confirmed + active events.
 * Filters to: eventType = 'capital_payment', counterparty = partnerName.
 */
export function sumCapitalPaid(
  events: CapitalEvent[],
  partnerName: string
): number {
  return getActiveLedger(events)
    .filter(
      e =>
        e.eventType === 'capital_payment' &&
        e.direction === 'in' &&
        e.counterparty === partnerName &&
        (e.status === 'confirmed' || e.status === 'pending_verification')
    )
    .reduce((sum, e) => sum + e.amountEur, 0)
}

/**
 * Sum all capital contributions (beyond required entry capital) for a partner.
 * Filters to: eventType = 'capital_contribution'.
 */
export function sumCapitalContributions(
  events: CapitalEvent[],
  partnerName: string
): number {
  return getActiveLedger(events)
    .filter(
      e =>
        e.eventType === 'capital_contribution' &&
        e.direction === 'in' &&
        e.counterparty === partnerName &&
        (e.status === 'confirmed' || e.status === 'pending_verification')
    )
    .reduce((sum, e) => sum + e.amountEur, 0)
}

/**
 * Sum all distributions paid to a partner (direction: 'out', type: 'profit_distribution').
 */
export function sumDistributionsPaid(
  events: CapitalEvent[],
  partnerName: string
): number {
  return getActiveLedger(events)
    .filter(
      e =>
        e.eventType === 'profit_distribution' &&
        e.direction === 'out' &&
        e.counterparty === partnerName &&
        e.status === 'confirmed'
    )
    .reduce((sum, e) => sum + e.amountEur, 0)
}

/**
 * Get all capital events linked to a specific partner entry.
 * Used to show the payment timeline for a PartnerEntry.
 */
export function getEventsForPartnerEntry(
  events: CapitalEvent[],
  partnerEntryId: string
): CapitalEvent[] {
  return getActiveLedger(events).filter(e => e.linkedEventId === partnerEntryId)
}

/**
 * Compute the net capital balance for a partner across all event types.
 * in - out (excluding internal JJ transfers)
 */
export function computePartnerNetCapital(
  events: CapitalEvent[],
  partnerName: string
): number {
  return getActiveLedger(events)
    .filter(
      e =>
        e.counterparty === partnerName &&
        (e.status === 'confirmed' || e.status === 'pending_verification')
    )
    .reduce((sum, e) => {
      return e.direction === 'in' ? sum + e.amountEur : sum - e.amountEur
    }, 0)
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export function validateCapitalEvent(
  event: CapitalEvent
): ValidationResult<CapitalEvent> {
  const baseResult = validateLifecycleEventBase(event)
  if (!baseResult.ok) return { ok: false, errors: baseResult.errors }

  const errors: ValidationError[] = []

  if (typeof event.amountEur !== 'number' || event.amountEur < 0) {
    errors.push({
      field: 'amountEur',
      rule: 'non-negative-number',
      message: 'amountEur must be zero or positive. Use direction field for sign.',
    })
  }

  if (event.direction !== 'in' && event.direction !== 'out') {
    errors.push({
      field: 'direction',
      rule: 'must-be-in-or-out',
      message: 'direction must be "in" or "out".',
    })
  }

  if (!event.counterparty || event.counterparty.trim().length === 0) {
    errors.push({
      field: 'counterparty',
      rule: 'required',
      message: 'counterparty is required. Record who this capital movement involves.',
    })
  }

  // Void state consistency
  if (event.isVoided && event.status !== 'void') {
    errors.push({
      field: 'isVoided',
      rule: 'must-match-status',
      message: 'isVoided = true requires status = "void".',
    })
  }
  if (!event.isVoided && event.status === 'void') {
    errors.push({
      field: 'status',
      rule: 'must-match-isVoided',
      message: 'status = "void" requires isVoided = true.',
    })
  }

  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, value: event }
}
