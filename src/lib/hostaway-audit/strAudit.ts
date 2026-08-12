/**
 * strAudit.ts — read-only STR reconciliation DTO builder (P3B, 2026-08-12).
 * Maps per-period Hostaway-vs-JJ evidence into reconciliation statuses via reconcileStrPeriod().
 * Pure. Read-only. property_id + airbnb_str engagement keyed (P1/P2). Never financial authority.
 */
import { reconcileStrPeriod } from './strReconciliation';
import type { ReconciliationResult, EvidenceConfidence } from './strReconciliation';

export interface StrPeriodInput {
  readonly period: string;
  readonly hostawayAmount: number | null;
  readonly hostawayConfidence: 'high' | 'medium' | 'low' | 'none';
  readonly jjAmount: number | null;
}

export interface StrReconciliationSummary {
  readonly total: number;
  readonly match: number;
  readonly variance: number;
  readonly missingInJj: number;
  readonly missingInHostaway: number;
  readonly insufficient: number;
  readonly totalVarianceEur: number | null;
}

export interface StrReconciliationDTO {
  readonly propertyId: string;
  readonly serviceEngagementId: string | null;
  readonly hasActiveEngagement: boolean;
  readonly periods: readonly ReconciliationResult[];
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
  const results = periods.map((p) =>
    reconcileStrPeriod(
      { propertyId, serviceEngagementId, period: p.period,
        hostawayAmount: p.hostawayAmount, hostawayConfidence: mapConfidence(p.hostawayConfidence), jjAmount: p.jjAmount },
      toleranceEur,
    ),
  );
  const count = (s: ReconciliationResult['status']) => results.filter((r) => r.status === s).length;
  const anyVar = results.some((r) => r.variance !== null);
  const varSum = results.reduce((a, r) => (r.variance !== null ? a + Math.abs(r.variance) : a), 0);
  return {
    propertyId,
    serviceEngagementId,
    hasActiveEngagement: !!(serviceEngagementId && serviceEngagementId.trim() !== ''),
    periods: results,
    summary: {
      total: results.length,
      match: count('match'),
      variance: count('variance'),
      missingInJj: count('missing_in_jj'),
      missingInHostaway: count('missing_in_hostaway'),
      insufficient: count('insufficient_evidence'),
      totalVarianceEur: anyVar ? Math.round(varSum * 100) / 100 : null,
    },
  };
}
