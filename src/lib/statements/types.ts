/**
 * @module statements/types
 * @description VS-1A — StatementSourceDisposition DTO + statement builder types.
 *
 * Contract: every source transaction in the statement period is classified into
 * exactly one of four disposition buckets. The invariant holds:
 *
 *   source_rows = BALANCE_AFFECTING + INFORMATIONAL + EXCLUDED + UNRESOLVED
 *
 * R1: Every disposition row carries full source traceability (UUID, amounts, RC3 fields).
 * R3: DraftProvenance structure enables classification drift detection at finalization.
 * R5: SourceFreshnessGate carries structured missing-source data, not decorative labels.
 * R6: Opening balance + settlement use explicit status enums, never format NULL as €0.
 *
 * @see VS1A_P1_1_COMPATIBILITY_REPORT.md — P1-1 compatibility verified
 * @see VS1A_H1_2026_DISPOSITION.md — H1 2026 disposition data
 * @see P-ARCH-1: Unknown = NULL. Never 0 or placeholder.
 * @see P-ARCH-6: Partner-facing types never expose jj_* fields.
 */

// ─── Disposition Buckets ────────────────────────────────────────────────────────

/**
 * Four-state disposition for every source transaction in the statement period.
 *
 * BALANCE_AFFECTING: enters the owner's balance equation (income, expense, BPO)
 * INFORMATIONAL:     displayed but does not affect balance (platform tracking rows)
 * EXCLUDED:          omitted entirely (contract values, internal-only references)
 * UNRESOLVED:        cannot be classified — blocks finalization until resolved
 */
export type DispositionBucket =
  | 'BALANCE_AFFECTING'
  | 'INFORMATIONAL'
  | 'EXCLUDED'
  | 'UNRESOLVED'

/**
 * Maps DisplayGroup (from RC3 engine) to P1-1 balance_effect (for snapshot).
 * Used at finalization time to freeze classification into sent_entry_snapshots.
 */
export type P1BalanceEffect =
  | 'income'
  | 'expense'
  | 'payment_out'
  | 'tracking_only'
  | 'needs_review'
  | 'contract_value'

// ─── Disposition per row (R1: full source traceability) ───────────────────────

/**
 * Classification result for a single source transaction.
 * Produced by the disposition engine from RC3 classification flags.
 *
 * R1: Every field needed to independently verify this row's classification
 * is carried inline — no reconstruction from display labels or aggregated totals.
 */
export interface TransactionDisposition {
  // ── Source identity ──────────────────────────────────────────────────────
  /** Source transaction UUID — maps to statement_draft_lines.source_transaction_id */
  readonly transactionId: string

  /** Transaction date (ISO) */
  readonly transactionDate: string

  /** Property name from transactions table */
  readonly propertyName: string | null

  /** Transaction category */
  readonly category: string

  /** Transaction subcategory */
  readonly subcategory: string | null

  /** Transaction description */
  readonly description: string | null

  /** Who paid */
  readonly payer: string | null

  /** Who received */
  readonly payee: string | null

  // ── Source amounts (never substituted for each other) ────────────────────
  /** JJ internal cost — from transactions.amount_eur */
  readonly amountEur: number

  /** Client-facing charge — from transactions.client_charge (may be null) */
  readonly clientCharge: number | null

  /** The amount entering the statement: COALESCE(client_charge, amount_eur) — from RC3 view */
  readonly clientAmountEur: number

  // ── RC3 classification ──────────────────────────────────────────────────
  /** RC3 account type (sale/renovation/rental/airbnb) */
  readonly accountType: string

  /** RC3 contract value flag */
  readonly isContractValue: boolean

  /** RC3 platform tracking flag */
  readonly isPlatformTracking: boolean

  /** RC3 bank payment to owner flag */
  readonly isBpo: boolean

  /** RC3 balance-affecting flag (from computeBalance) */
  readonly isBalanceAffecting: boolean

  // ── Disposition result ──────────────────────────────────────────────────
  /** Which bucket this row falls into */
  readonly bucket: DispositionBucket

  /** P1-1 balance_effect value for snapshot creation */
  readonly balanceEffect: P1BalanceEffect

