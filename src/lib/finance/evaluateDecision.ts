/**
 * @module finance/evaluateDecision
 * @description Evaluates whether a Decision is currently allowed or blocked.
 *
 * This is the Decision layer of the Finance Knowledge Graph.
 * A Decision is allowed when ALL required Claims are supported.
 * The gate is allPass = true — NOT a score comparison (KG-4).
 *
 * ADR-005: This function computes a DecisionEvaluation (state = Evaluated).
 * Only when the human acts on an Allowed decision does logDecision() run (state = Executed).
 * evaluateDecision() itself produces NO log entry.
 *
 * @see ADR-005_DECISION_LIFECYCLE.md (IL-6: Blocked is a computational state, not an event)
 * @see FINANCIAL_KNOWLEDGE_GRAPH_ADR.md (Layer 4 — Decision)
 */

import 'server-only'
import { evaluateClaim } from './evaluateClaim'
import type { DecisionEvaluation, ClaimEvaluation } from './types'
import { createServiceClient } from '@/lib/supabase'

async function loadRequiredTemplates(decisionType: string): Promise<string[]> {
  const db = createServiceClient()
  const { data, error } = await db
    .schema('finance')
    .from('claim_templates')
    .select('id')
    .eq('decision_type', decisionType)
    .eq('required', true)
  if (error || !data) return []
  return data.map((r: { id: string }) => r.id)
}

export interface EvaluateDecisionParams {
  decisionType: string
  entityId: string
  entityType: string
  periodStart: Date
  periodEnd: Date
}

/**
 * Evaluate whether a Decision is currently allowed.
 *
 * Returns DecisionEvaluation — computed, NEVER stored.
 * ADR-005 IL-6: This function produces NO log entry.
 * Only logDecision() (called after human authorization) creates a log entry.
 */
export async function evaluateDecision(
  params: EvaluateDecisionParams,
): Promise<DecisionEvaluation> {
  const { decisionType, entityId, entityType, periodStart, periodEnd } = params

  const templateIds = await loadRequiredTemplates(decisionType)

  const claims: ClaimEvaluation[] = await Promise.all(
    templateIds.map((templateId) =>
      evaluateClaim({ templateId, entityId, entityType, periodStart, periodEnd }),
    ),
  )

  // allPass = ALL required claims are supported
  // KG-4: this boolean is the gate — NOT score
  const allPass = claims.every((c) => c.status === 'supported')
  const blockedBy = claims.filter((c) => c.status === 'unsupported')

  // Overall confidence = min confidence across required claims
  // (chain is only as strong as weakest link)
  const overallConfidence =
    claims.length === 0 ? 0 : Math.min(...claims.map((c) => c.confidence))

  const overallStrength =
    claims.length === 0 ? 0 : Math.min(...claims.map((c) => c.strength))

  return {
    decisionType,
    entityId,
    entityType,
    periodStart: periodStart.toISOString().split('T')[0],
    periodEnd: periodEnd.toISOString().split('T')[0],
    evaluatedAt: new Date().toISOString(),
    claims,
    allPass,
    blockedBy,
    overallConfidence,
    overallStrength,
  }
}
