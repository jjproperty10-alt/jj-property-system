/**
 * VM1 Property Operations — server load path.
 *
 * Auth is enforced by the page. Identity/expense use the injected identity
 * client. Owner Statement evidence is read through a separate user-JWT
 * client. No settlement, no ledger combination, no DB write, no ingest,
 * no void, no admission from stored evidence, no partner split.
 *
 * Loading order:
 *   1. parse range
 *   2. loadVm1Identity
 *   3. identity failure → blocked workspace, no expense SELECT, no OS read
 *   4. verified identity → JWT Owner Statement reader (evidence only)
 *   5. Draft admission WITHOUT stored Owner Statement evidence
 *   6. verified identity → expense SELECT
 *   7. expense failure does not collapse reservations/forecast
 *
 * server-only.
 */

import 'server-only'

import { aviCertifiedReservationIdSet } from './aviCertifiedReservationIds'
import { admitVm1DraftReservations, type Vm1DraftAdmissionLine } from './vm1DraftAdmission'
import { loadVm1ApprovedFutureDraftExpense } from './vm1ExpenseAdmissionService'
import type { Vm1ExpenseAdmissionLine } from './vm1ExpenseAdmission'
import { forecastVm1Reservations, type Vm1ForecastLine } from './vm1ForecastCalculator'
import { loadVm1Identity, type Vm1IdentityResult, type Vm1RpcClient } from './vm1IdentityAdapter'
import { parseVm1OperationsRange, utcTodayIso } from './vm1OperationsPresentation'
import {
  readVm1PartnershipOwnerStatementForListing,
  type Vm1OwnerStatementDisplayLine,
  type Vm1OwnerStatementJwtClient,
  type Vm1OwnerStatementStoreRead,
} from './vm1OwnerStatementStoreReader'

export type Vm1OperationsClient = Vm1RpcClient

export type Vm1OwnerStatementEvidenceState =
  | { readonly ok: true; readonly kind: 'effective' }
  | {
      readonly ok: false
      readonly kind: Exclude<Vm1OwnerStatementStoreRead['kind'], 'effective'>
      readonly reason: string
    }

export type Vm1OperationsLoadResult =
  | {
      readonly ok: true
      readonly from: string
      readonly to: string
      readonly identity: Extract<Vm1IdentityResult, { ok: true }>['identity']
      readonly reservations: Extract<Vm1IdentityResult, { ok: true }>['reservations']
      readonly forecastLines: readonly Vm1ForecastLine[]
      readonly draftAdmissionLines: readonly Vm1DraftAdmissionLine[]
      readonly ownerStatementLines: readonly Vm1OwnerStatementDisplayLine[]
      readonly ownerStatementEvidence: Vm1OwnerStatementEvidenceState
      readonly expenseAdmission: Vm1ExpenseAdmissionLine
    }
  | {
      readonly ok: false
      readonly kind: 'invalid_range' | 'identity_blocked'
      readonly reason: string
      readonly from: string | null
      readonly to: string | null
    }

export interface Vm1OperationsLoadInput {
  readonly client: Vm1OperationsClient
  readonly ownerStatementClient: Vm1OwnerStatementJwtClient
  readonly fromParam?: string | string[]
  readonly toParam?: string | string[]
  readonly now?: Date
}

function toEvidenceState(read: Vm1OwnerStatementStoreRead): Vm1OwnerStatementEvidenceState {
  if (read.ok) return { ok: true, kind: 'effective' }
  return { ok: false, kind: read.kind, reason: read.reason }
}

export async function loadVm1OperationsView(
  input: Vm1OperationsLoadInput,
): Promise<Vm1OperationsLoadResult> {
  const range = parseVm1OperationsRange(input.fromParam, input.toParam, input.now)
  if (!range.ok) {
    return {
      ok: false,
      kind: 'invalid_range',
      reason: range.reason,
      from: null,
      to: null,
    }
  }

  const certifiedReservationIds = aviCertifiedReservationIdSet()
  const loaded = await loadVm1Identity({
    client: input.client,
    certifiedReservationIds,
    reservationFrom: range.from,
    reservationTo: range.to,
  })

  if (!loaded.ok) {
    return {
      ok: false,
      kind: 'identity_blocked',
      reason: loaded.reason,
      from: range.from,
      to: range.to,
    }
  }

  const asOfIso = utcTodayIso(input.now)
  const storeRead = await readVm1PartnershipOwnerStatementForListing({
    client: input.ownerStatementClient,
    listingId: loaded.identity.hostawayListingId,
    canonicalPropertyId: loaded.identity.canonicalPropertyId,
  })
  const ownerStatementEvidence = toEvidenceState(storeRead)
  const ownerStatementLines = storeRead.ok
    ? storeRead.lines.filter((line) => !certifiedReservationIds.has(line.reservationId))
    : []

  const admission = admitVm1DraftReservations(loaded.reservations, {
    asOfIso,
    certifiedReservationIds,
  })
  if (!admission.ok) {
    return {
      ok: false,
      kind: 'identity_blocked',
      reason: admission.reason,
      from: range.from,
      to: range.to,
    }
  }

  const expenseAdmission = await loadVm1ApprovedFutureDraftExpense({
    client: input.client,
    verifiedIdentity: loaded.identity,
  })

  return {
    ok: true,
    from: range.from,
    to: range.to,
    identity: loaded.identity,
    reservations: loaded.reservations,
    forecastLines: forecastVm1Reservations(loaded.reservations, {
      asOfIso,
    }),
    draftAdmissionLines: admission.lines,
    ownerStatementLines,
    ownerStatementEvidence,
    expenseAdmission,
  }
}
