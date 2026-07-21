/**
 * @module lifecycle/partnerStatementTypes
 * @description PartnerStatementDTO Contract v1.2
 *
 * v1.0 approved by Yossi (July 2026 session).
 * v1.1 — F3 (July 2026): TimelineStatement gains `verificationTaskItems?` — the full
 * per-task rows from lifecycle.verification_tasks, carrying a server-computed
 * humanLabel safe for partner display. No UUIDs or internal table names in the UI.
 * v1.2 — RC3 Financial Presentation Layer (July 2026): PortfolioSummary gains three
 * pre-computed OPERATIONAL financial totals: operationalIncomeEur,
 * operationalExpensesEur, operationalNetResultEur.
 * "Operational" = rental + airbnb only (balance_convention='owner_credit').
 * Renovation and Sale are excluded — their total_expenses field represents
 * client payments received (debt reduction), not business expenses.
 * Computed by buildPortfolioSummary — never in the UI.
 * "Every number must answer: where did you come from?" — Yossi, 2026-07-21.
 *
 * Design decisions:
 *   - Discriminated union on `meta.viewMode`: 'partner' | 'admin'
 *   - `verification` block is ABSENT from PartnerFacingStatementDTO (not empty)
 *   - `entityId` is internal only — slug is the URL identifier
 *   - All settlement values from Settlement Engine only (never computed here)
 *   - Readonly throughout: consumers render/filter/translate/format — never mutate (I-12)
 *
 * @see P-ARCH-1: Unknown = NULL. Never 0 or placeholder.
 * @see P-ARCH-2: Yossi ≠ Jacob ≠ JJ. Payer identity must not be normalised.
 * @see P-ARCH-6: Partner route never exposes jj_* fields.
 * @see I-12: DTO is immutable. No consumer may mutate business data.
 */

import type { RC3AccountSection } from '@/lib/report/types'
import type { VerificationTaskItem } from './timelineTypes'

// ─── Primitives ───────────────────────────────────────────────────────────────

/**
 * Capital status of an investor's position in a property.
 * 'capital_unknown' is the honest state for Oren (P-ARCH-1).
 * 'not_applicable' covers JJ-owned assets with no external investor capital.
 */
export type CapitalStatus =
  | 'no_capital_event' // no capital_event rows exist for this entity + property
  | 'fully_paid'      // capitalPaidEur >= requiredCapitalEur (both known)
  | 'partially_paid'  // capitalPaidEur < requiredCapitalEur (both known)
  | 'capital_unknown' // at least one event exists but paid or required is null — P-ARCH-1
  // @deprecated — retained for v1.0 source compatibility; never emitted by the v1.0 service
  | 'not_applicable'

/** Net direction of the cross-property settlement balance */
export type NetDirection =
  | 'receivable'  // JJ owes investor
  | 'payable'     // investor owes JJ
  | 'balanced'    // net = 0
  | 'unknown'     // Settlement Engine not yet run (M9-C scope)

/** Identifies whether a co-owner is an external investor or the JJ group */
export type OwnerKind = 'co_investor' | 'jj_group'

/**
 * Date confidence mirrors lifecycle.capital_event.effective_date_confidence
 * and lifecycle.ownership_period.effective_from_confidence.
 * P-ARCH-1: null date + pending_verification = honest unknown.
 */
export type DateConfidence = 'confirmed' | 'estimated' | 'pending_verification'

// ─── Co-Owner ─────────────────────────────────────────────────────────────────

/**
 * A co-owner of the property.
 * Source: lifecycle.entity_identity + lifecycle.ownership_period (active periods).
 * JJ partners (Yossi + Jacob) are grouped into ownerKind='jj_group'.
 * P-ARCH-6: no jj_* internal fields are exposed here.
 */
export interface CoOwner {
  /** Canonical name, or 'JJ Group' when ownerKind = 'jj_group' */
  readonly name: string
  readonly ownershipPct: number
  readonly ownerKind: OwnerKind
}

// ─── Capital Statement ────────────────────────────────────────────────────────

