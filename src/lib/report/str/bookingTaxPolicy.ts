/**
 * bookingTaxPolicy — ACCOUNT-BOUNDED Booking.com zero-tax reporting policy (approved 2026-08).
 *
 * NOT a global rule. This does NOT say "Booking.com always = €0 tax" and does NOT turn a bare
 * `null` into 0 generically. It is a narrow, auditable reporting policy for JJ's CURRENT validated
 * Hostaway / Booking.com account configuration only.
 *
 * Evidence basis (portfolio audit 2026-08): 217/217 revenue-eligible Booking reservations in this
 * account carry raw `taxAmount = null`, and every available Hostaway Owner Statement shows Booking
 * Taxes = €0.00 (Ofri + Tamir July 2026 reconcile cent-exact with zero Booking tax). This is enough
 * to stop hand-entering per-month evidence, but is scoped to this account/regime — never Airbnb,
 * Direct, Booking Engine, another account, or a regime where contradictory evidence appears.
 *
 * FAIL CLOSED: any explicit tax value (even 0), any non-Booking channel, or a date outside the
 * validated regime → policy does NOT apply, and the more authoritative evidence is used instead.
 * Statement/reporting only — raw Hostaway data is never mutated.
 */
export interface BookingTaxPolicy {
  readonly channel: 'booking'
  /** Earliest audited Booking reservation arrival (derived from the 217-reservation audit). */
  readonly effectiveFrom: string
  /** null = ongoing/current configuration. */
  readonly effectiveTo: string | null
  readonly taxTreatment: 'verified_zero'
  readonly evidenceBasis: string
}

export const JJ_BOOKING_TAX_POLICY: BookingTaxPolicy = {
  channel: 'booking',
  effectiveFrom: '2025-09-25', // earliest audited Booking arrival (min of 217 reservations)
  effectiveTo: null,           // ongoing — latest audited arrival 2027-01-05
  taxTreatment: 'verified_zero',
  evidenceBasis:
    '217/217 revenue-eligible Booking reservations raw taxAmount=null; Hostaway Owner Statements (Ofri/Tamir July 2026) reconcile cent-exact with zero Booking tax',
}

/**
 * Account-bounded verified-zero tax for a Booking reservation.
 * True ONLY when: channel is Booking, raw tax is null (no explicit evidence), and the reservation
 * falls within the validated regime. Fail-closed on everything else.
 */
export function isBookingAccountVerifiedZero(
  channel: string,
  rawTaxAmount: number | null | undefined,
  attributionDate: string,
): boolean {
  if (channel !== 'booking') return false
  if (rawTaxAmount != null) return false // explicit tax (even 0) is authoritative — never override
  const p = JJ_BOOKING_TAX_POLICY
  if (attributionDate < p.effectiveFrom) return false
  if (p.effectiveTo != null && attributionDate > p.effectiveTo) return false
  return true
}
