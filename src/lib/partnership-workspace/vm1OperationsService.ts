/**
 * VM1 Property Operations — server load path.
 *
 * Auth is enforced by the page. This module only reads through the Phase 1
 * identity adapter. No settlement, no ledger combination, no DB write.
 *
 * server-only.
 */

import 'server-only'

import { aviCertifiedReservationIdSet } from './aviCertifiedReservationIds'
import { admitVm1DraftReservations, type Vm1DraftAdmissionLine } from './vm1DraftAdmission'
import { forecastVm1Reservations, type Vm1ForecastLine } from './vm1ForecastCalculator'
import { loadVm1Identity, type Vm1IdentityResult, type Vm1RpcClient } from './vm1IdentityAdapter'
import { parseVm1OperationsRange, utcTodayIso } from './vm1OperationsPresentation'

export type Vm1OperationsLoadResult =
  | {
      readonly ok: true
      readonly from: string
      readonly to: string
      readonly identity: Extract<Vm1IdentityResult, { ok: true }>['identity']
      readonly reservations: Extract<Vm1IdentityResult, { ok: true }>['reservations']
      readonly forecastLines: readonly Vm1ForecastLine[]
      readonly draftAdmissionLines: readonly Vm1DraftAdmissionLine[]
    }
  | {
      readonly ok: false
      readonly kind: 'invalid_range' | 'identity_blocked'
      readonly reason: string
      readonly from: string | null
      readonly to: string | null
    }

export interface Vm1OperationsLoadInput {
  readonly client: Vm1RpcClient
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
  // Raw Hostaway reservation payout is operational evidence only.
  // This slice does not attach hostaway_owner_statement provenance, so no row is Draft-admitted.
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
  }
}