/**
 * A single capital payment by the investor.
 * P-ARCH-2: payerName must not be normalised — Yossi ≠ Jacob ≠ JJ.
 */
export interface CapitalPayment {
  /** lifecycle.capital_event.id */
  readonly eventId: string
  /** ISO date string, or null when unknown (P-ARCH-1) */
  readonly effectiveDate: string | null
  readonly effectiveDateConfidence: DateConfidence
  readonly amountEur: number
  readonly description: string | null
  readonly payerName: string | null
  readonly payeeName: string | null
}

/**
 * Aggregate capital position of the investor in one property.
 * P-ARCH-1: all EUR fields are null when unknown — never coerced to 0.
 */
export interface CapitalStatement {
  readonly agreedEntryValuationEur: number | null
  readonly requiredCapitalEur: number | null
  readonly capitalPaidEur: number | null       // null = unknown (Oren case)
  readonly capitalRemainingEur: number | null  // null = unknown
  readonly capitalStatus: CapitalStatus
  /** Ordered list of inflow capital payments from lifecycle.capital_event */
  readonly payments: readonly CapitalPayment[]
}

// ─── Ownership Statement ──────────────────────────────────────────────────────

/**
 * Current ownership position of the investor in one property.
 * coOwners sourced from lifecycle.ownership_period + entity_identity.
 */
export interface OwnershipStatement {
  readonly currentOwnershipPct: number | null
  /** Derived from v_partner_investment_statement.entry_status */
  readonly entryStatus: string
  readonly coOwners: readonly CoOwner[]
}

// ─── Financial Statement ──────────────────────────────────────────────────────

/**
 * RC3 financial data for one property.
 * Source: RC3 engine views (v_rc3_sale, v_rc3_renovation, v_rc3_rental, v_rc3_airbnb).
 * P-ARCH-5: contains only RC3 data — never lifecycle schema data.
 * null when no RC3 mapping exists for this property yet.
 */
export interface FinancialStatement {
  /** RC3 reporting_name used to fetch this report */
  readonly reportingName: string
  readonly fromDate: string | null
  readonly toDate: string | null
  /** One section per account type that has rows (omitted when empty) */
  readonly accountSections: readonly RC3AccountSection[]
  readonly hasSale: boolean
  readonly hasRenovation: boolean
  readonly hasRental: boolean
  readonly hasAirbnb: boolean
}

// ─── Timeline Statement ───────────────────────────────────────────────────────

/**
 * A single partner-visible timeline event.
 * Projected from lifecycle.capital_event / partner_entry / ownership_period.
 */
export interface TimelineEvent {
  readonly eventId: string
  /** ISO date, or null when unknown (P-ARCH-1) */
  readonly effectiveDate: string | null
  readonly effectiveDateConfidence: DateConfidence
  readonly title: string
  readonly description: string | null
  readonly amountEur: number | null
  readonly partnerVisible: boolean
  readonly status: string
}

/**
 * Ordered timeline of lifecycle events for one property.
 * Ordering: dated events first (ASC), then null-date events (by recordedAt ASC),
 * then UUID tie-breaker — mirrors TIMELINE_ORDERING_RULES.
 *
 * v1.1: adds `verificationTaskItems` — real task rows from lifecycle.verification_tasks.
 * Each item carries a server-computed humanLabel safe for partner display.
 * NEVER expose taskId, sourceId, or sourceTable directly in partner-facing UI.
 */
export interface TimelineStatement {
  readonly events: readonly TimelineEvent[]
  /** Count of open verification tasks (convenience; equals verificationTaskItems.length) */
  readonly openVerificationTasks: number
  /** True when any event has effectiveDateConfidence = 'pending_verification' */
  readonly hasPendingDates: boolean
  /**
   * Per-task verification items from lifecycle.verification_tasks.
   * Use item.humanLabel for partner-facing display.
   * item.taskId / item.sourceId / item.sourceTable are internal — NEVER render in UI.
   * Optional for backward compatibility with existing test fixtures.
   */
  readonly verificationTaskItems?: readonly VerificationTaskItem[]
}

