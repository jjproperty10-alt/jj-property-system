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

  const gross: StatementAmount = { value: ev.grossEur, provenance: ev.grossEur == null ? 'unknown' : 'hostaway', source: 'hostaway:totalPrice' }
  const platformFees: StatementAmount = { value: ev.platformFeesEur, provenance: ev.platformFeesEur == null ? 'unknown' : 'hostaway', source: ev.platformFeesSource }
  const cleaning: StatementAmount = { value: ev.cleaningEur, provenance: ev.cleaningEur == null ? 'unknown' : 'hostaway', source: 'hostaway:cleaningFee' }
  const platformPayoutEvidence: StatementAmount = {
    value: ev.platformPayoutEvidenceEur,
    provenance: ev.platformPayoutEvidenceEur == null ? 'unknown' : 'hostaway',
    source: 'hostaway:platform_payout_evidence',
  }

  // Taxes: null stays Unknown/Needs Review — never coerced to 0.
  const taxesKnown = ev.taxesEur != null
  const taxes: StatementAmount = taxesKnown
    ? { value: ev.taxesEur, provenance: 'hostaway', source: 'hostaway:taxAmount' }
    : { value: null, provenance: 'unknown', source: 'hostaway:taxAmount(null)' }
  if (!taxesKnown) reasons.push('tax_unknown')
  if (ev.grossEur == null) reasons.push('gross_unknown')
  if (ev.platformFeesEur == null) reasons.push('platform_fees_unknown')
  if (ev.cleaningEur == null) reasons.push('cleaning_unknown')

  // Total Payout = Gross - Platform Fees (evidence spine for the derived chain)
  const totalPayout =
    ev.grossEur != null && ev.platformFeesEur != null ? roundEur(ev.grossEur - ev.platformFeesEur) : null

  // Management Fee (decision A): JJ-derived 20% x (Total Payout - Cleaning - Taxes).
  // Requires Total Payout, Cleaning, AND Taxes to be known — otherwise Unknown/Needs Review.
  let managementFee: StatementAmount
  const canComputeMgmt = totalPayout != null && ev.cleaningEur != null && taxesKnown
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
  const canComputeNet = totalPayout != null && ev.cleaningEur != null && managementFee.value != null && taxesKnown
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
