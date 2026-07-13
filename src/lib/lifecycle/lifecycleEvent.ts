/**
 * @module lifecycle/lifecycleEvent
 * @description Base lifecycle event utilities: factory, type guards, filters.
 *
 * All lifecycle entities extend LifecycleEventBase.
 * This module provides the shared operations that work on any of them.
 */

import type {
  LifecycleEventBase,
  BusinessFactStatus,
  CapitalEventType,
  EventNature,
  BusinessSource,
  ISODate,
  ISODateTime,
  ValidationResult,
  ValidationError,
} from './types'

// ---------------------------------------------------------------------------
// Type Guards
// ---------------------------------------------------------------------------

export function isConfirmedEvent(event: LifecycleEventBase): boolean {
  return event.status === 'confirmed'
}

export function isVoidedEvent(event: LifecycleEventBase): boolean {
  return event.status === 'void'
}

export function isDraftEvent(event: LifecycleEventBase): boolean {
  return event.status === 'draft'
}

export function isPendingVerification(event: LifecycleEventBase): boolean {
  return event.status === 'pending_verification'
}

export function isActiveEvent(event: LifecycleEventBase): boolean {
  return event.status !== 'void'
}

export function isBusinessEvent(event: LifecycleEventBase): boolean {
  return event.eventNature === 'business_event'
}

export function isAccountingEvent(event: LifecycleEventBase): boolean {
  return event.eventNature === 'accounting_event'
}

export function isReplacementEvent(event: LifecycleEventBase): boolean {
  return event.supersedesEventId !== undefined
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

/**
 * Returns only active (non-voided) events.
 * This is the "active ledger" filter that all reports should apply.
 */
export function getActiveEvents<T extends LifecycleEventBase>(events: T[]): T[] {
  return events.filter(isActiveEvent)
}

/**
 * Returns events of a specific type from a mixed event list.
 */
export function getEventsByType<T extends LifecycleEventBase>(
  events: T[],
  eventType: CapitalEventType
): T[] {
  return events.filter(e => e.eventType === eventType)
}

/**
 * Returns only confirmed events (backed by a verified source).
 * Use this when computing financial positions.
 */
export function getConfirmedEvents<T extends LifecycleEventBase>(events: T[]): T[] {
  return events.filter(isConfirmedEvent)
}

/**
 * Sort events by effective date ascending (earliest first).
 * For chronological timeline views.
 */
export function sortByEffectiveDate<T extends LifecycleEventBase>(events: T[]): T[] {
  return [...events].sort((a, b) =>
    a.effectiveDate.localeCompare(b.effectiveDate)
  )
}

/**
 * Filter events to those effective on or before a given date.
 * Used for "as of" snapshots.
 */
export function getEventsAsOf<T extends LifecycleEventBase>(
  events: T[],
  asOfDate: ISODate
): T[] {
  return events.filter(e => e.effectiveDate <= asOfDate)
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export interface CreateLifecycleEventParams {
  id: string
  entityId: string
  eventType: CapitalEventType
  eventNature: EventNature
  effectiveDate: ISODate
  recordedBy: string
  status: BusinessFactStatus
  businessSource: BusinessSource
  supersedesEventId?: string
}

/**
 * Create the base fields for any lifecycle event.
 * Specific event factories (createAcquisition, createPartnerEntry, etc.)
 * call this first, then add their own fields.
 */
export function createLifecycleEventBase(
  params: CreateLifecycleEventParams
): LifecycleEventBase {
  return {
    id: params.id,
    entityId: params.entityId,
    eventType: params.eventType,
    eventNature: params.eventNature,
    effectiveDate: params.effectiveDate,
    recordedAt: new Date().toISOString() as ISODateTime,
    recordedBy: params.recordedBy,
    status: params.status,
    businessSource: params.businessSource,
    supersedesEventId: params.supersedesEventId,
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate the base fields common to all lifecycle events.
 * Called by each specific entity validator before its own checks.
 */
export function validateLifecycleEventBase(
  event: LifecycleEventBase
): ValidationResult<LifecycleEventBase> {
  const errors: ValidationError[] = []

  if (!event.id || event.id.trim().length === 0) {
    errors.push({ field: 'id', rule: 'required', message: 'id is required.' })
  }

  if (!event.entityId || event.entityId.trim().length === 0) {
    errors.push({ field: 'entityId', rule: 'required', message: 'entityId is required.' })
  }

  if (!event.effectiveDate || !/^\d{4}-\d{2}-\d{2}$/.test(event.effectiveDate)) {
    errors.push({
      field: 'effectiveDate',
      rule: 'iso-date',
      message: 'effectiveDate must be a valid ISO date (YYYY-MM-DD).',
    })
  }

  if (!event.recordedBy || event.recordedBy.trim().length === 0) {
    errors.push({ field: 'recordedBy', rule: 'required', message: 'recordedBy is required.' })
  }

  if (event.status === 'confirmed') {
    if (!event.businessSource?.reference || event.businessSource.reference.trim().length < 3) {
      errors.push({
        field: 'businessSource.reference',
        rule: 'required-for-confirmed',
        message:
          'A confirmed event must have a specific businessSource.reference. ' +
          'Provide the document name, date, or transfer reference that proves this fact.',
      })
    }
  }

  if (event.status === 'void') {
    if (!event.voidReason || event.voidReason.trim().length === 0) {
      errors.push({
        field: 'voidReason',
        rule: 'required-for-void',
        message: 'A voided event must include a voidReason explaining why it was voided.',
      })
    }
    if (!event.voidedBy) {
      errors.push({
        field: 'voidedBy',
        rule: 'required-for-void',
        message: 'A voided event must record who voided it.',
      })
    }
  }

  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, value: event }
}

// ---------------------------------------------------------------------------
// Void-and-Replace (base implementation)
// ---------------------------------------------------------------------------

/**
 * Mark a lifecycle event as voided.
 * Returns a new voided copy — does NOT mutate the original.
 *
 * Next step: create a replacement event that references this voided event's id
 * via supersedesEventId.
 */
export function voidLifecycleEvent<T extends LifecycleEventBase>(
  event: T,
  reason: string,
  voidedBy: string
): T {
  if (event.status === 'void') {
    throw new Error(
      `Cannot void an already-voided event: ${event.id}. ` +
      `Original void reason: ${event.voidReason}`
    )
  }
  return {
    ...event,
    status: 'void' as BusinessFactStatus,
    voidReason: reason,
    voidedAt: new Date().toISOString() as ISODateTime,
    voidedBy,
  }
}
