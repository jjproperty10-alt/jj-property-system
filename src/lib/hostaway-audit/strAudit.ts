/**
 * strAudit.ts — read-only STR reconciliation DTO builder (P3B; P4 attribution).
 * Maps per-period Hostaway-vs-JJ evidence into reconciliation statuses (reconcileStrPeriod) and
 * attaches deterministic ledger period-attribution (P4). Pure. Never financial authority.
 */
import { reconcileStrPeriod } from './strReconciliation';
import type { ReconciliationResult, EvidenceConfidence } from './strReconciliation';
import type { PeriodAttribution, AttributionMethod, AttributionReviewReason } from './strLedgerAttribution';

export interface StrPeriodInput {
  readonly period: string;
  readonly hostawayAmount: number | null;
  readonly hostawayConfidence: 'high' | 'medium' | 'low' | 'none';
  readonly jjAmount: number | null;
  /** True when the JJ Platform Income covering this month is a multi-month aggregate (no monthly attribution). */
  readonly jjIsAggregate?: boolean;
  /** P4: deterministic period attribution of the JJ ledger row (read-only). */
  readonly attribution?: PeriodAttribution;
}

export type StrReconciliationPeriod = ReconciliationResult & {
  readonly attributionMethod: AttributionMethod | null;
  readonly attributionReason: AttributionReviewReason;
};

export interface StrReconciliationSummary {
  readonly total: number;
  readonly match: number;
  readonly variance: number;
  readonly missingInJj: number;
  readonly missingInHostaway: number;
  readonly aggregateOnly: number;
  readonly insufficient: number;
  readonly multiPeriodAggregate: number;
  readonly periodUnresolved: number;
  readonly totalVarianceEur: number | null;
}

export interface StrReconciliationDTO {
  readonly propertyId: string;
  readonly serviceEngagementId: string | null;
  readonly hasActiveEngagement: boolean;
  readonly periods: readonly StrReconciliationPeriod[];
  readonly summary: StrReconciliationSummary;
}

function mapConfidence(c: 'high' | 'medium' | 'low' | 'none'): EvidenceConfidence {
  return c === 'high' ? 'high' : c === 'none' ? 'none' : 'medium';
}

export function buildStrReconciliation(
  propertyId: string,
  serviceEngagementId: string | null,
  periods: readonly StrPeriodInput[],
  toleranceEur = 0.01,
): StrReconciliationDTO {
  const results: StrReconciliationPeriod[] = periods.map((p) => {
    const r = reconcileStrPeriod(
      { propertyId, serviceEngagementId, period: p.period,
        hostawayAmount: p.hostawayAmount, hostawayConfidence: mapConfidence(p.hostawayConfidence), jjAmount: p.jjAmount,
        jjIsAggregate: p.jjIsAggregate },
      toleranceEur,
    );
    return { ...r, attributionMethod: p.attribution?.method ?? null, attributionReason: p.attribution?.reviewReason ?? null };
  });
  const count = (s: ReconciliationResult['status']) => results.filter((r) => r.status === s).length;
  const anyVar = results.some((r) => r.variance !== null);
  const varSum = results.reduce((a, r) => (r.variance !== null ? a + Math.abs(r.variance) : a), 0);
  return {
    propertyId, serviceEngagementId,
    hasActiveEngagement: !!(serviceEngagementId && serviceEngagementId.trim() !== ''),
    periods: results,
    summary: {
      total: results.length,
      match: count('match'),
      variance: count('variance'),
      missingInJj: count('missing_in_jj'),
      missingInHostaway: count('missing_in_hostaway'),
      aggregateOnly: count('aggregate_only'),
      insufficient: count('insufficient_evidence'),
      multiPeriodAggregate: results.filter((r) => r.attributionReason === 'multi_period_aggregate').length,
      periodUnresolved: results.filter((r) => r.attributionReason === 'period_unresolved' || r.attributionReason === 'missing_period_metadata').length,
      totalVarianceEur: anyVar ? Math.round(varSum * 100) / 100 : null,
    },
  };
}
