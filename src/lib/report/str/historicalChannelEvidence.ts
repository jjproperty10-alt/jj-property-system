/**
 * historicalChannelEvidence — read-only provider for recovered NON-Hostaway channel reservation
 * evidence (pms.historical_channel_reservation_evidence).
 *
 * pms is NOT exposed to PostgREST. Reads go through public SECURITY DEFINER RPC
 * `pms_historical_reservations_for_property` (same pattern as pms_reservations_for_property).
 * Never labelled Hostaway. No ledger writes.
 *
 * Channel mapping: recovered Booking already carries the ACTUAL platform fee. The line builder
 * would add +1.6% when channel === 'booking', so this provider maps 'booking' → 'booking_direct'.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { StatementReservationEvidence } from './ownerStrStatement'

/** JJ historical-management cutoff for recovered channel evidence (check-in inclusive). */
export const HISTORICAL_MANAGED_CHECKIN_CUTOFF = '2026-06-10'

/** Recovered OTA channels only. Direct/LTR rent is not historical STR evidence. */
const OTA_CHANNELS: ReadonlySet<string> = new Set(['airbnb', 'booking', 'booking_direct'])
const REVENUE_STATUSES: ReadonlySet<string> = new Set(['paid', 'ok', 'confirmed', 'modified'])

export interface HistoricalEvidenceRow {
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

const isoDate = (v: unknown): string => String(v).slice(0, 10)

const nightsBetween = (ci: string, co: string): number => {
  const a = Date.parse(ci), b = Date.parse(co)
  if (Number.isNaN(a) || Number.isNaN(b)) return 0
  return Math.max(0, Math.round((b - a) / 86_400_000))
}

function maskGuest(guestName: string | null, checkOut: string, today: string): string | null {
  if (guestName === null) return null
  return checkOut < today ? '[Guest]' : guestName
}

/** Line-builder channel: keep 'airbnb'; map 'booking' -> 'booking_direct' so no synthetic +1.6% fee. */
function lineChannel(dbChannel: string): string {
  return dbChannel === 'booking' ? 'booking_direct' : dbChannel
}

export function mapHistoricalRow(
  raw: HistoricalEvidenceRow,
  propertyName: string,
  today: string,
): StatementReservationEvidence | null {
  if (!REVENUE_STATUSES.has(String(raw.status))) return null
  if (String(raw.provider) === 'hostaway') return null
  if (!OTA_CHANNELS.has(String(raw.channel))) return null
  const checkIn = isoDate(raw.check_in_date)
  if (checkIn > HISTORICAL_MANAGED_CHECKIN_CUTOFF) return null
  const provider = String(raw.provider)
  const checkOut = isoDate(raw.check_out_date)
  return {
    reservationId: String(raw.external_reservation_id),
    channel: lineChannel(String(raw.channel)),
    grossEur: num(raw.gross_amount),
    platformFeesEur: num(raw.platform_fee),
    platformFeesSource: provider + ':actual_platform_fee',
    cleaningEur: num(raw.cleaning_fee),
    taxesEur: num(raw.tax_amount),
    platformPayoutEvidenceEur: num(raw.net_payout),
    propertyName,
    guestName: maskGuest(raw.guest_name ?? null, checkOut, today),
    checkIn,
    checkOut,
    nights: nightsBetween(checkIn, checkOut),
  }
}

/**
 * Live Hostaway rows first; historical rows appended only when reservationId is new.
 * Prevents double-counting if a property ever has both sources for the same stay.
 */
export function mergeLiveAndHistoricalEvidence(
  live: readonly StatementReservationEvidence[],
  historical: readonly StatementReservationEvidence[],
): StatementReservationEvidence[] {
  const seen = new Set(live.map(r => r.reservationId))
  const out: StatementReservationEvidence[] = [...live]
  for (const h of historical) {
    if (seen.has(h.reservationId)) continue
    seen.add(h.reservationId)
    out.push(h)
  }
  return out
}

/**
 * Fetch revenue-eligible recovered channel reservations for a property by canonical property_id.
 * No live Hostaway mapping is required. Periodization (check-in month) is applied by the caller.
 */
export async function getHistoricalChannelEvidence(
  sb: SupabaseClient,
  propertyId: string,
  propertyName: string,
  today: string,
): Promise<StatementReservationEvidence[]> {
  const { data, error } = await sb.rpc('pms_historical_reservations_for_property', {
    p_property_id: propertyId,
  })
  if (error || !data) return []

  const out: StatementReservationEvidence[] = []
  for (const raw of data as HistoricalEvidenceRow[]) {
    const ev = mapHistoricalRow(raw, propertyName, today)
    if (ev) out.push(ev)
  }
  return out
}

async function loadHistoricalPropertyDefs(
  sb: SupabaseClient,
): Promise<{ id: string; name: string }[]> {
  const { data, error } = await sb.rpc('pms_historical_property_ids')
  if (error || !data) return []
  const ids = (data as { property_id: string }[]).map(r => String(r.property_id))
  if (!ids.length) return []
  const { data: defs } = await sb
    .from('property_definitions')
    .select('property_id, property_name')
    .in('property_id', ids)
  return (defs ?? []).map(d => ({ id: String(d.property_id), name: String(d.property_name) }))
}

/**
 * All canonical properties that currently have recovered historical channel evidence.
 * Used by the PDF route when an owner slug is missing from Owner Room (historical-only send path).
 */
export async function listHistoricalStrProperties(
  sb: SupabaseClient,
): Promise<{ id: string; name: string }[]> {
  return loadHistoricalPropertyDefs(sb)
}

/**
 * Canonical properties that have recovered historical channel evidence AND belong to this owner
 * (exact property_name match against the owner's managed names). No live Hostaway mapping required.
 */
export async function historicalPropertiesForOwner(
  sb: SupabaseClient,
  managedPropertyNames: readonly string[],
): Promise<{ id: string; name: string }[]> {
  if (!managedPropertyNames.length) return []
  const allowed = new Set(managedPropertyNames)
  return (await loadHistoricalPropertyDefs(sb)).filter(d => allowed.has(d.name))
}
