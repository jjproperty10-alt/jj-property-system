// SERVICE ENGAGEMENTS (P2 PR #2 — Read Layer)

export type ServiceType = 'renovation' | 'sale' | 'management_ltr' | 'airbnb_str'

export type ServiceEngagementStatus = 'draft' | 'active' | 'suspended' | 'closed'

export interface ServiceEngagementDTO {
  readonly id: string
  readonly entityId: string
  readonly propertyId: string
  readonly serviceType: ServiceType
  readonly status: ServiceEngagementStatus
  readonly effectiveFrom: string | null
  readonly effectiveTo: string | null
  readonly notes: string | null
  readonly createdBy: string
  readonly createdAt: string
  readonly updatedAt: string
}

/**
 * Engagements grouped by property.
 * propertyName is null when entity_property_associations lacks a mapping.
 */
export interface PropertyServiceEngagementsDTO {
  readonly propertyId: string
  readonly propertyName: string | null
  readonly engagements: readonly ServiceEngagementDTO[]
}

/**
 * Top-level response for an entity's service engagements.
 * Empty properties[] is the normal state — the table starts empty.
 */
export interface OwnerServiceEngagementsDTO {
  readonly entityId: string
  readonly properties: readonly PropertyServiceEngagementsDTO[]
  readonly totalEngagements: number
}

/**
 * Owner Workspace DTOs — PR #3: JJ Workspace Navigation
 *
 * These interfaces describe what the UI needs.
 * They do NOT define accounting semantics, calculate Owner Due,
 * or implement Hostaway matching logic.
 *
 * All financial values arrive pre-computed from the RC3 engine or
 * ownerWorkspaceService adapters. No client-side reduce/filter may
 * become financial business logic.
 *
 * @see OWNER_VERTICAL_SLICE_BRIEF_v1.md — Section 13 (Data Contract Boundary)
 */

// ─────────────────────────────────────────────────────────────
// SHARED PRIMITIVES
// ─────────────────────────────────────────────────────────────

/** ISO-8601 date string e.g. "2026-07-01" */
export type ISODate = string

/** ISO-8601 timestamp string */
export type ISOTimestamp = string

/** A euro amount as a decimal string (Supabase NUMERIC → string) or null if unknown */
export type EuroAmount = string | null

/**
 * Statement workflow statuses.
 * "Overdue" is a derived display state from the timeline — not a statement status.
 */
export type StatementStatus =
  | 'draft'
  | 'sent'
  | 'viewed'
  | 'action_required'
  | 'awaiting_payment'
  | 'closed'

/** Correction case statuses — full lifecycle */
export type CorrectionStatus =
  | 'open'
  | 'under_review'
  | 'waiting_for_information'
  | 'approved'
  | 'rejected'
  | 'replacement_draft'
  | 'replacement_sent'
  | 'closed'

/** Who initiated a correction */
export type CorrectionInitiator = 'owner' | 'partner' | 'jj' | 'system'

/** Timeline certainty shapes */
export type TimelineDotShape = 'filled' | 'open' | 'diamond' | 'dashed-square'

/** Timeline zones */
export type TimelineZone = 'past' | 'now' | 'upcoming'

/** Upcoming event trusted sources */
export type UpcomingEventSource =
  | 'contract'
  | 'approved_payment_schedule'
  | 'scheduled_statement_cycle'
  | 'task'
  | 'confirmed_commitment'

/** Source mode for Hostaway / JJ comparison */
export type SourceMode = 'jj' | 'hostaway' | 'compare'

// ─────────────────────────────────────────────────────────────
// OWNER IDENTITY
// ─────────────────────────────────────────────────────────────

