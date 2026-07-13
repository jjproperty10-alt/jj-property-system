/**
 * @module lifecycle/types
 * @description Core type definitions for the Investment Lifecycle domain.
 *
 * PRINCIPLES:
 *  - All types are pure domain types — no DB, no HTTP, no Next.js.
 *  - businessSource is mandatory on all confirmed facts.
 *  - "Never Infer" invariants are enforced in validation.ts, not at the type level,
 *    because two independent numbers can legally be equal by coincidence.
 *
 * @see ADR_M8_INVESTMENT_LIFECYCLE.md
 */

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** ISO-8601 date string: YYYY-MM-DD */
export type ISODate = string

/** ISO-8601 datetime string: YYYY-MM-DDTHH:MM:SS.sssZ */
export type ISODateTime = string

/** Supported currencies. EUR is the primary operating currency. */
export type Currency = 'EUR' | 'USD' | 'GBP'

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

/**
 * Lifecycle stage of any recorded business fact.
 *
 * draft               → entered but not reviewed
 * pending_verification → awaiting source document confirmation
 * confirmed           → backed by a cited, verified business source
 * void                → superseded or incorrect; audit trail preserved
 */
export type BusinessFactStatus =
  | 'draft'
  | 'pending_verification'
  | 'confirmed'
  | 'void'

// ---------------------------------------------------------------------------
// Event Classification
// ---------------------------------------------------------------------------

/**
 * Fundamental nature of a lifecycle record.
 *
 * business_event   → a legal or commercial reality (exists outside the system)
 * accounting_event → a financial movement (bank transfer, payment, BPO)
 * reporting_event  → a computed output (statement, settlement, report)
 *
 * Business events are facts.
 * Accounting events are records of cash flow.
 * Reporting events are derived views.
 * No reporting event should ever modify a business or accounting event.
 */
export type EventNature =
  | 'business_event'
  | 'accounting_event'
  | 'reporting_event'

// ---------------------------------------------------------------------------
// Capital Event Types
// ---------------------------------------------------------------------------

/**
 * All capital event types across the Investment Lifecycle.
 * Maps directly to the approved domain model in the ADR.
 */
export type CapitalEventType =
  // Property Lifecycle events
  | 'original_acquisition'     // JJ purchases the property
  | 'disposition'              // Property sold, transferred, or exited

  // Investment Lifecycle — entry and exit
  | 'partner_entry'            // Partner joins with agreed valuation and %
  | 'partial_exit'             // Partner sells significant stake, remains minority
  | 'full_exit'                // Partner exits completely

  // Investment Lifecycle — capital movements
  | 'capital_contribution'     // Additional capital injected (beyond required entry)
  | 'capital_payment'          // Installment toward required entry capital
  | 'capital_withdrawal'       // Partner withdraws capital (not a full exit)
  | 'capital_call'             // JJ calls additional capital from partner

  // Investment Lifecycle — ownership changes
  | 'ownership_increase'       // Partner acquires additional %
  | 'ownership_decrease'       // Partner sells partial %

  // Investment Lifecycle — financial flows
  | 'profit_distribution'      // JJ distributes profits to partner
  | 'loss_allocation'          // Loss allocated to partner's account

  // Structural
  | 'refinancing'              // Debt restructure affecting capital stack

// ---------------------------------------------------------------------------
// Business Source — Principle 3: "Every fact must answer: from which source?"
// ---------------------------------------------------------------------------

/**
 * Documents the origin of a recorded business fact.
 * Required on all confirmed lifecycle events and partner entry facts.
 *
 * This field answers: "From which source was this value obtained?"
 * Without it, the system cannot defend any value to a partner or auditor.
 */
export interface BusinessSource {
  /** Category of the source document or action */
  sourceType:
    | 'signed_agreement'      // Partnership agreement, purchase contract
    | 'bank_transfer'         // Bank statement, SWIFT confirmation
    | 'notary_deed'           // Notary-certified legal document
    | 'invoice'               // Commercial invoice
    | 'board_resolution'      // Formal resolution / decision record
    | 'email_confirmation'    // Written email confirmation (lower evidentiary weight)
    | 'manual_approval'       // Approved manually by authorized person
    | 'other'                 // Must include explanation in notes

  /** Specific reference: "Partnership Agreement 2022-06-01" / "IBAN-XXX transfer 2022-06-15" */
  reference: string

