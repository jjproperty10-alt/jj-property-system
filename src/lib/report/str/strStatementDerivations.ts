/**
 * strStatementDerivations — PURE, presentation-support derivations for owner STR statements.
 *
 * PRESENTATION AGGREGATION ONLY. These functions COUNT and SUM values that already exist on the
 * composed OwnerStrStatement DTO (activity rows + their line amounts). They never recompute a fee,
 * a net, a tax, or a management amount, never change attribution, and never decide inclusion — the
 * `activity` array is the single source of included reservations (cancelled/inquiry rows are already
 * excluded upstream by the composer). Adding or removing a function here cannot change any financial
 * total shown to the owner.
 *
 * Identifier limitation (documented, by design for this pass): the DTO activity row exposes only
 * `propertyName` (no stable property_id). The apartment rollup therefore groups by a normalized
 * propertyName (trimmed, internal whitespace collapsed). If two ledgers ever spell the same unit
 * differently they would split here — a future pass may add a stable id to the DTO. We deliberately
 * do NOT add a DTO field in this pass.
 */
import type { OwnerStrStatement } from './ownerStrStatement'
import { roundEur } from './strStatementLine'

/** Occupancy counts for a single month, derived from its already-included activity rows. */
export interface MonthOccupancy {
  /** Number of included reservations checking in this month (= activity.length; rows are unique per reservationId). */
  readonly checkIns: number
  /** Sum of included reservation nights for this month (check-in-month attribution, unchanged). */
  readonly nights: number
}

export function monthOccupancy(month: OwnerStrStatement): MonthOccupancy {
  const rows = month.activity
  return {
    checkIns: rows.length,
    nights: rows.reduce((acc, r) => acc + (Number.isFinite(r.nights) ? r.nights : 0), 0),
  }
}

/** Per-apartment rollup across every month of a range (or a single month). */
export interface PropertyRollup {
  readonly propertyName: string
  readonly checkIns: number
  readonly nights: number
  /** Sum of reservation gross; null (Unknown) if ANY included row's gross is Unknown. */
  readonly grossEur: number | null
  /** Sum of reservation net owner payout; null (Unknown) if ANY included row is Needs Review / Unknown. */
  readonly netOwnerPayoutEur: number | null
}

/** Normalize a property name for stable grouping (trim + collapse internal whitespace). */
export function normalizePropertyName(name: string): string {
  return name.trim().replace(/\s+/g, ' ')
}

export function perPropertyRollup(
  months: readonly OwnerStrStatement[],
): readonly PropertyRollup[] {
  interface Acc { display: string; checkIns: number; nights: number; gross: number; grossKnown: boolean; net: number; netKnown: boolean }
  const map = new Map<string, Acc>()
  for (const m of months) {
    for (const r of m.activity) {
      const key = normalizePropertyName(r.propertyName)
      const cur: Acc = map.get(key) ?? { display: key, checkIns: 0, nights: 0, gross: 0, grossKnown: true, net: 0, netKnown: true }
      cur.checkIns += 1
      cur.nights += Number.isFinite(r.nights) ? r.nights : 0
      const g = r.line.gross.value
      if (g == null) cur.grossKnown = false
      else cur.gross += g
      const n = r.line.netOwnerPayout.value
      if (r.line.needsReview || n == null) cur.netKnown = false
      else cur.net += n
      map.set(key, cur)
    }
  }
  return Array.from(map.values())
    .map(v => ({
      propertyName: v.display,
      checkIns: v.checkIns,
      nights: v.nights,
      grossEur: v.grossKnown ? roundEur(v.gross) : null,
      netOwnerPayoutEur: v.netKnown ? roundEur(v.net) : null,
    }))
    .sort((a, b) => a.propertyName.localeCompare(b.propertyName))
}

/** Flattened reservation row for the "Reservation Details" appendix (verbatim DTO fields, no math). */
export interface ReservationDetailRow {
  readonly reservationId: string
  readonly propertyName: string
  readonly channel: string
  readonly checkIn: string
  readonly checkOut: string
  readonly nights: number
  readonly guestName: string | null
  readonly grossValue: number | null
  readonly netValue: number | null
  readonly needsReview: boolean
}

/** Flatten every month's activity into a single chronological (check-in) reservation list. */
export function reservationDetails(months: readonly OwnerStrStatement[]): readonly ReservationDetailRow[] {
  const out: ReservationDetailRow[] = []
  for (const m of months) {
    for (const r of m.activity) {
      out.push({
        reservationId: r.reservationId,
        propertyName: r.propertyName,
        channel: r.channel,
        checkIn: r.checkIn,
        checkOut: r.checkOut,
        nights: r.nights,
        guestName: r.guestName,
        grossValue: r.line.gross.value,
        netValue: r.line.netOwnerPayout.value,
        needsReview: r.line.needsReview,
      })
    }
  }
  return out.sort((a, b) => (a.checkIn < b.checkIn ? -1 : a.checkIn > b.checkIn ? 1 : 0))
}
