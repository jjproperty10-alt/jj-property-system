/**
 * taxEvidence — narrow, auditable register of periods where an authoritative Hostaway Owner Statement
 * EXPLICITLY proves Taxes = €0.00, allowing a bare null `taxAmount` to be treated as a VERIFIED zero
 * (approved 2026-08, Decision A narrow rule).
 *
 * SAFETY PRINCIPLE (unchanged): Unknown ≠ 0. A null tax with NO explicit evidence stays Needs Review.
 * This register is the ONLY thing that upgrades a null to a verified zero, and only for the exact
 * reservation periods for which we hold explicit Hostaway statement evidence. Never generalize.
 *
 * Each entry cites its evidence source. Adding a period REQUIRES a real Hostaway Owner Statement
 * showing "Total taxes €0.00" for that owner/property/period.
 */
export interface VerifiedZeroTaxPeriod {
  readonly channel: 'booking'
  readonly propertyNames: readonly string[]
  readonly periodStart: string // inclusive ISO date
  readonly periodEnd: string   // inclusive ISO date
  readonly source: string      // human-auditable evidence citation
}

export const VERIFIED_ZERO_TAX_REGISTER: readonly VerifiedZeroTaxPeriod[] = [
  {
    channel: 'booking',
    propertyNames: ['Tamir Dekelia', 'Tamir Radisson'],
    periodStart: '2026-07-01',
    periodEnd: '2026-07-31',
    source: 'Hostaway Owner Statement July 2026 (Total taxes €0.00) — approved by Yossi 2026-08',
  },
  {
    channel: 'booking',
    propertyNames: ['Ofri Makarios 5 Floor'],
    periodStart: '2026-07-01',
    periodEnd: '2026-07-31',
    source: 'Hostaway Owner Statement July 2026 — Ofri/Sky View Booking rows show Taxes €0.00 — approved by Yossi 2026-08',
  },
]

/**
 * True only when authoritative evidence proves Taxes = €0.00 for this Booking reservation's period.
 * `attributionDate` is the reservation's check-in (month attribution matches the statement period rule).
 */
export function isTaxVerifiedZero(channel: string, propertyName: string, attributionDate: string): boolean {
  if (channel !== 'booking') return false
  return VERIFIED_ZERO_TAX_REGISTER.some(
    e =>
      e.channel === 'booking' &&
      e.propertyNames.includes(propertyName) &&
      attributionDate >= e.periodStart &&
      attributionDate <= e.periodEnd,
  )
}