export interface OwnerIdentityDTO {
  /** Internal UUID from lifecycle.partner_entry or jj_staff_config */
  id: string
  /** URL-safe slug derived from name */
  slug: string
  /** Display name */
  name: string
  /** Preferred communication language */
  preferredLanguage: 'he' | 'en' | 'ru'
  /** Flag emoji */
  flag: string
  /** Avatar initials */
  initials: string
  /** Avatar background color (hex) */
  avatarColor: string
  /** Partnership start year */
  since: number | null
  /** Primary property name */
  primaryProperty: string | null
  /** All property names for this owner */
  properties: string[]
}

// ─────────────────────────────────────────────────────────────
// CONFIGURATION HEALTH (Blueprint 9.5)
// ─────────────────────────────────────────────────────────────

/**
 * Configuration Health state — onboarding/configuration completeness.
 * NOT financial truth. See P0 Blueprint 9.5.
 *
 * Rules (Yossi-approved PR #3 scope):
 * - pending_verification present → 'pending_verification'
 * - missing canonical name, both contacts missing, or no active association → 'incomplete'
 * - universal checks pass but full P0 relationship-aware completeness cannot be proven → 'needs_review'
 * - Complete only if all applicable P0 requirements can be proven from authoritative sources
 */
export type ConfigHealthState = 'complete' | 'pending_verification' | 'needs_review' | 'incomplete'

export interface ConfigHealthDTO {
  /** The evaluated health state */
  state: ConfigHealthState
  /** Count of missing required items (0 when complete) */
  missingCount: number
  /** Human-readable label for display */
  label: string
}

// ─────────────────────────────────────────────────────────────
// OWNERS ROOM (list screen)
// ─────────────────────────────────────────────────────────────

export interface OwnerRoomItemDTO {
  identity: OwnerIdentityDTO
  /** Current statement status */
  statementStatus: StatementStatus
  /** Balance direction from JJ's perspective */
  balanceDirection: 'jj_owes_owner' | 'owner_owes_jj' | 'balanced'
  /** Balance amount in EUR — null if unknown */
  balanceEur: EuroAmount
  /** ISO date of last sent statement */
  lastStatementSentAt: ISODate | null
  /** The most important next action JJ should take for this owner */
  nextActionSummary: string | null
  /** Open correction case count */
  openCorrectionCount: number
  /** Upcoming items count */
  upcomingCount: number
  /** Priority group for display ordering: 'today' | 'this_week' | 'rest' */
  priorityGroup: 'today' | 'this_week' | 'rest'
  /** Configuration Health — onboarding completeness (Blueprint 9.5) */
  configHealth: ConfigHealthDTO
  /** Deduplicated count of associated properties (Blueprint 9.5a) */
  associatedPropertyCount: number
  /** PR #4: true if entity was created via wizard (jj_relationships, not management_relationship) */
  isDraft: boolean
}

export interface OwnersRoomDTO {
  items: OwnerRoomItemDTO[]
  /** Summary stats for room header */
  summary: {
    totalOwners: number
    readyToSend: number
    actionRequired: number
    openCorrections: number
  }
}

// ─────────────────────────────────────────────────────────────
// OWNER WORKSPACE — TOP-LEVEL
// ─────────────────────────────────────────────────────────────

export interface OwnerWorkspaceDTO {
  identity: OwnerIdentityDTO
  currentPeriod: {
    label: string          // e.g. "July 2026"
    startDate: ISODate
    endDate: ISODate
  }
  statementStatus: StatementStatus
  openCorrectionCount: number
  /** Tabs are rendered by the workspace shell; data arrives per-tab via separate fetches */
}

/**
 * G1B: Typed resolution result for Owner Workspace.
 * Preserves the full resolver outcome instead of collapsing to null.
 * Legacy `getOwnerWorkspace()` returns null for backward compatibility;
 * new consumers should use `resolveOwnerWorkspace()` and this type.
 */
export type OwnerWorkspaceResolutionResult =
  | { readonly status: 'resolved'; readonly workspace: OwnerWorkspaceDTO }
  | { readonly status: 'not_found'; readonly slug: string }
  | { readonly status: 'ambiguous'; readonly slug: string; readonly candidates: readonly string[] }
  | { readonly status: 'relationship_missing'; readonly entityId: string; readonly displayName: string }
  | { readonly status: 'source_unavailable'; readonly error: string }

