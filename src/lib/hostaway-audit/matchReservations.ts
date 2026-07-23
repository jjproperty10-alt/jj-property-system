/**
 * matchReservations.ts — Match Hostaway reservations to JJ transactions.
 *
 * Pure functions. No DB access. Deterministic.
 *
 * Sprint 2 key insight:
 *   JJ records Platform Income as PERIOD AGGREGATES ("1/7/25-31/12/25 = €5,857").
 *   Hostaway records per-RESERVATION (57 confirmed stays for same period).
 *   Therefore: PRIMARY comparison is period-aggregate, not per-reservation.
 *
 * Matching strategy:
 *   1. Parse JJ descriptions to extract date periods
 *   2. Assign Hostaway reservations to JJ period rows by stay overlap
 *   3. Compare sum(Hostaway payouts in period) vs JJ period amount
 *   4. Per-reservation matching is a secondary signal, not primary
 *
 * Business rules (CLAUDE.md §4):
 *   - JJ "Platform Income" = net payout to owner (already deducted platform fees)
 *   - Cleaning / Management Fee in Airbnb = tracking only, not a separate charge
 */

import type {
  ReservationAuditDTO,
  AuditMatchState,
  AuditDifferenceDTO,
  BookingChannel,
  ReservationStatus,
  ReservationFinancials,
  JjPeriodAggregate,
  PeriodComparison,
  AuthoritativeAmount,
} from './types';
import { isRevenueEligible } from './types';

/** A JJ transaction row relevant to matching */
export interface JjAirbnbTransaction {
  readonly id: string;
  readonly date: string;           // ISO date
  readonly propertyName: string;
  readonly subcategory: string;    // 'Platform Income' | 'Cleaning' | 'Management Fee' | ...
  readonly amountEur: number;
  readonly description: string | null;
  readonly payer: string | null;
  readonly payee: string | null;
}

/** A canonical reservation with computed financials, ready for matching */
export interface CanonicalReservationRow {
  readonly hostawayReservationId: string;
  readonly hostawayPropertyId: string;
  readonly channel: BookingChannel;
  readonly channelRaw: string | null;
  readonly status: ReservationStatus;
  readonly guestName: string | null;
  readonly checkIn: string;
  readonly checkOut: string;
  readonly nights: number;
  readonly guests: number | null;
  readonly currencyCode: string;
  readonly financials: ReservationFinancials;
}

/** Amount match tolerance in EUR */
const AMOUNT_TOLERANCE = 1.0;

/** Period match tolerance as fraction (5%) */
const PERIOD_TOLERANCE_FRACTION = 0.05;

// ─── Date period parsing ─────────────────────────────────────────────────────

/**
 * Parse a JJ description to extract a date range.
 * Handles formats like:
 *   "1/7/25-31/12/25"
 *   "1/1/26-30/4/26"
 *   "1.1.26-31.5.26"
 *   "הכנסה 1/7/25-31/12/25"
 *
 * Returns null if no date range can be parsed.
 */
export function parsePeriodFromDescription(
  description: string | null,
): { from: string; to: string } | null {
  if (!description) return null;

  // Match patterns like d/m/yy-d/m/yy or d.m.yy-d.m.yy
  const pattern = /(\d{1,2})[./](\d{1,2})[./](\d{2,4})\s*[-–]\s*(\d{1,2})[./](\d{1,2})[./](\d{2,4})/;
  const match = description.match(pattern);
  if (!match) return null;

  const [, d1, m1, y1, d2, m2, y2] = match;
  const year1 = normalizeYear(y1);
  const year2 = normalizeYear(y2);

  const from = `${year1}-${pad(m1)}-${pad(d1)}`;
  const to = `${year2}-${pad(m2)}-${pad(d2)}`;

  // Validate
  if (isNaN(Date.parse(from)) || isNaN(Date.parse(to))) return null;

  return { from, to };
}

function normalizeYear(y: string): string {
  if (y.length === 4) return y;
  const n = parseInt(y, 10);
  return n >= 50 ? `19${y}` : `20${pad(y)}`;
}

