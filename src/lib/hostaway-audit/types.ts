/**
 * Hostaway Property Audit — DTO Contracts v2.0
 *
 * Sprint 1: Foundation layer (pure logic + service).
 * Sprint 2: Contract Hardening — date semantics, comparison granularity,
 *           financial authority, locked audit states.
 *
 * Key discovery (Sprint 2 E2E validation):
 *   JJ records Platform Income as PERIOD AGGREGATES (e.g. "1/7/25-31/12/25 = €5,857").
 *   Hostaway records per-RESERVATION (57 confirmed stays for same period).
 *   Reservation-level matching is impossible with current JJ data.
 *   The comparison model must support aggregate-period matching.
 *
 * Data sources:
 *   - pms.canonical_reservations  (Hostaway normalized data)
 *   - pms.canonical_properties    (Hostaway property metadata)
 *   - pms.property_mappings       (Hostaway → JJ property name link)
 *   - pms.raw_reservations        (raw Hostaway financials in JSONB)
 *   - public.transactions         (JJ accounting — Airbnb category only)
 *
 * Payout formula (verified against real DB):
 *   Airbnb:  payout = totalPrice − airbnbListingHostFee
 *            (airbnbExpectedPayoutAmount is authoritative when available)
 *   Booking: payout = totalPrice − channelCommissionAmount (estimate)
 *   Direct:  payout = totalPrice (no platform fee)
 *
 * Business rules (from CLAUDE.md §4):
 *   - Platform Income = net amount to owner after platform deductions
 *   - Cleaning / Management Fee in Airbnb category = tracking only, not deducted again
 *   - Real owner expenses: electricity, water, internet, repairs — only these reduce balance
 */

// ─── Date Semantics (Sprint 2 — locked) ─────────────────────────────────────

/**
 * How the date range filters reservations.
 *
 * DECISION (Sprint 2): Default is 'stay_overlaps'.
 * A reservation is included if any part of its stay overlaps the selected period.
 * This is the correct semantic for a performance screen ("what happened in this period").
 *
 * Other modes exist for specific use cases:
 *   - 'check_in_within': only reservations whose check-in falls within the range
 *   - 'check_out_within': only reservations whose check-out falls within the range
 *   - 'created_within': only reservations created during the range (booking pace)
 */
export type DateFilterMode =
  | 'stay_overlaps'    // Default: any overlap between stay and selected period
  | 'check_in_within'  // Check-in date falls within range
  | 'check_out_within' // Check-out date falls within range
  | 'created_within';  // Reservation creation date within range

// ─── Audit States (Sprint 2 — locked taxonomy) ──────────────────────────────

/**
 * Locked audit state taxonomy. PR #3 UI consumes these directly.
 * Each state has a single unambiguous meaning.
 */
export type AuditMatchState =
  | 'exact'                // Reservation matched to JJ row, amount within €1
  | 'aggregate_match'      // Reservation falls within a JJ period-aggregate row
  | 'probable'             // Amount or date close but not exact
  | 'difference'           // Matched but amounts differ materially
  | 'missing_in_jj'        // Exists in Hostaway, no corresponding JJ record
  | 'missing_in_hostaway'  // Exists in JJ, no corresponding Hostaway reservation
  | 'not_comparable'       // Cannot compare (cancelled, inquiry, owner_stay)
  | 'insufficient_evidence'; // Data exists but confidence too low to determine match

// ─── Enums ───────────────────────────────────────────────────────────────────

/** Reservation status in canonical form */
export type ReservationStatus =
  | 'confirmed'
  | 'cancelled'
  | 'inquiry'
  | 'modified'
  | 'owner_stay'
  | 'unknown';

/** Booking channel in canonical form */
export type BookingChannel =
  | 'airbnb'
  | 'booking'
  | 'direct'
  | 'homeaway'
  | 'other';

/** Direction of a financial difference */
export type DifferenceDirection =
  | 'hostaway_only'   // Exists in Hostaway but not in JJ
  | 'jj_only'         // Exists in JJ but not in Hostaway
  | 'amount_mismatch' // Both exist but amounts differ
  | 'date_mismatch'   // Both exist but dates differ
  | 'status_mismatch'; // Reservation status conflicts with JJ record

/** What kind of financial line item */
export type FinancialLineType =
  | 'platform_income'    // Net payout to owner
  | 'cleaning_fee'       // Cleaning allocation
  | 'management_fee'     // JJ management fee allocation
  | 'host_service_fee'   // Airbnb host fee (deducted by platform)
  | 'channel_commission' // Booking.com commission (deducted by platform)
  | 'tax'                // Tax amount
  | 'other';