// ─── Settlement Statement ──────────────────────────────────────────────────────

/**
 * Operational settlement position of the investor in one property.
 * All values from Settlement Engine only — never computed in DTO builder or UI.
 * currentBalanceEur = null until Settlement Engine integration (M9-C scope).
 */
export interface SettlementStatement {
  /**
   * Running operations settlement balance.
   * null = Settlement Engine not yet run (M9-C scope).
   * P-ARCH-1: never coerce to 0.
   */
  readonly currentBalanceEur: number | null
  readonly totalDistributionsPaidEur: number
}

// ─── Portfolio Summary ─────────────────────────────────────────────────────────

/**
 * Cross-property portfolio summary for the investor.
 * Settlement values (receivable/payable/net) come exclusively from
 * the Settlement Engine — never computed in DTO builder or UI (M9-C scope).
 * P-ARCH-1: total capital fields are null if ANY property has unknown capital.
 *
 * v1.2: adds three pre-computed financial totals from RC3 accountSections.
 * Computed in buildPortfolioSummary (service layer) — never in the UI.
 */
export interface PortfolioSummary {
  readonly totalPropertiesCount: number
  readonly totalAgreedValuationEur: number | null
  /** null if any property has unknown capital (P-ARCH-1) */
  readonly totalCapitalPaidEur: number | null
  /** null if any property has unknown capital */
  readonly totalCapitalRemainingEur: number | null
  /**
   * Cross-property settlement values.
   * Source: Settlement Engine only. Placeholder values (0 / 'unknown') until M9-C.
   * TODO M9-C: Replace with Settlement Engine integration.
   */
  readonly totalReceivableFromJJ: number
  readonly totalPayableToJJ: number
  readonly finalNetBalance: number
  readonly direction: NetDirection
  /**
   * Operational financial totals — RENTAL + AIRBNB accounts only.
   *
   * "Operational" means accounts with balance_convention = 'owner_credit':
   *   - 'rental'  (Management category — long-term rent)
   *   - 'airbnb'  (Short-term rental)
   *
   * Renovation and Sale are intentionally EXCLUDED.
   * Their sections use balance_convention = 'client_debt', where:
   *   - total_income  = extra charges billed to client (Extras, Sale Expenses)
   *   - total_expenses = client payments received (debt reduction)
   * Folding client payments into "Expenses" in an executive summary would
   * misrepresent a partner's financial position.
   * Renovation and Sale are presented in their own dedicated sections with
   * contract / charges / paid / remaining balance semantics.
   *
   * Computed by buildPortfolioSummary using OPERATIONAL_ACCOUNT_TYPES.
   * null when NO property has operational financial data (P-ARCH-1: unknown ≠ 0).
   * 0 when operational data exists and the aggregate is genuinely zero.
   *
   * operationalExpensesEur is absolute-value (positive) — sign matches RC3AccountSection.
   * operationalNetResultEur = operationalIncomeEur − operationalExpensesEur
   * (computed once in service; never inferred in UI — "where did you come from?").
   */
  readonly operationalIncomeEur: number | null
  readonly operationalExpensesEur: number | null
  /** null when operationalIncomeEur is null (no operational financial data). */
  readonly operationalNetResultEur: number | null
}

// ─── Per-Property Statement ───────────────────────────────────────────────────

/**
 * Complete statement for a single property in the investor's portfolio.
 * Composed from lifecycle tables (capital, ownership, timeline) + RC3 engine (financial).
 * Composition happens server-side in partnerStatementService. Never in the UI.
 */
export interface PartnerPropertyStatement {
  /** Canonical property name (matches lifecycle.partner_entry.property_name) */
  readonly propertyName: string
  /**
   * RC3 reporting_name linked to this property.
   * null when no RC3 data exists for this property yet.
   */
  readonly rc3ReportingName: string | null
  readonly capital: CapitalStatement
  readonly ownership: OwnershipStatement
  /** null when rc3ReportingName is null or RC3 engine returns no rows */
  readonly financial: FinancialStatement | null
  readonly settlement: SettlementStatement
  readonly timeline: TimelineStatement
}

