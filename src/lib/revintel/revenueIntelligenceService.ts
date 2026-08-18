/**
 * Revenue Intelligence Service — canonical read contract for the Control Room / Owner Room.
 *
 * Wiring Agent (2026-08-16), Phase 8. READ-ONLY. RECOMMENDATIONS ONLY.
 *
 * Source of truth: revintel.recommendation (persisted RI outputs) — canonical
 * property-scoped (property_id = public.property_definitions.property_id).
 *
 * STRICT rules (per mission):
 *   - Never fabricates or mocks recommendations. Returns [] when none exist.
 *   - Canonical scope only: rows without a canonical property_id are excluded.
 *   - Approval does NOT execute a price change — this service never writes.
 *   - No new pricing engine. It surfaces what the RI workstream already computed.
 *
 * SECURITY: server-only. Uses createServiceClient() (revintel has RLS deny-all;
 * service role required) — mirrors the executiveBriefService `.schema()` pattern.
 */

import 'server-only'

import { createServiceClient } from '@/lib/supabase'

export type RevenueRecommendationStatus =
  | 'NEW'
  | 'REVIEWED'
  | 'APPROVED'
  | 'REJECTED'
  | 'EXPIRED'

export interface RevenueRecommendationDTO {
  readonly recommendationId: string
  readonly canonicalPropertyId: string
  readonly period: string | null           // as_of_date
  readonly type: string                     // category: gap | listing | traction | none | ...
  readonly headline: string | null
  readonly recommendation: string | null    // action
  readonly reason: string | null
  readonly evidence: string | null          // provenance
  readonly confidence: string | null        // 'low' | 'medium' | 'high' (as stored)
  readonly isAi: boolean
  readonly status: RevenueRecommendationStatus
  readonly createdAt: string | null
  readonly reviewedAt: string | null        // decision_at
  readonly expectedImpact: null             // not available in source → honest null
}

interface RecommendationRow {
  id: string
  property_id: string | null
  as_of_date: string | null
  category: string | null
  headline: string | null
  action: string | null
  reason: string | null
  provenance: string | null
  confidence: string | null
  is_ai: boolean | null
  human_decision: string | null
  decision_at: string | null
  created_at: string | null
  is_current: boolean | null
}

function mapStatus(row: RecommendationRow): RevenueRecommendationStatus {
  const decision = (row.human_decision ?? '').toLowerCase()
  if (decision === 'approved') return 'APPROVED'
  if (decision === 'rejected') return 'REJECTED'
  if (decision) return 'REVIEWED'
  if (row.is_current === false) return 'EXPIRED'
  return 'NEW'
}

function mapRow(row: RecommendationRow): RevenueRecommendationDTO {
  return {
    recommendationId: row.id,
    canonicalPropertyId: row.property_id as string, // non-null guaranteed by caller filter
    period: row.as_of_date ?? null,
    type: row.category ?? 'none',
    headline: row.headline ?? null,
    recommendation: row.action ?? null,
    reason: row.reason ?? null,
    evidence: row.provenance ?? null,
    confidence: row.confidence ?? null,
    isAi: row.is_ai === true,
    status: mapStatus(row),
    createdAt: row.created_at ?? null,
    reviewedAt: row.decision_at ?? null,
    expectedImpact: null,
  }
}

export interface RevenueIntelligenceQuery {
  /** Limit to current recommendations (default true). */
  readonly currentOnly?: boolean
  /** Restrict to a single canonical property (canonicalPropertyId). */
  readonly canonicalPropertyId?: string
}

/**
 * Fetch canonical, property-scoped revenue recommendations.
 * Returns [] (never mock) when the RI workstream has produced nothing.
 * Never throws — a source failure yields an empty list (partial data is honest data).
 */
export async function getRevenueRecommendations(
  query: RevenueIntelligenceQuery = {},
): Promise<readonly RevenueRecommendationDTO[]> {
  const { currentOnly = true, canonicalPropertyId } = query

  let db: ReturnType<typeof createServiceClient>
  try {
    db = createServiceClient()
  } catch (err) {
    console.error('[revenueIntelligence] createServiceClient failed:', err)
    return []
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q = (db as any)
      .schema('revintel')
      .from('recommendation')
      .select('id, property_id, as_of_date, category, headline, action, reason, provenance, confidence, is_ai, human_decision, decision_at, created_at, is_current')
      .not('property_id', 'is', null) // canonical scope only — drop non-property rows
    if (currentOnly) q = q.eq('is_current', true)
    if (canonicalPropertyId) q = q.eq('property_id', canonicalPropertyId)

    const { data, error } = await q
    if (error) throw error
    const rows = (data ?? []) as RecommendationRow[]
    return Object.freeze(
      rows
        .filter(r => r.property_id != null) // defensive: canonical scope
        .map(mapRow),
    )
  } catch (err) {
    console.error('[revenueIntelligence] recommendation query failed:', err)
    return []
  }
}
