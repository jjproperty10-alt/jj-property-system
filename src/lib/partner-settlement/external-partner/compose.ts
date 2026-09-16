/**
 * @module partner-settlement/external-partner/compose
 * @description Generic external-partner settlement composition.
 *
 * obligation_i = Σ (charge.total × ownership%_i) + premium (external payer)
 * credits_i    = income share + (JJ principals only) equal share of jjProfit
 * net_i        = paid_i + credits_i + offsets_i − obligation_i
 *
 * Fail-closed: missing ownership, paid amount, evidence, or a required control
 * amount returns `status: 'failed'` with no invented €0 net.
 *
 * The obsolete `buildPurchaseSettlement` is intentionally omitted.
 * Cashbox clearing / bottom-up engines are not part of this module.
 *
 * Output is branded `ExternalPartnerSettlement` and cannot be passed to
 * Partner B `equalizationHeadline` / `Headline` by type.
 */

import { composeExternalPartnerPremiumOffset } from './premiumOffset'
import { roundEur } from './roundEur'
import {
  EXTERNAL_PARTNER_SETTLEMENT_BRAND,
  type ExternalPartnerCredit,
  type ExternalPartnerEvidence,
  type ExternalPartnerObligation,
  type ExternalPartnerSettlement,
  type ExternalPartnerSettlementInput,
  type ExternalPartnerShare,
} from './types'
import type { ExternalPartnerActivityLine } from './billedActivity'
import type { ExternalPartnerDealExpenseLine } from './dealExpense'
import {
  applyAviFundingAttribution,
  type ExternalPartnerAttributedAmountControl,
  type ExternalPartnerCorrectionLineageEntry,
} from './externalPartnerAttribution'
import type { RawExternalPartnerTransaction } from './externalPartnerReadTypes'

const CONTROL_EPS = 0.005

function failed(reasons: readonly string[]): ExternalPartnerSettlement {
  return {
    [EXTERNAL_PARTNER_SETTLEMENT_BRAND]: 'ExternalPartnerSettlement',
    status: 'failed',
    failureReasons: reasons,
  }
}

function evidenceOk(e: ExternalPartnerEvidence | null | undefined): e is ExternalPartnerEvidence {
  if (!e) return false
  if (!e.sha256 || !e.version || !e.classificationArtifact) return false
  if (!Number.isFinite(e.rowCount) || e.rowCount <= 0) return false
  return true
}

function allocateByOwnership(
  total: number,
  owners: ExternalPartnerSettlementInput['owners'],
): Map<string, number> {
  const raw = owners.map((o) => ({
    k: o.partner,
    v: roundEur((total * o.ownershipPct) / 100),
  }))
  const residual = roundEur(raw.reduce((s, r) => s + r.v, 0) - total)
  if (residual !== 0 && raw.length > 0) {
    raw[raw.length - 1].v = roundEur(raw[raw.length - 1].v - residual)
  }
  return new Map(raw.map((r) => [r.k, r.v]))
}

