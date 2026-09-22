/**
 * Staff-only Owner Statement parse/preview. Does not ingest.
 * Does not keep Excel bytes, filename, or raw JSON.
 * server-only.
 */

import 'server-only'

import { VM1_HOSTAWAY_LISTING_ID } from './vm1Identity'
import { isVm1InitialPeriodCheckIn } from './vm1PeriodContract'
import {
  normalizedOwnerStatementPayloadHash,
  sha256Hex,
} from './vm1OwnerStatementCanonicalHash'
import { parseExactCentsUnknown, sumExactCents } from './vm1OwnerStatementExactCents'
import { readFirstSheetRows } from './vm1OwnerStatementXlsxParser'
import {
  normalizeOsHeader,
  VM1_OS_CURRENCY,
  VM1_OS_EXCLUDED_RESERVATION_ID,
  VM1_OS_LINE_AMOUNT_FIELDS,
  VM1_OS_MAX_UPLOAD_BYTES,
  VM1_OS_OPTIONAL_IDENTITY_COLUMNS,
  VM1_OS_PARSER_VERSION,
  VM1_OS_REQUIRED_COLUMNS,
  VM1_OS_RESERVATION_STATUSES,
  VM1_OS_SOURCE_ASSERTION,
  VM1_OS_UPLOAD_IDENTITY,
  VM1_OS_UPLOAD_PII_HEADERS,
  VM1_OS_UPLOAD_REASON,
  VM1_OS_UPLOAD_SOURCE_KIND,
  type Vm1OwnerStatementUploadLine,
  type Vm1OwnerStatementUploadPreview,
} from './vm1OwnerStatementUploadContract'

export type Vm1OwnerStatementParseResult =
  | {
      readonly ok: true
      readonly preview: Vm1OwnerStatementUploadPreview
      readonly documentHash: string
      readonly normalizedPayloadHash: string
      readonly payload: Record<string, unknown>
    }
  | { readonly ok: false; readonly reason: string }

function cellString(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return typeof value === 'string' ? value.trim() : ''
}

function excelSerialToIso(value: number): string | null {
  if (!Number.isFinite(value)) return null
  const whole = Math.round(value)
  if (Math.abs(value - whole) > 1e-6) return null
  const ms = Date.UTC(1899, 11, 30) + whole * 86400000
  return new Date(ms).toISOString().slice(0, 10)
}

function parseIsoDate(value: unknown, label: string): string {
  if (typeof value === 'number') {
    const iso = excelSerialToIso(value)
    if (iso == null) throw new Error(label)
    return iso
  }
  const text = cellString(value)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error(label)
  return text
}

function reconciliationStatus(
  status: Vm1OwnerStatementUploadLine['reservation_status'],
): Vm1OwnerStatementUploadLine['reconciliation_status'] {
  if (status === 'cancelled') return 'cancelled'
  if (status === 'inquiry') return 'inquiry'
  if (status === 'modified') return 'modified'
  return 'not_required'
}

