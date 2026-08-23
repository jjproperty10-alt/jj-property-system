/**
 * @module partner-settlement/partnerReportBTypes
 * @description Partner Report B — Stage 1 DTO + certification/status model.
 *
 * READ-ONLY reporting. Distinct from PartnerStatementDTO (report A) and from the
 * Client Report — NO shared financial formulas. See PARTNER_REPORT_PHASE1_DISCOVERY.md
 * sections 11-12 for the full contract.
 *
 * Stage 1 = framework only. The consolidated Yossi<->Jacob headline is ALWAYS gated
 * (PENDING_RECONCILIATION / PARTIAL) and never asserts a final debtor/creditor on
 * partial data. Certified roll-up and the final equalization are Stage 3.
 *
 * Principles enforced by the type shapes:
 *  - Unknown = null, never 0 (P-ARCH-1).
 *  - v_cashbox_audit is a LEDGER position, never "actual available cash" (12b).
 *  - Purchase is cost/investment, not profit (12d).
 *  - Layer A (current account vs JJ) and Layer B (derived equalization) are separate;
 *    Layer B never re-adds a claim already counted in Layer A (12a).
 *  - Every value carries a SourceRef for "explain this number" traceability.
 */

// ─── Status enums ──────────────────────────────────────────────────────────────

/** Trust level of a consolidated result. */
export type CertificationStatus = 'CERTIFIED' | 'PARTIAL' | 'PENDING_RECONCILIATION'

/** Cash figure trust (12b): ledger-only until reconciled to bank/physical count. */
export type CashVerificationStatus = 'LEDGER_ONLY' | 'RECONCILED' | 'DISCREPANCY'

/** Per-value source status. */
export type SourceStatus = 'CERTIFIED' | 'LEGACY' | 'PARTIAL' | 'PENDING' | 'UNRESOLVED'

// ─── Traceability ───────────────────────────────────────────────────────────────

export interface SourceRef {
  /** e.g. 'v_rc3_rental', 'v_cashbox_audit', 'ownerStrStatementService', 'v_money_position' */
  readonly system: string
  /** identifier within the source (reporting_name, view row key). No raw UUIDs in UI. */
  readonly ref?: string | null
  readonly note?: string | null
}

/** A single traceable component for "explain this number". */
export interface ExplainNode {
  readonly label: string
  readonly amountEur: number | null
  readonly tracesTo: readonly SourceRef[]
}

// ─── Unresolved / pending queue ────────────────────────────────────────────────

export type UnresolvedKind =
  | 'TRANSFER_PURPOSE_UNKNOWN'
  | 'LOAN_VS_CAPITAL_UNPROVEN'
  | 'OWNERSHIP_PENDING'
  | 'ACCOUNT_PROFIT_PENDING'
  | 'OWNER_BALANCE_UNRECONCILED'
  | 'CASH_UNVERIFIED'
  | 'MONEY_POSITION_SCOPE_PARTIAL'
  | 'FORWARD_COMMITMENT_SOURCE_MISSING'
  | 'IDENTITY_UNRESOLVED'
  | 'PARTNER_ACCOUNT_SOURCE_MISSING'
  | 'RECEIVABLE_AMOUNT_UNKNOWN'
  // Stage 2 — wired runtime pipeline
  | 'CUSTODIAN_SETTLEMENT_UNCERTIFIED'
  | 'PER_TRANSACTION_CAP_VIOLATION'
  | 'PROFIT_DISTRIBUTION_UNCERTIFIED'
  // Stage 2 QA (#185) — fail-closed source + scope blockers
  | 'LEDGER_SOURCE_UNAVAILABLE'
  | 'EXCLUSIONS_SOURCE_UNAVAILABLE'
  | 'IDENTITY_SOURCE_UNAVAILABLE'
  | 'PROPERTY_SCOPE_UNRESOLVED'
  | 'OTHER'

/** An item that could not be certified. Must NEVER enter certified totals. */
export interface UnresolvedItem {
  readonly kind: UnresolvedKind
  /** human-safe reference (property/account/tx label) — never raw UUIDs in UI */
  readonly ref: string
  readonly reason: string
  /** magnitude if known — informational only; excluded from certified totals */
  readonly amountEur?: number | null
  readonly sourceRef?: SourceRef
}