// ─── Investor Info ─────────────────────────────────────────────────────────────

/**
 * Investor identity block.
 * entityId is INTERNAL ONLY — never expose in URLs.
 * Use slug for routing: /partner/avi not /partner/<uuid>.
 */
export interface InvestorInfo {
  /** Internal entity UUID from lifecycle.entity_identity */
  readonly entityId: string
  readonly canonicalName: string
  /** URL-safe slug derived from canonicalName (e.g. 'Avi' → 'avi') */
  readonly slug: string
  readonly ownerType: string
}

// ─── Actions ──────────────────────────────────────────────────────────────────

/** What the UI is allowed to surface for this statement */
export interface StatementActions {
  /** True when at least one property has RC3 financial data */
  readonly canExportCsv: boolean
  readonly canGeneratePdf: boolean
  /** True when any property has open verification tasks (relevant for admin) */
  readonly hasOpenVerificationTasks: boolean
}

// ─── Localization ──────────────────────────────────────────────────────────────

export interface StatementLocalization {
  readonly lang: 'en' | 'he'
  readonly currency: 'EUR'
  readonly generatedAt: string
}

// ─── Meta ──────────────────────────────────────────────────────────────────────

interface StatementMetaBase {
  /**
   * Namespaced schema version — avoids collision with other DTOs.
   * v1.1: TimelineStatement.verificationTaskItems added (F3).
   * v1.2: PortfolioSummary gains totalIncomeEur, totalExpensesEur, netResultEur.
   */
  readonly schemaVersion: 'PartnerStatementDTO/1.2'
  readonly generatedAt: string
}

interface PartnerFacingMeta extends StatementMetaBase {
  readonly viewMode: 'partner'
}

interface AdminMeta extends StatementMetaBase {
  readonly viewMode: 'admin'
}

// ─── Admin-only Verification Block ────────────────────────────────────────────

/**
 * Summary of open verification work items.
 * Only present in AdminStatementDTO — completely absent from PartnerFacingStatementDTO.
 */
export interface VerificationSummary {
  readonly totalOpenTasks: number
  /** Property names where hasPendingDates = true */
  readonly propertiesWithPendingDates: readonly string[]
  /** Property names where capitalStatus = 'capital_unknown' */
  readonly propertiesWithUnknownCapital: readonly string[]
}

// ─── Discriminated Union ──────────────────────────────────────────────────────

/**
 * Partner-facing statement DTO.
 *
 * The `verification` block is COMPLETELY ABSENT from this type —
 * not an empty object, not an empty array. The discriminated union
 * ensures the TypeScript compiler enforces this boundary.
 *
 * P-ARCH-6: no jj_* fields anywhere in this type or its nested types.
 * I-12: all fields are readonly. Consumers never mutate business data.
 */
export interface PartnerFacingStatementDTO {
  readonly meta: PartnerFacingMeta
  readonly investor: InvestorInfo
  readonly properties: readonly PartnerPropertyStatement[]
  readonly portfolio: PortfolioSummary
  readonly actions: StatementActions
  readonly localization: StatementLocalization
  // `verification` is intentionally absent — discriminated union enforces this
}

/**
 * Admin statement DTO.
 *
 * Extends the partner view with the `verification` block.
 * Admin DTOs may include internal context (verification tasks, pending dates,
 * unknown capital positions) that must never appear in partner-facing output.
 */
export interface AdminStatementDTO {
  readonly meta: AdminMeta
  readonly investor: InvestorInfo
  readonly properties: readonly PartnerPropertyStatement[]
  readonly portfolio: PortfolioSummary
  readonly actions: StatementActions
  readonly localization: StatementLocalization
  readonly verification: VerificationSummary
}

/** Top-level discriminated union — use `dto.meta.viewMode` to narrow */
export type PartnerStatementDTO = PartnerFacingStatementDTO | AdminStatementDTO

// Re-export VerificationTaskItem so consumers can import it from this module
export type { VerificationTaskItem }
