/**
 * VM1 Partnership Workspace — read-only identity adapter.
 *
 * Validates the legacy ledger UUID through public.resolve_property_canonical,
 * then reads Hostaway stays through public.pms_reservations_for_property keyed
 * by listing 412148. No financial totals, no partner splits, no name fallback.
 *
 * Frozen Avi reservation IDs are supplied by the caller (ReadonlySet). This
 * module does not import or copy AVI_HOSTAWAY_STAYS.
 *
 * server-only.
 */

import 'server-only'

import { isRevenueEligible } from '@/lib/hostaway-audit/types'
import type { ReservationStatus } from '@/lib/hostaway-audit/types'
import { isBlankInput, isUuidLike } from '@/lib/identity/identityInput'
import {
  VM1_CANONICAL_PROPERTY_ID,
  VM1_HOSTAWAY_LISTING_ID,
  VM1_LEGACY_LEDGER_PROPERTY_ID,
  VM1_NEW_PERIOD_START,
} from './vm1Identity'

export interface Vm1RpcClient {
  rpc(
    fn: string,
    args?: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>
}

export interface VerifiedVm1Identity {
  readonly canonicalPropertyId: string
  readonly legacyLedgerPropertyId: string
  readonly hostawayListingId: string
}

export type Vm1ReservationDisposition =
  | 'already_certified'
  | 'operational_candidate'
  | 'excluded'
  | 'needs_review'

/**
 * Read-only operational evidence for a Hostaway reservation.
 * Monetary number fields (totalPrice, cleaningFee, hostServiceFee,
 * expectedPayout, taxAmount) are passthrough RPC values or null.
 * They must not be used for partnership settlement calculations,
 * allocations, rounding, or zero-fill.
 */
export interface Vm1ReservationRow {
  readonly externalId: string
  readonly listingId: string
  readonly channel: string | null
  readonly status: string
  readonly checkIn: string | null
  readonly checkOut: string | null
  readonly nights: number | null
  readonly totalPrice: number | null
  readonly cleaningFee: number | null
  readonly hostServiceFee: number | null
  readonly expectedPayout: number | null
  readonly taxAmount: number | null
  readonly paymentStatus: string | null
  readonly cancellationDate: string | null
  readonly disposition: Vm1ReservationDisposition
  readonly reason: string
}

export type Vm1IdentityResult =
  | {
      readonly ok: true
      readonly identity: VerifiedVm1Identity
      readonly reservations: readonly Vm1ReservationRow[]
    }
  | {
      readonly ok: false
      readonly reason: string
    }

export interface Vm1IdentityAdapterInput {
  readonly client: Vm1RpcClient
  /** Certified Avi stay IDs. Caller-owned; this adapter never loads AVI_HOSTAWAY_STAYS. */
  readonly certifiedReservationIds: ReadonlySet<string>
  readonly reservationFrom?: string
  readonly reservationTo?: string
}

interface ResolverRow {
  readonly status?: string | null
  readonly canonical_property_id?: string | null
  readonly canonical_name?: string | null
  readonly candidates?: readonly string[] | null
}

interface ReservationRpcRow {
  readonly external_id?: unknown
  readonly external_property_id?: unknown
  readonly channel?: unknown
  readonly status?: unknown
  readonly check_in?: unknown
  readonly check_out?: unknown
  readonly nights?: unknown
  readonly total_price?: unknown
  readonly cleaning_fee?: unknown
  readonly raw?: unknown
}

const RESOLVER_RPC = 'resolve_property_canonical'
const RESERVATIONS_RPC = 'pms_reservations_for_property'
const FORBIDDEN_MAPPING_RPC = 'pms_resolve_mapping'

const EXACT_ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

function normalizeUuid(value: string): string {
  return value.trim().toLowerCase()
}

/**
 * Fail-closed calendar date: exact YYYY-MM-DD and a real UTC calendar day.
 * Rejects unpadded values (2026-9-3), impossible days (2026-13-40), and junk.
 */
export function isExactIsoCalendarDate(value: string | null | undefined): boolean {
  if (value == null) return false
  const match = EXACT_ISO_DATE_RE.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const utc = new Date(Date.UTC(year, month - 1, day))
  return (
    utc.getUTCFullYear() === year &&
    utc.getUTCMonth() === month - 1 &&
    utc.getUTCDate() === day
  )
}

function isExactVm1VerifiedIdentity(identity: VerifiedVm1Identity): boolean {
  return (
    identity.canonicalPropertyId === VM1_CANONICAL_PROPERTY_ID &&
    identity.legacyLedgerPropertyId === VM1_LEGACY_LEDGER_PROPERTY_ID &&
    identity.hostawayListingId === VM1_HOSTAWAY_LISTING_ID
  )
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function asNullableNumber(value: unknown): number | null {
  if (value == null || value === '') return null
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function asNullableString(value: unknown): string | null {
  if (value == null) return null
  const s = String(value).trim()
  return s.length === 0 ? null : s
}

function toReservationStatus(raw: string): ReservationStatus {
  switch (raw) {
    case 'confirmed':
    case 'cancelled':
    case 'inquiry':
    case 'modified':
    case 'owner_stay':
    case 'unknown':
      return raw
    default:
      return 'unknown'
  }
}

/**
 * Confirmed operational candidate only. `isRevenueEligible('modified')` is true
 * in the STR engine, but modified is not an eligible *confirmed* state for this
 * workspace — those rows stay Needs Review (Phase 1 correction for 54972355).
 */
function isConfirmedOperationalStatus(status: ReservationStatus): boolean {
  return status === 'confirmed' && isRevenueEligible(status)
}

export function classifyVm1Reservation(
  input: {
    readonly externalId: string
    readonly listingId: string
    readonly status: string
    readonly checkIn: string | null
  },
  certifiedReservationIds: ReadonlySet<string>,
  newPeriodStart: string = VM1_NEW_PERIOD_START,
): { disposition: Vm1ReservationDisposition; reason: string } {
  if (input.listingId !== VM1_HOSTAWAY_LISTING_ID) {
    return {
      disposition: 'needs_review',
      reason: `Listing ${input.listingId} is not VM1 Hostaway listing ${VM1_HOSTAWAY_LISTING_ID}.`,
    }
  }

  if (certifiedReservationIds.has(input.externalId)) {
    return {
      disposition: 'already_certified',
      reason: 'Already included in the frozen certified Avi stay set; never include again.',
    }
  }

  const status = toReservationStatus(input.status)
  if (status === 'cancelled') {
    return { disposition: 'excluded', reason: 'Cancelled reservations are not revenue.' }
  }
  if (status === 'inquiry') {
    return { disposition: 'excluded', reason: 'Inquiry reservations are not revenue.' }
  }

  if (input.checkIn == null || isBlankInput(input.checkIn) || !isExactIsoCalendarDate(input.checkIn)) {
    return { disposition: 'needs_review', reason: 'Check-in is not an exact YYYY-MM-DD calendar date.' }
  }
  if (input.checkIn < newPeriodStart) {
    return {
      disposition: 'excluded',
      reason: `Check-in ${input.checkIn} is before new-period start ${newPeriodStart}.`,
    }
  }

  if (isConfirmedOperationalStatus(status)) {
    return {
      disposition: 'operational_candidate',
      reason: 'Confirmed stay with check-in on or after the new-period start.',
    }
  }

  if (status === 'modified') {
    return {
      disposition: 'needs_review',
      reason:
        'Status is modified. isRevenueEligible allows modified for STR aggregation, but it is not a confirmed state for this workspace.',
    }
  }

  return { disposition: 'needs_review', reason: `Status '${input.status}' is not a confirmed operational candidate.` }
}

/**
 * Future exact transactions.property_id filter. Requires a runtime-verified VM1
 * identity object — a caller-forged identity cannot authorize a ledger UUID.
 */
export function acceptVm1LedgerTransactionPropertyId(
  propertyId: string | null | undefined,
  verifiedIdentity: VerifiedVm1Identity,
): { readonly ok: true } | { readonly ok: false; readonly reason: string } {
  if (!isExactVm1VerifiedIdentity(verifiedIdentity)) {
    return { ok: false, reason: 'verifiedIdentity is not the exact VM1 partnership identity.' }
  }
  if (propertyId == null || isBlankInput(propertyId)) {
    return {
      ok: false,
      reason: 'Null/empty transactions.property_id is frozen Avi name-keyed history, not the new workspace filter.',
    }
  }
  if (!isUuidLike(propertyId)) {
    return { ok: false, reason: 'transactions.property_id is not a UUID.' }
  }
  if (propertyId !== VM1_LEGACY_LEDGER_PROPERTY_ID) {
    return {
      ok: false,
      reason: 'transactions.property_id is not the verified VM1 legacy ledger UUID.',
    }
  }
  return { ok: true }
}

function failClosedResolver(rows: unknown): { ok: true; canonicalId: string } | { ok: false; reason: string } {
  if (!Array.isArray(rows)) {
    return { ok: false, reason: 'Resolver did not return a row array.' }
  }
  if (rows.length === 0) {
    return { ok: false, reason: 'Resolver returned no rows (missing).' }
  }
  if (rows.length !== 1) {
    return { ok: false, reason: `Resolver returned ${rows.length} rows; exactly one resolved row is required.` }
  }
  const row = rows[0] as ResolverRow
  const status = (row.status ?? '').toLowerCase()
  if (status === 'ambiguous' || status === 'conflict') {
    return { ok: false, reason: `Resolver status '${status}' is not a unique resolution.` }
  }
  if (status !== 'resolved') {
    return { ok: false, reason: `Resolver status '${status || 'missing'}' is not resolved.` }
  }
  if (row.candidates != null && row.candidates.length > 0) {
    return { ok: false, reason: 'Resolver returned candidates on a resolved row (ambiguous).' }
  }
  const canonicalId = row.canonical_property_id
  if (canonicalId == null || isBlankInput(canonicalId)) {
    return { ok: false, reason: 'Resolved row has no canonical_property_id.' }
  }
  if (normalizeUuid(canonicalId) !== normalizeUuid(VM1_CANONICAL_PROPERTY_ID)) {
    return {
      ok: false,
      reason: `Canonical mismatch: expected ${VM1_CANONICAL_PROPERTY_ID}, got ${canonicalId}.`,
    }
  }
  return { ok: true, canonicalId: VM1_CANONICAL_PROPERTY_ID }
}

function mapReservationRow(
  rawRow: ReservationRpcRow,
  certifiedReservationIds: ReadonlySet<string>,
): { ok: true; row: Vm1ReservationRow } | { ok: false; reason: string } {
  const externalId = asNullableString(rawRow.external_id)
  const listingId = asNullableString(rawRow.external_property_id)
  if (externalId == null) {
    return { ok: false, reason: 'Reservation row is missing external_id.' }
  }
  if (listingId == null || listingId !== VM1_HOSTAWAY_LISTING_ID) {
    return {
      ok: false,
      reason: `Reservation ${externalId} is not listing ${VM1_HOSTAWAY_LISTING_ID} (got ${listingId ?? 'null'}).`,
    }
  }

  const raw = asRecord(rawRow.raw)
  const status = asNullableString(rawRow.status) ?? 'unknown'
  const checkIn = asNullableString(rawRow.check_in)
  const classified = classifyVm1Reservation(
    { externalId, listingId, status, checkIn },
    certifiedReservationIds,
  )

  return {
    ok: true,
    row: {
      externalId,
      listingId,
      channel: asNullableString(rawRow.channel),
      status,
      checkIn,
      checkOut: asNullableString(rawRow.check_out),
      nights: asNullableNumber(rawRow.nights),
      totalPrice: asNullableNumber(rawRow.total_price),
      cleaningFee: asNullableNumber(rawRow.cleaning_fee),
      hostServiceFee: asNullableNumber(raw?.airbnbListingHostFee),
      expectedPayout: asNullableNumber(raw?.airbnbExpectedPayoutAmount),
      taxAmount: asNullableNumber(raw?.taxAmount),
      paymentStatus: asNullableString(raw?.paymentStatus),
      cancellationDate: asNullableString(raw?.cancellationDate),
      disposition: classified.disposition,
      reason: classified.reason,
    },
  }
}

/**
 * Verified legacy UUID for a future exact `transactions.property_id` equality
 * filter. Only returned after a successful bridge probe.
 */
export function vm1LedgerPropertyIdFilter(identity: VerifiedVm1Identity): typeof VM1_LEGACY_LEDGER_PROPERTY_ID {
  if (!isExactVm1VerifiedIdentity(identity)) {
    throw new Error('vm1LedgerPropertyIdFilter requires the exact verified VM1 identity.')
  }
  return VM1_LEGACY_LEDGER_PROPERTY_ID
}

function reservationRangeOrFail(
  reservationFrom: string | undefined,
  reservationTo: string | undefined,
): { ok: true; from: string; to: string } | { ok: false; reason: string } {
  const from = reservationFrom ?? '2026-08-25'
  const to = reservationTo ?? '2026-09-30'
  if (!isExactIsoCalendarDate(from) || !isExactIsoCalendarDate(to)) {
    return { ok: false, reason: 'reservationFrom and reservationTo must be exact YYYY-MM-DD calendar dates.' }
  }
  if (from > to) {
    return { ok: false, reason: 'reservationFrom must be on or before reservationTo.' }
  }
  return { ok: true, from, to }
}

export async function loadVm1Identity(input: Vm1IdentityAdapterInput): Promise<Vm1IdentityResult> {
  const { client, certifiedReservationIds } = input
  if (typeof client.rpc !== 'function') {
    return { ok: false, reason: 'RPC client is not available.' }
  }

  const resolver = await client.rpc(RESOLVER_RPC, {
    p_input: VM1_LEGACY_LEDGER_PROPERTY_ID,
  })
  if (resolver.error) {
    return { ok: false, reason: `resolve_property_canonical failed: ${resolver.error.message}` }
  }
  const resolved = failClosedResolver(resolver.data)
  if (!resolved.ok) return resolved

  const range = reservationRangeOrFail(input.reservationFrom, input.reservationTo)
  if (!range.ok) return range

  const reservationsRes = await client.rpc(RESERVATIONS_RPC, {
    p_external_id: VM1_HOSTAWAY_LISTING_ID,
    p_from: range.from,
    p_to: range.to,
  })
  if (reservationsRes.error) {
    return { ok: false, reason: `pms_reservations_for_property failed: ${reservationsRes.error.message}` }
  }
  if (!Array.isArray(reservationsRes.data)) {
    return { ok: false, reason: 'Reservations RPC did not return a row array.' }
  }

  const reservations: Vm1ReservationRow[] = []
  const seenExternalIds = new Set<string>()
  for (const item of reservationsRes.data) {
    const mapped = mapReservationRow((item ?? {}) as ReservationRpcRow, certifiedReservationIds)
    if (!mapped.ok) return mapped
    if (seenExternalIds.has(mapped.row.externalId)) {
      return { ok: false, reason: `Duplicate reservation external_id: ${mapped.row.externalId}` }
    }
    seenExternalIds.add(mapped.row.externalId)
    reservations.push(mapped.row)
  }

  return {
    ok: true,
    identity: {
      canonicalPropertyId: VM1_CANONICAL_PROPERTY_ID,
      legacyLedgerPropertyId: VM1_LEGACY_LEDGER_PROPERTY_ID,
      hostawayListingId: VM1_HOSTAWAY_LISTING_ID,
    },
    reservations,
  }
}

/** Test/guard helper: mapping RPC name that this adapter must never invoke. */
export const VM1_FORBIDDEN_MAPPING_RPC = FORBIDDEN_MAPPING_RPC