  /** Optional: document storage ID or URL */
  documentId?: string

  /** Who verified this source */
  verifiedBy?: string

  /** When verification occurred */
  verifiedAt?: ISODateTime

  /** Additional context */
  notes?: string
}

// ---------------------------------------------------------------------------
// Base Lifecycle Event — all entities extend this
// ---------------------------------------------------------------------------

/**
 * Common fields shared by all lifecycle events.
 * The "envelope" that wraps every recorded business fact.
 */
export interface LifecycleEventBase {
  /** UUID — unique per event */
  id: string

  /** UUID of the property/entity in entity_registry */
  entityId: string

  /** What kind of lifecycle event this is */
  eventType: CapitalEventType

  /** Whether this is a business, accounting, or reporting event */
  eventNature: EventNature

  /** The legally effective date of the event (NOT the recording date) */
  effectiveDate: ISODate

  /** When this record was entered into the system */
  recordedAt: ISODateTime

  /** Who entered this record */
  recordedBy: string

  /** Current status of this fact */
  status: BusinessFactStatus

  /**
   * The business source that proves this fact.
   * Required for status: 'confirmed'.
   * For status: 'draft' | 'pending_verification', may describe what is still needed.
   */
  businessSource: BusinessSource

  /**
   * If this event replaces a voided event, the ID of the voided event.
   * Implements the void-and-replace correction model.
   */
  supersedesEventId?: string

  /**
   * If this event is voided, the reason.
   * Required when status === 'void'.
   */
  voidReason?: string

  /** When this event was voided */
  voidedAt?: ISODateTime

  /** Who voided this event */
  voidedBy?: string
}

// ---------------------------------------------------------------------------
// Immutability Utilities
// ---------------------------------------------------------------------------

/**
 * Deep-readonly type for immutable ledger records.
 * Applied to events after they are confirmed.
 */
export type Immutable<T> = {
  readonly [P in keyof T]: T[P] extends (infer U)[]
    ? ReadonlyArray<Immutable<U>>
    : T[P] extends object
    ? Immutable<T[P]>
    : T[P]
}

/** A confirmed, immutable lifecycle event — no fields may be mutated */
export type ConfirmedEvent<T extends LifecycleEventBase> = Immutable<T> & {
  readonly status: 'confirmed'
}

/** A voided lifecycle event — present in the DB but excluded from active reports */
export type VoidedEvent<T extends LifecycleEventBase> = Immutable<T> & {
  readonly status: 'void'
  readonly voidReason: string
  readonly voidedAt: ISODateTime
  readonly voidedBy: string
}

// ---------------------------------------------------------------------------
// Validation Types
// ---------------------------------------------------------------------------

/** A single validation failure */
export interface ValidationError {
  /** Which field failed */
  field: string

  /** What rule was violated */
  rule: string

  /** Human-readable message */
  message: string

  /**
   * If this is a "Never Infer" violation, which invariant.
   * Named after the ADR's formal invariant list.
   */
  neverInferViolation?: NeverInferInvariant
}

/**
 * The 6 "Never Infer" invariants from the ADR.
 * Each has a named constant so violations can be identified precisely.
 */
export type NeverInferInvariant =
  | 'INV-1:purchase-price-ne-entry-valuation'
  | 'INV-2:capital-paid-ne-required-capital'
  | 'INV-3:ownership-pct-ne-amount-paid'
  | 'INV-4:entry-date-ne-payment-date'
  | 'INV-5:effective-date-ne-signature-date'
  | 'INV-6:profit-start-ne-ownership-effective'

/** Standard result type — either a validated value or a list of errors */
export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: ValidationError[] }

// ---------------------------------------------------------------------------
// Direction (capital flow)
// ---------------------------------------------------------------------------

/** Direction of capital movement relative to the property/JJ */
export type CapitalDirection =
  | 'in'   // Capital entering (partner pays, JJ receives)
  | 'out'  // Capital exiting (JJ pays, partner receives)

// ---------------------------------------------------------------------------
// Disposition types
// ---------------------------------------------------------------------------

export type DispositionType = 'sale' | 'partial_sale' | 'transfer'

// ---------------------------------------------------------------------------
// Re-export: all types in one import
// ---------------------------------------------------------------------------

export type {
  // All exported above — this section is intentionally empty.
  // Import directly from this file: import { LifecycleEventBase, ... } from './types'
}
