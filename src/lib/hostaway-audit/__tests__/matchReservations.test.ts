/**
 * Unit tests for matchReservations.ts — Sprint 2 period-aggregate matching.
 * No DB. No network. Deterministic.
 */

import { describe, it, expect } from '@jest/globals';
import {
  matchReservations,
  findUnmatchedJjTransactions,
  parsePeriodFromDescription,
  stayOverlapsPeriod,
  buildJjPeriodAggregates,
  buildPeriodComparisons,
  assignAuditStates,
} from '../matchReservations';
import { isRevenueEligible, REVENUE_ELIGIBLE_STATUSES } from '../types';
import type {
  CanonicalReservationRow,
  JjAirbnbTransaction,
} from '../matchReservations';
import type { AuthoritativeAmount, ReservationFinancials } from '../types';

// ─── Test helpers ────────────────────────────────────────────────────────────

const defaultPayout: AuthoritativeAmount = {
  amount: 485,
  source: 'reported',
  confidence: 'high',
  calculationNote: null,
};

const defaultFinancials: ReservationFinancials = {
  totalPrice: 500,
  cleaningFee: 50,
  hostServiceFee: 15,
  channelCommission: null,
  taxAmount: null,
  payout: defaultPayout,
  payoutExpected: 485,
  basePrice: 450,
};

function makeReservation(
  overrides: Partial<CanonicalReservationRow> = {},
): CanonicalReservationRow {
  return {
    hostawayReservationId: 'res-001',
    hostawayPropertyId: '412145',
    channel: 'airbnb',
    channelRaw: 'airbnbOfficial',
    status: 'confirmed',
    guestName: 'Test Guest',
    checkIn: '2026-03-15',
    checkOut: '2026-03-18',
    nights: 3,
    guests: 2,
    currencyCode: 'EUR',
    financials: defaultFinancials,
    ...overrides,
  };
}

function makeJjTx(
  overrides: Partial<JjAirbnbTransaction> = {},
): JjAirbnbTransaction {
  return {
    id: 'tx-001',
    date: '2026-03-16',
    propertyName: 'Tamir Dekelia',
    subcategory: 'Platform Income',
    amountEur: 485,
    description: 'Airbnb payout',
    payer: 'Airbnb',
    payee: 'JJ',
    ...overrides,
  };
}

// ─── parsePeriodFromDescription ─────────────────────────────────────────────

describe('parsePeriodFromDescription', () => {
  it('parses d/m/yy-d/m/yy format', () => {
    const result = parsePeriodFromDescription('הכנסה 1/7/25-31/12/25');
    expect(result).toEqual({ from: '2025-07-01', to: '2025-12-31' });
  });

  it('parses d/m/yy-d/m/yy without prefix text', () => {
    const result = parsePeriodFromDescription('1/1/26-30/4/26');
    expect(result).toEqual({ from: '2026-01-01', to: '2026-04-30' });
  });

  it('parses d.m.yy format', () => {
    const result = parsePeriodFromDescription('1.7.25-31.12.25');
    expect(result).toEqual({ from: '2025-07-01', to: '2025-12-31' });
  });

  it('handles en-dash separator', () => {
    const result = parsePeriodFromDescription('1/7/25–31/12/25');
    expect(result).toEqual({ from: '2025-07-01', to: '2025-12-31' });
  });

  it('handles 4-digit years', () => {
    const result = parsePeriodFromDescription('1/7/2025-31/12/2025');
    expect(result).toEqual({ from: '2025-07-01', to: '2025-12-31' });
  });

  it('returns null for non-date descriptions', () => {
    expect(parsePeriodFromDescription('Airbnb payout')).toBeNull();
    expect(parsePeriodFromDescription('wartime')).toBeNull();
    expect(parsePeriodFromDescription(null)).toBeNull();
    expect(parsePeriodFromDescription('')).toBeNull();
  });
});

// ─── stayOverlapsPeriod ─────────────────────────────────────────────────────

