/**
 * strStatementLine — pure composition of a single STR owner-statement reservation line.
 *
 * Locked business decisions (Yossi, confirmed):
 *  A. Management Fee: if Hostaway does not provide `managementFee`, the statement Management Fee is
 *     JJ-DERIVED using the approved STR policy — 20% after platform fees. It is a REPORT CALCULATION
 *     only (never creates/mutates transactions). If Hostaway later provides a real field, compare +
 *     keep provenance + flag mismatch (not handled here — Hostaway provides none today).
 *  B. Net Owner Payout: DERIVED, never a Hostaway field:
 *     Gross - Platform Fees - Cleaning - Management Fee - Taxes = Net Owner Payout.
 *     `airbnbExpectedPayoutAmount` is PLATFORM payout evidence only and is NEVER labeled Net Owner Payout.
 *  Taxes: a null/Unknown `taxAmount` stays Unknown/Needs Review — NEVER coerced to 0. Only an explicit
 *     0 from source counts as zero. Tax uncertainty propagates to Management Fee + Net Owner Payout.
 *
 * Provenance is explicit on every amount: 'hostaway' (evidence), 'jj_derived' (policy calc), or 'unknown'.
 * Pure + deterministic. No DB, no writes, no financial authority.
 */

export type AmountProvenance = 'hostaway' | 'jj_derived' | 'unknown'

export interface StatementAmount {
  /** null = Unknown (never fabricated). */
  readonly value: number | null
  readonly provenance: AmountProvenance
  /** Short machine tag of the exact source field / rule. */
  readonly source: string
}

/** Hostaway evidence inputs (already channel-resolved by computeFinancials). */
export interface StrLineEvidence {
  readonly reservationId: string
  readonly channel: string
  /** Hostaway totalPrice — Gross Rental Revenue. */
  readonly grossEur: number | null
  /** Platform Fees: airbnbListingHostFee (Airbnb) OR channelCommissionAmount (Booking). */
  readonly platformFeesEur: number | null
  readonly platformFeesSource: string
  /** Hostaway cleaningFee / airbnbListingCleaningFee. */
  readonly cleaningEur: number | null
  /** Hostaway taxAmount — null means Unknown (NOT zero). */
  readonly taxesEur: number | null
  /** Platform payout evidence only (totalPrice - platform fee). NEVER the net owner payout. */
  readonly platformPayoutEvidenceEur: number | null
  /**
   * Narrow evidence override (approved 2026-08): when `taxesEur` is null, tax normally stays
   * Unknown/Needs Review (Unknown != 0). This flag is set ONLY when an authoritative Hostaway
   * Owner Statement for this reservation's period explicitly proves Taxes = €0.00 — then, and only
   * then, tax is a VERIFIED zero. It NEVER turns a bare null into 0 without that explicit evidence.
   */
  readonly taxVerifiedZeroEvidence?: boolean
  /**
   * Authoritative Hostaway Owner Statement line (approved 2026-08). When the raw reservation payload
   * is incomplete/inconsistent and the Hostaway Owner Statement explicitly states the owner-facing
   * line for this reservation/period, that stated line is authoritative and used VERBATIM (bypassing
   * the JJ chain). Narrow + explicit + source-attributed. Never a silent generic override.
   */
  readonly authoritativeLine?: AuthoritativeStatementLine
}

/** Verbatim owner-facing line as stated by an authoritative Hostaway Owner Statement. */
export interface AuthoritativeStatementLine {
  readonly grossEur: number
  readonly platformFeesEur: number
  readonly cleaningEur: number
  readonly managementFeeEur: number
  readonly taxesEur: number
  readonly netOwnerPayoutEur: number
}

export interface StrStatementLine {
  readonly reservationId: string
  readonly channel: string
  readonly gross: StatementAmount
  readonly platformFees: StatementAmount
  readonly cleaning: StatementAmount
  readonly managementFee: StatementAmount      // JJ-derived (policy) — decision A
  readonly taxes: StatementAmount               // Hostaway evidence or Unknown
  readonly netOwnerPayout: StatementAmount      // derived chain — decision B
  /** Platform payout evidence, surfaced separately for reconciliation — never shown as Net Owner Payout. */
  readonly platformPayoutEvidence: StatementAmount
  readonly needsReview: boolean
  readonly reviewReasons: readonly string[]
}