function pad(s: string): string {
  return s.length === 1 ? `0${s}` : s;
}

/**
 * Check if a reservation's stay overlaps a date period.
 */
export function stayOverlapsPeriod(
  checkIn: string,
  checkOut: string,
  periodFrom: string,
  periodTo: string,
): boolean {
  const stayStart = new Date(checkIn).getTime();
  const stayEnd = new Date(checkOut).getTime();
  const periodStart = new Date(periodFrom).getTime();
  const periodEnd = new Date(periodTo).getTime();

  // Overlap exists if stay starts before period ends AND stay ends after period starts
  return stayStart <= periodEnd && stayEnd >= periodStart;
}

// ─── Period-aggregate matching (Sprint 2 primary) ────────────────────────────

/**
 * Build JJ period aggregates from Platform Income transactions.
 */
export function buildJjPeriodAggregates(
  jjTransactions: readonly JjAirbnbTransaction[],
): readonly JjPeriodAggregate[] {
  return jjTransactions
    .filter(tx => tx.subcategory === 'Platform Income')
    .map((tx): JjPeriodAggregate => {
      const parsed = parsePeriodFromDescription(tx.description);
      return {
        transactionId: tx.id,
        date: tx.date,
        amountEur: tx.amountEur,
        description: tx.description,
        periodFrom: parsed?.from ?? null,
        periodTo: parsed?.to ?? null,
        subcategory: tx.subcategory,
      };
    });
}

/**
 * Assign reservations to JJ period aggregates and compare totals.
 */
export function buildPeriodComparisons(
  reservations: readonly CanonicalReservationRow[],
  jjAggregates: readonly JjPeriodAggregate[],
): readonly PeriodComparison[] {
  return jjAggregates.map((agg): PeriodComparison => {
    // Find reservations that overlap this period
    const overlapping: string[] = [];
    let payoutSum = 0;
    let allReported = true;
    let anyNull = false;

    if (agg.periodFrom && agg.periodTo) {
      for (const res of reservations) {
        // Skip non-revenue statuses (only confirmed/modified participate)
        if (!isRevenueEligible(res.status)) continue;

        if (stayOverlapsPeriod(res.checkIn, res.checkOut, agg.periodFrom, agg.periodTo)) {
          overlapping.push(res.hostawayReservationId);
          const payout = res.financials.payout;
          if (payout.amount !== null) {
            payoutSum += payout.amount;
            if (payout.source !== 'reported') allReported = false;
          } else {
            anyNull = true;
          }
        }
      }
    }

    const hostawayTotal: AuthoritativeAmount = anyNull
      ? { amount: null, source: 'unknown', confidence: 'none', calculationNote: 'Some reservations have missing payout data' }
      : {
          amount: Math.round(payoutSum * 100) / 100,
          source: allReported ? 'reported' : 'calculated',
          confidence: allReported ? 'high' : 'medium',
          calculationNote: `Sum of ${overlapping.length} reservation payouts`,
        };

    const jjAmount: AuthoritativeAmount = {
      amount: agg.amountEur,
      source: 'jj_recorded',
      confidence: 'high',
      calculationNote: null,
    };

    let periodMatchState: PeriodComparison['periodMatchState'] = 'period_insufficient_data';
    let periodDifference: number | null = null;
    let periodDifferencePercent: number | null = null;

    if (hostawayTotal.amount !== null && agg.periodFrom && agg.periodTo) {
      periodDifference = Math.round((hostawayTotal.amount - agg.amountEur) * 100) / 100;
      periodDifferencePercent = agg.amountEur !== 0
        ? Math.round((Math.abs(periodDifference) / Math.abs(agg.amountEur)) * 10000) / 100
        : null;

      // Period matches if within €1 or 5% relative
      if (Math.abs(periodDifference) <= AMOUNT_TOLERANCE) {
        periodMatchState = 'period_exact';
      } else if (
        periodDifferencePercent !== null && periodDifferencePercent <= PERIOD_TOLERANCE_FRACTION * 100
      ) {
        periodMatchState = 'period_exact';
      } else {
        periodMatchState = 'period_difference';
      }
    }

    return {
      jjAggregate: agg,
      hostawayReservationIds: overlapping,
      hostawayPeriodPayout: hostawayTotal,
      jjPeriodAmount: jjAmount,
      periodMatchState,
      periodDifference,
      periodDifferencePercent,
    };
  });
}

