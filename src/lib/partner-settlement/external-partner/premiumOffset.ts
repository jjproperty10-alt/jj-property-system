/**
 * @module partner-settlement/external-partner/premiumOffset
 * @description Internal premium offset among JJ principals. An entry premium
 * belongs to the principals equally; whoever received excess owes the rest.
 * External partners are not principals and are not offset here.
 */

import { roundEur } from './roundEur'

export interface ExternalPartnerPremiumOffsetInput {
  readonly premiumTotalEur: number | null
  readonly principals: readonly string[]
  readonly receivedBy?: Readonly<Record<string, number>>
}

export interface ExternalPartnerPremiumOffsetLine {
  readonly principal: string
  readonly entitled: number | null
  readonly received: number
  readonly net: number | null
}

export interface ExternalPartnerPremiumOffsetResult {
  readonly premiumTotalEur: number | null
  readonly entitledPerPrincipal: number | null
  readonly lines: readonly ExternalPartnerPremiumOffsetLine[]
  readonly internalTransfers: readonly { from: string; to: string; amount: number }[]
}

export function composeExternalPartnerPremiumOffset(
  input: ExternalPartnerPremiumOffsetInput,
): ExternalPartnerPremiumOffsetResult {
  const { premiumTotalEur, principals } = input
  const received = input.receivedBy ?? {}
  const known = premiumTotalEur !== null && principals.length > 0
  const entitled = known ? roundEur((premiumTotalEur as number) / principals.length) : null
  const lines: ExternalPartnerPremiumOffsetLine[] = principals.map((p) => {
    const r = received[p] ?? 0
    return {
      principal: p,
      entitled,
      received: r,
      net: entitled === null ? null : roundEur(r - entitled),
    }
  })
  const transfers: { from: string; to: string; amount: number }[] = []
  if (entitled !== null) {
    const debtors = lines
      .filter((l) => (l.net as number) > 0)
      .map((l) => ({ p: l.principal, amt: l.net as number }))
    const creditors = lines
      .filter((l) => (l.net as number) < 0)
      .map((l) => ({ p: l.principal, amt: -(l.net as number) }))
    let i = 0
    let j = 0
    while (i < debtors.length && j < creditors.length) {
      const m = roundEur(Math.min(debtors[i].amt, creditors[j].amt))
      if (m > 0) transfers.push({ from: debtors[i].p, to: creditors[j].p, amount: m })
      debtors[i].amt = roundEur(debtors[i].amt - m)
      creditors[j].amt = roundEur(creditors[j].amt - m)
      if (debtors[i].amt <= 0) i++
      if (creditors[j].amt <= 0) j++
    }
  }
  return { premiumTotalEur, entitledPerPrincipal: entitled, lines, internalTransfers: transfers }
}