/** IEEE-754-safe 2dp rounding. */
export function roundEur(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/** Approved JJ STR management-fee rate: 20% after platform fees. */
export const JJ_STR_MANAGEMENT_FEE_RATE = 0.20

/**
 * Booking.com payment/facilitation fee ("Payments by Booking.com"), 1.6% of gross.
 * PROVEN cent-exact per-reservation against Hostaway's own Owner Statements (Tamir July + August 2026):
 * Hostaway Platform Fees = channelCommissionAmount (15%) + round(gross x 1.6%). This is a REAL platform
 * fee charged by Booking.com — evidenced by Hostaway, applied only to the `booking` channel. Airbnb and
 * direct channels are unaffected. Report calculation only — never creates/mutates transactions.
 */
export const JJ_BOOKING_PAYMENT_FEE_RATE = 0.016

/**
 * Build one statement line from Hostaway evidence + JJ policy.
 * managementRate defaults to the approved 20%. `hostawayManagementFee` is accepted for the future
 * case where Hostaway starts providing it (today it is always null) — when present it is compared,
 * not silently overwritten.
 */
export function buildStrStatementLine(
  ev: StrLineEvidence,
  opts: { managementRate?: number; hostawayManagementFee?: number | null } = {},
): StrStatementLine {
  const rate = opts.managementRate ?? JJ_STR_MANAGEMENT_FEE_RATE
  const reasons: string[] = []

  // Authoritative Hostaway Owner Statement line — used verbatim (the statement is the owner-facing
  // truth when raw is incomplete/inconsistent). All amounts provenance 'hostaway' with an explicit
  // statement source tag; never Needs Review.
  if (ev.authoritativeLine) {
    const a = ev.authoritativeLine
    const amt = (value: number, src: string): StatementAmount => ({ value, provenance: 'hostaway', source: `hostaway_statement:${src}` })
    return {
      reservationId: ev.reservationId,
      channel: ev.channel,
      gross: amt(a.grossEur, 'gross'),
      platformFees: amt(a.platformFeesEur, 'platform_fees'),
      cleaning: amt(a.cleaningEur, 'cleaning'),
      managementFee: amt(a.managementFeeEur, 'management_fee'),
      taxes: amt(a.taxesEur, 'taxes'),
      netOwnerPayout: amt(a.netOwnerPayoutEur, 'net_owner_payout'),
      platformPayoutEvidence: amt(roundEur(a.grossEur - a.platformFeesEur), 'total_payout'),
      needsReview: false,
      reviewReasons: [],
    }
  }

  const gross: StatementAmount = { value: ev.grossEur, provenance: ev.grossEur == null ? 'unknown' : 'hostaway', source: 'hostaway:totalPrice' }

  // Platform Fees: channel commission (Hostaway evidence) PLUS, for Booking.com only, the proven 1.6%
  // Booking payment fee. Verified cent-exact against Hostaway Owner Statements. Airbnb/direct untouched.
  const isBooking = ev.channel === 'booking'
  const bookingPaymentFee =
    isBooking && ev.grossEur != null ? roundEur(ev.grossEur * JJ_BOOKING_PAYMENT_FEE_RATE) : null
  const platformFeesValue =
    ev.platformFeesEur != null && bookingPaymentFee != null
      ? roundEur(ev.platformFeesEur + bookingPaymentFee)
      : ev.platformFeesEur
  const platformFeesSource =
    bookingPaymentFee != null && ev.platformFeesEur != null
      ? `${ev.platformFeesSource}+jj_derived:booking_payment_fee_1_6pct`
      : ev.platformFeesSource
  const platformFees: StatementAmount = { value: platformFeesValue, provenance: platformFeesValue == null ? 'unknown' : 'hostaway', source: platformFeesSource }
  const cleaning: StatementAmount = { value: ev.cleaningEur, provenance: ev.cleaningEur == null ? 'unknown' : 'hostaway', source: 'hostaway:cleaningFee' }
  const platformPayoutEvidence: StatementAmount = {
    value: ev.platformPayoutEvidenceEur,
    provenance: ev.platformPayoutEvidenceEur == null ? 'unknown' : 'hostaway',
    source: 'hostaway:platform_payout_evidence',
  }

  // Taxes: an explicit source value is used as-is. A bare null stays Unknown/Needs Review (Unknown != 0)
  // UNLESS an authoritative Hostaway statement explicitly proves Taxes = €0.00 for the period (verified
  // zero). Only these two cases make tax "certain"; a bare null with no evidence never becomes 0.
  const taxesKnown = ev.taxesEur != null
  const taxVerifiedZero = ev.taxesEur == null && ev.taxVerifiedZeroEvidence === true
  const taxCertain = taxesKnown || taxVerifiedZero
  const taxes: StatementAmount = taxesKnown
    ? { value: ev.taxesEur, provenance: 'hostaway', source: 'hostaway:taxAmount' }
    : taxVerifiedZero
      ? { value: 0, provenance: 'hostaway', source: 'hostaway_statement:verified_zero_tax' }
      : { value: null, provenance: 'unknown', source: 'hostaway:taxAmount(null)' }
  if (!taxCertain) reasons.push('tax_unknown')
  if (ev.grossEur == null) reasons.push('gross_unknown')
  if (platformFeesValue == null) reasons.push('platform_fees_unknown')
  if (ev.cleaningEur == null) reasons.push('cleaning_unknown')

  // Total Payout = Gross - Platform Fees (evidence spine for the derived chain)
  const totalPayout =
    ev.grossEur != null && platformFeesValue != null ? roundEur(ev.grossEur - platformFeesValue) : null

  // Management Fee (decision A): JJ-derived 20% x (Total Payout - Cleaning - Taxes).
  // Requires Total Payout, Cleaning, AND Taxes to be known — otherwise Unknown/Needs Review.
  let managementFee: StatementAmount
  const canComputeMgmt = totalPayout != null && ev.cleaningEur != null && taxCertain
  if (opts.hostawayManagementFee != null) {
    managementFee = { value: roundEur(opts.hostawayManagementFee), provenance: 'hostaway', source: 'hostaway:managementFee' }
    if (canComputeMgmt) {
      const expected = roundEur(rate * (totalPayout! - ev.cleaningEur! - (ev.taxesEur ?? 0)))
      if (Math.abs(expected - roundEur(opts.hostawayManagementFee)) > 0.01) reasons.push('management_fee_mismatch')
    }
  } else if (canComputeMgmt) {
    managementFee = {
      value: roundEur(rate * (totalPayout! - ev.cleaningEur! - (ev.taxesEur ?? 0))),
      provenance: 'jj_derived',
      source: `jj_derived:${Math.round(rate * 100)}pct_after_platform_fees`,
    }
  } else {
    managementFee = { value: null, provenance: 'unknown', source: 'jj_derived:blocked_by_unknown_input' }
    reasons.push('management_fee_unknown')
  }

  // Net Owner Payout (decision B): Total Payout - Cleaning - Management Fee - Taxes.
  const canComputeNet = totalPayout != null && ev.cleaningEur != null && managementFee.value != null && taxCertain
  const netOwnerPayout: StatementAmount = canComputeNet
    ? {
        value: roundEur(totalPayout! - ev.cleaningEur! - managementFee.value! - (ev.taxesEur ?? 0)),
        provenance: 'jj_derived',
        source: 'jj_derived:gross_less_platform_cleaning_mgmt_taxes',
      }
    : { value: null, provenance: 'unknown', source: 'jj_derived:blocked_by_unknown_input' }
  if (!canComputeNet) reasons.push('net_owner_payout_unknown')

  return {
    reservationId: ev.reservationId,
    channel: ev.channel,
    gross, platformFees, cleaning, managementFee, taxes, netOwnerPayout, platformPayoutEvidence,
    needsReview: reasons.length > 0,
    reviewReasons: reasons,
  }
}
