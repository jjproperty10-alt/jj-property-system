/**
 * strReconciliation.ts — read-only STR evidence reconciliation status (P3, 2026-08-12).
 *
 * Connects Hostaway operational/financial EVIDENCE to the existing JJ ledger WITHOUT
 * becoming a financial authority. It never posts transactions, never computes owner
 * entitlement, never overrides RC3/FPE/Settlement/JHKA. It only compares an already-
 * computed Hostaway evidence amount against the JJ-ledger amount for a period and reports
 * a status + variance + confidence + needs-review reason.
 *
 * Identity is ALWAYS property_id (P1) and the active airbnb_str service engagement (P2).
 * Never keyed by property name. Unknown => Needs Review (never guessed).
 */

export type ReconciliationStatus =
  | 'match'
  | 'variance'
  | 'missing_in_jj'          // Hostaway evidence exists; JJ ledger has nothing yet (needs manual entry)
  | 'missing_in_hostaway'    // JJ ledger exists; no Hostaway evidence to corroborate
  | 'insufficient_evidence'; // neither side usable

export type EvidenceConfidence = 'high' | 'medium' | 'none';

export interface StrPeriodEvidence {
  /** canonical public.property_definitions UUID — the machine identity */
  readonly propertyId: string;
  /** active airbnb_str engagement id (P2), or null if unlinked */
  readonly serviceEngagementId: string | null;
  /** period label, e.g. 'YYYY-MM' or a range key */
  readonly period: string;
  /** Hostaway evidence amount (e.g. owner payout), already computed upstream; null if unavailable */
  readonly hostawayAmount: number | null;
  readonly hostawayConfidence: EvidenceConfidence;
  /** JJ ledger amount for the period (e.g. Platform Income); null if none recorded */
  readonly jjAmount: number | null;
}

export interface ReconciliationResult {
  readonly propertyId: string;
  readonly serviceEngagementId: string | null;
  readonly period: string;
  readonly hostawayAmount: number | null;
  readonly jjAmount: number | null;
  /** hostaway - jj, rounded to cents; null when either side missing */
  readonly variance: number | null;
  readonly status: ReconciliationStatus;
  readonly confidence: EvidenceConfidence;
  readonly needsReviewReason: string | null;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Reconcile one property/period. Pure, deterministic, read-only. `toleranceEur` is the
 * absolute variance under which the two sides are considered a match.
 */
export function reconcileStrPeriod(
  e: StrPeriodEvidence,
  toleranceEur = 0.01,
): ReconciliationResult {
  if (!e.propertyId || e.propertyId.trim() === '') {
    throw new Error('reconcileStrPeriod: propertyId (canonical UUID) is required — name is not an identity');
  }
  if (!Number.isFinite(toleranceEur) || toleranceEur < 0) {
    throw new Error('reconcileStrPeriod: toleranceEur must be a finite, non-negative number');
  }
  const base = {
    propertyId: e.propertyId,
    serviceEngagementId: e.serviceEngagementId,
    period: e.period,
    hostawayAmount: e.hostawayAmount,
    jjAmount: e.jjAmount,
  };

  // Fail-closed on the P2 chain: reconciliation requires an active airbnb_str service
  // engagement. Without it there is no proven STR service context — never a match/variance,
  // never a name fallback.
  if (!e.serviceEngagementId || e.serviceEngagementId.trim() === '') {
    return { ...base, variance: null, status: 'insufficient_evidence', confidence: 'none',
      needsReviewReason: 'No active airbnb_str service engagement for this property/period.' };
  }

  const hasH = e.hostawayAmount !== null;
  const hasJ = e.jjAmount !== null;

  if (!hasH && !hasJ) {
    return { ...base, variance: null, status: 'insufficient_evidence', confidence: 'none',
      needsReviewReason: 'No Hostaway evidence and no JJ ledger amount for this period.' };
  }
  if (hasH && !hasJ) {
    return { ...base, variance: null, status: 'missing_in_jj', confidence: e.hostawayConfidence,
      needsReviewReason: 'Hostaway evidence present but no JJ ledger entry — needs manual entry/confirmation.' };
  }
  if (!hasH && hasJ) {
    return { ...base, variance: null, status: 'missing_in_hostaway', confidence: 'none',
      needsReviewReason: 'JJ ledger entry present but no Hostaway evidence to corroborate.' };
  }

  // Compare the RAW difference against tolerance; round only for the returned/displayed variance.
  const rawDifference = (e.hostawayAmount as number) - (e.jjAmount as number);
  const variance = round2(rawDifference);
  if (Math.abs(rawDifference) <= toleranceEur) {
    return { ...base, variance, status: 'match', confidence: e.hostawayConfidence, needsReviewReason: null };
  }
  return { ...base, variance, status: 'variance', confidence: e.hostawayConfidence,
    needsReviewReason: `Hostaway evidence and JJ ledger differ by €${Math.abs(variance).toFixed(2)}.` };
}