  /** RC3 display_group for UI rendering */
  readonly displayGroup: 'income' | 'expense' | 'payment_out' | 'info' | 'reference'

  /** RC3 display_label for UI rendering */
  readonly displayLabel: string

  /** The signed balance effect (from RC3 enrichment) */
  readonly signedBalanceEffect: number

  /** Human-readable reason for the disposition */
  readonly reason: string

  /** Whether this row is included in financial arithmetic */
  readonly includedInArithmetic: boolean

  // ── Drift detection (R3) ────────────────────────────────────────────────
  /** Classifier version that produced this disposition */
  readonly classifierVersion: string

  /** SHA-256 of the source data fields used for classification */
  readonly sourceDataHash: string
}

// ─── Disposition Summary ────────────────────────────────────────────────────────

/**
 * Aggregate disposition for a statement period.
 * Enforces the reconciliation invariant.
 */
export interface DispositionSummary {
  /** Total source rows in the period */
  readonly sourceRows: number

  /** Rows per bucket */
  readonly balanceAffecting: number
  readonly informational: number
  readonly excluded: number
  readonly unresolved: number

  /** Whether the invariant holds: sourceRows === sum of all buckets */
  readonly reconciled: boolean

  /** Per-row disposition details (full traceability — R1) */
  readonly rows: readonly TransactionDisposition[]

  /** Financial totals (balance-affecting rows only) */
  readonly totals: {
    /** Sum of client_amount for income rows */
    readonly totalIncomeEur: number
    /** Sum of client_amount for expense rows */
    readonly totalExpensesEur: number
    /** Sum of client_amount for BPO rows */
    readonly totalBpoEur: number
    /** Sum of signed balance effects */
    readonly closingBalanceContribution: number
  }

  /** Source amount totals for reconciliation (R2) */
  readonly sourceAmounts: {
    /** Sum of amount_eur across all rows */
    readonly totalAmountEur: number
    /** Sum of client_charge (non-null) across all rows */
    readonly totalClientChargeEur: number
    /** Count of rows where client_charge ≠ amount_eur (markup rows) */
    readonly markupRowCount: number
    /** Total markup value (client_charge - amount_eur for markup rows) */
    readonly totalMarkupEur: number
  }

  /** Draft provenance for drift detection (R3) */
  readonly provenance: DraftProvenance
}

// ─── Draft Provenance (R3: classification drift protection) ────────────────────

/**
 * Deterministic provenance structure that enables detection of classification
 * drift between preview and finalization.
 *
 * At finalization time, the current provenance is recomputed and compared to
 * the draft provenance. Any mismatch blocks finalization.
 */
export interface DraftProvenance {
  /** Version of the classifier that produced this disposition */
  readonly classifierVersion: string

  /** Statement period boundaries */
  readonly periodStart: string
  readonly periodEnd: string

  /** Timestamp when this disposition was computed */
  readonly computedAt: string

  /** Sorted list of source transaction UUIDs */
  readonly sortedSourceIds: readonly string[]

  /** SHA-256 of the sorted source ID list */
  readonly sourceSetHash: string

  /** Per-row disposition hashes (same order as sortedSourceIds) */
  readonly rowDispositionHashes: readonly string[]

  /** SHA-256 of the complete disposition set (all row hashes concatenated) */
  readonly aggregateDispositionHash: string
}

// ─── Source Freshness (R5: structured, not decorative) ──────────────────────────

/**
 * Source-freshness gate. Statement cannot be finalized unless
 * all data sources are proven to be synced through the period end date.
 *
 * R5: Carries structured missing-source data, not just a label.
 */
export type FreshnessStatus =
  | 'VERIFIED'                // all sources confirmed synced through period end
  | 'DATA_FRESHNESS_UNKNOWN'  // cannot confirm sync completeness
  | 'STALE'                   // source data known to be behind period end

/** Individual data source freshness */
export interface SourceFreshnessEntry {
  readonly sourceName: string   // e.g. 'transactions', 'hostaway_reservations'
  readonly lastVerified: string | null  // ISO timestamp or null if never verified
  readonly requiredCutoff: string  // ISO date — must be synced through this date
  readonly isSufficient: boolean   // lastVerified >= requiredCutoff
}