// ─── Three perspectives per account (never merged into one number) ──────────────

/** A — economic profitability ("what did it earn?"). */
export interface EconomicPerspective {
  readonly income: number | null
  readonly expenses: number | null
  readonly profitOrLoss: number | null
  readonly status: SourceStatus
  readonly sourceRef: SourceRef
}

/** B — actual cash movement ("where did the money move?"). */
export interface CashByParty {
  readonly party: string
  readonly received: number
  readonly paid: number
}
export interface CashPerspective {
  readonly received: number | null
  readonly paid: number | null
  readonly byParty: readonly CashByParty[]
  readonly sourceRef: SourceRef
}

/** C — rights & obligations ("what is still due?"). */
export interface RightsPerspective {
  readonly contractValue: number | null
  readonly received: number | null
  readonly receivable: number | null
  readonly payables: number | null
  readonly commitments: number | null
  readonly status: SourceStatus
  readonly sourceRef: SourceRef
}

// ─── Account & property ─────────────────────────────────────────────────────────

export type AccountType =
  | 'management'
  | 'airbnb'
  | 'renovation'
  | 'purchase'
  | 'sale'
  | 'jj_office'

export interface PartnerShare {
  readonly yossi: number | null
  readonly jacob: number | null
}

export interface AccountView {
  readonly accountType: AccountType
  readonly economic: EconomicPerspective
  readonly cash: CashPerspective
  readonly rights: RightsPerspective
  readonly ownerEntitlement: number | null
  readonly externalShare: number | null
  readonly jjShare: number | null
  readonly partnerShares: PartnerShare
  readonly residualToRollUp: number | null
  readonly unresolved: readonly UnresolvedItem[]
  readonly explain: readonly ExplainNode[]
  readonly status: SourceStatus
}

export type OwnershipConfidence = 'confirmed' | 'estimated' | 'pending_verification'

export interface OwnershipShare {
  readonly party: string
  readonly pct: number | null
  readonly confidence: OwnershipConfidence
}

export interface PropertyView {
  readonly propertyName: string
  readonly relationshipType: string | null
  readonly ownership: readonly OwnershipShare[]
  readonly accounts: readonly AccountView[]
  /** Stage 2: per-partner certified/unresolved contribution attributed to this property. */
  readonly partnerPositions: readonly PartnerPropertyPosition[]
  readonly unresolved: readonly UnresolvedItem[]
  readonly status: SourceStatus
}

// ─── Cashboxes (reporting positions, not bank accounts) ─────────────────────────

export type CashboxKind =
  | 'business_account'
  | 'cash_holder'
  | 'custodian'
  | 'receivable'
  | 'payable'

export interface CashboxView {
  readonly name: string
  readonly kind: CashboxKind
  /** ledger position derived from transactions — NOT verified available cash (12b) */
  readonly ledgerCashPosition: number | null
  /** null when no authoritative bank/physical reconciliation source exists */
  readonly verifiedBankOrPhysicalCash: number | null
  /** ledger - verified; null when unverifiable */
  readonly reconciliationDifference: number | null
  readonly verificationStatus: CashVerificationStatus
  readonly sourceRef: SourceRef
  readonly note?: string | null
}

// ─── JJ company position ────────────────────────────────────────────────────────

export interface JjPosition {
  readonly economicProfit: number | null
  readonly economicProfitStatus: SourceStatus
  readonly actualCashLedger: number | null
  readonly cashVerificationStatus: CashVerificationStatus
  readonly receivables: number | null
  readonly payables: number | null
  /** v_money_position is authoritative only for its covered scope (12c) */
  readonly receivablesScope: 'PARTIAL' | 'CERTIFIED'
  readonly sourceRefs: readonly SourceRef[]
}

// ─── Partner current accounts (Layer A) ─────────────────────────────────────────

