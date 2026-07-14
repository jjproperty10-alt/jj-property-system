/**
 * @module lifecycle/timelineTypes
 * @description Channel-neutral DTOs for the M9-A Investment Timeline Read Model.
 *
 * These types represent an investor's journey as a read-only, ordered projection.
 * They are NEVER used to write business facts or infer values.
 *
 * Flow:
 *   lifecycle tables â timelineService â InvestmentTimelineDTO â UI / API
 *
 * @see M9-A Investment Timeline Read Model
 * @see P-ARCH-1: Unknown = NULL. Never 0 or placeholder.
 * @see P-ARCH-6: Partner route never exposes jj_* fields.
 */

// âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
// Primitives
// âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

/** Nature of a lifecycle event (mirrors the DB event_nature column) */
export type TimelineEventNature =
  | 'business_event'    // legal/commercial reality â agreement, acquisition
  | 'accounting_event'  // financial movement â payment, distribution
  | 'reporting_event'   // derived output â statement, settlement

/**
 * Confidence level for a date field.
 * Mirrors lifecycle.capital_event.effective_date_confidence and
 * lifecycle.ownership_period.effective_from_confidence.
 *
 * P-ARCH-1: null date + pending_verification = honest unknown.
 * NEVER coerce to a placeholder date.
 */
export type TimelineDateConfidence =
  | 'confirmed'
  | 'estimated'
  | 'pending_verification'

// âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
// Single Timeline Event DTO
// âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

export interface InvestmentTimelineEventDTO {
  /** Row UUID from the source lifecycle table */
  eventId: string
  /** Same as eventId â canonical identifier for dedup and ordering stability */
  canonicalEventId: string
  /** UUID of the investor entity in lifecycle.entity_identity */
  entityId: string
  /** Canonical property name (matches lifecycle.partner_entry.property_name) */
  propertyName: string
  /** Canonical investor name */
  investorName: string

  /** Source table: 'partner_entry' | 'capital_event' | 'ownership_period' */
  eventType: string
  /** Event subtype (e.g. 'partner_entry_payment', 'distribution_payment') */
  eventSubtype: string | null
  /** Nature of the event */
  eventNature: TimelineEventNature

  /**
   * Legally effective date of the event (ISO date string: YYYY-MM-DD).
   * null = unknown. P-ARCH-1: never replaced with a placeholder.
   */
  effectiveDate: string | null
  /** Confidence in effectiveDate */
  effectiveDateConfidence: TimelineDateConfidence

  /** When this record was entered into the systent (ISO datetime) */
  recordedAt: string
  /** Computed human-readable English title */
  title: string
  /** Optional description or context from the source record */
  description: string | null

  /** EUR amount where applicable (always positive; direction in title/eventSubtype) */
  amount: number | null
  /** Currency code â always 'EUR' in current implementation */
  currency: string | null

  /** Ownership % BEFORE this event (null if not an ownership-change event) */
  ownershipPctBefore: number | null
  /** Ownership % AFTER this event (set for ownership_period events) */
  ownershipPctAfter: number | null

  /**
   * Running total of capital paid by this investor AFTER this event.
   * Accumulates only for inflow capital payments (partner_entry_payment,
   * partner_acquisition_payment). null for all other event types.
   */
  capitalPositionAfter: number | null

  /**
   * Operations settlement balance after this event.
   * Always null in M9-A â requires Settlement Engine integration (M9-C scope).
   */
  settlementPositionAfter: number | null

  /** Lifecycle status of this event ('confirmed' | 'pending_verification' | 'draft') */
  status: string

  /**
   * Partner-visible source type label (e.g. 'Bank Transfer', 'Partnership Agreement').
   * null when source is unavailable or restricted.
   */
  sourceLabel: string | null

  /**
   * Partner-visible source reference. Always null in M9-A.
   * (business_source.reference may contain internal identifiers.)
   */
  sourceReference: string | null

  /** Whether this event is shown in the partner-facing timeline */
  partnerVisible: boolean
}

// âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
// Full Investment Timeline DTO
// âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

export interface InvestmentTimelineDTO {
  investor: {
    entityId: string
    name: string
    ownerType: string
  }

  property: {
    propertyName: string
    /** Derived from entry_status in v_partner_investment_statement */
    lifecycleStatus: string
  }

  summary: {
    /** Current ownership percentage from the active ownership_period */
    currentOwnershipPct: number | null
    /** Agreed entry valuation in EUR (null = unknown, P-ARCH-1) */
    agreedEntryValuation: number | null
    /** Required entry capital in EUR (null = unknown) */
    requiredCapital: number | null
    /**
     * Total capital paid by investor (null = unknown, NOT zero).
     * P-ARCH-1: never coerce null to 0.
     */
    capitalPaid: number | null
    /**
     * Capital still owed by investor (null = unknown, NOT zero).
     * P-ARCH-1: never coerce null to 0.
     */
    capitalRemaining: number | null
    /** Total distributions received by investor */
    totalDistributionsPaid: number
    /** Operations settlement balance â Null in M9-A (requires Settlement Engine) */
    currentSettlementBalance: number | null
    /** Always 'EUR' */
    currency: string
  }

  /**
   * Ordered list of non-void lifecycle events for this investor+property.
   * Ordering rules (enforced by projectTimeline):
   *   1. Events WITH effectiveDate before events without (nulls last)
   *   2. effectiveDate ASC within the dated group
   *   3. recordedAt ASC as secondary key
   *   4. canonicalEventId (UUID) as deterministic tie-breaker
   */
  events: InvestmentTimelineEventDTO[]

  evidence: {
    /** Number of lifecycle.verification_tasks with status IN ('pending','evidence_found') */
    openVerificationTasks: number
    /** True if any event has effectiveDateConfidence = 'pending_verification' */
    hasPendingDates: boolean
  }

  /** ISO datetime when this DTO was assembled */
  generatedAt: string
}

/**
 * Timeline ordering rules â documented here so UI and tests reference
 * the same source of truth.
 */
export const TIMELINE_ORDERING_RULES = [
  '1. Events with effectiveDate != null sort before null-date events',
  '2. effectiveDate ASC within the dated group',
  '3. recordedAt ASC as secondary key',
  '4. canonicalEventId ASC (UUID) as deterministic tie-breaker',
] as const
