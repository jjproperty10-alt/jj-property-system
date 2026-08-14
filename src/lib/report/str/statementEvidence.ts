/**
 * statementEvidence — narrow register of authoritative Hostaway Owner Statement lines that supersede
 * an incomplete/inconsistent raw reservation payload for OWNER-FACING statement calculation only.
 *
 * Approved 2026-08 (Ofri/Sky View July parity). Use ONLY when the Hostaway Owner Statement explicitly
 * states a reservation's owner-facing line and the raw payload cannot reproduce it. Never generic,
 * never silent: every entry is reservation + period specific and cites its evidence source. Raw data
 * is never mutated; this affects the report layer only.
 */
import type { AuthoritativeStatementLine } from './strStatementLine'

export interface StatementLineEvidenceEntry {
  readonly reservationId: string
  readonly propertyName: string
  readonly periodStart: string
  readonly periodEnd: string
  readonly source: string
  readonly line: AuthoritativeStatementLine
}

export const STATEMENT_LINE_EVIDENCE: readonly StatementLineEvidenceEntry[] = [
  {
    // Airbnb reservation, Ofri Sky View, check-in 2026-07-23. Raw is incomplete: totalPrice 590.60,
    // taxAmount 0, hostFee 91.54. The Hostaway Owner Statement authoritatively states this line
    // (occupancy tax 44.92 included in Gross + Platform). Used verbatim for owner-facing parity.
    reservationId: '63342983',
    propertyName: 'Ofri Makarios 5 Floor',
    periodStart: '2026-07-01',
    periodEnd: '2026-07-31',
    source: 'Hostaway Owner Statement July 2026 — Ofri/Sky View (occupancy tax €44.92, verified) — approved by Yossi 2026-08',
    line: {
      grossEur: 635.52,
      platformFeesEur: 136.46,
      cleaningEur: 65.0,
      managementFeeEur: 77.83,
      taxesEur: 44.92,
      netOwnerPayoutEur: 311.32, // Hostaway's stated net for this reservation (its owner-facing truth)
    },
  },
  {
    // Booking-Engine (JJ's own direct engine) reservation, Tamir Dekelia (TM01 Sea View), check-in
    // 2026-06-11 (Michaelia Lambrou). Raw is incomplete: totalPrice 166.05, taxAmount null, no
    // commission/host fee. The Hostaway Owner Statement authoritatively states this line — proving the
    // channel is NOT zero-tax (Taxes 8.76, Platform 4.40). This is exactly why no blanket
    // bookingengine/direct zero-tax policy was created. Used verbatim for owner-facing parity.
    reservationId: '60765379',
    propertyName: 'Tamir Dekelia',
    periodStart: '2026-06-01',
    periodEnd: '2026-06-30',
    source: 'Hostaway Owner Statement June-August 2026 -- Tamir/TM01 Sea View, 2026-06-11 Michaelia Lambrou (Booking Engine; Taxes 8.76, Platform 4.40) -- approved by Yossi 2026-08',
    line: {
      grossEur: 166.05,
      platformFeesEur: 4.4,
      cleaningEur: 60.0,
      managementFeeEur: 18.58,
      taxesEur: 8.76,
      netOwnerPayoutEur: 74.31, // Hostaway's stated net for this reservation
    },
  },
]

/** Authoritative Hostaway statement line for a reservation, when explicit evidence exists. */
export function getAuthoritativeStatementLine(
  reservationId: string,
  propertyName: string,
  attributionDate: string,
): AuthoritativeStatementLine | null {
  const e = STATEMENT_LINE_EVIDENCE.find(
    x =>
      x.reservationId === reservationId &&
      x.propertyName === propertyName &&
      attributionDate >= x.periodStart &&
      attributionDate <= x.periodEnd,
  )
  return e ? e.line : null
}

/**
 * Owner Statement periodization (Hostaway parity): a reservation belongs to the statement month by
 * its ARRIVAL/check-in date (inclusive), NOT by overlap. Pure + testable.
 */
export function belongsToStatementMonth(checkIn: string, periodStart: string, periodEnd: string): boolean {
  return checkIn >= periodStart && checkIn <= periodEnd
}
