/**
 * VM1 Property Operations — server load path.
 *
 * Auth is enforced by the page. This module only reads through the Phase 1
 * identity adapter. No settlement, no ledger combination, no DB write.
 *
 * Loading order:
 *   1. parse range
 *   2. loadVm1Identity
 *   3. identity failure → blocked workspace, no expense SELECT
 *   4. verified identity → Draft admission WITHOUT Owner Statement store
 *   5. verified identity → expense SELECT
 *   6. expense failure does not collapse reservations/forecast
 *
 * Canonical stored Hostaway Owner Statement evidence is not attached in this
 * slice. Raw Hostaway reservation payout is operational evidence only.
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
import { VM1_OS_EVIDENCE_REASON, type Vm1OwnerStatementEvidenceLine } from './vm1OwnerStatementEvidence'

export type Vm1OperationsClient = Vm1RpcClient

export type Vm1OperationsLoadResult =
  | {
      readonly ok: true
      readonly from: string
      readonly to: string
      readonly identity: Extract<Vm1IdentityResult, { ok: true }>['identity']
      readonly reservations: Extract<Vm1IdentityResult, { ok: true }>['reservations']
      readonly forecastLines: readonly Vm1ForecastLine[]
      readonly draftAdmissionLines: readonly Vm1DraftAdmissionLine[]
      readonly ownerStatementLines: readonly Vm1OwnerStatementEvidenceLine[]
      readonly ownerStatementEvidence: { readonly ok: false; readonly reason: string }
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
  readonly fromParam?: string | string[]
  readonly toParam?: string | string[]
  readonly now?: Date
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
  const ownerStatementEvidence = {
    ok: false as const,
    reason: VM1_OS_EVIDENCE_REASON.missingStore,
  }
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
    ownerStatementLines: [],
    ownerStatementEvidence,
    expenseAdmission,
  }
}