export interface SourceFreshnessGate {
  readonly status: FreshnessStatus
  readonly periodEnd: string  // ISO date
  readonly lastVerifiedSourceTimestamp: string | null  // latest verification across all sources
  readonly requiredCutoff: string  // ISO date — all sources must be synced through this
  readonly missingSources: readonly string[]  // source names that are not verified
  readonly freshnessBlockerReason: string | null  // why finalization is blocked, or null
  readonly sources: readonly SourceFreshnessEntry[]  // per-source detail
  readonly message: string  // human-readable summary
}

// ─── Statement Builder Output ───────────────────────────────────────────────────

/** Opening balance status — explicit enum, never format NULL as €0 (R6) */
export type OpeningBalanceStatus =
  | 'NULL'                      // not yet determined
  | 'PENDING_RECONCILIATION'    // reconciliation in progress
  | 'CONFIRMED'                 // verified and locked

/** Settlement status (R6) */
export type SettlementStatus =
  | 'NOT_YET_COMPUTED'  // settlement engine has not run
  | 'PENDING_APPROVAL'  // computed, awaiting approval
  | 'CONFIRMED'         // approved and locked

/**
 * Complete VS-1A statement builder output.
 * Contains everything needed for the Partner Workspace UI and
 * eventual P1-1 draft creation (when authorized).
 */
export interface StatementBuilderOutput {
  /** Investor identity */
  readonly investorName: string
  readonly investorEntityId: string

  /** Property identity */
  readonly propertyName: string

  /** Statement period */
  readonly periodStart: string   // ISO date
  readonly periodEnd: string     // ISO date

  /** Disposition result (R1: full source traceability) */
  readonly disposition: DispositionSummary

  /** Source freshness assessment (R5: structured) */
  readonly freshness: SourceFreshnessGate

  /** Opening balance state (R6: explicit status, NULL ≠ €0) */
  readonly openingBalance: {
    readonly status: OpeningBalanceStatus
    readonly valueEur: number | null  // null when status is NULL or PENDING_RECONCILIATION
    readonly source: string | null
  }

  /** Settlement state (R6) */
  readonly settlement: {
    readonly status: SettlementStatus
    readonly valueEur: number | null  // null when not_yet_computed
  }

  /** Whether finalization is allowed (all gates must pass) */
  readonly canFinalize: boolean

  /** Reasons finalization is blocked */
  readonly finalizationBlockers: readonly string[]

  /** RC3 account sections (for detailed display) */
  readonly accountSections: readonly AccountSectionSummary[]

  /** Statement type for P1-1 */
  readonly statementType: 'investor_statement'

  /** Ownership percentage (from lifecycle) */
  readonly ownershipPct: number | null

  /** Generation timestamp */
  readonly generatedAt: string
}

/**
 * Account section summary for UI display.
 */
export interface AccountSectionSummary {
  readonly accountType: string
  readonly accountLabel: string
  readonly totalIncomeEur: number
  readonly totalExpensesEur: number
  readonly netEur: number
  readonly rowCount: number
}

// ─── P1-1 Draft Line Input ──────────────────────────────────────────────────────

/**
 * Input for add_draft_line() RPC — one per BALANCE_AFFECTING row.
 * NOT called in VS-1A (STOP condition). Defined for type safety.
 */
export interface DraftLineInput {
  readonly sourceTransactionId: string
  readonly releaseAmountEur: number
  readonly includeInStatement: boolean
  readonly lineNotes: string | null
}

/**
 * Input for send_statement() p_entries JSONB — freezes classification at finalization.
 * NOT called in VS-1A (STOP condition). Defined for type safety.
 */
export interface SnapshotEntryInput {
  readonly source_transaction_id: string
  readonly released_amount_eur: number
  readonly signed_balance_effect_eur: number
  readonly is_balance_affecting: boolean
  readonly is_bpo: boolean
  readonly balance_effect: P1BalanceEffect
  readonly display_group: string | null
  readonly display_label: string | null
}
