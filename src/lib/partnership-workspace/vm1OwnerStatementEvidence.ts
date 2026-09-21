/**
 * VM1 Hostaway Owner Statement evidence adapter — pure, fail-closed validator.
 *
 * Production may import this module as a parser/guard. It does not contain
 * stay-level financial fixtures and is not a canonical payout store.
 * Callers must supply a verified document. Operations does not attach one
 * until a canonical store exists.
 *
 * Binding identity is unique check-in + check-out on listing 412148.
 * Row key is (sourceKind, documentHash, reservationId).
 * server-only.
 */

import 'server-only'

import {
  VM1_CANONICAL_PROPERTY_ID,
  VM1_HOSTAWAY_LISTING_ID,
  VM1_LEGACY_LEDGER_PROPERTY_ID,
} from './vm1Identity'
import type { Vm1AuthoritativeOwnerStatementEvidence } from './vm1DraftAdmission'

export const VM1_OS_SOURCE_KIND = 'hostaway_owner_statement' as const

export type Vm1OsSourceKind = typeof VM1_OS_SOURCE_KIND
export type Vm1OsVerificationStatus = 'verified'

export interface Vm1OsVerifiedIdentity {
  readonly canonicalPropertyId: string
  readonly legacyLedgerPropertyId: string
  readonly hostawayListingId: string
}

export interface Vm1OwnerStatementDocumentLine {
  readonly checkIn: string
  readonly checkOut: string
  readonly listingId: string
  readonly grossEur: number
  readonly platformFeeEur: number
  readonly cleaningEur: number
  readonly taxEur: number
  readonly managementFeeEur: number
  readonly netOwnerPayoutEur: number
}

export interface Vm1OwnerStatementDocument {
  readonly sourceKind: Vm1OsSourceKind
  readonly documentHash: string
  readonly listingId: string
  readonly verificationStatus: Vm1OsVerificationStatus
  readonly lines: readonly Vm1OwnerStatementDocumentLine[]
}

export interface Vm1OwnerStatementInventoryReservation {
  readonly externalId: string
  readonly listingId: string
  readonly checkIn: string | null
  readonly checkOut: string | null
}

export interface Vm1OwnerStatementInventory {
  readonly listingId: string
  readonly reservations: readonly Vm1OwnerStatementInventoryReservation[]
}

export interface Vm1OwnerStatementEvidenceLine {
  readonly reservationId: string
  readonly checkIn: string
  readonly checkOut: string
  readonly grossEur: number
  readonly platformFeeEur: number
  readonly cleaningEur: number
  readonly taxEur: number
  readonly managementFeeEur: number
  readonly netOwnerPayoutEur: number
  readonly documentHash: string
  readonly verificationStatus: Vm1OsVerificationStatus
  readonly sourceKind: Vm1OsSourceKind
}

export const VM1_OS_EVIDENCE_REASON = {
  identity: 'Owner Statement requires the verified VM1 identity triple.',
  sourceKind: 'Owner Statement sourceKind must be hostaway_owner_statement.',
  documentHash: 'Owner Statement documentHash must be a 64-character SHA-256 hex digest.',
  listing: 'Owner Statement listing must be VM1 Hostaway listing 412148.',
  unverified: 'Owner Statement evidence is not verified.',
  dates: 'Owner Statement check-in and check-out must be exact YYYY-MM-DD values.',
  amounts: 'Owner Statement amounts must be non-negative finite EUR values.',
  missingLines: 'Owner Statement document has no bindable lines.',
  zeroMatch:
    'No unique 412148 inventory row matches this Owner Statement check-in and check-out.',
  manyMatch:
    'Multiple 412148 inventory rows share this Owner Statement check-in and check-out.',
  duplicateInventoryId: 'Duplicate reservation external_id in listing 412148 inventory.',
  duplicateRowKey:
    'duplicate Owner Statement row key (sourceKind, documentHash, reservationId)',
  amountConflict:
    'Owner Statement row key conflict: amounts differ at EUR cent precision.',
  identityKeys:
    'Person names, amounts, and spreadsheet row index are not identity keys. Use unique check-in and check-out on listing 412148.',
  inventoryListing: 'Inventory listing must be VM1 Hostaway listing 412148.',
  missingStore:
    'Canonical stored Hostaway Owner Statement evidence is not attached. Draft revenue is not admitted.',
  missingEvidence: 'No effective Owner Statement evidence was found for this period.',
  readerUnavailable: 'Owner Statement evidence could not be read. This is not zero income.',
  malformed: 'Owner Statement evidence payload was rejected. This is not zero income.',
  conflict: 'Owner Statement evidence is in conflict. This is not zero income.',
} as const

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const SHA256_HEX_RE = /^[0-9a-f]{64}$/

