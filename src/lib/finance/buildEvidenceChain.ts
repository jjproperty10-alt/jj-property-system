/**
 * @module finance/buildEvidenceChain
 * @description Pure function: builds the Evidence → Claim trace for display and snapshot.
 *
 * This is a pure function — no DB reads, no side effects.
 * Input: ClaimEvaluation[] from an already-computed DecisionEvaluation or Position.
 * Output: EvidenceChainNode[] ordered for display in the UI.
 *
 * The snapshot stored in decision_log.evidence_chain contains raw ClaimEvaluation[]
 * (not EvidenceChainNode[]) for maximum reconstructability. EvidenceChainNode[] is
 * derived from the snapshot on demand via this function.
 *
 * KG-5: Every layer must be explainable. This function makes that explainability concrete.
 *
 * @see FINANCIAL_KNOWLEDGE_GRAPH_ADR.md (KG-5)
 */

import type { ClaimEvaluation, EvidenceChainNode } from './types'

/**
 * Build the Evidence Chain from a set of ClaimEvaluations.
 *
 * Pure function — safe to call anywhere, no async required.
 * Used by:
 *   1. UI: EvidenceChainDrawer renders this for the human reviewer
 *   2. Audit: reconstruct display order from historical snapshot
 */
export function buildEvidenceChain(claims: ClaimEvaluation[]): EvidenceChainNode[] {
  // Order: unsupported required first (blockers), then pending, then supported
  const sorted = [...claims].sort((a, b) => {
    const priority = { unsupported: 0, pending: 1, supported: 2 }
    const aPriority = a.required ? priority[a.status] : 10
    const bPriority = b.required ? priority[b.status] : 10
    if (aPriority !== bPriority) return aPriority - bPriority
    return a.templateId.localeCompare(b.templateId)
  })

  return sorted.map((claim): EvidenceChainNode => ({
    claimId: claim.templateId,
    statement: claim.statement,
    status: claim.status,
    required: claim.required,
    evidence: claim.evidenceLinks,
    gap: claim.gap,
    confidence: claim.confidence,
    strength: claim.strength,
  }))
}
