/**
 * VM1 Draft admission gates — period membership and revenue eligibility only.
 *
 * Independent of the forecast calculator. Calculable forecast is not admission.
 * Raw pms_reservations_for_property expectedPayout / airbnbExpectedPayoutAmount
 * is operational evidence only. It is not Hostaway Owner Statement authority,
 * received cash, ledger reconciliation, or Draft revenue admission.
 *
 * Admission requires caller-supplied hostaway_owner_statement evidence.
 * Ledger Platform Income is not read in this slice and never becomes a second income line.
 * Opening settlement carry-forward is not part of this module.
 */

import { VM1_HOSTAWAY_LISTING_ID } from './vm1Identity'
import type { Vm1ReservationRow } from './vm1IdentityAdapter'
import { isVm1InitialPeriodCheckIn } from './vm1PeriodContract'

export type Vm1DraftAdmissionState =
  | 'admitted'
  | 'blocked'
  | 'completed_pending_authoritative_evidence'
  | 'forecast'
  | 'excluded'
  | 'needs_review'

export type Vm1AuthoritativePayoutSourceKind = 'hostaway_owner_statement'

export type Vm1AuthoritativeEvidenceStatus = 'verified'

export type Vm1AuthoritativeReconciliationStatus = 'not_required' | 'matched' | 'conflict'

export interface Vm1AuthoritativeOwnerStatementEvidence {
  readonly sourceKind: Vm1AuthoritativePayoutSourceKind
  readonly sourceId: string
  /** SHA-256 of the verified Owner Statement document. Same hash may cover many reservations. */
  readonly documentHash?: string
  /** Bound reservation id. Row key is (sourceKind, documentHash, reservationId). */
  readonly reservationId?: string
  readonly payoutEur: number
  readonly cleaningEur: number
  readonly status: Vm1AuthoritativeEvidenceStatus
  readonly reconciliationStatus: Vm1AuthoritativeReconciliationStatus
}

export interface Vm1DraftAdmissionContext {
  readonly asOfIso: string
  readonly certifiedReservationIds: ReadonlySet<string>
  /** Missing key = no linked Owner Statement. Raw RPC payout is never a substitute. */
  readonly authoritativeEvidenceByReservationId?: ReadonlyMap<string, Vm1AuthoritativeOwnerStatementEvidence>
}

export interface Vm1DraftAdmissionLine {
  readonly externalId: string
  readonly listingId: string
  readonly channel: string | null
  readonly status: string
  readonly checkIn: string | null
  readonly checkOut: string | null
  readonly periodMember: boolean
  readonly checkoutCompleted: boolean
  readonly operationalEvidencePresent: boolean
  readonly authoritativeEvidenceLinked: boolean
  readonly admissionState: Vm1DraftAdmissionState
  readonly admittedCandidate: boolean
  readonly reason: string
}

export const VM1_DRAFT_ADMISSION_REASON = {
  listing: 'Listing is not VM1 Hostaway listing 412148.',
  certified: 'Already certified; never included in the new-period Draft.',
  cancelled: 'Cancelled reservations are not revenue.',
  inquiry: 'Inquiry reservations are not revenue.',
  checkInMissing: 'Check-in is not an exact YYYY-MM-DD calendar date.',
  notPeriodMember: 'Check-in is outside the Initial partnership period (inclusive 2026-08-30..2026-11-30).',
  modified: 'Modified or unverified status is not Draft-admissible.',
  checkoutMissing: 'Checkout date is required to prove the stay has ended by as-of.',
  futureCheckout: 'Checkout has not ended by as-of. Forecast is not Draft-admitted.',
  bookingUnknown:
    'Booking payout/tax are UNKNOWN on the Hostaway reservation feed. Do not use total price as payout.',
  missingAuthoritative: 'authoritative owner-statement payout evidence is not linked',
  sourceKind: 'Authoritative evidence sourceKind must be hostaway_owner_statement.',
  sourceId: 'Authoritative evidence sourceId must be a non-empty statement identifier.',
  unverified: 'Authoritative owner-statement evidence is not verified.',
  payout:
    'Authoritative owner-statement payout must be a non-negative finite number. Do not use totalPrice or raw expectedPayout as a payout fallback.',
  cleaning: 'Authoritative owner-statement cleaning must be a non-negative finite number.',
  reconConflict: 'Proven Hostaway vs ledger counterpart reconciliation conflict. Row is blocked.',
  reconStatus: 'Authoritative evidence reconciliationStatus is not a known fail-closed value.',
  unknownChannel: 'Channel has no VM1 Draft payout evidence.',
  duplicateStatementSource:
    'duplicate Owner Statement row key (sourceKind, documentHash, reservationId)',
  duplicateReservationId: (externalId: string) => `Duplicate reservation external_id: ${externalId}`,
} as const

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function channelKey(channel: string | null): string {
  return (channel ?? '').trim().toLowerCase()
}