// ─────────────────────────────────────────────────────────────
// TAB 1 — OVERVIEW
// ─────────────────────────────────────────────────────────────

export interface OwnerOverviewDTO {
  /** Financial headline — values pre-computed by engine */
  financial: {
    balanceDirection: 'jj_owes_owner' | 'owner_owes_jj' | 'balanced'
    balanceEur: EuroAmount
    pendingEur: EuroAmount
    /** Last payment received date */
    lastPaymentAt: ISODate | null
    /** Next expected payment date */
    nextPaymentAt: ISODate | null
  }
  /** Open items requiring JJ action */
  openItems: OwnerOpenItemDTO[]
  /** Next recommended action */
  nextAction: {
    label: string
    href: string
    urgency: 'high' | 'medium' | 'low'
  } | null
  /** Upcoming events preview (max 3) */
  upcomingPreview: UpcomingEventDTO[]
  /** Contract renewal alert */
  contractRenewalAlert: {
    propertyName: string
    renewalDate: ISODate
    daysUntilRenewal: number
  } | null
  /** Recent activity feed items (max 5) */
  recentActivity: ActivityFeedItemDTO[]
}

export interface OwnerOpenItemDTO {
  id: string
  type: 'correction' | 'approval' | 'missing_document' | 'maintenance' | 'payment'
  label: string
  propertyName: string | null
  urgency: 'high' | 'medium' | 'low'
  dueDate: ISODate | null
}

export interface ActivityFeedItemDTO {
  id: string
  type: 'statement_sent' | 'payment_received' | 'correction_opened' | 'correction_closed' | 'document_added' | 'maintenance_completed'
  label: string
  propertyName: string | null
  occurredAt: ISOTimestamp
}

// ─────────────────────────────────────────────────────────────
// TAB 2 — FINANCIAL
// ─────────────────────────────────────────────────────────────

export interface OwnerFinancialDTO {
  /**
   * Current financial position — all values pre-computed by RC3 engine.
   * UI renders only. No calculations in components.
   */
  position: {
    incomeEur: EuroAmount
    expensesEur: EuroAmount
    netEur: EuroAmount
    paidToOwnerEur: EuroAmount
    pendingEur: EuroAmount
    /** Engine-computed closing balance. Null until Settlement Engine (RC2). */
    closingBalanceEur: EuroAmount
  }
  /** Overall net relationship — computed from RC3 departmental balances */
  overallNet: OwnerOverallNetDTO | null
  sections: OwnerFinancialSectionDTO[]
  timeline: FinancialTimelineItemDTO[]
  /** Occupancy position — personal occupancy obligations (Oshrit only for now) */
  occupancyPosition?: OccupancyPositionDTO | null
  /** Historical data summary for three-state display (State B) */
  historicalSummary?: {
    earliestDate: string
    latestDate: string
    rowCount: number
  } | null
}

/**
 * Occupancy Position — recurring personal obligations outside the RC3 engine.
 *
 * Sourced from lifecycle.v_occupancy_position. Only populated for properties
 * listed in NEEDS_REVIEW_PROPERTIES that have occupancy agreements.
 *
 * Economic bearer = Yossi (personal obligation, not JJ company expense).
 * Settlement credits are tracked but NOT subtracted from owner balance
 * until the partner current-account ledger is implemented.
 */
export interface OccupancyPositionDTO {
  propertyName: string
  monthlyAmountEur: string
  effectiveFrom: string
  effectiveTo: string | null
  agreementStatus: string
  totalObligations: number
  settledCount: number
  openCount: number
  totalObligatedEur: string
  totalSettledEur: string
  outstandingEur: string
  /** Settlement breakdown by payer identity (P-ARCH-2: Yossi ≠ Jacob ≠ JJ) */
  settledByJjEur: string
  settledByJacobEur: string
  settledByYossiEur: string
}