/** Overall audit health for a property */
export type AuditHealth =
  | 'clean'       // Period totals match, no material differences
  | 'minor'       // Small differences (< €50 total)
  | 'review'      // Material differences requiring human review
  | 'critical';   // Large unmatched amounts or systematic gaps

// ─── Financial Authority (Sprint 2 — locked) ────────────────────────────────

/**
 * How a financial amount was determined.
 * Every amount in the DTO must declare its source.
 */
export type FinancialSource =
  | 'reported'    // Directly from Hostaway API (e.g. airbnbExpectedPayoutAmount)
  | 'calculated'  // Derived from formula (e.g. totalPrice − airbnbListingHostFee)
  | 'jj_recorded' // From JJ transactions table
  | 'unknown';    // Source cannot be determined

/**
 * A financial amount with its provenance.
 * Every number in the audit must answer: "where did you come from?"
 */
export interface AuthoritativeAmount {
  /** The amount in EUR */
  readonly amount: number | null;
  /** How this amount was determined */
  readonly source: FinancialSource;
  /** Confidence in the amount */
  readonly confidence: 'high' | 'medium' | 'low' | 'none';
  /** If source=calculated, what formula was used */
  readonly calculationNote: string | null;
}

// ─── Reservation Status Financial Rules (Sprint 2 — locked) ────────────────
//
// Which statuses participate in financial aggregation:
//   confirmed  → YES: booking count, gross value, expected payout
//   modified   → YES: same as confirmed (modification preserves revenue)
//   cancelled  → NO: excluded from active totals, reported separately
//   inquiry    → NO: excluded from all financial totals
//   owner_stay → NO: excluded from revenue totals, reported separately (count only)
//   unknown    → NO: excluded unless explicitly classified
//
// This is the SINGLE SOURCE OF TRUTH for status eligibility.

/** Statuses that represent realized/expected revenue */
export const REVENUE_ELIGIBLE_STATUSES: ReadonlySet<ReservationStatus> = new Set<ReservationStatus>([
  'confirmed',
  'modified',
]);

/** Check if a reservation status is eligible for financial aggregation */
export function isRevenueEligible(status: ReservationStatus): boolean {
  return REVENUE_ELIGIBLE_STATUSES.has(status);
}

// ─── Core DTOs ───────────────────────────────────────────────────────────────

/**
 * Financial breakdown from Hostaway for one reservation.
 * All amounts in EUR.
 */
export interface ReservationFinancials {
  /** Gross price charged to guest (includes cleaning) */
  readonly totalPrice: number | null;
  /** Cleaning fee component */
  readonly cleaningFee: number | null;
  /** Airbnb host service fee (deducted from payout). From airbnbListingHostFee. */
  readonly hostServiceFee: number | null;
  /** Booking.com channel commission (deducted from payout) */
  readonly channelCommission: number | null;
  /** Tax amount */
  readonly taxAmount: number | null;
  /** Expected payout with authority chain */
  readonly payout: AuthoritativeAmount;
  /** Base price (totalPrice − cleaningFee). null if inputs missing. */
  readonly basePrice: number | null;

  // ── Legacy compatibility (Sprint 1) ──
  /** @deprecated Use payout.amount instead */
  readonly payoutExpected: number | null;
}

/**
 * One reservation in the audit — Hostaway data + match result.
 */
export interface ReservationAuditDTO {
  // ── Hostaway identity ──
  readonly hostawayReservationId: string;
  readonly hostawayPropertyId: string;
  readonly channel: BookingChannel;
  readonly channelRaw: string | null;
  readonly status: ReservationStatus;

  // ── Stay details ──
  readonly guestName: string | null;
  readonly checkIn: string;    // ISO date
  readonly checkOut: string;   // ISO date
  readonly nights: number;
  readonly guests: number | null;
  readonly currencyCode: string;

  // ── Financials from Hostaway ──
  readonly financials: ReservationFinancials;

  // ── Audit result (Sprint 2) ──
  readonly auditState: AuditMatchState;
  /** If aggregate_match: which JJ period row this reservation falls within */
  readonly aggregatePeriodId: string | null;

  // ── JJ match result (kept for backward compat) ──
  readonly matchedTransactionIds: readonly string[];
  /** JJ Platform Income amount for this reservation. null if no match. */
  readonly jjPlatformIncome: number | null;
  /** JJ Cleaning amount. null if no match. */
  readonly jjCleaning: number | null;

  // ── Difference (if any) ──
  readonly difference: AuditDifferenceDTO | null;
}

/**
 * A specific difference found between Hostaway and JJ.
 */