describe('stayOverlapsPeriod', () => {
  it('detects stay fully within period', () => {
    expect(stayOverlapsPeriod('2025-08-10', '2025-08-15', '2025-07-01', '2025-12-31')).toBe(true);
  });

  it('detects stay partially overlapping period start', () => {
    expect(stayOverlapsPeriod('2025-06-28', '2025-07-03', '2025-07-01', '2025-12-31')).toBe(true);
  });

  it('detects stay partially overlapping period end', () => {
    expect(stayOverlapsPeriod('2025-12-29', '2026-01-03', '2025-07-01', '2025-12-31')).toBe(true);
  });

  it('detects no overlap (stay before period)', () => {
    expect(stayOverlapsPeriod('2025-05-01', '2025-05-05', '2025-07-01', '2025-12-31')).toBe(false);
  });

  it('detects no overlap (stay after period)', () => {
    expect(stayOverlapsPeriod('2026-02-01', '2026-02-05', '2025-07-01', '2025-12-31')).toBe(false);
  });

  it('exact boundary: checkout on period start is overlap', () => {
    // Stay ends exactly when period starts — still overlaps (boundary day shared)
    expect(stayOverlapsPeriod('2025-06-28', '2025-07-01', '2025-07-01', '2025-12-31')).toBe(true);
  });
});

// ─── buildJjPeriodAggregates ────────────────────────────────────────────────

describe('buildJjPeriodAggregates', () => {
  it('filters to Platform Income only', () => {
    const txs = [
      makeJjTx({ id: 'tx-1', subcategory: 'Platform Income', description: '1/7/25-31/12/25' }),
      makeJjTx({ id: 'tx-2', subcategory: 'Cleaning' }),
      makeJjTx({ id: 'tx-3', subcategory: 'Management Fee' }),
    ];

    const result = buildJjPeriodAggregates(txs);
    expect(result).toHaveLength(1);
    expect(result[0].transactionId).toBe('tx-1');
  });

  it('parses period from description', () => {
    const txs = [
      makeJjTx({ id: 'tx-1', description: 'הכנסה 1/7/25-31/12/25', amountEur: 5857.10 }),
    ];

    const result = buildJjPeriodAggregates(txs);
    expect(result[0].periodFrom).toBe('2025-07-01');
    expect(result[0].periodTo).toBe('2025-12-31');
    expect(result[0].amountEur).toBe(5857.10);
  });

  it('returns null period for unparseable descriptions', () => {
    const txs = [
      makeJjTx({ id: 'tx-1', description: 'wartime' }),
    ];

    const result = buildJjPeriodAggregates(txs);
    expect(result[0].periodFrom).toBeNull();
    expect(result[0].periodTo).toBeNull();
  });
});

// ─── buildPeriodComparisons ─────────────────────────────────────────────────

describe('buildPeriodComparisons', () => {
  it('sums overlapping reservation payouts for a JJ period', () => {
    const res1 = makeReservation({
      hostawayReservationId: 'res-1',
      checkIn: '2025-08-10',
      checkOut: '2025-08-15',
      financials: { ...defaultFinancials, payout: { ...defaultPayout, amount: 300 } },
    });
    const res2 = makeReservation({
      hostawayReservationId: 'res-2',
      checkIn: '2025-09-01',
      checkOut: '2025-09-05',
      financials: { ...defaultFinancials, payout: { ...defaultPayout, amount: 200 } },
    });

    const aggregates = [{
      transactionId: 'tx-1',
      date: '2025-12-31',
      amountEur: 500,
      description: '1/7/25-31/12/25',
      periodFrom: '2025-07-01',
      periodTo: '2025-12-31',
      subcategory: 'Platform Income',
    }];

    const result = buildPeriodComparisons([res1, res2], aggregates);

    expect(result).toHaveLength(1);
    expect(result[0].hostawayReservationIds).toEqual(['res-1', 'res-2']);
    expect(result[0].hostawayPeriodPayout.amount).toBe(500);
    expect(result[0].periodMatchState).toBe('period_exact');
    expect(result[0].periodDifference).toBe(0);
  });

  it('detects period_difference when totals diverge', () => {
    const res1 = makeReservation({
      hostawayReservationId: 'res-1',
      checkIn: '2025-08-10',
      checkOut: '2025-08-15',
      financials: { ...defaultFinancials, payout: { ...defaultPayout, amount: 600 } },
    });

    const aggregates = [{
      transactionId: 'tx-1',
      date: '2025-12-31',
      amountEur: 500,
      description: '1/7/25-31/12/25',
      periodFrom: '2025-07-01',
      periodTo: '2025-12-31',
      subcategory: 'Platform Income',
    }];

    const result = buildPeriodComparisons([res1], aggregates);

    expect(result[0].periodMatchState).toBe('period_difference');
    expect(result[0].periodDifference).toBe(100);
    expect(result[0].periodDifferencePercent).toBe(20);
  });

  it('returns period_insufficient_data when period is unparseable', () => {
    const aggregates = [{
      transactionId: 'tx-1',
      date: '2025-01-01',
      amountEur: 425,
      description: 'wartime',
      periodFrom: null,
      periodTo: null,
      subcategory: 'Platform Income',
    }];

    const result = buildPeriodComparisons([makeReservation()], aggregates);

    expect(result[0].periodMatchState).toBe('period_insufficient_data');
    expect(result[0].hostawayReservationIds).toEqual([]);
  });

  it('skips cancelled reservations in period sums', () => {
    const res = makeReservation({
      hostawayReservationId: 'res-cancelled',
      checkIn: '2025-08-10',
      checkOut: '2025-08-15',
      status: 'cancelled',
      financials: { ...defaultFinancials, payout: { ...defaultPayout, amount: 300 } },
    });

    const aggregates = [{
      transactionId: 'tx-1',
      date: '2025-12-31',
      amountEur: 0,
      description: '1/7/25-31/12/25',
      periodFrom: '2025-07-01',
      periodTo: '2025-12-31',
      subcategory: 'Platform Income',
    }];

    const result = buildPeriodComparisons([res], aggregates);

    expect(result[0].hostawayReservationIds).toEqual([]);
    expect(result[0].hostawayPeriodPayout.amount).toBe(0);
  });
});

