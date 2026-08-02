/**
 * @module statements/constitutionalTraceTypes
 * @description VS1 — Constitutional Trace types for the 7-stage provenance chain.
 *
 * Every financial conclusion in JJ must be traceable through 7 stages:
 *   Evidence → Business Event → Classification → Business State →
 *   Statement Projection → Interpretation → Authority
 *
 * RC-4: Honest statuses. Each stage reports its REAL implementation state,
 * not a simulated or fabricated one. Gaps are visible — never hidden.
 *
 * @see VS1_PHASE1_REVISED.md — approved implementation plan
 * @see P-ARCH-1: Unknown = NULL. Never 0 or placeholder.
 */

// ─── Stage Status ──────────────────────────────────────────────────────────────

/**
 * Honest status for each constitutional trace stage.
 *
 * RC-4 mandate: every stage must declare its real state.
 * The UI renders these as-is — no simulation, no fabrication.
 */
export type TraceStageStatus =
  | 'IMPLEMENTED'       // Stage is fully operational and producing real data
  | 'RECORDING_ONLY'    // Data is captured but not yet structured/typed
  | 'NOT_POPULATED'     // Infrastructure exists but no data has been entered
  | 'NOT_IMPLEMENTED'   // Stage does not exist in code yet
  | 'UNTYPED'           // Field exists but has no semantic type system

// ─── Individual Stage Traces ───────────────────────────────────────────────────

/**
 * Evidence stage — are the source transactions backed by evidence?
 *
 * Current state: transactions exist in `public.transactions` but no
 * evidence_links are populated for them. The finance.evidence_links
 * table exists (PR #70) but has zero rows linked to transaction data.
 */
export interface EvidenceTrace {
  readonly stage: 'evidence'
  readonly status: TraceStageStatus
  /** Number of source transactions with evidence links */
  readonly linkedCount: number
  /** Number of source transactions without evidence links */
  readonly unlinkedCount: number
  /** Human-readable explanation of the current state */
  readonly explanation: string
}

/**
 * Business Event stage — are transactions grouped into business events?
 *
 * Current state: `business_event_id` column does NOT exist on transactions.
 * Migration 014 has NOT been applied. The `events` schema does NOT exist.
 * BEM v1.1 is APPROVED as a foundational spec but has no implementation.
 */
export interface BusinessEventTrace {
  readonly stage: 'business_event'
  readonly status: TraceStageStatus
  /** Whether business_event_id exists on transactions */
  readonly fieldExists: false
  /** Explanation */
  readonly explanation: string
}

/**
 * Classification stage — are transactions classified by the RC3 engine?
 *
 * Current state: IMPLEMENTED. The RC3 engine (4 views + disposition engine)
 * classifies every transaction into disposition buckets with full traceability.
 * classifyDisposition() produces TransactionDisposition with SHA-256 hashes.
 */
export interface ClassificationTrace {
  readonly stage: 'classification'
  readonly status: 'IMPLEMENTED'
  /** Classifier version from disposition engine */
  readonly classifierVersion: string
  /** Number of rows classified */
  readonly rowsClassified: number
  /** Number of UNRESOLVED rows */
  readonly unresolvedCount: number
  /** Whether the reconciliation invariant holds */
  readonly reconciled: boolean
  /** Explanation */
  readonly explanation: string
}

/**
 * Business State (Computation) stage — is the financial position computed?
 *
 * Current state: IMPLEMENTED. FPE views exist in business_state schema
 * (bs_cash_position, bs_owner_liabilities, bs_capital_state).
 * Statement builder aggregates disposition into account sections.
 */
export interface ComputationTrace {
  readonly stage: 'computation'
  readonly status: 'IMPLEMENTED'
  /** Number of account sections produced */
  readonly accountSectionCount: number
  /** Total balance-affecting rows */
  readonly balanceAffectingRows: number
  /** Whether opening balance is known */
  readonly openingBalanceStatus: string
  /** Whether settlement is computed */
  readonly settlementStatus: string
  /** Explanation */
  readonly explanation: string
}

/**
 * Statement Projection stage — is the data projected into a statement?
 *
 * Current state: IMPLEMENTED. buildStatementPreview() produces
 * StatementBuilderOutput with full disposition, freshness, and finalization gates.
 * canFinalize is always false in VS-1A scope.
 */
export interface ProjectionTrace {
  readonly stage: 'projection'
  readonly status: 'IMPLEMENTED'
  /** Whether statement was successfully built */
  readonly built: true
  /** Whether finalization is allowed (always false in VS-1A) */
  readonly canFinalize: false
  /** Number of finalization blockers */
  readonly blockerCount: number
  /** Explanation */
  readonly explanation: string
}

/**
 * Interpretation stage — is the data interpreted for the reader?
 *
 * Current state: NOT_IMPLEMENTED. No CFO interpretation, no narrative
 * explanation, no contextual commentary exists. The UI renders raw numbers.
 */
export interface InterpretationTrace {
  readonly stage: 'interpretation'
  readonly status: 'NOT_IMPLEMENTED'
  /** Explanation */
  readonly explanation: string
}

/**
 * Authority stage — who/what produced this conclusion?
 *
 * Current state: Explicit. The authority chain is:
 * transactions (source) → RC3 views (classification) → disposition engine
 * (bucketing) → statement builder (assembly). No CFO, no AI interpretation.
 */
export interface AuthorityTrace {
  readonly stage: 'authority'
  readonly status: TraceStageStatus
  /** The authority chain as ordered source list */
  readonly chain: readonly string[]
  /** Explanation */
  readonly explanation: string
}

// ─── Complete Trace ────────────────────────────────────────────────────────────

/**
 * Complete 7-stage constitutional trace for a statement.
 * Every stage is present — gaps are explicit, never hidden.
 */
export interface ConstitutionalTrace {
  /** When this trace was computed */
  readonly computedAt: string

  /** The 7 stages in constitutional order */
  readonly evidence: EvidenceTrace
  readonly businessEvent: BusinessEventTrace
  readonly classification: ClassificationTrace
  readonly computation: ComputationTrace
  readonly projection: ProjectionTrace
  readonly interpretation: InterpretationTrace
  readonly authority: AuthorityTrace

  /** Summary: how many stages are fully IMPLEMENTED */
  readonly implementedCount: number
  /** Summary: total stages */
  readonly totalStages: 7
  /** Ordered list of gap descriptions for non-IMPLEMENTED stages */
  readonly gaps: readonly TraceGap[]
}

/**
 * A gap in the constitutional trace — a stage that is not fully IMPLEMENTED.
 */
export interface TraceGap {
  readonly stage: string
  readonly status: TraceStageStatus
  readonly description: string
}
