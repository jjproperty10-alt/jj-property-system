/**
 * @module finance/buildDecisionExplanation
 * @description Pure function: derives a DecisionExplanation from engine output.
 *
 * DecisionExplanation is the fifth domain object in the Finance Knowledge Graph.
 * It sits above Decision and answers the question:
 *   "Explain this decision in one paragraph."
 *
 * Consumers:
 *   - Audit PDF (future): structured evidence trail
 *   - AI summaries: asks "why was this allowed/blocked?"
 *   - Timeline views: human-readable event descriptions
 *   - DecisionCard header: summary line
 *
 * Constitutional rules:
 *   - NEVER stored independently — derived on demand from the snapshot
 *   - NEVER recomputes Claims or Evidence — takes computed engine output
 *   - NEVER branches on position_score (KG-4)
 *   - Pure function: no DB reads, no side effects
 *
 * @see FINANCIAL_KNOWLEDGE_GRAPH_ADR.md (Layer 5 — Explanation)
 * @see FINANCE_CFO_ARCHITECTURE_ADR.md
 */

import type {
  DecisionEvaluation,
  FinancialPosition,
  DecisionExplanation,
  ClaimExplanationLine,
  FinancialPositionSnapshot,
} from './types'

export interface BuildDecisionExplanationParams {
  decision: DecisionEvaluation
  position: FinancialPosition
  entityLabel: string              // "Jacob"
  periodLabel: string              // "July 2026"
  decidedAt: string                // ISO timestamp
  override?: boolean
  overrideReason?: string | null
}

/**
 * Build a human-readable DecisionExplanation from engine output.
 *
 * Pure function — safe to call anywhere, no async required.
 * Input: pre-computed DecisionEvaluation + FinancialPosition.
 * Output: DecisionExplanation — structured explanation for human/AI consumption.
 */
export function buildDecisionExplanation(
  params: BuildDecisionExplanationParams,
): DecisionExplanation {
  const {
    decision,
    position,
    entityLabel,
    periodLabel,
    decidedAt,
    override = false,
    overrideReason = null,
  } = params

  // ── Claim lines ─────────────────────────────────────────────────────────────
  const claims: ClaimExplanationLine[] = decision.claims.map((c) => ({
    statement: c.statement,
    status: c.status,
    required: c.required,
    confidence: c.confidence,
    gapDescription: c.gap?.description ?? null,
    resolutionSummary: c.gap?.resolutionSteps[0]?.description ?? null,
  }))

  // ── Position snapshot ────────────────────────────────────────────────────────
  const positionSnapshot: FinancialPositionSnapshot = {
    balanceEur: position.balanceEur,
    totalReceivedEur: position.totalReceivedEur,
    totalPaidEur: position.totalPaidEur,
    score: position.score,
    capturedAt: position.computedAt,
  }

  // ── Summary line ─────────────────────────────────────────────────────────────
  const actionLabel = decision.decisionType.replace(/_/g, ' ')
  const summary = decision.allPass
    ? `${entityLabel} — ${actionLabel} approved for ${periodLabel}`
    : `${entityLabel} — ${actionLabel} blocked for ${periodLabel}`

  // ── Full narrative paragraph ──────────────────────────────────────────────────
  const requiredClaims = claims.filter((c) => c.required)
  const supported = requiredClaims.filter((c) => c.status === 'supported')
  const blocked = requiredClaims.filter((c) => c.status === 'unsupported')
  const pending = requiredClaims.filter((c) => c.status === 'pending')

  const parts: string[] = [summary + '.']

  if (supported.length > 0) {
    const items = supported.map((c) => c.statement.toLowerCase()).join('; ')
    parts.push(
      `${supported.length} required claim${supported.length > 1 ? 's' : ''} passed: ${items}.`,
    )
  }

  if (blocked.length > 0) {
    const items = blocked
      .map((c) => `${c.statement.toLowerCase()}${c.gapDescription ? ` (${c.gapDescription})` : ''}`)
      .join('; ')
    parts.push(
      `${blocked.length} required claim${blocked.length > 1 ? 's' : ''} failed: ${items}.`,
    )
  }

  if (pending.length > 0) {
    parts.push(`${pending.length} claim${pending.length > 1 ? 's' : ''} could not be fully evaluated.`)
  }

  if (position.balanceEur !== null) {
    const formatted = `€${Math.abs(position.balanceEur).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    const sign = position.balanceEur >= 0 ? 'positive' : 'negative'
    parts.push(`${entityLabel} cashbox balance was ${sign} at ${formatted}.`)
  }

  if (override && overrideReason) {
    parts.push(`Decision overridden with documented reason: "${overrideReason}".`)
  }

  const narrative = parts.join(' ')

  return {
    decisionType: decision.decisionType,
    entityLabel,
    periodLabel,
    decidedAt,
    allPass: decision.allPass,
    override,
    overrideReason,
    summary,
    narrative,
    claims,
    position: positionSnapshot,
  }
}

// ── Reconstruct from snapshot ─────────────────────────────────────────────────

/**
 * Reconstruct a DecisionExplanation from a stored snapshot.
 *
 * Used during audit: "Explain the decision made on 2026-07-15."
 * The snapshot is the frozen state from decision_log.evidence_chain.
 * This does NOT re-evaluate claims — it reads the historical snapshot only.
 */
export function buildExplanationFromSnapshot(params: {
  snapshot: {
    evaluatedAt: string
    claims: DecisionEvaluation['claims']
    allPass: boolean
    override: boolean
    overrideReason: string | null
    positionSnapshot: FinancialPositionSnapshot
  }
  entityLabel: string
  periodLabel: string
  decisionType: string
}): DecisionExplanation {
  const { snapshot, entityLabel, periodLabel, decisionType } = params

  const claims: ClaimExplanationLine[] = snapshot.claims.map((c) => ({
    statement: c.statement,
    status: c.status,
    required: c.required,
    confidence: c.confidence,
    gapDescription: c.gap?.description ?? null,
    resolutionSummary: c.gap?.resolutionSteps[0]?.description ?? null,
  }))

  const actionLabel = decisionType.replace(/_/g, ' ')
  const summary = snapshot.allPass
    ? `${entityLabel} — ${actionLabel} approved for ${periodLabel}`
    : `${entityLabel} — ${actionLabel} blocked for ${periodLabel}`

  const requiredClaims = claims.filter((c) => c.required)
  const supported = requiredClaims.filter((c) => c.status === 'supported')
  const blocked = requiredClaims.filter((c) => c.status === 'unsupported')

  const parts: string[] = [summary + '.']

  if (supported.length > 0) {
    parts.push(`${supported.length} claim${supported.length > 1 ? 's' : ''} passed.`)
  }
  if (blocked.length > 0) {
    parts.push(`${blocked.length} claim${blocked.length > 1 ? 's' : ''} failed.`)
  }
  if (snapshot.override && snapshot.overrideReason) {
    parts.push(`Overridden: "${snapshot.overrideReason}".`)
  }
  if (snapshot.positionSnapshot.balanceEur !== null) {
    parts.push(
      `Balance at time of decision: €${Math.abs(snapshot.positionSnapshot.balanceEur).toLocaleString('en-US', { minimumFractionDigits: 2 })}.`,
    )
  }

  return {
    decisionType,
    entityLabel,
    periodLabel,
    decidedAt: snapshot.evaluatedAt,
    allPass: snapshot.allPass,
    override: snapshot.override,
    overrideReason: snapshot.overrideReason,
    summary,
    narrative: parts.join(' '),
    claims,
    position: snapshot.positionSnapshot,
  }
}
