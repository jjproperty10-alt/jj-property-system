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

  // ── STR portfolio certification batch (15 lines) — approved by Yossi 2026-09-03 ──
  // Source: Hostaway Owner Statement per-reservation line, scratch statement id 1084726
  // (SCRATCH_EVIDENCE_DELETE_ME): 4 listings (TM01/TM03/TM04/TM20), 2025-09-04→2026-09-03,
  // statuses New/Modified/Confirmed/Owner stay, per-reservation view. Values captured VERBATIM
  // from the statement's own columns (Gross rental revenue / Platform fees / Cleaning fee /
  // Management fee / Total taxes / Owner Payout). No raw derivation. Negative platform fee on
  // 46340130 preserved as stated by Hostaway. Fills the 15 previously Needs-Review lines
  // (10 Neer Booking cleaning = €0.00, 5 direct/bookingengine taxes).

  // Apartment Neer Yoav Dekelia (TM04 Sunrise View) — Booking.com, cleaning €0.00 authoritative
  { reservationId: '48339585', propertyName: 'Apartment Neer Yoav Dekelia', periodStart: '2025-10-01', periodEnd: '2025-10-31',
    source: 'Hostaway Owner Statement per-reservation line — scratch statement 1084726, Oct 2025, TM04 Sunrise View — approved by Yossi 2026-09-03',
    line: { grossEur: 272.00, platformFeesEur: 45.15, cleaningEur: 0.00, managementFeeEur: 40.88, taxesEur: 22.46, netOwnerPayoutEur: 163.51 } },
  { reservationId: '52060239', propertyName: 'Apartment Neer Yoav Dekelia', periodStart: '2026-01-01', periodEnd: '2026-01-31',
    source: 'Hostaway Owner Statement per-reservation line — scratch statement 1084726, Jan 2026, TM04 Sunrise View — approved by Yossi 2026-09-03',
    line: { grossEur: 80.92, platformFeesEur: 13.43, cleaningEur: 0.00, managementFeeEur: 13.50, taxesEur: 0.00, netOwnerPayoutEur: 53.99 } },
  { reservationId: '52062199', propertyName: 'Apartment Neer Yoav Dekelia', periodStart: '2026-01-01', periodEnd: '2026-01-31',
    source: 'Hostaway Owner Statement per-reservation line — scratch statement 1084726, Jan 2026, TM04 Sunrise View — approved by Yossi 2026-09-03',
    line: { grossEur: 63.58, platformFeesEur: 10.56, cleaningEur: 0.00, managementFeeEur: 10.60, taxesEur: 0.00, netOwnerPayoutEur: 42.42 } },
  { reservationId: '52301687', propertyName: 'Apartment Neer Yoav Dekelia', periodStart: '2026-01-01', periodEnd: '2026-01-31',
    source: 'Hostaway Owner Statement per-reservation line — scratch statement 1084726, Jan 2026, TM04 Sunrise View — approved by Yossi 2026-09-03',
    line: { grossEur: 66.29, platformFeesEur: 11.00, cleaningEur: 0.00, managementFeeEur: 11.06, taxesEur: 0.00, netOwnerPayoutEur: 44.23 } },
  { reservationId: '52439630', propertyName: 'Apartment Neer Yoav Dekelia', periodStart: '2026-01-01', periodEnd: '2026-01-31',
    source: 'Hostaway Owner Statement per-reservation line — scratch statement 1084726, Jan 2026, TM04 Sunrise View — approved by Yossi 2026-09-03',
    line: { grossEur: 69.56, platformFeesEur: 11.54, cleaningEur: 0.00, managementFeeEur: 11.60, taxesEur: 0.00, netOwnerPayoutEur: 46.42 } },
  { reservationId: '52570860', propertyName: 'Apartment Neer Yoav Dekelia', periodStart: '2026-01-01', periodEnd: '2026-01-31',
    source: 'Hostaway Owner Statement per-reservation line — scratch statement 1084726, Jan 2026, TM04 Sunrise View — approved by Yossi 2026-09-03',
    line: { grossEur: 66.29, platformFeesEur: 11.00, cleaningEur: 0.00, managementFeeEur: 11.06, taxesEur: 0.00, netOwnerPayoutEur: 44.23 } },
  { reservationId: '52331876', propertyName: 'Apartment Neer Yoav Dekelia', periodStart: '2026-01-01', periodEnd: '2026-01-31',
    source: 'Hostaway Owner Statement per-reservation line — scratch statement 1084726, Jan 2026, TM04 Sunrise View — approved by Yossi 2026-09-03',
    line: { grossEur: 208.68, platformFeesEur: 34.64, cleaningEur: 0.00, managementFeeEur: 34.81, taxesEur: 0.00, netOwnerPayoutEur: 139.23 } },
  { reservationId: '52062735', propertyName: 'Apartment Neer Yoav Dekelia', periodStart: '2026-01-01', periodEnd: '2026-01-31',
    source: 'Hostaway Owner Statement per-reservation line — scratch statement 1084726, Jan 2026, TM04 Sunrise View — approved by Yossi 2026-09-03',
    line: { grossEur: 479.74, platformFeesEur: 79.64, cleaningEur: 0.00, managementFeeEur: 80.02, taxesEur: 0.00, netOwnerPayoutEur: 320.08 } },
  { reservationId: '52606718', propertyName: 'Apartment Neer Yoav Dekelia', periodStart: '2026-02-01', periodEnd: '2026-02-28',
    source: 'Hostaway Owner Statement per-reservation line — scratch statement 1084726, Feb 2026, TM04 Sunrise View — approved by Yossi 2026-09-03',
    line: { grossEur: 337.54, platformFeesEur: 56.03, cleaningEur: 0.00, managementFeeEur: 56.30, taxesEur: 0.00, netOwnerPayoutEur: 225.21 } },
  { reservationId: '52919038', propertyName: 'Apartment Neer Yoav Dekelia', periodStart: '2026-05-01', periodEnd: '2026-05-31',
    source: 'Hostaway Owner Statement per-reservation line — scratch statement 1084726, May 2026, TM04 Sunrise View — approved by Yossi 2026-09-03',
    line: { grossEur: 131.20, platformFeesEur: 21.78, cleaningEur: 0.00, managementFeeEur: 21.88, taxesEur: 0.00, netOwnerPayoutEur: 87.54 } },

  // Apartment Neer Yoav Dekelia — direct booking, taxes €100.52 authoritative
  { reservationId: '48201236', propertyName: 'Apartment Neer Yoav Dekelia', periodStart: '2025-10-01', periodEnd: '2025-10-31',
    source: 'Hostaway Owner Statement per-reservation line — scratch statement 1084726, Oct 2025, TM04 Sunrise View (direct) — approved by Yossi 2026-09-03',
    line: { grossEur: 1351.52, platformFeesEur: 0.00, cleaningEur: 50.00, managementFeeEur: 240.20, taxesEur: 100.52, netOwnerPayoutEur: 960.80 } },

  // Tamir Dekelia (TM01 Sea View) — booking engine, taxes authoritative
  { reservationId: '46538640', propertyName: 'Tamir Dekelia', periodStart: '2025-09-01', periodEnd: '2025-09-30',
    source: 'Hostaway Owner Statement per-reservation line — scratch statement 1084726, Sep 2025, TM01 Sea View (booking engine) — approved by Yossi 2026-09-03',
    line: { grossEur: 966.38, platformFeesEur: 24.41, cleaningEur: 50.00, managementFeeEur: 163.26, taxesEur: 75.66, netOwnerPayoutEur: 653.05 } },
  { reservationId: '55722109', propertyName: 'Tamir Dekelia', periodStart: '2026-04-01', periodEnd: '2026-04-30',
    source: 'Hostaway Owner Statement per-reservation line — scratch statement 1084726, Apr 2026, TM01 Sea View (booking engine) — approved by Yossi 2026-09-03',
    line: { grossEur: 1073.70, platformFeesEur: 27.10, cleaningEur: 60.00, managementFeeEur: 180.58, taxesEur: 83.70, netOwnerPayoutEur: 722.32 } },

  // Tamir Radisson (TM03 City) — direct/owner stay, taxes €99.08 authoritative
  { reservationId: '53456572', propertyName: 'Tamir Radisson', periodStart: '2026-01-01', periodEnd: '2026-01-31',
    source: 'Hostaway Owner Statement per-reservation line — scratch statement 1084726, Jan 2026, TM03 City (direct) — approved by Yossi 2026-09-03',
    line: { grossEur: 1200.00, platformFeesEur: 0.00, cleaningEur: 0.00, managementFeeEur: 220.18, taxesEur: 99.08, netOwnerPayoutEur: 880.74 } },

  // Villa Mazotos (TM20 Royal Villa) — booking engine, taxes €380.70; platform fee −€16.68 is the
  // statement's own stated value (Total payout > Gross) — preserved verbatim, NOT normalized.
  { reservationId: '46340130', propertyName: 'Villa Mazotos', periodStart: '2025-09-01', periodEnd: '2025-09-30',
    source: 'Hostaway Owner Statement per-reservation line — scratch statement 1084726, Sep 2025, TM20 Royal Villa (booking engine; platform fee −16.68 as stated) — approved by Yossi 2026-09-03',
    line: { grossEur: 2495.70, platformFeesEur: -16.68, cleaningEur: 120.00, managementFeeEur: 402.34, taxesEur: 380.70, netOwnerPayoutEur: 1609.34 } },
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
