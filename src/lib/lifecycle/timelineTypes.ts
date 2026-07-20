/**
 * @module lifecycle/timelineTypes
 * @description Channel-neutral DTOs for the M9-A Investment Timeline Read Model.
 *
 * These types represent an investor's journey as a read-only, ordered projection.
 * They are NEVER used to write business facts or infer values.
 *
 * Flow:
 *   lifecycle tables -> timelineService -> InvestmentTimelineDTO -> UI / API
 *
 * @see M9-A Investment Timeline Read Model
 * @see P-ARCH-1: Unknown = NULL. Never 0 or placeholder.
 * @see P-ARCH-6: Partner route never exposes jj_* fields.
 */

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** Nature of a lifecycle event (mirrors the DB event_nature column) */
export type TimelineEventNature =
  | 'business_event'    // legal/commercial reality - agreement, acquisition
  | 'accounting_event'  // financial movement - payment, distribution
  | 'reporting_event'   // derived output - statement, settlement

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

/**
 * View mode for the Investment Timeline.
 *
 * 'partner' -- default for all /owner/[owner]/[property]/timeline URLs.
 *              Visibility is resolved server-side before the DTO reaches the UI.
 *              partnerDescription and dateDisplay are sanitized.
 *
 * 'admin'   -- JJ internal use only. adminDescription (raw notes) is available.
 *              Reserved for future authorized JJ admin routes.
 */
export type TimelineViewMode = 'partner' | 'admin'

/**
 * Display status of a date field.
 *
 * 'confirmed'            -- date is available and verified/usable.
 * 'pending_verification' -- date exists in the DB but is unverified (placeholder risk).
 *                           UI must show "Date pending verification" -- NOT the raw date.
 * 'unknown'              -- date is null; no value to display.
 */
export type TimelineDateStatus = 'confirmed' | 'pending_verification' | 'unknown'

// ---------------------------------------------------------------------------
// Single Timeline Event DTO
// ---------------------------------------------------------------------------

export interface InvestmentTimelineEventDTO {
  /** Row UUID from the source lifecycle table */
  eventId: string
  /** Same as eventId - canonical identifier for dedup and ordering stability */
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

  /** When this record was entered into the system (ISO datetime) */
  recordedAt: string
  /** Computed human-readable English title */
  title: string
  /**
   * Optional description or context from the source record.
   * @deprecated Use partnerDescription (partner mode) or adminDescription (admin mode).
   *             This field is kept for backward compatibility and equals adminDescription.
   */
  description: string | null

  // ---- Partner-safe display fields (computed by timelineVisibility) ---------

  /**
   * Clean title for partner view.
   * Identical to title in current implementation.
   */
  partnerTitle: string

  /**
   * Partner-safe description. Guaranteed to contain no internal notes,
   * placeholder language, or forbidden keywords.
   *
   * null when:
   *   - source description is null AND no structured safe description exists
   *   - event is internal-only (no partner-facing description)
   *
   * Generated from structured fields (eventType, eventSubtype, payeeName)
   * when the raw description contains forbidden content.
   */
  partnerDescription: string | null

  /**
   * Full internal note from the DB (capital_event.notes / partner_entry.entry_date_note).
   * NEVER rendered in partner-facing UI. Available in admin mode only.
   */
  adminDescription: string | null

  /**
   * Human-readable date string (ISO: YYYY-MM-DD) for display.
   * null when dateStatus is 'pending_verification' or 'unknown'.
   *
   * The UI MUST use this field, NOT effectiveDate, to prevent placeholder
   * dates (e.g. 2024-01-01) from leaking into partner-facing views.
   */
  dateDisplay: string | null

  /**
   * Display status of the date field.
   * 'confirmed'            -- display dateDisplay as-is
   * 'pending_verification' -- show "Date pending verification" label
   * 'unknown'              -- show nothing or a dash
   */
  dateStatus: TimelineDateStatus

  /** EUR amount where applicable (always positive; direction in title/eventSubtype) */
  amount: number | null
  /** Currency code - always 'EUR' in current implementation */
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
   * Always null in M9-A - requires Settlement Engine integration (M9-C scope).
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

// ---------------------------------------------------------------------------
// Verification Task Item  (F3 — DTO v1.1)
// ---------------------------------------------------------------------------

/**
 * A single open verification task for a lifecycle event.
 *
 * Sourced from lifecycle.verification_tasks
 * (status IN ('pending', 'evidence_found')).
 *
 * Design:
 * - taskId / sourceId / sourceTable are internal identifiers — NEVER rendered in UI.
 * - humanLabel is computed server-side and is safe for partner-facing display.
 * - relatedAmountEur is populated from the source capital_event row when available.
 *
 * @see P-ARCH-6: Partner route never exposes jj_* fields or internal identifiers.
 */
export interface VerificationTaskItem {
  /** lifecycle.verification_tasks.id — internal, NEVER shown in UI */
  readonly taskId: string
  readonly priority: 'high' | 'medium' | 'low'
  /** Source lifecycle table name — internal, NEVER shown in UI as-is */
  readonly sourceTable: string
  /** UUID of source record — internal, NEVER shown in UI */
  readonly sourceId: string
  /** DB column name that needs verification (e.g. 'effective_date', 'amount_eur') */
  readonly missingField: string
  /**
   * Human-readable label safe for partner-facing display.
   * Derived server-side from missingField + relatedAmountEur.
   * Never contains UUIDs or internal table names.
   * Examples:
   *   "Payment date pending confirmation (€250,000)"
   *   "Entry date pending confirmation"
   */
  readonly humanLabel: string
  /** EUR amount of related capital_event when source is a capital event; null otherwise */
  readonly relatedAmountEur: number | null
}

// ---------------------------------------------------------------------------
// Full Investment Timeline DTO
// ---------------------------------------------------------------------------

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

  /**
   * View mode resolved server-side before the DTO reaches the UI.
   * 'partner' = default for all /owner/[owner]/[property]/timeline routes.
   * 'admin'   = reserved for authorized JJ admin routes (not yet implemented).
   */
  viewMode: TimelineViewMode

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
    /** Operations settlement balance - Null in M9-A (requires Settlement Engine) */
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
    /** Count of open verification tasks (convenience; equals verificationTaskItems.length) */
    openVerificationTasks: number
    /** True if any event has effectiveDateConfidence = 'pending_verification' */
    hasPendingDates: boolean
    /**
     * Full task row data from lifecycle.verification_tasks.
     * Each item has a humanLabel safe for partner display.
     * NEVER expose taskId, sourceId, or sourceTable directly in the UI.
     */
    verificationTaskItems: readonly VerificationTaskItem[]
  }

  /** ISO datetime when this DTO was assembled */
  generatedAt: string
}

/**
 * Timeline ordering rules - documented here so UI and tests reference
 * the same source of truth.
 */
export const TIMELINE_ORDERING_RULES = [
  '1. Events with effectiveDate != null sort before null-date events',
  '2. effectiveDate ASC within the dated group',
  '3. recordedAt ASC as secondary key',
  '4. canonicalEventId ASC (UUID) as deterministic tie-breaker',
] as const