export interface AuditDifferenceDTO {
  readonly direction: DifferenceDirection;
  readonly lineType: FinancialLineType;
  /** Amount from Hostaway. null if JJ-only. */
  readonly hostawayAmount: number | null;
  /** Amount from JJ. null if Hostaway-only. */
  readonly jjAmount: number | null;
  /** Absolute difference. Always >= 0. */
  readonly absoluteDifference: number;
  /** Human-readable explanation */
  readonly description: string;
  /** Is this difference expected by business rules? */
  readonly expectedByBusinessRule: boolean;
  /** If expected, which rule explains it */
  readonly businessRuleRef: string | null;
}

// ─── Comparison Model (Sprint 2) ────────────────────────────────────────────

/**
 * A JJ period-aggregate Platform Income row.
 * JJ records income as multi-month aggregates, not per-reservation.
 */
export interface JjPeriodAggregate {
  /** JJ transaction ID */
  readonly transactionId: string;
  /** JJ transaction date */
  readonly date: string;
  /** Amount in EUR */
  readonly amountEur: number;
  /** Raw description (may contain date range in Hebrew/English) */
  readonly description: string | null;
  /** Parsed period start (if extractable from description). null if not parseable. */
  readonly periodFrom: string | null;
  /** Parsed period end (if extractable from description). null if not parseable. */
  readonly periodTo: string | null;
  /** Subcategory (Platform Income, Cleaning, etc.) */
  readonly subcategory: string;
}

/**
 * Period-level comparison: sum of Hostaway reservations vs JJ aggregate.
 * This is the PRIMARY comparison unit — not reservation-level.
 */
export interface PeriodComparison {
  /** The JJ aggregate row being compared against */
  readonly jjAggregate: JjPeriodAggregate;
  /** Hostaway reservations whose stays overlap this period */
  readonly hostawayReservationIds: readonly string[];
  /** Sum of Hostaway payouts for overlapping reservations */
  readonly hostawayPeriodPayout: AuthoritativeAmount;
  /** JJ recorded amount */
  readonly jjPeriodAmount: AuthoritativeAmount;
  /** Period-level match result */
  readonly periodMatchState: 'period_exact' | 'period_difference' | 'period_insufficient_data';
  /** Absolute difference if both amounts known */
  readonly periodDifference: number | null;
  /** Percentage difference if both amounts known */
  readonly periodDifferencePercent: number | null;
}

// ─── Property-level DTOs ─────────────────────────────────────────────────────

/**
 * Summary totals for one property's audit.
 */
export interface PropertyAuditSummaryDTO {
  // ── Reservation counts by status ──
  /** Total reservations (all statuses) */
  readonly totalReservations: number;
  /** Revenue-eligible reservations (confirmed + modified) — used for financial totals */
  readonly revenueEligibleReservations: number;
  readonly confirmedReservations: number;
  readonly modifiedReservations: number;
  readonly cancelledReservations: number;
  readonly inquiryReservations: number;
  readonly ownerStayReservations: number;
  readonly unknownStatusReservations: number;

  /** Breakdown by channel */
  readonly channelBreakdown: readonly ChannelBreakdown[];

  /** Total gross revenue from Hostaway (revenue-eligible only: confirmed + modified) */
  readonly hostawayTotalRevenue: number;
  /** Total expected payout from Hostaway (revenue-eligible only, net after platform fees) */
  readonly hostawayTotalPayout: AuthoritativeAmount;
  /** Total cleaning fees from Hostaway */
  readonly hostawayTotalCleaning: number;

  // ── JJ totals (active Airbnb transactions for this property) ──
  readonly jjAirbnbRows: number;
  readonly jjPlatformIncomeTotal: number;
  readonly jjCleaningTotal: number;
  readonly jjManagementFeeTotal: number;

  // ── Comparison summary (Sprint 2) ──
  /** How many JJ period rows exist */
  readonly jjPeriodAggregateCount: number;
  /** How many periods could be compared */
  readonly periodsCompared: number;
  /** How many periods matched within tolerance */
  readonly periodsMatched: number;
  /** Overall period-level difference (sum of all period diffs) */
  readonly totalPeriodDifference: number | null;

  // ── Audit state distribution ──
  readonly auditStateDistribution: Readonly<Record<AuditMatchState, number>>;

  /** Total differences found (all types) */
  readonly totalDifferences: number;
  /** Sum of absolute differences in EUR */
  readonly totalDifferenceAmount: number;

  // ── Date range ──
  readonly earliestCheckIn: string | null;
  readonly latestCheckOut: string | null;

  // ── Overall health ──
  readonly health: AuditHealth;
}