export function composeExternalPartnerSettlement(
  input: ExternalPartnerSettlementInput,
): ExternalPartnerSettlement {
  const reasons: string[] = []

  if (!evidenceOk(input.evidence)) reasons.push('evidence_missing')
  if (!input.settlePartners || input.settlePartners.length === 0) {
    reasons.push('settle_partners_missing')
  }
  if (!input.requiredControls || Object.keys(input.requiredControls).length === 0) {
    reasons.push('required_controls_missing')
  }
  if (!input.owners || input.owners.length === 0) {
    reasons.push('ownership_missing')
  } else {
    const ownershipSum = input.owners.reduce((s, o) => s + o.ownershipPct, 0)
    if (Math.abs(ownershipSum - 100) > 1e-9) {
      reasons.push(`ownership_pct_sums_to_${ownershipSum}_not_100`)
    }
    const names = new Set(input.owners.map((o) => o.partner))
    if (names.size !== input.owners.length) reasons.push('ownership_duplicate_partner')
  }

  const chargeByKey = new Map(input.charges.map((c) => [c.key, c]))
  for (const [key, expected] of Object.entries(input.requiredControls ?? {})) {
    if (key === 'premium') {
      if (!input.premium || input.premium.totalEur === null || input.premium.totalEur === undefined) {
        reasons.push('required_control_missing:premium')
      } else if (Math.abs(input.premium.totalEur - expected) >= CONTROL_EPS) {
        reasons.push('required_control_mismatch:premium')
      }
      continue
    }
    const layer = chargeByKey.get(key)
    if (!layer || layer.total === null || layer.total === undefined) {
      reasons.push(`required_control_missing:${key}`)
    } else if (Math.abs(layer.total - expected) >= CONTROL_EPS) {
      reasons.push(`required_control_mismatch:${key}`)
    }
  }

  for (const partner of input.settlePartners ?? []) {
    const owner = input.owners.find((o) => o.partner === partner)
    if (!owner) {
      reasons.push(`ownership_missing:${partner}`)
      continue
    }
    if (!Object.prototype.hasOwnProperty.call(input.paid, partner)) {
      reasons.push(`paid_amount_missing:${partner}`)
      continue
    }
    const paid = input.paid[partner]
    if (paid === null || paid === undefined || !Number.isFinite(paid)) {
      reasons.push(`paid_amount_unverified:${partner}`)
    }
  }

  if (input.fundingAttribution) {
    if (input.fundingAttribution.status === 'failed') {
      reasons.push(...input.fundingAttribution.failures)
    } else {
      const aviPaid = input.paid.Avi
      if (
        aviPaid === null ||
        aviPaid === undefined ||
        !Number.isFinite(aviPaid) ||
        Math.abs(aviPaid - input.fundingAttribution.paidEurAvi) >= CONTROL_EPS
      ) {
        reasons.push('paid_amount_attribution_mismatch:Avi')
      }
    }
  }

  if (reasons.length > 0) return failed(reasons)

  const principals = input.owners.filter((o) => o.isJjPrincipal)
  const nP = principals.length
  const acc = new Map<
    string,
    { ob: number; cr: number; off: number; chargeShares: Record<string, number>; income: number; jjProfit: number; premium: number }
  >()
  for (const o of input.owners) {
    acc.set(o.partner, { ob: 0, cr: 0, off: 0, chargeShares: {}, income: 0, jjProfit: 0, premium: 0 })
  }

  for (const ch of input.charges) {
    if (ch.total === null) continue
    const m = allocateByOwnership(ch.total, input.owners)
    for (const o of input.owners) {
      const a = acc.get(o.partner)!
      const share = m.get(o.partner) ?? 0
      a.ob = roundEur(a.ob + share)
      a.chargeShares[ch.key] = share
    }
    if (ch.income !== null && ch.income !== undefined) {
      const mInc = allocateByOwnership(ch.income, input.owners)
      for (const o of input.owners) {
        const a = acc.get(o.partner)!
        const share = mInc.get(o.partner) ?? 0
        a.cr = roundEur(a.cr + share)
        a.income = roundEur(a.income + share)
      }
    }
    if (ch.jjProfit !== null && ch.jjProfit !== undefined && nP > 0) {
      const share = roundEur(ch.jjProfit / nP)
      for (const p of principals) {
        const a = acc.get(p.partner)!
        a.cr = roundEur(a.cr + share)
        a.jjProfit = roundEur(a.jjProfit + share)
      }
    }
  }

  let premiumTransfers: { from: string; to: string; amountEur: number }[] = []
  if (input.premium) {
    const pa = acc.get(input.premium.paidBy)
    if (pa) {
      pa.ob = roundEur(pa.ob + input.premium.totalEur)
      pa.premium = roundEur(pa.premium + input.premium.totalEur)
    }
    const po = composeExternalPartnerPremiumOffset({
      premiumTotalEur: input.premium.totalEur,
      principals: principals.map((p) => p.partner),
      receivedBy: input.premium.receivedBy,
    })
    premiumTransfers = po.internalTransfers.map((t) => ({
      from: t.from,
      to: t.to,
      amountEur: t.amount,
    }))
    for (const l of po.lines) {
      const a = acc.get(l.principal)
      if (a && l.net !== null) a.off = roundEur(a.off - l.net)
    }
  }

  const shares: ExternalPartnerShare[] = []
  for (const partner of input.settlePartners) {
    const owner = input.owners.find((o) => o.partner === partner)!
    const a = acc.get(partner)!
    const paid = input.paid[partner] as number
    const obligation: ExternalPartnerObligation = {
      totalEur: a.ob,
      chargeShares: { ...a.chargeShares },
      premiumEur: a.premium,
    }
    const credits: ExternalPartnerCredit = {
      totalEur: a.cr,
      incomeShareEur: a.income,
      jjProfitShareEur: a.jjProfit,
    }
    const netEur = roundEur(paid + a.cr + a.off - a.ob)
    const direction: ExternalPartnerShare['direction'] =
      netEur > 0.005 ? 'to_refund' : netEur < -0.005 ? 'to_pay' : 'settled'
    shares.push({
      partner,
      isJjPrincipal: owner.isJjPrincipal,
      ownershipPct: owner.ownershipPct,
      obligation,
      credits,
      offsetsEur: a.off,
      paidEur: paid,
      netEur,
      direction,
    })
  }

  return {
    [EXTERNAL_PARTNER_SETTLEMENT_BRAND]: 'ExternalPartnerSettlement',
    status: 'computed',
    property: input.property,
    cutoffDate: input.cutoffDate,
    evidence: input.evidence as ExternalPartnerEvidence,
    shares,
    premiumTransfers,
  }
}