function roundEur(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function isExactIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || value === '') return false
  const match = ISO_DATE_RE.exec(value)
  if (match == null) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const dt = new Date(Date.UTC(year, month - 1, day))
  return dt.getUTCFullYear() === year && dt.getUTCMonth() === month - 1 && dt.getUTCDate() === day
}

function normalizeHash(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const hash = value.trim().toLowerCase()
  if (!SHA256_HEX_RE.test(hash)) return null
  return hash
}

function sameEur(a: number, b: number): boolean {
  return roundEur(a) === roundEur(b)
}

function datePairKey(checkIn: string, checkOut: string): string {
  return `${checkIn}\0${checkOut}`
}

function rowKey(documentHash: string, reservationId: string): string {
  return `${VM1_OS_SOURCE_KIND}\0${documentHash}\0${reservationId}`
}

function amountsOf(line: {
  readonly grossEur: number
  readonly platformFeeEur: number
  readonly cleaningEur: number
  readonly taxEur: number
  readonly managementFeeEur: number
  readonly netOwnerPayoutEur: number
}) {
  return {
    grossEur: roundEur(line.grossEur),
    platformFeeEur: roundEur(line.platformFeeEur),
    cleaningEur: roundEur(line.cleaningEur),
    taxEur: roundEur(line.taxEur),
    managementFeeEur: roundEur(line.managementFeeEur),
    netOwnerPayoutEur: roundEur(line.netOwnerPayoutEur),
  }
}

function lineAmountsMatch(
  a: {
    readonly grossEur: number
    readonly platformFeeEur: number
    readonly cleaningEur: number
    readonly taxEur: number
    readonly managementFeeEur: number
    readonly netOwnerPayoutEur: number
  },
  b: {
    readonly grossEur: number
    readonly platformFeeEur: number
    readonly cleaningEur: number
    readonly taxEur: number
    readonly managementFeeEur: number
    readonly netOwnerPayoutEur: number
  },
): boolean {
  const left = amountsOf(a)
  const right = amountsOf(b)
  return (
    sameEur(left.grossEur, right.grossEur) &&
    sameEur(left.platformFeeEur, right.platformFeeEur) &&
    sameEur(left.cleaningEur, right.cleaningEur) &&
    sameEur(left.taxEur, right.taxEur) &&
    sameEur(left.managementFeeEur, right.managementFeeEur) &&
    sameEur(left.netOwnerPayoutEur, right.netOwnerPayoutEur)
  )
}

function identityMatches(identity: Vm1OsVerifiedIdentity): boolean {
  return (
    identity.canonicalPropertyId === VM1_CANONICAL_PROPERTY_ID &&
    identity.legacyLedgerPropertyId === VM1_LEGACY_LEDGER_PROPERTY_ID &&
    identity.hostawayListingId === VM1_HOSTAWAY_LISTING_ID
  )
}

