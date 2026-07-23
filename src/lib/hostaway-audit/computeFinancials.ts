/**
 * computeFinancials.ts — Pure functions for Hostaway financial calculations.
 *
 * No DB access. No side effects. Deterministic.
 *
 * Payout formulas (verified against real DB, Sprint 2):
 *   Airbnb:  PRIMARY = airbnbExpectedPayoutAmount (reported by Hostaway)
 *            FALLBACK = totalPrice − airbnbListingHostFee (calculated)
 *   Booking: totalPrice − channelCommissionAmount (calculated, estimate)
 *   Direct:  totalPrice (no platform fee)
 */

import type {
  BookingChannel,
  ReservationFinancials,
  AuthoritativeAmount,
  FinancialSource,
} from './types';

/** Raw financial fields extracted from pms.raw_reservations JSONB.
 *  Field names match the actual Hostaway API response keys. */
export interface RawReservationFinancials {
  readonly totalPrice: string | null;
  readonly cleaningFee: string | null;
  /** Airbnb host fee — actual key in JSONB is airbnbListingHostFee */
  readonly airbnbListingHostFee: string | null;
  /** Airbnb payout amount — direct from Hostaway, authoritative when available */
  readonly airbnbExpectedPayoutAmount: string | null;
  readonly channelCommissionAmount: string | null;
  readonly taxAmount: string | null;
  readonly airbnbListingBasePrice: string | null;
  readonly airbnbListingCleaningFee: string | null;
}

/**
 * Parse a numeric string to number, returning null for empty/null/NaN.
 * IEEE 754-safe: rounds to 2 decimal places.
 */
export function parseAmount(value: string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (Number.isNaN(n)) return null;
  return Math.round(n * 100) / 100;
}

/**
 * Normalize raw channel name to canonical BookingChannel.
 */
export function normalizeChannel(raw: string | null): BookingChannel {
  if (!raw) return 'other';
  // Hostaway channel_raw may be prefixed: "2005:bookingcom" → strip prefix
  const stripped = raw.includes(':') ? raw.split(':').slice(1).join(':') : raw;
  const lower = stripped.toLowerCase();
  if (lower === 'airbnbofficial' || lower === 'airbnb') return 'airbnb';
  if (lower === 'bookingcom' || lower === 'booking.com' || lower === 'booking') return 'booking';
  if (lower === 'direct' || lower === 'bookingengine') return 'direct';
  if (lower === 'homeaway' || lower === 'vrbo') return 'homeaway';
  return 'other';
}

/**
 * Compute the expected payout with full authority chain.
 * Returns AuthoritativeAmount declaring source and confidence.
 */
export function computePayoutWithAuthority(
  channel: BookingChannel,
  raw: RawReservationFinancials,
): AuthoritativeAmount {
  const total = parseAmount(raw.totalPrice);

  switch (channel) {
    case 'airbnb': {
      // Primary: reported by Hostaway directly
      const reported = parseAmount(raw.airbnbExpectedPayoutAmount);
      if (reported !== null) {
        return {
          amount: reported,
          source: 'reported',
          confidence: 'high',
          calculationNote: null,
        };
      }
      // Fallback: calculate from totalPrice − airbnbListingHostFee
      if (total !== null) {
        const hostFee = parseAmount(raw.airbnbListingHostFee);
        if (hostFee !== null) {
          return {
            amount: Math.round((total - hostFee) * 100) / 100,
            source: 'calculated',
            confidence: 'medium',
            calculationNote: 'totalPrice − airbnbListingHostFee',
          };
        }
      }
      return { amount: null, source: 'unknown', confidence: 'none', calculationNote: null };
    }
    case 'booking': {
      if (total === null) {
        return { amount: null, source: 'unknown', confidence: 'none', calculationNote: null };
      }
      const commission = parseAmount(raw.channelCommissionAmount);
      if (commission !== null) {
        return {
          amount: Math.round((total - commission) * 100) / 100,
          source: 'calculated',
          confidence: 'medium',
          calculationNote: 'totalPrice − channelCommissionAmount (no confirmed payout from Booking.com)',
        };
      }
      return { amount: null, source: 'unknown', confidence: 'none', calculationNote: null };
    }
    case 'direct':
    case 'homeaway':
    case 'other': {
      if (total === null) {
        return { amount: null, source: 'unknown', confidence: 'none', calculationNote: null };
      }
      return {
        amount: total,
        source: 'calculated',
        confidence: channel === 'direct' ? 'high' : 'medium',
        calculationNote: 'totalPrice (no platform fee)',
      };
    }
  }
}

/**
 * Legacy: compute payout as plain number.
 * @deprecated Use computePayoutWithAuthority instead.
 */
export function computePayout(
  channel: BookingChannel,
  raw: RawReservationFinancials,
): number | null {
  return computePayoutWithAuthority(channel, raw).amount;
}

/**
 * Build full ReservationFinancials from raw JSONB data.
 */
export function buildReservationFinancials(
  channel: BookingChannel,
  raw: RawReservationFinancials,
): ReservationFinancials {
  const totalPrice = parseAmount(raw.totalPrice);
  const cleaningFee = parseAmount(raw.cleaningFee);
  const hostServiceFee = parseAmount(raw.airbnbListingHostFee);
  const channelCommission = parseAmount(raw.channelCommissionAmount);
  const taxAmount = parseAmount(raw.taxAmount);
  const payout = computePayoutWithAuthority(channel, raw);

  let basePrice: number | null = null;
  if (totalPrice !== null && cleaningFee !== null) {
    basePrice = Math.round((totalPrice - cleaningFee) * 100) / 100;
  }

  return {
    totalPrice,
    cleaningFee,
    hostServiceFee,
    channelCommission,
    taxAmount,
    payout,
    payoutExpected: payout.amount, // Legacy compat
    basePrice,
  };
}