/**
 * Overall Net Relationship — "Does this owner owe JJ, or does JJ owe them?"
 *
 * Computed by computeNetOwnerBalance() from RC3AccountSection[].
 * Negative net = owner owes JJ. Positive net = JJ owes owner. Zero = settled.
 *
 * @see computeNetOwnerBalance in executiveSummary.ts
 */
export interface OwnerOverallNetDTO {
  /** Per-department closing balances, normalized to owner perspective */
  departments: OwnerDepartmentBalanceDTO[]
  /** Overall net in euros (negative = owner owes JJ) */
  netEur: string
  /** Pre-computed display label */
  label: 'due_to_jj' | 'due_to_you' | 'settled'
  /** Absolute value for display */
  displayAmountEur: string
  /**
   * Production guard — when set, the net values are known to be incomplete
   * or incorrect due to missing accounting infrastructure. UI should display
   * a review banner instead of the numeric values.
   */
  reviewStatus?: 'needs_review'
  /** Human-readable explanation of why review is needed */
  reviewReason?: string
}

export interface OwnerDepartmentBalanceDTO {
  /** Department type e.g. 'purchase', 'rental', 'sale', 'airbnb', 'renovation' */
  type: string
  /** Display label e.g. 'Property Purchase', 'Rental' */
  label: string
  /** Raw closing balance */
  closingBalanceEur: string
  /** Normalized to owner perspective (negative = owner owes JJ) */
  normalizedEur: string
  /** Pre-computed display label */
  label_status: 'due_to_jj' | 'due_to_you' | 'settled'
  /** Absolute value for display */
  displayAmountEur: string
}

export interface OwnerFinancialSectionDTO {
  /** e.g. 'airbnb', 'rental', 'renovation', 'sale', 'purchase', 'transfer' */
  type: string
  label: string
  incomeEur: EuroAmount
  expensesEur: EuroAmount
  netEur: EuroAmount
  /** Engine-computed closing balance for this section */
  closingBalanceEur: EuroAmount
  /** Balance convention: 'client_debt' or 'owner_credit' */
  balanceConvention: string | null
  /** Breakdown rows */
  rows: OwnerFinancialRowDTO[]
  /**
   * Optional display note for sections requiring contextual explanation.
   * Set by the adapter for NEEDS_REVIEW properties (e.g. Purchase sections
   * that represent JJ internal acquisition cost, not owner-facing debt).
   */
  displayNote?: string | null
}

export interface OwnerFinancialRowDTO {
  id: string
  date: ISODate
  description: string
  /** Audience-filtered: platform tracking rows never reach owner-facing payload */
  displayGroup: 'income' | 'expense' | 'payment' | 'info'
  amountEur: EuroAmount
  /** Source evidence reference */
  evidenceRef: string | null
}

export interface FinancialTimelineItemDTO {
  id: string
  label: string
  date: ISODate
  amountEur: EuroAmount
  type: 'income' | 'expense' | 'payment' | 'opening' | 'closing'
}

// ─────────────────────────────────────────────────────────────
// TAB 3 — RESERVATIONS
// ─────────────────────────────────────────────────────────────

export interface OwnerReservationSummaryDTO {
  period: { startDate: ISODate; endDate: ISODate }
  /** Portfolio summary across all owner properties */
  portfolio: {
    totalReservations: number
    occupancyPct: number | null
    revenueEur: EuroAmount
    adr: EuroAmount          // Average Daily Rate
    revPar: EuroAmount       // Revenue Per Available Room
    cancellations: number
  }
  channelMix: ReservationChannelDTO[]
  reservations: ReservationRowDTO[]
}

export interface ReservationChannelDTO {
  channel: string   // 'Airbnb', 'Booking.com', 'Direct', etc.
  count: number
  revenueEur: EuroAmount
  pct: number
}