function isAirbnb(channel: string | null): boolean {
  const c = channelKey(channel)
  return c === 'airbnb' || c === 'airbnbofficial'
}

function isBooking(channel: string | null): boolean {
  const c = channelKey(channel)
  return c === 'booking' || c === 'booking.com' || c === 'bookingcom'
}

function stayEndedByAsOf(checkOut: string | null, asOfIso: string): boolean {
  return checkOut != null && checkOut !== '' && checkOut <= asOfIso
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function parseAuthoritativeEvidence(
  value: unknown,
): { readonly ok: true; readonly evidence: Vm1AuthoritativeOwnerStatementEvidence } | { readonly ok: false; readonly reason: string } {
  const rec = asRecord(value)
  if (rec == null) {
    return { ok: false, reason: VM1_DRAFT_ADMISSION_REASON.missingAuthoritative }
  }
  if (rec.sourceKind !== 'hostaway_owner_statement') {
    return { ok: false, reason: VM1_DRAFT_ADMISSION_REASON.sourceKind }
  }
  const sourceId = typeof rec.sourceId === 'string' ? rec.sourceId.trim() : ''
  if (sourceId === '') {
    return { ok: false, reason: VM1_DRAFT_ADMISSION_REASON.sourceId }
  }
  if (rec.status !== 'verified') {
    return { ok: false, reason: VM1_DRAFT_ADMISSION_REASON.unverified }
  }
  if (!isNonNegativeFiniteNumber(rec.payoutEur)) {
    return { ok: false, reason: VM1_DRAFT_ADMISSION_REASON.payout }
  }
  if (!isNonNegativeFiniteNumber(rec.cleaningEur)) {
    return { ok: false, reason: VM1_DRAFT_ADMISSION_REASON.cleaning }
  }
  if (
    rec.reconciliationStatus !== 'not_required' &&
    rec.reconciliationStatus !== 'matched' &&
    rec.reconciliationStatus !== 'conflict'
  ) {
    return { ok: false, reason: VM1_DRAFT_ADMISSION_REASON.reconStatus }
  }
  const documentHash =
    typeof rec.documentHash === 'string' && rec.documentHash.trim() !== ''
      ? rec.documentHash.trim().toLowerCase()
      : sourceId
  const reservationId =
    typeof rec.reservationId === 'string' && rec.reservationId.trim() !== ''
      ? rec.reservationId.trim()
      : undefined
  return {
    ok: true,
    evidence: {
      sourceKind: 'hostaway_owner_statement',
      sourceId,
      documentHash,
      reservationId,
      payoutEur: rec.payoutEur,
      cleaningEur: rec.cleaningEur,
      status: 'verified',
      reconciliationStatus: rec.reconciliationStatus,
    },
  }
}

export function admitVm1DraftReservation(
  row: Vm1ReservationRow,
  input: Vm1DraftAdmissionContext,
): Vm1DraftAdmissionLine {
  const periodMember = isVm1InitialPeriodCheckIn(row.checkIn)
  const checkoutCompleted = stayEndedByAsOf(row.checkOut, input.asOfIso)
  const operationalEvidencePresent =
    isNonNegativeFiniteNumber(row.expectedPayout) && isNonNegativeFiniteNumber(row.cleaningFee)
  const base = {
    externalId: row.externalId,
    listingId: row.listingId,
    channel: row.channel,
    status: row.status,
    checkIn: row.checkIn,
    checkOut: row.checkOut,
    periodMember,
    checkoutCompleted,
    operationalEvidencePresent,
  }

  const out = (
    admissionState: Vm1DraftAdmissionState,
    reason: string,
    authoritativeEvidenceLinked = false,
  ): Vm1DraftAdmissionLine => ({
    ...base,
    authoritativeEvidenceLinked,
    admissionState,
    admittedCandidate: admissionState === 'admitted',
    reason,
  })

  if (row.listingId !== VM1_HOSTAWAY_LISTING_ID) {
    return out('blocked', VM1_DRAFT_ADMISSION_REASON.listing)
  }
  if (input.certifiedReservationIds.has(row.externalId) || row.disposition === 'already_certified') {
    return out('excluded', VM1_DRAFT_ADMISSION_REASON.certified)
  }

  const status = row.status.toLowerCase()
  if (status === 'cancelled') {
    return out('excluded', VM1_DRAFT_ADMISSION_REASON.cancelled)
  }
  if (status === 'inquiry') {
    return out('excluded', VM1_DRAFT_ADMISSION_REASON.inquiry)
  }

  if (row.checkIn == null || row.checkIn === '') {
    return out('needs_review', VM1_DRAFT_ADMISSION_REASON.checkInMissing)
  }
  if (!periodMember) {
    return out('excluded', VM1_DRAFT_ADMISSION_REASON.notPeriodMember)
  }
  if (row.disposition === 'excluded') {
    return out('excluded', row.reason)
  }

  const supplied = input.authoritativeEvidenceByReservationId?.get(row.externalId)
  const parsed = supplied == null ? null : parseAuthoritativeEvidence(supplied)
  const evidenceLinked =
    parsed != null && parsed.ok && parsed.evidence.reconciliationStatus !== 'conflict'

  if (row.disposition === 'needs_review' || status === 'modified') {
    return out('needs_review', VM1_DRAFT_ADMISSION_REASON.modified, evidenceLinked)
  }

  if (row.checkOut == null || row.checkOut === '') {
    return out('blocked', VM1_DRAFT_ADMISSION_REASON.checkoutMissing, evidenceLinked)
  }
  if (!checkoutCompleted) {
    return out('forecast', VM1_DRAFT_ADMISSION_REASON.futureCheckout, evidenceLinked)
  }

  if (supplied != null) {
    if (parsed == null || !parsed.ok) {
      return out('blocked', parsed?.reason ?? VM1_DRAFT_ADMISSION_REASON.missingAuthoritative)
    }
    if (parsed.evidence.reconciliationStatus === 'conflict') {
      return out('blocked', VM1_DRAFT_ADMISSION_REASON.reconConflict, true)
    }
    return out(
      'admitted',
      'Completed stay with verified hostaway_owner_statement evidence. Raw expectedPayout is not admission authority.',
      true,
    )
  }

  if (isBooking(row.channel) && !operationalEvidencePresent) {
    return out('blocked', VM1_DRAFT_ADMISSION_REASON.bookingUnknown)
  }
  if (!isAirbnb(row.channel) && !isBooking(row.channel)) {
    return out('blocked', VM1_DRAFT_ADMISSION_REASON.unknownChannel)
  }

  return out('completed_pending_authoritative_evidence', VM1_DRAFT_ADMISSION_REASON.missingAuthoritative)
}

function uniquenessKey(reservationId: string, value: unknown): string | null {
  const rec = asRecord(value)
  if (rec == null) return null
  if (rec.sourceKind !== 'hostaway_owner_statement') return null
  if (rec.status !== 'verified') return null
  const sourceId = typeof rec.sourceId === 'string' ? rec.sourceId.trim().toLowerCase() : ''
  const documentHash =
    typeof rec.documentHash === 'string' && rec.documentHash.trim() !== ''
      ? rec.documentHash.trim().toLowerCase()
      : sourceId
  if (documentHash === '') return null
  const boundReservationId =
    typeof rec.reservationId === 'string' && rec.reservationId.trim() !== ''
      ? rec.reservationId.trim()
      : reservationId
  return `${rec.sourceKind}\0${documentHash}\0${boundReservationId}`
}

export type Vm1DraftAdmissionBatchResult =
  | { readonly ok: true; readonly lines: readonly Vm1DraftAdmissionLine[] }
  | { readonly ok: false; readonly reason: string }

export function admitVm1DraftReservations(
  rows: readonly Vm1ReservationRow[],
  input: Vm1DraftAdmissionContext,
): Vm1DraftAdmissionBatchResult {
  const seenExternalIds = new Set<string>()
  for (const row of rows) {
    if (seenExternalIds.has(row.externalId)) {
      return { ok: false, reason: VM1_DRAFT_ADMISSION_REASON.duplicateReservationId(row.externalId) }
    }
    seenExternalIds.add(row.externalId)
  }

  const sourceOwners = new Map<string, string[]>()
  for (const row of rows) {
    const supplied = input.authoritativeEvidenceByReservationId?.get(row.externalId)
    if (supplied == null) continue
    const key = uniquenessKey(row.externalId, supplied)
    if (key == null) continue
    const owners = sourceOwners.get(key) ?? []
    owners.push(row.externalId)
    sourceOwners.set(key, owners)
  }

  const duplicateExternalIds = new Set<string>()
  Array.from(sourceOwners.values()).forEach((owners) => {
    if (owners.length > 1) {
      for (const id of owners) duplicateExternalIds.add(id)
    }
  })

  const order: readonly Vm1DraftAdmissionState[] = [
    'admitted',
    'completed_pending_authoritative_evidence',
    'blocked',
    'forecast',
    'needs_review',
    'excluded',
  ]

  const lines = rows
    .map((row) => {
      const line = admitVm1DraftReservation(row, input)
      if (!duplicateExternalIds.has(row.externalId)) return line
      return {
        ...line,
        admissionState: 'blocked' as const,
        admittedCandidate: false,
        reason: VM1_DRAFT_ADMISSION_REASON.duplicateStatementSource,
      }
    })
    .sort((a, b) => {
      const oa = order.indexOf(a.admissionState)
      const ob = order.indexOf(b.admissionState)
      if (oa !== ob) return oa - ob
      const aIn = a.checkIn ?? ''
      const bIn = b.checkIn ?? ''
      if (aIn !== bIn) return aIn < bIn ? -1 : 1
      return a.externalId.localeCompare(b.externalId)
    })

  return { ok: true, lines }
}
