/**
 * @module finance
 * @description Finance Knowledge Graph — public API barrel.
 *
 * Only server-safe exports. All functions are server-only.
 * DO NOT import this from client components.
 *
 * Consumers:
 *   - src/app/finance/decision/[partner]/[period]/page.tsx (Server Component)
 *   - Future: API routes, scheduled jobs, reporting pipeline
 *
 * @see FINANCIAL_KNOWLEDGE_GRAPH_ADR.md
 * @see FINANCE_CFO_ARCHITECTURE_ADR.md
 */

// Types (no server-only restriction — types are compile-time only)
export type {
  EvidenceSourceType,
  EvidenceStrength,
  EvidenceValidityStatus,
  EvidenceLink,
  ResolutionStep,
  EvidenceGap,
  ClaimStatus,
  ClaimTemplate,
  ClaimEvaluation,
  Blocker,
  PositionScore,
  FinancialPositionSnapshot,
  FinancialPosition,
  DecisionEvaluation,
  SnapshotEvidenceChain,
  EvidenceChainNode,
  PositionScoreDelta,
  ClaimExplanationLine,
  DecisionExplanation,
} from './types'

export {
  EVIDENCE_STRENGTH_WEIGHTS,
  POSITION_SCORE_WEIGHTS,
} from './types'

// Service functions (server-only)
export { evaluateClaim } from './evaluateClaim'
export type { EvaluateClaimParams } from './evaluateClaim'

export { computeFinancialPosition } from './computeFinancialPosition'
export type { ComputeFinancialPositionParams } from './computeFinancialPosition'

export { evaluateDecision } from './evaluateDecision'
export type { EvaluateDecisionParams } from './evaluateDecision'

export { buildEvidenceChain } from './buildEvidenceChain'

export { logDecision } from './logDecision'
export type { LogDecisionParams } from './logDecision'

export { buildDecisionExplanation, buildExplanationFromSnapshot } from './buildDecisionExplanation'
export type { BuildDecisionExplanationParams } from './buildDecisionExplanation'
