/**
 * Staff-only Production Owner Statement store reader.
 *
 * Calls public.read_partnership_owner_statement_for_listing through an
 * authenticated user JWT client. Evidence only — not ingest, void,
 * admission, or split.
 *
 * server-only.
 */

import 'server-only'

import { VM1_CANONICAL_PROPERTY_ID, VM1_HOSTAWAY_LISTING_ID } from './vm1Identity'
import { VM1_INITIAL_PERIOD_FROM, VM1_INITIAL_PERIOD_TO } from './vm1PeriodContract'
import { VM1_OS_EVIDENCE_REASON } from './vm1OwnerStatementEvidence'

export const VM1_OS_READER_RPC = 'read_partnership_owner_statement_for_listing' as const

export type Vm1OwnerStatementJwtClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>
}

export type Vm1OwnerStatementDisplayLine = {
  readonly reservationId: string
  readonly checkIn: string
  readonly checkOut: string
  readonly netOwnerPayoutEur: number
}

export type Vm1OwnerStatementStoreRead =
  | {
      readonly ok: true
      readonly kind: 'effective'
      readonly listingId: typeof VM1_HOSTAWAY_LISTING_ID
      readonly periodFrom: string
      readonly periodTo: string
      readonly lines: readonly Vm1OwnerStatementDisplayLine[]
    }
  | {
      readonly ok: false
      readonly kind: 'missing_evidence'
      readonly reason: typeof VM1_OS_EVIDENCE_REASON.missingEvidence
    }
  | {
      readonly ok: false
      readonly kind: 'conflict'
      readonly reason: typeof VM1_OS_EVIDENCE_REASON.conflict
    }
  | {
      readonly ok: false
      readonly kind: 'unavailable'
      readonly reason: typeof VM1_OS_EVIDENCE_REASON.readerUnavailable | typeof VM1_OS_EVIDENCE_REASON.malformed
    }

const HASH_KEY_RE = /sha256/i
const ISO_DATE_PREFIX_RE = /^(\d{4}-\d{2}-\d{2})/
const RESERVATION_ID_RE = /^\d+$/
const AMOUNT_STRING_RE = /^-?\d+(\.\d{1,2})?$/

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function containsHashKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsHashKey)
  if (!isPlainRecord(value)) return false
  for (const [key, nested] of Object.entries(value)) {
    if (HASH_KEY_RE.test(key)) return true
    if (containsHashKey(nested)) return true
  }
  return false
}

function parseIsoDate(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const match = ISO_DATE_PREFIX_RE.exec(value)
  return match != null ? match[1] : null
}

function parseReservationId(value: unknown): string | null {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return String(value)
  }
  return typeof value === 'string' && RESERVATION_ID_RE.test(value) ? value : null
}

function parseExactCents(value: unknown): number | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null
    return Math.round((value + Number.EPSILON) * 100) / 100
  }
  if (typeof value === 'string' && AMOUNT_STRING_RE.test(value)) {
    const n = Number(value)
    if (!Number.isFinite(n)) return null
    return Math.round((n + Number.EPSILON) * 100) / 100
  }
  return null
}

function parseLine(value: unknown): Vm1OwnerStatementDisplayLine | null {
  if (!isPlainRecord(value) || containsHashKey(value)) return null
  const reservationId = parseReservationId(value.reservation_id)
  const checkIn = parseIsoDate(value.check_in)
  const checkOut = parseIsoDate(value.check_out)
  const netOwnerPayoutEur = parseExactCents(value.net_owner_payout)
  if (reservationId == null || checkIn == null || checkOut == null || netOwnerPayoutEur == null) {
    return null
  }
  if (checkOut < checkIn) return null
  if (value.currency != null && value.currency !== 'EUR') return null
  return {
    reservationId,
    checkIn,
    checkOut,
    netOwnerPayoutEur,
  }
}

function tryParseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown
  } catch {
    return null
  }
}

export async function readVm1PartnershipOwnerStatementForListing(input: {
  readonly client: Vm1OwnerStatementJwtClient
  readonly listingId: string
  readonly canonicalPropertyId: string
}): Promise<Vm1OwnerStatementStoreRead> {
  if (input.canonicalPropertyId !== VM1_CANONICAL_PROPERTY_ID) {
    return { ok: false, kind: 'unavailable', reason: VM1_OS_EVIDENCE_REASON.readerUnavailable }
  }
  if (input.listingId !== VM1_HOSTAWAY_LISTING_ID) {
    return { ok: false, kind: 'unavailable', reason: VM1_OS_EVIDENCE_REASON.readerUnavailable }
  }

  let data: unknown
  let error: { message: string } | null
  try {
    const result = await input.client.rpc(VM1_OS_READER_RPC, {
      p_listing_id: VM1_HOSTAWAY_LISTING_ID,
      p_from: VM1_INITIAL_PERIOD_FROM,
      p_to: VM1_INITIAL_PERIOD_TO,
    })
    data = result.data
    error = result.error
  } catch {
    return { ok: false, kind: 'unavailable', reason: VM1_OS_EVIDENCE_REASON.readerUnavailable }
  }

  if (error != null) {
    return { ok: false, kind: 'unavailable', reason: VM1_OS_EVIDENCE_REASON.readerUnavailable }
  }

  const payload = typeof data === 'string' ? tryParseJson(data) : data
  if (!isPlainRecord(payload) || containsHashKey(payload)) {
    return { ok: false, kind: 'unavailable', reason: VM1_OS_EVIDENCE_REASON.malformed }
  }

  if (payload.ok === false) {
    if (payload.reason === 'missing_evidence') {
      return { ok: false, kind: 'missing_evidence', reason: VM1_OS_EVIDENCE_REASON.missingEvidence }
    }
    if (payload.reason === 'reservation_conflict' || payload.reason === 'date_pair_conflict') {
      return { ok: false, kind: 'conflict', reason: VM1_OS_EVIDENCE_REASON.conflict }
    }
    return { ok: false, kind: 'unavailable', reason: VM1_OS_EVIDENCE_REASON.readerUnavailable }
  }

  if (payload.ok !== true) {
    return { ok: false, kind: 'unavailable', reason: VM1_OS_EVIDENCE_REASON.malformed }
  }

  const listingId = payload.listing_id === VM1_HOSTAWAY_LISTING_ID ? VM1_HOSTAWAY_LISTING_ID : null
  const periodFrom = parseIsoDate(payload.period_from)
  const periodTo = parseIsoDate(payload.period_to)
  if (
    listingId == null ||
    periodFrom !== VM1_INITIAL_PERIOD_FROM ||
    periodTo !== VM1_INITIAL_PERIOD_TO ||
    !Array.isArray(payload.lines) ||
    !Array.isArray(payload.documents)
  ) {
    return { ok: false, kind: 'unavailable', reason: VM1_OS_EVIDENCE_REASON.malformed }
  }

  const lines: Vm1OwnerStatementDisplayLine[] = []
  for (const raw of payload.lines) {
    const line = parseLine(raw)
    if (line == null) {
      return { ok: false, kind: 'unavailable', reason: VM1_OS_EVIDENCE_REASON.malformed }
    }
    lines.push(line)
  }

  if (lines.length === 0) {
    return { ok: false, kind: 'missing_evidence', reason: VM1_OS_EVIDENCE_REASON.missingEvidence }
  }

  return {
    ok: true,
    kind: 'effective',
    listingId,
    periodFrom,
    periodTo,
    lines,
  }
}
