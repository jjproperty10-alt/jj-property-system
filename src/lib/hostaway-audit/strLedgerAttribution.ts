/**
 * strLedgerAttribution.ts — deterministic, read-only period attribution for JJ STR ledger rows (P4).
 * Classifies HOW an authoritative transaction's period is known. NEVER changes amounts/dates,
 * never fabricates a split, never uses name as identity. Reuses the already-parsed periodFrom/periodTo
 * from the existing pipeline (no re-parsing, no parallel ledger model). Unknown => Needs Review.
 */
export type AttributionMethod = 'explicit_period_range' | 'period_unresolved';
export type AttributionReviewReason =
  | 'multi_period_aggregate'
  | 'period_unresolved'
  | 'missing_period_metadata'
  | null;

export interface PeriodAttribution {
  readonly method: AttributionMethod;
  readonly spansMultipleMonths: boolean;
  readonly reviewReason: AttributionReviewReason;
}

/** Count of distinct calendar months in [from,to] inclusive (ISO 'YYYY-MM-DD'). */
export function monthsSpanned(from: string, to: string): number {
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  if (!fy || !fm || !ty || !tm) return 1;
  return Math.max(1, (ty - fy) * 12 + (tm - fm) + 1);
}

export function classifyStrPeriodAttribution(
  periodFrom: string | null,
  periodTo: string | null,
  description: string | null,
): PeriodAttribution {
  if (periodFrom && periodTo) {
    const multi = monthsSpanned(periodFrom, periodTo) > 1;
    return { method: 'explicit_period_range', spansMultipleMonths: multi, reviewReason: multi ? 'multi_period_aggregate' : null };
  }
  if (periodFrom && !periodTo) {
    return { method: 'explicit_period_range', spansMultipleMonths: false, reviewReason: null };
  }
  const hasText = !!(description && description.trim() !== '');
  return { method: 'period_unresolved', spansMultipleMonths: false, reviewReason: hasText ? 'period_unresolved' : 'missing_period_metadata' };
}