// ─── assignAuditStates ──────────────────────────────────────────────────────

describe('assignAuditStates', () => {
  it('assigns aggregate_match for reservations within a JJ period', () => {
    const res = makeReservation({
      checkIn: '2025-08-10',
      checkOut: '2025-08-15',
    });

    const comparisons: PeriodComparison[] = [{
      jjAggregate: {
        transactionId: 'tx-1',
        date: '2025-12-31',
        amountEur: 5000,
        description: '1/7/25-31/12/25',
        periodFrom: '2025-07-01',
        periodTo: '2025-12-31',
        subcategory: 'Platform Income',
      },
      hostawayReservationIds: ['res-001'],
      hostawayPeriodPayout: { amount: 5000, source: 'reported', confidence: 'high', calculationNote: null },
      jjPeriodAmount: { amount: 5000, source: 'jj_recorded', confidence: 'high', calculationNote: null },
      periodMatchState: 'period_exact',
      periodDifference: 0,
      periodDifferencePercent: 0,
    }];

    const result = assignAuditStates([res], comparisons, []);

    expect(result[0].auditState).toBe('aggregate_match');
    expect(result[0].aggregatePeriodId).toBe('tx-1');
    expect(result[0].difference).toBeNull();
  });

  it('assigns not_comparable for cancelled reservations', () => {
    const res = makeReservation({ status: 'cancelled' });
    const result = assignAuditStates([res], [], []);

    expect(result[0].auditState).toBe('not_comparable');
    expect(result[0].difference).toBeNull();
  });

  it('assigns not_comparable for inquiry reservations', () => {
    const res = makeReservation({ status: 'inquiry' });
    const result = assignAuditStates([res], [], []);

    expect(result[0].auditState).toBe('not_comparable');
  });

  it('assigns not_comparable for owner_stay reservations', () => {
    const res = makeReservation({ status: 'owner_stay' });
    const result = assignAuditStates([res], [], []);

    expect(result[0].auditState).toBe('not_comparable');
  });

  it('assigns missing_in_jj when reservation has payout but no period match', () => {
    const res = makeReservation({
      checkIn: '2027-01-10',
      checkOut: '2027-01-15',
    });

    const result = assignAuditStates([res], [], []);

    expect(result[0].auditState).toBe('missing_in_jj');
    expect(result[0].difference).not.toBeNull();
    expect(result[0].difference!.direction).toBe('hostaway_only');
  });

  it('assigns insufficient_evidence when payout is null', () => {
    const nullPayout: AuthoritativeAmount = {
      amount: null,
      source: 'unknown',
      confidence: 'none',
      calculationNote: null,
    };
    const res = makeReservation({
      financials: {
        ...defaultFinancials,
        payout: nullPayout,
        payoutExpected: null,
      },
    });

    const result = assignAuditStates([res], [], []);

    expect(result[0].auditState).toBe('insufficient_evidence');
    expect(result[0].difference).toBeNull();
  });
});

// ─── matchReservations (legacy wrapper) ─────────────────────────────────────

// Need PeriodComparison type for test setup
import type { PeriodComparison } from '../types';