export interface ReservationRowDTO {
  id: string
  guestName: string | null
  propertyName: string
  channel: string
  checkIn: ISODate
  checkOut: ISODate
  nights: number
  revenueEur: EuroAmount
  status: 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled' | 'no_show'
  source: 'jj' | 'hostaway'
  /** Evidence drill-down ref */
  evidenceRef: string | null
}

// ─────────────────────────────────────────────────────────────
// TAB 4 — DOCUMENTS
// ─────────────────────────────────────────────────────────────

export type DocumentType =
  | 'contract'
  | 'statement'
  | 'invoice'
  | 'receipt'
  | 'ownership'
  | 'approval'
  | 'property'
  | 'maintenance'

export interface OwnerDocumentDTO {
  id: string
  type: DocumentType
  title: string
  /** Related owner or property */
  relatedEntity: string
  /** Related business event description */
  relatedEvent: string | null
  date: ISODate
  source: string   // 'upload', 'system', 'email', etc.
  verificationStatus: 'verified' | 'pending' | 'missing' | 'expired'
  /** If available, a URL or path to preview/open */
  openHref: string | null
}

// ─────────────────────────────────────────────────────────────
// TAB 5 — MAINTENANCE
// ─────────────────────────────────────────────────────────────

export type MaintenanceStatus = 'open' | 'in_progress' | 'waiting' | 'completed' | 'verified'

export interface OwnerMaintenanceDTO {
  id: string
  title: string
  propertyName: string
  supplier: string | null
  /** How this maintenance item affects the owner's account */
  ownerImpact: string | null
  status: MaintenanceStatus
  nextAction: string | null
  openedAt: ISODate
  resolvedAt: ISODate | null
  /** Evidence / photo / document refs */
  evidenceRefs: string[]
  estimatedCostEur: EuroAmount
  actualCostEur: EuroAmount
}

/**
 * G3-A: RC3-backed maintenance item (2026-07-25).
 * Returned by getOwnerMaintenance after G3-A alignment.
 *
 * Replaces direct public.transactions read with RC3 renovation account data.
 * Preserves description → title mapping (test-contract-stable).
 *
 * status / statusReason explicitly declare RC3-stage limitation:
 * lifecycle status is not available at RC3 layer — deferred to RC2 scope.
 */
export interface OwnerMaintenanceItemDTO {
  readonly id: string
  readonly propertyName: string
  readonly date: ISODate
  /** Transaction description, display_label, or subcategory — in that order of preference */
  readonly title: string
  readonly subcategory: string | null
  /** Always 'unknown' — RC3 has no lifecycle status field */
  readonly status: 'unknown'
  /** Explicit declaration of why status is unknown */
  readonly statusReason: 'rc3_has_no_lifecycle_status'
  /** client_amount from RC3 engine (COALESCE of client_charge and amount_eur) */
  readonly amountEur: EuroAmount
  /** Always 'rc3' — source declaration for audit trail */
  readonly source: 'rc3'
}

// ─────────────────────────────────────────────────────────────
// TAB 6 — RELATIONSHIP
// ─────────────────────────────────────────────────────────────

export type RelationshipEventType =
  | 'whatsapp'
  | 'email'
  | 'call'
  | 'meeting_note'
  | 'promise'
  | 'approval'
  | 'decision'
  | 'internal_note'
  | 'ai_summary'

export interface OwnerRelationshipEventDTO {
  id: string
  type: RelationshipEventType
  /**
   * Audience determines field visibility:
   * - 'jj': internal_note, ai_summary — never reaches client payload
   * - 'owner': visible in owner-facing views
   * - 'all': visible to all
   */
  audience: 'jj' | 'owner' | 'all'
  summary: string
  /** Full content — only populated for JJ-audience events in JJ view */
  content: string | null
  occurredAt: ISOTimestamp
  propertyName: string | null
  authorName: string | null
  /** Is this an AI-generated summary? Always clearly marked. */
  isAiGenerated: boolean
  /** AI confidence pct — only meaningful when isAiGenerated=true */
  aiConfidencePct: number | null
}

