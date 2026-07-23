/**
 * @module finance/computeFinancialPosition
 * @description Assembles FinancialPosition from all active ClaimEvaluations.
 *
 * Position is the composite read model — the totality of what we know.
 * It is computed on demand. Never stored. Never cached.
 *
 * Constitutional rules:
 *   IL-3: FinancialPosition is NEVER stored as a table.
 *   KG-4: score.total is descriptive. NEVER used as a decision gate.
 *   Position Score formula: coverage(0.25) + consistency(0.40) + evidence(0.35)
 *     — from FINANCE_CFO_VIEW_SPEC_v1.0.md. Weights are constants.
 *
 * @see FINANCIAL_KNOWLEDGE_GRAPH_ADR.md (Layer 3 — Position)
 * @see FINANCE_CFO_ARCHITECTURE_ADR.md (computeFinancialPosition contract)
 */

import 'server-only'
import { createServiceClient } from '@/lib/supabase'
import { evaluateClaim } from './evaluateClaim'
import type {
  FinancialPosition,
  PositionScore,
  ClaimEvaluation,
  Blocker,
} from './types'
import { POSITION_SCORE_WEIGHTS } from './types'

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function loadCashboxData(entityId: string): Promise<{
  balance: number | null
  totalReceived: number | null
  totalPaid: number | null
}> {
  const db = createServiceClient()
  const { data, error } = await db
    .from('v_cashbox_audit')
    .select('cash_box_name, balance, total_received, total_paid')
    .eq('cash_box_name', entityId)
    .maybeSingle()

  if (error || !data) return { balance: null, totalReceived: null, totalPaid: null }
  return {
    balance: data.balance !== null ? Number(data.balance) : null,
    totalReceived: data.total_received !== null ? Number(data.total_received) : null,
    totalPaid: data.total_paid !== null ? Number(data.total_paid) : null,
  }
}

async function loadClaimTemplateIds(
  entityType: string,
  decisionType?: string,
): Promise<string[]> {
  const db = createServiceClient()
  let q = db.schema('finance').from('claim_templates').select('id, decision_type')
  if (decisionType) q = q.eq('decision_type', decisionType)
  const { data, error } = await q
  if (error || !data) return []
  return data.map((r: { id: string }) => r.id)
}

/**
 * Compute Position Score from claim evaluations.
 *
 * KG-4: The result MUST NOT be used in any conditional branch.
 * Formula (locked in spec): coverage(0.25) + consistency(0.40) + evidence(0.35)
 */
function computePositionScore(claims: ClaimEvaluation[]): PositionScore {
  const required = claims.filter((c) => c.required)
  if (required.length === 0) {
    return { total: 0, coverage: 0, consistency: 0, evidence: 0 }
  }

  // Coverage: percentage of required claims that are supported
  const supported = required.filter((c) => c.status === 'supported').length
  const coverage = Math.round((supported / required.length) * 100)

  // Consistency: no conflicting evidence (claims with 'pending' reduce consistency)
  const pending = required.filter((c) => c.status === 'pending').length
  const consistency = Math.round(((required.length - pending) / required.length) * 100)

  // Evidence: average confidence across required claims
  const avgConfidence = required.reduce((sum, c) => sum + c.confidence, 0) / required.length
  const evidence = Math.round(avgConfidence)

  const total = Math.round(
    coverage * POSITION_SCORE_WEIGHTS.coverage +
    consistency * POSITION_SCORE_WEIGHTS.consistency +
    evidence * POSITION_SCORE_WEIGHTS.evidence,
  )

  return { total, coverage, consistency, evidence }
}

function deriveBlockers(claims: ClaimEvaluation[], decisionType: string): Blocker[] {
  return claims
    .filter((c) => c.required && c.status === 'unsupported')
    .map((c) => ({
      claim: c,
      decisionType,
      entityId: c.entityId,
      impact: 'high' as const,
      resolutionSteps: c.gap?.resolutionSteps ?? [],
      confidenceBefore: c.confidence,
      confidenceAfter: c.gap?.confidenceAfter ?? 0,
      estimatedEffortMinutes:
        c.gap?.resolutionSteps.reduce((sum, s) => sum + s.estimatedEffortMinutes, 0) ?? 0,
    }))
}

// ─── Public API ──────────────────────────────────────────────────────────────

export interface ComputeFinancialPositionParams {
  entityId: string
  entityType: string
  periodStart: Date
  periodEnd: Date
  decisionType?: string   // if provided: evaluate only claims for this decision type
}

/**
 * Compute the FinancialPosition for an entity.
 *
 * This is the Position layer: composite read model assembled from all ClaimEvaluations.
 * Result is NEVER stored — caller must snapshot it if needed (via logDecision).
 */
export async function computeFinancialPosition(
  params: ComputeFinancialPositionParams,
): Promise<FinancialPosition> {
  const { entityId, entityType, periodStart, periodEnd, decisionType } = params

  // Load claim template IDs (filtered by decisionType if provided)
  const templateIds = await loadClaimTemplateIds(entityType, decisionType)

  // Evaluate all claims in parallel
  const claims: ClaimEvaluation[] = await Promise.all(
    templateIds.map((templateId) =>
      evaluateClaim({ templateId, entityId, entityType, periodStart, periodEnd }),
    ),
  )

  // Load cashbox data for balance display
  const cashbox = await loadCashboxData(entityId)

  // Compute score (descriptive only — KG-4)
  const score = computePositionScore(claims)

  // Derive blockers from unsupported required claims
  const activeDecisionType = decisionType ?? 'approve_withdrawal'
  const blockers = deriveBlockers(claims, activeDecisionType)

  // Determine allowed/blocked decisions
  // Gate is allPass across required claims — NOT score threshold (KG-4)
  const requiredClaims = claims.filter((c) => c.required)
  const allPass = requiredClaims.every((c) => c.status === 'supported')
  const allowedDecisions = allPass ? [activeDecisionType] : []
  const blockedDecisions = allPass ? [] : [activeDecisionType]

  return {
    entityId,
    entityType,
    periodStart: periodStart.toISOString().split('T')[0],
    periodEnd: periodEnd.toISOString().split('T')[0],
    computedAt: new Date().toISOString(),
    balanceEur: cashbox.balance,
    totalReceivedEur: cashbox.totalReceived,
    totalPaidEur: cashbox.totalPaid,
    claims,
    blockers,
    score,
    allowedDecisions,
    blockedDecisions,
  }
}
