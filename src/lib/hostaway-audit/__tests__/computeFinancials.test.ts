/**
 * Unit tests for computeFinancials.ts — pure financial calculation functions.
 * No DB. No network. Deterministic.
 */

import { describe, it, expect } from '@jest/globals';
import {
  parseAmount,
  normalizeChannel,
  computePayout,
  computePayoutWithAuthority,
  buildReservationFinancials,
} from '../computeFinancials';
import type { RawReservationFinancials } from '../computeFinancials';

// ─── parseAmount ─────────────────────────────────────────────────────────────

describe('parseAmount', () => {
  it('parses a valid numeric string', () => {
    expect(parseAmount('123.45')).toBe(123.45);
  });

  it('parses an integer string', () => {
    expect(parseAmount('500')).toBe(500);
  });

  it('rounds to 2 decimal places (IEEE 754 safety)', () => {
    expect(parseAmount('10.005')).toBe(10.01);
    expect(parseAmount('99.999')).toBe(100);
  });

  it('returns null for null', () => {
    expect(parseAmount(null)).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(parseAmount(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseAmount('')).toBeNull();
  });

  it('returns null for NaN string', () => {
    expect(parseAmount('not-a-number')).toBeNull();
  });

  it('parses zero correctly', () => {
    expect(parseAmount('0')).toBe(0);
    expect(parseAmount('0.00')).toBe(0);
  });

  it('parses negative amounts', () => {
    expect(parseAmount('-15.50')).toBe(-15.5);
  });
});

// ─── normalizeChannel ────────────────────────────────────────────────────────

describe('normalizeChannel', () => {
  it('maps airbnbOfficial → airbnb', () => {
    expect(normalizeChannel('airbnbOfficial')).toBe('airbnb');
  });

  it('maps bookingcom → booking', () => {
    expect(normalizeChannel('bookingcom')).toBe('booking');
  });

  it('maps booking.com → booking', () => {
    expect(normalizeChannel('booking.com')).toBe('booking');
  });

  it('maps direct → direct', () => {
    expect(normalizeChannel('direct')).toBe('direct');
  });

  it('maps homeaway → homeaway', () => {
    expect(normalizeChannel('homeaway')).toBe('homeaway');
  });

  it('maps vrbo → homeaway', () => {
    expect(normalizeChannel('vrbo')).toBe('homeaway');
  });

  it('maps bookingengine → direct (property direct booking)', () => {
    expect(normalizeChannel('bookingengine')).toBe('direct');
  });

  it('returns other for truly unknown channel', () => {
    expect(normalizeChannel('someRandomOTA')).toBe('other');
  });

  it('returns other for null', () => {
    expect(normalizeChannel(null)).toBe('other');
  });

  it('is case-insensitive', () => {
    expect(normalizeChannel('AirbnbOfficial')).toBe('airbnb');
    expect(normalizeChannel('BOOKINGCOM')).toBe('booking');
  });

  it('strips Hostaway numeric prefix (e.g. "2005:bookingcom")', () => {
    expect(normalizeChannel('2005:bookingcom')).toBe('booking');
    expect(normalizeChannel('2018:airbnbOfficial')).toBe('airbnb');
    expect(normalizeChannel('2000:direct')).toBe('direct');
    expect(normalizeChannel('2013:bookingengine')).toBe('direct');
  });
});

// ─── computePayout ───────────────────────────────────────────────────────────

describe('computePayout', () => {
  const makeRaw = (overrides: Partial<RawReservationFinancials> = {}): RawReservationFinancials => ({
    totalPrice: '1000',
    cleaningFee: '50',
    airbnbListingHostFee: '30',
    airbnbExpectedPayoutAmount: null,
    channelCommissionAmount: '150',
    taxAmount: '0',
    airbnbListingBasePrice: null,
    airbnbListingCleaningFee: null,
    ...overrides,
  });

  describe('Airbnb channel', () => {
    it('payout = totalPrice − airbnbListingHostFee', () => {
      const raw = makeRaw({ totalPrice: '500', airbnbListingHostFee: '15' });
      expect(computePayout('airbnb', raw)).toBe(485);
    });

    it('returns null when totalPrice is missing', () => {
      const raw = makeRaw({ totalPrice: null });
      expect(computePayout('airbnb', raw)).toBeNull();
    });

    it('prefers airbnbExpectedPayoutAmount (reported) over calculation', () => {
      const raw = makeRaw({ airbnbExpectedPayoutAmount: '485' });
      expect(computePayout('airbnb', raw)).toBe(485);
    });

    it('falls back to calculation when airbnbExpectedPayoutAmount is null', () => {
      const raw = makeRaw({ airbnbListingHostFee: '30', airbnbExpectedPayoutAmount: null });
      expect(computePayout('airbnb', raw)).toBe(970); // 1000 - 30
    });

    it('returns null when both expectedPayout and hostFee are missing', () => {
      const raw = makeRaw({ airbnbListingHostFee: null, airbnbExpectedPayoutAmount: null });
      expect(computePayout('airbnb', raw)).toBeNull();
    });

    it('handles real-world Airbnb example (verified from DB)', () => {
      // totalPrice=1062.4, airbnbListingHostFee=189.64 → payout=872.76
      const raw = makeRaw({ totalPrice: '1062.4', airbnbListingHostFee: '189.64' });
      expect(computePayout('airbnb', raw)).toBe(872.76);
    });
  });

  describe('Booking channel', () => {
    it('payout = totalPrice − channelCommissionAmount', () => {
      const raw = makeRaw({ totalPrice: '800', channelCommissionAmount: '120' });
      expect(computePayout('booking', raw)).toBe(680);
    });

    it('returns null when channelCommissionAmount is missing', () => {
      const raw = makeRaw({ channelCommissionAmount: null });
      expect(computePayout('booking', raw)).toBeNull();
    });
  });

  describe('Direct channel', () => {
    it('payout = totalPrice (no platform fee)', () => {
      const raw = makeRaw({ totalPrice: '200' });
      expect(computePayout('direct', raw)).toBe(200);
    });
  });

  describe('Other channel', () => {
    it('payout = totalPrice (no platform fee)', () => {
      const raw = makeRaw({ totalPrice: '300' });
      expect(computePayout('other', raw)).toBe(300);
    });
  });

  it('rounds payout to 2 decimal places', () => {
    const raw = makeRaw({ totalPrice: '100.005', airbnbListingHostFee: '0' });
    const result = computePayout('airbnb', raw);
    expect(result).toBe(100.01);
  });
});

// ─── computePayoutWithAuthority (Sprint 2) ──────────────────────────────────

describe('computePayoutWithAuthority', () => {
  const makeRaw = (overrides: Partial<RawReservationFinancials> = {}): RawReservationFinancials => ({
    totalPrice: '1000',
    cleaningFee: '50',
    airbnbListingHostFee: '30',
    airbnbExpectedPayoutAmount: null,
    channelCommissionAmount: '150',
    taxAmount: '0',
    airbnbListingBasePrice: null,
    airbnbListingCleaningFee: null,
    ...overrides,
  });

  it('Airbnb: uses reported payout when airbnbExpectedPayoutAmount exists', () => {
    const raw = makeRaw({ airbnbExpectedPayoutAmount: '872.76' });
    const result = computePayoutWithAuthority('airbnb', raw);

    expect(result.amount).toBe(872.76);
    expect(result.source).toBe('reported');
    expect(result.confidence).toBe('high');
    expect(result.calculationNote).toBeNull();
  });

  it('Airbnb: falls back to calculated when no reported payout', () => {
    const raw = makeRaw({ totalPrice: '1062.4', airbnbListingHostFee: '189.64' });
    const result = computePayoutWithAuthority('airbnb', raw);

    expect(result.amount).toBe(872.76);
    expect(result.source).toBe('calculated');
    expect(result.confidence).toBe('medium');
    expect(result.calculationNote).toBe('totalPrice − airbnbListingHostFee');
  });

  it('Airbnb: returns unknown/none when both missing', () => {
    const raw = makeRaw({ totalPrice: null, airbnbExpectedPayoutAmount: null, airbnbListingHostFee: null });
    const result = computePayoutWithAuthority('airbnb', raw);

    expect(result.amount).toBeNull();
    expect(result.source).toBe('unknown');
    expect(result.confidence).toBe('none');
  });

  it('Booking: calculated with medium confidence', () => {
    const raw = makeRaw({ totalPrice: '800', channelCommissionAmount: '120' });
    const result = computePayoutWithAuthority('booking', raw);

    expect(result.amount).toBe(680);
    expect(result.source).toBe('calculated');
    expect(result.confidence).toBe('medium');
    expect(result.calculationNote).toContain('no confirmed payout from Booking.com');
  });

  it('Direct: calculated with high confidence', () => {
    const raw = makeRaw({ totalPrice: '200' });
    const result = computePayoutWithAuthority('direct', raw);

    expect(result.amount).toBe(200);
    expect(result.source).toBe('calculated');
    expect(result.confidence).toBe('high');
    expect(result.calculationNote).toBe('totalPrice (no platform fee)');
  });

  it('Other: calculated with medium confidence', () => {
    const raw = makeRaw({ totalPrice: '300' });
    const result = computePayoutWithAuthority('other', raw);

    expect(result.amount).toBe(300);
    expect(result.confidence).toBe('medium');
  });
});

// ─── buildReservationFinancials ──────────────────────────────────────────────

describe('buildReservationFinancials', () => {
  it('builds complete financials for Airbnb reservation', () => {
    const raw: RawReservationFinancials = {
      totalPrice: '500',
      cleaningFee: '50',
      airbnbListingHostFee: '15',
      airbnbExpectedPayoutAmount: '485',
      channelCommissionAmount: null,
      taxAmount: '10',
      airbnbListingBasePrice: null,
      airbnbListingCleaningFee: null,
    };

    const result = buildReservationFinancials('airbnb', raw);

    expect(result.totalPrice).toBe(500);
    expect(result.cleaningFee).toBe(50);
    expect(result.hostServiceFee).toBe(15);
    expect(result.channelCommission).toBeNull();
    expect(result.taxAmount).toBe(10);
    expect(result.payout.amount).toBe(485);
    expect(result.payout.source).toBe('reported');
    expect(result.payoutExpected).toBe(485); // legacy compat
    expect(result.basePrice).toBe(450);      // 500 − 50
  });

  it('builds financials for Booking reservation', () => {
    const raw: RawReservationFinancials = {
      totalPrice: '800',
      cleaningFee: '0',
      airbnbListingHostFee: null,
      airbnbExpectedPayoutAmount: null,
      channelCommissionAmount: '120',
      taxAmount: '0',
      airbnbListingBasePrice: null,
      airbnbListingCleaningFee: null,
    };

    const result = buildReservationFinancials('booking', raw);

    expect(result.payoutExpected).toBe(680); // 800 − 120
    expect(result.channelCommission).toBe(120);
    expect(result.hostServiceFee).toBeNull();
  });

  it('returns null basePrice when cleaningFee is null', () => {
    const raw: RawReservationFinancials = {
      totalPrice: '500',
      cleaningFee: null,
      airbnbListingHostFee: '15',
      airbnbExpectedPayoutAmount: null,
      channelCommissionAmount: null,
      taxAmount: null,
      airbnbListingBasePrice: null,
      airbnbListingCleaningFee: null,
    };

    const result = buildReservationFinancials('airbnb', raw);
    expect(result.basePrice).toBeNull();
  });

  it('handles all-null raw input', () => {
    const raw: RawReservationFinancials = {
      totalPrice: null,
      cleaningFee: null,
      airbnbListingHostFee: null,
      airbnbExpectedPayoutAmount: null,
      channelCommissionAmount: null,
      taxAmount: null,
      airbnbListingBasePrice: null,
      airbnbListingCleaningFee: null,
    };

    const result = buildReservationFinancials('airbnb', raw);

    expect(result.totalPrice).toBeNull();
    expect(result.payoutExpected).toBeNull();
    expect(result.basePrice).toBeNull();
  });
});
