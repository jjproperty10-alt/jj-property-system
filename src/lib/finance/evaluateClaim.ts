/**
 * @module finance/evaluateClaim
 * @description Claim evaluation engine — Claim layer of the Finance Knowledge Graph.
 *
 * Each ClaimTemplate has an evaluation function registered in EVALUATION_DISPATCH.
 * The function receives live DB data and returns:
 *   status: supported | unsupported | pending
 *   confidence: 0–100
 *   gap: EvidenceGap | null
 *
 * Constitutional rules:
 *   IL-2: ClaimEvaluation is NEVER persisted. Returned from this function only.
 *   KG-1: Evidence is never inferred — all evaluations read from authoritative sources.
 *   KG-5: Each evaluation must be explainable: which evidence proved/failed the claim.
 *
 * Data sources (RC3 boundary enforced):
 *   - v_cashbox_audit            → cashbox balance ('cashbox_sufficient')
 *   - statements.statement_events → open corrections state ('no_open_corrections')
 *   - finance.evidence_links     → bank evidence ('bank_reconciliation')
 *
 * Stop Condition — no_duplicate_candidates:
 *   This claim requires knowledge of `review_status = 'duplicate_candidate'` counts per partner.
 *   The RC3 boundary prohibits direct reads from `public.transactions`.
 *   No RC3 view currently exposes this data.
 *   Resolution: RC3 team must expose a `v_partner_quality_flags` view (or equivalent).
 *   Until then, this claim is removed from PR #1. It will be added in RC2 once the view exists.
 *
 * @see FINANCIAL_KNOWLEDGE_GRAPH_ADR.md
 * @see FINANCE_CFO_ARCHITECTURE_ADR.md (Section 7 — evaluateClaim contract)
 */

import 'server-only'
import { createServiceClient } from '@/lib/supabase'
import type {
  ClaimEvaluation,
  ClaimTemplate,
  EvidenceLink,
  EvidenceGap,
  ClaimStatus,
  EvidenceSourceType,
} from './types'
import { EVIDENCE_STRENGTH_WEIGHTS } from './types'

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function loadClaimTemplate(templateId: string): Promise<ClaimTemplate> {
  const db = createServiceClient()
  const { data, error } = await db
    .schema('finance')
    .from('claim_templates')
    .select('*')
    .eq('id', templateId)
    .single()
  if (error || !data) throw new Error(`ClaimTemplate not found: ${templateId}`)
  return {
    id: data.id,
    decisionType: data.decision_type,
    statement: data.statement,
    required: data.required,
    evaluationFn: data.evaluation_fn,
    evidenceTypes: data.evidence_types,
  }
}