describe('matchReservations (legacy)', () => {
  it('processes reservations through the full pipeline', () => {
    const res = makeReservation({
      checkIn: '2025-08-10',
      checkOut: '2025-08-15',
    });
    const tx = makeJjTx({
      id: 'tx-1',
      description: 'הכנסה 1/7/25-31/12/25',
      amountEur: 5857.10,
    });

    const result = matchReservations([res], [tx]);

    expect(result).toHaveLength(1);
    // Since res is within the parsed period 2025-07-01 to 2025-12-31, should be aggregate_match
    expect(result[0].auditState).toBe('aggregate_match');
  });

  it('returns not_comparable for cancelled reservations', () => {
    const res = makeReservation({ status: 'cancelled' });
    const result = matchReservations([res], []);

    expect(result[0].auditState).toBe('not_comparable');
    expect(result[0].difference).toBeNull();
  });

  it('returns missing_in_jj when no JJ transactions exist', () => {
    const res = makeReservation();
    const result = matchReservations([res], []);

    expect(result[0].auditState).toBe('missing_in_jj');
    expect(result[0].difference).not.toBeNull();
    expect(result[0].difference!.direction).toBe('hostaway_only');
  });
});

// ─── isRevenueEligible ──────────────────────────────────────────────────────

describe('isRevenueEligible', () => {
  it('confirmed is eligible', () => {
    expect(isRevenueEligible('confirmed')).toBe(true);
  });

  it('modified is eligible', () => {
    expect(isRevenueEligible('modified')).toBe(true);
  });

  it('cancelled is NOT eligible', () => {
    expect(isRevenueEligible('cancelled')).toBe(false);
  });

  it('inquiry is NOT eligible', () => {
    expect(isRevenueEligible('inquiry')).toBe(false);
  });

  it('owner_stay is NOT eligible', () => {
    expect(isRevenueEligible('owner_stay')).toBe(false);
  });

  it('unknown is NOT eligible', () => {
    expect(isRevenueEligible('unknown')).toBe(false);
  });

  it('REVENUE_ELIGIBLE_STATUSES contains exactly confirmed and modified', () => {
    expect(REVENUE_ELIGIBLE_STATUSES.size).toBe(2);
    expect(REVENUE_ELIGIBLE_STATUSES.has('confirmed')).toBe(true);
    expect(REVENUE_ELIGIBLE_STATUSES.has('modified')).toBe(true);
  });
});

// ─── Status-specific behavior in period sums ────────────────────────────────

describe('status filtering in financial totals', () => {
  const period = {
    transactionId: 'tx-1',
    date: '2025-12-31',
    amountEur: 500,
    description: '1/7/25-31/12/25',
    periodFrom: '2025-07-01',
    periodTo: '2025-12-31',
    subcategory: 'Platform Income',
  };

  it('includes modified reservations in period sums', () => {
    const res = makeReservation({
      hostawayReservationId: 'res-modified',
      checkIn: '2025-08-10',
      checkOut: '2025-08-15',
      status: 'modified',
      financials: { ...defaultFinancials, payout: { ...defaultPayout, amount: 500 } },
    });

    const result = buildPeriodComparisons([res], [period]);
    expect(result[0].hostawayReservationIds).toEqual(['res-modified']);
    expect(result[0].hostawayPeriodPayout.amount).toBe(500);
  });

  it('excludes inquiry reservations from period sums', () => {
    const res = makeReservation({
      hostawayReservationId: 'res-inquiry',
      checkIn: '2025-08-10',
      checkOut: '2025-08-15',
      status: 'inquiry',
      financials: { ...defaultFinancials, payout: { ...defaultPayout, amount: 300 } },
    });

    const result = buildPeriodComparisons([res], [period]);
    expect(result[0].hostawayReservationIds).toEqual([]);
    expect(result[0].hostawayPeriodPayout.amount).toBe(0);
  });

  it('excludes owner_stay reservations from period sums', () => {
    const res = makeReservation({
      hostawayReservationId: 'res-owner',
      checkIn: '2025-08-10',
      checkOut: '2025-08-15',
      status: 'owner_stay',
      financials: { ...defaultFinancials, payout: { ...defaultPayout, amount: 400 } },
    });

    const result = buildPeriodComparisons([res], [period]);
    expect(result[0].hostawayReservationIds).toEqual([]);
    expect(result[0].hostawayPeriodPayout.amount).toBe(0);
  });

  it('excludes unknown reservations from period sums', () => {
    const res = makeReservation({
      hostawayReservationId: 'res-unknown',
      checkIn: '2025-08-10',
      checkOut: '2025-08-15',
      status: 'unknown',
      financials: { ...defaultFinancials, payout: { ...defaultPayout, amount: 200 } },
    });

    const result = buildPeriodComparisons([res], [period]);
    expect(result[0].hostawayReservationIds).toEqual([]);
    expect(result[0].hostawayPeriodPayout.amount).toBe(0);
  });

  it('mixed statuses: only confirmed+modified contribute to period total', () => {
    const confirmed = makeReservation({
      hostawayReservationId: 'res-c',
      checkIn: '2025-08-10', checkOut: '2025-08-15',
      status: 'confirmed',
      financials: { ...defaultFinancials, payout: { ...defaultPayout, amount: 300 } },
    });
    const modified = makeReservation({
      hostawayReservationId: 'res-m',
      checkIn: '2025-09-01', checkOut: '2025-09-05',
      status: 'modified',
      financials: { ...defaultFinancials, payout: { ...defaultPayout, amount: 200 } },
    });
    const cancelled = makeReservation({
      hostawayReservationId: 'res-x',
      checkIn: '2025-10-01', checkOut: '2025-10-05',
      status: 'cancelled',
      financials: { ...defaultFinancials, payout: { ...defaultPayout, amount: 1000 } },
    });
    const inquiry = makeReservation({
      hostawayReservationId: 'res-i',
      checkIn: '2025-11-01', checkOut: '2025-11-05',
      status: 'inquiry',
      financials: { ...defaultFinancials, payout: { ...defaultPayout, amount: 500 } },
    });

    const result = buildPeriodComparisons([confirmed, modified, cancelled, inquiry], [period]);

    // Only confirmed + modified = 300 + 200 = 500
    expect(result[0].hostawayReservationIds).toEqual(['res-c', 'res-m']);
    expect(result[0].hostawayPeriodPayout.amount).toBe(500);
    expect(result[0].periodMatchState).toBe('period_exact'); // matches JJ amount of 500
  });
});