export function parseVm1OwnerStatementXlsx(bytes: Buffer): Vm1OwnerStatementParseResult {
  if (bytes.length === 0 || bytes.length > VM1_OS_MAX_UPLOAD_BYTES) {
    return { ok: false, reason: bytes.length === 0 ? VM1_OS_UPLOAD_REASON.missingFile : VM1_OS_UPLOAD_REASON.tooLarge }
  }
  let sheetName = 'S1'
  let rows
  try {
    const sheet = readFirstSheetRows(bytes)
    sheetName = sheet.sheetName
    rows = sheet.rows
  } catch {
    return { ok: false, reason: VM1_OS_UPLOAD_REASON.malformedXlsx }
  }
  if (rows.length < 2) return { ok: false, reason: VM1_OS_UPLOAD_REASON.missingColumn }

  const headers = rows[0].map((cell) => normalizeOsHeader(cellString(cell)))
  for (const header of headers) {
    if (header === '') continue
    if ((VM1_OS_UPLOAD_PII_HEADERS as readonly string[]).includes(header)) {
      return { ok: false, reason: VM1_OS_UPLOAD_REASON.piiRejected }
    }
    const allowed = new Set<string>([...VM1_OS_REQUIRED_COLUMNS, ...VM1_OS_OPTIONAL_IDENTITY_COLUMNS])
    if (!allowed.has(header)) {
      return { ok: false, reason: VM1_OS_UPLOAD_REASON.unknownColumn }
    }
  }
  const index = new Map<string, number>()
  for (let i = 0; i < headers.length; i += 1) {
    const header = headers[i]
    if (header === '') continue
    if (index.has(header)) return { ok: false, reason: VM1_OS_UPLOAD_REASON.unknownColumn }
    index.set(header, i)
  }
  for (const required of VM1_OS_REQUIRED_COLUMNS) {
    if (!index.has(required)) return { ok: false, reason: VM1_OS_UPLOAD_REASON.missingColumn }
  }

  const lines: Vm1OwnerStatementUploadLine[] = []
  const reservationIds = new Set<string>()
  const datePairs = new Set<string>()

  for (let r = 1; r < rows.length; r += 1) {
    const row = rows[r]
    const get = (key: string) => row[index.get(key) ?? -1]
    const listingCell = index.has('listing_id') ? cellString(get('listing_id')) : ''
    if (listingCell !== '' && listingCell !== VM1_HOSTAWAY_LISTING_ID) {
      return { ok: false, reason: VM1_OS_UPLOAD_REASON.identityRejected }
    }
    const reservationId = cellString(get('reservation_id'))
    if (reservationId === VM1_OS_EXCLUDED_RESERVATION_ID) {
      return { ok: false, reason: VM1_OS_UPLOAD_REASON.excludedReservation }
    }
    if (!/^[0-9A-Za-z_-]{1,64}$/.test(reservationId)) {
      return { ok: false, reason: VM1_OS_UPLOAD_REASON.reservationIdRejected }
    }
    if (reservationIds.has(reservationId)) {
      return { ok: false, reason: VM1_OS_UPLOAD_REASON.duplicateReservation }
    }
    reservationIds.add(reservationId)

    let checkIn: string
    let checkOut: string
    try {
      checkIn = parseIsoDate(get('check_in'), 'check_in')
      checkOut = parseIsoDate(get('check_out'), 'check_out')
    } catch {
      return { ok: false, reason: VM1_OS_UPLOAD_REASON.periodRejected }
    }
    if (checkOut < checkIn || !isVm1InitialPeriodCheckIn(checkIn)) {
      return { ok: false, reason: VM1_OS_UPLOAD_REASON.periodRejected }
    }
    const pair = `${checkIn}|${checkOut}`
    if (datePairs.has(pair)) return { ok: false, reason: VM1_OS_UPLOAD_REASON.duplicateDatePair }
    datePairs.add(pair)

    const reservationStatus = cellString(get('reservation_status')).toLowerCase()
    if (!(VM1_OS_RESERVATION_STATUSES as readonly string[]).includes(reservationStatus)) {
      return { ok: false, reason: VM1_OS_UPLOAD_REASON.reservationStatusRejected }
    }
    const currency = cellString(get('currency')).toUpperCase()
    if (currency !== VM1_OS_CURRENCY) {
      return { ok: false, reason: VM1_OS_UPLOAD_REASON.currencyRejected }
    }

    const amounts: Record<(typeof VM1_OS_LINE_AMOUNT_FIELDS)[number], string> = {
      gross_rental_revenue: '',
      platform_fee: '',
      guest_cleaning: '',
      total_taxes: '',
      management_charge: '',
      net_owner_payout: '',
    }
    try {
      for (const field of VM1_OS_LINE_AMOUNT_FIELDS) {
        amounts[field] = parseExactCentsUnknown(get(field), field)
      }
    } catch {
      return { ok: false, reason: VM1_OS_UPLOAD_REASON.centRejected }
    }
    const expectedNet =
      Math.round(Number(amounts.gross_rental_revenue) * 100) -
      Math.round(Number(amounts.platform_fee) * 100) -
      Math.round(Number(amounts.guest_cleaning) * 100) -
      Math.round(Number(amounts.total_taxes) * 100) -
      Math.round(Number(amounts.management_charge) * 100)
    if (expectedNet !== Math.round(Number(amounts.net_owner_payout) * 100)) {
      return { ok: false, reason: VM1_OS_UPLOAD_REASON.equationRejected }
    }

    const sourceRow = `${sheetName}:R${r + 1}`
    if (!/^[A-Za-z0-9_.:-]{1,64}$/.test(sourceRow)) {
      return { ok: false, reason: VM1_OS_UPLOAD_REASON.malformedXlsx }
    }

    lines.push({
      reservation_id: reservationId,
      check_in: checkIn,
      check_out: checkOut,
      reservation_status: reservationStatus as Vm1OwnerStatementUploadLine['reservation_status'],
      gross_rental_revenue: amounts.gross_rental_revenue,
      platform_fee: amounts.platform_fee,
      guest_cleaning: amounts.guest_cleaning,
      total_taxes: amounts.total_taxes,
      management_charge: amounts.management_charge,
      net_owner_payout: amounts.net_owner_payout,
      currency: VM1_OS_CURRENCY,
      source_row_reference: sourceRow,
      reconciliation_status: reconciliationStatus(
        reservationStatus as Vm1OwnerStatementUploadLine['reservation_status'],
      ),
    })
  }

  if (lines.length === 0) return { ok: false, reason: VM1_OS_UPLOAD_REASON.missingColumn }

  const payload = {
    canonical_property_id: VM1_OS_UPLOAD_IDENTITY.canonicalPropertyId,
    listing_id: VM1_OS_UPLOAD_IDENTITY.listingId,
    source_kind: VM1_OS_UPLOAD_SOURCE_KIND,
    document_hash: sha256Hex(bytes),
    parser_version: VM1_OS_PARSER_VERSION,
    normalized_payload_hash: normalizedOwnerStatementPayloadHash(lines),
    statement_from: VM1_OS_UPLOAD_IDENTITY.statementFrom,
    statement_to: VM1_OS_UPLOAD_IDENTITY.statementTo,
    source_assertion: VM1_OS_SOURCE_ASSERTION,
    lines,
  }

  return {
    ok: true,
    documentHash: payload.document_hash,
    normalizedPayloadHash: payload.normalized_payload_hash,
    payload,
    preview: {
      listingId: VM1_OS_UPLOAD_IDENTITY.listingId,
      statementFrom: VM1_OS_UPLOAD_IDENTITY.statementFrom,
      statementTo: VM1_OS_UPLOAD_IDENTITY.statementTo,
      lineCount: lines.length,
      netOwnerPayoutTotalEur: sumExactCents(lines.map((line) => line.net_owner_payout)),
      lines,
    },
  }
}