function parseDocumentLine(
  value: unknown,
):
  | { readonly ok: true; readonly line: Vm1OwnerStatementDocumentLine }
  | { readonly ok: false; readonly reason: string } {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, reason: VM1_OS_EVIDENCE_REASON.amounts }
  }
  const rec = value as Record<string, unknown>
  if (rec.listingId !== VM1_HOSTAWAY_LISTING_ID) {
    return { ok: false, reason: VM1_OS_EVIDENCE_REASON.listing }
  }
  if (!isExactIsoDate(rec.checkIn) || !isExactIsoDate(rec.checkOut)) {
    return { ok: false, reason: VM1_OS_EVIDENCE_REASON.dates }
  }
  if (rec.checkOut < rec.checkIn) {
    return { ok: false, reason: VM1_OS_EVIDENCE_REASON.dates }
  }
  if (
    !isNonNegativeFiniteNumber(rec.grossEur) ||
    !isNonNegativeFiniteNumber(rec.platformFeeEur) ||
    !isNonNegativeFiniteNumber(rec.cleaningEur) ||
    !isNonNegativeFiniteNumber(rec.taxEur) ||
    !isNonNegativeFiniteNumber(rec.managementFeeEur) ||
    !isNonNegativeFiniteNumber(rec.netOwnerPayoutEur)
  ) {
    return { ok: false, reason: VM1_OS_EVIDENCE_REASON.amounts }
  }
  return {
    ok: true,
    line: {
      listingId: VM1_HOSTAWAY_LISTING_ID,
      checkIn: rec.checkIn,
      checkOut: rec.checkOut,
      ...amountsOf({
        grossEur: rec.grossEur,
        platformFeeEur: rec.platformFeeEur,
        cleaningEur: rec.cleaningEur,
        taxEur: rec.taxEur,
        managementFeeEur: rec.managementFeeEur,
        netOwnerPayoutEur: rec.netOwnerPayoutEur,
      }),
    },
  }
}

export type Vm1OwnerStatementAdaptResult =
  | {
      readonly ok: true
      readonly documentHash: string
      readonly verificationStatus: Vm1OsVerificationStatus
      readonly lines: readonly Vm1OwnerStatementEvidenceLine[]
      readonly evidenceByReservationId: ReadonlyMap<string, Vm1AuthoritativeOwnerStatementEvidence>
    }
  | {
      readonly ok: false
      readonly reason: string
    }

export interface Vm1OwnerStatementAdaptInput {
  readonly identity: Vm1OsVerifiedIdentity
  readonly document: Vm1OwnerStatementDocument
  readonly inventory: Vm1OwnerStatementInventory
}

function toAdmissionEvidence(
  line: Vm1OwnerStatementEvidenceLine,
): Vm1AuthoritativeOwnerStatementEvidence {
  return {
    sourceKind: VM1_OS_SOURCE_KIND,
    sourceId: line.documentHash,
    documentHash: line.documentHash,
    reservationId: line.reservationId,
    payoutEur: line.netOwnerPayoutEur,
    cleaningEur: line.cleaningEur,
    status: 'verified',
    reconciliationStatus: 'not_required',
  }
}

/**
 * Bind a caller-supplied Owner Statement to listing 412148 inventory.
 * Does not load a stored document. Does not use reservation-feed payout.
 */