/**
 * Attribution overlay then compose. `paid.Avi` is taken from transaction
 * amounts via `paidEurAvi`, never from a hard-coded map amount.
 */
export function composeExternalPartnerSettlementFromAttributedFunding(
  input: Omit<ExternalPartnerSettlementInput, 'paid' | 'fundingAttribution'>,
  rows: readonly RawExternalPartnerTransaction[],
  controls: {
    readonly expectedAttributedAmounts: readonly ExternalPartnerAttributedAmountControl[]
    readonly correctionLineage?: readonly ExternalPartnerCorrectionLineageEntry[]
  },
): ExternalPartnerSettlement {
  const fundingAttribution = applyAviFundingAttribution(rows, controls)
  return composeExternalPartnerSettlement({
    ...input,
    paid: { Avi: fundingAttribution.status === 'ok' ? fundingAttribution.paidEurAvi : Number.NaN },
    fundingAttribution,
  })
}

export interface ExternalPartnerLayerBalances {
  readonly renovation: number
  readonly airbnb: number
  readonly management: number
  readonly dealExpense: number
  readonly total: number
}

function lineBalance(
  partner: string,
  lines: readonly { partner: string; balance: number | null }[],
  label: string,
): { ok: true; value: number } | { ok: false; reason: string } {
  const line = lines.find((l) => l.partner === partner)
  if (!line || line.balance === null) return { ok: false, reason: `${label}_balance_unverified:${partner}` }
  return { ok: true, value: line.balance }
}

/**
 * Sum certified billed-activity + deal-expense balances for one partner.
 * Any blocked/null layer fails closed (no invented €0 total).
 */
export function composeExternalPartnerLayerComponents(
  partner: string,
  layers: {
    renovation: { lines: readonly ExternalPartnerActivityLine[] }
    airbnb: { lines: readonly ExternalPartnerActivityLine[] }
    management: { lines: readonly ExternalPartnerActivityLine[] }
    dealExpense: { lines: readonly ExternalPartnerDealExpenseLine[] }
  },
): ExternalPartnerLayerBalances | { status: 'failed'; failureReasons: readonly string[] } {
  const reno = lineBalance(partner, layers.renovation.lines, 'renovation')
  const airbnb = lineBalance(partner, layers.airbnb.lines, 'airbnb')
  const mgmt = lineBalance(partner, layers.management.lines, 'management')
  const deal = lineBalance(partner, layers.dealExpense.lines, 'deal_expense')
  const reasons: string[] = []
  if (!reno.ok) reasons.push(reno.reason)
  if (!airbnb.ok) reasons.push(airbnb.reason)
  if (!mgmt.ok) reasons.push(mgmt.reason)
  if (!deal.ok) reasons.push(deal.reason)
  if (reasons.length > 0) return { status: 'failed', failureReasons: reasons }
  const renovation = (reno as { ok: true; value: number }).value
  const airbnbV = (airbnb as { ok: true; value: number }).value
  const management = (mgmt as { ok: true; value: number }).value
  const dealExpense = (deal as { ok: true; value: number }).value
  return {
    renovation,
    airbnb: airbnbV,
    management,
    dealExpense,
    total: roundEur(renovation + airbnbV + management + dealExpense),
  }
}
