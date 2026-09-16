/**
 * @module partner-settlement/external-partner/billedActivity
 * @description Pure billed-activity settlement (renovation / airbnb / management)
 * rewritten from the recovered partnerSettlementEngine, using the existing
 * `roundEur`. Unknown inputs block; they are never converted to €0.
 *
 * Client charge splits by ownership %. JJ service profit splits only between
 * JJ principals, equally. External partners receive none of that profit.
 *
 * Per-row billable charge: a valid `clientCharge` REPLACES `amountEur` for that
 * row's charge basis. The two are never added for the same economic role.
 */

import { roundEur } from './roundEur'
import type { ExternalPartnerOwner } from './types'

export type ExternalPartnerBilledKind = 'renovation' | 'airbnb' | 'management'

export interface ExternalPartnerBilledActivityInput {
  readonly kind: ExternalPartnerBilledKind
  readonly clientCharge: number | null
  readonly actualCost: number | null
  readonly distributableJjProfit: number | null
  readonly funding?: Readonly<Record<string, number | null>>
  readonly owners: readonly ExternalPartnerOwner[]
}

export type ExternalPartnerLineStatus = 'computed' | 'blocked'

export interface ExternalPartnerActivityLine {
  readonly partner: string
  readonly ownershipPct: number
  readonly isJjPrincipal: boolean
  readonly chargeShareGross: number | null
  readonly jjProfitOffset: number | null
  readonly netParticipation: number | null
  readonly funding: number | null
  readonly balance: number | null
  readonly status: ExternalPartnerLineStatus
  readonly blockedReasons: readonly string[]
}

export interface ExternalPartnerBilledActivityResult {
  readonly kind: ExternalPartnerBilledKind
  readonly clientCharge: number | null
  readonly actualCost: number | null
  readonly distributableJjProfit: number | null
  readonly lines: readonly ExternalPartnerActivityLine[]
  readonly integrity: {
    readonly sumNetParticipation: number | null
    readonly chargeMinusProfit: number | null
    readonly roundingResidual: number | null
    readonly netTiesToChargeMinusProfit: boolean | null
    readonly sumBalance: number | null
    readonly chargeMinusProfitEqualsCost: boolean | null
    readonly ownershipSumsTo100: boolean
    readonly warnings: readonly string[]
  }
}