// ─── Per-reservation audit state assignment ──────────────────────────────────

/**
 * Assign audit states to reservations based on period comparisons.
 */
export function assignAuditStates(
  reservations: readonly CanonicalReservationRow[],
  periodComparisons: readonly PeriodComparison[],
  _jjTransactions: readonly JjAirbnbTransaction[],
): readonly ReservationAuditDTO[] {
  // Build a map: reservation ID → which period it belongs to
  const resPeriodMap = new Map<string, string>(); // resId → jjTxId
  for (const pc of periodComparisons) {
    for (const resId of pc.hostawayReservationIds) {
      resPeriodMap.set(resId, pc.jjAggregate.transactionId);
    }
  }

  return reservations.map((res): ReservationAuditDTO => {
    // Not-comparable: any status not eligible for revenue
    if (!isRevenueEligible(res.status)) {
      return buildAuditResult(res, 'not_comparable', null, null);
    }

    const periodId = resPeriodMap.get(res.hostawayReservationId);

    if (periodId) {
      // Reservation falls within a JJ period — aggregate match
      return buildAuditResult(res, 'aggregate_match', periodId, null);
    }

    // Check if payout data exists
    if (res.financials.payout.amount === null) {
      return buildAuditResult(res, 'insufficient_evidence', null, null);
    }

    // Not in any JJ period → missing in JJ
    const diff: AuditDifferenceDTO = {
      direction: 'hostaway_only',
      lineType: 'platform_income',
      hostawayAmount: res.financials.payout.amount,
      jjAmount: null,
      absoluteDifference: Math.abs(res.financials.payout.amount),
      description: `Reservation ${res.hostawayReservationId} (${res.channel}, ${res.checkIn}) not covered by any JJ period aggregate`,
      expectedByBusinessRule: false,
      businessRuleRef: null,
    };

    return buildAuditResult(res, 'missing_in_jj', null, diff);
  });
}

function buildAuditResult(
  res: CanonicalReservationRow,
  auditState: AuditMatchState,
  aggregatePeriodId: string | null,
  difference: AuditDifferenceDTO | null,
): ReservationAuditDTO {
  return {
    hostawayReservationId: res.hostawayReservationId,
    hostawayPropertyId: res.hostawayPropertyId,
    channel: res.channel,
    channelRaw: res.channelRaw,
    status: res.status,
    guestName: res.guestName,
    checkIn: res.checkIn,
    checkOut: res.checkOut,
    nights: res.nights,
    guests: res.guests,
    currencyCode: res.currencyCode,
    financials: res.financials,
    auditState,
    aggregatePeriodId,
    matchedTransactionIds: aggregatePeriodId ? [aggregatePeriodId] : [],
    jjPlatformIncome: null,
    jjCleaning: null,
    difference,
  };
}

/**
 * Find JJ Platform Income transactions not covered by any Hostaway reservation.
 */
export function findUnmatchedJjTransactions(
  jjTransactions: readonly JjAirbnbTransaction[],
  matchedIds: ReadonlySet<string>,
): readonly JjAirbnbTransaction[] {
  return jjTransactions.filter(
    (tx) => tx.subcategory === 'Platform Income' && !matchedIds.has(tx.id),
  );
}

// ─── Legacy API (Sprint 1 compat) ────────────────────────────────────────────

/** @deprecated Use assignAuditStates + buildPeriodComparisons instead */
export function matchReservations(
  reservations: readonly CanonicalReservationRow[],
  jjTransactions: readonly JjAirbnbTransaction[],
): readonly ReservationAuditDTO[] {
  const aggregates = buildJjPeriodAggregates(jjTransactions);
  const comparisons = buildPeriodComparisons(reservations, aggregates);
  return assignAuditStates(reservations, comparisons, jjTransactions);
}
