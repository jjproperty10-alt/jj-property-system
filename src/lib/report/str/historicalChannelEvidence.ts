/**
 * historicalChannelEvidence — read-only provider for recovered NON-Hostaway channel reservation
 * evidence (pms.historical_channel_reservation_evidence).
 *
 * Purpose: properties whose STR channel data did NOT come through Hostaway (e.g. a deleted Hostaway
 * listing) have their Booking/Airbnb reservations recovered directly from the channel extranets and
 * stored with TRUE provenance (provider = 'airbnb' | 'booking', never 'hostaway'). This provider maps
 * that evidence into the SAME StatementReservationEvidence shape the certified Hostaway path produces,
 * so it flows through the existing composeOwnerStrStatement / buildStrStatementLine engine unchanged.
 *
 * Boundary: read-only (.select only). No writes; only ever called by the server-guarded ownerStrStatementService. No second financial engine — buildStrStatementLine
 * still derives Management Fee (20%) and Net Owner Payout. Unknown stays null (never coerced).
 *
 * Channel mapping note: recovered evidence already carries the ACTUAL platform fee (commission +
 * payment fee, from the real payout). The certified line builder synthesises a +1.6% Booking payment
 * fee only for channel === 'booking'. To avoid double-counting that fee on recovered direct-channel
 * Booking data, the provider maps DB channel 'booking' -> line channel 'booking_direct' (isBooking =
 * false in the line builder). Airbnb is unaffected.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { StatementReservationEvidence } from './ownerStrStatement'

/** Channel-source statuses that represent realised owner-facing revenue (mirror of isRevenueEligible). */
const REVENUE_STATUSES: ReadonlySet<string> = new Set(['paid', 'ok', 'confirmed', 'modified'])

interface HistoricalEvidenceRow {
  external_reservation_id: string
  channel: string
  provider: string
  guest_name: string | null
  check_in_date: string
  check_out_date: string
  status: string
  gross_amount: number | string | null
  platform_fee: number | string | null
  cleaning_fee: number | string | null
  tax_amount: number | string | null
  net_payout: number | string | null
}

const num = (v: unknown): number | null =>
  v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v)

const nightsBetween = (ci: string, co: string): number => {
  const a = Date.parse(ci), b = Date.parse(co)
  if (Number.isNaN(a) || Number.isNaN(b)) return 0
  return Math.max(0, Math.round((b - a) / 86_400_000))
}

/**
 * Guest masking — identical rule to ownerReservationAdapter.maskGuestName (G3-19, locked 2026-07-25),
 * inlined to keep this provider free of server-only imports (directly unit-testable):
 * checkOut < today -> '[Guest]'; null -> null (never fabricated); active/upcoming -> full name.
 */
function maskGuest(guestName: string | null, checkOut: string, today: string): string | null {
  if (guestName === null) return null
  return checkOut < today ? '[Guest]' : guestName
}

/** Line-builder channel: keep 'airbnb'; map 'booking' -> 'booking_direct' so no synthetic +1.6% fee. */
function lineChannel(dbChannel: string): string {
  return dbChannel === 'booking' ? 'booking_direct' : dbChannel
}

/**
 * Fetch revenue-eligible recovered channel reservations for a property as StatementReservationEvidence.
 * Periodization (check-in month) is applied by the caller via belongsToStatementMonth, identical to the
 * Hostaway path. Cancelled / no-show / inquiry rows are excluded here (no owner revenue).
 */
export async function getHistoricalChannelEvidence(
  sb: SupabaseClient,
  propertyId: string,
  propertyName: string,
  today: string,
): Promise<StatementReservationEvidence[]> {
  const { data, error } = await sb
    .schema('pms')
    .from('historical_channel_reservation_evidence')
    .select(
      'external_reservation_id, channel, provider, guest_name, check_in_date, check_out_date, status, gross_amount, platform_fee, cleaning_fee, tax_amount, net_payout',
    )
    .eq('property_id', propertyId)
    .eq('is_current', true)
    .eq('review_status', 'active')
  if (error || !data) return []

  const out: StatementReservationEvidence[] = []
  for (const raw of data as HistoricalEvidenceRow[]) {
    if (!REVENUE_STATUSES.has(String(raw.status))) continue
    const provider = String(raw.provider) // 'airbnb' | 'booking' — real source, for provenance tags
    out.push({
      reservationId: String(raw.external_reservation_id),
      channel: lineChannel(String(raw.channel)),
      grossEur: num(raw.gross_amount),
      platformFeesEur: num(raw.platform_fee),
      platformFeesSource: provider + ':actual_platform_fee',
      cleaningEur: num(raw.cleaning_fee),
      taxesEur: num(raw.tax_amount),
      platformPayoutEvidenceEur: num(raw.net_payout),
      propertyName,
      guestName: maskGuest(raw.guest_name ?? null, raw.check_out_date, today),
      checkIn: String(raw.check_in_date),
      checkOut: String(raw.check_out_date),
      nights: nightsBetween(String(raw.check_in_date), String(raw.check_out_date)),
    })
  }
  return out
}