export function composeExternalPartnerBilledActivity(
  input: ExternalPartnerBilledActivityInput,
): ExternalPartnerBilledActivityResult {
  const { kind, clientCharge, actualCost, distributableJjProfit, owners } = input
  const funding = input.funding ?? {}

  const chargeKnown = clientCharge !== null
  const profitKnown = distributableJjProfit !== null
  const principals = owners.filter((o) => o.isJjPrincipal)

  const ownershipSum = owners.reduce((s, o) => s + o.ownershipPct, 0)
  const ownershipSumsTo100 = Math.abs(ownershipSum - 100) < 1e-9
  const nPrincipals = principals.length

  const lines: ExternalPartnerActivityLine[] = owners.map((o) => {
    const reasons: string[] = []
    const chargeShareGross = chargeKnown
      ? roundEur((clientCharge as number) * o.ownershipPct / 100)
      : null
    if (!chargeKnown) reasons.push('charge_basis_unverified')

    let jjProfitOffset: number | null
    if (!o.isJjPrincipal) {
      jjProfitOffset = 0
    } else if (profitKnown && nPrincipals > 0) {
      jjProfitOffset = roundEur((distributableJjProfit as number) / nPrincipals)
    } else {
      jjProfitOffset = null
      reasons.push('jj_profit_unverified')
    }

    const netParticipation =
      chargeShareGross !== null && jjProfitOffset !== null
        ? roundEur(chargeShareGross - jjProfitOffset)
        : null

    const hasKey = Object.prototype.hasOwnProperty.call(funding, o.partner)
    const rawFunding = hasKey ? funding[o.partner] : 0
    const fundingUnverified = rawFunding === null
    if (fundingUnverified) reasons.push('funding_unverified')
    const partnerFunding = fundingUnverified ? null : (rawFunding as number)
    const computable = netParticipation !== null && !fundingUnverified
    const balance = computable ? roundEur((partnerFunding as number) - netParticipation) : null

    return {
      partner: o.partner,
      ownershipPct: o.ownershipPct,
      isJjPrincipal: o.isJjPrincipal,
      chargeShareGross,
      jjProfitOffset,
      netParticipation,
      funding: partnerFunding,
      balance,
      status: computable ? 'computed' : 'blocked',
      blockedReasons: reasons,
    }
  })

  const netAllKnown = lines.every((l) => l.netParticipation !== null)
  const sumNet = netAllKnown
    ? roundEur(lines.reduce((s, l) => s + (l.netParticipation as number), 0))
    : null
  const chargeMinusProfit =
    chargeKnown && profitKnown
      ? roundEur((clientCharge as number) - (distributableJjProfit as number))
      : null
  const balanceAllKnown = lines.every((l) => l.balance !== null)
  const sumBalance = balanceAllKnown
    ? roundEur(lines.reduce((s, l) => s + (l.balance as number), 0))
    : null

  const warnings: string[] = []
  if (!ownershipSumsTo100) warnings.push(`ownership_pct_sums_to_${ownershipSum}_not_100`)
  const roundingResidual =
    sumNet !== null && chargeMinusProfit !== null
      ? roundEur(sumNet - chargeMinusProfit)
      : null
  const netTies = roundingResidual !== null ? Math.abs(roundingResidual) < 0.005 : null
  if (netTies === false) warnings.push('sum_net_participation_ne_charge_minus_profit')
  let cmpEqCost: boolean | null = null
  if (chargeMinusProfit !== null && actualCost !== null) {
    cmpEqCost = Math.abs(chargeMinusProfit - actualCost) < 0.005
    if (!cmpEqCost) warnings.push('charge_minus_profit_ne_actual_cost_check_vat_extras')
  }

  return {
    kind,
    clientCharge,
    actualCost,
    distributableJjProfit,
    lines,
    integrity: {
      sumNetParticipation: sumNet,
      chargeMinusProfit,
      roundingResidual,
      netTiesToChargeMinusProfit: netTies,
      sumBalance,
      chargeMinusProfitEqualsCost: cmpEqCost,
      ownershipSumsTo100,
      warnings,
    },
  }
}

export interface ExternalPartnerBillableRow {
  readonly id: string
  readonly amountEur: number
  readonly clientCharge: number | null
}

export interface ExternalPartnerBillableChargeResult {
  readonly billableCharge: number | null
  readonly actualCost: number
  readonly grossMargin: number | null
  readonly reviewRowIds: readonly string[]
  readonly perRow: readonly {
    readonly id: string
    readonly cost: number
    readonly charge: number | null
    readonly basis: 'client_charge' | 'cost' | 'invalid_review'
  }[]
}

/**
 * Per execution-cost row: missing clientCharge → billed at cost; a valid
 * clientCharge replaces cost as the charge (never amountEur + clientCharge).
 * Invalid (negative / non-finite) blocks the billable total.
 */
export function deriveExternalPartnerBillableCharge(
  rows: readonly ExternalPartnerBillableRow[],
): ExternalPartnerBillableChargeResult {
  let cost = 0
  let chargeSum = 0
  let anyInvalid = false
  const review: string[] = []
  const perRow: ExternalPartnerBillableChargeResult['perRow'] = rows.map((r) => {
    cost += r.amountEur
    if (r.clientCharge === null) {
      chargeSum += r.amountEur
      return { id: r.id, cost: r.amountEur, charge: r.amountEur, basis: 'cost' as const }
    }
    if (Number.isFinite(r.clientCharge) && r.clientCharge >= 0) {
      chargeSum += r.clientCharge
      return { id: r.id, cost: r.amountEur, charge: r.clientCharge, basis: 'client_charge' as const }
    }
    anyInvalid = true
    review.push(r.id)
    return { id: r.id, cost: r.amountEur, charge: null, basis: 'invalid_review' as const }
  })
  const billableCharge = anyInvalid ? null : roundEur(chargeSum)
  const actualCost = roundEur(cost)
  return {
    billableCharge,
    actualCost,
    grossMargin: billableCharge === null ? null : roundEur(billableCharge - actualCost),
    reviewRowIds: review,
    perRow,
  }
}
