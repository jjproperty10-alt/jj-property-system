/**
 * airbnbTaxPolicy — Cyprus VAT gross-up for Airbnb OWNER STATEMENTS (report layer only).
 *
 * WHY: Airbnb's reservation feed reports amounts tax-EXCLUSIVE — `totalPrice` and
 * `airbnbListingHostFee` are net of occupancy tax and `taxAmount` is 0. The authoritative Hostaway
 * Owner Statement grosses-up 9% Cyprus VAT (on the Airbnb host payout) into BOTH Gross Rental Revenue
 * and Platform Fees, and surfaces the same amount as Taxes. Because the +VAT on Gross and the +VAT on
 * Platform cancel inside Total Payout (Gross − Platform), the only economic effect is a lower
 * management-fee base and a lower owner payout — matching Hostaway exactly. This is NOT a
 * double-subtraction bug in JJ code: the VAT was simply never present in the raw feed.
 *
 * PROVEN cent-exact vs the authoritative Hostaway Owner Statement:
 *   - Miranta Radisson — 5/5 reservations, June–August 2026 (per-reservation, monthly, overall).
 *   - Ofri Sky View reservation 63342983 (July 2026): 499.06 × 9% = €44.92 (its statement-line tax).
 *
 * SCOPE / SAFETY: provider-keyed to the `airbnb` channel ONLY — Booking, direct and historical
 * channels are never touched. Applied ONLY when the raw feed carries NO explicit tax (taxAmount 0/null)
 * AND an explicit Airbnb payout exists (airbnbExpectedPayoutAmount, or totalPrice − hostFee). This is
 * explicit reservation-level evidence, not a blanket assumption; a reservation that already carries an
 * explicit nonzero tax is respected as-is. Report layer only — never mutates raw snapshots or
 * transactions.
 */

/** Cyprus VAT rate applied by Hostaway on Airbnb host payout (evidenced, not assumed). */
export const AIRBNB_CYPRUS_VAT_RATE = 0.09

function roundEur(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

export interface AirbnbTaxInput {
  readonly channel: string
  /** Raw Hostaway totalPrice (tax-exclusive for Airbnb). */
  readonly grossEur: number | null
  /** Raw platform fee — airbnbListingHostFee (tax-exclusive for Airbnb). */
  readonly platformFeesEur: number | null
  /** Raw taxAmount — 0/null when Airbnb omits the occupancy VAT. */
  readonly taxesEur: number | null
  /** Explicit Airbnb host payout (airbnbExpectedPayoutAmount, or totalPrice − hostFee). */
  readonly airbnbExpectedPayoutEur: number | null
}

export interface AirbnbTaxOutput {
  readonly grossEur: number | null
  readonly platformFeesEur: number | null
  readonly taxesEur: number | null
  readonly applied: boolean
  /** The occupancy VAT folded in (null when not applied). */
  readonly occupancyTaxEur: number | null
}

/**
 * Fold Cyprus 9% VAT (on the Airbnb host payout) into Gross + Platform Fees and surface it as Taxes,
 * matching the authoritative Hostaway Owner Statement. Pure + deterministic. Returns inputs unchanged
 * when the rule does not apply.
 */
export function applyAirbnbCyprusVat(input: AirbnbTaxInput): AirbnbTaxOutput {
  const unchanged: AirbnbTaxOutput = {
    grossEur: input.grossEur,
    platformFeesEur: input.platformFeesEur,
    taxesEur: input.taxesEur,
    applied: false,
    occupancyTaxEur: null,
  }

  // Provider-keyed: Airbnb only.
  if (input.channel !== 'airbnb') return unchanged
  // Respect an explicit nonzero tax — never double-apply.
  if (input.taxesEur != null && input.taxesEur !== 0) return unchanged
  // Requires explicit payout evidence AND both gross and platform present to gross-up cleanly
  // (Unknown is never fabricated).
  if (input.airbnbExpectedPayoutEur == null || input.grossEur == null || input.platformFeesEur == null) {
    return unchanged
  }

  const occ = roundEur(input.airbnbExpectedPayoutEur * AIRBNB_CYPRUS_VAT_RATE)
  if (occ <= 0) return unchanged

  return {
    grossEur: roundEur(input.grossEur + occ),
    platformFeesEur: roundEur(input.platformFeesEur + occ),
    taxesEur: occ,
    applied: true,
    occupancyTaxEur: occ,
  }
}
