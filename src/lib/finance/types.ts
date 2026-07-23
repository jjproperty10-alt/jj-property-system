/**
 * @module finance/types
 * @description Finance Knowledge Graph — Domain Type Contracts.
 *
 * Four-layer model (FINANCIAL_KNOWLEDGE_GRAPH_ADR.md):
 *   Evidence → Claim → Position → Decision
 *
 * Constitutional rules encoded here:
 *   IL-2: ClaimEvaluation is NEVER a stored table — computed only
 *   IL-3: FinancialPosition is NEVER a stored table — computed only
 *   KG-4: Decision gate is `allPass = true`, NOT a score threshold
 *   ADR-005: Only Executed decisions create log entries
 *
 * NEVER import from client components. Server-only module chain.
 */

// ─── Evidence layer ──────────────────────────────────────────────────────────

export type EvidenceSourceType = 'bank' | 'invoice' | 'contract' | 'whatsapp' | 'manual'
export type EvidenceStrength = 'primary' | 'secondary' | 'supporting' | 'attestation'
export type EvidenceValidityStatus = 'active' | 'needs_renewal' | 'expired'

/**
 * Ground truth. Immutable after creation.
 * Source: finance.evidence_links
 */
export interface EvidenceLink {
  readonly id: string
  readonly transactionRef: string | null
  readonly entityId: string
  readonly entityType: string
  readonly periodStart: string | null     // ISO date 'YYYY-MM-DD'
  readonly periodEnd: string | null       // ISO date 'YYYY-MM-DD'
  readonly sourceType: EvidenceSourceType
  readonly strength: EvidenceStrength
  readonly sourceRef: string | null
  readonly description: string | null
  readonly verifiedAt: string             // ISO timestamp
  readonly validUntil: string | null      // ISO timestamp
  readonly validityStatus: EvidenceValidityStatus
  readonly confidence: number | null      // 0–100
}

export interface ResolutionStep {
  readonly action: string
  readonly description: string
  readonly estimatedEffortMinutes: number
}

export interface EvidenceGap {
  readonly missingType: EvidenceSourceType
  readonly description: string
  readonly resolutionSteps: ResolutionStep[]
  readonly confidenceAfter: number        // 0–100 — confidence if gap resolved
}

// ─── Claim layer ─────────────────────────────────────────────────────────────

export type ClaimStatus = 'supported' | 'unsupported' | 'pending'

/**
 * Policy definition. Stored in finance.claim_templates.
 */
export interface ClaimTemplate {
  readonly id: string
  readonly decisionType: string
  readonly statement: string
  readonly required: boolean
  readonly evaluationFn: string
  readonly evidenceTypes: EvidenceSourceType[]
}

/**
 * Computed on demand from Evidence. NEVER stored as rows.
 * Snapshotted inside decision_log.evidence_chain at decision time.
 *
 * IL-2: This type MUST NOT become a database table.
 */
export interface ClaimEvaluation {
  readonly templateId: string
  readonly entityId: string
  readonly entityType: string
  readonly periodStart: string            // ISO date
  readonly periodEnd: string             // ISO date
  readonly evaluatedAt: string           // ISO timestamp
  readonly status: ClaimStatus
  readonly confidence: number            // 0–100: how well evidence proves the claim
  readonly strength: number              // 0–1.0: weighted quality of evidence type
  readonly evidenceLinks: EvidenceLink[]
  readonly gap: EvidenceGap | null       // null when status = 'supported'
  readonly statement: string             // human-readable assertion
  readonly required: boolean
}

/**
 * A Blocker IS a ClaimEvaluation where required=true and status='unsupported'.
 * NEVER stored independently.
 */
export interface Blocker {
  readonly claim: ClaimEvaluation
  readonly decisionType: string
  readonly entityId: string
  readonly impact: 'critical' | 'high' | 'medium' | 'low'
  readonly resolutionSteps: ResolutionStep[]
  readonly confidenceBefore: number
  readonly confidenceAfter: number
  readonly estimatedEffortMinutes: number
}

// ─── Position layer ──────────────────────────────────────────────────────────

export interface PositionScore {
  readonly total: number                  // 0–100
  readonly coverage: number              // 0–100
  readonly consistency: number           // 0–100
  readonly evidence: number              // 0–100
}

/**
 * Computed on demand. NEVER stored. NEVER cached.
 * Snapshotted inside decision_log.evidence_chain at decision time.
 *
 * IL-3: This type MUST NOT become a database table.
 * KG-4: score.total MUST NOT be used as a decision gate.
 */
export interface FinancialPosition {
  readonly entityId: string
  readonly entityType: string
  readonly periodStart: string
  readonly periodEnd: string
  readonly computedAt: string
  // Balance data from cashbox view
  readonly balanceEur: number | null
  readonly totalReceivedEur: number | null
  readonly totalPaidEur: number | null
  // All claims evaluated for this entity/period
  readonly claims: ClaimEvaluation[]
  // Derived: required claims where status = 'unsupported'
  readonly blockers: Blocker[]
  // Score — descriptive only, NEVER a decision gate (KG-4)
  readonly score: PositionScore
  // Decision availability — derived from allPass across claims per decision_type
  readonly allowedDecisions: string[]
  readonly blockedDecisions: string[]
}

// ─── Decision layer ──────────────────────────────────────────────────────────