// ─────────────────────────────────────────────────────────────
// TAB 7 — AUDIT
// ─────────────────────────────────────────────────────────────

export interface OwnerAuditDTO {
  evidenceItems: EvidencePointerDTO[]
  statementVersions: StatementVersionDTO[]
  correctionCases: CorrectionCaseDTO[]
  decisionHistory: DecisionHistoryItemDTO[]
  verificationHistory: VerificationHistoryItemDTO[]
}

export interface EvidencePointerDTO {
  id: string
  type: string        // 'bank', 'invoice', 'contract', 'whatsapp', 'manual'
  strength: 'primary' | 'secondary' | 'supporting' | 'attestation'
  description: string
  date: ISODate | null
  source: string
  verifiedAt: ISOTimestamp
  validityStatus: 'active' | 'needs_renewal' | 'expired'
}

export interface StatementVersionDTO {
  id: string
  version: number
  period: string
  sentAt: ISOTimestamp | null
  status: StatementStatus | 'void'
  channel: string | null
  /** V1 → Correction → V2 linkage */
  replacedBy: string | null
  replacedFrom: string | null
}

export interface CorrectionCaseDTO {
  id: string
  initiatedBy: CorrectionInitiator
  status: CorrectionStatus
  /**
   * public_reason is always visible to owner.
   * internal_note is JJ-only and never reaches client payload.
   */
  publicReason: string
  /** Present only in JJ-facing view */
  internalNote: string | null
  humanApprovalRequired: boolean
  reviewerName: string | null
  priorStatementId: string | null
  replacementStatementId: string | null
  openedAt: ISOTimestamp
  resolvedAt: ISOTimestamp | null
}

export interface DecisionHistoryItemDTO {
  id: string
  decisionType: string
  description: string
  decidedBy: string
  decidedAt: ISOTimestamp
  amountEur: EuroAmount
  evidenceChainSummary: string
}

export interface VerificationHistoryItemDTO {
  id: string
  field: string
  oldValue: string | null
  newValue: string
  verifiedBy: string
  verifiedAt: ISOTimestamp
  evidenceSource: string | null
}

/**
 * Audit Tab resolution result — fail-closed discriminated union.
 *
 * Every failure mode is explicitly named. Empty arrays inside 'resolved'
 * are the ONLY legitimate "no data" state.
 *
 * Gate D design (2 Aug 2026). Yossi correction: when status='resolved',
 * partyId and snapshotOwnerId must be non-null. When no bridge exists,
 * return 'party_bridge_missing' — not 'resolved' with null IDs.
 *
 * Constitutional basis:
 *   P-ARCH-1: Unknown = NULL, never empty-that-looks-like-resolved
 *   EX-4: Unknown ≠ Zero (Design System v1.0)
 *   DAL-7: Every access decision must be explainable and auditable
 */
export type AuditResolutionResult =
  // ── Success ──────────────────────────────────────────────
  | {
      readonly status: 'resolved'
      readonly data: OwnerAuditDTO
      /** Which identity keys were used for each source query (audit trail) */
      readonly resolution: {
        readonly entityIdentityId: string
        readonly partyId: string
        readonly snapshotOwnerId: string
        /**
         * Evidence source contract status.
         * 'unsupported': evidence_links.entity_id is freeform text — no UUID bridge exists.
         * Evidence cannot be queried safely until a UUID-based contract is established.
         */
        readonly evidenceSourceContract: 'unsupported'
      }
    }

  // ── Identity failures ────────────────────────────────────
  | {
      readonly status: 'entity_not_found'
      readonly slug: string
    }
  | {
      readonly status: 'ambiguous_identity'
      readonly slug: string
      readonly candidates: readonly string[]
    }

  // ── Bridge failures ──────────────────────────────────────
  | {
      readonly status: 'party_bridge_missing'
      readonly entityIdentityId: string
      readonly canonicalName: string
    }
  | {
      readonly status: 'ambiguous_party_mapping'
      readonly entityIdentityId: string
      readonly canonicalName: string
      readonly candidatePartyIds: readonly string[]
    }

  // ── Source failures ──────────────────────────────────────
  | {
      readonly status: 'source_unavailable'
      readonly error: string
      readonly failedSource: 'finance_schema' | 'statements_schema' | 'identity_resolver' | 'party_bridge'
    }