// ─── assignAuditStates — additional status tests ────────────────────────────

describe('assignAuditStates status classification', () => {
  it('assigns not_comparable for unknown status', () => {
    const res = makeReservation({ status: 'unknown' });
    const result = assignAuditStates([res], [], []);
    expect(result[0].auditState).toBe('not_comparable');
  });

  it('assigns aggregate_match for modified reservation within a period', () => {
    const res = makeReservation({
      hostawayReservationId: 'res-mod',
      checkIn: '2025-08-10',
      checkOut: '2025-08-15',
      status: 'modified',
    });

    const comparisons: PeriodComparison[] = [{
      jjAggregate: {
        transactionId: 'tx-1',
        date: '2025-12-31',
        amountEur: 5000,
        description: '1/7/25-31/12/25',
        periodFrom: '2025-07-01',
        periodTo: '2025-12-31',
        subcategory: 'Platform Income',
      },
      hostawayReservationIds: ['res-mod'],
      hostawayPeriodPayout: { amount: 5000, source: 'reported', confidence: 'high', calculationNote: null },
      jjPeriodAmount: { amount: 5000, source: 'jj_recorded', confidence: 'high', calculationNote: null },
      periodMatchState: 'period_exact',
      periodDifference: 0,
      periodDifferencePercent: 0,
    }];

    const result = assignAuditStates([res], comparisons, []);
    expect(result[0].auditState).toBe('aggregate_match');
  });
});

// ─── findUnmatchedJjTransactions ─────────────────────────────────────────────

describe('findUnmatchedJjTransactions', () => {
  it('returns Platform Income transactions not in matched set', () => {
    const transactions: JjAirbnbTransaction[] = [
      makeJjTx({ id: 'tx-001', subcategory: 'Platform Income' }),
      makeJjTx({ id: 'tx-002', subcategory: 'Platform Income' }),
      makeJjTx({ id: 'tx-003', subcategory: 'Cleaning' }),
    ];
    const matched = new Set(['tx-001']);

    const result = findUnmatchedJjTransactions(transactions, matched);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('tx-002');
  });

  it('excludes Cleaning and Management Fee from unmatched', () => {
    const transactions: JjAirbnbTransaction[] = [
      makeJjTx({ id: 'tx-001', subcategory: 'Cleaning' }),
      makeJjTx({ id: 'tx-002', subcategory: 'Management Fee' }),
    ];

    const result = findUnmatchedJjTransactions(transactions, new Set());

    expect(result).toHaveLength(0);
  });

  it('returns empty when all Platform Income matched', () => {
    const transactions: JjAirbnbTransaction[] = [
      makeJjTx({ id: 'tx-001', subcategory: 'Platform Income' }),
    ];

    const result = findUnmatchedJjTransactions(transactions, new Set(['tx-001']));

    expect(result).toHaveLength(0);
  });
});