export function adaptVm1OwnerStatementEvidence(
  input: Vm1OwnerStatementAdaptInput,
): Vm1OwnerStatementAdaptResult {
  if (!identityMatches(input.identity)) {
    return { ok: false, reason: VM1_OS_EVIDENCE_REASON.identity }
  }
  const document = input.document
  if (document.sourceKind !== VM1_OS_SOURCE_KIND) {
    return { ok: false, reason: VM1_OS_EVIDENCE_REASON.sourceKind }
  }
  const documentHash = normalizeHash(document.documentHash)
  if (documentHash == null) {
    return { ok: false, reason: VM1_OS_EVIDENCE_REASON.documentHash }
  }
  if (document.listingId !== VM1_HOSTAWAY_LISTING_ID) {
    return { ok: false, reason: VM1_OS_EVIDENCE_REASON.listing }
  }
  if (input.inventory.listingId !== VM1_HOSTAWAY_LISTING_ID) {
    return { ok: false, reason: VM1_OS_EVIDENCE_REASON.inventoryListing }
  }
  if (document.verificationStatus !== 'verified') {
    return { ok: false, reason: VM1_OS_EVIDENCE_REASON.unverified }
  }
  if (document.lines.length === 0) {
    return { ok: false, reason: VM1_OS_EVIDENCE_REASON.missingLines }
  }

  const listingInventory = input.inventory.reservations.filter(
    (row) => row.listingId === VM1_HOSTAWAY_LISTING_ID,
  )
  const inventoryIds = listingInventory
    .map((row) => (typeof row.externalId === 'string' ? row.externalId.trim() : ''))
    .filter((id) => id !== '')
  if (new Set(inventoryIds).size !== inventoryIds.length) {
    return { ok: false, reason: VM1_OS_EVIDENCE_REASON.duplicateInventoryId }
  }

  const parsedLines: Vm1OwnerStatementDocumentLine[] = []
  const seenDatePairs = new Map<string, Vm1OwnerStatementDocumentLine>()
  for (const rawLine of document.lines) {
    const parsed = parseDocumentLine(rawLine)
    if (!parsed.ok) return parsed
    const key = datePairKey(parsed.line.checkIn, parsed.line.checkOut)
    const previous = seenDatePairs.get(key)
    if (previous != null) {
      if (lineAmountsMatch(previous, parsed.line)) {
        continue
      }
      return { ok: false, reason: VM1_OS_EVIDENCE_REASON.amountConflict }
    }
    seenDatePairs.set(key, parsed.line)
    parsedLines.push(parsed.line)
  }

  const bound = new Map<string, Vm1OwnerStatementEvidenceLine>()
  for (const line of parsedLines) {
    const matches = listingInventory.filter(
      (row) =>
        row.checkIn === line.checkIn &&
        row.checkOut === line.checkOut &&
        typeof row.externalId === 'string' &&
        row.externalId.trim() !== '',
    )
    if (matches.length === 0) {
      return { ok: false, reason: VM1_OS_EVIDENCE_REASON.zeroMatch }
    }
    if (matches.length > 1) {
      return { ok: false, reason: VM1_OS_EVIDENCE_REASON.manyMatch }
    }
    const reservationId = matches[0].externalId.trim()
    const evidenceLine: Vm1OwnerStatementEvidenceLine = {
      reservationId,
      checkIn: line.checkIn,
      checkOut: line.checkOut,
      ...amountsOf(line),
      documentHash,
      verificationStatus: 'verified',
      sourceKind: VM1_OS_SOURCE_KIND,
    }
    const key = rowKey(documentHash, reservationId)
    const existing = bound.get(key)
    if (existing != null) {
      const same =
        existing.checkIn === evidenceLine.checkIn &&
        existing.checkOut === evidenceLine.checkOut &&
        lineAmountsMatch(existing, evidenceLine)
      if (!same) {
        return { ok: false, reason: VM1_OS_EVIDENCE_REASON.amountConflict }
      }
      continue
    }
    bound.set(key, evidenceLine)
  }

  const lines = Array.from(bound.values()).sort((a, b) => {
    if (a.checkIn !== b.checkIn) return a.checkIn < b.checkIn ? -1 : 1
    return a.reservationId.localeCompare(b.reservationId)
  })

  const evidenceByReservationId = new Map<string, Vm1AuthoritativeOwnerStatementEvidence>()
  for (const line of lines) {
    evidenceByReservationId.set(line.reservationId, toAdmissionEvidence(line))
  }

  return {
    ok: true,
    documentHash,
    verificationStatus: 'verified',
    lines,
    evidenceByReservationId,
  }
}

export function ownerStatementInventoryFromReservations(
  reservations: readonly Vm1OwnerStatementInventoryReservation[],
): Vm1OwnerStatementInventory {
  return {
    listingId: VM1_HOSTAWAY_LISTING_ID,
    reservations,
  }
}