// ─────────────────────────────────────────────────────────────
// TIMELINE
// ─────────────────────────────────────────────────────────────

export interface TimelineEventDTO {
  id: string
  zone: TimelineZone
  dotShape: TimelineDotShape
  /** Accessible text label for the dot shape (not just color) */
  dotLabel: string
  title: string
  date: ISODate | null
  dateConfidence: 'confirmed' | 'pending_verification' | 'estimated' | null
  propertyName: string | null
  type: string
  /** For upcoming events: who is responsible */
  assignedTo: string | null
  source: UpcomingEventSource | null
  lastVerifiedAt: ISOTimestamp | null
  /** AI forecast fields — undefined unless dotShape === 'dashed-square' */
  aiForecast?: {
    confidencePct: number
    label: string   // always "AI forecast · {pct}% · not confirmed"
  }
  /** For past events: immutable record reference */
  evidenceRef: string | null
}

// ─────────────────────────────────────────────────────────────
// UPCOMING EVENTS
// ─────────────────────────────────────────────────────────────

export interface UpcomingEventDTO {
  id: string
  ownerPartyId: string
  propertyName: string | null
  title: string
  dueDate: ISODate
  source: UpcomingEventSource
  assignedTo: string | null
  status: 'pending' | 'confirmed' | 'overdue'
  lastVerifiedAt: ISOTimestamp
}

// ─────────────────────────────────────────────────────────────
// HOSTAWAY / AIRBNB UX
// ─────────────────────────────────────────────────────────────

export interface HostawayPortfolioSummaryDTO {
  period: { startDate: ISODate; endDate: ISODate }
  sourceMode: SourceMode
  properties: HostawayPropertySummaryDTO[]
  totals: {
    reservations: number
    revenueEur: EuroAmount
    feesEur: EuroAmount
    cleaningEur: EuroAmount
    ownerDueEur: EuroAmount
  }
  reconciliation: ReconciliationSummaryDTO
  propertiesNeedingAttention: string[]   // property names
}

export interface HostawayPropertySummaryDTO {
  propertyName: string
  canonicalName: string | null    // matched name in JJ DB
  mappingStatus: 'mapped' | 'unmapped' | 'proposed'
  reservations: number
  platformIncomeEur: EuroAmount
  platformFeesEur: EuroAmount
  cleaningIncomeEur: EuroAmount
  cleaningExpenseEur: EuroAmount
  operationalExpensesEur: EuroAmount
  managementFeeEur: EuroAmount
  ownerDueEur: EuroAmount
  reconciliationStatus: 'matched' | 'difference' | 'missing_jj' | 'missing_hostaway'
}

export interface HostawayPropertyDetailDTO {
  propertyName: string
  period: { startDate: ISODate; endDate: ISODate }
  sourceMode: SourceMode
  reservations: ReservationRowDTO[]
  financials: {
    platformIncomeEur: EuroAmount
    platformFeesEur: EuroAmount
    cleaningIncomeEur: EuroAmount
    cleaningExpenseEur: EuroAmount
    operationalExpensesEur: EuroAmount
    managementFeeEur: EuroAmount
    ownerDueEur: EuroAmount
  }
  reconciliation: ReconciliationSummaryDTO
}

export interface ReconciliationSummaryDTO {
  matchedCount: number
  missingInJJ: number
  missingInHostaway: number
  amountDifferenceEur: EuroAmount
  /** Flag: true when differences exist */
  hasDifferences: boolean
}