async function loadEvidenceLinks(
  entityId: string,
  entityType: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<EvidenceLink[]> {
  const db = createServiceClient()
  const ps = periodStart.toISOString().split('T')[0]
  const pe = periodEnd.toISOString().split('T')[0]

  const { data, error } = await db
    .schema('finance')
    .from('evidence_links')
    .select('*')
    .eq('entity_id', entityId)
    .eq('entity_type', entityType)
    .eq('validity_status', 'active')

  if (error) throw error

  // Filter in-memory: evidence covering this period
  const rows = (data ?? []).filter((row) => {
    const rowStart = row.period_start ?? '1900-01-01'
    const rowEnd = row.period_end ?? '2999-12-31'
    return rowStart <= pe && rowEnd >= ps
  })

  return rows.map((row) => ({
    id: row.id,
    transactionRef: row.transaction_ref,
    entityId: row.entity_id,
    entityType: row.entity_type,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    sourceType: row.source_type as EvidenceSourceType,
    strength: row.strength,
    sourceRef: row.source_ref,
    description: row.description,
    verifiedAt: row.verified_at,
    validUntil: row.valid_until,
    validityStatus: row.validity_status,
    confidence: row.confidence,
  }))
}

function computeStrength(links: EvidenceLink[]): number {
  if (links.length === 0) return 0
  return Math.max(...links.map((l) => EVIDENCE_STRENGTH_WEIGHTS[l.strength]))
}

// ─── Individual claim evaluations ────────────────────────────────────────────

interface EvalResult {
  status: ClaimStatus
  confidence: number
  gap: EvidenceGap | null
}

/**
 * Claim: Partner cashbox balance is sufficient.
 * Evidence source: v_cashbox_audit (cash_box_name = entityId)
 */
async function evaluateCashboxSufficiency(
  entityId: string,
): Promise<EvalResult> {
  const db = createServiceClient()
  const { data, error } = await db
    .from('v_cashbox_audit')
    .select('cash_box_name, balance, total_received, total_paid')
    .eq('cash_box_name', entityId)
    .maybeSingle()

  if (error || !data) {
    return {
      status: 'unsupported',
      confidence: 0,
      gap: {
        missingType: 'ledger',
        description: `No cashbox record found for ${entityId}`,
        resolutionSteps: [{
          action: 'check_cashbox_view',
          description: 'Verify v_cashbox_audit returns data for this partner',
          estimatedEffortMinutes: 30,
        }],
        confidenceAfter: 85,
      },
    }
  }

  const balance = Number(data.balance ?? 0)
  if (balance > 0) {
    return { status: 'supported', confidence: 99, gap: null }
  }

  return {
    status: 'unsupported',
    confidence: 0,
    gap: {
      missingType: 'ledger',
      description: `${entityId} cashbox balance is €${balance.toFixed(2)} — insufficient`,
      resolutionSteps: [{
        action: 'review_partner_transactions',
        description: 'Review recent transactions affecting this partner',
        estimatedEffortMinutes: 60,
      }],
      confidenceAfter: 0,
    },
  }
}

/**
 * Claim: No unresolved corrections affect this partner in this period.
 * Evidence source: statements.statement_events
 */
async function evaluateNoOpenCorrections(
  entityId: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<EvalResult> {
  const db = createServiceClient()

  // Find correction_initiated events in this period
  const { data: initiated, error: e1 } = await db
    .schema('statements')
    .from('statement_events')
    .select('id, series_id')
    .eq('event_type', 'correction_initiated')
    .gte('occurred_at', periodStart.toISOString())
    .lte('occurred_at', periodEnd.toISOString())

  if (e1) {
    // Cannot query — treat as pending
    return { status: 'pending', confidence: 50, gap: null }
  }

  const initiatedIds = (initiated ?? []).map((r) => r.series_id)
  if (initiatedIds.length === 0) {
    return { status: 'supported', confidence: 100, gap: null }
  }

  // Check if any of these were resolved
  const { data: resolved, error: e2 } = await db
    .schema('statements')
    .from('statement_events')
    .select('series_id')
    .eq('event_type', 'correction_resolved')
    .in('series_id', initiatedIds)

  if (e2) {
    return { status: 'pending', confidence: 50, gap: null }
  }

  const resolvedIds = new Set((resolved ?? []).map((r) => r.series_id))
  const openCount = initiatedIds.filter((id) => !resolvedIds.has(id)).length

  if (openCount === 0) {
    return { status: 'supported', confidence: 100, gap: null }
  }

  return {
    status: 'unsupported',
    confidence: 0,
    gap: {
      missingType: 'ledger',
      description: `${openCount} open correction case(s) not yet resolved`,
      resolutionSteps: [{
        action: 'resolve_corrections',
        description: `Close ${openCount} open correction case(s) before approving withdrawal`,
        estimatedEffortMinutes: openCount * 30,
      }],
      confidenceAfter: 100,
    },
  }
}

/**
 * Claim: Bank reconciliation is complete for this partner and period.
 * Evidence source: finance.evidence_links (sourceType = 'bank')
 */
async function evaluateBankReconciliation(
  entityId: string,
  evidenceLinks: EvidenceLink[],
  periodStart: Date,
): Promise<EvalResult> {
  const bankLinks = evidenceLinks.filter(
    (l) => l.sourceType === 'bank' && l.validityStatus === 'active',
  )

  if (bankLinks.length > 0) {
    return { status: 'supported', confidence: 97, gap: null }
  }

  const periodLabel = periodStart.toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
  })

  return {
    status: 'unsupported',
    confidence: 0,
    gap: {
      missingType: 'bank',
      description: `No bank statement found for ${entityId} — ${periodLabel}`,
      resolutionSteps: [{
        action: 'attach_bank_statement',
        description: `Attach bank statement for ${entityId} covering ${periodLabel}`,
        estimatedEffortMinutes: 10,
      }],
      confidenceAfter: 97,
    },
  }
}

// ─── Dispatch ────────────────────────────────────────────────────────────────

type EvalFn = (
  entityId: string,
  entityType: string,
  evidenceLinks: EvidenceLink[],
  periodStart: Date,
  periodEnd: Date,
) => Promise<EvalResult>

const EVALUATION_DISPATCH: Record<string, EvalFn> = {
  evaluateCashboxSufficiency: async (entityId) =>
    evaluateCashboxSufficiency(entityId),
  evaluateNoOpenCorrections: async (entityId, _et, _el, periodStart, periodEnd) =>
    evaluateNoOpenCorrections(entityId, periodStart, periodEnd),
  // evaluateNoDuplicateCandidates — removed: Stop Condition (no RC3 view, see JSDoc).
  // Add back in RC2 once RC3 exposes v_partner_quality_flags.
  evaluateBankReconciliation: async (entityId, _et, evidenceLinks, periodStart) =>
    evaluateBankReconciliation(entityId, evidenceLinks, periodStart),
}

// ─── Public API ──────────────────────────────────────────────────────────────

export interface EvaluateClaimParams {
  templateId: string
  entityId: string
  entityType: string
  periodStart: Date
  periodEnd: Date
}

/**
 * Evaluate a single Claim for a given entity and period.
 *
 * Returns a ClaimEvaluation — computed, never stored.
 * The result is snapshotted inside decision_log.evidence_chain when logDecision() is called.
 */
export async function evaluateClaim(params: EvaluateClaimParams): Promise<ClaimEvaluation> {
  const { templateId, entityId, entityType, periodStart, periodEnd } = params

  const [template, evidenceLinks] = await Promise.all([
    loadClaimTemplate(templateId),
    loadEvidenceLinks(entityId, entityType, periodStart, periodEnd),
  ])

  const fn = EVALUATION_DISPATCH[template.evaluationFn]
  if (!fn) throw new Error(`Unknown evaluation function: ${template.evaluationFn}`)

  const result = await fn(entityId, entityType, evidenceLinks, periodStart, periodEnd)

  return {
    templateId,
    entityId,
    entityType,
    periodStart: periodStart.toISOString().split('T')[0],
    periodEnd: periodEnd.toISOString().split('T')[0],
    evaluatedAt: new Date().toISOString(),
    status: result.status,
    confidence: result.confidence,
    strength: computeStrength(evidenceLinks),
    evidenceLinks,
    gap: result.gap,
    statement: template.statement,
    required: template.required,
  }
}