/** Per-channel summary within a property */
export interface ChannelBreakdown {
  readonly channel: BookingChannel;
  readonly reservationCount: number;
  readonly totalRevenue: number;
  readonly totalPayout: number | null;
}

/**
 * Audit limitations — what this audit can and cannot tell you.
 * Every audit must declare its limitations explicitly.
 */
export interface AuditLimitations {
  /** Date filter mode used */
  readonly dateFilterMode: DateFilterMode;
  /** Can individual reservations be matched to JJ rows? */
  readonly reservationLevelMatchingPossible: boolean;
  /** Why reservation-level matching isn't possible (if applicable) */
  readonly matchingLimitationReason: string | null;
  /** What comparison granularity was achieved */
  readonly comparisonGranularity: 'reservation' | 'period_aggregate' | 'total_only';
  /** Are there JJ rows with unparseable period descriptions? */
  readonly unparseableJjPeriods: number;
  /** Are there Hostaway reservations with missing financial data? */
  readonly reservationsWithMissingFinancials: number;
  /** Additional free-text limitations */
  readonly notes: readonly string[];
}

/**
 * Evidence quality assessment for the audit.
 */
export interface EvidenceQuality {
  /** What fraction of Hostaway payouts use 'reported' vs 'calculated' source */
  readonly reportedPayoutFraction: number;
  /** What fraction of reservations have complete financial data */
  readonly completeFinancialsFraction: number;
  /** Overall evidence quality */
  readonly overallQuality: 'high' | 'medium' | 'low' | 'insufficient';
  /** Explanation */
  readonly qualityNote: string;
}

/**
 * Complete audit result for one property.
 * This is the top-level DTO that UI/Executives consume.
 */
export interface HostawayPropertyAuditDTO {
  // ── Identity ──
  readonly jjPropertyName: string;
  readonly hostawayPropertyId: string;
  readonly hostawayPropertyName: string;
  readonly hostawayInternalName: string | null;
  readonly mappingConfidence: string;   // 'exact' | 'high'
  readonly mappingStatus: string;       // 'approved'

  // ── Audit meta ──
  readonly auditId: string;            // HAU-YYYY-NNNNNN
  readonly auditDate: string;          // ISO timestamp
  readonly dateRangeFrom: string;      // ISO date — start of audit window
  readonly dateRangeTo: string;        // ISO date — end of audit window
  readonly dateFilterMode: DateFilterMode;
  readonly limitations: AuditLimitations;
  readonly evidenceQuality: EvidenceQuality;

  // ── Results ──
  readonly summary: PropertyAuditSummaryDTO;
  readonly reservations: readonly ReservationAuditDTO[];
  readonly periodComparisons: readonly PeriodComparison[];
  readonly differences: readonly AuditDifferenceDTO[];

  // ── Evidence chain ──
  readonly dataSources: readonly DataSourceRef[];
}

/** Reference to a data source used in the audit */
export interface DataSourceRef {
  readonly source: 'pms.canonical_reservations' | 'pms.raw_reservations' | 'pms.property_mappings' | 'public.transactions';
  readonly queryTimestamp: string;    // ISO timestamp
  readonly rowCount: number;
}

// ─── Service Contract ────────────────────────────────────────────────────────

/** Input parameters for requesting a property audit */
export interface PropertyAuditRequest {
  /** JJ property name (must match a pms.property_mappings entry) */
  readonly jjPropertyName: string;
  /** Start of date range (inclusive). ISO date. */
  readonly dateFrom: string;
  /** End of date range (inclusive). ISO date. */
  readonly dateTo: string;
  /** How to filter by date. Default: 'stay_overlaps'. */
  readonly dateFilterMode?: DateFilterMode;
}

/** Result wrapper for the audit service */
export interface PropertyAuditResult {
  readonly success: boolean;
  readonly audit: HostawayPropertyAuditDTO | null;
  readonly error: string | null;
}

/** Service interface — consumed by all Executives and UI */
export interface IPropertyAuditService {
  /**
   * Run a complete audit for one property over a date range.
   * Read-only: queries pms + transactions, produces DTOs.
   */
  auditProperty(request: PropertyAuditRequest): Promise<PropertyAuditResult>;

  /**
   * List all auditable properties (those with approved mappings).
   */
  listAuditableProperties(): Promise<readonly AuditableProperty[]>;
}

/** A property that can be audited (has an approved mapping) */
export interface AuditableProperty {
  readonly jjPropertyName: string;
  readonly hostawayPropertyId: string;
  readonly hostawayName: string;
  readonly mappingConfidence: string;
  readonly earliestReservation: string | null;
  readonly latestReservation: string | null;
  readonly totalReservations: number;
}