/** Economic role of a classified partner-related transaction (Stage 2 runtime). */
export type PartnerTxClass =
  | 'REIMBURSABLE_LOAN'          // partner-funded routine expense → JJ owes partner
  | 'CAPITAL'                    // approved capital contribution (needs approved fact)
  | 'JJ_TO_PARTNER'             // reimbursement / withdrawal / distribution paid by JJ
  | 'PARTNER_TO_JJ'             // partner cash contribution to JJ
  | 'INCOME_COLLECTED_BY_PARTNER' // partner personally collected income owed to JJ
  | 'DIRECT_PARTNER_TRANSFER'    // Yossi↔Jacob transfer (purpose-gated)
  | 'CUSTODIAN_MOVEMENT'        // cash to/from a custodian (not a partner) — uncertified
  | 'UNRESOLVED'                // classification/purpose/identity not provable
  | 'EXTERNAL_OR_OTHER'

/** One aggregated component of a partner current account (Layer A). */
export interface PartnerAccountComponent {
  readonly label: string
  readonly klass: PartnerTxClass
  /** signed contribution to CA_P (JJ owes partner = +). */
  readonly amountEur: number
  readonly count: number
  readonly certified: boolean
}

export interface PartnerCurrentAccount {
  readonly party: string
  /**
   * Certified net current account CA_P (JJ owes partner = +), from the certified
   * components only. null when nothing is certifiable. Never includes unresolved
   * magnitudes (P-ARCH-1) and NEVER derived from a cashbox ledger (12b / QA #3).
   */
  readonly ledgerBalanceEur: number | null
  readonly status: SourceStatus
  readonly components: readonly PartnerAccountComponent[]
  /** magnitude of unresolved items touching this partner — informational only */
  readonly unresolvedAmountEur: number | null
  readonly explain: readonly ExplainNode[]
}

/** Aggregated classification outcome (one row per class) for transparency. */
export interface ClassificationSummaryRow {
  readonly klass: PartnerTxClass
  readonly count: number
  readonly amountEur: number
  readonly certified: boolean
}

/** Per-property, per-partner certified/unresolved contribution position (Stage 2). */
export interface PartnerPropertyPosition {
  readonly party: string
  readonly certifiedContributionEur: number
  readonly unresolvedContributionEur: number
}

// ─── Equalization (Layer B, derived, gated) ─────────────────────────────────────

export interface EqualizationHeadline {
  readonly debtor: string | null
  readonly creditor: string | null
  readonly amountEur: number | null
  readonly certificationStatus: CertificationStatus
  /**
   * Hard gate carried through the DTO. The view renders a debtor/creditor
   * sentence ONLY when certificationStatus === 'CERTIFIED' AND this is true.
   * A hand-built CERTIFIED DTO with this false must not bypass the gate.
   */
  readonly canAssertDebtorCreditor: boolean
  readonly blockingReasons: readonly string[]
}

export interface EqualizationView {
  readonly epYossi: number | null
  readonly epJacob: number | null
  /** epYossi + epJacob; must be ~0 before the /2 formula may be applied (12a/11f) */
  readonly symmetryResidual: number | null
  readonly headline: EqualizationHeadline
  readonly certifiedSubtotalEur: number | null
  readonly unresolvedCount: number
  readonly unresolvedAmountEur: number | null
  readonly components: readonly ExplainNode[]
}

// ─── Top-level report ───────────────────────────────────────────────────────────

export interface StatusedValue {
  readonly value: number | null
  readonly status: CertificationStatus
}

export interface PartnerReportBMeta {
  readonly schemaVersion: 'PartnerReportB/stage2'
  readonly periodStart: string
  readonly periodEnd: string
  readonly generatedAt: string
  readonly currency: 'EUR'
  readonly stage: 2
}

export interface PartnerReportB {
  readonly meta: PartnerReportBMeta
  readonly properties: readonly PropertyView[]
  readonly cashboxes: readonly CashboxView[]
  readonly jjPosition: JjPosition
  readonly partnerCurrentAccounts: readonly PartnerCurrentAccount[]
  /** Stage 2: aggregated runtime classification outcome (one row per class). */
  readonly classificationSummary: readonly ClassificationSummaryRow[]
  readonly equalization: EqualizationView
  readonly opening: StatusedValue
  readonly closing: StatusedValue
  readonly unresolved: readonly UnresolvedItem[]
  readonly explain: readonly ExplainNode[]
}