/**
 * Computed on demand. NEVER stored independently.
 * ADR-005: Only Executed decisions create log entries.
 */
export interface DecisionEvaluation {
  readonly decisionType: string
  readonly entityId: string
  readonly entityType: string
  readonly periodStart: string
  readonly periodEnd: string
  readonly evaluatedAt: string
  readonly claims: ClaimEvaluation[]
  readonly allPass: boolean               // THE gate — not score
  readonly blockedBy: ClaimEvaluation[]   // required claims where status = 'unsupported'
  readonly overallConfidence: number      // min confidence across required claims
  readonly overallStrength: number        // min strength across required claims
}

// ─── Position Snapshot (frozen at decision execution time) ────────────────────

/**
 * Immutable freeze of the financial position at the exact moment of execution.
 * Stored inside decision_log.evidence_chain.positionSnapshot (JSONB).
 *
 * This answers: "What was Jacob's position WHEN the decision was made?"
 * Not: "What is Jacob's position today?"
 *
 * Without this, re-querying v_cashbox_audit after ledger changes would give
 * a different balance — making the decision unexplainable in audit.
 */
export interface FinancialPositionSnapshot {
  readonly balanceEur: number | null
  readonly totalReceivedEur: number | null
  readonly totalPaidEur: number | null
  readonly score: PositionScore              // full 3-axis snapshot
  readonly capturedAt: string               // ISO timestamp — when position was computed
}

// Snapshot stored inside decision_log.evidence_chain (jsonb)
export interface SnapshotEvidenceChain {
  readonly evaluatedAt: string
  readonly claims: ClaimEvaluation[]
  readonly allPass: boolean
  readonly override: boolean
  readonly overrideReason: string | null
  /**
   * RC2: Second approver via DAL Approve dimension.
   * PR #1: always null — single-approver override records reason only.
   * TODO: RC2 — enforce that overrideApprovedBy ≠ decidedBy and has DAL.Approve
   */
  readonly overrideApprovedBy: string | null
  /**
   * Full position freeze at execution time.
   * Enables reconstruction: "Why was this decision made?" years later.
   */
  readonly positionSnapshot: FinancialPositionSnapshot
}

// ─── Decision Explanation (derived, never stored) ─────────────────────────────

/**
 * One line per claim, simplified for human consumption.
 * Used by: Audit PDF, AI summaries, Timeline views, DecisionCard header.
 */
export interface ClaimExplanationLine {
  readonly statement: string
  readonly status: ClaimStatus
  readonly required: boolean
  readonly confidence: number
  readonly gapDescription: string | null
  readonly resolutionSummary: string | null    // first resolution step, condensed
}

/**
 * Human-readable explanation of a Decision.
 * Domain object — distinct from Evidence/Claim/Position/Decision layers.
 * Derived by buildDecisionExplanation() — pure function, never stored.
 *
 * Consumers: AI summary, Audit trail PDF, Timeline, DecisionCard header.
 * "Every Decision must be explainable in one paragraph." — KG-5 extension.
 */
export interface DecisionExplanation {
  readonly decisionType: string
  readonly entityLabel: string             // "Jacob"
  readonly periodLabel: string             // "July 2026"
  readonly decidedAt: string              // ISO timestamp
  readonly allPass: boolean
  readonly override: boolean
  readonly overrideReason: string | null
  readonly summary: string               // "Jacob — approve withdrawal approved for July 2026"
  readonly narrative: string             // Full paragraph explanation
  readonly claims: ClaimExplanationLine[]
  readonly position: FinancialPositionSnapshot
}

// For UI: Evidence → Claim trace
export interface EvidenceChainNode {
  readonly claimId: string
  readonly statement: string
  readonly status: ClaimStatus
  readonly required: boolean
  readonly evidence: EvidenceLink[]
  readonly gap: EvidenceGap | null
  readonly confidence: number
  readonly strength: number
}

// ─── Score delta (append-only audit log) ─────────────────────────────────────

/**
 * Append-only record of position score changes.
 * Stored in finance.position_score_deltas.
 * IL-4: This table is append-only. Triggers block UPDATE/DELETE.
 */
export interface PositionScoreDelta {
  readonly id: string
  readonly entityType: string
  readonly entityId: string
  readonly fromScore: number | null       // null for first entry
  readonly toScore: number
  readonly deltaCoverage: number
  readonly deltaConsistency: number
  readonly deltaEvidence: number
  readonly triggerEvent: string           // e.g. 'decision_logged:approve_withdrawal'
  readonly triggeredBy: string            // jj_staff_config.id
  readonly occurredAt: string             // ISO timestamp, server-set
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** Evidence strength weights. primary=1.0 … attestation=0.2 */
export const EVIDENCE_STRENGTH_WEIGHTS: Record<EvidenceStrength, number> = {
  primary:     1.0,
  secondary:   0.7,
  supporting:  0.4,
  attestation: 0.2,
}

/**
 * Position score formula weights.
 * From FINANCE_CFO_VIEW_SPEC_v1.0.md — tunable but requires product approval to change.
 *
 * KG-4 enforcement: these weights compute a DESCRIPTIVE score only.
 * No code may branch on the resulting total.
 */
export const POSITION_SCORE_WEIGHTS = {
  coverage:    0.25,
  consistency: 0.40,
  evidence:    0.35,
} as const
