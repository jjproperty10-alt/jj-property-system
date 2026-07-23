/**
 * @module finance/logDecision
 * @description Records an Executed Decision in the append-only decision_log.
 *
 * This is the ONLY function that writes to finance.decision_log.
 * It is called ONLY when a human authorizes and acts on a Decision (state = Executed).
 *
 * ADR-005 constitutional rules enforced:
 *   IL-1: decision_log is append-only — this function INSERTs only, never UPDATE/DELETE
 *   IL-4: position_score_deltas is append-only — score change is appended if changed
 *   IL-6: Only Executed decisions create log entries — evaluateDecision() does NOT call this
 *
 * Override rules — PR #1:
 *   - override is NOT permitted in PR #1. logDecision() throws if override = true.
 *   - Dual-approval override (requester + second approver via DAL.Approve) is deferred to RC2.
 *   - Attempting to override in PR #1 returns an explicit "not available" error — not a silent no-op.
 *
 * Override rules — RC2 (future):
 *   - override_reason must be non-empty
 *   - override_approved_by must be a DIFFERENT staff member with DAL.Approve for this decisionType
 *   - Both must be server-derived from authenticated sessions — no client input
 *
 * @see ADR-005_DECISION_LIFECYCLE.md
 * @see FINANCE_CFO_ARCHITECTURE_ADR.md (Section 7 — logDecision contract)
 */

import 'server-only'
import { createServiceClient } from '@/lib/supabase'
import type {
  ClaimEvaluation,
  FinancialPosition,
  SnapshotEvidenceChain,
  FinancialPositionSnapshot,
  PositionScoreDelta,
} from './types'
// buildEvidenceChain is the UI ordering function — not needed for the snapshot itself
// (snapshot stores raw ClaimEvaluation[] for future re-derivation)

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function getLastPositionScore(
  entityId: string,
  entityType: string,
): Promise<number | null> {
  const db = createServiceClient()
  const { data, error } = await db
    .schema('finance')
    .from('position_score_deltas')
    .select('to_score')
    .eq('entity_id', entityId)
    .eq('entity_type', entityType)
    .order('occurred_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data) return null
  return Number(data.to_score)
}

async function appendScoreDelta(
  delta: Omit<PositionScoreDelta, 'id' | 'occurredAt'>,
): Promise<void> {
  const db = createServiceClient()
  const { error } = await db.schema('finance').from('position_score_deltas').insert({
    entity_type: delta.entityType,
    entity_id: delta.entityId,
    from_score: delta.fromScore,
    to_score: delta.toScore,
    delta_coverage: delta.deltaCoverage,
    delta_consistency: delta.deltaConsistency,
    delta_evidence: delta.deltaEvidence,
    trigger_event: delta.triggerEvent,
    triggered_by: delta.triggeredBy,
  })
  if (error) throw new Error(`position_score_deltas INSERT failed: ${error.message}`)
}

// ─── Public API ──────────────────────────────────────────────────────────────

export interface LogDecisionParams {
  decisionType: string
  entityId: string
  entityType: string
  periodStart: Date
  periodEnd: Date
  decidedBy: string                    // jj_staff_config.id (UUID)
  claims: ClaimEvaluation[]            // current evaluation snapshot
  position: FinancialPosition          // current position snapshot
  override?: boolean
  overrideReason?: string
  // overrideApprovedBy: intentionally absent in PR #1.
  // RC2: second approver UUID, server-derived, must ≠ decidedBy.
  amountEur?: number
  notes?: string
}

/**
 * Record an Executed Decision.
 *
 * This is the transition from Allowed → Executed → Logged.
 * After this function completes, the Decision is in Auditable Forever state.
 *
 * Validates override fields before any DB write.
 * Appends score delta if position score changed since last recorded delta.
 *
 * ADR-005 IL-1: INSERTs only. The DB trigger rejects any UPDATE/DELETE.
 */
export async function logDecision(params: LogDecisionParams): Promise<{ id: string }> {
  const {
    decisionType,
    entityId,
    entityType,
    periodStart,
    periodEnd,
    decidedBy,
    claims,
    position,
    override = false,
    overrideReason,
    amountEur,
    notes,
  } = params

  // Override gate — HARD BLOCK in PR #1.
  // Override requires dual approval: requester + second approver with DAL.Approve dimension.
  // This two-party requirement is not implemented until RC2.
  // Failing open (allowing single-authority override) would violate the constitutional spec.
  // Solution: hard-block override entirely in PR #1. Deferred to RC2.
  if (override) {
    throw new Error(
      'Override requires dual approval — not available in PR #1. ' +
      'A second approver with DAL.Approve must authorize the override. ' +
      'This is implemented in RC2.',
    )
  }

  // Freeze the financial position at this exact moment (Task 2: Position Snapshot)
  // This is the immutable record that answers future audits:
  //   "What was the position WHEN the decision was made?" — not "What is it today?"
  const positionSnapshot: FinancialPositionSnapshot = {
    balanceEur: position.balanceEur,
    totalReceivedEur: position.totalReceivedEur,
    totalPaidEur: position.totalPaidEur,
    score: position.score,
    capturedAt: position.computedAt,
  }

  // Build evidence chain snapshot — full trace frozen at this moment
  const evidenceChain: SnapshotEvidenceChain = {
    evaluatedAt: new Date().toISOString(),
    claims,                              // full ClaimEvaluation[] snapshot
    allPass: claims.filter((c) => c.required).every((c) => c.status === 'supported'),
    override,
    overrideReason: overrideReason ?? null,
    overrideApprovedBy: null,            // always null — override is hard-blocked above in PR #1
    positionSnapshot,                    // frozen position at execution time
  }

  // INSERT to decision_log (append-only — trigger blocks UPDATE/DELETE)
  const db = createServiceClient()
  const { data, error } = await db
    .schema('finance')
    .from('decision_log')
    .insert({
      decision_type: decisionType,
      entity_type: entityType,
      entity_id: entityId,
      decided_by: decidedBy,
      confidence_at_decision: position.score.total,
      evidence_chain: evidenceChain as unknown as Record<string, unknown>,
      override,
      override_reason: overrideReason ?? null,
      override_approved_by: null,           // always null in PR #1 — override hard-blocked above
      period_start: periodStart.toISOString().split('T')[0],
      period_end: periodEnd.toISOString().split('T')[0],
      amount_eur: amountEur ?? null,
      notes: notes ?? null,
    })
    .select('id')
    .single()

  if (error || !data) {
    throw new Error(`decision_log INSERT failed: ${error?.message ?? 'no data returned'}`)
  }

  // Append score delta if changed
  const lastScore = await getLastPositionScore(entityId, entityType)
  const newScore = position.score.total

  if (lastScore === null || Math.abs(newScore - lastScore) > 0.01) {
    await appendScoreDelta({
      entityId,
      entityType,
      fromScore: lastScore,
      toScore: newScore,
      // Individual axis deltas require persisting the previous axis breakdown.
      // PR #1: store null — only total delta is tracked.
      // RC2: persist last breakdown per-entity to enable axis delta history.
      deltaCoverage: null,
      deltaConsistency: null,
      deltaEvidence: null,
      triggerEvent: `decision_logged:${decisionType}`,
      triggeredBy: decidedBy,
    })
  }

  return { id: data.id }
}
